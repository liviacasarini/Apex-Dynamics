/**
 * channelDetector.js
 *
 * Detecta automaticamente quais canais de telemetria estão presentes
 * no arquivo importado, mapeando os headers para chaves internas.
 *
 * Estratégias (em ordem de prioridade):
 *  1. Match exato com CHANNEL_MAP
 *  2. Match parcial case-insensitive (contains)
 *  3. Match por regex dos CHANNEL_ALIASES
 *  4. Match por unidade (UNIT_HINTS) — essencial para DLF com nomes customizados
 */

import { CHANNEL_MAP, CHANNEL_ALIASES } from '@/constants/channels';

/* ── Estratégia 4: detecção por unidade ──────────────────────────────────── */

/**
 * Mapa de unidade normalizada → lista ordenada de candidatos.
 * Cada candidato tem:
 *   key: chave interna do canal
 *   kw:  palavras-chave no nome do canal para desambiguação
 *        ([] = aceita qualquer canal com essa unidade — usado como fallback)
 *
 * A ordem importa: primeiro match com palavras-chave ganha.
 * Candidatos com kw=[] servem de fallback se nenhuma palavra-chave casar.
 */
const UNIT_HINTS = {
  // ── Velocidade ────────────────────────────────────────────────────────────
  'km/h':  [{ key: 'gpsSpeed',         kw: [] }],
  'kph':   [{ key: 'gpsSpeed',         kw: [] }],
  'kmh':   [{ key: 'gpsSpeed',         kw: [] }],
  'mph':   [{ key: 'gpsSpeed',         kw: [] }],
  'm/s':   [{ key: 'gpsSpeed',         kw: ['gps', 'vel', 'speed', 'velocidade'] }],

  // ── RPM ───────────────────────────────────────────────────────────────────
  'rpm':   [{ key: 'rpm',              kw: [] }],
  'r/min': [{ key: 'rpm',              kw: [] }],
  'rev/min':[{ key: 'rpm',             kw: [] }],

  // ── Tensão / bateria ──────────────────────────────────────────────────────
  'v':     [{ key: 'battery',          kw: ['bat', 'tensao', 'tensão', 'volt', 'supply', 'vcc'] }],
  'volt':  [{ key: 'battery',          kw: [] }],
  'volts': [{ key: 'battery',          kw: [] }],
  'vdc':   [{ key: 'battery',          kw: [] }],

  // ── Temperatura ───────────────────────────────────────────────────────────
  // Vários canais usam °C → desambiguar por nome
  '°c': [
    { key: 'engineTemp',      kw: ['motor', 'engine', 'agua', 'water', 'coolant', ' et', 'et '] },
    { key: 'transOilTemp',    kw: ['cambio', 'caixa', 'trans', 'gear', 'câmbio'] },
    { key: 'egt',             kw: ['egt', 'exhaust', 'escape', 'exh', ' t5', 't5 ', 'turb'] },
    { key: 'iat',             kw: ['iat', 'intake', 'admissao', 'admissão', 'ar adm', 'temp ar', 'tair', 'air temp', 'ambient air'] },
    { key: 'engineTemp',      kw: [] },  // fallback: 1º canal com °C = temp motor
  ],
  'oc': [
    { key: 'engineTemp',      kw: ['motor', 'engine', 'agua', 'water', 'coolant'] },
    { key: 'transOilTemp',    kw: ['cambio', 'caixa', 'trans', 'gear'] },
    { key: 'egt',             kw: ['egt', 'exhaust', 'escape', 'exh', 't5', 'turb'] },
    { key: 'iat',             kw: ['iat', 'intake', 'admissao', 'ar adm', 'tair', 'air temp'] },
    { key: 'engineTemp',      kw: [] },
  ],
  'degc': [
    { key: 'engineTemp',      kw: ['motor', 'engine', 'agua', 'water', 'coolant'] },
    { key: 'transOilTemp',    kw: ['cambio', 'caixa', 'trans', 'gear'] },
    { key: 'egt',             kw: ['egt', 'exhaust', 'escape', 'exh', 't5', 'turb'] },
    { key: 'iat',             kw: ['iat', 'intake', 'admissao', 'ar adm', 'tair', 'air temp'] },
    { key: 'engineTemp',      kw: [] },
  ],
  'celsius': [
    { key: 'engineTemp',      kw: ['motor', 'engine', 'agua', 'water'] },
    { key: 'transOilTemp',    kw: ['cambio', 'caixa', 'trans', 'gear'] },
    { key: 'egt',             kw: ['egt', 'exhaust', 'escape', 'exh', 't5', 'turb'] },
    { key: 'iat',             kw: ['iat', 'intake', 'admissao', 'ar adm', 'tair', 'air temp'] },
    { key: 'engineTemp',      kw: [] },
  ],

  // ── Pressão ───────────────────────────────────────────────────────────────
  // Múltiplos canais usam bar/kPa → desambiguar por nome
  'bar': [
    { key: 'oilPressure',      kw: ['oleo', 'óleo', 'oil', 'lubrif', ' op', 'op '] },
    { key: 'transOilPressure', kw: ['cambio', 'caixa', 'trans', 'gear', 'câmbio'] },
    { key: 'fuelPressure',     kw: ['combustivel', 'combustível', 'fuel', 'combust'] },
    { key: 'brake',            kw: ['freio', 'brake', 'brk'] },
    { key: 'map',              kw: ['admissao', 'admissão', 'manifold', 'boost', 'intake', 'map'] },
    { key: 'oilPressure',      kw: [] },  // fallback
  ],
  'kpa': [
    { key: 'baroPressure',     kw: ['baro', 'barometric', 'atm', 'ambient press', 'atmospheric'] },
    { key: 'map',              kw: ['admissao', 'admissão', 'manifold', 'boost', 'intake', 'map'] },
    { key: 'oilPressure',      kw: ['oleo', 'oil', 'lubrif'] },
    { key: 'transOilPressure', kw: ['cambio', 'caixa', 'trans', 'gear'] },
    { key: 'fuelPressure',     kw: ['combustivel', 'fuel', 'combust'] },
    { key: 'map',              kw: [] },  // fallback
  ],
  'hpa':  [{ key: 'baroPressure', kw: [] }],
  'mbar': [{ key: 'baroPressure', kw: [] }],
  'mpa': [
    { key: 'fuelPressure',     kw: [] },
  ],
  'psi': [
    { key: 'oilPressure',      kw: ['oleo', 'oil'] },
    { key: 'transOilPressure', kw: ['cambio', 'trans', 'gear'] },
    { key: 'fuelPressure',     kw: ['combustivel', 'fuel'] },
    { key: 'map',              kw: ['admissao', 'manifold', 'boost'] },
    { key: 'brake',            kw: ['freio', 'brake'] },
    { key: 'oilPressure',      kw: [] },
  ],

  // ── Percentagem ───────────────────────────────────────────────────────────
  '%': [
    { key: 'throttle',    kw: ['borboleta', 'throttle', 'tps', 'acelerador', 'pedal', 'tp1', ' tp '] },
    { key: 've',          kw: ['ve', 'volumetr', 'eficiencia', 'eficiência'] },
    { key: 'injDuty1',    kw: ['inj1', 'inj 1', 'injeto1', 'inject1'] },
    { key: 'injDuty2',    kw: ['inj2', 'inj 2', 'injeto2', 'inject2'] },
    { key: 'injDuty3',    kw: ['inj3', 'inj 3', 'injeto3', 'inject3'] },
    { key: 'injDuty4',    kw: ['inj4', 'inj 4', 'injeto4', 'inject4'] },
    { key: 'fuelComp',    kw: ['comp', 'correct', 'corret'] },
    { key: 'throttle',    kw: [] },  // fallback: 1º canal com % = acelerador
  ],

  // ── Lambda / AFR ──────────────────────────────────────────────────────────
  'λ':      [{ key: 'lambda',      kw: [] }],
  'lambda': [
    { key: 'lambda',       kw: ['lambda 1', 'lambda1', 'wbo2', 'wideband'] },
    { key: 'lambdaTarget', kw: ['target', 'alvo', 'soll', 'set'] },
    { key: 'lambda',       kw: [] },  // fallback
  ],
  'lb':     [
    { key: 'lambda',       kw: ['lambda 1', 'lambda1', 'ego', 'o2'] },
    { key: 'lambdaTarget', kw: ['target', 'alvo'] },
    { key: 'lambda',       kw: [] },
  ],
  'afr':    [{ key: 'lambda',      kw: [] }],
  'lam':    [{ key: 'lambda',      kw: [] }],

  // ── Distância / Altitude ──────────────────────────────────────────────────
  'm':  [
    { key: 'altitude',    kw: ['alt', 'altitude', 'height', 'elev'] },
    { key: 'gpsDistance', kw: ['dist', 'gps', 'odo'] },
  ],
  'km': [{ key: 'gpsDistance', kw: ['dist', 'gps', 'odo'] }],

  // ── Ângulo / Ignição ──────────────────────────────────────────────────────
  '°':    [{ key: 'ignAngle', kw: ['ign', 'ignic', 'spark', 'timing', 'avanco', 'avanço'] }],
  'deg':  [{ key: 'ignAngle', kw: ['ign', 'ignic', 'spark', 'timing'] }],
  'grau': [{ key: 'ignAngle', kw: ['ign', 'ignic'] }],
};

