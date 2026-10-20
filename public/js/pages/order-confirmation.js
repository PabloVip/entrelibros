// Confirmación del pedido. El navegador no puede leer "orders" (RLS): los datos llegan de
// get_order_summary, que solo responde si coinciden el número de pedido y el email.
// Al volver de Stripe la URL trae además ?session_id=cs_test_…: antes de enseñar el pedido se
// pide al servidor que confirme el pago con Stripe (Edge Function confirm-checkout-session).
import { renderLayout } from '../core/layout.js';
import { getOrderSummary, confirmStripeCheckout } from '../repositories/checkoutRepository.js';
import { ORDER_NUMBER_RE, STRIPE_SESSION_RE } from '../services/checkoutService.js';
import { METHOD_LABELS, PAYMENT_LABELS } from '../services/orderService.js';
import { statusBadge } from '../components/statusBadge.js';
import { escapeHtml, money, param, formatDate } from '../core/utils.js';
import { locale } from '../core/i18n.js';

renderLayout();

const root = document.getElementById('order');
const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
let stripeNotice = ''; // aviso si el pago de Stripe no se ha podido confirmar todavía

/** Suma días laborables (sin sábados ni domingos; los festivos no se tienen en cuenta). */
function addBusinessDays(date, days) {
  const d = new Date(date);
  while (days > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days--;
  }
  return d;
}

function lookupForm(orderNumber = '', email = '', error = '') {
  root.innerHTML = `
    <h1>Consulta tu pedido</h1>
    <form id="lookup" class="card-form narrow" novalidate>
      <div class="field">
        <label for="f-pedido">Número de pedido</label>
        <input id="f-pedido" name="pedido" type="text" value="${escapeHtml(orderNumber)}" placeholder="EL-20261018-AB12" required>
      </div>
      <div class="field">
        <label for="f-email">Email del pedido</label>
        <input id="f-email" name="email" type="email" value="${escapeHtml(email)}" autocomplete="email" required>
      </div>
      <button type="submit" class="btn">Ver pedido</button>
      <p id="lookup-msg" class="form-msg error" role="alert">${escapeHtml(error)}</p>
    </form>`;
  const form = document.getElementById('lookup');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const n = form.pedido.value.trim().toUpperCase();
    const em = form.email.value.trim();
    if (!ORDER_NUMBER_RE.test(n) || !form.email.checkValidity() || !em) {
      document.getElementById('lookup-msg').textContent = 'Escribe el número de pedido (EL-AAAAMMDD-XXXX) y un email válido.';
      return;
    }
    history.replaceState(null, '', `?${new URLSearchParams({ pedido: n, email: em })}`);
    load(n, em);
  });
}

function heading(o) {
  if (o.status === 'creado') return 'Pedido pendiente de pago';
  if (o.status === 'pago_simulado') return '¡Gracias! Tu pedido está confirmado';
  return 'Tu pedido';
}

