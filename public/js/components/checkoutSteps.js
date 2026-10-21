// Pasos de la compra (carrito → datos → pago → confirmación) al principio de cada página del proceso.
// Indican en qué paso está el cliente y cuáles ha completado. No son enlaces: una vez creado el pedido
// no se puede volver al carrito o a los datos (el carrito ya se ha vaciado).
const STEPS = ['Carrito', 'Tus datos', 'Pago', 'Confirmación'];

/** HTML de los pasos. current: número del paso en el que está el cliente (1 a 4). */
export function checkoutSteps(current) {
  return `
    <nav class="steps" aria-label="Pasos de la compra">
      <ol>${STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'todo';
        // aria-current="step": los lectores de pantalla anuncian cuál es el paso actual
        return `
        <li class="step-${state}" ${state === 'current' ? 'aria-current="step"' : ''}>
          <span class="step-num" aria-hidden="true">${state === 'done' ? '✓' : n}</span>
          <span class="step-label">${state === 'done' ? '<span class="visually-hidden">Completado: </span>' : ''}${label}</span>
        </li>`;
      }).join('')}
      </ol>
    </nav>`;
}

/** Pone los pasos al principio del <main id="contenido"> (una sola vez por página). */
export function showCheckoutSteps(current) {
  if (document.querySelector('.steps')) return;
  document.getElementById('contenido')?.insertAdjacentHTML('afterbegin', checkoutSteps(current));
}
