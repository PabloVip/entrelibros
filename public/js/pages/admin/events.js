// Registro de eventos: embudo, filtros y exportación.
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import { listEvents, countByType, FUNNEL } from '../../repositories/eventsRepository.js';
import { exportCsv, exportJson } from '../../services/exportService.js';
import { escapeHtml, formatDate } from '../../core/utils.js';

const user = await requireAdmin();
renderAdminLayout(user);

const form  = document.getElementById('event-filters');
const tbody = document.getElementById('events');
const EXPORT_LIMIT = 5000;
const COLUMNS = ['event_id', 'event_type', 'occurred_at', 'source', 'session_id',
                 'customer_id', 'order_id', 'entity_type', 'entity_id', 'payload'];

form.type.insertAdjacentHTML('beforeend',
  [...FUNNEL, 'order.status_changed', 'support.status_changed', 'wishlist.item_added',
   // back-office (08_admin_catalogo.sql)
   'product.created', 'product.updated', 'product.published', 'product.archived', 'product.deleted',
   'stock.adjusted', 'discount.saved', 'shipping_method.saved', 'theme.saved', 'theme.deleted',
   // cuentas de cliente (09_cuentas_clientes.sql)
   'customer.registered', 'customer.profile_updated'].map(t => `<option value="${t}">${t}</option>`).join(''));

const pedido = Number(new URLSearchParams(location.search).get('pedido'));
if (Number.isInteger(pedido) && pedido > 0) form.orderId.value = pedido;

function readFilters() {
  const orderId = Number(form.orderId.value);
  return {
    type: form.type.value || undefined,
    orderId: Number.isInteger(orderId) && orderId > 0 ? orderId : undefined,
    from: form.from.value ? new Date(`${form.from.value}T00:00:00`).toISOString() : undefined,
    to:   form.to.value   ? new Date(`${form.to.value}T23:59:59`).toISOString()   : undefined,
  };
}

async function renderFunnel(f) {
  const counts = await countByType({ ...f, type: undefined });
  const max = Math.max(1, ...Object.values(counts));
  document.getElementById('funnel').innerHTML = FUNNEL.map(t => `
    <li>
      <span class="funnel-label"><code>${t}</code></span>
      <span class="funnel-bar"><span style="width:${(counts[t] / max) * 100}%"></span></span>
      <strong>${counts[t]}</strong>
    </li>`).join('');
}

async function load() {
  const f = readFilters();
  try {
    const [events] = await Promise.all([listEvents(f), renderFunnel(f)]);
    document.getElementById('events-count').textContent =
      `${events.length} eventos${events.length === 200 ? ' (últimos 200; exporta para verlos todos)' : ''}`;
    tbody.innerHTML = events.length ? events.map(ev => `
      <tr>
        <td>${formatDate(ev.occurred_at)}</td>
        <td><code>${escapeHtml(ev.event_type)}</code></td>
        <td>${escapeHtml(ev.source)}</td>
        <td>${escapeHtml(ev.entity_type ?? '')} ${escapeHtml(ev.entity_id ?? '')}</td>
        <td>${ev.order_id ? `<a href="admin-pedido.html?id=${ev.order_id}">${ev.order_id}</a>` : ''}</td>
        <td><small>${escapeHtml((ev.session_id ?? '').slice(0, 12))}</small></td>
        <td><code class="payload">${escapeHtml(JSON.stringify(ev.payload))}</code></td>
      </tr>`).join('')
      : '<tr><td colspan="7" class="empty">No hay eventos con estos filtros.</td></tr>';
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" class="empty error">No se han podido cargar los eventos.</td></tr>';
  }
}

async function exportAs(kind) {
  const rows = await listEvents(readFilters(), EXPORT_LIMIT);
  const name = `eventos-entrelibros-${new Date().toISOString().slice(0, 10)}`;
  if (kind === 'csv') exportCsv(rows, COLUMNS, `${name}.csv`);
  else exportJson(rows, `${name}.json`);
}

form.addEventListener('change', load);
form.addEventListener('submit', e => { e.preventDefault(); load(); });
document.getElementById('export-csv').addEventListener('click', () => exportAs('csv').catch(console.error));
document.getElementById('export-json').addEventListener('click', () => exportAs('json').catch(console.error));

load();
