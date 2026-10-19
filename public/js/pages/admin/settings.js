// Ajustes de la tienda: códigos de descuento, métodos de envío y temáticas.
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import {
  listDiscounts, discountUsage, saveDiscount, listShippingMethods, saveShippingMethod,
  listThemes, saveTheme, deleteTheme, listAdminProducts,
} from '../../repositories/adminCatalogRepository.js';
import { slugify } from '../../services/adminCatalogService.js';
import { toast, errorText } from '../../components/toast.js';
import { escapeHtml, money } from '../../core/utils.js';
import { locale } from '../../core/i18n.js';

const user = await requireAdmin();
renderAdminLayout(user);

const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
const fmtDate = d => (d ? dateFmt.format(new Date(`${d}T00:00:00`)) : '');
const today = new Date().toISOString().slice(0, 10);
const val = v => escapeHtml(v ?? '');

// ---------- Pestañas ----------
const TABS = ['descuentos', 'envios', 'tematicas'];
function showTab(name) {
  for (const t of TABS) {
    document.getElementById(`tab-${t}`).setAttribute('aria-selected', String(t === name));
    document.getElementById(`panel-${t}`).hidden = t !== name;
  }
  history.replaceState(null, '', `#${name}`);
}
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('[role=tab]');
  if (b) showTab(b.id.replace('tab-', ''));
});
document.querySelector('.tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const i = TABS.findIndex(t => document.getElementById(`tab-${t}`).getAttribute('aria-selected') === 'true');
  const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
  showTab(next);
  document.getElementById(`tab-${next}`).focus();
});
showTab(TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'descuentos');

/** Formulario genérico: guarda, avisa y recarga la pestaña. */
function bindForm(form, build, saveFn, reload, okText) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = form.querySelector('.form-msg');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    msg.textContent = 'Guardando…';
    msg.className = 'form-msg';
    try {
      await saveFn(build(new FormData(form)));
      toast(okText);
      await reload();
    } catch (err) {
      console.error(err);
      msg.textContent = errorText(err);
      msg.className = 'form-msg error';
      btn.disabled = false;
    }
  });
  form.querySelector('[data-cancel]')?.addEventListener('click', () => reload());
}

// ---------- Descuentos ----------
const discountsEl = document.getElementById('panel-descuentos');

function discountState(d) {
  if (!d.is_active) return '<span class="pill pill-off">Inactivo</span>';
  if (d.valid_until && d.valid_until < today) return '<span class="pill pill-out">Caducado</span>';
  if (d.valid_from && d.valid_from > today) return '<span class="pill pill-low">Programado</span>';
  return '<span class="pill pill-ok">Activo</span>';
}

function discountForm(d = {}) {
  return `
    <form class="panel settings-form admin-form" id="discount-form" novalidate>
      <h2 class="h3">${d.id ? `Editar ${val(d.code)}` : 'Nuevo código de descuento'}</h2>
      <input type="hidden" name="id" value="${val(d.id)}">
      <div class="form-grid">
        <div class="field"><label for="d-code">Código</label>
          <input id="d-code" name="code" maxlength="20" value="${val(d.code)}" required style="text-transform:uppercase" spellcheck="false">
          <p class="hint">Mayúsculas y números, 3-20. El cliente lo escribe en el checkout.</p></div>
        <div class="field"><label for="d-desc">Descripción</label>
          <input id="d-desc" name="description" maxlength="120" value="${val(d.description)}" required>
          <p class="hint">Se le muestra al cliente al aplicarlo.</p></div>
        <div class="field"><label for="d-type">Tipo</label>
          <select id="d-type" name="discount_type">
            <option value="porcentaje" ${d.discount_type !== 'importe_fijo' ? 'selected' : ''}>Porcentaje (%)</option>
            <option value="importe_fijo" ${d.discount_type === 'importe_fijo' ? 'selected' : ''}>Importe fijo (€)</option>
          </select></div>
        <div class="field"><label for="d-value">Valor</label>
          <input id="d-value" name="value" type="number" min="0.01" max="500" step="0.01" value="${val(d.value)}" required></div>
        <div class="field"><label for="d-min">Pedido mínimo (€)</label>
          <input id="d-min" name="min_subtotal" type="number" min="0" max="10000" step="0.01" value="${val(d.min_subtotal ?? 0)}"></div>
        <div class="field check" style="align-self:end"><input id="d-active" name="is_active" type="checkbox" ${d.is_active !== false ? 'checked' : ''}>
          <label for="d-active">Activo</label></div>
        <div class="field"><label for="d-from">Válido desde</label>
          <input id="d-from" name="valid_from" type="date" value="${val(d.valid_from)}"></div>
        <div class="field"><label for="d-until">Válido hasta</label>
          <input id="d-until" name="valid_until" type="date" value="${val(d.valid_until)}"></div>
      </div>
      <p class="row-actions" style="margin-top:16px"><button type="submit" class="btn">Guardar código</button>
        <button type="button" class="btn btn-plain" data-cancel>Cancelar</button></p>
      <p class="form-msg" role="alert"></p>
    </form>`;
}

