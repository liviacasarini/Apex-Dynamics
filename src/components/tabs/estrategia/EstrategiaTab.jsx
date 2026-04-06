/**
 * EstrategiaTab — Estratégia de Corrida
 *
 * Funcionalidades:
 *  1. Parâmetros da corrida (voltas, tempo base, pit delta, etc.)
 *  2. Planejamento de stints (compostos, voltas, degradação)
 *  3. Simulação lap-by-lap com gráfico (tempo + peso)
 *  4. Análise de undercut / overcut
 *  5. Cenário Safety Car / VSC
 *
 * Importa dados de: CombustivelTab, PesoTab, PneusTab
 * Persistência: localStorage — chave rt_strategy_<profileId>
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { useColors } from '@/context/ThemeContext';
import { readTrackCustom, readPilots, readActiveTrack, TRACK_SELECTED_EVENT } from '@/core/crossTabSync';
import { makeTheme } from '@/styles/theme';
import { PrintFooter } from '@/components/common';

/* ─── constantes ─────────────────────────────────────────────────── */

const EMPTY = {
  // Race params
  raceLaps: '',
  pitStopTime: '',       // seconds stationary
  pitLaneDelta: '',      // seconds total pit delta
  baselapTime: '',       // seconds clean lap
  pitSpeedLimit: '',     // km/h
  safetyCarProb: '',     // %
  vscDelta: '',          // seconds
  trafficLoss: '',       // s/volta
  fuelTimePerKg: '',     // s/kg per lap

  // Stints (array)
  stints: [
    { id: 1, compound: '', laps: '', degradation: '', driver: '' },
  ],

  // Undercut/overcut
  rivalPitLap: '',

  // SC scenario
  scLap: '',
};

/* ─── piloto helpers ─────────────────────────────────────────────── */

