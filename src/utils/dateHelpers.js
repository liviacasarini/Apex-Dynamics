/**
 * dateHelpers.js — Funções de formatação de data/hora reutilizáveis.
 *
 * Extraídas de TemperatureTab.jsx e ProfilesTab.jsx onde eram duplicadas.
 */

/** Formata "YYYY-MM-DD" → "DD/MM/YYYY" */
export function fmtDate(iso) {
  if (!iso || iso.length < 10) return '—';
  return `${iso.substring(8, 10)}/${iso.substring(5, 7)}/${iso.substring(0, 4)}`;
}

/** Formata "YYYY-MM-DD" → "DD/MM" (curto, para gráfico) */
export function fmtDateShort(iso) {
  if (!iso || iso.length < 10) return '';
  return `${iso.substring(8, 10)}/${iso.substring(5, 7)}`;
}

/** Retorna a hora atual como "HH:MM" */
export function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Retorna a data atual como "YYYY-MM-DD" */
export function todayISO() {
  return new Date().toISOString().split('T')[0];
}
