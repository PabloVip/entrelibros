// Reglas del formulario de soporte. Son las mismas que comprueba create_support_request;
// aquí solo sirven para avisar antes de enviar.

// Motivos que acepta la tabla support_requests (01_schema.sql), con su texto para el cliente
export const REASONS = {
  pieza_faltante: 'Falta una pieza',
  pieza_danada:   'Pieza dañada o rota',
  retraso_envio:  'Mi pedido no llega',
  duda_montaje:   'Duda con el montaje',
  otro:           'Otro motivo',
};

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

/** Devuelve { campo: mensaje } con los campos incorrectos (vacío si todo está bien). */
export function validateSupport({ email, orderNumber, reason, message }) {
  const errors = {};
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Escribe un email válido.';
  if (orderNumber && !/^EL-[0-9]{8}-[A-Z0-9]{4}$/.test(orderNumber)) {
    errors.orderNumber = 'El número de pedido tiene el formato EL-AAAAMMDD-XXXX (o déjalo vacío).';
  }
  if (!(reason in REASONS)) errors.reason = 'Elige un motivo.';
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    errors.message = `Cuéntanos qué pasa (entre ${MESSAGE_MIN} y ${MESSAGE_MAX} caracteres).`;
  }
  return errors;
}
