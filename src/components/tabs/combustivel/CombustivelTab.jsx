/**
 * CombustivelTab — Calculadora de Peso & Combustível
 *
 * Funcionalidades:
 *  1. Cálculo de consumo por volta (via comprimento da pista + L/100km OU empírico)
 *  2. Planejamento de corrida (voltas × consumo/volta + margem de segurança)
 *  3. Peso total (carro + piloto + combustível vs. mínimo regulamentar)
 *  4. Múltiplos cenários salvos por perfil
 *
 * Persistência: localStorage — chave rt_fuel_<profileId>
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useColors } from '@/context/ThemeContext';
import { PrintFooter } from '@/components/common';
import { getCrossTabData, TRACK_SELECTED_EVENT, readActiveTrack } from '@/core/crossTabSync';
import { useCarWeight } from '@/context/CarWeightContext';

/* ─── constantes ─────────────────────────────────────────────────── */
const STORAGE_PREFIX = 'rt_fuel_';

const FUEL_TYPES = [
  { value: 'gasolina',  label: 'Gasolina (RON 98)',     density: 0.740, energyMJL: 32.0 },
  { value: 'e10',       label: 'E10 (10% Etanol)',      density: 0.745, energyMJL: 30.8 },
  { value: 'e85',       label: 'E85 (85% Etanol)',      density: 0.785, energyMJL: 23.5 },
  { value: '100oct',    label: '100 Octanas',           density: 0.720, energyMJL: 33.0 },
  { value: 'sintetico', label: 'Combustível Sintético', density: 0.760, energyMJL: 34.5 },
  { value: 'custom',    label: 'Personalizado',         density: null,  energyMJL: null  },
];

function getFuelType(s)    { return FUEL_TYPES.find(f => f.value === (s.fuelType || 'gasolina')) || FUEL_TYPES[0]; }
function getFuelDensity(s) { return s.fuelType === 'custom' ? (parseFloat(s.fuelDensityCustom) || 0.74) : getFuelType(s).density; }
function getFuelEnergy(s)  { return s.fuelType === 'custom' ? (parseFloat(s.energyDensityCustom) || null) : getFuelType(s).energyMJL; }

const EMPTY_SCENARIO = {
  id: null,
  name: '',
  // consumo por volta
  trackLength:        '',   // km
  consumptionRate:    '',   // L/100 km
  fuelUsed:           '',   // L empírico
  lapsCompleted:      '',   // voltas (empírico)
  // corrida
  raceLaps:           '',   // voltas totais
  manualPerLap:       '',   // override manual L/volta
  safetyMargin:       '',   // % extra
  // combustível
  fuelType:           'gasolina',
  tankCapacity:       '',   // capacidade do tanque (L)
  fuelDensityCustom:  '',   // kg/L — só se fuelType === 'custom'
  energyDensityCustom:'',   // MJ/L — só se fuelType === 'custom'
  pitFlowRate:        '',   // L/s — flow rate do sistema de abastecimento
  // peso
  carWeight:          '',   // kg sem combustível
  driverWeight:       '',   // kg
  minWeight:          '',   // kg regulamentar
  // CG com variação de carga
  tankPosX:           '',   // posição longitudinal do tanque (mm a partir do eixo dianteiro)
  cgCarX:             '',   // CG do carro sem comb. (mm a partir do eixo dianteiro)
  wheelbaseLen:       '',   // distância entre eixos (mm)
  notes:              '',
};

function newScenario() {
  return { ...EMPTY_SCENARIO, id: Date.now() };
}

/* ─── helpers ───────────────────────────────────────────────────── */
function calcPerLap(s) {
  const used  = parseFloat(s.fuelUsed);
  const laps  = parseFloat(s.lapsCompleted);
  if (!isNaN(used) && !isNaN(laps) && laps > 0) return used / laps;
  const track = parseFloat(s.trackLength);
  const rate  = parseFloat(s.consumptionRate);
  if (!isNaN(track) && !isNaN(rate) && track > 0 && rate > 0)
    return (rate * track) / 100;
  return null;
}

function calcTotalFuel(s) {
  const perLap   = parseFloat(s.manualPerLap) || calcPerLap(s);
  const raceLaps = parseFloat(s.raceLaps);
  const margin   = parseFloat(s.safetyMargin) || 0;
  if (perLap === null || isNaN(raceLaps) || raceLaps <= 0) return null;
  return perLap * raceLaps * (1 + margin / 100);
}

function calcWeights(s) {
  const density    = getFuelDensity(s);
  const totalFuel  = calcTotalFuel(s);
  const carW       = parseFloat(s.carWeight);
  const driverW    = parseFloat(s.driverWeight);
  const minW       = parseFloat(s.minWeight);
  const fuelW      = totalFuel !== null ? totalFuel * density : null;
  const knownParts = [carW, driverW, fuelW].filter(x => x !== null && !isNaN(x));
  const totalW     = knownParts.length === 3 ? carW + driverW + fuelW : null;
  const margin     = totalW !== null && !isNaN(minW) ? totalW - minW : null;
  return { fuelW, totalW, margin, density };
}

function calcRefills(s, totalFuel) {
  const cap = parseFloat(s.tankCapacity);
  if (isNaN(cap) || cap <= 0 || totalFuel === null) return null;
  const fills       = Math.ceil(totalFuel / cap);
  const loaded      = fills * cap;
  const actualSurpl = +(loaded - totalFuel).toFixed(2);
  const flowRate    = parseFloat(s.pitFlowRate);
  const refuelTimeFull = (!isNaN(flowRate) && flowRate > 0) ? +(cap / flowRate).toFixed(1) : null;
  // Tempo para abastecer uma quantidade específica de litros
  const refuelTimePerLiter = (!isNaN(flowRate) && flowRate > 0) ? +(1 / flowRate).toFixed(2) : null;
  return { fills, loaded: +loaded.toFixed(2), actualSurpl, refuelTimeFull, refuelTimePerLiter };
}

