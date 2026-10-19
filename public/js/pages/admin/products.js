// Listado de productos del back-office: filtros, indicadores, ajuste rápido de stock,
// archivar/publicar y exportación.
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import {
  listAdminProducts, listThemes, listVariantsOf, adjustStock, setProductActive,
} from '../../repositories/adminCatalogRepository.js';
import { TYPE_OPTIONS, stockState } from '../../services/adminCatalogService.js';
import { exportCsv } from '../../services/exportService.js';
import { toast, errorText } from '../../components/toast.js';
import { escapeHtml, money, formatDate } from '../../core/utils.js';

const user = await requireAdmin();
renderAdminLayout(user);

const form  = document.getElementById('product-filters');
const tbody = document.getElementById('products');
let products = [];
const openStock = new Set(); // productos con el ajuste de stock desplegado

form.type.insertAdjacentHTML('beforeend',
  Object.entries(TYPE_OPTIONS).map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join(''));

// filtros desde la URL (enlaces del panel: ?stock=bajo)
const params = new URLSearchParams(location.search);
for (const k of ['q', 'type', 'status', 'stock']) if (params.get(k)) form[k].value = params.get(k);

function filtered() {
  const q = form.q.value.trim().toLowerCase();
  return products.filter(p =>
    (!q || p.name.toLowerCase().includes(q) || (p.name_en ?? '').toLowerCase().includes(q)
        || (p.skus ?? '').toLowerCase().includes(q) || p.slug.includes(q))
    && (!form.type.value || p.product_type === form.type.value)
    && (!form.theme.value || String(p.theme_id) === form.theme.value)
    && (!form.status.value || (form.status.value === 'activo') === p.is_active)
    && (!form.stock.value || (form.stock.value === 'agotado'
      ? Number(p.variants_out) > 0
      : Number(p.variants_out) + Number(p.variants_low) > 0)));
}

function priceRange(p) {
  if (p.min_price == null) return '—';
  return Number(p.min_price) === Number(p.max_price) ? money(p.min_price) : `${money(p.min_price)} – ${money(p.max_price)}`;
}

function row(p) {
  const s = stockState(p.variants_out, p.variants_low, p.total_stock);
  return `
    <tr class="${p.is_active ? '' : 'is-off'}" data-id="${p.id}">
      <td>${p.image_url ? `<img class="thumb" src="${escapeHtml(p.image_url)}" alt="" loading="lazy">` : '<span class="thumb-empty"></span>'}</td>
      <td class="cell-title"><a href="admin-producto.html?id=${p.id}">${escapeHtml(p.name)}</a><br>
        <small>${escapeHtml(p.theme_name ?? 'Universal')} · ${p.variant_count} ${Number(p.variant_count) === 1 ? 'versión' : 'versiones'} · editado ${formatDate(p.updated_at)}</small></td>
      <td>${escapeHtml(TYPE_OPTIONS[p.product_type])}</td>
      <td class="num">${priceRange(p)}</td>
      <td class="num">${p.total_stock}<br><span class="pill ${s.cls}">${s.label}</span></td>
      <td class="num">${p.units_sold}<br><small>${money(p.revenue)}</small></td>
      <td>${p.is_active ? '<span class="pill pill-ok">Visible</span>' : '<span class="pill pill-off">Archivado</span>'}</td>
      <td><div class="row-actions">
        <a class="btn btn-small" href="admin-producto.html?id=${p.id}">Editar</a>
        <button type="button" class="btn btn-small btn-secondary" data-action="stock" aria-expanded="${openStock.has(p.id)}">Stock</button>
        <button type="button" class="btn btn-small btn-plain" data-action="toggle">${p.is_active ? 'Archivar' : 'Publicar'}</button>
        ${p.is_active ? `<a class="btn btn-small btn-plain" href="producto.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Ver</a>` : ''}
      </div></td>
    </tr>
    ${openStock.has(p.id) ? `<tr class="stock-row" data-stock-for="${p.id}"><td></td><td colspan="7">Cargando…</td></tr>` : ''}`;
}

function renderKpis() {
  const active = products.filter(p => p.is_active);
  const out = active.filter(p => Number(p.total_stock) === 0 || Number(p.variants_out) > 0).length;
  const low = active.filter(p => Number(p.variants_low) > 0).length;
  const units = products.reduce((s, p) => s + Number(p.total_stock), 0);
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><span>Productos</span><strong>${products.length}</strong><small>${active.length} visibles · ${products.length - active.length} archivados</small></div>
    <div class="kpi"><span>Unidades en almacén</span><strong>${units}</strong></div>
    <a class="kpi kpi-link" href="?stock=agotado"><span>Con versiones agotadas</span><strong>${out}</strong></a>
    <a class="kpi kpi-link" href="?stock=bajo"><span>Con stock bajo (≤ 5)</span><strong>${low}</strong></a>`;
}

