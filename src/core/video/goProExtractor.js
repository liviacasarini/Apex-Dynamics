/**
 * goProExtractor.js
 *
 * Extrai GPS speed e acelerômetro do GPMF de um vídeo GoPro MP4.
 */

import { extractGPMFFromMP4 } from '../mp4GpmfReader.js';
import { parseGPMFData } from './gpmfParser.js';

/**
 * Extrai GPS speed e acelerômetro do GPMF de um vídeo GoPro MP4.
 *
 * @param {File} file
 * @param {function} [onProgress] — callback (0-1)
 * @returns {Promise<{ speeds: {t,v}[], accels: {t,v}[], hasGPS: boolean, hasAccel: boolean }>}
 */
export async function extractGoProGPS(file, onProgress) {
  try {
    const extracted = await extractGPMFFromMP4(file, (p) => onProgress?.(p * 0.8));

    if (!extracted?.rawData) {
      return { speeds: [], accels: [], gyros: [], hasGPS: false, hasAccel: false, hasGyro: false };
    }

    onProgress?.(0.85);
    await new Promise(r => setTimeout(r, 10));

    const { speeds, accels, gyros, gpsPoints } = parseGPMFData(extracted.rawData, extracted.timing);

    onProgress?.(0.95);
    // Filtrar coordenadas GPS inválidas (0,0)
    const validGpsPoints = gpsPoints.filter(p => p.lat !== 0 && p.lon !== 0);
    console.log(`[videoSync] GPMF parsed: ${speeds.length} GPS speed, ${validGpsPoints.length} GPS coords, ${accels.length} ACCL, ${gyros.length} GYRO samples`);

    onProgress?.(1.0);
    return {
      speeds, accels, gyros, gpsPoints: validGpsPoints,
      hasGPS:       speeds.length > 10,
      hasGPSCoords: validGpsPoints.length > 50,
      hasAccel:     accels.length > 100,
      hasGyro:      gyros.length > 100,
    };
  } catch (err) {
    console.warn('[videoSync] Erro ao extrair dados do GoPro:', err.message);
    return { speeds: [], accels: [], gyros: [], gpsPoints: [], hasGPS: false, hasGPSCoords: false, hasAccel: false, hasGyro: false };
  }
}
