/**
 * sessionSignals.js
 *
 * Extração de sinais da telemetria para sincronização com vídeo.
 */

const MPS_TO_KMH  = 3.6;
const G_EARTH     = 9.80665;   // m/s²

/**
 * Extrai velocidade GPS de TODA a sessão com timestamps absolutos.
 *
 * @param {Object} data — dados da telemetria
 * @param {Object} channels — canais detectados
 * @returns {{ speeds: {t,v}[], tStart: number }}
 */
export function extractSessionSpeeds(data, channels) {
  if (!data?.laps || !channels.gpsSpeed || !channels.time) return { speeds: [], tStart: 0 };

  const speeds = [];
  for (const lapNum of Object.keys(data.laps)) {
    for (const row of data.laps[lapNum]) {
      const t = row[channels.time];
      const v = row[channels.gpsSpeed];
      if (t != null && v != null && !isNaN(v) && !isNaN(t)) {
        speeds.push({ t, v });
      }
    }
  }

  speeds.sort((a, b) => a.t - b.t);

  const deduped = [];
  let lastT = -Infinity;
  for (const s of speeds) {
    if (s.t > lastT) { deduped.push(s); lastT = s.t; }
  }

  const tStart = deduped.length ? deduped[0].t : 0;
  return { speeds: deduped, tStart };
}

/**
 * Extrai G-force derivada da velocidade GPS da telemetria como envelope de energia.
 * Usado para correlacionar com o envelope do acelerômetro/giroscópio da GoPro.
 *
 * @param {Object} data
 * @param {Object} channels
 * @returns {{ signal: {t,v}[], tStart: number }}
 */
export function extractSessionDynamics(data, channels) {
  if (!data?.laps || !channels.time) return { signal: [], tStart: 0 };

  const timeKey    = channels.time;
  const accelKey   = channels.accel;
  const lateralKey = channels.lateralG;
  const speedKey   = channels.gpsSpeed;

  const rawPoints = [];
  for (const lapNum of Object.keys(data.laps)) {
    for (const row of data.laps[lapNum]) {
      const t = row[timeKey];
      if (t == null || isNaN(t)) continue;

      const gLon = accelKey ? row[accelKey] : null;
      const gLat = lateralKey ? row[lateralKey] : null;
      const spd  = speedKey ? row[speedKey] : null;
      rawPoints.push({ t, gLon, gLat, spd });
    }
  }

  rawPoints.sort((a, b) => a.t - b.t);

  const deduped = [];
  let lastT = -Infinity;
  for (const p of rawPoints) {
    if (p.t > lastT) { deduped.push(p); lastT = p.t; }
  }

  if (deduped.length < 20) return { signal: [], tStart: 0 };

  const signal = [];
  const hasLon = deduped.some(p => p.gLon != null && !isNaN(p.gLon));
  const hasLat = deduped.some(p => p.gLat != null && !isNaN(p.gLat));

  if (hasLon && hasLat) {
    // Melhor caso: G total 2D = √(lateral² + longitudinal²)
    console.log('[videoSync] Usando G total (lateral + longitudinal) para correlação');
    for (const p of deduped) {
      const lon = (p.gLon != null && !isNaN(p.gLon)) ? p.gLon : 0;
      const lat = (p.gLat != null && !isNaN(p.gLat)) ? p.gLat : 0;
      signal.push({ t: p.t, v: Math.sqrt(lon * lon + lat * lat) });
    }
  } else if (hasLon) {
    // Apenas G longitudinal
    for (const p of deduped) {
      if (p.gLon != null && !isNaN(p.gLon)) signal.push({ t: p.t, v: Math.abs(p.gLon) });
    }
  } else if (deduped.some(p => p.spd != null)) {
    // Derivar aceleração de velocidade GPS
    for (let i = 1; i < deduped.length - 1; i++) {
      const dt = deduped[i + 1].t - deduped[i - 1].t;
      if (dt <= 0 || deduped[i].spd == null) continue;
      const dv = ((deduped[i + 1].spd || 0) - (deduped[i - 1].spd || 0)) / MPS_TO_KMH;
      signal.push({ t: deduped[i].t, v: Math.abs(dv / dt) / G_EARTH });
    }
  }

  const tStart = signal.length ? signal[0].t : 0;
  return { signal, tStart };
}
