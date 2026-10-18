import { signIn, getUser, isAdmin } from '../../core/auth.js';

const form = document.getElementById('login');
const msg  = document.getElementById('login-msg');

// Si ya hay sesión de administrador, directo a pedidos
if ((await getUser()) && (await isAdmin())) location.replace('admin-pedidos.html');

form.addEventListener('submit', async e => {
  e.preventDefault();
  msg.textContent = '';
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!form.email.checkValidity() || password.length < 6) {
    msg.textContent = 'Introduce un email válido y la contraseña (mínimo 6 caracteres).';
    return;
  }
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    await signIn(email, password);
    location.replace('admin-pedidos.html');
  } catch (err) {
    msg.textContent = err.message === 'Invalid login credentials'
      ? 'Email o contraseña incorrectos.'
      : err.message;
  } finally {
    btn.disabled = false;
  }
});
