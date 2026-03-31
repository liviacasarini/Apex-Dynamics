/**
 * ldParser.js
 *
 * Parser para arquivos MoTec LD (binário, little-endian).
 * Baseado na engenharia reversa do formato publicada em gotzl/ldparser (Python).
 * 100% JavaScript puro — sem dependências externas, roda offline no browser.
 *
 * Estrutura do arquivo LD:
 *   - Header fixo (offset 0x00): metadata, ponteiros para canais e dados
 *   - Channel metadata: lista encadeada com nome, unidade, frequência, tipo, escala
 *   - Channel data: blocos binários raw (int16/int32/float32/float64)
 *
 * Retorna: { headers, rows, laps, lapCol } — mesmo formato do parseCSV
 */

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

/**
 * Lê uma string de comprimento fixo a partir do DataView, removendo nulos.
 */
function readString(dv, offset, length) {
  const bytes = [];
  for (let i = 0; i < length; i++) {
    const b = dv.getUint8(offset + i);
    if (b === 0) break;
    bytes.push(b);
  }
  return new TextDecoder('latin1').decode(new Uint8Array(bytes)).trim();
}

/**
 * Lê um Uint32 little-endian
 */
function u32(dv, off) { return dv.getUint32(off, true); }

/**
 * Lê um Uint16 little-endian
 */
function u16(dv, off) { return dv.getUint16(off, true); }

/**
 * Lê um Int16 little-endian (signed)
 */
function i16(dv, off) { return dv.getInt16(off, true); }

/* ─── Parsers de estrutura ────────────────────────────────────────────────── */

/**
 * Lê o header principal do arquivo LD.
 *
 * Layout (offsets em hex):
 *   0x00: marker (u32, esperado = 0x40)
 *   0x08: meta_ptr (u32) — ponteiro para metadados de canais
 *   0x0C: data_ptr (u32) — ponteiro para início dos dados
 *   0x10: (20 bytes padding)
 *   0x24: event_ptr (u32) — ponteiro para evento (pode ser 0)
 *   0x3C: (padding)
 *   0x48: device_serial (u16)
 *   0x4A: device_type (8 bytes string)
 *   0x52: device_version (u16)
 *   0x54: num_channels (u16)
 *   ...
 *   0x5C: date (16 bytes string — "DD/MM/YYYY")
 *   0x7C: time (16 bytes string — "HH:MM:SS")
 *   0x9C: driver (64 bytes string)
 *   0xDC: vehicle_id (64 bytes string)
 *   0x15C: venue (64 bytes string)
 *   0x25C: short_comment (64 bytes string)
 */
function parseHeader(dv) {
  const marker = u32(dv, 0x00);
  if (marker !== 0x40) {
    throw new Error(`Arquivo LD inválido: marker esperado 0x40, encontrado 0x${marker.toString(16)}`);
  }

  return {
    metaPtr:      u32(dv, 0x08),
    dataPtr:      u32(dv, 0x0C),
    eventPtr:     u32(dv, 0x24),
    numChannels:  u16(dv, 0x54),
    date:         readString(dv, 0x5C, 16),
    time:         readString(dv, 0x7C, 16),
    driver:       readString(dv, 0x9C, 64),
    vehicleId:    readString(dv, 0xDC, 64),
    venue:        readString(dv, 0x15C, 64),
    comment:      readString(dv, 0x25C, 64),
  };
}

/**
 * Lê os metadados de um canal a partir do offset dado.
 *
 * Layout do canal (relativo ao offset):
 *   0x00: prev_ptr (u32) — ponteiro para canal anterior
 *   0x04: next_ptr (u32) — ponteiro para próximo canal
 *   0x08: data_ptr (u32) — ponteiro para dados deste canal
 *   0x0C: data_len (u32) — comprimento dos dados em bytes
 *   0x10: (u16 padding)
 *   0x12: dtype_a (u16) — indicador tipo A
 *   0x14: dtype (u16)   — tamanho do tipo (2=16bit, 4=32bit)
 *   0x16: freq (u16)    — frequência de amostragem em Hz
 *   0x18: shift (i16)   — offset aditivo
 *   0x1A: mul (i16)     — multiplicador
 *   0x1C: scale (i16)   — divisor de escala
 *   0x1E: dec (i16)     — casas decimais (potência de 10)
 *   0x20: name (32 bytes string)
 *   0x40: short_name (8 bytes string)
 *   0x48: unit (12 bytes string)
 */
