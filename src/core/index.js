/**
 * core/index.js — Barrel file para lógica de negócio
 */

/* ── Parsers ──────────────────────────────────────────────────────────────── */
export { parseCSV } from './parsers/csvParser';
export { parseMoTecLD } from './parsers/ldParser';
export { parseBoschLog } from './parsers/logParser';
export { parseTDL } from './parsers/tdlParser';
export { parseDLF } from './parsers/dlfParser';

/* ── Router de formatos ───────────────────────────────────────────────────── */
export {
  routeFile,
  routeData,
  serializeToCSV,
  getFormatInfo,
  isNativeFormat,
  isProprietaryFormat,
  FILE_ACCEPT_STRING,
  NATIVE_EXTENSIONS,
  ALL_EXTENSIONS,
  FORMAT_LIST,
} from './fileRouter';

/* ── Análise e detecção ───────────────────────────────────────────────────── */
export { detectChannels } from './channelDetector';
export { analyzeLap, analyzeAllLaps, findPitExitTime } from './lapAnalyzer';
export { generateDriverFeedback, DRIVING_TIPS } from './feedbackGenerator';
export { detectGearRatios, estimateGears, buildEstimatedGearKeyframes } from './gearEstimator';
export { analyzeRacingLine, projectAllDriverPoints, detectCornersFromCenterline } from './racingLineAnalyzer';
export { extractGPMFFromMP4 } from './mp4GpmfReader';

/* ── Video sync ───────────────────────────────────────────────────────────── */
export {
  parseGPMFData,
  extractGoProGPS,
  computeSyncOffset,
  computeActivitySync,
  computeEnergyEnvelope,
  detectGapsAndOffsets,
  detectECUTimestampGaps,
  detectGoProLaps,
  mapGoProToECULaps,
  haversineM,
  videoTimeToECUTime,
  extractSessionSpeeds,
  extractSessionDynamics,
  resample,
  smooth,
  normalize,
  RESAMPLE_HZ,
} from './video';

/* ── Tracks ───────────────────────────────────────────────────────────────── */
export { TRACK_DATABASE, detectTrack, getTrackById } from './tracks';

/* ── Strategy Data Service ────────────────────────────────────────────────── */
export {
  getRegulations,
  getRaceEvent,
  getTrackData,
  estimatePitLossTime,
  getPilotStrategyData,
  listPilots,
  getCompoundLibrary,
  projectLapTimes,
  getFuelScenarios,
  buildStrategyData,
} from './strategyDataService';

/* ── Cross-tab sync ─────────────────────────────────────────────────────── */
export {
  readPeso,
  readPilots,
  readAssignedPilot,
  readFuel,
  readTrackCustom,
  readTrackById,
  readActiveTrack,
  readPneusLib,
  readPneusSession,
  readPneusStints,
  readRegulations,
  readMechanicSpecs,
  readSetupSheets,
  readLatestSetup,
  readLatestTemp,
  getCrossTabData,
  TRACK_SELECTED_EVENT,
} from './crossTabSync';
