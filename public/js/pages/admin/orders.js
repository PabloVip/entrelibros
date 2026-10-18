// Listado de pedidos con indicadores y filtros.
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import { listOrders } from '../../repositories/ordersRepository.js';
import { STATUS_LABELS, summarize } from '../../services/orderService.js';
import { statusBadge } from '../../components/statusBadge.js';
import { escapeHtml, money, formatDate } from '../../core/utils.js';

const user = await requireAdmin();
renderAdminLayout(user);

const form  = document.getElementById('order-filters');
const tbody = document.getElementById('orders');

form.status.insertAdjacentHTML('beforeend',
  Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join(''));

const params = new URLSearchParams(location.search);
if (params.get('estado') in STATUS_LABELS) form.status.value = params.get('estado');

function renderKpis(orders) {
  const k = summarize(orders);
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><span>Pedidos</span><strong>${k.total}</strong></div>
    <div class="kpi"><span>Por preparar</span><strong>${k.toPrepare}</strong></div>
    <div class="kpi"><span>Incidencias</span><strong>${k.incidents}</strong></div>
    <div class="kpi"><span>Facturado (simulado)</span><strong>${money(k.revenue)}</strong></div>`;
}

async function load() {
  const status = form.status.value || undefined;
  const q = form.q.value.replace(/[%_,()]/g, '').trim().slice(0, 60) || undefined;
  history.replaceState(null, '', status ? `?estado=${status}` : location.pathname);
  try {
    const orders = await listOrders({ status, q });
    if (!status && !q) renderKpis(orders);
    tbody.innerHTML = orders.length ? orders.map(o => `
      <tr>
        <td><a href="admin-pedido.html?id=${o.id}">${escapeHtml(o.order_number)}</a></td>
        <td>${formatDate(o.created_at)}</td>
        <td>${escapeHtml(o.customer.full_name)}<br><small>${escapeHtml(o.customer.email)}</small></td>
        <td class="num">${o.items.reduce((n, i) => n + i.quantity, 0)}</td>
        <td class="num">${money(o.total)}</td>
        <td>${statusBadge(o.status)}</td>
      </tr>`).join('')
      : '<tr><td colspan="6" class="empty">No hay pedidos con estos filtros.</td></tr>';
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" class="empty error">No se han podido cargar los pedidos.</td></tr>';
  }
}

let timer;
form.addEventListener('change', load);
form.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 350); });
form.addEventListener('submit', e => { e.preventDefault(); load(); });

// KPIs siempre sobre el total, aunque se entre con filtro
listOrders().then(renderKpis).catch(console.error);
load();
