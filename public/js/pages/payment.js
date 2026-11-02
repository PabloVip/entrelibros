// Pago del pedido con Stripe en modo prueba (el sandbox oficial de Stripe): create-checkout-session
// (Edge Function) devuelve la dirección de la página de pago de Stripe; al volver, pedido.html confirma
// el pago con Stripe en el servidor. La tienda nunca ve el número de la tarjeta.
import { renderLayout } from '../core/layout.js';
import { createStripeCheckout } from '../repositories/checkoutRepository.js';
import { ORDER_NUMBER_RE, STRIPE_TEST_CARDS, getLastOrder } from '../services/checkoutService.js';
import { escapeHtml, money, param } from '../core/utils.js';
import { lang } from '../core/i18n.js';
import { showCheckoutSteps } from '../components/checkoutSteps.js';
import { CARD, COPY } from '../components/icons.js';

renderLayout();

const root = document.getElementById('payment');
const orderNumber = (param('pedido') ?? '').trim().toUpperCase();
const last = getLastOrder(orderNumber); // {orderNumber, email, total} si el pedido se creó en esta pestaña
const cancelled = param('cancelado') === '1'; // Stripe vuelve aquí con ?cancelado=1 si el cliente cancela

function confirmationUrl() {
  const q = new URLSearchParams({ pedido: orderNumber });
  if (last?.email) q.set('email', last.email);
  return `pedido.html?${q}`;
}

function render() {
  root.innerHTML = `
    ${cancelled ? `
      <p class="note pay-note" role="status">Has cancelado el pago en Stripe: no se ha cobrado nada. Puedes intentarlo de nuevo.</p>` : ''}
    <div class="panel pay-order">
      <p><span class="muted">Pedido</span><br><strong>${escapeHtml(orderNumber)}</strong></p>
      ${last ? `<p><span class="muted">Importe</span><br><strong class="pay-amount">${money(last.total)}</strong></p>` : ''}
    </div>

    <div class="note pay-note">
      <strong>Pago con Stripe en modo prueba:</strong> no se cobra nada. En la página de Stripe usa una de estas tarjetas, con cualquier fecha futura y cualquier CVC:
      <ul class="test-cards">${STRIPE_TEST_CARDS.map(c => `
        <li><code>${escapeHtml(c.number)}</code> → ${escapeHtml(c.result)}
          <button type="button" class="copy-btn" data-copy="${escapeHtml(c.number.replaceAll(' ', ''))}"
                  aria-label="Copiar el número ${escapeHtml(c.number)}">${COPY}<span>Copiar</span></button></li>`).join('')}
      </ul>
    </div>

    <form id="pay-form" class="card-form" novalidate>
      <fieldset class="form-section variants">
        <legend class="h3">Método de pago</legend>
        <label class="variant">
          <input type="radio" name="method" value="stripe_test" checked>
          <span class="variant-name"><span class="method-ico">${CARD}</span>Tarjeta con Stripe (modo prueba)</span><span></span>
          <small class="ship-info">Te llevamos a la página de pago de Stripe.</small>
        </label>
      </fieldset>

      <button type="submit" class="btn">Pagar con Stripe</button>
      <p id="pay-msg" class="form-msg" role="alert"></p>
    </form>`;
}

/** Mensaje de error de Stripe para el cliente. */
function stripeErrorText(err) {
  if (err.fromServer && /ya está pagado/.test(err.message)) {
    return `${escapeHtml(err.message)}. <a href="${escapeHtml(confirmationUrl())}">Ver el pedido</a>`;
  }
  if (err.fromServer) return escapeHtml(err.message); // stock, pedido no encontrado… (ya en español)
  if (err.status === 401 || err.status === 404) {
    return 'El pago con Stripe todavía no está disponible: falta activarlo en el servidor.';
  }
  return 'No se ha podido conectar con Stripe. Revisa tu conexión e inténtalo de nuevo.';
}

/** Stripe: pide al servidor la página de pago y lleva al cliente allí. */
async function payWithStripe(btn) {
  btn.disabled = true;
  say('Te llevamos a la página de pago de Stripe…');
  try {
    const { url } = await createStripeCheckout(orderNumber, lang);
    // solo se sale hacia Stripe: si la respuesta trajera otra dirección, no se sigue
    if (!/^https:\/\/checkout\.stripe\.com\//.test(url ?? '')) throw new Error(`dirección inesperada: ${url}`);
    location.href = url;
  } catch (err) {
    console.error(err);
    say(stripeErrorText(err), 'error');
    btn.disabled = false;
  }
}

function say(html, type = '') {
  const msg = document.getElementById('pay-msg');
  msg.innerHTML = html;
  msg.className = `form-msg ${type}`;
}

if (!ORDER_NUMBER_RE.test(orderNumber)) {
  root.innerHTML = `
    <p class="empty error">Falta el número de pedido o no es válido.</p>
    <p><a class="btn" href="carrito.html">Ir al carrito</a></p>`;
} else {
  showCheckoutSteps(3); // pasos de la compra: pago
  render();
  const form = document.getElementById('pay-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    payWithStripe(form.querySelector('button[type=submit]'));
  });
  // "Copiar": copia el número de la tarjeta de prueba de Stripe para pegarlo en su página (Clipboard API)
  root.addEventListener('click', async e => {
    const copy = e.target.closest('button[data-copy]');
    if (!copy) return;
    const text = copy.querySelector('span');
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      copy.classList.add('is-copied');
      text.textContent = 'Copiado';
      setTimeout(() => { copy.classList.remove('is-copied'); text.textContent = 'Copiar'; }, 2000);
    } catch {
      text.textContent = 'Selecciónalo y cópialo'; // sin permiso para el portapapeles
    }
  });
}
