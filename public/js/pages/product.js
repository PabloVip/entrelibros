// Ficha de producto: variantes, especificaciones y productos compatibles.
import { renderLayout } from '../core/layout.js';
import { fetchProductBySlug, fetchCompatible } from '../repositories/catalogRepository.js';
import {
  TYPE_LABELS, DIFFICULTY_LABELS, dimensionsLabel, defaultVariant,
} from '../services/catalogService.js';
import { track, EVENTS } from '../services/eventService.js';
import '../services/cartService.js'; // escucha 'entrelibros:add-to-cart' y guarda la línea
import { productCard } from '../components/productCard.js';
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

function render(p) {
  const variants = [...p.variants].sort((a, b) => a.price - b.price);
  const images = [...p.images].sort((a, b) => a.sort_order - b.sort_order);
  const selected = defaultVariant(variants);
  const mainImg = images[0];

  document.title = `${p.name} · Entrelibros`;
  document.getElementById('crumb').textContent = `› ${p.name}`;

  root.innerHTML = `
    <article class="product">
      <div class="product-media">
        <img id="main-image" src="${escapeHtml(mainImg?.url ?? '')}" alt="${escapeHtml(mainImg?.alt_text ?? p.name)}" width="400" height="420">
      </div>

      <div class="product-info">
        <p class="card-theme">${escapeHtml(p.theme?.name ?? TYPE_LABELS[p.product_type])}</p>
        <h1>${escapeHtml(p.name)}</h1>
        <p class="lead">${escapeHtml(p.short_description)}</p>

        <p class="product-price" id="price"></p>
        <p class="tax-note">IVA incluido · gastos de envío calculados en el checkout</p>

        <form id="buy" class="buy" novalidate>
          <fieldset class="variants">
            <legend>Elige versión</legend>
            ${variants.map(v => `
              <label class="variant ${v.stock === 0 ? 'is-out' : ''}">
                <input type="radio" name="variant" value="${v.id}" ${v.id === selected.id ? 'checked' : ''} ${v.stock === 0 ? 'disabled' : ''}>
                <span class="variant-name">${escapeHtml(v.name)}${v.has_lighting ? ' 💡' : ''}</span>
                <span class="variant-price">${money(v.price)}</span>
                ${v.stock === 0 ? '<span class="variant-out">Agotado</span>' : ''}
              </label>`).join('')}
          </fieldset>

          <p id="stock" class="stock"></p>

          <div class="buy-row">
            <label for="qty" class="visually-hidden">Cantidad</label>
            <input id="qty" name="qty" type="number" min="1" value="1" inputmode="numeric">
            <button id="add" type="submit" class="btn">Añadir al carrito</button>
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
    document.getElementById('add').disabled = v.stock === 0;
    // si la variante tiene foto propia, se muestra
    const img = images.find(i => i.variant_id === v.id) ?? mainImg;
    if (img) {
      const el = document.getElementById('main-image');
      el.src = img.url; el.alt = img.alt_text;
    }
    return v;
  }

  form.addEventListener('change', e => { if (e.target.name === 'variant') update(); });
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
        variantName: v.name, unitPrice: Number(v.price), image: mainImg?.url ?? null,
      },
    }));
  });

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
