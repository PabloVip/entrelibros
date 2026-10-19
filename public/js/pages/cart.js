// Carrito: líneas guardadas en el navegador, revisadas con el precio y el stock actuales de la BD.
import { renderLayout } from '../core/layout.js';
import { fetchVariantsByIds } from '../repositories/catalogRepository.js';
import { fetchShippingMethods } from '../repositories/checkoutRepository.js';
import {
  getCart, updateQuantity, removeItem, refreshFromCatalog, lineProblem, subtotal, MAX_QTY,
} from '../services/cartService.js';
import { freeShippingGoals } from '../services/checkoutService.js';
import { escapeHtml, money } from '../core/utils.js';

renderLayout();

const root = document.getElementById('cart');
const msg  = document.getElementById('cart-msg');
let variants = new Map(); // variantId → variante con el precio y el stock actuales
let priceChanges = [];
let shippingMethods = []; // para la barra de envío gratis (si no cargan, el carrito funciona igual)

function say(text, type = '') {
  msg.textContent = text;
  msg.className = `form-msg ${type}`;
}

/** Unidades que se pueden pedir de una línea: 0 si está agotada o ya no está a la venta. */
function maxQty(line) {
  const v = variants.get(line.variantId);
  return v?.product ? Math.min(MAX_QTY, v.stock) : 0;
}

function lineRow(line) {
  const problem = lineProblem(line, variants.get(line.variantId));
  const max = maxQty(line);
  const href = `producto.html?slug=${encodeURIComponent(line.productSlug)}`;
  return `
    <tr>
      <td>
        <div class="cart-item">
          ${line.image ? `<img src="${escapeHtml(line.image)}" alt="" width="64" height="67">` : ''}
          <div>
            <a href="${href}">${escapeHtml(line.productName)}</a><br>
            <small>${escapeHtml(line.variantName)} · ${escapeHtml(line.sku)}</small>
            ${problem ? `<p class="line-problem">${escapeHtml(problem)}</p>` : ''}
          </div>
        </div>
      </td>
      <td class="num hide-sm">${money(line.unitPrice)}</td>
      <td class="num">
        <label for="qty-${line.variantId}" class="visually-hidden">Cantidad de ${escapeHtml(line.productName)}</label>
        <input id="qty-${line.variantId}" class="cart-qty" type="number" min="1" max="${max}" value="${line.quantity}"
               inputmode="numeric" data-variant="${line.variantId}" ${max === 0 ? 'disabled' : ''}>
      </td>
      <td class="num">${max === 0 ? '—' : money(line.unitPrice * line.quantity)}</td>
      <td class="num">
        <button type="button" class="link-btn" data-remove="${line.variantId}">Eliminar<span class="visually-hidden"> ${escapeHtml(line.productName)}</span></button>
      </td>
    </tr>`;
}

/**
 * Cuánto falta para el envío gratis de cada método (una barra por método).
 * Anima a completar el pedido sin esperar al checkout; los umbrales salen de shipping_methods.
 */
function freeShippingHtml(sub) {
  const goals = freeShippingGoals(shippingMethods, sub);
  if (!goals.length) return '';
  return `
    <div class="free-ship">
      <p class="free-ship-title">Envío gratis</p>
      <ul class="plain">${goals.map(g => `
        <li class="${g.missing === 0 ? 'is-free' : ''}">
          <span>${escapeHtml(g.name)}</span>
          <span class="free-ship-state">${g.missing === 0 ? 'Gratis' : `Te faltan ${money(g.missing)}`}</span>
          <span class="free-ship-bar" aria-hidden="true"><span style="width: ${Math.round(g.progress * 100)}%"></span></span>
        </li>`).join('')}
      </ul>
      <p class="muted small">Se cuenta el importe después de aplicar los descuentos.</p>
    </div>`;
}

