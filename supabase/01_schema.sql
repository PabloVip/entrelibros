-- =========================================================
-- Entrelibros · Prototipo académico (UCAM) · Esquema PostgreSQL (Supabase)
-- Ejecutar en: Supabase > SQL Editor (orden: 01 → 02 → 03 → 04)
-- =========================================================

drop view  if exists public.catalog_products;
drop table if exists public.events, public.support_requests, public.payments,
  public.order_status_history, public.order_items, public.orders,
  public.discount_codes, public.shipping_methods, public.admin_users, public.customers,
  public.product_compatibility, public.product_images, public.product_variants,
  public.products, public.themes cascade;

-- ---------- DATOS MAESTROS: CATÁLOGO ----------

create table public.themes (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  description text,
  sort_order  int  not null default 0
);

create table public.products (
  id                bigint generated always as identity primary key,
  slug              text not null unique,
  name              text not null,
  theme_id          bigint references public.themes(id) on delete set null, -- null = universal
  product_type      text not null check (product_type in ('kit','accesorio','recambio')),
  difficulty        text check (difficulty in ('principiante','intermedio','avanzado')),
  width_mm          smallint check (width_mm > 0),   -- ancho = hueco que ocupa en la estantería
  height_mm         smallint check (height_mm > 0),
  depth_mm          smallint check (depth_mm > 0),
  pieces_count      smallint check (pieces_count > 0),
  build_time_hours  numeric(4,1),
  short_description text not null,
  description       text not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  -- la dificultad de montaje solo tiene sentido en kits
  constraint chk_difficulty_only_kits check (product_type = 'kit' or difficulty is null)
);
create index idx_products_filters on public.products (product_type, theme_id, difficulty);

-- Lo que realmente se compra es la variante (con/sin luz, acabado...)
create table public.product_variants (
  id           bigint generated always as identity primary key,
  product_id   bigint not null references public.products(id) on delete cascade,
  sku          text not null unique,
  name         text not null,                         -- p. ej. "Con kit LED USB"
  has_lighting boolean not null default false,
  finish       text,                                  -- p. ej. "Madera natural", "Pintado"
  price        numeric(10,2) not null check (price >= 0), -- PVP con IVA incluido
  stock        int not null default 0 check (stock >= 0),
  weight_g     smallint,
  is_default   boolean not null default false,
  is_active    boolean not null default true
);
create index idx_variants_product on public.product_variants (product_id);

create table public.product_images (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  variant_id bigint references public.product_variants(id) on delete set null,
  url        text not null,
  alt_text   text not null,                           -- accesibilidad
  sort_order int  not null default 0
);

-- Accesorios y recambios compatibles con kits concretos
create table public.product_compatibility (
  product_id         bigint not null references public.products(id) on delete cascade, -- accesorio/recambio
  compatible_with_id bigint not null references public.products(id) on delete cascade, -- kit
  primary key (product_id, compatible_with_id),
  check (product_id <> compatible_with_id)
);

-- ---------- DATOS MAESTROS: CLIENTES Y CONDICIONES COMERCIALES ----------

create table public.customers (
  id         bigint generated always as identity primary key,
  email      text not null unique,
  full_name  text not null,
  phone      text,
  is_test    boolean not null default true,           -- todos son ficticios
  created_at timestamptz not null default now()
);

