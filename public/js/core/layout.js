// Cabecera y pie comunes. Cada página llama a renderLayout() al cargar.
import { APP_NAME } from '../config.js';
import { escapeHtml } from './utils.js';
import { count as cartCount } from '../services/cartService.js';

const NAV = [
  { id: 'inicio',   href: 'index.html',    label: 'Inicio' },
  { id: 'catalogo', href: 'catalogo.html', label: 'Catálogo' },
  { id: 'soporte',  href: 'soporte.html',  label: 'Soporte' },
  { id: 'carrito',  href: 'carrito.html',  label: 'Carrito' },
];

function navLabel(item) {
  if (item.id !== 'carrito') return item.label;
  // número de artículos del carrito; si está vacío, el CSS lo oculta
  return `${item.label} <span id="cart-count" class="cart-count">${cartCount() || ''}</span>`;
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
        </nav>
      </div>`;
    // cartService avisa cada vez que cambia el carrito
    document.addEventListener('entrelibros:cart-changed', e => {
      document.getElementById('cart-count').textContent = e.detail.count || '';
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
