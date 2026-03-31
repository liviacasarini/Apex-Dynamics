/**
 * strategyDataService.js — Serviço de Dados para a Tab Estratégia
 *
 * Agrega dados de todas as tabs relevantes e aplica os limites regulamentares
 * definidos na RegulamentacoesTab como constraints.
 *
 * Fluxo:
 *   RegulamentacoesTab → constraints (fonte de verdade)
 *   CalendarioTab      → dados da corrida (trackId, raceLaps)
 *   PistasTab          → dados da pista (pit lane, fatores de consumo/desgaste)
 *   PilotosTab         → dados do piloto (fadiga, multiplicadores)
 *   PneusTab           → compostos (degradação, warm-up, cliff)
 *   CombustivelTab     → combustível (consumo/volta, tanque, abastecimento)
 *
 * Todas as leituras são do localStorage — não depende de props nem context.
 */

/* ── Storage Keys ─────────────────────────────────────────────────── */
const KEYS = {
  regulations: 'rt_regulations',
  calendar:    'rt_calendar_events',
  pilots:      'rt_pilots',
  compounds:   'rt_compound_library',
};

/* ── Helpers ───────────────────────────────────────────────────────── */
function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/* ── Regulamentações (constraints) ─────────────────────────────────── */

/**
 * Lê todos os parâmetros regulamentares.
 * Retorna um objeto com valores numéricos (ou null se não preenchido).
 */
export function getRegulations() {
  const raw = readJSON(KEYS.regulations, {});
  return {
    // Peso
    pesoMinimo:           num(raw.pesoMinimo),
    // Combustível
    combustivelMax:       num(raw.combustivelMax),
    // Pneus
    pneusCompostosMin:    num(raw.pneusCompostosMin),
    pneusCompostosMax:    num(raw.pneusCompostosMax),
    // Estratégia
    pitStopsObrigatorios: num(raw.pitStopsObrigatorios),
    stintMinimoVoltas:    num(raw.stintMinimoVoltas),
    tempoMinimoBox:       num(raw.tempoMinimoBox),
    // Motor
    motorUnidadesTemporada: num(raw.motorUnidadesTemporada),
    // Assoalho
    assoalhoAlturaMin:    num(raw.assoalhoAlturaMin),
    skidDesgasteMax:      num(raw.skidDesgasteMax),
    // Scrutineering
    margemScrutin:        num(raw.margemScrutin),
    // Raw (para textos descritivos)
    _raw: raw,
  };
}

/* ── Calendário (corrida específica) ───────────────────────────────── */

/**
 * Retorna o próximo evento de corrida no calendário, ou o evento com `eventId`.
 */
export function getRaceEvent(eventId = null) {
  const events = readJSON(KEYS.calendar, []);
  if (eventId) {
    return events.find((e) => e.id === eventId) ?? null;
  }
  // Próxima corrida futura
  const now = new Date();
  return events
    .filter((e) => e.category === 'corrida' && new Date(e.start) >= now)
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0] ?? null;
}

/* ── Pistas ────────────────────────────────────────────────────────── */

/**
 * Lê dados customizados de uma pista específica (pit lane, fatores, etc).
 * Usa o profileId do workspace ativo para localizar os dados.
 */
export function getTrackData(trackId, profileId) {
  if (!trackId || !profileId) return null;
  const raw = readJSON(`rt_track_custom_${profileId}`, {});
  const custom = raw[trackId];
  if (!custom) return null;

  return {
    pitLaneLength:  num(custom.pitLaneLength),
    pitSpeedLimit:  num(custom.pitSpeedLimit),
    pitEntryLength: num(custom.pitEntryLength),
    pitExitLength:  num(custom.pitExitLength),
    fuelFactor:     num(custom.fuelFactor),
    tireFactor:     num(custom.tireFactor),
    sectors:        custom.sectors ?? [],
    length:         num(custom.length),
  };
}

/**
 * Calcula o tempo estimado perdido em cada pit stop (entrada + parada + saída).
 */
