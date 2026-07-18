function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function rowsToCsv(columns, rows) {
  const headers = columns.map((c) => c.label || c.key);
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) =>
      columns.map((col) => escapeCsv(row[col.key])).join(',')
    ),
  ];
  return lines.join('\n');
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportReportCsv(slug, columns, rows) {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(`${slug}-${stamp}.csv`, rowsToCsv(columns, rows));
}
