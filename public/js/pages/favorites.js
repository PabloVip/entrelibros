// Favoritos: productos guardados en el navegador, pintados con los datos actuales del catálogo.
import { renderLayout } from '../core/layout.js';
import { fetchCatalogByIds } from '../repositories/catalogRepository.js';
import { getFavorites, removeFavorites } from '../services/favoritesService.js';
import { productCard } from '../components/productCard.js';

renderLayout();

const root = document.getElementById('favorites');
const msg  = document.getElementById('fav-msg');
let products = new Map(); // id → producto pintado (para el mensaje al quitarlo)

function say(text, type = '') {
  msg.textContent = text;
  msg.className = `form-msg ${type}`;
}

function renderEmpty() {
  root.innerHTML = `
    <p class="empty">Todavía no has guardado ningún producto. Pulsa el corazón de cualquier producto para guardarlo aquí.</p>
    <p><a class="btn" href="catalogo.html">Ver el catálogo</a></p>`;
}

// Al quitar un favorito desde esta página (corazón de la tarjeta), su tarjeta desaparece.
document.addEventListener('entrelibros:favorites-changed', e => {
  if (e.detail.active !== false) return; // solo cuando se quita un producto con su corazón
  const card = root.querySelector(`button[data-fav="${e.detail.productId}"]`)?.closest('.card');
  if (!card) return;
  const hadFocus = card.contains(document.activeElement);
  const next = card.nextElementSibling ?? card.previousElementSibling; // tarjeta vecina
  // con el nombre de la BD (en español): si la web está en inglés, i18n.js traduce el mensaje entero
  say(`Has quitado ${products.get(e.detail.productId).name} de tus favoritos.`, 'ok');
  card.remove();
  if (!next) renderEmpty();
  // con teclado, el foco pasa al corazón de la tarjeta vecina (o al enlace del catálogo) en vez de perderse
  if (hadFocus) (next?.querySelector('button[data-fav]') ?? root.querySelector('a')).focus();
});

async function load() {
  say('');
  try {
    const ids = getFavorites();
    if (!ids.length) return renderEmpty();
    const byId = new Map((await fetchCatalogByIds(ids)).map(item => [item.id, item]));

    // lo que ya no está a la venta no llega en la consulta: se quita de la lista y se avisa
    const gone = ids.filter(id => !byId.has(id));
    if (gone.length) {
      removeFavorites(gone);
      say(gone.length === 1
        ? 'Hemos quitado de tu lista 1 producto que ya no está a la venta.'
        : `Hemos quitado de tu lista ${gone.length} productos que ya no están a la venta.`);
    }

    const items = ids.filter(id => byId.has(id)).map(id => byId.get(id)); // el último guardado, primero
    products = byId;
    if (!items.length) return renderEmpty();
    root.innerHTML = `<div class="grid">${items.map(productCard).join('')}</div>`;
  } catch (err) {
    console.error(err);
    root.innerHTML = '<p class="empty error">No se han podido cargar tus favoritos. Inténtalo de nuevo en unos segundos.</p>';
  } finally {
    root.removeAttribute('aria-busy');
  }
}

load();
// Al volver con "Atrás" la página puede salir de la caché del navegador tal como estaba:
// se vuelve a cargar la lista por si se ha guardado o quitado algún producto en otra página.
window.addEventListener('pageshow', e => { if (e.persisted) load(); });
