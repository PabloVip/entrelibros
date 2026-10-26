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

/** Token para seguir la incidencia en Telegram (t.me/<bot>?start=<token>); null si no coincide el email. */
export async function telegramToken(ticketNumber, email) {
  const { data, error } = await supabase.rpc('support_telegram_token', { p_ticket: ticketNumber, p_email: email });
  if (error) throw error;
  return data;
}
