// Editor de producto del back-office: alta, edición, duplicado y borrado.
// admin-producto.html            → producto nuevo
// admin-producto.html?id=7       → editar
// admin-producto.html?duplicar=7 → nuevo a partir de otro
import { requireAdmin } from '../../core/auth.js';
import { renderAdminLayout } from '../../core/adminLayout.js';
import {
  getProductForEdit, productHasOrders, listKits, listThemes, saveProduct, deleteProduct, uploadProductImage,
} from '../../repositories/adminCatalogRepository.js';
import {
  TYPE_OPTIONS, DIFFICULTY_OPTIONS, slugify, suggestSku, validateProduct, prepareImage,
  skuBase, skuPart, defaultHex,
} from '../../services/adminCatalogService.js';
import { toast, errorText } from '../../components/toast.js';
import { escapeHtml, money, formatDate, param } from '../../core/utils.js';

const user = await requireAdmin();
renderAdminLayout(user);

const root = document.getElementById('editor-root');
const opt = (value, label, selected) =>
  `<option value="${escapeHtml(value)}" ${String(value) === String(selected ?? '') ? 'selected' : ''}>${escapeHtml(label)}</option>`;

let state;          // lo que hay en el formulario
let saved = '';     // copia del último guardado (para avisar de cambios sin guardar)
let themes = [];
let kits = [];
let stats = null;   // ventas del producto (null si es nuevo)
let errors = {};
let slugTouched = false;
let confirmingDelete = false;

function emptyVariant(i) {
  return { id: null, name: i === 0 ? 'Estándar' : '', name_en: '', sku: '', price: '', stock: 0,
           has_lighting: false, is_default: i === 0, is_active: true,
           color: '', color_en: '', color_hex: '#999999', size: '', size_en: '' };
}

// Variantes por color y/o tamaño (state.opts). Solo es para el formulario: no se envía.
const usesOptions = () => state.opts.color || state.opts.size;
const distinct = list => [...new Set(list.map(x => x.trim()).filter(Boolean))];
const colorsInUse = () => (state.opts.color ? distinct(state.variants.map(v => v.color)) : []);
const sizesInUse = () => (state.opts.size ? distinct(state.variants.map(v => v.size)) : []);

function blankProduct() {
  return {
    id: null, name: '', slug: '', product_type: 'kit', theme_id: '', difficulty: 'principiante',
    width_mm: '', height_mm: '', depth_mm: '', pieces_count: '', build_time_hours: '',
    short_description: '', description: '', is_active: true,
    name_en: '', short_description_en: '', description_en: '',
    variants: [emptyVariant(0)], images: [], compatible_with: [],
    opts: { color: false, size: false },
  };
}

function fromServer(p) {
  return {
    id: p.id, name: p.name, slug: p.slug, product_type: p.product_type, theme_id: p.theme_id ?? '',
    difficulty: p.difficulty ?? 'principiante',
    width_mm: p.width_mm ?? '', height_mm: p.height_mm ?? '', depth_mm: p.depth_mm ?? '',
    pieces_count: p.pieces_count ?? '', build_time_hours: p.build_time_hours ?? '',
    short_description: p.short_description, description: p.description, is_active: p.is_active,
    name_en: p.name_en ?? '', short_description_en: p.short_description_en ?? '', description_en: p.description_en ?? '',
    variants: p.variants.map(v => ({
      id: v.id, name: v.name, name_en: v.name_en ?? '', sku: v.sku, price: v.price, stock: v.stock,
      has_lighting: v.has_lighting, is_default: v.is_default, is_active: v.is_active,
      color: v.color ?? '', color_en: v.color_en ?? '', color_hex: v.color_hex ?? defaultHex(v.color ?? ''),
      size: v.size ?? '', size_en: v.size_en ?? '',
    })),
    images: p.images.map(i => ({ url: i.url, alt_text: i.alt_text, color: i.color ?? '' })),
    opts: { color: p.variants.some(v => v.color), size: p.variants.some(v => v.size) },
    compatible_with: p.compat.map(c => c.compatible_with_id),
  };
}

/** Lo que se envía al servidor. */
function payload() {
  const { opts, ...rest } = state;
  return {
    ...rest,
    slug: state.slug.trim(),
    difficulty: state.product_type === 'kit' ? state.difficulty : null,
    compatible_with: state.product_type === 'kit' ? [] : state.compatible_with,
    variants: state.variants.map(v => {
      const color = opts.color ? v.color.trim() : '';
      const size = opts.size ? v.size.trim() : '';
      const colorEn = color ? v.color_en.trim() : '';
      const sizeEn = size ? v.size_en.trim() : '';
      const out = {
        ...v, sku: v.sku.trim().toUpperCase(),
        color: color || null, color_en: colorEn || null, color_hex: color ? v.color_hex : null,
        size: size || null, size_en: sizeEn || null,
      };
      // con color o tamaño, el nombre de la versión es "Color · Tamaño" (carrito, pedidos y facturas)
      if (opts.color || opts.size) {
        out.name = [color, size].filter(Boolean).join(' · ');
        out.name_en = colorEn || sizeEn ? [colorEn || color, sizeEn || size].filter(Boolean).join(' · ') : '';
      }
      return out;
    }),
    images: state.images.map(i => ({ ...i, color: opts.color && i.color ? i.color : null })),
  };
}

