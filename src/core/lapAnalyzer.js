/**
 * lapAnalyzer.js
 *
 * Motor de análise de cada volta: calcula métricas de performance,
 * zonas de frenagem, percentual de aceleração total, coasting, etc.
 */

/**
 * Extrai valores numéricos válidos de um canal ao longo da volta.
 */
function getValues(lapData, channelName) {
  return lapData
    .map((r) => r[channelName])
    .filter((v) => v !== null && v !== undefined && !isNaN(v));
}

/**
 * Calcula min, max, avg de um array de números.
 * Usa loop em vez de spread para evitar RangeError com arrays muito grandes.
 */
function stats(arr) {
  if (!arr.length) return { min: 0, max: 0, avg: 0 };
  let min = arr[0], max = arr[0], sum = 0;
  for (const v of arr) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, avg: sum / arr.length };
}

/**
 * Conta zonas de frenagem (transições de não-freio para freio).
 */
function countBrakeZones(brakeValues, threshold = 5) {
  let zones = 0;
  let inBrake = false;

  for (const b of brakeValues) {
    if (b > threshold && !inBrake) {
      zones++;
      inBrake = true;
    }
    if (b <= 2) {
      inBrake = false;
    }
  }

  return zones;
}

/**
 * Conta zonas de frenagem detectadas por desaceleração da velocidade.
 * Usado como fallback quando não há canal de freio disponível.
 */
function countBrakeZonesFromSpeed(speeds) {
  if (speeds.length < 5) return 0;

  // Suaviza o sinal para reduzir ruído de GPS
  const smoothed = speeds.map((_, i) => {
    const slice = speeds.slice(Math.max(0, i - 2), i + 3);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  const MIN_DROP = 8; // queda mínima em km/h para contar como zona de frenagem
  let zones = 0;
  let inBrake = false;
  let peakSpeed = 0;

  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i] - smoothed[i - 1];
    if (!inBrake && delta < -0.5) {
      inBrake = true;
      peakSpeed = smoothed[i - 1];
    } else if (inBrake && delta > 1) {
      if (peakSpeed - smoothed[i - 1] >= MIN_DROP) zones++;
      inBrake = false;
      peakSpeed = 0;
    }
  }
  // Verifica última zona
  if (inBrake && peakSpeed - smoothed[smoothed.length - 1] >= MIN_DROP) zones++;

  return zones;
}

/**
 * Analisa uma única volta e retorna objeto com todas as métricas.
 *
 * @param {Object[]} lapData - Array de rows daquela volta.
 * @param {Object} channels - Mapa de canais detectados.
 * @returns {Object|null} Métricas da volta ou null se dados insuficientes.
 */
