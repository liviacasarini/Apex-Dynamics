/**
 * PesoTab — Análise de Massa & Dinâmica de Transferência de Carga
 *
 * Seções:
 *  1. Pesos & Distribuição — massas estáticas, ballast, peso suspenso/não-suspenso
 *  2. Transferência de Carga — calculado via telemetria (ax, ay) com gráfico por volta
 *  3. Inércia & CG Dinâmico — momentos de inércia, efeito do combustível, jacking force
 *
 * Auto-cálculo da telemetria:
 *  • ΔFz_long = (m × ax × h) / L
 *  • ΔFz_lat_f = (m_f × ay × (h − RC_f)) / T_f
 *  • ΔFz_lat_r = (m_r × ay × (h − RC_r)) / T_r
 *
 * Persistência: localStorage — chave rt_peso_<profileId>
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useColors } from '@/context/ThemeContext';
import { useCarWeight } from '@/context/CarWeightContext';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { PrintFooter } from '@/components/common';
import { readAssignedPilot } from '@/core/crossTabSync';

/* ──��� constantes ─────────────────────────────────────────────────── */
const STORAGE_KEY  = 'rt_peso_';
const FUEL_KEY     = 'rt_fuel_';
const G            = 9.81;   // m/s²
const FUEL_DENSITY = 0.74;   // kg/L

const EMPTY = {
  // Pesos gerais
  pesoHomologado:  '',  // kg mínimo regulamentar
  pesoPiloto:      '',  // kg com equipamentos
  pesoCarro:       '',  // kg seco (sem piloto, sem comb.)
  // Ballast
  ballast:         [],  // [{ id, name, mass, x, y, z }]
  // Por eixo
  pesoDianteiro:   '',  // kg
  pesoTraseiro:    '',  // kg
  // Não-suspenso por canto (kg)
  rodaFL: '', rodaFR: '', rodaRL: '', rodaRR: '',
  freioFL:'', freioFR:'', freioRL:'', freioRR:'',
  suspFL: '', suspFR: '', suspRL: '', suspRR: '',
  massaRotacional: '',  // kg
  // Parâmetros para cálculo de transferência
  alturaCG:        '',  // mm (calculado/estimado)
  alturaCGMedido:  '',  // mm (medido em balança)
  wheelbase:       '',  // mm
  trackFront:      '',  // mm
  trackRear:       '',  // mm
  rollCenterFront: '',  // mm
  rollCenterRear:  '',  // mm
  // Inércia
  inerciYaw:   '',  // kg·m²
  inerciRoll:  '',  // kg·m²
  inerciPitch: '',  // kg·m²
  // Tanque (fuel CG effect)
  tanqueLongPos: '',  // mm do eixo dianteiro (positivo = para trás)
  tanqueAlt:     '',  // mm do solo
};

