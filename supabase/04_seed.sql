-- =========================================================
-- Datos de prueba (ficticios). Se puede re-ejecutar: vacía y recarga.
-- Ejecutar después de 01, 02 y 03.
-- =========================================================

truncate public.events, public.support_requests, public.payments, public.order_status_history,
  public.order_items, public.orders, public.discount_codes, public.shipping_methods, public.customers,
  public.product_compatibility, public.product_images, public.product_variants, public.products,
  public.themes restart identity cascade;

-- ---------- TEMÁTICAS ----------
insert into public.themes (slug, name, description, sort_order) values
  ('calle-japonesa', 'Calles japonesas',     'Callejones con farolillos, tiendas de ramen y cerezos en flor.', 1),
  ('biblioteca',     'Bibliotecas mágicas',  'Pasillos infinitos de estanterías, escaleras y archivos secretos.', 2),
  ('cafeteria',      'Cafeterías y tiendas', 'Rincones acogedores: cafés, librerías y escaparates en días de lluvia.', 3),
  ('fantasia',       'Mundos fantásticos',   'Bosques encantados, torres y criaturas legendarias.', 4),
  ('ciudad-europea', 'Callejones europeos',  'Calles empedradas de ciudades históricas.', 5),
  ('misterio',       'Misterio y época',     'Despachos victorianos, niebla y casos por resolver.', 6);

-- ---------- PRODUCTOS ----------
insert into public.products (slug, name, theme_id, product_type, difficulty, width_mm, height_mm, depth_mm,
                             pieces_count, build_time_hours, short_description, description)
