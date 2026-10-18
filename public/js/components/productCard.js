// Tarjeta de producto reutilizable (catálogo, portada, productos compatibles).
import { escapeHtml, money } from '../core/utils.js';
import { TYPE_LABELS, DIFFICULTY_LABELS, lightingLabel } from '../services/catalogService.js';

export function productCard(item) {
  const href = `producto.html?slug=${encodeURIComponent(item.slug)}`;
  const price = Number(item.min_price) === Number(item.max_price)
    ? money(item.min_price)
    : `desde ${money(item.min_price)}`;
  const soldOut = Number(item.total_stock) === 0;

  const chips = [
    item.difficulty ? DIFFICULTY_LABELS[item.difficulty] : null,
    item.width_mm ? `${(item.width_mm / 10).toLocaleString('es-ES')} cm de ancho` : null,
    item.product_type === 'kit' ? lightingLabel(item) : null,
  ].filter(Boolean);

  return `
    <article class="card ${soldOut ? 'is-soldout' : ''}">
      <a class="card-media" href="${href}">
        ${item.image_url ? `<img src="${escapeHtml(item.image_url)}"
             alt="${escapeHtml(item.image_alt ?? item.name)}" loading="lazy" width="400" height="420">` : '<span class="card-noimg" aria-hidden="true"></span>'}
        <span class="badge badge-${escapeHtml(item.product_type)}">${TYPE_LABELS[item.product_type]}</span>
        ${soldOut ? '<span class="badge badge-soldout">Agotado</span>' : ''}
      </a>
      <div class="card-body">
        ${item.theme_name ? `<p class="card-theme">${escapeHtml(item.theme_name)}</p>` : ''}
        <h3 class="card-title"><a href="${href}">${escapeHtml(item.name)}</a></h3>
        <p class="card-desc">${escapeHtml(item.short_description)}</p>
        ${chips.length ? `<ul class="chips">${chips.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}
        <p class="card-price">${price}</p>
      </div>
    </article>`;
}
