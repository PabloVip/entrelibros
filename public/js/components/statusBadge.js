import { STATUS_LABELS } from '../services/orderService.js';
import { escapeHtml } from '../core/utils.js';

export function statusBadge(status) {
  return `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] ?? status)}</span>`;
}
