/**
 * gearEstimator.js
 *
 * Estima a marcha engrenada a partir de RPM e velocidade, sem necessidade
 * de conhecer o veículo previamente. Funciona de HB20 a Stock Car.
 *
 * Algoritmo:
 *   1. Calcular ratio = RPM / speed para pontos válidos
 *   2. Filtro de estabilidade temporal (mediana + coeficiente de variação)
 *   3. Histograma em escala logarítmica (normaliza espaçamento entre marchas)
 *   4. Detecção de picos com merge por profundidade de vale
 *   5. Constraint física: marchas adjacentes devem ter ratio >= 1.22
 *   6. Validação de tamanho mínimo de cluster
 */

const MIN_SPEED_KMH   = 8;
const MIN_RPM          = 800;
const MAX_GEARS        = 7;
const STABILITY_PCT    = 0.04;
const STABILITY_WIN    = 9;
const HIST_BINS        = 500;
const SMOOTH_WIN       = 7;
const MIN_GEAR_RATIO   = 1.22;
const MIN_CLUSTER_FRAC = 0.002;
const MAX_CV           = 0.10;

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Detecta as razões RPM/velocidade de cada marcha.
 *
 * @param {Object[]} rows     - Linhas de dados (toda a sessão ou múltiplas voltas)
 * @param {string}   rpmCol   - Nome da coluna de RPM
 * @param {string}   speedCol - Nome da coluna de velocidade (km/h)
 * @returns {{ centers: number[], boundaries: number[] } | null}
 */
