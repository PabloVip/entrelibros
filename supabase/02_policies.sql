-- =========================================================
-- Seguridad: Row Level Security (RLS)
-- La clave pública del navegador (anon) SOLO puede leer el catálogo.
-- Todo lo que escribe (pedidos, pagos, eventos, soporte) pasa por
-- funciones del servidor (03_functions.sql), nunca por INSERT directo.
-- =========================================================

alter table public.themes                enable row level security;
alter table public.products              enable row level security;
alter table public.product_variants      enable row level security;
alter table public.product_images        enable row level security;
alter table public.product_compatibility enable row level security;
alter table public.customers             enable row level security;
alter table public.admin_users           enable row level security;
alter table public.shipping_methods      enable row level security;
alter table public.discount_codes        enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.payments              enable row level security;
alter table public.support_requests      enable row level security;
alter table public.events                enable row level security;

-- ¿El usuario autenticado es administrador del back-office?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ---------- Catálogo: lectura pública ----------
create policy "catalogo publico" on public.themes
  for select to anon, authenticated using (true);
create policy "productos activos" on public.products
  for select to anon, authenticated using (is_active or public.is_admin());
create policy "variantes activas" on public.product_variants
  for select to anon, authenticated using (is_active or public.is_admin());
create policy "imagenes publicas" on public.product_images
  for select to anon, authenticated using (true);
create policy "compatibilidad publica" on public.product_compatibility
  for select to anon, authenticated using (true);
create policy "envios activos" on public.shipping_methods
  for select to anon, authenticated using (is_active or public.is_admin());

-- ---------- Datos privados: solo administradores (lectura) ----------
create policy "admin lee descuentos"  on public.discount_codes       for select to authenticated using (public.is_admin());
create policy "admin lee clientes"    on public.customers            for select to authenticated using (public.is_admin());
create policy "admin lee pedidos"     on public.orders               for select to authenticated using (public.is_admin());
create policy "admin lee lineas"      on public.order_items          for select to authenticated using (public.is_admin());
create policy "admin lee historial"   on public.order_status_history for select to authenticated using (public.is_admin());
create policy "admin lee pagos"       on public.payments             for select to authenticated using (public.is_admin());
create policy "admin lee soporte"     on public.support_requests     for select to authenticated using (public.is_admin());
create policy "admin lee eventos"     on public.events               for select to authenticated using (public.is_admin());
create policy "admin se ve a si mismo" on public.admin_users         for select to authenticated using (user_id = auth.uid());

-- Sin políticas de INSERT/UPDATE/DELETE: con RLS activado, quedan denegadas
-- para anon y authenticated. Las escrituras se hacen con funciones SECURITY DEFINER.