select v.slug, v.name, t.id, v.product_type, v.difficulty, v.w, v.h, v.d, v.pieces, v.hours, v.short_d, v.descr
from (values
  -- KITS
  ('callejon-kioto-sakura', 'Callejón de Kioto en flor', 'calle-japonesa', 'kit', 'intermedio', 120, 240, 190, 210, 8.0,
   'Un estrecho callejón de Kioto con cerezos, farolillos de papel y una casa de té.',
   'Recrea un callejón del barrio de Gion entre tus libros: fachadas de madera, cerezos en flor, farolillos de papel y una pequeña casa de té con la puerta entreabierta. Piezas de contrachapado cortadas con láser que encajan sin cola, más detalles en papel y resina.'),
  ('tienda-ramen-nocturna', 'Tienda de ramen nocturna', 'calle-japonesa', 'kit', 'avanzado', 140, 250, 195, 320, 12.0,
   'Puesto de ramen de madrugada con letreros luminosos y vapor de cocina.',
   'Una calle de Tokio de madrugada: el puesto de ramen con su cortina noren, letreros en neón, máquinas expendedoras y cables cruzando el cielo. Diseñado para iluminarse: todas sus variantes incluyen LED.'),
  ('biblioteca-infinita', 'Biblioteca infinita', 'biblioteca', 'kit', 'avanzado', 150, 245, 200, 380, 14.0,
   'Pasillo de estanterías que parece no tener fin gracias a un efecto espejo.',
   'Un pasillo de estanterías de doble altura con escaleras de mano, lámparas de lectura y un espejo al fondo que multiplica la escena hasta el infinito. Incluye más de 200 libros en miniatura impresos.'),
  ('archivo-del-alquimista', 'Archivo del alquimista', 'biblioteca', 'kit', 'intermedio', 120, 240, 180, 240, 9.0,
   'Estudio de un alquimista con pergaminos, frascos y un globo celeste.',
   'Estanterías repletas de frascos, pergaminos y grimorios alrededor de una mesa de trabajo con globo celeste. Una escena cálida y detallada para principiantes con algo de experiencia.'),
  ('cafeteria-paris-1920', 'Café parisino de 1920', 'cafeteria', 'kit', 'principiante', 110, 230, 170, 150, 5.0,
   'Terraza de un café de París con toldo a rayas y mesas de mármol.',
   'Un primer kit ideal: la fachada de un café parisino de los años veinte con su toldo a rayas, mesitas de mármol y pizarras con el menú. Montaje sencillo con instrucciones ilustradas paso a paso.'),
  ('libreria-esquina-lluvia', 'Librería de la esquina bajo la lluvia', 'cafeteria', 'kit', 'intermedio', 130, 240, 190, 230, 8.0,
   'Escaparate de una librería con charcos, paraguas y luz cálida en las ventanas.',
   'Una librería de barrio en una tarde de lluvia: escaparate repleto de libros, un gato en la ventana y charcos de resina en la acera. Pensado para iluminarse: todas sus variantes llevan LED.'),
  ('bosque-de-las-hadas', 'Bosque de las hadas', 'fantasia', 'kit', 'principiante', 100, 220, 160, 120, 4.0,
   'Sendero entre árboles retorcidos, setas y pequeñas casas de hadas.',
   'Un sendero entre árboles retorcidos con casitas en los troncos, setas gigantes y luciérnagas. El kit más estrecho del catálogo: cabe incluso en baldas muy llenas.'),
  ('torre-del-dragon', 'Torre del dragón', 'fantasia', 'kit', 'avanzado', 160, 260, 210, 410, 16.0,
   'Escalera de caracol que asciende hacia la guarida de un dragón dormido.',
   'Nuestro kit más ambicioso: una escalera de caracol de piedra que sube entre antorchas hasta la guarida de un dragón dormido sobre su tesoro. Para montadores con experiencia.'),
  ('callejon-praga', 'Callejón de Praga', 'ciudad-europea', 'kit', 'intermedio', 120, 240, 190, 260, 9.0,
   'Calle empedrada con fachadas de colores, farolas de hierro y un reloj astronómico.',
   'Fachadas barrocas de colores, adoquines, farolas de hierro forjado y, al fondo, un reloj astronómico. Inspirado en el casco antiguo de Praga.'),
  ('despacho-detective-victoriano', 'Despacho del detective victoriano', 'misterio', 'kit', 'avanzado', 140, 250, 200, 340, 13.0,
   'Despacho londinense con chimenea, violín y pistas sobre el escritorio.',
   'Un despacho del Londres victoriano con chimenea, sillones de cuero, un violín y el escritorio lleno de pistas. Niebla de algodón y farola de gas en la ventana.'),
  -- ACCESORIOS
  ('kit-led-usb-universal', 'Kit LED USB universal', null, 'accesorio', null, null, null, null, null, null,
   'Ilumina cualquier escena: tira LED adhesiva con interruptor y cable USB.',
   'Tira LED flexible de 1 m con interruptor en línea y alimentación USB. Compatible con cualquier kit sin iluminación: se oculta en el techo de la escena.'),
  ('set-libros-miniatura', 'Set de libros en miniatura', null, 'accesorio', null, null, null, null, null, null,
   'Libros impresos a escala 1:24 para rellenar estanterías.',
   'Lomos de libros impresos a escala 1:24 en distintos colores y tamaños, listos para recortar y pegar en cualquier estantería de tus escenas.'),
  ('cupula-antipolvo', 'Cubierta antipolvo de metacrilato', null, 'accesorio', null, null, null, null, null, null,
   'Frontal transparente que protege la escena del polvo sin ocultarla.',
   'Frontal de metacrilato transparente de 2 mm con imanes para colocarlo y retirarlo fácilmente. Elige el ancho según tu kit.'),
  ('set-pintura-acabados', 'Set de pintura y acabados', null, 'accesorio', null, null, null, null, null, null,
   'Acrílicos, pinceles finos y barniz para personalizar tus kits.',
   'Doce acrílicos en tonos madera, piedra y vegetación, tres pinceles de detalle y barniz mate. Todo lo necesario para dar un acabado envejecido a tu escena.'),
  -- RECAMBIOS
  ('recambio-farolillos-papel', 'Recambio: farolillos de papel', 'calle-japonesa', 'recambio', null, null, null, null, null, null,
   'Pack de 6 farolillos de papel con armazón para las escenas japonesas.',
   'Seis farolillos de papel de arroz con armazón de madera, iguales a los incluidos en los kits de calles japonesas.'),
  ('recambio-tira-led-30', 'Recambio: tira LED 30 cm', null, 'recambio', null, null, null, null, null, null,
   'Tira LED de repuesto para los kits con iluminación.',
   'Tira LED de 30 cm con conector JST, idéntica a la que montan los kits iluminados. Para sustituir una tira dañada.'),
  ('recambio-ventanas-acetato', 'Recambio: ventanas de acetato', null, 'recambio', null, null, null, null, null, null,
   'Lámina de acetato precortada para ventanas y escaparates.',
   'Lámina precortada con todas las ventanas y vitrinas de los kits de biblioteca y cafetería. Útil si alguna se raya durante el montaje.'),
  ('recambio-piezas-praga', 'Recambio: piezas pequeñas Callejón de Praga', 'ciudad-europea', 'recambio', null, null, null, null, null, null,
   'Plancha con farolas, balcones y piezas pequeñas del Callejón de Praga.',
   'Plancha de contrachapado con las piezas más pequeñas y frágiles del kit Callejón de Praga: farolas, barandillas de balcón y agujas del reloj.')
) as v(slug, name, theme_slug, product_type, difficulty, w, h, d, pieces, hours, short_d, descr)
left join public.themes t on t.slug = v.theme_slug;

