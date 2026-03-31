/**
 * mp4GpmfReader.js
 *
 * Leitor MP4 leve que extrai APENAS o track GPMF (metadados GoPro)
 * sem carregar o arquivo inteiro na memória.
 *
 * Usa File.slice() para ler apenas as partes necessárias:
 *  - Headers de átomos (~100 bytes por átomo)
 *  - Átomo moov completo (~500 KB)
 *  - Chunks do track GPMF (~12 MB para vídeo de 35 min)
 *
 * Resultado: lê ~13 MB em vez de 11+ GB.
 */

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Lê um trecho do File como ArrayBuffer (eficiente, não carrega tudo). */
async function readSlice(file, offset, size) {
  const end = Math.min(offset + size, file.size);
  if (offset >= end) return new ArrayBuffer(0);
  const blob = file.slice(offset, end);
  return await blob.arrayBuffer();
}

/** Lê 4 chars ASCII de um DataView. */
function fourCC(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1),
    view.getUint8(offset + 2), view.getUint8(offset + 3),
  );
}

/** Lê header de um átomo MP4. Retorna { type, size, headerSize } ou null. */
function atomHeader(view, pos) {
  if (pos + 8 > view.byteLength) return null;
  let size = view.getUint32(pos);
  const type = fourCC(view, pos + 4);
  let headerSize = 8;

  if (size === 1 && pos + 16 <= view.byteLength) {
    // Extended 64-bit size
    const hi = view.getUint32(pos + 8);
    const lo = view.getUint32(pos + 12);
    size = hi * 0x100000000 + lo;
    headerSize = 16;
  }
  // size === 0 means "extends to end of parent" — caller handles this

  return { type, size, headerSize };
}

/* ─── Scan átomos de nível superior ──────────────────────────────────────── */

/**
 * Encontra o átomo `moov` lendo apenas headers (8-16 bytes por átomo).
 * Para um MP4 GoPro típico, moov está no final do arquivo.
 */
async function findMoov(file, onProgress) {
  let pos = 0;
  const fileSize = file.size;

  while (pos < fileSize) {
    const buf = await readSlice(file, pos, 16);
    const view = new DataView(buf);
    const atom = atomHeader(view, 0);
    if (!atom || atom.size < 8) break;

    // size === 0 → extends to end
    const realSize = atom.size === 0 ? fileSize - pos : atom.size;

    console.log(`[mp4GpmfReader] top-level atom: '${atom.type}' size=${realSize} at offset=${pos}`);

    if (atom.type === 'moov') {
      return { offset: pos, size: realSize, headerSize: atom.headerSize };
    }

    pos += realSize;
    onProgress?.(0.05 * Math.min(1, pos / fileSize));
  }

  return null;
}

/* ─── Parser do moov ─────────────────────────────────────────────────────── */

/** Encontra todos os átomos filhos dentro de um container. */
function childAtoms(view, start, end) {
  const children = [];
  let pos = start;
  while (pos + 8 <= end) {
    const atom = atomHeader(view, pos);
    if (!atom || atom.size < 8) break;
    const sz = atom.size === 0 ? end - pos : atom.size;
    children.push({
      type: atom.type,
      offset: pos,
      dataOffset: pos + atom.headerSize,
      size: sz,
      end: pos + sz,
    });
    pos += sz;
  }
  return children;
}

/** Encontra primeiro átomo de um tipo dentro de um container. */
function findChild(view, start, end, type) {
  return childAtoms(view, start, end).find(a => a.type === type) || null;
}

/**
 * Dentro do moov, encontra o track GPMF (handler 'meta' com codec 'gpmd')
 * e extrai sample table (offsets, sizes, timing).
 */
