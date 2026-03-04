/**
 * channelDetector.js
 *
 * Detecta automaticamente quais canais de telemetria estão presentes
 * no CSV importado, mapeando os headers para chaves internas.
 */

import { CHANNEL_MAP, CHANNEL_ALIASES } from '@/constants/channels';

/**
 * Tenta encontrar cada canal interno nos headers do CSV.
 *
 * Estratégia:
 *  1. Match exato com CHANNEL_MAP
 *  2. Match parcial (case-insensitive)
 *  3. Match por regex dos CHANNEL_ALIASES
 *
 * @param {string[]} headers - Headers do CSV importado.
 * @returns {Object} Mapa de chave interna → nome real do header.
 */
export function detectChannels(headers) {
  const found = {};

  for (const [key, name] of Object.entries(CHANNEL_MAP)) {
    // 1. Exact match
    const exact = headers.find((h) => h === name);
    if (exact) {
      found[key] = exact;
      continue;
    }

    // 2. Case-insensitive contains
    const partial = headers.find(
      (h) => h.toLowerCase().includes(name.toLowerCase())
    );
    if (partial) {
      found[key] = partial;
      continue;
    }

    // 3. Regex aliases
    const aliases = CHANNEL_ALIASES[key];
    if (aliases) {
      for (const pattern of aliases) {
        const match = headers.find((h) => pattern.test(h));
        if (match && !Object.values(found).includes(match)) {
          found[key] = match;
          break;
        }
      }
    }
  }

  return found;
}

/**
 * Retorna lista de métricas disponíveis para comparação,
 * filtradas pelos canais realmente detectados.
 *
 * @param {Object} channels - Resultado de detectChannels.
 * @param {Array} allMetrics - Lista de métricas possíveis (CHART_METRICS).
 * @returns {Array} Métricas que têm canal correspondente.
 */
export function getAvailableMetrics(channels, allMetrics) {
  return allMetrics.filter((m) => channels[m.key]);
}