function calcCGShift(s, totalFuel) {
  const tankX   = parseFloat(s.tankPosX);
  const cgX     = parseFloat(s.cgCarX);
  const wb      = parseFloat(s.wheelbaseLen);
  const carW    = parseFloat(s.carWeight);
  const driverW = parseFloat(s.driverWeight) || 0;
  if ([tankX, cgX, wb, carW].some(isNaN) || wb <= 0 || totalFuel === null) return null;
  const density  = getFuelDensity(s);
  const margin   = parseFloat(s.safetyMargin) || 0;
  const baseW    = carW + driverW;
  const fwStart  = totalFuel * density;
  // ao fim da corrida sobra apenas o combustível da margem de segurança
  const fuelEnd  = totalFuel * (margin / (100 + margin));
  const fwEnd    = fuelEnd * density;
  const cgStart  = (baseW * cgX + fwStart * tankX) / (baseW + fwStart);
  const cgEnd    = (baseW * cgX + fwEnd   * tankX) / (baseW + fwEnd);
  return {
    cgStart:    +cgStart.toFixed(1),
    cgEnd:      +cgEnd.toFixed(1),
    frontStart: +((cgStart / wb) * 100).toFixed(1),
    frontEnd:   +((cgEnd   / wb) * 100).toFixed(1),
    shift:      +(cgEnd - cgStart).toFixed(1),
    fuelEnd:    +fuelEnd.toFixed(2),
    margin,
  };
}

/* ─── sub-componentes estáticos ─────────────────────────────────── */
function Label({ children, COLORS }) {
  return (
    <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
      {children}
    </label>
  );
}

function Field({ label, value, onChange, unit, placeholder, COLORS, INPUT_BASE, half, highlightColor }) {
  return (
    <div style={{ flex: half ? '1 1 140px' : '1 1 100%', minWidth: 120 }}>
      <Label COLORS={COLORS}>{label}{unit ? ` (${unit})` : ''}</Label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || ''}
        style={{
          ...INPUT_BASE,
          width: '100%',
          borderColor: highlightColor || INPUT_BASE.borderColor,
        }}
      />
    </div>
  );
}

function CalcBox({ label, value, unit, color, COLORS, size = 'normal' }) {
  const fontSize = size === 'large' ? 22 : 16;
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140 }}>
      <Label COLORS={COLORS}>{label}</Label>
      <div style={{
        background: COLORS.bg,
        border: `1px solid ${value !== null ? color : COLORS.border}`,
        borderRadius: 6,
        padding: '8px 12px',
        fontSize,
        fontWeight: 800,
        color: value !== null ? color : COLORS.textMuted,
        textAlign: 'center',
        minHeight: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {value !== null ? `${value}${unit ? ` ${unit}` : ''}` : '—'}
      </div>
    </div>
  );
}

