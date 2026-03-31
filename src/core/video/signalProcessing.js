/**
 * signalProcessing.js
 *
 * Utilidades de processamento de sinal para sincronização de vídeo.
 * Reamostragem, suavização e normalização.
 */

const RESAMPLE_HZ = 100;

/**
 * Reamostra um sinal para taxa fixa via interpolação linear.
 *
 * @param {{t: number, v: number}[]} samples
 * @param {number} hz — taxa de reamostragem
 * @returns {number[]}
 */
export function resample(samples, hz) {
  if (samples.length < 2) return [];

  const tStart = samples[0].t;
  const tEnd   = samples[samples.length - 1].t;
  const dt     = 1 / hz;
  const result = [];
  let   si     = 0;

  for (let t = tStart; t <= tEnd; t += dt) {
    while (si < samples.length - 2 && samples[si + 1].t < t) si++;

    const s0 = samples[si];
    const s1 = samples[si + 1] || s0;
    const span = s1.t - s0.t;
    const frac = span > 0 ? (t - s0.t) / span : 0;
    result.push(s0.v + (s1.v - s0.v) * frac);
  }

  return result;
}

/**
 * Suaviza um sinal com moving average (reduz ruído do acelerômetro).
 *
 * @param {number[]} arr
 * @param {number} windowSize
 * @returns {number[]}
 */
export function smooth(arr, windowSize) {
  if (windowSize <= 1 || arr.length < windowSize) return arr;
  const half = Math.floor(windowSize / 2);
  const n = arr.length;
  const result = new Array(n);

  // Prefix sum para O(n) moving average
  const prefix = new Array(n + 1);
  prefix[0] = 0;
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + arr[i];

  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    result[i] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
  }
  return result;
}

/**
 * Normaliza um array (remove média, divide por desvio padrão).
 *
 * @param {number[]} arr
 * @returns {number[]}
 */
export function normalize(arr) {
  const n = arr.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += arr[i];
  const mean = sum / n;
  let ssq = 0;
  for (let i = 0; i < n; i++) ssq += (arr[i] - mean) ** 2;
  const std = Math.sqrt(ssq / n) || 1;
  return arr.map(v => (v - mean) / std);
}

export { RESAMPLE_HZ };
