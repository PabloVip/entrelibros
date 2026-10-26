// Back-office · Integración (Tarea 2): cuadro de mando operativo, ERP/CRM, agente de IA y trazabilidad.
// Las cifras salen de admin_integration_dashboard / admin_integration_lists (14_integracion.sql):
// nada se escribe a mano en la página.
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import { integrationDashboard, integrationLists, retryOutbox } from '../../repositories/integrationRepository.js';
import { escapeHtml, money, formatDate } from '../../core/utils.js';
import { locale } from '../../core/i18n.js';

const user = await requireAdmin();
renderAdminLayout(user);

const DAY = 86400000;
const $ = id => document.getElementById(id);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const num = v => Number(v ?? 0);
const latency = s => s == null ? '—' : s < 120 ? `${s} s` : s < 7200 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
const short = (s, n = 80) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s ?? '');

const LABELS = {
  pendiente_pago: 'Pendiente de pago', pagado: 'Pagado', en_preparacion: 'En preparación', enviado: 'Enviado',
  entregado: 'Entregado', cancelado: 'Cancelado', incidencia: 'Incidencia',
  nuevo: 'Nuevo', en_curso: 'En curso', esperando_cliente: 'Esperando al cliente', resuelto: 'Resuelto',
  pendiente: 'Pendiente', procesado: 'Procesado', error: 'Error', descartado: 'Descartado',
  pendiente_revision: 'Pendiente de revisión', aprobado: 'Aprobado', rechazado: 'Rechazado',
  ejecutado_simulado: 'Ejecutado (simulado)', caducado: 'Caducado',
  ok: 'Correcto', duplicado: 'Duplicado', obsoleto: 'Obsoleto', ignorado: 'Ignorado', reintento: 'Reintento',
  contrato: 'Contrato', formato: 'Formato', coherencia: 'Coherencia', negocio: 'Negocio', tecnico: 'Técnico',
  agente: 'Agente', autenticacion: 'Autenticación',
  baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente',
};
const label = k => LABELS[k] ?? k;
const TONE = {
  procesado: 'pill-ok', ok: 'pill-ok', aprobado: 'pill-ok', enviado: 'pill-ok', ejecutado_simulado: 'pill-ok',
  pagado: 'pill-ok', entregado: 'pill-ok', resuelto: 'pill-ok',
  pendiente: 'pill-low', pendiente_revision: 'pill-low', reintento: 'pill-low', duplicado: 'pill-off',
  obsoleto: 'pill-off', ignorado: 'pill-off', nuevo: 'pill-low', en_curso: 'pill-low', alta: 'pill-low',
  error: 'pill-out', rechazado: 'pill-out', urgente: 'pill-out', caducado: 'pill-off', cancelado: 'pill-off',
};
const pill = (k, text = label(k)) => `<span class="pill ${TONE[k] ?? ''}">${escapeHtml(text)}</span>`;

// ---------- pestañas ----------
const tabs = [...document.querySelectorAll('[role=tab]')];
function selectTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    $(t.getAttribute('aria-controls')).hidden = !on;
  }
  history.replaceState(null, '', '#' + tab.id.replace('tab-', ''));
}
tabs.forEach(t => t.addEventListener('click', () => selectTab(t)));
function tabFromHash() {
  const t = tabs.find(x => x.id === 'tab-' + location.hash.slice(1));
  if (t) selectTab(t);
}
addEventListener('hashchange', tabFromHash);
tabFromHash();