function parseChannelMeta(dv, offset) {
  return {
    prevPtr:   u32(dv, offset + 0x00),
    nextPtr:   u32(dv, offset + 0x04),
    dataPtr:   u32(dv, offset + 0x08),
    dataLen:   u32(dv, offset + 0x0C),
    dtypeA:    u16(dv, offset + 0x12),
    dtype:     u16(dv, offset + 0x14),
    freq:      u16(dv, offset + 0x16),
    shift:     i16(dv, offset + 0x18),
    mul:       i16(dv, offset + 0x1A),
    scale:     i16(dv, offset + 0x1C),
    dec:       i16(dv, offset + 0x1E),
    name:      readString(dv, offset + 0x20, 32),
    shortName: readString(dv, offset + 0x40, 8),
    unit:      readString(dv, offset + 0x48, 12),
  };
}

/**
 * Lê os dados brutos de um canal e converte para valores reais.
 *
 * Tipos de dados (baseado em dtype_a e dtype):
 *   dtype_a=0x07: float (dtype=2→float16 emulado, dtype=4→float32)
 *   dtype_a=0x08: double (float64, dtype=8)
 *   default:      inteiro (dtype=2→int16, dtype=4→int32)
 *
 * Conversão para inteiros: value = (raw / scale × 10^(-dec) + shift) × mul
 * Para floats: raw value diretamente (sem conversão de escala)
 */
function readChannelData(dv, chan) {
  const { dataPtr, dataLen, dtype, dtypeA, shift, mul, scale, dec } = chan;

  if (dataLen === 0 || dataPtr === 0) return [];

  const count = Math.floor(dataLen / dtype);
  const values = new Array(count);

  const isFloat = dtypeA === 0x07;
  const isDouble = dtypeA === 0x08;

  for (let i = 0; i < count; i++) {
    const off = dataPtr + i * dtype;

    // Verifica se não excede o tamanho do buffer
    if (off + dtype > dv.byteLength) break;

    let raw;
    if (isDouble) {
      raw = dv.getFloat64(off, true);
      values[i] = raw;
    } else if (isFloat) {
      if (dtype === 4) {
        raw = dv.getFloat32(off, true);
      } else {
        // float16 emulado — lê como int16 e converte
        raw = dv.getInt16(off, true);
      }
      values[i] = raw;
    } else {
      // Inteiro
      if (dtype === 4) {
        raw = dv.getInt32(off, true);
      } else {
        raw = dv.getInt16(off, true);
      }
      // Conversão: (raw / scale × 10^(-dec) + shift) × mul
      const s = scale !== 0 ? scale : 1;
      const m = mul !== 0 ? mul : 1;
      const decFactor = Math.pow(10, -dec);
      values[i] = (raw / s * decFactor + shift) * m;
    }
  }

  return values;
}

/* ─── API Principal ───────────────────────────────────────────────────────── */

/**
 * Parseia um ArrayBuffer de arquivo MoTec LD.
 *
 * @param {ArrayBuffer} buffer — conteúdo binário do arquivo .ld
 * @returns {{ headers: string[], rows: object[], laps: object, lapCol: string }}
 */
