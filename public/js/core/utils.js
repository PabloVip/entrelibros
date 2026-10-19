// Utilidades de interfaz.
import { locale } from './i18n.js';

/** Escapa texto antes de insertarlo como HTML (evita XSS). Usar SIEMPRE con datos. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const euro = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
export function money(amount) {
  return euro.format(Number(amount ?? 0));
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/** Lee un parámetro de la URL: producto.html?slug=calle-kioto -> param('slug') */
export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });
export function formatDate(value) {
  return value ? dateFmt.format(new Date(value)) : '';
}
