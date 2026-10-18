// Estados del pedido: etiquetas y transiciones permitidas.
// Es una COPIA para la interfaz (qué botones mostrar); quien decide es el servidor
// (admin_update_order_status en supabase/03_functions.sql).

export const STATUS_LABELS = {
  creado:                'Creado',
  pago_simulado:         'Pagado (simulado)',
  pendiente_preparacion: 'Pendiente de preparación',
  enviado:               'Enviado',
  entregado:             'Entregado',
  cancelado:             'Cancelado',
  incidencia:            'Incidencia',
};

const TRANSITIONS = {
  creado:                ['pago_simulado', 'cancelado'],
  pago_simulado:         ['pendiente_preparacion', 'cancelado', 'incidencia'],
  pendiente_preparacion: ['enviado', 'cancelado', 'incidencia'],
  enviado:               ['entregado', 'incidencia'],
  entregado:             ['incidencia'],
  incidencia:            ['pendiente_preparacion', 'enviado', 'cancelado'],
  cancelado:             [],
};

export function nextStatuses(status) {
  return TRANSITIONS[status] ?? [];
}

export const PAYMENT_LABELS = { aprobado: 'Aprobado', rechazado: 'Rechazado', pendiente: 'Pendiente' };
export const METHOD_LABELS  = { tarjeta_simulada: 'Tarjeta (simulada)', bizum_simulado: 'Bizum (simulado)' };

/** Indicadores para la cabecera del back-office */
export function summarize(orders) {
  const paid = orders.filter(o => !['creado', 'cancelado'].includes(o.status));
  return {
    total: orders.length,
    toPrepare: orders.filter(o => o.status === 'pendiente_preparacion' || o.status === 'pago_simulado').length,
    incidents: orders.filter(o => o.status === 'incidencia').length,
    revenue: paid.reduce((sum, o) => sum + Number(o.total), 0),
  };
}
