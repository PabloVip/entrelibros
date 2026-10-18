// Reglas del catálogo: filtros válidos, etiquetas y formato. Lo usan las páginas, no toca la BD.

export const TYPE_LABELS = { kit: 'Kit completo', accesorio: 'Accesorio', recambio: 'Recambio' };
export const DIFFICULTY_LABELS = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };

// Ancho = hueco que ocupa la escena en la estantería
export const WIDTH_OPTIONS = [
  { value: 110, label: 'Hasta 11 cm (hueco estrecho)' },
  { value: 130, label: 'Hasta 13 cm' },
  { value: 150, label: 'Hasta 15 cm' },
];

export const SORT_OPTIONS = [
  { value: '',            label: 'Destacados' },
  { value: 'precio_asc',  label: 'Precio: menor a mayor' },
  { value: 'precio_desc', label: 'Precio: mayor a menor' },
  { value: 'nombre',      label: 'Nombre (A-Z)' },
  { value: 'novedades',   label: 'Novedades' },
];

// Nombre del parámetro en la URL ↔ clave interna
const PARAMS = {
  tipo: 'type', tema: 'theme', dificultad: 'difficulty', luz: 'lighting',
  ancho: 'maxWidth', precio: 'maxPrice', q: 'q', orden: 'sort',
};

/** Lee y VALIDA los filtros de la URL (lista blanca: lo desconocido se ignora). */
export function filtersFromUrl(search = location.search) {
  const p = new URLSearchParams(search);
  const f = {};
  const type = p.get('tipo');
  if (type in TYPE_LABELS) f.type = type;
  const diff = p.get('dificultad');
  if (diff in DIFFICULTY_LABELS) f.difficulty = diff;
  const light = p.get('luz');
  if (light === 'con' || light === 'sin') f.lighting = light;
  const theme = p.get('tema');
  if (theme && /^[a-z0-9-]{1,60}$/.test(theme)) f.theme = theme;
  const width = Number(p.get('ancho'));
  if (Number.isInteger(width) && width > 0 && width <= 500) f.maxWidth = width;
  const price = Number(p.get('precio'));
  if (Number.isFinite(price) && price > 0 && price <= 1000) f.maxPrice = price;
  const q = (p.get('q') ?? '').replace(/[%_,()]/g, ' ').trim().slice(0, 60);
  if (q) f.q = q;
  const sort = p.get('orden');
  if (SORT_OPTIONS.some(o => o.value && o.value === sort)) f.sort = sort;
  return f;
}

export function filtersToQuery(f) {
  const p = new URLSearchParams();
  for (const [param, key] of Object.entries(PARAMS)) {
    if (f[key] !== undefined && f[key] !== '' && f[key] !== null) p.set(param, f[key]);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Orden "Destacados": primero kits, luego accesorios y recambios; con stock antes que agotados. */
export function sortFeatured(items) {
  const rank = { kit: 0, accesorio: 1, recambio: 2 };
  return [...items].sort((a, b) =>
    (rank[a.product_type] - rank[b.product_type]) ||
    ((b.total_stock > 0) - (a.total_stock > 0)) ||
    a.name.localeCompare(b.name, 'es'));
}

export function lightingLabel(item) {
  if (item.has_lit_option && item.has_unlit_option) return 'Con o sin luz';
  if (item.has_lit_option) return 'Con iluminación';
  return 'Sin iluminación';
}

export function dimensionsLabel(p) {
  if (!p.width_mm) return null;
  const cm = mm => (mm / 10).toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return `${cm(p.width_mm)} × ${cm(p.height_mm)} × ${cm(p.depth_mm)} cm`;
}

/** Variante seleccionada por defecto: la marcada como default con stock, si no la primera con stock. */
export function defaultVariant(variants) {
  return variants.find(v => v.is_default && v.stock > 0)
      ?? variants.find(v => v.stock > 0)
      ?? variants[0];
}
