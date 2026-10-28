// Back-office de la tienda · Integración (Tarea 2): lado de SALIDA de la integración.
// La tienda solo ve su cola de eventos (integration_outbox) y si n8n confirmó cada uno. Los datos del
// back-office ERP/CRM (pedidos de venta, inventario, incidencias, agente, registro) están en otro
// sistema con su propia web (erp/), al que la tienda no tiene acceso.
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import { integrationDashboard, integrationLists, retryOutbox } from '../../repositories/integrationRepository.js';
import { escapeHtml, formatDate } from '../../core/utils.js';
import { locale } from '../../core/i18n.js';

const user = await requireAdmin();
renderAdminLayout(user);

const DAY = 86400000;
const $ = id => document.getElementById(id);
const num = v => Number(v ?? 0);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const latency = s => s == null ? '—' : s < 120 ? `${s} s` : s < 7200 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
const short = (s, n = 80) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s ?? '');

const LABELS = { pendiente: 'Pendiente', enviado: 'Enviado (sin confirmar)', procesado: 'Procesado', error: 'Error', descartado: 'Descartado' };
const TONE = { procesado: 'pill-ok', pendiente: 'pill-low', enviado: 'pill-low', error: 'pill-out', descartado: 'pill-off' };
const pill = k => `<span class="pill ${TONE[k] ?? ''}">${escapeHtml(LABELS[k] ?? k)}</span>`;

function hbars(el, entries, empty) {
  const max = Math.max(1, ...entries.map(e => num(e[1])));
  $(el).innerHTML = entries.length
    ? `<ul class="funnel">${entries.map(([k, n]) => `
        <li><span class="funnel-label">${escapeHtml(k)}</span>
          <span class="funnel-bar"><span style="width:${(num(n) / max) * 100}%"></span></span>
          <strong>${escapeHtml(String(n))}</strong></li>`).join('')}</ul>`
    : `<p class="muted">${empty}</p>`;
}

function renderDashboard(d, days) {
  const st = d.by_status ?? {};
  $('int-kpis').innerHTML = `
    <div class="kpi"><span>Eventos enviados</span><strong>${num(d.total)}</strong></div>
    <div class="kpi"><span>Confirmados por el back-office</span><strong>${pct(st.procesado, d.total)} %</strong><small>${num(st.procesado)} de ${num(d.total)}</small></div>
    <div class="kpi"><span>Con error</span><strong>${num(st.error)}</strong></div>
    <div class="kpi"><span>Pendientes de confirmar</span><strong>${num(st.pendiente) + num(st.enviado)}</strong></div>
    <div class="kpi"><span>Necesitaron reintento</span><strong>${num(d.retried)}</strong></div>
    <div class="kpi"><span>Tiempo medio hasta confirmar</span><strong>${latency(d.avg_ack_s)}</strong></div>`;

  const today = new Date(new Date().toDateString());
  const buckets = Array.from({ length: days }, (_, i) => ({ date: new Date(today - (days - 1 - i) * DAY), n: 0, ok: 0 }));
  for (const r of d.per_day ?? []) {
    const i = Math.round((new Date(r.day + 'T00:00:00') - buckets[0].date) / DAY);
    if (buckets[i]) { buckets[i].n = num(r.n); buckets[i].ok = num(r.ok); }
  }
  const max = Math.max(1, ...buckets.map(b => b.n));
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const every = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  $('int-chart').innerHTML = `
    <p class="bars-total">Eventos en el periodo: <strong>${buckets.reduce((s, b) => s + b.n, 0)}</strong></p>
    <div class="bars" role="img" aria-label="Eventos enviados al back-office por día">
      ${buckets.map(b => `<div class="bar ${b.n ? '' : 'is-empty'}" title="${fmt.format(b.date)}: ${b.n} eventos · ${b.ok} confirmados"><span style="height:${(b.n / max) * 100}%"></span></div>`).join('')}
    </div>
    <div class="bars-axis" aria-hidden="true">${buckets.map((b, i) => `<span>${(days - 1 - i) % every === 0 ? fmt.format(b.date) : ''}</span>`).join('')}</div>`;

  hbars('int-types', Object.entries(d.by_type ?? {}), 'Sin eventos en el periodo.');
  hbars('int-status', Object.entries(st).map(([k, n]) => [LABELS[k] ?? k, n]), 'La cola está vacía.');
}

function renderOutbox(list) {
  $('outbox').innerHTML = list.length ? list.map(m => `
    <tr><td>${m.id}</td><td><code>${escapeHtml(m.event_type)}</code></td>
      <td>${escapeHtml(m.ticket_number ?? m.order_number ?? m.sku ?? '')}</td>
      <td>${pill(m.status)}</td><td>${m.attempts}</td>
      <td>${formatDate(m.created_at)}</td><td>${m.processed_at ? formatDate(m.processed_at) : '—'}</td>
      <td>${escapeHtml(short(m.last_error, 60))}</td>
      <td>${['error', 'pendiente', 'enviado'].includes(m.status) ? `<button type="button" class="btn btn-small btn-secondary" data-retry="${m.id}">Reintentar</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="9">La cola está vacía.</td></tr>';
}

$('outbox').addEventListener('click', async e => {
  const b = e.target.closest('[data-retry]');
  if (!b) return;
  b.disabled = true;
  try {
    await retryOutbox(Number(b.dataset.retry));
    setTimeout(load, 1500);
  } catch (err) {
    b.disabled = false;
    showError(err);
  }
});

function showError(err) {
  $('int-kpis').innerHTML = `<p class="status error">No se han podido cargar los datos de integración: ${escapeHtml(err.message ?? String(err))}</p>`;
}

async function load() {
  const days = Number($('period').value);
  try {
    const [d, l] = await Promise.all([integrationDashboard(days), integrationLists(60)]);
    renderDashboard(d, days);
    renderOutbox(l.outbox ?? []);
  } catch (err) {
    showError(err);
  }
}

$('period').addEventListener('change', load);
$('reload').addEventListener('click', load);
load();
setInterval(() => { if (!document.hidden) load(); }, 30000);
