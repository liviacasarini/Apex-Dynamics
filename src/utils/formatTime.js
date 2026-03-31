/**
 * formatTime.js
 *
 * Utilitário compartilhado para formatar tempos de volta.
 * Padrão motorsport: M:SS.mmm  (ex: 1:16.498)
 */

/**
 * Converte segundos totais para o formato "M:SS.mmm".
 * Exemplo: 76.498 → "1:16.498"
 *
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatLapTime(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds) || totalSeconds <= 0) {
    return '--:--.---';
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const ms   = Math.round((totalSeconds % 1) * 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}