/**
 * Normaliza uma string de unidade para comparação uniforme.
 * Remove espaços, converte para minúsculo, padroniza variantes comuns.
 */
function normalizeUnit(raw) {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .trim()
    // graus: °, º, ° (diferentes encodings) → °
    .replace(/[°º\u00b0\u02da]/g, '°')
    // °c → '°c'; se vier só 'c' após normalização abaixo, não interferir
    .replace(/°\s*c\b/, '°c')
    .replace(/\s+/g, '');  // remove espaços restantes
}

/**
 * 4ª estratégia: detecção por unidade.
 * Para cada header ainda não detectado, verifica se a unidade bate com
 * algum canal conhecido e usa palavras-chave do nome para desambiguar.
 *
 * @param {string[]} headers - headers do arquivo
 * @param {string[]} units   - unidades paralelas aos headers (pode ser [])
 * @param {Object}   found   - canais já detectados (modificado in-place)
 */
function detectByUnits(headers, units, found) {
  if (!units || units.length === 0) return;

  const assigned = new Set(Object.values(found));

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (assigned.has(header)) continue;  // já atribuído por estratégia anterior

    const unitNorm = normalizeUnit(units[i]);
    const hints = UNIT_HINTS[unitNorm];
    if (!hints) continue;

    const headerLow = header.toLowerCase();

    for (const { key, kw } of hints) {
      if (found[key]) continue;  // chave já preenchida

      // kw=[] significa fallback (aceita qualquer canal com essa unidade)
      const kwMatch = kw.length === 0 || kw.some((w) => headerLow.includes(w));
      if (kwMatch) {
        found[key] = header;
        assigned.add(header);
        break;
      }
    }
  }
}

