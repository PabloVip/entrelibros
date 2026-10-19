// Datos del panel de inicio y del listado de clientes (back-office, solo lectura).
import { supabase } from '../core/supabase.js';

/** Pedidos desde una fecha, con sus líneas, para calcular ventas y productos más vendidos. */
export async function ordersSince(isoDate) {
  const { data, error } = await supabase
    .from('orders')
    .select(`id, order_number, status, total, discount_amount, shipping_cost, created_at,
             customer:customers ( full_name, email ),
             items:order_items ( product_name, quantity, line_total )`)
    .gte('created_at', isoDate)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data;
}

/** Productos activos con alguna versión agotada o con poco stock. */
export async function stockAlerts() {
  const { data, error } = await supabase
    .from('admin_products')
    .select('id, name, total_stock, variants_out, variants_low')
    .eq('is_active', true)
    .or('variants_out.gt.0,variants_low.gt.0')
    .order('total_stock');
  if (error) throw error;
  return data;
}

/** Visitas a fichas y sesiones distintas en el periodo (eventos de la web). */
export async function trafficSince(isoDate) {
  const head = { count: 'exact', head: true };
  const [views, carts, checkouts] = await Promise.all(
    ['product.viewed', 'cart.item_added', 'checkout.started'].map(type =>
      supabase.from('events').select('id', head).eq('event_type', type).gte('occurred_at', isoDate)));
  for (const r of [views, carts, checkouts]) if (r.error) throw r.error;
  return { views: views.count ?? 0, carts: carts.count ?? 0, checkouts: checkouts.count ?? 0 };
}

/** Clientes con sus pedidos (importe y fecha) para calcular gasto y recurrencia. */
export async function listCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*, orders ( id, order_number, status, total, created_at )') // * incluye user_id (09_cuentas_clientes.sql)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data;
}
