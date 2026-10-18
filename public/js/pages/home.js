// Portada: temáticas y kits destacados (los de dificultad principiante primero).
import { renderLayout } from '../core/layout.js';
import { fetchThemes, fetchCatalog } from '../repositories/catalogRepository.js';
import { productCard } from '../components/productCard.js';
import { escapeHtml } from '../core/utils.js';

renderLayout();

// Foto que representa cada temática en la portada (decisión de presentación, no de datos)
const THEME_PHOTO = {
  'calle-japonesa': 'callejon-kioto-sakura',
  'biblioteca':     'biblioteca-infinita',
  'cafeteria':      'libreria-esquina-lluvia',
  'fantasia':       'torre-del-dragon',
  'ciudad-europea': 'callejon-praga',
  'misterio':       'despacho-detective-victoriano',
};

async function renderThemes() {
  const themes = await fetchThemes();
  document.getElementById('themes').innerHTML = themes.map(t => {
    const photo = THEME_PHOTO[t.slug];
    return `
    <a class="theme-tile" href="catalogo.html?tema=${encodeURIComponent(t.slug)}">
      ${photo ? `<img src="img/productos/${photo}.jpg" alt="" loading="lazy" width="400" height="300">` : ''}
      <span class="theme-text">
        <strong>${escapeHtml(t.name)}</strong>
        <span>${escapeHtml(t.description ?? '')}</span>
      </span>
    </a>`;
  }).join('');
}

async function renderFeatured() {
  const { items } = await fetchCatalog({ type: 'kit', sort: 'precio_asc', limit: 4 });
  document.getElementById('featured').innerHTML = items.map(productCard).join('');
}

Promise.all([renderThemes(), renderFeatured()]).catch(err => {
  console.error(err);
  document.getElementById('featured').innerHTML =
    '<p class="empty error">No se ha podido conectar con la tienda. Inténtalo de nuevo en unos segundos.</p>';
});
