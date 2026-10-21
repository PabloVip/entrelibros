// Botón de corazón para guardar un producto en favoritos (tarjetas y ficha de producto).
// Al importar este módulo se registra UN solo listener de clic para todos los corazones de la página
// (delegación de eventos): vale también para las tarjetas que se pintan después, por ejemplo al
// cambiar los filtros del catálogo.
import { isFavorite, toggleFavorite } from '../services/favoritesService.js';
import { track, EVENTS } from '../services/eventService.js';
import { escapeHtml } from '../core/utils.js';
import { HEART } from './icons.js';

/** aria-pressed dice a los lectores de pantalla si el producto está guardado; el CSS rellena el corazón. */
export function favoriteButton(product) {
  return `
    <button type="button" class="fav-btn" data-fav="${escapeHtml(product.id)}" data-slug="${escapeHtml(product.slug)}"
            aria-pressed="${isFavorite(product.id)}">${HEART}<span class="visually-hidden">Guardar en favoritos: ${escapeHtml(product.name)}</span></button>`;
}

/** Pone cada corazón de la página como dice la lista guardada. */
function syncButtons() {
  document.querySelectorAll('button[data-fav]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(isFavorite(Number(btn.dataset.fav))));
  });
}

document.addEventListener('click', e => {
  const btn = e.target.closest('button[data-fav]');
  if (!btn) return;
  const productId = Number(btn.dataset.fav);
  const active = toggleFavorite(productId);
  syncButtons();
  // latido del corazón al guardarlo (css: .fav-btn.pop); se quita al acabar para poder repetirlo
  if (active) {
    btn.classList.remove('pop');
    void btn.offsetWidth; // fuerza al navegador a "olvidar" la animación anterior antes de volver a ponerla
    btn.classList.add('pop');
    btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
  }
  // como en el carrito, solo se registra lo que se añade
  if (active) {
    track(EVENTS.WISHLIST_ITEM_ADDED, { entityType: 'product', entityId: productId, payload: { slug: btn.dataset.slug } });
  }
});

// Al volver con "Atrás", el navegador puede mostrar la página tal como la dejó (caché de páginas):
// se repasan los corazones por si la lista ha cambiado en otra página.
window.addEventListener('pageshow', e => { if (e.persisted) syncButtons(); });
