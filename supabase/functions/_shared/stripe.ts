// Código común de las Edge Functions de Stripe: create-checkout-session, confirm-checkout-session
// y stripe-webhook. Supabase sube la carpeta _shared junto a cada función que la importa.
//
// Las claves secretas (Stripe y Supabase) solo existen aquí, en el servidor, como "secrets" de
// Supabase (Edge Functions → Secrets). Nunca están en el navegador ni en el repositorio.
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export const ORDER_RE = /^EL-[0-9]{8}-[A-Z0-9]{4}$/;
export const SESSION_RE = /^cs_test_[A-Za-z0-9]{10,200}$/; // solo sesiones de prueba

// ---------- Respuestas y errores ----------

/** Error con código HTTP y un mensaje en español que se puede enseñar al cliente. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

/**
 * Convierte cualquier error en una respuesta {error}. Los mensajes de validación de la BD
 * (22023, P0002) ya están en español y se pasan tal cual; el resto solo va a los logs.
 */
export function errorResponse(err: unknown, headers: HeadersInit): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status, headers);
  const code = (err as { code?: string })?.code;
  if (code === '22023') return json({ error: (err as Error).message }, 409, headers);
  if (code === 'P0002') return json({ error: (err as Error).message }, 404, headers);
  console.error(err); // se ve en el panel de Supabase (logs de la función), nunca en el navegador
  if (err instanceof Stripe.errors.StripeError) return json({ error: 'Stripe no ha podido procesar el pago' }, 502, headers);
  return json({ error: 'Error interno del pago' }, 500, headers);
}

// ---------- CORS y vuelta desde Stripe ----------

// Webs desde las que se puede llamar a las funciones, y a qué dirección vuelve el cliente desde
// Stripe. Es una lista cerrada: así nadie puede usar la función para redirigir a otra web.
const SITES: Record<string, string> = {
  'https://pablovip.github.io': 'https://pablovip.github.io/entrelibros/',
  'http://localhost:8000': 'http://localhost:8000/',
  'http://127.0.0.1:8000': 'http://127.0.0.1:8000/',
};
const DEFAULT_ORIGIN = 'https://pablovip.github.io';

/** Cabeceras CORS: el navegador solo deja leer la respuesta a las webs de la lista. */
export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': SITES[origin] ? origin : DEFAULT_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

/** Dirección base de la tienda que ha hecho la petición (con su carpeta: /entrelibros/ en GitHub Pages). */
export function siteUrl(req: Request): string {
  return SITES[req.headers.get('Origin') ?? ''] ?? SITES[DEFAULT_ORIGIN];
}

// ---------- Clientes de Stripe y de la base de datos ----------

/** Cliente de Stripe. Solo acepta claves de prueba: el prototipo nunca debe cobrar dinero real. */
export function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!/^(sk|rk)_test_/.test(key)) throw new HttpError(500, 'Falta la clave de prueba de Stripe en el servidor');
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() }); // fetch de Deno, no el http de Node
}

/**
 * Cliente de Supabase con la clave secreta (rol service_role: se salta RLS y puede llamar a
 * confirm_stripe_payment). Supabase la pone sola en el entorno de la función: la nueva
 * (SUPABASE_SECRET_KEYS, un JSON por nombre) o la antigua (SUPABASE_SERVICE_ROLE_KEY).
 */
export function db() {
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  try {
    key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? key;
  } catch { /* sin claves nuevas: se usa la antigua */ }
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------- Confirmación del pago ----------

/**
 * Pregunta a Stripe por la sesión y, si está pagada, registra el pago con confirm_stripe_payment.
 * La usan la vuelta del cliente (confirm-checkout-session) y el aviso de Stripe (stripe-webhook):
 * si llegan los dos, la función SQL detecta el segundo y no cobra dos veces.
 * Se pregunta SIEMPRE a Stripe: no nos fiamos de lo que diga el navegador.
 */
export async function confirmPaidSession(stripe: Stripe, sessionId: string) {
  if (!SESSION_RE.test(sessionId)) throw new HttpError(400, 'Sesión de Stripe no válida');
  // expand: Stripe incluye el pago y la tarjeta en la misma respuesta (para los 4 últimos dígitos)
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.payment_method'] });

  const orderNumber = session.metadata?.order_number ?? '';
  if (!ORDER_RE.test(orderNumber)) throw new HttpError(400, 'La sesión de Stripe no es de un pedido de la tienda');
  if (session.payment_status !== 'paid') return { order_number: orderNumber, status: 'pendiente' };
  if (session.currency !== 'eur' || session.amount_total == null) {
    throw new HttpError(409, 'La moneda o el importe del pago no son válidos');
  }

  const intent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
  const method = typeof intent?.payment_method === 'object' ? intent.payment_method : null;
  const { data, error } = await db().rpc('confirm_stripe_payment', {
    p_order_number: orderNumber,
    p_session_id:   session.id,
    p_amount:       session.amount_total / 100, // Stripe trabaja en céntimos
    p_card_last4:   method?.card?.last4 ?? null,
  });
  if (error) throw error;
  return data;
}