// ---------- cuadro de mando ----------
function renderKpis(d) {
  const ex = d.executions ?? {}, erp = d.erp ?? {}, ag = d.agent ?? {};
  const total = num(ex.ok) + num(ex.error);
  $('int-kpis').innerHTML = `
    <div class="kpi"><span>Pedidos en el ERP</span><strong>${num(erp.orders)}</strong></div>
    <div class="kpi"><span>Importe pagado (simulado)</span><strong>${money(num(erp.orders_amount))}</strong></div>
    <div class="kpi"><span>Ejecuciones correctas</span><strong>${pct(ex.ok, total)} %</strong><small>${num(ex.ok)} de ${total} · ${num(ex.duplicates)} duplicados</small></div>
    <div class="kpi"><span>Ejecuciones con error</span><strong>${num(ex.error)}</strong></div>
    <div class="kpi"><span>Latencia media tienda → ERP</span><strong>${latency(d.avg_latency_s)}</strong></div>
    <div class="kpi"><span>Incidencias abiertas (CRM)</span><strong>${num(erp.open_tickets)}</strong><small>Resolución media: ${erp.avg_resolution_h != null ? erp.avg_resolution_h + ' h' : '—'}</small></div>
    <div class="kpi"><span>Propuestas del agente</span><strong>${num(ag.proposals)}</strong><small>${num(ag.approved)} aprobadas · ${num(ag.rejected)} rechazadas · ${num(ag.pending)} pendientes</small></div>
    <div class="kpi"><span>Mensajes enviados por Telegram</span><strong>${num(ag.sent)}</strong></div>`;
}

function renderChart(perDay, days) {
  const today = new Date(new Date().toDateString());
  const buckets = Array.from({ length: days }, (_, i) => ({ date: new Date(today - (days - 1 - i) * DAY), n: 0, amount: 0 }));
  for (const r of perDay ?? []) {
    const i = Math.round((new Date(r.day + 'T00:00:00') - buckets[0].date) / DAY);
    if (buckets[i]) { buckets[i].n = num(r.n); buckets[i].amount = num(r.amount); }
  }
  const max = Math.max(1, ...buckets.map(b => b.n));
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const every = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  $('int-chart').innerHTML = `
    <p class="bars-total">Pedidos en el periodo: <strong>${buckets.reduce((s, b) => s + b.n, 0)}</strong></p>
    <div class="bars" role="img" aria-label="Pedidos integrados por día">
      ${buckets.map(b => `<div class="bar ${b.n ? '' : 'is-empty'}" title="${fmt.format(b.date)}: ${b.n} ped. · ${money(b.amount)}"><span style="height:${(b.n / max) * 100}%"></span></div>`).join('')}
    </div>
    <div class="bars-axis" aria-hidden="true">${buckets.map((b, i) => `<span>${(days - 1 - i) % every === 0 ? fmt.format(b.date) : ''}</span>`).join('')}</div>`;
}

function hbars(el, entries, empty) {
  const max = Math.max(1, ...entries.map(e => num(e[1])));
  $(el).innerHTML = entries.length
    ? `<ul class="funnel">${entries.map(([k, n, extra]) => `
        <li><span class="funnel-label">${escapeHtml(k)}${extra ? `<br><small class="muted">${escapeHtml(extra)}</small>` : ''}</span>
          <span class="funnel-bar"><span style="width:${(num(n) / max) * 100}%"></span></span>
          <strong>${escapeHtml(String(n))}</strong></li>`).join('')}</ul>`
    : `<p class="muted">${empty}</p>`;
}

function renderDashboard(d, days) {
  renderKpis(d);
  renderChart(d.erp?.orders_per_day, days);
  hbars('int-status', Object.entries(d.erp?.orders_by_status ?? {}).map(([k, n]) => [label(k), n]), 'Aún no hay pedidos en el ERP.');
  hbars('int-errors', Object.entries(d.errors_by_type ?? {}).map(([k, n]) => [label(k), n]), 'Sin errores en el periodo.');
  const ag = d.agent ?? {};
  hbars('int-agent', [['Propuestas', num(ag.proposals)], ['Aprobadas', num(ag.approved)],
    ['Rechazadas', num(ag.rejected)], ['Pendientes', num(ag.pending)], ['Enviadas al cliente', num(ag.sent)]], 'Sin propuestas.');
  if (ag.avg_confidence != null) {
    $('int-agent').insertAdjacentHTML('beforeend', `<p class="muted small">Confianza media declarada por el agente: <strong>${Math.round(ag.avg_confidence * 100)} %</strong> · tasa de aprobación humana: <strong>${pct(ag.approved, num(ag.approved) + num(ag.rejected))} %</strong></p>`);
  }
  hbars('int-top', (d.erp?.top_products ?? []).map(p => [p.description, p.qty, p.sku]), 'Sin ventas pagadas en el ERP.');
  const f = d.funnel ?? {};
  hbars('int-funnel', [['Sesiones que ven fichas', f.views], ['Sesiones que añaden al carrito', f.carts, `${pct(f.carts, f.views)} %`],
    ['Sesiones que empiezan el checkout', f.checkouts, `${pct(f.checkouts, f.carts)} %`],
    ['Pedidos creados', f.orders], ['Pagos aprobados', f.paid, `${pct(f.paid, f.orders)} % de los pedidos`]], 'Sin eventos.');
}

