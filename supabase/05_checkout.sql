-- =========================================================
-- Entrelibros · Checkout: descuentos y creación de pedidos (Nino)
-- Ejecutar DESPUÉS de 01 → 04. Se puede ejecutar varias veces:
-- todas las funciones usan "create or replace".
--
-- Regla de oro: el navegador solo manda QUÉ quiere comprar
-- (variante + cantidad). Precios, descuento, envío, IVA y total
-- se calculan aquí con los datos de la BD.
-- =========================================================

-- ---------------------------------------------------------
-- INTERNAS (no se exponen al navegador)
-- ---------------------------------------------------------

-- Cadena aleatoria en mayúsculas para números de pedido, incidencia y pago.
-- Sin 0/O ni 1/I para que el cliente no los confunda al leerlos o dictarlos.
create or replace function public._random_code(p_length int) returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, p_length);
$$;

revoke execute on function public._random_code(int) from public, anon, authenticated;

-- Calcula el descuento de un código sobre un subtotal.
-- La usan validate_discount (aviso orientativo) y create_order (importe real),
-- así las dos aplican exactamente la misma regla.
-- Devuelve {valid, code, description, discount_amount} o {valid:false, reason}.
create or replace function public._calc_discount(p_code text, p_subtotal numeric) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_dc     public.discount_codes%rowtype;
  v_amount numeric(10,2);
  v_today  date := (now() at time zone 'Europe/Madrid')::date;  -- Supabase va en UTC
begin
  select * into v_dc from public.discount_codes
   where code = upper(btrim(p_code)) and is_active;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'El código no existe o no está activo');
  end if;

  if v_dc.valid_from is not null and v_today < v_dc.valid_from then
    return jsonb_build_object('valid', false, 'reason', 'El código todavía no está vigente');
  end if;
  if v_dc.valid_until is not null and v_today > v_dc.valid_until then
    return jsonb_build_object('valid', false, 'reason', 'El código ha caducado');
  end if;
  if p_subtotal < v_dc.min_subtotal then
    return jsonb_build_object('valid', false, 'reason',
      format('Este código necesita un pedido mínimo de %s €', replace(v_dc.min_subtotal::text, '.', ',')));
  end if;

  v_amount := case v_dc.discount_type
    when 'porcentaje'   then round(p_subtotal * v_dc.value / 100, 2)
    when 'importe_fijo' then least(v_dc.value, p_subtotal)   -- nunca más que el subtotal
  end;

  return jsonb_build_object('valid', true, 'code', v_dc.code,
    'description', v_dc.description, 'discount_amount', v_amount);
end $$;

