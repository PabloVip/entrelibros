// Escena de la confirmación del pedido: una fachada en miniatura entre libros. Con el pedido pagado,
// sus ventanas se encienden una a una (css: .nook-lights.encendida; --n da el orden de cada ventana).
// Sin pagar, las ventanas siguen apagadas. Es un dibujo decorativo: aria-hidden.
const WINDOWS = [[86, 74], [104, 74], [122, 74], [86, 98], [104, 98], [122, 98]];
const BOOKS = [
  [8, 52, 16, 108, '#8E2F3B'], [26, 38, 13, 122, '#2E5B4F'], [41, 66, 16, 94, '#B8892E'],
  [163, 44, 17, 116, '#3B5A8C'], [182, 62, 13, 98, '#5B3A63'], [197, 36, 16, 124, '#A0523A'],
];

export function nookLights(lit) {
  const books = BOOKS.map(([x, y, w, h, color]) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${color}"/>
    <rect x="${x + 3}" y="${y + 12}" width="${w - 6}" height="2.5" fill="#F3D9A0" opacity=".55"/>
    <rect x="${x + 3}" y="${y + 18}" width="${w - 6}" height="2.5" fill="#F3D9A0" opacity=".55"/>`).join('');
  const halos = WINDOWS.map(([x, y], n) => `<circle class="halo" cx="${x + 6}" cy="${y + 7}" r="12" style="--n:${n}"/>`).join('');
  const windows = WINDOWS.map(([x, y], n) => `<rect class="ventana" x="${x}" y="${y}" width="12" height="14" rx="1.5" style="--n:${n}"/>`).join('');
  return `
    <svg class="nook-lights${lit ? ' encendida' : ''}" viewBox="0 0 220 172" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="nl-luz" cx="50%" cy="85%" r="75%">
          <stop offset="0" stop-color="#FFB547" stop-opacity=".55"/><stop offset="1" stop-color="#FFB547" stop-opacity="0"/>
        </radialGradient>
        <filter id="nl-difuso" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>
      ${books}
      <rect x="60" y="18" width="100" height="144" rx="3" fill="#2B2118"/>
      <rect x="66" y="24" width="88" height="138" fill="#0E1424"/>
      <rect class="escena-brillo" x="66" y="24" width="88" height="138" fill="url(#nl-luz)"/>
      <g fill="#F3EEE3" opacity=".6"><circle cx="76" cy="34" r=".9"/><circle cx="96" cy="30" r=".7"/><circle cx="140" cy="36" r="1"/><circle cx="128" cy="29" r=".6"/></g>
      <path d="M74 66 110 42l36 24z" fill="#3A2F45"/>
      <rect x="78" y="64" width="64" height="98" fill="#2E3550"/>
      <g fill="#FFB547" filter="url(#nl-difuso)">${halos}</g>
      ${windows}
      <rect class="ventana" x="102" y="128" width="16" height="34" rx="8" style="--n:6"/>
      <circle class="ventana" cx="129" cy="134" r="3" style="--n:7"/>
      <rect x="0" y="160" width="220" height="12" rx="2" fill="#8A5A35"/>
      <rect x="0" y="160" width="220" height="3" fill="#A36F45"/>
    </svg>`;
}
