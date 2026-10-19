// Acceso a datos del catálogo. Solo consultas: nada de lógica de interfaz aquí.
import { supabase } from '../core/supabase.js';
import { originalsMatching } from '../core/i18n.js';

const SORTS = {
  precio_asc:  ['min_price', true],
  precio_desc: ['min_price', false],
  nombre:      ['name', true],
  novedades:   ['created_at', false],
};

export async function fetchThemes() {
  const { data, error } = await supabase
    .from('themes')
    .select('id, slug, name, description')
    .order('sort_order');
  if (error) throw error;
  return data;
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
      query = query.or(`name.ilike.*${safe}*,name.in.(${list})`);
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
  return { items: data, total: count };
}

/** Producto completo para la ficha: temática, variantes e imágenes. null si no existe o está inactivo. */
export async function fetchProductBySlug(slug) {
  const { data, error } = await supabase
    .from('products')
    .select(`
      id, slug, name, product_type, difficulty, width_mm, height_mm, depth_mm,
      pieces_count, build_time_hours, short_description, description,
      theme:themes ( slug, name ),
      variants:product_variants ( id, sku, name, has_lighting, finish, price, stock, weight_g, is_default ),
      images:product_images ( id, url, alt_text, sort_order, variant_id )
    `)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Precio y stock actuales de varias variantes (para revisar el carrito).
 * RLS oculta lo que ya no está a la venta: la variante no viene, o viene con product = null.
 */
export async function fetchVariantsByIds(ids) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, sku, name, price, stock, product:products ( id, slug, name )')
    .in('id', ids);
  if (error) throw error;
  return data;
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
  return data;
}
