// Pedidos para el back-office. RLS solo deja leerlos a administradores.
import { supabase } from '../core/supabase.js';

export async function listOrders({ status, q } = {}) {
  let query = supabase
    .from('orders')
    .select(`id, order_number, status, total, created_at, updated_at, shipping_cost, discount_code,
             customer:customers!inner ( email, full_name ),
             items:order_items ( quantity )`)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status) query = query.eq('status', status);
  if (q) {
    query = q.includes('@')
      ? query.ilike('customer.email', `%${q}%`)
      : query.ilike('order_number', `%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getOrder(id) {
  const { data, error } = await supabase
    .from('orders')
    .select(`*,
      customer:customers ( id, email, full_name, phone ),
      shipping:shipping_methods ( name, eta_days_min, eta_days_max ),
      items:order_items ( id, product_name, variant_name, sku, unit_price, quantity, line_total ),
      payments ( id, method, amount, status, transaction_ref, card_last4, failure_reason, created_at ),
      history:order_status_history ( id, from_status, to_status, changed_by, note, created_at )`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** El servidor valida permisos y transición; aquí solo se llama. */
export async function updateOrderStatus(orderId, newStatus, note) {
  const { data, error } = await supabase.rpc('admin_update_order_status', {
    p_order_id: orderId,
    p_new_status: newStatus,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}
