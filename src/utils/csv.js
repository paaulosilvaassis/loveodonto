export const downloadCsv = ({ filename, rows }) => {
  const header = rows.length ? Object.keys(rows[0]) : [];
  const escapeValue = (value) => {
    const text = value ?? '';
    const str = String(text).replace(/"/g, '""');
    return `"${str}"`;
  };

  const lines = [header.map(escapeValue).join(',')];
  rows.forEach((row) => {
    lines.push(header.map((key) => escapeValue(row[key])).join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};
