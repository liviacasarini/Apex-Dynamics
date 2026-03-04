/**
 * csvParser.js
 *
 * Parser universal de CSVs de telemetria.
 * Auto-detecta separador (;  ,  tab) e formato decimal brasileiro (vírgula).
 */

/**
 * Detecta o separador mais provável do CSV.
 */
function detectSeparator(headerLine) {
  const counts = {
    ';': (headerLine.match(/;/g) || []).length,
    ',': (headerLine.match(/,/g) || []).length,
    '\t': (headerLine.match(/\t/g) || []).length,
  };

  // Se tem ponto-e-vírgula, quase certeza que é o separador (padrão BR / ProTune)
  if (counts[';'] > 3) return ';';
  if (counts['\t'] > 3) return '\t';
  return ',';
}

/**
 * Converte valor string para número, lidando com decimal BR (vírgula).
 */
function parseNumber(raw, sep) {
  if (!raw || raw.trim() === '') return NaN;
  let str = raw.trim();

  // Se o separador é ; então a vírgula é decimal
  if (sep === ';') {
    str = str.replace(',', '.');
  }

  return parseFloat(str);
}

/**
 * Detecta a coluna de volta (lap) nos headers.
 */
function detectLapColumn(headers) {
  return headers.find(
    (h) =>
      /volta/i.test(h) ||
      /\blap\b/i.test(h) ||
      /lap.*num/i.test(h) ||
      /numero.*volta/i.test(h)
  ) || '';
}

/**
 * Faz o parsing completo do CSV de telemetria.
 *
 * @param {string} text - Conteúdo bruto do arquivo CSV.
 * @returns {{ headers: string[], rows: Object[], laps: Object, lapCol: string }}
 */
export function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());

  if (lines.length < 2) {
    return { headers: [], rows: [], laps: {}, lapCol: '' };
  }

  const sep = detectSeparator(lines[0]);
  const headers = lines[0].split(sep).map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep);
    if (vals.length < headers.length - 2) continue;

    const row = {};
    headers.forEach((h, j) => {
      const raw = (vals[j] || '').trim();
      const num = parseNumber(raw, sep);
      row[h] = isNaN(num) ? raw : num;
    });

    rows.push(row);
  }

  // Agrupar por volta
  const lapCol = detectLapColumn(headers);
  const laps = {};

  if (lapCol) {
    rows.forEach((r) => {
      const ln = r[lapCol];
      if (ln === undefined || ln === '') return;
      if (!laps[ln]) laps[ln] = [];
      laps[ln].push(r);
    });
  }

  return { headers, rows, laps, lapCol };
}