export function analyzeLap(lapData, channels, deviceType = 'DASH') {
  if (!lapData || lapData.length < 10) return null;

  const ch = channels;

  // ── Detecção de fusão multi-sessão (exclusivo para arquivos de ECU) ──────
  // ECUs ProTune gravam continuamente o dia inteiro: treino livre, Q1, Q2,
  // corrida — tudo em um único arquivo. O GPS lap counter reseta por sessão,
  // mas o Datalog Time continua. Resultado: "Lap 3" pode conter dados de
  // 3 sessões diferentes separados por gaps de centenas de segundos.
  // Detectamos gaps > 10s e usamos APENAS o segmento mais curto válido
  // para garantir métricas corretas (lapTime, maxRPM, Vmax, etc.).
  //
  // Arquivos de Dash (#DASHVERSION) são por sessão individual → sem fusão.
  const isECU = deviceType === 'ECU';
  const GAP_THRESHOLD_S = 10;  // gap > 10s entre amostras = fronteira de sessão
  const MIN_SEG_S       = 30;  // duração mínima de um segmento válido (s)

  let effectiveData = lapData;
  // longestSegmentTime: duração do segmento mais longo válido encontrado no lap mergeado.
  // Usado para filtrar laps com sub-laps longos (ex.: out-lap de 25min) mesmo que o
  // melhor segmento (lapTime) seja curto. Para laps sem multi-sessão = lapTime.
  let longestSegmentTime = 0;

  if (isECU && ch.time && lapData.length > 2) {
    const segments = [];
    let segStart = 0;
    for (let k = 1; k < lapData.length; k++) {
      const prev = lapData[k - 1][ch.time];
      const curr = lapData[k][ch.time];
      if (prev != null && curr != null && !isNaN(prev) && !isNaN(curr) &&
          (curr - prev) > GAP_THRESHOLD_S) {
        segments.push({ start: segStart, end: k - 1 });
        segStart = k;
      }
    }
    segments.push({ start: segStart, end: lapData.length - 1 });

    if (segments.length > 1) {
      // Múltiplas sessões mescladas → escolher o segmento mais curto com dados válidos
      // (= a volta mais rápida real desse número de volta)
      let bestSeg = null;
      for (const seg of segments) {
        const t0 = lapData[seg.start][ch.time];
        const tN = lapData[seg.end][ch.time];
        if (t0 == null || tN == null || isNaN(t0) || isNaN(tN)) continue;
        const dur = tN - t0;
        if (dur < MIN_SEG_S) continue; // descarta micro-segmentos (cruze de beacon)

        // Validar que o segmento tem dados de movimento (carro em pista)
        // Descarta segmentos onde a velocidade máxima < 10 km/h (carro parado/motor off)
        if (ch.gpsSpeed) {
          let segMaxSpeed = 0;
          for (let s = seg.start; s <= seg.end; s++) {
            const v = lapData[s][ch.gpsSpeed];
            if (v != null && !isNaN(v) && v > segMaxSpeed) segMaxSpeed = v;
          }
          if (segMaxSpeed < 10) continue; // segmento sem velocidade = descartado
        }

        // Rastreia o segmento mais longo (para filtro de laps com out-lap misturado)
        if (dur > longestSegmentTime) longestSegmentTime = dur;

        if (!bestSeg || dur < bestSeg.dur) bestSeg = { ...seg, dur };
      }
      if (bestSeg) {
        effectiveData = lapData.slice(bestSeg.start, bestSeg.end + 1);
      }
    }
  }

  const speeds   = ch.gpsSpeed   ? getValues(effectiveData, ch.gpsSpeed)   : [];
  const rpms     = ch.rpm        ? getValues(effectiveData, ch.rpm)        : [];
  let   throttle = ch.throttle   ? getValues(effectiveData, ch.throttle)   : [];
  const times    = ch.time       ? getValues(effectiveData, ch.time)       : [];
  const temps    = ch.engineTemp ? getValues(effectiveData, ch.engineTemp) : [];
  const oils     = ch.oilPressure? getValues(effectiveData, ch.oilPressure): [];
  const lambdas  = ch.lambda     ? getValues(effectiveData, ch.lambda)     : [];

  // Freio: 1° canal direto; 2° derivado do acelerómetro (Freio = aceleração * -1);
  // 3° estimado por desaceleração de velocidade GPS
  let brakes = [];
  if (ch.brake) {
    brakes = getValues(effectiveData, ch.brake);
  } else if (ch.accel) {
    // Freio = -aceleração (valores negativos de accel = desaceleração)
    brakes = effectiveData
      .map((r) => r[ch.accel])
      .filter((v) => v !== null && v !== undefined && !isNaN(v))
      .map((a) => Math.max(0, -a * 100)); // escala para 0-100
  }

  // Tempo da volta — usa diff de Datalog Time (já filtrado pelo melhor segmento acima).
  // O canal lapTimeGPS é usado apenas como fallback quando não há timestamps.
  //
  // Nota: no ProTune DLF, "GPS Tempo da Volta(Dash)" armazena o tempo da volta ANTERIOR
  // nas primeiras linhas da volta atual (carry-forward do beacon GPS ao cruzar a linha).
  // Por isso NÃO é usado como fonte primária.
  let lapTime = 0;
  if (times.length > 1) {
    const diff = times[times.length - 1] - times[0];
    if (diff > 0) lapTime = diff;
  }
  // Fallback: canal GPS lap time quando não há timestamps de Datalog Time disponíveis
  if (lapTime <= 0 && ch.lapTimeGPS && effectiveData.length > 0) {
    // Usa a última leitura válida da volta (mais provável de ser o tempo correto)
    for (let k = effectiveData.length - 1; k >= 0; k--) {
      const ltVal = effectiveData[k][ch.lapTimeGPS];
      if (ltVal !== null && ltVal !== undefined && !isNaN(ltVal) && ltVal > 0 && ltVal <= 3600) {
        lapTime = ltVal;
        break;
      }
    }
  }

  // Se não houve multi-sessão, longestSegmentTime = lapTime (único segmento)
  if (longestSegmentTime <= 0) longestSegmentTime = lapTime;

  // Velocidade
  const speedStats = stats(speeds);

  // RPM
  const rpmStats = stats(rpms);

  // Zonas de frenagem — usa canal direto se disponível, senão calcula por desaceleração
  const brakeZones = brakes.length > 0
    ? countBrakeZones(brakes)
    : countBrakeZonesFromSpeed(speeds);

  // Percentual de frenagem
  let brakePct = 0;
  if (brakes.length > 0) {
    brakePct = brakes.length
      ? (brakes.filter((b) => b > 5).length / brakes.length) * 100
      : 0;
  } else if (speeds.length > 1) {
    // Estima por desaceleração: suaviza velocidade e conta amostras em queda
    const smoothed = speeds.map((_, i) => {
      const s = speeds.slice(Math.max(0, i - 2), i + 3);
      return s.reduce((a, b) => a + b, 0) / s.length;
    });
    let decFrames = 0;
    for (let i = 1; i < smoothed.length; i++) {
      if (smoothed[i] - smoothed[i - 1] < -0.3) decFrames++;
    }
    brakePct = speeds.length ? (decFrames / speeds.length) * 100 : 0;
  }

  // ── Threshold do acelerador ─────────────────────────────────────────────
  // fullThrottlePct = % do tempo com acelerador pressionado a fundo (100%).
  //
  // Sensores TPS podem ter escalas diferentes (0-100, 0-1, max real < 100),
  // então normalizamos usando o máximo real (P99) do sensor como referência.
  // WOT = acelerador >= 98% do pico real do sensor.

  // 1) Detectar escala e normalizar 0-1 → 0-100
  let _thrMax = 0;
  for (let i = 0; i < throttle.length; i++) if (throttle[i] > _thrMax) _thrMax = throttle[i];
  const _scale01 = _thrMax > 0 && _thrMax <= 1.05;
  if (_scale01) throttle = throttle.map((t) => t * 100);

  // 2) Descobrir o pico real do sensor (P99 para ignorar spikes)
  let sensorPeak = 100; // fallback
  let coastThreshold = 10;

  if (throttle.length > 20) {
    const sorted = [...throttle].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    if (p99 > 5) {
      sensorPeak = p99;
      coastThreshold = p99 * 0.12;
    }
  }

  // WOT = acelerador >= 98% do pico real do sensor
  const wotThreshold = sensorPeak * 0.98;

  // Full throttle % — tempo com acelerador 100% pressionado
  const fullThrottleCount = throttle.filter((t) => t >= wotThreshold).length;
  const fullThrottlePct = throttle.length
    ? (fullThrottleCount / throttle.length) * 100
    : 0;

  // Coasting % (nem acelerador nem freio)
  // Quando canal de freio não está disponível, detecta por acelerador baixo apenas.
  const coastCount = effectiveData.filter((r) => {
    const rawT = ch.throttle ? r[ch.throttle] : null;
    if (rawT == null || isNaN(rawT)) return false;
    const t = _scale01 ? rawT * 100 : rawT;
    if (t >= coastThreshold) return false;   // acelerador ativo → não é coasting
    const b = ch.brake ? r[ch.brake] : null;
    if (b !== null && !isNaN(b) && b >= 5) return false; // freando → não é coasting puro
    return true;
  }).length;
  const coastPct = effectiveData.length ? (coastCount / effectiveData.length) * 100 : 0;

  // Temp, oil, lambda médias
  const tempStats = stats(temps);
  const oilStats = stats(oils);
  const validLambdas = lambdas.filter((l) => l > 0);
  const lambdaAvg = validLambdas.length
    ? validLambdas.reduce((a, b) => a + b, 0) / validLambdas.length
    : 0;

  return {
    lapTime,
    longestSegmentTime,
    maxSpeed: speedStats.max,
    avgSpeed: speedStats.avg,
    minSpeed: speedStats.min,
    maxRPM: rpmStats.max,
    avgRPM: rpmStats.avg,
    maxThrottle: throttle.length ? throttle.reduce((m, v) => (v > m ? v : m), throttle[0]) : 0,
    brakeZones,
    brakePct,
    fullThrottlePct,
    coastPct,
    avgTemp: tempStats.avg,
    maxTemp: tempStats.max,
    avgOil: oilStats.avg,
    minOil: oilStats.min,
    avgLambda: lambdaAvg,
    sampleCount: effectiveData.length,
  };
}

