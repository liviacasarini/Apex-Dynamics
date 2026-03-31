/**
 * gapDetection.js
 *
 * Detecção de gaps entre telemetria e vídeo.
 * Quando a ECU é desligada no box, ela para de gravar mas a GoPro continua.
 */

import { resample, smooth, normalize } from './signalProcessing.js';

/**
 * Detecta gaps entre telemetria e vídeo usando correlação multi-ponto.
 *
 * @param {{t,v}[]} goProSignal — GPS speeds do GoPro (contínuo)
 * @param {{t,v}[]} teleSignal — GPS speeds da telemetria
 * @param {number} baseOffset — offsetSeconds global (de computeSyncOffset)
 * @param {number} sessionStart — primeiro timestamp da sessão
 * @param {Object} [options]
 * @returns {Array|null} — null se não há gaps, ou [{playbackTime, offset}]
 */
export function detectGapsAndOffsets(goProSignal, teleSignal, baseOffset, sessionStart, options = {}) {
  if (!teleSignal?.length || !goProSignal?.length) return null;
  const { mode = 'derivative' } = options;
  const useEnvelope = mode === 'envelope';

  const teleStart = teleSignal[0].t;
  const teleEnd   = teleSignal[teleSignal.length - 1].t;
  const duration  = teleEnd - teleStart;

  // Sessão curta demais para detectar gaps
  if (duration < 120) return null;

  // 10Hz é suficiente para detectar gaps — não precisa de precisão sub-sample.
  const hz = 10;

  const gproRaw = resample(goProSignal, hz);
  const teleRaw = resample(teleSignal, hz);

  if (gproRaw.length < 100 || teleRaw.length < 100) return null;

  let gproSmooth, teleSmooth;

  if (useEnvelope) {
    // Envelope de energia: melhor para ACCL/dinâmicas (sem GPS)
    function envelope(arr, windowS) {
      const w = Math.max(3, Math.floor(hz * windowS));
      const sq = arr.map(v => v * v);
      const sm = smooth(sq, w);
      return sm.map(v => Math.sqrt(Math.abs(v)));
    }
    gproSmooth = normalize(envelope(gproRaw, 3.0));
    teleSmooth = envelope(teleRaw, 3.0);
  } else {
    // Derivada: melhor para GPS speed
    function absDeriv(arr) {
      const d = new Array(arr.length);
      d[0] = 0;
      for (let i = 1; i < arr.length; i++) d[i] = Math.abs(arr[i] - arr[i - 1]) * hz;
      return d;
    }
    const preSmooth  = Math.max(3, Math.floor(hz * 0.5));
    const gproDeriv  = absDeriv(smooth(gproRaw, preSmooth));
    const teleDeriv  = absDeriv(smooth(teleRaw, preSmooth));
    const coarseSmth = hz * 2;
    gproSmooth = normalize(smooth(gproDeriv, coarseSmth));
    teleSmooth = smooth(teleDeriv, coarseSmth);
  }

  // ── Janela deslizante ao longo da telemetria ──
  const WINDOW_S = 30;          // segundos por janela
  const STEP_S   = 15;          // passo entre janelas (50% overlap)
  const windowLen = Math.floor(WINDOW_S * hz);
  const stepLen   = Math.floor(STEP_S * hz);

  if (windowLen >= teleSmooth.length || windowLen >= gproSmooth.length) return null;

  const points = [];
  const maxLag = gproSmooth.length - windowLen;

  for (let pos = 0; pos + windowLen <= teleSmooth.length; pos += stepLen) {
    const seg = normalize(teleSmooth.slice(pos, pos + windowLen));

    // Correlação bruta: deslizar segmento sobre o GoPro
    let bestLag = 0, bestCorr = -Infinity;
    for (let lag = 0; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < seg.length; i++) corr += gproSmooth[lag + i] * seg[i];
      corr /= seg.length;
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }

    if (bestCorr < 0.08) continue; // confiança muito baixa, ignorar

    // Converter lag em offset temporal
    const teleCenterTime = teleStart + (pos + windowLen / 2) / hz;
    const gproCenterTime = goProSignal[0].t + (bestLag + windowLen / 2) / hz;
    const offset = gproCenterTime - teleCenterTime + sessionStart;

    points.push({
      playbackTime: (pos + windowLen / 2) / hz,
      offset,
      confidence: bestCorr,
    });
  }

  console.log(`[videoSync] Gap detection: ${points.length} valid windows (of ${Math.floor((teleSmooth.length - windowLen) / stepLen) + 1} tested)` +
    (points.length ? `, confidence range: ${Math.min(...points.map(p=>p.confidence)).toFixed(3)}–${Math.max(...points.map(p=>p.confidence)).toFixed(3)}` : ''));

  if (points.length < 2) return null;

  // ── Detectar saltos no offset (indicam gaps) ──
  const JUMP_THRESHOLD = 30;

  const segments = [{ playbackTime: 0, offset: points[0].offset }];

  for (let i = 1; i < points.length; i++) {
    const delta = Math.abs(points[i].offset - points[i - 1].offset);
    if (delta > JUMP_THRESHOLD) {
      segments.push({ playbackTime: points[i].playbackTime, offset: points[i].offset });
      console.log(`[videoSync] Gap detected at t=${points[i].playbackTime.toFixed(0)}s: ` +
        `offset jumped ${delta.toFixed(1)}s (${points[i - 1].offset.toFixed(1)}→${points[i].offset.toFixed(1)})`);
    }
  }

  if (segments.length <= 1) {
    console.log('[videoSync] No gaps detected (offset stable across session)');
    return null;
  }

  // Sanity check: mais de 5 stints é claramente ruído de correlação
  if (segments.length > 5) {
    console.warn(`[videoSync] Gap detection found ${segments.length} stints — likely noise, discarding`);
    return null;
  }

  // ── Refinar offsets: mediana dentro de cada segmento ──
  const refined = [];
  for (let s = 0; s < segments.length; s++) {
    const segStart = segments[s].playbackTime;
    const segEnd   = s + 1 < segments.length ? segments[s + 1].playbackTime : Infinity;

    const inRange = points.filter(p => p.playbackTime >= segStart && p.playbackTime < segEnd && p.confidence >= 0.2);
    if (inRange.length === 0) {
      refined.push(segments[s]);
      continue;
    }

    // Mediana dos offsets para robustez
    const sorted = inRange.map(p => p.offset).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    refined.push({ playbackTime: segments[s].playbackTime, offset: median });
  }

  console.log(`[videoSync] Detected ${refined.length} stint(s):`,
    refined.map((r, i) => `stint${i + 1}: pt=${r.playbackTime.toFixed(0)}s offset=${r.offset.toFixed(1)}s`).join(', '));

  return refined;
}