export function detectGearRatios(rows, rpmCol, speedCol) {
  if (!rpmCol || !speedCol || !rows.length) return null;

  // 1. Raw ratios
  const rawRatios = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rpm = r[rpmCol];
    const spd = r[speedCol];
    if (rpm != null && spd != null && !isNaN(rpm) && !isNaN(spd) &&
        spd >= MIN_SPEED_KMH && rpm >= MIN_RPM) {
      rawRatios[i] = rpm / spd;
    } else {
      rawRatios[i] = null;
    }
  }

  // 2. Stability filter: median + coefficient of variation
  const stableRatios = [];
  for (let i = 0; i < rawRatios.length; i++) {
    if (rawRatios[i] == null) continue;
    const win = [];
    const lo = Math.max(0, i - STABILITY_WIN);
    const hi = Math.min(rawRatios.length, i + STABILITY_WIN + 1);
    for (let j = lo; j < hi; j++) {
      if (rawRatios[j] != null) win.push(rawRatios[j]);
    }
    if (win.length < 5) continue;
    const med = median(win);
    if (med <= 0 || Math.abs(rawRatios[i] - med) / med > STABILITY_PCT) continue;

    // CV check
    let sumW = 0, sumSq = 0;
    for (let k = 0; k < win.length; k++) { sumW += win[k]; }
    const meanW = sumW / win.length;
    for (let k = 0; k < win.length; k++) { sumSq += (win[k] - meanW) ** 2; }
    const cv = Math.sqrt(sumSq / win.length) / meanW;
    if (cv < MAX_CV) {
      stableRatios.push(rawRatios[i]);
    }
  }

  if (stableRatios.length < 30) return null;

  // 3. Remove outliers (P0.1 - P99.9 — wider range to keep rare gears)
  stableRatios.sort((a, b) => a - b);
  const pLo = stableRatios[Math.floor(stableRatios.length * 0.001)];
  const pHi = stableRatios[Math.floor(stableRatios.length * 0.999)];
  const cleaned = stableRatios.filter((r) => r >= pLo && r <= pHi);
  if (cleaned.length < 20) return null;

  // 4. Histogram in LOG space — with padding for edge peaks
  const logCleaned = cleaned.map((r) => Math.log(r));
  const PAD_BINS = 5;
  const dataLMin = logCleaned[0];
  const dataLMax = logCleaned[logCleaned.length - 1];
  const dataLRng = dataLMax - dataLMin;
  if (dataLRng < 0.1) return null;

  const dataBinSize = dataLRng / (HIST_BINS - 2 * PAD_BINS);
  const lMin = dataLMin - PAD_BINS * dataBinSize;
  const lRng = dataLRng + 2 * PAD_BINS * dataBinSize;
  const binSize = lRng / HIST_BINS;
  const hist = new Float64Array(HIST_BINS);
  for (const lr of logCleaned) {
    const b = Math.min(Math.max(0, Math.floor((lr - lMin) / binSize)), HIST_BINS - 1);
    hist[b]++;
  }

  // 5. Triangular smooth
  const smooth = new Float64Array(HIST_BINS);
  for (let i = 0; i < HIST_BINS; i++) {
    let s = 0, c = 0;
    for (let j = i - SMOOTH_WIN; j <= i + SMOOTH_WIN; j++) {
      if (j >= 0 && j < HIST_BINS) {
        const w = SMOOTH_WIN + 1 - Math.abs(j - i);
        s += hist[j] * w;
        c += w;
      }
    }
    smooth[i] = s / c;
  }

  // 6. Find peaks
  const maxH = Math.max(...smooth);
  const minPeakH = maxH * 0.005;

  let peaks = [];
  for (let i = 2; i < HIST_BINS - 2; i++) {
    if (smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1] &&
        smooth[i] >= smooth[i - 2] && smooth[i] >= smooth[i + 2] &&
        smooth[i] >= minPeakH) {
      peaks.push({
        bin: i,
        h: smooth[i],
        ratio: Math.exp(lMin + (i + 0.5) * binSize),
      });
    }
  }

  if (!peaks.length) return null;

  // 7a. Valley-depth merge: merge peaks with shallow valley
  // Only merge if peaks are CLOSE together (ratio < 1.15) or valley is very shallow.
  // Peaks far apart likely represent different gears even if valley isn't deep.
  let changed = true;
  while (changed && peaks.length > 1) {
    changed = false;
    for (let i = 0; i < peaks.length - 1; i++) {
      const pairRatio = peaks[i + 1].ratio / peaks[i].ratio;
      let valleyMin = smooth[peaks[i].bin];
      for (let b = peaks[i].bin; b <= peaks[i + 1].bin; b++) {
        if (smooth[b] < valleyMin) valleyMin = smooth[b];
      }
      const shorter = Math.min(peaks[i].h, peaks[i + 1].h);
      // Close peaks (< 15% apart): merge if valley > 40% of shorter peak
      // Distant peaks (> 15% apart): merge only if valley > 70% of shorter peak
      const threshold = pairRatio < 1.15 ? 0.40 : 0.70;
      if (shorter > 0 && valleyMin / shorter > threshold) {
        if (peaks[i].h >= peaks[i + 1].h) {
          peaks.splice(i + 1, 1);
        } else {
          peaks.splice(i, 1);
        }
        changed = true;
        break;
      }
    }
  }

  // 7b. Physical constraint: min ratio between adjacent gears
  while (peaks.length > 1) {
    let minR = Infinity, minIdx = -1;
    for (let i = 0; i < peaks.length - 1; i++) {
      const r = peaks[i + 1].ratio / peaks[i].ratio;
      if (r < minR) { minR = r; minIdx = i; }
    }
    if (minR >= MIN_GEAR_RATIO) break;
    if (peaks[minIdx].h >= peaks[minIdx + 1].h) {
      peaks.splice(minIdx + 1, 1);
    } else {
      peaks.splice(minIdx, 1);
    }
  }

  if (!peaks.length) return null;

  // 8. Compute boundaries (valley between each pair of peaks)
  function computeBoundaries(pks) {
    const bounds = [];
    for (let i = 0; i < pks.length - 1; i++) {
      let minVal = smooth[pks[i].bin], minBin = pks[i].bin;
      for (let b = pks[i].bin; b <= pks[i + 1].bin; b++) {
        if (smooth[b] < minVal) { minVal = smooth[b]; minBin = b; }
      }
      bounds.push(Math.exp(lMin + (minBin + 0.5) * binSize));
    }
    return bounds.sort((a, b) => b - a);
  }

  let boundaries = computeBoundaries(peaks);

  // 9. Validate cluster sizes
  // IMPORTANT: boundaries are sorted DESCENDING, so cluster 0 = highest ratio (1st gear),
  // but peaks are sorted ASCENDING (peaks[0] = lowest ratio = highest gear).
  // We must map cluster index → peak index correctly.
  // Uses both absolute minimum (MIN_CLUSTER_FRAC of total) AND relative minimum
  // (1% of largest cluster) to reject noise between dominant gears.
  const absMinSamples = cleaned.length * MIN_CLUSTER_FRAC;
  while (peaks.length > 2) {
    const allBounds = [Infinity, ...boundaries, 0];
    const sizes = [];
    for (let i = 0; i < allBounds.length - 1; i++) {
      sizes.push(cleaned.filter((r) => r > allBounds[i + 1] && r <= allBounds[i]).length);
    }
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    const effectiveMin = Math.max(absMinSamples, maxSize * 0.01);
    if (minSize >= effectiveMin) break;
    const clusterIdx = sizes.indexOf(minSize);
    // Map cluster (descending) to peak (ascending): cluster 0 → last peak, cluster N → first peak
    const peakIdx = peaks.length - 1 - clusterIdx;
    peaks.splice(peakIdx, 1);
    boundaries = computeBoundaries(peaks);
  }

  // 10. Limit to MAX_GEARS
  if (peaks.length > MAX_GEARS) {
    peaks.sort((a, b) => b.h - a.h);
    peaks = peaks.slice(0, MAX_GEARS);
    peaks.sort((a, b) => a.ratio - b.ratio);
    boundaries = computeBoundaries(peaks);
  }

  // 11. Cluster medians
  const allBounds = [Infinity, ...boundaries, 0];
  const centers = [];
  for (let i = 0; i < allBounds.length - 1; i++) {
    const cluster = cleaned.filter((r) => r > allBounds[i + 1] && r <= allBounds[i]);
    centers.push(cluster.length ? median(cluster) : (allBounds[i] + allBounds[i + 1]) / 2);
  }

  return { centers, boundaries, count: centers.length };
}

