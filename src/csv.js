// Minimal CSV for this project's files: one record per line, double quotes around fields with commas.

function parseLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { fields.push(field); field = ''; }
    else field += c;
  }
  fields.push(field);
  return fields;
}

export function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/).map(parseLine);
  return lines.map((fields) => Object.fromEntries(header.map((name, i) => [name, fields[i]])));
}

export function toCsv(rows, columns) {
  const quote = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [columns.join(','), ...rows.map((r) => columns.map((c) => quote(r[c])).join(','))].join('\n') + '\n';
}