// ---------- listados ----------
function renderErp(l) {
  $('erp-orders').innerHTML = l.erp_orders.length ? l.erp_orders.map(o => `
    <tr><td>${escapeHtml(o.external_id)}</td><td>${escapeHtml(o.email)}</td><td>${pill(o.status)}</td>
      <td>${pill(o.payment_status)} ${escapeHtml(o.payment_method ?? '')}</td><td>${o.lines}</td>
      <td>${money(o.total_amount)}</td><td>v${o.sync_version}</td><td>${formatDate(o.updated_at)}</td></tr>`).join('')
    : '<tr><td colspan="8">El ERP aún no tiene pedidos: se crean solos cuando la tienda registra uno.</td></tr>';

  $('erp-tickets').innerHTML = l.erp_tickets.length ? l.erp_tickets.map(t => `
    <details class="panel ticket">
      <summary><strong>${escapeHtml(t.external_id)}</strong> ${pill(t.status)} ${pill(t.priority, 'Prioridad ' + label(t.priority).toLowerCase())}
        <span class="muted">· ${escapeHtml(t.category)} · ${escapeHtml(t.email)}${t.order_number ? ' · ' + escapeHtml(t.order_number) : ''} · canal ${escapeHtml(t.channel)}</span></summary>
      <ol class="activity">${(t.activity ?? []).map(a => `
        <li><span class="muted small">${formatDate(a.at)} · ${escapeHtml(a.author)} · ${escapeHtml(a.kind.replace('_', ' '))}</span><br>${escapeHtml(a.body)}</li>`).join('')}</ol>
    </details>`).join('') : '<p class="muted">Sin incidencias en el CRM.</p>';

  $('erp-inventory').innerHTML = l.erp_inventory.length ? l.erp_inventory.map(i => `
    <tr><td>${escapeHtml(i.sku)}</td><td>${escapeHtml(i.description ?? '')}</td><td>${i.on_hand}</td><td>${formatDate(i.updated_at)}</td></tr>`).join('')
    : '<tr><td colspan="4">Sin ajustes de stock sincronizados todavía.</td></tr>';
}

