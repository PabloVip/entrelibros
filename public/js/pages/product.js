// Ficha de producto: variantes, especificaciones y productos compatibles.
import { renderLayout } from '../core/layout.js';
import { fetchProductBySlug, fetchCompatible } from '../repositories/catalogRepository.js';
import {
  TYPE_LABELS, DIFFICULTY_LABELS, dimensionsLabel, defaultVariant,
} from '../services/catalogService.js';
import { track, EVENTS } from '../services/eventService.js';
import '../services/cartService.js'; // escucha 'entrelibros:add-to-cart' y guarda la línea
import { productCard } from '../components/productCard.js';
import { favoriteButton } from '../components/favoriteButton.js';
import { qtyStepper, syncStepper } from '../components/qtyStepper.js';
import '../components/miniCart.js'; // al añadir: la foto vuela al carrito y se abre el mini-carrito
import { BULB } from '../components/icons.js';
import { escapeHtml, money, param } from '../core/utils.js';
import { locale } from '../core/i18n.js';

renderLayout();

const root  = document.getElementById('product');
const MAX_QTY = 10;

function stockText(v) {
  if (v.stock === 0) return { text: 'Agotado', cls: 'out' };
  if (v.stock <= 5)  return { text: `¡Últimas ${v.stock} unidades!`, cls: 'low' };
  return { text: 'En stock · envío en 24-48 h', cls: 'ok' };
}

function specsRows(p) {
  const rows = [
    ['Tipo', TYPE_LABELS[p.product_type]],
    ['Temática', p.theme?.name ?? 'Universal'],
    ['Dificultad', p.difficulty ? DIFFICULTY_LABELS[p.difficulty] : null],
    ['Dimensiones (an × al × fo)', dimensionsLabel(p)],
    ['Número de piezas', p.pieces_count],
    ['Tiempo de montaje', p.build_time_hours ? `≈ ${Number(p.build_time_hours).toLocaleString(locale)} h` : null],
  ];
  return rows.filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('');
}

// ---------- Opciones: color y tamaño ----------
// Si las variantes tienen color y/o tamaño, en lugar de la lista de versiones se enseñan
// muestras de color y botones de tamaño; la variante es la combinación elegida.
const same = (a, b) => (a ?? '') === (b ?? '');

function optionLists(variants) {
  const byId = [...variants].sort((a, b) => a.id - b.id);
  const colors = [];
  for (const v of byId) if (v.color && !colors.some(c => c.name === v.color)) colors.push({ name: v.color, hex: v.color_hex });
  // tamaños de menor a mayor precio medio (pequeño → grande), y si empatan, en el orden de alta
  const sizes = [...new Set(byId.map(v => v.size).filter(Boolean))];
  const avg = s => { const l = variants.filter(v => v.size === s); return l.reduce((n, v) => n + Number(v.price), 0) / l.length; };
  sizes.sort((a, b) => avg(a) - avg(b));
  return { colors, sizes };
}

function optionsHtml(variants, selected) {
  const { colors, sizes } = optionLists(variants);
  return `
    ${colors.length ? `
      <fieldset class="opt-group">
        <legend>Color: <strong id="opt-color-name">${escapeHtml(selected.color)}</strong></legend>
        <div class="swatches">${colors.map(c => `
          <label class="swatch" title="${escapeHtml(c.name)}">
            <input type="radio" name="color" value="${escapeHtml(c.name)}" ${c.name === selected.color ? 'checked' : ''}>
            <span class="swatch-dot" style="--sw:${/^#[0-9a-f]{6}$/i.test(c.hex ?? '') ? c.hex : '#999999'}" aria-hidden="true"></span>
            <span class="visually-hidden">${escapeHtml(c.name)}</span>
          </label>`).join('')}
        </div>
      </fieldset>` : ''}
    ${sizes.length ? `
      <fieldset class="opt-group">
        <legend>Tamaño: <strong id="opt-size-name">${escapeHtml(selected.size)}</strong></legend>
        <div class="size-pills">${sizes.map(s => `
          <label class="size-pill">
            <input type="radio" name="size" value="${escapeHtml(s)}" ${s === selected.size ? 'checked' : ''}>
            <span>${escapeHtml(s)}</span>
          </label>`).join('')}
        </div>
      </fieldset>` : ''}
    <input type="hidden" name="variant" value="${selected.id}">`;
}

