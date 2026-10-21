// Catálogo y ajustes de la tienda para el back-office.
// Lectura: RLS solo enseña archivados, descuentos, etc. a administradores.
// Escritura: siempre con funciones del servidor (supabase/08_admin_catalogo.sql), que validan.
import { supabase } from '../core/supabase.js';

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

// ---------- Productos ----------
export async function listAdminProducts() {
  const { data, error } = await supabase
    .from('admin_products')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Producto completo para el editor (también si está archivado). */
export async function getProductForEdit(id) {
  const { data, error } = await supabase
    .from('products')
    .select(`*,
      variants:product_variants ( * ),
      images:product_images ( id, url, alt_text, sort_order, color ),
      compat:product_compatibility!product_compatibility_product_id_fkey ( compatible_with_id )`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.variants.sort((a, b) => a.id - b.id);
  data.images.sort((a, b) => a.sort_order - b.sort_order);
  return data;
}

/** ¿Hay pedidos con alguna variante de este producto? (para saber si se puede borrar) */
export async function productHasOrders(id) {
  const { data, error } = await supabase.from('admin_products').select('has_orders, units_sold, revenue').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Kits para la lista de compatibilidades. */
export async function listKits() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, is_active')
    .eq('product_type', 'kit')
    .order('name');
  if (error) throw error;
  return data;
}

export async function listThemes() {
  const { data, error } = await supabase.from('themes').select('*').order('sort_order');
  if (error) throw error;
  return data;
}

export const saveProduct      = product => rpc('admin_save_product', { p_product: product });
export const setProductActive = (id, active) => rpc('admin_set_product_active', { p_id: id, p_active: active });
export const deleteProduct    = id => rpc('admin_delete_product', { p_id: id });
export const adjustStock      = (variantId, stock, note) =>
  rpc('admin_adjust_stock', { p_variant_id: variantId, p_stock: stock, p_note: note ?? null });

/** Variantes de varios productos (ajuste rápido de stock en el listado). */
export async function listVariantsOf(productIds) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, product_id, sku, name, stock, is_active')
    .in('product_id', productIds)
    .order('id');
  if (error) throw error;
  return data;
}

// ---------- Imágenes (Supabase Storage, bucket "productos") ----------
/**
 * Sube una imagen ya preparada (JPEG) y devuelve su URL pública.
 * El bucket y sus permisos se crean en 08_admin_catalogo.sql: solo los admins pueden subir.
 */
export async function uploadProductImage(blob, slug) {
  const safe = (slug || 'producto').replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'producto';
  const path = `${safe}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await supabase.storage.from('productos').upload(path, blob, {
    contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from('productos').getPublicUrl(path).data.publicUrl;
}

// ---------- Temáticas ----------
export const saveTheme   = theme => rpc('admin_save_theme', { p_theme: theme });
export const deleteTheme = id => rpc('admin_delete_theme', { p_id: id });

// ---------- Descuentos y envíos ----------
export async function listDiscounts() {
  const { data, error } = await supabase.from('discount_codes').select('*').order('id');
  if (error) throw error;
  return data;
}

/** Cuántos pedidos (no cancelados) han usado cada código. */
export async function discountUsage() {
  const { data, error } = await supabase
    .from('orders')
    .select('discount_code, discount_amount, status')
    .not('discount_code', 'is', null);
  if (error) throw error;
  const usage = {};
  for (const o of data) {
    if (o.status === 'cancelado') continue;
    const u = (usage[o.discount_code] ??= { orders: 0, amount: 0 });
    u.orders += 1;
    u.amount += Number(o.discount_amount);
  }
  return usage;
}

export const saveDiscount = discount => rpc('admin_save_discount', { p_discount: discount });

export async function listShippingMethods() {
  const { data, error } = await supabase.from('shipping_methods').select('*').order('id');
  if (error) throw error;
  return data;
}

export const saveShippingMethod = method => rpc('admin_save_shipping_method', { p_method: method });
