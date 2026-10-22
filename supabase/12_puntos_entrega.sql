-- =========================================================
-- Entrelibros · Puntos de recogida (envío "Recogida en punto de entrega") (Pablo)
-- Ejecutar DESPUÉS de los demás y, a continuación, volver a ejecutar 05_checkout.sql
-- (create_order guarda el punto elegido y get_order_summary lo devuelve).
-- Se puede ejecutar varias veces.
--
--   · Tabla pickup_points: puntos de recogida con dirección, horario y coordenadas (mapa).
--   · orders.pickup_point_id: punto elegido en el pedido (null en los envíos a domicilio).
--   · Lectura pública solo de los puntos activos (RLS); se cambian desde Supabase.
-- Los puntos son ficticios: calles reales de cada ciudad, sin ningún comercio real.
-- =========================================================

create table if not exists public.pickup_points (
  id        bigint generated always as identity primary key,
  code      text not null unique check (code ~ '^[A-Z0-9-]{3,20}$'),
  name      text not null,
  address   text not null,
  postcode  text not null check (postcode ~ '^[0-9]{5}$'),
  city      text not null,
  province  text not null,
  lat       numeric(9,6) not null check (lat between -90 and 90),
  lng       numeric(9,6) not null check (lng between -180 and 180),
  hours     text not null,
  is_active boolean not null default true
);

alter table public.orders
  add column if not exists pickup_point_id bigint references public.pickup_points(id);

-- Seguridad: cualquiera puede ver los puntos activos (el mapa del checkout); nadie los cambia desde la web
alter table public.pickup_points enable row level security;
drop policy if exists "puntos activos visibles" on public.pickup_points;
create policy "puntos activos visibles" on public.pickup_points
  for select to anon, authenticated using (is_active or public.is_admin());
revoke all on public.pickup_points from anon, authenticated;
grant select on public.pickup_points to anon, authenticated;

-- Puntos de ejemplo (si ya existen, se actualizan)
insert into public.pickup_points (code, name, address, postcode, city, province, lat, lng, hours) values
  ('MU-CIRCULAR', 'Punto Entrelibros Plaza Circular', 'Plaza Circular, 6',                   '30008', 'Murcia',     'Murcia',    37.992400, -1.130100, 'L-V 9:30-20:30 · S 10:00-14:00'),
  ('MU-GRANVIA',  'Punto Entrelibros Gran Vía',        'Gran Vía Escultor Salzillo, 18',      '30004', 'Murcia',     'Murcia',    37.984600, -1.129600, 'L-S 10:00-21:00'),
  ('MU-JUANXXIII','Punto Entrelibros Juan XXIII',      'Plaza Juan XXIII, 3',                 '30008', 'Murcia',     'Murcia',    37.990700, -1.121700, 'L-V 9:00-14:00 y 17:00-20:00'),
  ('CT-MAYOR',    'Punto Entrelibros Calle Mayor',     'Calle Mayor, 20',                     '30201', 'Cartagena',  'Murcia',    37.600900, -0.984300, 'L-S 10:00-14:00 y 17:00-20:30'),
  ('LO-ESPANA',   'Punto Entrelibros Plaza de España', 'Plaza de España, 2',                  '30800', 'Lorca',      'Murcia',    37.677300, -1.699800, 'L-V 10:00-14:00 y 17:00-20:00'),
  ('AL-RAMBLA',   'Punto Entrelibros La Rambla',       'Rambla de Méndez Núñez, 25',          '03002', 'Alicante',   'Alicante',  38.346700, -0.484000, 'L-S 10:00-21:00'),
  ('VA-AYTO',     'Punto Entrelibros Plaza del Ayuntamiento', 'Plaza del Ayuntamiento, 9',    '46002', 'Valencia',   'Valencia',  39.469900, -0.376400, 'L-S 9:30-21:00'),
  ('AB-ANCHA',    'Punto Entrelibros Calle Ancha',     'Calle Marqués de Molins, 10',         '02001', 'Albacete',   'Albacete',  38.994700, -1.857700, 'L-V 10:00-14:00 y 17:00-20:30'),
  ('MA-SOL',      'Punto Entrelibros Sol',             'Calle del Carmen, 4',                 '28013', 'Madrid',     'Madrid',    40.418200, -3.704000, 'L-D 10:00-22:00'),
  ('MA-BILBAO',   'Punto Entrelibros Glorieta de Bilbao', 'Calle de Fuencarral, 120',         '28010', 'Madrid',     'Madrid',    40.428600, -3.701900, 'L-S 10:00-21:00'),
  ('BA-CATALUNYA','Punto Entrelibros Plaça de Catalunya', 'Carrer de Pelai, 30',              '08001', 'Barcelona',  'Barcelona', 41.385700,  2.167300, 'L-S 10:00-21:00'),
  ('SE-NUEVA',    'Punto Entrelibros Plaza Nueva',     'Calle Tetuán, 12',                    '41001', 'Sevilla',    'Sevilla',   37.390300, -5.994800, 'L-S 10:00-21:00'),
  ('GR-BIBRAMBLA','Punto Entrelibros Bib-Rambla',      'Calle Mesones, 15',                   '18001', 'Granada',    'Granada',   37.175000, -3.600700, 'L-S 10:00-14:00 y 17:00-21:00')
on conflict (code) do update set
  name = excluded.name, address = excluded.address, postcode = excluded.postcode, city = excluded.city,
  province = excluded.province, lat = excluded.lat, lng = excluded.lng, hours = excluded.hours;

notify pgrst, 'reload schema';