const dirty = () => JSON.stringify(payload()) !== saved;
window.addEventListener('beforeunload', e => { if (state && dirty()) e.preventDefault(); });

// ---------- Pintado ----------
function fieldError(key) {
  return `<p class="field-error" id="err-${key}">${escapeHtml(errors[key] ?? '')}</p>`;
}
function inv(key) { return errors[key] ? 'invalid' : ''; }

function generalPanel() {
  const s = state;
  return `
    <section class="panel">
      <h2 class="h3">Información general</h2>
      <div class="form-grid">
        <div class="field full">
          <label for="f-name">Nombre</label>
          <input id="f-name" data-field="name" maxlength="120" value="${escapeHtml(s.name)}" class="${inv('name')}" required>
          ${fieldError('name')}
        </div>
        <div class="field full">
          <label for="f-slug">Dirección (slug)</label>
          <input id="f-slug" data-field="slug" maxlength="80" value="${escapeHtml(s.slug)}" class="${inv('slug')}" spellcheck="false">
          <p class="hint">producto.html?slug=<strong id="slug-preview">${escapeHtml(s.slug || '…')}</strong> · Se genera con el nombre; cambiarlo rompe los enlaces antiguos.</p>
          ${fieldError('slug')}
        </div>
        <div class="field">
          <label for="f-type">Tipo</label>
          <select id="f-type" data-field="product_type">${Object.entries(TYPE_OPTIONS).map(([v, l]) => opt(v, l, s.product_type)).join('')}</select>
        </div>
        <div class="field">
          <label for="f-theme">Temática</label>
          <select id="f-theme" data-field="theme_id">${opt('', 'Universal (sin temática)', s.theme_id)}${themes.map(t => opt(t.id, t.name, s.theme_id)).join('')}</select>
        </div>
        <div class="field" ${s.product_type === 'kit' ? '' : 'hidden'}>
          <label for="f-difficulty">Dificultad de montaje</label>
          <select id="f-difficulty" data-field="difficulty" class="${inv('difficulty')}">${Object.entries(DIFFICULTY_OPTIONS).map(([v, l]) => opt(v, l, s.difficulty)).join('')}</select>
          ${fieldError('difficulty')}
        </div>
        <div class="field full">
          <label for="f-short">Descripción corta <span class="muted">(tarjetas del catálogo)</span></label>
          <input id="f-short" data-field="short_description" maxlength="200" value="${escapeHtml(s.short_description)}" class="${inv('short_description')}">
          <p class="counter" data-counter="short_description">${s.short_description.length} / 200</p>
          ${fieldError('short_description')}
        </div>
        <div class="field full">
          <label for="f-desc">Descripción <span class="muted">(ficha del producto)</span></label>
          <textarea id="f-desc" data-field="description" maxlength="4000" rows="6" class="${inv('description')}">${escapeHtml(s.description)}</textarea>
          <p class="counter" data-counter="description">${s.description.length} / 4000</p>
          ${fieldError('description')}
        </div>
      </div>
    </section>`;
}

function measuresPanel() {
  const s = state;
  const num = (key, label, attrs) => `
    <div class="field">
      <label for="f-${key}">${label}</label>
      <input id="f-${key}" data-field="${key}" type="number" ${attrs} value="${escapeHtml(s[key])}" class="${inv(key)}">
      ${fieldError(key)}
    </div>`;
  return `
    <section class="panel">
      <h2 class="h3">Medidas y montaje</h2>
      <p class="hint muted">El ancho es el hueco que ocupa en la estantería: es el filtro "ancho máximo" del catálogo.</p>
      <div class="form-grid form-grid-4">
        ${num('width_mm', 'Ancho (mm)', 'min="1" max="1000" step="1"')}
        ${num('height_mm', 'Alto (mm)', 'min="1" max="1000" step="1"')}
        ${num('depth_mm', 'Fondo (mm)', 'min="1" max="1000" step="1"')}
        ${num('pieces_count', 'Piezas', 'min="1" max="5000" step="1"')}
        ${num('build_time_hours', 'Horas de montaje', 'min="0.5" max="200" step="0.5"')}
      </div>
    </section>`;
}

