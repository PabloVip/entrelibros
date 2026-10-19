// Acceso a datos del catálogo. Solo consultas: nada de lógica de interfaz aquí.
import { supabase } from '../core/supabase.js';
import { originalsMatching, learn, lang } from '../core/i18n.js';

// Textos en inglés guardados en la base de datos (columnas *_en, se editan en el back-office):
// se le pasan al traductor para que la web en inglés los use.
const PAIRS = [['name', 'name_en'], ['short_description', 'short_description_en'],
  ['description', 'description_en'], ['theme_name', 'theme_name_en']];
function learnRows(rows) {
  if (lang === 'es' || !rows) return rows;
  const pairs = [];
  const visit = row => {
    if (!row || typeof row !== 'object') return;
    for (const [es, en] of PAIRS) if (row[es] && row[en]) pairs.push([row[es], row[en]]);
    ['theme', 'product'].forEach(k => visit(row[k]));
    (row.variants ?? []).forEach(visit);
  };
  (Array.isArray(rows) ? rows : [rows]).forEach(visit);
  learn(pairs);
  return rows;
}

const SORTS = {
  precio_asc:  ['min_price', true],
  precio_desc: ['min_price', false],
  nombre:      ['name', true],
  novedades:   ['created_at', false],
};

export async function fetchThemes() {
  const { data, error } = await supabase
    .from('themes')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return learnRows(data);
}

/**
 * Lista el catálogo aplicando filtros en el servidor (vista catalog_products).
 * @param {{type?, theme?, difficulty?, lighting?, maxWidth?, maxPrice?, q?, sort?, limit?}} f
 */
export async function fetchCatalog(f = {}) {
  let query = supabase.from('catalog_products').select('*', { count: 'exact' });

  if (f.type)                query = query.eq('product_type', f.type);
  if (f.theme)               query = query.eq('theme_slug', f.theme);
  if (f.difficulty)          query = query.eq('difficulty', f.difficulty);
  if (f.lighting === 'con')  query = query.eq('has_lit_option', true);
  if (f.lighting === 'sin')  query = query.eq('has_unlit_option', true);
  if (f.maxWidth)            query = query.lte('width_mm', f.maxWidth);
  if (f.maxPrice)            query = query.lte('min_price', f.maxPrice);
  if (f.q) {
    // En inglés también se busca por el nombre traducido (diccionario js/i18n/en.js)
    const names = originalsMatching(f.q);
    if (names.length) {
      const safe = f.q.replace(/[,()"*\\]/g, ' ');
      const list = names.map(n => `"${n.replace(/["\\]/g, '')}"`).join(',');
      query = query.or(`name.ilike.*${safe}*,name_en.ilike.*${safe}*,name.in.(${list})`);
    } else if (lang !== 'es') {
      const safe = f.q.replace(/[,()"*\\]/g, ' ');
      query = query.or(`name.ilike.*${safe}*,name_en.ilike.*${safe}*`);
    } else {
      query = query.ilike('name', `%${f.q}%`);
    }
  }

  const sort = SORTS[f.sort];
  if (sort) query = query.order(sort[0], { ascending: sort[1] });
  query = query.order('name');
  if (f.limit) query = query.limit(f.limit);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: learnRows(data), total: count };
}

/** Producto completo para la ficha: temática, variantes e imágenes. null si no existe o está inactivo. */
export async function fetchProductBySlug(slug) {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      theme:themes ( * ),
      variants:product_variants ( * ),
      images:product_images ( id, url, alt_text, sort_order, variant_id )
    `)
    .eq('slug', slug)
    .eq('is_active', true) // un admin con sesión abierta también ve archivados: aquí no deben salir
    .maybeSingle();
  if (error) throw error;
  if (data) data.variants = data.variants.filter(v => v.is_active !== false);
  return learnRows(data);
}

/**
 * Varios productos del catálogo por id (para la página de favoritos).
 * Los que ya no están a la venta no vienen: la vista y RLS solo devuelven productos activos.
 */
export async function fetchCatalogByIds(ids) {
  const { data, error } = await supabase
    .from('catalog_products')
    .select('*')
    .in('id', ids);
  if (error) throw error;
  return learnRows(data);
}

/**
 * Precio y stock actuales de varias variantes (para revisar el carrito).
 * RLS oculta lo que ya no está a la venta: la variante no viene, o viene con product = null.
 */
export async function fetchVariantsByIds(ids) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*, product:products ( * )')
    .in('id', ids);
  if (error) throw error;
  // lo mismo que hace RLS para un visitante, también si hay un admin con sesión abierta
  const visible = data.filter(v => v.is_active !== false)
    .map(v => (v.product?.is_active === false ? { ...v, product: null } : v));
  return learnRows(visible);
}

/**
 * Productos relacionados por compatibilidad:
 *  - si es un kit → accesorios y recambios compatibles con él
 *  - si es accesorio/recambio → kits con los que es compatible
 */
export async function fetchCompatible(product) {
  const isKit = product.product_type === 'kit';
  const { data: links, error } = await supabase
    .from('product_compatibility')
    .select('product_id, compatible_with_id')
    .eq(isKit ? 'compatible_with_id' : 'product_id', product.id);
  if (error) throw error;

  const ids = links.map(l => (isKit ? l.product_id : l.compatible_with_id));
  if (ids.length === 0) return [];

  const { data, error: err2 } = await supabase
    .from('catalog_products')
    .select('*')
    .in('id', ids)
    .order('product_type')
    .order('name');
  if (err2) throw err2;
  return learnRows(data);
}
