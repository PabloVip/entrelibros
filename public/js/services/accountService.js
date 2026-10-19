// Cuentas de cliente con Supabase Auth: registro, inicio de sesión, recuperar contraseña y perfil.
// Los correos (confirmar la cuenta, cambiar la contraseña) los envía Supabase.
// La ficha de cliente se crea en el servidor al registrarse (supabase/09_cuentas_clientes.sql).
import { supabase } from '../core/supabase.js';

export const PASSWORD_MIN = 8;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const PHONE_RE = /^[0-9 +()-]{6,20}$/;

/** Dirección absoluta de una página de la web (sirve igual en GitHub Pages y en local). */
export function pageUrl(page) {
  return new URL(page, location.href).href;
}

/** Solo se vuelve a páginas propias: evita redirecciones abiertas con ?volver=https://… */
export function safeReturn(value) {
  return /^[a-z-]+\.html(\?[\w=&%.-]*)?$/.test(value ?? '') ? value : null;
}

export async function getUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Ficha de cliente de la sesión (null si no hay sesión o el email no está confirmado). */
export async function getMyCustomer() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('customers')
    .select('id, email, full_name, phone, created_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

export async function signUp({ fullName, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },                       // lo lee el trigger para crear la ficha
      emailRedirectTo: pageUrl('cuenta.html?confirmado=1'), // a dónde lleva el enlace del correo
    },
  });
  if (error) throw error;
  // Si el email ya tenía cuenta, Supabase no da error (para no revelar quién está registrado)
  // pero devuelve el usuario sin identidades.
  return { user: data.user, session: data.session, alreadyRegistered: data.user?.identities?.length === 0 };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function resendConfirmation(email) {
  const { error } = await supabase.auth.resend({
    type: 'signup', email, options: { emailRedirectTo: pageUrl('cuenta.html?confirmado=1') },
  });
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: pageUrl('cuenta.html?recuperar=1') });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function updateProfile(fullName, phone) {
  const { error } = await supabase.rpc('update_my_profile', { p_full_name: fullName, p_phone: phone || null });
  if (error) throw error;
}

// Se filtra por el cliente aunque RLS ya lo limite: un administrador puede leerlo todo
// y en "Mi cuenta" solo deben salir sus propios pedidos.
export async function listMyOrders(customer) {
  if (!customer) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, total, created_at, items:order_items ( quantity, product_name )')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function listMySupportRequests(customer) {
  if (!customer) return [];
  const { data, error } = await supabase
    .from('support_requests')
    .select('ticket_number, reason, status, created_at')
    .eq('customer_email', customer.email)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}

/** Mensaje en español para los errores de Supabase Auth. */
export function authErrorText(err) {
  const code = err?.code ?? '';
  const msg = err?.message ?? '';
  const byCode = {
    invalid_credentials: 'Email o contraseña incorrectos.',
    email_not_confirmed: 'Todavía no has confirmado tu email. Abre el enlace del correo que te enviamos (o pide otro).',
    user_already_exists: 'Ya existe una cuenta con ese email. Inicia sesión o recupera la contraseña.',
    email_exists: 'Ya existe una cuenta con ese email. Inicia sesión o recupera la contraseña.',
    weak_password: `La contraseña es demasiado débil: usa al menos ${PASSWORD_MIN} caracteres, con letras y números.`,
    same_password: 'La contraseña nueva tiene que ser distinta de la actual.',
    over_email_send_rate_limit: 'Se han enviado demasiados correos. Espera unos minutos y vuelve a intentarlo.',
    over_request_rate_limit: 'Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.',
    email_address_not_authorized: 'Ahora mismo la tienda no puede enviar correos a esa dirección (servidor de correo de pruebas de Supabase).',
    email_address_invalid: 'Ese email no es válido.',
    signup_disabled: 'El registro de cuentas está desactivado.',
    validation_failed: 'Revisa el email y la contraseña.',
  };
  if (byCode[code]) return byCode[code];
  if (/Invalid login credentials/i.test(msg)) return byCode.invalid_credentials;
  if (/Email not confirmed/i.test(msg)) return byCode.email_not_confirmed;
  if (/already registered/i.test(msg)) return byCode.user_already_exists;
  if (/rate limit|only request this after/i.test(msg)) return byCode.over_email_send_rate_limit;
  if (/not authorized/i.test(msg)) return byCode.email_address_not_authorized;
  if (/Password should be/i.test(msg)) return byCode.weak_password;
  if (/different from the old/i.test(msg)) return byCode.same_password;
  if (/fetch|network/i.test(msg)) return 'No se ha podido conectar. Revisa tu conexión e inténtalo de nuevo.';
  return msg || 'Algo ha fallado. Inténtalo de nuevo.';
}