-- ---------- VARIANTES ----------
insert into public.product_variants (product_id, sku, name, has_lighting, finish, price, stock, weight_g, is_default)
select p.id, v.sku, v.name, v.lit, v.finish, v.price, v.stock, v.weight, v.is_default
from (values
  ('callejon-kioto-sakura',        'EL-KIO-SL',   'Sin iluminación',                false, 'Madera natural', 39.90, 25, 780, true),
  ('callejon-kioto-sakura',        'EL-KIO-LED',  'Con kit LED USB',                true,  'Madera natural', 49.90, 18, 820, false),
  ('callejon-kioto-sakura',        'EL-KIO-PRM',  'Con LED + pintado premium',      true,  'Pintado a mano', 64.90,  4, 830, false),
  ('tienda-ramen-nocturna',        'EL-RAM-LED',  'Con kit LED USB',                true,  'Madera natural', 59.90, 12, 950, true),
  ('tienda-ramen-nocturna',        'EL-RAM-TAC',  'Con LED + sensor táctil',        true,  'Madera natural', 69.90,  6, 960, false),
  ('biblioteca-infinita',          'EL-BIB-SL',   'Sin iluminación',                false, 'Madera natural', 54.90, 10, 1100, true),
  ('biblioteca-infinita',          'EL-BIB-LED',  'Con kit LED USB',                true,  'Madera natural', 66.90,  8, 1150, false),
  ('archivo-del-alquimista',       'EL-ALQ-SL',   'Sin iluminación',                false, 'Madera natural', 44.90, 15, 820, true),
  ('archivo-del-alquimista',       'EL-ALQ-LED',  'Con kit LED USB',                true,  'Madera natural', 54.90,  0, 860, false),
  ('cafeteria-paris-1920',         'EL-PAR-SL',   'Sin iluminación',                false, 'Madera natural', 34.90, 30, 620, true),
  ('cafeteria-paris-1920',         'EL-PAR-LED',  'Con kit LED USB',                true,  'Madera natural', 42.90, 22, 650, false),
  ('libreria-esquina-lluvia',      'EL-LIB-NAT',  'Con LED · madera natural',       true,  'Madera natural', 52.90, 14, 800, true),
  ('libreria-esquina-lluvia',      'EL-LIB-OTO',  'Con LED · edición otoño',        true,  'Pintado otoño',  58.90,  7, 810, false),
  ('bosque-de-las-hadas',          'EL-HAD-SL',   'Sin iluminación',                false, 'Madera natural', 29.90, 40, 480, true),
  ('bosque-de-las-hadas',          'EL-HAD-LED',  'Con luciérnagas LED',            true,  'Madera natural', 37.90, 26, 500, false),
  ('torre-del-dragon',             'EL-DRA-LED',  'Con kit LED USB',                true,  'Madera natural', 74.90,  9, 1350, true),
  ('torre-del-dragon',             'EL-DRA-PRM',  'Con LED + pintado premium',      true,  'Pintado a mano', 89.90,  3, 1380, false),
  ('callejon-praga',               'EL-PRA-SL',   'Sin iluminación',                false, 'Madera natural', 42.90, 16, 840, true),
  ('callejon-praga',               'EL-PRA-LED',  'Con kit LED USB',                true,  'Madera natural', 52.90, 11, 880, false),
  ('despacho-detective-victoriano','EL-DET-LED',  'Con kit LED USB',                true,  'Madera natural', 62.90, 10, 1000, true),
  ('kit-led-usb-universal',        'EL-ACC-LED-W','Blanco cálido',                  true,  null,              9.90, 60, 90, true),
  ('kit-led-usb-universal',        'EL-ACC-LED-M','Multicolor con mando',           true,  null,             14.90, 35, 110, false),
  ('set-libros-miniatura',         'EL-ACC-LIB24','Pack 24 libros',                 false, null,              6.90, 80, 40, true),
  ('set-libros-miniatura',         'EL-ACC-LIB60','Pack 60 libros',                 false, null,             11.90, 45, 90, false),
  ('cupula-antipolvo',             'EL-ACC-CUP-E','Estrecha (hasta 130 mm)',        false, null,             19.90, 20, 300, true),
  ('cupula-antipolvo',             'EL-ACC-CUP-A','Ancha (hasta 170 mm)',           false, null,             24.90, 15, 360, false),
  ('set-pintura-acabados',         'EL-ACC-PINT', 'Set completo',                   false, null,             12.90, 30, 250, true),
  ('recambio-farolillos-papel',    'EL-REC-FAR6', 'Pack 6 farolillos',              false, null,              4.90, 50, 20, true),
  ('recambio-tira-led-30',         'EL-REC-LED30','Tira 30 cm · conector JST',      true,  null,              5.90, 70, 15, true),
  ('recambio-ventanas-acetato',    'EL-REC-ACET', 'Lámina completa',                false, null,              3.90, 90, 10, true),
  ('recambio-piezas-praga',        'EL-REC-PRA',  'Plancha de piezas pequeñas',     false, null,              6.50, 25, 60, true)
) as v(slug, sku, name, lit, finish, price, stock, weight, is_default)
join public.products p on p.slug = v.slug;

