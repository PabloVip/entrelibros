-- =========================================================
-- Lógica de negocio en el servidor (funciones de PostgreSQL)
-- El navegador las llama con supabase.rpc('nombre', {...}).
-- SECURITY DEFINER = se ejecutan con permisos del propietario,
-- por eso validan todo lo que reciben.
-- =========================================================

-- ---------------------------------------------------------
-- EVENTOS
-- ---------------------------------------------------------

-- Interna: registra cualquier evento. NO se expone al navegador.
-- La usan las funciones de servidor (create_order, simulate_payment...).
create or replace function public._emit_event(
  p_event_type  text,
  p_source      text,
  p_session_id  text   default null,
  p_entity_type text   default null,
  p_entity_id   text   default null,
  p_payload     jsonb  default '{}'::jsonb,
  p_order_id    bigint default null,
  p_customer_id bigint default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.events (event_type, source, session_id, entity_type, entity_id,
                             payload, order_id, customer_id)
  values (p_event_type, p_source, left(p_session_id, 64), p_entity_type, left(p_entity_id, 40),
          coalesce(p_payload, '{}'::jsonb), p_order_id, p_customer_id)
  returning event_id into v_id;
  return v_id;
end $$;

revoke execute on function public._emit_event(text, text, text, text, text, jsonb, bigint, bigint)
  from public, anon, authenticated;

-- Pública: eventos de navegación que solo conoce el navegador.
-- order.created, payment.simulated y support.requested NO se aceptan aquí:
-- los emite el servidor al crear el pedido / pago / incidencia (más fiable).
create or replace function public.log_event(
  p_event_type  text,
  p_session_id  text,
  p_entity_type text  default null,
  p_entity_id   text  default null,
  p_payload     jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if p_event_type not in ('product.viewed', 'cart.item_added', 'checkout.started') then
    raise exception 'Tipo de evento no permitido desde el cliente: %', p_event_type
      using errcode = '22023';
  end if;
  if p_session_id is null or length(p_session_id) not between 8 and 64 then
    raise exception 'session_id no válido' using errcode = '22023';
  end if;
  if pg_column_size(coalesce(p_payload, '{}'::jsonb)) > 4096 then
    raise exception 'payload demasiado grande' using errcode = '22023';
  end if;

  return public._emit_event(p_event_type, 'web', p_session_id, p_entity_type, p_entity_id, p_payload);
end $$;

grant execute on function public.log_event(text, text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------
-- BACK-OFFICE: cambio de estado de un pedido
-- ---------------------------------------------------------
create or replace function public.admin_update_order_status(
  p_order_id   bigint,
  p_new_status text,
  p_note       text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_current text;
  v_admin   text;
  v_allowed text[];
begin
  if not public.is_admin() then
    raise exception 'Solo administradores' using errcode = '42501';
  end if;

  select status into v_current from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido % no encontrado', p_order_id using errcode = 'P0002';
  end if;

  -- Máquina de estados: qué transiciones se permiten desde cada estado
  v_allowed := case v_current
    when 'creado'                then array['pago_simulado','cancelado']
    when 'pago_simulado'         then array['pendiente_preparacion','cancelado','incidencia']
    when 'pendiente_preparacion' then array['enviado','cancelado','incidencia']
    when 'enviado'               then array['entregado','incidencia']
    when 'entregado'             then array['incidencia']
    when 'incidencia'            then array['pendiente_preparacion','enviado','cancelado']
    else array[]::text[]                                   -- cancelado: estado final
  end;

  if not (p_new_status = any (v_allowed)) then
    raise exception 'Transición no permitida: % → %', v_current, p_new_status using errcode = '22023';
  end if;

  select display_name into v_admin from public.admin_users where user_id = auth.uid();

  update public.orders set status = p_new_status where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (p_order_id, v_current, p_new_status, coalesce(v_admin, 'admin'), left(p_note, 255));

  perform public._emit_event('order.status_changed', 'backoffice', null, 'order', p_order_id::text,
    jsonb_build_object('from', v_current, 'to', p_new_status, 'by', v_admin), p_order_id);

  return p_new_status;
end $$;

revoke execute on function public.admin_update_order_status(bigint, text, text) from public, anon;
grant  execute on function public.admin_update_order_status(bigint, text, text) to authenticated;

-- ---------------------------------------------------------
-- PENDIENTE (Nino) — mismo patrón: SECURITY DEFINER + validación + _emit_event
--   validate_discount(p_code, p_subtotal)                 → descuento aplicable
--   create_order(p_customer jsonb, p_shipping jsonb,
--                p_items jsonb, p_shipping_code, p_discount_code, p_session_id)
--        · recalcula precios desde product_variants (no fiarse del navegador)
--        · comprueba stock, aplica descuento y envío, desglosa IVA
--        · inserta orders + order_items + order_status_history
--        · emite order.created
--   simulate_payment(p_order_number, p_method, p_card_number)
--        · tarjetas de prueba: 4242… aprobada, 4000… rechazada
--        · inserta payments, cambia estado a pago_simulado, emite payment.simulated
--   create_support_request(p_email, p_order_number, p_reason, p_message)
--        · emite support.requested
-- ---------------------------------------------------------