/**
 * Detecta gaps nos dados da ECU analisando os timestamps.
 *
 * @param {Object} data — dados da telemetria
 * @param {Object} channels — mapeamento de canais
 * @param {number} videoTimeBase — offset base do sync
 * @returns {Array|null} — null se não há gaps, ou [{playbackTime, offset}]
 */
export function detectECUTimestampGaps(data, channels, videoTimeBase) {
  if (!data?.laps || !channels.time) return null;

  const timeKey  = channels.time;
  const speedKey = channels.gpsSpeed;

  // Coletar todas as amostras ordenadas por tempo
  const allRows = [];
  for (const lapNum of Object.keys(data.laps)) {
    for (const row of data.laps[lapNum]) {
      const t = row[timeKey];
      if (t != null && !isNaN(t)) allRows.push(row);
    }
  }
  allRows.sort((a, b) => (a[timeKey] || 0) - (b[timeKey] || 0));

  if (allRows.length < 100) return null;

  // Calcular sample rate mediano
  const dtSamples = [];
  for (let i = 1; i < Math.min(1000, allRows.length); i++) {
    const dt = allRows[i][timeKey] - allRows[i - 1][timeKey];
    if (dt > 0) dtSamples.push(dt);
  }
  dtSamples.sort((a, b) => a - b);
  const medianDt = dtSamples[Math.floor(dtSamples.length / 2)] || 0.01;

  // Limiar para gap: 10× o intervalo mediano E pelo menos 2 segundos
  const gapThreshold = Math.max(2, medianDt * 10);

  const sessionStart = allRows[0][timeKey] || 0;
  const gaps = [];

  for (let i = 1; i < allRows.length; i++) {
    const dt = allRows[i][timeKey] - allRows[i - 1][timeKey];
    if (dt >= gapThreshold) {
      const gapStart = allRows[i - 1][timeKey] - sessionStart;
      gaps.push({
        playbackTime: gapStart,
        gapDuration: dt,
      });
      console.log(`[videoSync] ECU timestamp gap at t=${gapStart.toFixed(1)}s: ${dt.toFixed(1)}s gap`);
    }
  }

  if (gaps.length === 0) {
    console.log('[videoSync] No ECU timestamp gaps detected (data is continuous)');
    return null;
  }

  if (gaps.length > 10) {
    console.warn(`[videoSync] Too many ECU gaps (${gaps.length}), likely noise`);
    return null;
  }

  // Construir offsets piecewise
  const baseOffset = videoTimeBase;
  const segments = [{ playbackTime: 0, offset: baseOffset }];

  let cumulativeGap = 0;
  for (const gap of gaps) {
    cumulativeGap += gap.gapDuration;
    segments.push({
      playbackTime: gap.playbackTime,
      offset: baseOffset + cumulativeGap,
    });
  }

  console.log(`[videoSync] ECU gaps → ${segments.length} stint(s):`,
    segments.map((s, i) => `stint${i + 1}: pt=${s.playbackTime.toFixed(0)}s offset=${s.offset.toFixed(1)}s`).join(', '));

  return segments;
}