/**
 * Analisa todas as voltas e encontra a melhor.
 *
 * @param {Object} laps - { lapNumber: [rows] }
 * @param {Object} channels - Canais detectados.
 * @param {number} minLapTime - Tempo mínimo em segundos para considerar válida.
 * @returns {{ analysis: Object, bestLapNum: string|null }}
 */
const EMPTY_LAP = {
  lapTime: 0, longestSegmentTime: 0, maxSpeed: 0, avgSpeed: 0, minSpeed: 0,
  maxRPM: 0, avgRPM: 0, maxThrottle: 0,
  brakeZones: 0, brakePct: 0, fullThrottlePct: 0, coastPct: 0,
  avgTemp: 0, maxTemp: 0, avgOil: 0, minOil: 0, avgLambda: 0, sampleCount: 0,
};

/**
 * Detecta o momento de saída do box baseado em velocidade + RPM sustentados.
 *
 * Varre as linhas do Lap 0 e retorna o timestamp a partir do qual
 * velocidade > speedKmh E rpm > rpmMin se mantêm por pelo menos sustainSeconds.
 * Isso permite calcular o tempo real de pista da saída do box, excluindo
 * o período em que o carro ficou parado/ligado com motor em idle.
 *
 * @param {Object[]} lapRows       - Linhas de dados do out-lap
 * @param {Object}   channels      - Canais detectados
 * @param {number}   speedKmh      - Velocidade mínima em km/h (padrão: 30)
 * @param {number}   rpmMin        - RPM mínimo (padrão: 3000)
 * @param {number}   sustainSeconds - Segundos consecutivos para confirmar saída (padrão: 2)
 * @returns {number|null} Timestamp do momento de saída ou null se não detectado
 */