/* ── API pública ─────────────────────────────────────────────────────────── */

/**
 * Tenta encontrar cada canal interno nos headers do arquivo.
 *
 * Estratégias em ordem de prioridade:
 *  1. Match exato com CHANNEL_MAP
 *  2. Match parcial case-insensitive (contains)
 *  3. Match por regex dos CHANNEL_ALIASES
 *  4. Match por unidade (UNIT_HINTS) — para DLF com nomes customizados
 *
 * @param {string[]} headers - Headers do arquivo importado.
 * @param {string[]} [units] - Unidades paralelas (opcional; vem do DLF).
 * @returns {Object} Mapa de chave interna → nome real do header.
 */
export function detectChannels(headers, units = []) {
  const found = {};

  for (const [key, name] of Object.entries(CHANNEL_MAP)) {
    // 1. Exact match
    const exact = headers.find((h) => h === name);
    if (exact) { found[key] = exact; continue; }

    // 2. Case-insensitive contains
    const partial = headers.find(
      (h) => h.toLowerCase().includes(name.toLowerCase())
    );
    if (partial) { found[key] = partial; continue; }

    // 3. Regex aliases
    const aliases = CHANNEL_ALIASES[key];
    if (aliases) {
      for (const pattern of aliases) {
        // Busca o primeiro header que case com o padrão E ainda não esteja atribuído.
        // Sem esse filtro, headers.find() retorna o 1º match global e se ele já foi
        // consumido por outro canal, o canal atual fica sem mapeamento.
        const assigned = new Set(Object.values(found));
        const match = headers.find((h) => pattern.test(h) && !assigned.has(h));
        if (match) {
          found[key] = match;
          break;
        }
      }
    }
  }

  // 4. Detecção por unidade (para canais ainda não encontrados)
  detectByUnits(headers, units, found);

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
