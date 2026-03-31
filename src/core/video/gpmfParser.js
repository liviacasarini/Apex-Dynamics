/**
 * gpmfParser.js
 *
 * Parser leve para dados GPMF (GoPro Metadata Format) binários.
 * Extrai GPS speed, acelerômetro e giroscópio do GPMF em um único passo.
 */

/* ─── Constantes ──────────────────────────────────────────────────────────── */

const MS_TO_S     = 1 / 1000;
const MPS_TO_KMH  = 3.6;
const G_EARTH     = 9.80665;   // m/s²

/* ─── KLV Reader ──────────────────────────────────────────────────────────── */

/**
 * Lê um header KLV do GPMF binário.
 * Formato: 4-byte FourCC | 1-byte type | 1-byte sampleSize | 2-byte numSamples (BE)
 */
function readKLV(view, pos, end) {
  if (pos + 8 > end) return null;
  const key = String.fromCharCode(
    view.getUint8(pos), view.getUint8(pos + 1),
    view.getUint8(pos + 2), view.getUint8(pos + 3),
  );
  const typeChar   = view.getUint8(pos + 4);
  const sampleSize = view.getUint8(pos + 5);
  const numSamples = view.getUint16(pos + 6);
  const dataSize   = sampleSize * numSamples;
  const padded     = dataSize + (dataSize % 4 ? 4 - dataSize % 4 : 0);
  return {
    key, typeChar, sampleSize, numSamples,
    dataStart: pos + 8,
    dataEnd:   pos + 8 + padded,
    dataSize,
  };
}

/* ─── Parser principal ────────────────────────────────────────────────────── */

/**
 * Extrai GPS speed, acelerômetro e giroscópio do GPMF binário em um único passo.
 * Percorre DEVC → STRM → (SCAL + GPS5/GPS9/ACCL/GYRO).
 *
 * @param {ArrayBuffer} rawData
 * @param {Object} timing
 * @returns {{ speeds: {t,v}[], accels: {t,v}[], gyros: {t,v}[], gpsPoints: {t,lat,lon,v}[] }}
 */
