// Checkout con cuenta: si hay sesión, rellena nombre, email y teléfono con los datos del cliente
// y fija el email (el pedido queda en "Mis pedidos"). Si no, invita a entrar.
import { getUser, getMyCustomer } from '../services/accountService.js';

export async function prefillCheckout(form) {
  if (!form) return;
  const section = form.querySelector('fieldset');
  let user = null;
  try { user = await getUser(); } catch { /* sin sesión */ }

  if (!user) {
    section?.insertAdjacentHTML('afterbegin', `
      <p class="note small account-hint">¿Tienes cuenta? <a href="cuenta.html?volver=checkout.html">Entra</a>
        y rellenamos tus datos; el pedido quedará guardado en "Mi cuenta".</p>`);
    return;
  }
  const customer = await getMyCustomer().catch(() => null);
  const set = (name, value) => {
    const input = form.elements[name];
    if (input && value && !input.value) input.value = value;
  };
  set('full_name', customer?.full_name ?? user.user_metadata?.full_name);
  set('phone', customer?.phone);
  const email = form.elements.email;
  if (email) {
    email.value = user.email;
    email.readOnly = true;
    email.insertAdjacentHTML('afterend',
      '<p class="hint">Es el email de tu cuenta: el pedido aparecerá en "Mi cuenta".</p>');
  }
}
