// Cabecera del back-office.
import { escapeHtml } from './utils.js';
import { signOut } from './auth.js';

const NAV = [
  { id: 'pedidos', href: 'admin-pedidos.html', label: 'Pedidos' },
  { id: 'eventos', href: 'admin-eventos.html', label: 'Eventos' },
];

export function renderAdminLayout(user) {
  const current = document.body.dataset.page;
  document.getElementById('site-header').innerHTML = `
    <div class="container header-inner">
      <a class="logo" href="admin-pedidos.html">Entrelibros <span class="admin-tag">Back-office</span></a>
      <nav aria-label="Back-office">
        ${NAV.map(i => `<a href="${i.href}" ${i.id === current ? 'aria-current="page"' : ''}>${i.label}</a>`).join('')}
        <a href="index.html">Ver tienda</a>
        <span class="admin-user">${escapeHtml(user?.email ?? '')}</span>
        <button type="button" id="logout" class="link-btn">Cerrar sesión</button>
      </nav>
    </div>`;
  document.getElementById('logout').addEventListener('click', async () => {
    await signOut();
    location.replace('admin.html');
  });
}