export function parseMoTecLD(buffer) {
  if (!buffer || buffer.byteLength < 0x300) {
    throw new Error('Arquivo LD muito pequeno ou vazio.');
  }

  const dv = new DataView(buffer);
  const header = parseHeader(dv);

  /* ── Ler metadados de todos os canais ────────────────────────────── */
  const channels = [];
  let chanOffset = header.metaPtr;

  for (let i = 0; i < header.numChannels && chanOffset > 0; i++) {
    if (chanOffset + 0x60 > buffer.byteLength) break;

    const chan = parseChannelMeta(dv, chanOffset);
    channels.push(chan);
    chanOffset = chan.nextPtr;
    if (chanOffset === 0) break;
  }

  if (channels.length === 0) {
    throw new Error('Nenhum canal encontrado no arquivo LD.');
  }

  /* ── Ler dados de todos os canais ────────────────────────────────── */
  const channelData = channels.map((ch) => ({
    name: ch.name || ch.shortName || `Canal_${channels.indexOf(ch)}`,
    unit: ch.unit,
    freq: ch.freq || 1,
    values: readChannelData(dv, ch),
  }));

  /* ── Sincronizar frequências (interpolar para freq máxima) ──────── */
  const maxFreq = Math.max(...channelData.map((c) => c.freq));
  const maxSamples = Math.max(...channelData.map((c) => c.values.length));

  // Calcular número total de amostras na frequência máxima
  const totalSamples = maxSamples; // usar o maior canal como referência

  /* ── Montar headers e rows no formato padrão ────────────────────── */
  const headers = channelData.map((c) => c.name);

  // Detectar canal de volta (Beacon, Lap, etc.)
  const lapChanIdx = channelData.findIndex((c) =>
    /beacon|lap|volta|marker/i.test(c.name)
  );

  // Gerar coluna de tempo se não existe
  const timeIdx = channelData.findIndex((c) =>
    /^time$|^tempo$|^datalog\s*time/i.test(c.name)
  );

  // Se não tem coluna de tempo, criar uma sintética
  let timeValues;
  if (timeIdx >= 0) {
    timeValues = channelData[timeIdx].values;
  } else {
    // Gerar tempo baseado na frequência do primeiro canal
    const refFreq = channelData[0]?.freq || maxFreq || 1;
    timeValues = Array.from({ length: totalSamples }, (_, i) => i / refFreq);
  }

  /* ── Montar rows ────────────────────────────────────────────────── */
  const rows = [];
  for (let i = 0; i < totalSamples; i++) {
    const row = {};

    for (const ch of channelData) {
      // Interpolar se canal tem frequência menor
      if (ch.freq < maxFreq && ch.values.length > 0) {
        const ratio = ch.freq / maxFreq;
        const srcIdx = Math.min(Math.floor(i * ratio), ch.values.length - 1);
        row[ch.name] = ch.values[srcIdx];
      } else {
        row[ch.name] = i < ch.values.length ? ch.values[i] : null;
      }
    }

    rows.push(row);
  }

  /* ── Detectar voltas ────────────────────────────────────────────── */
  let lapCol = null;
  const laps = {};

  if (lapChanIdx >= 0) {
    // Usar canal de beacon/lap para dividir voltas
    lapCol = channelData[lapChanIdx].name;
    const lapValues = channelData[lapChanIdx].values;

    // Detectar mudanças no valor do beacon para marcar voltas
    let currentLap = 1;
    let prevVal = lapValues[0];

    for (let i = 0; i < rows.length; i++) {
      const ratio = channelData[lapChanIdx].freq / maxFreq;
      const srcIdx = Math.min(Math.floor(i * ratio), lapValues.length - 1);
      const val = lapValues[srcIdx];

      // Detectar transição (beacon muda de valor = nova volta)
      if (i > 0 && val !== prevVal && val > prevVal) {
        currentLap++;
      }
      prevVal = val;

      rows[i][lapCol] = currentLap;

      if (!laps[currentLap]) laps[currentLap] = [];
      laps[currentLap].push(rows[i]);
    }
  } else {
    // Sem canal de volta — dividir por tempo (ex: cada 60s = 1 "volta")
    // Ou tratar como sessão única (volta 1)
    lapCol = 'Lap';
    for (const row of rows) {
      row[lapCol] = 1;
    }
    laps[1] = rows;

    // Adicionar lapCol aos headers se não existe
    if (!headers.includes(lapCol)) {
      headers.push(lapCol);
    }
  }

  return {
    headers, rows, laps, lapCol,
    sessionMeta: {
      date:    header.date    || '',   // "DD/MM/YYYY"
      time:    header.time    || '',   // "HH:MM:SS"
      driver:  header.driver  || '',
      vehicle: header.vehicleId || '',
      venue:   header.venue   || '',
    },
  };
}
