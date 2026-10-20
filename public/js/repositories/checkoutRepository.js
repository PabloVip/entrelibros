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

// ---------- Pago con Stripe (Edge Functions en supabase/functions/) ----------

/**
 * Llama a una Edge Function. Si falla, lanza un Error con:
 *  - message: el texto {error} que manda la función (ya en español), si lo hay
 *  - status: código HTTP (401 o 404 = la función aún no está desplegada o configurada)
 *  - fromServer: true si el mensaje viene de la función y se puede enseñar al cliente
 */
async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data;
  const response = error.context instanceof Response ? error.context : null;
  let message = '';
  try { message = (await response?.json())?.error ?? ''; } catch { /* respuesta sin JSON */ }
  throw Object.assign(new Error(message || error.message), { status: response?.status ?? 0, fromServer: Boolean(message) });
}

/** Crea la página de pago de Stripe del pedido. Devuelve { url } (checkout.stripe.com). */
export function createStripeCheckout(orderNumber, lang) {
  return invoke('create-checkout-session', { order_number: orderNumber, lang });
}

/** Pedido para la confirmación; null si el número y el email no coinciden. */
export async function getOrderSummary(orderNumber, email) {
  const { data, error } = await supabase.rpc('get_order_summary', { p_order_number: orderNumber, p_email: email });
  if (error) throw error;
  return data;
}