export function parseGPMFData(rawData, timing) {
  const buffer = rawData instanceof ArrayBuffer ? rawData
    : (rawData.buffer ? rawData.buffer : rawData);
  const view = new DataView(buffer);
  const len  = view.byteLength;
  const speeds = [];
  const gpsPoints = [];             // [{t, lat, lon, v}] — coordenadas GPS completas
  const accelAxes = [[], [], []]; // 3 eixos individuais do acelerômetro
  const accelTimes = [];          // timestamps compartilhados
  const gyros  = []; // magnitude do giroscópio (captura curvas)

  const timingSamples = timing?.samples || [];
  let devIndex = -1;

  function parseContainer(start, end) {
    let pos = start;
    let currentScale = null;

    while (pos + 8 <= end) {
      const klv = readKLV(view, pos, end);
      if (!klv || klv.dataEnd > end) break;

      if (klv.typeChar === 0) {
        if (klv.key === 'DEVC') devIndex++;
        if (klv.key === 'STRM') currentScale = null;
        parseContainer(klv.dataStart, klv.dataStart + klv.dataSize);

      } else if (klv.key === 'SCAL') {
        currentScale = [];
        if (klv.sampleSize === 4) {
          for (let i = 0; i < klv.numSamples; i++)
            currentScale.push(view.getInt32(klv.dataStart + i * 4));
        } else if (klv.sampleSize === 2) {
          for (let i = 0; i < klv.numSamples; i++)
            currentScale.push(view.getInt16(klv.dataStart + i * 2));
        }

      } else if (klv.key === 'GPS5' && klv.sampleSize === 20) {
        // GPS5: lat(int32) + lon(int32) + alt(int32) + speed2d(int32) + speed3d(int32)
        const latScale   = (currentScale?.length >= 1) ? currentScale[0] : 10000000;
        const lonScale   = (currentScale?.length >= 2) ? currentScale[1] : 10000000;
        const speedScale = (currentScale?.length >= 4) ? currentScale[3] : 100;
        const tSample = timingSamples[devIndex];
        const baseSec = tSample ? tSample.cts * MS_TO_S : devIndex;
        const durSec  = tSample ? (tSample.duration || 1000) * MS_TO_S : 1;
        const dt      = klv.numSamples > 1 ? durSec / klv.numSamples : 0;
        for (let i = 0; i < klv.numSamples; i++) {
          const off = klv.dataStart + i * 20;
          if (off + 20 > end) break;
          const t   = baseSec + i * dt;
          const lat = view.getInt32(off)      / latScale;
          const lon = view.getInt32(off + 4)  / lonScale;
          const v   = view.getInt32(off + 12) / speedScale * MPS_TO_KMH;
          speeds.push({ t, v });
          gpsPoints.push({ t, lat, lon, v });
        }

      } else if (klv.key === 'GPS9' && klv.sampleSize === 36) {
        // GPS9: lat(int32) + lon(int32) + alt(int32) + speed2d(int32) + ...
        const latScale   = (currentScale?.length >= 1) ? currentScale[0] : 10000000;
        const lonScale   = (currentScale?.length >= 2) ? currentScale[1] : 10000000;
        const speedScale = (currentScale?.length >= 4) ? currentScale[3] : 100;
        const tSample = timingSamples[devIndex];
        const baseSec = tSample ? tSample.cts * MS_TO_S : devIndex;
        const durSec  = tSample ? (tSample.duration || 1000) * MS_TO_S : 1;
        const dt      = klv.numSamples > 1 ? durSec / klv.numSamples : 0;
        for (let i = 0; i < klv.numSamples; i++) {
          const off = klv.dataStart + i * 36;
          if (off + 36 > end) break;
          const t   = baseSec + i * dt;
          const lat = view.getInt32(off)      / latScale;
          const lon = view.getInt32(off + 4)  / lonScale;
          const v   = view.getInt32(off + 12) / speedScale * MPS_TO_KMH;
          speeds.push({ t, v });
          gpsPoints.push({ t, lat, lon, v });
        }

      } else if (klv.key === 'ACCL') {
        /* ── Acelerômetro 3D: int16 BE ── */
        const scale = (currentScale?.length >= 1) ? currentScale[0] : 100;
        const numAxes = Math.floor(klv.sampleSize / 2);
        if (numAxes < 3) { pos = klv.dataEnd; continue; }

        const tSample = timingSamples[devIndex];
        const baseSec = tSample ? tSample.cts * MS_TO_S : devIndex;
        const durSec  = tSample ? (tSample.duration || 1000) * MS_TO_S : 1;
        const dt      = klv.numSamples > 1 ? durSec / klv.numSamples : 0;

        for (let i = 0; i < klv.numSamples; i++) {
          const off = klv.dataStart + i * klv.sampleSize;
          if (off + 6 > end) break;
          const a0 = view.getInt16(off)     / scale;
          const a1 = view.getInt16(off + 2) / scale;
          const a2 = view.getInt16(off + 4) / scale;
          const t  = baseSec + i * dt;
          accelAxes[0].push(a0);
          accelAxes[1].push(a1);
          accelAxes[2].push(a2);
          accelTimes.push(t);
        }

      } else if (klv.key === 'GYRO') {
        /* ── Giroscópio 3D: int16 BE, rad/s ── */
        const scale = (currentScale?.length >= 1) ? currentScale[0] : 100;
        const numAxes = Math.floor(klv.sampleSize / 2);
        if (numAxes < 3) { pos = klv.dataEnd; continue; }

        const tSample = timingSamples[devIndex];
        const baseSec = tSample ? tSample.cts * MS_TO_S : devIndex;
        const durSec  = tSample ? (tSample.duration || 1000) * MS_TO_S : 1;
        const dt      = klv.numSamples > 1 ? durSec / klv.numSamples : 0;

        for (let i = 0; i < klv.numSamples; i++) {
          const off = klv.dataStart + i * klv.sampleSize;
          if (off + 6 > end) break;
          const gz = view.getInt16(off)     / scale;
          const gx = view.getInt16(off + 2) / scale;
          const gy = view.getInt16(off + 4) / scale;
          // Magnitude da rotação (captura curvas independente da orientação)
          gyros.push({ t: baseSec + i * dt, v: Math.sqrt(gx * gx + gy * gy + gz * gz) });
        }
      }

      pos = klv.dataEnd;
    }
  }

  parseContainer(0, len);

  // ── Pós-processamento ACCL: subtrair vetor de gravidade e extrair dinâmicas ──
  // A câmera GoPro pode estar inclinada em qualquer ângulo, então a gravidade
  // pode estar distribuída entre 2 ou 3 eixos. Solução: a média de cada eixo
  // ao longo da sessão inteira ≈ vetor de gravidade. Subtrair a média de cada
  // amostra isola a aceleração dinâmica (frenagens, curvas, acelerações).
  // A magnitude do residual √(Δa0² + Δa1² + Δa2²) é independente da orientação
  // e corresponde a √(G_lat² + G_lon² + G_vert²) da telemetria.
  const accels = [];
  const n = accelTimes.length;
  if (n > 100) {
    // Calcular média de cada eixo (≈ componente de gravidade naquele eixo)
    const means = accelAxes.map(axis => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += axis[i];
      return sum / n;
    });

    console.log(`[videoSync] ACCL axes means (gravity vector): [${means.map(m => m.toFixed(2))}] m/s², |g|=${Math.sqrt(means[0]**2+means[1]**2+means[2]**2).toFixed(2)}`);

    // Para cada amostra: subtrair gravidade e computar magnitude dinâmica (em G)
    for (let i = 0; i < n; i++) {
      const d0 = (accelAxes[0][i] - means[0]) / G_EARTH;
      const d1 = (accelAxes[1][i] - means[1]) / G_EARTH;
      const d2 = (accelAxes[2][i] - means[2]) / G_EARTH;
      accels.push({ t: accelTimes[i], v: Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2) });
    }
  }

  return { speeds, accels, gyros, gpsPoints };
}
