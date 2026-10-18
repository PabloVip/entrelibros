// Portada: temáticas y kits destacados (los de dificultad principiante primero).
import { renderLayout } from '../core/layout.js';
import { fetchThemes, fetchCatalog } from '../repositories/catalogRepository.js';
import { productCard } from '../components/productCard.js';
import { escapeHtml } from '../core/utils.js';

renderLayout();

async function renderThemes() {
  const themes = await fetchThemes();
  document.getElementById('themes').innerHTML = themes.map(t => `
    <a class="theme-tile" href="catalogo.html?tema=${encodeURIComponent(t.slug)}">
      <strong>${escapeHtml(t.name)}</strong>
      <span>${escapeHtml(t.description ?? '')}</span>
    </a>`).join('');
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
