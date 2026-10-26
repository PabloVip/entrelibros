-- =========================================================
-- Entrelibros · Tarea 2 · Integración con el back-office (ERP), automatización e IA agéntica
-- Ejecutar DESPUÉS de 01 → 13. Se puede ejecutar varias veces.
--
-- Qué añade:
--   1. Esquema erp: el "sistema interno" (ERP/CRM académico) al que solo escribe n8n por API.
--   2. integration_outbox: cola de salida. Cada evento de negocio relevante de la tienda se
--      convierte en un mensaje con el contrato entrelibros.event.v1 y se envía al webhook de n8n
--      (pg_net). Si n8n no confirma (ack), se reintenta (pg_cron). Nada se copia a mano.
--   3. integration_log: trazabilidad de cada paso de cada ejecución (correcta o fallida).
--   4. agent_decisions: salida estructurada del agente de IA y la revisión humana.
--   5. telegram_links: vinculación de una incidencia con el chat de Telegram del cliente.
--   6. Funciones erp_* (solo para n8n, con la clave secreta) y admin_* para el cuadro de mando.
--
-- Configuración (una vez, en el SQL Editor, con los valores reales; NO se guardan en el repo):
--   select public.integration_configure(
--     'https://<tu-n8n>.onrender.com/webhook/entrelibros/eventos',  -- URL del webhook de n8n
--     '<secreto-compartido-largo>',                                   -- cabecera X-Entrelibros-Key
--     true);                                                          -- activar envíos
-- =========================================================

-- ---------------------------------------------------------
-- 0. Extensiones (en Supabase existen; en local se sustituyen por un stub)
-- ---------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
exception when others then
  raise notice 'No se han podido activar pg_net/pg_cron (%): actívalas en Database → Extensions', sqlerrm;
end $$;

-- Esquema donde n8n (Render) guarda sus propias tablas: workflows, credenciales cifradas, ejecuciones
create schema if not exists n8n;
revoke all on schema n8n from public, anon, authenticated;

-- Eventos generados por la propia integración (no se vuelven a enviar: evita bucles)
alter table public.events drop constraint if exists events_source_check;
alter table public.events add constraint events_source_check
  check (source in ('web', 'servidor', 'backoffice', 'integracion'));

-- ---------------------------------------------------------
-- 1. ERP / CRM académico (sistema de back-office destino)
-- ---------------------------------------------------------
create schema if not exists erp;
revoke all on schema erp from public, anon, authenticated;

