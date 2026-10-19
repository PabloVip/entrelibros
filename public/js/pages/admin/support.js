// Back-office: listado de incidencias de soporte y cambio de estado.
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import { listSupportRequests, updateSupportStatus } from '../../repositories/supportAdminRepository.js';
import { nextSupportStatuses, ACTION_LABELS, SUPPORT_STATUS_LABELS } from '../../services/supportAdminService.js';
import { REASONS } from '../../services/supportService.js';
import { supportBadge } from '../../components/supportBadge.js';
import { escapeHtml, formatDate } from '../../core/utils.js';

const user = await requireAdmin();
renderAdminLayout(user);

const form  = document.getElementById('support-filters');
const tbody = document.getElementById('tickets');
const msg   = document.getElementById('support-msg');

form.reason.insertAdjacentHTML('beforeend',
  Object.entries(REASONS).map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join(''));

const params = new URLSearchParams(location.search);
const st = params.get('estado');
if (st === '' || st === 'pendientes' || st in SUPPORT_STATUS_LABELS) form.status.value = st;

function row(t) {
  const short = t.message.length > 90 ? `${t.message.slice(0, 90)}…` : t.message;
  return `
    <tr>
      <td class="nowrap"><strong>${escapeHtml(t.ticket_number)}</strong></td>
      <td>${formatDate(t.created_at)}</td>
      <td class="email-cell"><a href="mailto:${escapeHtml(t.customer_email)}">${escapeHtml(t.customer_email)}</a></td>
      <td>${escapeHtml(REASONS[t.reason] ?? t.reason)}</td>
      <td class="nowrap">${t.order ? `<a href="admin-pedido.html?id=${t.order.id}">${escapeHtml(t.order.order_number)}</a>` : '<span class="muted">—</span>'}</td>
      <td class="msg-cell">${t.message.length > 90
        ? `<details><summary>${escapeHtml(short)}</summary><p>${escapeHtml(t.message)}</p></details>`
        : escapeHtml(t.message)}</td>
      <td>${supportBadge(t.status)}</td>
      <td class="actions">${nextSupportStatuses(t.status).map(s => `
        <button type="button" class="btn btn-small ${s === 'abierta' ? 'btn-secondary' : ''}"
                data-id="${t.id}" data-status="${s}">${escapeHtml(ACTION_LABELS[s])}</button>`).join('')}</td>
    </tr>`;
}

async function load() {
  const status = form.status.value;
  history.replaceState(null, '', status === 'pendientes' ? location.pathname : `?estado=${status}`);
  try {
    const tickets = await listSupportRequests({ status: status || undefined, reason: form.reason.value || undefined });
    document.getElementById('support-count').textContent =
      `${tickets.length} ${tickets.length === 1 ? 'incidencia' : 'incidencias'}`;
    tbody.innerHTML = tickets.length
      ? tickets.map(row).join('')
      : '<tr><td colspan="8" class="empty">No hay incidencias con estos filtros.</td></tr>';
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="8" class="empty error">No se han podido cargar las incidencias.</td></tr>';
  }
}

tbody.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-status]');
  if (!btn) return;
  const ticket = btn.closest('tr').querySelector('strong').textContent;
  btn.disabled = true;
  try {
    await updateSupportStatus(Number(btn.dataset.id), btn.dataset.status);
    msg.textContent = `${ticket}: ${SUPPORT_STATUS_LABELS[btn.dataset.status].toLowerCase()}.`;
    msg.className = 'form-msg ok';
    await load();
  } catch (err) {
    console.error(err);
    msg.textContent = `No se pudo cambiar el estado de ${ticket}: ${err.message}`;
    msg.className = 'form-msg error';
    btn.disabled = false;
  }
});

form.addEventListener('change', load);
load();