function parseGpmfTrack(moovView, moovStart, moovEnd) {
  const topChildren = childAtoms(moovView, moovStart, moovEnd);
  console.log('[mp4GpmfReader] moov children:', topChildren.map(a => a.type).join(', '));
  const traks = topChildren.filter(a => a.type === 'trak');
  console.log(`[mp4GpmfReader] Found ${traks.length} trak(s)`);

  for (const trak of traks) {
    const mdia = findChild(moovView, trak.dataOffset, trak.end, 'mdia');
    if (!mdia) { console.log('[mp4GpmfReader] trak sem mdia'); continue; }

    // hdlr → handler_type (offset +8 no data: version(1)+flags(3)+predefined(4)+handler_type(4))
    const hdlr = findChild(moovView, mdia.dataOffset, mdia.end, 'hdlr');
    if (!hdlr) { console.log('[mp4GpmfReader] mdia sem hdlr'); continue; }
    const handlerType = fourCC(moovView, hdlr.dataOffset + 8);
    console.log(`[mp4GpmfReader] trak handler: '${handlerType}'`);

    // Aceitar handler 'meta' ou 'camm' (GoPro usa 'meta' para GPMF)
    // Também verificar stsd por 'gpmd' como fallback
    const minf = findChild(moovView, mdia.dataOffset, mdia.end, 'minf');
    if (!minf) continue;
    const stbl = findChild(moovView, minf.dataOffset, minf.end, 'stbl');
    if (!stbl) continue;

    // Verificar se stsd contém 'gpmd' (codec GoPro GPMF)
    const stsd = findChild(moovView, stbl.dataOffset, stbl.end, 'stsd');
    let hasGpmd = false;
    if (stsd) {
      // Buscar 'gpmd' em qualquer posição dentro do stsd
      for (let p = stsd.dataOffset; p + 4 <= stsd.end; p++) {
        if (fourCC(moovView, p) === 'gpmd') { hasGpmd = true; break; }
      }
    }
    console.log(`[mp4GpmfReader] trak handler='${handlerType}' hasGpmd=${hasGpmd}`);

    // Aceitar se handler é 'meta' OU se contém codec 'gpmd'
    if (handlerType !== 'meta' && !hasGpmd) continue;

    // ── mdhd → timescale ──
    const mdhd = findChild(moovView, mdia.dataOffset, mdia.end, 'mdhd');
    let timescale = 1000;
    if (mdhd) {
      const ver = moovView.getUint8(mdhd.dataOffset);
      timescale = ver === 0
        ? moovView.getUint32(mdhd.dataOffset + 12)
        : moovView.getUint32(mdhd.dataOffset + 20);
    }

    // ── stco / co64 → chunk offsets (posições absolutas no arquivo) ──
    const chunkOffsets = [];
    const co64 = findChild(moovView, stbl.dataOffset, stbl.end, 'co64');
    const stco = findChild(moovView, stbl.dataOffset, stbl.end, 'stco');
    if (co64) {
      const n = moovView.getUint32(co64.dataOffset + 4);
      for (let i = 0; i < n; i++) {
        const hi = moovView.getUint32(co64.dataOffset + 8 + i * 8);
        const lo = moovView.getUint32(co64.dataOffset + 12 + i * 8);
        chunkOffsets.push(hi * 0x100000000 + lo);
      }
    } else if (stco) {
      const n = moovView.getUint32(stco.dataOffset + 4);
      for (let i = 0; i < n; i++) {
        chunkOffsets.push(moovView.getUint32(stco.dataOffset + 8 + i * 4));
      }
    }

    // ── stsz → sample sizes ──
    const stsz = findChild(moovView, stbl.dataOffset, stbl.end, 'stsz');
    const sampleSizes = [];
    if (stsz) {
      const uniformSize = moovView.getUint32(stsz.dataOffset + 4);
      const numSamples  = moovView.getUint32(stsz.dataOffset + 8);
      if (uniformSize > 0) {
        for (let i = 0; i < numSamples; i++) sampleSizes.push(uniformSize);
      } else {
        for (let i = 0; i < numSamples; i++) {
          sampleSizes.push(moovView.getUint32(stsz.dataOffset + 12 + i * 4));
        }
      }
    }

    // ── stsc → sample-to-chunk mapping ──
    const stsc = findChild(moovView, stbl.dataOffset, stbl.end, 'stsc');
    const stscEntries = [];
    if (stsc) {
      const n = moovView.getUint32(stsc.dataOffset + 4);
      for (let i = 0; i < n; i++) {
        const base = stsc.dataOffset + 8 + i * 12;
        stscEntries.push({
          firstChunk:      moovView.getUint32(base),
          samplesPerChunk: moovView.getUint32(base + 4),
        });
      }
    }

    // ── stts → time-to-sample (duração de cada sample) ──
    const stts = findChild(moovView, stbl.dataOffset, stbl.end, 'stts');
    const sttsEntries = [];
    if (stts) {
      const n = moovView.getUint32(stts.dataOffset + 4);
      for (let i = 0; i < n; i++) {
        const base = stts.dataOffset + 8 + i * 8;
        sttsEntries.push({
          count: moovView.getUint32(base),
          delta: moovView.getUint32(base + 4),
        });
      }
    }

    return { chunkOffsets, sampleSizes, stscEntries, sttsEntries, timescale };
  }

  return null; // nenhum track GPMF encontrado
}

