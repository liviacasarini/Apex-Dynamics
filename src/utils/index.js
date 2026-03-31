/**
 * utils/index.js — Barrel file para utilitários genéricos
 */
export { formatLapTime } from './formatTime';
export { arrMax, arrMin, arrAvg } from './arrayStats';
export { lerpGradient, lerpColor } from './colorInterpolation';
export { calcBounds, project } from './geoHelpers';
export { fmtDate, fmtDateShort, nowHHMM, todayISO } from './dateHelpers';
export { loadJSON, saveJSON } from './localStorage';