-- ---------- IMÁGENES (ilustraciones provisionales en public/img/productos/) ----------
insert into public.product_images (product_id, url, alt_text, sort_order)
select p.id, 'img/productos/' || p.slug || '.svg',
       'Ilustración de ' || p.name || ' colocado entre libros', 0
from public.products p;

-- ---------- COMPATIBILIDAD accesorio/recambio → kit ----------
insert into public.product_compatibility (product_id, compatible_with_id)
select a.id, k.id
from (values
  ('recambio-farolillos-papel', 'callejon-kioto-sakura'),
  ('recambio-farolillos-papel', 'tienda-ramen-nocturna'),
  ('recambio-ventanas-acetato', 'biblioteca-infinita'),
  ('recambio-ventanas-acetato', 'archivo-del-alquimista'),
  ('recambio-ventanas-acetato', 'cafeteria-paris-1920'),
  ('recambio-ventanas-acetato', 'libreria-esquina-lluvia'),
  ('recambio-piezas-praga',     'callejon-praga'),
  ('cupula-antipolvo',          'callejon-kioto-sakura'),
  ('cupula-antipolvo',          'archivo-del-alquimista'),
  ('cupula-antipolvo',          'cafeteria-paris-1920'),
  ('cupula-antipolvo',          'bosque-de-las-hadas'),
  ('cupula-antipolvo',          'callejon-praga'),
  ('cupula-antipolvo',          'tienda-ramen-nocturna'),
  ('cupula-antipolvo',          'biblioteca-infinita')
) as v(acc, kit)
join public.products a on a.slug = v.acc
join public.products k on k.slug = v.kit;

-- La tira LED de recambio vale para todos los kits que se venden con luz
insert into public.product_compatibility (product_id, compatible_with_id)
select distinct r.id, pv.product_id
from public.products r
join public.product_variants pv on pv.has_lighting
join public.products k on k.id = pv.product_id and k.product_type = 'kit'
where r.slug = 'recambio-tira-led-30';

-- El kit LED universal vale para los kits que tienen versión sin luz
insert into public.product_compatibility (product_id, compatible_with_id)
select distinct a.id, pv.product_id
from public.products a
join public.product_variants pv on not pv.has_lighting
join public.products k on k.id = pv.product_id and k.product_type = 'kit'
where a.slug = 'kit-led-usb-universal';

-- ---------- ENVÍOS ----------
insert into public.shipping_methods (code, name, price, free_from, eta_days_min, eta_days_max) values
  ('estandar', 'Envío estándar a domicilio', 4.95, 60.00, 3, 5),
  ('express',  'Envío exprés 24/48 h',       8.95, null,  1, 2),
  ('punto',    'Recogida en punto de entrega', 2.95, 40.00, 3, 6);