/**
 * Estima a marcha para cada linha de dados.
 */
export function estimateGears(rows, rpmCol, speedCol, centers, boundaries) {
  if (!centers?.length || !boundaries?.length) {
    return new Array(rows.length).fill(0);
  }

  const gears = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rpm = r[rpmCol];
    const spd = r[speedCol];
    if (rpm == null || spd == null || isNaN(rpm) || isNaN(spd) ||
        spd < MIN_SPEED_KMH || rpm < MIN_RPM) {
      gears[i] = 0;
      continue;
    }
    const ratio = rpm / spd;
    let gear = centers.length;
    for (let b = 0; b < boundaries.length; b++) {
      if (ratio > boundaries[b]) { gear = b + 1; break; }
    }
    gears[i] = gear;
  }

  // Median filter (window 5)
  const filtered = [...gears];
  for (let i = 2; i < gears.length - 2; i++) {
    if (gears[i] === 0) continue;
    const win = [gears[i-2], gears[i-1], gears[i], gears[i+1], gears[i+2]].filter((g) => g > 0);
    if (win.length >= 3) {
      win.sort((a, b) => a - b);
      filtered[i] = win[Math.floor(win.length / 2)];
    }
  }
  return filtered;
}

/**
 * Gera keyframes de marcha estimada (formato compatível com stepKF do OnboardingTab).
 */
export function buildEstimatedGearKeyframes(rows, rpmCol, speedCol, timeCol, lapStart, centers, boundaries) {
  if (!centers || !rows.length) return [];
  const gears = estimateGears(rows, rpmCol, speedCol, centers, boundaries);
  const frames = [];
  let prev = -1;
  for (let i = 0; i < rows.length; i++) {
    const g = gears[i];
    if (g !== prev) {
      frames.push({ t: (rows[i][timeCol] || 0) - lapStart, v: g });
      prev = g;
    }
  }
  return frames;
}
