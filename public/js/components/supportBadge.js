import { SUPPORT_STATUS_LABELS } from '../services/supportAdminService.js';
import { escapeHtml } from '../core/utils.js';

export function supportBadge(status) {
  return `<span class="status-pill support-${escapeHtml(status)}">${escapeHtml(SUPPORT_STATUS_LABELS[status] ?? status)}</span>`;
}