export function findPitExitTime(lapRows, channels, speedKmh = 30, rpmMin = 3000, sustainSeconds = 2) {
  const sc = channels.gpsSpeed;
  const rc = channels.rpm;
  const tc = channels.time;
  if (!sc || !tc || !lapRows || lapRows.length < 2) return null;

  for (let i = 0; i < lapRows.length; i++) {
    const row  = lapRows[i];
    const speed = row[sc];
    const rpm   = rc ? row[rc] : null;
    const time  = row[tc];

    if (time == null || isNaN(time)) continue;
    if (speed == null || isNaN(speed) || speed < speedKmh) continue;
    // Se canal RPM existe, exige que esteja acima do threshold
    if (rpm != null && !isNaN(rpm) && rpm < rpmMin) continue;

    // Verificar se a condição se mantém por sustainSeconds consecutivos
    const endTime = time + sustainSeconds;
    let sustained = true;
    for (let j = i + 1; j < lapRows.length; j++) {
      const t2 = lapRows[j][tc];
      if (t2 == null || t2 > endTime) break;
      const s2 = lapRows[j][sc];
      const r2 = rc ? lapRows[j][rc] : null;
      if (s2 < speedKmh || (r2 != null && !isNaN(r2) && r2 < rpmMin)) {
        sustained = false;
        break;
      }
    }
    if (sustained) return time;
  }
  return null;
}

export function analyzeAllLaps(laps, channels, minLapTime = 5, maxLapTime = 7200, deviceType = 'DASH') {
  const analysis = {};
  let bestLapNum = null;
  let bestTime = Infinity;

  // Quando sem filtro (minLapTime=0 e maxLapTime enorme), inclui TODAS as voltas
  const noFilter = minLapTime === 0 && maxLapTime >= 999999;

  for (const [num, lapRows] of Object.entries(laps)) {
    const result = analyzeLap(lapRows, channels, deviceType);
    if (noFilter) {
      // Inclui todas as voltas, mesmo sem dados suficientes para análise
      analysis[num] = result || { ...EMPTY_LAP, sampleCount: lapRows?.length || 0 };
      // bestLapNum só considera voltas com tempo real > 0
      if (result && result.lapTime > 0 && result.lapTime < bestTime) {
        bestTime = result.lapTime;
        bestLapNum = num;
      }
    } else if (result && result.lapTime > minLapTime && result.lapTime < maxLapTime) {
      analysis[num] = result;
      if (result.lapTime < bestTime) {
        bestTime = result.lapTime;
        bestLapNum = num;
      }
    }
  }

  return { analysis, bestLapNum };
}
