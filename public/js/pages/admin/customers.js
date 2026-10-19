// Clientes: pedidos, gasto, ticket medio y último pedido de cada uno.
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import { listCustomers } from '../../repositories/adminReportsRepository.js';
import { PAID_STATUSES } from '../../services/adminCatalogService.js';
import { exportCsv } from '../../services/exportService.js';
import { errorText } from '../../components/toast.js';
import { escapeHtml, money, formatDate } from '../../core/utils.js';

const user = await requireAdmin();
renderAdminLayout(user);

const form  = document.getElementById('customer-filters');
const tbody = document.getElementById('customers');
let customers = [];

function enrich(c) {
  const paid = c.orders.filter(o => PAID_STATUSES.includes(o.status));
  const spent = paid.reduce((s, o) => s + Number(o.total), 0);
  const last = [...c.orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] ?? null;
  return { ...c, ordersCount: c.orders.length, paidCount: paid.length, spent, avg: paid.length ? spent / paid.length : 0, last };
}

function filtered() {
  const q = form.q.value.trim().toLowerCase();
  const list = customers.filter(c => !q || c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  const by = {
    recientes: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    gasto: (a, b) => b.spent - a.spent,
    pedidos: (a, b) => b.ordersCount - a.ordersCount,
    ultimo: (a, b) => new Date(b.last?.created_at ?? 0) - new Date(a.last?.created_at ?? 0),
  }[form.sort.value];
  return list.sort(by);
}

function render() {
  const list = filtered();
  document.getElementById('customers-count').textContent = `${list.length} ${list.length === 1 ? 'cliente' : 'clientes'}`;
  tbody.innerHTML = list.length ? list.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.full_name)}</strong><br>
        <a href="admin-pedidos.html?q=${encodeURIComponent(c.email)}">${escapeHtml(c.email)}</a></td>
      <td>${escapeHtml(c.phone ?? '—')}</td>
      <td class="num">${c.ordersCount}${c.ordersCount !== c.paidCount ? `<br><small>${c.paidCount} pagados</small>` : ''}</td>
      <td class="num">${money(c.spent)}</td>
      <td class="num">${c.paidCount ? money(c.avg) : '—'}</td>
      <td>${c.last ? `<a href="admin-pedido.html?id=${c.last.id}">${escapeHtml(c.last.order_number)}</a><br><small>${formatDate(c.last.created_at)}</small>` : '—'}</td>
      <td>${formatDate(c.created_at)}</td>
    </tr>`).join('')
    : '<tr><td colspan="7" class="empty">No hay clientes con estos filtros.</td></tr>';
}

function renderKpis() {
  const buyers = customers.filter(c => c.paidCount > 0);
  const repeat = customers.filter(c => c.paidCount > 1).length;
  const spent = buyers.reduce((s, c) => s + c.spent, 0);
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><span>Clientes</span><strong>${customers.length}</strong></div>
    <div class="kpi"><span>Con compras pagadas</span><strong>${buyers.length}</strong></div>
    <div class="kpi"><span>Repiten (2+ pedidos)</span><strong>${repeat}</strong></div>
    <div class="kpi"><span>Gasto medio por cliente</span><strong>${money(buyers.length ? spent / buyers.length : 0)}</strong></div>`;
}

try {
  customers = (await listCustomers()).map(enrich);
  renderKpis();
  render();
} catch (err) {
  console.error(err);
  tbody.innerHTML = `<tr><td colspan="7" class="empty error">${escapeHtml(errorText(err, 'No se han podido cargar los clientes.'))}</td></tr>`;
}

let timer;
form.addEventListener('change', e => { if (e.target.name !== 'q') render(); }); // el buscador ya filtra al escribir
form.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 200); });
form.addEventListener('submit', e => e.preventDefault());

document.getElementById('export-csv').addEventListener('click', () => {
  const rows = filtered().map(c => ({
    id: c.id, nombre: c.full_name, email: c.email, telefono: c.phone ?? '', pedidos: c.ordersCount,
    pedidos_pagados: c.paidCount, gasto: c.spent.toFixed(2), ticket_medio: c.avg.toFixed(2),
    ultimo_pedido: c.last?.order_number ?? '', alta: c.created_at,
  }));
  exportCsv(rows, Object.keys(rows[0] ?? { id: '' }), `clientes-${new Date().toISOString().slice(0, 10)}.csv`);
});
