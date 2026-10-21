// Mi cuenta: entrar, crear cuenta (con correo de confirmación), recuperar la contraseña
// y, con sesión, ver pedidos e incidencias y editar los datos.
//
// cuenta.html                      → entrar / crear cuenta, o el área de cliente si hay sesión
// cuenta.html?confirmado=1         → vuelta desde el correo de confirmación
// cuenta.html?recuperar=1          → vuelta desde el correo de "cambiar contraseña"
// cuenta.html?volver=checkout.html → tras entrar, vuelve a esa página
import { renderLayout } from '../core/layout.js';
import {
  PASSWORD_MIN, EMAIL_RE, PHONE_RE, safeReturn, getUser, getMyCustomer, isAdmin, signUp, signIn, signOut,
  resendConfirmation, sendPasswordReset, updatePassword, updateProfile, listMyOrders, listMySupportRequests,
  onAuthChange, authErrorText, signInWithGoogle, usesOnlyGoogle,
} from '../services/accountService.js';
import { REASONS } from '../services/supportService.js';
import { statusBadge } from '../components/statusBadge.js';
import { supportBadge } from '../components/supportBadge.js';
import { toast } from '../components/toast.js';
import { escapeHtml, money, formatDate } from '../core/utils.js';
import { INVOICE_STATUSES } from '../services/invoiceService.js';

renderLayout();