function variantsPanel() {
  const { color: byColor, size: bySize } = state.opts;
  const opts = byColor || bySize;
  const rows = state.variants.map((v, i) => `
    <tr data-vrow="${i}">
      ${opts ? '' : `<td><label class="visually-hidden" for="v-${i}-name">Nombre de la versión ${i + 1}</label>
        <input id="v-${i}-name" data-v="${i}" data-vf="name" maxlength="80" value="${escapeHtml(v.name)}" class="${inv(`variant-${i}-name`)}" placeholder="Con kit LED USB"></td>`}
      ${byColor ? `<td class="w-color"><div class="color-cell">
        <label class="visually-hidden" for="v-${i}-color_hex">Tono del color de la versión ${i + 1}</label>
        <input id="v-${i}-color_hex" type="color" data-v="${i}" data-vf="color_hex" value="${escapeHtml(v.color_hex || '#999999')}" class="${inv(`variant-${i}-color_hex`)}">
        <label class="visually-hidden" for="v-${i}-color">Color de la versión ${i + 1}</label>
        <input id="v-${i}-color" data-v="${i}" data-vf="color" maxlength="30" value="${escapeHtml(v.color)}" class="${inv(`variant-${i}-color`)}" placeholder="Nogal" list="color-names"></div></td>` : ''}
      ${bySize ? `<td class="w-size"><label class="visually-hidden" for="v-${i}-size">Tamaño de la versión ${i + 1}</label>
        <input id="v-${i}-size" data-v="${i}" data-vf="size" maxlength="30" value="${escapeHtml(v.size)}" class="${inv(`variant-${i}-size`)}" placeholder="Mediano (20 cm)"></td>` : ''}
      <td class="w-sku"><label class="visually-hidden" for="v-${i}-sku">SKU de la versión ${i + 1}</label>
        <input id="v-${i}-sku" data-v="${i}" data-vf="sku" maxlength="40" value="${escapeHtml(v.sku)}" class="${inv(`variant-${i}-sku`)}" spellcheck="false"></td>
      <td class="w-num"><label class="visually-hidden" for="v-${i}-price">Precio de la versión ${i + 1}</label>
        <input id="v-${i}-price" data-v="${i}" data-vf="price" type="number" min="0" max="9999" step="0.01" value="${escapeHtml(v.price)}" class="${inv(`variant-${i}-price`)}"></td>
      <td class="w-num"><label class="visually-hidden" for="v-${i}-stock">Stock de la versión ${i + 1}</label>
        <input id="v-${i}-stock" data-v="${i}" data-vf="stock" type="number" min="0" max="100000" step="1" value="${escapeHtml(v.stock)}" class="${inv(`variant-${i}-stock`)}"></td>
      <td class="w-chk"><input type="checkbox" data-v="${i}" data-vf="has_lighting" ${v.has_lighting ? 'checked' : ''} aria-label="Versión ${i + 1} con luz"></td>
      <td class="w-chk"><input type="radio" name="default-variant" data-v="${i}" data-vf="is_default" ${v.is_default ? 'checked' : ''} aria-label="Versión ${i + 1} por defecto"></td>
      <td class="w-chk"><input type="checkbox" data-v="${i}" data-vf="is_active" ${v.is_active ? 'checked' : ''} aria-label="Versión ${i + 1} a la venta"></td>
      <td><button type="button" class="icon-btn" data-remove-variant="${i}" ${state.variants.length === 1 ? 'disabled' : ''} aria-label="Quitar la versión ${i + 1}">×</button></td>
    </tr>`).join('');
  const FIELD = { name: 'nombre', sku: 'SKU', price: 'precio', stock: 'stock', color: 'color', color_hex: 'tono', size: 'tamaño' };
  const vErrors = Object.entries(errors).filter(([k]) => k.startsWith('variant-')).map(([k, m]) => {
    const [, i, f] = k.split('-');
    return `Versión ${Number(i) + 1} (${FIELD[f] ?? f}): ${m}`;
  });
  return `
    <section class="panel">
      <h2 class="h3">Versiones, precio y stock</h2>
      <p class="hint muted">Lo que realmente se compra. Precio con IVA incluido. Si una versión ya tiene pedidos y la quitas, se desactiva en lugar de borrarse.</p>
      <fieldset class="opt-toggle">
        <legend>Las versiones se diferencian por</legend>
        <label><input type="checkbox" data-opt="color" ${byColor ? 'checked' : ''}> Color</label>
        <label><input type="checkbox" data-opt="size" ${bySize ? 'checked' : ''}> Tamaño</label>
        ${opts ? '<span class="hint muted">El nombre de cada versión se forma solo: "Color · Tamaño". En la ficha se eligen con muestras de color y botones de tamaño.</span>' : ''}
      </fieldset>
      ${opts ? generatorBox() : ''}
      <div class="table-wrap">
        <table class="data-table variants-table ${opts ? 'has-options' : ''}">
          <thead><tr>${opts ? '' : '<th>Versión</th>'}${byColor ? '<th>Color</th>' : ''}${bySize ? '<th>Tamaño</th>' : ''}<th>SKU</th><th class="num">Precio (€)</th><th class="num">Stock</th>
            <th class="w-chk">Luz</th><th class="w-chk">Por defecto</th><th class="w-chk">A la venta</th><th><span class="visually-hidden">Quitar</span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <datalist id="color-names">${['Natural', 'Roble', 'Nogal', 'Negro', 'Blanco', 'Gris', 'Rojo', 'Azul', 'Verde', 'Dorado'].map(c => `<option value="${c}">`).join('')}</datalist>
      ${errors.variants || vErrors.length ? `<p class="field-error">${[errors.variants, ...vErrors].filter(Boolean).map(m => `<span>${escapeHtml(m)}</span>`).join('<br>')}</p>` : ''}
      <p><button type="button" class="btn btn-small btn-secondary" id="add-variant" ${state.variants.length >= 20 ? 'disabled' : ''}>+ Añadir versión</button></p>
    </section>`;
}