async function loadDiscounts(editing) {
  try {
    const [list, usage] = await Promise.all([listDiscounts(), discountUsage()]);
    discountsEl.innerHTML = `
      <div class="page-head"><p class="muted" style="margin:0">Los códigos que el cliente puede aplicar en el checkout. El servidor recalcula el descuento al crear el pedido.</p>
        <button type="button" class="btn" data-new-discount>+ Nuevo código</button></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Código</th><th>Descuento</th><th class="num">Pedido mínimo</th><th>Vigencia</th>
          <th class="num">Usos</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>${list.map(d => {
          const u = usage[d.code] ?? { orders: 0, amount: 0 };
          return `<tr class="${d.is_active ? '' : 'is-off'}">
            <td><strong>${val(d.code)}</strong><br><small>${val(d.description)}</small></td>
            <td>${d.discount_type === 'porcentaje' ? `${Number(d.value)} %` : money(d.value)}</td>
            <td class="num">${Number(d.min_subtotal) ? money(d.min_subtotal) : '—'}</td>
            <td>${d.valid_from || d.valid_until ? `${fmtDate(d.valid_from) || '…'} → ${fmtDate(d.valid_until) || '…'}` : 'Sin límite'}</td>
            <td class="num">${u.orders}<br><small>−${money(u.amount)}</small></td>
            <td>${discountState(d)}</td>
            <td><div class="row-actions"><button type="button" class="btn btn-small" data-edit-discount="${d.id}">Editar</button>
              <button type="button" class="btn btn-small btn-plain" data-toggle-discount="${d.id}">${d.is_active ? 'Desactivar' : 'Activar'}</button></div></td>
          </tr>`;
        }).join('') || '<tr><td colspan="7" class="empty">No hay códigos de descuento.</td></tr>'}</tbody>
      </table></div>
      ${editing !== undefined ? discountForm(list.find(d => d.id === editing) ?? {}) : ''}`;
    const form = document.getElementById('discount-form');
    if (form) {
      bindForm(form, fd => ({
        id: fd.get('id'), code: fd.get('code').trim().toUpperCase(), description: fd.get('description'),
        discount_type: fd.get('discount_type'), value: fd.get('value'), min_subtotal: fd.get('min_subtotal'),
        valid_from: fd.get('valid_from'), valid_until: fd.get('valid_until'), is_active: fd.get('is_active') === 'on',
      }), saveDiscount, () => loadDiscounts(), 'Código de descuento guardado.');
      form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      form.querySelector('input:not([type=hidden])').focus({ preventScroll: true });
    }
    discountsEl.onclick = async e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.newDiscount !== undefined) loadDiscounts(null);
      if (b.dataset.editDiscount) loadDiscounts(Number(b.dataset.editDiscount));
      if (b.dataset.toggleDiscount) {
        const d = list.find(x => x.id === Number(b.dataset.toggleDiscount));
        b.disabled = true;
        try {
          await saveDiscount({ ...d, is_active: !d.is_active });
          toast(`${d.code}: ${d.is_active ? 'desactivado' : 'activado'}.`);
          loadDiscounts();
        } catch (err) { toast(errorText(err), 'error'); b.disabled = false; }
      }
    };
  } catch (err) {
    console.error(err);
    discountsEl.innerHTML = `<p class="empty error">${escapeHtml(errorText(err, 'No se han podido cargar los descuentos.'))}</p>`;
  }
}

// ---------- Envíos ----------
const shippingEl = document.getElementById('panel-envios');