function render(p) {
  const variants = [...p.variants].sort((a, b) => a.price - b.price);
  const hasOptions = variants.some(v => v.color || v.size);
  const images = [...p.images].sort((a, b) => a.sort_order - b.sort_order);
  const selected = defaultVariant(variants);
  const mainImg = images[0];
  // Kits con versión iluminada: la foto se "apaga" con la versión sin luz y se enciende con la de LED
  // (css: .product-media[data-luz]). Es una simulación sobre la misma foto.
  const showsLight = p.product_type === 'kit' && variants.some(v => v.has_lighting);

  document.title = `${p.name} · Entrelibros`;
  document.getElementById('crumb').textContent = `› ${p.name}`;

  root.innerHTML = `
    <article class="product">
      <div class="product-media">
        ${showsLight ? `<span class="luz-tag" aria-hidden="true">${BULB}<span id="luz-text"></span></span>` : ''}
        <img id="main-image" src="${escapeHtml(mainImg?.url ?? '')}" alt="${escapeHtml(mainImg?.alt_text ?? p.name)}" width="400" height="420">
      </div>

      <div class="product-info">
        <p class="card-theme">${escapeHtml(p.theme?.name ?? TYPE_LABELS[p.product_type])}</p>
        <h1>${escapeHtml(p.name)}</h1>
        <p class="lead">${escapeHtml(p.short_description)}</p>

        <p class="product-price" id="price"></p>
        <p class="tax-note">IVA incluido · gastos de envío calculados en el checkout</p>

        <form id="buy" class="buy" novalidate>
          ${hasOptions ? optionsHtml(variants, selected) : `
          <fieldset class="variants">
            <legend>Elige versión</legend>
            ${variants.map(v => `
              <label class="variant ${v.stock === 0 ? 'is-out' : ''}">
                <input type="radio" name="variant" value="${v.id}" ${v.id === selected.id ? 'checked' : ''} ${v.stock === 0 ? 'disabled' : ''}>
                <span class="variant-name">${escapeHtml(v.name)}${v.has_lighting ? '<span class="variant-light" aria-hidden="true"></span>' : ''}</span>
                <span class="variant-price">${money(v.price)}</span>
                ${v.stock === 0 ? '<span class="variant-out">Agotado</span>' : ''}
              </label>`).join('')}
          </fieldset>`}

          <p id="stock" class="stock"></p>

          <div class="buy-row">
            <label for="qty" class="visually-hidden">Cantidad</label>
            ${qtyStepper({ id: 'qty', value: 1, attrs: 'name="qty"' })}
            <button id="add" type="submit" class="btn">Añadir al carrito</button>
            ${favoriteButton(p)}
          </div>
          <p id="buy-msg" class="form-msg" role="status"></p>
        </form>

        <p class="sku">Referencia: <span id="sku"></span></p>
      </div>
    </article>

    <section class="product-details">
      <div>
        <h2>Descripción</h2>
        <p>${escapeHtml(p.description)}</p>
      </div>
      <div>
        <h2>Características</h2>
        <table class="specs"><tbody>${specsRows(p)}</tbody></table>
      </div>
    </section>`;

  const form = document.getElementById('buy');
  const qty  = document.getElementById('qty');

  function currentVariant() {
    const id = Number(form.variant.value);
    return variants.find(x => x.id === id) ?? selected;
  }

  // Color y tamaño → variante. Si la combinación no existe para el color elegido, se pasa al
  // primer tamaño que sí exista (con stock si lo hay).
  function syncOptions(changed) {
    const color = form.color?.value ?? null;
    let size = form.size?.value ?? null;
    let v = variants.find(x => same(x.color, color) && same(x.size, size));
    if (!v && changed === 'color') {
      const options = variants.filter(x => same(x.color, color));
      v = options.find(x => x.stock > 0) ?? options[0];
      size = v?.size ?? null;
      const radio = [...root.querySelectorAll('input[name=size]')].find(r => r.value === size);
      if (radio) radio.checked = true;
    }
    if (!v) return;
    form.variant.value = v.id;
    // tamaños: tachado si no hay stock con este color; desactivado si la combinación no existe
    for (const r of root.querySelectorAll('input[name=size]')) {
      const x = variants.find(y => same(y.color, color) && y.size === r.value);
      r.disabled = !x;
      r.closest('.size-pill').classList.toggle('is-out', !x || x.stock === 0);
    }
    // colores: tachado si ese color está agotado en todos los tamaños
    for (const r of root.querySelectorAll('input[name=color]')) {
      r.closest('.swatch').classList.toggle('is-out', !variants.some(y => y.color === r.value && y.stock > 0));
    }
    const colorName = document.getElementById('opt-color-name');
    if (colorName) colorName.textContent = v.color ?? '';
    const sizeName = document.getElementById('opt-size-name');
    if (sizeName) sizeName.textContent = v.size ?? '';
  }

  function update() {
    const v = currentVariant();
    const s = stockText(v);
    document.getElementById('price').textContent = money(v.price);
    document.getElementById('sku').textContent = v.sku;
    const stock = document.getElementById('stock');
    stock.textContent = s.text;
    stock.className = `stock stock-${s.cls}`;
    qty.max = Math.min(v.stock, MAX_QTY);
    if (Number(qty.value) > Number(qty.max)) qty.value = qty.max || 1;
    if (!(Number(qty.value) >= 1)) qty.value = 1; // al volver de una versión agotada (máximo 0)
    syncStepper(qty); // el máximo cambia con la versión elegida: activa o desactiva − y +
    document.getElementById('add').disabled = v.stock === 0;
    if (showsLight) {
      root.querySelector('.product-media').dataset.luz = v.has_lighting ? 'on' : 'off';
      document.getElementById('luz-text').textContent = v.has_lighting ? 'Luz encendida' : 'Luz apagada';
    }
    // si la variante (o su color) tiene foto propia, se muestra
    const img = images.find(i => i.variant_id === v.id) ?? (v.color && images.find(i => i.color === v.color)) ?? mainImg;
    if (img) {
      const el = document.getElementById('main-image');
      el.src = img.url; el.alt = img.alt_text;
    }
    return v;
  }

  form.addEventListener('change', e => {
    if (e.target.name === 'color' || e.target.name === 'size') { syncOptions(e.target.name); update(); }
    if (e.target.name === 'variant') update();
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = currentVariant();
    const n = Number(qty.value);
    const msg = document.getElementById('buy-msg');
    if (!Number.isInteger(n) || n < 1 || n > Number(qty.max)) {
      msg.textContent = `Indica una cantidad entre 1 y ${qty.max}.`;
      msg.className = 'form-msg error';
      return;
    }
    msg.textContent = '';
    // Punto de enganche con el carrito (Nino): cartService escucha este evento,
    // guarda la línea y registra cart.item_added.
    document.dispatchEvent(new CustomEvent('entrelibros:add-to-cart', {
      detail: {
        variantId: v.id, sku: v.sku, quantity: n,
        productId: p.id, productSlug: p.slug, productName: p.name,
        variantName: v.name, unitPrice: Number(v.price),
        image: (v.color && images.find(i => i.color === v.color)?.url) ?? mainImg?.url ?? null,
        stock: v.stock, // el carrito no deja pasar de aquí (create_order lo vuelve a comprobar)
      },
    }));
  });

  // El corazón lo gestiona favoriteButton.js; aquí solo se confirma con un mensaje.
  document.addEventListener('entrelibros:favorites-changed', e => {
    if (e.detail.productId !== p.id) return;
    const msg = document.getElementById('buy-msg');
    msg.innerHTML = e.detail.active
      ? 'Guardado en tus favoritos. <a href="favoritos.html">Ver favoritos</a>'
      : 'Quitado de tus favoritos.';
    msg.className = 'form-msg ok';
  });

  if (hasOptions) syncOptions();
  update();
  return selected;
}

