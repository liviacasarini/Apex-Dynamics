/**
 * fileRouter.js
 *
 * Router central de formatos de telemetria.
 * Detecta o formato do arquivo pela extensão, lê de forma apropriada
 * (texto ou binário) e despacha para o parser correto.
 *
 * Retorna sempre o formato unificado: { headers, rows, laps, lapCol }
 *
 * Formatos suportados nativamente: CSV, TDL, LD, LOG, DLF
 * Formatos proprietários (orientação para exportar como CSV): XRK, FTL, BIN
 */

import { parseCSV } from './parsers/csvParser';
import { parseMoTecLD } from './parsers/ldParser';
import { parseBoschLog } from './parsers/logParser';
import { parseTDL } from './parsers/tdlParser';
import { parseDLF } from './parsers/dlfParser';

/* ─── Definições de Formato ──────────────────────────────────────────────── */

/**
 * Mapa de extensões suportadas.
 * - parser:   função de parsing (null = proprietário sem parser)
 * - readAs:   'text' | 'binary' — como ler o File
 * - name:     nome amigável do formato
 * - software: software de origem
 * - exportMsg: mensagem de orientação para formatos proprietários
 */
const FORMAT_REGISTRY = {
  csv: {
    parser: parseCSV,
    readAs: 'text',
    name: 'CSV',
    software: 'ProTune / MoTec / AiM / Genérico',
    exportMsg: null,
  },
  txt: {
    parser: parseCSV,
    readAs: 'text',
    name: 'TXT (texto delimitado)',
    software: 'Genérico',
    exportMsg: null,
  },
  tdl: {
    parser: parseTDL,
    readAs: 'text',
    name: 'TDL (Telemetry Data Log)',
    software: 'Diversos',
    exportMsg: null,
  },
  ld: {
    parser: parseMoTecLD,
    readAs: 'binary',
    name: 'MoTec LD',
    software: 'MoTec i2',
    exportMsg: null,
  },
  log: {
    parser: parseBoschLog,
    readAs: 'text',
    name: 'Bosch LOG',
    software: 'Bosch WinDarab',
    exportMsg: null,
  },
  /* ── Formatos proprietários (sem parser nativo) ───────────────────── */
  xrk: {
    parser: null,
    readAs: null,
    name: 'AiM XRK',
    software: 'AiM Race Studio',
    exportMsg:
      'O formato XRK (AiM Sports) é proprietário e não pode ser lido diretamente. ' +
      'Para utilizar seus dados, abra o arquivo no AiM Race Studio e exporte como CSV:\n' +
      'File → Export → CSV / Excel.',
  },
  drk: {
    parser: null,
    readAs: null,
    name: 'AiM DRK',
    software: 'AiM Race Studio',
    exportMsg:
      'O formato DRK (AiM Sports) é proprietário. ' +
      'Abra o arquivo no AiM Race Studio e exporte como CSV: File → Export → CSV / Excel.',
  },
  dlf: {
    parser:   parseDLF,
    readAs:   'text',
    encoding: 'windows-1252', // ProTune gera arquivos em Windows-1252 (BR)
    name:     'ProTune DLF',
    software: 'ProTune',
    exportMsg: null,
  },
  ftl: {
    parser: null,
    readAs: null,
    name: 'FuelTech FTL',
    software: 'FuelTech FTManager',
    exportMsg:
      'O formato FTL (FuelTech) é proprietário. ' +
      'Abra o arquivo no FTManager e exporte como CSV:\n' +
      'File → Export Data → CSV.',
  },
  bin: {
    parser: null,
    readAs: null,
    name: 'Bosch BIN',
    software: 'Bosch WinDarab',
    exportMsg:
      'O formato BIN (Bosch Motorsport) é proprietário. ' +
      'Abra o arquivo no WinDarab e exporte como CSV ou LOG:\n' +
      'File → Export → ASCII / CSV.',
  },
};

/* ─── Extensões aceitas pelo input file ──────────────────────────────────── */

/** Extensões com parser nativo (abre direto). */
export const NATIVE_EXTENSIONS = Object.entries(FORMAT_REGISTRY)
  .filter(([, f]) => f.parser !== null)
  .map(([ext]) => `.${ext}`);

/** Todas as extensões reconhecidas (nativas + proprietárias). */
export const ALL_EXTENSIONS = Object.keys(FORMAT_REGISTRY).map((ext) => `.${ext}`);

/**
 * String para o atributo `accept` do `<input type="file">`.
 * Inclui extensões nativas e proprietárias para que o usuário possa
 * selecionar qualquer arquivo reconhecido (os proprietários mostram orientação).
 */
export const FILE_ACCEPT_STRING = ALL_EXTENSIONS
  .flatMap((ext) => [ext, ext.toUpperCase()])
  .join(',');

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/**
 * Extrai a extensão do nome de arquivo (sem o ponto, lowercase).
 */
