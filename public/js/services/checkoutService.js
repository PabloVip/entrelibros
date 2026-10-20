// Reglas del checkout en el navegador: validación del formulario y resumen ORIENTATIVO.
// Son las mismas reglas que aplica create_order (supabase/05_checkout.sql), pero el importe
// que vale es siempre el que devuelve el servidor.
import { TAX_RATE } from '../config.js';

const round2 = n => Math.round(n * 100) / 100;

/** Gastos de envío: gratis si hay umbral y (subtotal − descuento) lo alcanza. */
export function shippingCost(method, subtotal, discount = 0) {
  if (!method) return 0;
  const freeFrom = method.free_from == null ? null : Number(method.free_from);
  // round2: con decimales en coma flotante 70,10 − 10,10 da 59,9999…, y no llegaría a 60
  return freeFrom != null && round2(subtotal - discount) >= freeFrom ? 0 : Number(method.price);
}

/**
 * Para la barra del carrito: cuánto falta para el envío gratis de cada método que lo ofrece
 * (los que tienen free_from), del umbral más bajo al más alto.
 * Es orientativo: en el checkout el umbral se compara con el subtotal ya descontado (shippingCost).
 */
export function freeShippingGoals(methods, subtotal) {
  return methods
    .filter(m => m.free_from != null)
    .map(m => {
      const goal = Number(m.free_from);
      const missing = Math.max(round2(goal - subtotal), 0);
      // progress (0..1) es el ancho de la barra
      return { name: m.name, goal, missing, progress: goal > 0 ? Math.min(subtotal / goal, 1) : 1 };
    })
    .sort((a, b) => a.goal - b.goal);
}

/** Resumen de importes: los precios ya llevan IVA, así que el IVA se desglosa del total. */
export function estimate({ subtotal, discount = 0, method }) {
  const shipping = shippingCost(method, subtotal, discount);
  const total = round2(subtotal - discount + shipping);
  const tax = round2(total - round2(total / (1 + TAX_RATE / 100)));
  return { subtotal, discount, shipping, total, tax };
}

// Mismas comprobaciones que el servidor; aquí solo sirven para avisar antes de enviar.
const RULES = {
  full_name: v => (v.length >= 2 && v.length <= 100) || 'Escribe tu nombre (entre 2 y 100 caracteres).',
  email:     v => (v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) || 'Escribe un email válido.',
  phone:     v => !v || /^[0-9 +()-]{6,20}$/.test(v) || 'El teléfono solo puede llevar números, espacios y + ( ) -.',
  address:   v => (v.length >= 5 && v.length <= 200) || 'Escribe la dirección (calle, número, piso).',
  city:      v => (v.length >= 2 && v.length <= 80) || 'Escribe la ciudad.',
  postcode:  v => /^[0-9]{5}$/.test(v) || 'El código postal tiene 5 dígitos.',
  province:  v => (v.length >= 2 && v.length <= 80) || 'Escribe la provincia.',
  notes:     v => v.length <= 500 || 'La nota no puede superar los 500 caracteres.',
};

/** Devuelve { campo: mensaje } con los campos incorrectos (vacío si todo está bien). */
export function validateForm(values) {
  const errors = {};
  for (const [field, rule] of Object.entries(RULES)) {
    const result = rule(values[field] ?? '');
    if (result !== true) errors[field] = result;
  }
  return errors;
}

// ---------- Pago simulado ----------
export const ORDER_NUMBER_RE = /^EL-[0-9]{8}-[A-Z0-9]{4}$/;

// Únicas tarjetas que acepta el simulador (las mismas que comprueba simulate_payment)
export const TEST_CARDS = [
  { number: '4242 4242 4242 4242', result: 'aprobada' },
  { number: '4000 0000 0000 0002', result: 'rechazada' },
];

// Tarjetas de prueba de Stripe (modo test). Se escriben en la página de Stripe, no en la nuestra:
// la tienda nunca ve el número de la tarjeta.
export const STRIPE_TEST_CARDS = [
  { number: '4242 4242 4242 4242', result: 'aprobada' },
  { number: '4000 0000 0000 0002', result: 'rechazada' },
  { number: '4000 0025 0000 3155', result: 'pide autenticación 3D Secure' },
];

// Id de sesión de Stripe que vuelve en la URL de la confirmación (solo modo prueba)
export const STRIPE_SESSION_RE = /^cs_test_[A-Za-z0-9]{10,200}$/;

/**
 * Devuelve los 16 dígitos si es una tarjeta de prueba, o null.
 * Así un número real nunca sale del navegador: ni siquiera llega al servidor.
 */
export function testCardDigits(value) {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  return TEST_CARDS.some(c => c.number.replaceAll(' ', '') === digits) ? digits : null;
}

// Último pedido creado en esta pestaña: pago.html lo usa para enseñar el importe y,
// al aprobarse, enlazar a la confirmación (que pide el email). sessionStorage se borra al cerrar la pestaña.
// Si el navegador lo bloquea, getLastOrder() devuelve null y pago.html pide el email.
const LAST_ORDER_KEY = 'entrelibros_last_order';

export function saveLastOrder(order) {
  try { sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order)); } catch { /* sin sessionStorage */ }
}

/** Datos del último pedido si coincide con el número indicado; si no, null. */
export function getLastOrder(orderNumber) {
  try {
    const order = JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY));
    return order?.orderNumber === orderNumber ? order : null;
  } catch {
    return null;
  }
}