-- ---------- CÓDIGOS DE DESCUENTO ----------
insert into public.discount_codes (code, description, discount_type, value, min_subtotal, valid_from, valid_until) values
  ('BIENVENIDA10', '10 % en tu primer pedido',            'porcentaje',   10.00,  0.00, null,         null),
  ('NOOK5',        '5 € de descuento a partir de 40 €',   'importe_fijo',  5.00, 40.00, null,         null),
  ('OTONO15',      '15 % en pedidos de más de 80 €',      'porcentaje',   15.00, 80.00, '2026-10-01', '2026-11-30');

-- ---------- CLIENTES DE PRUEBA (ficticios, dominio .test reservado) ----------
insert into public.customers (email, full_name, phone) values
  ('lucia.martin@entrelibros.test',  'Lucía Martín Prueba',  '600000001'),
  ('javier.ruiz@entrelibros.test',   'Javier Ruiz Prueba',   '600000002'),
  ('marta.sanchez@entrelibros.test', 'Marta Sánchez Prueba', '600000003'),
  ('carlos.lopez@entrelibros.test',  'Carlos López Prueba',  '600000004');

-- ---------- PEDIDOS HISTÓRICOS DE EJEMPLO (para el back-office) ----------
-- Reglas de cálculo (las mismas que debe aplicar create_order):
--   subtotal = Σ líneas (PVP con IVA) · descuento sobre el subtotal
--   envío gratis si (subtotal - descuento) >= free_from
--   total = subtotal - descuento + envío · IVA desglosado = total - total / 1,21
insert into public.orders (order_number, customer_id, status, subtotal, discount_code, discount_amount,
  shipping_method_id, shipping_cost, tax_amount, total, ship_name, ship_address, ship_city,
  ship_postcode, ship_province, customer_notes, created_at)
select v.num, c.id, v.status, v.subtotal, v.code, v.disc, s.id, v.ship, v.tax, v.total,
       c.full_name, v.addr, v.city, v.cp, v.prov, v.notes, now() - v.ago
from (values
  ('EL-20261009-K7Q2', 'lucia.martin@entrelibros.test',  'entregado',             54.80, null,       0.00, 'estandar', 4.95, 10.37, 59.75,
   'Calle Ficticia 1, 2º B',    'Murcia',  '30001', 'Murcia',   null,                       interval '9 days'),
  ('EL-20261013-R4D9', 'javier.ruiz@entrelibros.test',   'pendiente_preparacion', 87.80, 'OTONO15', 13.17, 'estandar', 0.00, 12.95, 74.63,
   'Avenida Inventada 22',      'Cartagena','30201', 'Murcia',  'Es un regalo, sin factura', interval '5 days'),
  ('EL-20261015-M2X8', 'marta.sanchez@entrelibros.test', 'enviado',               69.80, 'NOOK5',    5.00, 'express',  8.95, 12.80, 73.75,
   'Plaza de Prueba 3',         'Alicante','03001', 'Alicante', null,                       interval '3 days'),
  ('EL-20261017-T9F1', 'carlos.lopez@entrelibros.test',  'creado',                37.90, null,       0.00, 'punto',    2.95,  7.09, 40.85,
   'Calle Simulada 45',         'Lorca',   '30800', 'Murcia',   null,                       interval '1 day')
) as v(num, email, status, subtotal, code, disc, ship_code, ship, tax, total, addr, city, cp, prov, notes, ago)
join public.customers c on c.email = v.email
join public.shipping_methods s on s.code = v.ship_code
order by v.ago desc;  -- ids en orden cronológico

insert into public.order_items (order_id, variant_id, product_name, variant_name, sku, unit_price, quantity, line_total)
select o.id, pv.id, p.name, pv.name, pv.sku, pv.price, v.qty, pv.price * v.qty
from (values
  ('EL-20261009-K7Q2', 'EL-KIO-LED',  1),
  ('EL-20261009-K7Q2', 'EL-REC-FAR6', 1),
  ('EL-20261013-R4D9', 'EL-DRA-LED',  1),
  ('EL-20261013-R4D9', 'EL-ACC-PINT', 1),
  ('EL-20261015-M2X8', 'EL-PAR-SL',   2),
  ('EL-20261017-T9F1', 'EL-HAD-LED',  1)
) as v(num, sku, qty)
join public.orders o on o.order_number = v.num
join public.product_variants pv on pv.sku = v.sku
join public.products p on p.id = pv.product_id;