export function estimatePitLossTime(trackData, regulations) {
  if (!trackData) return null;

  const pitLength = trackData.pitLaneLength;
  const pitSpeed  = trackData.pitSpeedLimit;
  const minTime   = regulations?.tempoMinimoBox;

  if (!pitLength || !pitSpeed) return null;

  // Tempo de percurso no pit lane (s) = distância (m) / velocidade (m/s)
  const travelTime = pitLength / (pitSpeed / 3.6);

  // Tempo mínimo no box (regulamentar) ou estimado
  const stopTime = minTime ?? 0;

  return {
    travelTime:  Math.round(travelTime * 10) / 10,
    stopTime,
    totalLoss:   Math.round((travelTime + stopTime) * 10) / 10,
  };
}

/* ── Pilotos ───────────────────────────────────────────────────────── */

/**
 * Retorna os parâmetros de estratégia de um piloto específico.
 */
export function getPilotStrategyData(pilotId) {
  const pilots = readJSON(KEYS.pilots, []);
  const pilot = pilots.find((p) => p.id === pilotId);
  if (!pilot) return null;

  return {
    name:                pilot.name,
    fadigaDegradacao:    num(pilot.fadigaDegradacao),
    stintMaxMinutos:     num(pilot.stintMaxMinutos),
    tireWearMultiplier:  num(pilot.tireWearMultiplier) ?? 1.0,
    fuelConsMultiplier:  num(pilot.fuelConsMultiplier) ?? 1.0,
    brakeWearMultiplier: num(pilot.brakeWearMultiplier) ?? 1.0,
  };
}

/**
 * Lista todos os pilotos com dados mínimos para seleção.
 */
export function listPilots() {
  const pilots = readJSON(KEYS.pilots, []);
  return pilots.map((p) => ({
    id:   p.id,
    name: p.name || 'Sem nome',
  }));
}

/* ── Pneus (Compostos) ─────────────────────────────────────────────── */

/**
 * Retorna a biblioteca de compostos com dados de degradação para estratégia.
 */
export function getCompoundLibrary() {
  const library = readJSON(KEYS.compounds, []);
  return library.map((entry) => ({
    id:                    entry.id,
    composto:              entry.composto,
    fabricante:            entry.fabricante,
    modelo:                entry.modelo,
    // Performance térmica
    tempMinOp:             num(entry.tempMinOp),
    tempMaxOp:             num(entry.tempMaxOp),
    tempPico:              num(entry.tempPico),
    // Modelo de degradação
    degradacaoSPorVolta:   num(entry.degradacaoSPorVolta),
    voltasWarmUp:          num(entry.voltasWarmUp),
    voltasOtimas:          num(entry.voltasOtimas),
    voltaCliff:            num(entry.voltaCliff),
    degradacaoPosCliff:    num(entry.degradacaoPosCliff),
    // Grip
    muLong:                num(entry.muLong),
    muLat:                 num(entry.muLat),
  }));
}

/**
 * Estima o tempo de volta por volta com degradação progressiva.
 *
 * @param {number} baseLapTime - Tempo de volta base (s)
 * @param {object} compound    - Composto da getCompoundLibrary()
 * @param {number} pilotTireWear - Multiplicador do piloto (default 1.0)
 * @param {number} trackTireFactor - Multiplicador da pista (default 1.0)
 * @returns {Array<{lap: number, time: number, phase: string}>}
 */
export function projectLapTimes(baseLapTime, compound, pilotTireWear = 1.0, trackTireFactor = 1.0) {
  if (!compound || !baseLapTime) return [];

  const warmUp    = compound.voltasWarmUp    ?? 0;
  const optimal   = compound.voltasOtimas    ?? Infinity;
  const cliff     = compound.voltaCliff      ?? Infinity;
  const degNormal = (compound.degradacaoSPorVolta ?? 0) * pilotTireWear * trackTireFactor;
  const degCliff  = (compound.degradacaoPosCliff  ?? degNormal * 3) * pilotTireWear * trackTireFactor;

  const laps = [];
  const maxLap = Math.min(cliff + 10, 200); // Limita projeção

  for (let i = 1; i <= maxLap; i++) {
    let delta = 0;
    let phase = 'optimal';

    if (i <= warmUp) {
      // Warm-up: pneu ainda não na janela — penalidade decrescente
      const warmUpPenalty = degNormal * 2 * (1 - i / (warmUp + 1));
      delta = warmUpPenalty;
      phase = 'warmup';
    } else if (i <= warmUp + optimal) {
      // Janela ótima: degradação linear normal
      delta = degNormal * (i - warmUp);
      phase = 'optimal';
    } else if (i <= cliff) {
      // Pós-ótimo, pré-cliff: degradação normal acelerada
      delta = degNormal * optimal + degNormal * 1.5 * (i - warmUp - optimal);
      phase = 'degrading';
    } else {
      // Pós-cliff: degradação severa
      const preDelta = degNormal * optimal + degNormal * 1.5 * (cliff - warmUp - optimal);
      delta = preDelta + degCliff * (i - cliff);
      phase = 'cliff';
    }

    laps.push({
      lap:   i,
      time:  Math.round((baseLapTime + delta) * 1000) / 1000,
      delta: Math.round(delta * 1000) / 1000,
      phase,
    });
  }

  return laps;
}