function getExtension(fileName) {
  if (!fileName) return '';
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

/**
 * Retorna informações sobre um formato a partir da extensão.
 *
 * @param {string} ext — extensão sem ponto (e.g. 'csv', 'ld')
 * @returns {object|null} formato ou null se desconhecido
 */
export function getFormatInfo(ext) {
  return FORMAT_REGISTRY[ext?.toLowerCase()] || null;
}

/**
 * Verifica se uma extensão é suportada nativamente (tem parser).
 */
export function isNativeFormat(ext) {
  const info = FORMAT_REGISTRY[ext?.toLowerCase()];
  return info?.parser != null;
}

/**
 * Verifica se uma extensão é proprietária (reconhecida, mas sem parser).
 */
export function isProprietaryFormat(ext) {
  const info = FORMAT_REGISTRY[ext?.toLowerCase()];
  return info != null && info.parser == null;
}

/* ─── Serialização ───────────────────────────────────────────────────────── */

/**
 * Serializa dados parseados para texto CSV (separador ;).
 * Usado para persistir sessões importadas de formatos binários (ex: .ld)
 * no IndexedDB em formato texto, compatível com a restauração via parseCSV.
 *
 * @param {{ headers: string[], rows: object[] }} parsed
 * @returns {string} texto CSV com separador ;
 */
export function serializeToCSV(parsed) {
  const { headers, rows, laps, lapCol } = parsed;
  if (!headers?.length || !rows?.length) return '';

  // Mapeia cada row → número de volta corrigido (pós noise-filtering do parser).
  // Sem isso, o CSV serializado usaria os valores brutos do GPS counter,
  // e ao re-parsear com parseCSV as voltas ficariam agrupadas de forma diferente.
  const lapIdx = lapCol ? headers.indexOf(lapCol) : -1;
  let rowLapMap = null;
  if (laps && lapIdx >= 0 && Object.keys(laps).length > 0) {
    rowLapMap = new Map();
    for (const [lapNum, lapRows] of Object.entries(laps)) {
      for (const row of lapRows) {
        rowLapMap.set(row, lapNum);
      }
    }
  }

  const lines = [headers.join(';')];

  for (const row of rows) {
    const vals = headers.map((h, i) => {
      // Sobrescrever coluna de volta com o valor corrigido do parser
      if (i === lapIdx && rowLapMap) {
        const corrected = rowLapMap.get(row);
        if (corrected !== undefined) return String(corrected);
      }
      const v = row[h];
      if (v == null) return '';
      if (typeof v === 'number') return String(v);
      return String(v);
    });
    lines.push(vals.join(';'));
  }

  return lines.join('\n');
}

/* ─── API Principal ──────────────────────────────────────────────────────── */

/**
 * Lê e parseia um File de telemetria, retornando dados no formato unificado
 * junto com o conteúdo bruto para persistência.
 *
 * @param {File} file — arquivo selecionado pelo usuário
 * @returns {Promise<{ headers, rows, laps, lapCol, rawText: string }>}
 *   rawText = texto original para formatos de texto, ou CSV serializado para binários.
 *   Pode ser salvo no IndexedDB e restaurado via parseCSV.
 * @throws {Error} se o formato não for suportado ou se o parsing falhar
 */
export function routeFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Nenhum arquivo fornecido.'));
      return;
    }

    const ext = getExtension(file.name);
    const format = FORMAT_REGISTRY[ext];

    /* ── Extensão desconhecida ──────────────────────────────────────── */
    if (!format) {
      reject(new Error(
        `Formato ".${ext}" não reconhecido.\n\n` +
        `Formatos suportados: ${NATIVE_EXTENSIONS.join(', ')}\n` +
        `Formatos proprietários (exportar como CSV): .xrk, .drk, .ftl, .bin`
      ));
      return;
    }

    /* ── Formato proprietário (sem parser) ─────────────────────────── */
    if (!format.parser) {
      reject(new Error(format.exportMsg));
      return;
    }

    /* ── Formato nativo — ler e parsear ────────────────────────────── */
    const reader = new FileReader();

    reader.onerror = () => reject(new Error(`Erro ao ler arquivo "${file.name}".`));

    reader.onload = (e) => {
      try {
        const rawContent = e.target.result;
        const result = format.parser(rawContent);

        // rawText: sempre serializar para CSV para que possa ser restaurado
        // via IndexedDB + parseCSV, independente do formato original.
        // Formatos CSV/TXT (parser === parseCSV) mantêm o texto original.
        // Formatos com parser próprio (DLF, LOG, TDL, LD) serializam para CSV.
        const rawText = format.parser === parseCSV
          ? rawContent
          : serializeToCSV(result);

        resolve({ ...result, rawText });
      } catch (err) {
        reject(new Error(
          `Erro ao processar "${file.name}" (${format.name}):\n${err.message}`
        ));
      }
    };

    if (format.readAs === 'binary') {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, format.encoding || 'utf-8');
    }
  });
}

/**
 * Parseia dados de texto cru (já lido) com base na extensão.
 * Usado para restaurar sessões salvas onde já temos o texto,
 * sem precisar de File/FileReader.
 *
 * Para formatos binários (.ld), espera um ArrayBuffer.
 * Para formatos de texto, espera uma string.
 *
 * @param {string|ArrayBuffer} data — conteúdo do arquivo
 * @param {string} fileName — nome do arquivo (para detectar extensão)
 * @returns {{ headers: string[], rows: object[], laps: object, lapCol: string }}
 */
export function routeData(data, fileName) {
  const ext = getExtension(fileName);
  const format = FORMAT_REGISTRY[ext];

  if (!format || !format.parser) {
    // Fallback: tentar como CSV (retrocompatibilidade)
    return parseCSV(typeof data === 'string' ? data : '');
  }

  return format.parser(data);
}

/**
 * Lista de formatos para exibição na UI.
 * Separados em nativos e proprietários.
 */
export const FORMAT_LIST = {
  native: Object.entries(FORMAT_REGISTRY)
    .filter(([, f]) => f.parser != null)
    .map(([ext, f]) => ({ ext, ...f })),
  proprietary: Object.entries(FORMAT_REGISTRY)
    .filter(([, f]) => f.parser == null)
    .map(([ext, f]) => ({ ext, ...f })),
};
