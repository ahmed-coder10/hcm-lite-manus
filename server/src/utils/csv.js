/** Tiny dependency-free CSV reader/writer (RFC 4180-ish). */

export function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!nonEmpty.length) return { headers: [], records: [] };

  const headers = nonEmpty[0].map((h) => String(h).trim());
  const records = nonEmpty.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] === undefined ? '' : String(r[idx]).trim();
    });
    return obj;
  });
  return { headers, records };
}

const escapeCell = (value) => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers, rows) {
  const head = headers.map((h) => escapeCell(h.label ?? h)).join(',');
  const body = rows
    .map((row) => headers.map((h) => escapeCell(typeof h.get === 'function' ? h.get(row) : row[h.key ?? h])).join(','))
    .join('\n');
  return `${head}\n${body}\n`;
}
