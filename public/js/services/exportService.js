// Exportación de datos a fichero (CSV para Excel, JSON para otros sistemas).

function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  if (value == null) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** CSV separado por ';' con BOM UTF-8 para que Excel en español lo abra bien */
export function exportCsv(rows, columns, filename) {
  const lines = [columns.join(';'), ...rows.map(r => columns.map(c => csvCell(r[c])).join(';'))];
  download('﻿' + lines.join('\n'), filename, 'text/csv;charset=utf-8');
}

export function exportJson(rows, filename) {
  download(JSON.stringify(rows, null, 2), filename, 'application/json');
}
