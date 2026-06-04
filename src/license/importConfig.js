/**
 * importConfig.js — Configuração de importação de telemetria por cliente.
 *
 * A fonte da verdade é o campo `ic` dentro do certificado RS256 (assinado
 * pelo servidor). Define overrides de mapeamento de canais, separadores,
 * linhas a pular e unidades, específicos para o arquivo daquele cliente.
 *
 * Estrutura esperada:
 * {
 *   format: { colSep:'auto'|';'|','|'\t', decimal:'auto'|'.'|',',
 *             skipLines:0, unitsLine:null|number, sampleRate:'auto'|number },
 *   channels: { rpm:{header:'Engine_RPM', unit:'rpm'},
 *               gpsSpeed:{header:'Vel', unit:'mph'}, ... }
 * }
 *
 * AUSÊNCIA de config (null) → o app usa SOMENTE a auto-detecção (comportamento
 * padrão, idêntico ao que sempre foi). O override é puramente aditivo.
 */

const IC_KEY = 'rt_import_config';

/** Decodifica o payload de um certificado sem verificar assinatura (só leitura). */
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch { return null; }
}

/** Extrai a import_config de um certificado. Retorna null se ausente. */
export function parseCertImportConfig(certificate) {
  if (!certificate) return null;
  const payload = decodeJwtPayload(certificate);
  const ic = payload?.ic;
  return (ic && typeof ic === 'object') ? ic : null;
}

/** Salva a config vigente (chamado pelo LicenseGate ao validar sessão). */
export function setImportConfig(cfg) {
  try {
    if (cfg) localStorage.setItem(IC_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(IC_KEY);
  } catch { /* noop */ }
}

/** Lê a config vigente. Retorna null se não houver. */
export function getImportConfig() {
  try {
    const raw = localStorage.getItem(IC_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    return (cfg && typeof cfg === 'object') ? cfg : null;
  } catch { return null; }
}

/* ── Helpers de leitura segura (com defaults) ──────────────────────── */

/** Retorna as opções de formato (separadores etc.), com defaults seguros. */
export function getFormatOptions(cfg) {
  const f = (cfg || getImportConfig())?.format || {};
  return {
    colSep:     f.colSep     || 'auto',   // 'auto' | ';' | ',' | '\t'
    decimal:    f.decimal    || 'auto',   // 'auto' | '.' | ','
    skipLines:  Number.isInteger(f.skipLines) ? f.skipLines : 0,
    unitsLine:  Number.isInteger(f.unitsLine) ? f.unitsLine : null,
    sampleRate: f.sampleRate || 'auto',
  };
}

/**
 * Retorna o mapa de overrides de canais: { chaveInterna: {header, unit} }.
 * Vazio se não houver config.
 */
export function getChannelOverrides(cfg) {
  const c = (cfg || getImportConfig())?.channels;
  return (c && typeof c === 'object') ? c : {};
}

/** true se o cliente tem alguma configuração custom ativa. */
export function hasImportConfig() {
  return getImportConfig() !== null;
}

/* ── Tabela de conversão de unidades (origem → unidade interna do app) ─ */

const UNIT_CONVERSIONS = {
  // velocidade → km/h
  'mph_kmh':  (v) => v * 1.609344,
  'm/s_kmh':  (v) => v * 3.6,
  // pressão → bar
  'psi_bar':  (v) => v * 0.0689476,
  'kpa_bar':  (v) => v / 100,
  'mpa_bar':  (v) => v * 10,
  // pressão → kpa
  'bar_kpa':  (v) => v * 100,
  'psi_kpa':  (v) => v * 6.89476,
  // temperatura → °C
  'f_c':      (v) => (v - 32) * 5 / 9,
  'k_c':      (v) => v - 273.15,
};

/**
 * Retorna uma função de conversão para um valor de `fromUnit` → `toUnit`,
 * ou null se não precisar converter (mesma unidade ou desconhecida).
 */
export function getUnitConverter(fromUnit, toUnit) {
  if (!fromUnit || !toUnit) return null;
  const f = String(fromUnit).toLowerCase().trim();
  const t = String(toUnit).toLowerCase().trim();
  if (f === t) return null;
  const fn = UNIT_CONVERSIONS[`${f}_${t}`];
  return fn || null;
}
