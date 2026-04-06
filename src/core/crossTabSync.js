/**
 * crossTabSync.js — Leitura cruzada de dados entre tabs
 *
 * Cada função retorna dados da "fonte verdade" de uma tab,
 * permitindo que outras tabs usem como fallback automático.
 * Nenhuma função ESCREVE em localStorage — apenas leitura.
 */

// ── Storage keys ──
const PESO_KEY         = 'rt_peso_';
const FUEL_KEY         = 'rt_fuel_';
const PILOTS_KEY       = 'rt_pilots';
const TRACK_KEY        = 'rt_track_custom_';
const ACTIVE_TRACK_KEY = 'rt_active_track_';
const PNEUS_KEY        = 'rt_pneus_';
const PNEUS_LIB        = 'rt_tyre_library';
const PNEUS_STINTS     = 'rt_pneus_stints_';
const REG_KEY          = 'rt_regulations';
const MECH_SPECS_KEY   = 'rt_part_specs_';
const SETUP_KEY        = 'race_telemetry_setups';
const WS_KEY           = 'rt_workspaces';

/** Evento disparado pelo PistasTab ao selecionar/mudar pista ativa */
export const TRACK_SELECTED_EVENT = 'rt_track_selected';

// ── Helpers ──
function safeJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

// ─────────────────────────────────────────────────────
// 1. PESO → fonte verdade de peso, CG, geometria
// ─────────────────────────────────────────────────────
export function readPeso(profileId) {
  if (!profileId) return null;
  return safeJSON(`${PESO_KEY}${profileId}`);
}

// ─────────────────────────────────────────────────────
// 2. PILOTOS → fonte verdade de peso do piloto
// ─────────────────────────────────────────────────────
export function readPilots() {
  return safeJSON(PILOTS_KEY, []);
}

/** Retorna o piloto designado ao perfil, ou null */
export function readAssignedPilot(profileId) {
  if (!profileId) return null;
  const pilots = readPilots();
  return pilots.find(p => p.assignedProfileId === profileId) || null;
}

// ─────────────────────────────────────────────────────
// 3. COMBUSTÍVEL → fonte verdade de consumo
// ─────────────────────────────────────────────────────
export function readFuel(profileId) {
  if (!profileId) return null;
  const scenarios = safeJSON(`${FUEL_KEY}${profileId}`, []);
  return scenarios[0] || null;
}

// ─────────────────────────────────────────────────────
// 4. PISTAS → fonte verdade de dados da pista
// ─────────────────────────────────────────────────────
export function readTrackCustom(profileId) {
  if (!profileId) return {};
  return safeJSON(`${TRACK_KEY}${profileId}`, {});
}

/** Retorna dados customizados de uma pista específica (por trackId) */
export function readTrackById(profileId, trackId) {
  const customs = readTrackCustom(profileId);
  return customs[trackId] || null;
}

/** Retorna a pista ativa selecionada no PistasTab para este perfil */
export function readActiveTrack(profileId) {
  if (!profileId) return null;
  return safeJSON(`${ACTIVE_TRACK_KEY}${profileId}`, null);
}

// ─────────────────────────────────────────────────────
// 5. PNEUS → sessão atual + biblioteca de compostos
// ─────────────────────────────────────────────────────
export function readPneusLib(_profileId) {
  return safeJSON(PNEUS_LIB, []);
}

/** Retorna a sessão de pneus atual (pressões + temperaturas) */
export function readPneusSession(profileId) {
  if (!profileId) return null;
  return safeJSON(`${PNEUS_KEY}${profileId}`, null);
}

/** Retorna os stints de pneu registrados */
export function readPneusStints(profileId) {
  if (!profileId) return [];
  return safeJSON(`${PNEUS_STINTS}${profileId}`, []);
}

// ─────────────────────────────────────────────────────
// 6. REGULAMENTAÇÕES → limites do campeonato
// ─────────────────────────────────────────────────────
export function readRegulations() {
  return safeJSON(REG_KEY, {});
}

// ─────────────────────────────────────────────────────
// 7. MECÂNICA → especificações das peças
// ─────────────────────────────────────────────────────
/** Retorna specs indexadas por partId: { [partId]: { taxaMola, atrito, ... } } */
export function readMechanicSpecs(profileId) {
  if (!profileId) return {};
  return safeJSON(`${MECH_SPECS_KEY}${profileId}`, {});
}

