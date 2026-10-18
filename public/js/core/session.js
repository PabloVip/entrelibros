// Identificador anónimo de sesión de navegación (para relacionar eventos de un mismo visitante).
const KEY = 'entrelibros_session_id';
let memoryId = null; // respaldo si el navegador bloquea localStorage

export function getSessionId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}
