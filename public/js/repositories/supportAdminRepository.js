// Incidencias de soporte para el back-office. RLS solo deja leerlas a administradores.
import { supabase } from '../core/supabase.js';

/** @param {{status?: 'pendientes'|'abierta'|'en_curso'|'resuelta', reason?: string, orderId?: number}} f */
export async function listSupportRequests(f = {}) {
  let query = supabase
    .from('support_requests')
    .select('id, ticket_number, customer_email, reason, message, status, created_at, order:orders ( id, order_number )')
    .order('created_at', { ascending: false })
    .limit(200);

  if (f.status === 'pendientes') query = query.in('status', ['abierta', 'en_curso']);
  else if (f.status)             query = query.eq('status', f.status);
  if (f.reason)  query = query.eq('reason', f.reason);
  if (f.orderId) query = query.eq('order_id', f.orderId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** Nº de incidencias sin resolver (abiertas + en curso) */
export async function countPendingSupport() {
  const { count, error } = await supabase
    .from('support_requests')
    .select('id', { count: 'exact', head: true })
    .in('status', ['abierta', 'en_curso']);
  if (error) throw error;
  return count ?? 0;
}

/** El servidor valida permisos y transición. */
export async function updateSupportStatus(id, newStatus) {
  const { data, error } = await supabase.rpc('admin_update_support_status', {
    p_id: id,
    p_new_status: newStatus,
  });
  if (error) throw error;
  return data;
}
