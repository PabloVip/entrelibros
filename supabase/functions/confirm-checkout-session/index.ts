// Edge Function: al volver de Stripe, pedido.html manda { session_id } y aquí se pregunta a Stripe
// si esa sesión está pagada. Solo entonces se registra el pago (confirm_stripe_payment).
// Devuelve el resultado de la función SQL, o { status: 'pendiente' } si Stripe aún no lo ha cobrado.
import { confirmPaidSession, corsHeaders, errorResponse, HttpError, json, SESSION_RE, stripeClient } from '../_shared/stripe.ts';

Deno.serve(async req => {
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers }); // comprobación CORS del navegador
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405, headers);

  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.session_id ?? '');
    if (!SESSION_RE.test(sessionId)) throw new HttpError(400, 'Sesión de Stripe no válida');
    return json(await confirmPaidSession(stripeClient(), sessionId), 200, headers);
  } catch (err) {
    return errorResponse(err, headers);
  }
});
