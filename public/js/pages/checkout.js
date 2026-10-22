// Checkout: datos del cliente, envío y descuento. El resumen es orientativo;
// los importes reales los calcula create_order en el servidor.
import { renderLayout } from '../core/layout.js';
import { getSessionId } from '../core/session.js';
import { fetchVariantsByIds } from '../repositories/catalogRepository.js';
import { fetchShippingMethods, validateDiscount, createOrder, fetchPickupPoints } from '../repositories/checkoutRepository.js';
import { getCart, clearCart, refreshFromCatalog, lineProblem, subtotal } from '../services/cartService.js';
import { estimate, shippingCost, validateForm, saveLastOrder } from '../services/checkoutService.js';
import { track, EVENTS } from '../services/eventService.js';
import { escapeHtml, money } from '../core/utils.js';
import { prefillCheckout } from '../components/checkoutAccount.js';
import { showCheckoutSteps } from '../components/checkoutSteps.js';
import { mountPickupPicker } from '../components/pickupPicker.js';

renderLayout();
showCheckoutSteps(2); // pasos de la compra: tus datos

const root = document.getElementById('checkout');
let lines = [];
let methods = [];
let discount = null; // código aplicado: { code, description, amount }
let picker = null;   // selector de punto de recogida (se crea al elegir ese envío)
const PICKUP = 'punto'; // código del envío "Recogida en punto de entrega"

const FIELDS = ['full_name', 'email', 'phone', 'address', 'city', 'postcode', 'province', 'notes'];

function field(name, label, attrs = '', optional = false) {
  return `
    <div class="field">
      <label for="f-${name}">${label}${optional ? ' <span class="muted">(opcional)</span>' : ''}</label>
      <input id="f-${name}" name="${name}" ${attrs} aria-describedby="err-${name}">
      <p id="err-${name}" class="field-error"></p>
    </div>`;
}

function etaText(m) {
  return m.eta_days_min === m.eta_days_max
    ? `${m.eta_days_min} días laborables`
    : `${m.eta_days_min}-${m.eta_days_max} días laborables`;
}

function shippingOption(m, checked) {
  return `
    <label class="variant">
      <input type="radio" name="shipping" value="${escapeHtml(m.code)}" ${checked ? 'checked' : ''}>
      <span>${escapeHtml(m.name)}</span>
      <span class="variant-price" data-ship-price="${escapeHtml(m.code)}"></span>
      <small class="ship-info">${escapeHtml(etaText(m))}${m.free_from != null ? ` · gratis desde ${money(m.free_from)}` : ''}</small>
    </label>`;
}

