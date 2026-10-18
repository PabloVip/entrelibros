// Pago simulado: tarjeta de prueba o Bizum simulado. No hay pasarela real:
// el resultado lo decide simulate_payment en el servidor.
import { renderLayout } from '../core/layout.js';
import { simulatePayment } from '../repositories/checkoutRepository.js';
import { ORDER_NUMBER_RE, TEST_CARDS, testCardDigits, getLastOrder } from '../services/checkoutService.js';
import { escapeHtml, money, param } from '../core/utils.js';

renderLayout();

const root = document.getElementById('payment');
const orderNumber = (param('pedido') ?? '').trim().toUpperCase();
const last = getLastOrder(orderNumber); // {orderNumber, email, total} si el pedido se creó en esta pestaña

function confirmationUrl() {
  const q = new URLSearchParams({ pedido: orderNumber });
  if (last?.email) q.set('email', last.email);
  return `pedido.html?${q}`;
}

function render() {
  root.innerHTML = `
    <div class="panel pay-order">
      <p><span class="muted">Pedido</span><br><strong>${escapeHtml(orderNumber)}</strong></p>
      ${last ? `<p><span class="muted">Importe</span><br><strong class="pay-amount">${money(last.total)}</strong></p>` : ''}
    </div>

    <div class="note">
      <strong>Pago simulado:</strong> no se cobra nada y no se aceptan tarjetas reales. Usa una de estas tarjetas de prueba:
      <ul>${TEST_CARDS.map(c => `
        <li><code>${escapeHtml(c.number)}</code> → ${escapeHtml(c.result)}
          <button type="button" class="link-btn" data-card="${escapeHtml(c.number)}">Usar</button></li>`).join('')}
      </ul>
    </div>

    <form id="pay-form" class="card-form" novalidate>
      <fieldset class="form-section variants">
        <legend class="h3">Método de pago</legend>
        <label class="variant">
          <input type="radio" name="method" value="tarjeta_simulada" checked>
          <span>Tarjeta (simulada)</span><span></span>
        </label>
        <label class="variant">
          <input type="radio" name="method" value="bizum_simulado">
          <span>Bizum (simulado)</span><span></span>
          <small class="ship-info">Siempre se aprueba; no hace falta ningún dato.</small>
        </label>
      </fieldset>

      <div class="field" id="card-field">
        <label for="f-card">Número de tarjeta de prueba</label>
        <!-- autocomplete="off": que el navegador no proponga tarjetas reales guardadas -->
        <input id="f-card" name="card" type="text" inputmode="numeric" autocomplete="off"
               maxlength="23" placeholder="4242 4242 4242 4242" aria-describedby="err-card">
        <p id="err-card" class="field-error"></p>
      </div>

      <button type="submit" class="btn">Pagar</button>
      <p id="pay-msg" class="form-msg" role="alert"></p>
    </form>`;
}

function say(html, type = '') {
  const msg = document.getElementById('pay-msg');
  msg.innerHTML = html;
  msg.className = `form-msg ${type}`;
}

/** Errores del servidor: los de validación (22023) y "no encontrado" (P0002) ya vienen en español. */
function payErrorText(err) {
  if (err?.code === '22023' && /ya está pagado/.test(err.message)) {
    return `${escapeHtml(err.message)}. <a href="${escapeHtml(confirmationUrl())}">Ver el pedido</a>`;
  }
  if (err?.code === '22023' || err?.code === 'P0002') return escapeHtml(err.message);
  if (err?.code === 'PGRST202') return 'El pago todavía no está disponible: falta activar la función en el servidor.';
  return 'No se ha podido procesar el pago. Revisa tu conexión e inténtalo de nuevo.';
}

async function pay(form) {
  const method = form.elements.method.value;
  const errCard = document.getElementById('err-card');
  let card = null;
  if (method === 'tarjeta_simulada') {
    card = testCardDigits(form.elements.card.value);
    if (!card) {
      errCard.textContent = 'Usa una tarjeta de prueba de las indicadas arriba.';
      form.elements.card.setAttribute('aria-invalid', 'true');
      form.elements.card.focus();
      return;
    }
  }
  errCard.textContent = '';
  form.elements.card.removeAttribute('aria-invalid');

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  say('Procesando el pago…');
  try {
    const r = await simulatePayment(orderNumber, method, card);
    if (r.status === 'aprobado') {
      location.href = confirmationUrl();
      return;
    }
    // rechazado: el pedido sigue en "creado" y se puede volver a intentar
    say(`Pago rechazado: ${escapeHtml(r.failure_reason ?? 'motivo desconocido')}. Puedes intentarlo de nuevo con otra tarjeta de prueba o con Bizum.`, 'error');
  } catch (err) {
    console.error(err);
    say(payErrorText(err), 'error');
  }
  btn.disabled = false;
}

if (!ORDER_NUMBER_RE.test(orderNumber)) {
  root.innerHTML = `
    <p class="empty error">Falta el número de pedido o no es válido.</p>
    <p><a class="btn" href="carrito.html">Ir al carrito</a></p>`;
} else {
  render();
  const form = document.getElementById('pay-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    pay(form);
  });
  form.addEventListener('change', e => {
    if (e.target.name === 'method') document.getElementById('card-field').hidden = e.target.value !== 'tarjeta_simulada';
  });
  root.addEventListener('click', e => {
    const btn = e.target.closest('button[data-card]');
    if (!btn) return;
    form.elements.method.value = 'tarjeta_simulada';
    document.getElementById('card-field').hidden = false;
    form.elements.card.value = btn.dataset.card;
    form.elements.card.focus();
  });
}
