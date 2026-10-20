-- =========================================================
-- Entrelibros · Pago con Stripe en modo prueba (Nino)
-- Ejecutar DESPUÉS de 01 → 09. Se puede ejecutar varias veces.
--
-- Flujo: pago.html → Edge Function create-checkout-session → página de pago de Stripe
--        → vuelta a pedido.html → Edge Function confirm-checkout-session (y webhook)
--        → confirm_stripe_payment (esta función).
-- El pago solo se marca como hecho cuando una Edge Function ha preguntado a Stripe y
-- Stripe dice que la sesión está pagada. Por eso el navegador NO puede llamar a esta
-- función: si pudiera, cualquiera marcaría pedidos como pagados sin pagar.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Método de pago nuevo: 'stripe_test'
--    La restricción de 01_schema.sql (check en la columna) se llama payments_method_check.
-- ---------------------------------------------------------
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('tarjeta_simulada', 'bizum_simulado', 'stripe_test'));

-- ---------------------------------------------------------
-- 2. confirm_stripe_payment: registra el pago de una sesión de Stripe ya cobrada
--   p_order_number: número del pedido (va en la metadata de la sesión)
--   p_session_id:   id de la sesión de Stripe (cs_test_…); se guarda en transaction_ref
--   p_amount:       importe cobrado por Stripe, en euros (amount_total / 100)
--   p_card_last4:   4 últimos dígitos de la tarjeta, si Stripe los da
-- Mismo efecto que la rama "aprobado" de simulate_payment (05_checkout.sql):
-- pago, stock, estado, historial y evento payment.simulated con method = 'stripe_test'.
-- Devuelve {order_number, status, order_status, transaction_ref, amount, already_confirmed}
-- ---------------------------------------------------------
create or replace function public.confirm_stripe_payment(
  p_order_number text,
  p_session_id   text,
  p_amount       numeric,
  p_card_last4   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order      public.orders%rowtype;
  v_payment    public.payments%rowtype;
  v_item       record;
  v_new_status text := 'pago_simulado';
  v_note       text;
begin
  -- Solo sesiones de prueba (cs_test_…): el prototipo nunca debe aceptar un cobro real
  if p_session_id is null or p_session_id !~ '^cs_test_[A-Za-z0-9]{10,200}$' then
    raise exception 'Sesión de Stripe no válida' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Importe no válido' using errcode = '22023';
  end if;
  if p_card_last4 is not null and p_card_last4 !~ '^[0-9]{4}$' then
    raise exception 'Tarjeta no válida' using errcode = '22023';
  end if;

  -- "for update": la vuelta del cliente y el webhook pueden llegar a la vez.
  -- La segunda llamada espera aquí a que termine la primera.
  select * into v_order from public.orders
   where order_number = upper(btrim(p_order_number)) for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;

  -- Idempotencia: si esta sesión ya está registrada, se devuelve lo mismo sin repetir nada
  -- (ni otro pago, ni otra resta de stock, ni otro evento). transaction_ref además es unique.
  select * into v_payment from public.payments where transaction_ref = p_session_id;
  if found then
    if v_payment.order_id <> v_order.id then
      raise exception 'La sesión de Stripe es de otro pedido' using errcode = '22023';
    end if;
    return jsonb_build_object('order_number', v_order.order_number, 'status', v_payment.status,
      'order_status', v_order.status, 'transaction_ref', v_payment.transaction_ref,
      'amount', v_payment.amount, 'already_confirmed', true);
  end if;

  if v_order.status <> 'creado' then
    raise exception 'Este pedido ya está pagado o no admite pagos' using errcode = '22023';
  end if;
  -- El importe lo decide la BD: Stripe tiene que haber cobrado exactamente el total del pedido
  if p_amount <> v_order.total then
    raise exception 'El importe cobrado no coincide con el del pedido' using errcode = '22023';
  end if;

  -- Stock: igual que simulate_payment, la resta solo ocurre si hay unidades.
  -- Diferencia: aquí Stripe YA ha cobrado, así que el pago se registra igualmente y el
  -- pedido pasa a "incidencia" para que el administrador lo revise (habría que reembolsar).
  begin
    for v_item in
      select variant_id, product_name, sum(quantity) as quantity
      from public.order_items where order_id = v_order.id
      group by variant_id, product_name
      order by variant_id                -- mismo orden siempre: evita bloqueos cruzados
    loop
      update public.product_variants set stock = stock - v_item.quantity
       where id = v_item.variant_id and stock >= v_item.quantity;
      if not found then
        v_note := format('Pagado en Stripe pero sin stock suficiente de "%s": revisar y reembolsar', v_item.product_name);
        raise exception using errcode = 'P0001';   -- deshace las restas anteriores
      end if;
    end loop;
  exception when sqlstate 'P0001' then
    v_new_status := 'incidencia';
  end;

  insert into public.payments (order_id, method, amount, status, transaction_ref, card_last4)
  values (v_order.id, 'stripe_test', p_amount, 'aprobado', p_session_id, p_card_last4);

  update public.orders set status = v_new_status where id = v_order.id;
  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (v_order.id, 'creado', v_new_status, 'sistema', coalesce(v_note, 'Pago Stripe ' || p_session_id));

  perform public._emit_event('payment.simulated', 'servidor', null, 'payment', p_session_id,
    jsonb_build_object('order_number', v_order.order_number, 'method', 'stripe_test',
                       'status', 'aprobado', 'amount', p_amount),
    v_order.id, v_order.customer_id);

  return jsonb_build_object('order_number', v_order.order_number, 'status', 'aprobado',
    'order_status', v_new_status, 'transaction_ref', p_session_id, 'amount', p_amount,
    'already_confirmed', false);
end $$;

-- Solo el servidor (las Edge Functions con la clave secreta, rol service_role).
-- Supabase da permiso de ejecución a anon y authenticated por defecto: se quita.
revoke execute on function public.confirm_stripe_payment(text, text, numeric, text) from public, anon, authenticated;
grant  execute on function public.confirm_stripe_payment(text, text, numeric, text) to service_role;
