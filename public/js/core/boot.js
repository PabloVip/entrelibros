// Arranque de cada página de la tienda. Es un script clásico (no un módulo) y va en el <head>
// ANTES de la hoja de estilos: se ejecuta antes de pintar nada, así la página nace ya con su tema
// y no hay un destello blanco al cargar en modo noche.
(function () {
  // ---------- Tema: "dia" o "noche" ----------
  // Lo guardado por el interruptor de luz (js/core/theme.js) o, si no hay nada, el tema del sistema.
  let tema = null;
  try { tema = localStorage.getItem('entrelibros_tema'); } catch { /* almacenamiento bloqueado */ }
  if (tema !== 'dia' && tema !== 'noche') {
    tema = matchMedia('(prefers-color-scheme: dark)').matches ? 'noche' : 'dia';
  }
  document.documentElement.dataset.theme = tema;
  // color de la barra del navegador en el móvil (el <meta> va antes de este script)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'noche' ? '#10182B' : '#EEF1F5');

  // ---------- Transición entre páginas (View Transitions API) ----------
  // "pagereveal" llega justo antes de pintar la página nueva. Se guarda la transición para que la ficha
  // de producto espere a que termine antes de repintar (js/pages/product.js). Tiene que registrarse
  // aquí, en el <head>: los módulos se ejecutan demasiado tarde para este evento.
  window.addEventListener('pagereveal', e => { window.__transicion = e.viewTransition ?? null; });

  // Ficha de producto: si venimos de una tarjeta, su foto se pinta ya en el primer fotograma con el mismo
  // view-transition-name, y el navegador la anima desde la tarjeta hasta aquí. La llama un <script> de
  // producto.html justo después del esqueleto; el clic en la tarjeta lo guarda js/core/transitions.js.
  window.pintarFotoDeLaTarjeta = function () {
    let foto = null;
    try { foto = JSON.parse(sessionStorage.getItem('entrelibros_foto') ?? 'null'); } catch { /* sin datos */ }
    const hueco = document.querySelector('#product .sk-photo');
    if (!foto || !hueco || foto.slug !== new URLSearchParams(location.search).get('slug')) return;
    const img = document.createElement('img');
    img.id = 'main-image';
    img.src = foto.src;
    img.alt = foto.alt ?? '';
    img.width = 400;
    img.height = 420;
    img.style.viewTransitionName = 'producto-foto';
    hueco.replaceWith(img);
  };
})();
