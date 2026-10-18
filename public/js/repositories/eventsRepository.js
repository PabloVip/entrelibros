// Consulta de eventos de negocio (solo administradores, por RLS).
import { supabase } from '../core/supabase.js';

export const FUNNEL = [
  'product.viewed', 'cart.item_added', 'checkout.started',
  'order.created', 'payment.simulated', 'support.requested',
];

function applyFilters(query, f) {
  if (f.type)    query = query.eq('event_type', f.type);
  if (f.orderId) query = query.eq('order_id', f.orderId);
  if (f.from)    query = query.gte('occurred_at', f.from);
  if (f.to)      query = query.lte('occurred_at', f.to);
  return query;
}

export async function listEvents(f = {}, limit = 200) {
  const query = applyFilters(
    supabase.from('events').select('*').order('occurred_at', { ascending: false }).limit(limit), f);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** Nº de eventos de cada tipo del embudo (consultas solo de conteo) */
export async function countByType(f = {}) {
  const results = await Promise.all(FUNNEL.map(type =>
    applyFilters(supabase.from('events').select('id', { count: 'exact', head: true }), { ...f, type })));
  const failed = results.find(r => r.error);
  if (failed) throw failed.error;
  return Object.fromEntries(FUNNEL.map((t, i) => [t, results[i].count ?? 0]));
}
