-- =========================================================
-- Entrelibros · Back-office de soporte postventa (Pablo)
-- Ejecutar DESPUÉS de 01 → 05. Se puede ejecutar varias veces.
-- La lectura de incidencias por administradores ya existe
-- (política "admin lee soporte" en 02_policies.sql).
-- =========================================================

-- Cambio de estado de una incidencia: abierta → en_curso → resuelta (y reabrir)
create or replace function public.admin_update_support_status(
  p_id         bigint,
  p_new_status text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_current text;
  v_ticket  text;
  v_order   bigint;
  v_admin   text;
  v_allowed text[];
begin
  if not public.is_admin() then
    raise exception 'Solo administradores' using errcode = '42501';
  end if;

  select status, ticket_number, order_id into v_current, v_ticket, v_order
  from public.support_requests where id = p_id for update;
  if not found then
    raise exception 'Incidencia % no encontrada', p_id using errcode = 'P0002';
  end if;

  v_allowed := case v_current
    when 'abierta'  then array['en_curso', 'resuelta']
    when 'en_curso' then array['resuelta', 'abierta']
    when 'resuelta' then array['abierta']          -- reabrir
    else array[]::text[]
  end;
  if not (p_new_status = any (v_allowed)) then
    raise exception 'Transición no permitida: % → %', v_current, p_new_status using errcode = '22023';
  end if;

  select display_name into v_admin from public.admin_users where user_id = auth.uid();

  update public.support_requests set status = p_new_status where id = p_id;

  perform public._emit_event('support.status_changed', 'backoffice', null, 'support', v_ticket,
    jsonb_build_object('ticket_number', v_ticket, 'from', v_current, 'to', p_new_status, 'by', v_admin),
    v_order);

  return p_new_status;
end $$;

revoke execute on function public.admin_update_support_status(bigint, text) from public, anon;
grant  execute on function public.admin_update_support_status(bigint, text) to authenticated;