const root = document.getElementById('account');
const params = new URLSearchParams(window.__authSearch ?? location.search);
const hash = new URLSearchParams((window.__authHash ?? '').replace(/^#/, ''));
const returnTo = safeReturn(params.get('volver'));
let recovering = params.has('recuperar') || hash.get('type') === 'recovery';


function say(form, text, type = 'error') {
  const msg = form.querySelector('.form-msg');
  msg.textContent = text;
  msg.className = `form-msg ${type}`;
}
function fieldError(form, name, text) {
  const input = form.elements[name];
  const p = form.querySelector(`#err-${form.id}-${name}`);
  input?.classList.toggle('invalid', !!text);
  input?.setAttribute('aria-invalid', text ? 'true' : 'false');
  if (p) p.textContent = text ?? '';
  return !text;
}
function field(formId, name, label, attrs, hint = '') {
  return `
    <div class="field">
      <label for="${formId}-${name}">${label}</label>
      <input id="${formId}-${name}" name="${name}" ${attrs} aria-describedby="err-${formId}-${name}">
      ${hint ? `<p class="hint">${hint}</p>` : ''}
      <p id="err-${formId}-${name}" class="field-error"></p>
    </div>`;
}
const passwordProblem = pw =>
  pw.length < PASSWORD_MIN || !/[A-Za-zÀ-ÿ]/.test(pw) || !/[0-9]/.test(pw)
    ? `Al menos ${PASSWORD_MIN} caracteres, con letras y números.` : null;
const showPasswords = `
  <label class="show-pw"><input type="checkbox" data-show-pw> Mostrar contraseña</label>`;


const googleButton = label => `
  <button type="button" class="btn btn-plain btn-google" data-google>${label}</button>
  <p class="or-line"><span>o con tu email</span></p>`;

// ---------- Sin sesión ----------
function renderGuest(notice) {
  root.removeAttribute('aria-busy');
  document.title = 'Mi cuenta · Entrelibros';
  root.innerHTML = `
    <h1>Mi cuenta</h1>
    ${notice ? `<p class="note account-notice" role="status">${notice}</p>` : ''}
    <div class="auth-grid">
      <form id="login" class="card-form" novalidate>
        <h2 class="h3">Entrar</h2>
        ${googleButton('Continuar con Google')}
        ${field('login', 'email', 'Email', 'type="email" autocomplete="email" required maxlength="254"')}
        ${field('login', 'password', 'Contraseña', 'type="password" autocomplete="current-password" required')}
        ${showPasswords}
        <button type="submit" class="btn">Entrar</button>
        <p class="form-msg" role="alert"></p>
        <p><button type="button" class="link-btn" data-go="forgot">¿Has olvidado la contraseña?</button></p>
      </form>

      <form id="register" class="card-form" novalidate>
        <h2 class="h3">Crear cuenta</h2>
        <p class="muted small">Con una cuenta ves todos tus pedidos y el checkout se rellena solo.
          Te enviaremos un correo para confirmar el email.</p>
        ${googleButton('Registrarse con Google')}
        ${field('register', 'full_name', 'Nombre y apellidos', 'type="text" autocomplete="name" required maxlength="100"')}
        ${field('register', 'email', 'Email', 'type="email" autocomplete="email" required maxlength="254"',
          'Si ya compraste como invitado con este email, verás también esos pedidos.')}
        ${field('register', 'password', 'Contraseña', `type="password" autocomplete="new-password" required minlength="${PASSWORD_MIN}"`,
          `Al menos ${PASSWORD_MIN} caracteres, con letras y números.`)}
        ${showPasswords}
        <label class="check-line"><input type="checkbox" name="terms" required>
          <span>Entiendo que es una tienda ficticia y uso un email de prueba o mío, sin datos reales de pago.</span></label>
        <p id="err-register-terms" class="field-error"></p>
        <button type="submit" class="btn">Crear cuenta</button>
        <p class="muted small">Más información en la <a href="privacidad.html">política de privacidad</a>.</p>
        <p class="form-msg" role="alert"></p>
      </form>
    </div>`;

  const login = document.getElementById('login');
  login.addEventListener('submit', async e => {
    e.preventDefault();
    const email = login.email.value.trim().toLowerCase();
    const ok = fieldError(login, 'email', EMAIL_RE.test(email) ? null : 'Escribe un email válido.')
             & fieldError(login, 'password', login.password.value ? null : 'Escribe la contraseña.');
    if (!ok) return;
    const btn = login.querySelector('button[type=submit]');
    btn.disabled = true;
    say(login, 'Entrando…', '');
    try {
      await signIn(email, login.password.value);
      if (returnTo) return location.assign(returnTo);
      await renderAccount();
      toast('Has iniciado sesión.');
    } catch (err) {
      console.error(err);
      say(login, authErrorText(err));
      if (err?.code === 'email_not_confirmed' || /not confirmed/i.test(err?.message ?? '')) {
        login.querySelector('.form-msg').insertAdjacentHTML('beforeend',
          ` <button type="button" class="link-btn" data-resend="${escapeHtml(email)}">Reenviar el correo</button>`);
      }
      btn.disabled = false;
    }
  });

  const reg = document.getElementById('register');
  reg.addEventListener('submit', async e => {
    e.preventDefault();
    const name = reg.full_name.value.trim();
    const email = reg.email.value.trim().toLowerCase();
    const pw = reg.password.value;
    const ok = fieldError(reg, 'full_name', name.length >= 2 && name.length <= 100 ? null : 'Escribe tu nombre (entre 2 y 100 caracteres).')
             & fieldError(reg, 'email', EMAIL_RE.test(email) ? null : 'Escribe un email válido.')
             & fieldError(reg, 'password', passwordProblem(pw))
             & fieldError(reg, 'terms', reg.terms.checked ? null : 'Marca la casilla para continuar.');
    if (!ok) { say(reg, 'Revisa los campos marcados.'); return; }
    const btn = reg.querySelector('button[type=submit]');
    btn.disabled = true;
    say(reg, 'Creando la cuenta…', '');
    try {
      const res = await signUp({ fullName: name, email, password: pw });
      if (res.alreadyRegistered) {
        say(reg, 'Ya existe una cuenta con ese email. Inicia sesión o recupera la contraseña.');
        btn.disabled = false;
        return;
      }
      if (res.session) { // si en Supabase está desactivada la confirmación por email
        await renderAccount();
        toast('Cuenta creada. ¡Bienvenido!');
        return;
      }
      renderCheckEmail(email);
    } catch (err) {
      console.error(err);
      say(reg, authErrorText(err));
      btn.disabled = false;
    }
  });
}

function renderCheckEmail(email) {
  root.innerHTML = `
    <div class="narrow-md">
      <h1>Revisa tu correo</h1>
      <div class="card-form">
        <p>Te hemos enviado un correo a <strong>${escapeHtml(email)}</strong> con un enlace para confirmar la cuenta.</p>
        <p class="muted small">Ábrelo desde este mismo dispositivo. Si no lo ves en unos minutos, mira en la carpeta de spam.</p>
        <p class="row-actions">
          <button type="button" class="btn btn-secondary" data-resend="${escapeHtml(email)}">Reenviar el correo</button>
          <button type="button" class="btn btn-plain" data-go="guest">Volver</button>
        </p>
        <p class="form-msg" role="status"></p>
      </div>
    </div>`;
}

function renderForgot() {
  root.innerHTML = `
    <div class="narrow-md">
      <h1>Recuperar la contraseña</h1>
      <form id="forgot" class="card-form" novalidate>
        <p class="muted">Escribe el email de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.</p>
        ${field('forgot', 'email', 'Email', 'type="email" autocomplete="email" required maxlength="254"')}
        <button type="submit" class="btn">Enviar el enlace</button>
        <p class="form-msg" role="alert"></p>
        <p><button type="button" class="link-btn" data-go="guest">← Volver a entrar</button></p>
      </form>
    </div>`;
  const form = document.getElementById('forgot');
  form.email.focus();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    if (!fieldError(form, 'email', EMAIL_RE.test(email) ? null : 'Escribe un email válido.')) return;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await sendPasswordReset(email);
      // mismo mensaje exista o no la cuenta: no se revela quién está registrado
      say(form, 'Si hay una cuenta con ese email, te llegará un correo con el enlace en unos minutos.', 'ok');
    } catch (err) {
      console.error(err);
      say(form, authErrorText(err));
      btn.disabled = false;
    }
  });
}

