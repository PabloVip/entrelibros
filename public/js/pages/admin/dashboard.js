// Panel de inicio del back-office: indicadores del periodo, ventas por día, más vendidos,
// alertas de stock, embudo y últimos pedidos.
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import { ordersSince, stockAlerts, trafficSince } from '../../repositories/adminReportsRepository.js';
import { countPendingSupport } from '../../repositories/supportAdminRepository.js';
import { PAID_STATUSES } from '../../services/adminCatalogService.js';
import { statusBadge } from '../../components/statusBadge.js';
import { escapeHtml, money, formatDate } from '../../core/utils.js';
import { locale } from '../../core/i18n.js';

const user = await requireAdmin();
renderAdminLayout(user);

const DAY = 86400000;
const periodSelect = document.getElementById('period');
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function delta(now, before) {
  if (!before) return '';
  const d = Math.round(((now - before) / before) * 100);
  if (d === 0) return '<small>= que el periodo anterior</small>';
  return `<small class="${d > 0 ? 'delta-up' : 'delta-down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)} % frente al periodo anterior</small>`;
}

function renderKpis(cur, prev, pendingSupport) {
  const sales = list => list.filter(o => PAID_STATUSES.includes(o.status));
  const revenue = list => sales(list).reduce((s, o) => s + Number(o.total), 0);
  const nowRev = revenue(cur), prevRev = revenue(prev);
  const nowPaid = sales(cur).length;
  const toPrepare = cur.filter(o => ['pago_simulado', 'pendiente_preparacion'].includes(o.status)).length;
  const unpaid = cur.filter(o => o.status === 'creado').length;
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><span>Ventas (simuladas)</span><strong>${money(nowRev)}</strong>${delta(nowRev, prevRev)}</div>
    <div class="kpi"><span>Pedidos pagados</span><strong>${nowPaid}</strong>${delta(nowPaid, sales(prev).length)}</div>
    <div class="kpi"><span>Ticket medio</span><strong>${money(nowPaid ? nowRev / nowPaid : 0)}</strong></div>
    <a class="kpi kpi-link" href="admin-pedidos.html?estado=pendiente_preparacion"><span>Por preparar</span><strong>${toPrepare}</strong></a>
    <a class="kpi kpi-link" href="admin-pedidos.html?estado=creado"><span>Sin pagar</span><strong>${unpaid}</strong></a>
    <a class="kpi kpi-link" href="admin-soporte.html"><span>Soporte pendiente</span><strong>${pendingSupport ?? '—'}</strong></a>`;
}

function renderChart(orders, days) {
  const today = startOfDay(new Date());
  const buckets = Array.from({ length: days }, (_, i) => ({ date: new Date(today - (days - 1 - i) * DAY), total: 0, count: 0 }));
  for (const o of orders) {
    if (!PAID_STATUSES.includes(o.status)) continue;
    const i = Math.round((startOfDay(new Date(o.created_at)) - buckets[0].date) / DAY);
    if (buckets[i]) { buckets[i].total += Number(o.total); buckets[i].count += 1; }
  }
  const max = Math.max(1, ...buckets.map(b => b.total));
  const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const every = days <= 7 ? 1 : days <= 30 ? 5 : 15; // una etiqueta cada N días
  const sum = buckets.reduce((s, b) => s + b.total, 0);
  document.getElementById('sales-chart').innerHTML = `
    <p class="bars-total">Total del periodo: <strong>${money(sum)}</strong></p>
    <div class="bars" role="img" aria-label="Ventas por día del periodo">
      ${buckets.map(b => `
        <div class="bar ${b.total ? '' : 'is-empty'}" title="${dayFmt.format(b.date)}: ${money(b.total)} · ${b.count} ped.">
          <span style="height:${(b.total / max) * 100}%"></span>
        </div>`).join('')}
    </div>
    <div class="bars-axis" aria-hidden="true">
      ${buckets.map((b, i) => `<span>${(days - 1 - i) % every === 0 ? dayFmt.format(b.date) : ''}</span>`).join('')}
    </div>`;
}

function renderTop(orders) {
  const units = new Map();
  for (const o of orders) {
    if (!PAID_STATUSES.includes(o.status)) continue;
    for (const it of o.items) {
      const u = units.get(it.product_name) ?? { qty: 0, amount: 0 };
      u.qty += it.quantity; u.amount += Number(it.line_total);
      units.set(it.product_name, u);
    }
  }
  const top = [...units].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5);
  const max = Math.max(1, ...top.map(([, u]) => u.amount));
  document.getElementById('top-products').innerHTML = top.length ? `
    <ol class="rank">${top.map(([name, u]) => `
      <li><span>${escapeHtml(name)}</span><strong>${money(u.amount)}</strong>
        <small class="muted">${u.qty} ${u.qty === 1 ? 'ud.' : 'uds.'}</small><span></span>
        <span class="meter"><span style="width:${(u.amount / max) * 100}%"></span></span></li>`).join('')}
    </ol>` : '<p class="empty">Todavía no hay ventas en este periodo.</p>';
}

function renderAlerts(items) {
  document.getElementById('stock-alerts').innerHTML = items.length ? `
    <ul class="alert-list">${items.slice(0, 6).map(p => `
      <li><a href="admin-producto.html?id=${p.id}">${escapeHtml(p.name)}</a>
        ${Number(p.total_stock) === 0 ? '<span class="pill pill-out">Agotado</span>'
          : Number(p.variants_out) > 0 ? '<span class="pill pill-low">Versión agotada</span>'
          : `<span class="pill pill-low">Quedan ${p.total_stock}</span>`}</li>`).join('')}
    </ul>` : '<p class="empty">Todo el catálogo tiene stock suficiente.</p>';
}

function renderFunnel(traffic, orders) {
  const created = orders.length;
  const paid = orders.filter(o => PAID_STATUSES.includes(o.status)).length;
  const steps = [
    ['Visitas a fichas', traffic.views],
    ['Añadidos al carrito', traffic.carts],
    ['Checkouts iniciados', traffic.checkouts],
    ['Pedidos creados', created],
    ['Pedidos pagados', paid],
  ];
  const max = Math.max(1, ...steps.map(s => s[1]));
  document.getElementById('funnel').innerHTML = `
    <ul class="funnel">${steps.map(([label, n]) => `
      <li><span class="funnel-label">${label}</span>
        <span class="funnel-bar"><span style="width:${(n / max) * 100}%"></span></span><strong>${n}</strong></li>`).join('')}
    </ul>
    <p class="muted small">Conversión de visita a pedido pagado: <strong>${pct(paid, traffic.views)} %</strong></p>`;
}

function renderLatest(orders) {
  document.getElementById('latest-orders').innerHTML = orders.length ? `
    <ul class="alert-list">${orders.slice(0, 6).map(o => `
      <li><span><a href="admin-pedido.html?id=${o.id}">${escapeHtml(o.order_number)}</a><br>
        <small class="muted">${escapeHtml(o.customer?.full_name ?? '')} · ${formatDate(o.created_at)}</small></span>
        <span>${money(o.total)}<br>${statusBadge(o.status)}</span></li>`).join('')}
    </ul>` : '<p class="empty">Todavía no hay pedidos en este periodo.</p>';
}

async function load() {
  const days = Number(periodSelect.value);
  const from = new Date(startOfDay(new Date()) - (days - 1) * DAY);
  const prevFrom = new Date(from - days * DAY);
  try {
    const [all, alerts, traffic, pending] = await Promise.all([
      ordersSince(prevFrom.toISOString()), stockAlerts(), trafficSince(from.toISOString()),
      countPendingSupport().catch(() => null),
    ]);
    const cur = all.filter(o => new Date(o.created_at) >= from);
    const prev = all.filter(o => new Date(o.created_at) < from);
    renderKpis(cur, prev, pending);
    renderChart(cur, days);
    renderTop(cur);
    renderAlerts(alerts);
    renderFunnel(traffic, cur);
    renderLatest(cur);
  } catch (err) {
    console.error(err);
    document.getElementById('kpis').innerHTML = '<p class="empty error">No se ha podido cargar el panel. Inténtalo de nuevo en unos segundos.</p>';
  }
}

periodSelect.addEventListener('change', load);
load();
