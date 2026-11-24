export function parseCSV(t) {
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some((x) => x.trim())) rows.push(r); r = []; }
    else c += ch;
  }
  if (c || r.length) { r.push(c); if (r.some((x) => x.trim())) rows.push(r); }
  const [h = [], ...b] = rows; const keys = h.map((x) => x.trim());
  return { keys, rows: b.map((x) => Object.fromEntries(keys.map((k, i) => [k, (x[i] ?? '').trim()]))) };
}
export const toCSV = (rows, keys) => [keys.join(','), ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
export function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
