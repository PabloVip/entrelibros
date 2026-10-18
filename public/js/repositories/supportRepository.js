// Soporte postventa. Las incidencias no se insertan desde aquí (RLS): se crean con rpc.
import { supabase } from '../core/supabase.js';

/** Devuelve {ticket_number, order_linked}. */
export async function createSupportRequest({ email, orderNumber, reason, message }) {
  const { data, error } = await supabase.rpc('create_support_request', {
    p_email:        email,
    p_order_number: orderNumber || null,
    p_reason:       reason,
    p_message:      message,
  });
  if (error) throw error;
  return data;
}
