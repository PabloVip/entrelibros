-- =========================================================
-- Entrelibros · Tarea 2 · El back-office pasa a ser un sistema independiente
-- Ejecutar DESPUÉS de 14_integracion.sql, en el proyecto de la TIENDA. Se puede ejecutar varias veces.
--
-- Hasta ahora el ERP/CRM académico vivía en el esquema «erp» de esta misma base de datos.
-- Ahora el back-office es otro proyecto de Supabase (erp/supabase/01_erp.sql) con su propia base
-- de datos, claves y usuarios, y n8n es lo único que conecta los dos sistemas. Por eso aquí:
--   1. Se elimina el esquema erp y todo lo que la tienda tenía del back-office (funciones erp_*,
--      registro de integración y decisiones del agente, que ahora guarda el back-office).
--   2. La tienda conserva solo su lado de la integración: la cola de salida (outbox), los reintentos
--      y la confirmación de n8n (integration_ack).
--   3. n8n puede leer de la tienda el stock completo (carga inicial del inventario del ERP) y
--      devolverle el cambio de estado de una incidencia aprobada (sincronización inversa).
--   4. El evento de incidencia lleva el token de Telegram para que el CRM pueda vincular el chat.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Fuera el back-office de la base de datos de la tienda
-- ---------------------------------------------------------
drop function if exists public.erp_ack(uuid, boolean, text, boolean);
drop function if exists public.erp_log(jsonb);
drop function if exists public.erp_upsert_order(uuid, timestamptz, jsonb);
drop function if exists public.erp_set_stock(uuid, text, int, text);
drop function if exists public.erp_upsert_ticket(uuid, jsonb);
drop function if exists public.erp_tool_order(text);
drop function if exists public.erp_tool_customer(text);
drop function if exists public.erp_tool_stock(text);
drop function if exists public.erp_tool_internal_note(text, text);
drop function if exists public.erp_save_decision(jsonb);
drop function if exists public.erp_review_decision(bigint, boolean, text, text);
drop function if exists public.erp_mark_delivered(bigint, boolean);
drop function if exists public.erp_link_telegram(text, text, text);
drop function if exists public.erp_customer_message(text, text);
drop schema if exists erp cascade;
drop table if exists public.agent_decisions;
drop table if exists public.integration_log;
-- telegram_links se queda solo como almacén del token que se enseña al cliente en la web
alter table public.telegram_links drop column if exists chat_id;
alter table public.telegram_links drop column if exists telegram_username;
alter table public.telegram_links drop column if exists linked_at;

-- ---------------------------------------------------------
-- 2. Contrato: la incidencia lleva su token de Telegram (en lugar de «telegram_linked»)
-- ---------------------------------------------------------
create or replace function public._integration_build_payload(e public.events)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_data jsonb;
  v_t    public.support_requests;
begin
  case e.event_type
    when 'order.created', 'payment.simulated', 'order.status_changed' then
      v_data := jsonb_build_object('order', public._integration_order_snapshot(e.order_id));
      if e.event_type = 'payment.simulated' then
        v_data := v_data || jsonb_build_object('attempt', e.payload);
      elsif e.event_type = 'order.status_changed' then
        v_data := v_data || jsonb_build_object('change', e.payload);
      end if;
    when 'stock.adjusted' then
      v_data := jsonb_build_object('stock', jsonb_build_object(
        'sku', e.payload->>'sku', 'from', (e.payload->>'from')::int, 'to', (e.payload->>'to')::int,
        'by', e.payload->>'by', 'note', e.payload->>'note',
        'description', (select p.name || ' · ' || v.name from public.product_variants v
                        join public.products p on p.id = v.product_id where v.sku = e.payload->>'sku')));
    when 'support.requested', 'support.status_changed' then
      select * into v_t from public.support_requests where ticket_number = e.entity_id;
      v_data := jsonb_build_object('ticket', jsonb_build_object(
        'ticket_number', v_t.ticket_number, 'reason', v_t.reason, 'message', v_t.message,
        'status', v_t.status, 'created_at', v_t.created_at, 'customer_email', v_t.customer_email,
        'customer_name', (select full_name from public.customers where email = v_t.customer_email),
        'order_number', (select order_number from public.orders where id = v_t.order_id),
        'telegram_token', (select token from public.telegram_links l where l.ticket_number = v_t.ticket_number)));
      if e.event_type = 'support.status_changed' then
        v_data := v_data || jsonb_build_object('change', e.payload);
      end if;
      if v_t.order_id is not null then
        v_data := v_data || jsonb_build_object('order', public._integration_order_snapshot(v_t.order_id));
      end if;
    else
      v_data := e.payload;
  end case;

  return jsonb_build_object(
    'contract',    'entrelibros.event.v1',
    'event_id',    e.event_id,
    'event_type',  e.event_type,
    'occurred_at', e.occurred_at,
    'source',      e.source,
    'environment', 'prototipo-academico',
    'data',        v_data);