function render() {
  const lines = getCart();
  if (!lines.length) {
    root.innerHTML = `
      <p class="empty">Tu carrito está vacío.</p>
      <p><a class="btn" href="catalogo.html">Ver el catálogo</a></p>`;
    return;
  }

  // lo agotado o retirado no suma en el subtotal, y con cualquier problema no se deja tramitar el pedido
  const blocked = lines.some(l => lineProblem(l, variants.get(l.variantId)));
  const sub = subtotal(lines.filter(l => maxQty(l) > 0));

  root.innerHTML = `
    ${priceChanges.length ? `
      <div class="note">
        <strong>Han cambiado algunos precios</strong> desde que añadiste los productos:
        <ul>${priceChanges.map(c => `
          <li>${escapeHtml(c.line.productName)} · ${escapeHtml(c.line.variantName)}: ${money(c.before)} → ${money(c.after)}</li>`).join('')}
        </ul>
      </div>` : ''}

    <div class="cart-layout">
      <div class="table-wrap">
        <table class="data-table cart-table">
          <caption class="visually-hidden">Productos del carrito</caption>
          <thead><tr>
            <th>Producto</th><th class="num hide-sm">Precio</th><th class="num">Uds.</th><th class="num">Importe</th>
            <th><span class="visually-hidden">Acciones</span></th>
          </tr></thead>
          <tbody>${lines.map(lineRow).join('')}</tbody>
        </table>
      </div>

      <aside class="panel cart-summary" aria-label="Resumen del carrito">
        <h2 class="h3">Resumen</h2>
        <p class="cart-subtotal"><span>Subtotal</span> <strong>${money(sub)}</strong></p>
        <p class="muted">IVA incluido. Los gastos de envío y los descuentos se calculan en el checkout.</p>
        ${freeShippingHtml(sub)}
        ${blocked
          ? `<p class="form-msg error">Revisa los productos marcados para poder tramitar el pedido.</p>
             <button type="button" class="btn" disabled>Tramitar pedido</button>`
          : '<a class="btn" href="checkout.html">Tramitar pedido</a>'}
        <a href="catalogo.html">Seguir comprando</a>
      </aside>
    </div>`;
}

root.addEventListener('change', e => {
  const input = e.target.closest('input[data-variant]');
  if (!input) return;
  const id = Number(input.dataset.variant);
  const n = Number(input.value);
  if (!Number.isInteger(n) || n < 1 || n > Number(input.max)) {
    say(`Indica una cantidad entre 1 y ${input.max}.`, 'error');
    input.value = getCart().find(l => l.variantId === id)?.quantity ?? 1;
    return;
  }
  updateQuantity(id, n);
  say('');
  render();
  document.getElementById(`qty-${id}`)?.focus(); // render() rehace la tabla: se devuelve el foco
});

root.addEventListener('click', e => {
  const btn = e.target.closest('button[data-remove]');
  if (!btn) return;
  const id = Number(btn.dataset.remove);
  const line = getCart().find(l => l.variantId === id);
  removeItem(id);
  priceChanges = priceChanges.filter(c => c.line.variantId !== id);
  render();
  if (line) say(`Has eliminado ${line.productName} (${line.variantName}) del carrito.`, 'ok');
});

(async function init() {
  try {
    const lines = getCart();
    if (lines.length) {
      // los métodos de envío se piden a la vez que las variantes; si fallan, el carrito sale sin la barra
      const [found, methods] = await Promise.all([
        fetchVariantsByIds(lines.map(l => l.variantId)),
        fetchShippingMethods().catch(err => { console.warn('[envío gratis]', err); return []; }),
      ]);
      shippingMethods = methods;
      variants = new Map(found.map(v => [v.id, v]));
      priceChanges = refreshFromCatalog(found);
    }
    render();
  } catch (err) {
    console.error(err);
    root.innerHTML = '<p class="empty error">No se ha podido comprobar el precio y el stock del carrito. Inténtalo de nuevo en unos segundos.</p>';
  } finally {
    root.removeAttribute('aria-busy');
  }
})();