/* ─── Montagem do buffer GPMF ────────────────────────────────────────────── */

/**
 * Lê o conteúdo GPMF do arquivo usando a sample table.
 * Retorna { rawData: ArrayBuffer, timing: { samples: [{cts, duration}] } }
 */
async function readGpmfSamples(file, trackInfo, onProgress) {
  const { chunkOffsets, sampleSizes, stscEntries, sttsEntries, timescale } = trackInfo;

  // 1. Montar lista de samples: cada sample tem fileOffset e size
  const samples = [];
  let sampleIdx = 0;

  for (let chunkIdx = 0; chunkIdx < chunkOffsets.length; chunkIdx++) {
    // Determinar quantos samples neste chunk (via stsc)
    let samplesInChunk = 1;
    for (let e = stscEntries.length - 1; e >= 0; e--) {
      if (chunkIdx + 1 >= stscEntries[e].firstChunk) {
        samplesInChunk = stscEntries[e].samplesPerChunk;
        break;
      }
    }

    let filePos = chunkOffsets[chunkIdx];
    for (let s = 0; s < samplesInChunk && sampleIdx < sampleSizes.length; s++) {
      samples.push({ fileOffset: filePos, size: sampleSizes[sampleIdx] });
      filePos += sampleSizes[sampleIdx];
      sampleIdx++;
    }
  }

  // 2. Calcular timestamps de cada sample (via stts)
  const sampleTimes = []; // em segundos
  let timeAccum = 0;
  let sttsIdx = 0;
  let sttsRemaining = sttsEntries[0]?.count || 0;
  for (let i = 0; i < samples.length; i++) {
    sampleTimes.push(timeAccum / timescale);
    if (sttsIdx < sttsEntries.length) {
      timeAccum += sttsEntries[sttsIdx].delta;
      sttsRemaining--;
      if (sttsRemaining <= 0 && sttsIdx + 1 < sttsEntries.length) {
        sttsIdx++;
        sttsRemaining = sttsEntries[sttsIdx].count;
      }
    }
  }

  // 3. Ler dados GPMF do arquivo (batches para eficiência)
  const totalSize = samples.reduce((sum, s) => sum + s.size, 0);
  const gpmfBuffer = new ArrayBuffer(totalSize);
  const gpmfArr = new Uint8Array(gpmfBuffer);
  const timingSamples = [];
  let writePos = 0;

  // Ler em batches de ~512 KB para reduzir chamadas de I/O
  const BATCH = 512 * 1024;
  let batchStart = 0;

  while (batchStart < samples.length) {
    // Acumular samples contíguos até atingir BATCH bytes
    let batchBytes = 0;
    let batchEnd = batchStart;
    while (batchEnd < samples.length && batchBytes < BATCH) {
      batchBytes += samples[batchEnd].size;
      batchEnd++;
    }

    // Verificar se os samples são contíguos no arquivo
    const firstOffset = samples[batchStart].fileOffset;
    const lastSample = samples[batchEnd - 1];
    const span = lastSample.fileOffset + lastSample.size - firstOffset;

    // Se contíguos (span ≈ batchBytes), ler tudo de uma vez
    const isContiguous = span <= batchBytes * 1.1;
    if (isContiguous && span > 0) {
      const buf = await readSlice(file, firstOffset, span);
      const src = new Uint8Array(buf);
      for (let i = batchStart; i < batchEnd; i++) {
        const localOffset = samples[i].fileOffset - firstOffset;
        const chunk = src.subarray(localOffset, localOffset + samples[i].size);
        gpmfArr.set(chunk, writePos);

        const dur = (i + 1 < samples.length)
          ? sampleTimes[i + 1] - sampleTimes[i]
          : (sttsEntries[0]?.delta || 1001) / timescale;

        timingSamples.push({
          cts: sampleTimes[i] * 1000,       // s → ms
          duration: dur * 1000,             // s → ms
        });

        writePos += samples[i].size;
      }
    } else {
      // Samples não contíguos: ler individualmente
      for (let i = batchStart; i < batchEnd; i++) {
        const buf = await readSlice(file, samples[i].fileOffset, samples[i].size);
        gpmfArr.set(new Uint8Array(buf), writePos);

        const dur = (i + 1 < samples.length)
          ? sampleTimes[i + 1] - sampleTimes[i]
          : (sttsEntries[0]?.delta || 1001) / timescale;

        timingSamples.push({
          cts: sampleTimes[i] * 1000,
          duration: dur * 1000,
        });

        writePos += samples[i].size;
      }
    }

    batchStart = batchEnd;
    onProgress?.(batchStart / samples.length);
  }

  return {
    rawData: gpmfBuffer,
    timing: { samples: timingSamples },
  };
}

