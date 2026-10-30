-- =========================================================
-- Entrelibros · Back-office ERP/CRM · 02: orden de los eventos de stock e incidencias
-- Se ejecuta en el proyecto «entrelibros-erp», DESPUÉS de 01_erp.sql (y otra vez si se vuelve
-- a ejecutar 01). Se puede ejecutar varias veces.
--
-- Problema: solo los pedidos comparaban la fecha del evento (last_event_at). Un stock.adjusted o un
-- support.status_changed antiguo que llegara tarde (por ejemplo, un reintento) sobrescribía un dato
-- más reciente, y la conciliación nocturna del inventario podía pisar un ajuste posterior a la foto
-- del stock de la tienda.
--
-- Cambios:
--   1. inventory y tickets guardan last_event_at: la fecha del último evento aplicado.
--   2. erp_set_stock y erp_upsert_ticket reciben p_occurred_at y responden «obsoleto» si el evento
--      es más antiguo que el último aplicado, igual que erp_upsert_order.
--   3. erp_load_inventory recibe p_taken_at (cuándo tomó la tienda la foto del stock): no toca los
--      SKU con un ajuste posterior («omitidos») y deja los demás fechados a esa hora.
-- Los parámetros nuevos son opcionales: sin ellos, las funciones hacen lo mismo que antes, así que
-- este fichero se puede aplicar antes de reimportar los workflows 1 y 4 de n8n.
-- =========================================================

alter table public.inventory add column if not exists last_event_at timestamptz;
alter table public.tickets   add column if not exists last_event_at timestamptz;

-- Las firmas cambian (un parámetro más). Se borran las antiguas para que la API (PostgREST) no tenga
-- dos versiones de la misma función entre las que elegir.
drop function if exists public.erp_set_stock(uuid, text, int, text);
drop function if exists public.erp_load_inventory(jsonb);
drop function if exists public.erp_upsert_ticket(uuid, jsonb);