insert into public.payments (order_id, method, amount, status, transaction_ref, card_last4, failure_reason, created_at)
select o.id, v.method, o.total, v.status, v.ref, v.last4, v.reason, o.created_at + interval '2 minutes'
from (values
  ('EL-20261009-K7Q2', 'tarjeta_simulada', 'aprobado',  'SIM-PAY-0001', '4242', null),
  ('EL-20261013-R4D9', 'tarjeta_simulada', 'aprobado',  'SIM-PAY-0002', '4242', null),
  ('EL-20261015-M2X8', 'bizum_simulado',   'aprobado',  'SIM-PAY-0003', null,   null),
  ('EL-20261017-T9F1', 'tarjeta_simulada', 'rechazado', 'SIM-PAY-0004', '0002', 'Tarjeta de prueba rechazada por el simulador')
) as v(num, method, status, ref, last4, reason)
join public.orders o on o.order_number = v.num;

insert into public.order_status_history (order_id, from_status, to_status, changed_by, note, created_at)
select o.id, v.from_s, v.to_s, v.who, v.note, o.created_at + v.after
from (values
  ('EL-20261009-K7Q2', null,                    'creado',                'sistema',       null,                 interval '0'),
  ('EL-20261009-K7Q2', 'creado',                'pago_simulado',         'sistema',       'Pago SIM-PAY-0001',  interval '2 minutes'),
  ('EL-20261009-K7Q2', 'pago_simulado',         'pendiente_preparacion', 'Admin pruebas', null,                 interval '3 hours'),
  ('EL-20261009-K7Q2', 'pendiente_preparacion', 'enviado',               'Admin pruebas', 'Seguimiento SIM-123', interval '1 day'),
  ('EL-20261009-K7Q2', 'enviado',               'entregado',             'Admin pruebas', null,                 interval '4 days'),
  ('EL-20261013-R4D9', null,                    'creado',                'sistema',       null,                 interval '0'),
  ('EL-20261013-R4D9', 'creado',                'pago_simulado',         'sistema',       'Pago SIM-PAY-0002',  interval '2 minutes'),
  ('EL-20261013-R4D9', 'pago_simulado',         'pendiente_preparacion', 'Admin pruebas', null,                 interval '1 day'),
  ('EL-20261015-M2X8', null,                    'creado',                'sistema',       null,                 interval '0'),
  ('EL-20261015-M2X8', 'creado',                'pago_simulado',         'sistema',       'Pago SIM-PAY-0003',  interval '2 minutes'),
  ('EL-20261015-M2X8', 'pago_simulado',         'pendiente_preparacion', 'Admin pruebas', null,                 interval '5 hours'),
  ('EL-20261015-M2X8', 'pendiente_preparacion', 'enviado',               'Admin pruebas', 'Exprés 24 h',        interval '1 day'),
  ('EL-20261017-T9F1', null,                    'creado',                'sistema',       null,                 interval '0')
) as v(num, from_s, to_s, who, note, after)
join public.orders o on o.order_number = v.num;

-- Eventos coherentes con esos pedidos (embudo de compra)
insert into public.events (event_type, source, occurred_at, session_id, customer_id, order_id, entity_type, entity_id, payload)
select v.type, v.source, o.created_at + v.offs, 'seed-' || o.order_number, o.customer_id,
       case when v.type in ('order.created','payment.simulated','order.status_changed') then o.id end,
       v.entity, case v.entity when 'order' then o.id::text when 'payment' then p.transaction_ref else null end,
       case v.type
         when 'checkout.started'  then jsonb_build_object('subtotal', o.subtotal)
         when 'order.created'     then jsonb_build_object('order_number', o.order_number, 'total', o.total, 'items', (select count(*) from public.order_items i where i.order_id = o.id))
         when 'payment.simulated' then jsonb_build_object('order_number', o.order_number, 'method', p.method, 'status', p.status, 'amount', p.amount)
         else '{}'::jsonb end
from public.orders o
join public.payments p on p.order_id = o.id
cross join (values
  ('checkout.started',  'web',      'checkout', interval '-3 minutes'),
  ('order.created',     'servidor', 'order',    interval '0'),
  ('payment.simulated', 'servidor', 'payment',  interval '2 minutes')
) as v(type, source, entity, offs);

