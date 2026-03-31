/**
 * crossCorrelation.js
 *
 * Calcula o offset temporal entre dois sinais via normalized cross-correlation
 * com refinamento parabólico sub-sample.
 *
 * Estratégia de 2 fases:
 *   1. COARSE: suaviza 2s, usa 60% do sinal menor como segmento.
 *   2. FINE: suaviza 0.3s, busca ±10s ao redor do resultado coarse.
 */

import { resample, smooth, normalize, RESAMPLE_HZ } from './signalProcessing.js';

/**
 * Calcula o offset temporal entre dois sinais via normalized cross-correlation
 * com refinamento parabólico sub-sample.
 *
 * @param {{t: number, v: number}[]} goProSignal — sinal do GoPro
 * @param {{t: number, v: number}[]} telemetrySignal — sinal da telemetria
 * @param {Object} [options]
 * @returns {{ offsetSeconds: number, confidence: number, clockDrift: number }}
 */
export function computeSyncOffset(goProSignal, telemetrySignal, options = {}) {
  const hz = RESAMPLE_HZ;
  const { mode = 'derivative' } = options;
  const useEnvelope = mode === 'envelope';

  const gproRaw = resample(goProSignal, hz);
  const teleRaw = resample(telemetrySignal, hz);

  if (gproRaw.length < 20 || teleRaw.length < 20) {
    return { offsetSeconds: 0, confidence: 0 };
  }

  console.log(`[videoSync] Raw resampled: GoPro=${gproRaw.length}, Tele=${teleRaw.length}`);

  // ── Pré-processamento ─────────────────────────────────────────────────
  function makeEnvelope(arr, windowS) {
    const w = Math.max(3, Math.floor(hz * windowS));
    const sq = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) sq[i] = arr[i] * arr[i];
    const sm = smooth(sq, w);
    const out = new Array(sm.length);
    for (let i = 0; i < sm.length; i++) out[i] = Math.sqrt(Math.abs(sm[i]));
    return out;
  }

  function absDeriv(arr) {
    const d = new Array(arr.length);
    d[0] = 0;
    for (let i = 1; i < arr.length; i++) d[i] = Math.abs(arr[i] - arr[i - 1]) * hz;
    return d;
  }

  function decimate(arr, factor) {
    if (factor <= 1) return arr;
    const out = new Array(Math.floor(arr.length / factor));
    for (let i = 0; i < out.length; i++) out[i] = arr[i * factor];
    return out;
  }

  let gproCoarse, teleCoarse, gproFine, teleFine;

  if (useEnvelope) {
    gproCoarse = makeEnvelope(gproRaw, 3.0);
    teleCoarse = makeEnvelope(teleRaw, 3.0);
    gproFine = makeEnvelope(gproRaw, 0.5);
    teleFine = makeEnvelope(teleRaw, 0.5);
  } else {
    // GPS speed: COARSE usa velocidade suavizada (perfil de velocidade é único),
    // FINE usa derivada (eventos de frenagem precisos para sub-segundo)
    gproCoarse = smooth(gproRaw, hz * 2);
    teleCoarse = smooth(teleRaw, hz * 2);
    // Pre-smooth menor = preserva mais detalhes dos eventos de frenagem
    const preSmooth = Math.max(3, Math.floor(hz * 0.15));
    const gproDeriv = absDeriv(smooth(gproRaw, preSmooth));
    const teleDeriv = absDeriv(smooth(teleRaw, preSmooth));
    // Post-smooth mínimo apenas para reduzir ruído de quantização
    gproFine = smooth(gproDeriv, Math.max(3, Math.floor(hz * 0.08)));
    teleFine = smooth(teleDeriv, Math.max(3, Math.floor(hz * 0.08)));
  }

  console.log(`[videoSync] ${useEnvelope ? 'Envelope' : 'Speed+Derivative'} signals: GoPro=${gproCoarse.length}, Tele=${teleCoarse.length}`);

  const shorterIsGoPro = gproCoarse.length <= teleCoarse.length;

  // ── FASE 1: COARSE — multi-candidato ──────────────────────────────────
  const coarseDecimate = useEnvelope ? 5 : 1;
  const coarseHz = hz / coarseDecimate;
  const TOP_N = useEnvelope ? 1 : 5;

  const shorterFull = shorterIsGoPro ? gproCoarse : teleCoarse;
  const longerFull  = shorterIsGoPro ? teleCoarse : gproCoarse;
  const shorter = decimate(shorterFull, coarseDecimate);
  const longer  = decimate(longerFull,  coarseDecimate);

  // Segmento: 70% para GPS (mais único), 45% para envelope
  const segFrac = useEnvelope ? 0.45 : 0.70;
  const segLen = Math.max(Math.floor(shorter.length * segFrac), Math.min(shorter.length, 100));

  // Encontrar o segmento com maior variância (mais dinâmico)
  let bestSegStart = 0;
  let bestSegVar = 0;
  const step = Math.max(1, Math.floor(coarseHz * 5));
  for (let s = 0; s + segLen <= shorter.length; s += step) {
    let sum = 0, ssq = 0;
    for (let i = s; i < s + segLen; i++) { sum += shorter[i]; ssq += shorter[i] * shorter[i]; }
    const variance = ssq / segLen - (sum / segLen) ** 2;
    if (variance > bestSegVar) { bestSegVar = variance; bestSegStart = s; }
  }

  const slide = normalize(shorter.slice(bestSegStart, bestSegStart + segLen));
  const ref   = normalize(longer);

  const maxLag = ref.length - slide.length;
  console.log(`[videoSync] COARSE: segment=${(segLen/coarseHz).toFixed(1)}s (${Math.round(segFrac*100)}%), segStart=${(bestSegStart/coarseHz).toFixed(1)}s, ref=${(ref.length/coarseHz).toFixed(1)}s, window=${(maxLag/coarseHz).toFixed(1)}s, decimate=${coarseDecimate}`);

  if (maxLag < 0) {
    return { offsetSeconds: 0, confidence: 0 };
  }

  // Encontrar top-N picos (com distância mínima de 30s entre eles)
  const corrArr = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < slide.length; i++) corr += ref[lag + i] * slide[i];
    corrArr[lag] = corr / slide.length;
  }

  const minPeakDist = Math.floor(30 * coarseHz);
  const coarseCandidates = [];
  for (let iter = 0; iter < TOP_N; iter++) {
    let best = -Infinity, bestIdx = 0;
    for (let i = 0; i <= maxLag; i++) {
      if (corrArr[i] > best) { best = corrArr[i]; bestIdx = i; }
    }
    if (best <= -Infinity) break;
    coarseCandidates.push({ lag: bestIdx * coarseDecimate, corr: best });
    // Suprimir picos vizinhos
    for (let i = Math.max(0, bestIdx - minPeakDist); i <= Math.min(maxLag, bestIdx + minPeakDist); i++) {
      corrArr[i] = -Infinity;
    }
  }

  const bestSegStartOrig = bestSegStart;
  bestSegStart *= coarseDecimate;

  console.log(`[videoSync] COARSE candidates: ${coarseCandidates.map((c, i) => `#${i+1}: lag=${(c.lag/hz).toFixed(1)}s corr=${c.corr.toFixed(4)}`).join(', ')}`);

  // ── FASE 2: FINE — testar cada candidato coarse, pick o melhor ────────
  const shorterFine = shorterIsGoPro ? gproFine : teleFine;
  const longerFine  = shorterIsGoPro ? teleFine : gproFine;
  const fineSegLen = segLen * coarseDecimate;

  // ±30s ao redor de cada candidato coarse (maior janela = mais robusto)
  const fineRadius = Math.floor(30 * hz);

  let globalBestFineLag  = coarseCandidates[0].lag;
  let globalBestFineCorr = -Infinity;

  for (const candidate of coarseCandidates) {
    const candidateLag = candidate.lag;
    const segFine = normalize(shorterFine.slice(bestSegStart, bestSegStart + fineSegLen));
    if (segFine.length < 20) continue;

    const fineLagMin = Math.max(0, candidateLag - fineRadius);
    const fineLagMax = Math.min(longerFine.length - segFine.length, candidateLag + fineRadius);
    if (fineLagMax < fineLagMin) continue;

    const refSliceStart = fineLagMin;
    const refSliceEnd   = Math.min(longerFine.length, fineLagMax + segFine.length);
    const refFineNorm   = normalize(longerFine.slice(refSliceStart, refSliceEnd));

    let bestFineLag  = candidateLag;
    let bestFineCorr = -Infinity;

    for (let lag = fineLagMin; lag <= fineLagMax; lag++) {
      let corr = 0;
      const rOff = lag - refSliceStart;
      for (let i = 0; i < segFine.length; i++) corr += refFineNorm[rOff + i] * segFine[i];
      corr /= segFine.length;
      if (corr > bestFineCorr) { bestFineCorr = corr; bestFineLag = lag; }
    }

    if (bestFineCorr > globalBestFineCorr) {
      globalBestFineCorr = bestFineCorr;
      globalBestFineLag  = bestFineLag;
    }
  }

  // Refinamento sub-sample: parabólico com 5 pontos para maior precisão
  let refinedLag = globalBestFineLag;
  {
    const fineLagMin = Math.max(0, globalBestFineLag - fineRadius);
    const fineLagMax = Math.min(longerFine.length - fineSegLen, globalBestFineLag + fineRadius);
    const refSliceStart = fineLagMin;
    const refSliceEnd   = Math.min(longerFine.length, fineLagMax + fineSegLen);
    const refFineNorm   = normalize(longerFine.slice(refSliceStart, refSliceEnd));
    const segFine = normalize(shorterFine.slice(bestSegStart, bestSegStart + fineSegLen));
    const rOff = globalBestFineLag - refSliceStart;

    if (rOff >= 2 && rOff + segFine.length + 2 <= refFineNorm.length && segFine.length > 0) {
      // Calcular correlações em 5 pontos: -2, -1, 0, +1, +2
      const corrs = [];
      for (let d = -2; d <= 2; d++) {
        let c = 0;
        for (let i = 0; i < segFine.length; i++) c += refFineNorm[rOff + d + i] * segFine[i];
        corrs.push(c / segFine.length);
      }
      // Parabólico clássico nos 3 pontos centrais
      const denom = 2 * (corrs[1] - 2 * corrs[2] + corrs[3]);
      if (denom < 0) {
        const delta = (corrs[1] - corrs[3]) / denom;
        if (Math.abs(delta) < 1) refinedLag = globalBestFineLag + delta;
      }
    } else if (rOff >= 1 && rOff + segFine.length + 1 <= refFineNorm.length && segFine.length > 0) {
      // Fallback: 3 pontos
      let corrM = 0, corrP = 0;
      for (let i = 0; i < segFine.length; i++) {
        corrM += refFineNorm[rOff - 1 + i] * segFine[i];
        corrP += refFineNorm[rOff + 1 + i] * segFine[i];
      }
      corrM /= segFine.length;
      corrP /= segFine.length;
      const denom = 2 * (corrM - 2 * globalBestFineCorr + corrP);
      if (denom < 0) {
        const delta = (corrM - corrP) / denom;
        if (Math.abs(delta) < 1) refinedLag = globalBestFineLag + delta;
      }
    }
  }

  console.log(`[videoSync] FINE result: lag=${refinedLag.toFixed(2)} (${(refinedLag/hz).toFixed(3)}s), confidence=${globalBestFineCorr.toFixed(4)}`);

  // Converter lag em offset temporal
  const goProStart = goProSignal[0]?.t || 0;
  let offsetSeconds;
  if (shorterIsGoPro) {
    offsetSeconds = goProStart + (bestSegStart - refinedLag) / hz;
  } else {
    offsetSeconds = goProStart + (refinedLag - bestSegStart) / hz;
  }

  const finalConfidence = Math.max(0, globalBestFineCorr);

  // ── FASE 3: DRIFT — correlação local em 5+ pontos com regressão linear ──
  let clockDrift = 0;
  const DRIFT_SEG_LEN = Math.floor(15 * hz); // 15s (menor = mais pontos possíveis)

  if (shorterFine.length > DRIFT_SEG_LEN * 3) {
    function findLocalLag(segPos) {
      const seg = shorterFine.slice(segPos, segPos + DRIFT_SEG_LEN);
      if (seg.length < DRIFT_SEG_LEN) return null;
      const nSeg = normalize(seg);
      const expectedLag = Math.round(refinedLag) + (segPos - bestSegStart);
      const radius = Math.floor(5 * hz);
      const sStart = Math.max(0, expectedLag - radius);
      const sEnd   = Math.min(longerFine.length - DRIFT_SEG_LEN, expectedLag + radius);
      if (sEnd <= sStart) return null;
      const refSlice = longerFine.slice(sStart, sEnd + DRIFT_SEG_LEN);
      const nRef = normalize(refSlice);
      let best = -Infinity, bestL = 0;
      for (let l = 0; l <= sEnd - sStart; l++) {
        let c = 0;
        for (let i = 0; i < nSeg.length; i++) c += nRef[l + i] * nSeg[i];
        c /= nSeg.length;
        if (c > best) { best = c; bestL = l; }
      }
      // Refinamento parabólico sub-sample no drift point
      let refinedL = sStart + bestL;
      if (bestL > 0 && bestL < sEnd - sStart) {
        let cM = 0, cP = 0;
        for (let i = 0; i < nSeg.length; i++) { cM += nRef[bestL - 1 + i] * nSeg[i]; cP += nRef[bestL + 1 + i] * nSeg[i]; }
        cM /= nSeg.length; cP /= nSeg.length;
        const dd = 2 * (cM - 2 * best + cP);
        if (dd < 0) { const delta = (cM - cP) / dd; if (Math.abs(delta) < 1) refinedL = sStart + bestL + delta; }
      }
      return { lag: refinedL, corr: best };
    }

    // 5 pontos distribuídos (mais preciso que 3)
    const positions = [0.05, 0.25, 0.50, 0.75, 0.95].map(f => Math.floor(shorterFine.length * f))
      .filter(p => p >= 0 && p + DRIFT_SEG_LEN <= shorterFine.length);

    const driftPoints = positions.map(p => {
      const r = findLocalLag(p);
      return r && r.corr > 0.1 ? { pos: p, lag: r.lag, corr: r.corr } : null;
    }).filter(Boolean);

    if (driftPoints.length >= 2) {
      // Regressão linear por mínimos quadrados: lag = a*pos + b
      const n = driftPoints.length;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const dp of driftPoints) { sx += dp.pos; sy += dp.lag; sxx += dp.pos * dp.pos; sxy += dp.pos * dp.lag; }
      const a = (n * sxy - sx * sy) / (n * sxx - sx * sx);

      const rate = shorterIsGoPro ? 1 / a : a;
      const drift = rate - 1;
      if (Math.abs(drift) < 0.01) {
        clockDrift = drift;
        console.log(`[videoSync] DRIFT: ${n} points, rate=${rate.toFixed(8)}, drift=${(drift*1e6).toFixed(0)}ppm (${(drift*100).toFixed(4)}%)`);
      }
    }
  }

  // ── FASE 4: VERIFICAÇÃO multi-ponto ───────────────────────────────────
  const verifyLen = Math.floor(10 * hz);
  if (shorterFine.length > verifyLen * 2) {
    const nChecks = 10;
    let totalCorr = 0, validChecks = 0;
    for (let ci = 0; ci < nChecks; ci++) {
      const checkPos = Math.floor(shorterFine.length * (0.05 + 0.9 * ci / (nChecks - 1)));
      if (checkPos + verifyLen > shorterFine.length) continue;
      const seg = normalize(shorterFine.slice(checkPos, checkPos + verifyLen));
      const expectedLag = Math.round(refinedLag) + (checkPos - bestSegStart);
      const eLag = Math.round(expectedLag * (1 + clockDrift));
      const rStart = Math.max(0, eLag - Math.floor(2 * hz));
      const rEnd   = Math.min(longerFine.length, eLag + verifyLen + Math.floor(2 * hz));
      if (rEnd - rStart < seg.length) continue;
      const refSeg = normalize(longerFine.slice(rStart, rEnd));
      let bestC = -Infinity;
      for (let l = 0; l <= refSeg.length - seg.length; l++) {
        let c = 0;
        for (let i = 0; i < seg.length; i++) c += refSeg[l + i] * seg[i];
        c /= seg.length;
        if (c > bestC) bestC = c;
      }
      totalCorr += bestC;
      validChecks++;
    }
    const avgVerify = validChecks > 0 ? totalCorr / validChecks : 0;
    console.log(`[videoSync] VERIFY: ${validChecks} checks, avg correlation=${avgVerify.toFixed(4)}`);
  }

  console.log(`[videoSync] Final offset: ${offsetSeconds.toFixed(3)}s, confidence=${finalConfidence.toFixed(4)}, clockDrift=${(clockDrift*1e6).toFixed(0)}ppm`);

  return { offsetSeconds, confidence: finalConfidence, clockDrift };
}