function SectionTitle({ children, color }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '1px', color, marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

/* ─── componente principal ──────────────────────────────────────── */
export default function CombustivelTab({
  activeProfile,
  profilesList = [],
  activeProfileId,
  profileGroups = [],
  onSaveFuelCalc,
  profileFuelCalcs = [],
  onDeleteFuelCalc,
  onLoadFuelCalc,
}) {
  const COLORS = useColors();
  const profileId = activeProfile?.id || 'default';
  const {
    pesoCarro: ctxPesoCarro, setPesoCarro,
    pesoPiloto: ctxPesoPiloto, setPesoPiloto,
    wheelbase: ctxWheelbase, setWheelbase,
    violaRegulamento, excesso, pesoMinimo,
    combustivelMax,
    assignedPilots, selectedPilotId, selectPilot,
  } = useCarWeight();
  const syncingFromCtx = useRef(false);

  // ── Cross-tab sync: lê dados de PesoTab, PilotosTab, PistasTab ──
  const xt = useMemo(() => getCrossTabData(profileId), [profileId]);

  const INPUT_BASE = {
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    color: COLORS.textPrimary,
    fontSize: 13,
    padding: '7px 11px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const CARD = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: '18px 20px',
    marginBottom: 16,
  };

  /* ── estado ── */
  const [scenarios, setScenarios] = useState([]);
  const [activeId,  setActiveId]  = useState(null);

  /* ── save-to-profile state ── */
  const [fuelSaveName,   setFuelSaveName]   = useState('');
  const [fuelSaveTarget, setFuelSaveTarget] = useState('');
  const [fuelGroupId,    setFuelGroupId]    = useState('');
  const [fuelSaveMsg,    setFuelSaveMsg]    = useState(null);
  const [showFuelSaved,  setShowFuelSaved]  = useState(false);

  useEffect(() => {
    if (activeProfileId && !fuelSaveTarget) setFuelSaveTarget(activeProfileId);
  }, [activeProfileId]);

  const handleSaveFuelCalcToProfile = useCallback(() => {
    if (!fuelSaveName.trim()) {
      setFuelSaveMsg({ ok: false, text: 'Digite um nome para a configuração.' });
      return;
    }
    const targetId = fuelSaveTarget || activeProfileId;
    if (!targetId) {
      setFuelSaveMsg({ ok: false, text: 'Selecione um perfil de destino.' });
      return;
    }
    const result = onSaveFuelCalc?.(targetId, fuelSaveName.trim(), {
      scenarios,
      activeId,
    }, fuelGroupId || undefined);
    if (result?.error) {
      setFuelSaveMsg({ ok: false, text: result.error });
    } else {
      const pName = profilesList.find((p) => p.id === targetId)?.name || 'perfil';
      setFuelSaveMsg({ ok: true, text: `Salvo em "${pName}"!` });
      setFuelSaveName('');
      setTimeout(() => setFuelSaveMsg(null), 3500);
    }
  }, [fuelSaveName, fuelSaveTarget, activeProfileId, fuelGroupId, onSaveFuelCalc, scenarios, activeId, profilesList]);

  /* ── persistência ── */
  const storageKey = `${STORAGE_PREFIX}${profileId}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (saved.length > 0) {
        // Se o contexto já tem valor (outra tab atualizou antes), aplica em todos os cenários
        const overrides = {};
        if (ctxPesoCarro)  overrides.carWeight    = ctxPesoCarro;
        if (ctxPesoPiloto) overrides.driverWeight = ctxPesoPiloto;
        if (ctxWheelbase)  overrides.wheelbaseLen = ctxWheelbase;
        const scenariosToLoad = Object.keys(overrides).length
          ? saved.map(s => ({ ...s, ...overrides }))
          : saved;
        setScenarios(scenariosToLoad);
        setActiveId(saved[0].id);
        // Inicializa contexto com valores do localStorage onde ainda estiver vazio
        if (!ctxPesoCarro  && saved[0].carWeight)    setPesoCarro(saved[0].carWeight);
        if (!ctxPesoPiloto && saved[0].driverWeight) setPesoPiloto(saved[0].driverWeight);
        if (!ctxWheelbase  && saved[0].wheelbaseLen) setWheelbase(saved[0].wheelbaseLen);
        if (Object.keys(overrides).length) {
          localStorage.setItem(storageKey, JSON.stringify(scenariosToLoad));
        }
      } else {
        const first = newScenario();
        first.name = 'Cenário 1';
        setScenarios([first]);
        setActiveId(first.id);
      }
    } catch {
      const first = newScenario();
      first.name = 'Cenário 1';
      setScenarios([first]);
      setActiveId(first.id);
    }
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((next) => {
    setScenarios(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }, [storageKey]);

  // Quando o contexto global muda, sincroniza todos os cenários
  useEffect(() => {
    if (!ctxPesoCarro) return;
    setScenarios(prev => {
      if (prev.every(s => s.carWeight === ctxPesoCarro)) return prev;
      syncingFromCtx.current = true;
      const next = prev.map(s => ({ ...s, carWeight: ctxPesoCarro }));
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [ctxPesoCarro, storageKey]);

  useEffect(() => {
    if (!ctxPesoPiloto) return;
    setScenarios(prev => {
      if (prev.every(s => s.driverWeight === ctxPesoPiloto)) return prev;
      syncingFromCtx.current = true;
      const next = prev.map(s => ({ ...s, driverWeight: ctxPesoPiloto }));
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [ctxPesoPiloto, storageKey]);

  useEffect(() => {
    if (!ctxWheelbase) return;
    setScenarios(prev => {
      if (prev.every(s => s.wheelbaseLen === ctxWheelbase)) return prev;
      syncingFromCtx.current = true;
      const next = prev.map(s => ({ ...s, wheelbaseLen: ctxWheelbase }));
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [ctxWheelbase, storageKey]);

  /* ── sync: pista ativa → trackLength ── */
  const applyTrackLength = useCallback((lengthKm) => {
    if (!lengthKm) return;
    const val = String(lengthKm);
    setScenarios(prev => {
      if (prev.every(s => s.trackLength === val)) return prev;
      const next = prev.map(s => s.trackLength ? s : { ...s, trackLength: val });
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  useEffect(() => {
    // Ao montar: lê pista ativa do localStorage
    const active = readActiveTrack(profileId);
    if (active?.lengthKm) applyTrackLength(active.lengthKm);
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Quando usuário seleciona pista no PistasTab
    const handler = (e) => { if (e.detail?.lengthKm) applyTrackLength(e.detail.lengthKm); };
    window.addEventListener(TRACK_SELECTED_EVENT, handler);
    return () => window.removeEventListener(TRACK_SELECTED_EVENT, handler);
  }, [applyTrackLength]);

  /* ── helpers de mutação ── */
  const active = scenarios.find(s => s.id === activeId) || scenarios[0] || null;

  // Cenário com fallback cross-tab (para cálculos — campos vazios usam dados de outras tabs)
  const merged = useMemo(() => {
    if (!active) return null;
    return {
      ...active,
      carWeight:    active.carWeight    || xt.pesoCarro,
      driverWeight: active.driverWeight || xt.pilotWeight || xt.pesoPiloto,
      minWeight:    active.minWeight    || xt.pesoHomologado,
      wheelbaseLen: active.wheelbaseLen || xt.wheelbase,
    };
  }, [active, xt]);

  const updateField = useCallback((field) => (val) => {
    persist(scenarios.map(s => s.id === activeId ? { ...s, [field]: val } : s));
    if (!syncingFromCtx.current) {
      if (field === 'carWeight')    setPesoCarro(val);
      if (field === 'driverWeight') setPesoPiloto(val);
      if (field === 'wheelbaseLen') setWheelbase(val);
    }
    syncingFromCtx.current = false;
  }, [scenarios, activeId, persist, setPesoCarro, setPesoPiloto, setWheelbase]);

  const addScenario = () => {
    const n = newScenario();
    n.name = `Cenário ${scenarios.length + 1}`;
    const next = [...scenarios, n];
    persist(next);
    setActiveId(n.id);
  };

  const deleteScenario = (id) => {
    if (scenarios.length === 1) return;
    const next = scenarios.filter(s => s.id !== id);
    persist(next);
    if (activeId === id) setActiveId(next[0]?.id || null);
  };

  const duplicateScenario = () => {
    if (!active) return;
    const copy = { ...active, id: Date.now(), name: `${active.name} (cópia)` };
    const next = [...scenarios, copy];
    persist(next);
    setActiveId(copy.id);
  };

  if (!active) return null;

  /* ── cálculos (usa merged = active + fallback cross-tab) ── */
  const perLapCalc    = calcPerLap(active);
  const perLapDisplay = parseFloat(active.manualPerLap) || perLapCalc;
  const totalFuel     = calcTotalFuel(active);
  const { fuelW, totalW, margin, density } = calcWeights(merged);
  const refills       = calcRefills(active, totalFuel);
  const cgShift       = calcCGShift(merged, totalFuel);
  const fuelEnergy    = getFuelEnergy(active);
  const fuelTypeInfo  = getFuelType(active);

  const marginColor = margin !== null
    ? (margin >= 0 ? COLORS.green : '#ff4444')
    : COLORS.border;

  const fieldRow = { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 0 };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Banner de infração regulamentar — combustível ────────── */}
      {(() => {
        const maxL  = parseFloat(combustivelMax);
        const total = totalFuel;
        if (isNaN(maxL) || maxL <= 0 || total === null || total <= maxL) return null;
        const excessoL = (total - maxL).toFixed(1);
        return (
          <div style={{
            background: '#ff880015',
            border: '1.5px solid #ff8800',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>⛽</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ff8800' }}>
                Infração Regulamentar — Combustível
              </div>
              <div style={{ fontSize: 12, color: '#ffaa44', marginTop: 2 }}>
                Volume calculado ({total.toFixed(1)} L) excede o limite de {combustivelMax} L
                em <strong>{excessoL} L</strong>.
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Banner de infração regulamentar — peso ────────────────── */}
      {violaRegulamento && (
        <div style={{
          background: '#ff222215',
          border: '1.5px solid #ff4444',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>🚨</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ff4444' }}>
              Infração Regulamentar — Peso
            </div>
            <div style={{ fontSize: 12, color: '#ff7777', marginTop: 2 }}>
              Peso do carro ({active?.carWeight} kg) excede o limite regulamentar de {pesoMinimo} kg
              em <strong>{excesso} kg</strong>.
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary }}>
            ⛽ Peso & Combustível
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
            Calcule consumo por volta, combustível para a corrida e peso total do carro
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={duplicateScenario}
            style={{ ...INPUT_BASE, cursor: 'pointer', padding: '7px 14px', fontSize: 12, color: COLORS.textSecondary }}
          >
            ⧉ Duplicar
          </button>
          <button
            onClick={addScenario}
            style={{
              background: COLORS.accent, border: 'none', borderRadius: 8,
              color: '#fff', fontWeight: 700, fontSize: 13,
              padding: '8px 18px', cursor: 'pointer',
            }}
          >
            + Novo Cenário
          </button>
        </div>
      </div>

      {/* ── Abas de cenários ── */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18,
        borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 10,
      }}>
        {scenarios.map(s => (
          <div
            key={s.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: s.id === activeId ? `${COLORS.accent}22` : COLORS.surface,
              border: `1px solid ${s.id === activeId ? COLORS.accent : COLORS.border}`,
              borderRadius: 8, padding: '5px 12px',
              cursor: 'pointer',
            }}
            onClick={() => setActiveId(s.id)}
          >
            <span style={{
              fontSize: 13, fontWeight: s.id === activeId ? 700 : 400,
              color: s.id === activeId ? COLORS.accent : COLORS.textSecondary,
            }}>
              {s.name || 'Sem nome'}
            </span>
            {scenarios.length > 1 && (
              <span
                style={{ fontSize: 11, color: COLORS.textMuted, cursor: 'pointer', lineHeight: 1 }}
                onClick={(e) => { e.stopPropagation(); deleteScenario(s.id); }}
                title="Remover cenário"
              >✕</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Nome do cenário ── */}
      <div style={{ marginBottom: 16 }}>
        <Label COLORS={COLORS}>Nome do cenário</Label>
        <input
          type="text"
          value={active.name}
          onChange={(e) => updateField('name')(e.target.value)}
          placeholder="Ex: Classificação — seco, 20 voltas"
          style={{ ...INPUT_BASE, width: '100%', maxWidth: 400 }}
        />
      </div>

      {/* ═══════════════════════════════════════
          SEÇÃO 0 — ESPECIFICAÇÕES DO COMBUSTÍVEL
      ═══════════════════════════════════════ */}
      <div style={CARD}>
        <SectionTitle color={COLORS.purple || '#9b59b6'}>🧪 Especificações do Combustível &amp; Tanque</SectionTitle>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {/* Tipo de combustível */}
          <div style={{ flex: '1 1 200px', minWidth: 160 }}>
            <Label COLORS={COLORS}>Tipo de combustível</Label>
            <select
              value={active.fuelType || 'gasolina'}
              onChange={(e) => updateField('fuelType')(e.target.value)}
              style={{ ...INPUT_BASE, width: '100%' }}
            >
              {FUEL_TYPES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          {/* Capacidade do tanque */}
          <Field label="Capacidade do tanque" value={active.tankCapacity} onChange={updateField('tankCapacity')} unit="L" placeholder="100" COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
          {/* Pit flow rate */}
          <Field label="Flow rate abastecimento" value={active.pitFlowRate} onChange={updateField('pitFlowRate')} unit="L/s" placeholder="12" COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
        </div>

        {/* Campos custom */}
        {active.fuelType === 'custom' && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14, background: `${COLORS.border}22`, borderRadius: 8, padding: '10px 12px' }}>
            <Field label="Densidade de massa" value={active.fuelDensityCustom} onChange={updateField('fuelDensityCustom')} unit="kg/L" placeholder="0.74" COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
            <Field label="Densidade energética" value={active.energyDensityCustom} onChange={updateField('energyDensityCustom')} unit="MJ/L" placeholder="32.0" COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
          </div>
        )}

        {/* Resumo do tipo selecionado */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 14px' }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>Densidade</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary }}>{density.toFixed(3)} kg/L</div>
          </div>
          <div style={{ flex: '1 1 140px', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 14px' }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>Dens. Energética</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: fuelEnergy ? COLORS.textPrimary : COLORS.textMuted }}>
              {fuelEnergy ? `${fuelEnergy} MJ/L` : '—'}
            </div>
          </div>
          {active.tankCapacity && !isNaN(parseFloat(active.tankCapacity)) && (
            <div style={{ flex: '1 1 160px', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 14px' }}>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>Massa do tanque cheio</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary }}>
                {(parseFloat(active.tankCapacity) * density).toFixed(1)} kg
              </div>
            </div>
          )}
          {active.pitFlowRate && active.tankCapacity && !isNaN(parseFloat(active.pitFlowRate)) && !isNaN(parseFloat(active.tankCapacity)) && (
            <div style={{ flex: '1 1 160px', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 14px' }}>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>Tempo tanque cheio</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary }}>
                {(parseFloat(active.tankCapacity) / parseFloat(active.pitFlowRate)).toFixed(1)} s
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SEÇÃO 1 — CONSUMO POR VOLTA
      ═══════════════════════════════════════ */}
      <div style={CARD}>
        <SectionTitle color={COLORS.accent}>⛽ Consumo por Volta</SectionTitle>

        {/* Método teórico */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>
            Método Teórico — comprimento da pista × taxa de consumo
          </div>
          <div style={{ ...fieldRow }}>
            <Field label="Comprimento da pista" value={active.trackLength}     onChange={updateField('trackLength')}     unit="km"     placeholder="4.309" COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
            <Field label="Taxa de consumo"       value={active.consumptionRate} onChange={updateField('consumptionRate')} unit="L/100km" placeholder="55"    COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
          </div>
        </div>

        {/* Método empírico */}
        <div style={{ borderTop: `1px solid ${COLORS.border}33`, paddingTop: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>
            Método Empírico — dados medidos no carro
          </div>
          <div style={fieldRow}>
            <Field label="Combustível usado"  value={active.fuelUsed}       onChange={updateField('fuelUsed')}       unit="L"      placeholder="12.5" COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
            <Field label="Voltas completadas" value={active.lapsCompleted}  onChange={updateField('lapsCompleted')}  unit="voltas" placeholder="8"    COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4 }}>
            Se preenchido, sobrepõe o método teórico
          </div>
        </div>

        {/* Resultado + override manual */}
        <div style={{ borderTop: `1px solid ${COLORS.border}33`, paddingTop: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <CalcBox
              label="Consumo calculado / volta"
              value={perLapCalc !== null ? perLapCalc.toFixed(3) : null}
              unit="L"
              color={COLORS.accent}
              COLORS={COLORS}
              size="large"
            />
            <div style={{ flex: '1 1 160px', minWidth: 140 }}>
              <Label COLORS={COLORS}>Override manual (L/volta)</Label>
              <input
                type="text"
                value={active.manualPerLap || ''}
                onChange={(e) => updateField('manualPerLap')(e.target.value)}
                placeholder={perLapCalc ? perLapCalc.toFixed(3) : '—'}
                style={{ ...INPUT_BASE, width: '100%' }}
              />
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3, fontStyle: 'italic' }}>
                Deixe vazio para usar o calculado
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SEÇÃO 2 — PLANEJAMENTO DA CORRIDA
      ═══════════════════════════════════════ */}
      <div style={CARD}>
        <SectionTitle color="#ff8c00">🏁 Planejamento da Corrida</SectionTitle>

        <div style={fieldRow}>
          <Field label="Número de voltas"     value={active.raceLaps}       onChange={updateField('raceLaps')}       unit="voltas" placeholder="20" COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
          <Field label="Margem de segurança"  value={active.safetyMargin}   onChange={updateField('safetyMargin')}   unit="%"      placeholder="5"  COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <CalcBox
            label="Consumo utilizado (L/volta)"
            value={perLapDisplay !== null ? perLapDisplay.toFixed(3) : null}
            unit="L"
            color={COLORS.textSecondary}
            COLORS={COLORS}
          />
          <CalcBox
            label={`Combustível necessário${active.safetyMargin ? ` (+${active.safetyMargin}% margem)` : ''}`}
            value={totalFuel !== null ? totalFuel.toFixed(2) : null}
            unit="L"
            color="#ff8c00"
            COLORS={COLORS}
            size="large"
          />
          <CalcBox
            label={`Peso do combustível (${density.toFixed(3)} kg/L)`}
            value={fuelW !== null ? fuelW.toFixed(2) : null}
            unit="kg"
            color="#ff8c00"
            COLORS={COLORS}
          />
        </div>

        {totalFuel !== null && (
          <div style={{
            marginTop: 12, background: `${COLORS.accent}0d`,
            border: `1px solid ${COLORS.accent}30`, borderRadius: 8, padding: '10px 14px',
            fontSize: 12, color: COLORS.textSecondary,
          }}>
            <span style={{ color: COLORS.accent, fontWeight: 700 }}>Resumo: </span>
            {parseFloat(active.raceLaps).toFixed(0)} voltas ×{' '}
            {perLapDisplay.toFixed(3)} L/volta
            {active.safetyMargin ? ` + ${active.safetyMargin}% margem` : ''}
            {' '}= <span style={{ color: '#ff8c00', fontWeight: 700 }}>{totalFuel.toFixed(2)} L</span>
            {fuelW !== null && <> &nbsp;({fuelW.toFixed(2)} kg)</>}
          </div>
        )}

        {/* ── Abastecimentos ── */}
        <div style={{ marginTop: 16, borderTop: `1px solid ${COLORS.border}33`, paddingTop: 14 }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, marginBottom: 10 }}>
            Planejamento de Abastecimento
          </div>
          {refills ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {/* Nº de abastecimentos */}
              <div style={{ flex: '1 1 140px', minWidth: 130 }}>
                <Label COLORS={COLORS}>Abastecimentos necessários</Label>
                <div style={{
                  background: COLORS.bg,
                  border: `2px solid ${COLORS.green}`,
                  borderRadius: 8, padding: '10px 14px',
                  fontSize: 26, fontWeight: 900, color: COLORS.green,
                  textAlign: 'center',
                }}>
                  {refills.fills}×
                </div>
              </div>
              {/* Combustível a carregar por vez */}
              <div style={{ flex: '1 1 140px', minWidth: 130 }}>
                <Label COLORS={COLORS}>Total a carregar</Label>
                <div style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, padding: '10px 14px',
                  fontSize: 18, fontWeight: 800, color: '#ff8c00',
                  textAlign: 'center',
                }}>
                  {refills.loaded} L
                </div>
              </div>
              {/* Sobra real */}
              <div style={{ flex: '1 1 140px', minWidth: 130 }}>
                <Label COLORS={COLORS}>Sobra real ao fim</Label>
                <div style={{
                  background: COLORS.bg,
                  border: `1px solid ${refills.actualSurpl >= 0 ? COLORS.green + '80' : '#ff4444'}`,
                  borderRadius: 8, padding: '10px 14px',
                  fontSize: 18, fontWeight: 800,
                  color: refills.actualSurpl >= 0 ? COLORS.green : '#ff4444',
                  textAlign: 'center',
                }}>
                  {refills.actualSurpl} L
                </div>
              </div>
              {/* Tempo de abastecimento (se pitFlowRate) */}
              {refills.refuelTimeFull !== null && (
                <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                  <Label COLORS={COLORS}>Tempo por abast. (tanque cheio)</Label>
                  <div style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8, padding: '10px 14px',
                    fontSize: 18, fontWeight: 800, color: COLORS.textSecondary,
                    textAlign: 'center',
                  }}>
                    {refills.refuelTimeFull} s
                  </div>
                </div>
              )}
              {/* Tempo por litro (para Estratégia calcular stints) */}
              {refills.refuelTimePerLiter !== null && (
                <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                  <Label COLORS={COLORS}>Tempo por litro</Label>
                  <div style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.cyan}60`,
                    borderRadius: 8, padding: '10px 14px',
                    fontSize: 18, fontWeight: 800, color: COLORS.cyan,
                    textAlign: 'center',
                  }}>
                    {refills.refuelTimePerLiter} s/L
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' }}>
              Preencha a <strong>capacidade do tanque</strong> (seção acima) e o combustível necessário para calcular os abastecimentos.
            </div>
          )}
          {refills && (
            <div style={{
              marginTop: 10, background: `${COLORS.green}0d`,
              border: `1px solid ${COLORS.green}30`, borderRadius: 8, padding: '8px 14px',
              fontSize: 12, color: COLORS.textSecondary,
            }}>
              <span style={{ color: COLORS.green, fontWeight: 700 }}>Abastecimento: </span>
              {refills.fills}× tanque (cap. {active.tankCapacity} L)
              {' '}→ carrega {refills.loaded} L total
              {' '}· sobra real {refills.actualSurpl} L
              {active.pitFlowRate && !isNaN(parseFloat(active.pitFlowRate)) && parseFloat(active.pitFlowRate) > 0 &&
                ` · ${(parseFloat(active.tankCapacity) / parseFloat(active.pitFlowRate)).toFixed(1)}s/abast.`}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SEÇÃO 3 — PESO TOTAL
      ═══════════════════════════════════════ */}
      <div style={CARD}>
        <SectionTitle color={COLORS.green}>⚖️ Peso Total do Carro</SectionTitle>

        <div style={fieldRow}>
          <Field label="Peso do carro (sem combustível)" value={active.carWeight}    onChange={updateField('carWeight')}    unit="kg" placeholder={xt.pesoCarro || '580'} COLORS={COLORS} INPUT_BASE={INPUT_BASE} half highlightColor={violaRegulamento ? '#ff4444' : undefined} />
          {/* ── Peso piloto com seletor ── */}
          <div style={{ flex: '1 1 140px', minWidth: 120 }}>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
              Peso do piloto (kg)
            </label>
            {assignedPilots.length > 0 && (
              <select
                value={selectedPilotId}
                onChange={(e) => {
                  selectPilot(e.target.value);
                  if (e.target.value) {
                    const p = assignedPilots.find(p => p.id === e.target.value);
                    if (p?.weightEquipped) updateField('driverWeight')(String(p.weightEquipped));
                  }
                }}
                style={{ ...INPUT_BASE, width: '100%', marginBottom: 4, cursor: 'pointer' }}
              >
                <option value="">— Selecionar piloto —</option>
                {assignedPilots.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name || 'Piloto sem nome'}{p.weightEquipped ? ` (${p.weightEquipped} kg)` : ''}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={active.driverWeight || ''}
              onChange={(e) => updateField('driverWeight')(e.target.value)}
              placeholder={xt.pesoPiloto || '72'}
              style={{ ...INPUT_BASE, width: '100%' }}
            />
          </div>
          <Field label="Peso mínimo regulamentar"         value={active.minWeight}    onChange={updateField('minWeight')}    unit="kg" placeholder={xt.pesoHomologado || '800'} COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
        </div>
        {(!active.carWeight && xt.pesoCarro) || (!active.driverWeight && xt.pesoPiloto) ? (
          <div style={{ fontSize: 10, color: COLORS.green, marginTop: 4, fontStyle: 'italic' }}>
            Dados disponíveis da tab Peso/Pilotos — valores usados automaticamente nos cálculos
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <CalcBox
            label="Carro + Piloto"
            value={(merged.carWeight && merged.driverWeight)
              ? (parseFloat(merged.carWeight) + parseFloat(merged.driverWeight)).toFixed(1)
              : null}
            unit="kg"
            color={COLORS.textSecondary}
            COLORS={COLORS}
          />
          <CalcBox
            label="Peso do combustível"
            value={fuelW !== null ? fuelW.toFixed(2) : null}
            unit="kg"
            color="#ff8c00"
            COLORS={COLORS}
          />
          <CalcBox
            label="Peso Total (com combustível)"
            value={totalW !== null ? totalW.toFixed(1) : null}
            unit="kg"
            color={COLORS.green}
            COLORS={COLORS}
            size="large"
          />
          <div style={{ flex: '1 1 160px', minWidth: 150 }}>
            <Label COLORS={COLORS}>Margem vs. Mínimo Reg.</Label>
            <div style={{
              background: COLORS.bg,
              border: `1px solid ${margin !== null ? marginColor : COLORS.border}`,
              borderRadius: 6, padding: '8px 12px', fontSize: 16, fontWeight: 800,
              color: margin !== null ? marginColor : COLORS.textMuted,
              textAlign: 'center', minHeight: 38,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {margin !== null
                ? `${margin >= 0 ? '+' : ''}${margin.toFixed(1)} kg`
                : '—'}
            </div>
            {margin !== null && (
              <div style={{ fontSize: 10, color: marginColor, marginTop: 4, textAlign: 'center' }}>
                {margin >= 0 ? '✓ Acima do mínimo' : '⚠ Abaixo do mínimo!'}
              </div>
            )}
          </div>
        </div>

        {/* Barra visual de peso */}
        {totalW !== null && active.minWeight && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${COLORS.border}33`, paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>
              Composição do peso total
            </div>
            {[
              { label: 'Carro', val: parseFloat(active.carWeight), color: COLORS.accent },
              { label: 'Piloto', val: parseFloat(active.driverWeight), color: COLORS.purple || '#9b59b6' },
              { label: 'Combustível', val: fuelW, color: '#ff8c00' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 80, fontSize: 11, color: COLORS.textMuted, textAlign: 'right' }}>
                  {item.label}
                </div>
                <div style={{ flex: 1, background: `${COLORS.border}33`, borderRadius: 4, height: 10, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    background: item.color,
                    width: `${Math.min(100, (item.val / totalW) * 100)}%`,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <div style={{ width: 60, fontSize: 11, color: COLORS.textSecondary, fontWeight: 700 }}>
                  {item.val.toFixed(1)} kg
                </div>
                <div style={{ width: 40, fontSize: 11, color: COLORS.textMuted }}>
                  {((item.val / totalW) * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════
          SEÇÃO 4 — POSIÇÃO DO TANQUE / CG
      ═══════════════════════════════════════ */}
      <div style={CARD}>
        <SectionTitle color={COLORS.yellow || '#f1c40f'}>📍 Posição do Tanque — Impacto no CG</SectionTitle>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12, fontFamily: 'monospace', background: COLORS.bg, padding: '6px 10px', borderRadius: 6 }}>
          CG_x(comb) = (M_carro·CG_carro + m_comb·X_tanque) / (M_carro + m_comb) &nbsp;·&nbsp; %Diant = CG_x / distância_entre_eixos
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <Field label="Distância entre eixos" value={active.wheelbaseLen} onChange={updateField('wheelbaseLen')} unit="mm" placeholder={xt.wheelbase || '2800'} COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
          <Field label="CG carro s/ comb. (da frente)" value={active.cgCarX} onChange={updateField('cgCarX')} unit="mm" placeholder="1400" COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
          <Field label="Posição do tanque (da frente)" value={active.tankPosX} onChange={updateField('tankPosX')} unit="mm" placeholder="1200" COLORS={COLORS} INPUT_BASE={INPUT_BASE} half />
        </div>
        {cgShift ? (
          <div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ flex: '1 1 150px', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>CG início (tanque cheio)</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>{cgShift.cgStart} mm</div>
                <div style={{ fontSize: 11, color: COLORS.yellow || '#f1c40f', marginTop: 2 }}>{cgShift.frontStart}% dianteiro</div>
              </div>
              <div style={{ flex: '1 1 150px', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>CG fim {cgShift.margin > 0 ? `(~${cgShift.fuelEnd} L restantes)` : '(sem margem)'}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>{cgShift.cgEnd} mm</div>
                <div style={{ fontSize: 11, color: COLORS.yellow || '#f1c40f', marginTop: 2 }}>{cgShift.frontEnd}% dianteiro</div>
              </div>
              <div style={{ flex: '1 1 150px', background: COLORS.bg, border: `1px solid ${Math.abs(cgShift.shift) > 20 ? '#ff4444' : COLORS.green + '80'}`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>Deslocamento do CG</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: Math.abs(cgShift.shift) > 20 ? '#ff4444' : COLORS.green }}>
                  {cgShift.shift >= 0 ? '+' : ''}{cgShift.shift} mm
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  {cgShift.shift > 0 ? '→ CG migra p/ trás' : cgShift.shift < 0 ? '→ CG migra p/ frente' : '→ Sem deslocamento'}
                </div>
              </div>
              <div style={{ flex: '1 1 150px', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>Δ Distribuição dianteiro</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: Math.abs(cgShift.frontEnd - cgShift.frontStart) > 1 ? '#ff8c00' : COLORS.green }}>
                  {(cgShift.frontEnd - cgShift.frontStart) >= 0 ? '+' : ''}{(cgShift.frontEnd - cgShift.frontStart).toFixed(1)}%
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  {cgShift.frontStart}% → {cgShift.frontEnd}%
                </div>
              </div>
            </div>
            {/* Barra visual de evolução do CG */}
            <div style={{ background: COLORS.bg, borderRadius: 8, padding: '10px 14px', border: `1px solid ${COLORS.border}33` }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>Distribuição dianteiro/traseiro ao longo da corrida</div>
              {[
                { label: 'Início', front: cgShift.frontStart },
                { label: 'Fim',    front: cgShift.frontEnd   },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 40, fontSize: 11, color: COLORS.textMuted }}>{item.label}</div>
                  <div style={{ flex: 1, background: `${COLORS.border}33`, borderRadius: 4, height: 12, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: COLORS.yellow || '#f1c40f', width: `${Math.min(100, item.front)}%`, transition: 'width 0.3s' }} />
                    <div style={{ position: 'absolute', top: 0, left: '50%', height: '100%', width: 1, background: COLORS.textMuted + '80' }} />
                  </div>
                  <div style={{ width: 80, fontSize: 11, color: COLORS.textSecondary, fontWeight: 700 }}>
                    {item.front}% / {(100 - item.front).toFixed(1)}%
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, textAlign: 'center' }}>
                ← Dianteiro &nbsp;|&nbsp; 50% &nbsp;|&nbsp; Traseiro →
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' }}>
            Preencha distância entre eixos, CG do carro e posição do tanque para calcular o deslocamento do CG durante a corrida.
          </div>
        )}
      </div>

      {/* ── Notas ── */}
      <div style={CARD}>
        <SectionTitle color={COLORS.textMuted}>📝 Notas do Cenário</SectionTitle>
        <textarea
          value={active.notes || ''}
          onChange={(e) => updateField('notes')(e.target.value)}
          rows={3}
          placeholder="Observações sobre este cenário (condições da pista, estratégia, etc.)"
          style={{
            ...INPUT_BASE, width: '100%', resize: 'vertical',
            fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
      </div>

      {/* ═══════════════════════════════════════
          SALVAR NO PERFIL
      ═══════════════════════════════════════ */}
      <div style={{
        background: `${COLORS.purple}0a`,
        border: `1px solid ${COLORS.purple}30`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.purple, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
          💾 Salvar Calculadora no Perfil
        </div>

        {profileFuelCalcs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setShowFuelSaved((v) => !v)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', background: showFuelSaved ? `${COLORS.purple}20` : 'transparent',
                border: `1px solid ${showFuelSaved ? COLORS.purple : COLORS.border}`,
                color: showFuelSaved ? COLORS.purple : COLORS.textMuted,
                marginBottom: showFuelSaved ? 8 : 0,
              }}
            >
              📂 Configurações Salvas ({profileFuelCalcs.length})
            </button>
            {showFuelSaved && (
              <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden' }}>
                {profileFuelCalcs.map((fc, idx) => (
                  <div key={fc.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '9px 12px',
                    background: idx % 2 === 0 ? 'transparent' : `${COLORS.bgCard}50`,
                    borderBottom: idx < profileFuelCalcs.length - 1 ? `1px solid ${COLORS.border}22` : 'none',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{fc.name}</div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                        📅 {new Date(fc.savedAt).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { onLoadFuelCalc?.(fc.id); setShowFuelSaved(false); }}
                        style={{ padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
                      >
                        Carregar
                      </button>
                      <button
                        onClick={() => onDeleteFuelCalc?.(fc.id)}
                        style={{ padding: '4px 11px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'transparent', border: `1px solid ${COLORS.accent}`, color: COLORS.accent }}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 180px' }}>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Nome da configuração</label>
            <input
              type="text" value={fuelSaveName}
              onChange={(e) => { setFuelSaveName(e.target.value); setFuelSaveMsg(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveFuelCalcToProfile()}
              placeholder="Ex: Corrida 10 voltas — 45L"
              style={{ ...INPUT_BASE, width: '100%' }}
            />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Perfil de destino</label>
            <select
              value={fuelSaveTarget || activeProfileId || ''}
              onChange={(e) => { setFuelSaveTarget(e.target.value); setFuelSaveMsg(null); }}
              style={{ ...INPUT_BASE, width: '100%', cursor: 'pointer' }}
            >
              <option value="">— Selecionar —</option>
              {profilesList.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {(profileGroups || []).length > 0 && (
            <div style={{ flex: '1 1 140px' }}>
              <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Pasta (opcional)</label>
              <select
                value={fuelGroupId || ''}
                onChange={(e) => { setFuelGroupId(e.target.value); setFuelSaveMsg(null); }}
                style={{ ...INPUT_BASE, width: '100%', cursor: 'pointer' }}
              >
                <option value="">— Sem pasta —</option>
                {(profileGroups || []).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={handleSaveFuelCalcToProfile}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: COLORS.purple, color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Salvar
          </button>
        </div>
        {fuelSaveMsg && (
          <div style={{ marginTop: 8, fontSize: 12, color: fuelSaveMsg.ok ? COLORS.green : COLORS.accent }}>
            {fuelSaveMsg.ok ? '✓ ' : '✗ '}{fuelSaveMsg.text}
          </div>
        )}
      </div>

      {/* ── Rodapé info ── */}
      <div style={{ fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 }}>
        {fuelTypeInfo.label} · {density.toFixed(3)} kg/L{fuelEnergy ? ` · ${fuelEnergy} MJ/L` : ''}
        &nbsp;·&nbsp; Dados salvos automaticamente por perfil
      </div>
      <PrintFooter />
    </div>
  );
}