/* ─── helpers de cálculo ─────────────────────────────────────────── */
function pf(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

function calcUnsprung(d) {
  const corners = ['FL','FR','RL','RR'];
  let total = 0; let ok = true;
  for (const c of corners) {
    const roda  = pf(d[`roda${c}`]);
    const freio = pf(d[`freio${c}`]);
    const susp  = pf(d[`susp${c}`]);
    if (roda === null || freio === null || susp === null) { ok = false; break; }
    total += roda + freio + susp;
  }
  const rot = pf(d.massaRotacional) || 0;
  return ok ? total + rot : null;
}

function calcSprung(d, unsprung) {
  const total = pf(d.pesoCarro);
  if (total === null || unsprung === null) return null;
  return total - unsprung;
}

function calcDistribuicao(d) {
  const f = pf(d.pesoDianteiro);
  const r = pf(d.pesoTraseiro);
  if (f === null || r === null || f + r === 0) return null;
  return { front: (f / (f + r)) * 100, rear: (r / (f + r)) * 100 };
}

function calcBallastCG(ballast) {
  if (!ballast.length) return null;
  let mTot = 0, mx = 0, my = 0, mz = 0;
  for (const b of ballast) {
    const m = pf(b.mass); const x = pf(b.x); const y = pf(b.y); const z = pf(b.z);
    if (m === null || x === null || y === null || z === null) return null;
    mTot += m; mx += m * x; my += m * y; mz += m * z;
  }
  if (mTot === 0) return null;
  return { x: mx / mTot, y: my / mTot, z: mz / mTot, mass: mTot };
}

function massaTotal(d) {
  const car    = pf(d.pesoCarro);
  const driver = pf(d.pesoPiloto);
  if (car === null || driver === null) return null;
  const ballastM = d.ballast.reduce((s, b) => {
    const m = pf(b.mass); return m !== null ? s + m : s;
  }, 0);
  return car + driver + ballastM;
}

function buildLoadTransferData(rows, channels, d) {
  const m  = massaTotal(d);
  const h  = pf(d.alturaCG);
  const L  = pf(d.wheelbase);
  const Tf = pf(d.trackFront);
  const Tr = pf(d.trackRear);
  const rcf = pf(d.rollCenterFront) || 0;
  const rcr = pf(d.rollCenterRear)  || 0;

  if (!m || !h || !L || !Tf || !Tr || !rows?.length) return null;

  const mf = pf(d.pesoDianteiro);
  const mr = pf(d.pesoTraseiro);
  const mf_eff = (mf !== null && mr !== null) ? mf : m / 2;
  const mr_eff = (mf !== null && mr !== null) ? mr : m / 2;

  const hM  = h / 1000;   // mm → m
  const LM  = L / 1000;
  const TfM = Tf / 1000;
  const TrM = Tr / 1000;
  const rcfM = rcf / 1000;
  const rcrM = rcr / 1000;

  const tCol  = channels.time;
  const axCol = channels.accel;
  const ayCol = channels.lateralG;
  if (!tCol || (!axCol && !ayCol)) return null;

  // Downsampling to max 1500 points
  const step = Math.max(1, Math.floor(rows.length / 1500));
  const result = [];
  const t0 = rows[0][tCol] ?? 0;

  for (let i = 0; i < rows.length; i += step) {
    const row  = rows[i];
    const t    = (row[tCol] ?? 0) - t0;
    const ax   = axCol ? (row[axCol] ?? 0) : 0;  // G
    const ay   = ayCol ? (row[ayCol] ?? 0) : 0;  // G

    // Longitudinal (N): positive ax → deceleration → front gains load
    const dFzLong = (m * ax * G * hM) / LM;
    // Lateral front & rear (N)
    const dFzLatF = (mf_eff * ay * G * (hM - rcfM)) / TfM;
    const dFzLatR = (mr_eff * ay * G * (hM - rcrM)) / TrM;

    // Convert to kg for readability
    result.push({
      t: parseFloat(t.toFixed(2)),
      longKg:  parseFloat((dFzLong / G).toFixed(1)),
      latFKg:  parseFloat((dFzLatF / G).toFixed(1)),
      latRKg:  parseFloat((dFzLatR / G).toFixed(1)),
    });
  }
  return result;
}

function calcFuelCGEffect(d, fuelPerLap, maxLaps) {
  const longPos = pf(d.tanqueLongPos);
  const alt     = pf(d.tanqueAlt);
  const m       = massaTotal(d);
  const h       = pf(d.alturaCG);
  const L       = pf(d.wheelbase);
  if (!longPos || !alt || !m || !h || !L || !fuelPerLap) return null;

  const result = [];
  for (let lap = 0; lap <= maxLaps; lap++) {
    const fuelBurned = fuelPerLap * lap * FUEL_DENSITY; // kg
    const mNew = m - fuelBurned;
    if (mNew <= 0) break;
    // Longitudinal CG shift (simplified: tank position relative to CG)
    const cgShift = (fuelBurned * (longPos - L / 2)) / mNew;
    // Height CG shift
    const cgHShift = (fuelBurned * (alt - h)) / mNew;
    result.push({
      lap,
      cgLongShift: parseFloat(cgShift.toFixed(1)),
      cgHShift:    parseFloat(cgHShift.toFixed(1)),
      massaTotal:  parseFloat(mNew.toFixed(1)),
    });
  }
  return result;
}

function calcJacking(d) {
  const mf  = pf(d.pesoDianteiro);
  const mr  = pf(d.pesoTraseiro);
  const rcf = pf(d.rollCenterFront);
  const rcr = pf(d.rollCenterRear);
  const Tf  = pf(d.trackFront);
  const Tr  = pf(d.trackRear);
  if (!mf || !mr || !rcf || !rcr || !Tf || !Tr) return null;
  // Jacking force per tire (N) at 1G lateral
  const jkF = (mf * G * (rcf / 1000)) / (Tf / 1000 / 2);
  const jkR = (mr * G * (rcr / 1000)) / (Tr / 1000 / 2);
  return {
    frontN: parseFloat(jkF.toFixed(0)),
    rearN:  parseFloat(jkR.toFixed(0)),
    frontKg: parseFloat((jkF / G).toFixed(1)),
    rearKg:  parseFloat((jkR / G).toFixed(1)),
  };
}

/* ─── sub-componentes ────────────────────────────────────────────── */
function Label({ children, C }) {
  return (
    <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 4 }}>
      {children}
    </label>
  );
}

function Field({ label, value, onChange, unit, placeholder, C, IB, half, readOnly, highlight, highlightColor }) {
  return (
    <div style={{ flex: half ? '1 1 140px' : '1 1 100%', minWidth: 120 }}>
      <Label C={C}>{label}{unit ? ` (${unit})` : ''}</Label>
      <input
        type="text"
        value={value || ''}
        onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder || ''}
        style={{
          ...IB,
          width: '100%',
          background: readOnly ? C.bg : IB.background,
          borderColor: highlight ? (highlightColor || C.green) : IB.borderColor || C.border,
        }}
      />
    </div>
  );
}

function CalcBox({ label, value, unit, color, C, size = 'normal', tooltip }) {
  const fs = size === 'large' ? 20 : 14;
  return (
    <div style={{ flex: '1 1 150px', minWidth: 130 }} title={tooltip}>
      <Label C={C}>{label}</Label>
      <div style={{
        background: C.bg,
        border: `1px solid ${value != null ? color : C.border}`,
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: fs,
        fontWeight: 800,
        color: value != null ? color : C.textMuted,
        textAlign: 'center',
        minHeight: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {value != null ? `${value}${unit ? ` ${unit}` : ''}` : '—'}
      </div>
    </div>
  );
}

function Section({ title, color, children, C }) {
  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: '18px 20px',
      marginBottom: 16,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '1.5px', color: color || C.accent, marginBottom: 16,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>{children}</div>;
}

function Divider({ C }) {
  return <div style={{ borderTop: `1px solid ${C.border}`, margin: '14px 0' }} />;
}

function SubTitle({ children, C }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 10, marginTop: 4 }}>
      {children}
    </div>
  );
}

