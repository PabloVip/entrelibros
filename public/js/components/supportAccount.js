// Soporte con cuenta (mismo patrón que checkoutAccount.js): si hay sesión, rellena el email de la cuenta
// y ofrece los números de tus pedidos en el campo "Número de pedido". Si no, invita a entrar.
import { getUser, getMyCustomer, listMyOrders } from '../services/accountService.js';
import { escapeHtml, money, formatDate } from '../core/utils.js';

export async function prefillSupport(form) {
  if (!form) return;
  let user = null;
  try { user = await getUser(); } catch { /* sin sesión */ }

  if (!user) {
    form.insertAdjacentHTML('afterbegin', `
      <p class="note small account-hint">¿Tienes cuenta? <a href="cuenta.html?volver=soporte.html">Entra</a>
        y podrás elegir el pedido de tu lista.</p>`);
    return;
  }

  const customer = await getMyCustomer().catch(() => null);
  const email = form.elements.email;
  // si el email ya viene relleno (enlace desde la confirmación del pedido) no se cambia
  if (email && !email.value) {
    email.value = customer?.email ?? user.email;
    email.insertAdjacentHTML('afterend', '<p class="hint">Es el email de tu cuenta.</p>');
  }

  // <datalist>: el navegador muestra los pedidos como sugerencias al pulsar en el campo,
  // pero se puede seguir escribiendo cualquier número (p. ej. un pedido hecho sin cuenta)
  const orders = await listMyOrders(customer).catch(() => []);
  const input = form.elements.orderNumber;
  if (!orders.length || !input) return;
  input.setAttribute('list', 'my-orders');
  input.insertAdjacentHTML('afterend', `
    <datalist id="my-orders">${orders.map(o => `
      <option value="${escapeHtml(o.order_number)}">${escapeHtml(formatDate(o.created_at))} · ${money(o.total)}</option>`).join('')}
    </datalist>`);
  document.getElementById('hint-order')?.insertAdjacentHTML('beforebegin',
    '<small class="muted">Tus pedidos aparecen al pulsar en el campo.</small>');
}
