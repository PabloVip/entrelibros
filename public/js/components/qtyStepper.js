// Selector de cantidad: botones − y + alrededor del <input type="number"> (más cómodo con el dedo en el móvil).
// Los botones cambian el valor sin salir de min..max y lanzan el evento "change" del input,
// como si el cliente lo hubiera escrito: las páginas (carrito, ficha) siguen escuchando el input igual que antes.

/**
 * HTML del selector.
 * @param {{id: string, value: number, min?: number, max?: number|null, attrs?: string, disabled?: boolean}} o
 *   attrs: atributos extra para el input (name, class, data-*…), ya escapados por quien llama.
 */
export function qtyStepper({ id, value, min = 1, max = null, attrs = '', disabled = false }) {
  const atMin = value <= min;
  const atMax = max != null && value >= max;
  return `
    <span class="qty-stepper">
      <button type="button" class="qty-btn" data-step="-1" data-for="${id}" aria-label="Quitar una unidad" ${disabled || atMin ? 'disabled' : ''}>−</button>
      <input id="${id}" type="number" min="${min}" ${max != null ? `max="${max}"` : ''} value="${value}" inputmode="numeric" ${attrs} ${disabled ? 'disabled' : ''}>
      <button type="button" class="qty-btn" data-step="1" data-for="${id}" aria-label="Añadir una unidad" ${disabled || atMax ? 'disabled' : ''}>+</button>
    </span>`;
}

function limits(input) {
  return { min: Number(input.min || 1), max: input.max === '' ? Infinity : Number(input.max) };
}

/** Activa o desactiva − y + según el valor y los límites del input (p. ej. si la ficha cambia el máximo). */
export function syncStepper(input) {
  if (!input) return;
  const { min, max } = limits(input);
  const value = Number(input.value);
  for (const btn of document.querySelectorAll(`.qty-btn[data-for="${CSS.escape(input.id)}"]`)) {
    btn.disabled = input.disabled || (Number(btn.dataset.step) < 0 ? value <= min : value >= max);
  }
}

// Un solo listener para toda la página: vale también para las filas que el carrito vuelve a pintar.
document.addEventListener('click', e => {
  const btn = e.target.closest('.qty-btn');
  if (!btn) return;
  const id = btn.dataset.for;
  const input = document.getElementById(id);
  if (!input || input.disabled) return;
  const { min, max } = limits(input);
  const current = Number.isInteger(Number(input.value)) ? Number(input.value) : min;
  const next = Math.min(Math.max(current + Number(btn.dataset.step), min), max);
  if (next === Number(input.value)) return;
  input.value = String(next);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // El carrito repinta la fila al cambiar la cantidad: se buscan otra vez el input y el botón
  // para no perder el foco (si el botón ha quedado desactivado, el foco pasa al número).
  const fresh = document.getElementById(id);
  syncStepper(fresh);
  const same = document.querySelector(`.qty-btn[data-for="${CSS.escape(id)}"][data-step="${btn.dataset.step}"]`);
  (same && !same.disabled ? same : fresh)?.focus();
});

// Al escribir el número a mano también se actualizan los botones ("change": por si la página
// corrige un valor no válido, como hace el carrito)
for (const type of ['input', 'change']) {
  document.addEventListener(type, e => {
    if (e.target.closest?.('.qty-stepper')) syncStepper(e.target);
  });
}