revoke execute on function public._calc_discount(text, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------
-- validate_discount: botón "Aplicar" del checkout
-- El subtotal lo manda el navegador, así que el resultado es SOLO
-- orientativo; create_order lo vuelve a calcular con precios de la BD.
-- ---------------------------------------------------------
create or replace function public.validate_discount(p_code text, p_subtotal numeric) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_code is null or char_length(btrim(p_code)) not between 1 and 40 then
    raise exception 'Introduce un código de descuento' using errcode = '22023';
  end if;
  if p_subtotal is null or p_subtotal < 0 or p_subtotal > 100000 then
    raise exception 'Subtotal no válido' using errcode = '22023';
  end if;

  return public._calc_discount(p_code, round(p_subtotal, 2));
end $$;

grant execute on function public.validate_discount(text, numeric) to anon, authenticated;

-- ---------------------------------------------------------
-- create_order: crea el pedido en estado "creado"
--   p_customer: {email, full_name, phone}
--   p_shipping: {name, address, city, postcode, province, notes}
--   p_items:    [{variant_id, quantity}, ...]   ← sin precios
-- ---------------------------------------------------------
create or replace function public.create_order(
  p_customer      jsonb,
  p_shipping      jsonb,
  p_items         jsonb,
  p_shipping_code text,
  p_discount_code text default null,
  p_session_id    text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_tax_rate    constant numeric := 21.00;
  v_email       text := lower(btrim(p_customer->>'email'));
  v_full_name   text := btrim(p_customer->>'full_name');
  v_phone       text := nullif(btrim(p_customer->>'phone'), '');
  v_ship_name   text := coalesce(nullif(btrim(p_shipping->>'name'), ''), btrim(p_customer->>'full_name'));
  v_address     text := btrim(p_shipping->>'address');
  v_city        text := btrim(p_shipping->>'city');
  v_postcode    text := btrim(p_shipping->>'postcode');
  v_province    text := btrim(p_shipping->>'province');
  v_notes       text := nullif(btrim(p_shipping->>'notes'), '');
  v_code        text := nullif(upper(btrim(p_discount_code)), '');
  v_item        jsonb;
  v_line        record;
  v_lines       jsonb := '[]'::jsonb;  -- "foto" de cada línea con el precio de la BD
  v_ship        public.shipping_methods%rowtype;
  v_discount    jsonb;
  v_customer_id bigint;
  v_order_id    bigint;
  v_order_num   text;
  v_subtotal    numeric(10,2) := 0;
  v_disc_amount numeric(10,2) := 0;
  v_ship_cost   numeric(10,2);
  v_total       numeric(10,2);
  v_tax         numeric(10,2);
begin
  -- 1) Validación de los datos del cliente y del envío
  if jsonb_typeof(p_customer) is distinct from 'object' or jsonb_typeof(p_shipping) is distinct from 'object' then
    raise exception 'Faltan los datos del cliente o del envío' using errcode = '22023';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El email no es válido' using errcode = '22023';
  end if;
  if v_full_name is null or char_length(v_full_name) not between 2 and 100 then
    raise exception 'El nombre debe tener entre 2 y 100 caracteres' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^[0-9 +()-]{6,20}$' then
    raise exception 'El teléfono no es válido' using errcode = '22023';
  end if;
  if char_length(v_ship_name) > 100 then
    raise exception 'El nombre del destinatario es demasiado largo' using errcode = '22023';
  end if;
  if v_address is null or char_length(v_address) not between 5 and 200 then
    raise exception 'La dirección debe tener entre 5 y 200 caracteres' using errcode = '22023';
  end if;
  if v_city is null or char_length(v_city) not between 2 and 80 then
    raise exception 'La ciudad no es válida' using errcode = '22023';
  end if;
  if v_postcode is null or v_postcode !~ '^[0-9]{5}$' then
    raise exception 'El código postal debe tener 5 dígitos' using errcode = '22023';
  end if;
  if v_province is null or char_length(v_province) not between 2 and 80 then
    raise exception 'La provincia no es válida' using errcode = '22023';
  end if;
  if char_length(v_notes) > 500 then
    raise exception 'La nota no puede superar los 500 caracteres' using errcode = '22023';
  end if;
  if char_length(p_session_id) > 64 then
    raise exception 'session_id no válido' using errcode = '22023';
  end if;

  -- 2) Validación de las líneas: solo enteros, sin precios
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'El pedido debe tener entre 1 y 20 líneas' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'variant_id', '') !~ '^[0-9]{1,18}$'
       or coalesce(v_item->>'quantity', '') !~ '^[0-9]{1,2}$' then
      raise exception 'Línea de pedido no válida' using errcode = '22023';
    end if;
  end loop;

  -- 3) Precio y stock ACTUALES de la BD. Si la misma variante llega
  --    repetida se suman las cantidades.
  for v_line in
    select r.variant_id, r.quantity, v.sku, v.name as variant_name, v.price, v.stock,
           p.name as product_name, (v.is_active and p.is_active) as on_sale
    from (select (e->>'variant_id')::bigint as variant_id, sum((e->>'quantity')::int) as quantity
            from jsonb_array_elements(p_items) e group by 1) r
    left join public.product_variants v on v.id = r.variant_id
    left join public.products p on p.id = v.product_id
    order by r.variant_id
  loop
    if v_line.sku is null or not v_line.on_sale then
      raise exception 'Un producto del carrito ya no está a la venta' using errcode = '22023';
    end if;
    if v_line.quantity not between 1 and 10 then
      raise exception 'La cantidad de "%" debe estar entre 1 y 10', v_line.product_name using errcode = '22023';
    end if;
    if v_line.quantity > v_line.stock then
      raise exception 'No hay stock suficiente de "%" (quedan %)', v_line.product_name, v_line.stock
        using errcode = '22023';
    end if;

    v_subtotal := v_subtotal + v_line.price * v_line.quantity;
    v_lines := v_lines || jsonb_build_object(
      'variant_id', v_line.variant_id, 'product_name', v_line.product_name,
      'variant_name', v_line.variant_name, 'sku', v_line.sku,
      'unit_price', v_line.price, 'quantity', v_line.quantity,
      'line_total', v_line.price * v_line.quantity);
  end loop;

  -- 4) Envío, descuento, total e IVA (mismas reglas que el seed)
  select * into v_ship from public.shipping_methods where code = btrim(p_shipping_code) and is_active;
  if not found then
    raise exception 'Elige un método de envío válido' using errcode = '22023';
  end if;

  if v_code is not null then
    v_discount := public._calc_discount(v_code, v_subtotal);
    if not (v_discount->>'valid')::boolean then
      raise exception '%', v_discount->>'reason' using errcode = '22023';
    end if;
    v_code        := v_discount->>'code';
    v_disc_amount := (v_discount->>'discount_amount')::numeric;
  end if;

  v_ship_cost := case when v_ship.free_from is not null and v_subtotal - v_disc_amount >= v_ship.free_from
                      then 0 else v_ship.price end;
  v_total := v_subtotal - v_disc_amount + v_ship_cost;
  v_tax   := v_total - round(v_total / (1 + c_tax_rate / 100), 2);  -- los precios ya llevan IVA

  -- 5) Cliente: se busca por email o se crea (siempre ficticio)
  insert into public.customers (email, full_name, phone, is_test)
  values (v_email, v_full_name, v_phone, true)
  on conflict (email) do nothing;
  select id into v_customer_id from public.customers where email = v_email;

  -- 6) Pedido con número EL-AAAAMMDD-XXXX; si el número ya existe, se genera otro
  for i in 1..5 loop
    v_order_num := 'EL-' || to_char(now() at time zone 'Europe/Madrid', 'YYYYMMDD') || '-' || public._random_code(4);
    begin
      insert into public.orders (order_number, customer_id, status, subtotal, discount_code, discount_amount,
        shipping_method_id, shipping_cost, tax_rate, tax_amount, total,
        ship_name, ship_address, ship_city, ship_postcode, ship_province, customer_notes)
      values (v_order_num, v_customer_id, 'creado', v_subtotal, v_code, v_disc_amount,
        v_ship.id, v_ship_cost, c_tax_rate, v_tax, v_total,
        v_ship_name, v_address, v_city, v_postcode, v_province, v_notes)
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;

  insert into public.order_items (order_id, variant_id, product_name, variant_name, sku, unit_price, quantity, line_total)
  select v_order_id, l.variant_id, l.product_name, l.variant_name, l.sku, l.unit_price, l.quantity, l.line_total
  from jsonb_to_recordset(v_lines) as l(variant_id bigint, product_name text, variant_name text, sku text,
                                        unit_price numeric, quantity smallint, line_total numeric);

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (v_order_id, null, 'creado', 'sistema');

  perform public._emit_event('order.created', 'servidor', p_session_id, 'order', v_order_id::text,
    jsonb_build_object('order_number', v_order_num, 'total', v_total, 'items', jsonb_array_length(v_lines)),
    v_order_id, v_customer_id);

  return jsonb_build_object(
    'order_number', v_order_num, 'status', 'creado',
    'subtotal', v_subtotal, 'discount_code', v_code, 'discount_amount', v_disc_amount,
    'shipping_cost', v_ship_cost, 'tax_amount', v_tax, 'total', v_total);
end $$;

grant execute on function public.create_order(jsonb, jsonb, jsonb, text, text, text) to anon, authenticated;
