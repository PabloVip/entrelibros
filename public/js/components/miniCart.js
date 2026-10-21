// Mini-carrito de la ficha de producto. Al añadir (evento 'entrelibros:cart-added' de cartService):
//  1. la foto del producto "vuela" hasta el icono del carrito (Web Animations API: element.animate);
//  2. el número del carrito da un salto;
//  3. se abre un panel lateral con lo recién añadido, el resto del carrito, el subtotal y lo que falta
//     para el envío gratis.
// El panel es un <dialog> nativo abierto con showModal(): el navegador lleva el foco dentro, lo cierra
// con Esc y, al cerrarlo, devuelve el foco al botón "Añadir al carrito". Las animaciones de entrada y
// salida están en el CSS (.drawer). Con "reducir movimiento" no hay vuelo: el panel se abre directamente.
import { getCart, subtotal, count } from '../services/cartService.js';
import { fetchShippingMethods } from '../repositories/checkoutRepository.js';
import { freeShippingGoals } from '../services/checkoutService.js';
import { escapeHtml, money } from '../core/utils.js';
import { CHECK, CLOSE } from './icons.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let dialog = null;
let methods = null; // métodos de envío para la barra de envío gratis (se piden una vez)

function getDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'drawer';
  dialog.setAttribute('aria-labelledby', 'mini-cart-title');
  document.body.append(dialog);
  // clic en el fondo oscuro (fuera del panel) o en un botón para cerrar
  dialog.addEventListener('click', e => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  });
  return dialog;
}

/** La meta de envío gratis más cercana que aún no se ha alcanzado (o la última, si ya son todas gratis). */
function freeShipHtml(sub) {
  const goals = freeShippingGoals(methods ?? [], sub);
  if (!goals.length) return '';
  const g = goals.find(x => x.missing > 0) ?? goals[goals.length - 1];
  return `
    <div class="free-ship">
      <p class="free-ship-title">Envío gratis</p>
      <ul class="plain">
        <li class="${g.missing === 0 ? 'is-free' : ''}">
          <span>${escapeHtml(g.name)}</span>
          <span class="free-ship-state">${g.missing === 0 ? 'Gratis' : `Te faltan ${money(g.missing)}`}</span>
          <span class="free-ship-bar" aria-hidden="true"><span style="width: ${Math.round(g.progress * 100)}%"></span></span>
        </li>
      </ul>
    </div>`;
}

function render(item) {
  const lines = getCart();
  const others = lines.filter(l => l.variantId !== item.variantId);
  const n = count(lines);
  const thumb = (src, w, h) => (src ? `<img src="${escapeHtml(src)}" alt="" width="${w}" height="${h}">` : '<span></span>');
  dialog.innerHTML = `
    <div class="drawer-head">
      <h2 id="mini-cart-title">${CHECK}Añadido al carrito</h2>
      <button type="button" class="icon-btn" data-close aria-label="Cerrar">${CLOSE}</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-added">
        ${thumb(item.image, 76, 80)}
        <div>
          <p><strong>${escapeHtml(item.productName)}</strong></p>
          <p class="muted small">${escapeHtml(item.variantName)}</p>
          <p class="small">${item.added} × ${money(item.unitPrice)}</p>
        </div>
      </div>
      ${others.length ? `
        <div>
          <p class="small muted">También en tu carrito</p>
          <ul class="drawer-lines">${others.slice(0, 3).map(l => `
            <li>${thumb(l.image, 44, 46)}
              <span>${l.quantity} × ${escapeHtml(l.productName)}<br><small class="muted">${escapeHtml(l.variantName)}</small></span>
              <span>${money(l.unitPrice * l.quantity)}</span></li>`).join('')}
          </ul>
          ${others.length > 3 ? `<p class="small muted">y ${others.length - 3} más</p>` : ''}
        </div>` : ''}
      <p class="drawer-sum"><span>Subtotal (${n} ${n === 1 ? 'artículo' : 'artículos'})</span> <strong>${money(subtotal(lines))}</strong></p>
      ${freeShipHtml(subtotal(lines))}
    </div>
    <div class="drawer-foot">
      <a class="btn" href="checkout.html">Tramitar pedido</a>
      <a class="btn btn-secondary" href="carrito.html">Ver carrito</a>
      <button type="button" class="link-btn" data-close>Seguir comprando</button>
    </div>`;
}

/** Copia de la foto que viaja en arco desde la ficha hasta el icono del carrito (cabecera o barra inferior). */
function fly(img) {
  const target = [...document.querySelectorAll('.main-nav a[data-nav="carrito"] svg')]
    .find(el => el.getBoundingClientRect().width > 0);
  if (!img || !target || reduced.matches) return Promise.resolve();
  const from = img.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const clone = img.cloneNode();
  clone.removeAttribute('id');
  clone.alt = '';
  clone.className = 'fly-photo';
  Object.assign(clone.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
  document.body.append(clone);
  // distancia entre los centros; a mitad de camino la foto sube 120 px más: así dibuja un arco
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const end = Math.max(24 / from.width, 0.04);
  const animation = clone.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 120}px) scale(0.45)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(${end})`, opacity: 0.3, borderRadius: '50%' },
  ], { duration: 800, easing: 'cubic-bezier(.5, 0, .2, 1)' });
  return animation.finished.catch(() => {}).finally(() => clone.remove());
}

/** El número del carrito da un salto (css: .nav-count.bump). */
function bump() {
  const badge = document.getElementById('cart-count');
  if (!badge) return;
  badge.classList.remove('bump');
  void badge.offsetWidth; // reinicia la animación si ya estaba puesta
  badge.classList.add('bump');
}

document.addEventListener('entrelibros:cart-added', async e => {
  const d = getDialog();
  // los métodos de envío se piden mientras vuela la foto; si tardan más de 0,6 s, el panel sale sin la barra
  const ready = methods ? null : fetchShippingMethods().then(m => { methods = m; }).catch(() => { methods = []; });
  await fly(document.getElementById('main-image'));
  bump();
  if (ready) await Promise.race([ready, new Promise(r => setTimeout(r, 600))]);
  render(e.detail);
  if (!d.open) d.showModal();
});
