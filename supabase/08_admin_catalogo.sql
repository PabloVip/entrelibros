-- =========================================================
-- Entrelibros · Back-office: gestión del catálogo y de la tienda (Pablo)
-- Ejecutar DESPUÉS de todos los demás (01 → 07 y 04_seed). Se puede ejecutar
-- varias veces. Si se vuelve a cargar 04_seed.sql, ejecutar este otra vez
-- (rellena los textos en inglés de los productos de ejemplo).
--
-- Añade:
--   · Textos en inglés en productos, variantes y temáticas (opcionales).
--   · Vista admin_products para el listado del back-office.
--   · Funciones de administración (todas comprueban is_admin() y validan):
--       admin_save_product, admin_set_product_active, admin_delete_product,
--       admin_adjust_stock, admin_save_discount, admin_save_shipping_method,
--       admin_save_theme, admin_delete_theme
--   · Eventos de back-office: product.created, product.updated, product.published,
--     product.archived, product.deleted, stock.adjusted, discount.saved,
--     shipping_method.saved, theme.saved, theme.deleted
--   · Bucket de Supabase Storage "productos" para subir imágenes (solo admins).
-- =========================================================

-- ---------- 1. Columnas nuevas ----------
alter table public.products
  add column if not exists name_en              text,
  add column if not exists short_description_en text,
  add column if not exists description_en       text,
  add column if not exists updated_at           timestamptz not null default now();

alter table public.product_variants add column if not exists name_en text;

alter table public.themes
  add column if not exists name_en        text,
  add column if not exists description_en text;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products
  for each row execute function public.tg_set_updated_at();

-- ---------- 2. Vistas ----------
-- Escaparate: la misma vista de antes con los textos en inglés al final.
create or replace view public.catalog_products with (security_invoker = true) as
select
  p.id, p.slug, p.name, p.product_type, p.difficulty,
  p.width_mm, p.height_mm, p.depth_mm, p.pieces_count, p.build_time_hours,
  p.short_description, p.created_at,
  t.slug  as theme_slug,
  t.name  as theme_name,
  min(v.price)                     as min_price,
  max(v.price)                     as max_price,
  bool_or(v.has_lighting)          as has_lit_option,
  bool_or(not v.has_lighting)      as has_unlit_option,
  count(v.id)                      as variant_count,
  coalesce(sum(v.stock), 0)        as total_stock,
  (select i.url from public.product_images i
    where i.product_id = p.id order by i.sort_order limit 1)      as image_url,
  (select i.alt_text from public.product_images i
    where i.product_id = p.id order by i.sort_order limit 1)      as image_alt,
  p.name_en, p.short_description_en,
  t.name_en as theme_name_en
from public.products p
left join public.themes t on t.id = p.theme_id
join public.product_variants v on v.product_id = p.id and v.is_active
where p.is_active
group by p.id, t.slug, t.name, t.name_en;

-- Back-office: todos los productos (también archivados) con stock y ventas.
-- security_invoker: RLS decide; solo un admin ve archivados y pedidos.
create or replace view public.admin_products with (security_invoker = true) as
select
  p.id, p.slug, p.name, p.name_en, p.product_type, p.difficulty, p.is_active,
  p.created_at, p.updated_at,
  p.theme_id, t.name as theme_name,
  count(v.id) filter (where v.is_active)                         as variant_count,
  min(v.price) filter (where v.is_active)                        as min_price,
  max(v.price) filter (where v.is_active)                        as max_price,
  coalesce(sum(v.stock) filter (where v.is_active), 0)           as total_stock,
  count(v.id) filter (where v.is_active and v.stock = 0)         as variants_out,
  count(v.id) filter (where v.is_active and v.stock between 1 and 5) as variants_low,
  string_agg(v.sku, ' ' order by v.id)                           as skus,
  (select i.url from public.product_images i
    where i.product_id = p.id order by i.sort_order limit 1)      as image_url,
  coalesce((select sum(oi.quantity)
     from public.order_items oi
     join public.product_variants v2 on v2.id = oi.variant_id
     join public.orders o on o.id = oi.order_id
    where v2.product_id = p.id and o.status not in ('creado', 'cancelado')), 0) as units_sold,
  coalesce((select sum(oi.line_total)
     from public.order_items oi
     join public.product_variants v2 on v2.id = oi.variant_id
     join public.orders o on o.id = oi.order_id
    where v2.product_id = p.id and o.status not in ('creado', 'cancelado')), 0) as revenue,
  exists (select 1 from public.order_items oi
            join public.product_variants v3 on v3.id = oi.variant_id
           where v3.product_id = p.id)                           as has_orders
from public.products p
left join public.themes t on t.id = p.theme_id
left join public.product_variants v on v.product_id = p.id
group by p.id, t.id;

revoke all on public.admin_products from anon;
grant select on public.admin_products to authenticated;

-- ---------- 3. Utilidades internas ----------
create or replace function public._admin_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.admin_users where user_id = auth.uid()), 'admin');
$$;
revoke execute on function public._admin_name() from public, anon, authenticated;

create or replace function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Solo administradores' using errcode = '42501';
  end if;
end $$;
revoke execute on function public._require_admin() from public, anon, authenticated;

-- texto opcional: recorta y convierte '' en null
create or replace function public._opt_text(p text, p_max int) returns text
language sql immutable as $$
  select nullif(left(btrim(coalesce(p, '')), p_max), '');
$$;

