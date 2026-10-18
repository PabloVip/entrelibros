// Carrito de la compra: las líneas se guardan en el navegador (localStorage).
// El precio guardado es solo orientativo: al crear el pedido el servidor lo vuelve a leer de la BD.
import { track, EVENTS } from './eventService.js';
import { escapeHtml } from '../core/utils.js';

export const MAX_QTY = 10; // unidades máximas por línea

const KEY = 'entrelibros_cart';
let memoryCart = null; // respaldo si el navegador bloquea localStorage

function isLine(l) {
  return Number.isInteger(l?.variantId) && l.variantId > 0
    && Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= MAX_QTY
    && Number.isFinite(l.unitPrice) && l.unitPrice >= 0;
}

/** Líneas guardadas. Se descarta lo que no tenga forma de línea: localStorage lo puede editar cualquiera. */
function read() {
  if (memoryCart) return memoryCart;
  try {
    const lines = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(lines) ? lines.filter(isLine) : [];
  } catch {
    return [];
  }
}

function write(lines) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
    memoryCart = null;
  } catch {
    memoryCart = lines; // sin localStorage el carrito dura mientras la página siga abierta
  }
  // con este aviso la cabecera actualiza el número del carrito (core/layout.js)
  document.dispatchEvent(new CustomEvent('entrelibros:cart-changed', { detail: { count: count(lines) } }));
}

export function getCart() {
  return read().map(l => ({ ...l }));
}

/** Número de artículos (suma de unidades). */
export function count(lines = read()) {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

/** Subtotal orientativo (los precios ya llevan IVA). */
export function subtotal(lines = read()) {
  return Math.round(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100) / 100;
}

/** Añade unidades de una variante; si ya está, suma sin pasar de MAX_QTY. Devuelve las unidades añadidas. */
export function addItem(item) {
  const qty = Number(item?.quantity);
  if (!Number.isInteger(qty) || qty < 1) return 0;
  const lines = read();
  const existing = lines.find(l => l.variantId === item.variantId);
  const before = existing?.quantity ?? 0;
  const line = {
    variantId: item.variantId, sku: item.sku, quantity: Math.min(before + qty, MAX_QTY),
    productId: item.productId, productSlug: item.productSlug, productName: item.productName,
    variantName: item.variantName, unitPrice: Number(item.unitPrice), image: item.image ?? null,
  };
  if (!isLine(line) || line.quantity === before) return 0;
  write(existing ? lines.map(l => (l === existing ? line : l)) : [...lines, line]);
  return line.quantity - before;
}

/** Cambia la cantidad de una línea (1..MAX_QTY). Devuelve false si no es válida. */
export function updateQuantity(variantId, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) return false;
  const lines = read();
  if (!lines.some(l => l.variantId === variantId)) return false;
  write(lines.map(l => (l.variantId === variantId ? { ...l, quantity } : l)));
  return true;
}

export function removeItem(variantId) {
  write(read().filter(l => l.variantId !== variantId));
}

export function clearCart() {
  write([]);
}

/**
 * Pone en las líneas el precio y los nombres actuales de la BD (el precio guardado puede haber cambiado).
 * Devuelve los cambios de precio, para avisar al cliente.
 */
export function refreshFromCatalog(variants) {
  const byId = new Map(variants.map(v => [v.id, v]));
  const changes = [];
  const lines = read().map(l => {
    const v = byId.get(l.variantId);
    if (!v?.product) return l; // ya no está a la venta: lo indica lineProblem()
    const price = Number(v.price);
    if (price !== l.unitPrice) changes.push({ line: l, before: l.unitPrice, after: price });
    return {
      ...l, unitPrice: price, sku: v.sku, variantName: v.name,
      productId: v.product.id, productSlug: v.product.slug, productName: v.product.name,
    };
  });
  write(lines);
  return changes;
}

/** Motivo por el que una línea no se puede comprar ahora mismo, o null si se puede. */
export function lineProblem(line, variant) {
  if (!variant?.product)             return 'Ya no está a la venta.';
  if (variant.stock === 0)           return 'Agotado.';
  if (line.quantity > variant.stock) return `Solo quedan ${variant.stock} unidades.`;
  return null;
}

// La ficha de producto lanza este evento al pulsar "Añadir al carrito" (pages/product.js).
document.addEventListener('entrelibros:add-to-cart', e => {
  const item = e.detail;
  const added = addItem(item);
  const msg = document.getElementById('buy-msg');

  if (added === 0) {
    const full = read().some(l => l.variantId === item.variantId && l.quantity === MAX_QTY);
    msg.textContent = full
      ? `Ya tienes el máximo de ${MAX_QTY} unidades de esta versión en el carrito.`
      : 'No se ha podido añadir al carrito. Recarga la página e inténtalo de nuevo.';
    msg.className = 'form-msg error';
    return;
  }
  msg.innerHTML = `Añadido al carrito: ${added} × ${escapeHtml(item.productName)} · ${escapeHtml(item.variantName)}.`
    + (added < item.quantity ? ` Has llegado al máximo de ${MAX_QTY} unidades.` : '')
    + ' <a href="carrito.html">Ver carrito</a>';
  msg.className = 'form-msg ok';

  track(EVENTS.CART_ITEM_ADDED, {
    entityType: 'cart',
    entityId: item.variantId,
    payload: { sku: item.sku, quantity: added, unit_price: Number(item.unitPrice) },
  });
});