function loadPilots() {
  try {
    const raw = window.localStorage?.getItem('rt_pilots');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

const COMPOUND_LABEL = {
  'slick-ultra': 'Ultra-macio',
  'slick-soft': 'Macio',
  'slick-medium': 'Médio',
  'slick-hard': 'Duro',
  'intermediario': 'Intermediário',
  'chuva-extrema': 'Chuva',
  'semi_slick': 'Semi-Slick',
  'radial': 'Radial',
};

/* ─── helpers ────────────────────────────────────────────────────── */

const pf = (v) => parseFloat(v) || 0;

const formatTime = (totalSeconds) => {
  if (!totalSeconds || !isFinite(totalSeconds)) return '—';
  const mins = Math.floor(totalSeconds / 60);
  const secs = (totalSeconds % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
};

/* ─── sub-components ─────────────────────────────────────────────── */

function Field({ label, children, unit, C, half }) {
  return (
    <div style={{ flex: half ? '1 1 48%' : '1 1 100%', minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: 11, color: C.textMuted, marginBottom: 3 }}>
        {label}{unit ? ` (${unit})` : ''}
      </label>
      {children}
    </div>
  );
}

const Row = ({ children }) => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>{children}</div>
);

/* ─── componente principal ───────────────────────────────────────── */

export default function EstrategiaTab({ activeProfile }) {
  const C = useColors();
  const theme = makeTheme(C);
  const IB = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.textPrimary,
    fontSize: 13,
    padding: '8px 12px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const profileId = activeProfile?.id || 'default';
  const STINT_COLORS = [C.accent, C.cyan, C.green, C.yellow, C.purple, '#ff6b6b'];
  const pilots = useMemo(() => loadPilots(), []);

  /* ── state & persistence ─────────────────────────────────────── */

  const [d, setD] = useState(EMPTY);

  const key = `rt_strategy_${profileId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved) setD({ ...EMPTY, ...saved });
      else setD(EMPTY);
    } catch { setD(EMPTY); }
  }, [key]);

  const persist = useCallback((next) => {
    setD(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, [key]);

  const set = (field) => (val) =>
    persist({ ...d, [field]: typeof val === 'object' && val?.target ? val.target.value : val });

  /* ── imported data ───────────────────────────────────────────── */

  const importedFuel = useMemo(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`rt_fuel_${profileId}`) || '[]');
      return s[0] || {};
    } catch { return {}; }
  }, [profileId]);

  const importedWeight = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(`rt_peso_${profileId}`) || 'null') || {};
    } catch { return {}; }
  }, [profileId]);

  const importedCompounds = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('rt_tyre_library') || '[]');
    } catch { return []; }
  }, [profileId]);

  // Cross-tab: pista ativa e pilotos
  const importedTracks = useMemo(() => readTrackCustom(profileId), [profileId]);
  const importedPilots = useMemo(() => readPilots(), []);

  /* ── sync: pista ativa → pitSpeedLimit (auto-preenche se vazio) ── */
  const applyActiveTrack = useCallback((trackData) => {
    if (!trackData?.pitSpeedLimit) return;
    setD(prev => {
      if (prev.pitSpeedLimit) return prev; // não sobrescreve se já preenchido
      const next = { ...prev, pitSpeedLimit: String(trackData.pitSpeedLimit) };
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);

  useEffect(() => {
    const active = readActiveTrack(profileId);
    if (active) applyActiveTrack(active);
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => applyActiveTrack(e.detail);
    window.addEventListener(TRACK_SELECTED_EVENT, handler);
    return () => window.removeEventListener(TRACK_SELECTED_EVENT, handler);
  }, [applyActiveTrack]);

  /* ── stint management ────────────────────────────────────────── */

  const addStint = () => {
    const newId = Math.max(0, ...d.stints.map(s => s.id)) + 1;
    persist({ ...d, stints: [...d.stints, { id: newId, compound: '', laps: '', degradation: '', driver: '' }] });
  };

  const removeStint = (id) => {
    if (d.stints.length <= 1) return;
    persist({ ...d, stints: d.stints.filter(s => s.id !== id) });
  };

  const updateStint = (id, field, val) => {
    persist({ ...d, stints: d.stints.map(s => s.id === id ? { ...s, [field]: val } : s) });
  };

  const totalStintLaps = d.stints.reduce((acc, s) => acc + (parseInt(s.laps) || 0), 0);

  /* ── race simulation ─────────────────────────────────────────── */

  /* ── helper: retorna multiplicadores do piloto de um stint ─── */
  const getPilotMultipliers = useCallback((pilotId) => {
    if (!pilotId) return { fuelMult: 1, tireMult: 1, fadigaDeg: 0, stintMaxMin: Infinity };
    const pilot = importedPilots.find(p => p.id === pilotId);
    return {
      fuelMult:    pf(pilot?.fuelConsMultiplier)  || 1,
      tireMult:    pf(pilot?.tireWearMultiplier)  || 1,
      fadigaDeg:   pf(pilot?.fadigaDegradacao)    || 0,
      stintMaxMin: pf(pilot?.stintMaxMinutos)     || Infinity,
    };
  }, [importedPilots]);

  /* ── race simulation ─────────────────────────────────────────── */

  const raceSimulation = useMemo(() => {
    const base = pf(d.baselapTime);
    const pitDelta = pf(d.pitLaneDelta);
    const baseFuelPerLap = pf(importedFuel.fuelConsumption) || pf(importedFuel.consumoUtilizado);
    const density = pf(importedFuel.fuelDensity) || 0.74;
    const carW = pf(importedWeight.pesoCarro) || 0;
    const driverW = pf(importedWeight.pesoPiloto) || 0;
    const fuelTimeKg = pf(d.fuelTimePerKg);
    const totalLaps = pf(d.raceLaps);

    if (!base || !totalLaps || d.stints.every(s => !s.laps)) return [];

    const result = [];
    let cumTime = 0;
    let globalLap = 0;
    const totalFuel = baseFuelPerLap * totalLaps;

    d.stints.forEach((stint, si) => {
      const laps = parseInt(stint.laps) || 0;
      const baseDeg = pf(stint.degradation);
      const { fuelMult, tireMult, fadigaDeg } = getPilotMultipliers(stint.driver);
      const fuelPerLap = baseFuelPerLap * fuelMult;
      const deg = baseDeg * tireMult;

      for (let i = 0; i < laps && globalLap < totalLaps; i++) {
        globalLap++;
        const fuelBurned = fuelPerLap * globalLap;
        const fuelRemaining = Math.max(0, totalFuel - fuelBurned);
        const fuelWeight = fuelRemaining * density;
        const totalWeight = carW + driverW + fuelWeight;

        // Lap time = base + tire degradation + fadiga - fuel weight benefit
        const stintMinutes = (i * pf(d.baselapTime)) / 60;
        const fadigaExtra = fadigaDeg > 0 ? fadigaDeg * Math.floor(stintMinutes / 10) : 0;
        const lapTime = base + (deg * i) + fadigaExtra - (fuelTimeKg * fuelBurned * density);

        cumTime += lapTime;
        result.push({
          lap: globalLap,
          time: Math.max(lapTime, base * 0.95), // floor at 95% of base
          stint: si + 1,
          compound: stint.compound,
          weightKg: Math.round(totalWeight * 10) / 10,
          cumTime,
          fuelKg: Math.round(fuelWeight * 10) / 10,
        });
      }

      // Add pit delta between stints
      if (si < d.stints.length - 1 && globalLap < totalLaps) {
        cumTime += pitDelta;
      }
    });

    return result;
  }, [d, importedFuel, importedWeight, getPilotMultipliers]);

  /* ── derived values ──────────────────────────────────────────── */

  const totalRaceTime = raceSimulation.length > 0
    ? raceSimulation[raceSimulation.length - 1].cumTime + (d.stints.length - 1) * pf(d.pitLaneDelta)
    : 0;

  const fastestLap = raceSimulation.length > 0
    ? Math.min(...raceSimulation.map(r => r.time))
    : 0;

  const slowestLap = raceSimulation.length > 0
    ? Math.max(...raceSimulation.map(r => r.time))
    : 0;

  const pitLaps = d.stints.reduce((acc, s, i) => {
    if (i === 0) return [parseInt(s.laps) || 0];
    return [...acc, (acc[acc.length - 1] || 0) + (parseInt(s.laps) || 0)];
  }, []).slice(0, -1);

  /* ── undercut / overcut ──────────────────────────────────────── */

  const undercutResult = useMemo(() => {
    const rivalLap = pf(d.rivalPitLap);
    const base = pf(d.baselapTime);
    const pitDelta = pf(d.pitLaneDelta);
    if (!rivalLap || !base || !pitDelta) return null;

    // Find which stint the rival is in
    let currentStint = d.stints[0];
    let lapInStint = rivalLap;
    let acc = 0;
    for (const s of d.stints) {
      const sl = parseInt(s.laps) || 0;
      if (acc + sl >= rivalLap) { currentStint = s; lapInStint = rivalLap - acc; break; }
      acc += sl;
    }
    const deg = pf(currentStint?.degradation) || 0.05;
    const nextStint = d.stints[d.stints.indexOf(currentStint) + 1] || d.stints[0];
    const freshDeg = pf(nextStint?.degradation) || 0.03;

    // Undercut: you pit on rivalLap - 1
    const yourUndercut = pitDelta + (base + freshDeg * 0) + (base + freshDeg * 1);
    const rivalNoPit = (base + deg * (lapInStint - 1)) + (base + deg * lapInStint) + pitDelta + (base + freshDeg * 0);
    const undercutGain = rivalNoPit - yourUndercut;

    // Overcut: you pit on rivalLap + 1
    const yourOvercut = (base + deg * lapInStint) + (base + deg * (lapInStint + 1)) + pitDelta + (base + freshDeg * 0);
    const rivalPitted = pitDelta + (base + freshDeg * 0) + (base + freshDeg * 1) + (base + freshDeg * 2);
    const overcutGain = rivalPitted - yourOvercut;

    return { undercutGain, overcutGain };
  }, [d]);

  /* ── safety car analysis ─────────────────────────────────────── */

  const scAnalysis = useMemo(() => {
    const scLap = pf(d.scLap);
    const pitDelta = pf(d.pitLaneDelta);
    if (!scLap || !pitDelta) return null;

    const scPitDelta = pitDelta * 0.4; // SC reduces pit delta by ~60%
    const saving = pitDelta - scPitDelta;

    // Should pit? Check if we're mid-stint and have enough remaining laps
    let currentStintEnd = 0;
    let shouldPit = false;
    for (const s of d.stints) {
      currentStintEnd += parseInt(s.laps) || 0;
      if (scLap <= currentStintEnd) {
        const remaining = currentStintEnd - scLap;
        shouldPit = remaining > 3;
        break;
      }
    }

    return { saving, shouldPit, scPitDelta };
  }, [d]);

  /* ── render ──────────────────────────────────────────────────── */

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ fontSize: 20, fontWeight: 800, color: C.textPrimary }}>
        {'\u{1F3C1}'} Estratégia de Corrida
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2, marginBottom: 20 }}>
        Simulação de stints, pit windows, undercut/overcut e cenários de Safety Car
      </div>

      {/* Box 1 — Parâmetros da Corrida */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>{'\u{1F4CB}'} Parâmetros da Corrida</div>
        {/* Imported data summary */}
        {importedFuel.fuelConsumption && (
          <div style={{
            marginBottom: 12, padding: '6px 10px',
            background: `${C.cyan}10`, border: `1px solid ${C.cyan}30`,
            borderRadius: 6, fontSize: 11, color: C.cyan,
          }}>
            Dados importados: Consumo {importedFuel.fuelConsumption} L/volta · Tanque {importedFuel.tankCapacity} L
            {importedWeight.pesoCarro && ` · Carro ${importedWeight.pesoCarro} kg`}
          </div>
        )}
        {/* Pilot multipliers notice */}
        {d.stints.some(s => s.driver) && (() => {
          const notices = [];
          d.stints.forEach(s => {
            if (!s.driver) return;
            const { fuelMult, tireMult, fadigaDeg } = getPilotMultipliers(s.driver);
            const pilot = importedPilots.find(p => p.id === s.driver);
            if (!pilot) return;
            const parts = [];
            if (fuelMult !== 1) parts.push(`consumo ×${fuelMult}`);
            if (tireMult !== 1) parts.push(`desgaste ×${tireMult}`);
            if (fadigaDeg > 0) parts.push(`fadiga +${fadigaDeg}s/10min`);
            if (parts.length) notices.push(`${pilot.name}: ${parts.join(' · ')}`);
          });
          if (!notices.length) return null;
          return (
            <div style={{
              marginBottom: 12, padding: '6px 10px',
              background: `${C.yellow}10`, border: `1px solid ${C.yellow}30`,
              borderRadius: 6, fontSize: 11, color: C.yellow,
            }}>
              Multiplicadores de piloto ativos — {notices.join(' | ')}
            </div>
          );
        })()}
        <Row>
          <Field label="Total de voltas" C={C} half>
            <input type="number" value={d.raceLaps} onChange={set('raceLaps')} placeholder="Ex: 30" style={IB} />
          </Field>
          <Field label="Tempo base da volta" unit="s" C={C} half>
            <input type="number" step="0.001" value={d.baselapTime} onChange={set('baselapTime')} placeholder="Ex: 78.500" style={IB} />
          </Field>
        </Row>
        <Row>
          <Field label="Tempo parado no pit" unit="s" C={C} half>
            <input type="number" step="0.1" value={d.pitStopTime} onChange={set('pitStopTime')} placeholder="Ex: 2.5" style={IB} />
          </Field>
          <Field label="Pit lane delta total" unit="s" C={C} half>
            <input type="number" step="0.1" value={d.pitLaneDelta} onChange={set('pitLaneDelta')} placeholder="Ex: 22" style={IB} />
          </Field>
        </Row>
        <Row>
          <Field label="Velocidade pit lane" unit="km/h" C={C} half>
            <input type="number" value={d.pitSpeedLimit} onChange={set('pitSpeedLimit')}
              placeholder={(() => { const at = readActiveTrack(profileId); return at?.pitSpeedLimit ? `${at.pitSpeedLimit} (Pistas)` : 'Ex: 60'; })()}
              style={IB} />
          </Field>
          <Field label="Tempo por kg de combustível" unit="s/kg/volta" C={C} half>
            <input type="number" step="0.001" value={d.fuelTimePerKg} onChange={set('fuelTimePerKg')} placeholder="Ex: 0.035" style={IB} />
          </Field>
        </Row>
        <Row>
          <Field label="Perda por tráfego" unit="s/volta" C={C} half>
            <input type="number" step="0.1" value={d.trafficLoss} onChange={set('trafficLoss')} placeholder="Ex: 0.5" style={IB} />
          </Field>
        </Row>
      </div>

      {/* Box 2 — Planejamento de Stints */}
      <div style={theme.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={theme.cardTitle}>{'\u{1F504}'} Planejamento de Stints</div>
          <button
            onClick={addStint}
            style={{ ...IB, cursor: 'pointer', padding: '6px 12px', fontSize: 12, fontWeight: 600, color: C.accent, borderColor: C.accent }}
          >
            + Stint
          </button>
        </div>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '40px 1fr 1fr 100px 120px 40px',
          gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>#</span>
          <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>PILOTO</span>
          <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>COMPOSTO</span>
          <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>VOLTAS</span>
          <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>DEGRADAÇÃO (s/v)</span>
          <span></span>
        </div>
        {/* Stint rows */}
        {d.stints.map((s, i) => {
          const prevDriver = i > 0 ? d.stints[i - 1].driver : null;
          const driverChanged = prevDriver && s.driver && prevDriver !== s.driver;
          return (
          <div key={s.id}>
            {driverChanged && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                margin: '2px 0',
              }}>
                <div style={{ flex: 1, height: 1, background: C.yellow }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: C.yellow, whiteSpace: 'nowrap' }}>
                  TROCA DE PILOTO
                </span>
                <div style={{ flex: 1, height: 1, background: C.yellow }} />
              </div>
            )}
            <div style={{
              display: 'grid', gridTemplateColumns: '40px 1fr 1fr 100px 120px 40px',
              gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}22`,
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: STINT_COLORS[i % STINT_COLORS.length] }}>{i + 1}</span>
              <select
                value={s.driver || ''}
                onChange={e => updateStint(s.id, 'driver', e.target.value)}
                style={{ ...IB, cursor: 'pointer' }}
              >
                <option value="">— Piloto —</option>
                {pilots.map(p => (
                  <option key={p.id} value={p.id}>{p.name || `Piloto ${p.id}`}</option>
                ))}
              </select>
              <select
                value={s.compound}
                onChange={e => updateStint(s.id, 'compound', e.target.value)}
                style={{ ...IB, cursor: 'pointer' }}
              >
                <option value="">— Composto —</option>
                {importedCompounds.filter(c => c.composto).map(c => (
                  <option key={c.id} value={c.composto}>
                    {COMPOUND_LABEL[c.composto] || c.composto}{c.fabricante ? ` (${c.fabricante})` : ''}
                  </option>
                ))}
                {importedCompounds.length === 0 && Object.entries(COMPOUND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input
                type="number" value={s.laps}
                onChange={e => updateStint(s.id, 'laps', e.target.value)}
                placeholder="Voltas" style={{ ...IB, textAlign: 'center' }}
              />
              <input
                type="number" step="0.01" value={s.degradation}
                onChange={e => updateStint(s.id, 'degradation', e.target.value)}
                placeholder="Ex: 0.05" style={{ ...IB, textAlign: 'center' }}
              />
              {d.stints.length > 1 && (
                <button
                  onClick={() => removeStint(s.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 14 }}
                >
                  {'\u2715'}
                </button>
              )}
            </div>
          </div>
          );
        })}
        {/* Stint summary */}
        {totalStintLaps > 0 && (
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: totalStintLaps === pf(d.raceLaps) ? `${C.green}10` : `${C.yellow}15`,
            border: `1px solid ${totalStintLaps === pf(d.raceLaps) ? C.green : C.yellow}30`,
            borderRadius: 6, fontSize: 12,
          }}>
            <span style={{ color: C.textMuted }}>Total: </span>
            <strong style={{ color: totalStintLaps === pf(d.raceLaps) ? C.green : C.yellow }}>
              {totalStintLaps} voltas
            </strong>
            <span style={{ color: C.textMuted }}> / {d.raceLaps || '?'} voltas da corrida</span>
            {totalStintLaps !== pf(d.raceLaps) && d.raceLaps && (
              <span style={{ color: C.yellow, marginLeft: 8 }}>
                ({totalStintLaps < pf(d.raceLaps)
                  ? `faltam ${pf(d.raceLaps) - totalStintLaps}`
                  : `${totalStintLaps - pf(d.raceLaps)} a mais`})
              </span>
            )}
            {d.stints.length > 1 && (
              <span style={{ color: C.textMuted, marginLeft: 12 }}>{d.stints.length - 1} pit stop(s)</span>
            )}
            {(() => {
              const driverIds = [...new Set(d.stints.map(s => s.driver).filter(Boolean))];
              const driverChanges = d.stints.filter((s, i) => i > 0 && s.driver && d.stints[i - 1].driver && s.driver !== d.stints[i - 1].driver).length;
              if (driverIds.length > 1) return (
                <span style={{ color: C.cyan, marginLeft: 12 }}>
                  {driverIds.length} pilotos · {driverChanges} troca(s)
                </span>
              );
              return null;
            })()}
          </div>
        )}
      </div>

      {/* Box 3 — Simulação (gráfico) */}
      {raceSimulation.length > 0 && (
        <div style={theme.card}>
          <div style={theme.cardTitle}>{'\u{1F4CA}'} Simulação Lap-by-Lap</div>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{
              padding: '10px 16px', background: `${C.accent}10`,
              border: `1px solid ${C.accent}30`, borderRadius: 8, textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: C.textMuted }}>Tempo total</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.accent }}>{formatTime(totalRaceTime)}</div>
            </div>
            <div style={{
              padding: '10px 16px', background: `${C.cyan}10`,
              border: `1px solid ${C.cyan}30`, borderRadius: 8, textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: C.textMuted }}>Volta mais rápida</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.cyan }}>{fastestLap.toFixed(3)}s</div>
            </div>
            <div style={{
              padding: '10px 16px', background: `${C.green}10`,
              border: `1px solid ${C.green}30`, borderRadius: 8, textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: C.textMuted }}>Volta mais lenta</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{slowestLap.toFixed(3)}s</div>
            </div>
            <div style={{
              padding: '10px 16px', background: `${C.purple}10`,
              border: `1px solid ${C.purple}30`, borderRadius: 8, textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: C.textMuted }}>Peso final</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.purple }}>
                {raceSimulation[raceSimulation.length - 1]?.weightKg?.toFixed(1) || '—'} kg
              </div>
            </div>
          </div>
          {/* Chart */}
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={raceSimulation} margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="lap"
                tick={{ fontSize: 10, fill: C.textMuted }}
                label={{ value: 'Volta', position: 'insideBottom', offset: -2, fontSize: 10, fill: C.textMuted }}
              />
              <YAxis
                yAxisId="time"
                tick={{ fontSize: 10, fill: C.textMuted }}
                domain={['auto', 'auto']}
                label={{ value: 'Tempo (s)', angle: -90, position: 'insideLeft', fontSize: 10, fill: C.textMuted }}
              />
              <YAxis
                yAxisId="weight" orientation="right"
                tick={{ fontSize: 10, fill: C.textMuted }}
                domain={['auto', 'auto']}
                label={{ value: 'Peso (kg)', angle: 90, position: 'insideRight', fontSize: 10, fill: C.textMuted }}
              />
              <Tooltip
                contentStyle={{ background: C.bgCard, border: `1px solid ${C.border}`, fontSize: 11 }}
                formatter={(v, name) => [typeof v === 'number' ? v.toFixed(3) : v, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                yAxisId="time" type="monotone" dataKey="time"
                stroke={C.accent} dot={false} strokeWidth={2} name="Tempo de volta (s)"
              />
              <Line
                yAxisId="weight" type="monotone" dataKey="weightKg"
                stroke={C.purple} dot={false} strokeWidth={1} strokeDasharray="4 2" name="Peso (kg)"
              />
              {/* Pit stop reference lines */}
              {pitLaps.map((pl, i) => (
                <ReferenceLine
                  key={i} yAxisId="time" x={pl}
                  stroke={C.yellow} strokeDasharray="3 3"
                  label={{ value: 'PIT', fontSize: 9, fill: C.yellow, position: 'top' }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Box 4 — Undercut / Overcut */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>{'\u2694\uFE0F'} Undercut / Overcut</div>
        <Row>
          <Field label="Volta que o rival para" C={C} half>
            <input type="number" value={d.rivalPitLap} onChange={set('rivalPitLap')} placeholder="Ex: 15" style={IB} />
          </Field>
        </Row>
        {undercutResult && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
            <div style={{
              flex: '1 1 45%', padding: '12px 16px',
              background: `${undercutResult.undercutGain > 0 ? C.green : C.accent}10`,
              border: `1px solid ${undercutResult.undercutGain > 0 ? C.green : C.accent}30`,
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>
                Undercut (parar 1 volta antes)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: undercutResult.undercutGain > 0 ? C.green : C.accent }}>
                {undercutResult.undercutGain > 0 ? '+' : ''}{undercutResult.undercutGain.toFixed(3)}s
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                {undercutResult.undercutGain > 0.5
                  ? '\u2705 Undercut forte'
                  : undercutResult.undercutGain > 0
                    ? '\u26A0\uFE0F Undercut marginal'
                    : '\u274C Undercut não funciona'}
              </div>
            </div>
            <div style={{
              flex: '1 1 45%', padding: '12px 16px',
              background: `${undercutResult.overcutGain > 0 ? C.green : C.accent}10`,
              border: `1px solid ${undercutResult.overcutGain > 0 ? C.green : C.accent}30`,
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>
                Overcut (parar 1 volta depois)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: undercutResult.overcutGain > 0 ? C.green : C.accent }}>
                {undercutResult.overcutGain > 0 ? '+' : ''}{undercutResult.overcutGain.toFixed(3)}s
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                {undercutResult.overcutGain > 0.5
                  ? '\u2705 Overcut forte'
                  : undercutResult.overcutGain > 0
                    ? '\u26A0\uFE0F Overcut marginal'
                    : '\u274C Overcut não funciona'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Box 5 — Cenário Safety Car */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>{'\u{1F697}'} Cenário Safety Car / VSC</div>
        <Row>
          <Field label="Probabilidade de SC" unit="%" C={C} half>
            <input type="number" value={d.safetyCarProb} onChange={set('safetyCarProb')} placeholder="Ex: 40" style={IB} />
          </Field>
          <Field label="VSC delta mínimo" unit="s" C={C} half>
            <input type="number" step="0.1" value={d.vscDelta} onChange={set('vscDelta')} placeholder="Ex: 10" style={IB} />
          </Field>
        </Row>
        <Row>
          <Field label="SC aparece na volta" C={C} half>
            <input type="number" value={d.scLap} onChange={set('scLap')} placeholder="Ex: 12" style={IB} />
          </Field>
        </Row>
        {scAnalysis && (
          <div style={{
            marginTop: 10, padding: '12px 16px',
            background: `${C.yellow}10`, border: `1px solid ${C.yellow}30`, borderRadius: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow, marginBottom: 6 }}>
              Análise SC na volta {d.scLap}
            </div>
            <div style={{ fontSize: 13, color: C.textPrimary }}>
              Economia ao parar sob SC: <strong style={{ color: C.green }}>{scAnalysis.saving.toFixed(1)}s</strong> vs. pit em condição normal
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              {scAnalysis.shouldPit
                ? '\u2705 Recomendação: PARAR sob Safety Car'
                : '\u26A0\uFE0F Não é vantajoso parar — stint atual ainda tem vida'}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              Pit delta normal: {pf(d.pitLaneDelta) || '?'}s → Pit delta sob SC: ~{(pf(d.pitLaneDelta) * 0.4).toFixed(1)}s
            </div>
          </div>
        )}
      </div>
      <PrintFooter />
    </div>
  );
}
