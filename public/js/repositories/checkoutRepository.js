// Acceso a datos del checkout: métodos de envío (lectura pública) y funciones del servidor.
// Los pedidos no se insertan desde aquí: RLS lo impide; se crean con rpc('create_order').
import { supabase } from '../core/supabase.js';

export async function fetchShippingMethods() {
  const { data, error } = await supabase
    .from('shipping_methods')
    .select('id, code, name, price, free_from, eta_days_min, eta_days_max')
    .order('price');
  if (error) throw error;
  return data;
}

/** Descuento orientativo para el resumen. Devuelve {valid, code, description, discount_amount} o {valid:false, reason}. */
export async function validateDiscount(code, subtotal) {
  const { data, error } = await supabase.rpc('validate_discount', { p_code: code, p_subtotal: subtotal });
  if (error) throw error;
  return data;
}

/** Crea el pedido. Solo se mandan variante y cantidad: el servidor pone precios e importes. */
export async function createOrder({ customer, shipping, items, shippingCode, discountCode, sessionId }) {
  const { data, error } = await supabase.rpc('create_order', {
    p_customer:      customer,
    p_shipping:      shipping,
    p_items:         items,
    p_shipping_code: shippingCode,
    p_discount_code: discountCode || null,
    p_session_id:    sessionId,
  });
  if (error) throw error;
  return data;
}

/** Pago simulado. Devuelve {order_number, status, transaction_ref, amount, failure_reason}. */
export async function simulatePayment(orderNumber, method, cardNumber) {
  const { data, error } = await supabase.rpc('simulate_payment', {
    p_order_number: orderNumber,
    p_method:       method,
    p_card_number:  cardNumber || null,
  });
  if (error) throw error;
  return data;
}

/** Pedido para la confirmación; null si el número y el email no coinciden. */
export async function getOrderSummary(orderNumber, email) {
  const { data, error } = await supabase.rpc('get_order_summary', { p_order_number: orderNumber, p_email: email });
  if (error) throw error;
  return data;
}
