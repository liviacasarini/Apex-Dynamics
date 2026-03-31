/**
 * dlfParser.js
 *
 * Parser para arquivos ProTune .DLF (Data Log File).
 *
 * Formato texto com seções:
 *   #STARTCHINFO … #ENDCHINFO  — definição de canais (nome, multiplicador, offset, casas decimais, tipo)
 *   #DATASTART                  — marcador de início de dados
 *     Linha 1: nomes de colunas separados por ";"
 *     Linha 2: unidades separadas por ";"
 *     Linhas 3+: linhas de dados com codificação delta
 *
 * Codificação delta (linhas de dados):
 *   <timestamp>[LetraAZ][valor][LetraAZ][valor]…[marcadorFim]
 *
 *   Cada letra A–Z indica um AVANÇO no índice de canal:
 *     A=1, B=2, …, Z=26
 *
 *   Se a letra for seguida de dígito, '-' ou '.':
 *     → o canal atual é atualizado com esse valor (vírgula = decimal BR)
 *   Caso contrário (próximo char é outra letra ou fim da linha):
 *     → skip puro; canal permanece com o valor anterior (carry-forward)
 *
 *   O trailing A (ou qualquer letra que ultrapassar o último canal) encerra a linha.
 *
 * Exemplo:
 *   " .204T29,8ZG0,75K4036,8"
 *   → ts=0.204  T(20)→canal 20=29.8  Z(26)→skip  G(7)→canal 53=0.75  K(11)→canal 64=4036.8
 */

/* ── Normalização de acentos ─────────────────────────────────────────────── */

/**
 * Remove diacríticos (acentos) de uma string, tornando-a ASCII-safe.
 *
 * Necessário porque o ProTune exporta nomes de canais em Windows-1252
 * com acentos inconsistentes: alguns canais usam "Rotacao" (sem acento)
 * enquanto outros usam "Distância" ou "Número" (com acento).
 * A normalização garante que os regex do channelDetector sempre caasem.
 *
 * Exemplos:
 *   "GPS Distância"          → "GPS Distancia"
 *   "GPS Número da Volta"    → "GPS Numero da Volta"
 *   "Sensor - Pressão do Óleo do Câmbio" → "Sensor - Pressao do Oleo do Cambio"
 */
function stripAccents(str) {
  return str
    .normalize('NFD')               // decompõe: â → a + ̂
    .replace(/[\u0300-\u036f]/g, '') // remove marcas diacríticas
    .replace(/\s+/g, ' ')           // normaliza espaços extras
    .trim();
}

/* ── Auto-split por GPS (gate crossing) ────────────────────────────────── */

/**
 * Divide uma sessão em voltas usando coordenadas GPS quando o contador
 * de volta do GPS não funcionou (todos os valores = 0).
 *
 * Algoritmo "gate crossing":
 *  1. Encontra o ponto de referência (start/finish) = primeira posição GPS
 *     onde a velocidade do veículo > 30 km/h
 *  2. Detecta cruzamentos: o kart se afasta > 100m do gate, depois retorna a < 25m
 *  3. Divide as linhas em voltas nos pontos de cruzamento
 *
 * @param {Object[]} rows - Todas as linhas de dados parseadas (com colunas como chave)
 * @param {string[]} headers - Headers do arquivo (já com stripAccents)
 * @returns {{ laps: Object, outLapIndex: number|null }|null}
 */
// ── Parâmetros de gate crossing ───────────────────────────────────────────
const GATE_R    = 25;   // metros – raio para detectar cruzamento
const FAR_R     = 100;  // metros – distância mínima antes de re-cruzar
const MIN_LAP_S = 30;   // segundos – tempo mínimo entre cruzamentos
const MIN_SPEED = 30;   // km/h – velocidade para identificar ponto de gate

// ── Haversine (distância em metros entre 2 pontos GPS) ──────────────────
function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Distância mínima (em metros) de um ponto P a um segmento de reta A→B.
 * Usa projeção flat-earth (suficiente para distâncias < 1 km).
 * Essencial para detectar gate crossings quando o GPS é esparso (1 Hz)
 * e o kart pode "pular" a zona do gate entre dois pontos consecutivos.
 */
