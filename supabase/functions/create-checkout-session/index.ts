// Edge Function: crea la página de pago de Stripe (Checkout Session) de un pedido en estado "creado".
// La llama pago.html con { order_number, lang } y devuelve { url } para llevar al cliente a Stripe.
// El importe sale de la BD (orders.total): el navegador solo dice QUÉ pedido quiere pagar.
import { corsHeaders, db, errorResponse, HttpError, json, ORDER_RE, siteUrl, stripeClient } from '../_shared/stripe.ts';

// Forma de la consulta. Sin tipos generados, supabase-js no sabe que el cliente y la variante
// son una sola fila (relación muchos-a-uno), así que se le indica aquí.
type OrderRow = {
  order_number: string;
  status: string;
  total: number;
  customer: { email: string } | null;
  items: { quantity: number; product_name: string; variant: { stock: number } | null }[];
};

Deno.serve(async req => {
  const headers = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers }); // comprobación CORS del navegador
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405, headers);

  try {
    const body = await req.json().catch(() => ({}));
    const orderNumber = String(body.order_number ?? '').trim().toUpperCase();
    if (!ORDER_RE.test(orderNumber)) throw new HttpError(400, 'El número de pedido no es válido');

    const { data: order, error } = await db()
      .from('orders')
      .select('order_number, status, total, customer:customers ( email ), items:order_items ( quantity, product_name, variant:product_variants ( stock ) )')
      .eq('order_number', orderNumber)
      .maybeSingle<OrderRow>();
    if (error) throw error;
    if (!order) throw new HttpError(404, 'Pedido no encontrado');
    if (order.status !== 'creado') throw new HttpError(409, 'Este pedido ya está pagado o no admite pagos');

    // Antes de cobrar se mira el stock (al confirmar el pago se vuelve a comprobar y se descuenta)
    const missing = order.items.find(i => i.quantity > (i.variant?.stock ?? 0));
    if (missing) throw new HttpError(409, `No queda stock suficiente de "${missing.product_name}"`);

    const site = siteUrl(req);
    const email = order.customer?.email ?? '';
    const back = `pedido=${encodeURIComponent(orderNumber)}`;
    const session = await stripeClient().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(Number(order.total) * 100), // en céntimos: 74,63 € → 7463
          product_data: { name: `Pedido ${orderNumber} · Entrelibros` },
        },
      }],
      customer_email: email || undefined,
      client_reference_id: orderNumber,
      metadata: { order_number: orderNumber },                   // así confirm y el webhook saben qué pedido es
      payment_intent_data: { metadata: { order_number: orderNumber } },
      locale: body.lang === 'en' ? 'en' : 'es',
      // Stripe cambia {CHECKOUT_SESSION_ID} por el id de la sesión al volver (no se codifica)
      success_url: `${site}pedido.html?${back}&email=${encodeURIComponent(email)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}pago.html?${back}&cancelado=1`,
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60,       // caduca a los 35 minutos (Stripe pide 30 como mínimo)
    });

    return json({ url: session.url }, 200, headers);
  } catch (err) {
    return errorResponse(err, headers);
  }
});
