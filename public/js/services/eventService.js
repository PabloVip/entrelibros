// Servicio de eventos de negocio.
// Desde el navegador solo se envían eventos de navegación (product.viewed, cart.item_added,
// checkout.started). order.created, payment.simulated y support.requested los genera el
// servidor dentro de sus funciones (ver supabase/03_functions.sql).
import { supabase } from '../core/supabase.js';
import { getSessionId } from '../core/session.js';

export const EVENTS = Object.freeze({
  PRODUCT_VIEWED:   'product.viewed',
  CART_ITEM_ADDED:  'cart.item_added',
  CHECKOUT_STARTED: 'checkout.started',
});

/**
 * Registra un evento. Nunca lanza excepción: un fallo de analítica
 * no debe romper la compra; se avisa por consola.
 */
export async function track(eventType, { entityType = null, entityId = null, payload = {} } = {}) {
  try {
    const { data, error } = await supabase.rpc('log_event', {
      p_event_type:  eventType,
      p_session_id:  getSessionId(),
      p_entity_type: entityType,
      p_entity_id:   entityId != null ? String(entityId) : null,
      p_payload:     { ...payload, page: location.pathname },
    });
    if (error) throw error;
    return data; // event_id (uuid)
  } catch (err) {
    console.warn('[eventos] no se pudo registrar', eventType, err);
    return null;
  }
}