function pointToSegDistM(pLat, pLng, aLat, aLng, bLat, bLng) {
  const DEG = Math.PI / 180;
  const cosP = Math.cos(pLat * DEG);
  // Converter para metros relativos a A
  const R = 6371000;
  const ax = 0, ay = 0;
  const bx = (bLng - aLng) * DEG * cosP * R;
  const by = (bLat - aLat) * DEG * R;
  const px = (pLng - aLng) * DEG * cosP * R;
  const py = (pLat - aLat) * DEG * R;
  // Projeção do ponto P no segmento AB
  const lenSq = bx * bx + by * by;
  if (lenSq < 0.01) return distM(pLat, pLng, aLat, aLng);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  const cx = t * bx;
  const cy = t * by;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

/**
 * Encontra coluna de GPS latitude nos headers.
 * Suporta: "GPS - Latitude", "GPS Latitude", "gps_lat", etc.
 */
function findGPSCols(headers) {
  const latCol = headers.find(h => /gps.*lat/i.test(h))
              || headers.find(h => /lat.*gps/i.test(h))
              || headers.find(h => /^lat(itude)?$/i.test(h));
  const lngCol = headers.find(h => /gps.*lon/i.test(h))
              || headers.find(h => /lon.*gps/i.test(h))
              || headers.find(h => /^lon(g|gitude)?$/i.test(h));
  return { latCol, lngCol };
}

/**
 * Encontra as coordenadas do gate (start/finish) a partir de um conjunto de rows.
 * Usa a primeira posição GPS com velocidade > MIN_SPEED.
 */
function findGatePosition(rows, headers) {
  const { latCol, lngCol } = findGPSCols(headers);
  const velCol = headers.find(h => h === 'Velocidade do Veiculo')
              || headers.find(h => /velocidade.*veiculo/i.test(h))
              || headers.find(h => /gps.*speed/i.test(h))
              || headers.find(h => /vehicle.*speed/i.test(h));

  if (!latCol || !lngCol) return null;

  for (const r of rows) {
    const lat = r[latCol];
    const lng = r[lngCol];
    const vel = velCol ? r[velCol] : MIN_SPEED + 1;
    if (lat && lng && lat !== 0 && lng !== 0 && vel > MIN_SPEED) {
      return { lat, lng, latCol, lngCol };
    }
  }
  return null;
}

/**
 * Splitta um conjunto de rows usando coordenadas de gate conhecidas.
 * @param {Array} rows — rows a splittar
 * @param {Object} headers — headers do arquivo
 * @param {number} [forcedGateLat] — latitude do gate (opcional, senão auto-detecta)
 * @param {number} [forcedGateLng] — longitude do gate (opcional, senão auto-detecta)
 * @param {number} [minLapSeconds] — tempo mínimo entre crossings (default: MIN_LAP_S)
 */
function splitByGPSGate(rows, headers, forcedGateLat, forcedGateLng, minLapSeconds) {
  const { latCol, lngCol } = findGPSCols(headers);
  const timeCol = headers[0]; // Datalog Time

  if (!latCol || !lngCol || !timeCol) return null;

  let gateLat = forcedGateLat ?? null;
  let gateLng = forcedGateLng ?? null;

  // Auto-detectar gate se não fornecido
  if (gateLat == null) {
    const gate = findGatePosition(rows, headers);
    if (!gate) return null;
    gateLat = gate.lat;
    gateLng = gate.lng;
  }
  if (gateLat == null) return null;

  // ── 2. Detectar cruzamentos ──────────────────────────────────────────────
  // Usa duas estratégias complementares:
  //  A) Ponto dentro do raio GATE_R (original)
  //  B) Segmento entre pontos GPS consecutivos passa pelo raio GATE_R
  //     (captura cruzamentos "pulados" quando GPS é esparso — ex: 1 Hz a 140+ km/h)
  const crossingIndices = [];
  let wasFar = false;
  let lastCrossingTime = -999;
  let prevLat = 0, prevLng = 0;
  let prevValidLat = 0, prevValidLng = 0; // último ponto GPS válido (não duplicado)
  let prevValidWasFar = false;             // wasFar no momento do ponto anterior

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i];
    const lat = r[latCol];
    const lng = r[lngCol];
    const t   = r[timeCol];

    // Só processar quando GPS atualizou (ignorar carry-forward repetido)
    if (!lat || !lng || lat === 0 || lng === 0) continue;
    if (lat === prevLat && lng === prevLng) continue;
    prevLat = lat; prevLng = lng;

    const d = distM(gateLat, gateLng, lat, lng);
    if (d > FAR_R) wasFar = true;
    const effectiveMinLap = minLapSeconds ?? MIN_LAP_S;

    let crossed = false;
    if (wasFar && (t - lastCrossingTime) > effectiveMinLap) {
      if (d < GATE_R) {
        // Estratégia A: ponto dentro do raio
        crossed = true;
      } else if (prevValidLat !== 0 && prevValidWasFar) {
        // Estratégia B: segmento prev→current cruza zona do gate
        const segDist = pointToSegDistM(gateLat, gateLng, prevValidLat, prevValidLng, lat, lng);
        if (segDist < GATE_R) {
          crossed = true;
        }
      }
    }

    if (crossed) {
      crossingIndices.push(i);
      wasFar = false;
      lastCrossingTime = t;
    }

    prevValidWasFar = wasFar;
    prevValidLat = lat;
    prevValidLng = lng;
  }

  // Precisa de pelo menos 2 cruzamentos para ter 1 volta completa
  if (crossingIndices.length < 2) return null;

  // ── 3. Dividir rows em laps ──────────────────────────────────────────────
  const laps = {};
  let lapIdx = 0;
  let start = 0;

  for (const crossIdx of crossingIndices) {
    if (crossIdx > start) {
      laps[lapIdx] = rows.slice(start, crossIdx);
      lapIdx++;
    }
    start = crossIdx;
  }
  // Última volta (do último cruzamento até o fim dos dados)
  if (start < rows.length) {
    laps[lapIdx] = rows.slice(start);
  }

  // outLapIndex: segmento antes do 1º cruzamento = saída do box
  const outLapIndex = Object.keys(laps).length > 1 ? 0 : null;

  return { laps, outLapIndex };
}

