// Aviso flotante breve ("Producto guardado"). role=status: los lectores de pantalla lo leen.
let current;

export function toast(text, type = 'ok', ms = 3500) {
  current?.remove();
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = text;
  document.body.append(el);
  current = el;
  setTimeout(() => { if (current === el) { el.remove(); current = null; } }, ms);
}

/** Mensaje legible de un error de Supabase (los de las funciones ya vienen en español). */
export function errorText(err, fallback = 'No se ha podido guardar. Inténtalo de nuevo.') {
  if (err?.code === 'PGRST202') return 'Falta ejecutar 08_admin_catalogo.sql en Supabase.';
  if (err?.code === '42501' || /permission denied/i.test(err?.message ?? '')) return 'Tu sesión no tiene permisos de administración.';
  return err?.message && !/fetch|network/i.test(err.message) ? err.message : fallback;
}
