// Pago del pedido, de dos formas:
//  - Stripe en modo prueba: create-checkout-session (Edge Function) devuelve la dirección de la página
//    de pago de Stripe; al volver, pedido.html confirma el pago con Stripe en el servidor.
//  - Simulado (tarjeta de prueba o Bizum): el resultado lo decide simulate_payment en el servidor.
import { renderLayout } from '../core/layout.js';
import { simulatePayment, createStripeCheckout } from '../repositories/checkoutRepository.js';
import {
  ORDER_NUMBER_RE, TEST_CARDS, STRIPE_TEST_CARDS, testCardDigits, getLastOrder,
  BIZUM_TEST_PHONES, testPhoneDigits,
} from '../services/checkoutService.js';
import { openBizumSandbox } from '../components/bizumSandbox.js';
import { escapeHtml, money, param } from '../core/utils.js';
import { lang } from '../core/i18n.js';
import { showCheckoutSteps } from '../components/checkoutSteps.js';
import { CARD, PHONE, COPY } from '../components/icons.js';

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

    <!-- Cada aviso de tarjetas de prueba se ve solo con su método de pago (data-for-method) -->
    <div class="note pay-note" data-for-method="stripe_test">
      <strong>Pago con Stripe en modo prueba:</strong> no se cobra nada. En la página de Stripe usa una de estas tarjetas, con cualquier fecha futura y cualquier CVC:
      <ul class="test-cards">${STRIPE_TEST_CARDS.map(c => `
        <li><code>${escapeHtml(c.number)}</code> → ${escapeHtml(c.result)}
          <button type="button" class="copy-btn" data-copy="${escapeHtml(c.number.replaceAll(' ', ''))}"
                  aria-label="Copiar el número ${escapeHtml(c.number)}">${COPY}<span>Copiar</span></button></li>`).join('')}
      </ul>
    </div>
    <div class="note pay-note" data-for-method="tarjeta_simulada" hidden>
      <strong>Pago simulado:</strong> no se cobra nada y no se aceptan tarjetas reales. Usa una de estas tarjetas de prueba:
      <ul class="test-cards">${TEST_CARDS.map(c => `
        <li><code>${escapeHtml(c.number)}</code> → ${escapeHtml(c.result)}
          <button type="button" class="link-btn" data-card="${escapeHtml(c.number)}">Usar</button></li>`).join('')}
      </ul>
    </div>

    <div class="note pay-note" data-for-method="bizum_simulado" hidden>
      <strong>Bizum en sandbox:</strong> es una simulación, no se cobra nada y no se usan teléfonos reales. Usa uno de estos teléfonos de prueba:
      <ul class="test-cards">${BIZUM_TEST_PHONES.map(p => `
        <li><code>${escapeHtml(p.number)}</code> → ${escapeHtml(p.result)}
          <button type="button" class="link-btn" data-phone="${escapeHtml(p.number)}">Usar</button></li>`).join('')}
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
        <label class="variant">
          <input type="radio" name="method" value="tarjeta_simulada">
          <span class="variant-name"><span class="method-ico">${CARD}</span>Tarjeta (simulada)</span><span></span>
        </label>
        <label class="variant">
          <input type="radio" name="method" value="bizum_simulado">
          <span class="variant-name"><span class="method-ico">${PHONE}</span>Bizum (simulado)</span><span></span>
          <small class="ship-info">Recibes la solicitud en el móvil del sandbox y la aceptas.</small>
        </label>
      </fieldset>

      <div class="field" id="card-field" hidden>
        <label for="f-card">Número de tarjeta de prueba</label>
        <!-- autocomplete="off": que el navegador no proponga tarjetas reales guardadas -->
        <input id="f-card" name="card" type="text" inputmode="numeric" autocomplete="off"
               maxlength="23" placeholder="4242 4242 4242 4242" aria-describedby="err-card">
        <p id="err-card" class="field-error"></p>
      </div>

      <div class="field" id="phone-field" hidden>
        <label for="f-phone">Teléfono de prueba (Bizum)</label>
        <input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="off"
               maxlength="16" placeholder="600 000 001" aria-describedby="err-phone">
        <p id="err-phone" class="field-error"></p>
      </div>

      <button type="submit" class="btn">Pagar con Stripe</button>
      <p id="pay-msg" class="form-msg" role="alert"></p>
    </form>`;
}

/** Enseña lo que corresponde al método elegido: su aviso de tarjetas, el campo de tarjeta y el texto del botón. */
function showMethod(method) {
  for (const el of root.querySelectorAll('[data-for-method]')) el.hidden = el.dataset.forMethod !== method;
  document.getElementById('card-field').hidden = method !== 'tarjeta_simulada';
  document.getElementById('phone-field').hidden = method !== 'bizum_simulado';
  root.querySelector('#pay-form button[type=submit]').textContent =
    method === 'stripe_test' ? 'Pagar con Stripe' : method === 'bizum_simulado' ? 'Enviar solicitud de Bizum' : 'Pagar';
}

/** Mensaje de error de Stripe para el cliente. */
function stripeErrorText(err) {
  if (err.fromServer && /ya está pagado/.test(err.message)) {
    return `${escapeHtml(err.message)}. <a href="${escapeHtml(confirmationUrl())}">Ver el pedido</a>`;
  }
  if (err.fromServer) return escapeHtml(err.message); // stock, pedido no encontrado… (ya en español)
  if (err.status === 401 || err.status === 404) {
    return 'El pago con Stripe todavía no está disponible: falta activarlo en el servidor. Mientras tanto puedes pagar con la tarjeta simulada o con Bizum.';
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

/** Errores del servidor: los de validación (22023) y "no encontrado" (P0002) ya vienen en español. */
function payErrorText(err) {
  if (err?.code === '22023' && /ya está pagado/.test(err.message)) {
    return `${escapeHtml(err.message)}. <a href="${escapeHtml(confirmationUrl())}">Ver el pedido</a>`;
  }
  if (err?.code === '22023' || err?.code === 'P0002') return escapeHtml(err.message);
  if (err?.code === 'PGRST202') return 'El pago todavía no está disponible: falta activar la función en el servidor.';
  return 'No se ha podido procesar el pago. Revisa tu conexión e inténtalo de nuevo.';
}

/**
 * Bizum en sandbox: se abre el "móvil" simulado, el cliente acepta, rechaza o deja caducar la
 * solicitud y el servidor registra el resultado (simulate_payment decide con el teléfono de prueba).
 */
async function payWithBizum(form) {
  const errPhone = document.getElementById('err-phone');
  const phone = testPhoneDigits(form.elements.phone.value);
  if (!phone) {
    errPhone.textContent = 'Usa uno de los teléfonos de prueba indicados arriba.';
    form.elements.phone.setAttribute('aria-invalid', 'true');
    form.elements.phone.focus();
    return;
  }
  errPhone.textContent = '';
  form.elements.phone.removeAttribute('aria-invalid');
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  say('');
  const sb = openBizumSandbox({ phone, amount: last?.total ?? null, orderNumber });
  try {
    await sb.connect();
    // solo el teléfono que tiene Bizum activo recibe la solicitud; los otros los rechaza el "banco"
    const decision = phone === '600000001' ? await sb.ask() : null;
    sb.processing();
    const r = await simulatePayment(orderNumber, 'bizum_simulado', phone, decision);
    const ok = r.status === 'aprobado';
    await sb.result(ok, ok ? `Has pagado ${last ? money(last.total) : 'el pedido'} con Bizum.` : (r.failure_reason ?? 'Pago rechazado.'));
    if (ok) { location.href = confirmationUrl(); return; }
    say(`Pago rechazado: ${escapeHtml(r.failure_reason ?? 'motivo desconocido')}. Puedes intentarlo de nuevo.`, 'error');
  } catch (err) {
    console.error(err);
    sb.close();
    say(payErrorText(err), 'error');
  }
  btn.disabled = false;
}

async function pay(form) {
  const method = form.elements.method.value;
  if (method === 'stripe_test') return payWithStripe(form.querySelector('button[type=submit]'));
  if (method === 'bizum_simulado') return payWithBizum(form);
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
  showCheckoutSteps(3); // pasos de la compra: pago
  render();
  const form = document.getElementById('pay-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    pay(form);
  });
  form.addEventListener('change', e => {
    if (e.target.name === 'method') showMethod(e.target.value);
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
  root.addEventListener('click', e => {
    const btn = e.target.closest('button[data-phone]');
    if (!btn) return;
    form.elements.method.value = 'bizum_simulado';
    showMethod('bizum_simulado');
    form.elements.phone.value = btn.dataset.phone;
    form.elements.phone.focus();
  });
  root.addEventListener('click', e => {
    const btn = e.target.closest('button[data-card]');
    if (!btn) return;
    form.elements.method.value = 'tarjeta_simulada';
    showMethod('tarjeta_simulada');
    form.elements.card.value = btn.dataset.card;
    form.elements.card.focus();
  });
}