/* ── Detecção de coluna de volta ─────────────────────────────────────────── */

function detectLapDLF(headers) {
  const notLap = /time|tempo|duration|speed|velocidade|dist|press|temp|lambda|rpm|throttle|accel|gyro|\bvolt\b|current|battery|oil|fuel|water|lat|lon|lng|alt|heading|bearing|tps|\bmap\b/i;

  // 1. Nome exato
  const exact = headers.find((h) => /^(volta|lap|vuelta)$/i.test(h.trim()));
  if (exact) return exact;

  // 2. Composto específico (ex: "GPS Numero da Volta(Dash)")
  const compound = headers.find((h) => {
    const t = h.trim();
    return (
      /lap.*(num|number|no\b|#|id\b)/i.test(t) ||
      /numero.*volta/i.test(t) ||
      /volta.*num/i.test(t)
    ) && !notLap.test(t);
  });
  if (compound) return compound;

  // 3. GPS lap
  const gps = headers.find((h) => {
    const t = h.trim();
    return (/gps.*volta/i.test(t) || /gps.*lap/i.test(t)) && !notLap.test(t);
  });
  if (gps) return gps;

  // 4. Broad: qualquer coluna com "lap" ou "volta" que não seja canal de valor contínuo
  const broad = headers.find((h) => {
    const t = h.trim();
    return (/\blap\b/i.test(t) || /\bvolta\b/i.test(t)) && !notLap.test(t);
  });
  return broad || '';
}

/* ── Parser principal ────────────────────────────────────────────────────── */

/**
 * Parseia um arquivo ProTune DLF.
 *
 * @param {string} text - Conteúdo bruto do arquivo .dlf (lido como windows-1252)
 * @returns {{ headers: string[], rows: object[], laps: object, lapCol: string }}
 * @throws {Error} se o arquivo for inválido ou vazio
 */
export function parseDLF(text) {
  const lines = text.replace(/\r/g, '').split('\n');

  /* ── 1. Detectar tipo de dispositivo (#DEVICE ECU vs Dash) ────────────── */
  // Arquivos de ECU têm "#DEVICE ECU" na segunda linha.
  // Arquivos de Dash têm "#DASHVERSION" e não têm "#DEVICE".
  // A distinção importa porque ECUs gravam continuamente o dia inteiro,
  // gerando múltiplas sessões mescladas sob o mesmo número de volta.
  let deviceType = 'DASH'; // padrão: Dash/Display
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const t = lines[i].trim();
    if (t.startsWith('#DEVICE')) {
      // Ex: "#DEVICE ECU" → "ECU"; "#DEVICE DASH" → "DASH"
      deviceType = t.replace('#DEVICE', '').trim().toUpperCase() || 'UNKNOWN';
      break;
    }
  }

  /* ── 1b. Extrair #DASHTRIGGERPOINT (coordenadas da linha de chegada) ─── */
  // ProTune salva lat/lng em microdegrees (÷1e6) + raio em metros.
  // Essas coordenadas são a referência mais precisa para detectar voltas.
  let triggerLat = null, triggerLng = null;
  {
    let inBlock = false;
    const vals = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === '#DASHTRIGGERPOINT') { inBlock = true; continue; }
      if (t === '#ENDDASHTRIGGERPOINT') { inBlock = false; break; }
      if (inBlock && t) vals.push(parseInt(t, 10));
    }
    if (vals.length >= 2 && !isNaN(vals[0]) && !isNaN(vals[1]) && vals[0] !== 0 && vals[1] !== 0) {
      triggerLat = vals[0] / 1e6;
      triggerLng = vals[1] / 1e6;
    }
  }

  /* ── 2. Localizar #DATASTART ──────────────────────────────────────────── */

  let dataStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '#DATASTART') {
      dataStartIdx = i;
      break;
    }
  }
  if (dataStartIdx < 0) {
    throw new Error('Arquivo DLF inválido: seção #DATASTART não encontrada.');
  }

  /* ── 2. Header de colunas (primeira linha não-vazia após #DATASTART) ─── */

  let colHeaderIdx = dataStartIdx + 1;
  while (colHeaderIdx < lines.length && !lines[colHeaderIdx].trim()) colHeaderIdx++;
  const colHeaderLine = lines[colHeaderIdx] || '';
  const rawCols = colHeaderLine.split(';').map((c) => c.trim());

  // Remover última entrada vazia causada pelo ";" final
  while (rawCols.length > 0 && rawCols[rawCols.length - 1] === '') rawCols.pop();

  if (rawCols.length < 2) {
    throw new Error('Arquivo DLF inválido: header de colunas vazio ou corrompido.');
  }

  // rawCols[0] = "Datalog Time" (timestamp), rawCols[1..N] = canais
  // Normalizar acentos: windows-1252 pode gerar "Distância", "Número", etc.
  // que quebram os regex do channelDetector. stripAccents os torna ASCII-safe.
  const headers      = rawCols.map(stripAccents);
  const channelCount = headers.length - 1; // ex: 86 canais + 1 timestamp = 87

  /* ── 3. Linha de unidades (linha após o header de colunas) ───────────── */
  // Unidades são usadas pelo channelDetector para detectar canais com nomes customizados.
  // Ex: "km/h" → velocidade, "V" → bateria, "bar" → pressão, "°C" → temperatura
  const unitLine = lines[colHeaderIdx + 1] || '';
  const rawUnits = unitLine.split(';').map((u) => u.trim());
  while (rawUnits.length > 0 && rawUnits[rawUnits.length - 1] === '') rawUnits.pop();
  // Garantir que units tenha o mesmo tamanho que headers (preencher com '' se necessário)
  const units = headers.map((_, i) => rawUnits[i] || '');

  /* ── 4. Parse das linhas de dados (a partir da linha de unidades + 1) ── */

  // Estado persistente: valores carry-forward (última leitura de cada canal)
  const currentValues = new Array(channelCount).fill(NaN);
  const rows = [];

  const dataLines = lines.slice(colHeaderIdx + 2);

  for (const rawLine of dataLines) {
    if (!rawLine || !rawLine.trim()) continue;

    const line = rawLine.trim();

    /* ── 4a. Extrair timestamp ────────────────────────────────────────── */
    // Timestamp: sequência inicial de chars que NÃO são letras A–Z maiúsculas
    let tsEnd = 0;
    while (tsEnd < line.length && (line[tsEnd] < 'A' || line[tsEnd] > 'Z')) tsEnd++;

    const tsStr = line.slice(0, tsEnd).replace(/,/g, '.').trim();
    const timestamp = parseFloat(tsStr);
    if (isNaN(timestamp)) continue;

    /* ── 4b. Decodificar canais ───────────────────────────────────────── */
    let pos = 0;   // posição atual (1-indexed: 1 = primeiro canal de dados)
    let i   = tsEnd;

    while (i < line.length) {
      const c = line[i];

      // Deve ser letra A–Z (qualquer outro char é ignorado)
      if (c < 'A' || c > 'Z') { i++; continue; }

      const jump = c.charCodeAt(0) - 64; // A=1, B=2, …, Z=26
      i++;

      pos += jump;
      if (pos > channelCount) break; // ultrapassou o último canal → fim da linha

      // Checar se o próximo char inicia um valor numérico
      if (
        i < line.length &&
        (
          (line[i] >= '0' && line[i] <= '9') ||
          line[i] === '-' ||
          line[i] === '.'
        )
      ) {
        // Ler até a próxima letra A–Z (ou fim da string)
        let valEnd = i;
        if (line[valEnd] === '-') valEnd++; // avançar o sinal de menos
        while (valEnd < line.length && (line[valEnd] < 'A' || line[valEnd] > 'Z')) valEnd++;

        const valStr = line.slice(i, valEnd).replace(/,/g, '.');
        const val    = parseFloat(valStr);
        if (!isNaN(val)) {
          currentValues[pos - 1] = val; // 0-indexed no array interno
        }
        i = valEnd;
      }
      // else: skip puro — currentValues[pos-1] permanece inalterado (carry-forward)
    }

    /* ── 4c. Montar objeto da linha ──────────────────────────────────── */
    const row = {};
    row[headers[0]] = timestamp; // "Datalog Time"
    for (let j = 0; j < channelCount; j++) {
      row[headers[j + 1]] = isNaN(currentValues[j]) ? 0 : currentValues[j];
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error('Arquivo DLF não contém linhas de dados válidas.');
  }

  /* ── 5. Detecção de volta e agrupamento ──────────────────────────────── */
  // Estratégia: GPS gate crossing é a fonte de verdade para separação de voltas.
  // O lap counter do ProTune é notoriamente impreciso (resets, ruído, misses).
  //
  // Prioridade:
  //  1. GPS gate crossing usando #DASHTRIGGERPOINT (coordenadas da linha de chegada)
  //  2. GPS gate crossing auto-detectado (primeiro ponto rápido)
  //  3. Lap counter do arquivo (como fallback)
  //  4. Sessão inteira como volta única

  const lapCol = detectLapDLF(headers.slice(1));
  const laps   = {};
  const timeCol = headers[0];
  const { latCol: gpsLatCol, lngCol: gpsLngCol } = findGPSCols(headers);
  const hasGPS = !!(gpsLatCol && gpsLngCol);
  let gpsSplit = false;
  let outLapIndex = null;

  // ── Estratégia 1: GPS gate crossing (trigger point do ProTune) ──────────
  if (hasGPS && rows.length > 100) {
    let gateLat = triggerLat;
    let gateLng = triggerLng;

    // Se não tem trigger point, tentar auto-detectar via lap counter transitions
    if (gateLat == null && lapCol) {
      // Coletar posições GPS nos momentos de transição do lap counter
      const transitions = [];
      for (let i = 1; i < rows.length; i++) {
        const prevLn = rows[i - 1][lapCol];
        const curLn  = rows[i][lapCol];
        if (prevLn != null && curLn != null && curLn !== prevLn && curLn > prevLn) {
          const lat = rows[i][gpsLatCol];
          const lng = rows[i][gpsLngCol];
          if (lat && lng && lat !== 0 && lng !== 0) {
            transitions.push({ lat, lng });
          }
        }
      }
      if (transitions.length >= 2) {
        // Mediana das transições como gate (robusto a outliers)
        transitions.sort((a, b) => a.lat - b.lat);
        gateLat = transitions[Math.floor(transitions.length / 2)].lat;
        transitions.sort((a, b) => a.lng - b.lng);
        gateLng = transitions[Math.floor(transitions.length / 2)].lng;
        console.log(`[dlfParser] Gate detectado via ${transitions.length} transições do lap counter: ${gateLat.toFixed(6)}, ${gateLng.toFixed(6)}`);
      }
    }

    // Fallback: usar primeiro ponto GPS rápido
    if (gateLat == null) {
      const gate = findGatePosition(rows, headers);
      if (gate) { gateLat = gate.lat; gateLng = gate.lng; }
    }

    // Executar GPS gate crossing
    if (gateLat != null) {
      const gpsResult = splitByGPSGate(rows, headers, gateLat, gateLng);
      if (gpsResult && Object.keys(gpsResult.laps).length >= 2) {
        for (const [k, v] of Object.entries(gpsResult.laps)) laps[k] = v;
        gpsSplit = true;
        outLapIndex = 0;
        console.log(`[dlfParser] GPS gate crossing: ${Object.keys(laps).length} segmentos detectados` +
          (triggerLat != null ? ' (usando DASHTRIGGERPOINT)' : ' (gate auto-detectado)'));

        // ── Hybrid fix: re-split voltas longas ─────────────────────────────
        // GPS pode perder cruzamentos (accuracy, velocidade, pit entry/exit).
        // Single pass com 3 estratégias:
        //  A) Lap counter transitions (min 3s entre splits)
        //  B) GPS closest approach ao gate (captura missed crossings)
        //  C) Speed drop / pit stop (velocidade ~0 prolongada, > 10s)
        {
          const lKeys = Object.keys(laps).sort((a, b) => Number(a) - Number(b));
          const durations = {};
          for (const k of lKeys) {
            const lr = laps[k];
            const ts = lr.map(r => r[timeCol]).filter(v => v != null && !isNaN(v));
            durations[k] = ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0;
          }
          const validDurs = Object.values(durations).filter(d => d >= 30).sort((a, b) => a - b);
          if (validDurs.length >= 2) {
            const refIdx = Math.max(0, Math.floor(validDurs.length * 0.25));
            const refDur = validDurs[refIdx]; // P25
            const threshold = refDur * 1.5;
            let needReindex = false;

            const velCol = headers.find(h => h === 'Velocidade do Veiculo')
                        || headers.find(h => /velocidade.*veiculo/i.test(h))
                        || headers.find(h => /gps.*speed/i.test(h))
                        || headers.find(h => /vehicle.*speed/i.test(h));

            for (const k of lKeys) {
              if (durations[k] <= threshold) continue;
              const lapR = laps[k];

              // ── Estratégia A: lap counter transitions ──────────────────────
              let splitDone = false;
              if (lapCol) {
                const splits = [0];
                for (let ri = 1; ri < lapR.length; ri++) {
                  const prev = lapR[ri - 1][lapCol];
                  const cur  = lapR[ri][lapCol];
                  if (prev != null && cur != null && cur !== prev) {
                    const tSplit = lapR[ri][timeCol] || 0;
                    const tPrev  = lapR[splits[splits.length - 1]][timeCol] || 0;
                    // Min 3s (reduzido de 20s) para capturar transições logo
                    // no início da volta quando boundary GPS está ligeiramente off
                    if (tSplit - tPrev >= 3) {
                      splits.push(ri);
                    }
                  }
                }
                if (splits.length >= 2) {
                  splits.push(lapR.length);
                  const subLaps = {};
                  for (let s = 0; s < splits.length - 1; s++) {
                    const sub = lapR.slice(splits[s], splits[s + 1]);
                    if (sub.length > 0) subLaps[s] = sub;
                  }
                  if (Object.keys(subLaps).length >= 2) {
                    laps[k] = { __split: true, subLaps };
                    needReindex = true;
                    splitDone = true;
                    const subDurs = Object.values(subLaps).map(sr => {
                      const ts = sr.map(r => r[timeCol]);
                      return ((ts[ts.length-1]||0) - (ts[0]||0)).toFixed(0);
                    });
                    console.log(`[dlfParser] Hybrid split A (counter): volta ${k} (${durations[k].toFixed(0)}s) → ${Object.keys(subLaps).length} sub-voltas (${subDurs.join('s, ')}s)`);
                  }
                }
              }

              // ── Estratégia B: GPS closest approach ─────────────────────────
              // Procura o ponto mais próximo ao gate no interior da volta.
              // Ignora margens de 15% para evitar split nas fronteiras.
              if (!splitDone && hasGPS) {
                const marginRows = Math.floor(lapR.length * 0.15);
                let bestDist = Infinity, bestIdx = -1;
                let pLat = 0, pLng = 0;

                for (let ri = marginRows; ri < lapR.length - marginRows; ri++) {
                  const rr = lapR[ri];
                  const la = rr[gpsLatCol], lo = rr[gpsLngCol];
                  if (!la || !lo || la === 0 || lo === 0) continue;
                  if (la === pLat && lo === pLng) continue;
                  pLat = la; pLng = lo;
                  const d = distM(gateLat, gateLng, la, lo);
                  if (d < bestDist) { bestDist = d; bestIdx = ri; }
                }

                // Split se ambos segmentos > 30s e distância < 75m
                if (bestIdx > 0 && bestDist < FAR_R * 0.75) {
                  const tBest  = lapR[bestIdx][timeCol] || 0;
                  const tStart = lapR[0][timeCol] || 0;
                  const tEnd   = lapR[lapR.length - 1][timeCol] || 0;
                  const segA = tBest - tStart;
                  const segB = tEnd - tBest;
                  if (segA >= 30 && segB >= 30) {
                    laps[k] = { __split: true, subLaps: { 0: lapR.slice(0, bestIdx), 1: lapR.slice(bestIdx) } };
                    needReindex = true;
                    splitDone = true;
                    console.log(`[dlfParser] Hybrid split B (GPS closest): volta ${k} (${durations[k].toFixed(0)}s) → 2 sub-voltas (${segA.toFixed(0)}s, ${segB.toFixed(0)}s) dist=${bestDist.toFixed(0)}m`);
                  }
                }
              }

              // ── Estratégia C: speed drop (pit stop) ────────────────────────
              // Detecta parada prolongada (velocidade < 5 km/h por > 10s).
              // Ambos segmentos devem ser > 50% da ref para evitar fragmentos.
              if (!splitDone && velCol) {
                let stopStart = -1, stopEnd = -1;
                let bestStopDuration = 0;
                let inStop = false, curStopStart = -1;

                for (let ri = 0; ri < lapR.length; ri++) {
                  const spd = lapR[ri][velCol] || 0;
                  if (spd < 5) {
                    if (!inStop) { inStop = true; curStopStart = ri; }
                  } else {
                    if (inStop) {
                      const dur = (lapR[ri][timeCol] || 0) - (lapR[curStopStart][timeCol] || 0);
                      if (dur > bestStopDuration && dur >= 10) {
                        bestStopDuration = dur;
                        stopStart = curStopStart;
                        stopEnd = ri;
                      }
                      inStop = false;
                    }
                  }
                }
                if (stopStart >= 0 && stopEnd > stopStart) {
                  const splitIdx = Math.floor((stopStart + stopEnd) / 2);
                  const tSplit = lapR[splitIdx][timeCol] || 0;
                  const tStart = lapR[0][timeCol] || 0;
                  const tEnd   = lapR[lapR.length - 1][timeCol] || 0;
                  const segA = tSplit - tStart;
                  const segB = tEnd - tSplit;
                  const minSeg = refDur * 0.4;
                  if (segA >= minSeg && segB >= minSeg) {
                    laps[k] = { __split: true, subLaps: { 0: lapR.slice(0, splitIdx), 1: lapR.slice(splitIdx) } };
                    needReindex = true;
                    splitDone = true;
                    console.log(`[dlfParser] Hybrid split C (pit stop): volta ${k} (${durations[k].toFixed(0)}s) → 2 sub-voltas (${segA.toFixed(0)}s, ${segB.toFixed(0)}s) stop=${bestStopDuration.toFixed(0)}s`);
                  }
                }
              }
            }

            // Reorganizar índices para flatten __split
            const flattenSplits = () => {
              const newLaps = {};
              let newIdx = 0;
              for (const k of Object.keys(laps).sort((a, b) => Number(a) - Number(b))) {
                const entry = laps[k];
                if (entry?.__split) {
                  for (const sk of Object.keys(entry.subLaps).sort((a, b) => Number(a) - Number(b))) {
                    if (entry.subLaps[sk].length > 0) { newLaps[newIdx] = entry.subLaps[sk]; newIdx++; }
                  }
                } else {
                  newLaps[newIdx] = entry; newIdx++;
                }
              }
              for (const k of Object.keys(laps)) delete laps[k];
              for (const [k, v] of Object.entries(newLaps)) laps[k] = v;
            };

            if (needReindex) flattenSplits();

            // ── 2ª passada: re-verificar sub-laps com B+C ───────────────
            // Sub-laps criados na 1ª passada podem ainda estar acima do threshold.
            // Só usa Strategy B (GPS closest) e C (pit stop) — sem counter
            // para evitar cascata de micro-splits.
            {
              const lKeys2 = Object.keys(laps).sort((a, b) => Number(a) - Number(b));
              const durations2 = {};
              for (const k of lKeys2) {
                const lr = laps[k];
                if (!Array.isArray(lr)) continue;
                const ts = lr.map(r => r[timeCol]).filter(v => v != null && !isNaN(v));
                durations2[k] = ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0;
              }
              const validDurs2 = Object.values(durations2).filter(d => d >= 30).sort((a, b) => a - b);
              if (validDurs2.length >= 2) {
                const refIdx2 = Math.max(0, Math.floor(validDurs2.length * 0.25));
                const refDur2 = validDurs2[refIdx2];
                const threshold2 = refDur2 * 1.5;
                let needReindex2 = false;

                for (const k of lKeys2) {
                  if ((durations2[k] || 0) <= threshold2) continue;
                  const lapR = laps[k];
                  if (!Array.isArray(lapR)) continue;
                  let splitDone = false;

                  // Strategy B: GPS closest
                  if (!splitDone && hasGPS) {
                    const marginRows = Math.floor(lapR.length * 0.15);
                    let bestDist = Infinity, bestIdx = -1;
                    let pLt = 0, pLn = 0;
                    for (let ri = marginRows; ri < lapR.length - marginRows; ri++) {
                      const la = lapR[ri][gpsLatCol], lo = lapR[ri][gpsLngCol];
                      if (!la || !lo || la === 0 || lo === 0) continue;
                      if (la === pLt && lo === pLn) continue;
                      pLt = la; pLn = lo;
                      const d = distM(gateLat, gateLng, la, lo);
                      if (d < bestDist) { bestDist = d; bestIdx = ri; }
                    }
                    if (bestIdx > 0 && bestDist < FAR_R * 0.75) {
                      const tBest  = lapR[bestIdx][timeCol] || 0;
                      const tStart = lapR[0][timeCol] || 0;
                      const tEnd   = lapR[lapR.length - 1][timeCol] || 0;
                      if ((tBest - tStart) >= 30 && (tEnd - tBest) >= 30) {
                        laps[k] = { __split: true, subLaps: { 0: lapR.slice(0, bestIdx), 1: lapR.slice(bestIdx) } };
                        needReindex2 = true;
                        splitDone = true;
                        console.log(`[dlfParser] Hybrid split B (pass 2): volta ${k} (${durations2[k].toFixed(0)}s) → 2 sub-voltas (${(tBest-tStart).toFixed(0)}s, ${(tEnd-tBest).toFixed(0)}s) dist=${bestDist.toFixed(0)}m`);
                      }
                    }
                  }

                  // Strategy C: pit stop
                  if (!splitDone && velCol) {
                    let stopStart = -1, stopEnd = -1, bestDur = 0, inS = false, curS = -1;
                    for (let ri = 0; ri < lapR.length; ri++) {
                      const spd = lapR[ri][velCol] || 0;
                      if (spd < 5) { if (!inS) { inS = true; curS = ri; } }
                      else if (inS) {
                        const d = (lapR[ri][timeCol]||0) - (lapR[curS][timeCol]||0);
                        if (d > bestDur && d >= 10) { bestDur = d; stopStart = curS; stopEnd = ri; }
                        inS = false;
                      }
                    }
                    if (stopStart >= 0) {
                      const si = Math.floor((stopStart + stopEnd) / 2);
                      const tS = lapR[si][timeCol]||0, t0 = lapR[0][timeCol]||0, t1 = lapR[lapR.length-1][timeCol]||0;
                      const minSeg = refDur2 * 0.4;
                      if ((tS-t0) >= minSeg && (t1-tS) >= minSeg) {
                        laps[k] = { __split: true, subLaps: { 0: lapR.slice(0, si), 1: lapR.slice(si) } };
                        needReindex2 = true;
                        splitDone = true;
                        console.log(`[dlfParser] Hybrid split C (pass 2): volta ${k} (${durations2[k].toFixed(0)}s) → 2 sub-voltas (${(tS-t0).toFixed(0)}s, ${(t1-tS).toFixed(0)}s) stop=${bestDur.toFixed(0)}s`);
                      }
                    }
                  }
                }
                if (needReindex2) flattenSplits();
              }
            }
          }
        }
      }
    }
  }

  // ── Estratégia 2: Lap counter do arquivo (fallback) ─────────────────────
  if (!gpsSplit && lapCol) {
    const MIN_NOISE_S = 30;

    // Passo 1: segmentos brutos (uma entrada por mudança de contador)
    const rawSegs = [];
    let segRows = [], segLn = null;
    for (const r of rows) {
      const ln = r[lapCol];
      if (ln == null || isNaN(ln)) continue;
      if (segLn === null) {
        segLn = ln;
      } else if (ln !== segLn) {
        rawSegs.push({ rows: segRows, ln: segLn });
        segRows = [];
        segLn = ln;
      }
      segRows.push(r);
    }
    if (segRows.length > 0) rawSegs.push({ rows: segRows, ln: segLn });

    rawSegs.forEach((seg, idx) => {
      seg.isReset = idx > 0 && Number(seg.ln) < Number(rawSegs[idx - 1].ln);
    });

    const segDur = (seg) => {
      const ts = seg.rows.map(r => r[timeCol]).filter(v => v != null && !isNaN(v));
      return ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0;
    };

    // Passo 2: fundir ruído GPS (segmento curto seguido de reset)
    const merged = [];
    let i = 0;
    while (i < rawSegs.length) {
      const seg  = rawSegs[i];
      const next = rawSegs[i + 1];
      const dur     = segDur(seg);
      const isNoise = dur < MIN_NOISE_S &&
                      merged.length > 0 &&
                      next != null &&
                      next.isReset;
      if (isNoise) {
        merged[merged.length - 1].rows = merged[merged.length - 1].rows
          .concat(seg.rows, next.rows);
        i += 2;
      } else {
        merged.push({ rows: [...seg.rows], firstIsReset: seg.isReset });
        i += 1;
      }
    }

    // Passo 3: fundir último segmento curto com reset
    if (merged.length >= 2 && merged[merged.length - 1].firstIsReset) {
      const lastDur = segDur(merged[merged.length - 1]);
      if (lastDur < MIN_NOISE_S) {
        merged[merged.length - 2].rows = merged[merged.length - 2].rows
          .concat(merged[merged.length - 1].rows);
        merged.pop();
      }
    }

    // Passo 4: montar laps
    const startIdx = merged.length === 1 ? 1 : 0;
    let lapIdx = startIdx;
    merged.forEach((seg, idx) => {
      if (lapCol && idx > 0 && seg.rows.length > 0) {
        const midRow = seg.rows[Math.floor(seg.rows.length / 2)];
        if (midRow?.[lapCol] === 0) {
          const dur = segDur(seg);
          if (dur < MIN_NOISE_S) return;
        }
      }
      laps[lapIdx] = seg.rows;
      lapIdx++;
    });

    // Detectar out-lap
    if (Object.keys(laps).length > 1 && laps[0]?.length > 0 && lapCol) {
      const midRow = laps[0][Math.floor(laps[0].length / 2)];
      if (midRow?.[lapCol] === 0) outLapIndex = 0;
    }

    console.log(`[dlfParser] Lap counter: ${Object.keys(laps).length} segmentos detectados`);
  }

  // ── Estratégia 3: Fallback — sessão inteira como volta única ────────────
  if (Object.keys(laps).length === 0 && rows.length > 0) {
    laps['1'] = rows;
  }

  return { headers, units, rows, laps, lapCol, deviceType, outLapIndex };
}
