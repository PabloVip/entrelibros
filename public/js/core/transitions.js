// Transición entre páginas: la foto de una tarjeta "vuela" hasta la ficha del producto.
//
// La hoja de estilos activa las transiciones entre páginas con @view-transition { navigation: auto; }.
// El navegador anima de una página a otra los elementos que tienen el mismo view-transition-name
// en las dos. Aquí, al pulsar una tarjeta, se pone ese nombre a SU foto (solo a esa: el nombre tiene que
// ser único en la página) y se guarda la foto para que producto.html la pinte en su primer fotograma
// (window.pintarFotoDeLaTarjeta, en js/core/boot.js), antes de que lleguen los datos de Supabase.
const NAME = 'producto-foto';

function clearNames() {
  for (const img of document.querySelectorAll('[data-vt-foto]')) {
    img.style.viewTransitionName = '';
    delete img.dataset.vtFoto;
  }
}

document.addEventListener('click', e => {
  const link = e.target.closest?.('a[href*="producto.html?slug="]');
  // con Ctrl/Cmd/Mayús el enlace se abre en otra pestaña: no hay transición
  if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const img = link.closest('.card')?.querySelector('.card-media img');
  if (!img) return;
  clearNames();
  img.style.viewTransitionName = NAME;
  img.dataset.vtFoto = '';
  const slug = new URL(link.href).searchParams.get('slug');
  try {
    sessionStorage.setItem('entrelibros_foto', JSON.stringify({ slug, src: img.currentSrc || img.src, alt: img.alt }));
  } catch { /* sin almacenamiento: la ficha se abre con el fundido normal */ }
});

// Al volver con "Atrás" la página sale de la caché tal como estaba: se quita el nombre para que no se repita
window.addEventListener('pageshow', clearNames);