-- Escenario 2: stock de una variante
create or replace function public.erp_set_stock(p_event_id uuid, p_sku text, p_on_hand int, p_description text default null,
                                                p_occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prev public.inventory;
begin
  if p_sku is null or p_on_hand is null or p_on_hand < 0 then
    raise exception 'contrato: SKU o stock no válido' using errcode = '22023';
  end if;
  select * into v_prev from public.inventory where sku = p_sku for update;
  if found and v_prev.last_event_id = p_event_id then
    return jsonb_build_object('result', 'duplicado', 'sku', p_sku, 'on_hand', v_prev.on_hand);
  end if;
  -- más antiguo que el último ajuste aplicado o que la última foto de la tienda: no se toca
  if found and v_prev.last_event_at > p_occurred_at then
    return jsonb_build_object('result', 'obsoleto', 'sku', p_sku, 'on_hand', v_prev.on_hand,
                              'last_event_at', v_prev.last_event_at);
  end if;
  insert into public.inventory (sku, description, on_hand, source, last_event_id, last_event_at)
  values (p_sku, p_description, p_on_hand, 'evento', p_event_id, p_occurred_at)
  on conflict (sku) do update set on_hand = excluded.on_hand, last_event_id = excluded.last_event_id, source = 'evento',
     last_event_at = coalesce(excluded.last_event_at, public.inventory.last_event_at),
     description = coalesce(excluded.description, public.inventory.description), updated_at = now();
  return jsonb_build_object('result', case when v_prev.sku is null then 'creado' else 'actualizado' end,
                            'sku', p_sku, 'from', v_prev.on_hand, 'on_hand', p_on_hand);
end $$;

-- Carga inicial / conciliación del inventario (workflow 4): lista completa de la tienda.
-- greatest() ignora los nulos: sin p_taken_at, last_event_at se queda como estaba.
create or replace function public.erp_load_inventory(p_items jsonb, p_taken_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i jsonb; n_new int := 0; n_upd int := 0; n_same int := 0; n_skip int := 0; v_prev public.inventory;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'contrato: se esperaba una lista de artículos' using errcode = '22023';
  end if;
  for i in select * from jsonb_array_elements(p_items) loop
    continue when i->>'sku' is null or (i->>'stock') is null;
    select * into v_prev from public.inventory where sku = i->>'sku' for update;
    if found and v_prev.last_event_at > p_taken_at then      -- ajuste posterior a la foto: manda el ajuste
      n_skip := n_skip + 1;
      continue;
    end if;
    if not found then n_new := n_new + 1;
    elsif v_prev.on_hand = (i->>'stock')::int then n_same := n_same + 1;
    else n_upd := n_upd + 1; end if;
    insert into public.inventory (sku, description, on_hand, source, last_event_at)
    values (i->>'sku', i->>'description', greatest((i->>'stock')::int, 0), 'carga_inicial', p_taken_at)
    on conflict (sku) do update set on_hand = excluded.on_hand,
       description = coalesce(excluded.description, public.inventory.description),
       source = case when public.inventory.on_hand = excluded.on_hand then public.inventory.source else 'carga_inicial' end,
       updated_at = case when public.inventory.on_hand = excluded.on_hand then public.inventory.updated_at else now() end,
       last_event_at = greatest(public.inventory.last_event_at, excluded.last_event_at);
  end loop;
  return jsonb_build_object('result', 'cargado', 'nuevos', n_new, 'actualizados', n_upd, 'sin_cambios', n_same,
                            'omitidos', n_skip, 'total', jsonb_array_length(p_items));
end $$;

-- Escenario 3: incidencia en el CRM (alta o cambio de estado), asociada a cliente y pedido
create or replace function public.erp_upsert_ticket(p_event_id uuid, p_ticket jsonb, p_occurred_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cust  bigint;
  v_order bigint;
  v_prev  public.tickets;
  v_id    bigint;
  v_stat  text := case p_ticket->>'status' when 'abierta' then 'nuevo' when 'resuelta' then 'resuelto'
                                           else coalesce(p_ticket->>'status', 'nuevo') end;
begin
  if p_ticket->>'ticket_number' is null or p_ticket->>'customer_email' is null then
    raise exception 'contrato: incidencia sin número o sin email' using errcode = '22023';
  end if;
  select * into v_prev from public.tickets where external_id = p_ticket->>'ticket_number' for update;
  if found and v_prev.last_event_id = p_event_id then
    return jsonb_build_object('result', 'duplicado', 'erp_id', v_prev.id, 'status', v_prev.status);
  end if;
  if found and v_prev.last_event_at > p_occurred_at then
    return jsonb_build_object('result', 'obsoleto', 'erp_id', v_prev.id, 'status', v_prev.status);
  end if;

  v_cust := public._upsert_customer(jsonb_build_object('email', p_ticket->>'customer_email',
                                                       'full_name', p_ticket->>'customer_name'));
  select id into v_order from public.sales_orders where external_id = p_ticket->>'order_number';

  insert into public.tickets as t (external_id, customer_id, order_id, category, priority, status, subject,
                                   description, telegram_token, sla_due_at, resolved_at, last_event_id, last_event_at)
  values (p_ticket->>'ticket_number', v_cust, v_order, coalesce(p_ticket->>'category', 'otro'),
          coalesce(p_ticket->>'priority', 'media'), v_stat, coalesce(p_ticket->>'subject', 'Incidencia'),
          coalesce(p_ticket->>'message', ''), nullif(p_ticket->>'telegram_token', ''),
          (p_ticket->>'sla_due_at')::timestamptz, case when v_stat = 'resuelto' then now() end, p_event_id, p_occurred_at)
  on conflict (external_id) do update
     set status = excluded.status, order_id = coalesce(t.order_id, excluded.order_id),
         telegram_token = coalesce(t.telegram_token, excluded.telegram_token),
         resolved_at = case when excluded.status = 'resuelto' then coalesce(t.resolved_at, now()) end,
         last_event_id = excluded.last_event_id, last_event_at = coalesce(excluded.last_event_at, t.last_event_at),
         updated_at = now()
  returning id into v_id;

  insert into public.ticket_activity (ticket_id, kind, body, author)
  values (v_id, case when v_prev.id is null then 'alta' else 'cambio_estado' end,
          case when v_prev.id is null then 'Alta desde la tienda: ' || coalesce(p_ticket->>'subject', '')
               else 'Estado: ' || v_prev.status || ' → ' || v_stat end, 'integracion');

  return jsonb_build_object('result', case when v_prev.id is null then 'creado'
                                           when v_prev.status = v_stat then 'sin_cambios' else 'actualizado' end,
                            'erp_id', v_id, 'status', v_stat, 'previous_status', v_prev.status,
                            'order_linked', v_order is not null);
end $$;

do $$
declare f text;
begin
  foreach f in array array['erp_set_stock(uuid, text, int, text, timestamptz)', 'erp_load_inventory(jsonb, timestamptz)',
                           'erp_upsert_ticket(uuid, jsonb, timestamptz)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Que la API vea ya las funciones nuevas
notify pgrst, 'reload schema';
