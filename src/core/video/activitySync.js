/**
 * activitySync.js
 *
 * Sincronização baseada em detecção de atividade (engine on/off).
 * Quando não há GPS, detecta segmentos ativos no vídeo via RMS de energia
 * do acelerômetro e mapeia para a sessão ECU.
 */

import { resample, smooth, normalize, RESAMPLE_HZ } from './signalProcessing.js';

/**
 * Converte um sinal IMU bruto (~200Hz) em envelope de energia suavizado.
 * O envelope captura a "intensidade dinâmica" ao longo do tempo,
 * independente de orientação ou offset DC.
 *
 * Pipeline: resample 50Hz → elevar ao quadrado → smooth 1s → sqrt
 *
 * @param {{t: number, v: number}[]} samples — sinal IMU bruto
 * @returns {{t: number, v: number}[]} — envelope de energia suavizado
 */
export function computeEnergyEnvelope(samples) {
  if (samples.length < 50) return samples;

  // 1. Resamplear para 50Hz
  const resampled = resample(samples, RESAMPLE_HZ);

  // 2. Elevar ao quadrado (energia instantânea)
  const energy = resampled.map(v => v * v);

  // 3. Smooth com janela de 1s (50 amostras a 50Hz) → envelope
  const smoothed = smooth(energy, RESAMPLE_HZ);

  // 4. Raiz quadrada para voltar à escala original (RMS envelope)
  const tStart = samples[0].t;
  const dt = 1 / RESAMPLE_HZ;
  return smoothed.map((v, i) => ({ t: tStart + i * dt, v: Math.sqrt(Math.abs(v)) }));
}

/**
 * Sincronização baseada em detecção de atividade (engine on/off).
 *
 * @param {{t: number, v: number}[]} goProAccels — magnitude dinâmica do ACCL (em G)
 * @param {number} ecuDurationS — duração da sessão ECU em segundos
 * @param {{t: number, v: number}[]} [ecuDynamics] — G-force da ECU (para refinamento por cross-correlation)
 * @returns {{ offsetSeconds: number, confidence: number, gapOffsets: Array|null, clockDrift: number }}
 */