function shippingForm(m = {}) {
  return `
    <form class="panel settings-form admin-form" id="shipping-form" novalidate>
      <h2 class="h3">${m.id ? `Editar ${val(m.name)}` : 'Nuevo método de envío'}</h2>
      <input type="hidden" name="id" value="${val(m.id)}">
      <div class="form-grid">
        <div class="field"><label for="s-name">Nombre</label>
          <input id="s-name" name="name" maxlength="80" value="${val(m.name)}" required></div>
        <div class="field"><label for="s-code">Código interno</label>
          <input id="s-code" name="code" maxlength="20" value="${val(m.code)}" required spellcheck="false">
          <p class="hint">Minúsculas y guiones bajos, p. ej. <code>express</code>.</p></div>
        <div class="field"><label for="s-price">Precio (€)</label>
          <input id="s-price" name="price" type="number" min="0" max="100" step="0.01" value="${val(m.price)}" required></div>
        <div class="field"><label for="s-free">Gratis a partir de (€)</label>
          <input id="s-free" name="free_from" type="number" min="1" max="10000" step="0.01" value="${val(m.free_from)}">
          <p class="hint">Vacío: nunca es gratis.</p></div>
        <div class="field"><label for="s-min">Plazo mínimo (días laborables)</label>
          <input id="s-min" name="eta_days_min" type="number" min="1" max="30" step="1" value="${val(m.eta_days_min ?? 3)}" required></div>
        <div class="field"><label for="s-max">Plazo máximo (días laborables)</label>
          <input id="s-max" name="eta_days_max" type="number" min="1" max="60" step="1" value="${val(m.eta_days_max ?? 5)}" required></div>
        <div class="field check"><input id="s-active" name="is_active" type="checkbox" ${m.is_active !== false ? 'checked' : ''}>
          <label for="s-active">Disponible en el checkout</label></div>
      </div>
      <p class="row-actions" style="margin-top:16px"><button type="submit" class="btn">Guardar método</button>
        <button type="button" class="btn btn-plain" data-cancel>Cancelar</button></p>
      <p class="form-msg" role="alert"></p>
    </form>`;
}

async function loadShipping(editing) {
  try {
    const list = await listShippingMethods();
    shippingEl.innerHTML = `
      <div class="page-head"><p class="muted" style="margin:0">Opciones de envío del checkout. Los pedidos ya creados conservan el precio con el que se hicieron.</p>
        <button type="button" class="btn" data-new-shipping>+ Nuevo método</button></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Método</th><th class="num">Precio</th><th class="num">Gratis desde</th><th>Plazo</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>${list.map(m => `
          <tr class="${m.is_active ? '' : 'is-off'}">
            <td><strong>${val(m.name)}</strong><br><small>${val(m.code)}</small></td>
            <td class="num">${money(m.price)}</td>
            <td class="num">${m.free_from ? money(m.free_from) : '—'}</td>
            <td>${m.eta_days_min}-${m.eta_days_max} días laborables</td>
            <td>${m.is_active ? '<span class="pill pill-ok">Activo</span>' : '<span class="pill pill-off">Inactivo</span>'}</td>
            <td><div class="row-actions"><button type="button" class="btn btn-small" data-edit-shipping="${m.id}">Editar</button></div></td>
          </tr>`).join('')}</tbody>
      </table></div>
      ${editing !== undefined ? shippingForm(list.find(m => m.id === editing) ?? {}) : ''}`;
    const form = document.getElementById('shipping-form');
    if (form) {
      const name = form.elements.name, code = form.elements.code;
      if (!code.value) name.addEventListener('input', () => { code.value = slugify(name.value).replace(/-/g, '_').slice(0, 20); });
      bindForm(form, fd => ({
        id: fd.get('id'), code: fd.get('code').trim(), name: fd.get('name'), price: fd.get('price'),
        free_from: fd.get('free_from'), eta_days_min: fd.get('eta_days_min'), eta_days_max: fd.get('eta_days_max'),
        is_active: fd.get('is_active') === 'on',
      }), saveShippingMethod, () => loadShipping(), 'Método de envío guardado.');
      form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      name.focus({ preventScroll: true });
    }
    shippingEl.onclick = e => {
      const b = e.target.closest('button');
      if (b?.dataset.newShipping !== undefined) loadShipping(null);
      if (b?.dataset.editShipping) loadShipping(Number(b.dataset.editShipping));
    };
  } catch (err) {
    console.error(err);
    shippingEl.innerHTML = `<p class="empty error">${escapeHtml(errorText(err, 'No se han podido cargar los envíos.'))}</p>`;
  }
}

// ---------- Temáticas ----------
const themesEl = document.getElementById('panel-tematicas');

