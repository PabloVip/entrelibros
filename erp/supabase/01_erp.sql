-- =========================================================
-- Entrelibros · Back-office ERP/CRM (Tarea 2)
-- Se ejecuta en un proyecto de Supabase DISTINTO al de la tienda («entrelibros-erp»):
-- base de datos, claves y usuarios propios. La tienda no tiene acceso a este sistema;
-- solo n8n escribe aquí, por la API, con la clave secreta de ESTE proyecto.
-- Se puede ejecutar varias veces. Después, ejecuta siempre 02_orden_eventos.sql.
--
-- Contenido:
--   1. Datos maestros y transaccionales del back-office: clientes, pedidos de venta (+ líneas
--      e historial), inventario, incidencias (+ actividad), decisiones del agente de IA y
--      registro de integración.
--   2. API para n8n (funciones erp_*, solo service_role).
--   3. Acceso del personal (tabla staff + RLS de solo lectura) y cuadro de mando.
--
-- Alta del personal (una vez, tras crear el usuario en Authentication → Users):
--   insert into public.staff (user_id, email, full_name)
--   select id, email, 'Pablo Vicente' from auth.users where email = '<email>';
-- =========================================================

-- ---------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------
create table if not exists public.customers (
  id                bigint generated always as identity primary key,
  external_ref      text not null unique,                  -- email normalizado (clave de negocio)
  full_name         text,
  email             text not null,
  phone             text,
  shop_customer_id  bigint,                                -- id del cliente en la tienda (referencia externa)
  telegram_chat_id  text,
  telegram_username text,
  first_order_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.sales_orders (
  id               bigint generated always as identity primary key,
  external_id      text not null unique,                   -- número de pedido de la tienda
  source_system    text not null default 'entrelibros-web',
  customer_id      bigint not null references public.customers(id),
  status           text not null check (status in ('pendiente_pago','pagado','en_preparacion',
                                                     'enviado','entregado','cancelado','incidencia')),
  payment_status   text not null default 'pendiente' check (payment_status in ('pendiente','pagado','rechazado')),
  payment_method   text,
  payment_ref      text,
  currency         char(3) not null default 'EUR',
  net_amount       numeric(10,2) not null,
  tax_amount       numeric(10,2) not null,
  shipping_amount  numeric(10,2) not null,
  discount_amount  numeric(10,2) not null default 0,
  total_amount     numeric(10,2) not null,
  shipping_method  text,
  delivery_point   text,
  delivery_address text,
  ordered_at       timestamptz not null,
  last_event_id    uuid,
  last_event_at    timestamptz,
  sync_version     int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.sales_order_lines (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references public.sales_orders(id) on delete cascade,
  line_no     int not null,
  sku         text not null,
  description text not null,
  quantity    int not null check (quantity > 0),
  unit_price  numeric(10,2) not null,
  amount      numeric(10,2) not null,
  unique (order_id, line_no)
);

-- Historial de estados del pedido en el ERP (evidencia antes/después de cada sincronización)
create table if not exists public.sales_order_history (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references public.sales_orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  event_id    uuid,
  event_type  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.inventory (
  sku           text primary key,
  description   text,
  on_hand       int not null check (on_hand >= 0),
  source        text not null default 'evento' check (source in ('evento','carga_inicial')),
  last_event_id uuid,
  updated_at    timestamptz not null default now()
);

create table if not exists public.tickets (
  id               bigint generated always as identity primary key,
  external_id      text not null unique,                  -- SOP-AAAAMMDD-XXXX
  customer_id      bigint not null references public.customers(id),
  order_id         bigint references public.sales_orders(id),
  category         text not null,
  priority         text not null default 'media' check (priority in ('baja','media','alta','urgente')),
  status           text not null default 'nuevo' check (status in ('nuevo','en_curso','esperando_cliente','resuelto')),
  subject          text not null,
  description      text not null,
  channel          text not null default 'web' check (channel in ('web','telegram')),
  telegram_token   text unique,                           -- lo genera la tienda y viaja en el evento
  telegram_chat_id text,
  sla_due_at       timestamptz,
  resolved_at      timestamptz,
  last_event_id    uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.ticket_activity (
  id         bigint generated always as identity primary key,
  ticket_id  bigint not null references public.tickets(id) on delete cascade,
  kind       text not null check (kind in ('alta','nota_interna','mensaje_cliente','respuesta_enviada',
                                           'cambio_estado','propuesta_ia','revision_humana')),
  body       text not null,
  author     text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_decisions (
  id               bigint generated always as identity primary key,
  event_id         uuid,
  ticket_ref       text not null,
  order_ref        text,
  case_type        text not null,
  consulted        jsonb not null default '{}'::jsonb,
  tools_used       text[] not null default '{}',
  proposed_action  text not null,
  action_type      text not null,
  customer_message text,
  justification    text not null,
  confidence       numeric(3,2) check (confidence between 0 and 1),
  priority         text check (priority in ('baja','media','alta','urgente')),
  risks            jsonb not null default '[]'::jsonb,
  final_status     text not null default 'pendiente_revision'
                   check (final_status in ('pendiente_revision','aprobado','rechazado','ejecutado_simulado','enviado','caducado')),
  model            text,
  reviewer         text,
  review_note      text,
  reviewed_at      timestamptz,
  delivered_at     timestamptz,
  execution_id     text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_agent_ticket on public.agent_decisions (ticket_ref);

-- Registro de integración: qué ha recibido y aplicado el back-office, paso a paso
create table if not exists public.integration_log (
  id           bigint generated always as identity primary key,
  execution_id text,                                        -- id de ejecución de n8n
  workflow     text not null,
  step         text not null,
  event_id     uuid,
  event_type   text,
  occurred_at  timestamptz,                                 -- cuándo ocurrió el evento en la tienda
  entity_type  text,
  entity_ref   text,
  status       text not null check (status in ('ok','error','duplicado','obsoleto','ignorado','reintento')),
  error_type   text check (error_type in ('contrato','formato','coherencia','negocio','tecnico','agente','autenticacion')),
  message      text,
  details      jsonb not null default '{}'::jsonb,
  duration_ms  int,
  created_at   timestamptz not null default now()
);
create index if not exists idx_intlog_time on public.integration_log (created_at desc);

-- Personal del back-office (acceso a la web del ERP)
create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;
grant execute on function public.is_staff() to authenticated;

-- RLS: el personal solo LEE; las escrituras llegan únicamente por las funciones de n8n
do $$
declare t text;
begin
  foreach t in array array['customers','sales_orders','sales_order_lines','sales_order_history','inventory',
                           'tickets','ticket_activity','agent_decisions','integration_log','staff'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "personal lee" on public.%I', t);
    execute format('create policy "personal lee" on public.%I for select to authenticated using (public.is_staff())', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------
-- 2. API para n8n (solo service_role)
-- ---------------------------------------------------------
create or replace function public._map_status(p text) returns text language sql immutable as $$
  select case p
    when 'creado' then 'pendiente_pago' when 'pago_simulado' then 'pagado'
    when 'pendiente_preparacion' then 'en_preparacion' else p end;
$$;

create or replace function public._upsert_customer(c jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_email text := lower(btrim(c->>'email'));
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'contrato: email de cliente no válido' using errcode = '22023';
  end if;
  insert into public.customers (external_ref, email, full_name, phone, shop_customer_id)
  values (v_email, v_email, nullif(btrim(c->>'full_name'), ''), nullif(c->>'phone', ''), (c->>'shop_id')::bigint)
  on conflict (external_ref) do update
     set full_name = coalesce(excluded.full_name, public.customers.full_name),
         phone = coalesce(excluded.phone, public.customers.phone),
         shop_customer_id = coalesce(excluded.shop_customer_id, public.customers.shop_customer_id),
         updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- Registro de integración (lo escribe n8n en cada paso)
create or replace function public.erp_log(p_entry jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into public.integration_log (execution_id, workflow, step, event_id, event_type, occurred_at, entity_type,
                                      entity_ref, status, error_type, message, details, duration_ms)
  values (p_entry->>'execution_id', coalesce(p_entry->>'workflow', 'desconocido'),
          coalesce(p_entry->>'step', 'desconocido'),
          case when p_entry->>'event_id' ~ '^[0-9a-f-]{36}$' then (p_entry->>'event_id')::uuid end,
          p_entry->>'event_type',
          case when p_entry->>'occurred_at' ~ '^\d{4}-\d{2}-\d{2}T' then (p_entry->>'occurred_at')::timestamptz end,
          p_entry->>'entity_type', p_entry->>'entity_ref',
          coalesce(p_entry->>'status', 'ok'), nullif(p_entry->>'error_type', ''),
          left(p_entry->>'message', 1000), coalesce(p_entry->'details', '{}'::jsonb),
          (p_entry->>'duration_ms')::int)
  returning id into v_id;
  return v_id;
end $$;

-- Escenarios 1 y 2: crea o actualiza el pedido de venta (idempotente por event_id, ordenado por fecha)
create or replace function public.erp_upsert_order(p_event_id uuid, p_occurred_at timestamptz, p_order jsonb,
                                                   p_event_type text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cust   bigint;
  v_id     bigint;
  v_prev   public.sales_orders;
  v_lines  jsonb := p_order->'lines';
  v_sum    numeric;
  v_status text := public._map_status(p_order->>'status');
  v_result text;
  l        jsonb;
  n        int := 0;
begin
  if p_order->>'order_number' is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'contrato: pedido sin número o sin líneas' using errcode = '22023';
  end if;
  select coalesce(sum((x->>'line_total')::numeric), 0) into v_sum from jsonb_array_elements(v_lines) x;
  if abs(v_sum - (p_order->'amounts'->>'subtotal')::numeric) > 0.01 then
    raise exception 'coherencia: la suma de líneas (%) no coincide con el subtotal (%)',
      v_sum, p_order->'amounts'->>'subtotal' using errcode = '22023';
  end if;

  select * into v_prev from public.sales_orders where external_id = p_order->>'order_number' for update;
  if found and v_prev.last_event_id = p_event_id then
    return jsonb_build_object('result', 'duplicado', 'erp_id', v_prev.id, 'status', v_prev.status);
  end if;
  if found and v_prev.last_event_at > p_occurred_at then
    return jsonb_build_object('result', 'obsoleto', 'erp_id', v_prev.id, 'status', v_prev.status);
  end if;

  v_cust := public._upsert_customer(p_order->'customer');
  update public.customers set first_order_at = least(coalesce(first_order_at, (p_order->>'created_at')::timestamptz),
                                                     (p_order->>'created_at')::timestamptz)
   where id = v_cust;

  insert into public.sales_orders as so (external_id, customer_id, status, payment_status, payment_method, payment_ref,
       currency, net_amount, tax_amount, shipping_amount, discount_amount, total_amount,
       shipping_method, delivery_point, delivery_address, ordered_at, last_event_id, last_event_at)
  values (p_order->>'order_number', v_cust, v_status,
          coalesce(p_order->'payment'->>'status_erp', 'pendiente'), p_order->'payment'->>'method',
          p_order->'payment'->>'reference', coalesce(p_order->>'currency', 'EUR'),
          (p_order->'amounts'->>'total')::numeric - (p_order->'amounts'->>'tax')::numeric,
          (p_order->'amounts'->>'tax')::numeric, (p_order->'amounts'->>'shipping')::numeric,
          coalesce((p_order->'amounts'->>'discount')::numeric, 0), (p_order->'amounts'->>'total')::numeric,
          p_order->'shipping'->>'method', p_order->'shipping'->>'pickup_point', p_order->'shipping'->>'full_address',
          (p_order->>'created_at')::timestamptz, p_event_id, p_occurred_at)
  on conflict (external_id) do update
     set status = excluded.status, payment_status = excluded.payment_status,
         payment_method = coalesce(excluded.payment_method, so.payment_method),
         payment_ref = coalesce(excluded.payment_ref, so.payment_ref),
         total_amount = excluded.total_amount, net_amount = excluded.net_amount, tax_amount = excluded.tax_amount,
         last_event_id = excluded.last_event_id, last_event_at = excluded.last_event_at,
         sync_version = so.sync_version + 1, updated_at = now()
  returning id into v_id;

  delete from public.sales_order_lines where order_id = v_id;
  for l in select * from jsonb_array_elements(v_lines) loop
    n := n + 1;
    insert into public.sales_order_lines (order_id, line_no, sku, description, quantity, unit_price, amount)
    values (v_id, n, l->>'sku', l->>'description', (l->>'quantity')::int,
            (l->>'unit_price')::numeric, (l->>'line_total')::numeric);
  end loop;

  if v_prev.id is null or v_prev.status is distinct from v_status then
    insert into public.sales_order_history (order_id, from_status, to_status, event_id, event_type)
    values (v_id, v_prev.status, v_status, p_event_id, p_event_type);
  end if;

  v_result := case when v_prev.id is null then 'creado'
                   when v_prev.status is distinct from v_status then 'actualizado'
                   else 'sin_cambios' end;
  return jsonb_build_object('result', v_result, 'erp_id', v_id, 'status', v_status,
                            'previous_status', v_prev.status, 'sync_version',
                            (select sync_version from public.sales_orders where id = v_id));
end $$;

-- Escenario 2: stock de una variante
create or replace function public.erp_set_stock(p_event_id uuid, p_sku text, p_on_hand int, p_description text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prev int;
begin
  if p_sku is null or p_on_hand is null or p_on_hand < 0 then
    raise exception 'contrato: SKU o stock no válido' using errcode = '22023';
  end if;
  select on_hand into v_prev from public.inventory where sku = p_sku;
  if exists (select 1 from public.inventory where sku = p_sku and last_event_id = p_event_id) then
    return jsonb_build_object('result', 'duplicado', 'sku', p_sku, 'on_hand', v_prev);
  end if;
  insert into public.inventory (sku, description, on_hand, source, last_event_id)
  values (p_sku, p_description, p_on_hand, 'evento', p_event_id)
  on conflict (sku) do update set on_hand = excluded.on_hand, last_event_id = excluded.last_event_id, source = 'evento',
     description = coalesce(excluded.description, public.inventory.description), updated_at = now();
  return jsonb_build_object('result', case when v_prev is null then 'creado' else 'actualizado' end,
                            'sku', p_sku, 'from', v_prev, 'on_hand', p_on_hand);
end $$;

-- Carga inicial / conciliación del inventario (workflow 4): lista completa de la tienda
create or replace function public.erp_load_inventory(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i jsonb; n_new int := 0; n_upd int := 0; n_same int := 0; v_prev int;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'contrato: se esperaba una lista de artículos' using errcode = '22023';
  end if;
  for i in select * from jsonb_array_elements(p_items) loop
    continue when i->>'sku' is null or (i->>'stock') is null;
    select on_hand into v_prev from public.inventory where sku = i->>'sku';
    if not found then n_new := n_new + 1;
    elsif v_prev = (i->>'stock')::int then n_same := n_same + 1;
    else n_upd := n_upd + 1; end if;
    insert into public.inventory (sku, description, on_hand, source)
    values (i->>'sku', i->>'description', greatest((i->>'stock')::int, 0), 'carga_inicial')
    on conflict (sku) do update set on_hand = excluded.on_hand,
       description = coalesce(excluded.description, public.inventory.description),
       source = case when public.inventory.on_hand = excluded.on_hand then public.inventory.source else 'carga_inicial' end,
       updated_at = case when public.inventory.on_hand = excluded.on_hand then public.inventory.updated_at else now() end;
  end loop;
  return jsonb_build_object('result', 'cargado', 'nuevos', n_new, 'actualizados', n_upd, 'sin_cambios', n_same,
                            'total', jsonb_array_length(p_items));
end $$;

-- Escenario 3: incidencia en el CRM (alta o cambio de estado), asociada a cliente y pedido
create or replace function public.erp_upsert_ticket(p_event_id uuid, p_ticket jsonb)
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

  v_cust := public._upsert_customer(jsonb_build_object('email', p_ticket->>'customer_email',
                                                       'full_name', p_ticket->>'customer_name'));
  select id into v_order from public.sales_orders where external_id = p_ticket->>'order_number';

  insert into public.tickets as t (external_id, customer_id, order_id, category, priority, status, subject,
                                   description, telegram_token, sla_due_at, resolved_at, last_event_id)
  values (p_ticket->>'ticket_number', v_cust, v_order, coalesce(p_ticket->>'category', 'otro'),
          coalesce(p_ticket->>'priority', 'media'), v_stat, coalesce(p_ticket->>'subject', 'Incidencia'),
          coalesce(p_ticket->>'message', ''), nullif(p_ticket->>'telegram_token', ''),
          (p_ticket->>'sla_due_at')::timestamptz, case when v_stat = 'resuelto' then now() end, p_event_id)
  on conflict (external_id) do update
     set status = excluded.status, order_id = coalesce(t.order_id, excluded.order_id),
         telegram_token = coalesce(t.telegram_token, excluded.telegram_token),
         resolved_at = case when excluded.status = 'resuelto' then coalesce(t.resolved_at, now()) end,
         last_event_id = excluded.last_event_id, updated_at = now()
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

-- ---------- Herramientas del agente: solo consultan ESTE sistema ----------
create or replace function public.erp_tool_order(p_order_number text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'order_number', o.external_id, 'status', o.status, 'payment_status', o.payment_status,
      'payment_method', o.payment_method, 'total', o.total_amount, 'shipping_method', o.shipping_method,
      'ordered_at', o.ordered_at, 'days_since_order', extract(day from now() - o.ordered_at)::int,
      'lines', (select jsonb_agg(jsonb_build_object('sku', l.sku, 'description', l.description, 'qty', l.quantity)
                                 order by l.line_no) from public.sales_order_lines l where l.order_id = o.id),
      'status_history', (select jsonb_agg(jsonb_build_object('from', h.from_status, 'to', h.to_status, 'at', h.created_at)
                                          order by h.id) from public.sales_order_history h where h.order_id = o.id),
      'open_tickets', (select count(*) from public.tickets t where t.order_id = o.id and t.status <> 'resuelto'))
    from public.sales_orders o where o.external_id = upper(btrim(p_order_number))),
    jsonb_build_object('error', 'pedido no encontrado en el ERP', 'order_number', p_order_number));
$$;

create or replace function public.erp_tool_customer(p_email text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'email', c.email, 'name', c.full_name, 'customer_since', c.created_at,
      'telegram_linked', c.telegram_chat_id is not null,
      'orders', coalesce((select jsonb_agg(jsonb_build_object('order_number', o.external_id, 'status', o.status,
                                                              'total', o.total_amount, 'ordered_at', o.ordered_at)
                                           order by o.ordered_at desc)
                          from public.sales_orders o where o.customer_id = c.id), '[]'::jsonb),
      'tickets', coalesce((select jsonb_agg(jsonb_build_object('ticket', t.external_id, 'category', t.category,
                                                               'status', t.status, 'created_at', t.created_at)
                                            order by t.created_at desc)
                           from public.tickets t where t.customer_id = c.id), '[]'::jsonb))
    from public.customers c where c.external_ref = lower(btrim(p_email))),
    jsonb_build_object('error', 'cliente no encontrado en el ERP', 'email', p_email));
$$;

create or replace function public.erp_tool_stock(p_query text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('sku', sku, 'description', description, 'on_hand', on_hand,
                                               'updated_at', updated_at) order by sku), '[]'::jsonb)
  from (select * from public.inventory
        where sku ilike '%' || btrim(p_query) || '%' or description ilike '%' || btrim(p_query) || '%'
        order by sku limit 10) x;
$$;

-- Acción reversible del agente: nota interna en el ticket (no la ve el cliente)
create or replace function public.erp_tool_internal_note(p_ticket text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  select id into v_id from public.tickets where external_id = upper(btrim(p_ticket));
  if v_id is null then return jsonb_build_object('error', 'ticket no encontrado en el CRM'); end if;
  insert into public.ticket_activity (ticket_id, kind, body, author)
  values (v_id, 'nota_interna', left(p_note, 1000), 'agente-ia');
  return jsonb_build_object('result', 'nota_creada', 'ticket', p_ticket);
end $$;

-- ---------- Decisiones del agente y revisión humana ----------
create or replace function public.erp_save_decision(p_d jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_ticket bigint;
begin
  insert into public.agent_decisions (event_id, ticket_ref, order_ref, case_type, consulted, tools_used,
       proposed_action, action_type, customer_message, justification, confidence, priority, risks,
       final_status, model, execution_id)
  values ((p_d->>'event_id')::uuid, p_d->>'ticket_ref', nullif(p_d->>'order_ref', ''), p_d->>'case_type',
          coalesce(p_d->'consulted', '{}'::jsonb),
          coalesce(array(select jsonb_array_elements_text(p_d->'tools_used')), '{}'),
          p_d->>'proposed_action', p_d->>'action_type', p_d->>'customer_message', p_d->>'justification',
          (p_d->>'confidence')::numeric, p_d->>'priority', coalesce(p_d->'risks', '[]'::jsonb),
          coalesce(p_d->>'final_status', 'pendiente_revision'), p_d->>'model', p_d->>'execution_id')
  returning id into v_id;

  select id into v_ticket from public.tickets where external_id = p_d->>'ticket_ref';
  if v_ticket is not null then
    insert into public.ticket_activity (ticket_id, kind, body, author)
    values (v_ticket, 'propuesta_ia', format('Propuesta #%s (%s, prioridad %s, confianza %s): %s',
            v_id, p_d->>'case_type', p_d->>'priority', p_d->>'confidence', p_d->>'proposed_action'), 'agente-ia');
  end if;
  return v_id;
end $$;

-- Quien revisa en Telegram aprueba o rechaza. Solo si se aprueba cambia el ticket.
-- (La tienda se actualiza aparte: n8n llama a su API, este sistema no tiene acceso a ella.)
create or replace function public.erp_review_decision(p_id bigint, p_approved boolean, p_reviewer text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d  public.agent_decisions;
  tk public.tickets;
begin
  select * into d from public.agent_decisions where id = p_id for update;
  if not found then raise exception 'negocio: decisión % no existe', p_id; end if;
  if d.final_status <> 'pendiente_revision' then
    return jsonb_build_object('result', 'ya_revisada', 'final_status', d.final_status);
  end if;
  select * into tk from public.tickets where external_id = d.ticket_ref;

  update public.agent_decisions
     set final_status = case when p_approved then 'aprobado' else 'rechazado' end,
         reviewer = left(p_reviewer, 80), review_note = left(p_note, 500), reviewed_at = now()
   where id = p_id;

  if tk.id is not null then
    insert into public.ticket_activity (ticket_id, kind, body, author)
    values (tk.id, 'revision_humana', format('Propuesta #%s %s por %s', p_id,
            case when p_approved then 'APROBADA' else 'RECHAZADA' end, p_reviewer), left(p_reviewer, 80));
    if p_approved then
      update public.tickets set priority = coalesce(d.priority, priority),
             status = case when status = 'nuevo' then 'en_curso' else status end, updated_at = now()
       where id = tk.id;
    end if;
  end if;

  return jsonb_build_object('result', case when p_approved then 'aprobado' else 'rechazado' end,
                            'decision_id', p_id, 'chat_id', tk.telegram_chat_id,
                            'customer_message', d.customer_message, 'ticket_ref', d.ticket_ref,
                            'previous_ticket_status', tk.status);
end $$;

create or replace function public.erp_mark_delivered(p_id bigint, p_simulated boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d public.agent_decisions;
begin
  update public.agent_decisions
     set final_status = case when p_simulated then 'ejecutado_simulado' else 'enviado' end,
         delivered_at = case when p_simulated then null else now() end
   where id = p_id
     and (final_status = 'aprobado' or (not p_simulated and final_status = 'ejecutado_simulado'))
  returning * into d;
  if found and not p_simulated then
    insert into public.ticket_activity (ticket_id, kind, body, author)
    select t.id, 'respuesta_enviada', 'Telegram: ' || d.customer_message, 'integracion'
    from public.tickets t where t.external_id = d.ticket_ref;
    update public.tickets set status = 'esperando_cliente', updated_at = now() where external_id = d.ticket_ref;
  end if;
end $$;

-- Bot de Telegram: /start <token> vincula el chat con la incidencia (el token llegó con el evento)
create or replace function public.erp_link_telegram(p_token text, p_chat_id text, p_username text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tickets;
begin
  update public.tickets set telegram_chat_id = p_chat_id, channel = 'telegram', updated_at = now()
   where telegram_token = btrim(p_token)
  returning * into t;
  if not found then
    return jsonb_build_object('result', 'token_no_valido');
  end if;
  update public.customers set telegram_chat_id = p_chat_id, telegram_username = left(p_username, 64), updated_at = now()
   where id = t.customer_id;
  return jsonb_build_object('result', 'vinculado', 'ticket_ref', t.external_id,
    'pending', coalesce((select jsonb_agg(jsonb_build_object('decision_id', d.id, 'customer_message', d.customer_message))
                         from public.agent_decisions d
                         where d.ticket_ref = t.external_id and d.final_status in ('aprobado', 'ejecutado_simulado')
                           and d.customer_message is not null), '[]'::jsonb));
end $$;

-- Mensaje del cliente por Telegram → actividad del ticket más reciente de ese chat
create or replace function public.erp_customer_message(p_chat_id text, p_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ticket public.tickets;
begin
  select * into v_ticket from public.tickets where telegram_chat_id = p_chat_id order by created_at desc limit 1;
  if not found then return jsonb_build_object('result', 'sin_incidencia'); end if;
  insert into public.ticket_activity (ticket_id, kind, body, author)
  values (v_ticket.id, 'mensaje_cliente', left(p_text, 2000), 'cliente (Telegram)');
  update public.tickets set status = case when status = 'esperando_cliente' then 'en_curso' else status end,
                            updated_at = now() where id = v_ticket.id;
  return jsonb_build_object('result', 'registrado', 'ticket_ref', v_ticket.external_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'erp_log(jsonb)', 'erp_upsert_order(uuid, timestamptz, jsonb, text)', 'erp_set_stock(uuid, text, int, text)',
    'erp_load_inventory(jsonb)', 'erp_upsert_ticket(uuid, jsonb)', 'erp_tool_order(text)', 'erp_tool_customer(text)',
    'erp_tool_stock(text)', 'erp_tool_internal_note(text, text)', 'erp_save_decision(jsonb)',
    'erp_review_decision(bigint, boolean, text, text)', 'erp_mark_delivered(bigint, boolean)',
    'erp_link_telegram(text, text, text)', 'erp_customer_message(text, text)',
    '_upsert_customer(jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------
-- 3. Cuadro de mando del back-office (solo personal)
-- ---------------------------------------------------------
create or replace function public.erp_dashboard(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not public.is_staff() then raise exception 'Solo personal del back-office' using errcode = '42501'; end if;
  return jsonb_build_object(
    'from', v_from,
    'integration', (select jsonb_build_object(
        'received', count(*),
        'ok', count(*) filter (where status in ('ok', 'duplicado', 'obsoleto', 'ignorado')),
        'error', count(*) filter (where status = 'error'),
        'duplicates', count(*) filter (where status = 'duplicado'),
        'obsolete', count(*) filter (where status = 'obsoleto'),
        'avg_latency_s', round(avg(extract(epoch from created_at - occurred_at))
                               filter (where status <> 'error' and occurred_at is not null)::numeric, 1))
      from public.integration_log where created_at >= v_from and step = 'resultado'),
    'errors_by_type', coalesce((select jsonb_object_agg(error_type, n) from (select error_type, count(*) n
               from public.integration_log where created_at >= v_from and status = 'error' and error_type is not null
               group by error_type) x), '{}'::jsonb),
    'orders', (select count(*) from public.sales_orders),
    'orders_amount', (select coalesce(sum(total_amount), 0) from public.sales_orders where payment_status = 'pagado'),
    'orders_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.sales_orders group by status) x), '{}'::jsonb),
    'orders_per_day', coalesce((select jsonb_agg(x order by x.day) from (
          select (ordered_at at time zone 'Europe/Madrid')::date as day, count(*) n,
                 sum(total_amount) filter (where payment_status = 'pagado') amount
          from public.sales_orders where ordered_at >= v_from group by 1) x), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(x) from (select l.sku, l.description, sum(l.quantity) qty
                              from public.sales_order_lines l join public.sales_orders o on o.id = l.order_id
                              where o.payment_status = 'pagado' group by l.sku, l.description
                              order by qty desc limit 5) x), '[]'::jsonb),
    'inventory', (select jsonb_build_object('skus', count(*), 'units', coalesce(sum(on_hand), 0),
                                            'low', count(*) filter (where on_hand < 5)) from public.inventory),
    'customers', (select count(*) from public.customers),
    'open_tickets', (select count(*) from public.tickets where status <> 'resuelto'),
    'tickets_by_priority', coalesce((select jsonb_object_agg(priority, n) from (select priority, count(*) n from public.tickets where status <> 'resuelto' group by priority) x), '{}'::jsonb),
    'avg_resolution_h', (select round(avg(extract(epoch from resolved_at - created_at) / 3600)::numeric, 1)
                         from public.tickets where resolved_at is not null),
    'agent', (select jsonb_build_object(
        'proposals', count(*),
        'approved', count(*) filter (where final_status in ('aprobado', 'enviado', 'ejecutado_simulado')),
        'rejected', count(*) filter (where final_status = 'rechazado'),
        'pending', count(*) filter (where final_status = 'pendiente_revision'),
        'sent', count(*) filter (where final_status = 'enviado'),
        'avg_confidence', round(avg(confidence), 2))
      from public.agent_decisions where created_at >= v_from));
end $$;
revoke execute on function public.erp_dashboard(int) from public, anon;
grant  execute on function public.erp_dashboard(int) to authenticated;

notify pgrst, 'reload schema';