end $$;

-- ---------------------------------------------------------
-- 3. API de la tienda para n8n (solo service_role de la TIENDA)
-- ---------------------------------------------------------
-- Confirmación: el back-office ha aplicado el evento (o ha fallado sin remedio)
create or replace function public.integration_ack(p_event_id uuid, p_ok boolean, p_detail text default null, p_retry boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  v_status := case when p_ok then 'procesado' when p_retry then 'pendiente' else 'error' end;
  update public.integration_outbox
     set status = v_status, processed_at = case when p_ok then now() end,
         last_error = case when p_ok then null else left(p_detail, 500) end,
         next_attempt_at = case when p_retry then now() + interval '2 minutes' else next_attempt_at end
   where event_id = p_event_id;
  if not found then return 'desconocido'; end if;
  return v_status;
end $$;

-- Sincronización inversa: el CRM ha aprobado la propuesta → la incidencia de la tienda pasa a «en curso»
create or replace function public.integration_support_status(p_ticket text, p_to text, p_by text default 'integracion')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if p_to not in ('en_curso', 'resuelta') then
    raise exception 'negocio: estado de incidencia no permitido (%)', p_to using errcode = '22023';
  end if;
  select status into v_from from public.support_requests where ticket_number = upper(btrim(p_ticket)) for update;
  if not found then return jsonb_build_object('result', 'no_encontrada'); end if;
  if v_from = p_to or (v_from = 'resuelta') then
    return jsonb_build_object('result', 'sin_cambios', 'status', v_from);
  end if;
  update public.support_requests set status = p_to where ticket_number = upper(btrim(p_ticket));
  -- source 'integracion': no se vuelve a enviar al back-office (evita bucles)
  perform public._emit_event('support.status_changed', 'integracion', null, 'support', upper(btrim(p_ticket)),
    jsonb_build_object('ticket_number', upper(btrim(p_ticket)), 'from', v_from, 'to', p_to, 'by', left(p_by, 120)));
  return jsonb_build_object('result', 'actualizado', 'from', v_from, 'to', p_to);
end $$;

-- Stock completo del catálogo (carga inicial / conciliación del inventario del back-office)
create or replace function public.integration_stock_snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('taken_at', now(), 'count', count(*),
           'items', coalesce(jsonb_agg(jsonb_build_object('sku', v.sku, 'description', p.name || ' · ' || v.name,
                                                          'stock', v.stock, 'active', v.is_active and p.is_active)
                                       order by v.sku), '[]'::jsonb))
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.sku is not null;
$$;

do $$
declare f text;
begin
  foreach f in array array['integration_ack(uuid, boolean, text, boolean)',
                           'integration_support_status(text, text, text)', 'integration_stock_snapshot()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------
-- 4. Back-office de la tienda: solo la cola de salida (el resto se ve en la web del ERP)
-- ---------------------------------------------------------
create or replace function public.admin_integration_dashboard(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not public.is_admin() then raise exception 'Solo administradores' using errcode = '42501'; end if;
  return jsonb_build_object(
    'from', v_from,
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.integration_outbox
                 where created_at >= v_from group by status) x), '{}'::jsonb),
    'by_type', coalesce((select jsonb_object_agg(event_type, n) from (select event_type, count(*) n from public.integration_outbox
                 where created_at >= v_from group by event_type) x), '{}'::jsonb),
    'total', (select count(*) from public.integration_outbox where created_at >= v_from),
    'retried', (select count(*) from public.integration_outbox where created_at >= v_from and attempts > 1),
    'avg_ack_s', (select round(avg(extract(epoch from processed_at - created_at))::numeric, 1)
                  from public.integration_outbox where processed_at is not null and created_at >= v_from),
    'per_day', coalesce((select jsonb_agg(x order by x.day) from (
          select (created_at at time zone 'Europe/Madrid')::date as day, count(*) n,
                 count(*) filter (where status = 'procesado') ok
          from public.integration_outbox where created_at >= v_from group by 1) x), '[]'::jsonb));
end $$;
revoke execute on function public.admin_integration_dashboard(int) from public, anon;
grant  execute on function public.admin_integration_dashboard(int) to authenticated;

create or replace function public.admin_integration_lists(p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores' using errcode = '42501'; end if;
  return jsonb_build_object(
    'outbox', coalesce((select jsonb_agg(x) from (select id, event_id, event_type, status, attempts, last_error,
                created_at, sent_at, processed_at, payload->'data'->'order'->>'order_number' as order_number,
                payload->'data'->'ticket'->>'ticket_number' as ticket_number,
                payload->'data'->'stock'->>'sku' as sku
                from public.integration_outbox order by id desc limit p_limit) x), '[]'::jsonb));
end $$;
revoke execute on function public.admin_integration_lists(int) from public, anon;
grant  execute on function public.admin_integration_lists(int) to authenticated;

notify pgrst, 'reload schema';