-- Navegación previa: visitas a ficha y productos añadidos al carrito
-- Mismo formato que la web: product.viewed → id del producto + {slug};
-- cart.item_added → id de la VARIANTE (la de por defecto) + {sku, quantity, unit_price}
insert into public.events (event_type, source, occurred_at, session_id, entity_type, entity_id, payload)
select v.type, 'web', now() - v.ago, v.sess, v.entity,
       case when v.type = 'cart.item_added' then pv.id::text else p.id::text end,
       case when v.type = 'cart.item_added'
            then jsonb_build_object('sku', pv.sku, 'unit_price', pv.price) || v.extra
            else jsonb_build_object('slug', p.slug) || v.extra end
from (values
  ('product.viewed',  'callejon-kioto-sakura', 'seed-visita-1', 'product', '{}'::jsonb,                interval '9 days 1 hour'),
  ('cart.item_added', 'callejon-kioto-sakura', 'seed-visita-1', 'cart',    '{"quantity":1}'::jsonb,   interval '9 days 50 minutes'),
  ('product.viewed',  'torre-del-dragon',      'seed-visita-2', 'product', '{}'::jsonb,                interval '5 days 2 hours'),
  ('product.viewed',  'biblioteca-infinita',   'seed-visita-2', 'product', '{}'::jsonb,                interval '5 days 1 hour'),
  ('cart.item_added', 'torre-del-dragon',      'seed-visita-2', 'cart',    '{"quantity":1}'::jsonb,   interval '5 days 30 minutes'),
  ('product.viewed',  'cafeteria-paris-1920',  'seed-visita-3', 'product', '{}'::jsonb,                interval '3 days 1 hour'),
  ('cart.item_added', 'cafeteria-paris-1920',  'seed-visita-3', 'cart',    '{"quantity":2}'::jsonb,   interval '3 days 40 minutes'),
  ('product.viewed',  'bosque-de-las-hadas',   'seed-visita-4', 'product', '{}'::jsonb,                interval '1 day 1 hour'),
  ('cart.item_added', 'bosque-de-las-hadas',   'seed-visita-4', 'cart',    '{"quantity":1}'::jsonb,   interval '1 day 20 minutes'),
  ('product.viewed',  'tienda-ramen-nocturna', 'seed-visita-5', 'product', '{}'::jsonb,                interval '12 hours'),
  ('cart.item_added', 'tienda-ramen-nocturna', 'seed-visita-5', 'cart',    '{"quantity":1}'::jsonb,   interval '11 hours'),  -- carrito abandonado
  ('product.viewed',  'biblioteca-infinita',   'seed-visita-6', 'product', '{}'::jsonb,                interval '6 hours')
) as v(type, slug, sess, entity, extra, ago)
join public.products p on p.slug = v.slug
join public.product_variants pv on pv.product_id = p.id and pv.is_default;

-- ---------- INCIDENCIAS DE SOPORTE DE EJEMPLO ----------
insert into public.support_requests (ticket_number, order_id, customer_email, reason, message, status, created_at)
select v.ticket, o.id, v.email, v.reason, v.msg, v.status, now() - v.ago
from (values
  ('SOP-20261011-3HQK', 'EL-20261009-K7Q2', 'lucia.martin@entrelibros.test', 'pieza_danada',
   'Uno de los farolillos de papel llegó roto. El resto del kit está perfecto.', 'resuelta', interval '7 days'),
  ('SOP-20261016-8WNA', 'EL-20261015-M2X8', 'marta.sanchez@entrelibros.test', 'duda_montaje',
   'No encuentro en las instrucciones dónde va la pieza del toldo (paso 12).', 'en_curso', interval '2 days'),
  ('SOP-20261017-C5RT', null, 'visitante@example.com', 'otro',
   '¿Vendéis los kits ya montados? Me gustaría regalar uno.', 'abierta', interval '20 hours')
) as v(ticket, order_num, email, reason, msg, status, ago)
left join public.orders o on o.order_number = v.order_num;

insert into public.events (event_type, source, occurred_at, order_id, entity_type, entity_id, payload)
select 'support.requested', 'servidor', s.created_at, s.order_id, 'support', s.ticket_number,
       jsonb_build_object('ticket_number', s.ticket_number, 'reason', s.reason,
                          'order_number', (select order_number from public.orders where id = s.order_id))
from public.support_requests s;

-- ---------- ADMIN DEL BACK-OFFICE ----------
-- 1) Authentication > Users > Add user: admin@entrelibros.test + contraseña de prueba
-- 2) Después ejecutar:
-- insert into public.admin_users (user_id, display_name)
-- select id, 'Admin pruebas' from auth.users where email = 'admin@entrelibros.test'
-- on conflict (user_id) do nothing;