function themeForm(t = {}) {
  return `
    <form class="panel settings-form admin-form" id="theme-form" novalidate>
      <h2 class="h3">${t.id ? `Editar ${val(t.name)}` : 'Nueva temática'}</h2>
      <input type="hidden" name="id" value="${val(t.id)}">
      <div class="form-grid">
        <div class="field"><label for="t-name">Nombre</label>
          <input id="t-name" name="name" maxlength="60" value="${val(t.name)}" required></div>
        <div class="field"><label for="t-slug">Slug</label>
          <input id="t-slug" name="slug" maxlength="40" value="${val(t.slug)}" required spellcheck="false">
          <p class="hint">Aparece en la dirección del catálogo filtrado.</p></div>
        <div class="field full"><label for="t-desc">Descripción</label>
          <input id="t-desc" name="description" maxlength="200" value="${val(t.description)}"></div>
        <div class="field"><label for="t-name-en">Nombre (EN)</label>
          <input id="t-name-en" name="name_en" maxlength="60" value="${val(t.name_en)}" lang="en"></div>
        <div class="field"><label for="t-order">Orden</label>
          <input id="t-order" name="sort_order" type="number" min="0" max="999" step="1" value="${val(t.sort_order ?? 0)}"></div>
        <div class="field full"><label for="t-desc-en">Descripción (EN)</label>
          <input id="t-desc-en" name="description_en" maxlength="200" value="${val(t.description_en)}" lang="en"></div>
      </div>
      <p class="row-actions" style="margin-top:16px"><button type="submit" class="btn">Guardar temática</button>
        <button type="button" class="btn btn-plain" data-cancel>Cancelar</button></p>
      <p class="form-msg" role="alert"></p>
    </form>`;
}

async function loadThemes(editing) {
  try {
    const [list, products] = await Promise.all([listThemes(), listAdminProducts()]);
    const count = id => products.filter(p => p.theme_id === id).length;
    themesEl.innerHTML = `
      <div class="page-head"><p class="muted" style="margin:0">Las temáticas agrupan el catálogo y aparecen en la portada y en los filtros.</p>
        <button type="button" class="btn" data-new-theme>+ Nueva temática</button></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th class="num">Orden</th><th>Temática</th><th>Slug</th><th class="num">Productos</th><th>Acciones</th></tr></thead>
        <tbody>${list.map(t => `
          <tr>
            <td class="num">${t.sort_order}</td>
            <td><strong>${val(t.name)}</strong>${t.name_en ? ` <small>· ${val(t.name_en)}</small>` : ''}<br><small>${val(t.description)}</small></td>
            <td><code>${val(t.slug)}</code></td>
            <td class="num"><a href="admin-productos.html?theme=${t.id}">${count(t.id)}</a></td>
            <td><div class="row-actions"><button type="button" class="btn btn-small" data-edit-theme="${t.id}">Editar</button>
              ${count(t.id) ? '' : `<button type="button" class="btn btn-small btn-plain" data-delete-theme="${t.id}">Eliminar</button>`}</div></td>
          </tr>`).join('')}</tbody>
      </table></div>
      ${editing !== undefined ? themeForm(list.find(t => t.id === editing) ?? {}) : ''}`;
    const form = document.getElementById('theme-form');
    if (form) {
      const name = form.elements.name, slug = form.elements.slug;
      if (!slug.value) name.addEventListener('input', () => { slug.value = slugify(name.value).slice(0, 40); });
      bindForm(form, fd => ({
        id: fd.get('id'), name: fd.get('name'), slug: fd.get('slug').trim(), description: fd.get('description'),
        name_en: fd.get('name_en'), description_en: fd.get('description_en'), sort_order: fd.get('sort_order'),
      }), saveTheme, () => loadThemes(), 'Temática guardada.');
      form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      name.focus({ preventScroll: true });
    }
    themesEl.onclick = async e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.newTheme !== undefined) loadThemes(null);
      if (b.dataset.editTheme) loadThemes(Number(b.dataset.editTheme));
      if (b.dataset.deleteTheme) {
        if (b.dataset.confirm !== '1') { // segundo clic para confirmar
          b.dataset.confirm = '1';
          b.textContent = '¿Seguro? Pulsa otra vez';
          b.classList.add('btn-danger');
          return;
        }
        b.disabled = true;
        try {
          await deleteTheme(Number(b.dataset.deleteTheme));
          toast('Temática eliminada.');
          loadThemes();
        } catch (err) { toast(errorText(err), 'error'); b.disabled = false; }
      }
    };
  } catch (err) {
    console.error(err);
    themesEl.innerHTML = `<p class="empty error">${escapeHtml(errorText(err, 'No se han podido cargar las temáticas.'))}</p>`;
  }
}

loadDiscounts();
loadShipping();
loadThemes();
