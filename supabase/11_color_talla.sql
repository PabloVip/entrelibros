-- =========================================================
-- Entrelibros · Producto de ejemplo con variantes por COLOR y TAMAÑO (Pablo)
-- Ejecutar DESPUÉS de 08_admin_catalogo.sql (que añade las columnas color, color_hex, size…).
-- Se puede ejecutar varias veces: si el producto ya existe, no se toca.
--
-- "Sujetalibros de madera": 3 acabados × 3 tamaños = 9 variantes, cada una con su SKU,
-- precio y stock (Negro grande sin stock, para ver cómo se marca en la ficha).
-- Cada acabado tiene su foto (product_images.color).
-- =========================================================

do $$
declare
  v_id bigint;
begin
  if exists (select 1 from public.products where slug = 'sujetalibros-de-madera') then
    raise notice 'El producto de ejemplo ya existe: no se cambia nada';
    return;
  end if;

  insert into public.products (slug, name, theme_id, product_type, difficulty, width_mm, height_mm, depth_mm,
      pieces_count, build_time_hours, short_description, description, is_active,
      name_en, short_description_en, description_en)
  values ('sujetalibros-de-madera', 'Sujetalibros de madera', null, 'accesorio', null, 120, 150, 90, 2, null,
      'Pareja de sujetalibros para enmarcar tu book nook en la estantería. En tres acabados y tres alturas.',
      'Dos sujetalibros en forma de L de madera de abedul con base antideslizante. Sujetan los libros a los lados '
      || 'de la escena para que el conjunto quede firme y alineado. Elige el acabado que mejor combine con tu '
      || 'estantería y la altura según el tamaño de tus libros: pequeño (15 cm) para bolsillo, mediano (20 cm) '
      || 'para novela y grande (25 cm) para libros ilustrados.',
      true,
      'Wooden bookends',
      'A pair of bookends to frame your book nook on the shelf. In three finishes and three heights.',
      'Two L-shaped birch wood bookends with a non-slip base. They hold the books on both sides of the scene so '
      || 'everything stays steady and aligned. Choose the finish that suits your shelf and the height for your books: '
      || 'small (15 cm) for paperbacks, medium (20 cm) for novels and large (25 cm) for illustrated books.')
  returning id into v_id;

  insert into public.product_variants (product_id, sku, name, name_en, has_lighting, price, stock, is_default, is_active,
                                       color, color_en, color_hex, size, size_en)
  select v_id, x.sku, x.color || ' · ' || x.size, x.color_en || ' · ' || x.size_en, false, x.price, x.stock,
         x.sku = 'EL-SUJ-NAT-M', true, x.color, x.color_en, x.hex, x.size, x.size_en
  from (values
    ('EL-SUJ-NAT-S', 'Natural', 'Natural', '#d9b48a', 'Pequeño (15 cm)', 'Small (15 cm)',  14.90, 25),
    ('EL-SUJ-NAT-M', 'Natural', 'Natural', '#d9b48a', 'Mediano (20 cm)', 'Medium (20 cm)', 17.90, 30),
    ('EL-SUJ-NAT-L', 'Natural', 'Natural', '#d9b48a', 'Grande (25 cm)',  'Large (25 cm)',  21.90, 12),
    ('EL-SUJ-NOG-S', 'Nogal',   'Walnut',  '#6b4428', 'Pequeño (15 cm)', 'Small (15 cm)',  15.90, 18),
    ('EL-SUJ-NOG-M', 'Nogal',   'Walnut',  '#6b4428', 'Mediano (20 cm)', 'Medium (20 cm)', 18.90, 4),
    ('EL-SUJ-NOG-L', 'Nogal',   'Walnut',  '#6b4428', 'Grande (25 cm)',  'Large (25 cm)',  22.90, 9),
    ('EL-SUJ-NEG-S', 'Negro',   'Black',   '#26262b', 'Pequeño (15 cm)', 'Small (15 cm)',  15.90, 14),
    ('EL-SUJ-NEG-M', 'Negro',   'Black',   '#26262b', 'Mediano (20 cm)', 'Medium (20 cm)', 18.90, 7),
    ('EL-SUJ-NEG-L', 'Negro',   'Black',   '#26262b', 'Grande (25 cm)',  'Large (25 cm)',  22.90, 0)
  ) as x(sku, color, color_en, hex, size, size_en, price, stock);

  insert into public.product_images (product_id, url, alt_text, sort_order, color) values
    (v_id, 'img/productos/sujetalibros-natural.jpg', 'Sujetalibros de madera natural sujetando una fila de libros', 0, 'Natural'),
    (v_id, 'img/productos/sujetalibros-nogal.jpg',   'Sujetalibros en color nogal sujetando una fila de libros',    1, 'Nogal'),
    (v_id, 'img/productos/sujetalibros-negro.jpg',   'Sujetalibros negros sujetando una fila de libros',            2, 'Negro');

  perform public._emit_event('product.created', 'backoffice', null, 'product', v_id::text,
    jsonb_build_object('slug', 'sujetalibros-de-madera', 'name', 'Sujetalibros de madera', 'active', true,
                       'variants', 9, 'by', 'datos de ejemplo'));
end $$;