function renderForm(priceChanges) {
  const defaultCode = methods.some(m => m.code === 'estandar') ? 'estandar' : methods[0].code;
  root.innerHTML = `
    ${priceChanges.length ? `
      <div class="note">
        <strong>Han cambiado algunos precios</strong> desde que añadiste los productos:
        <ul>${priceChanges.map(c => `
          <li>${escapeHtml(c.line.productName)} · ${escapeHtml(c.line.variantName)}: ${money(c.before)} → ${money(c.after)}</li>`).join('')}
        </ul>
      </div>` : ''}

    <form id="checkout-form" class="checkout-layout" novalidate>
      <div class="card-form">
        <fieldset class="form-section">
          <legend class="h3">Tus datos</legend>
          ${field('full_name', 'Nombre y apellidos', 'type="text" autocomplete="name" required maxlength="100"')}
          ${field('email', 'Email', 'type="email" autocomplete="email" required maxlength="254"')}
          ${field('phone', 'Teléfono', 'type="tel" autocomplete="tel" maxlength="20"', true)}
        </fieldset>

        <fieldset class="form-section">
          <legend class="h3" id="address-legend">Dirección de envío</legend>
          <!-- con "Recogida en punto de entrega" se oculta: la dirección es la del punto elegido -->
          <div id="home-address">
            ${field('address', 'Dirección', 'type="text" autocomplete="street-address" required maxlength="200"')}
            <div class="field-row">
              ${field('postcode', 'Código postal', 'type="text" autocomplete="postal-code" inputmode="numeric" required maxlength="5"')}
              ${field('city', 'Ciudad', 'type="text" autocomplete="address-level2" required maxlength="80"')}
            </div>
            ${field('province', 'Provincia', 'type="text" autocomplete="address-level1" required maxlength="80"')}
          </div>
          <div class="field">
            <label for="f-notes">Nota para el pedido <span class="muted">(opcional)</span></label>
            <textarea id="f-notes" name="notes" rows="3" maxlength="500" aria-describedby="notes-count err-notes"></textarea>
            <small id="notes-count" class="muted">0 / 500</small>
            <p id="err-notes" class="field-error"></p>
          </div>
        </fieldset>

        <fieldset class="form-section variants">
          <legend class="h3">Método de envío</legend>
          ${methods.map(m => shippingOption(m, m.code === defaultCode)).join('')}
        </fieldset>

        <fieldset class="form-section" id="pickup-section" hidden>
          <legend class="h3">Punto de recogida</legend>
          <p class="muted small">Elige dónde quieres recoger el pedido. Te avisaremos cuando llegue.</p>
          <div id="pickup-picker"></div>
          <p id="err-pickup" class="field-error" role="alert"></p>
        </fieldset>

        <fieldset class="form-section">
          <legend class="h3">Código de descuento</legend>
          <div class="field">
            <label for="f-discount" class="visually-hidden">Código de descuento</label>
            <div class="discount-row">
              <input id="f-discount" name="discount" type="text" autocomplete="off" maxlength="40"
                     autocapitalize="characters" aria-describedby="discount-msg">
              <button type="button" class="btn btn-secondary" id="apply-discount">Aplicar</button>
            </div>
            <p id="discount-msg" class="form-msg" role="status"></p>
          </div>
        </fieldset>
      </div>

      <aside class="panel cart-summary" aria-label="Resumen del pedido">
        <h2 class="h3">Resumen</h2>
        <ul class="plain summary-lines">${lines.map(l => `
          <li><span>${l.quantity} × ${escapeHtml(l.productName)}<br><small class="muted">${escapeHtml(l.variantName)}</small></span>
              <span>${money(l.unitPrice * l.quantity)}</span></li>`).join('')}
        </ul>
        <div id="summary-totals"></div>
        <button type="submit" class="btn">Confirmar pedido</button>
        <p id="order-msg" class="form-msg" role="alert"></p>
        <p class="muted small">Importes orientativos: el importe final lo calcula el servidor con los precios actuales.</p>
      </aside>
    </form>`;
}

function selectedMethod() {
  const code = root.querySelector('input[name=shipping]:checked')?.value;
  return methods.find(m => m.code === code);
}

function renderSummary() {
  const sub = subtotal(lines);
  const disc = discount?.amount ?? 0;
  const e = estimate({ subtotal: sub, discount: disc, method: selectedMethod() });

  // precio de cada método con el descuento actual (puede pasar a ser gratis)
  for (const m of methods) {
    const cost = shippingCost(m, sub, disc);
    root.querySelector(`[data-ship-price="${CSS.escape(m.code)}"]`).textContent = cost === 0 ? 'Gratis' : money(cost);
  }

  document.getElementById('summary-totals').innerHTML = `
    <p class="summary-row"><span>Subtotal</span> <span>${money(e.subtotal)}</span></p>
    ${discount ? `
      <p class="summary-row"><span>Descuento <small>(${escapeHtml(discount.code)})</small>
        <button type="button" class="link-btn" id="remove-discount">Quitar</button></span>
        <span>−${money(e.discount)}</span></p>` : ''}
    <p class="summary-row"><span>Envío</span> <span>${e.shipping === 0 ? 'Gratis' : money(e.shipping)}</span></p>
    <p class="cart-subtotal"><span>Total</span> <strong>${money(e.total)}</strong></p>
    <p class="muted small">IVA incluido: ${money(e.tax)}</p>`;
}

const isPickup = () => selectedMethod()?.code === PICKUP;

function formValues(form) {
  const values = {};
  for (const name of FIELDS) values[name] = form.elements[name].value.trim();
  values.email = values.email.toLowerCase();
  // recogida en punto: la dirección del pedido es la del punto (el servidor la vuelve a poner)
  const point = isPickup() ? picker?.selected() : null;
  if (point) Object.assign(values, { address: `${point.name} · ${point.address}`.slice(0, 200), city: point.city, postcode: point.postcode, province: point.province });
  return values;
}