create table if not exists erp.customers (
  id                bigint generated always as identity primary key,
  external_ref      text not null unique,                  -- email normalizado (clave de negocio)
  full_name         text,
  email             text not null,
  phone             text,
  shop_customer_id  bigint,
  telegram_chat_id  text,
  telegram_username text,
  first_order_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists erp.sales_orders (
  id               bigint generated always as identity primary key,
  external_id      text not null unique,                   -- número de pedido de la tienda
  source_system    text not null default 'entrelibros-web',
  customer_id      bigint not null references erp.customers(id),
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

create table if not exists erp.sales_order_lines (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references erp.sales_orders(id) on delete cascade,
  line_no     int not null,
  sku         text not null,
  description text not null,
  quantity    int not null check (quantity > 0),
  unit_price  numeric(10,2) not null,
  amount      numeric(10,2) not null,
  unique (order_id, line_no)
);

create table if not exists erp.inventory (
  sku           text primary key,
  description   text,
  on_hand       int not null,
  last_event_id uuid,
  updated_at    timestamptz not null default now()
);

create table if not exists erp.tickets (
  id            bigint generated always as identity primary key,
  external_id   text not null unique,                       -- SOP-AAAAMMDD-XXXX
  customer_id   bigint not null references erp.customers(id),
  order_id      bigint references erp.sales_orders(id),
  category      text not null,
  priority      text not null default 'media' check (priority in ('baja','media','alta','urgente')),
  status        text not null default 'nuevo' check (status in ('nuevo','en_curso','esperando_cliente','resuelto')),
  subject       text not null,
  description   text not null,
  channel       text not null default 'web' check (channel in ('web','telegram')),
  sla_due_at    timestamptz,
  resolved_at   timestamptz,
  last_event_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists erp.ticket_activity (
  id         bigint generated always as identity primary key,
  ticket_id  bigint not null references erp.tickets(id) on delete cascade,
  kind       text not null check (kind in ('alta','nota_interna','mensaje_cliente','respuesta_enviada',
                                           'cambio_estado','propuesta_ia','revision_humana')),
  body       text not null,
  author     text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 2. Cola de salida, log de integración, decisiones del agente, Telegram
-- ---------------------------------------------------------
create table if not exists public.integration_settings (
  id            boolean primary key default true check (id),
  webhook_url   text,
  webhook_key   text,
  enabled       boolean not null default false,
  keepalive_url text,
  max_attempts  int not null default 6
);
insert into public.integration_settings (id) values (true) on conflict do nothing;
alter table public.integration_settings enable row level security;   -- sin políticas: nadie la lee por la API
revoke all on public.integration_settings from anon, authenticated;

create table if not exists public.integration_outbox (
  id              bigint generated always as identity primary key,
  event_id        uuid not null unique,                     -- idempotencia: un mensaje por evento
  event_type      text not null,
  payload         jsonb not null,
  status          text not null default 'pendiente'
                  check (status in ('pendiente','enviado','procesado','error','descartado')),
  attempts        int not null default 0,
  last_request_id bigint,
  last_error      text,
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  processed_at    timestamptz
);
create index if not exists idx_outbox_pending on public.integration_outbox (status, next_attempt_at);

create table if not exists public.integration_log (
  id           bigint generated always as identity primary key,
  execution_id text,                                        -- id de ejecución de n8n
  workflow     text not null,
  step         text not null,
  event_id     uuid,
  event_type   text,
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
create index if not exists idx_intlog_event on public.integration_log (event_id);

create table if not exists public.agent_decisions (
  id               bigint generated always as identity primary key,
  event_id         uuid,
  ticket_ref       text not null,
  order_ref        text,
  case_type        text not null,
  consulted        jsonb not null default '{}'::jsonb,      -- datos que consultó (herramientas)
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

create table if not exists public.telegram_links (
  token             text primary key,
  ticket_number     text not null unique,
  customer_email    text not null,
  chat_id           text,
  telegram_username text,
  linked_at         timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.integration_outbox enable row level security;
alter table public.integration_log    enable row level security;
alter table public.agent_decisions    enable row level security;
alter table public.telegram_links     enable row level security;
drop policy if exists "admin lee outbox"     on public.integration_outbox;
drop policy if exists "admin lee intlog"     on public.integration_log;
drop policy if exists "admin lee decisiones" on public.agent_decisions;
create policy "admin lee outbox"     on public.integration_outbox for select to authenticated using (public.is_admin());
create policy "admin lee intlog"     on public.integration_log    for select to authenticated using (public.is_admin());
create policy "admin lee decisiones" on public.agent_decisions    for select to authenticated using (public.is_admin());
-- telegram_links: sin políticas (solo funciones)

-- ---------------------------------------------------------
-- 3. Contrato entrelibros.event.v1 (lo que recibe n8n)
-- ---------------------------------------------------------
create or replace function public._integration_order_snapshot(p_order_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status',       o.status,
    'created_at',   o.created_at,
    'currency',     'EUR',
    'amounts', jsonb_build_object(
      'subtotal', o.subtotal, 'discount', o.discount_amount, 'discount_code', o.discount_code,
      'shipping', o.shipping_cost, 'tax_rate', o.tax_rate, 'tax', o.tax_amount, 'total', o.total),
    'customer', jsonb_build_object(
      'shop_id', c.id, 'email', c.email, 'full_name', c.full_name, 'phone', c.phone,
      'is_test', c.is_test),
    'shipping', jsonb_build_object(
      'method_code', s.code, 'method', s.name,
      'name', o.ship_name, 'address', o.ship_address, 'postcode', o.ship_postcode,
      'city', o.ship_city, 'province', o.ship_province, 'country', o.ship_country,
      'pickup_point', (select p.name from public.pickup_points p where p.id = o.pickup_point_id)),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sku', i.sku, 'product_name', i.product_name, 'variant_name', i.variant_name,
               'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total)
             order by i.id)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'payment', (
      select jsonb_build_object('method', p.method, 'status', p.status,
                                'reference', p.transaction_ref, 'amount', p.amount, 'at', p.created_at)
      from public.payments p where p.order_id = o.id
      order by (p.status = 'aprobado') desc, p.created_at desc limit 1))
  from public.orders o
  join public.customers c on c.id = o.customer_id
  left join public.shipping_methods s on s.id = o.shipping_method_id
  where o.id = p_order_id;
$$;

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
        'telegram_linked', exists (select 1 from public.telegram_links l
                                   where l.ticket_number = v_t.ticket_number and l.chat_id is not null)));
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

-- Eventos que se integran con el back-office
create or replace function public._integration_enqueue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'integracion' then
    return new;                                   -- cambios hechos por la propia integración
  end if;
  if new.event_type in ('order.created', 'payment.simulated', 'order.status_changed',
                        'stock.adjusted', 'support.requested', 'support.status_changed') then
    insert into public.integration_outbox (event_id, event_type, payload)
    values (new.event_id, new.event_type, public._integration_build_payload(new))
    on conflict (event_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_events_outbox on public.events;
create trigger trg_events_outbox after insert on public.events
  for each row execute function public._integration_enqueue();

-- Token para seguir la incidencia por Telegram (se crea con cada incidencia)
create or replace function public._telegram_token() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.telegram_links (token, ticket_number, customer_email)
  values (substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), new.ticket_number, new.customer_email)
  on conflict (ticket_number) do nothing;
  return new;
end $$;
drop trigger if exists trg_support_telegram on public.support_requests;
create trigger trg_support_telegram after insert on public.support_requests
  for each row execute function public._telegram_token();
insert into public.telegram_links (token, ticket_number, customer_email)
select substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), ticket_number, customer_email from public.support_requests
on conflict (ticket_number) do nothing;

-- La web pide el enlace de Telegram de su incidencia (solo con número + email correctos)
create or replace function public.support_telegram_token(p_ticket text, p_email text)
returns text language sql stable security definer set search_path = public as $$
  select token from public.telegram_links
  where ticket_number = upper(btrim(p_ticket)) and customer_email = lower(btrim(p_email));
$$;
grant execute on function public.support_telegram_token(text, text) to anon, authenticated;

-- ---------------------------------------------------------
-- 4. Envío a n8n (pg_net) y reintentos (pg_cron)
-- ---------------------------------------------------------
create or replace function public.integration_configure(p_url text, p_key text, p_enabled boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_url !~ '^https://' then raise exception 'La URL del webhook debe ser https'; end if;
  if char_length(p_key) < 24 then raise exception 'El secreto debe tener al menos 24 caracteres'; end if;
  update public.integration_settings
     set webhook_url = p_url, webhook_key = p_key, enabled = p_enabled,
         keepalive_url = regexp_replace(p_url, '/webhook/.*$', '/healthz')
   where id;
end $$;
revoke execute on function public.integration_configure(text, text, boolean) from public, anon, authenticated;

create or replace function public.integration_dispatch(p_id bigint)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  s   public.integration_settings;
  m   public.integration_outbox;
  rid bigint;
begin
  select * into s from public.integration_settings where id;
  if not coalesce(s.enabled, false) or s.webhook_url is null then
    return;                                       -- queda "pendiente" hasta que se active
  end if;
  select * into m from public.integration_outbox where id = p_id for update skip locked;
  if not found or m.status not in ('pendiente', 'enviado', 'error') then
    return;
  end if;
  if m.attempts >= s.max_attempts then
    update public.integration_outbox set status = 'error',
           last_error = coalesce(last_error, 'Sin confirmación de n8n') || ' · reintentos agotados'
     where id = p_id;
    return;
  end if;

  rid := net.http_post(
    url     := s.webhook_url,
    body    := m.payload,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'X-Entrelibros-Key', s.webhook_key,
                                  'X-Entrelibros-Attempt', (m.attempts + 1)::text),
    timeout_milliseconds := 8000);

  update public.integration_outbox
     set status = 'enviado', attempts = attempts + 1, last_request_id = rid, sent_at = now(),
         -- espera creciente: 2, 4, 8, 16… minutos (Render gratis tarda en despertar)
         next_attempt_at = now() + make_interval(mins => power(2, least(attempts + 1, 6))::int)
   where id = p_id;
end $$;
revoke execute on function public.integration_dispatch(bigint) from public, anon, authenticated;

create or replace function public._integration_dispatch_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.integration_dispatch(new.id);
  return new;
end $$;
drop trigger if exists trg_outbox_dispatch on public.integration_outbox;
create trigger trg_outbox_dispatch after insert on public.integration_outbox
  for each row execute function public._integration_dispatch_trigger();

-- Reintentos: mensajes sin confirmar cuya espera ya ha pasado (lo lanza pg_cron cada minuto)
create or replace function public.integration_retry() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.integration_outbox
           where status in ('pendiente', 'enviado') and next_attempt_at <= now()
           order by id limit 20 loop
    perform public.integration_dispatch(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.integration_retry() from public, anon, authenticated;

-- Mantener despierto el n8n de Render (gratis se duerme a los 15 min) — solo si está activado
create or replace function public.integration_keepalive() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s public.integration_settings;
begin
  select * into s from public.integration_settings where id;
  if s.enabled and s.keepalive_url is not null then
    perform net.http_get(url := s.keepalive_url, timeout_milliseconds := 5000);
  end if;
end $$;
revoke execute on function public.integration_keepalive() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('entrelibros-integracion', 'entrelibros-keepalive');
    perform cron.schedule('entrelibros-integracion', '* * * * *', 'select public.integration_retry()');
    perform cron.schedule('entrelibros-keepalive', '*/10 * * * *', 'select public.integration_keepalive()');
  end if;
end $$;

-- ---------------------------------------------------------
-- 5. API para n8n (solo service_role: la clave secreta está en las credenciales de n8n)
-- ---------------------------------------------------------

-- Confirmación de n8n: el mensaje se ha procesado (o ha fallado sin remedio)
create or replace function public.erp_ack(p_event_id uuid, p_ok boolean, p_detail text default null, p_retry boolean default false)
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

create or replace function public.erp_log(p_entry jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into public.integration_log (execution_id, workflow, step, event_id, event_type, entity_type,
                                      entity_ref, status, error_type, message, details, duration_ms)
  values (p_entry->>'execution_id', coalesce(p_entry->>'workflow', 'desconocido'),
          coalesce(p_entry->>'step', 'desconocido'),
          case when p_entry->>'event_id' ~ '^[0-9a-f-]{36}$' then (p_entry->>'event_id')::uuid end,
          p_entry->>'event_type', p_entry->>'entity_type', p_entry->>'entity_ref',
          coalesce(p_entry->>'status', 'ok'), nullif(p_entry->>'error_type', ''),
          left(p_entry->>'message', 1000), coalesce(p_entry->'details', '{}'::jsonb),
          (p_entry->>'duration_ms')::int)
  returning id into v_id;
  return v_id;
end $$;

create or replace function erp._map_status(p text) returns text language sql immutable as $$
  select case p
    when 'creado' then 'pendiente_pago' when 'pago_simulado' then 'pagado'
    when 'pendiente_preparacion' then 'en_preparacion' else p end;
$$;

create or replace function erp._upsert_customer(c jsonb) returns bigint
language plpgsql security definer set search_path = erp, public as $$
declare v_id bigint; v_email text := lower(btrim(c->>'email'));
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'contrato: email de cliente no válido' using errcode = '22023';
  end if;
  insert into erp.customers (external_ref, email, full_name, phone, shop_customer_id)
  values (v_email, v_email, nullif(btrim(c->>'full_name'), ''), nullif(c->>'phone', ''), (c->>'shop_id')::bigint)
  on conflict (external_ref) do update
     set full_name = coalesce(excluded.full_name, erp.customers.full_name),
         phone = coalesce(excluded.phone, erp.customers.phone),
         shop_customer_id = coalesce(excluded.shop_customer_id, erp.customers.shop_customer_id),
         updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- Escenarios 1 y 2: crea o actualiza el pedido de venta en el ERP (idempotente)
-- p_order: pedido ya validado y normalizado por n8n (ver docs/contrato)
create or replace function public.erp_upsert_order(p_event_id uuid, p_occurred_at timestamptz, p_order jsonb)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare
  v_cust   bigint;
  v_id     bigint;
  v_prev   erp.sales_orders;
  v_lines  jsonb := p_order->'lines';
  v_sum    numeric;
  v_status text := erp._map_status(p_order->>'status');
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

  select * into v_prev from erp.sales_orders where external_id = p_order->>'order_number' for update;
  if found and v_prev.last_event_id = p_event_id then
    return jsonb_build_object('result', 'duplicado', 'erp_id', v_prev.id, 'status', v_prev.status);
  end if;
  if found and v_prev.last_event_at > p_occurred_at then
    return jsonb_build_object('result', 'obsoleto', 'erp_id', v_prev.id, 'status', v_prev.status);
  end if;

  v_cust := erp._upsert_customer(p_order->'customer');
  update erp.customers set first_order_at = least(coalesce(first_order_at, (p_order->>'created_at')::timestamptz),
                                                  (p_order->>'created_at')::timestamptz)
   where id = v_cust;

  insert into erp.sales_orders as so (external_id, customer_id, status, payment_status, payment_method, payment_ref,
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

  delete from erp.sales_order_lines where order_id = v_id;
  for l in select * from jsonb_array_elements(v_lines) loop
    n := n + 1;
    insert into erp.sales_order_lines (order_id, line_no, sku, description, quantity, unit_price, amount)
    values (v_id, n, l->>'sku', l->>'description', (l->>'quantity')::int,
            (l->>'unit_price')::numeric, (l->>'line_total')::numeric);
  end loop;

  v_result := case when v_prev.id is null then 'creado'
                   when v_prev.status is distinct from v_status then 'actualizado'
                   else 'sin_cambios' end;
  return jsonb_build_object('result', v_result, 'erp_id', v_id, 'status', v_status,
                            'previous_status', v_prev.status, 'sync_version',
                            (select sync_version from erp.sales_orders where id = v_id));
end $$;

-- Escenario 2: stock (inventario del ERP)
create or replace function public.erp_set_stock(p_event_id uuid, p_sku text, p_on_hand int, p_description text default null)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare v_prev int;
begin
  if p_sku is null or p_on_hand is null or p_on_hand < 0 then
    raise exception 'contrato: SKU o stock no válido' using errcode = '22023';
  end if;
  select on_hand into v_prev from erp.inventory where sku = p_sku;
  if exists (select 1 from erp.inventory where sku = p_sku and last_event_id = p_event_id) then
    return jsonb_build_object('result', 'duplicado', 'sku', p_sku, 'on_hand', v_prev);
  end if;
  insert into erp.inventory (sku, description, on_hand, last_event_id)
  values (p_sku, p_description, p_on_hand, p_event_id)
  on conflict (sku) do update set on_hand = excluded.on_hand, last_event_id = excluded.last_event_id,
     description = coalesce(excluded.description, erp.inventory.description), updated_at = now();
  return jsonb_build_object('result', case when v_prev is null then 'creado' else 'actualizado' end,
                            'sku', p_sku, 'from', v_prev, 'on_hand', p_on_hand);
end $$;

-- Escenario 3: incidencia en el CRM (alta o cambio de estado), asociada a cliente y pedido
create or replace function public.erp_upsert_ticket(p_event_id uuid, p_ticket jsonb)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare
  v_cust  bigint;
  v_order bigint;
  v_prev  erp.tickets;
  v_id    bigint;
  v_stat  text := case p_ticket->>'status' when 'abierta' then 'nuevo' when 'resuelta' then 'resuelto'
                                           else coalesce(p_ticket->>'status', 'nuevo') end;
begin
  if p_ticket->>'ticket_number' is null or p_ticket->>'customer_email' is null then
    raise exception 'contrato: incidencia sin número o sin email' using errcode = '22023';
  end if;
  select * into v_prev from erp.tickets where external_id = p_ticket->>'ticket_number' for update;
  if found and v_prev.last_event_id = p_event_id then
    return jsonb_build_object('result', 'duplicado', 'erp_id', v_prev.id, 'status', v_prev.status);
  end if;

  v_cust := erp._upsert_customer(jsonb_build_object('email', p_ticket->>'customer_email',
                                                    'full_name', p_ticket->>'customer_name'));
  select id into v_order from erp.sales_orders where external_id = p_ticket->>'order_number';

  insert into erp.tickets as t (external_id, customer_id, order_id, category, priority, status, subject,
                                description, sla_due_at, resolved_at, last_event_id)
  values (p_ticket->>'ticket_number', v_cust, v_order, coalesce(p_ticket->>'category', 'otro'),
          coalesce(p_ticket->>'priority', 'media'), v_stat, coalesce(p_ticket->>'subject', 'Incidencia'),
          coalesce(p_ticket->>'message', ''), (p_ticket->>'sla_due_at')::timestamptz,
          case when v_stat = 'resuelto' then now() end, p_event_id)
  on conflict (external_id) do update
     set status = excluded.status, order_id = coalesce(t.order_id, excluded.order_id),
         resolved_at = case when excluded.status = 'resuelto' then coalesce(t.resolved_at, now()) end,
         last_event_id = excluded.last_event_id, updated_at = now()
  returning id into v_id;

  insert into erp.ticket_activity (ticket_id, kind, body, author)
  values (v_id, case when v_prev.id is null then 'alta' else 'cambio_estado' end,
          case when v_prev.id is null then 'Alta desde la tienda: ' || coalesce(p_ticket->>'subject', '')
               else 'Estado: ' || v_prev.status || ' → ' || v_stat end, 'integracion');

  return jsonb_build_object('result', case when v_prev.id is null then 'creado'
                                           when v_prev.status = v_stat then 'sin_cambios' else 'actualizado' end,
                            'erp_id', v_id, 'status', v_stat, 'previous_status', v_prev.status,
                            'order_linked', v_order is not null);
end $$;

-- ---------- Herramientas del agente (consulta) ----------
create or replace function public.erp_tool_order(p_order_number text)
returns jsonb language sql stable security definer set search_path = erp, public as $$
  select coalesce((
    select jsonb_build_object(
      'order_number', o.order_number, 'shop_status', o.status, 'created_at', o.created_at,
      'total', o.total, 'shipping_method', s.name, 'eta_days', s.eta_days_min || '-' || s.eta_days_max,
      'days_since_order', extract(day from now() - o.created_at)::int,
      'lines', (select jsonb_agg(jsonb_build_object('sku', i.sku, 'product', i.product_name,
                                 'variant', i.variant_name, 'qty', i.quantity)) from public.order_items i where i.order_id = o.id),
      'status_history', (select jsonb_agg(jsonb_build_object('to', h.to_status, 'at', h.created_at) order by h.created_at)
                         from public.order_status_history h where h.order_id = o.id),
      'erp', (select jsonb_build_object('status', so.status, 'payment_status', so.payment_status,
                                        'sync_version', so.sync_version, 'updated_at', so.updated_at)
              from erp.sales_orders so where so.external_id = o.order_number))
    from public.orders o left join public.shipping_methods s on s.id = o.shipping_method_id
    where o.order_number = upper(btrim(p_order_number))),
    jsonb_build_object('error', 'pedido no encontrado', 'order_number', p_order_number));
$$;

create or replace function public.erp_tool_customer(p_email text)
returns jsonb language sql stable security definer set search_path = erp, public as $$
  select jsonb_build_object(
    'email', lower(btrim(p_email)),
    'erp_customer', (select jsonb_build_object('since', c.created_at, 'telegram_linked', c.telegram_chat_id is not null)
                     from erp.customers c where c.external_ref = lower(btrim(p_email))),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('order_number', o.order_number, 'status', o.status,
                                                             'total', o.total, 'created_at', o.created_at)
                                         order by o.created_at desc)
                        from public.orders o join public.customers c on c.id = o.customer_id
                        where c.email = lower(btrim(p_email))), '[]'::jsonb),
    'previous_tickets', coalesce((select jsonb_agg(jsonb_build_object('ticket', t.ticket_number, 'reason', t.reason,
                                                                       'status', t.status, 'created_at', t.created_at)
                                                   order by t.created_at desc)
                                  from public.support_requests t where t.customer_email = lower(btrim(p_email))), '[]'::jsonb));
$$;

create or replace function public.erp_tool_stock(p_query text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('sku', v.sku, 'product', p.name, 'variant', v.name,
                                               'stock', v.stock, 'active', v.is_active and p.is_active)), '[]'::jsonb)
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.sku ilike '%' || btrim(p_query) || '%' or p.name ilike '%' || btrim(p_query) || '%'
  limit 10;
$$;

-- ---------- Herramienta de acción reversible del agente: nota interna en el ticket ----------
create or replace function public.erp_tool_internal_note(p_ticket text, p_note text)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare v_id bigint;
begin
  select id into v_id from erp.tickets where external_id = upper(btrim(p_ticket));
  if v_id is null then return jsonb_build_object('error', 'ticket no encontrado en el CRM'); end if;
  insert into erp.ticket_activity (ticket_id, kind, body, author)
  values (v_id, 'nota_interna', left(p_note, 1000), 'agente-ia');
  return jsonb_build_object('result', 'nota_creada', 'ticket', p_ticket);
end $$;

-- ---------- Decisiones del agente y revisión humana ----------
create or replace function public.erp_save_decision(p_d jsonb)
returns bigint language plpgsql security definer set search_path = erp, public as $$
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

  select id into v_ticket from erp.tickets where external_id = p_d->>'ticket_ref';
  if v_ticket is not null then
    insert into erp.ticket_activity (ticket_id, kind, body, author)
    values (v_ticket, 'propuesta_ia', format('Propuesta #%s (%s, prioridad %s, confianza %s): %s',
            v_id, p_d->>'case_type', p_d->>'priority', p_d->>'confidence', p_d->>'proposed_action'), 'agente-ia');
  end if;
  return v_id;
end $$;

-- La persona que revisa (en Telegram) aprueba o rechaza. Solo si se aprueba se aplica en el CRM.
create or replace function public.erp_review_decision(p_id bigint, p_approved boolean, p_reviewer text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare
  d   public.agent_decisions;
  tk  erp.tickets;
  ch  text;
begin
  select * into d from public.agent_decisions where id = p_id for update;
  if not found then raise exception 'negocio: decisión % no existe', p_id; end if;
  if d.final_status <> 'pendiente_revision' then
    return jsonb_build_object('result', 'ya_revisada', 'final_status', d.final_status);
  end if;
  select * into tk from erp.tickets where external_id = d.ticket_ref;
  select chat_id into ch from public.telegram_links where ticket_number = d.ticket_ref;

  update public.agent_decisions
     set final_status = case when p_approved then 'aprobado' else 'rechazado' end,
         reviewer = left(p_reviewer, 80), review_note = left(p_note, 500), reviewed_at = now()
   where id = p_id;

  if tk.id is not null then
    insert into erp.ticket_activity (ticket_id, kind, body, author)
    values (tk.id, 'revision_humana', format('Propuesta #%s %s por %s', p_id,
            case when p_approved then 'APROBADA' else 'RECHAZADA' end, p_reviewer), left(p_reviewer, 80));
    if p_approved then
      update erp.tickets set priority = coalesce(d.priority, priority),
             status = case when status = 'nuevo' then 'en_curso' else status end, updated_at = now()
       where id = tk.id;
      -- sincronización inversa: la tienda también pasa la incidencia a "en curso"
      update public.support_requests set status = 'en_curso'
       where ticket_number = d.ticket_ref and status = 'abierta';
      if found then
        perform public._emit_event('support.status_changed', 'integracion', null, 'support', d.ticket_ref,
          jsonb_build_object('ticket_number', d.ticket_ref, 'from', 'abierta', 'to', 'en_curso',
                             'by', 'integracion (propuesta #' || p_id || ' aprobada)'));
      end if;
    end if;
  end if;

  return jsonb_build_object('result', case when p_approved then 'aprobado' else 'rechazado' end,
                            'decision_id', p_id, 'chat_id', ch, 'customer_message', d.customer_message,
                            'ticket_ref', d.ticket_ref);
end $$;

-- Tras enviar (o simular) el mensaje al cliente
create or replace function public.erp_mark_delivered(p_id bigint, p_simulated boolean)
returns void language plpgsql security definer set search_path = erp, public as $$
declare d public.agent_decisions;
begin
  update public.agent_decisions
     set final_status = case when p_simulated then 'ejecutado_simulado' else 'enviado' end,
         delivered_at = case when p_simulated then null else now() end
   where id = p_id
     and (final_status = 'aprobado' or (not p_simulated and final_status = 'ejecutado_simulado'))
  returning * into d;
  if found and not p_simulated then
    insert into erp.ticket_activity (ticket_id, kind, body, author)
    select t.id, 'respuesta_enviada', 'Telegram: ' || d.customer_message, 'integracion'
    from erp.tickets t where t.external_id = d.ticket_ref;
    update erp.tickets set status = 'esperando_cliente', updated_at = now() where external_id = d.ticket_ref;
  end if;
end $$;

-- Bot de Telegram: /start <token> vincula el chat con la incidencia
create or replace function public.erp_link_telegram(p_token text, p_chat_id text, p_username text default null)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare l public.telegram_links;
begin
  update public.telegram_links set chat_id = p_chat_id, telegram_username = left(p_username, 64), linked_at = now()
   where token = btrim(p_token)
  returning * into l;
  if not found then
    return jsonb_build_object('result', 'token_no_valido');
  end if;
  update erp.customers set telegram_chat_id = p_chat_id, telegram_username = left(p_username, 64), updated_at = now()
   where external_ref = l.customer_email;
  update erp.tickets set channel = 'telegram', updated_at = now() where external_id = l.ticket_number;
  return jsonb_build_object('result', 'vinculado', 'ticket_ref', l.ticket_number,
    -- respuestas ya aprobadas que esperaban a que el cliente vinculara Telegram
    'pending', coalesce((select jsonb_agg(jsonb_build_object('decision_id', d.id, 'customer_message', d.customer_message))
                         from public.agent_decisions d
                         where d.ticket_ref = l.ticket_number and d.final_status in ('aprobado', 'ejecutado_simulado')
                           and d.customer_message is not null), '[]'::jsonb));
end $$;

-- Mensaje del cliente por Telegram → actividad del ticket
create or replace function public.erp_customer_message(p_chat_id text, p_text text)
returns jsonb language plpgsql security definer set search_path = erp, public as $$
declare v_ticket erp.tickets;
begin
  select t.* into v_ticket from erp.tickets t
   join public.telegram_links l on l.ticket_number = t.external_id
  where l.chat_id = p_chat_id order by t.created_at desc limit 1;
  if not found then return jsonb_build_object('result', 'sin_incidencia'); end if;
  insert into erp.ticket_activity (ticket_id, kind, body, author)
  values (v_ticket.id, 'mensaje_cliente', left(p_text, 2000), 'cliente (Telegram)');
  update erp.tickets set status = case when status = 'esperando_cliente' then 'en_curso' else status end,
                         updated_at = now() where id = v_ticket.id;
  return jsonb_build_object('result', 'registrado', 'ticket_ref', v_ticket.external_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'erp_ack(uuid, boolean, text, boolean)', 'erp_log(jsonb)', 'erp_upsert_order(uuid, timestamptz, jsonb)',
    'erp_set_stock(uuid, text, int, text)', 'erp_upsert_ticket(uuid, jsonb)', 'erp_tool_order(text)',
    'erp_tool_customer(text)', 'erp_tool_stock(text)', 'erp_tool_internal_note(text, text)',
    'erp_save_decision(jsonb)', 'erp_review_decision(bigint, boolean, text, text)',
    'erp_mark_delivered(bigint, boolean)', 'erp_link_telegram(text, text, text)',
    'erp_customer_message(text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
grant usage on schema erp to service_role;
grant select on all tables in schema erp to service_role;

-- ---------------------------------------------------------
-- 6. Back-office: cuadro de mando de integración (métricas calculadas, nada inventado)
-- ---------------------------------------------------------
create or replace function public.admin_integration_dashboard(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = erp, public as $$
declare v_from timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not public.is_admin() then raise exception 'Solo administradores' using errcode = '42501'; end if;
  return jsonb_build_object(
    'from', v_from,
    'outbox', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.integration_outbox
               where created_at >= v_from group by status) x),
    'executions', (select jsonb_build_object(
        'ok', count(*) filter (where status in ('ok', 'duplicado', 'obsoleto', 'ignorado')),
        'error', count(*) filter (where status = 'error'),
        'duplicates', count(*) filter (where status = 'duplicado'))
      from public.integration_log where created_at >= v_from and step = 'resultado'),
    'errors_by_type', coalesce((select jsonb_object_agg(error_type, n) from (select error_type, count(*) n
               from public.integration_log where created_at >= v_from and status = 'error' and error_type is not null
               group by error_type) x), '{}'::jsonb),
    'avg_latency_s', (select round(avg(extract(epoch from processed_at - created_at))::numeric, 1)
               from public.integration_outbox where processed_at is not null and created_at >= v_from),
    'erp', jsonb_build_object(
        'orders', (select count(*) from erp.sales_orders),
        'orders_amount', (select coalesce(sum(total_amount), 0) from erp.sales_orders where payment_status = 'pagado'),
        'orders_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from erp.sales_orders group by status) x), '{}'::jsonb),
        'open_tickets', (select count(*) from erp.tickets where status <> 'resuelto'),
        'tickets_by_priority', coalesce((select jsonb_object_agg(priority, n) from (select priority, count(*) n from erp.tickets where status <> 'resuelto' group by priority) x), '{}'::jsonb),
        'avg_resolution_h', (select round(avg(extract(epoch from resolved_at - created_at) / 3600)::numeric, 1)
                             from erp.tickets where resolved_at is not null),
        'top_products', coalesce((select jsonb_agg(x) from (select l.sku, l.description, sum(l.quantity) qty
                                  from erp.sales_order_lines l join erp.sales_orders o on o.id = l.order_id
                                  where o.payment_status = 'pagado' group by l.sku, l.description
                                  order by qty desc limit 5) x), '[]'::jsonb),
        'orders_per_day', coalesce((select jsonb_agg(x order by x.day) from (
              select (ordered_at at time zone 'Europe/Madrid')::date as day, count(*) n,
                     sum(total_amount) filter (where payment_status = 'pagado') amount
              from erp.sales_orders where ordered_at >= v_from group by 1) x), '[]'::jsonb)),
    'agent', (select jsonb_build_object(
        'proposals', count(*),
        'approved', count(*) filter (where final_status in ('aprobado', 'enviado', 'ejecutado_simulado')),
        'rejected', count(*) filter (where final_status = 'rechazado'),
        'pending', count(*) filter (where final_status = 'pendiente_revision'),
        'sent', count(*) filter (where final_status = 'enviado'),
        'avg_confidence', round(avg(confidence), 2),
        'by_case', coalesce((select jsonb_object_agg(case_type, n) from (select case_type, count(*) n from public.agent_decisions
                             where created_at >= v_from group by case_type) x), '{}'::jsonb))
      from public.agent_decisions where created_at >= v_from),
    'funnel', (select jsonb_build_object(
        'views', count(distinct session_id) filter (where event_type = 'product.viewed'),
        'carts', count(distinct session_id) filter (where event_type = 'cart.item_added'),
        'checkouts', count(distinct session_id) filter (where event_type = 'checkout.started'),
        'orders', count(*) filter (where event_type = 'order.created'),
        'paid', count(*) filter (where event_type = 'payment.simulated' and payload->>'status' = 'aprobado'))
      from public.events where occurred_at >= v_from));
end $$;
revoke execute on function public.admin_integration_dashboard(int) from public, anon;
grant  execute on function public.admin_integration_dashboard(int) to authenticated;

-- Listados para el back-office (ERP antes/después, log, decisiones)
create or replace function public.admin_integration_lists(p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = erp, public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores' using errcode = '42501'; end if;
  return jsonb_build_object(
    'outbox', coalesce((select jsonb_agg(x) from (select id, event_id, event_type, status, attempts, last_error,
                created_at, processed_at, payload->'data'->'order'->>'order_number' as order_number,
                payload->'data'->'ticket'->>'ticket_number' as ticket_number
                from public.integration_outbox order by id desc limit p_limit) x), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(x) from (select * from public.integration_log order by id desc limit p_limit) x), '[]'::jsonb),
    'decisions', coalesce((select jsonb_agg(x) from (select * from public.agent_decisions order by id desc limit p_limit) x), '[]'::jsonb),
    'erp_orders', coalesce((select jsonb_agg(x) from (select o.external_id, o.status, o.payment_status, o.payment_method,
                o.total_amount, o.ordered_at, o.sync_version, o.updated_at, c.email,
                (select count(*) from erp.sales_order_lines l where l.order_id = o.id) lines
                from erp.sales_orders o join erp.customers c on c.id = o.customer_id
                order by o.updated_at desc limit p_limit) x), '[]'::jsonb),
    'erp_tickets', coalesce((select jsonb_agg(x) from (select t.external_id, t.category, t.priority, t.status, t.channel,
                t.created_at, t.updated_at, c.email, o.external_id as order_number,
                (select jsonb_agg(jsonb_build_object('kind', a.kind, 'body', a.body, 'author', a.author, 'at', a.created_at)
                        order by a.id) from erp.ticket_activity a where a.ticket_id = t.id) activity
                from erp.tickets t join erp.customers c on c.id = t.customer_id
                left join erp.sales_orders o on o.id = t.order_id
                order by t.updated_at desc limit p_limit) x), '[]'::jsonb),
    'erp_inventory', coalesce((select jsonb_agg(x) from (select * from erp.inventory order by updated_at desc limit p_limit) x), '[]'::jsonb));
end $$;
revoke execute on function public.admin_integration_lists(int) from public, anon;
grant  execute on function public.admin_integration_lists(int) to authenticated;

-- Reenviar a mano un mensaje con error (botón del back-office)
create or replace function public.admin_integration_retry(p_id bigint)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores' using errcode = '42501'; end if;
  update public.integration_outbox set status = 'pendiente', attempts = 0, next_attempt_at = now()
   where id = p_id and status in ('error', 'pendiente', 'enviado');
  if not found then return 'no_reintentable'; end if;
  perform public.integration_dispatch(p_id);
  return 'reenviado';
end $$;
revoke execute on function public.admin_integration_retry(bigint) from public, anon;
grant  execute on function public.admin_integration_retry(bigint) to authenticated;

notify pgrst, 'reload schema';