-- ---------- 4. Productos ----------
create or replace function public.admin_save_product(p_product jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id       bigint  := nullif(p_product->>'id', '')::bigint;
  v_is_new   boolean := v_id is null;
  v_type     text    := p_product->>'product_type';
  v_name     text    := btrim(coalesce(p_product->>'name', ''));
  v_slug     text    := lower(btrim(coalesce(p_product->>'slug', '')));
  v_theme    bigint  := nullif(p_product->>'theme_id', '')::bigint;
  v_diff     text    := nullif(p_product->>'difficulty', '');
  v_width    int     := nullif(p_product->>'width_mm', '')::numeric::int;
  v_height   int     := nullif(p_product->>'height_mm', '')::numeric::int;
  v_depth    int     := nullif(p_product->>'depth_mm', '')::numeric::int;
  v_pieces   int     := nullif(p_product->>'pieces_count', '')::numeric::int;
  v_hours    numeric := nullif(p_product->>'build_time_hours', '')::numeric;
  v_short    text    := btrim(coalesce(p_product->>'short_description', ''));
  v_desc     text    := btrim(coalesce(p_product->>'description', ''));
  v_active   boolean := coalesce((p_product->>'is_active')::boolean, true);
  v_variants jsonb   := coalesce(p_product->'variants', '[]'::jsonb);
  v_images   jsonb   := coalesce(p_product->'images', '[]'::jsonb);
  v_compat   jsonb   := coalesce(p_product->'compatible_with', '[]'::jsonb);
  v_v        jsonb;
  v_img      jsonb;
  v_n        int := 0;
  v_vid      bigint;
  v_keep     bigint[] := '{}';
  v_sku      text;
  v_vname    text;
  v_price    numeric;
  v_stock    int;
  v_old      record;
  v_default  bigint;
  v_admin    text;
  v_warnings text[] := '{}';
  v_url      text;
  v_alt      text;
  v_cid      bigint;
begin
  perform public._require_admin();
  v_admin := public._admin_name();

  -- datos generales
  if length(v_name) not between 2 and 120 then
    raise exception 'El nombre debe tener entre 2 y 120 caracteres' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 3 and 80 then
    raise exception 'El slug solo admite minúsculas, números y guiones (3-80 caracteres)' using errcode = '22023';
  end if;
  if exists (select 1 from public.products where slug = v_slug and id is distinct from v_id) then
    raise exception 'Ya existe otro producto con ese slug' using errcode = '23505';
  end if;
  if v_type is null or v_type not in ('kit', 'accesorio', 'recambio') then
    raise exception 'Tipo de producto no válido' using errcode = '22023';
  end if;
  if v_theme is not null and not exists (select 1 from public.themes where id = v_theme) then
    raise exception 'La temática no existe' using errcode = '22023';
  end if;
  if v_type = 'kit' then
    if v_diff is null or v_diff not in ('principiante', 'intermedio', 'avanzado') then
      raise exception 'Indica la dificultad de montaje del kit' using errcode = '22023';
    end if;
  else
    v_diff := null; -- la dificultad solo tiene sentido en kits
  end if;
  if (v_width  is not null and v_width  not between 1 and 1000)
  or (v_height is not null and v_height not between 1 and 1000)
  or (v_depth  is not null and v_depth  not between 1 and 1000) then
    raise exception 'Las medidas deben estar entre 1 y 1000 mm' using errcode = '22023';
  end if;
  if v_pieces is not null and v_pieces not between 1 and 5000 then
    raise exception 'El número de piezas debe estar entre 1 y 5000' using errcode = '22023';
  end if;
  if v_hours is not null and v_hours not between 0.5 and 200 then
    raise exception 'Las horas de montaje deben estar entre 0,5 y 200' using errcode = '22023';
  end if;
  if length(v_short) not between 10 and 200 then
    raise exception 'La descripción corta debe tener entre 10 y 200 caracteres' using errcode = '22023';
  end if;
  if length(v_desc) not between 20 and 4000 then
    raise exception 'La descripción debe tener entre 20 y 4000 caracteres' using errcode = '22023';
  end if;

  -- variantes: validación previa (antes de tocar nada)
  if jsonb_typeof(v_variants) <> 'array' or jsonb_array_length(v_variants) not between 1 and 20 then
    raise exception 'El producto necesita entre 1 y 20 variantes' using errcode = '22023';
  end if;
  for v_v in select * from jsonb_array_elements(v_variants) loop
    v_n := v_n + 1;
    v_vname := btrim(coalesce(v_v->>'name', ''));
    v_sku   := upper(btrim(coalesce(v_v->>'sku', '')));
    if length(v_vname) not between 2 and 80 then
      raise exception 'Variante %: el nombre debe tener entre 2 y 80 caracteres', v_n using errcode = '22023';
    end if;
    if v_sku !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' or length(v_sku) not between 3 and 40 then
      raise exception 'Variante %: SKU no válido (mayúsculas, números y guiones, 3-40)', v_n using errcode = '22023';
    end if;
    if (select count(*) from jsonb_array_elements(v_variants) x where upper(btrim(x->>'sku')) = v_sku) > 1 then
      raise exception 'El SKU % está repetido', v_sku using errcode = '22023';
    end if;
    if exists (select 1 from public.product_variants
                where sku = v_sku and product_id is distinct from v_id) then
      raise exception 'El SKU % ya lo usa otro producto', v_sku using errcode = '23505';
    end if;
    begin
      v_price := (v_v->>'price')::numeric;
      v_stock := (v_v->>'stock')::numeric::int;
    exception when others then
      raise exception 'Variante %: precio o stock no válido', v_n using errcode = '22023';
    end;
    if v_price is null or v_price not between 0 and 9999 then
      raise exception 'Variante %: el precio debe estar entre 0 y 9999 €', v_n using errcode = '22023';
    end if;
    if v_stock is null or v_stock not between 0 and 100000 then
      raise exception 'Variante %: el stock debe estar entre 0 y 100000', v_n using errcode = '22023';
    end if;
    if nullif(v_v->>'id', '') is not null and (v_is_new or not exists (
         select 1 from public.product_variants
          where id = (v_v->>'id')::bigint and product_id = v_id)) then
      raise exception 'Variante %: no pertenece a este producto', v_n using errcode = '22023';
    end if;
  end loop;
  if v_active and not exists (select 1 from jsonb_array_elements(v_variants) x
                               where coalesce((x->>'is_active')::boolean, true)) then
    raise exception 'Un producto visible en la tienda necesita al menos una variante activa' using errcode = '22023';
  end if;

  -- imágenes: validación previa
  if jsonb_typeof(v_images) <> 'array' or jsonb_array_length(v_images) > 10 then
    raise exception 'Como máximo 10 imágenes por producto' using errcode = '22023';
  end if;
  v_n := 0;
  for v_img in select * from jsonb_array_elements(v_images) loop
    v_n := v_n + 1;
    v_url := btrim(coalesce(v_img->>'url', ''));
    v_alt := btrim(coalesce(v_img->>'alt_text', ''));
    if length(v_url) > 500 or not (v_url ~ '^img/[A-Za-z0-9._/-]+$' or v_url ~ '^https://[^\s"<>]+$') then
      raise exception 'Imagen %: la dirección debe empezar por img/ o https://', v_n using errcode = '22023';
    end if;
    if length(v_alt) not between 3 and 200 then
      raise exception 'Imagen %: el texto alternativo debe tener entre 3 y 200 caracteres', v_n using errcode = '22023';
    end if;
  end loop;

  -- guardar el producto
  if v_is_new then
    insert into public.products (slug, name, theme_id, product_type, difficulty, width_mm, height_mm,
        depth_mm, pieces_count, build_time_hours, short_description, description, is_active,
        name_en, short_description_en, description_en)
    values (v_slug, v_name, v_theme, v_type, v_diff, v_width, v_height, v_depth, v_pieces, v_hours,
        v_short, v_desc, v_active,
        public._opt_text(p_product->>'name_en', 120),
        public._opt_text(p_product->>'short_description_en', 200),
        public._opt_text(p_product->>'description_en', 4000))
    returning id into v_id;
  else
    update public.products set
      slug = v_slug, name = v_name, theme_id = v_theme, product_type = v_type, difficulty = v_diff,
      width_mm = v_width, height_mm = v_height, depth_mm = v_depth, pieces_count = v_pieces,
      build_time_hours = v_hours, short_description = v_short, description = v_desc,
      is_active = v_active,
      name_en = public._opt_text(p_product->>'name_en', 120),
      short_description_en = public._opt_text(p_product->>'short_description_en', 200),
      description_en = public._opt_text(p_product->>'description_en', 4000)
    where id = v_id;
    if not found then
      raise exception 'Producto % no encontrado', v_id using errcode = 'P0002';
    end if;
  end if;

  -- variantes: quitar SKU de las que cambian para poder intercambiarlos sin chocar con el UNIQUE
  update public.product_variants pv set sku = 'TMP-' || pv.id
   where pv.product_id = v_id
     and exists (select 1 from jsonb_array_elements(v_variants) x
                  where nullif(x->>'id', '')::bigint = pv.id and upper(btrim(x->>'sku')) <> pv.sku);

  for v_v in select * from jsonb_array_elements(v_variants) loop
    v_vid   := nullif(v_v->>'id', '')::bigint;
    v_sku   := upper(btrim(v_v->>'sku'));
    v_stock := (v_v->>'stock')::numeric::int;
    if v_vid is null then
      insert into public.product_variants (product_id, sku, name, name_en, has_lighting, price, stock,
                                           is_default, is_active)
      values (v_id, v_sku, btrim(v_v->>'name'), public._opt_text(v_v->>'name_en', 80),
              coalesce((v_v->>'has_lighting')::boolean, false), (v_v->>'price')::numeric, v_stock,
              false, coalesce((v_v->>'is_active')::boolean, true))
      returning id into v_vid;
    else
      select stock, sku into v_old from public.product_variants where id = v_vid;
      update public.product_variants set
        sku = v_sku, name = btrim(v_v->>'name'), name_en = public._opt_text(v_v->>'name_en', 80),
        has_lighting = coalesce((v_v->>'has_lighting')::boolean, false),
        price = (v_v->>'price')::numeric, stock = v_stock,
        is_active = coalesce((v_v->>'is_active')::boolean, true)
      where id = v_vid;
      if v_old.stock <> v_stock then
        perform public._emit_event('stock.adjusted', 'backoffice', null, 'variant', v_vid::text,
          jsonb_build_object('sku', v_sku, 'from', v_old.stock, 'to', v_stock, 'by', v_admin));
      end if;
    end if;
    v_keep := v_keep || v_vid;
    if coalesce((v_v->>'is_default')::boolean, false) and coalesce((v_v->>'is_active')::boolean, true)
       and v_default is null then
      v_default := v_vid;
    end if;
  end loop;

  -- variantes que ya no están en el formulario: se borran, o se desactivan si tienen pedidos
  for v_old in select pv.id, pv.sku, pv.name from public.product_variants pv
                where pv.product_id = v_id and not (pv.id = any (v_keep)) loop
    if exists (select 1 from public.order_items where variant_id = v_old.id) then
      update public.product_variants set is_active = false, is_default = false where id = v_old.id;
      v_warnings := v_warnings || format('La variante %s tiene pedidos: se ha desactivado en lugar de borrarse', v_old.sku);
    else
      delete from public.product_variants where id = v_old.id;
    end if;
  end loop;

  -- una sola variante por defecto (la marcada o la primera activa)
  if v_default is null then
    select id into v_default from public.product_variants
     where product_id = v_id and is_active order by array_position(v_keep, id) nulls last, id limit 1;
  end if;
  update public.product_variants set is_default = (id = v_default) where product_id = v_id;

  -- imágenes: se guardan en el orden recibido
  delete from public.product_images where product_id = v_id;
  v_n := 0;
  for v_img in select * from jsonb_array_elements(v_images) loop
    insert into public.product_images (product_id, url, alt_text, sort_order)
    values (v_id, btrim(v_img->>'url'), btrim(v_img->>'alt_text'), v_n);
    v_n := v_n + 1;
  end loop;

  -- compatibilidades: solo accesorios y recambios, y solo con kits
  delete from public.product_compatibility where product_id = v_id;
  if v_type <> 'kit' and jsonb_typeof(v_compat) = 'array' then
    for v_cid in select distinct (x #>> '{}')::bigint from jsonb_array_elements(v_compat) x loop
      if not exists (select 1 from public.products where id = v_cid and product_type = 'kit') or v_cid = v_id then
        raise exception 'Compatibilidad no válida: solo se puede asociar a kits' using errcode = '22023';
      end if;
      insert into public.product_compatibility (product_id, compatible_with_id) values (v_id, v_cid);
    end loop;
  end if;

  perform public._emit_event(case when v_is_new then 'product.created' else 'product.updated' end,
    'backoffice', null, 'product', v_id::text,
    jsonb_build_object('slug', v_slug, 'name', v_name, 'active', v_active,
                       'variants', jsonb_array_length(v_variants), 'by', v_admin));

  return jsonb_build_object('id', v_id, 'slug', v_slug, 'created', v_is_new, 'warnings', to_jsonb(v_warnings));
end $$;

create or replace function public.admin_set_product_active(p_id bigint, p_active boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
begin
  perform public._require_admin();
  if p_active and not exists (select 1 from public.product_variants where product_id = p_id and is_active) then
    raise exception 'Un producto visible en la tienda necesita al menos una variante activa' using errcode = '22023';
  end if;
  update public.products set is_active = p_active where id = p_id returning slug into v_slug;
  if not found then
    raise exception 'Producto % no encontrado', p_id using errcode = 'P0002';
  end if;
  perform public._emit_event(case when p_active then 'product.published' else 'product.archived' end,
    'backoffice', null, 'product', p_id::text,
    jsonb_build_object('slug', v_slug, 'by', public._admin_name()));
  return p_active;
end $$;

create or replace function public.admin_delete_product(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
begin
  perform public._require_admin();
  select id, slug, name into v_p from public.products where id = p_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_id using errcode = 'P0002';
  end if;
  if exists (select 1 from public.order_items oi
               join public.product_variants v on v.id = oi.variant_id
              where v.product_id = p_id) then
    raise exception 'Este producto tiene pedidos: archívalo en lugar de eliminarlo' using errcode = '23503';
  end if;
  delete from public.products where id = p_id; -- variantes, imágenes y compatibilidades en cascada
  perform public._emit_event('product.deleted', 'backoffice', null, 'product', p_id::text,
    jsonb_build_object('slug', v_p.slug, 'name', v_p.name, 'by', public._admin_name()));
  return true;
end $$;

-- Ajuste rápido de stock desde el listado (entrada de mercancía, recuento...)
create or replace function public.admin_adjust_stock(p_variant_id bigint, p_stock int, p_note text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_old int;
  v_sku text;
begin
  perform public._require_admin();
  if p_stock is null or p_stock not between 0 and 100000 then
    raise exception 'El stock debe estar entre 0 y 100000' using errcode = '22023';
  end if;
  select stock, sku into v_old, v_sku from public.product_variants where id = p_variant_id for update;
  if not found then
    raise exception 'Variante % no encontrada', p_variant_id using errcode = 'P0002';
  end if;
  if v_old = p_stock then
    return p_stock;
  end if;
  update public.product_variants set stock = p_stock where id = p_variant_id;
  perform public._emit_event('stock.adjusted', 'backoffice', null, 'variant', p_variant_id::text,
    jsonb_build_object('sku', v_sku, 'from', v_old, 'to', p_stock, 'by', public._admin_name(),
                       'note', public._opt_text(p_note, 200)));
  return p_stock;
end $$;

-- ---------- 5. Códigos de descuento ----------
create or replace function public.admin_save_discount(p_discount jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id    bigint  := nullif(p_discount->>'id', '')::bigint;
  v_code  text    := upper(btrim(coalesce(p_discount->>'code', '')));
  v_desc  text    := btrim(coalesce(p_discount->>'description', ''));
  v_type  text    := p_discount->>'discount_type';
  v_value numeric;
  v_min   numeric;
  v_from  date;
  v_until date;
  v_active boolean := coalesce((p_discount->>'is_active')::boolean, true);
begin
  perform public._require_admin();
  begin
    v_value := (p_discount->>'value')::numeric;
    v_min   := coalesce(nullif(p_discount->>'min_subtotal', '')::numeric, 0);
    v_from  := nullif(p_discount->>'valid_from', '')::date;
    v_until := nullif(p_discount->>'valid_until', '')::date;
  exception when others then
    raise exception 'Revisa el valor, el pedido mínimo y las fechas' using errcode = '22023';
  end;
  if v_code !~ '^[A-Z0-9]{3,20}$' then
    raise exception 'El código solo admite mayúsculas y números (3-20)' using errcode = '22023';
  end if;
  if exists (select 1 from public.discount_codes where code = v_code and id is distinct from v_id) then
    raise exception 'Ya existe un código %', v_code using errcode = '23505';
  end if;
  if length(v_desc) not between 3 and 120 then
    raise exception 'La descripción debe tener entre 3 y 120 caracteres' using errcode = '22023';
  end if;
  if v_type is null or v_type not in ('porcentaje', 'importe_fijo') then
    raise exception 'Tipo de descuento no válido' using errcode = '22023';
  end if;
  if v_value is null or (v_type = 'porcentaje' and v_value not between 1 and 90)
     or (v_type = 'importe_fijo' and v_value not between 0.01 and 500) then
    raise exception 'Valor no válido: porcentaje entre 1 y 90, importe entre 0,01 y 500 €' using errcode = '22023';
  end if;
  if v_min not between 0 and 10000 then
    raise exception 'El pedido mínimo debe estar entre 0 y 10000 €' using errcode = '22023';
  end if;
  if v_from is not null and v_until is not null and v_until < v_from then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.discount_codes (code, description, discount_type, value, min_subtotal,
                                       valid_from, valid_until, is_active)
    values (v_code, v_desc, v_type, v_value, v_min, v_from, v_until, v_active)
    returning id into v_id;
  else
    update public.discount_codes set code = v_code, description = v_desc, discount_type = v_type,
      value = v_value, min_subtotal = v_min, valid_from = v_from, valid_until = v_until, is_active = v_active
    where id = v_id;
    if not found then
      raise exception 'Código % no encontrado', v_id using errcode = 'P0002';
    end if;
  end if;
  perform public._emit_event('discount.saved', 'backoffice', null, 'discount', v_code,
    jsonb_build_object('code', v_code, 'type', v_type, 'value', v_value, 'active', v_active,
                       'by', public._admin_name()));
  return v_id;
end $$;

-- ---------- 6. Métodos de envío ----------
create or replace function public.admin_save_shipping_method(p_method jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id    bigint := nullif(p_method->>'id', '')::bigint;
  v_code  text   := lower(btrim(coalesce(p_method->>'code', '')));
  v_name  text   := btrim(coalesce(p_method->>'name', ''));
  v_price numeric;
  v_free  numeric;
  v_min   int;
  v_max   int;
  v_active boolean := coalesce((p_method->>'is_active')::boolean, true);
begin
  perform public._require_admin();
  begin
    v_price := (p_method->>'price')::numeric;
    v_free  := nullif(p_method->>'free_from', '')::numeric;
    v_min   := (p_method->>'eta_days_min')::int;
    v_max   := (p_method->>'eta_days_max')::int;
  exception when others then
    raise exception 'Revisa el precio y los plazos' using errcode = '22023';
  end;
  if v_code !~ '^[a-z_]{3,20}$' then
    raise exception 'El código interno solo admite minúsculas y guiones bajos (3-20)' using errcode = '22023';
  end if;
  if exists (select 1 from public.shipping_methods where code = v_code and id is distinct from v_id) then
    raise exception 'Ya existe un método de envío con ese código' using errcode = '23505';
  end if;
  if length(v_name) not between 3 and 80 then
    raise exception 'El nombre debe tener entre 3 y 80 caracteres' using errcode = '22023';
  end if;
  if v_price is null or v_price not between 0 and 100 then
    raise exception 'El precio del envío debe estar entre 0 y 100 €' using errcode = '22023';
  end if;
  if v_free is not null and v_free not between 1 and 10000 then
    raise exception 'El envío gratis debe empezar entre 1 y 10000 €' using errcode = '22023';
  end if;
  if v_min is null or v_max is null or v_min not between 1 and 30 or v_max not between v_min and 60 then
    raise exception 'Plazo no válido: mínimo entre 1 y 30 días y máximo mayor o igual que el mínimo' using errcode = '22023';
  end if;
  if not v_active and not exists (select 1 from public.shipping_methods
                                   where is_active and id is distinct from v_id) then
    raise exception 'Tiene que quedar al menos un método de envío activo' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.shipping_methods (code, name, price, free_from, eta_days_min, eta_days_max, is_active)
    values (v_code, v_name, v_price, v_free, v_min, v_max, v_active)
    returning id into v_id;
  else
    update public.shipping_methods set code = v_code, name = v_name, price = v_price, free_from = v_free,
      eta_days_min = v_min, eta_days_max = v_max, is_active = v_active
    where id = v_id;
    if not found then
      raise exception 'Método de envío % no encontrado', v_id using errcode = 'P0002';
    end if;
  end if;
  perform public._emit_event('shipping_method.saved', 'backoffice', null, 'shipping', v_code,
    jsonb_build_object('code', v_code, 'price', v_price, 'free_from', v_free, 'active', v_active,
                       'by', public._admin_name()));
  return v_id;
end $$;

-- ---------- 7. Temáticas ----------
create or replace function public.admin_save_theme(p_theme jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id    bigint := nullif(p_theme->>'id', '')::bigint;
  v_slug  text   := lower(btrim(coalesce(p_theme->>'slug', '')));
  v_name  text   := btrim(coalesce(p_theme->>'name', ''));
  v_order int;
begin
  perform public._require_admin();
  begin
    v_order := coalesce(nullif(p_theme->>'sort_order', '')::int, 0);
  exception when others then
    raise exception 'Orden no válido' using errcode = '22023';
  end;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 3 and 40 then
    raise exception 'El slug solo admite minúsculas, números y guiones (3-40 caracteres)' using errcode = '22023';
  end if;
  if exists (select 1 from public.themes where slug = v_slug and id is distinct from v_id) then
    raise exception 'Ya existe otra temática con ese slug' using errcode = '23505';
  end if;
  if length(v_name) not between 2 and 60 then
    raise exception 'El nombre debe tener entre 2 y 60 caracteres' using errcode = '22023';
  end if;
  if v_order not between 0 and 999 then
    raise exception 'El orden debe estar entre 0 y 999' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.themes (slug, name, description, sort_order, name_en, description_en)
    values (v_slug, v_name, public._opt_text(p_theme->>'description', 200), v_order,
            public._opt_text(p_theme->>'name_en', 60), public._opt_text(p_theme->>'description_en', 200))
    returning id into v_id;
  else
    update public.themes set slug = v_slug, name = v_name,
      description = public._opt_text(p_theme->>'description', 200), sort_order = v_order,
      name_en = public._opt_text(p_theme->>'name_en', 60),
      description_en = public._opt_text(p_theme->>'description_en', 200)
    where id = v_id;
    if not found then
      raise exception 'Temática % no encontrada', v_id using errcode = 'P0002';
    end if;
  end if;
  perform public._emit_event('theme.saved', 'backoffice', null, 'theme', v_slug,
    jsonb_build_object('slug', v_slug, 'name', v_name, 'by', public._admin_name()));
  return v_id;
end $$;

create or replace function public.admin_delete_theme(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
begin
  perform public._require_admin();
  if exists (select 1 from public.products where theme_id = p_id) then
    raise exception 'Hay productos con esta temática: cámbialos de temática antes de borrarla' using errcode = '23503';
  end if;
  delete from public.themes where id = p_id returning slug into v_slug;
  if not found then
    raise exception 'Temática % no encontrada', p_id using errcode = 'P0002';
  end if;
  perform public._emit_event('theme.deleted', 'backoffice', null, 'theme', v_slug,
    jsonb_build_object('slug', v_slug, 'by', public._admin_name()));
  return true;
end $$;

-- ---------- 8. Permisos de las funciones ----------
revoke execute on function public.admin_save_product(jsonb)                 from public, anon;
revoke execute on function public.admin_set_product_active(bigint, boolean) from public, anon;
revoke execute on function public.admin_delete_product(bigint)              from public, anon;
revoke execute on function public.admin_adjust_stock(bigint, int, text)     from public, anon;
revoke execute on function public.admin_save_discount(jsonb)                from public, anon;
revoke execute on function public.admin_save_shipping_method(jsonb)         from public, anon;
revoke execute on function public.admin_save_theme(jsonb)                   from public, anon;
revoke execute on function public.admin_delete_theme(bigint)                from public, anon;
grant execute on function public.admin_save_product(jsonb)                 to authenticated;
grant execute on function public.admin_set_product_active(bigint, boolean) to authenticated;
grant execute on function public.admin_delete_product(bigint)              to authenticated;
grant execute on function public.admin_adjust_stock(bigint, int, text)     to authenticated;
grant execute on function public.admin_save_discount(jsonb)                to authenticated;
grant execute on function public.admin_save_shipping_method(jsonb)         to authenticated;
grant execute on function public.admin_save_theme(jsonb)                   to authenticated;
grant execute on function public.admin_delete_theme(bigint)                to authenticated;

-- ---------- 9. Imágenes: Supabase Storage ----------
-- Bucket público "productos" (lectura libre); solo los administradores suben, cambian o borran.
-- Fuera de Supabase (sin el esquema storage) este bloque no hace nada.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('productos', 'productos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists "admin sube imagenes" on storage.objects';
    execute 'drop policy if exists "admin cambia imagenes" on storage.objects';
    execute 'drop policy if exists "admin borra imagenes" on storage.objects';
    execute $p$create policy "admin sube imagenes" on storage.objects for insert to authenticated
             with check (bucket_id = 'productos' and public.is_admin())$p$;
    execute $p$create policy "admin cambia imagenes" on storage.objects for update to authenticated
             using (bucket_id = 'productos' and public.is_admin())$p$;
    execute $p$create policy "admin borra imagenes" on storage.objects for delete to authenticated
             using (bucket_id = 'productos' and public.is_admin())$p$;
  end if;
end $$;

-- ---------- 10. Textos en inglés de los datos de ejemplo (04_seed.sql) ----------
-- Solo rellena lo que esté vacío: no pisa lo que se haya editado desde el back-office.
update public.products set name_en = coalesce(name_en, 'Spare part: paper lanterns'), short_description_en = coalesce(short_description_en, 'Pack of 6 framed paper lanterns for the Japanese scenes.'),
  description_en = coalesce(description_en, 'Six rice-paper lanterns with wooden frames, identical to those included in the Japanese street kits.') where slug = 'recambio-farolillos-papel';
update public.products set name_en = coalesce(name_en, 'Late-Night Ramen Shop'), short_description_en = coalesce(short_description_en, 'A small-hours ramen stall with glowing signs and kitchen steam.'),
  description_en = coalesce(description_en, 'A Tokyo street in the small hours: the ramen stall with its noren curtain, neon signs, vending machines and cables crossing the sky. Designed to glow: every version includes LEDs.') where slug = 'tienda-ramen-nocturna';
update public.products set name_en = coalesce(name_en, 'Kyoto Alley in Bloom'), short_description_en = coalesce(short_description_en, 'A narrow Kyoto alley with cherry trees, paper lanterns and a tea house.'),
  description_en = coalesce(description_en, 'Recreate an alley of the Gion district between your books: wooden façades, cherry blossoms, paper lanterns and a little tea house with its door ajar. Laser-cut plywood pieces that fit together without glue, plus paper and resin details.') where slug = 'callejon-kioto-sakura';
update public.products set name_en = coalesce(name_en, 'The Alchemist''s Archive'), short_description_en = coalesce(short_description_en, 'An alchemist''s study with scrolls, flasks and a celestial globe.'),
  description_en = coalesce(description_en, 'Shelves packed with flasks, scrolls and grimoires around a workbench with a celestial globe. A warm, detailed scene for beginners with some experience.') where slug = 'archivo-del-alquimista';
update public.products set name_en = coalesce(name_en, 'Endless Library'), short_description_en = coalesce(short_description_en, 'An aisle of shelves that seems endless thanks to a mirror effect.'),
  description_en = coalesce(description_en, 'A double-height aisle of shelves with ladders, reading lamps and a mirror at the back that multiplies the scene to infinity. Includes more than 200 printed miniature books.') where slug = 'biblioteca-infinita';
update public.products set name_en = coalesce(name_en, 'Corner Bookshop in the Rain'), short_description_en = coalesce(short_description_en, 'A bookshop window with puddles, umbrellas and warm light in the windows.'),
  description_en = coalesce(description_en, 'A neighbourhood bookshop on a rainy afternoon: a window full of books, a cat on the sill and resin puddles on the pavement. Made to glow: every version has LEDs.') where slug = 'libreria-esquina-lluvia';
update public.products set name_en = coalesce(name_en, '1920s Parisian Café'), short_description_en = coalesce(short_description_en, 'A Paris café terrace with a striped awning and marble tables.'),
  description_en = coalesce(description_en, 'An ideal first kit: the front of a 1920s Parisian café with its striped awning, small marble tables and menu chalkboards. Simple assembly with illustrated step-by-step instructions.') where slug = 'cafeteria-paris-1920';
update public.products set name_en = coalesce(name_en, 'Dragon''s Tower'), short_description_en = coalesce(short_description_en, 'A spiral staircase climbing to a sleeping dragon''s lair.'),
  description_en = coalesce(description_en, 'Our most ambitious kit: a stone spiral staircase climbing between torches to the lair of a dragon asleep on its treasure. For experienced builders.') where slug = 'torre-del-dragon';
update public.products set name_en = coalesce(name_en, 'Fairy Forest'), short_description_en = coalesce(short_description_en, 'A path between twisted trees, mushrooms and little fairy houses.'),
  description_en = coalesce(description_en, 'A path between twisted trees with little houses in the trunks, giant mushrooms and fireflies. The narrowest kit in the catalogue: it fits even on very full shelves.') where slug = 'bosque-de-las-hadas';
update public.products set name_en = coalesce(name_en, 'Spare part: Prague Alley small pieces'), short_description_en = coalesce(short_description_en, 'A sheet with street lamps, balconies and small pieces of the Prague Alley.'),
  description_en = coalesce(description_en, 'A plywood sheet with the smallest and most fragile pieces of the Prague Alley kit: street lamps, balcony railings and clock hands.') where slug = 'recambio-piezas-praga';
update public.products set name_en = coalesce(name_en, 'Prague Alley'), short_description_en = coalesce(short_description_en, 'A cobbled street with colourful façades, iron street lamps and an astronomical clock.'),
  description_en = coalesce(description_en, 'Colourful baroque façades, cobblestones, wrought-iron street lamps and, at the end, an astronomical clock. Inspired by Prague''s Old Town.') where slug = 'callejon-praga';
update public.products set name_en = coalesce(name_en, 'Victorian Detective''s Study'), short_description_en = coalesce(short_description_en, 'A London study with a fireplace, a violin and clues on the desk.'),
  description_en = coalesce(description_en, 'A study in Victorian London with a fireplace, leather armchairs, a violin and a desk full of clues. Cotton fog and a gas lamp at the window.') where slug = 'despacho-detective-victoriano';
update public.products set name_en = coalesce(name_en, 'Spare part: acetate windows'), short_description_en = coalesce(short_description_en, 'Pre-cut acetate sheet for windows and shop fronts.'),
  description_en = coalesce(description_en, 'A pre-cut sheet with all the windows and display cases of the library and café kits. Handy if one gets scratched during assembly.') where slug = 'recambio-ventanas-acetato';
update public.products set name_en = coalesce(name_en, 'Spare part: 30 cm LED strip'), short_description_en = coalesce(short_description_en, 'Replacement LED strip for the lit kits.'),
  description_en = coalesce(description_en, 'A 30 cm LED strip with JST connector, identical to the one fitted in the lit kits. To replace a damaged strip.') where slug = 'recambio-tira-led-30';
update public.products set name_en = coalesce(name_en, 'Paint and finishing set'), short_description_en = coalesce(short_description_en, 'Acrylics, fine brushes and varnish to customise your kits.'),
  description_en = coalesce(description_en, 'Twelve acrylics in wood, stone and foliage tones, three detail brushes and matt varnish. Everything you need to give your scene an aged finish.') where slug = 'set-pintura-acabados';
update public.products set name_en = coalesce(name_en, 'Acrylic dust cover'), short_description_en = coalesce(short_description_en, 'A clear front that protects the scene from dust without hiding it.'),
  description_en = coalesce(description_en, 'A 2 mm clear acrylic front with magnets so it is easy to fit and remove. Choose the width to suit your kit.') where slug = 'cupula-antipolvo';
update public.products set name_en = coalesce(name_en, 'Miniature book set'), short_description_en = coalesce(short_description_en, 'Printed 1:24 scale books to fill shelves.'),
  description_en = coalesce(description_en, 'Printed 1:24 scale book spines in different colours and sizes, ready to cut out and glue onto any shelf in your scenes.') where slug = 'set-libros-miniatura';
update public.products set name_en = coalesce(name_en, 'Universal USB LED kit'), short_description_en = coalesce(short_description_en, 'Lights up any scene: adhesive LED strip with switch and USB cable.'),
  description_en = coalesce(description_en, 'A 1 m flexible LED strip with inline switch and USB power. Compatible with any unlit kit: it hides in the ceiling of the scene.') where slug = 'kit-led-usb-universal';
update public.product_variants set name_en = coalesce(name_en, 'Narrow (up to 130 mm)') where name = 'Estrecha (hasta 130 mm)';
update public.product_variants set name_en = coalesce(name_en, 'Full set') where name = 'Set completo';
update public.product_variants set name_en = coalesce(name_en, 'With LED + touch sensor') where name = 'Con LED + sensor táctil';
update public.product_variants set name_en = coalesce(name_en, 'With LED fireflies') where name = 'Con luciérnagas LED';
update public.product_variants set name_en = coalesce(name_en, 'Full sheet') where name = 'Lámina completa';
update public.product_variants set name_en = coalesce(name_en, 'Multicolour with remote') where name = 'Multicolor con mando';
update public.product_variants set name_en = coalesce(name_en, 'With LED · autumn edition') where name = 'Con LED · edición otoño';
update public.product_variants set name_en = coalesce(name_en, 'Small-parts sheet') where name = 'Plancha de piezas pequeñas';
update public.product_variants set name_en = coalesce(name_en, '30 cm strip · JST connector') where name = 'Tira 30 cm · conector JST';
update public.product_variants set name_en = coalesce(name_en, 'Pack of 60 books') where name = 'Pack 60 libros';
update public.product_variants set name_en = coalesce(name_en, 'Pack of 6 lanterns') where name = 'Pack 6 farolillos';
update public.product_variants set name_en = coalesce(name_en, 'No lights') where name = 'Sin iluminación';
update public.product_variants set name_en = coalesce(name_en, 'With USB LED kit') where name = 'Con kit LED USB';
update public.product_variants set name_en = coalesce(name_en, 'With LED · natural wood') where name = 'Con LED · madera natural';
update public.product_variants set name_en = coalesce(name_en, 'With LED + premium paint') where name = 'Con LED + pintado premium';
update public.product_variants set name_en = coalesce(name_en, 'Pack of 24 books') where name = 'Pack 24 libros';
update public.product_variants set name_en = coalesce(name_en, 'Wide (up to 170 mm)') where name = 'Ancha (hasta 170 mm)';
update public.product_variants set name_en = coalesce(name_en, 'Warm white') where name = 'Blanco cálido';
update public.themes set name_en = coalesce(name_en, 'Japanese streets'), description_en = coalesce(description_en, 'Alleys with lanterns, ramen shops and cherry blossoms.') where slug = 'calle-japonesa';
update public.themes set name_en = coalesce(name_en, 'Magical libraries'), description_en = coalesce(description_en, 'Endless aisles of shelves, ladders and secret archives.') where slug = 'biblioteca';
update public.themes set name_en = coalesce(name_en, 'Cafés and shops'), description_en = coalesce(description_en, 'Cosy corners: cafés, bookshops and shop windows on rainy days.') where slug = 'cafeteria';
update public.themes set name_en = coalesce(name_en, 'Fantasy worlds'), description_en = coalesce(description_en, 'Enchanted forests, towers and legendary creatures.') where slug = 'fantasia';
update public.themes set name_en = coalesce(name_en, 'European alleys'), description_en = coalesce(description_en, 'Cobbled streets of historic cities.') where slug = 'ciudad-europea';
update public.themes set name_en = coalesce(name_en, 'Mystery and period'), description_en = coalesce(description_en, 'Victorian studies, fog and cases to solve.') where slug = 'misterio';
