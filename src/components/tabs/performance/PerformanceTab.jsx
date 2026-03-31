/**
 * PerformanceTab — Análise de Performance Teórica do Carro
 *
 * Cruza dados de todas as tabs para gerar estimativas precisas de:
 *  1. Tempo de volta (quali e corrida)
 *  2. Balanço mecânico e aerodinâmico
 *  3. Modelo de pneu (vida, cliff, janela térmica)
 *  4. Performance de frenagem
 *  5. Tendências do piloto vs. traçado ótimo
 *  6. Sumário para estratégia
 *
 * Variáveis faltantes são sinalizadas com ⚠️ e substituídas por premissas padrão.
 */

import { useMemo, useState } from 'react';
import { useColors } from '@/context/ThemeContext';
import {
  readPeso, readFuel, readActiveTrack, readPneusLib, readPneusSession,
  readRegulations, readMechanicSpecs, readLatestSetup, readLatestTemp,
} from '@/core/crossTabSync';

// ── Helpers numéricos ──────────────────────────────────────────────────────────
const pf = (v, def = 0) => { const n = parseFloat(v); return isNaN(n) ? def : n; };
const pct = (v) => Math.min(100, Math.max(0, pf(v)));
const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : '—');
const fmt2 = (v) => (typeof v === 'number' ? v.toFixed(2) : '—');
const fmt3 = (v) => (typeof v === 'number' ? v.toFixed(3) : '—');
const fmtTime = (s) => {
  if (!s || !isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`;
};

// ── Aviso de variável faltante ─────────────────────────────────────────────────
function Warn({ children }) {
  return (
    <span style={{ fontSize: 10, color: '#ffaa44', fontStyle: 'italic' }}>
      ⚠️ {children}
    </span>
  );
}

// ── Semáforo de status ─────────────────────────────────────────────────────────
function Light({ status, label }) {
  const color = status === 'ok' ? '#44cc66' : status === 'warn' ? '#ffaa00' : '#ff4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12 }}>{label}</span>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────
function Card({ title, icon, children, C, accent }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: '18px 20px',
      marginBottom: 16,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '1.2px', color: accent || C.accent,
        marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7,
      }}>
        {icon && <span>{icon}</span>}
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Linha de métrica ───────────────────────────────────────────────────────────
function MetricRow({ label, value, unit, warn, highlight, C }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 0', borderBottom: `1px solid ${C.border}22`,
    }}>
      <span style={{ fontSize: 12, color: C.textMuted }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 600,
        color: highlight ? highlight : C.textPrimary,
      }}>
        {value}{unit ? <span style={{ fontSize: 11, fontWeight: 400, color: C.textMuted }}> {unit}</span> : ''}
        {warn && <span style={{ marginLeft: 6 }}><Warn>{warn}</Warn></span>}
      </span>
    </div>
  );
}

// ── Grid de 2 colunas ──────────────────────────────────────────────────────────
const Grid2 = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
    {children}
  </div>
);

// ── Status de frequência de ride ───────────────────────────────────────────────
function freqStatus(f) {
  if (!f) return 'unknown';
  if (f >= 1.5 && f <= 3.5) return 'ok';
  if (f >= 1.0 && f <= 4.5) return 'warn';
  return 'bad';
}

// ── Barra de progresso ─────────────────────────────────────────────────────────
function Bar({ value, max, color, label, C }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      {label && <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>{label}</div>}
      <div style={{ background: C.border + '44', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MOTOR DE CÁLCULO DE PERFORMANCE
// ══════════════════════════════════════════════════════════════════════════════

function computePerformance({ peso, fuel, track, trackCustom, pilots, pneusLib, pneusSession, regs, mechSpecs, setup, temp, profileParts, profileId }) {
  const warnings = [];
  const w = (msg) => warnings.push(msg);

  // ── Carro ──────────────────────────────────────────────────────────────────
  const carMass    = pf(peso?.pesoCarro,  0) || pf(fuel?.carWeight, 0);
  const driverMass = pf(peso?.pesoPiloto, 0) || pf(fuel?.driverWeight, 0);
  const totalMass  = carMass + driverMass;
  if (!carMass)    w('Peso do carro não preenchido (PesoTab) — usando 0 kg');
  if (!driverMass) w('Peso do piloto não preenchido — usando 0 kg');

  const distFront = pf(peso?.pesoDianteiro, 0) / (pf(peso?.pesoDianteiro, 0) + pf(peso?.pesoTraseiro, 0) + 0.001);
  const distFrontPct = carMass > 0 && peso?.pesoDianteiro
    ? (pf(peso.pesoDianteiro) / carMass * 100)
    : 50;
  if (!peso?.pesoDianteiro) w('Distribuição de peso não preenchida — assumindo 50/50');

  const wheelbase   = pf(peso?.wheelbase   || fuel?.wheelbaseLen, 0);
  const trackFront  = pf(peso?.trackFront, 0);
  const trackRear   = pf(peso?.trackRear,  0);
  const alturaCG    = pf(peso?.alturaCG,   0);
  const rcFront     = pf(peso?.rollCenterFront, 0);
  const rcRear      = pf(peso?.rollCenterRear,  0);

  // ── Pista ──────────────────────────────────────────────────────────────────
  const trackLenKm  = pf(track?.lengthKm  || (trackCustom?.length ? trackCustom.length / 1000 : 0) || fuel?.trackLength, 0);
  const gripMu      = pf(trackCustom?.gripMu, 1.0);
  const fuelFactor  = pf(trackCustom?.fuelFactor,  1.0) || 1.0;
  const tireFactor  = pf(trackCustom?.tireFactor,  1.0) || 1.0;
  const cornersLow  = pf(trackCustom?.cornersLow,  0);
  const cornersMed  = pf(trackCustom?.cornersMedium, 0);
  const cornersFast = pf(trackCustom?.cornersFast, 0);
  const altVariation = pf(trackCustom?.altVariation, 0);
  const straights   = trackCustom?.straights || [];

  if (!trackLenKm) w('Comprimento da pista não preenchido (PistasTab) — estimativa será imprecisa');
  if (!trackCustom?.gripMu) w('gripMu não preenchido — usando 1.0');
  if (!cornersLow && !cornersMed && !cornersFast) w('Tipo/quantidade de curvas não preenchido (PistasTab)');

  // ── Aerodinâmica (SetupSheet) ──────────────────────────────────────────────
  const cd          = pf(setup?.aero_cd,          0.90);
  const cl          = pf(setup?.aero_cl,          1.50);
  const frontalArea = pf(setup?.aero_frontalArea, 1.20);
  const dfFrontPct  = pf(setup?.aero_cpLong,      50);   // % no eixo dianteiro
  const dfFront     = pf(setup?.aero_dfFront, 0);
  const dfRear      = pf(setup?.aero_dfRear,  0);
  const aeroBalance = dfFront + dfRear > 0
    ? (dfFront / (dfFront + dfRear) * 100)
    : dfFrontPct;
  if (!setup?.aero_cd)        w('Cd não preenchido (SetupSheet) — usando 0.90');
  if (!setup?.aero_cl)        w('Cl não preenchido (SetupSheet) — usando 1.50');
  if (!setup?.aero_frontalArea) w('Área frontal não preenchida (SetupSheet) — usando 1.20 m²');

  // ── Transmissão (SetupSheet) ───────────────────────────────────────────────
  const gears = [1,2,3,4,5,6,7,8].map(i => pf(setup?.[`trans_gear${i}`], 0)).filter(g => g > 0);
  const finalDrive   = pf(setup?.trans_finalDrive || setup?.finalDrive, 0);
  const tyreRadius   = pf(setup?.trans_tyreRadius, 310); // mm
  const shiftTime    = pf(setup?.trans_shiftTime, 60);   // ms
  if (!gears.length)  w('Relações de marcha não preenchidas (SetupSheet) — estimativa de Vmax simplificada');
  if (!finalDrive)    w('Relação final não preenchida (SetupSheet)');

  // ── Motor ──────────────────────────────────────────────────────────────────
  const motorPotCV   = pf(regs?.motorPotenciaMax, 0);
  const motorPotKW   = motorPotCV * 0.7355;
  const motorRpmMax  = pf(regs?.motorRpmMax, 0);
  const boostMax     = pf(regs?.motorBoostMax, 0);
  if (!motorPotCV)  w('Potência máxima não preenchida (Regulamentações) — aceleração estimada');
  if (!motorRpmMax) w('RPM máximo não preenchido (Regulamentações)');

  // ── Turbo (SetupSheet) ─────────────────────────────────────────────────────
  const turboLag     = pf(setup?.turbo_lag,          200); // ms
  const boostTarget  = pf(setup?.turbo_boostTarget,  boostMax || 1.0);

  // ── Suspensão (Mecânica + SetupSheet) ─────────────────────────────────────
  const mrFront    = pf(setup?.susp_mrFront, 0.7);
  const mrRear     = pf(setup?.susp_mrRear,  0.7);
  const mrARBFront = pf(setup?.susp_mrArbFront, 0.8);
  const mrARBRear  = pf(setup?.susp_mrArbRear,  0.8);

  // Busca taxaMola e ARB dos parts mecânicos por categoria
  let springRateFront = 0, springRateRear = 0, arbFront = 0, arbRear = 0;
  let damperClicksFront = 0, damperClicksRear = 0;
  let rideHeightFront = 0, rideHeightRear = 0;
  if (profileParts && mechSpecs) {
    const suspParts = profileParts.filter(p => (p.category || '').toLowerCase() === 'suspensão');
    suspParts.forEach(p => {
      const s = mechSpecs[p.id] || {};
      const name = (p.name || '').toLowerCase();
      const taxa = pf(s.taxa || s.taxaMola, 0);
      const rigidez = pf(s.rigidezReal || s.rigidezProj, 0);
      const clicks = (pf(s.lsc, 0) + pf(s.hsc, 0) + pf(s.lsr, 0) + pf(s.hsr, 0));
      const ride = pf(s.ride, 0);
      if (taxa > 0) {
        if (name.includes('diant') || name.includes('front') || name.includes('fl') || name.includes('fr'))
          springRateFront = taxa;
        else if (name.includes('tras') || name.includes('rear') || name.includes('rl') || name.includes('rr'))
          springRateRear = taxa;
        else if (!springRateFront) springRateFront = taxa;
        else if (!springRateRear)  springRateRear  = taxa;
      }
      if (rigidez > 0 && (name.includes('estab') || name.includes('arb') || name.includes('barra'))) {
        if (name.includes('diant') || name.includes('front')) arbFront = rigidez;
        else arbRear = rigidez;
      }
      if (clicks > 0) {
        if (name.includes('diant') || name.includes('front')) damperClicksFront = clicks;
        else damperClicksRear = clicks;
      }
      if (ride > 0) {
        if (name.includes('diant') || name.includes('front')) rideHeightFront = ride;
        else rideHeightRear = ride;
      }
    });
  }
  // Fallback para SetupSheet
  if (!springRateFront) springRateFront = pf(setup?.spring_fl || setup?.spring_fr, 0);
  if (!springRateRear)  springRateRear  = pf(setup?.spring_rl || setup?.spring_rr, 0);
  if (!rideHeightFront) rideHeightFront = pf(setup?.rideHeight_fl || setup?.rideHeight_fr, 0);
  if (!rideHeightRear)  rideHeightRear  = pf(setup?.rideHeight_rl || setup?.rideHeight_rr, 0);
  if (!rideHeightFront && !rideHeightRear) w('Ride height não preenchido (Mecânica/SetupSheet)');

  // ── Freio (Mecânica + SetupSheet) ─────────────────────────────────────────
  let muPad = 0, tempMinPad = 0, tempMaxPad = 0, wearRatePad = 0, discDiamFront = 0;
  let padThkCurrent = 0, padThkMin = 0;
  if (profileParts && mechSpecs) {
    const brakeParts = profileParts.filter(p => (p.category || '').toLowerCase() === 'freio');
    brakeParts.forEach(p => {
      const s = mechSpecs[p.id] || {};
      const name = (p.name || '').toLowerCase();
      if (s.atrito) muPad = pf(s.atrito, 0);
      if (s.tempMin) tempMinPad = pf(s.tempMin, 0);
      if (s.tempMax) tempMaxPad = pf(s.tempMax, 0);
      if (s.taxaDesgaste) wearRatePad = pf(s.taxaDesgaste, 0);
      if (s.espessuraAtual) padThkCurrent = pf(s.espessuraAtual, 0);
      if (s.espMin) padThkMin = pf(s.espMin, 0);
      if (s.diam && (name.includes('disco') || name.includes('disc'))) {
        if (!name.includes('tras') && !name.includes('rear')) discDiamFront = pf(s.diam, 0);
      }
    });
  }
  if (!muPad) { muPad = 0.40; w('Coef. de atrito da pastilha não preenchido (Mecânica) — usando 0.40'); }
  if (!tempMaxPad) w('Temperatura máxima da pastilha não preenchida (Mecânica)');
  // Fallback regs
  if (!discDiamFront) discDiamFront = pf(regs?.freioDiantDiamMax, 330);
  const brakeBias   = pf(setup?.brakeBias, 60);
  const decelG      = pf(setup?.brake_decelG, 0);

  // ── Pneus ──────────────────────────────────────────────────────────────────
  const activePneu  = pneusLib?.find(p => p.composto) || pneusLib?.[0] || null;
  const muLat       = pf(activePneu?.muLat,  1.5);
  const muLong      = pf(activePneu?.muLong, 1.3);
  const tempOtima   = pf(activePneu?.tempOtimaGrip, 90);
  const kTemp       = pf(activePneu?.kTemp,    0.5);
  const voltasOtimas      = pf(activePneu?.voltasOtimas, 0);
  const voltaCliff        = pf(activePneu?.voltaCliff, 0);
  const degSPorVolta      = pf(activePneu?.degradacaoSPorVolta, 0);
  const degPosCliff       = pf(activePneu?.degradacaoPosCliff, 0);
  const voltasWarmUp      = pf(activePneu?.voltasWarmUp, 3);
  const corneringStiff    = pf(activePneu?.corneringStiffness, 0);
  const loadSens          = pf(activePneu?.loadSensitivity, 0.85);
  if (!activePneu)        w('Nenhum composto preenchido na biblioteca de Pneus');
  if (!activePneu?.muLat) w('muLat não preenchido (PneusTab) — usando 1.5');
  if (!activePneu?.tempOtimaGrip) w('Temperatura ótima do pneu não preenchida');

  // ── Temperatura/clima ─────────────────────────────────────────────────────
  const trackTemp   = pf(temp?.trackTemp   || pneusSession?.conditions?.trackTemp, 30);
  const ambTemp     = pf(temp?.ambientTemp || pneusSession?.conditions?.ambientTemp, 25);
  const altitude    = pf(temp?.altitude,   0);
  const baroPres    = pf(temp?.baroPressure, 101.325);
  const windSpeed   = pf(temp?.windSpeed,  0);
  if (!temp?.trackTemp) w('Temperatura de pista não registrada (TemperatureTab) — usando 30°C');

  // ── Piloto ────────────────────────────────────────────────────────────────
  const pilot = pilots?.find(p => p.assignedProfileId === profileId) || pilots?.[0] || null;
  const tireWearMult    = pf(pilot?.tireWearMultiplier, 1.0) || 1.0;
  const fuelConsMult    = pf(pilot?.fuelConsMultiplier, 1.0) || 1.0;
  const brakeWearMult   = pf(pilot?.brakeWearMultiplier, 1.0) || 1.0;
  const fadigaDeg       = pf(pilot?.fadigaDegradacao, 0);
  const stintMaxMin     = pf(pilot?.stintMaxMinutos, 60);
  const brakeAgg        = pf(pilot?.brakeAggressiveness, 5); // 1-10
  const throttleUse     = pf(pilot?.throttleUsage, 5);
  const steerSmooth     = pf(pilot?.steeringSmoothness, 5);
  const trajDev         = pf(pilot?.trajectoryDeviation, 0);
  const brakePtDev      = pf(pilot?.brakePointDeviation, 0);
  const gLatTol         = pf(pilot?.gLateral, 3.5);
  const gLongTol        = pf(pilot?.gLongitudinal, 4.0);
  if (!pilot)           w('Nenhum piloto designado ao perfil (PilotosTab)');
  if (!pilot?.tireWearMultiplier) w('Multiplicador de desgaste do piloto não preenchido — usando 1.0');

  // ── Combustível ───────────────────────────────────────────────────────────
  const fuelPerLap100km = pf(fuel?.consumptionRate, 0);
  const fuelPerLapL     = fuelPerLap100km > 0 && trackLenKm > 0
    ? (fuelPerLap100km * trackLenKm / 100) * fuelFactor * fuelConsMult
    : 0;
  const fuelDensity     = fuel?.fuelType === 'custom'
    ? pf(fuel?.fuelDensityCustom, 0.74)
    : 0.74;
  if (!fuelPerLap100km) w('Consumo de combustível não preenchido (CombustivelTab)');

  // ── Regulamentações ───────────────────────────────────────────────────────
  const pesoMinimo     = pf(regs?.pesoMinimo, 0);
  const combustivelMax = pf(regs?.combustivelMax, 0);
  const rideHeightMin  = pf(regs?.dimRideHeightMin, 0);
  const pitTempoMin    = pf(regs?.pitTempoMinParada, 0);
  const pitReabast     = regs?.pitReabastecimento || '';

  // ════════════════════════════════════════════════════════════════════════════
  // 1. ESTIMATIVA DE TEMPO DE VOLTA
  // ════════════════════════════════════════════════════════════════════════════

  // Densidade do ar corrigida por altitude e temperatura
  const airDensity = (baroPres * 1000) / (287.05 * (ambTemp + 273.15));
  const airDensityRef = 1.225; // kg/m³ ao nível do mar, 15°C

  // Fator de downforce (proporção com ar de referência)
  const dfFactor = airDensity / airDensityRef;

  // Grip ajustado por temperatura de pista vs. janela do pneu
  const tempDelta    = Math.abs(trackTemp - tempOtima);
  const gripThermal  = activePneu ? Math.max(0.70, 1.0 - (kTemp / 100) * tempDelta) : 1.0;
  const effectiveMu  = muLat * gripMu * gripThermal;

  // Velocidades mínimas em curva (baseado em G lateral disponível × grip)
  const gLat = Math.min(gLatTol, effectiveMu * 1.0);
  const vMinLow  = Math.sqrt(gLat * 9.81 * 15)  * 3.6; // raio ~15m
  const vMinMed  = Math.sqrt(gLat * 9.81 * 50)  * 3.6; // raio ~50m
  const vMinFast = Math.sqrt(gLat * 9.81 * 120) * 3.6; // raio ~120m

  // Tempo em curvas (aceleração/desaceleração inclusa)
  const tCornerLow  = cornersLow  > 0 ? cornersLow  * (12 + (10 - throttleUse) * 0.3) : 0;
  const tCornerMed  = cornersMed  > 0 ? cornersMed  * (8  + (10 - throttleUse) * 0.2) : 0;
  const tCornerFast = cornersFast > 0 ? cornersFast * (5  + (10 - throttleUse) * 0.1) : 0;
  const tCornersTotal = tCornerLow + tCornerMed + tCornerFast;

  // Tempo em retas (usando gear ratios se disponíveis, senão estimativa)
  let tStraightsTotal = 0;
  if (straights.length > 0) {
    straights.forEach(s => {
      const lenM = pf(s.lengthM, 0);
      if (lenM <= 0) return;
      const vEntry = pf(s.speedStart, vMinLow) / 3.6;
      const vExit  = pf(s.speedEnd, vMinLow)  / 3.6;
      // Tempo estimado = 2×distância / (vEntry + vExit) — simplificado
      tStraightsTotal += (2 * lenM) / (vEntry + vExit + 0.001);
    });
  } else if (trackLenKm > 0 && (tCornerLow + tCornerMed + tCornerFast) > 0) {
    // Estima retas como ~35% do tempo de volta
    tStraightsTotal = (tCornerLow + tCornerMed + tCornerFast) * 0.54;
  }

  // Tempo de volta teórico base
  const lapTimeBase = tCornersTotal + tStraightsTotal;

  // Penalidade de combustível por volta
  const fuelTimePenalty = fuelPerLapL > 0 ? fuelPerLapL * fuelDensity * 0.035 : 0;

  // Penalidade de altitude na potência (turbinado: compensado; aspirado: ~1%/300m)
  const altitudePenalty = altitude > 0 ? (altitude / 300) * 0.1 : 0; // s extra/volta estimado

  const lapTimeQuali = lapTimeBase > 0 ? lapTimeBase : null;
  const lapTimeRace  = lapTimeBase > 0 ? lapTimeBase + fuelTimePenalty + altitudePenalty : null;

  // Velocidade máxima estimada
  let vMax = 0;
  if (gears.length && finalDrive && tyreRadius) {
    const topGear = gears[gears.length - 1];
    const motorRpm = motorRpmMax || 8000;
    vMax = (motorRpm * (tyreRadius / 1000) * 2 * Math.PI * 60) / (topGear * finalDrive * 1000);
  } else if (motorPotKW > 0 && totalMass > 0) {
    // Vmax ≈ cubeRoot(2×P/Cd×A×ρ)
    vMax = Math.cbrt((2 * motorPotKW * 1000) / (cd * frontalArea * airDensity)) * 3.6;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. BALANÇO MECÂNICO E AERODINÂMICO
  // ════════════════════════════════════════════════════════════════════════════

  // Ride frequency (Hz) = (1/2π) × √(k_roda / m_suspensa)
  // k_roda = k_mola × MR²
  const sprungMass    = totalMass * 0.85; // ~85% da massa total é suspensa
  const sprungFront   = sprungMass * (distFrontPct / 100);
  const sprungRear    = sprungMass * (1 - distFrontPct / 100);
  const kWheelFront   = springRateFront > 0 ? springRateFront * mrFront * mrFront * 1000 : 0; // N/m
  const kWheelRear    = springRateRear  > 0 ? springRateRear  * mrRear  * mrRear  * 1000 : 0;
  const freqFront = kWheelFront > 0 && sprungFront > 0
    ? (1 / (2 * Math.PI)) * Math.sqrt(kWheelFront / (sprungFront / 2)) : null;
  const freqRear  = kWheelRear  > 0 && sprungRear  > 0
    ? (1 / (2 * Math.PI)) * Math.sqrt(kWheelRear  / (sprungRear  / 2)) : null;

  // Roll stiffness (N·m/°) = k_roda × (track/2)² / (π/180) + ARB
  const rsAux = (k, track, arb, mr) => {
    if (k <= 0 || track <= 0) return 0;
    const kRoll = k * (track / 1000 / 2) ** 2 / (Math.PI / 180);
    const arbRoll = arb * mr * mr;
    return kRoll + arbRoll;
  };
  const rollStiffFront = rsAux(kWheelFront / 1000, trackFront, arbFront, mrARBFront);
  const rollStiffRear  = rsAux(kWheelRear  / 1000, trackRear,  arbRear,  mrARBRear);
  const rollBalance    = rollStiffFront + rollStiffRear > 0
    ? (rollStiffFront / (rollStiffFront + rollStiffRear) * 100)
    : null;

  // Índice oversteer/understeer
  // >50% dianteiro = tendência subviragem; <50% = sobreviragem
  const handlingTendency = rollBalance
    ? (rollBalance > 55 ? 'Subviragem' : rollBalance < 45 ? 'Sobreviragem' : 'Neutro')
    : 'Indeterminado';

  // Balanço aerodinâmico vs. balanço mecânico
  const aeroVsMech = aeroBalance > 0
    ? (aeroBalance > (rollBalance || 50) + 5 ? 'Sobrepressão dianteira (push no rápido)' :
       aeroBalance < (rollBalance || 50) - 5 ? 'Sobrepressão traseira (oversteer no rápido)' : 'Aero balanceado')
    : 'Dados aero insuficientes';

  // Ride height vs. regulamento
  const rideOkFront = rideHeightMin > 0 && rideHeightFront > 0 ? rideHeightFront >= rideHeightMin : null;
  const rideOkRear  = rideHeightMin > 0 && rideHeightRear  > 0 ? rideHeightRear  >= rideHeightMin : null;

  // ════════════════════════════════════════════════════════════════════════════
  // 3. MODELO DE PNEU
  // ════════════════════════════════════════════════════════════════════════════

  // Vida real de pneu com multiplicadores
  const baseLife     = voltasOtimas > 0 ? voltasOtimas : (voltaCliff > 0 ? voltaCliff : 0);
  const realTireLife = baseLife > 0 ? Math.floor(baseLife / (tireWearMult * tireFactor)) : null;
  const cliffLap     = voltaCliff > 0 ? Math.floor(voltaCliff / (tireWearMult * tireFactor)) : null;

  // Degradação real por volta (s)
  const realDegSPorVolta = degSPorVolta > 0 ? degSPorVolta * tireWearMult * tireFactor : null;
  const realDegPosCliff  = degPosCliff  > 0 ? degPosCliff  * tireWearMult * tireFactor : null;

  // Temperatura atual vs. janela
  const tempStatus = activePneu ? (
    Math.abs(trackTemp - tempOtima) <= 10 ? 'ok' :
    Math.abs(trackTemp - tempOtima) <= 25 ? 'warn' : 'bad'
  ) : 'unknown';
  const gripAvailable = (gripThermal * 100).toFixed(0);

  // Modelo de curva de tempo por volta ao longo do stint
  const stintSimulation = (() => {
    if (!lapTimeRace || lapTimeRace <= 0) return [];
    const maxLaps = realTireLife ? realTireLife + 5 : 40;
    return Array.from({ length: maxLaps }, (_, i) => {
      const lap = i + 1;
      const warmup = lap < voltasWarmUp ? 1.5 * (voltasWarmUp - lap + 1) : 0;
      const deg = realDegSPorVolta ? realDegSPorVolta * Math.max(0, lap - voltasWarmUp) : 0;
      const cliff = cliffLap && lap > cliffLap ? (realDegPosCliff || 0.15) * (lap - cliffLap) : 0;
      const stintMin = (lap * lapTimeRace) / 60;
      const fadiga = fadigaDeg > 0 ? fadigaDeg * Math.floor(stintMin / 10) : 0;
      return { lap, time: lapTimeRace + warmup + deg + cliff + fadiga };
    });
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // 4. FRENAGEM
  // ════════════════════════════════════════════════════════════════════════════

  // Força de frenagem total estimada
  const discRadius   = discDiamFront / 2 / 1000; // m
  // Simplified: decel = muPad × 2 (diant+tras escalonado pelo bias) × gravity
  const decelEst     = decelG > 0 ? decelG : muPad * muLong * 0.9;
  const stopDist100  = totalMass > 0 && decelEst > 0
    ? ((100 / 3.6) ** 2) / (2 * decelEst * 9.81)
    : null; // metros para parar de 100 km/h

  // Temperatura estimada de operação (proporcional à energia cinética)
  const vEntry200 = 200 / 3.6;
  const vExit80   = 80  / 3.6;
  const kineticEnergy = totalMass * (vEntry200 ** 2 - vExit80 ** 2) / 2;
  const heatCoeff     = 0.0003; // coef empírico
  const padTempEst    = 150 + (kineticEnergy * heatCoeff * brakeAgg / 10) * (1 + brakeWearMult - 1);
  const padTempStatus = tempMaxPad > 0
    ? (padTempEst < tempMinPad ? 'warn' : padTempEst <= tempMaxPad ? 'ok' : 'bad')
    : 'unknown';

  // Desgaste de pastilha por corrida
  const raceDistKm     = trackLenKm * pf(fuel?.raceLaps, 30);
  const padWearPerRace = wearRatePad > 0 ? wearRatePad * raceDistKm * brakeWearMult : null;
  const padLifeRemain  = padThkCurrent > 0 && padThkMin > 0 && padWearPerRace
    ? Math.floor((padThkCurrent - padThkMin) / padWearPerRace)
    : null;

  // ════════════════════════════════════════════════════════════════════════════
  // 5. TENDÊNCIAS DO PILOTO VS. TRAÇADO ÓTIMO
  // ════════════════════════════════════════════════════════════════════════════

  // Delta de tempo por volta estimado (segundos perdidos por tendência do piloto)
  const deltaBrake    = (10 - brakeAgg)    * 0.05;  // braking tardio/antecipado
  const deltaThrottle = (10 - throttleUse) * 0.04;  // abertura subótima do acelerador
  const deltaSteering = (10 - steerSmooth) * 0.02;  // instabilidade na curva
  const deltaTraject  = (trajDev / 100)    * 0.5;   // desvio de trajetória (cm → s)
  const deltaBrakePt  = (brakePtDev / 10)  * 0.03;  // inconsistência do ponto de frenagem
  const deltaTotal    = deltaBrake + deltaThrottle + deltaSteering + deltaTraject + deltaBrakePt;

  // Modelo de fadiga por stint (s/volta a mais a cada X minutos)
  const stintLaps30   = lapTimeRace ? Math.floor(30 * 60 / lapTimeRace) : 0;
  const stintLaps60   = lapTimeRace ? Math.floor(60 * 60 / lapTimeRace) : 0;
  const fadigaAt30min = fadigaDeg * 3;  // 3 períodos de 10min
  const fadigaAt60min = fadigaDeg * 6;

  // Stint máximo recomendado (menor entre vida do pneu e fadiga)
  const stintMaxByTire  = realTireLife || 0;
  const stintMaxByFatigue = lapTimeRace ? Math.floor(stintMaxMin * 60 / lapTimeRace) : 0;
  const stintMaxRecom   = Math.min(
    stintMaxByTire   > 0 ? stintMaxByTire   : 999,
    stintMaxByFatigue > 0 ? stintMaxByFatigue : 999,
  );

  // ════════════════════════════════════════════════════════════════════════════
  // CONTAGEM DE VARIÁVEIS PREENCHIDAS
  // ════════════════════════════════════════════════════════════════════════════
  const totalVars   = 60;
  const filledVars  = [
    carMass, driverMass, trackLenKm, gripMu, cornersLow + cornersMed + cornersFast,
    altVariation, cd, cl, frontalArea, aeroBalance, gears.length, finalDrive,
    motorPotCV, motorRpmMax, boostMax, springRateFront, springRateRear,
    arbFront + arbRear, rideHeightFront + rideHeightRear, muPad,
    tempMinPad, tempMaxPad, wearRatePad, discDiamFront, muLat, muLong,
    tempOtima, kTemp, voltasOtimas, voltaCliff, degSPorVolta, degPosCliff,
    trackTemp, ambTemp, altitude, windSpeed,
    pilot ? 1 : 0, tireWearMult !== 1 ? 1 : 0, fuelConsMult !== 1 ? 1 : 0,
    fadigaDeg, stintMaxMin, brakeAgg, throttleUse, steerSmooth,
    fuelPerLap100km, pesoMinimo, combustivelMax, rideHeightMin, pitTempoMin,
    wheelbase, trackFront, trackRear, alturaCG, rcFront + rcRear,
    mrFront, mrRear, brakeBias, decelG, turboLag,
  ].filter(v => v > 0).length;

  return {
    warnings, filledVars, totalVars,
    // Bloco 1
    lapTimeQuali, lapTimeRace, vMax, gripThermal, gripAvailable,
    fuelPerLapL, fuelTimePenalty, altitudePenalty, tCornerLow, tCornerMed, tCornerFast, tStraightsTotal,
    // Bloco 2
    freqFront, freqRear, freqStatus,
    rollStiffFront, rollStiffRear, rollBalance, handlingTendency, aeroBalance, aeroVsMech,
    rideHeightFront, rideHeightRear, rideOkFront, rideOkRear, rideHeightMin,
    damperClicksFront, damperClicksRear,
    // Bloco 3
    realTireLife, cliffLap, realDegSPorVolta, realDegPosCliff,
    tempStatus, tempOtima, trackTemp, gripAvailableNum: parseFloat(gripAvailable),
    voltasWarmUp, stintSimulation, tireWearMult, tireFactor, activePneu,
    // Bloco 4
    decelEst, stopDist100, padTempEst, padTempStatus, tempMinPad, tempMaxPad,
    padWearPerRace, padLifeRemain, padThkCurrent, padThkMin, discDiamFront,
    brakeBias, muPad, decelG,
    // Bloco 5
    deltaTotal, deltaBrake, deltaThrottle, deltaSteering, deltaTraject, deltaBrakePt,
    fadigaAt30min, fadigaAt60min, stintMaxRecom, stintMaxByTire, stintMaxByFatigue,
    stintLaps30, stintLaps60, pilot,
    // Bloco 6
    pesoMinimo, combustivelMax, pitTempoMin, pitReabast,
    raceDistKm, totalMass, carMass, driverMass,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

export default function PerformanceTab({ activeProfile, profileParts = [] }) {
  const C = useColors();
  const profileId = activeProfile?.id || 'default';

  const [showWarnings, setShowWarnings] = useState(false);
  const [activeBlock, setActiveBlock] = useState('all');

  // ── Leitura de dados cross-tab ─────────────────────────────────────────────
  const peso       = useMemo(() => { try { const r = localStorage.getItem(`rt_peso_${profileId}`);      return r ? JSON.parse(r) : null; } catch { return null; } }, [profileId]);
  const fuelScen   = useMemo(() => { try { const r = localStorage.getItem(`rt_fuel_${profileId}`);      const a = r ? JSON.parse(r) : []; return a[0] || null; } catch { return null; } }, [profileId]);
  const track      = useMemo(() => readActiveTrack(profileId), [profileId]);
  const trackCustom = useMemo(() => { try { const r = localStorage.getItem(`rt_track_custom_${profileId}`); const obj = r ? JSON.parse(r) : {}; return track?.trackId ? obj[track.trackId] || null : null; } catch { return null; } }, [profileId, track]);
  const pilots     = useMemo(() => { try { const r = localStorage.getItem('rt_pilots'); return r ? JSON.parse(r) : []; } catch { return []; } }, []);
  const pneusLib   = useMemo(() => readPneusLib(profileId), [profileId]);
  const pneusSession = useMemo(() => readPneusSession(profileId), [profileId]);
  const regs       = useMemo(() => readRegulations(), []);
  const mechSpecs  = useMemo(() => readMechanicSpecs(profileId), [profileId]);
  const setup      = useMemo(() => readLatestSetup(profileId), [profileId]);
  const temp       = useMemo(() => readLatestTemp(), []);

  const result = useMemo(() => computePerformance({
    peso, fuel: fuelScen, track, trackCustom, pilots, pneusLib, pneusSession,
    regs, mechSpecs, setup, temp, profileParts, profileId,
  }), [peso, fuelScen, track, trackCustom, pilots, pneusLib, pneusSession,
       regs, mechSpecs, setup, temp, profileParts, profileId]);

  const {
    warnings, filledVars, totalVars,
    lapTimeQuali, lapTimeRace, vMax, gripAvailable,
    fuelPerLapL, fuelTimePenalty, tCornerLow, tCornerMed, tCornerFast, tStraightsTotal,
    freqFront, freqRear, freqStatus, rollBalance, handlingTendency, aeroBalance, aeroVsMech,
    rideHeightFront, rideHeightRear, rideOkFront, rideOkRear, rideHeightMin,
    damperClicksFront, damperClicksRear, rollStiffFront, rollStiffRear,
    realTireLife, cliffLap, realDegSPorVolta, realDegPosCliff, tempStatus,
    tempOtima, trackTemp, voltasWarmUp, stintSimulation, tireWearMult, tireFactor, activePneu,
    decelEst, stopDist100, padTempEst, padTempStatus, tempMinPad, tempMaxPad,
    padWearPerRace, padLifeRemain, padThkCurrent, padThkMin, discDiamFront, brakeBias, muPad, decelG,
    deltaTotal, deltaBrake, deltaThrottle, deltaSteering, deltaTraject, deltaBrakePt,
    fadigaAt30min, fadigaAt60min, stintMaxRecom, stintMaxByTire, stintMaxByFatigue, pilot,
    pesoMinimo, combustivelMax, pitTempoMin, pitReabast,
    raceDistKm, totalMass, carMass, driverMass,
  } = result;

  const fillPct = Math.round((filledVars / totalVars) * 100);

  // Estilo base
  const IB = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.textPrimary, fontSize: 13, padding: '7px 11px', outline: 'none',
    boxSizing: 'border-box',
  };

  const blocks = [
    { id: 'all',      label: 'Tudo' },
    { id: 'laptime',  label: '⏱ Tempo de Volta' },
    { id: 'balance',  label: '⚖️ Balanço' },
    { id: 'tires',    label: '⚫ Pneus' },
    { id: 'brakes',   label: '🛑 Frenagem' },
    { id: 'pilot',    label: '👤 Piloto' },
    { id: 'summary',  label: '📋 Sumário' },
  ];

  const show = (id) => activeBlock === 'all' || activeBlock === id;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.textPrimary }}>
          🏎️ Análise de Performance
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
          Análise teórica com base em todas as configurações do perfil ativo
        </div>
      </div>

      {/* ── Barra de completude ──────────────────────────────────────────────── */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '12px 16px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>Dados disponíveis</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: fillPct >= 70 ? C.green : fillPct >= 40 ? C.yellow : '#ff4444' }}>
              {filledVars}/{totalVars} variáveis ({fillPct}%)
            </span>
          </div>
          <div style={{ background: C.border + '44', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{
              width: `${fillPct}%`, height: '100%', borderRadius: 4, transition: 'width 0.5s',
              background: fillPct >= 70 ? C.green : fillPct >= 40 ? C.yellow : '#ff4444',
            }} />
          </div>
        </div>
        {warnings.length > 0 && (
          <button
            onClick={() => setShowWarnings(v => !v)}
            style={{ ...IB, cursor: 'pointer', fontSize: 11, padding: '4px 10px', color: '#ffaa44', borderColor: '#ffaa4444' }}
          >
            ⚠️ {warnings.length} aviso{warnings.length > 1 ? 's' : ''} {showWarnings ? '▲' : '▼'}
          </button>
        )}
      </div>

      {/* ── Lista de avisos ──────────────────────────────────────────────────── */}
      {showWarnings && (
        <div style={{
          background: '#ffaa0008', border: '1px solid #ffaa0030', borderRadius: 8,
          padding: '10px 14px', marginBottom: 14,
        }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: '#ffaa44', marginBottom: 3 }}>⚠️ {w}</div>
          ))}
        </div>
      )}

      {/* ── Filtro de blocos ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {blocks.map(b => (
          <button key={b.id} onClick={() => setActiveBlock(b.id)} style={{
            ...IB, cursor: 'pointer', fontSize: 11, padding: '5px 12px', fontWeight: activeBlock === b.id ? 700 : 400,
            background: activeBlock === b.id ? C.accent + '22' : C.bg,
            borderColor: activeBlock === b.id ? C.accent : C.border,
            color: activeBlock === b.id ? C.accent : C.textSecondary,
          }}>
            {b.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 1 — ESTIMATIVA DE TEMPO DE VOLTA
      ══════════════════════════════════════════════════════════════════════ */}
      {show('laptime') && (
        <Card title="Estimativa de Tempo de Volta" icon="⏱" C={C} accent={C.accent}>
          <Grid2>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Tempo Teórico — Quali</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.accent, letterSpacing: -1 }}>
                {lapTimeQuali ? fmtTime(lapTimeQuali) : '—'}
              </div>
              {!lapTimeQuali && <Warn>Preencha tipo/qtd de curvas na PistasTab</Warn>}
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Tempo de Corrida (carga plena)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.cyan || C.textPrimary, letterSpacing: -1 }}>
                {lapTimeRace ? fmtTime(lapTimeRace) : '—'}
              </div>
              {fuelTimePenalty > 0 && (
                <div style={{ fontSize: 11, color: C.textMuted }}>
                  +{fuelTimePenalty.toFixed(2)}s de combustível · grip {gripAvailable}%
                </div>
              )}
            </div>
          </Grid2>

          <div style={{ marginTop: 12 }}>
            <MetricRow label="Velocidade máxima estimada" value={vMax > 0 ? Math.round(vMax) : '—'} unit="km/h" C={C} warn={!vMax ? 'Sem relações de marcha/potência' : null} />
            <MetricRow label="Tempo em curvas lentas" value={tCornerLow > 0 ? fmt1(tCornerLow) : '—'} unit="s" C={C} warn={!tCornerLow ? 'nº de curvas não preenchido' : null} />
            <MetricRow label="Tempo em curvas médias" value={tCornerMed > 0 ? fmt1(tCornerMed) : '—'} unit="s" C={C} />
            <MetricRow label="Tempo em curvas rápidas" value={tCornerFast > 0 ? fmt1(tCornerFast) : '—'} unit="s" C={C} />
            <MetricRow label="Tempo em retas" value={tStraightsTotal > 0 ? fmt1(tStraightsTotal) : '—'} unit="s" C={C} />
            <MetricRow label="Grip disponível (temperatura)" value={`${gripAvailable}%`} C={C}
              highlight={parseFloat(gripAvailable) < 85 ? '#ffaa00' : C.green} />
            <MetricRow label="Consumo estimado por volta" value={fuelPerLapL > 0 ? fmt2(fuelPerLapL) : '—'} unit="L/volta" C={C} warn={!fuelPerLapL ? 'consumo não preenchido em CombustivelTab' : null} />
          </div>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 2 — BALANÇO MECÂNICO E AERODINÂMICO
      ══════════════════════════════════════════════════════════════════════ */}
      {show('balance') && (
        <Card title="Balanço Mecânico & Aerodinâmico" icon="⚖️" C={C} accent={C.purple || '#aa44ff'}>
          <Grid2>
            {/* Ride frequency */}
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontWeight: 600 }}>FREQUÊNCIA DE RIDE</div>
              <Light status={freqFront ? freqStatus(freqFront) : 'unknown'} label={freqFront ? `Dianteiro: ${freqFront.toFixed(2)} Hz` : 'Dianteiro: — (sem taxaMola/MR)'} />
              <Light status={freqRear  ? freqStatus(freqRear)  : 'unknown'} label={freqRear  ? `Traseiro:  ${freqRear.toFixed(2)} Hz`  : 'Traseiro: — (sem taxaMola/MR)'} />
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
                Ideal: 1.5–3.5 Hz · Abaixo=mole · Acima=rígido
              </div>
            </div>
            {/* Roll stiffness */}
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontWeight: 600 }}>ROLL STIFFNESS</div>
              {rollBalance !== null ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}>
                    {fmt1(rollBalance)}% dianteiro
                  </div>
                  <Light
                    status={rollBalance > 55 ? 'warn' : rollBalance < 45 ? 'warn' : 'ok'}
                    label={handlingTendency}
                  />
                </>
              ) : (
                <Warn>Preencha taxaMola + dimensões de bitola em Mecânica/PesoTab</Warn>
              )}
            </div>
          </Grid2>

          <div style={{ marginTop: 12 }}>
            <MetricRow label="Balanço aerodinâmico" value={aeroBalance > 0 ? `${fmt1(aeroBalance)}% diant.` : '—'} C={C}
              warn={!aeroBalance ? 'Preencha dfFront/dfRear no SetupSheet' : null} />
            <MetricRow label="Aero vs. mecânico" value={aeroVsMech} C={C} />
            <MetricRow label="Ride height dianteiro" value={rideHeightFront > 0 ? `${rideHeightFront} mm` : '—'} C={C}
              highlight={rideOkFront === false ? '#ff4444' : rideOkFront === true ? C.green : C.textPrimary} />
            <MetricRow label="Ride height traseiro" value={rideHeightRear > 0 ? `${rideHeightRear} mm` : '—'} C={C}
              highlight={rideOkRear === false ? '#ff4444' : rideOkRear === true ? C.green : C.textPrimary} />
            {rideHeightMin > 0 && (
              <MetricRow label="Ride height mínimo (regulamento)" value={`${rideHeightMin} mm`} C={C} />
            )}
            {(damperClicksFront > 0 || damperClicksRear > 0) && (
              <MetricRow label="Clicks de amortecedor (Σ diant/tras)" value={`${damperClicksFront} / ${damperClicksRear}`} C={C} />
            )}
          </div>

          {/* Semáforos de subsistemas */}
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'Suspensão', status: freqFront && freqRear ? freqStatus(freqFront) === 'ok' && freqStatus(freqRear) === 'ok' ? 'ok' : 'warn' : 'unknown' },
              { label: 'Aero', status: aeroBalance > 0 ? 'ok' : 'unknown' },
              { label: 'Ride height', status: rideOkFront === false || rideOkRear === false ? 'bad' : rideOkFront === true ? 'ok' : 'unknown' },
              { label: 'Balanço', status: rollBalance ? (handlingTendency === 'Neutro' ? 'ok' : 'warn') : 'unknown' },
            ].map(item => (
              <div key={item.label} style={{
                background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: '8px 10px', textAlign: 'center',
              }}>
                <Light status={item.status} label={item.label} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 3 — MODELO DE PNEU
      ══════════════════════════════════════════════════════════════════════ */}
      {show('tires') && (
        <Card title="Modelo de Pneu" icon="⚫" C={C} accent={C.yellow || '#ffaa00'}>
          <Grid2>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>
                {activePneu ? `${activePneu.fabricante || ''} ${activePneu.modelo || activePneu.composto || 'Composto ativo'}` : 'Composto'}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.yellow || '#ffaa00' }}>
                {realTireLife ? `${realTireLife} voltas` : '—'}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted }}>
                vida real (pista × piloto: ×{fmt1(tireFactor)} × ×{fmt1(tireWearMult)})
              </div>
              {!realTireLife && <Warn>Preencha voltasOtimas na biblioteca de Pneus</Warn>}
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>JANELA TÉRMICA</div>
              <Light status={tempStatus} label={`Pista ${trackTemp}°C vs. ótimo ${tempOtima}°C`} />
              <div style={{ marginTop: 6 }}>
                <Bar value={parseFloat(gripAvailable)} max={100} color={parseFloat(gripAvailable) >= 90 ? C.green : C.yellow || '#ffaa00'} label={`Grip disponível: ${gripAvailable}%`} C={C} />
              </div>
            </div>
          </Grid2>

          <div style={{ marginTop: 10 }}>
            <MetricRow label="Warm-up" value={`${voltasWarmUp} volta${voltasWarmUp !== 1 ? 's' : ''}`} C={C} />
            <MetricRow label="Volta do cliff" value={cliffLap ? cliffLap : '—'} C={C}
              highlight={cliffLap ? '#ff4444' : C.textPrimary}
              warn={!cliffLap ? 'voltaCliff não preenchida (PneusTab)' : null} />
            <MetricRow label="Degradação por volta" value={realDegSPorVolta ? `+${fmt3(realDegSPorVolta)}s` : '—'} C={C} warn={!realDegSPorVolta ? 'degradacaoSPorVolta não preenchida' : null} />
            <MetricRow label="Degradação pós-cliff" value={realDegPosCliff ? `+${fmt3(realDegPosCliff)}s/volta` : '—'} C={C} />
          </div>

          {/* Mini gráfico de tempo por volta */}
          {stintSimulation.length > 0 && lapTimeRace && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>
                CURVA DE TEMPO POR VOLTA — STINT COMPLETO
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
                {stintSimulation.slice(0, 40).map((pt, i) => {
                  const minT = lapTimeRace;
                  const maxT = lapTimeRace + 5;
                  const h = Math.max(4, Math.min(56, ((pt.time - minT) / (maxT - minT + 0.001)) * 56));
                  const isCliff = cliffLap && pt.lap === cliffLap;
                  const color = isCliff ? '#ff4444' : pt.lap <= voltasWarmUp ? C.yellow || '#ffaa00' : C.green;
                  return (
                    <div
                      key={i}
                      title={`V${pt.lap}: ${fmtTime(pt.time)}`}
                      style={{ flex: 1, height: `${h + 4}px`, background: color, borderRadius: 2, opacity: 0.85, cursor: 'default' }}
                    />
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textMuted, marginTop: 3 }}>
                <span>Volta 1</span>
                <span style={{ color: C.yellow || '#ffaa00' }}>■ Warm-up</span>
                <span style={{ color: C.green }}>■ Ótimo</span>
                <span style={{ color: '#ff4444' }}>■ Cliff</span>
                <span>Volta {Math.min(40, stintSimulation.length)}</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 4 — FRENAGEM
      ══════════════════════════════════════════════════════════════════════ */}
      {show('brakes') && (
        <Card title="Performance de Frenagem" icon="🛑" C={C} accent="#ff5555">
          <Grid2>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Distância de parada — 100 km/h</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#ff5555' }}>
                {stopDist100 ? `${fmt1(stopDist100)} m` : '—'}
              </div>
              {!decelG && <div style={{ fontSize: 11, color: C.textMuted }}>baseado em μ={fmt2(muPad)} × {fmt2(decelEst)}g est.</div>}
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Temp. estimada de trabalho</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: padTempStatus === 'ok' ? C.green : padTempStatus === 'bad' ? '#ff4444' : '#ffaa00' }}>
                {Math.round(padTempEst)}°C
              </div>
              {tempMinPad > 0 && tempMaxPad > 0 && (
                <div style={{ fontSize: 11, color: C.textMuted }}>Janela: {tempMinPad}–{tempMaxPad}°C</div>
              )}
            </div>
          </Grid2>

          <div style={{ marginTop: 10 }}>
            <MetricRow label="Diâmetro do disco (dianteiro)" value={discDiamFront > 0 ? `${discDiamFront} mm` : '—'} C={C} warn={!discDiamFront ? 'disco não cadastrado em Mecânica' : null} />
            <MetricRow label="Coef. de atrito da pastilha (μ)" value={fmt2(muPad)} C={C} />
            <MetricRow label="Brake bias dianteiro" value={`${brakeBias}%`} C={C} warn={!brakeBias ? 'brakeBias não preenchido (SetupSheet)' : null} />
            <MetricRow label="Espessura atual / mínima" value={padThkCurrent > 0 ? `${padThkCurrent} / ${padThkMin} mm` : '—'} C={C}
              highlight={padThkCurrent > 0 && padThkMin > 0 && padThkCurrent < padThkMin * 1.5 ? '#ff4444' : C.textPrimary}
              warn={!padThkCurrent ? 'espessuraAtual não preenchida em Mecânica' : null} />
            <MetricRow label="Desgaste estimado por corrida" value={padWearPerRace ? `${fmt2(padWearPerRace)} mm` : '—'} C={C} warn={!padWearPerRace ? 'taxaDesgaste não preenchida em Mecânica' : null} />
            <MetricRow label="Corridas restantes" value={padLifeRemain !== null ? padLifeRemain : '—'} C={C}
              highlight={padLifeRemain !== null && padLifeRemain <= 1 ? '#ff4444' : padLifeRemain !== null && padLifeRemain <= 3 ? '#ffaa00' : C.textPrimary} />
            <MetricRow label="Status da pastilha"
              value={padTempStatus === 'ok' ? 'Dentro da janela' : padTempStatus === 'bad' ? 'Acima do limite!' : padTempStatus === 'warn' ? 'Abaixo da temp. ótima' : 'Sem dados de temp.'}
              C={C} highlight={padTempStatus === 'ok' ? C.green : padTempStatus === 'bad' ? '#ff4444' : '#ffaa00'} />
          </div>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 5 — TENDÊNCIAS DO PILOTO
      ══════════════════════════════════════════════════════════════════════ */}
      {show('pilot') && (
        <Card title="Tendências do Piloto vs. Traçado Ótimo" icon="👤" C={C} accent={C.cyan || '#44ccff'}>
          {!pilot ? (
            <Warn>Nenhum piloto designado a este perfil. Acesse a aba Pilotos e atribua um piloto ao perfil.</Warn>
          ) : (
            <>
              <div style={{ marginBottom: 10, fontSize: 13, color: C.textPrimary, fontWeight: 600 }}>
                {pilot.name || 'Piloto sem nome'}
                <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400, marginLeft: 8 }}>
                  {pilot.weightEquipped ? `${pilot.weightEquipped} kg` : ''}
                </span>
              </div>

              <Grid2>
                <div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Delta total por volta</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: deltaTotal < 0.3 ? C.green : deltaTotal < 0.8 ? C.yellow || '#ffaa00' : '#ff4444' }}>
                    +{fmt2(deltaTotal)}s
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>vs. traçado ótimo teórico</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>FADIGA NO STINT</div>
                  <MetricRow label="Após 30 min" value={fadigaAt30min > 0 ? `+${fmt2(fadigaAt30min)}s/volta` : '0s'} C={C} />
                  <MetricRow label="Após 60 min" value={fadigaAt60min > 0 ? `+${fmt2(fadigaAt60min)}s/volta` : '0s'} C={C}
                    highlight={fadigaAt60min > 0.5 ? '#ff4444' : fadigaAt60min > 0.2 ? '#ffaa00' : C.green} />
                </div>
              </Grid2>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>DECOMPOSIÇÃO DO DELTA</div>
                {[
                  { label: 'Frenagem',          value: deltaBrake,    total: deltaTotal },
                  { label: 'Acelerador',         value: deltaThrottle, total: deltaTotal },
                  { label: 'Direção (suavidade)',value: deltaSteering, total: deltaTotal },
                  { label: 'Desvio de trajetória',value: deltaTraject,  total: deltaTotal },
                  { label: 'Inconsistência frenagem',value: deltaBrakePt,total: deltaTotal },
                ].map(item => (
                  <div key={item.label} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: C.textMuted }}>{item.label}</span>
                      <span style={{ color: C.textPrimary, fontWeight: 600 }}>+{fmt3(item.value)}s</span>
                    </div>
                    <Bar value={item.value} max={item.total + 0.001} color={C.accent} C={C} />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted, fontWeight: 600, marginBottom: 6 }}>MULTIPLICADORES ATIVOS</div>
              <Grid2>
                <MetricRow label="Desgaste pneu" value={`×${tireWearMult}`} C={C} highlight={tireWearMult > 1.1 ? '#ffaa00' : C.green} />
                <MetricRow label="Consumo combustível" value={`×${result.fuelConsMult || 1}`} C={C} />
              </Grid2>
            </>
          )}
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOCO 6 — SUMÁRIO PARA ESTRATÉGIA
      ══════════════════════════════════════════════════════════════════════ */}
      {show('summary') && (
        <Card title="Sumário para Estratégia" icon="📋" C={C} accent={C.green || '#44cc66'}>
          <Grid2>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>RITMO DE CORRIDA</div>
              <MetricRow label="Tempo de volta (corrida)" value={lapTimeRace ? fmtTime(lapTimeRace) : '—'} C={C} />
              <MetricRow label="Tempo de volta (quali)"   value={lapTimeQuali ? fmtTime(lapTimeQuali) : '—'} C={C} />
              <MetricRow label="Delta piloto/ótimo"       value={`+${fmt2(deltaTotal)}s`} C={C} />
              <MetricRow label="Consumo por volta"        value={fuelPerLapL > 0 ? `${fmt2(fuelPerLapL)} L` : '—'} C={C} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>STINT</div>
              <MetricRow label="Stint máximo recomendado"
                value={stintMaxRecom < 999 ? `${stintMaxRecom} voltas` : '—'} C={C}
                highlight={stintMaxRecom < 999 ? C.green : C.textPrimary} />
              <MetricRow label="  ↳ por vida do pneu"    value={stintMaxByTire  > 0 ? `${stintMaxByTire} v` : '—'}  C={C} />
              <MetricRow label="  ↳ por fadiga do piloto" value={stintMaxByFatigue > 0 ? `${stintMaxByFatigue} v` : '—'} C={C} />
              <MetricRow label="Volta do cliff"          value={cliffLap ? `volta ${cliffLap}` : '—'} C={C}
                highlight={cliffLap ? '#ff4444' : C.textPrimary} />
            </div>
          </Grid2>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>RESTRIÇÕES REGULAMENTARES</div>
            <MetricRow label="Peso mínimo"              value={pesoMinimo > 0 ? `${pesoMinimo} kg` : '—'} C={C}
              highlight={totalMass > 0 && pesoMinimo > 0 && totalMass < pesoMinimo ? '#ff4444' : C.textPrimary}
              warn={!pesoMinimo ? 'pesoMinimo não preenchido (Regulamentações)' : null} />
            <MetricRow label="Combustível máximo"       value={combustivelMax > 0 ? `${combustivelMax} L` : '—'} C={C}
              warn={!combustivelMax ? 'combustivelMax não preenchido (Regulamentações)' : null} />
            <MetricRow label="Tempo mínimo de pit"      value={pitTempoMin > 0 ? `${pitTempoMin} s` : '—'} C={C} />
            <MetricRow label="Reabastecimento permitido" value={pitReabast || '—'} C={C} />
          </div>

          {/* Alertas */}
          <div style={{ marginTop: 14 }}>
            {[
              totalMass > 0 && pesoMinimo > 0 && totalMass < pesoMinimo && { type: 'red', msg: `Peso total (${Math.round(totalMass)} kg) abaixo do mínimo regulamentar (${pesoMinimo} kg)` },
              padTempStatus === 'bad' && { type: 'red', msg: `Temperatura da pastilha estimada (${Math.round(padTempEst)}°C) excede o limite (${tempMaxPad}°C)` },
              cliffLap > 0 && realTireLife > 0 && cliffLap > realTireLife && { type: 'yellow', msg: `Cliff de pneu (volta ${cliffLap}) ultrapassa vida estimada (${realTireLife} v) — verificar degradacaoPosCliff` },
              parseFloat(gripAvailable) < 80 && { type: 'yellow', msg: `Grip disponível reduzido (${gripAvailable}%) — temperatura de pista fora da janela ideal` },
              padLifeRemain !== null && padLifeRemain <= 1 && { type: 'red', msg: `Pastilha com ${padLifeRemain} corrida(s) restante(s) — trocar antes do próximo evento` },
              rideOkFront === false && { type: 'red', msg: `Ride height dianteiro (${rideHeightFront} mm) abaixo do mínimo regulamentar (${rideHeightMin} mm)` },
              rideOkRear === false && { type: 'red', msg: `Ride height traseiro (${rideHeightRear} mm) abaixo do mínimo regulamentar (${rideHeightMin} mm)` },
            ].filter(Boolean).map((alert, i) => alert && (
              <div key={i} style={{
                background: alert.type === 'red' ? '#ff222215' : '#ffaa0015',
                border: `1px solid ${alert.type === 'red' ? '#ff4444' : '#ffaa00'}44`,
                borderRadius: 8, padding: '8px 12px', marginBottom: 6,
                fontSize: 12, color: alert.type === 'red' ? '#ff7777' : '#ffcc66',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {alert.type === 'red' ? '🚨' : '⚠️'} {alert.msg}
              </div>
            ))}
          </div>
        </Card>
      )}

    </div>
  );
}