async function renderRelated(p) {
  const items = await fetchCompatible(p);
  if (!items.length) return;
  document.getElementById('related-title').textContent =
    p.product_type === 'kit' ? 'Accesorios y recambios compatibles' : 'Compatible con estos kits';
  document.getElementById('related-list').innerHTML = items.map(productCard).join('');
  document.getElementById('related').hidden = false;
}

function notFound() {
  document.title = 'Producto no encontrado · Entrelibros';
  root.innerHTML = `
    <section class="error-page">
      <h1>Producto no encontrado</h1>
      <p>Puede que ya no esté disponible.</p>
      <p><a class="btn" href="catalogo.html">Volver al catálogo</a></p>
    </section>`;
}

(async function init() {
  const slug = param('slug');
  try {
    if (!slug || !/^[a-z0-9-]{1,120}$/.test(slug)) return notFound();
    const p = await fetchProductBySlug(slug);
    if (!p || !p.variants?.length) return notFound();

    // si la foto está llegando desde la tarjeta (transición entre páginas), se espera a que aterrice
    // antes de repintar la ficha: así no desaparece a medio vuelo (window.__transicion: js/core/boot.js)
    await window.__transicion?.finished?.catch(() => {});
    try { sessionStorage.removeItem('entrelibros_foto'); } catch { /* sin almacenamiento */ }
    const selected = render(p);
    track(EVENTS.PRODUCT_VIEWED, {
      entityType: 'product',
      entityId: p.id,
      payload: {
        slug: p.slug,
        product_type: p.product_type,
        theme: p.theme?.slug ?? null,
        default_variant_sku: selected.sku,
        price: Number(selected.price),
        referrer: document.referrer ? new URL(document.referrer).pathname : null,
      },
    });
    renderRelated(p).catch(console.error);
  } catch (err) {
    console.error(err);
    root.innerHTML = '<p class="empty error">No se ha podido cargar el producto. Inténtalo de nuevo.</p>';
  } finally {
    root.removeAttribute('aria-busy');
  }
})();
