-- =========================================================
-- Entrelibros · Cuentas de cliente (Pablo)
-- Ejecutar DESPUÉS de 01 → 08. Se puede ejecutar varias veces.
--
-- Los clientes se registran con Supabase Auth (email + contraseña). Supabase
-- envía el correo de confirmación y el de recuperar la contraseña.
--
--   · customers.user_id enlaza el cliente con su usuario de Auth.
--   · Al registrarse se crea (o se enlaza, si ya compró como invitado con ese
--     email) su ficha de cliente: trigger sobre auth.users.
--   · RLS: un cliente con el email CONFIRMADO lee sus datos, sus pedidos,
--     sus líneas, pagos, historial e incidencias. Nada más.
--   · update_my_profile: el cliente cambia su nombre y teléfono.
--   · Eventos: customer.registered, customer.profile_updated.
-- =========================================================

alter table public.customers
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

-- ---------- Cliente de la sesión actual ----------
-- Solo si el email está confirmado: así nadie puede ver pedidos de invitado
-- registrándose con un email que no es suyo.
create or replace function public.my_customer_id() returns bigint
language sql stable security definer set search_path = public as $$
  select c.id
    from public.customers c
    join auth.users u on u.id = c.user_id
   where c.user_id = auth.uid() and u.email_confirmed_at is not null
   limit 1;
$$;
revoke execute on function public.my_customer_id() from public, anon;
grant  execute on function public.my_customer_id() to authenticated;

-- ---------- Alta automática al registrarse ----------
create or replace function public._on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(new.email));
  v_name  text;
  v_phone text;
  v_id    bigint;
  v_prev  bigint;
begin
  if v_email is null or v_email = '' then
    return new;
  end if;
  v_name := left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(v_email, '@', 1)), 100);
  v_phone := nullif(btrim(new.raw_user_meta_data->>'phone'), '');
  if v_phone is not null and v_phone !~ '^[0-9 +()-]{6,20}$' then
    v_phone := null;
  end if;

  -- si ya compró como invitado con ese email, se enlaza su ficha (y sus pedidos)
  insert into public.customers (email, full_name, phone, user_id, is_test)
  values (v_email, v_name, v_phone, new.id, true)
  on conflict (email) do update set user_id = coalesce(public.customers.user_id, excluded.user_id)
  returning id into v_id;

  select count(*) into v_prev from public.orders where customer_id = v_id;
  perform public._emit_event('customer.registered', 'servidor', null, 'customer', v_id::text,
    jsonb_build_object('guest_orders_linked', v_prev), null, v_id);
  return new;
exception when others then
  -- un fallo aquí nunca debe impedir el registro: la ficha se crea al guardar el perfil
  raise warning 'No se pudo crear la ficha de cliente para %: %', v_email, sqlerrm;
  return new;
end $$;
revoke execute on function public._on_auth_user_created() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public._on_auth_user_created();

-- Usuarios que ya existían antes de este fichero (con email confirmado): se enlazan por email
update public.customers c set user_id = u.id
  from auth.users u
 where c.user_id is null and lower(u.email) = c.email
   and not exists (select 1 from public.customers c2 where c2.user_id = u.id);

-- ---------- Perfil ----------
create or replace function public.update_my_profile(p_full_name text, p_phone text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_name  text := btrim(coalesce(p_full_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_user  record;
  v_id    bigint;
begin
  select id, lower(email) as email, email_confirmed_at into v_user from auth.users where id = auth.uid();
  if v_user.id is null then
    raise exception 'Inicia sesión para editar tus datos' using errcode = '42501';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'Confirma tu email antes de editar tus datos' using errcode = '42501';
  end if;
  if char_length(v_name) not between 2 and 100 then
    raise exception 'El nombre debe tener entre 2 y 100 caracteres' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^[0-9 +()-]{6,20}$' then
    raise exception 'El teléfono no es válido' using errcode = '22023';
  end if;

  insert into public.customers (email, full_name, phone, user_id, is_test)
  values (v_user.email, v_name, v_phone, v_user.id, true)
  on conflict (email) do update set full_name = excluded.full_name, phone = excluded.phone,
                                    user_id = coalesce(public.customers.user_id, excluded.user_id)
  where public.customers.user_id is null or public.customers.user_id = v_user.id
  returning id into v_id;
  if v_id is null then
    raise exception 'Ese email está enlazado a otra cuenta' using errcode = '23505';
  end if;

  perform public._emit_event('customer.profile_updated', 'web', null, 'customer', v_id::text,
    jsonb_build_object('phone', v_phone is not null), null, v_id);
  return v_id;
end $$;
revoke execute on function public.update_my_profile(text, text) from public, anon;
grant  execute on function public.update_my_profile(text, text) to authenticated;

-- ---------- Lectura de lo propio (RLS) ----------
-- Se suman a las políticas de administrador de 02_policies.sql (se combinan con OR).
drop policy if exists "cliente ve su ficha"      on public.customers;
drop policy if exists "cliente ve sus pedidos"   on public.orders;
drop policy if exists "cliente ve sus lineas"    on public.order_items;
drop policy if exists "cliente ve sus pagos"     on public.payments;
drop policy if exists "cliente ve su historial"  on public.order_status_history;
drop policy if exists "cliente ve sus incidencias" on public.support_requests;

create policy "cliente ve su ficha" on public.customers
  for select to authenticated using (id = public.my_customer_id());
create policy "cliente ve sus pedidos" on public.orders
  for select to authenticated using (customer_id = public.my_customer_id());
create policy "cliente ve sus lineas" on public.order_items
  for select to authenticated using (order_id in (select id from public.orders where customer_id = public.my_customer_id()));
create policy "cliente ve sus pagos" on public.payments
  for select to authenticated using (order_id in (select id from public.orders where customer_id = public.my_customer_id()));
create policy "cliente ve su historial" on public.order_status_history
  for select to authenticated using (order_id in (select id from public.orders where customer_id = public.my_customer_id()));
create policy "cliente ve sus incidencias" on public.support_requests
  for select to authenticated using (
    customer_email = (select email from public.customers where id = public.my_customer_id()));
