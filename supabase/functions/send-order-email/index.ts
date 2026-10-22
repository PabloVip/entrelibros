// Edge Function: envía (o reenvía) el correo de confirmación del pedido con la factura en PDF.
// La llama la página del pedido (pedido.html) con { order_number, email, lang, resend? }:
//   · al abrir un pedido pagado (pagos simulados: tarjeta y Bizum; en Stripe ya lo envió el pago);
//   · con el botón "Enviar la factura a mi correo".
// Va sin JWT (verify_jwt = false en config.toml): se compra sin cuenta. Lo que la protege:
//   · el número de pedido y el email tienen que coincidir (como en get_order_summary);
//   · el correo solo va al email del pedido, solo si está pagado, una vez, y reenviar exige 2 minutos.
import { corsHeaders, db, errorResponse, HttpError, json, ORDER_RE, siteUrl } from '../_shared/stripe.ts';
import { sendOrderConfirmation } from '../_shared/orderEmail.ts';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async req => {
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405, headers);

  try {
    const body = await req.json().catch(() => ({}));
    const orderNumber = String(body.order_number ?? '').trim().toUpperCase();
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!ORDER_RE.test(orderNumber) || !EMAIL_RE.test(email) || email.length > 254) {
      throw new HttpError(400, 'Pedido o email no válidos');
    }

    // El pedido tiene que ser de ese email (si no, la misma respuesta que si no existiera)
    const client = db();
    const { data: order, error } = await client
      .from('orders').select('order_number, customer:customers!inner ( email )')
      .eq('order_number', orderNumber).eq('customer.email', email).maybeSingle();
    if (error) throw error;
    if (!order) throw new HttpError(404, 'Pedido no encontrado');

    const lang = body.lang === 'en' ? 'en' : 'es';
    const result = await sendOrderConfirmation(client, orderNumber, lang, siteUrl(req), { resend: body.resend === true });
    return json({ sent: result.sent, reason: result.reason ?? null }, 200, headers);
  } catch (err) {
    return errorResponse(err, headers);
  }
});
