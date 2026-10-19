// Página de catálogo: filtros sincronizados con la URL (se pueden compartir/guardar).
import { renderLayout } from '../core/layout.js';
import { fetchThemes, fetchCatalog } from '../repositories/catalogRepository.js';
import {
  WIDTH_OPTIONS, SORT_OPTIONS, filtersFromUrl, filtersToQuery, sortFeatured,
} from '../services/catalogService.js';
import { productCard } from '../components/productCard.js';
import { escapeHtml } from '../core/utils.js';
import { lang, t } from '../core/i18n.js';

renderLayout();

const form    = document.getElementById('filters');
const results = document.getElementById('results');
const count   = document.getElementById('results-title');
let requestId = 0; // descarta respuestas antiguas si el usuario cambia filtros rápido

function fillStaticOptions(themes) {
  form.theme.insertAdjacentHTML('beforeend',
    themes.map(t => `<option value="${escapeHtml(t.slug)}">${escapeHtml(t.name)}</option>`).join(''));
  form.maxWidth.insertAdjacentHTML('beforeend',
    WIDTH_OPTIONS.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join(''));
  document.getElementById('f-sort').innerHTML =
    SORT_OPTIONS.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
}

/** Pone en el formulario los filtros que vienen en la URL */
function applyToForm(f) {
  form.q.value          = f.q ?? '';
  form.type.value       = f.type ?? '';
  form.theme.value      = f.theme ?? '';
  form.difficulty.value = f.difficulty ?? '';
  form.lighting.value   = f.lighting ?? '';
  form.maxWidth.value   = f.maxWidth ?? '';
  form.maxPrice.value   = f.maxPrice ?? '';
  document.getElementById('f-sort').value = f.sort ?? '';
}

function readForm() {
  const data = new FormData(form);
  const f = Object.fromEntries([...data.entries()].filter(([, v]) => String(v).trim() !== ''));
  // la dificultad solo aplica a kits: si se elige, se fuerza el tipo kit
  if (f.difficulty && !f.type) f.type = 'kit';
  return filtersFromUrl(filtersToQuery(f)); // reutiliza la misma validación que la URL
}

async function load(filters) {
  const id = ++requestId;
  results.setAttribute('aria-busy', 'true');
  try {
    const { items, total } = await fetchCatalog(filters);
    if (id !== requestId) return;
    let list = filters.sort ? items : sortFeatured(items);
    // la BD ordena por el nombre en español; en inglés se reordena por el nombre traducido
    if (filters.sort === 'nombre' && lang !== 'es') list = [...list].sort((a, b) => t(a.name).localeCompare(t(b.name), lang));
    count.textContent = `${total} ${total === 1 ? 'producto' : 'productos'}`;
    results.innerHTML = list.length
      ? list.map(productCard).join('')
      : '<p class="empty">No hay productos con estos filtros. Prueba a quitar alguno.</p>';
  } catch (err) {
    console.error(err);
    if (id !== requestId) return;
    count.textContent = '';
    results.innerHTML = '<p class="empty error">No se ha podido cargar el catálogo. Inténtalo de nuevo en unos segundos.</p>';
  } finally {
    results.removeAttribute('aria-busy');
  }
}

function onChange() {
  const f = readForm();
  applyToForm(f);
  history.replaceState(null, '', `catalogo.html${filtersToQuery(f)}`);
  load(f);
}

let typingTimer;
form.addEventListener('change', onChange);
document.getElementById('f-sort').addEventListener('change', onChange); // está fuera del <form> (atributo form=)
form.q.addEventListener('input', () => { clearTimeout(typingTimer); typingTimer = setTimeout(onChange, 350); });
form.addEventListener('submit', e => { e.preventDefault(); onChange(); });
form.addEventListener('reset', () => setTimeout(onChange)); // tras limpiar el formulario

(async function init() {
  try {
    fillStaticOptions(await fetchThemes());
  } catch (err) {
    console.error(err);
  }
  const f = filtersFromUrl();
  applyToForm(f);
  load(f);
})();
