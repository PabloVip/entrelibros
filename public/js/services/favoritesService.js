// Favoritos: lista de productos guardada en el navegador (localStorage), como el carrito.
// Solo se guardan los id de producto: nombre, foto, precio y stock se leen siempre del catálogo.
const KEY = 'entrelibros_favorites';
const MAX_FAVORITES = 50; // tope por si alguien llena localStorage a mano
let memoryFavorites = null; // respaldo si el navegador bloquea localStorage

const isId = id => Number.isInteger(id) && id > 0;

/**
 * Ids guardados, del más reciente al más antiguo. localStorage lo puede editar cualquiera:
 * se descarta lo que no sea un id, se quitan repetidos y se guardan como mucho MAX_FAVORITES.
 */
function read() {
  if (memoryFavorites) return memoryFavorites;
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(ids) ? [...new Set(ids.filter(isId))].slice(0, MAX_FAVORITES) : [];
  } catch {
    return [];
  }
}

function write(ids, change = {}) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
    memoryFavorites = null;
  } catch {
    memoryFavorites = ids; // sin localStorage la lista dura mientras la página siga abierta
  }
  // con este aviso la cabecera actualiza el número y la página de favoritos quita la tarjeta
  document.dispatchEvent(new CustomEvent('entrelibros:favorites-changed', { detail: { count: ids.length, ...change } }));
}

export function getFavorites() {
  return [...read()];
}

export function isFavorite(productId) {
  return read().includes(productId);
}

export function count() {
  return read().length;
}

/** Guarda el producto si no estaba y lo quita si estaba. Devuelve true si queda en favoritos. */
export function toggleFavorite(productId) {
  if (!isId(productId)) return false;
  const ids = read();
  const active = !ids.includes(productId);
  // el último guardado va primero; si se pasa del tope, se olvida el más antiguo
  write(active ? [productId, ...ids].slice(0, MAX_FAVORITES) : ids.filter(id => id !== productId), { productId, active });
  return active;
}

/** Quita varios productos de una vez (los que ya no están a la venta). */
export function removeFavorites(productIds) {
  write(read().filter(id => !productIds.includes(id)));
}