function CornerGrid({ label, prefix, d, onField, C, IB }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <SubTitle C={C}>{label}</SubTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 400 }}>
        {['FL','FR','RL','RR'].map(c => (
          <Field
            key={c}
            label={c}
            value={d[`${prefix}${c}`]}
            onChange={onField(`${prefix}${c}`)}
            unit="kg"
            C={C} IB={IB} half
          />
        ))}
      </div>
    </div>
  );
}

/* ─── componente principal ──────────────────────────────────────── */
export default function PesoTab({ activeProfile, data, channels, onSaveSnapshot, profileWeightLoad }) {
  const C   = useColors();
  const profileId = activeProfile?.id || 'default';
  const {
    pesoCarro: ctxPesoCarro, setPesoCarro,
    pesoPiloto: ctxPesoPiloto, setPesoPiloto,
    wheelbase: ctxWheelbase, setWheelbase,
    violaRegulamento, excesso, pesoMinimo,
    assignedPilots, selectedPilotId, selectPilot,
  } = useCarWeight();
  // Ref para não causar loop ao sincronizar do contexto para o estado local
  const syncingFromCtx = useRef(false);

  const IB = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.textPrimary,
    fontSize: 13,
    padding: '7px 11px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  /* ── estado ── */
  const [d, setD]       = useState(EMPTY);
  const [lapSel, setLapSel] = useState('');
  const [section, setSection] = useState('pesos'); // 'pesos' | 'transfer' | 'inercia'
  const [saveName, setSaveName] = useState('');

  /* ── persistência ── */
  const key = `${STORAGE_KEY}${profileId}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved) {
        // Se o contexto já tem valor (outra tab atualizou antes), usa ele
        const overrides = {};
        if (ctxPesoCarro)  overrides.pesoCarro  = ctxPesoCarro;
        if (ctxPesoPiloto) overrides.pesoPiloto = ctxPesoPiloto;
        if (ctxWheelbase)  overrides.wheelbase  = ctxWheelbase;
        const loaded = { ...EMPTY, ...saved, ...overrides };
        setD(loaded);
        const hasOverrides = Object.keys(overrides).length > 0;
        if (hasOverrides) localStorage.setItem(key, JSON.stringify(loaded));
        // Inicializa contexto com valores do localStorage onde ainda estiver vazio
        if (!ctxPesoCarro  && saved.pesoCarro)  setPesoCarro(saved.pesoCarro);
        if (!ctxPesoPiloto && saved.pesoPiloto) setPesoPiloto(saved.pesoPiloto);
        if (!ctxWheelbase  && saved.wheelbase)  setWheelbase(saved.wheelbase);
      }
    } catch { /* ignora */ }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((next) => {
    setD(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, [key]);

  // Quando o contexto global muda (outra tab atualizou), sincroniza localmente
  useEffect(() => {
    if (!ctxPesoCarro) return;
    if (ctxPesoCarro === d.pesoCarro) return;
    syncingFromCtx.current = true;
    const next = { ...d, pesoCarro: ctxPesoCarro };
    setD(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, [ctxPesoCarro]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ctxPesoPiloto) return;
    if (ctxPesoPiloto === d.pesoPiloto) return;
    syncingFromCtx.current = true;
    const next = { ...d, pesoPiloto: ctxPesoPiloto };
    setD(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, [ctxPesoPiloto]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ctxWheelbase) return;
    if (ctxWheelbase === d.wheelbase) return;
    syncingFromCtx.current = true;
    const next = { ...d, wheelbase: ctxWheelbase };
    setD(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, [ctxWheelbase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carregar snapshot vindo da aba Perfis
  useEffect(() => {
    if (profileWeightLoad?.seq > 0 && profileWeightLoad?.data) {
      const loaded = { ...EMPTY, ...profileWeightLoad.data };
      persist(loaded);
      if (loaded.pesoCarro)  setPesoCarro(loaded.pesoCarro);
      if (loaded.pesoPiloto) setPesoPiloto(loaded.pesoPiloto);
      if (loaded.wheelbase)  setWheelbase(loaded.wheelbase);
    }
  }, [profileWeightLoad?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((field) => (val) => {
    persist({ ...d, [field]: val });
    if (!syncingFromCtx.current) {
      if (field === 'pesoCarro')  setPesoCarro(val);
      if (field === 'pesoPiloto') setPesoPiloto(val);
      if (field === 'wheelbase')  setWheelbase(val);
    }
    syncingFromCtx.current = false;
  }, [d, persist, setPesoCarro, setPesoPiloto, setWheelbase]);

  // ── Cross-tab: piloto designado a este perfil ──
  const assignedPilot = useMemo(() => readAssignedPilot(profileId), [profileId]);

  /* ── importar do CombustivelTab ── */
  const importFromFuel = useCallback(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${FUEL_KEY}${profileId}`) || '[]');
      const sc = saved[0];
      if (!sc) { alert('Nenhum cenário encontrado na aba Combustível.'); return; }
      persist({
        ...d,
        pesoCarro:       sc.carWeight    || d.pesoCarro,
        pesoPiloto:      sc.driverWeight || d.pesoPiloto,
        pesoHomologado:  sc.minWeight    || d.pesoHomologado,
      });
    } catch { alert('Erro ao importar dados da aba Combustível.'); }
  }, [d, persist, profileId]);

  /* ── ballast ── */
  const addBallast = useCallback(() => {
    persist({ ...d, ballast: [...d.ballast, { id: Date.now(), name: '', mass: '', x: '', y: '', z: '' }] });
  }, [d, persist]);

  const updateBallast = useCallback((id, field, val) => {
    persist({ ...d, ballast: d.ballast.map(b => b.id === id ? { ...b, [field]: val } : b) });
  }, [d, persist]);

  const removeBallast = useCallback((id) => {
    persist({ ...d, ballast: d.ballast.filter(b => b.id !== id) });
  }, [d, persist]);

  /* ── valores calculados estáticos (com fallback cross-tab do piloto) ── */
  const dMerged = useMemo(() => ({
    ...d,
    pesoPiloto: d.pesoPiloto || assignedPilot?.weightEquipped || '',
  }), [d, assignedPilot]);

  const unsprung = useMemo(() => calcUnsprung(d), [d]);
  const sprung   = useMemo(() => calcSprung(d, unsprung), [d, unsprung]);
  const distrib  = useMemo(() => calcDistribuicao(d), [d]);
  const ballastCG = useMemo(() => calcBallastCG(d.ballast), [d.ballast]);
  const mTotal   = useMemo(() => massaTotal(dMerged), [dMerged]);

  const margem = useMemo(() => {
    const hom  = pf(dMerged.pesoHomologado);
    const driv = pf(dMerged.pesoPiloto);
    const car  = pf(dMerged.pesoCarro);
    if (!hom || !driv || !car) return null;
    const ballastM = d.ballast.reduce((s, b) => { const m = pf(b.mass); return m ? s + m : s; }, 0);
    return car + driv + ballastM - hom;
  }, [dMerged, d.ballast]);

  /* ── telemetria / seleção de volta ── */
  const lapNumbers = useMemo(() => {
    if (!data?.laps) return [];
    return Object.keys(data.laps).sort((a, b) => Number(a) - Number(b));
  }, [data]);

  useEffect(() => {
    if (lapNumbers.length && !lapSel) setLapSel(lapNumbers[0]);
  }, [lapNumbers, lapSel]);

  const selectedRows = useMemo(() => {
    if (!data?.laps || !lapSel) return [];
    return data.laps[lapSel] || [];
  }, [data, lapSel]);

  /* ── gráfico de transferência de carga ── */
  const loadTransferData = useMemo(
    () => buildLoadTransferData(selectedRows, channels, d),
    [selectedRows, channels, d]
  );

  /* ── stats de transferência ── */
  const transferStats = useMemo(() => {
    if (!loadTransferData?.length) return null;
    const stat = (key) => {
      const vals = loadTransferData.map(r => r[key]);
      return {
        max: Math.max(...vals).toFixed(1),
        min: Math.min(...vals).toFixed(1),
        avg: (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1),
      };
    };
    return { long: stat('longKg'), latF: stat('latFKg'), latR: stat('latRKg') };
  }, [loadTransferData]);

  /* ── fuel CG effect ── */
  const fuelCGData = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${FUEL_KEY}${profileId}`) || '[]');
      const sc = saved[0];
      if (!sc) return null;
      const perLap = (() => {
        const used  = parseFloat(sc.fuelUsed);
        const laps  = parseFloat(sc.lapsCompleted);
        if (!isNaN(used) && !isNaN(laps) && laps > 0) return used / laps;
        const track = parseFloat(sc.trackLength);
        const rate  = parseFloat(sc.consumptionRate);
        if (!isNaN(track) && !isNaN(rate)) return (rate * track) / 100;
        return null;
      })();
      const raceLaps = parseFloat(sc.raceLaps) || 20;
      if (!perLap) return null;
      return calcFuelCGEffect(d, perLap, raceLaps);
    } catch { return null; }
  }, [d, profileId]);

  /* ── jacking force ── */
  const jacking = useMemo(() => calcJacking(d), [d]);

  /* ── estilos fixos ── */
  const tabBtnStyle = (active) => ({
    padding: '7px 16px',
    borderRadius: 8,
    border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? C.accent : 'transparent',
    color: active ? '#fff' : C.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  });

  /* ── renderização ── */
  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Banner de infração regulamentar ────────────────────────── */}
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
              Peso do carro ({d.pesoCarro} kg) excede o limite regulamentar de {pesoMinimo} kg
              em <strong>{excesso} kg</strong>.
            </div>
          </div>
        </div>
      )}

      {/* cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.textPrimary }}>
            Análise de Peso & Massa
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            Pesos estáticos, transferência de carga e dinâmica de inércia
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={importFromFuel} style={{
            ...IB, cursor: 'pointer', padding: '8px 14px', fontSize: 12, fontWeight: 600, color: C.cyan, borderColor: C.cyan,
          }}>
            ↓ Importar da aba Combustível
          </button>
          {onSaveSnapshot && (
            <>
              <input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Nome do snapshot…"
                style={{ ...IB, width: 180, fontSize: 12 }}
              />
              <button
                onClick={() => {
                  const res = onSaveSnapshot(profileId, saveName, d);
                  if (res?.error) alert(res.error);
                  else setSaveName('');
                }}
                style={{ ...IB, cursor: 'pointer', padding: '8px 14px', fontSize: 12, fontWeight: 600, color: C.green, borderColor: C.green }}
              >
                💾 Salvar no perfil
              </button>
            </>
          )}
        </div>
      </div>

      {/* navegação de seções */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setSection('pesos')}   style={tabBtnStyle(section === 'pesos')}>
          ⚖ Pesos & Distribuição
        </button>
        <button onClick={() => setSection('transfer')} style={tabBtnStyle(section === 'transfer')}>
          ↔ Transferência de Carga
        </button>
        <button onClick={() => setSection('inercia')} style={tabBtnStyle(section === 'inercia')}>
          🌀 Inércia & CG Dinâmico
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════
          SEÇÃO 1 — PESOS & DISTRIBUIÇÃO
          ══════════════════════════════════════════════════════ */}
      {section === 'pesos' && (
        <>
          <Section title="Pesos Gerais" C={C} color={C.accent}>
            <Row>
              <Field label="Peso total homologado (mínimo regulamentar)" value={d.pesoHomologado}
                onChange={set('pesoHomologado')} unit="kg" C={C} IB={IB} half />
              {/* ── Seletor de piloto + campo de peso ── */}
              <div style={{ flex: '1 1 140px', minWidth: 120 }}>
                <Label C={C}>Peso piloto + equipamentos (kg)</Label>
                {assignedPilots.length > 0 && (
                  <select
                    value={selectedPilotId}
                    onChange={(e) => {
                      selectPilot(e.target.value);
                      if (e.target.value) {
                        const p = assignedPilots.find(p => p.id === e.target.value);
                        if (p?.weightEquipped) set('pesoPiloto')(String(p.weightEquipped));
                      }
                    }}
                    style={{ ...IB, width: '100%', marginBottom: 4, cursor: 'pointer' }}
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
                  value={d.pesoPiloto || ''}
                  onChange={(e) => set('pesoPiloto')(e.target.value)}
                  placeholder={assignedPilot?.weightEquipped || ''}
                  style={{ ...IB, width: '100%' }}
                />
              </div>
              <Field label="Peso carro seco (sem piloto, sem comb.)" value={d.pesoCarro}
                onChange={set('pesoCarro')} unit="kg" C={C} IB={IB} half
                highlight={violaRegulamento} highlightColor="#ff4444" />
            </Row>
            <Row>
              <CalcBox label="Peso total (carro + piloto + ballast)"
                value={mTotal !== null ? mTotal.toFixed(1) : null}
                unit="kg" color={C.green} C={C} size="large" />
              <CalcBox label="Margem sobre peso mínimo"
                value={margem !== null ? (margem >= 0 ? `+${margem.toFixed(1)}` : margem.toFixed(1)) : null}
                unit="kg"
                color={margem !== null ? (margem >= 0 ? C.green : C.accent) : C.textMuted}
                C={C} size="large"
                tooltip="Peso total − peso homologado" />
            </Row>
          </Section>

          <Section title="Ballast — Lastros" C={C} color={C.yellow}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
              Insira cada lastro com posição tridimensional. X = longitudinal (mm do eixo dianteiro),
              Y = lateral (mm do centro, + = direita), Z = altura (mm do solo).
            </div>

            {d.ballast.length === 0 && (
              <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 12 }}>
                Nenhum lastro cadastrado.
              </div>
            )}

            {d.ballast.map((b) => (
              <div key={b.id} style={{
                display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
                padding: '10px 12px',
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                marginBottom: 8,
              }}>
                <div style={{ flex: '2 1 140px', minWidth: 120 }}>
                  <Label C={C}>Nome</Label>
                  <input type="text" value={b.name} placeholder="ex: Lastro dianteiro"
                    onChange={e => updateBallast(b.id, 'name', e.target.value)}
                    style={{ ...IB, width: '100%' }} />
                </div>
                <div style={{ flex: '1 1 80px', minWidth: 80 }}>
                  <Label C={C}>Massa (kg)</Label>
                  <input type="text" value={b.mass} placeholder="0"
                    onChange={e => updateBallast(b.id, 'mass', e.target.value)}
                    style={{ ...IB, width: '100%' }} />
                </div>
                <div style={{ flex: '1 1 80px', minWidth: 80 }}>
                  <Label C={C}>X (mm)</Label>
                  <input type="text" value={b.x} placeholder="ex: 800"
                    onChange={e => updateBallast(b.id, 'x', e.target.value)}
                    style={{ ...IB, width: '100%' }} />
                </div>
                <div style={{ flex: '1 1 80px', minWidth: 80 }}>
                  <Label C={C}>Y (mm)</Label>
                  <input type="text" value={b.y} placeholder="0"
                    onChange={e => updateBallast(b.id, 'y', e.target.value)}
                    style={{ ...IB, width: '100%' }} />
                </div>
                <div style={{ flex: '1 1 80px', minWidth: 80 }}>
                  <Label C={C}>Z (mm)</Label>
                  <input type="text" value={b.z} placeholder="ex: 50"
                    onChange={e => updateBallast(b.id, 'z', e.target.value)}
                    style={{ ...IB, width: '100%' }} />
                </div>
                <button onClick={() => removeBallast(b.id)} style={{
                  ...IB,
                  cursor: 'pointer',
                  padding: '7px 12px',
                  color: C.accent,
                  borderColor: C.accent,
                  fontSize: 13,
                  alignSelf: 'flex-end',
                }}>✕</button>
              </div>
            ))}

            <button onClick={addBallast} style={{
              ...IB,
              cursor: 'pointer',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: C.yellow,
              borderColor: C.yellow,
              marginTop: 4,
            }}>+ Adicionar Lastro</button>

            {ballastCG && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>CG do Conjunto de Lastros</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[
                    { l: 'Massa total', v: ballastCG.mass.toFixed(1), u: 'kg', col: C.yellow },
                    { l: 'CG longitudinal (X)', v: ballastCG.x.toFixed(0), u: 'mm', col: C.cyan },
                    { l: 'CG lateral (Y)', v: ballastCG.y.toFixed(0), u: 'mm', col: C.cyan },
                    { l: 'CG altura (Z)', v: ballastCG.z.toFixed(0), u: 'mm', col: C.cyan },
                  ].map(item => (
                    <div key={item.l}>
                      <div style={{ fontSize: 10, color: C.textMuted }}>{item.l}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: item.col }}>
                        {item.v} {item.u}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title="Distribuição por Eixo" C={C} color={C.blue}>
            <Row>
              <Field label="Peso eixo dianteiro" value={d.pesoDianteiro}
                onChange={set('pesoDianteiro')} unit="kg" C={C} IB={IB} half />
              <Field label="Peso eixo traseiro" value={d.pesoTraseiro}
                onChange={set('pesoTraseiro')} unit="kg" C={C} IB={IB} half />
              <CalcBox label="Distribuição dianteiro"
                value={distrib ? `${distrib.front.toFixed(1)}%` : null}
                color={C.blue} C={C} />
              <CalcBox label="Distribuição traseiro"
                value={distrib ? `${distrib.rear.toFixed(1)}%` : null}
                color={C.blue} C={C} />
            </Row>
            {distrib && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', background: C.bg, border: `1px solid ${C.border}` }}>
                  <div style={{
                    width: `${distrib.front}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`,
                    transition: 'width 0.4s',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textMuted, marginTop: 4 }}>
                  <span>Dianteiro {distrib.front.toFixed(1)}%</span>
                  <span>Traseiro {distrib.rear.toFixed(1)}%</span>
                </div>
              </div>
            )}
          </Section>

          <Section title="Massa Não-Suspenso (Unsprung Mass)" C={C} color={C.orange}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
              Componentes não amortecidos: rodas, pneus, freios, partes de suspensão abaixo do amortecedor.
            </div>
            <CornerGrid label="Roda + Pneu por canto"        prefix="roda"  d={d} onField={set} C={C} IB={IB} />
            <CornerGrid label="Freio (disco + pinça) por canto" prefix="freio" d={d} onField={set} C={C} IB={IB} />
            <CornerGrid label="Suspensão (manga/cubo/mancal) por canto" prefix="susp" d={d} onField={set} C={C} IB={IB} />
            <Row>
              <Field label="Peso rotacional (volante motor, etc.)" value={d.massaRotacional}
                onChange={set('massaRotacional')} unit="kg" C={C} IB={IB} half />
              <CalcBox label="Total não-suspenso" value={unsprung !== null ? unsprung.toFixed(1) : null}
                unit="kg" color={C.orange} C={C} tooltip="Soma de todos os cantos + rotacional" />
              <CalcBox label="Peso suspenso (sprung)" value={sprung !== null ? sprung.toFixed(1) : null}
                unit="kg" color={C.green} C={C} tooltip="Peso carro − não-suspenso" />
            </Row>
          </Section>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          SEÇÃO 2 — TRANSFERÊNCIA DE CARGA
          ══════════════════════════════════════════════════════ */}
      {section === 'transfer' && (
        <>
          <Section title="Parâmetros Geométricos" C={C} color={C.blue}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
              Estes parâmetros são usados para calcular a transferência de carga.
              O peso total é lido da seção Pesos (carro + piloto + ballast).
            </div>
            <Row>
              <Field label="Altura do CG (estimado)" value={d.alturaCG}
                onChange={set('alturaCG')} unit="mm" C={C} IB={IB} half />
              <Field label="CG medido (balança)" value={d.alturaCGMedido}
                onChange={set('alturaCGMedido')} unit="mm" C={C} IB={IB} half />
              {d.alturaCG && d.alturaCGMedido && (() => {
                const est = parseFloat(d.alturaCG);
                const med = parseFloat(d.alturaCGMedido);
                if (!est || !med) return null;
                const desvio = ((med - est) / est * 100).toFixed(1);
                const cor = Math.abs(desvio) < 3 ? C.green : Math.abs(desvio) < 8 ? C.yellow : C.accent;
                return (
                  <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: `${cor}15`, border: `1px solid ${cor}40`, borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: C.textMuted }}>Desvio:</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: cor }}>{desvio > 0 ? '+' : ''}{desvio}%</span>
                  </div>
                );
              })()}
              <Field label="Wheelbase (entre-eixos)" value={d.wheelbase}
                onChange={set('wheelbase')} unit="mm" C={C} IB={IB} half />
              <Field label="Track width dianteiro" value={d.trackFront}
                onChange={set('trackFront')} unit="mm" C={C} IB={IB} half />
              <Field label="Track width traseiro" value={d.trackRear}
                onChange={set('trackRear')} unit="mm" C={C} IB={IB} half />
            </Row>
            <Row>
              <Field label="Altura roll center dianteiro" value={d.rollCenterFront}
                onChange={set('rollCenterFront')} unit="mm" C={C} IB={IB} half />
              <Field label="Altura roll center traseiro" value={d.rollCenterRear}
                onChange={set('rollCenterRear')} unit="mm" C={C} IB={IB} half />
            </Row>

            {/* fórmulas exibidas */}
            <Divider C={C} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { f: 'ΔFz_long = (m × ax × h) / L', d: 'Transferência longitudinal (frenagem/aceleração)' },
                { f: 'ΔFz_lat_f = (m_f × ay × (h−RC_f)) / T_f', d: 'Transf. lateral eixo dianteiro' },
                { f: 'ΔFz_lat_r = (m_r × ay × (h−RC_r)) / T_r', d: 'Transf. lateral eixo traseiro' },
              ].map(item => (
                <div key={item.f} style={{
                  flex: '1 1 240px',
                  padding: '10px 14px',
                  background: C.bg,
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: C.cyan, marginBottom: 4 }}>
                    {item.f}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{item.d}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Transferência de Carga — Gráfico por Volta" C={C} color={C.cyan}>
            {!data?.laps ? (
              <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Carregue um arquivo de telemetria para calcular a transferência de carga.
              </div>
            ) : !loadTransferData ? (
              <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Preencha os parâmetros geométricos acima para calcular.
                {!channels.accel && !channels.lateralG && (
                  <div style={{ marginTop: 8, color: C.accent }}>
                    ⚠ Canais de aceleração (ax/ay) não detectados no arquivo.
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* seletor de volta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: C.textMuted }}>Volta:</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {lapNumbers.map(l => (
                      <button key={l} onClick={() => setLapSel(l)} style={{
                        padding: '4px 12px',
                        borderRadius: 6,
                        border: `1px solid ${lapSel === l ? C.cyan : C.border}`,
                        background: lapSel === l ? C.cyan : 'transparent',
                        color: lapSel === l ? '#000' : C.textSecondary,
                        fontSize: 11,
                        cursor: 'pointer',
                      }}>V{l}</button>
                    ))}
                  </div>
                </div>

                {/* estatísticas */}
                {transferStats && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                    {[
                      { label: 'Long. máx', v: transferStats.long.max, col: C.orange },
                      { label: 'Long. mín', v: transferStats.long.min, col: C.orange },
                      { label: 'Lat. F máx', v: transferStats.latF.max, col: C.blue },
                      { label: 'Lat. F mín', v: transferStats.latF.min, col: C.blue },
                      { label: 'Lat. R máx', v: transferStats.latR.max, col: C.purple },
                      { label: 'Lat. R mín', v: transferStats.latR.min, col: C.purple },
                    ].map(item => (
                      <div key={item.label} style={{
                        flex: '1 1 110px',
                        padding: '8px 12px',
                        background: C.bg,
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 10, color: C.textMuted }}>{item.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: item.col }}>{item.v}</div>
                        <div style={{ fontSize: 10, color: C.textMuted }}>kg-equiv</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* gráfico */}
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={loadTransferData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="t" stroke={C.textMuted} fontSize={10} tickFormatter={v => `${v}s`} />
                    <YAxis stroke={C.textMuted} fontSize={10} tickFormatter={v => `${v}kg`} />
                    <Tooltip
                      contentStyle={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8 }}
                      labelFormatter={v => `t = ${v}s`}
                      formatter={(val, name) => [`${val} kg-eq`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="longKg" name="ΔFz Longitudinal" stroke={C.orange} dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="latFKg" name="ΔFz Lateral Diant." stroke={C.blue} dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="latRKg" name="ΔFz Lateral Tras." stroke={C.purple} dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                  Valores em kg-equivalente (N ÷ 9,81). Positivo = carga ganha; negativo = carga perdida.
                  Longitudinal: positivo na desaceleração (carga migra para frente).
                  Lateral: positivo na curva à direita (carga migra para fora).
                </div>
              </>
            )}
          </Section>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          SEÇÃO 3 — INÉRCIA & CG DINÂMICO
          ══════════════════════════════════════════════════════ */}
      {section === 'inercia' && (
        <>
          <Section title="Momentos de Inércia" C={C} color={C.purple}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
              Estes valores requerem medição física (rig de inércia) ou dados de projeto.
              Não é possível calculá-los via telemetria.
            </div>
            <Row>
              <div style={{ flex: '1 1 100%', minWidth: 200 }}>
                <Field label="Polar moment of inertia — Yaw (rotação)" value={d.inerciYaw}
                  onChange={set('inerciYaw')} unit="kg·m²" C={C} IB={IB}
                  placeholder="ex: 80–250 kg·m² (formulae típica)" />
              </div>
            </Row>
            <Row>
              <Field label="Momento de inércia — Roll (rolagem)" value={d.inerciRoll}
                onChange={set('inerciRoll')} unit="kg·m²" C={C} IB={IB} half />
              <Field label="Momento de inércia — Pitch (arfagem)" value={d.inerciPitch}
                onChange={set('inerciPitch')} unit="kg·m²" C={C} IB={IB} half />
            </Row>

            {/* guia de valores típicos */}
            <Divider C={C} />
            <SubTitle C={C}>Referências típicas para automóveis de corrida</SubTitle>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { cat: 'Formula (monopostos)', yaw: '60–120', roll: '20–40', pitch: '40–80' },
                { cat: 'GT / Protótipos',      yaw: '120–250', roll: '40–80', pitch: '80–150' },
                { cat: 'Touring Cars',         yaw: '200–400', roll: '60–120', pitch: '150–250' },
              ].map(item => (
                <div key={item.cat} style={{
                  flex: '1 1 200px',
                  padding: '10px 14px',
                  background: C.bg,
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, marginBottom: 6 }}>{item.cat}</div>
                  <div style={{ fontSize: 11, color: C.textSecondary }}>Yaw (Iz): {item.yaw} kg·m²</div>
                  <div style={{ fontSize: 11, color: C.textSecondary }}>Roll (Ix): {item.roll} kg·m²</div>
                  <div style={{ fontSize: 11, color: C.textSecondary }}>Pitch (Iy): {item.pitch} kg·m²</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Fuel Load Effect — Variação do CG com o Combustível" C={C} color={C.yellow}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
              Como o CG se desloca à medida que o combustível é consumido.
              O consumo por volta é lido automaticamente da aba Combustível.
            </div>
            <Row>
              <Field label="Posição longitudinal do tanque (do eixo dianteiro)" value={d.tanqueLongPos}
                onChange={set('tanqueLongPos')} unit="mm" C={C} IB={IB} half
                placeholder="ex: 1200 (positivo = para trás)" />
              <Field label="Altura do CG do tanque (do solo)" value={d.tanqueAlt}
                onChange={set('tanqueAlt')} unit="mm" C={C} IB={IB} half
                placeholder="ex: 250" />
            </Row>

            {fuelCGData ? (
              <>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
                  Deslocamento do CG ao longo das voltas (lê consumo da aba Combustível):
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={fuelCGData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="lap" stroke={C.textMuted} fontSize={10} label={{ value: 'Volta', position: 'insideBottomRight', offset: -4, fontSize: 10, fill: C.textMuted }} />
                    <YAxis yAxisId="cg" stroke={C.textMuted} fontSize={10} tickFormatter={v => `${v}mm`} />
                    <YAxis yAxisId="mass" orientation="right" stroke={C.textMuted} fontSize={10} tickFormatter={v => `${v}kg`} />
                    <Tooltip
                      contentStyle={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8 }}
                      labelFormatter={v => `Volta ${v}`}
                      formatter={(val, name) => {
                        if (name === 'Massa total') return [`${val} kg`, name];
                        return [`${val} mm`, name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="cg" type="monotone" dataKey="cgLongShift" name="Δ CG longitudinal" stroke={C.yellow} dot={false} strokeWidth={1.5} />
                    <Line yAxisId="cg" type="monotone" dataKey="cgHShift" name="Δ CG altura" stroke={C.orange} dot={false} strokeWidth={1.5} />
                    <Line yAxisId="mass" type="monotone" dataKey="massaTotal" name="Massa total" stroke={C.green} dot={false} strokeWidth={1} strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
                  Δ positivo longitudinal = CG desloca para trás. Δ positivo altura = CG sobe.
                </div>
              </>
            ) : (
              <div style={{ color: C.textMuted, fontSize: 13, padding: '16px 0' }}>
                Preencha a posição do tanque e certifique-se de ter um cenário configurado na aba Combustível.
              </div>
            )}
          </Section>

          <Section title="Jacking Force — Força Vertical de Geometria" C={C} color={C.green}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
              Força vertical gerada pela geometria da suspensão em curva (efeito do roll center).
              Calculado usando os parâmetros da seção de Transferência de Carga.
              <br />
              <strong style={{ color: C.green }}>Fórmula:</strong>{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                JF = (m_eixo × ay × RC_height) / (T/2) — por pneu, a 1G lateral
              </span>
            </div>

            {jacking ? (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <CalcBox label="Jacking Force — Dianteiro" value={`${jacking.frontN} N`}
                  color={C.green} C={C} tooltip={`${jacking.frontKg} kg-eq a 1G lateral`} />
                <CalcBox label="Jacking Force — Traseiro" value={`${jacking.rearN} N`}
                  color={C.green} C={C} tooltip={`${jacking.rearKg} kg-eq a 1G lateral`} />
                <CalcBox label="Front (kg-equiv)" value={`${jacking.frontKg} kg`}
                  color={C.cyan} C={C} />
                <CalcBox label="Rear (kg-equiv)" value={`${jacking.rearKg} kg`}
                  color={C.cyan} C={C} />
              </div>
            ) : (
              <div style={{ color: C.textMuted, fontSize: 13, padding: '12px 0' }}>
                Preencha os parâmetros geométricos (roll centers, track widths, pesos por eixo)
                na seção Transferência de Carga para calcular.
              </div>
            )}

            <Divider C={C} />
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.7 }}>
              <strong style={{ color: C.textSecondary }}>O que é:</strong> A jacking force é a componente vertical
              resultante das forças de reação nos pontos de ancoragem da suspensão. Um roll center alto gera
              mais jacking force e menos momento de rolagem, mas pode afetar a progressividade.
              <br />
              <strong style={{ color: C.textSecondary }}>Limitação:</strong> Este cálculo é simplificado —
              não considera o ângulo instantâneo das bandejas nem o efeito de bump/rebound.
              Para análise completa, utilize software de multi-body (ADAMS, FastSim, etc.).
            </div>
          </Section>
        </>
      )}
      <PrintFooter />
    </div>
  );
}
