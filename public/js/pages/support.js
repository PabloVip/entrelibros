// Soporte postventa: crea una incidencia con create_support_request (emite support.requested).
import { renderLayout } from '../core/layout.js';
import { createSupportRequest, telegramToken } from '../repositories/supportRepository.js';
import { TELEGRAM_BOT } from '../config.js';
import { REASONS, MESSAGE_MAX, validateSupport } from '../services/supportService.js';
import { escapeHtml, param } from '../core/utils.js';
import { prefillSupport } from '../components/supportAccount.js';

renderLayout();

const root = document.getElementById('support');
const FIELDS = ['email', 'orderNumber', 'reason', 'message'];

function renderForm() {
  // desde la confirmación del pedido se llega con ?pedido=…&email=… y se rellenan solos
  const orderNumber = (param('pedido') ?? '').trim().toUpperCase();
  const email = (param('email') ?? '').trim();
  root.innerHTML = `
    <form id="support-form" class="card-form" novalidate>
      <div class="field">
        <label for="f-email">Email</label>
        <input id="f-email" name="email" type="email" autocomplete="email" required maxlength="254"
               value="${escapeHtml(email)}" aria-describedby="err-email">
        <p id="err-email" class="field-error"></p>
      </div>
      <div class="field">
        <label for="f-orderNumber">Número de pedido <span class="muted">(opcional)</span></label>
        <input id="f-orderNumber" name="orderNumber" type="text" maxlength="16" placeholder="EL-20261018-AB12"
               value="${escapeHtml(orderNumber)}" aria-describedby="hint-order err-orderNumber">
        <small id="hint-order" class="muted">Solo se asocia a la incidencia si coincide con el email del pedido.</small>
        <p id="err-orderNumber" class="field-error"></p>
      </div>
      <div class="field">
        <label for="f-reason">Motivo</label>
        <select id="f-reason" name="reason" required aria-describedby="err-reason">
          <option value="">Elige un motivo…</option>
          ${Object.entries(REASONS).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}
        </select>
        <p id="err-reason" class="field-error"></p>
      </div>
      <div class="field">
        <label for="f-message">Mensaje</label>
        <textarea id="f-message" name="message" rows="6" maxlength="${MESSAGE_MAX}" required
                  aria-describedby="message-count err-message"></textarea>
        <small id="message-count" class="muted">0 / ${MESSAGE_MAX}</small>
        <p id="err-message" class="field-error"></p>
      </div>
      <button type="submit" class="btn">Enviar incidencia</button>
      <p id="support-msg" class="form-msg" role="alert"></p>
    </form>`;
}

function formValues(form) {
  return {
    email: form.elements.email.value.trim().toLowerCase(),
    orderNumber: form.elements.orderNumber.value.trim().toUpperCase(),
    reason: form.elements.reason.value,
    message: form.elements.message.value.trim(),
  };
}

/** Marca los campos incorrectos y devuelve el foco al primero. */
function showErrors(form, errors) {
  for (const name of FIELDS) {
    const text = errors[name] ?? '';
    document.getElementById(`err-${name}`).textContent = text;
    if (text) form.elements[name].setAttribute('aria-invalid', 'true');
    else form.elements[name].removeAttribute('aria-invalid');
  }
  const first = FIELDS.find(name => errors[name]);
  if (first) form.elements[first].focus();
}

function renderDone(result, values) {
  root.innerHTML = `
    <div class="panel" role="status">
      <h2 class="h3">Incidencia registrada</h2>
      <p>Tu número de incidencia es <strong class="pay-amount">${escapeHtml(result.ticket_number)}</strong>.
        Guárdalo para cualquier consulta.</p>
      ${values.orderNumber
        ? (result.order_linked
          ? `<p>La hemos asociado al pedido <strong>${escapeHtml(values.orderNumber)}</strong>.</p>`
          : `<p class="note">No hemos podido asociar el pedido ${escapeHtml(values.orderNumber)}: el número no coincide
               con el email indicado. La incidencia se ha registrado igualmente.</p>`)
        : ''}
      <div id="telegram-follow"></div>
      <p class="muted">Es un prototipo: la incidencia pasa al CRM interno, un agente de IA propone la respuesta y una persona la revisa antes de enviarla.</p>
      <p><a href="index.html">Volver a la tienda</a></p>
    </div>`;
  offerTelegram(result.ticket_number, values.email);
}

/** Tarea 2: seguir la incidencia en Telegram (el bot recibe /start <token> y vincula el chat). */
async function offerTelegram(ticket, email) {
  if (!TELEGRAM_BOT) return;
  try {
    const token = await telegramToken(ticket, email);
    if (!token) return;
    document.getElementById('telegram-follow').innerHTML = `
      <p>¿Quieres recibir la respuesta por Telegram?</p>
      <p><a class="btn" href="https://t.me/${encodeURIComponent(TELEGRAM_BOT)}?start=${encodeURIComponent(token)}"
            target="_blank" rel="noopener">Seguir la incidencia en Telegram</a></p>
      <p class="muted small">Se abre el bot de soporte de Entrelibros (prueba). Solo se guarda el identificador del chat.</p>`;
  } catch {
    /* sin Telegram: la incidencia ya está registrada */
  }
}

/** Errores del servidor: los de validación (22023) ya vienen en español. */
function supportErrorText(err) {
  if (err?.code === '22023') return err.message;
  if (err?.code === 'PGRST202') return 'El soporte todavía no está disponible: falta activar la función en el servidor.';
  return 'No se ha podido enviar la incidencia. Revisa tu conexión e inténtalo de nuevo.';
}

async function submit(form) {
  const msg = document.getElementById('support-msg');
  const values = formValues(form);
  const errors = validateSupport(values);
  showErrors(form, errors);
  if (Object.keys(errors).length) {
    msg.textContent = 'Revisa los campos marcados.';
    msg.className = 'form-msg error';
    return;
  }

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  msg.textContent = 'Enviando…';
  msg.className = 'form-msg';
  try {
    renderDone(await createSupportRequest(values), values);
  } catch (err) {
    console.error(err);
    msg.textContent = supportErrorText(err);
    msg.className = 'form-msg error';
    btn.disabled = false;
  }
}

renderForm();
const form = document.getElementById('support-form');
prefillSupport(form); // con sesión: email de la cuenta y lista de sus pedidos

// Preguntas frecuentes (soporte.html): "Avisar de…" elige ese motivo en el formulario y lleva al mensaje.
document.querySelector('.faq')?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-reason]');
  if (!btn || !form.isConnected) return; // tras enviar la incidencia el formulario ya no está
  form.elements.reason.value = btn.dataset.reason;
  form.elements.reason.dispatchEvent(new Event('input', { bubbles: true })); // borra el error del motivo si lo había
  form.elements.message.focus(); // el navegador desplaza la página hasta el mensaje
});
form.addEventListener('submit', e => {
  e.preventDefault();
  submit(form);
});
form.addEventListener('input', e => {
  // un campo marcado con error se limpia en cuanto su valor pasa a ser válido
  if (FIELDS.includes(e.target.name) && e.target.getAttribute('aria-invalid') === 'true'
      && !validateSupport(formValues(form))[e.target.name]) {
    e.target.removeAttribute('aria-invalid');
    document.getElementById(`err-${e.target.name}`).textContent = '';
  }
  if (e.target.name === 'message') {
    document.getElementById('message-count').textContent = `${e.target.value.length} / ${MESSAGE_MAX}`;
  }
});
