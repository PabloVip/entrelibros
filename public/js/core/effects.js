// Efectos que siguen al ratón en la tienda (solo con ratón o trackpad y sin "reducir movimiento"):
//  - las tarjetas de producto se inclinan en 3D hacia el cursor, con un reflejo de luz que lo sigue;
//  - en la portada, la luz de la lámpara sigue al cursor por la escena.
// Aquí solo se calculan variables CSS (--rx, --ry, --gx, --gy en la tarjeta; --lx, --ly en la portada):
// el dibujo lo hace la hoja de estilos. En el móvil la luz de la portada se mueve sola (animación CSS).
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const MAX_TILT = 6; // grados de inclinación en el borde de la tarjeta

let last = null;   // último evento de ratón
let frame = 0;     // un solo cálculo por fotograma (requestAnimationFrame), aunque lleguen más eventos
let tilted = null; // tarjeta inclinada ahora mismo

function reset(card) {
  for (const p of ['--rx', '--ry', '--gx', '--gy']) card.style.removeProperty(p);
  card.classList.remove('is-tilting');
  if (tilted === card) tilted = null;
}

function update() {
  frame = 0;
  const e = last;
  const card = e.target.closest?.('.tienda .card');
  if (tilted && tilted !== card) reset(tilted);
  if (card) {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;  // 0 en el borde izquierdo, 1 en el derecho
    const py = (e.clientY - r.top) / r.height;
    card.style.setProperty('--ry', `${((px - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${((0.5 - py) * 2 * MAX_TILT).toFixed(2)}deg`);
    card.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
    card.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    card.classList.add('is-tilting');
    tilted = card;
  }
  const hero = e.target.closest?.('.hero-band');
  if (hero) {
    const r = hero.getBoundingClientRect();
    hero.style.setProperty('--lx', `${Math.round(e.clientX - r.left)}px`);
    hero.style.setProperty('--ly', `${Math.round(e.clientY - r.top)}px`);
  }
}

document.addEventListener('pointermove', e => {
  if (!finePointer.matches || reduced.matches || e.pointerType !== 'mouse') return;
  last = e;
  if (!frame) frame = requestAnimationFrame(update);
}, { passive: true });

// el ratón sale de la ventana: la tarjeta vuelve a su sitio
document.addEventListener('pointerout', e => { if (!e.relatedTarget && tilted) reset(tilted); });