/* ─── API pública ────────────────────────────────────────────────────────── */

/**
 * Extrai dados GPMF de um arquivo MP4 GoPro sem carregar o arquivo inteiro.
 *
 * @param {File} file — arquivo MP4
 * @param {function} onProgress — callback (0-1)
 * @returns {Promise<{ rawData: ArrayBuffer, timing: Object } | null>}
 */
export async function extractGPMFFromMP4(file, onProgress) {
  // 1. Encontrar moov (~5% progresso)
  const moov = await findMoov(file, (p) => onProgress?.(p));
  if (!moov) {
    console.warn('[mp4GpmfReader] moov atom não encontrado');
    return null;
  }

  console.log(`[mp4GpmfReader] moov found at offset=${moov.offset}, size=${moov.size}, headerSize=${moov.headerSize}`);
  onProgress?.(0.08);

  // 2. Ler moov completo (~15% progresso)
  const moovBuf = await readSlice(file, moov.offset, moov.size);
  console.log(`[mp4GpmfReader] moov buffer loaded: ${moovBuf.byteLength} bytes`);
  const moovView = new DataView(moovBuf);

  onProgress?.(0.15);

  // 3. Parsear track GPMF dentro do moov (~20%)
  const trackInfo = parseGpmfTrack(moovView, moov.headerSize, moov.size);
  if (!trackInfo) {
    console.warn('[mp4GpmfReader] Track GPMF (meta/gpmd) não encontrado no moov');
    return null;
  }

  console.log(`[mp4GpmfReader] Track GPMF: ${trackInfo.sampleSizes.length} samples, ` +
    `${trackInfo.chunkOffsets.length} chunks, timescale=${trackInfo.timescale}`);

  onProgress?.(0.2);

  // 4. Ler samples GPMF do arquivo (20-80% progresso)
  const result = await readGpmfSamples(
    file, trackInfo,
    (p) => onProgress?.(0.2 + p * 0.6),
  );

  onProgress?.(0.85);

  return result;
}