/* ── Combustível ───────────────────────────────────────────────────── */

/**
 * Lê os cenários de combustível do perfil ativo.
 */
export function getFuelScenarios(profileId) {
  if (!profileId) return [];
  const raw = readJSON(`rt_fuel_${profileId}`, []);
  return raw.map((s) => ({
    id:                 s.id,
    name:               s.name,
    consumptionPerLap:  calcConsumptionPerLap(s),
    tankCapacity:       num(s.tankCapacity),
    raceLaps:           num(s.raceLaps),
    safetyMargin:       num(s.safetyMargin) ?? 0,
    refuelTimeFull:     num(s.refuelTimeFull),
    refuelTimePerLiter: num(s.refuelTimePerLiter),
    pitFlowRate:        num(s.pitFlowRate),
  }));
}

function calcConsumptionPerLap(s) {
  // Override manual
  if (s.manualPerLap) return num(s.manualPerLap);
  // Empírico
  if (s.fuelUsed && s.lapsCompleted) {
    const used = num(s.fuelUsed);
    const laps = num(s.lapsCompleted);
    if (used && laps) return Math.round((used / laps) * 1000) / 1000;
  }
  // Calculado
  if (s.trackLength && s.consumptionRate) {
    const km   = num(s.trackLength);
    const rate = num(s.consumptionRate);
    if (km && rate) return Math.round((km * rate / 100) * 1000) / 1000;
  }
  return null;
}

/* ── Agregador — Dados completos para Estratégia ───────────────────── */

/**
 * Monta o pacote completo de dados que a EstrategiaTab consome.
 *
 * @param {object} params
 * @param {string} params.profileId     - Perfil ativo do workspace
 * @param {string} [params.eventId]     - ID do evento no calendário (opcional)
 * @param {string} [params.pilotId]     - ID do piloto (opcional)
 * @param {string} [params.trackId]     - ID da pista (override, se não vier do evento)
 * @param {number} [params.baseLapTime] - Tempo base de volta (s)
 * @returns {object} Pacote de dados
 */
export function buildStrategyData({
  profileId,
  eventId = null,
  pilotId = null,
  trackId: trackIdOverride = null,
  baseLapTime = null,
} = {}) {
  const regulations = getRegulations();
  const event       = getRaceEvent(eventId);
  const trackId     = trackIdOverride || event?.trackId || null;
  const track       = getTrackData(trackId, profileId);
  const pilot       = pilotId ? getPilotStrategyData(pilotId) : null;
  const compounds   = getCompoundLibrary();
  const fuelScenarios = getFuelScenarios(profileId);
  const pitLoss     = estimatePitLossTime(track, regulations);

  return {
    regulations,
    event: event ? {
      title:    event.title,
      trackId:  event.trackId,
      raceLaps: num(event.raceLaps),
      start:    event.start,
    } : null,
    track,
    pilot,
    compounds,
    fuelScenarios,
    pitLoss,
    baseLapTime,
    // Helpers pré-calculados
    raceLaps: num(event?.raceLaps) ?? null,
    minPitStops: regulations.pitStopsObrigatorios ?? 0,
    maxFuel: regulations.combustivelMax ?? null,
    minCompounds: regulations.pneusCompostosMin ?? null,
  };
}
