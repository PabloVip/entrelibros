// Interruptor de luz: cambia entre el tema "noche" (la habitación a oscuras y las escenas encendidas)
// y el tema "dia". El tema inicial lo pone js/core/boot.js antes de pintar la página.
//
// Efecto: con la View Transitions API el navegador hace una captura de la página antes y después del
// cambio; aquí se anima la captura nueva con un círculo que crece desde el interruptor (clip-path).
// Sin esa API, o con "reducir movimiento" activado en el sistema, el cambio es instantáneo.
import { BULB } from '../components/icons.js';

const KEY = 'entrelibros_tema';
const root = document.documentElement;
const BAR_COLOR = { dia: '#EEF1F5', noche: '#10182B' }; // <meta name="theme-color">

export const currentTheme = () => (root.dataset.theme === 'noche' ? 'noche' : 'dia');

// El texto dice lo que hace el botón: de noche la luz de la habitación está apagada y se puede encender
const label = theme => (theme === 'noche' ? 'Encender la luz (modo día)' : 'Apagar la luz (modo noche)');

/** HTML del interruptor (lo pinta la cabecera, js/core/layout.js). */
export function themeToggleHtml() {
  const text = label(currentTheme());
  return `<button type="button" class="lamp-switch" data-theme-toggle aria-label="${text}" title="${text}">${BULB}</button>`;
}

function apply(theme, save) {
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme]);
  for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
    btn.setAttribute('aria-label', label(theme));
    btn.title = label(theme);
  }
  if (save) {
    try { localStorage.setItem(KEY, theme); } catch { /* sin almacenamiento: dura hasta cambiar de página */ }
  }
  document.dispatchEvent(new CustomEvent('entrelibros:theme-changed', { detail: { theme } }));
}

function toggle(btn) {
  const next = currentTheme() === 'noche' ? 'dia' : 'noche';
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply(next, true);
    return;
  }
  // centro del círculo: el interruptor; radio: hasta la esquina más lejana de la pantalla
  const r = btn.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  // "cambiando-tema" quita las animaciones de las transiciones entre páginas (css, sección 6)
  root.classList.add('cambiando-tema');
  const transition = document.startViewTransition(() => apply(next, true));
  transition.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 750, easing: 'cubic-bezier(.2, .8, .2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
  transition.finished.finally(() => root.classList.remove('cambiando-tema'));
}

document.addEventListener('click', e => {
  const btn = e.target.closest?.('[data-theme-toggle]');
  if (btn) toggle(btn);
});

// Si el cliente no ha elegido nunca, la página sigue al sistema cuando este cambia (p. ej. al anochecer)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* sin almacenamiento */ }
  if (!saved) apply(e.matches ? 'noche' : 'dia', false);
});