export function computeActivitySync(goProAccels, ecuDurationS, ecuDynamics) {
  if (!goProAccels?.length || goProAccels.length < 100) return null;

  const hz = 10;
  const resampled = resample(goProAccels, hz);
  const goProTStart = goProAccels[0].t;

  // ── 1. RMS em janelas de 5s com passo de 1s ──
  const WINDOW_S = 5;
  const windowLen = WINDOW_S * hz;

  const rmsValues = [];
  const rmsTimes  = [];

  for (let i = 0; i + windowLen <= resampled.length; i += hz) {
    let sumSq = 0;
    for (let j = 0; j < windowLen; j++) sumSq += resampled[i + j] ** 2;
    rmsValues.push(Math.sqrt(sumSq / windowLen));
    rmsTimes.push(goProTStart + (i + windowLen / 2) / hz);
  }

  if (rmsValues.length < 10) return null;

  // ── 2. Threshold adaptativo (Otsu-like: maximizar variância inter-classe) ──
  const sorted = [...rmsValues].sort((a, b) => a - b);
  const n = sorted.length;
  let bestThresh = sorted[Math.floor(n * 0.3)];
  let bestScore  = -Infinity;

  for (let p = 10; p <= 60; p += 2) {
    const th = sorted[Math.floor(n * p / 100)];
    let n0 = 0, s0 = 0, n1 = 0, s1 = 0;
    for (const v of rmsValues) {
      if (v <= th) { n0++; s0 += v; } else { n1++; s1 += v; }
    }
    if (n0 < 3 || n1 < 3) continue;
    const m0 = s0 / n0, m1 = s1 / n1;
    const score = n0 * n1 * (m1 - m0) ** 2 / (n * n);
    if (score > bestScore) { bestScore = score; bestThresh = th; }
  }

  // Histerese: subir acima de threshHigh para entrar em "ativo",
  // cair abaixo de threshLow para sair
  const threshHigh = bestThresh;
  const threshLow  = bestThresh * 0.65;

  console.log(`[videoSync] Activity threshold: ${bestThresh.toFixed(4)}G (range: ${sorted[0].toFixed(4)}-${sorted[n - 1].toFixed(4)}G)`);

  // ── 3. Detectar segmentos de atividade com histerese ──
  const MIN_SEG_S  = 30;   // segmento mínimo para ser válido
  const MERGE_GAP_S = 30;  // merge segmentos com gap < 30s (pit lane)

  let segments = [];
  let active = false;
  let segStart = -1;

  for (let i = 0; i < rmsValues.length; i++) {
    if (!active && rmsValues[i] > threshHigh) {
      active = true;
      segStart = i;
    } else if (active && rmsValues[i] < threshLow) {
      active = false;
      const startT = rmsTimes[segStart];
      const endT   = rmsTimes[i - 1];
      if (endT - startT >= MIN_SEG_S) {
        segments.push({ startT, endT, duration: endT - startT });
      }
    }
  }
  if (active && segStart >= 0) {
    const startT = rmsTimes[segStart];
    const endT   = rmsTimes[rmsValues.length - 1];
    if (endT - startT >= MIN_SEG_S) {
      segments.push({ startT, endT, duration: endT - startT });
    }
  }

  // Merge segmentos próximos (ex: passagem pelo pit lane)
  if (segments.length > 1) {
    const merged = [{ ...segments[0] }];
    for (let i = 1; i < segments.length; i++) {
      const prev = merged[merged.length - 1];
      if (segments[i].startT - prev.endT <= MERGE_GAP_S) {
        prev.endT    = segments[i].endT;
        prev.duration = prev.endT - prev.startT;
      } else {
        merged.push({ ...segments[i] });
      }
    }
    segments = merged;
  }

  console.log(`[videoSync] Activity segments: ${segments.length} — ` +
    segments.map((s, i) => `seg${i}: ${s.startT.toFixed(0)}-${s.endT.toFixed(0)}s (${s.duration.toFixed(0)}s)`).join(', '));

  if (segments.length === 0) return null;

  const totalActive = segments.reduce((sum, s) => sum + s.duration, 0);
  console.log(`[videoSync] Total active: ${totalActive.toFixed(0)}s vs ECU: ${ecuDurationS.toFixed(0)}s (ratio: ${(totalActive / ecuDurationS).toFixed(2)})`);

  // ── 4. Refinamento por cross-correlation dentro de cada stint ──
  if (ecuDynamics && ecuDynamics.length >= 100) {
    const refHz = 10;
    const gproRef = resample(goProAccels, refHz);
    const ecuRef  = resample(ecuDynamics, refHz);
    const gproT0  = goProAccels[0].t;
    const ecuT0   = ecuDynamics[0].t;

    // Envelope RMS 1s para ambos os sinais
    function rmsEnvelope(arr, windowS) {
      const w = Math.max(3, Math.floor(refHz * windowS));
      const n = arr.length;
      const out = new Array(n);
      const prefix = new Array(n + 1);
      prefix[0] = 0;
      for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + arr[i] * arr[i];
      for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - Math.floor(w / 2));
        const hi = Math.min(n - 1, i + Math.floor(w / 2));
        out[i] = Math.sqrt((prefix[hi + 1] - prefix[lo]) / (hi - lo + 1));
      }
      return out;
    }

    const gproEnv = rmsEnvelope(gproRef, 1.0);
    const ecuEnv  = rmsEnvelope(ecuRef, 1.0);

    let cumEcuTime = 0;

    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];

      // Chunk de 60s do meio do stint na ECU
      const chunkDur = Math.min(60, seg.duration * 0.4);
      const ecuChunkStartS = cumEcuTime + (seg.duration - chunkDur) / 2;
      const ecuChunkEndS   = ecuChunkStartS + chunkDur;
      const ecuI0 = Math.floor(ecuChunkStartS * refHz);
      const ecuI1 = Math.floor(ecuChunkEndS * refHz);

      if (ecuI0 < 0 || ecuI1 > ecuEnv.length || ecuI1 - ecuI0 < 20) {
        cumEcuTime += seg.duration;
        continue;
      }

      const ecuChunk = normalize(ecuEnv.slice(ecuI0, ecuI1));

      // Posição esperada no GoPro: seg.startT + offset dentro do stint
      const expectedGproS = seg.startT + (seg.duration - chunkDur) / 2;
      const searchRadius  = 30;
      const gproI0 = Math.max(0, Math.floor((expectedGproS - searchRadius - gproT0) * refHz));
      const gproI1 = Math.min(gproEnv.length, Math.floor((expectedGproS + chunkDur + searchRadius - gproT0) * refHz));

      if (gproI1 - gproI0 < ecuChunk.length) {
        cumEcuTime += seg.duration;
        continue;
      }

      const gproSearch = normalize(gproEnv.slice(gproI0, gproI1));

      // Cross-correlation
      const maxLag = gproSearch.length - ecuChunk.length;
      let bestLag = 0, bestCorr = -Infinity;
      for (let lag = 0; lag <= maxLag; lag++) {
        let corr = 0;
        for (let i = 0; i < ecuChunk.length; i++) corr += gproSearch[lag + i] * ecuChunk[i];
        corr /= ecuChunk.length;
        if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
      }

      // Posição refinada do chunk no GoPro
      const refinedChunkGproS = gproT0 + (gproI0 + bestLag) / refHz;
      const refinedStartT = refinedChunkGproS - (seg.duration - chunkDur) / 2;
      const correction    = refinedStartT - seg.startT;

      if (Math.abs(correction) < searchRadius && bestCorr > 0.15) {
        console.log(`[videoSync] Stint ${s + 1} refined: ${seg.startT.toFixed(1)}→${refinedStartT.toFixed(1)}s (Δ=${correction > 0 ? '+' : ''}${correction.toFixed(1)}s, corr=${bestCorr.toFixed(3)})`);
        seg.startT  = refinedStartT;
        seg.endT    = refinedStartT + seg.duration;
      } else {
        console.log(`[videoSync] Stint ${s + 1} refinement skipped (corr=${bestCorr.toFixed(3)}, Δ=${correction.toFixed(1)}s)`);
      }

      cumEcuTime += seg.duration;
    }
  }

  // ── 5. Construir offsets ──
  if (segments.length === 1) {
    console.log(`[videoSync] Activity sync: single stint, offset=${segments[0].startT.toFixed(1)}s`);
    return {
      offsetSeconds: segments[0].startT,
      confidence: 0.80,
      gapOffsets: null,
      clockDrift: 0,
    };
  }

  // Caso 2: múltiplos segmentos (pit stops) → offsets piecewise
  const gapOffsets = [];
  let cumDur = 0;
  for (const seg of segments) {
    gapOffsets.push({
      playbackTime: cumDur,
      offset: seg.startT - cumDur,
    });
    cumDur += seg.duration;
  }

  console.log(`[videoSync] Multi-stint offsets (refined): ` +
    gapOffsets.map((g, i) => `stint${i + 1}: pt=${g.playbackTime.toFixed(0)}s offset=${g.offset.toFixed(1)}s`).join(', '));

  return {
    offsetSeconds: segments[0].startT,
    confidence: 0.85,
    gapOffsets: gapOffsets.length > 1 ? gapOffsets : null,
    clockDrift: 0,
  };
}
