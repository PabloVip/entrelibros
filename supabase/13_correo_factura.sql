-- =========================================================
-- Entrelibros · Correo de confirmación con la factura en PDF (Pablo)
-- Ejecutar después de los demás. Se puede ejecutar varias veces.
--
-- orders.confirmation_email_at: cuándo se envió el correo de confirmación del pedido.
-- Las Edge Functions (orderEmail.ts) lo marcan ANTES de enviar con
--   update orders set confirmation_email_at = now() where … and confirmation_email_at is null
-- para que, si llegan dos peticiones a la vez (vuelta de Stripe, webhook, página del pedido),
-- solo una envíe el correo. Si el envío falla, se vuelve a poner a null para poder reintentar.
-- =========================================================

alter table public.orders add column if not exists confirmation_email_at timestamptz;

-- Los pedidos que ya existían no reciben el correo de golpe al abrir su página:
-- se marcan como enviados (se puede pedir igualmente con "Enviar la factura a mi correo").
update public.orders set confirmation_email_at = coalesce(confirmation_email_at, created_at)
 where confirmation_email_at is null
   and status in ('pago_simulado', 'pendiente_preparacion', 'enviado', 'entregado', 'incidencia');

notify pgrst, 'reload schema';