function render(o, email) {
  const s = o.shipping;
  const p = o.payment;
  const from = addBusinessDays(o.created_at, s.eta_min);
  const to = addBusinessDays(o.created_at, s.eta_max);
  const support = `soporte.html?${new URLSearchParams({ pedido: o.order_number, email })}`;

  root.innerHTML = `
    <h1>${heading(o)}</h1>
    <div class="order-head">
      <strong class="h3">${escapeHtml(o.order_number)}</strong>
      ${statusBadge(o.status)}
      <span class="muted">${escapeHtml(formatDate(o.created_at))}</span>
    </div>

    ${o.status === 'creado' && stripeNotice ? `<p class="note" role="status">${escapeHtml(stripeNotice)}</p>` : ''}
    ${o.status === 'creado' ? `
      <p class="note">Este pedido todavía no está pagado.
        <a href="pago.html?pedido=${encodeURIComponent(o.order_number)}">Ir al pago</a></p>` : ''}
    ${o.status === 'incidencia' ? `
      <p class="note">Hay una incidencia con este pedido: lo estamos revisando y te escribiremos.</p>` : ''}

    <div class="order-grid">
      <div class="table-wrap">
        <table class="data-table">
          <caption class="visually-hidden">Productos del pedido</caption>
          <thead><tr><th>Producto</th><th class="num">Uds.</th><th class="num hide-sm">Precio</th><th class="num">Importe</th></tr></thead>
          <tbody>${o.items.map(i => `
            <tr>
              <td>${escapeHtml(i.product_name)}<br><small>${escapeHtml(i.variant_name)} · ${escapeHtml(i.sku)}</small></td>
              <td class="num">${escapeHtml(i.quantity)}</td>
              <td class="num hide-sm">${money(i.unit_price)}</td>
              <td class="num">${money(i.line_total)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr><th colspan="2">Subtotal</th><td class="hide-sm"></td><td class="num">${money(o.subtotal)}</td></tr>
            ${Number(o.discount_amount) > 0 ? `
              <tr><th colspan="2">Descuento (${escapeHtml(o.discount_code)})</th><td class="hide-sm"></td><td class="num">−${money(o.discount_amount)}</td></tr>` : ''}
            <tr><th colspan="2">Envío</th><td class="hide-sm"></td><td class="num">${Number(o.shipping_cost) === 0 ? 'Gratis' : money(o.shipping_cost)}</td></tr>
            <tr class="total"><th colspan="2">Total</th><td class="hide-sm"></td><td class="num">${money(o.total)}</td></tr>
            <tr><th colspan="2">IVA incluido (${escapeHtml(Number(o.tax_rate))} %)</th><td class="hide-sm"></td><td class="num">${money(o.tax_amount)}</td></tr>
          </tfoot>
        </table>
      </div>

      <aside class="panel">
        <h2 class="h3">Envío</h2>
        <p>${escapeHtml(s.name)}<br>${escapeHtml(s.address)}<br>${escapeHtml(s.postcode)} ${escapeHtml(s.city)} (${escapeHtml(s.province)})</p>
        ${s.notes ? `<p class="muted small">Nota: ${escapeHtml(s.notes)}</p>` : ''}
        <p>${escapeHtml(s.method)}: ${escapeHtml(s.eta_min)}-${escapeHtml(s.eta_max)} días laborables.<br>
          <strong>Entrega estimada:</strong> entre el ${escapeHtml(dayFmt.format(from))} y el ${escapeHtml(dayFmt.format(to))}.</p>

        <h2 class="h3">Pago</h2>
        ${p ? `
          <p>${escapeHtml(METHOD_LABELS[p.method] ?? p.method)}${p.card_last4 ? ` · •••• ${escapeHtml(p.card_last4)}` : ''}<br>
            <span class="status-pill pay-${escapeHtml(p.status)}">${escapeHtml(PAYMENT_LABELS[p.status] ?? p.status)}</span>
            <small class="muted pay-ref">${escapeHtml(p.transaction_ref)}</small></p>
          ${p.failure_reason ? `<p class="muted small">${escapeHtml(p.failure_reason)}</p>` : ''}` : '<p class="muted">Sin pagos todavía.</p>'}

        <h2 class="h3">¿Algún problema?</h2>
        <p><a href="${escapeHtml(support)}">Contacta con soporte</a> indicando tu número de pedido.</p>
      </aside>
    </div>`;
}

async function load(orderNumber, email) {
  root.setAttribute('aria-busy', 'true');
  try {
    const order = await getOrderSummary(orderNumber, email);
    if (!order) {
      lookupForm(orderNumber, email, 'No encontramos ningún pedido con ese número y ese email.');
      return;
    }
    render(order, email);
  } catch (err) {
    console.error(err);
    root.innerHTML = err?.code === 'PGRST202'
      ? '<p class="empty error">La consulta de pedidos todavía no está disponible: falta activar la función en el servidor.</p>'
      : '<p class="empty error">No se ha podido cargar el pedido. Inténtalo de nuevo en unos segundos.</p>';
  } finally {
    root.removeAttribute('aria-busy');
  }
}

/**
 * Vuelta desde Stripe: el servidor pregunta a Stripe si la sesión está pagada y, si lo está,
 * registra el pago. Aquí no se decide nada: solo se enseña lo que diga el servidor.
 */
async function confirmStripe(sessionId, orderNumber, email) {
  root.innerHTML = '<p class="empty" role="status">Confirmando el pago con Stripe…</p>';
  try {
    const r = await confirmStripeCheckout(sessionId);
    if (r?.status === 'pendiente') {
      stripeNotice = 'Stripe todavía no ha confirmado el pago. Si acabas de pagar, recarga la página en unos segundos.';
      return;
    }
    // confirmado: se quita session_id de la dirección (si se recarga, no hace falta volver a confirmar)
    history.replaceState(null, '', `?${new URLSearchParams({ pedido: orderNumber, email })}`);
  } catch (err) {
    console.error(err);
    // session_id se queda en la dirección: al recargar se vuelve a intentar (el servidor no cobra dos veces)
    stripeNotice = err.fromServer
      ? err.message
      : 'No hemos podido confirmar el pago con Stripe. Recarga la página en unos segundos para volver a intentarlo.';
  }
}

const orderNumber = (param('pedido') ?? '').trim().toUpperCase();
const email = (param('email') ?? '').trim();
const sessionId = param('session_id') ?? '';
if (ORDER_NUMBER_RE.test(orderNumber) && email) {
  if (STRIPE_SESSION_RE.test(sessionId)) confirmStripe(sessionId, orderNumber, email).then(() => load(orderNumber, email));
  else load(orderNumber, email);
} else {
  lookupForm(orderNumber, email);
  root.removeAttribute('aria-busy');
}
