/**
 * goProLaps.js
 *
 * Detecção de voltas a partir de GPS GoPro e mapeamento para voltas ECU.
 */

/* ─── Constantes ──────────────────────────────────────────────────────────── */

const GATE_R    = 25;   // metros — raio para detectar cruzamento
const FAR_R     = 100;  // metros — distância mínima antes de re-cruzar
const MIN_LAP_S = 30;   // segundos — tempo mínimo entre cruzamentos

/* ─── Haversine ──────────────────────────────────────────────────────────── */

export function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Detecção de voltas GoPro ────────────────────────────────────────────── */

/**
 * Detecta voltas a partir de coordenadas GPS da GoPro usando gate crossing.
 * As voltas são em VIDEO TIME (tempo desde o início do vídeo).
 *
 * @param {{t: number, lat: number, lon: number, v: number}[]} gpsPoints
 * @param {number} [gateLatOverride] — latitude do gate (opcional)
 * @param {number} [gateLonOverride] — longitude do gate (opcional)
 * @returns {{ laps: {num, startT, endT}[], gateLat, gateLon, crossings: number[] } | null}
 */
export function detectGoProLaps(gpsPoints, gateLatOverride, gateLonOverride) {
  if (!gpsPoints?.length || gpsPoints.length < 50) return null;

  let gateLat = gateLatOverride ?? null;
  let gateLon = gateLonOverride ?? null;

  if (gateLat == null) {
    // ── Estratégia inteligente de gate: encontrar o ponto onde o piloto
    // passa mais vezes (maior concentração de cruzamentos).
    const fastPoints = gpsPoints.filter(p => p.v > 30);
    if (fastPoints.length < 10) return null;

    // Amostrar até 50 candidatos distribuídos uniformemente
    const step = Math.max(1, Math.floor(fastPoints.length / 50));
    let bestGate = null;
    let bestCount = 0;

    for (let ci = 0; ci < fastPoints.length; ci += step) {
      const cand = fastPoints[ci];
      let wasFar = false;
      let count = 0;
      let lastT = -Infinity;

      for (const p of gpsPoints) {
        const d = haversineM(cand.lat, cand.lon, p.lat, p.lon);
        if (d > 80) wasFar = true;
        if (wasFar && d < 30 && (p.t - lastT) > MIN_LAP_S) {
          count++;
          wasFar = false;
          lastT = p.t;
        }
      }

      if (count > bestCount) {
        bestCount = count;
        bestGate = cand;
      }
    }

    if (!bestGate || bestCount < 2) {
      // Fallback: primeiro ponto rápido
      const fast = fastPoints[0];
      gateLat = fast.lat;
      gateLon = fast.lon;
    } else {
      gateLat = bestGate.lat;
      gateLon = bestGate.lon;
      console.log(`[videoSync] Gate auto-detected: ${bestCount} crossings at [${gateLat.toFixed(6)}, ${gateLon.toFixed(6)}]`);
    }
  }

  // Detectar cruzamentos com o gate escolhido
  let wasFar = false;
  let lastCrossingTime = -Infinity;
  const crossings = [];

  for (const p of gpsPoints) {
    const d = haversineM(gateLat, gateLon, p.lat, p.lon);
    if (d > FAR_R) wasFar = true;
    if (wasFar && d < GATE_R && (p.t - lastCrossingTime) > MIN_LAP_S) {
      crossings.push(p.t);
      wasFar = false;
      lastCrossingTime = p.t;
    }
  }

  if (crossings.length < 2) {
    console.log(`[videoSync] detectGoProLaps: apenas ${crossings.length} cruzamento(s), insuficiente`);
    return null;
  }

  const laps = [];
  for (let i = 0; i < crossings.length - 1; i++) {
    laps.push({ num: i + 1, startT: crossings[i], endT: crossings[i + 1] });
  }

  console.log(`[videoSync] detectGoProLaps: ${laps.length} volta(s) detectadas, gate=[${gateLat.toFixed(6)}, ${gateLon.toFixed(6)}]`);
  return { laps, gateLat, gateLon, crossings };
}

/* ─── Conversão videoTime → ECU time ──────────────────────────────────────── */

/**
 * Converte um videoTime (tempo no vídeo GoPro) para ECU absolute time
 * usando o videoTimeBase e opcionalmente gapOffsets.
 */
export function videoTimeToECUTime(videoTime, videoTimeBase, sessionStart, gapOffsets) {
  if (gapOffsets && gapOffsets.length > 0) {
    // Inverter: videoTime = playbackTime + offset → playbackTime = videoTime - offset
    for (let i = gapOffsets.length - 1; i >= 0; i--) {
      const pt = videoTime - gapOffsets[i].offset;
      if (pt >= gapOffsets[i].playbackTime || i === 0) {
        return sessionStart + pt;
      }
    }
  }
  // Sem gaps: ecuTime = videoTime - videoTimeBase
  return videoTime - videoTimeBase;
}

/* ─── Mapeamento GoPro laps → ECU laps ───────────────────────────────────── */

/**
 * Mapeia voltas detectadas pelo GoPro GPS para voltas do ECU data.
 *
 * @param {Array} goProLaps — [{num, startT, endT}] em video time
 * @param {Object} ecuData — data.laps do parser
 * @param {Object} channels — canais detectados
 * @param {number} videoTimeBase — offset base do sync
 * @param {number} sessionStart — primeiro timestamp da sessão ECU
 * @param {Array|null} gapOffsets — piecewise offsets para gaps
 * @returns {Object} — { goProLapNum: ecuLapKey, ... }
 */
export function mapGoProToECULaps(goProLaps, ecuData, channels, videoTimeBase, sessionStart, gapOffsets) {
  if (!goProLaps?.length || !ecuData?.laps || !channels?.time) return {};

  const timeCol = channels.time;
  const mapping = {};

  for (const gLap of goProLaps) {
    // Converter limites da volta GoPro para tempo ECU
    const ecuStart = videoTimeToECUTime(gLap.startT, videoTimeBase, sessionStart, gapOffsets);
    const ecuEnd   = videoTimeToECUTime(gLap.endT,   videoTimeBase, sessionStart, gapOffsets);

    // Encontrar volta ECU com maior sobreposição
    let bestLap = null;
    let bestOverlap = 0;

    for (const [lapKey, rows] of Object.entries(ecuData.laps)) {
      if (!rows?.length) continue;
      const lStart = rows[0][timeCol];
      const lEnd   = rows[rows.length - 1][timeCol];
      if (lStart == null || lEnd == null) continue;

      const overlapStart = Math.max(ecuStart, lStart);
      const overlapEnd   = Math.min(ecuEnd, lEnd);
      const overlap      = Math.max(0, overlapEnd - overlapStart);

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestLap = lapKey;
      }
    }

    if (bestLap != null) {
      mapping[gLap.num] = bestLap;
    }
  }

  console.log('[videoSync] GoPro→ECU lap mapping:', mapping);
  return mapping;
}
