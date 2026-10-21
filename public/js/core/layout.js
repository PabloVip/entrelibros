// Cabecera y pie comunes de la tienda. Cada página llama a renderLayout() al cargar.
// El menú principal es una sola <nav>: en el escritorio va en la cabecera y en el móvil el CSS la
// convierte en una barra fija abajo, como en una app (css: .main-nav).
import { APP_NAME } from '../config.js';
import { escapeHtml } from './utils.js';
import { langSwitchHtml } from './i18n.js';
import { themeToggleHtml } from './theme.js';
import './transitions.js'; // la foto de la tarjeta "vuela" hasta la ficha del producto
import './effects.js';     // tarjetas que se inclinan y luz de la portada que sigue al ratón
import { count as cartCount } from '../services/cartService.js';
import { count as favoritesCount } from '../services/favoritesService.js';
import { HEART, USER, HOME, BOOKS, CHAT, BAG } from '../components/icons.js';
import { supabase } from './supabase.js';

const NAV = [
  { id: 'inicio',    href: 'index.html',     label: 'Inicio',    icon: HOME },
  { id: 'catalogo',  href: 'catalogo.html',  label: 'Catálogo',  icon: BOOKS },
  { id: 'soporte',   href: 'soporte.html',   label: 'Soporte',   icon: CHAT },
  { id: 'favoritos', href: 'favoritos.html', label: 'Favoritos', icon: HEART },
  { id: 'carrito',   href: 'carrito.html',   label: 'Carrito',   icon: BAG },
  { id: 'cuenta',    href: 'cuenta.html',    label: 'Mi cuenta', icon: USER },
];

// Logo: los lomos y el hueco de la estantería (el mismo dibujo que img/favicon.svg).
// El hueco (.logo-nook) se enciende de noche y al pasar el ratón (css: .logo-mark).
const LOGO_MARK = `<svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <rect width="64" height="64" rx="14" fill="#10182B"/>
    <rect x="9" y="16" width="7" height="36" rx="1.5" fill="#8E2F3B"/>
    <rect x="17" y="12" width="6" height="40" rx="1.5" fill="#2E5B4F"/>
    <rect x="42" y="13" width="6" height="39" rx="1.5" fill="#3B5A8C"/>
    <rect x="49" y="18" width="7" height="34" rx="1.5" fill="#B8892E"/>
    <rect class="logo-nook" x="25" y="14" width="15" height="38" rx="2"/>
    <g fill="#10182B" opacity=".4"><rect x="28" y="20" width="9" height="11" rx="1"/><rect x="28" y="34" width="4" height="6" rx=".8"/><rect x="33" y="34" width="4" height="6" rx=".8"/></g>
    <rect x="6" y="52" width="52" height="5" rx="1.5" fill="#9C6A42"/>
  </svg>`;

const logo = () => `<a class="logo logo-lamp" href="index.html">${LOGO_MARK}<span>${escapeHtml(APP_NAME)}</span></a>`;

function navItem(item, current) {
  // número de favoritos y de artículos del carrito; si es 0, el CSS lo oculta
  const count = item.id === 'favoritos' ? `<span id="fav-count" class="nav-count">${favoritesCount() || ''}</span>`
    : item.id === 'carrito' ? `<span id="cart-count" class="nav-count">${cartCount() || ''}</span>`
    : '';
  // "Mi cuenta" pasa a "Entrar" si no hay sesión (ver más abajo)
  const labelId = item.id === 'cuenta' ? ' id="account-label"' : '';
  return `
    <a href="${item.href}" data-nav="${item.id}" ${item.id === current ? 'aria-current="page"' : ''}>${item.icon}<span class="nav-label"${labelId}>${item.label}</span>${count}</a>`;
}

export function renderLayout() {
  const current = document.body.dataset.page;
  document.body.classList.add('tienda'); // estilos y efectos solo de la tienda (no del back-office)

  // "Saltar al contenido": primer elemento al que se llega con el tabulador. Quien navega con teclado
  // o lector de pantalla va directo al <main id="contenido"> sin recorrer todo el menú (WCAG 2.4.1).
  // Está fuera de la pantalla y solo aparece cuando recibe el foco (css: .skip-link).
  if (document.getElementById('contenido') && !document.querySelector('.skip-link')) {
    document.body.insertAdjacentHTML('afterbegin', '<a class="skip-link" href="#contenido">Saltar al contenido</a>');
  }

  const header = document.getElementById('site-header');
  if (header) {
    header.classList.add('shop-header');
    header.innerHTML = `
      <div class="container header-inner">
        ${logo()}
        <nav class="main-nav" aria-label="Principal">${NAV.map(item => navItem(item, current)).join('')}
        </nav>
        <div class="tools">
          <a class="tools-support" href="soporte.html" aria-label="Soporte" title="Soporte" ${current === 'soporte' ? 'aria-current="page"' : ''}>${CHAT}</a>
          ${themeToggleHtml()}
          ${langSwitchHtml()}
        </div>
      </div>`;
    // "Entrar" si no hay sesión; "Mi cuenta" si la hay (la sesión de Supabase se lee del navegador)
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) document.getElementById('account-label').textContent = 'Entrar';
    }).catch(() => {});
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
      <div class="container footer-inner">
        <div class="footer-brand">
          ${logo()}
          <p>Escenas en miniatura para colocar entre tus libros.</p>
        </div>
        <nav class="footer-links" aria-label="Pie de página">
          <div>
            <h2 class="footer-title">Tienda</h2>
            <a href="catalogo.html">Catálogo</a>
            <a href="catalogo.html?tipo=kit">Kits completos</a>
            <a href="catalogo.html?tipo=accesorio">Accesorios</a>
            <a href="catalogo.html?tipo=recambio">Recambios</a>
          </div>
          <div>
            <h2 class="footer-title">Ayuda</h2>
            <a href="soporte.html">Soporte postventa</a>
            <a href="pedido.html">Consulta tu pedido</a>
            <a href="cuenta.html">Mi cuenta</a>
            <a href="privacidad.html">Política de privacidad</a>
          </div>
        </nav>
        <p class="footer-note">Tienda ficticia: proyecto de la asignatura Soluciones Informáticas para la Empresa (UCAM), ${new Date().getFullYear()}.</p>
      </div>`;
  }
}
