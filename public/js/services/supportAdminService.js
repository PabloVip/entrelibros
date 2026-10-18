// Estados de las incidencias de soporte en el back-office.
// Copia para la interfaz; quien decide es admin_update_support_status (06_soporte_admin.sql).

export const SUPPORT_STATUS_LABELS = {
  abierta:  'Abierta',
  en_curso: 'En curso',
  resuelta: 'Resuelta',
};

const TRANSITIONS = {
  abierta:  ['en_curso', 'resuelta'],
  en_curso: ['resuelta', 'abierta'],
  resuelta: ['abierta'],
};

/** Texto del botón para pasar a cada estado */
export const ACTION_LABELS = {
  en_curso: 'Atender',
  resuelta: 'Marcar resuelta',
  abierta:  'Reabrir',
};

export function nextSupportStatuses(status) {
  return TRANSITIONS[status] ?? [];
}