async function renderStockRows() {
  const ids = [...openStock];
  if (!ids.length) return;
  const variants = await listVariantsOf(ids);
  for (const id of ids) {
    const cell = tbody.querySelector(`[data-stock-for="${id}"] td:last-child`);
    if (!cell) continue;
    const mine = variants.filter(v => v.product_id === id);
    cell.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Versión</th><th>SKU</th><th class="num">Stock</th><th><span class="visually-hidden">Guardar</span></th></tr></thead>
        <tbody>${mine.map(v => `
          <tr class="${v.is_active ? '' : 'is-off'}">
            <td>${escapeHtml(v.name)}${v.is_active ? '' : ' <span class="pill pill-off">Inactiva</span>'}</td>
            <td>${escapeHtml(v.sku)}</td>
            <td class="num"><label class="visually-hidden" for="stk-${v.id}">Stock de ${escapeHtml(v.sku)}</label>
              <input id="stk-${v.id}" class="stock-input" type="number" min="0" max="100000" step="1" value="${v.stock}" data-variant="${v.id}" data-old="${v.stock}"></td>
            <td><button type="button" class="btn btn-small" data-save-stock="${v.id}">Guardar</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }
}

function render() {
  const list = filtered();
  document.getElementById('products-count').textContent =
    `${list.length} ${list.length === 1 ? 'producto' : 'productos'}`;
  tbody.innerHTML = list.length ? list.map(row).join('')
    : '<tr><td colspan="8" class="empty">No hay productos con estos filtros.</td></tr>';
  renderStockRows().catch(console.error);
  const q = new URLSearchParams();
  for (const k of ['q', 'type', 'theme', 'status', 'stock']) if (form[k].value) q.set(k, form[k].value);
  history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
}

async function load() {
  try {
    products = await listAdminProducts();
    renderKpis();
    render();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="8" class="empty error">${escapeHtml(errorText(err, 'No se han podido cargar los productos.'))}</td></tr>`;
  }
}

tbody.addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = Number(btn.closest('tr[data-id]')?.dataset.id);

  if (btn.dataset.action === 'stock') {
    openStock.has(id) ? openStock.delete(id) : openStock.add(id);
    render();
    return;
  }
  if (btn.dataset.action === 'toggle') {
    const p = products.find(x => x.id === id);
    btn.disabled = true;
    try {
      await setProductActive(id, !p.is_active);
      toast(p.is_active ? `${p.name}: archivado. Ya no se ve en la tienda.` : `${p.name}: publicado en la tienda.`);
      await load();
    } catch (err) {
      toast(errorText(err), 'error');
      btn.disabled = false;
    }
    return;
  }
  if (btn.dataset.saveStock) {
    const input = document.getElementById(`stk-${btn.dataset.saveStock}`);
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 0 || value > 100000) {
      input.classList.add('invalid');
      toast('El stock debe ser un número entero entre 0 y 100000.', 'error');
      return;
    }
    input.classList.remove('invalid');
    btn.disabled = true;
    try {
      await adjustStock(Number(btn.dataset.saveStock), value, 'Ajuste desde el listado');
      toast(`Stock actualizado: ${input.dataset.old} → ${value}.`);
      await load();
    } catch (err) {
      toast(errorText(err), 'error');
      btn.disabled = false;
    }
  }
});

// Intro en el campo de stock = guardar
tbody.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.stock-input')) {
    e.preventDefault();
    tbody.querySelector(`[data-save-stock="${e.target.dataset.variant}"]`).click();
  }
});

let timer;
form.addEventListener('change', e => { if (e.target.name !== 'q') render(); }); // el buscador ya filtra al escribir
form.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 200); });
form.addEventListener('submit', e => e.preventDefault());

document.getElementById('export-csv').addEventListener('click', () => {
  const rows = filtered().map(p => ({
    id: p.id, slug: p.slug, nombre: p.name, tipo: p.product_type, tematica: p.theme_name ?? '',
    visible: p.is_active ? 'si' : 'no', versiones: p.variant_count, precio_min: p.min_price, precio_max: p.max_price,
    stock: p.total_stock, versiones_agotadas: p.variants_out, unidades_vendidas: p.units_sold, ventas: p.revenue,
    skus: p.skus,
  }));
  exportCsv(rows, Object.keys(rows[0] ?? { id: '' }), `productos-${new Date().toISOString().slice(0, 10)}.csv`);
});

// aviso que deja el editor al eliminar un producto
const flash = sessionStorage.getItem('entrelibros_admin_flash');
if (flash) { sessionStorage.removeItem('entrelibros_admin_flash'); toast(flash); }

listThemes().then(themes => {
  form.theme.insertAdjacentHTML('beforeend',
    themes.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join(''));
  if (params.get('theme')) form.theme.value = params.get('theme');
}).catch(console.error).finally(load);