function renderNewPassword() {
  root.removeAttribute('aria-busy');
  root.innerHTML = `
    <div class="narrow-md">
      <h1>Elige una contraseña nueva</h1>
      <form id="newpw" class="card-form" novalidate>
        ${field('newpw', 'password', 'Contraseña nueva', `type="password" autocomplete="new-password" required minlength="${PASSWORD_MIN}"`,
          `Al menos ${PASSWORD_MIN} caracteres, con letras y números.`)}
        ${field('newpw', 'repeat', 'Repite la contraseña', 'type="password" autocomplete="new-password" required')}
        ${showPasswords}
        <button type="submit" class="btn">Guardar contraseña</button>
        <p class="form-msg" role="alert"></p>
      </form>
    </div>`;
  const form = document.getElementById('newpw');
  form.password.focus();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const pw = form.password.value;
    const ok = fieldError(form, 'password', passwordProblem(pw))
             & fieldError(form, 'repeat', form.repeat.value === pw ? null : 'Las contraseñas no coinciden.');
    if (!ok) return;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await updatePassword(pw);
      recovering = false;
      await renderAccount();
      toast('Contraseña cambiada. Ya has iniciado sesión.');
    } catch (err) {
      console.error(err);
      say(form, authErrorText(err));
      btn.disabled = false;
    }
  });
}