-- Administradores del back-office: usuarios de Supabase Auth con este rol
create table public.admin_users (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table public.shipping_methods (
  id           bigint generated always as identity primary key,
  code         text not null unique,
  name         text not null,
  price        numeric(10,2) not null check (price >= 0),
  free_from    numeric(10,2),                          -- envío gratis a partir de X €
  eta_days_min smallint not null,
  eta_days_max smallint not null,
  is_active    boolean not null default true
);

create table public.discount_codes (
  id            bigint generated always as identity primary key,
  code          text not null unique,
  description   text not null,
  discount_type text not null check (discount_type in ('porcentaje','importe_fijo')),
  value         numeric(10,2) not null check (value > 0),
  min_subtotal  numeric(10,2) not null default 0,
  valid_from    date,
  valid_until   date,
  is_active     boolean not null default true
);

-- ---------- DATOS TRANSACCIONALES ----------

create table public.orders (
  id                 bigint generated always as identity primary key,
  order_number       text not null unique,            -- p. ej. EL-20261018-7K3F
  customer_id        bigint not null references public.customers(id),
  status             text not null default 'creado' check (status in (
                       'creado','pago_simulado','pendiente_preparacion',
                       'enviado','entregado','cancelado','incidencia')),
  subtotal           numeric(10,2) not null,
  discount_code      text,
  discount_amount    numeric(10,2) not null default 0,
  shipping_method_id bigint not null references public.shipping_methods(id),
  shipping_cost      numeric(10,2) not null,
  tax_rate           numeric(5,2)  not null default 21.00,
  tax_amount         numeric(10,2) not null,          -- IVA desglosado (ya incluido en el total)
  total              numeric(10,2) not null,
  ship_name          text not null,
  ship_address       text not null,
  ship_city          text not null,
  ship_postcode      text not null,
  ship_province      text not null,
  ship_country       char(2) not null default 'ES',
  customer_notes     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_orders_status on public.orders (status, created_at desc);

-- Las líneas guardan una "foto" del producto en el momento de la compra
create table public.order_items (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references public.orders(id) on delete cascade,
  variant_id   bigint not null references public.product_variants(id),
  product_name text not null,
  variant_name text not null,
  sku          text not null,
  unit_price   numeric(10,2) not null,
  quantity     smallint not null check (quantity > 0),
  line_total   numeric(10,2) not null
);

create table public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references public.orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  text not null,                          -- 'sistema' o nombre del admin
  note        text,
  created_at  timestamptz not null default now()
);

create table public.payments (
  id              bigint generated always as identity primary key,
  order_id        bigint not null references public.orders(id) on delete cascade,
  method          text not null check (method in ('tarjeta_simulada','bizum_simulado')),
  amount          numeric(10,2) not null,
  status          text not null default 'pendiente' check (status in ('pendiente','aprobado','rechazado')),
  transaction_ref text not null unique,               -- referencia ficticia
  card_last4      char(4),                            -- solo tarjetas de prueba
  failure_reason  text,
  created_at      timestamptz not null default now()
);

create table public.support_requests (
  id             bigint generated always as identity primary key,
  ticket_number  text not null unique,
  order_id       bigint references public.orders(id) on delete set null,
  customer_email text not null,
  reason         text not null check (reason in ('pieza_faltante','pieza_danada','retraso_envio','duda_montaje','otro')),
  message        text not null,
  status         text not null default 'abierta' check (status in ('abierta','en_curso','resuelta')),
  created_at     timestamptz not null default now()
);

-- ---------- EVENTOS DE NEGOCIO (log append-only, sin FKs a propósito) ----------

create table public.events (
  id          bigint generated always as identity primary key,
  event_id    uuid not null unique default gen_random_uuid(), -- idempotencia para consumidores
  event_type  text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'), -- product.viewed...
  occurred_at timestamptz not null default now(),
  source      text not null default 'web' check (source in ('web','servidor','backoffice')),
  session_id  text,
  customer_id bigint,
  order_id    bigint,
  entity_type text,                                   -- product, cart, order, payment, support
  entity_id   text,
  payload     jsonb not null default '{}'::jsonb
);
create index idx_events_type_time on public.events (event_type, occurred_at desc);
create index idx_events_order     on public.events (order_id);
create index idx_events_session   on public.events (session_id);

-- ---------- updated_at automático en pedidos ----------
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_orders_updated_at before update on public.orders
  for each row execute function public.tg_set_updated_at();

-- ---------- VISTA DE CATÁLOGO (lo que consulta el escaparate para filtrar) ----------
create view public.catalog_products with (security_invoker = true) as
select
  p.id, p.slug, p.name, p.product_type, p.difficulty,
  p.width_mm, p.height_mm, p.depth_mm, p.pieces_count, p.build_time_hours,
  p.short_description, p.created_at,
  t.slug  as theme_slug,
  t.name  as theme_name,
  min(v.price)                     as min_price,
  max(v.price)                     as max_price,
  bool_or(v.has_lighting)          as has_lit_option,    -- existe variante con luz
  bool_or(not v.has_lighting)      as has_unlit_option,  -- existe variante sin luz
  count(v.id)                      as variant_count,
  coalesce(sum(v.stock), 0)        as total_stock,
  (select i.url from public.product_images i
    where i.product_id = p.id order by i.sort_order limit 1)      as image_url,
  (select i.alt_text from public.product_images i
    where i.product_id = p.id order by i.sort_order limit 1)      as image_alt
from public.products p
left join public.themes t on t.id = p.theme_id
join public.product_variants v on v.product_id = p.id and v.is_active
where p.is_active
group by p.id, t.slug, t.name;
