/**
 * tdlParser.js
 *
 * Parser para arquivos TDL (Telemetry Data Log).
 * 100% JavaScript puro — sem dependências externas.
 *
 * TDL pode ser:
 *   1. Tab-Delineated (TSV) — dados separados por tab (mais comum)
 *   2. XML Telemetry Data Log — XML com dados de telemetria veicular
 *
 * Estratégia: tenta parsear como texto delimitado primeiro.
 * Se falhar, tenta como XML. Se ambos falharem, lança erro.
 *
 * Retorna: { headers, rows, laps, lapCol } — mesmo formato do parseCSV
 */

import { parseCSV } from './csvParser';

/**
 * Tenta detectar se o conteúdo é XML.
 */
function isXml(text) {
  const trimmed = text.trim();
  return trimmed.startsWith('<?xml') || trimmed.startsWith('<');
}

/**
 * Parseia número com suporte a vírgula como decimal.
 */
function parseNumber(str) {
  if (!str || typeof str !== 'string') return NaN;
  return parseFloat(str.trim().replace(',', '.'));
}

/**
 * Parseia TDL no formato XML (Telemetry Data Log).
 * Estrutura esperada: elementos com atributos ou child elements representando canais.
 */
function parseXmlTdl(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');

  // Verificar erros de parse
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Erro ao parsear XML do arquivo TDL.');
  }

  const root = doc.documentElement;

  /* ── Estratégia 1: Tabela de dados (rows com child elements) ──── */
  // Procurar elementos que parecem registros de dados
  const dataElements = root.querySelectorAll('record, row, sample, data, entry, point');

  if (dataElements.length > 0) {
    const headers = [];
    const headerSet = new Set();
    const rows = [];

    for (const el of dataElements) {
      const row = {};

      // Ler atributos como campos
      for (const attr of el.attributes) {
        if (!headerSet.has(attr.name)) {
          headerSet.add(attr.name);
          headers.push(attr.name);
        }
        const num = parseNumber(attr.value);
        row[attr.name] = isNaN(num) ? attr.value : num;
      }

      // Ler child elements como campos
      for (const child of el.children) {
        const name = child.tagName;
        const value = child.textContent.trim();
        if (!headerSet.has(name)) {
          headerSet.add(name);
          headers.push(name);
        }
        const num = parseNumber(value);
        row[name] = isNaN(num) ? value : num;
      }

      if (Object.keys(row).length > 0) {
        rows.push(row);
      }
    }

    if (rows.length > 0) {
      return buildResult(headers, rows);
    }
  }

  /* ── Estratégia 2: Canais como elementos, valores como lista ──── */
  // Procurar elementos de canal com arrays de valores
  const channelElements = root.querySelectorAll('channel, signal, parameter, sensor');

  if (channelElements.length > 0) {
    const channels = [];

    for (const ch of channelElements) {
      const name = ch.getAttribute('name') || ch.getAttribute('id') || ch.tagName;
      const valueText = ch.textContent.trim();
      const values = valueText.split(/[\s,;]+/).map(parseNumber).filter((v) => !isNaN(v));
      if (values.length > 0) {
        channels.push({ name, values });
      }
    }

    if (channels.length > 0) {
      const maxLen = Math.max(...channels.map((c) => c.values.length));
      const headers = channels.map((c) => c.name);
      const rows = [];

      for (let i = 0; i < maxLen; i++) {
        const row = {};
        for (const ch of channels) {
          row[ch.name] = i < ch.values.length ? ch.values[i] : null;
        }
        rows.push(row);
      }

      return buildResult(headers, rows);
    }
  }

  throw new Error('Não foi possível extrair dados do XML TDL. Estrutura não reconhecida.');
}

/**
 * Constrói o resultado final com detecção de coluna de volta.
 */
function buildResult(headers, rows) {
  const lapPatterns = [
    /^volta$/i, /^lap$/i, /^lap\s*number$/i,
    /^n.mero.*volta/i, /beacon/i,
  ];

  let lapCol = null;
  for (const h of headers) {
    if (lapPatterns.some((p) => p.test(h))) {
      lapCol = h;
      break;
    }
  }
  if (!lapCol) {
    lapCol = headers.find((h) => /lap|volta/i.test(h)) || null;
  }

  const laps = {};
  if (lapCol) {
    for (const row of rows) {
      const key = row[lapCol] ?? 1;
      if (!laps[key]) laps[key] = [];
      laps[key].push(row);
    }
  } else {
    lapCol = 'Lap';
    for (const row of rows) row[lapCol] = 1;
    if (!headers.includes(lapCol)) headers.push(lapCol);
    laps[1] = rows;
  }

  return { headers, rows, laps, lapCol };
}

/* ─── API Principal ───────────────────────────────────────────────────────── */

/**
 * Parseia um arquivo TDL (tab-delimited ou XML).
 *
 * @param {string} text — conteúdo do arquivo .tdl
 * @returns {{ headers: string[], rows: object[], laps: object, lapCol: string }}
 */
export function parseTDL(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Arquivo TDL vazio ou inválido.');
  }

  const trimmed = text.trim();

  /* ── Estratégia 1: Se parece XML, parsear como XML ─────────────── */
  if (isXml(trimmed)) {
    return parseXmlTdl(trimmed);
  }

  /* ── Estratégia 2: Parsear como texto delimitado (TSV) ─────────── */
  // O parseCSV já auto-detecta tab como separador
  try {
    const result = parseCSV(text);
    if (result.headers.length > 0 && result.rows.length > 0) {
      return result;
    }
  } catch {
    // Se parseCSV falhar, tentar XML como fallback
  }

  /* ── Fallback: tentar XML mesmo sem declaração ─────────────────── */
  if (trimmed.includes('<') && trimmed.includes('>')) {
    try {
      return parseXmlTdl(trimmed);
    } catch {
      // ignore
    }
  }

  throw new Error(
    'Não foi possível parsear o arquivo TDL. ' +
    'Verifique se é um arquivo de dados tabulares (TSV) ou XML de telemetria.',
  );
}
