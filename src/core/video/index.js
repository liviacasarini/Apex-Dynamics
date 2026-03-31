/**
 * core/video/index.js — Barrel file para módulos de sincronização de vídeo
 *
 * Re-exporta todas as funções públicas que antes viviam em videoSync.js,
 * permitindo que consumidores importem de '@/core/video'.
 */

/* ── GPMF Parser ──────────────────────────────────────────────────────────── */
export { parseGPMFData } from './gpmfParser.js';

/* ── GoPro Extractor ──────────────────────────────────────────────────────── */
export { extractGoProGPS } from './goProExtractor.js';

/* ── Signal Processing ────────────────────────────────────────────────────── */
export { resample, smooth, normalize, RESAMPLE_HZ } from './signalProcessing.js';

/* ── Cross-Correlation ────────────────────────────────────────────────────── */
export { computeSyncOffset } from './crossCorrelation.js';

/* ── Activity Sync ────────────────────────────────────────────────────────── */
export { computeActivitySync, computeEnergyEnvelope } from './activitySync.js';

/* ── Gap Detection ────────────────────────────────────────────────────────── */
export { detectGapsAndOffsets, detectECUTimestampGaps } from './gapDetection.js';

/* ── GoPro Laps ───────────────────────────────────────────────────────────── */
export { detectGoProLaps, mapGoProToECULaps, haversineM, videoTimeToECUTime } from './goProLaps.js';

/* ── Session Signals ──────────────────────────────────────────────────────── */
export { extractSessionSpeeds, extractSessionDynamics } from './sessionSignals.js';
