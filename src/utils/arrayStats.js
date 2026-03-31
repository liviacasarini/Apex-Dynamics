/**
 * arrayStats.js — Funções de estatística para arrays numéricos.
 *
 * Extraídas de TrackMapTab.jsx (arrMax, arrMin) e MultiSessionTab.jsx (arrAvg).
 * Usam loop em vez de Math.max(...arr) para evitar stack overflow em arrays grandes.
 */

/** Retorna o maior valor do array (loop-based, seguro para arrays grandes). */
export function arrMax(arr) {
  if (!arr.length) return null;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

/** Retorna o menor valor do array (loop-based, seguro para arrays grandes). */
export function arrMin(arr) {
  if (!arr.length) return null;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m;
}

/** Retorna a média aritmética do array. */
export function arrAvg(arr) {
  if (!arr.length) return null;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}
