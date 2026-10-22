// Sandbox ficticio de Bizum (pago.html): simula lo que pasa en el móvil del cliente.
// No es Bizum ni la app de ningún banco, y lo dice en pantalla. Solo sirve para enseñar el flujo:
//   1) la tienda envía la solicitud al teléfono · 2) el cliente la acepta o la rechaza en el móvil
//   (o la deja caducar) · 3) el servidor registra el resultado (simulate_payment, 05_checkout.sql).
// Quien decide si el pago se aprueba es siempre el servidor; aquí solo se recoge lo que hace el cliente.
import { escapeHtml, money } from '../core/utils.js';

const WAIT_SECONDS = 45; // tiempo para responder antes de que la solicitud caduque
const pause = ms => new Promise(r => setTimeout(r, ms));
const maskPhone = p => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

/**
 * Abre el sandbox. Devuelve un controlador para ir pasando de pantalla:
 *   await sb.connect()            → "enviando la solicitud…"
 *   await sb.ask()                → 'aceptado' | 'rechazado' | 'caducado' (lo que hace el cliente)
 *   sb.processing()               → "registrando el pago…"
 *   await sb.result(ok, message)  → resultado; se resuelve al cerrar
 */
export function openBizumSandbox({ phone, amount, orderNumber }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sandbox';
  dialog.setAttribute('aria-labelledby', 'sb-title');
  dialog.innerHTML = `
    <p class="sandbox-bar"><strong id="sb-title">Sandbox de Bizum</strong> · simulación de la tienda</p>
    <div class="sandbox-phone">
      <div class="sandbox-notch" aria-hidden="true"></div>
      <div class="sandbox-screen" id="sb-screen" aria-live="polite"></div>
    </div>
    <p class="sandbox-note">No es Bizum ni la app de tu banco: es un entorno de pruebas ficticio y no se cobra nada.</p>`;
  document.body.append(dialog);
  const screen = dialog.querySelector('#sb-screen');
  let onCancel = null; // qué pasa si el cliente pulsa Esc
  dialog.addEventListener('cancel', e => { e.preventDefault(); onCancel?.(); });
  dialog.showModal();

  const set = html => { screen.innerHTML = html; };
  const close = () => { dialog.close(); dialog.remove(); };

  return {
    async connect() {
      set(`<div class="sandbox-wait"><span class="sandbox-spinner" aria-hidden="true"></span>
        <p>Enviando la solicitud de pago al <strong>${escapeHtml(maskPhone(phone))}</strong>…</p></div>`);
      await pause(1100);
    },

    ask() {
      return new Promise(resolve => {
        let left = WAIT_SECONDS;
        set(`
          <p class="sandbox-time">Ahora · Banco Sandbox</p>
          <div class="sandbox-card">
            <p class="sandbox-label">Solicitud de pago</p>
            <p class="sandbox-amount">${amount != null ? money(amount) : 'Importe del pedido'}</p>
            <p>Entrelibros te pide un pago por Bizum.</p>
            <p class="muted small">Concepto: pedido ${escapeHtml(orderNumber)}</p>
          </div>
          <p class="sandbox-count" id="sb-count">Caduca en ${left} s</p>
          <div class="sandbox-actions">
            <button type="button" class="btn btn-secondary" data-sb="rechazado">Rechazar</button>
            <button type="button" class="btn" data-sb="aceptado">Aceptar y pagar</button>
          </div>`);
        const timer = setInterval(() => {
          left -= 1;
          const count = dialog.querySelector('#sb-count');
          if (count) count.textContent = `Caduca en ${left} s`;
          if (left <= 0) done('caducado');
        }, 1000);
        function done(decision) {
          clearInterval(timer);
          onCancel = null;
          resolve(decision);
        }
        onCancel = () => done('rechazado');
        screen.querySelectorAll('[data-sb]').forEach(b => b.addEventListener('click', () => done(b.dataset.sb)));
        screen.querySelector('[data-sb=aceptado]').focus();
      });
    },

    processing() {
      onCancel = null;
      set(`<div class="sandbox-wait"><span class="sandbox-spinner" aria-hidden="true"></span><p>Registrando el pago en la tienda…</p></div>`);
    },

    result(ok, message) {
      return new Promise(resolve => {
        set(`
          <div class="sandbox-result ${ok ? 'is-ok' : 'is-ko'}">
            <span class="sandbox-icon" aria-hidden="true">${ok ? '✓' : '✕'}</span>
            <p><strong>${ok ? 'Pago aceptado' : 'Pago no realizado'}</strong></p>
            <p>${escapeHtml(message)}</p>
          </div>
          <div class="sandbox-actions"><button type="button" class="btn" data-sb="cerrar">${ok ? 'Volver a la tienda' : 'Cerrar'}</button></div>`);
        const finish = () => { close(); resolve(); };
        onCancel = finish;
        const btn = screen.querySelector('[data-sb=cerrar]');
        btn.addEventListener('click', finish);
        btn.focus();
      });
    },

    close,
  };
}
