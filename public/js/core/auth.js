// Autenticación del back-office (Supabase Auth). La tienda no requiere login.
import { supabase } from './supabase.js';

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!(await isAdmin())) {
    await supabase.auth.signOut();
    throw new Error('Este usuario no tiene permisos de administración.');
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Lo decide el servidor (tabla admin_users), no el navegador. */
export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

/** Protege una página del back-office: si no hay admin, vuelve al login. */
export async function requireAdmin() {
  const user = await getUser();
  if (!user || !(await isAdmin())) {
    location.replace('admin.html');
    return new Promise(() => {}); // detiene la carga de la página
  }
  return user;
}