// ---------- Con sesión ----------
async function renderAccount() {
  const user = await getUser();
  if (!user) return renderGuest();
  const [customer, admin] = await Promise.all([getMyCustomer().catch(() => null), isAdmin()]);
  const [orders, tickets] = await Promise.all([
    listMyOrders(customer).catch(() => []), listMySupportRequests(customer).catch(() => []),
  ]);
  const name = customer?.full_name ?? user.user_metadata?.full_name ?? '';
  const email = user.email;
  root.removeAttribute('aria-busy');
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${name ? `Hola, ${escapeHtml(name.split(' ')[0])}` : 'Mi cuenta'}</h1>
        <p class="lead">${escapeHtml(email)}</p>
      </div>
      <div class="page-actions">
        ${admin ? '<a class="btn btn-plain" href="admin-panel.html">Ir al back-office</a>' : ''}
        <button type="button" class="btn btn-secondary" id="logout">Cerrar sesión</button>
      </div>
    </div>

    <div class="account-grid">
      <section class="panel">
        <h2 class="h3">Mis pedidos</h2>
        ${orders.length ? `
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Pedido</th><th>Fecha</th><th class="num">Artículos</th><th class="num">Total</th><th>Estado</th><th><span class="visually-hidden">Ver</span></th></tr></thead>
            <tbody>${orders.map(o => `
              <tr>
                <td><strong>${escapeHtml(o.order_number)}</strong><br><small>${escapeHtml(o.items.map(i => i.product_name).slice(0, 2).join(', '))}${o.items.length > 2 ? '…' : ''}</small></td>
                <td>${formatDate(o.created_at)}</td>
                <td class="num">${o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                <td class="num">${money(o.total)}</td>
                <td>${statusBadge(o.status)}</td>
                <td><a class="btn btn-small btn-plain" href="pedido.html?pedido=${encodeURIComponent(o.order_number)}&email=${encodeURIComponent(email)}">Ver</a>
                  ${o.status === 'creado' ? `<a class="btn btn-small" href="pago.html?pedido=${encodeURIComponent(o.order_number)}">Pagar</a>` : ''}
                  ${INVOICE_STATUSES.includes(o.status) ? `<a class="btn btn-small btn-plain" href="pedido.html?pedido=${encodeURIComponent(o.order_number)}&email=${encodeURIComponent(email)}&factura=1">Factura</a>` : ''}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>`
        : `<p class="empty">Todavía no has hecho ningún pedido.</p><p><a class="btn" href="catalogo.html">Ver el catálogo</a></p>`}

        <h2 class="h3" style="margin-top:28px">Mis incidencias</h2>
        ${tickets.length ? `
          <ul class="plain">${tickets.map(t => `
            <li>${supportBadge(t.status)} <strong>${escapeHtml(t.ticket_number)}</strong> · ${escapeHtml(REASONS[t.reason] ?? t.reason)}
              <small class="muted">· ${formatDate(t.created_at)}</small></li>`).join('')}</ul>`
        : '<p class="muted">No has abierto ninguna incidencia.</p>'}
        <p><a href="soporte.html">Abrir una incidencia</a></p>
      </section>

      <div class="stack-lg">
        <form id="profile" class="card-form" novalidate>
          <h2 class="h3">Mis datos</h2>
          ${customer ? '' : '<p class="note small">Completa tus datos para terminar de crear tu ficha de cliente.</p>'}
          ${field('profile', 'full_name', 'Nombre y apellidos', `type="text" autocomplete="name" required maxlength="100" value="${escapeHtml(name)}"`)}
          ${field('profile', 'phone', 'Teléfono <span class="muted">(opcional)</span>', `type="tel" autocomplete="tel" maxlength="20" value="${escapeHtml(customer?.phone ?? '')}"`)}
          <div class="field"><label for="profile-email">Email</label>
            <input id="profile-email" type="email" value="${escapeHtml(email)}" readonly aria-describedby="profile-email-hint">
            <p class="hint" id="profile-email-hint">Es tu usuario y el email de tus pedidos.</p></div>
          <button type="submit" class="btn">Guardar datos</button>
          <p class="form-msg" role="alert"></p>
          ${customer ? `<p class="muted small">Cliente desde ${formatDate(customer.created_at)}</p>` : ''}
        </form>

        ${usesOnlyGoogle(user) ? `
        <div class="card-form">
          <h2 class="h3">Acceso con Google</h2>
          <p class="muted">Entras con tu cuenta de Google, así que no tienes contraseña en la tienda.
            Si quieres una, usa "¿Has olvidado la contraseña?" al entrar con tu email.</p>
        </div>` : `
        <form id="password" class="card-form" novalidate>
          <h2 class="h3">Cambiar la contraseña</h2>
          ${field('password', 'password', 'Contraseña nueva', `type="password" autocomplete="new-password" required minlength="${PASSWORD_MIN}"`)}
          ${field('password', 'repeat', 'Repite la contraseña', 'type="password" autocomplete="new-password" required')}
          ${showPasswords}
          <button type="submit" class="btn btn-secondary">Cambiar contraseña</button>
          <p class="form-msg" role="alert"></p>
        </form>`}
      </div>
    </div>`;

  document.getElementById('logout').addEventListener('click', async () => {
    await signOut();
    renderGuest('Has cerrado la sesión.');
  });

  const profile = document.getElementById('profile');
  profile.addEventListener('submit', async e => {
    e.preventDefault();
    const n = profile.full_name.value.trim();
    const phone = profile.phone.value.trim();
    const ok = fieldError(profile, 'full_name', n.length >= 2 && n.length <= 100 ? null : 'Escribe tu nombre (entre 2 y 100 caracteres).')
             & fieldError(profile, 'phone', !phone || PHONE_RE.test(phone) ? null : 'El teléfono solo puede llevar números, espacios y + ( ) -.');
    if (!ok) return;
    const btn = profile.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await updateProfile(n, phone);
      toast('Datos guardados.');
      await renderAccount();
    } catch (err) {
      console.error(err);
      say(profile, authErrorText(err));
      btn.disabled = false;
    }
  });

  const pwForm = document.getElementById('password');
  pwForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const pw = pwForm.password.value;
    const ok = fieldError(pwForm, 'password', passwordProblem(pw))
             & fieldError(pwForm, 'repeat', pwForm.repeat.value === pw ? null : 'Las contraseñas no coinciden.');
    if (!ok) return;
    const btn = pwForm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await updatePassword(pw);
      pwForm.reset();
      say(pwForm, 'Contraseña cambiada.', 'ok');
    } catch (err) {
      console.error(err);
      say(pwForm, authErrorText(err));
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Botones comunes ----------
root.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.google !== undefined) {
    b.disabled = true;
    try {
      await signInWithGoogle(returnTo); // el navegador se va a Google
    } catch (err) {
      console.error(err);
      const msg = b.closest('form')?.querySelector('.form-msg');
      if (msg) { msg.textContent = authErrorText(err); msg.className = 'form-msg error'; }
      b.disabled = false;
    }
    return;
  }
  if (b.dataset.go === 'forgot') renderForgot();
  if (b.dataset.go === 'guest') renderGuest();
  if (b.dataset.resend) {
    const msg = b.closest('form, .card-form')?.querySelector('.form-msg');
    b.disabled = true;
    try {
      await resendConfirmation(b.dataset.resend);
      if (msg) { msg.textContent = 'Correo reenviado. Revisa tu bandeja de entrada.'; msg.className = 'form-msg ok'; }
    } catch (err) {
      if (msg) { msg.textContent = authErrorText(err); msg.className = 'form-msg error'; }
      b.disabled = false;
    }
  }
});
root.addEventListener('change', e => {
  if (!e.target.matches('[data-show-pw]')) return;
  e.target.closest('form').querySelectorAll('input[type=password], input[data-pw]').forEach(i => {
    i.dataset.pw = '1';
    i.type = e.target.checked ? 'text' : 'password';
  });
});

