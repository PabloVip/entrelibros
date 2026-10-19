// Cabecera y pie comunes. Cada página llama a renderLayout() al cargar.
import { APP_NAME } from '../config.js';
import { escapeHtml } from './utils.js';
import { langSwitchHtml } from './i18n.js';
import { count as cartCount } from '../services/cartService.js';
import { count as favoritesCount } from '../services/favoritesService.js';
import { HEART } from '../components/icons.js';

const NAV = [
  { id: 'inicio',    href: 'index.html',     label: 'Inicio' },
  { id: 'catalogo',  href: 'catalogo.html',  label: 'Catálogo' },
  { id: 'soporte',   href: 'soporte.html',   label: 'Soporte' },
  { id: 'favoritos', href: 'favoritos.html', label: 'Favoritos' },
  { id: 'carrito',   href: 'carrito.html',   label: 'Carrito' },
];

function navLabel(item) {
  // número de favoritos y de artículos del carrito; si es 0, el CSS lo oculta.
  // En el móvil "Favoritos" se ve como un corazón para que la cabecera quepa en una línea.
  if (item.id === 'favoritos') return `${HEART}<span class="nav-label">${item.label}</span> <span id="fav-count" class="nav-count">${favoritesCount() || ''}</span>`;
  if (item.id === 'carrito')   return `${item.label} <span id="cart-count" class="nav-count">${cartCount() || ''}</span>`;
  return item.label;
}

export function renderLayout() {
  const current = document.body.dataset.page;

  const header = document.getElementById('site-header');
  if (header) {
    header.innerHTML = `
      <div class="container header-inner">
        <a class="logo" href="index.html">${escapeHtml(APP_NAME)}</a>
        <nav aria-label="Principal">
          ${NAV.map(item => `
            <a href="${item.href}" ${item.id === current ? 'aria-current="page"' : ''}>${navLabel(item)}</a>
          `).join('')}
          ${langSwitchHtml()}
        </nav>
      </div>`;
    // cartService y favoritesService avisan cada vez que cambia su lista
    document.addEventListener('entrelibros:cart-changed', e => {
      document.getElementById('cart-count').textContent = e.detail.count || '';
    });
    document.addEventListener('entrelibros:favorites-changed', e => {
      document.getElementById('fav-count').textContent = e.detail.count || '';
    });
    // Al volver con "Atrás", el navegador puede mostrar la página tal como la dejó (caché de páginas):
    // los números se leen otra vez por si el carrito o los favoritos han cambiado en otra página.
    window.addEventListener('pageshow', e => {
      if (!e.persisted) return;
      document.getElementById('cart-count').textContent = cartCount() || '';
      document.getElementById('fav-count').textContent = favoritesCount() || '';
    });
  }

  const footer = document.getElementById('site-footer');
  if (footer) {
    footer.innerHTML = `
      <div class="container">
        <p><strong>${escapeHtml(APP_NAME)}</strong></p>
        <p>Escenas en miniatura para colocar entre tus libros. Tienda ficticia: proyecto de la asignatura
          Soluciones Informáticas para la Empresa (UCAM), ${new Date().getFullYear()}.</p>
        <p><a href="soporte.html">Soporte postventa</a></p>
      </div>`;
  }
}
