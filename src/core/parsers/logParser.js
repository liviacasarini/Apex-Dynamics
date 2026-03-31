/**
 * logParser.js
 *
 * Parser para arquivos Bosch WinDarab LOG / texto exportado.
 * 100% JavaScript puro — sem dependências externas.
 *
 * Formato típico do export texto WinDarab:
 *   - Linhas de metadados no topo (podem começar com # ou ser chave=valor)
 *   - Linha de headers (nomes dos canais, separados por tab)
 *   - Opcionalmente, linha de unidades
 *   - Dados numéricos separados por tab
 *   - Pode ter coluna "Lap" ou "LapNumber" para dividir voltas
 *
 * Retorna: { headers, rows, laps, lapCol } — mesmo formato do parseCSV
 */

/**
 * Detecta se uma linha é metadado (não dados numéricos).
 */
function isMetaLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('//')) return true;
  if (/^[A-Za-z_]+\s*[:=]/.test(trimmed)) return true; // chave=valor ou chave: valor
  return false;
}

/**
 * Detecta se uma string parece ser nome de header (não numérico puro).
 */
function looksLikeHeader(parts) {
  // Se a maioria dos campos NÃO são numéricos, provavelmente é header
  let nonNumeric = 0;
  for (const p of parts) {
    const cleaned = p.trim();
    if (cleaned && isNaN(parseFloat(cleaned.replace(',', '.')))) {
      nonNumeric++;
    }
  }
  return nonNumeric >= parts.length * 0.5;
}

/**
 * Parseia número com suporte a formato brasileiro (vírgula decimal).
 */
function parseNumber(str) {
  if (!str || typeof str !== 'string') return NaN;
  const cleaned = str.trim().replace(',', '.');
  const num = parseFloat(cleaned);
  return num;
}

/**
 * Parseia um arquivo Bosch LOG (texto delimitado).
 *
 * @param {string} text — conteúdo do arquivo .log
 * @returns {{ headers: string[], rows: object[], laps: object, lapCol: string }}
 */
export function parseBoschLog(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Arquivo LOG vazio ou inválido.');
  }

  const rawLines = text.split(/\r?\n/);

  /* ── Separar metadados do conteúdo tabular ──────────────────────── */
  let dataStartIdx = 0;

  // Pular linhas de metadados no topo
  while (dataStartIdx < rawLines.length && isMetaLine(rawLines[dataStartIdx])) {
    dataStartIdx++;
  }

  // Se pulou tudo, arquivo é só metadados
  if (dataStartIdx >= rawLines.length) {
    throw new Error('Nenhum dado tabular encontrado no arquivo LOG.');
  }

  /* ── Detectar separador (tab é o mais comum, mas aceitar ; e ,) ── */
  const firstDataLine = rawLines[dataStartIdx];
  let separator = '\t';
  if (firstDataLine.split('\t').length < 3) {
    if (firstDataLine.split(';').length >= 3) separator = ';';
    else if (firstDataLine.split(',').length >= 3) separator = ',';
  }

  /* ── Parsear header ─────────────────────────────────────────────── */
  const headerParts = firstDataLine.split(separator).map((s) => s.trim());

  if (!looksLikeHeader(headerParts)) {
    throw new Error('Não foi possível detectar os nomes dos canais no arquivo LOG.');
  }

  // Desduplicar headers (caso existam colunas com mesmo nome)
  const headerCount = {};
  const headers = headerParts.map((h) => {
    if (!h) h = 'Unknown';
    if (headerCount[h]) {
      headerCount[h]++;
      return `${h}_${headerCount[h]}`;
    }
    headerCount[h] = 1;
    return h;
  });

  /* ── Checar se próxima linha é de unidades ──────────────────────── */
  let firstRowIdx = dataStartIdx + 1;
  if (firstRowIdx < rawLines.length) {
    const nextParts = rawLines[firstRowIdx].split(separator);
    // Se a próxima linha também parece header (unidades), pular
    if (looksLikeHeader(nextParts) && nextParts.length >= headers.length * 0.5) {
      firstRowIdx++;
    }
  }

  /* ── Parsear dados ──────────────────────────────────────────────── */
  const rows = [];
  for (let i = firstRowIdx; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    const parts = line.split(separator);
    const row = {};

    for (let j = 0; j < headers.length; j++) {
      const raw = (parts[j] || '').trim();
      const num = parseNumber(raw);
      row[headers[j]] = isNaN(num) ? raw : num;
    }

    rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error('Nenhuma linha de dados encontrada no arquivo LOG.');
  }

  /* ── Detectar coluna de volta ───────────────────────────────────── */
  const lapPatterns = [
    /^volta$/i, /^lap$/i, /^lap\s*number$/i, /^lapnr$/i,
    /^n.mero.*volta/i, /^vuelta$/i, /^runde$/i,
  ];

  let lapCol = null;
  for (const h of headers) {
    if (lapPatterns.some((p) => p.test(h))) {
      lapCol = h;
      break;
    }
  }

  // Fallback: procurar coluna que contém "lap" ou "volta"
  if (!lapCol) {
    lapCol = headers.find((h) => /lap|volta/i.test(h)) || null;
  }

  /* ── Agrupar por volta ──────────────────────────────────────────── */
  const laps = {};
  if (lapCol) {
    for (const row of rows) {
      const key = row[lapCol] ?? 1;
      if (!laps[key]) laps[key] = [];
      laps[key].push(row);
    }
  } else {
    // Sem coluna de volta — tudo como volta 1
    lapCol = 'Lap';
    for (const row of rows) {
      row[lapCol] = 1;
    }
    if (!headers.includes(lapCol)) headers.push(lapCol);
    laps[1] = rows;
  }

  return { headers, rows, laps, lapCol };
}
