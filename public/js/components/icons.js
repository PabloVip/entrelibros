// Iconos SVG en línea. Llevan aria-hidden: el texto del botón o del enlace ya dice qué hacen.
// Son de trazo (24×24) y toman el color del texto (stroke: currentColor en el CSS).
const svg = (body, cls = '') => `<svg ${cls ? `class="${cls}" ` : ''}viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

export const HEART = svg('<path d="M12 20.25 4.52 11.1A4.5 4.5 0 1 1 12 6.19a4.5 4.5 0 1 1 7.48 4.91Z"/>');
export const USER  = svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>');
export const HOME  = svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>');
// tres lomos en una balda: el catálogo
export const BOOKS = svg('<rect x="3" y="4" width="4" height="15" rx="1"/><rect x="9" y="6" width="4" height="13" rx="1"/><path d="m15.4 6.7 3.3-.9 2.9 12.4-3.3.8z"/><path d="M2 21.5h20"/>');
export const CHAT  = svg('<path d="M20.5 14.5a2 2 0 0 1-2 2H8.5l-5 4v-15a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 12.5h5"/>');
export const BAG   = svg('<path d="M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>');
// bombilla del interruptor de luz: los rayos y el cristal se encienden con el CSS (.bulb-rays, .bulb-glass)
export const BULB  = svg('<path class="bulb-glass" d="M12 5a5.5 5.5 0 0 0-3.3 9.9c.5.4.8 1 .8 1.6V17h5v-.5c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 12 5Z"/><path d="M10 19.5h4M10.6 22h2.8"/><path class="bulb-rays" d="M12 .8v1.6M4.4 3.6l1.1 1.1M19.6 3.6l-1.1 1.1M1.2 10.5h1.6M21.2 10.5h1.6"/>', 'bulb');
export const COPY  = svg('<rect x="9" y="9" width="11.5" height="11.5" rx="2"/><path d="M5.5 15H4.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1H14a1 1 0 0 1 1 1v1"/>');
export const CHECK = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>');
export const CLOSE = svg('<path d="M6 6l12 12M18 6 6 18"/>');
export const CARD  = svg('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>');
export const PHONE = svg('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>');
// iconos de "Elige por tu estantería" (portada): regla, niveles y bombilla
export const RULER = svg('<path d="M3 15.5 15.5 3 21 8.5 8.5 21z"/><path d="m7 11.9 1.8 1.8M10 8.9l2.6 2.6M13 5.9l1.8 1.8"/>');
export const LEVELS = svg('<path d="M5 20v-4M10 20v-8M15 20V8M20 20V4"/>');
