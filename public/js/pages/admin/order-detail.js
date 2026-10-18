// Detalle de pedido: líneas, importes, pagos, historial, eventos y cambio de estado.
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import { getOrder, updateOrderStatus } from '../../repositories/ordersRepository.js';
import { listEvents } from '../../repositories/eventsRepository.js';
import { STATUS_LABELS, PAYMENT_LABELS, METHOD_LABELS, nextStatuses } from '../../services/orderService.js';
import { statusBadge } from '../../components/statusBadge.js';
import { escapeHtml, money, formatDate, param } from '../../core/utils.js';

const user = await requireAdmin();
renderAdminLayout(user);

const root = document.getElementById('order');
const id = Number(param('id'));

function itemsTable(o) {
  return `
    <table class="data-table">
      <thead><tr><th>Producto</th><th>Referencia</th><th class="num">Precio</th><th class="num">Uds.</th><th class="num">Importe</th></tr></thead>
      <tbody>
        ${o.items.map(i => `
          <tr><td>${escapeHtml(i.product_name)}<br><small>${escapeHtml(i.variant_name)}</small></td>
              <td>${escapeHtml(i.sku)}</td><td class="num">${money(i.unit_price)}</td>
              <td class="num">${i.quantity}</td><td class="num">${money(i.line_total)}</td></tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><th colspan="4">Subtotal</th><td class="num">${money(o.subtotal)}</td></tr>
        ${Number(o.discount_amount) > 0 ? `<tr><th colspan="4">Descuento (${escapeHtml(o.discount_code)})</th><td class="num">−${money(o.discount_amount)}</td></tr>` : ''}
        <tr><th colspan="4">Envío · ${escapeHtml(o.shipping?.name ?? '')}</th><td class="num">${Number(o.shipping_cost) === 0 ? 'Gratis' : money(o.shipping_cost)}</td></tr>
        <tr class="total"><th colspan="4">Total</th><td class="num">${money(o.total)}</td></tr>
        <tr><th colspan="4"><small>IVA incluido (${Number(o.tax_rate)} %)</small></th><td class="num"><small>${money(o.tax_amount)}</small></td></tr>
      </tfoot>
    </table>`;
}

function render(o, events) {
  const next = nextStatuses(o.status);
  const history = [...o.history].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  document.title = `${o.order_number} · Back-office · Entrelibros`;
  document.getElementById('crumb').textContent = `› ${o.order_number}`;

  root.innerHTML = `
    <div class="order-head">
      <h1>${escapeHtml(o.order_number)}</h1>
      ${statusBadge(o.status)}
      <span class="muted">Creado el ${formatDate(o.created_at)}</span>
    </div>

    <div class="order-grid">
      <section class="panel">
        <h2 class="h3">Líneas del pedido</h2>
        <div class="table-wrap">${itemsTable(o)}</div>
      </section>

      <aside class="panel">
        <h2 class="h3">Cambiar estado</h2>
        ${next.length ? `
          <form id="status-form" class="stack">
            <label for="new-status">Nuevo estado</label>
            <select id="new-status" name="status" required>
              ${next.map(s => `<option value="${s}">${escapeHtml(STATUS_LABELS[s])}</option>`).join('')}
            </select>
            <label for="note">Nota interna (opcional)</label>
            <input id="note" name="note" maxlength="255" placeholder="p. ej. nº de seguimiento">
            <button class="btn" type="submit">Guardar estado</button>
            <p id="status-msg" class="form-msg" role="status"></p>
          </form>` : '<p class="muted">Estado final: no admite más cambios.</p>'}

        <h2 class="h3">Cliente</h2>
        <p>${escapeHtml(o.customer.full_name)}<br>
           <a href="mailto:${escapeHtml(o.customer.email)}">${escapeHtml(o.customer.email)}</a><br>
           ${escapeHtml(o.customer.phone ?? '')}</p>
        <h2 class="h3">Envío</h2>
        <p>${escapeHtml(o.ship_name)}<br>${escapeHtml(o.ship_address)}<br>
           ${escapeHtml(o.ship_postcode)} ${escapeHtml(o.ship_city)} (${escapeHtml(o.ship_province)})<br>
           <small class="muted">${escapeHtml(o.shipping?.name ?? '')} · ${o.shipping?.eta_days_min}-${o.shipping?.eta_days_max} días</small></p>
        ${o.customer_notes ? `<p class="note"><strong>Nota del cliente:</strong> ${escapeHtml(o.customer_notes)}</p>` : ''}
      </aside>

      <section class="panel">
        <h2 class="h3">Pagos simulados</h2>
        ${o.payments.length ? `<ul class="plain">${o.payments.map(p => `
          <li><span class="status-pill pay-${escapeHtml(p.status)}">${escapeHtml(PAYMENT_LABELS[p.status] ?? p.status)}</span>
            ${escapeHtml(METHOD_LABELS[p.method] ?? p.method)} · ${money(p.amount)}
            ${p.card_last4 ? `· •••• ${escapeHtml(p.card_last4)}` : ''}
            <br><small class="muted">${escapeHtml(p.transaction_ref)} · ${formatDate(p.created_at)}
            ${p.failure_reason ? ` · ${escapeHtml(p.failure_reason)}` : ''}</small></li>`).join('')}</ul>`
          : '<p class="muted">Sin pagos registrados.</p>'}
      </section>

      <section class="panel">
        <h2 class="h3">Historial de estados</h2>
        <ol class="timeline">${history.map(h => `
          <li><strong>${escapeHtml(STATUS_LABELS[h.to_status] ?? h.to_status)}</strong>
            <small class="muted">${formatDate(h.created_at)} · ${escapeHtml(h.changed_by)}</small>
            ${h.note ? `<br><small>${escapeHtml(h.note)}</small>` : ''}</li>`).join('')}</ol>
      </section>

      <section class="panel span-2">
        <h2 class="h3">Eventos del pedido</h2>
        ${events.length ? `<ul class="plain">${events.map(ev => `
          <li><code>${escapeHtml(ev.event_type)}</code> <small class="muted">${formatDate(ev.occurred_at)} · ${escapeHtml(ev.source)}</small></li>`).join('')}</ul>`
          : '<p class="muted">Sin eventos asociados.</p>'}
        <p><a href="admin-eventos.html?pedido=${o.id}">Ver en el registro de eventos →</a></p>
      </section>
    </div>`;

  const statusForm = document.getElementById('status-form');
  statusForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const newStatus = statusForm.status.value;
    const msg = document.getElementById('status-msg');
    if (['cancelado'].includes(newStatus) &&
        !confirmInline(statusForm, '¿Seguro? Cancelar es definitivo. Pulsa de nuevo para confirmar.')) return;
    statusForm.querySelector('button').disabled = true;
    try {
      await updateOrderStatus(o.id, newStatus, statusForm.note.value.trim());
      await load();
    } catch (err) {
      console.error(err);
      msg.textContent = `No se pudo cambiar el estado: ${err.message}`;
      msg.className = 'form-msg error';
      statusForm.querySelector('button').disabled = false;
    }
  });
}

/** Confirmación sin diálogos del navegador: el primer clic avisa, el segundo confirma. */
function confirmInline(form, text) {
  if (form.dataset.confirm === '1') return true;
  form.dataset.confirm = '1';
  const msg = form.querySelector('.form-msg');
  msg.textContent = text;
  msg.className = 'form-msg error';
  form.status.addEventListener('change', () => { form.dataset.confirm = ''; msg.textContent = ''; }, { once: true });
  return false;
}

async function load() {
  try {
    if (!Number.isInteger(id) || id < 1) throw new Error('not-found');
    const [order, events] = await Promise.all([getOrder(id), listEvents({ orderId: id }, 50)]);
    if (!order) throw new Error('not-found');
    render(order, events);
  } catch (err) {
    if (err.message !== 'not-found') console.error(err);
    root.innerHTML = `<p class="empty error">${err.message === 'not-found' ? 'Pedido no encontrado.' : 'No se ha podido cargar el pedido.'}</p>`;
  } finally {
    root.removeAttribute('aria-busy');
  }
}

load();