function renderDecisions(list) {
  $('decisions').innerHTML = list.length ? list.map(d => `
    <article class="panel decision">
      <header><strong>Propuesta #${d.id}</strong> ${pill(d.final_status)} ${d.priority ? pill(d.priority, 'Prioridad ' + label(d.priority).toLowerCase()) : ''}
        <span class="muted">· ${escapeHtml(d.ticket_ref)}${d.order_ref ? ' · ' + escapeHtml(d.order_ref) : ''} · ${formatDate(d.created_at)}</span></header>
      <dl class="decision-grid">
        <dt>Tipo de caso</dt><dd>${escapeHtml(d.case_type)}</dd>
        <dt>Acción propuesta</dt><dd>${escapeHtml(d.proposed_action)} <span class="muted">(${escapeHtml(d.action_type)})</span></dd>
        <dt>Justificación</dt><dd>${escapeHtml(d.justification)}</dd>
        <dt>Confianza</dt><dd>${d.confidence != null ? Math.round(d.confidence * 100) + ' %' : '—'}</dd>
        <dt>Riesgos</dt><dd>${(d.risks ?? []).length ? `<ul>${d.risks.map(r => `<li>${escapeHtml(typeof r === 'string' ? r : JSON.stringify(r))}</li>`).join('')}</ul>` : '—'}</dd>
        <dt>Herramientas usadas</dt><dd>${(d.tools_used ?? []).map(t => `<code>${escapeHtml(t)}</code>`).join(' ') || '—'}</dd>
        <dt>Respuesta al cliente</dt><dd>${d.customer_message ? `<blockquote>${escapeHtml(d.customer_message)}</blockquote>` : '—'}</dd>
        <dt>Revisión humana</dt><dd>${d.reviewed_at ? `${escapeHtml(d.reviewer ?? '')} · ${formatDate(d.reviewed_at)}${d.review_note ? ' · ' + escapeHtml(d.review_note) : ''}` : 'Pendiente'}</dd>
        <dt>Modelo</dt><dd>${escapeHtml(d.model ?? '—')}${d.execution_id ? ` · ejecución n8n ${escapeHtml(d.execution_id)}` : ''}</dd>
      </dl>
      <details><summary>Datos consultados (JSON)</summary><pre class="json">${escapeHtml(JSON.stringify(d.consulted, null, 2))}</pre></details>
    </article>`).join('') : '<p class="muted">El agente aún no ha analizado ninguna incidencia.</p>';
}

function renderTrace(l) {
  $('outbox').innerHTML = l.outbox.length ? l.outbox.map(m => `
    <tr><td>${m.id}</td><td><code>${escapeHtml(m.event_type)}</code></td>
      <td>${escapeHtml(m.order_number ?? m.ticket_number ?? '')}</td>
      <td>${pill(m.status, m.status === 'enviado' ? 'Enviado (sin confirmar)' : label(m.status))}</td><td>${m.attempts}</td>
      <td>${formatDate(m.created_at)}</td><td>${m.processed_at ? formatDate(m.processed_at) : '—'}</td>
      <td>${escapeHtml(short(m.last_error, 60))}</td>
      <td>${['error', 'pendiente', 'enviado'].includes(m.status) ? `<button type="button" class="btn btn-small btn-secondary" data-retry="${m.id}">Reintentar</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="9">La cola está vacía.</td></tr>';

  $('intlog').innerHTML = l.log.length ? l.log.map(r => `
    <tr><td>${formatDate(r.created_at)}</td><td>${escapeHtml(r.workflow)}</td><td>${escapeHtml(r.step)}</td>
      <td><code>${escapeHtml(r.event_type ?? '')}</code></td><td>${escapeHtml(r.entity_ref ?? '')}</td>
      <td>${pill(r.status)}${r.error_type ? ' ' + pill('error', label(r.error_type)) : ''}</td>
      <td>${escapeHtml(short(r.message, 90))}</td><td>${escapeHtml(r.execution_id ?? '')}</td></tr>`).join('')
    : '<tr><td colspan="8">Sin ejecuciones registradas.</td></tr>';
}

document.getElementById('outbox').addEventListener('click', async e => {
  const b = e.target.closest('[data-retry]');
  if (!b) return;
  b.disabled = true;
  try {
    await retryOutbox(Number(b.dataset.retry));
    setTimeout(load, 1500);
  } catch (err) {
    b.disabled = false;
    alertError(err);
  }
});

function alertError(err) {
  $('int-kpis').innerHTML = `<p class="status error">No se han podido cargar los datos de integración: ${escapeHtml(err.message ?? String(err))}</p>`;
}

async function load() {
  const days = Number($('period').value);
  try {
    const [d, l] = await Promise.all([integrationDashboard(days), integrationLists(60)]);
    renderDashboard(d, days);
    renderErp(l);
    renderDecisions(l.decisions);
    renderTrace(l);
  } catch (err) {
    alertError(err);
  }
}

$('period').addEventListener('change', load);
$('reload').addEventListener('click', load);
load();
setInterval(() => { if (!document.hidden) load(); }, 30000);
