// Estructura del back-office: menú lateral (en el móvil, cabecera con menú desplazable).
import { escapeHtml } from './utils.js';
import { signOut } from './auth.js';
import { langSwitchHtml } from './i18n.js';
import { supabase } from './supabase.js';

// Iconos de trazo (24×24). aria-hidden: el texto del enlace ya dice qué es.
const ICON = {
  panel:     '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  pedidos:   '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>',
  productos: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7 12 12l8.7-5M12 22V12"/>',
  clientes:  '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  soporte:   '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  eventos:   '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  integracion: '<path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7M14 21h7v-7M10 3H3v7"/>',
  ajustes:   '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  tienda:    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[name]}</svg>`;

const NAV = [
  { id: 'panel',     href: 'admin-panel.html',     label: 'Panel' },
  { id: 'pedidos',   href: 'admin-pedidos.html',   label: 'Pedidos' },
  { id: 'productos', href: 'admin-productos.html', label: 'Productos' },
  { id: 'clientes',  href: 'admin-clientes.html',  label: 'Clientes' },
  { id: 'soporte',   href: 'admin-soporte.html',   label: 'Soporte' },
  { id: 'eventos',   href: 'admin-eventos.html',   label: 'Eventos' },
  { id: 'integracion', href: 'admin-integracion.html', label: 'Integración' },
  { id: 'ajustes',   href: 'admin-ajustes.html',   label: 'Ajustes' },
];

export function renderAdminLayout(user) {
  const current = document.body.dataset.page;
  document.body.classList.add('admin-shell');
  document.getElementById('site-header').innerHTML = `
    <div class="admin-side">
      <a class="logo" href="admin-panel.html">Entrelibros <span class="admin-tag">Back-office</span></a>
      <nav class="admin-nav" aria-label="Back-office">
        ${NAV.map(i => `
          <a href="${i.href}" ${i.id === current ? 'aria-current="page"' : ''}>${icon(i.id)}<span>${i.label}</span><span class="nav-count" data-count="${i.id}"></span></a>`).join('')}
      </nav>
      <div class="admin-side-foot">
        <a href="index.html" target="_blank" rel="noopener">${icon('tienda')}<span>Ver tienda</span></a>
        <span class="admin-user" title="${escapeHtml(user?.email ?? '')}">${escapeHtml(user?.email ?? '')}</span>
        <div class="admin-side-actions">
          <button type="button" id="logout" class="link-btn">Cerrar sesión</button>
          ${langSwitchHtml()}
        </div>
      </div>
    </div>`;
  document.getElementById('logout').addEventListener('click', async () => {
    await signOut();
    location.replace('admin.html');
  });
  // en el móvil el menú se desplaza en horizontal: que se vea la sección actual
  const active = document.querySelector('.admin-nav [aria-current]');
  if (active && matchMedia('(max-width: 999px)').matches) {
    active.parentElement.scrollLeft = active.offsetLeft - 16;
  }
  loadBadges();
}

/** Números junto al menú: pedidos por preparar, incidencias pendientes y productos con algo agotado. */
async function loadBadges() {
  const head = { count: 'exact', head: true };
  let results;
  try {
    results = await Promise.all([
      supabase.from('orders').select('id', head).in('status', ['pago_simulado', 'pendiente_preparacion']),
      supabase.from('support_requests').select('id', head).in('status', ['abierta', 'en_curso']),
      supabase.from('admin_products').select('id', head).eq('is_active', true).gt('variants_out', 0),
    ]);
  } catch {
    return; // los números son una ayuda: si fallan, el menú funciona igual
  }
  const [orders, support, stock] = results;
  const set = (id, res, title) => {
    const el = document.querySelector(`[data-count="${id}"]`);
    if (!el || res.error || !res.count) return;
    el.textContent = res.count;
    el.title = title;
  };
  set('pedidos', orders, 'Pedidos por preparar');
  set('soporte', support, 'Incidencias pendientes');
  set('productos', stock, 'Productos con alguna versión agotada');
}
