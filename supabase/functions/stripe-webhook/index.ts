// Edge Function: aviso de Stripe (webhook) cuando se completa un pago. Confirma el pedido aunque el
// cliente cierre la pestaña antes de volver a la tienda.
// Va sin JWT (Stripe no tiene uno: verify_jwt = false en config.toml). Lo que garantiza que el aviso
// viene de Stripe es la FIRMA de la cabecera Stripe-Signature, comprobada con STRIPE_WEBHOOK_SECRET.
// En el panel de Stripe: Developers → Webhooks → endpoint …/functions/v1/stripe-webhook con los
// eventos checkout.session.completed y checkout.session.async_payment_succeeded.
import Stripe from 'npm:stripe@17.7.0';
import { confirmPaidSession, HttpError, json, stripeClient } from '../_shared/stripe.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider(); // Web Crypto de Deno para comprobar la firma
const PAID_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  if (!secret) {
    console.error('[webhook] falta STRIPE_WEBHOOK_SECRET');
    return json({ error: 'Webhook sin configurar' }, 500); // Stripe lo reintentará más tarde
  }

  // La firma se calcula sobre el cuerpo EXACTO: se lee como texto, sin convertirlo a JSON antes
  const body = await req.text();
  let stripe: Stripe;
  let event: Stripe.Event;
  try {
    stripe = stripeClient();
    event = await stripe.webhooks.constructEventAsync(
      body, req.headers.get('Stripe-Signature') ?? '', secret, undefined, cryptoProvider);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    return json({ error: 'Firma no válida' }, 400); // no es de Stripe (o se ha modificado por el camino)
  }

  if (PAID_EVENTS.includes(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      const result = await confirmPaidSession(stripe, session.id);
      console.log('[webhook]', event.type, JSON.stringify(result));
    } catch (err) {
      // Errores del pedido (ya pagado con otra sesión, importe distinto…): repetir el aviso no los
      // arregla. Se responde 200 para que Stripe no reintente y queda en los logs para revisarlo.
      const code = (err as { code?: string })?.code;
      if (err instanceof HttpError || code === '22023' || code === 'P0002') {
        console.error('[webhook] pago no registrado:', session.id, (err as Error).message);
        return json({ received: true, error: (err as Error).message });
      }
      // Fallo temporal (BD o Stripe no responden): 500 y Stripe vuelve a avisar más tarde
      console.error('[webhook]', err);
      return json({ error: 'Error temporal' }, 500);
    }
  }
  return json({ received: true }); // otros eventos: no hacen falta, se confirman y ya
});