// ─────────────────────────────────────────────────────
// 8. SETUP SHEET → setups salvos
// ─────────────────────────────────────────────────────
/** Retorna todos os setups salvos (array). Filtra pelo profileId se fornecido. */
export function readSetupSheets(profileId) {
  const all = safeJSON(SETUP_KEY, []);
  if (!profileId) return all;
  return all.filter(s => !s.profileId || s.profileId === profileId);
}

/** Retorna o setup mais recente do perfil */
export function readLatestSetup(profileId) {
  const sheets = readSetupSheets(profileId);
  if (!sheets.length) return null;
  return sheets[sheets.length - 1];
}

// ─────────────────────────────────────────────────────
// 9. TEMPERATURA → último registro de condições
// ─────────────────────────────────────────────────────
export function readLatestTemp() {
  const ws = safeJSON(WS_KEY);
  if (!ws) return null;
  const activeWs = ws.workspaces?.find(w => w.id === ws.activeWorkspaceId);
  const log = activeWs?.tempLog;
  if (!log || log.length === 0) return null;
  // Retorna a entrada mais recente
  return log[log.length - 1];
}

// ─────────────────────────────────────────────────────
// 10. AGREGADOR — todos os dados cross-tab de uma vez
// ─────────────────────────────────────────────────────
export function getCrossTabData(profileId) {
  const peso       = readPeso(profileId);
  const pilot      = readAssignedPilot(profileId);
  const fuel       = readFuel(profileId);
  const tracks     = readTrackCustom(profileId);
  const pneusLib   = readPneusLib(profileId);
  const latestTemp = readLatestTemp();

  return {
    // ── Peso / Geometria ──
    pesoCarro:       peso?.pesoCarro       || '',
    pesoPiloto:      pilot?.weightEquipped || peso?.pesoPiloto || '',
    pesoDianteiro:   peso?.pesoDianteiro   || '',
    pesoTraseiro:    peso?.pesoTraseiro    || '',
    pesoHomologado:  peso?.pesoHomologado  || '',
    wheelbase:       peso?.wheelbase       || '',
    trackFront:      peso?.trackFront      || '',
    trackRear:       peso?.trackRear       || '',
    alturaCG:        peso?.alturaCG        || '',
    rollCenterFront: peso?.rollCenterFront || '',
    rollCenterRear:  peso?.rollCenterRear  || '',
    inerciYaw:       peso?.inerciYaw       || '',
    inerciRoll:      peso?.inerciRoll      || '',
    inerciPitch:     peso?.inerciPitch     || '',

    // ── Piloto ──
    pilotName:           pilot?.name              || '',
    pilotWeight:         pilot?.weightEquipped     || '',
    tireWearMultiplier:  pilot?.tireWearMultiplier || '',
    fuelConsMultiplier:  pilot?.fuelConsMultiplier || '',
    brakeWearMultiplier: pilot?.brakeWearMultiplier|| '',

    // ── Combustível ──
    fuelCarWeight:     fuel?.carWeight       || '',
    fuelDriverWeight:  fuel?.driverWeight    || '',
    fuelTrackLength:   fuel?.trackLength     || '',
    fuelConsumption:   fuel?.consumptionRate || '',
    tankCapacity:      fuel?.tankCapacity    || '',

    // ── Temperatura / Clima ──
    tempAmbiente:    latestTemp?.ambientTemp   || '',
    tempPista:       latestTemp?.trackTemp     || '',
    humidade:        latestTemp?.humidity      || '',
    altitude:        latestTemp?.altitude      || '',
    baroPressure:    latestTemp?.baroPressure  || '',
    windSpeed:       latestTemp?.windSpeed     || '',
    windDir:         latestTemp?.windDir       || '',
    precipitation:   latestTemp?.precipitation || '',

    // ── Pistas (objeto com tracks) ──
    tracks,

    // ── Pneus Lib ──
    pneusLib,

    // Objetos completos (para cálculos avançados)
    _raw: { peso, pilot, fuel, tracks, pneusLib, latestTemp },
  };
}
