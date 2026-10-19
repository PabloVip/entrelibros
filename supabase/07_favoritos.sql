-- =========================================================
-- Entrelibros · Favoritos (Nino)
-- Ejecutar DESPUÉS de 03_functions.sql. Se puede ejecutar varias veces.
--
-- La lista de favoritos se guarda en el navegador (localStorage), como el
-- carrito, así que no hace falta ninguna tabla. Este fichero solo añade
-- wishlist.item_added a la lista blanca de log_event, para que la web pueda
-- registrar qué productos se guardan en favoritos.
--
-- Sustituye la log_event de 03_functions.sql: misma firma y mismas
-- validaciones, con un tipo de evento más.
-- =========================================================

create or replace function public.log_event(
  p_event_type  text,
  p_session_id  text,
  p_entity_type text  default null,
  p_entity_id   text  default null,
  p_payload     jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if p_event_type not in ('product.viewed', 'cart.item_added', 'checkout.started', 'wishlist.item_added') then
    raise exception 'Tipo de evento no permitido desde el cliente: %', p_event_type
      using errcode = '22023';
  end if;
  if p_session_id is null or length(p_session_id) not between 8 and 64 then
    raise exception 'session_id no válido' using errcode = '22023';
  end if;
  if pg_column_size(coalesce(p_payload, '{}'::jsonb)) > 4096 then
    raise exception 'payload demasiado grande' using errcode = '22023';
  end if;

  return public._emit_event(p_event_type, 'web', p_session_id, p_entity_type, p_entity_id, p_payload);
end $$;

grant execute on function public.log_event(text, text, text, text, jsonb) to anon, authenticated;
