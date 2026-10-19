// Reglas del back-office de catálogo que se comprueban en el navegador antes de enviar.
// El servidor vuelve a validarlo todo (08_admin_catalogo.sql): esto solo da avisos rápidos.

export const TYPE_OPTIONS = { kit: 'Kit completo', accesorio: 'Accesorio', recambio: 'Recambio' };
export const DIFFICULTY_OPTIONS = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };

// estados que cuentan como venta (el pago está hecho y no se ha cancelado)
export const PAID_STATUSES = ['pago_simulado', 'pendiente_preparacion', 'enviado', 'entregado', 'incidencia'];

export const LOW_STOCK = 5;

/** "Café parisino de 1920" → "cafe-parisino-de-1920" */
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Propuesta de SKU para una variante nueva: EL-<3 letras del producto>-<n> */
export function suggestSku(productName, index) {
  const base = slugify(productName).replace(/-/g, '').toUpperCase().slice(0, 3) || 'PRD';
  return `EL-${base}-${String(index).padStart(2, '0')}`;
}

export function stockState(variantsOut, variantsLow, totalStock) {
  if (Number(totalStock) === 0) return { cls: 'pill-out', label: 'Agotado' };
  if (Number(variantsOut) > 0) return { cls: 'pill-low', label: 'Versión agotada' };
  if (Number(variantsLow) > 0) return { cls: 'pill-low', label: 'Stock bajo' };
  return { cls: 'pill-ok', label: 'En stock' };
}

const between = (n, a, b) => Number.isFinite(n) && n >= a && n <= b;
const optNum = v => (v === '' || v == null ? null : Number(v));

/**
 * Comprueba el producto del editor. Devuelve { campo: mensaje }.
 * Campos de variantes: "variant-<i>-<campo>"; de imágenes: "image-<i>-<campo>".
 */
export function validateProduct(p) {
  const e = {};
  if (!between(p.name.trim().length, 2, 120)) e.name = 'Entre 2 y 120 caracteres.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug) || !between(p.slug.length, 3, 80)) {
    e.slug = 'Solo minúsculas, números y guiones (3-80).';
  }
  if (!(p.product_type in TYPE_OPTIONS)) e.product_type = 'Elige un tipo.';
  if (p.product_type === 'kit' && !(p.difficulty in DIFFICULTY_OPTIONS)) e.difficulty = 'Indica la dificultad del kit.';
  for (const k of ['width_mm', 'height_mm', 'depth_mm']) {
    const n = optNum(p[k]);
    if (n !== null && !(Number.isInteger(n) && between(n, 1, 1000))) e[k] = 'Entre 1 y 1000 mm.';
  }
  const pieces = optNum(p.pieces_count);
  if (pieces !== null && !(Number.isInteger(pieces) && between(pieces, 1, 5000))) e.pieces_count = 'Entre 1 y 5000.';
  const hours = optNum(p.build_time_hours);
  if (hours !== null && !between(hours, 0.5, 200)) e.build_time_hours = 'Entre 0,5 y 200 h.';
  if (!between(p.short_description.trim().length, 10, 200)) e.short_description = 'Entre 10 y 200 caracteres.';
  if (!between(p.description.trim().length, 20, 4000)) e.description = 'Entre 20 y 4000 caracteres.';

  if (!between(p.variants.length, 1, 20)) e.variants = 'Añade entre 1 y 20 versiones.';
  const skus = p.variants.map(v => v.sku.trim().toUpperCase());
  p.variants.forEach((v, i) => {
    if (!between(v.name.trim().length, 2, 80)) e[`variant-${i}-name`] = 'Nombre de 2 a 80 caracteres.';
    const sku = skus[i];
    if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(sku) || !between(sku.length, 3, 40)) e[`variant-${i}-sku`] = 'SKU no válido.';
    else if (skus.indexOf(sku) !== i) e[`variant-${i}-sku`] = 'SKU repetido.';
    if (!between(Number(v.price), 0, 9999) || v.price === '') e[`variant-${i}-price`] = 'Precio entre 0 y 9999.';
    if (!Number.isInteger(Number(v.stock)) || !between(Number(v.stock), 0, 100000) || v.stock === '') {
      e[`variant-${i}-stock`] = 'Stock entero entre 0 y 100000.';
    }
  });
  if (p.is_active && !p.variants.some(v => v.is_active)) {
    e.variants = 'Un producto visible necesita al menos una versión activa.';
  }

  if (p.images.length > 10) e.images = 'Como máximo 10 imágenes.';
  p.images.forEach((img, i) => {
    if (!/^img\/[A-Za-z0-9._/-]+$/.test(img.url) && !/^https:\/\/[^\s"<>]+$/.test(img.url)) {
      e[`image-${i}-url`] = 'Debe empezar por img/ o https://';
    }
    if (!between(img.alt_text.trim().length, 3, 200)) e[`image-${i}-alt_text`] = 'Describe la imagen (3-200 caracteres).';
  });
  return e;
}

/**
 * Prepara una foto para la tienda: recorte centrado a 800×840 (el formato de las fichas)
 * y JPEG de calidad 0,85. Así pesa poco y todas las imágenes quedan iguales.
 */
export async function prepareImage(file, width = 800, height = 840) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Formato no admitido: usa JPG, PNG o WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('La imagen pesa más de 15 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const sw = width / scale, sh = height / scale;
  const sx = (bitmap.width - sw) / 2, sy = (bitmap.height - sh) / 2;
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se ha podido procesar la imagen.'))), 'image/jpeg', 0.85));
}
