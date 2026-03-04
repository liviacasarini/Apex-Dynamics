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
 */
function stats(arr) {
  if (!arr.length) return { min: 0, max: 0, avg: 0 };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { min, max, avg };
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
 * Analisa uma única volta e retorna objeto com todas as métricas.
 *
 * @param {Object[]} lapData - Array de rows daquela volta.
 * @param {Object} channels - Mapa de canais detectados.
 * @returns {Object|null} Métricas da volta ou null se dados insuficientes.
 */
export function analyzeLap(lapData, channels) {
  if (!lapData || lapData.length < 10) return null;

  const ch = channels;
  const speeds   = ch.gpsSpeed   ? getValues(lapData, ch.gpsSpeed)   : [];
  const rpms     = ch.rpm        ? getValues(lapData, ch.rpm)        : [];
  const throttle = ch.throttle   ? getValues(lapData, ch.throttle)   : [];
  const brakes   = ch.brake      ? getValues(lapData, ch.brake)      : [];
  const times    = ch.time       ? getValues(lapData, ch.time)       : [];
  const temps    = ch.engineTemp ? getValues(lapData, ch.engineTemp) : [];
  const oils     = ch.oilPressure? getValues(lapData, ch.oilPressure): [];
  const lambdas  = ch.lambda     ? getValues(lapData, ch.lambda)     : [];

  // Tempo da volta
  const lapTime = times.length > 1 ? times[times.length - 1] - times[0] : 0;

  // Velocidade
  const speedStats = stats(speeds);

  // RPM
  const rpmStats = stats(rpms);

  // Zonas de frenagem
  const brakeZones = countBrakeZones(brakes);

  // Full throttle %
  const fullThrottleCount = throttle.filter((t) => t > 90).length;
  const fullThrottlePct = throttle.length
    ? (fullThrottleCount / throttle.length) * 100
    : 0;

  // Coasting % (nem acelerador nem freio)
  const coastCount = lapData.filter((r) => {
    const t = ch.throttle ? r[ch.throttle] : null;
    const b = ch.brake ? r[ch.brake] : null;
    return t !== null && b !== null && t < 10 && b < 5;
  }).length;
  const coastPct = lapData.length ? (coastCount / lapData.length) * 100 : 0;

  // Temp, oil, lambda médias
  const tempStats = stats(temps);
  const oilStats = stats(oils);
  const validLambdas = lambdas.filter((l) => l > 0);
  const lambdaAvg = validLambdas.length
    ? validLambdas.reduce((a, b) => a + b, 0) / validLambdas.length
    : 0;

  return {
    lapTime,
    maxSpeed: speedStats.max,
    avgSpeed: speedStats.avg,
    minSpeed: speedStats.min,
    maxRPM: rpmStats.max,
    avgRPM: rpmStats.avg,
    maxThrottle: Math.max(...(throttle.length ? throttle : [0])),
    brakeZones,
    fullThrottlePct,
    coastPct,
    avgTemp: tempStats.avg,
    maxTemp: tempStats.max,
    avgOil: oilStats.avg,
    minOil: oilStats.min,
    avgLambda: lambdaAvg,
    sampleCount: lapData.length,
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
export function analyzeAllLaps(laps, channels, minLapTime = 5) {
  const analysis = {};
  let bestLapNum = null;
  let bestTime = Infinity;

  for (const [num, lapRows] of Object.entries(laps)) {
    const result = analyzeLap(lapRows, channels);
    if (result && result.lapTime > minLapTime) {
      analysis[num] = result;
      if (result.lapTime < bestTime) {
        bestTime = result.lapTime;
        bestLapNum = num;
      }
    }
  }

  return { analysis, bestLapNum };
}