// Generador: crea de golpe una versión por cada combinación de colores y tamaños
function generatorBox() {
  const { color: byColor, size: bySize } = state.opts;
  return `
    <details class="gen-box" ${state.variants.length <= 1 && !state.variants[0]?.id ? 'open' : ''}>
      <summary>Generar combinaciones</summary>
      <div class="form-grid">
        ${byColor ? `<div class="field full"><label for="g-colors">Colores (separados por comas)</label>
          <input id="g-colors" value="${escapeHtml(colorsInUse().join(', '))}" placeholder="Natural, Nogal, Negro"></div>` : ''}
        ${bySize ? `<div class="field full"><label for="g-sizes">Tamaños (separados por comas, de menor a mayor)</label>
          <input id="g-sizes" value="${escapeHtml(sizesInUse().join(', '))}" placeholder="Pequeño (15 cm), Mediano (20 cm), Grande (25 cm)"></div>` : ''}
        <div class="field"><label for="g-price">Precio de las nuevas (€)</label>
          <input id="g-price" type="number" min="0" max="9999" step="0.01" value="${escapeHtml(state.variants[0]?.price ?? '')}"></div>
        <div class="field"><label for="g-stock">Stock de las nuevas</label>
          <input id="g-stock" type="number" min="0" max="100000" step="1" value="0"></div>
      </div>
      <p class="hint muted">Añade las combinaciones que falten (las que ya existen se mantienen) con su SKU propuesto. Después puedes ajustar precio, stock y tono de cada una. Máximo 20 versiones.</p>
      <p><button type="button" class="btn btn-small" id="generate">Generar versiones</button> <span id="gen-msg" class="form-msg" role="status"></span></p>
    </details>`;
}

function generate() {
  const split = id => distinct((document.getElementById(id)?.value ?? '').split(','));
  const colors = state.opts.color ? split('g-colors') : [''];
  const sizes = state.opts.size ? split('g-sizes') : [''];
  const msg = document.getElementById('gen-msg');
  if (!colors.length || !sizes.length) {
    msg.textContent = 'Escribe al menos un valor en cada lista.';
    msg.className = 'form-msg error';
    return;
  }
  const price = document.getElementById('g-price').value;
  const stock = document.getElementById('g-stock').value || 0;
  const key = (c, z) => `${c.toLowerCase()}|${z.toLowerCase()}`;
  // la versión vacía del producto nuevo se sustituye
  if (state.variants.length === 1 && !state.variants[0].id && !state.variants[0].color.trim() && !state.variants[0].size.trim()) {
    state.variants = [];
  }
  const existing = new Set(state.variants.map(v => key(state.opts.color ? v.color.trim() : '', state.opts.size ? v.size.trim() : '')));
  const missing = colors.flatMap(c => sizes.map(z => [c, z])).filter(([c, z]) => !existing.has(key(c, z)));
  if (state.variants.length + missing.length > 20) {
    if (!state.variants.length) state.variants = [emptyVariant(0)];
    msg.textContent = `Saldrían ${state.variants.length + missing.length} versiones y el máximo es 20.`;
    msg.className = 'form-msg error';
    return;
  }
  const skus = new Set(state.variants.map(v => v.sku.trim().toUpperCase()));
  const base = skuBase(state.name);
  for (const [c, z] of missing) {
    let sku = [base, c && skuPart(c), z && skuPart(z)].filter(Boolean).join('-');
    for (let n = 2; skus.has(sku); n++) sku = `${sku.replace(/-\d+$/, '')}-${n}`;
    skus.add(sku);
    const sameColor = state.variants.find(v => c && v.color.trim().toLowerCase() === c.toLowerCase());
    const sameSize = state.variants.find(v => z && v.size.trim().toLowerCase() === z.toLowerCase());
    state.variants.push({
      ...emptyVariant(state.variants.length), name: '', sku, price, stock,
      color: c, color_hex: sameColor?.color_hex ?? defaultHex(c), color_en: sameColor?.color_en ?? '',
      size: z, size_en: sameSize?.size_en ?? '', is_default: false,
    });
  }
  if (!state.variants.some(v => v.is_default) && state.variants[0]) state.variants[0].is_default = true;
  errors = {};
  render();
  toast(missing.length ? `${missing.length} ${missing.length === 1 ? 'versión añadida' : 'versiones añadidas'}. Revisa precios y stock y guarda.` : 'Ya existían todas las combinaciones.');
}