// ---------- Arranque ----------
// El enlace del correo de "cambiar contraseña" abre una sesión temporal: Supabase avisa con PASSWORD_RECOVERY
onAuthChange(event => {
  if (event === 'PASSWORD_RECOVERY') { recovering = true; renderNewPassword(); }
});

// los errores del enlace del correo o de Google pueden venir en el # o en la ?query
const errSource = hash.get('error') ? hash : params;
const linkError = errSource.get('error_description') || errSource.get('error');
const user = await getUser(); // espera a que Supabase lea la sesión que trae el enlace del correo
// después se limpia la URL (sin tokens ni avisos) para que recargar no repita nada
history.replaceState(null, '', returnTo ? `?volver=${encodeURIComponent(returnTo)}` : location.pathname);
if (linkError) {
  renderGuest(params.has('google')
    ? 'No se ha podido entrar con Google (¿cancelaste el acceso?). Inténtalo de nuevo o entra con tu email.'
    : errSource.get('error_code') === 'otp_expired'
    ? 'El enlace ha caducado o ya se ha usado. Pide otro: entra con tu email para reenviar la confirmación, o usa "¿Has olvidado la contraseña?".'
    : 'No se ha podido validar el enlace del correo. Pide otro e inténtalo de nuevo.');
} else if (recovering && user) {
  renderNewPassword();
} else if (user && params.has('google') && returnTo) {
  location.replace(returnTo); // venía del checkout
} else if (user) {
  await renderAccount();
  if (params.has('confirmado')) toast('¡Email confirmado! Tu cuenta ya está activa.');
  if (params.has('google')) toast('Has entrado con Google.');
} else {
  renderGuest(params.has('confirmado')
    ? 'Email confirmado. Ya puedes entrar con tu email y tu contraseña.'
    : returnTo ? 'Entra en tu cuenta y te devolvemos a donde estabas.' : '');
}
