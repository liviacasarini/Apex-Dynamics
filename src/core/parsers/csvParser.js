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
 *
 * Estratégia priorizada:
 *  1. Nome exato simples: "Volta", "Lap", "Vuelta"
 *  2. Composto específico: "Lap Number", "Numero da Volta", etc.
 *  3. Padrão GPS comum: "GPS Numero da Volta", "GPS Lap"
 *  4. Fallback amplo excluindo colunas que claramente NÃO são número de volta
 *     (tempo, velocidade, distância, pressão, temperatura, etc.)
 */
function detectLapColumn(headers) {
  // Padrões que EXCLUEM colunas que não são número de volta.
  // IMPORTANTE: \bvolt\b (palavra inteira) para NÃO bloquear "Volta" (= volta/lap em PT-BR).
  // \bmap\b para não bloquear colunas com "mapa" no nome.
  const notLapNum = /time|tempo|duration|speed|velocidade|dist|press|temp|lambda|rpm|throttle|accel|gyro|\bvolt\b|current|battery|oil|fuel|water|lat|lon|lng|alt|heading|bearing|tps|\bmap\b/i;

  // 1. Nome exato
  const exact = headers.find((h) => /^(volta|lap|vuelta)$/i.test(h.trim()));
  if (exact) return exact;

  // 2. Composto específico
  const compound = headers.find((h) => {
    const t = h.trim();
    return (
      /lap.*(num|number|no\b|#|id\b)/i.test(t) ||
      /numero.*volta/i.test(t) ||
      /volta.*num/i.test(t)
    ) && !notLapNum.test(t);
  });
  if (compound) return compound;

  // 3. GPS / prefixo de sistema
  const gps = headers.find((h) => {
    const t = h.trim();
    return (/gps.*volta/i.test(t) || /gps.*lap/i.test(t)) && !notLapNum.test(t);
  });
  if (gps) return gps;

  // 4. Fallback amplo: contém "lap" ou "volta" mas NÃO é coluna de valor contínuo
  const broad = headers.find((h) => {
    const t = h.trim();
    return (/\blap\b/i.test(t) || /\bvolta\b/i.test(t)) && !notLapNum.test(t);
  });
  return broad || '';
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

  // Desduplicar headers: se dois canais têm o mesmo nome, o 2º vira "Nome_2", o 3º "Nome_3", etc.
  // Evita overwrite silencioso de dados quando a ECU exporta a mesma coluna duas vezes.
  const rawHeaders = lines[0].split(sep).map((h) => h.trim());
  const headerCount = {};
  const headers = rawHeaders.map((h) => {
    headerCount[h] = (headerCount[h] || 0) + 1;
    return headerCount[h] > 1 ? `${h}_${headerCount[h]}` : h;
  });

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