function imagesPanel() {
  const items = state.images.map((img, i) => `
    <li>
      <img src="${escapeHtml(img.url)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="img-fields">
        <label class="visually-hidden" for="i-${i}-url">Dirección de la imagen ${i + 1}</label>
        <input id="i-${i}-url" data-i="${i}" data-if="url" value="${escapeHtml(img.url)}" class="${inv(`image-${i}-url`)}" spellcheck="false">
        <label class="visually-hidden" for="i-${i}-alt">Texto alternativo de la imagen ${i + 1}</label>
        <input id="i-${i}-alt" data-i="${i}" data-if="alt_text" maxlength="200" value="${escapeHtml(img.alt_text)}" class="${inv(`image-${i}-alt_text`)}" placeholder="Describe la imagen (accesibilidad)">
        ${errors[`image-${i}-url`] || errors[`image-${i}-alt_text`] ? `<p class="field-error">${escapeHtml(errors[`image-${i}-url`] ?? errors[`image-${i}-alt_text`])}</p>` : ''}
        ${state.opts.color && colorsInUse().length ? `
          <label class="img-color"><span>Foto del color</span>
            <select data-i="${i}" data-if="color">
              <option value="">Todos los colores</option>
              ${colorsInUse().map(c => `<option value="${escapeHtml(c)}" ${c === img.color ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select></label>` : ''}
        ${i === 0 ? '<small class="muted">Imagen principal (tarjetas y ficha)</small>' : ''}
      </div>
      <div class="img-actions">
        <button type="button" class="icon-btn" data-move-image="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir la imagen ${i + 1}">↑</button>
        <button type="button" class="icon-btn" data-move-image="${i}" data-dir="1" ${i === state.images.length - 1 ? 'disabled' : ''} aria-label="Bajar la imagen ${i + 1}">↓</button>
        <button type="button" class="icon-btn" data-remove-image="${i}" aria-label="Quitar la imagen ${i + 1}">×</button>
      </div>
    </li>`).join('');
  return `
    <section class="panel">
      <h2 class="h3">Imágenes</h2>
      ${items ? `<ul class="images-list">${items}</ul>` : '<p class="muted">Sin imágenes: la tienda mostrará un hueco oscuro.</p>'}
      ${errors.images ? `<p class="field-error">${escapeHtml(errors.images)}</p>` : ''}
      <div class="drop" id="drop">
        <p>Arrastra aquí una foto (JPG, PNG o WebP) o
          <label class="link-btn" for="f-upload" style="text-decoration:underline">elígela</label>.
          Se recorta a 800 × 840 y se sube a Supabase Storage.</p>
        <input id="f-upload" type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden">
        <div class="drop-row">
          <label class="visually-hidden" for="f-image-url">Dirección de una imagen</label>
          <input id="f-image-url" placeholder="o pega una dirección: img/productos/… o https://…" spellcheck="false">
          <button type="button" class="btn btn-small btn-secondary" id="add-image-url">Añadir</button>
        </div>
        <p id="upload-msg" class="form-msg" role="status"></p>
      </div>
    </section>`;
}

function compatPanel() {
  if (state.product_type === 'kit') return '';
  return `
    <section class="panel">
      <h2 class="h3">Compatible con estos kits</h2>
      <p class="hint muted">Aparece en la ficha del kit como "accesorio o recambio compatible".</p>
      <div class="compat-list">${kits.filter(k => k.id !== state.id).map(k => `
        <label><input type="checkbox" data-compat="${k.id}" ${state.compatible_with.includes(k.id) ? 'checked' : ''}>
          ${escapeHtml(k.name)}${k.is_active ? '' : ' <span class="pill pill-off">Archivado</span>'}</label>`).join('')}
      </div>
    </section>`;
}

function englishPanel() {
  const s = state;
  return `
    <section class="panel">
      <h2 class="h3">Textos en inglés <span class="muted" style="font-size:.85rem;font-weight:400">opcional</span></h2>
      <p class="hint muted">Se usan cuando la tienda está en inglés. Si se dejan vacíos, se muestra el texto en español.</p>
      <div class="form-grid">
        <div class="field full"><label for="f-name_en">Nombre (EN)</label>
          <input id="f-name_en" data-field="name_en" maxlength="120" value="${escapeHtml(s.name_en)}" lang="en"></div>
        <div class="field full"><label for="f-short_en">Descripción corta (EN)</label>
          <input id="f-short_en" data-field="short_description_en" maxlength="200" value="${escapeHtml(s.short_description_en)}" lang="en"></div>
        <div class="field full"><label for="f-desc_en">Descripción (EN)</label>
          <textarea id="f-desc_en" data-field="description_en" maxlength="4000" rows="4" lang="en">${escapeHtml(s.description_en)}</textarea></div>
        ${usesOptions() ? [
          ...colorsInUse().map(c => ['color', c]), ...sizesInUse().map(z => ['size', z]),
        ].map(([kind, value], n) => {
          const v = s.variants.find(x => x[kind].trim() === value);
          return `<div class="field"><label for="en-${kind}-${n}">${kind === 'color' ? 'Color' : 'Tamaño'} "${escapeHtml(value)}" (EN)</label>
            <input id="en-${kind}-${n}" data-en-kind="${kind}" data-en-value="${escapeHtml(value)}" maxlength="30" value="${escapeHtml(v?.[`${kind}_en`] ?? '')}" lang="en"></div>`;
        }).join('') : s.variants.map((v, i) => `
          <div class="field"><label for="v-${i}-name_en">Versión "${escapeHtml(v.name || i + 1)}" (EN)</label>
            <input id="v-${i}-name_en" data-v="${i}" data-vf="name_en" maxlength="80" value="${escapeHtml(v.name_en)}" lang="en"></div>`).join('')}
      </div>
    </section>`;
}

function sidePanel() {
  const s = state;
  const cover = s.images[0]?.url;
  return `
    <section class="panel save-bar">
      <div class="field check">
        <input id="f-active" type="checkbox" data-field="is_active" ${s.is_active ? 'checked' : ''}>
        <label for="f-active">Visible en la tienda</label>
      </div>
      <button type="button" class="btn" id="save">${s.id ? 'Guardar cambios' : 'Crear producto'}</button>
      <p id="save-msg" class="form-msg" role="alert"></p>
      ${s.id && s.is_active ? `<a class="btn btn-plain" href="producto.html?slug=${encodeURIComponent(s.slug)}" target="_blank" rel="noopener">Ver en la tienda ↗</a>` : ''}
    </section>
    <section class="panel side-preview">
      ${cover ? `<img src="${escapeHtml(cover)}" alt="">` : '<span class="card-noimg"></span>'}
      <dl class="side-meta" style="margin-top:12px">
        <dt>Versiones</dt><dd>${s.variants.length}</dd>
        <dt>Stock total</dt><dd>${s.variants.reduce((n, v) => n + (Number(v.stock) || 0), 0)}</dd>
        ${stats ? `<dt>Vendidas</dt><dd>${stats.units_sold}</dd><dt>Ingresos</dt><dd>${money(stats.revenue)}</dd>` : ''}
        ${stats?.created_at ? `<dt>Creado</dt><dd>${formatDate(stats.created_at)}</dd><dt>Editado</dt><dd>${formatDate(stats.updated_at)}</dd>` : ''}
      </dl>
    </section>
    ${s.id ? `
    <section class="panel">
      <h2 class="h3">Más acciones</h2>
      <p><a class="btn btn-small btn-plain" href="admin-producto.html?duplicar=${s.id}">Duplicar producto</a></p>
      ${stats?.has_orders
        ? '<p class="hint muted">Este producto tiene pedidos, así que no se puede eliminar: desmarca "Visible en la tienda" para archivarlo.</p>'
        : confirmingDelete
          ? `<div class="dialog-inline"><p>¿Eliminar definitivamente "${escapeHtml(s.name)}"? Se borran sus versiones e imágenes. No se puede deshacer.</p>
               <p class="row-actions"><button type="button" class="btn btn-small btn-danger" id="delete-confirm">Sí, eliminar</button>
               <button type="button" class="btn btn-small btn-plain" id="delete-cancel">Cancelar</button></p></div>`
          : '<button type="button" class="btn btn-small btn-plain" id="delete">Eliminar producto</button>'}
    </section>` : ''}`;
}

function render() {
  const scroll = window.scrollY;
  const focusId = document.activeElement?.id;
  root.removeAttribute('aria-busy');
  document.getElementById('crumb').textContent = `› ${state.id ? state.name || 'Producto' : 'Nuevo producto'}`;
  document.title = `${state.id ? state.name : 'Nuevo producto'} · Back-office · Entrelibros`;
  root.innerHTML = `
    <div class="page-head"><h1>${state.id ? escapeHtml(state.name) : 'Nuevo producto'}</h1></div>
    <form id="editor" class="editor" novalidate>
      <div class="editor-main">
        ${generalPanel()}${measuresPanel()}${variantsPanel()}${imagesPanel()}${compatPanel()}${englishPanel()}
      </div>
      <aside class="editor-side">${sidePanel()}</aside>
    </form>`;
  if (focusId) document.getElementById(focusId)?.focus();
  window.scrollTo(0, scroll);
}

// ---------- Interacción ----------
root.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.field) {
    const key = t.dataset.field;
    state[key] = t.type === 'checkbox' ? t.checked : t.value;
    if (key === 'name' && !slugTouched && !state.id) {
      state.slug = slugify(t.value);
      document.getElementById('f-slug').value = state.slug;
    }
    if (key === 'slug') { slugTouched = true; }
    if (key === 'name' || key === 'slug') document.getElementById('slug-preview').textContent = state.slug || '…';
    const counter = root.querySelector(`[data-counter="${key}"]`);
    if (counter) counter.textContent = `${t.value.length} / ${key === 'description' ? 4000 : 200}`;
  } else if (t.dataset.v !== undefined) {
    const v = state.variants[Number(t.dataset.v)];
    const f = t.dataset.vf;
    if (f === 'is_default') state.variants.forEach((x, i) => { x.is_default = i === Number(t.dataset.v); });
    else v[f] = t.type === 'checkbox' ? t.checked : t.value;
    if (f === 'color_hex' && v.color.trim()) { // un color tiene un solo tono: se aplica a todas sus versiones
      state.variants.forEach((x, i) => {
        if (x.color.trim() !== v.color.trim()) return;
        x.color_hex = t.value;
        const input = document.getElementById(`v-${i}-color_hex`);
        if (input && input !== t) input.value = t.value;
      });
    }
    if (f === 'name') { // el nombre de la versión también aparece en "Textos en inglés"
      const label = root.querySelector(`label[for="v-${t.dataset.v}-name_en"]`);
      if (label) label.textContent = `Versión "${t.value || Number(t.dataset.v) + 1}" (EN)`;
    }
  } else if (t.dataset.enKind) {
    // traducción de un color o tamaño: se aplica a todas las versiones que lo llevan
    const kind = t.dataset.enKind;
    state.variants.filter(v => v[kind].trim() === t.dataset.enValue).forEach(v => { v[`${kind}_en`] = t.value; });
  } else if (t.dataset.i !== undefined) {
    state.images[Number(t.dataset.i)][t.dataset.if] = t.value;
  } else if (t.dataset.compat) {
    const id = Number(t.dataset.compat);
    state.compatible_with = t.checked ? [...state.compatible_with, id] : state.compatible_with.filter(x => x !== id);
  }
  // al corregir un campo se le quita la marca de error
  const key = t.dataset.field ?? (t.dataset.v !== undefined ? `variant-${t.dataset.v}-${t.dataset.vf}`
    : t.dataset.i !== undefined ? `image-${t.dataset.i}-${t.dataset.if}` : null);
  if (key && errors[key]) {
    delete errors[key];
    t.classList.remove('invalid');
    const p = document.getElementById(`err-${key}`);
    if (p) p.textContent = '';
  }
});

// cambios que cambian la estructura del formulario
root.addEventListener('change', e => {
  const f = e.target.dataset.field;
  if (f === 'product_type' || f === 'is_active') render();
  if (e.target.dataset.opt) {
    const kind = e.target.dataset.opt;
    state.opts[kind] = e.target.checked;
    if (kind === 'color' && e.target.checked) {
      state.variants.forEach(v => { if (!v.color_hex || v.color_hex === '#999999') v.color_hex = defaultHex(v.color); });
    }
    errors = {};
    render();
  }
  // un color o tamaño nuevo aparece en "Textos en inglés" y en las fotos por color
  const vf = e.target.dataset.vf;
  if (vf === 'color' || vf === 'size') {
    const v = state.variants[Number(e.target.dataset.v)];
    if (vf === 'color' && (!v.color_hex || v.color_hex === '#999999')) v.color_hex = defaultHex(v.color);
    // otra versión con el mismo color ya tiene tono y traducción: se copian
    const twin = state.variants.find(x => x !== v && x[vf].trim() && x[vf].trim() === v[vf].trim());
    if (twin) {
      v[`${vf}_en`] = twin[`${vf}_en`];
      if (vf === 'color') v.color_hex = twin.color_hex;
    }
    render();
  }
  if (e.target.id === 'f-upload' && e.target.files[0]) addFile(e.target.files[0]);
});

root.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'add-variant') {
    const i = state.variants.length;
    state.variants.push({ ...emptyVariant(i), sku: suggestSku(state.name, i + 1), price: state.variants[0]?.price ?? '' });
    render();
    document.getElementById(`v-${i}-name`).focus();
  } else if (b.dataset.removeVariant) {
    const i = Number(b.dataset.removeVariant);
    const [removed] = state.variants.splice(i, 1);
    if (removed.is_default && state.variants[0]) state.variants[0].is_default = true;
    errors = {};
    render();
  } else if (b.dataset.moveImage) {
    const i = Number(b.dataset.moveImage), j = i + Number(b.dataset.dir);
    [state.images[i], state.images[j]] = [state.images[j], state.images[i]];
    render();
  } else if (b.dataset.removeImage) {
    state.images.splice(Number(b.dataset.removeImage), 1);
    errors = {};
    render();
  } else if (b.id === 'add-image-url') {
    const input = document.getElementById('f-image-url');
    const url = input.value.trim();
    if (!url) return input.focus();
    state.images.push({ url, alt_text: state.name ? `${state.name}` : '' });
    render();
  } else if (b.id === 'generate') {
    generate();
  } else if (b.id === 'save') {
    save();
  } else if (b.id === 'delete') {
    confirmingDelete = true; render(); document.getElementById('delete-cancel').focus();
  } else if (b.id === 'delete-cancel') {
    confirmingDelete = false; render();
  } else if (b.id === 'delete-confirm') {
    b.disabled = true;
    try {
      await deleteProduct(state.id);
      saved = JSON.stringify(payload()); // no avisar de cambios sin guardar
      sessionStorage.setItem('entrelibros_admin_flash', `Producto "${state.name}" eliminado.`);
      location.replace('admin-productos.html');
    } catch (err) {
      toast(errorText(err), 'error');
      b.disabled = false;
    }
  }
});

root.addEventListener('submit', e => { e.preventDefault(); save(); });
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } // Cmd/Ctrl+S
});

// subida de imágenes: arrastrar y soltar
root.addEventListener('dragover', e => {
  const drop = e.target.closest?.('#drop');
  if (!drop) return;
  e.preventDefault();
  drop.classList.add('is-over');
});
root.addEventListener('dragleave', e => e.target.closest?.('#drop')?.classList.remove('is-over'));
root.addEventListener('drop', e => {
  const drop = e.target.closest?.('#drop');
  if (!drop) return;
  e.preventDefault();
  drop.classList.remove('is-over');
  if (e.dataTransfer.files[0]) addFile(e.dataTransfer.files[0]);
});

async function addFile(file) {
  const msg = document.getElementById('upload-msg');
  if (state.images.length >= 10) { msg.textContent = 'Como máximo 10 imágenes.'; msg.className = 'form-msg error'; return; }
  msg.textContent = 'Preparando y subiendo la imagen…';
  msg.className = 'form-msg';
  try {
    const blob = await prepareImage(file);
    const url = await uploadProductImage(blob, state.slug || slugify(state.name));
    state.images.push({ url, alt_text: state.name || '' });
    render();
    toast('Imagen subida. Guarda el producto para que se vea en la tienda.');
  } catch (err) {
    console.error(err);
    msg.textContent = /bucket/i.test(err?.message ?? '')
      ? 'No se ha podido subir: falta el espacio de imágenes (ejecuta 08_admin_catalogo.sql en Supabase).'
      : errorText(err, 'No se ha podido subir la imagen.');
    msg.className = 'form-msg error';
  }
}

async function save() {
  const btn = document.getElementById('save');
  const msg = document.getElementById('save-msg');
  errors = validateProduct(payload(), state.opts);
  if (Object.keys(errors).length) {
    render();
    document.getElementById('save-msg').textContent =
      `Revisa ${Object.keys(errors).length === 1 ? 'el campo marcado' : `los ${Object.keys(errors).length} campos marcados`}.`;
    document.getElementById('save-msg').className = 'form-msg error';
    root.querySelector('.invalid, .field-error:not(:empty)')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    root.querySelector('.invalid')?.focus({ preventScroll: true });
    return;
  }
  btn.disabled = true;
  msg.textContent = 'Guardando…';
  msg.className = 'form-msg';
  try {
    const res = await saveProduct(payload());
    const wasNew = !state.id;
    await loadProduct(res.id);
    toast(wasNew ? 'Producto creado.' : 'Cambios guardados.');
    for (const w of res.warnings ?? []) toast(w, 'ok', 6000);
    if (wasNew) history.replaceState(null, '', `?id=${res.id}`);
  } catch (err) {
    console.error(err);
    msg.textContent = errorText(err);
    msg.className = 'form-msg error';
    btn.disabled = false;
  }
}

async function loadProduct(id) {
  const [p, s] = await Promise.all([getProductForEdit(id), productHasOrders(id)]);
  if (!p) return null;
  state = fromServer(p);
  stats = { ...s, created_at: p.created_at, updated_at: p.updated_at };
  saved = JSON.stringify(payload());
  errors = {};
  confirmingDelete = false;
  render();
  return p;
}

// ---------- Arranque ----------
try {
  [themes, kits] = await Promise.all([listThemes(), listKits()]);
  const id = Number(param('id'));
  const copyOf = Number(param('duplicar'));
  if (id) {
    if (!(await loadProduct(id))) {
      root.innerHTML = '<p class="empty error">Producto no encontrado.</p> <p><a href="admin-productos.html">Volver a productos</a></p>';
    }
  } else {
    if (copyOf) {
      const p = await getProductForEdit(copyOf);
      if (p) {
        state = fromServer(p);
        Object.assign(state, {
          id: null, name: `${p.name} (copia)`, slug: `${p.slug}-copia`, is_active: false,
          name_en: state.name_en ? `${state.name_en} (copy)` : '',
        });
        state.variants = state.variants.map(v => ({ ...v, id: null, sku: `${v.sku}-C`.slice(0, 40) }));
        slugTouched = true;
      }
    }
    state ??= blankProduct();
    saved = copyOf ? '' : JSON.stringify(payload());
    render();
    document.getElementById('f-name').focus();
  }
} catch (err) {
  console.error(err);
  root.innerHTML = `<p class="empty error">${escapeHtml(errorText(err, 'No se ha podido cargar el producto.'))}</p>`;
}