/** Enseña el mapa de puntos (envío "punto") o la dirección de casa (el resto). */
async function toggleShipping(form) {
  const pickup = isPickup();
  document.getElementById('home-address').hidden = pickup;
  document.getElementById('address-legend').textContent = pickup ? 'Nota para el pedido' : 'Dirección de envío';
  const section = document.getElementById('pickup-section');
  section.hidden = !pickup;
  if (!pickup) return;
  if (picker) { picker.refresh(); return; }
  const box = document.getElementById('pickup-picker');
  box.innerHTML = '<p class="muted small">Cargando los puntos de recogida…</p>';
  try {
    const points = await fetchPickupPoints();
    picker = mountPickupPicker(box, points, {
      postcode: form.elements.postcode.value.trim(),
      onChange: () => {
        document.getElementById('err-pickup').textContent = '';
        const msg = document.getElementById('order-msg');
        if (msg.classList.contains('error')) { msg.textContent = ''; msg.className = 'form-msg'; }
      },
    });
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p class="empty error">No se han podido cargar los puntos de recogida. Elige otro método de envío o inténtalo de nuevo.</p>';
  }
}

/** Marca los campos incorrectos y devuelve el foco al primero. */
function showErrors(form, errors) {
  for (const name of FIELDS) {
    const input = form.elements[name];
    const text = errors[name] ?? '';
    document.getElementById(`err-${name}`).textContent = text;
    if (text) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  const first = FIELDS.find(name => errors[name]);
  if (first) form.elements[first].focus();
}

async function applyDiscount(form) {
  const msg = document.getElementById('discount-msg');
  const code = form.elements.discount.value.trim();
  if (!code) {
    msg.textContent = 'Escribe un código.';
    msg.className = 'form-msg error';
    return;
  }
  const btn = document.getElementById('apply-discount');
  btn.disabled = true;
  try {
    const r = await validateDiscount(code, subtotal(lines));
    if (r.valid) {
      discount = { code: r.code, description: r.description, amount: Number(r.discount_amount) };
      form.elements.discount.value = r.code;
      msg.textContent = `Código aplicado: ${r.description}.`;
      msg.className = 'form-msg ok';
    } else {
      discount = null;
      msg.textContent = r.reason;
      msg.className = 'form-msg error';
    }
  } catch (err) {
    console.error(err);
    discount = null;
    msg.textContent = 'No se ha podido comprobar el código. Inténtalo de nuevo.';
    msg.className = 'form-msg error';
  } finally {
    btn.disabled = false;
    renderSummary();
  }
}

/** Mensaje para el cliente: los errores de validación del servidor (22023) ya vienen en español. */
function orderErrorText(err) {
  if (err?.code === '22023') return err.message;
  if (err?.code === 'PGRST202') return 'La tienda todavía no acepta pedidos: falta activar la función en el servidor.';
  return 'No se ha podido crear el pedido. Revisa tu conexión e inténtalo de nuevo.';
}

async function submitOrder(form) {
  const msg = document.getElementById('order-msg');
  if (isPickup() && !picker?.selected()) {
    document.getElementById('err-pickup').textContent = 'Elige un punto de recogida en el mapa o en la lista.';
    document.getElementById('pickup-section').scrollIntoView({ block: 'center', behavior: 'smooth' });
    msg.textContent = 'Falta elegir el punto de recogida.';
    msg.className = 'form-msg error';
    return;
  }
  const values = formValues(form);
  const errors = validateForm(values);
  showErrors(form, errors);
  if (Object.keys(errors).length) {
    msg.textContent = 'Revisa los campos marcados.';
    msg.className = 'form-msg error';
    return;
  }

  // un código escrito pero sin aplicar no se manda: así el total no cambia por sorpresa
  const typed = form.elements.discount.value.trim().toUpperCase();
  if (typed && typed !== discount?.code) {
    const dmsg = document.getElementById('discount-msg');
    dmsg.textContent = 'Pulsa "Aplicar" para usar este código o bórralo.';
    dmsg.className = 'form-msg error';
    form.elements.discount.focus();
    return;
  }

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  msg.textContent = 'Creando el pedido…';
  msg.className = 'form-msg';
  try {
    const order = await createOrder({
      customer: { email: values.email, full_name: values.full_name, phone: values.phone },
      shipping: {
        name: values.full_name, address: values.address, city: values.city,
        postcode: values.postcode, province: values.province, notes: values.notes,
        pickup_point: isPickup() ? picker.selected().code : null, // 12_puntos_entrega.sql
      },
      items: lines.map(l => ({ variant_id: l.variantId, quantity: l.quantity })), // sin precios
      shippingCode: selectedMethod().code,
      discountCode: discount?.code,
      sessionId: getSessionId(),
    });
    // pago.html necesita el email para enlazar luego a la confirmación (no viaja en la URL de pago)
    saveLastOrder({ orderNumber: order.order_number, email: values.email, total: Number(order.total) });
    clearCart();
    location.href = `pago.html?pedido=${encodeURIComponent(order.order_number)}`;
  } catch (err) {
    console.error(err);
    msg.textContent = orderErrorText(err);
    msg.className = 'form-msg error';
    btn.disabled = false;
  }
}

function bindForm() {
  const form = document.getElementById('checkout-form');

  form.addEventListener('submit', e => {
    e.preventDefault();
    submitOrder(form);
  });
  form.addEventListener('change', e => {
    if (e.target.name === 'shipping') { renderSummary(); toggleShipping(form); }
  });
  form.addEventListener('input', e => {
    // un campo marcado con error se limpia en cuanto su valor pasa a ser válido
    if (FIELDS.includes(e.target.name) && e.target.getAttribute('aria-invalid') === 'true'
        && !validateForm(formValues(form))[e.target.name]) {
      e.target.removeAttribute('aria-invalid');
      document.getElementById(`err-${e.target.name}`).textContent = '';
    }
    if (e.target.name === 'notes') {
      document.getElementById('notes-count').textContent = `${e.target.value.length} / 500`;
    }
    // si cambia el código ya aplicado, deja de contar hasta que se vuelva a aplicar
    if (e.target.name === 'discount' && discount && e.target.value.trim().toUpperCase() !== discount.code) {
      discount = null;
      document.getElementById('discount-msg').textContent = '';
      renderSummary();
    }
  });
  form.addEventListener('keydown', e => {
    // Intro en el código aplica el descuento en vez de enviar el pedido
    if (e.key === 'Enter' && e.target.name === 'discount') {
      e.preventDefault();
      applyDiscount(form);
    }
  });
  form.addEventListener('click', e => {
    if (e.target.id === 'apply-discount') applyDiscount(form);
    if (e.target.id === 'remove-discount') {
      discount = null;
      form.elements.discount.value = '';
      document.getElementById('discount-msg').textContent = '';
      renderSummary();
    }
  });
}

(async function init() {
  try {
    lines = getCart();
    if (!lines.length) {
      root.innerHTML = `
        <p class="empty">Tu carrito está vacío.</p>
        <p><a class="btn" href="catalogo.html">Ver el catálogo</a></p>`;
      return;
    }

    // mismo control que el carrito: precio y stock actuales antes de pedir nada
    const [found, shipping] = await Promise.all([
      fetchVariantsByIds(lines.map(l => l.variantId)),
      fetchShippingMethods(),
    ]);
    const variants = new Map(found.map(v => [v.id, v]));
    const priceChanges = refreshFromCatalog(found);
    lines = getCart();

    if (lines.some(l => lineProblem(l, variants.get(l.variantId)))) {
      root.innerHTML = `
        <p class="empty error">Algunos productos de tu carrito ya no están disponibles o no hay stock suficiente.</p>
        <p><a class="btn" href="carrito.html">Revisar el carrito</a></p>`;
      return;
    }
    if (!shipping.length) throw new Error('sin métodos de envío');

    methods = shipping;
    renderForm(priceChanges);
    renderSummary();
    bindForm();
    prefillCheckout(document.getElementById('checkout-form')); // datos de "Mi cuenta" (Pablo)
    toggleShipping(document.getElementById('checkout-form')); // por si el navegador recuerda "punto" al volver atrás

    track(EVENTS.CHECKOUT_STARTED, {
      entityType: 'checkout',
      payload: { subtotal: subtotal(lines), items: lines.length },
    });
  } catch (err) {
    console.error(err);
    root.innerHTML = '<p class="empty error">No se ha podido cargar el checkout. Inténtalo de nuevo en unos segundos.</p>';
  } finally {
    root.removeAttribute('aria-busy');
  }
})();
