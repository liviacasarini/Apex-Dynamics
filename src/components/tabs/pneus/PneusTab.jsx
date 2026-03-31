/**
 * PneusTab.jsx
 *
 * Aba para registro manual de dados de pneus e condições ambientais da pista.
 * Tyre compound, pressões FL/FR/RL/RR, temperatura da pista, ambiente e humidade.
 *
 * Tabela T/E/V:
 *   T  = Pressão Ideal (referência do engenheiro)
 *   Pf = Pressão com pneu frio (antes de sair)
 *   Pq = Pressão quando o carro volta (pneu quente)
 *   E  = T − Pq   (desvio entre ideal e pressão de retorno)
 *   V  = Pq − Pf  (build-up de pressão: frio → quente)
 *
 * Seções:
 *   1. Pneus Salvos no Perfil
 *   2. Inventário de Pneus
 *   3. Biblioteca de Compostos  ← novo
 *   4. Dados dos Pneus / Sessão Atual (com zonas de temperatura)
 *   5. Condições da Pista e Ambiente
 *   6. Comparativo de Saídas    ← novo
 *   7. Quilometragem dos Pneus
 *   8. Salvar no Perfil
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ReferenceLine,
} from 'recharts';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { PrintFooter } from '@/components/common';
import { readLatestTemp } from '@/core/crossTabSync';

// ── Opções de composto (expandido com subtypes) ──────────────────────────────
const COMPOUND_OPTIONS = [
  { value: '',              label: '— Selecionar —'      },
  { value: 'slick-ultra',   label: 'Slick — Ultra-macio' },
  { value: 'slick-soft',    label: 'Slick — Macio'       },
  { value: 'slick-medium',  label: 'Slick — Médio'       },
  { value: 'slick-hard',    label: 'Slick — Duro'        },
  { value: 'intermediario', label: 'Intermediário'        },
  { value: 'chuva-extrema', label: 'Chuva Extrema'       },
  { value: 'semi_slick',    label: 'Semi-Slick'           },
  { value: 'radial',        label: 'Radial'               },
  { value: 'other',         label: 'Outro'                },
];

const COMPOUND_LABEL = Object.fromEntries(COMPOUND_OPTIONS.map((o) => [o.value, o.label]));

const TRACK_STATE_OPTIONS = [
  { value: '',       label: '— Selecionar —' },
  { value: 'seca',   label: 'Seca'           },
  { value: 'umida',  label: 'Úmida'          },
  { value: 'inter',  label: 'Intermediária'  },
  { value: 'other',  label: 'Outro'          },
];

const TYRE_POSITIONS = [
  { key: 'fl', label: 'FL', fullLabel: 'Dianteiro Esquerdo' },
  { key: 'fr', label: 'FR', fullLabel: 'Dianteiro Direito'  },
  { key: 'rl', label: 'RL', fullLabel: 'Traseiro Esquerdo'  },
  { key: 'rr', label: 'RR', fullLabel: 'Traseiro Direito'   },
];

// Corner default com zonas de temperatura
const DEFAULT_CORNER = () => ({
  cold: '', hot: '', ideal: '',
  zoneInner: '', zoneCenter: '', zoneOuter: '',
});

const DEFAULT_TYRES = {
  compound: '',
  compoundOther: '',
  fl: DEFAULT_CORNER(),
  fr: DEFAULT_CORNER(),
  rl: DEFAULT_CORNER(),
  rr: DEFAULT_CORNER(),
};

const DEFAULT_CONDITIONS = {
  trackTemp: '',
  ambientTemp: '',
  humidity: '',
  horaInicial: '',
  trackTempFinal: '',
  ambientTempFinal: '',
  humidityFinal: '',
  horaFinal: '',
  weather: '',
  trackState: '',
  trackStateOther: '',
  notes: '',
};

// Biblioteca de compostos — entrada padrão
const DEFAULT_COMPOUND_ENTRY = () => ({
  id: '',
  fabricante: '',
  modelo: '',
  composto: '',
  largura: '',
  perfil: '',
  diametro: '',
  pressaoFria: '',
  pressaoQuente: '',
  tempMinOp: '',
  tempMaxOp: '',
  slipAngleOtimo: '',
  slipRatioOtimo: '',
  muLong: '',
  muLat: '',
  corneringStiffness: '',
  camberThrust: '',
  mzRef: '',
  tempPico: '',
  voltasUteis: '',
  tempGraining: '',
  tempBlistering: '',
  stagger: '',
  // Carcaça
  carcassLateral: '',
  carcassRadial: '',
  // Degradação avançada
  degradacaoTermica: '',   // % de grip perdido por °C acima do cliff
  grainingRisco: '',       // '' | 'baixo' | 'medio' | 'alto'
  blisteringRisco: '',     // '' | 'baixo' | 'medio' | 'alto'
  // Pacejka Magic Formula
  pBLong: '', pCLong: '', pDLong: '', pELong: '',
  pBLat:  '', pCLat:  '', pDLat:  '', pELat:  '',
  // Pacejka — Self-aligning Torque (Mz)
  pBMz: '', pCMz: '', pDMz: '', pEMz: '',
  relaxationLength: '',
  combinedSlipMode: 'elipse',  // 'linear' | 'elipse' | 'pacejka'
  // dFy/dγ — Sensibilidade de Fy ao camber
  gammaRef: '',          // ângulo de camber de referência (°) p/ medir camberThrust
  dFydGamma: '',         // dFy/dγ em N/° (auto-calc = camberThrust / gammaRef)
  // μ(T, Fz) — Variação do coeficiente de atrito com temperatura e carga
  tempOtimaGrip: '',     // T_opt — temperatura de pico de grip (°C)
  kTemp: '',             // sensibilidade térmica de μ (%/°C afastado de T_opt)
  fzRef: '',             // carga vertical de referência (N) onde μ é definido
  loadSensitivity: '',   // expoente a: μ(Fz) = μ_ref · (Fz_ref/Fz)^a
  // ── Modelo de degradação para Estratégia ──
  degradacaoSPorVolta: '',  // degradação linear em s/volta (ex: 0.05)
  voltasWarmUp: '',         // voltas até pneu atingir janela ótima (ex: 2)
  voltasOtimas: '',         // voltas na janela ótima antes de degradar (ex: 8)
  voltaCliff: '',           // volta em que ocorre o cliff (ex: 15)
  degradacaoPosCliff: '',   // degradação em s/volta após o cliff (ex: 0.4)
  // Consistência de lote
  durezaShoreMin: '',    // Shore mín medido no lote
  durezaShoreMax: '',    // Shore máx medido no lote
  notes: '',
});

// Pré-popula a biblioteca com todos os compostos (sem especificações)
const DEFAULT_COMPOUND_LIBRARY = () =>
  COMPOUND_OPTIONS
    .filter((o) => o.value && o.value !== 'other')
    .map((o) => ({ ...DEFAULT_COMPOUND_ENTRY(), id: crypto.randomUUID(), composto: o.value }));

// Saída padrão (comparativo)
const DEFAULT_STINT = () => ({
  id: '',
  label: '',
  horario: '',
  compostoId: '',
  compostoManual: '',
  trackTemp: '',
  ambientTemp: '',
  pfFL: '', pfFR: '', pfRL: '', pfRR: '',
  pqFL: '', pqFR: '', pqRL: '', pqRR: '',
  zFl: { inner: '', center: '', outer: '' },
  zFr: { inner: '', center: '', outer: '' },
  zRl: { inner: '', center: '', outer: '' },
  zRr: { inner: '', center: '', outer: '' },
  voltas: '',
  parcialTroca: false,
  parcialCanto: '',
  parcialVolta: '',
  parcialComposto: '',
  observacao: '',
});

// ── Componentes auxiliares ────────────────────────────────────────────────────
function Label({ children, color, textMuted }) {
  return (
    <label style={{ fontSize: 11, color: color || textMuted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
      {children}
    </label>
  );
}

function Field({ label, labelColor, children, textMuted }) {
  return (
    <div>
      <Label color={labelColor} textMuted={textMuted}>{label}</Label>
      {children}
    </div>
  );
}

function SectionLabel({ children, color }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color, marginBottom: 12,
      textTransform: 'uppercase', letterSpacing: '1px',
    }}>
      {children}
    </div>
  );
}

/** Cor do valor E (T − Volta): quanto mais perto de 0, melhor. */
function colorE(val, COLORS) {
  const abs = Math.abs(val);
  if (abs < 0.75) return COLORS.green;
  if (abs < 2.0)  return COLORS.yellow;
  return COLORS.accent;
}

/** Cor do valor V (Volta − Final): positivo = normal (pneu esfriou). */
function colorV(val, COLORS) {
  if (val > 0.02) return COLORS.green;
  if (val < -0.02) return COLORS.yellow;
  return COLORS.textMuted;
}

/** Formata um delta com sinal. Ex: +0.08 ou -0.03 */
function fmtDelta(val) {
  return (val >= 0 ? '+' : '') + val.toFixed(2);
}

// ── Bloco Pacejka (componente separado para respeitar regras de hooks) ────────
function PacejkaBlock({ entry, expandedPacejka, setExpandedPacejka, updateCompoundField, COLORS, INPUT_STYLE, SELECT_STYLE }) {
  const pkExp = expandedPacejka === entry.id;
  const pf = (k) => parseFloat(entry[k]);
  const hasPacejka = entry.pBLat && entry.pCLat && entry.pDLat && entry.pELat;
  const hasPacejkaFull = hasPacejka && entry.pBLong && entry.pCLong && entry.pDLong && entry.pELong;

  const mf = (B, C, D, E, x) =>
    D * Math.sin(C * Math.atan(B * x - E * (B * x - Math.atan(B * x))));

  const fyData = useMemo(() => {
    if (!hasPacejka) return [];
    const B = pf('pBLat'), C = pf('pCLat'), D = pf('pDLat'), E = pf('pELat');
    if ([B,C,D,E].some(isNaN)) return [];
    return Array.from({ length: 81 }, (_, i) => {
      const deg = -20 + i * 0.5;
      const rad = deg * Math.PI / 180;
      return { alpha: parseFloat(deg.toFixed(1)), Fy: parseFloat(mf(B,C,D,E,rad).toFixed(1)) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.pBLat, entry.pCLat, entry.pDLat, entry.pELat]);

  const fxData = useMemo(() => {
    const B = pf('pBLong'), C = pf('pCLong'), D = pf('pDLong'), E = pf('pELong');
    if ([B,C,D,E].some(isNaN)) return [];
    return Array.from({ length: 61 }, (_, i) => {
      const pct = -15 + i * 0.5;
      const k   = pct / 100;
      return { kappa: parseFloat(pct.toFixed(1)), Fx: parseFloat(mf(B,C,D,E,k).toFixed(1)) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.pBLong, entry.pCLong, entry.pDLong, entry.pELong]);

  const mzData = useMemo(() => {
    const B=pf('pBMz'),C=pf('pCMz'),D=pf('pDMz'),E=pf('pEMz');
    if([B,C,D,E].some(isNaN)) return [];
    return Array.from({ length: 81 }, (_, i) => {
      const deg = -20 + i * 0.5;
      const rad = deg * Math.PI / 180;
      return { alpha: parseFloat(deg.toFixed(1)), Mz: parseFloat(mf(B,C,D,E,rad).toFixed(2)) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.pBMz, entry.pCMz, entry.pDMz, entry.pEMz]);

  const ellipseData = useMemo(() => {
    if (hasPacejkaFull) {
      const BLo=pf('pBLong'),CLo=pf('pCLong'),DLo=pf('pDLong'),ELo=pf('pELong');
      const BLa=pf('pBLat'),CLa=pf('pCLat'),DLa=pf('pDLat'),ELa=pf('pELat');
      if([BLo,CLo,DLo,ELo,BLa,CLa,DLa,ELa].some(isNaN)) return [];
      const fyMax = Math.max(...Array.from({length:81},(_,i)=>mf(BLa,CLa,DLa,ELa,(-20+i*0.5)*Math.PI/180)));
      return Array.from({ length: 61 }, (_, i) => {
        const pct = -15 + i * 0.5;
        const k = pct / 100;
        const fxNorm = parseFloat((mf(BLo,CLo,DLo,ELo,k) / (DLo||1)).toFixed(3));
        const fxFrac = Math.abs(mf(BLo,CLo,DLo,ELo,k)) / (Math.abs(DLo)||1);
        const fyAvail = parseFloat((fyMax * Math.sqrt(Math.max(0, 1 - fxFrac * fxFrac)) / (DLa||fyMax||1)).toFixed(3));
        return { Fx: fxNorm, Fy: fyAvail };
      });
    }
    const muL = pf('muLong'), muLat = pf('muLat');
    if (isNaN(muL) || isNaN(muLat)) return [];
    return Array.from({ length: 73 }, (_, i) => {
      const theta = (i * 5) * Math.PI / 180;
      return {
        Fx: parseFloat((muL  * Math.cos(theta)).toFixed(3)),
        Fy: parseFloat((muLat * Math.sin(theta)).toFixed(3)),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.muLong, entry.muLat, entry.pBLong, entry.pCLong, entry.pDLong, entry.pELong, entry.pBLat, entry.pCLat, entry.pDLat, entry.pELat]);

  const combinedSlipData = useMemo(() => {
    if (!hasPacejkaFull) return [];
    const BLo=pf('pBLong'),CLo=pf('pCLong'),DLo=pf('pDLong'),ELo=pf('pELong');
    const BLa=pf('pBLat'),CLa=pf('pCLat'),DLa=pf('pDLat'),ELa=pf('pELat');
    if([BLo,CLo,DLo,ELo,BLa,CLa,DLa,ELa].some(isNaN)) return [];
    const fxMax = Math.abs(DLo) || 1;
    const kappaLevels = [0, 5, 10, 15];
    return Array.from({length:61},(_,i)=>-15+i*0.5).map(deg => {
      const rad = deg * Math.PI / 180;
      const fyPure = mf(BLa,CLa,DLa,ELa,rad);
      const row = { alpha: parseFloat(deg.toFixed(1)) };
      kappaLevels.forEach(kpct => {
        const fxVal = Math.abs(mf(BLo,CLo,DLo,ELo,kpct/100));
        const frac = fxVal / fxMax;
        row[`fy_k${kpct}`] = parseFloat((fyPure * Math.sqrt(Math.max(0, 1-frac*frac))).toFixed(1));
      });
      return row;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.pBLong, entry.pCLong, entry.pDLong, entry.pELong, entry.pBLat, entry.pCLat, entry.pDLat, entry.pELat]);

  return (
    <div style={{ marginTop: 14, border: `1px solid ${pkExp ? COLORS.purple + '60' : COLORS.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {/* header colapsável */}
      <div onClick={() => setExpandedPacejka(pkExp ? null : entry.id)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', background: pkExp ? `${COLORS.purple}10` : 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.purple }}>🧮 Modelo Pacejka (Magic Formula)</span>
          {hasPacejka && (
            <span style={{ fontSize: 10, background: `${COLORS.purple}20`, color: COLORS.purple, padding: '1px 6px', borderRadius: 4 }}>
              B={entry.pBLat} C={entry.pCLat} D={entry.pDLat} E={entry.pELat}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>{pkExp ? '▲ Recolher' : '▼ Expandir'}</span>
      </div>

      {pkExp && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12, fontFamily: 'monospace', background: COLORS.bg, padding: '8px 12px', borderRadius: 6 }}>
            F = D · sin( C · arctan( B·x − E·(B·x − arctan(B·x)) ) )
          </div>

          {/* Lateral */}
          <SectionLabel color={COLORS.purple}>Coeficientes Laterais (Fy vs slip angle α)</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            {[['pBLat','B (Stiffness)'],['pCLat','C (Shape)'],['pDLat','D (Peak, N)'],['pELat','E (Curvature)']].map(([k,lbl]) => (
              <Field key={k} label={lbl} textMuted={COLORS.textMuted}>
                <input type="number" step="0.01" value={entry[k]}
                  onChange={(e) => updateCompoundField(entry.id, k, e.target.value)}
                  placeholder="—" style={INPUT_STYLE} />
              </Field>
            ))}
          </div>

          {/* Longitudinal */}
          <SectionLabel color={COLORS.purple}>Coeficientes Longitudinais (Fx vs slip ratio κ)</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            {[['pBLong','B (Stiffness)'],['pCLong','C (Shape)'],['pDLong','D (Peak, N)'],['pELong','E (Curvature)']].map(([k,lbl]) => (
              <Field key={k} label={lbl} textMuted={COLORS.textMuted}>
                <input type="number" step="0.01" value={entry[k]}
                  onChange={(e) => updateCompoundField(entry.id, k, e.target.value)}
                  placeholder="—" style={INPUT_STYLE} />
              </Field>
            ))}
          </div>

          {/* Self-aligning Torque Mz */}
          <SectionLabel color={COLORS.purple}>Coeficientes Self-aligning Torque Mz (Mz vs α)</SectionLabel>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
            Opcional. Preencha para gerar a curva Mz × α. Se preferir, use apenas o campo "Self-aligning Torque Mz (ref.)" na seção Comportamento Dinâmico.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            {[['pBMz','B (Stiffness)'],['pCMz','C (Shape)'],['pDMz','D (Peak, N·m)'],['pEMz','E (Curvature)']].map(([k,lbl]) => (
              <Field key={k} label={lbl} textMuted={COLORS.textMuted}>
                <input type="number" step="0.01" value={entry[k]}
                  onChange={(e) => updateCompoundField(entry.id, k, e.target.value)}
                  placeholder="—" style={INPUT_STYLE} />
              </Field>
            ))}
          </div>

          {/* Extras */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 10, marginBottom: 18 }}>
            <Field label="Relaxation Length (m)" textMuted={COLORS.textMuted}>
              <input type="number" step="0.01" value={entry.relaxationLength}
                onChange={(e) => updateCompoundField(entry.id, 'relaxationLength', e.target.value)}
                placeholder="Ex: 0.25" style={INPUT_STYLE} />
            </Field>
            <Field label="Combined Slip Mode" textMuted={COLORS.textMuted}>
              <select value={entry.combinedSlipMode}
                onChange={(e) => updateCompoundField(entry.id, 'combinedSlipMode', e.target.value)}
                style={SELECT_STYLE}>
                <option value="linear">Linear</option>
                <option value="elipse">Elipse (μ)</option>
                <option value="pacejka">Pacejka Completo</option>
              </select>
            </Field>
          </div>

          {/* Gráficos */}
          {fyData.length > 0 && (
            <>
              <SectionLabel color={COLORS.purple}>Fy vs. α — Força Lateral × Slip Angle</SectionLabel>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={fyData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                  <XAxis dataKey="alpha" stroke={COLORS.textMuted} fontSize={10} tickFormatter={v => `${v}°`} />
                  <YAxis stroke={COLORS.textMuted} fontSize={10} tickFormatter={v => `${v}N`} />
                  <Tooltip contentStyle={{ background: COLORS.bgCard || COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}
                    labelFormatter={v => `α = ${v}°`} formatter={(v) => [`${v} N`, 'Fy']} />
                  <ReferenceLine x={0} stroke={COLORS.border} />
                  <ReferenceLine y={0} stroke={COLORS.border} />
                  <Line type="monotone" dataKey="Fy" stroke={COLORS.purple} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}

          {fxData.length > 0 && (
            <>
              <SectionLabel color={COLORS.purple} style={{ marginTop: 14 }}>Fx vs. κ — Força Longitudinal × Slip Ratio</SectionLabel>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={fxData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                  <XAxis dataKey="kappa" stroke={COLORS.textMuted} fontSize={10} tickFormatter={v => `${v}%`} />
                  <YAxis stroke={COLORS.textMuted} fontSize={10} tickFormatter={v => `${v}N`} />
                  <Tooltip contentStyle={{ background: COLORS.bgCard || COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}
                    labelFormatter={v => `κ = ${v}%`} formatter={(v) => [`${v} N`, 'Fx']} />
                  <ReferenceLine x={0} stroke={COLORS.border} />
                  <ReferenceLine y={0} stroke={COLORS.border} />
                  <Line type="monotone" dataKey="Fx" stroke={COLORS.cyan || COLORS.blue} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}

          {mzData.length > 0 && (
            <>
              <SectionLabel color={COLORS.purple} style={{ marginTop: 14 }}>Mz vs. α — Self-aligning Torque × Slip Angle</SectionLabel>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
                Torque de auto-alinhamento (retorno de direção). O pico de Mz costuma ocorrer antes do slip angle ótimo de Fy.
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={mzData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                  <XAxis dataKey="alpha" stroke={COLORS.textMuted} fontSize={10} tickFormatter={v => `${v}°`} />
                  <YAxis stroke={COLORS.textMuted} fontSize={10} tickFormatter={v => `${v}N·m`} />
                  <Tooltip contentStyle={{ background: COLORS.bgCard || COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}
                    labelFormatter={v => `α = ${v}°`} formatter={(v) => [`${v} N·m`, 'Mz']} />
                  <ReferenceLine x={0} stroke={COLORS.border} />
                  <ReferenceLine y={0} stroke={COLORS.border} />
                  <Line type="monotone" dataKey="Mz" stroke={COLORS.cyan || COLORS.blue} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}

          {ellipseData.length > 0 && (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:14, marginBottom:6 }}>
                <SectionLabel color={COLORS.purple} style={{ margin:0 }}>Friction Ellipse</SectionLabel>
                <span style={{ fontSize:10, padding:'1px 7px', borderRadius:4, background: hasPacejkaFull ? `${COLORS.purple}20` : `${COLORS.green}20`, color: hasPacejkaFull ? COLORS.purple : COLORS.green, fontWeight:700 }}>
                  {hasPacejkaFull ? 'Pacejka completo' : 'μ simples'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
                {hasPacejkaFull
                  ? 'Envelope de grip combinado calculado via Magic Formula. Eixo X: Fx normalizado (Fx/Fxmax), Eixo Y: Fy disponível normalizado.'
                  : `Baseado em μLong = ${entry.muLong} e μLat = ${entry.muLat}. Elipse analítica — envelope de grip combinado.`}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                  <XAxis type="number" dataKey="Fx"
                    stroke={COLORS.textMuted} fontSize={10} name={hasPacejkaFull ? 'Fx norm.' : 'μ Long.'} tickFormatter={v => v.toFixed(2)} />
                  <YAxis type="number" dataKey="Fy"
                    stroke={COLORS.textMuted} fontSize={10} name={hasPacejkaFull ? 'Fy norm.' : 'μ Lat.'} tickFormatter={v => v.toFixed(2)} />
                  <Tooltip contentStyle={{ background: COLORS.bgCard || COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}
                    formatter={(v, name) => [v.toFixed(3), name]} />
                  <ReferenceLine x={0} stroke={COLORS.border} />
                  <ReferenceLine y={0} stroke={COLORS.border} />
                  <Scatter data={ellipseData} fill={COLORS.green} line={{ stroke: COLORS.green, strokeWidth: 2 }} lineType="joint" shape={() => null} />
                </ScatterChart>
              </ResponsiveContainer>
            </>
          )}

          {combinedSlipData.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <SectionLabel color={COLORS.purple}>Combined Slip — Degradação de Grip Lateral por Slip Longitudinal</SectionLabel>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
                Cada curva mostra Fy × α para um slip longitudinal κ fixo. Quanto maior o κ, mais grip lateral é perdido.
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={combinedSlipData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                  <XAxis dataKey="alpha" stroke={COLORS.textMuted} fontSize={10} tickFormatter={v => `${v}°`} />
                  <YAxis stroke={COLORS.textMuted} fontSize={10} tickFormatter={v => `${v}N`} />
                  <Tooltip contentStyle={{ background: COLORS.bgCard || COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}
                    labelFormatter={v => `α = ${v}°`}
                    formatter={(v, name) => [`${v} N`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="fy_k0"  name="κ = 0%"  stroke={COLORS.green}               dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="fy_k5"  name="κ = 5%"  stroke={COLORS.yellow}              dot={false} strokeWidth={2} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="fy_k10" name="κ = 10%" stroke={COLORS.orange || '#f97316'} dot={false} strokeWidth={2} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="fy_k15" name="κ = 15%" stroke={COLORS.accent}              dot={false} strokeWidth={2} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {!hasPacejka && !ellipseData.length && (
            <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', padding: '16px 0' }}>
              Preencha os coeficientes B, C, D, E laterais para gerar as curvas.<br />
              Os valores de μ (seção Comportamento Dinâmico) geram a Friction Ellipse.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bloco Camber dFy/dγ + μ(T,Fz) ────────────────────────────────────────────
function CamberMuBlock({ entry, updateCompoundField, COLORS, INPUT_STYLE }) {
  const [expanded, setExpanded] = useState(false);
  const pf = (k) => parseFloat(entry[k]);

  const hasDfdy  = (entry.dFydGamma !== '' && !isNaN(pf('dFydGamma'))) || autoDfdy !== null;
  const hasMuT   = entry.muLat !== '' && entry.tempOtimaGrip !== '' && entry.kTemp !== '' &&
                   !isNaN(pf('muLat')) && !isNaN(pf('tempOtimaGrip')) && !isNaN(pf('kTemp'));
  const hasMuFz  = entry.muLat !== '' && entry.fzRef !== '' && entry.loadSensitivity !== '' &&
                   !isNaN(pf('muLat')) && !isNaN(pf('fzRef')) && !isNaN(pf('loadSensitivity'));
  const hasAny   = hasDfdy || hasMuT || hasMuFz;

  // dFy/dγ auto-calc: usa camberThrust / gammaRef (automático)
  const autoDfdy = (() => {
    const ct = pf('camberThrust'), gr = pf('gammaRef');
    if (isNaN(ct) || isNaN(gr) || gr === 0) return null;
    return (ct / gr).toFixed(2);
  })();
  const displayDfdy = entry.dFydGamma !== '' ? entry.dFydGamma : (autoDfdy ?? '');

  // Gráfico Fy×γ — modelo linear dFy/dγ · γ
  const fyGammaData = useMemo(() => {
    if (!hasDfdy) return [];
    const sens = parseFloat(displayDfdy);
    if (isNaN(sens)) return [];
    return Array.from({ length: 21 }, (_, i) => {
      const deg = -5 + i * 0.5;
      return { gamma: parseFloat(deg.toFixed(1)), Fy: parseFloat((sens * deg).toFixed(1)) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayDfdy, hasDfdy]);

  // Gráfico μ×T
  const muTData = useMemo(() => {
    if (!hasMuT) return [];
    const mu0 = pf('muLat'), tOpt = pf('tempOtimaGrip'), kT = pf('kTemp');
    if ([mu0, tOpt, kT].some(isNaN)) return [];
    return Array.from({ length: 61 }, (_, i) => {
      const T = tOpt - 30 + i;
      const mu = parseFloat(Math.max(0, mu0 * (1 - (kT / 100) * Math.abs(T - tOpt))).toFixed(3));
      return { T: parseFloat(T.toFixed(0)), mu };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.muLat, entry.tempOtimaGrip, entry.kTemp]);

  // Gráfico μ×Fz
  const muFzData = useMemo(() => {
    if (!hasMuFz) return [];
    const mu0 = pf('muLat'), fzRef = pf('fzRef'), a = pf('loadSensitivity');
    if ([mu0, fzRef, a].some(isNaN) || fzRef <= 0) return [];
    return Array.from({ length: 50 }, (_, i) => {
      const Fz = 500 + i * 90; // 500 → 4910 N
      const mu = parseFloat((mu0 * Math.pow(fzRef / Fz, a)).toFixed(3));
      return { Fz: parseFloat(Fz.toFixed(0)), mu };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.muLat, entry.fzRef, entry.loadSensitivity]);

  const accentColor = COLORS.green;

  return (
    <div style={{ marginTop: 10, border: `1px solid ${expanded ? accentColor + '60' : COLORS.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', background: expanded ? `${accentColor}10` : 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: accentColor }}>📐 Camber dFy/dγ &amp; μ(T, Fz)</span>
          {hasAny && (
            <span style={{ fontSize: 10, background: `${accentColor}20`, color: accentColor, padding: '1px 6px', borderRadius: 4 }}>
              {[hasDfdy && `dFy/dγ=${entry.dFydGamma}N/°`, hasMuT && `T_opt=${entry.tempOtimaGrip}°C`, hasMuFz && `a=${entry.loadSensitivity}`].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>{expanded ? '▲ Recolher' : '▼ Expandir'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '14px 16px' }}>

          {/* ── dFy/dγ ── */}
          <div style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}25`, borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
              Sensibilidade Lateral ao Camber — dFy/dγ
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10, fontFamily: 'monospace', background: COLORS.bg, padding: '6px 10px', borderRadius: 6 }}>
              Fy(γ) ≈ (dFy/dγ) · γ &nbsp;|&nbsp; dFy/dγ = CamberThrust / γ_ref
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
              <Field label="γ_ref — Camber Referência (°)" textMuted={COLORS.textMuted}>
                <input type="number" step="0.1" value={entry.gammaRef}
                  onChange={(e) => updateCompoundField(entry.id, 'gammaRef', e.target.value)}
                  placeholder="Ex: -2" style={INPUT_STYLE} />
              </Field>
              <Field label="dFy/dγ  (N/°)" textMuted={COLORS.textMuted}>
                <input type="number" step="0.1" value={displayDfdy}
                  onChange={(e) => updateCompoundField(entry.id, 'dFydGamma', e.target.value)}
                  placeholder="—" style={INPUT_STYLE} />
              </Field>
            </div>
            {hasDfdy && fyGammaData.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>Fy × γ (modelo linear)</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={fyGammaData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey="gamma" tick={{ fontSize: 10, fill: COLORS.textMuted }} label={{ value: 'γ (°)', position: 'insideBottom', offset: -2, fontSize: 10, fill: COLORS.textMuted }} />
                    <YAxis tick={{ fontSize: 10, fill: COLORS.textMuted }} />
                    <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, fontSize: 11 }} />
                    <ReferenceLine x={0} stroke={COLORS.border} />
                    <ReferenceLine y={0} stroke={COLORS.border} />
                    <Line type="monotone" dataKey="Fy" stroke={accentColor} dot={false} strokeWidth={2} name="Fy (N)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {!hasDfdy && (
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' }}>
                Preencha dFy/dγ (ou CamberThrust + γ_ref para cálculo automático) para visualizar o gráfico.
              </div>
            )}
          </div>

          {/* ── μ(T, Fz) ── */}
          <div style={{ background: `${COLORS.purple}08`, border: `1px solid ${COLORS.purple}25`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.purple, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
              Variação do Coeficiente de Atrito — μ(T, Fz)
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10, fontFamily: 'monospace', background: COLORS.bg, padding: '6px 10px', borderRadius: 6 }}>
              μ(T) = μ_ref · (1 − k_T/100 · |T − T_opt|) &nbsp;|&nbsp; μ(Fz) = μ_ref · (Fz_ref/Fz)^a
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
              <Field label="T_opt — Temp. de Pico de Grip (°C)" textMuted={COLORS.textMuted}>
                <input type="number" step="1" value={entry.tempOtimaGrip}
                  onChange={(e) => updateCompoundField(entry.id, 'tempOtimaGrip', e.target.value)}
                  placeholder="Ex: 85" style={INPUT_STYLE} />
              </Field>
              <Field label="k_T — Sensibilidade Térmica (%/°C)" textMuted={COLORS.textMuted}>
                <input type="number" step="0.1" value={entry.kTemp}
                  onChange={(e) => updateCompoundField(entry.id, 'kTemp', e.target.value)}
                  placeholder="Ex: 1.5" style={INPUT_STYLE} />
              </Field>
              <Field label="Fz_ref — Carga Ref. (N)" textMuted={COLORS.textMuted}>
                <input type="number" step="50" value={entry.fzRef}
                  onChange={(e) => updateCompoundField(entry.id, 'fzRef', e.target.value)}
                  placeholder="Ex: 2000" style={INPUT_STYLE} />
              </Field>
              <Field label="a — Expoente de Carga (0.1–0.4)" textMuted={COLORS.textMuted}>
                <input type="number" step="0.05" value={entry.loadSensitivity}
                  onChange={(e) => updateCompoundField(entry.id, 'loadSensitivity', e.target.value)}
                  placeholder="Ex: 0.15" style={INPUT_STYLE} />
              </Field>
            </div>
            {/* ── Consistência de Lote ── */}
            <div style={{ marginTop: 14, padding: '10px 12px', background: `${COLORS.border}15`, borderRadius: 8, border: `1px solid ${COLORS.border}30` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                🔬 Consistência de Lote
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                <Field label="Shore mín (lote)" textMuted={COLORS.textMuted}>
                  <input type="number" step="0.1" value={entry.durezaShoreMin}
                    onChange={(e) => updateCompoundField(entry.id, 'durezaShoreMin', e.target.value)}
                    placeholder="Ex: 58" style={INPUT_STYLE} />
                </Field>
                <Field label="Shore máx (lote)" textMuted={COLORS.textMuted}>
                  <input type="number" step="0.1" value={entry.durezaShoreMax}
                    onChange={(e) => updateCompoundField(entry.id, 'durezaShoreMax', e.target.value)}
                    placeholder="Ex: 62" style={INPUT_STYLE} />
                </Field>
                <Field label="Variação (%)" textMuted={COLORS.textMuted}>
                  {(() => {
                    const mn = parseFloat(entry.durezaShoreMin), mx = parseFloat(entry.durezaShoreMax);
                    if (!mn || !mx) return <div style={{ ...INPUT_STYLE, background: `${COLORS.accent}10`, color: COLORS.textMuted }}>—</div>;
                    const avg = (mn + mx) / 2;
                    const pct = ((mx - mn) / avg * 100).toFixed(1);
                    const cor = pct < 3 ? COLORS.green : pct < 6 ? COLORS.yellow : COLORS.accent;
                    return <div style={{ ...INPUT_STYLE, background: `${cor}15`, color: cor, fontWeight: 700 }}>{pct}%</div>;
                  })()}
                </Field>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: hasMuT && hasMuFz ? '1fr 1fr' : '1fr', gap: 14 }}>
              {/* μ × T */}
              {hasMuT && muTData.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>μ × Temperatura</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={muTData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                      <XAxis dataKey="T" tick={{ fontSize: 10, fill: COLORS.textMuted }} label={{ value: 'T (°C)', position: 'insideBottom', offset: -2, fontSize: 10, fill: COLORS.textMuted }} />
                      <YAxis tick={{ fontSize: 10, fill: COLORS.textMuted }} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, fontSize: 11 }} />
                      <ReferenceLine x={pf('tempOtimaGrip')} stroke={accentColor} strokeDasharray="4 2" label={{ value: 'T_opt', fontSize: 9, fill: accentColor }} />
                      <Line type="monotone" dataKey="mu" stroke={COLORS.purple} dot={false} strokeWidth={2} name="μ" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* μ × Fz */}
              {hasMuFz && muFzData.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>μ × Carga Vertical (Fz)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={muFzData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                      <XAxis dataKey="Fz" tick={{ fontSize: 10, fill: COLORS.textMuted }} label={{ value: 'Fz (N)', position: 'insideBottom', offset: -2, fontSize: 10, fill: COLORS.textMuted }} />
                      <YAxis tick={{ fontSize: 10, fill: COLORS.textMuted }} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, fontSize: 11 }} />
                      <ReferenceLine x={pf('fzRef')} stroke={COLORS.purple} strokeDasharray="4 2" label={{ value: 'Fz_ref', fontSize: 9, fill: COLORS.purple }} />
                      <Line type="monotone" dataKey="mu" stroke={COLORS.yellow} dot={false} strokeWidth={2} name="μ" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            {!hasMuT && !hasMuFz && (
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' }}>
                Preencha μ Lateral (seção acima) + T_opt + k_T para o gráfico térmico; + Fz_ref + expoente para o gráfico de carga.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function PneusTab({
  profileLoad, profilesList = [], activeProfileId,
  onSaveTireSet, onSaveGroup, profileGroups = [],
  profileTireSets = [], profileTempLog = [],
  onLoadTireSet, onDeleteTireSet,
  pneusForm, setPneusForm,
  profileTireKm, onSaveTireKm,
  profileSessions = [],
}) {
  const COLORS = useColors();

  // ── Cross-tab: condições do último registro de temperatura ──
  const latestTemp = useMemo(() => readLatestTemp(), []);
  const theme = makeTheme(COLORS);
  const INPUT_STYLE = {
    width: '100%',
    background: COLORS.bg,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };
  const SELECT_STYLE = { ...INPUT_STYLE, cursor: 'pointer' };

  // ── Estado do formulário levantado para App.jsx ───────────────────────────
  const tyres      = pneusForm?.tyres      || DEFAULT_TYRES;
  const conditions = pneusForm?.conditions || DEFAULT_CONDITIONS;

  const setTyres = (v) => {
    setPneusForm((prev) => {
      const cur = prev || { tyres: DEFAULT_TYRES, conditions: DEFAULT_CONDITIONS };
      return { ...cur, tyres: typeof v === 'function' ? v(cur.tyres || DEFAULT_TYRES) : v };
    });
  };
  const setConditions = (v) => {
    setPneusForm((prev) => {
      const cur = prev || { tyres: DEFAULT_TYRES, conditions: DEFAULT_CONDITIONS };
      return { ...cur, conditions: typeof v === 'function' ? v(cur.conditions || DEFAULT_CONDITIONS) : v };
    });
  };

  const [saved,            setSaved]            = useState(false);
  const [showSaved,        setShowSaved]        = useState(false);
  const [newGroupName,     setNewGroupName]     = useState('');
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [selectedGroupId,  setSelectedGroupId]  = useState('');

  // Quilometragem por canto
  const [localTireKm, setLocalTireKm] = useState(() => profileTireKm || { fl: 0, fr: 0, rl: 0, rr: 0 });
  const [tireKmSaved, setTireKmSaved] = useState(false);

  useEffect(() => {
    setLocalTireKm(profileTireKm || { fl: 0, fr: 0, rl: 0, rr: 0 });
  }, [profileTireKm, activeProfileId]);

  function handleSaveTireKm() {
    onSaveTireKm?.({
      fl: parseFloat(localTireKm.fl) || 0,
      fr: parseFloat(localTireKm.fr) || 0,
      rl: parseFloat(localTireKm.rl) || 0,
      rr: parseFloat(localTireKm.rr) || 0,
    }, activeProfileId);
    setTireKmSaved(true);
    setTimeout(() => setTireKmSaved(false), 2500);
  }

  // ── Inventário de pneus (por perfil) ─────────────────────────────────────
  const inventoryKey = `rt_tyre_inventory_${activeProfileId || 'default'}`;

  const [inventory, setInventory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`rt_tyre_inventory_${activeProfileId || 'default'}`)) || []; }
    catch { return []; }
  });

  useEffect(() => {
    try { setInventory(JSON.parse(localStorage.getItem(inventoryKey)) || []); }
    catch { setInventory([]); }
  }, [inventoryKey]);

  useEffect(() => {
    try { localStorage.setItem(inventoryKey, JSON.stringify(inventory)); }
    catch {}
  }, [inventory, inventoryKey]);

  const addInventoryRow = () => {
    setInventory((prev) => [
      ...prev,
      { id: crypto.randomUUID(), compound: '', qty: '', kmAntes: '', kmEntries: [], notes: '' },
    ]);
  };

  const updateInventoryRow = (id, field, value) => {
    setInventory((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeInventoryRow = (id) => {
    setInventory((prev) => prev.filter((row) => row.id !== id));
  };

  // ── Km por conjunto ───────────────────────────────────────────────────────
  const [entryRowId,         setEntryRowId]         = useState(null);
  const [entryKm,            setEntryKm]            = useState('');
  const [entryDate,          setEntryDate]          = useState('');
  const [entryEvent,         setEntryEvent]         = useState('');
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [showSessionPicker,  setShowSessionPicker]  = useState(false);
  const [showTireSetPicker,  setShowTireSetPicker]  = useState(false);

  const sessionsWithKm = profileSessions.filter((s) => s.sessionKm > 0);

  const openEntryRow = (rowId) => {
    setEntryRowId(rowId);
    setEntryKm('');
    setEntryDate('');
    setEntryEvent('');
    setSelectedSessionIds([]);
    setShowSessionPicker(false);
    setShowTireSetPicker(false);
  };

  const calcAutoKm = (nextSessionIds) => {
    const total = nextSessionIds.reduce((sum, sid) => {
      const s = profileSessions.find((ps) => ps.id === sid);
      return sum + (parseFloat(s?.sessionKm) || 0);
    }, 0);
    return total.toFixed(1);
  };

  const toggleSession = (session) => {
    setSelectedSessionIds((prev) => {
      const next = prev.includes(session.id)
        ? prev.filter((id) => id !== session.id)
        : [...prev, session.id];
      setEntryKm(calcAutoKm(next));
      const names = next
        .map((sid) => profileSessions.find((ps) => ps.id === sid)?.name)
        .filter(Boolean)
        .join(' + ');
      setEntryEvent(names || '');
      return next;
    });
  };

  const addKmEntry = (rowId) => {
    const km = parseFloat(entryKm);
    if (isNaN(km) || km < 0) return;
    const sessionRefs = selectedSessionIds
      .map((sid) => profileSessions.find((ps) => ps.id === sid))
      .filter(Boolean)
      .map((s) => ({ id: s.id, name: s.name, km: s.sessionKm }));
    const entry = { id: crypto.randomUUID(), km, date: entryDate, event: entryEvent, sessionRefs };
    setInventory((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, kmEntries: [...(row.kmEntries || []), entry] }
          : row
      )
    );
    setEntryKm('');
    setEntryDate('');
    setEntryEvent('');
    setSelectedSessionIds([]);
  };

  const deleteKmEntry = (rowId, entryId) => {
    setInventory((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, kmEntries: (row.kmEntries || []).filter((e) => e.id !== entryId) }
          : row
      )
    );
  };

  const getTotalKm = (row) => {
    const base = parseFloat(row.kmAntes) || 0;
    const sessions = (row.kmEntries || []).reduce((s, e) => s + (parseFloat(e.km) || 0), 0);
    return base + sessions;
  };

  const totalSets = inventory.reduce((sum, r) => {
    const n = parseInt(r.qty, 10);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  // ── Salvar no Perfil ──────────────────────────────────────────────────────
  const [profileSaveName,   setProfileSaveName]   = useState('');
  const [profileSaveTarget, setProfileSaveTarget] = useState('');
  const [profileSaveMsg,    setProfileSaveMsg]    = useState(null);

  useEffect(() => {
    if (activeProfileId && !profileSaveTarget) setProfileSaveTarget(activeProfileId);
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastLoadedSeqRef = useRef(0);
  useEffect(() => {
    if (!profileLoad?.data || profileLoad.seq <= lastLoadedSeqRef.current) return;
    lastLoadedSeqRef.current = profileLoad.seq;
    const { tyres: t, conditions: c } = profileLoad.data;
    if (t) setTyres({ ...DEFAULT_TYRES, ...t });
    if (c) setConditions({ ...DEFAULT_CONDITIONS, ...c });
    setSaved(false);
  }, [profileLoad?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateTyre = (pos, field, value) => {
    setTyres((prev) => ({ ...prev, [pos]: { ...prev[pos], [field]: value } }));
    setSaved(false);
  };

  const updateCondition = (field, value) => {
    setConditions((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    try {
      localStorage.setItem('rt_tyres',      JSON.stringify(tyres));
      localStorage.setItem('rt_conditions', JSON.stringify(conditions));
    } catch (_) {}
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setTyres(DEFAULT_TYRES);
    setConditions(DEFAULT_CONDITIONS);
    setSaved(false);
    try {
      localStorage.removeItem('rt_tyres');
      localStorage.removeItem('rt_conditions');
    } catch (_) {}
  };

  const handleSaveToProfile = () => {
    if (!profileSaveName.trim()) {
      setProfileSaveMsg({ ok: false, text: 'Digite um nome para o conjunto.' });
      return;
    }
    const targetId = profileSaveTarget || activeProfileId;
    if (!targetId) {
      setProfileSaveMsg({ ok: false, text: 'Selecione um perfil de destino.' });
      return;
    }
    const result = onSaveTireSet?.(targetId, profileSaveName.trim(), tyres, conditions, selectedGroupId || undefined);
    if (result?.error) {
      setProfileSaveMsg({ ok: false, text: result.error });
    } else {
      setProfileSaveMsg({ ok: true, text: 'Salvo!' });
      setProfileSaveName('');
      setTimeout(() => setProfileSaveMsg(null), 3500);
    }
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const targetId = profileSaveTarget || activeProfileId;
    if (!targetId) { setProfileSaveMsg({ ok: false, text: 'Selecione um perfil primeiro.' }); return; }
    const result = onSaveGroup?.(targetId, newGroupName.trim());
    if (result?.id) { setSelectedGroupId(result.id); setNewGroupName(''); setShowNewGroupForm(false); }
  };

  // ── Tabela T/E/V ─────────────────────────────────────────────────────────
  const tevRows = TYRE_POSITIONS.map((pos) => {
    const t  = parseFloat(tyres[pos.key]?.ideal);
    const pq = parseFloat(tyres[pos.key]?.hot);
    const pf = parseFloat(tyres[pos.key]?.cold);
    const hasT  = !isNaN(t);
    const hasPq = !isNaN(pq);
    const hasPf = !isNaN(pf);
    return {
      pos,
      t:    hasT ? t : null,
      eVal: (hasT && hasPq) ? t - pq : null,
      vVal: (hasPq && hasPf) ? pq - pf : null,
    };
  });
  const hasTEV = tevRows.some((r) => r.t !== null || r.eVal !== null || r.vVal !== null);

  // ── NOVO: Biblioteca de Compostos ─────────────────────────────────────────
  const libraryKey = `rt_tyre_library_${activeProfileId || 'default'}`;
  const [compoundLibrary, setCompoundLibrary] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(libraryKey));
      return (stored && stored.length > 0) ? stored : DEFAULT_COMPOUND_LIBRARY();
    }
    catch { return DEFAULT_COMPOUND_LIBRARY(); }
  });
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(libraryKey));
      setCompoundLibrary((stored && stored.length > 0) ? stored : DEFAULT_COMPOUND_LIBRARY());
    }
    catch { setCompoundLibrary(DEFAULT_COMPOUND_LIBRARY()); }
  }, [libraryKey]);
  useEffect(() => {
    try { localStorage.setItem(libraryKey, JSON.stringify(compoundLibrary)); }
    catch {}
  }, [compoundLibrary, libraryKey]);

  const [showLibrary,      setShowLibrary]      = useState(false);
  const [expandedCompound, setExpandedCompound] = useState(null);
  const [expandedPacejka,  setExpandedPacejka]  = useState(null);

  const addCompoundEntry = () => {
    const entry = { ...DEFAULT_COMPOUND_ENTRY(), id: crypto.randomUUID() };
    setCompoundLibrary((prev) => [...prev, entry]);
    setExpandedCompound(entry.id);
    setShowLibrary(true);
  };

  const updateCompoundField = (id, field, value) => {
    setCompoundLibrary((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  };

  const deleteCompoundEntry = (id) => {
    setCompoundLibrary((prev) => prev.filter((c) => c.id !== id));
    if (expandedCompound === id) setExpandedCompound(null);
  };

  const getCompoundDisplayName = (entry) => {
    const parts = [
      entry.fabricante,
      entry.modelo,
      COMPOUND_LABEL[entry.composto] || entry.composto,
    ].filter(Boolean);
    return parts.join(' — ') || 'Composto sem nome';
  };

  // ── NOVO: Comparativo de Saídas ──────────────────────────────────────────
  const stintsKey = `rt_tyre_stints_${activeProfileId || 'default'}`;
  const [stints, setStints] = useState(() => {
    try { return JSON.parse(localStorage.getItem(stintsKey)) || []; }
    catch { return []; }
  });
  useEffect(() => {
    try { setStints(JSON.parse(localStorage.getItem(stintsKey)) || []); }
    catch { setStints([]); }
  }, [stintsKey]);
  useEffect(() => {
    try { localStorage.setItem(stintsKey, JSON.stringify(stints)); }
    catch {}
  }, [stints, stintsKey]);

  const [expandedStint, setExpandedStint] = useState(null);
  const [showStintForm, setShowStintForm] = useState(false);
  const [newStint,      setNewStint]      = useState(DEFAULT_STINT);

  const openNewStintForm = () => {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    setNewStint({
      ...DEFAULT_STINT(),
      id:          crypto.randomUUID(),
      label:       `Saída ${stints.length + 1}`,
      horario:     timeStr,
      trackTemp:   conditions.trackTemp   || '',
      ambientTemp: conditions.ambientTemp || '',
    });
    setShowStintForm(true);
  };

  const saveNewStint = () => {
    if (!newStint.label.trim()) return;
    setStints((prev) => [...prev, newStint]);
    setShowStintForm(false);
    setNewStint(DEFAULT_STINT());
  };

  const updateStintField = (id, field, value) => {
    setStints((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
  };

  const updateStintZone = (id, cornerKey, subfield, value) => {
    const zKey = `z${cornerKey.charAt(0).toUpperCase()}${cornerKey.slice(1)}`;
    setStints((prev) => prev.map((s) =>
      s.id === id ? { ...s, [zKey]: { ...(s[zKey] || {}), [subfield]: value } } : s
    ));
  };

  const deleteStint = (id) => {
    setStints((prev) => prev.filter((s) => s.id !== id));
    if (expandedStint === id) setExpandedStint(null);
  };

  // Build-up de pressão por canto de uma saída
  const stintBuildUp = (stint) => {
    return TYRE_POSITIONS.map(({ key, label }) => {
      const pf = parseFloat(stint[`pf${label}`]);
      const pq = parseFloat(stint[`pq${label}`]);
      if (isNaN(pf) || isNaN(pq)) return null;
      return { label, v: pq - pf };
    }).filter(Boolean);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24 }}>

      {/* ── Pneus Salvos no Perfil ── */}
      {profileTireSets.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setShowSaved((v) => !v)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', border: `1px solid ${showSaved ? COLORS.green : COLORS.border}`,
              background: showSaved ? `${COLORS.green}15` : 'transparent',
              color: showSaved ? COLORS.green : COLORS.textSecondary,
              transition: 'all 0.2s',
            }}
          >
            🏎️ Pneus Salvos ({profileTireSets.length})
          </button>

          {showSaved && (
            <div style={{ ...theme.card, marginTop: 8 }}>
              <div style={theme.cardTitle}>🏎️ Conjuntos Salvos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {profileTireSets.map((ts) => {
                  const compound = ts.tyres?.compound || '';
                  const compoundLabel = COMPOUND_LABEL[compound] || ts.tyres?.compoundOther || compound;
                  const group = profileGroups.find((g) => g.id === ts.groupId);
                  return (
                    <div key={ts.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px',
                      background: `${COLORS.bgCard}80`, borderRadius: 8,
                      border: `1px solid ${COLORS.border}22`,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{ts.name}</div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted, display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                          {group && <span style={{ background: `${COLORS.blue}20`, color: COLORS.blue, padding: '1px 6px', borderRadius: 4 }}>📁 {group.name}</span>}
                          {compoundLabel && <span style={{ background: `${COLORS.green}20`, color: COLORS.green, padding: '1px 6px', borderRadius: 4 }}>{compoundLabel}</span>}
                          {ts.conditions?.trackTemp && <span style={{ background: `${COLORS.orange}20`, color: COLORS.orange, padding: '1px 6px', borderRadius: 4 }}>Pista {ts.conditions.trackTemp}°C</span>}
                          {ts.savedAt && <span>📅 {new Date(ts.savedAt).toLocaleDateString('pt-BR')}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { onLoadTireSet?.(ts.id); setShowSaved(false); }}
                          style={{ ...SELECT_STYLE, width: 'auto', padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600, color: COLORS.textPrimary }}>
                          Carregar
                        </button>
                        <button onClick={() => onDeleteTireSet?.(ts.id)}
                          style={{ ...SELECT_STYLE, width: 'auto', padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: COLORS.accent, borderColor: COLORS.accent }}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Inventário de Pneus ── */}
      <div style={theme.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={theme.cardTitle}>📦 Inventário de Pneus</div>
          {totalSets > 0 && (
            <div style={{
              fontSize: 12, color: COLORS.green, fontWeight: 700,
              background: `${COLORS.green}18`, padding: '3px 12px', borderRadius: 20,
              border: `1px solid ${COLORS.green}40`,
            }}>
              {totalSets} pneu{totalSets !== 1 ? 's' : ''} disponíve{totalSets !== 1 ? 'is' : 'l'}
            </div>
          )}
        </div>

        {inventory.length > 0 && (
          <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 70px 90px 1fr 36px',
              gap: 8, padding: '7px 10px',
              background: `${COLORS.bgCard}`,
              borderBottom: `1px solid ${COLORS.border}`,
            }}>
              {['Composto / Tipo', 'Pneus', 'Km Antes', 'Observações', ''].map((h, i) => (
                <div key={i} style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  {h}
                </div>
              ))}
            </div>

            {inventory.map((row, idx) => (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 70px 90px 1fr 36px',
                  gap: 8, padding: '6px 10px', alignItems: 'center',
                  background: idx % 2 === 0 ? 'transparent' : `${COLORS.bgCard}50`,
                  borderBottom: idx < inventory.length - 1 ? `1px solid ${COLORS.border}22` : 'none',
                }}
              >
                <input type="text" value={row.compound}
                  onChange={(e) => updateInventoryRow(row.id, 'compound', e.target.value)}
                  placeholder="Ex: Slick — Avon A19"
                  style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12 }} />
                <input type="number" min="0" max="99" step="1" value={row.qty}
                  onChange={(e) => updateInventoryRow(row.id, 'qty', e.target.value)}
                  placeholder="4"
                  style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12, textAlign: 'center' }} />
                <input type="number" min="0" step="0.1" value={row.kmAntes || ''}
                  onChange={(e) => updateInventoryRow(row.id, 'kmAntes', e.target.value)}
                  placeholder="0 km"
                  style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12, textAlign: 'center' }} />
                <input type="text" value={row.notes}
                  onChange={(e) => updateInventoryRow(row.id, 'notes', e.target.value)}
                  placeholder="Ex: Novos, 3 corridas usadas..."
                  style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12 }} />
                <button onClick={() => removeInventoryRow(row.id)} title="Remover"
                  style={{
                    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: `1px solid ${COLORS.border}`, borderRadius: 6,
                    cursor: 'pointer', color: COLORS.accent, fontSize: 16, flexShrink: 0,
                  }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {inventory.length === 0 && (
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 10 }}>
            Registre quantos conjuntos de pneus a equipe tem disponíveis.
          </div>
        )}

        <button onClick={addInventoryRow}
          style={{
            padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            background: `${COLORS.green}15`, color: COLORS.green,
            border: `1px solid ${COLORS.green}40`, cursor: 'pointer',
          }}>
          + Adicionar conjunto
        </button>
      </div>

      {/* ── Biblioteca de Compostos ── */}
      <div style={theme.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showLibrary ? 14 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={theme.cardTitle}>📚 Biblioteca de Compostos</div>
            {compoundLibrary.length > 0 && (
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                ({compoundLibrary.length} {compoundLibrary.length === 1 ? 'composto' : 'compostos'})
              </span>
            )}
          </div>
          <button onClick={() => setShowLibrary((v) => !v)}
            style={{ fontSize: 11, color: COLORS.textMuted, background: 'transparent', border: 'none', cursor: 'pointer' }}>
            {showLibrary ? '▲ Recolher' : '▼ Expandir'}
          </button>
        </div>

        {showLibrary && (
          <>
            {compoundLibrary.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {compoundLibrary.map((entry) => {
                  const isExp = expandedCompound === entry.id;
                  return (
                    <div key={entry.id} style={{
                      border: `1px solid ${isExp ? COLORS.blue + '60' : COLORS.border}`,
                      borderRadius: 10, overflow: 'hidden',
                    }}>
                      {/* Cabeçalho */}
                      <div onClick={() => setExpandedCompound(isExp ? null : entry.id)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', cursor: 'pointer',
                          background: isExp ? `${COLORS.blue}10` : 'transparent',
                          borderBottom: isExp ? `1px solid ${COLORS.border}33` : 'none',
                        }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{getCompoundDisplayName(entry)}</span>
                          <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                            {entry.largura && entry.perfil && entry.diametro && (
                              <span style={{ fontSize: 10, color: COLORS.textMuted }}>{entry.largura}/{entry.perfil}R{entry.diametro}</span>
                            )}
                            {entry.pressaoFria && (
                              <span style={{ fontSize: 10, background: `${COLORS.blue}18`, color: COLORS.blue, padding: '1px 5px', borderRadius: 4 }}>
                                Pf {entry.pressaoFria} PSI
                              </span>
                            )}
                            {entry.tempMinOp && entry.tempMaxOp && (
                              <span style={{ fontSize: 10, background: `${COLORS.orange}18`, color: COLORS.orange, padding: '1px 5px', borderRadius: 4 }}>
                                {entry.tempMinOp}–{entry.tempMaxOp}°C
                              </span>
                            )}
                            {entry.tempPico && (
                              <span style={{ fontSize: 10, background: `${COLORS.accent}18`, color: COLORS.accent, padding: '1px 5px', borderRadius: 4 }}>
                                Cliff {entry.tempPico}°C
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button onClick={(e) => { e.stopPropagation(); deleteCompoundEntry(entry.id); }}
                            style={{ background: 'transparent', border: 'none', color: COLORS.accent, cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>
                            ×
                          </button>
                          <span style={{ fontSize: 11, color: COLORS.textMuted }}>{isExp ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {/* Formulário expandido */}
                      {isExp && (
                        <div style={{ padding: '14px 16px' }}>

                          {/* Identificação */}
                          <div style={{ background: `${COLORS.blue}08`, border: `1px solid ${COLORS.blue}25`, borderRadius: 10, padding: '14px 14px 10px', marginBottom: 12 }}>
                            <SectionLabel color={COLORS.blue}>Identificação</SectionLabel>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                              <Field label="Fabricante" textMuted={COLORS.textMuted}>
                                <input type="text" value={entry.fabricante}
                                  onChange={(e) => updateCompoundField(entry.id, 'fabricante', e.target.value)}
                                  placeholder="Ex: Avon, Pirelli..." style={INPUT_STYLE} />
                              </Field>
                              <Field label="Modelo" textMuted={COLORS.textMuted}>
                                <input type="text" value={entry.modelo}
                                  onChange={(e) => updateCompoundField(entry.id, 'modelo', e.target.value)}
                                  placeholder="Ex: A19, DHF..." style={INPUT_STYLE} />
                              </Field>
                              <Field label="Composto" textMuted={COLORS.textMuted}>
                                <select value={entry.composto}
                                  onChange={(e) => updateCompoundField(entry.id, 'composto', e.target.value)}
                                  style={SELECT_STYLE}>
                                  {COMPOUND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </Field>
                            </div>
                          </div>

                          {/* Dimensões */}
                          <div style={{ background: `${COLORS.blue}08`, border: `1px solid ${COLORS.blue}25`, borderRadius: 10, padding: '14px 14px 10px', marginBottom: 12 }}>
                            <SectionLabel color={COLORS.blue}>Dimensões</SectionLabel>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                              <Field label="Largura (mm)" textMuted={COLORS.textMuted}>
                                <input type="number" value={entry.largura}
                                  onChange={(e) => updateCompoundField(entry.id, 'largura', e.target.value)}
                                  placeholder="Ex: 205" style={INPUT_STYLE} />
                              </Field>
                              <Field label="Perfil / Aspect Ratio" textMuted={COLORS.textMuted}>
                                <input type="number" value={entry.perfil}
                                  onChange={(e) => updateCompoundField(entry.id, 'perfil', e.target.value)}
                                  placeholder="Ex: 55" style={INPUT_STYLE} />
                              </Field>
                              <Field label="Diâmetro da Roda (pol.)" textMuted={COLORS.textMuted}>
                                <input type="number" value={entry.diametro}
                                  onChange={(e) => updateCompoundField(entry.id, 'diametro', e.target.value)}
                                  placeholder="Ex: 17" style={INPUT_STYLE} />
                              </Field>
                            </div>
                          </div>

                          {/* Pressão e temperatura de operação */}
                          <div style={{ background: `${COLORS.orange}08`, border: `1px solid ${COLORS.orange}25`, borderRadius: 10, padding: '14px 14px 10px', marginBottom: 12 }}>
                            <SectionLabel color={COLORS.orange}>Pressão &amp; Temperatura de Operação</SectionLabel>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                              <Field label="Pressão Fria de Trabalho (PSI)" textMuted={COLORS.textMuted}>
                                <input type="number" step="0.5" value={entry.pressaoFria}
                                  onChange={(e) => updateCompoundField(entry.id, 'pressaoFria', e.target.value)}
                                  placeholder="—" style={INPUT_STYLE} />
                              </Field>
                              <Field label="Pressão Quente de Trabalho (PSI)" textMuted={COLORS.textMuted}>
                                <input type="number" step="0.5" value={entry.pressaoQuente}
                                  onChange={(e) => updateCompoundField(entry.id, 'pressaoQuente', e.target.value)}
                                  placeholder="—" style={INPUT_STYLE} />
                              </Field>
                              <Field label="Temp. Mínima de Operação (°C)" labelColor={COLORS.blue} textMuted={COLORS.textMuted}>
                                <input type="number" step="1" value={entry.tempMinOp}
                                  onChange={(e) => updateCompoundField(entry.id, 'tempMinOp', e.target.value)}
                                  placeholder="—" style={INPUT_STYLE} />
                              </Field>
                              <Field label="Temp. Máxima de Operação (°C)" labelColor={COLORS.orange} textMuted={COLORS.textMuted}>
                                <input type="number" step="1" value={entry.tempMaxOp}
                                  onChange={(e) => updateCompoundField(entry.id, 'tempMaxOp', e.target.value)}
                                  placeholder="—" style={INPUT_STYLE} />
                              </Field>
                            </div>
                          </div>

                          {/* Comportamento dinâmico */}
                          <div style={{ background: `${COLORS.green}08`, border: `1px solid ${COLORS.green}25`, borderRadius: 10, padding: '14px 14px 10px', marginBottom: 12 }}>
                          <SectionLabel color={COLORS.green}>Comportamento Dinâmico</SectionLabel>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                            <Field label="Slip Angle Ótimo (°)" textMuted={COLORS.textMuted}>
                              <input type="number" step="0.1"
                                value={(() => {
                                  if (entry.slipAngleOtimo !== '') return entry.slipAngleOtimo;
                                  const B=parseFloat(entry.pBLat),C=parseFloat(entry.pCLat),D=parseFloat(entry.pDLat),E=parseFloat(entry.pELat);
                                  if([B,C,D,E].some(isNaN)) return '';
                                  const mf = (b,c,d,e,x) => d*Math.sin(c*Math.atan(b*x-e*(b*x-Math.atan(b*x))));
                                  let bestDeg=0, bestFy=-Infinity;
                                  for(let i=0;i<=80;i++){
                                    const deg=-20+i*0.5;
                                    const fy=mf(B,C,D,E,deg*Math.PI/180);
                                    if(fy>bestFy){bestFy=fy;bestDeg=deg;}
                                  }
                                  return bestDeg.toFixed(1);
                                })()}
                                onChange={(e) => updateCompoundField(entry.id, 'slipAngleOtimo', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                            <Field label="Slip Ratio Ótimo (%)" textMuted={COLORS.textMuted}>
                              <input type="number" step="0.1"
                                value={(() => {
                                  if (entry.slipRatioOtimo !== '') return entry.slipRatioOtimo;
                                  const B=parseFloat(entry.pBLong),C=parseFloat(entry.pCLong),D=parseFloat(entry.pDLong),E=parseFloat(entry.pELong);
                                  if([B,C,D,E].some(isNaN)) return '';
                                  const mf = (b,c,d,e,x) => d*Math.sin(c*Math.atan(b*x-e*(b*x-Math.atan(b*x))));
                                  let bestPct=0, bestFx=-Infinity;
                                  for(let i=0;i<=60;i++){
                                    const pct=-15+i*0.5;
                                    const fx=mf(B,C,D,E,pct/100);
                                    if(fx>bestFx){bestFx=fx;bestPct=pct;}
                                  }
                                  return bestPct.toFixed(1);
                                })()}
                                onChange={(e) => updateCompoundField(entry.id, 'slipRatioOtimo', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                            <Field label="μ Longitudinal" textMuted={COLORS.textMuted}>
                              <input type="number" step="0.01" value={entry.muLong}
                                onChange={(e) => updateCompoundField(entry.id, 'muLong', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                            <Field label="μ Lateral" textMuted={COLORS.textMuted}>
                              <input type="number" step="0.01" value={entry.muLat}
                                onChange={(e) => updateCompoundField(entry.id, 'muLat', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                            <Field label="Rigidez Cornering CN (N/°)" textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.corneringStiffness}
                                onChange={(e) => updateCompoundField(entry.id, 'corneringStiffness', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                            <Field label="Camber Thrust (N/°)" textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.camberThrust}
                                onChange={(e) => updateCompoundField(entry.id, 'camberThrust', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                            <Field label="Self-aligning Torque Mz (ref.)" textMuted={COLORS.textMuted}>
                              <input type="number" step="0.1" value={entry.mzRef}
                                onChange={(e) => updateCompoundField(entry.id, 'mzRef', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                          </div>
                          </div>

                          {/* Degradação */}
                          <div style={{ background: `${COLORS.accent}08`, border: `1px solid ${COLORS.accent}25`, borderRadius: 10, padding: '14px 14px 10px', marginBottom: 12 }}>
                          <SectionLabel color={COLORS.accent}>Degradação &amp; Gestão</SectionLabel>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                            <Field label="Temperatura de Pico / Cliff (°C)" labelColor={COLORS.accent} textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.tempPico}
                                onChange={(e) => updateCompoundField(entry.id, 'tempPico', e.target.value)}
                                placeholder="—" style={{ ...INPUT_STYLE, borderColor: `${COLORS.accent}60` }} />
                            </Field>
                            <Field label="Voltas de Vida Útil" textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.voltasUteis}
                                onChange={(e) => updateCompoundField(entry.id, 'voltasUteis', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                            <Field label="Degradação (s/volta)" labelColor={COLORS.cyan} textMuted={COLORS.textMuted}>
                              <input type="number" step="0.01" value={entry.degradacaoSPorVolta}
                                onChange={(e) => updateCompoundField(entry.id, 'degradacaoSPorVolta', e.target.value)}
                                placeholder="Ex: 0.05" style={{ ...INPUT_STYLE, borderColor: `${COLORS.cyan}60` }} />
                            </Field>
                            <Field label="Voltas de Warm-Up" textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.voltasWarmUp}
                                onChange={(e) => updateCompoundField(entry.id, 'voltasWarmUp', e.target.value)}
                                placeholder="Ex: 2" style={INPUT_STYLE} />
                            </Field>
                            <Field label="Voltas na Janela Ótima" textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.voltasOtimas}
                                onChange={(e) => updateCompoundField(entry.id, 'voltasOtimas', e.target.value)}
                                placeholder="Ex: 8" style={INPUT_STYLE} />
                            </Field>
                            <Field label="Volta do Cliff" labelColor={COLORS.accent} textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.voltaCliff}
                                onChange={(e) => updateCompoundField(entry.id, 'voltaCliff', e.target.value)}
                                placeholder="Ex: 15" style={{ ...INPUT_STYLE, borderColor: `${COLORS.accent}60` }} />
                            </Field>
                            <Field label="Degradação Pós-Cliff (s/volta)" labelColor={COLORS.accent} textMuted={COLORS.textMuted}>
                              <input type="number" step="0.01" value={entry.degradacaoPosCliff}
                                onChange={(e) => updateCompoundField(entry.id, 'degradacaoPosCliff', e.target.value)}
                                placeholder="Ex: 0.4" style={{ ...INPUT_STYLE, borderColor: `${COLORS.accent}60` }} />
                            </Field>
                            <Field label="Temp. Risco de Graining (°C)" labelColor={COLORS.yellow} textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.tempGraining}
                                onChange={(e) => updateCompoundField(entry.id, 'tempGraining', e.target.value)}
                                placeholder="—" style={{ ...INPUT_STYLE, borderColor: `${COLORS.yellow}60` }} />
                            </Field>
                            <Field label="Temp. Risco de Blistering (°C)" labelColor={COLORS.accent} textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.tempBlistering}
                                onChange={(e) => updateCompoundField(entry.id, 'tempBlistering', e.target.value)}
                                placeholder="—" style={{ ...INPUT_STYLE, borderColor: `${COLORS.accent}60` }} />
                            </Field>
                            <Field label="Tire Stagger (mm)" textMuted={COLORS.textMuted}>
                              <input type="number" step="0.1" value={entry.stagger}
                                onChange={(e) => updateCompoundField(entry.id, 'stagger', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                            <Field label="Rigidez Carcaça Lateral (N/mm)" textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.carcassLateral}
                                onChange={(e) => updateCompoundField(entry.id, 'carcassLateral', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                            <Field label="Rigidez Carcaça Radial (N/mm)" textMuted={COLORS.textMuted}>
                              <input type="number" step="1" value={entry.carcassRadial}
                                onChange={(e) => updateCompoundField(entry.id, 'carcassRadial', e.target.value)}
                                placeholder="—" style={INPUT_STYLE} />
                            </Field>
                            <Field label="Degradação Térmica (%/°C acima do cliff)" labelColor={COLORS.accent} textMuted={COLORS.textMuted}>
                              <input type="number" step="0.1" value={entry.degradacaoTermica}
                                onChange={(e) => updateCompoundField(entry.id, 'degradacaoTermica', e.target.value)}
                                placeholder="Ex: 2" style={{ ...INPUT_STYLE, borderColor: `${COLORS.accent}40` }} />
                            </Field>
                            <Field label="Graining — Severidade" labelColor={COLORS.yellow} textMuted={COLORS.textMuted}>
                              <select value={entry.grainingRisco}
                                onChange={(e) => updateCompoundField(entry.id, 'grainingRisco', e.target.value)}
                                style={{ ...SELECT_STYLE, borderColor: entry.grainingRisco ? `${COLORS.yellow}60` : undefined }}>
                                <option value="">—</option>
                                <option value="baixo">Baixo</option>
                                <option value="medio">Médio</option>
                                <option value="alto">Alto</option>
                              </select>
                            </Field>
                            <Field label="Blistering — Severidade" labelColor={COLORS.accent} textMuted={COLORS.textMuted}>
                              <select value={entry.blisteringRisco}
                                onChange={(e) => updateCompoundField(entry.id, 'blisteringRisco', e.target.value)}
                                style={{ ...SELECT_STYLE, borderColor: entry.blisteringRisco === 'alto' ? `${COLORS.accent}60` : undefined }}>
                                <option value="">—</option>
                                <option value="baixo">Baixo</option>
                                <option value="medio">Médio</option>
                                <option value="alto">Alto</option>
                              </select>
                            </Field>
                          </div>
                          </div>

                          <Field label="Notas / Observações" textMuted={COLORS.textMuted}>
                            <textarea value={entry.notes}
                              onChange={(e) => updateCompoundField(entry.id, 'notes', e.target.value)}
                              placeholder="Notas sobre o comportamento do composto..."
                              rows={2} style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit' }} />
                          </Field>

                          {/* ── Modelo Pacejka (colapsável) ── */}
                          <PacejkaBlock
                            entry={entry}
                            expandedPacejka={expandedPacejka}
                            setExpandedPacejka={setExpandedPacejka}
                            updateCompoundField={updateCompoundField}
                            COLORS={COLORS}
                            INPUT_STYLE={INPUT_STYLE}
                            SELECT_STYLE={SELECT_STYLE}
                          />
                          <CamberMuBlock
                            entry={entry}
                            updateCompoundField={updateCompoundField}
                            COLORS={COLORS}
                            INPUT_STYLE={INPUT_STYLE}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {compoundLibrary.length === 0 && (
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 10 }}>
                Registre as especificações dos compostos utilizados. Esses dados ficam salvos por perfil e servem como referência para o Comparativo de Saídas.
              </div>
            )}

            <button onClick={addCompoundEntry}
              style={{
                padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: `${COLORS.blue}15`, color: COLORS.blue,
                border: `1px solid ${COLORS.blue}40`, cursor: 'pointer',
              }}>
              + Adicionar composto
            </button>
          </>
        )}
      </div>

      {/* ── Composto e Pressões ── */}
      <div style={{ ...theme.card, background: COLORS.bgCard }}>
        <div style={theme.cardTitle}>🏎️ Dados dos Pneus</div>

        {/* Composto */}
        <div style={{ marginBottom: 20 }}>
          <Field label="Composto" textMuted={COLORS.textMuted}>
            <select
              value={tyres.compound}
              onChange={(e) => { setTyres((p) => ({ ...p, compound: e.target.value })); setSaved(false); }}
              style={SELECT_STYLE}
            >
              {COMPOUND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {tyres.compound === 'other' && (
              <input type="text" value={tyres.compoundOther}
                onChange={(e) => { setTyres((p) => ({ ...p, compoundOther: e.target.value })); setSaved(false); }}
                placeholder="Descreva o composto..."
                style={{ ...INPUT_STYLE, marginTop: 8 }} />
            )}
          </Field>
        </div>

        {/* Pressões por posição */}
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 10 }}>
          Pressões (psi) — Pf = fria antes de sair · Pq = quando o carro volta · T = pressão ideal
        </div>

        {/* Diagrama visual do carro */}
        <div style={{
          display: 'grid',
          gridTemplateAreas: '"fl fr" "rl rr"',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          maxWidth: 680,
          margin: '0 auto 8px',
        }}>
          {TYRE_POSITIONS.map((pos) => (
            <div key={pos.key} style={{
              gridArea: pos.key,
              background: `${COLORS.bgCard}`,
              border: `1px solid ${COLORS.borderLight}`,
              borderRadius: 10,
              padding: '12px 16px',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.green, marginBottom: 8 }}>
                {pos.label}
                <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 400, marginLeft: 6 }}>
                  {pos.fullLabel}
                </span>
              </div>

              {/* Pf + Pq */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <Label>Pf — Fria (psi)</Label>
                  <input type="number" step="0.5" min="0" max="80"
                    value={tyres[pos.key]?.cold || ''}
                    onChange={(e) => updateTyre(pos.key, 'cold', e.target.value)}
                    placeholder="—" style={INPUT_STYLE} />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Pq — Volta (psi)</Label>
                  <input type="number" step="0.5" min="0" max="80"
                    value={tyres[pos.key]?.hot || ''}
                    onChange={(e) => updateTyre(pos.key, 'hot', e.target.value)}
                    placeholder="—" style={INPUT_STYLE} />
                </div>
              </div>

              {/* Ideal (T) */}
              <div style={{ marginBottom: 10 }}>
                <Label color={COLORS.purple} textMuted={COLORS.textMuted}>T — Ideal (psi)</Label>
                <input type="number" step="0.5" min="0" max="80"
                  value={tyres[pos.key]?.ideal || ''}
                  onChange={(e) => updateTyre(pos.key, 'ideal', e.target.value)}
                  placeholder="—"
                  style={{ ...INPUT_STYLE, borderColor: `${COLORS.purple}60` }} />
              </div>

              {/* Temperatura por zona */}
              <div style={{ borderTop: `1px solid ${COLORS.border}30`, paddingTop: 8 }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Temp. Zona (°C) — Int / Cen / Ext
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[
                    { field: 'zoneInner',  label: 'Int.' },
                    { field: 'zoneCenter', label: 'Cen.' },
                    { field: 'zoneOuter',  label: 'Ext.' },
                  ].map(({ field, label }) => (
                    <div key={field}>
                      <label style={{ fontSize: 9, color: COLORS.textMuted, display: 'block', marginBottom: 2, textTransform: 'uppercase' }}>
                        {label}
                      </label>
                      <input type="number" step="1"
                        value={tyres[pos.key]?.[field] || ''}
                        onChange={(e) => updateTyre(pos.key, field, e.target.value)}
                        placeholder="°C"
                        style={{ ...INPUT_STYLE, padding: '4px 6px', fontSize: 11 }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabela T / E / V */}
        {hasTEV && (
          <div style={{
            marginTop: 16,
            background: `${COLORS.bgCard}`,
            border: `1px solid ${COLORS.borderLight}`,
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr',
              background: `${COLORS.purple}18`, borderBottom: `1px solid ${COLORS.purple}30`,
              padding: '8px 14px',
            }}>
              {['Pneu', 'T (psi)', 'E = T − Pq', 'V = Pq − Pf'].map((h) => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: COLORS.purple }}>{h}</div>
              ))}
            </div>

            {tevRows.map((row, i) => (
              <div key={row.pos.key} style={{
                display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr',
                padding: '9px 14px',
                borderBottom: i < tevRows.length - 1 ? `1px solid ${COLORS.border}22` : 'none',
                alignItems: 'center',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.green }}>{row.pos.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                  {row.t !== null ? row.t.toFixed(2) : <span style={{ color: COLORS.textMuted }}>—</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: row.eVal !== null ? colorE(row.eVal, COLORS) : COLORS.textMuted }}>
                  {row.eVal !== null
                    ? <>{fmtDelta(row.eVal)} <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>psi</span></>
                    : '—'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: row.vVal !== null ? colorV(row.vVal, COLORS) : COLORS.textMuted }}>
                  {row.vVal !== null
                    ? <>{fmtDelta(row.vVal)} <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>psi</span></>
                    : '—'}
                </div>
              </div>
            ))}

            <div style={{
              padding: '7px 14px', background: `${COLORS.bg}80`,
              borderTop: `1px solid ${COLORS.border}22`,
              display: 'flex', gap: 18, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                <b style={{ color: COLORS.purple }}>T</b> = Pressão Ideal &nbsp;|&nbsp;
                <b style={{ color: COLORS.purple }}>Pf</b> = Fria (antes de sair) &nbsp;|&nbsp;
                <b style={{ color: COLORS.purple }}>Pq</b> = Quando o carro volta
              </span>
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                <b style={{ color: COLORS.purple }}>E</b> = T − Pq
                &nbsp;·&nbsp;<span style={{ color: COLORS.green }}>±0–0.75 psi</span> ótimo
                {' · '}<span style={{ color: COLORS.yellow }}>0.75–2.0 psi</span> aceitável
                {' · '}<span style={{ color: COLORS.accent }}>&gt;2.0 psi</span> atenção
              </span>
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                <b style={{ color: COLORS.purple }}>V</b> = Pq − Pf &nbsp;(build-up de pressão)
              </span>
            </div>
          </div>
        )}

        {/* Resumo de variação cold→hot */}
        {TYRE_POSITIONS.some((p) => tyres[p.key]?.cold && tyres[p.key]?.hot) && (
          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: `${COLORS.purple}10`, border: `1px solid ${COLORS.purple}30`, borderRadius: 8,
          }}>
            <div style={{ fontSize: 11, color: COLORS.purple, fontWeight: 700, marginBottom: 8 }}>
              Δ Pressão (Pf → Pq)
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {TYRE_POSITIONS.map((pos) => {
                const cold = parseFloat(tyres[pos.key]?.cold);
                const hot  = parseFloat(tyres[pos.key]?.hot);
                if (isNaN(cold) || isNaN(hot)) return null;
                const delta = (hot - cold).toFixed(2);
                const ok    = hot - cold >= 1.5 && hot - cold <= 7.0;
                return (
                  <div key={pos.key} style={{ fontSize: 12 }}>
                    <span style={{ color: COLORS.textMuted }}>{pos.label}: </span>
                    <span style={{ color: ok ? COLORS.green : COLORS.yellow, fontWeight: 700 }}>
                      +{delta} psi {ok ? '✓' : '⚠'}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>
              Referência ideal: +1.5 a +7.0 psi de build-up de pressão a quente
            </div>
          </div>
        )}
      </div>

      {/* ── Condições Ambientais ── */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>🌡️ Condições da Pista e Ambiente</div>

        {/* ── Box de importação do log de temperatura ── */}
        <div style={{
          marginBottom: 16, padding: '12px 14px',
          background: `${COLORS.orange}0d`, border: `1px solid ${COLORS.orange}30`, borderRadius: 8,
        }}>
          <span style={{ fontSize: 12, color: COLORS.orange, fontWeight: 600, display: 'block', marginBottom: 10 }}>
            🕐 Importar do registro de temperatura
          </span>
          {profileTempLog.length === 0 ? (
            <span style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' }}>
              Nenhum registro encontrado no Tab Temperatura. Adicione registros lá para importar aqui.
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, minWidth: 90 }}>Hora Inicial:</span>
                <select defaultValue="" onChange={(e) => {
                  const entry = profileTempLog.find((x) => x.id === e.target.value);
                  if (!entry) return;
                  setConditions((prev) => ({
                    ...prev,
                    trackTemp:   entry.track    != null ? String(entry.track)    : prev.trackTemp,
                    ambientTemp: entry.ambient  != null ? String(entry.ambient)  : prev.ambientTemp,
                    humidity:    entry.humidity != null ? String(entry.humidity) : prev.humidity,
                    horaInicial: entry.time     ? entry.time.substring(0, 5)     : prev.horaInicial,
                  }));
                  setSaved(false);
                  e.target.value = '';
                }} style={{ ...SELECT_STYLE, flex: '1 1 200px' }}>
                  <option value="">— Escolher registro —</option>
                  {profileTempLog.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.date ? entry.date.substring(8,10) + '/' + entry.date.substring(5,7) + ' ' : ''}
                      {entry.time}
                      {entry.track    != null ? ` · Pista ${entry.track}°C`  : ''}
                      {entry.ambient  != null ? ` · Amb. ${entry.ambient}°C` : ''}
                      {entry.humidity != null ? ` · ${entry.humidity}%`      : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, minWidth: 90 }}>Hora Final:</span>
                <select defaultValue="" onChange={(e) => {
                  const entry = profileTempLog.find((x) => x.id === e.target.value);
                  if (!entry) return;
                  setConditions((prev) => ({
                    ...prev,
                    trackTempFinal:   entry.track    != null ? String(entry.track)    : prev.trackTempFinal,
                    ambientTempFinal: entry.ambient  != null ? String(entry.ambient)  : prev.ambientTempFinal,
                    humidityFinal:    entry.humidity != null ? String(entry.humidity) : prev.humidityFinal,
                    horaFinal:        entry.time     ? entry.time.substring(0, 5)     : prev.horaFinal,
                  }));
                  setSaved(false);
                  e.target.value = '';
                }} style={{ ...SELECT_STYLE, flex: '1 1 200px' }}>
                  <option value="">— Escolher registro —</option>
                  {profileTempLog.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.date ? entry.date.substring(8,10) + '/' + entry.date.substring(5,7) + ' ' : ''}
                      {entry.time}
                      {entry.track    != null ? ` · Pista ${entry.track}°C`  : ''}
                      {entry.ambient  != null ? ` · Amb. ${entry.ambient}°C` : ''}
                      {entry.humidity != null ? ` · ${entry.humidity}%`      : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── Tabela Inicial / Final / Δ ── */}
        <div style={{ marginBottom: 16, overflowX: 'auto' }}>
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 13 }}>
            <colgroup>
              <col style={{ width: '32%' }} />
              <col style={{ width: '26%' }} />
              <col style={{ width: '26%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}></th>
                <th style={{ textAlign: 'center', padding: '6px 4px', color: COLORS.accent,    fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Inicial</th>
                <th style={{ textAlign: 'center', padding: '6px 4px', color: COLORS.orange,   fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Final</th>
                <th style={{ textAlign: 'center', padding: '6px 4px', color: COLORS.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Temp. Pista (°C)',    ini: 'trackTemp',   fin: 'trackTempFinal',   unit: '°C', xtKey: 'trackTemp' },
                { label: 'Temp. Ambiente (°C)', ini: 'ambientTemp', fin: 'ambientTempFinal', unit: '°C', xtKey: 'ambientTemp' },
                { label: 'Humidade (%)',         ini: 'humidity',    fin: 'humidityFinal',    unit: '%',  xtKey: 'humidity' },
                { label: 'Horário',             ini: 'horaInicial', fin: 'horaFinal',        unit: null, xtKey: null },
              ].map(({ label, ini, fin, unit, xtKey }) => {
                const vIni = conditions[ini];
                const vFin = conditions[fin];
                let delta = null;
                if (unit && vIni !== '' && vFin !== '') {
                  delta = (parseFloat(vFin) - parseFloat(vIni));
                }
                const isTimeField = unit === null;
                return (
                  <tr key={ini} style={{ borderTop: `1px solid ${COLORS.border}20` }}>
                    <td style={{ padding: '6px 8px', color: COLORS.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <input
                        type={isTimeField ? 'time' : 'number'}
                        step={unit === '%' ? '1' : '0.5'}
                        min={unit === '%' ? '0' : undefined}
                        max={unit === '%' ? '100' : undefined}
                        value={vIni}
                        onChange={(e) => updateCondition(ini, e.target.value)}
                        placeholder={xtKey && latestTemp?.[xtKey] ? String(latestTemp[xtKey]) : '—'}
                        style={{ ...INPUT_STYLE, textAlign: 'center', padding: '5px 4px', width: '100%' }} />
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <input
                        type={isTimeField ? 'time' : 'number'}
                        step={unit === '%' ? '1' : '0.5'}
                        min={unit === '%' ? '0' : undefined}
                        max={unit === '%' ? '100' : undefined}
                        value={vFin}
                        onChange={(e) => updateCondition(fin, e.target.value)}
                        placeholder="—"
                        style={{ ...INPUT_STYLE, textAlign: 'center', padding: '5px 4px', width: '100%' }} />
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {delta != null ? (
                        <span style={{
                          fontWeight: 700, fontSize: 13,
                          color: delta > 0 ? COLORS.accent : delta < 0 ? COLORS.blue : COLORS.textMuted,
                        }}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)}{unit}
                        </span>
                      ) : (
                        <span style={{ color: COLORS.border, fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Clima / Estado / Notas ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 16 }}>
          <Field label="Condição Clima" textMuted={COLORS.textMuted}>
            <select value={conditions.weather}
              onChange={(e) => updateCondition('weather', e.target.value)}
              style={SELECT_STYLE}>
              <option value="">— Selecionar —</option>
              <option value="dry_sunny">Seco / Sol</option>
              <option value="dry_cloudy">Seco / Nublado</option>
              <option value="damp">Meia-pista úmida</option>
              <option value="wet">Chuva Leve</option>
              <option value="heavy_rain">Chuva Forte</option>
            </select>
          </Field>
          <Field label="Estado da Pista" textMuted={COLORS.textMuted}>
            <select value={conditions.trackState}
              onChange={(e) => updateCondition('trackState', e.target.value)}
              style={SELECT_STYLE}>
              {TRACK_STATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {conditions.trackState === 'other' && (
              <input type="text" value={conditions.trackStateOther}
                onChange={(e) => updateCondition('trackStateOther', e.target.value)}
                placeholder="Descreva o estado da pista..."
                style={{ ...INPUT_STYLE, marginTop: 8 }} />
            )}
          </Field>
        </div>

        <Field label="Notas adicionais" textMuted={COLORS.textMuted}>
          <textarea value={conditions.notes}
            onChange={(e) => updateCondition('notes', e.target.value)}
            placeholder="Ex: pista com borracha nova no setor 2, correntes frias nas curvas 3 e 7..."
            rows={3} style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>
      </div>

      {/* ── Comparativo de Saídas ── */}
      <div style={theme.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={theme.cardTitle}>🔁 Comparativo de Saídas</div>
            {stints.length > 0 && (
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                ({stints.length} {stints.length === 1 ? 'saída' : 'saídas'})
              </span>
            )}
          </div>
          <button onClick={openNewStintForm}
            style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: `${COLORS.green}15`, color: COLORS.green,
              border: `1px solid ${COLORS.green}40`, cursor: 'pointer',
            }}>
            + Nova Saída
          </button>
        </div>

        {/* Formulário nova saída */}
        {showStintForm && (
          <div style={{
            border: `1px solid ${COLORS.green}50`, borderRadius: 10,
            padding: '14px 16px', marginBottom: 14,
            background: `${COLORS.green}06`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.green, marginBottom: 12 }}>
              Nova Saída
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
              <Field label="Label / Nome" textMuted={COLORS.textMuted}>
                <input type="text" value={newStint.label}
                  onChange={(e) => setNewStint((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Ex: Saída 1, TL1..." style={INPUT_STYLE} />
              </Field>
              <Field label="Horário" textMuted={COLORS.textMuted}>
                <input type="time" value={newStint.horario}
                  onChange={(e) => setNewStint((p) => ({ ...p, horario: e.target.value }))}
                  style={INPUT_STYLE} />
              </Field>
              <Field label="Temp. Pista (°C)" labelColor={COLORS.accent} textMuted={COLORS.textMuted}>
                <input type="number" step="0.5" value={newStint.trackTemp}
                  onChange={(e) => setNewStint((p) => ({ ...p, trackTemp: e.target.value }))}
                  placeholder="—" style={INPUT_STYLE} />
              </Field>
              <Field label="Temp. Ambiente (°C)" labelColor={COLORS.orange} textMuted={COLORS.textMuted}>
                <input type="number" step="0.5" value={newStint.ambientTemp}
                  onChange={(e) => setNewStint((p) => ({ ...p, ambientTemp: e.target.value }))}
                  placeholder="—" style={INPUT_STYLE} />
              </Field>
              <Field label="Composto" textMuted={COLORS.textMuted}>
                <select value={newStint.compostoId}
                  onChange={(e) => setNewStint((p) => ({ ...p, compostoId: e.target.value }))}
                  style={SELECT_STYLE}>
                  <option value="">— Selecionar —</option>
                  {compoundLibrary.map((c) => (
                    <option key={c.id} value={c.id}>{getCompoundDisplayName(c)}</option>
                  ))}
                  <option value="manual">Outro (manual)</option>
                </select>
              </Field>
              {newStint.compostoId === 'manual' && (
                <Field label="Composto (manual)" textMuted={COLORS.textMuted}>
                  <input type="text" value={newStint.compostoManual}
                    onChange={(e) => setNewStint((p) => ({ ...p, compostoManual: e.target.value }))}
                    placeholder="Ex: Slick macio" style={INPUT_STYLE} />
                </Field>
              )}
            </div>

            {/* Pressões frias */}
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Pressões Frias (Pf) — antes de sair
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              {TYRE_POSITIONS.map((pos) => (
                <div key={pos.key}>
                  <label style={{ fontSize: 11, color: COLORS.green, display: 'block', marginBottom: 3 }}>{pos.label}</label>
                  <input type="number" step="0.5" min="0"
                    value={newStint[`pf${pos.label}`]}
                    onChange={(e) => setNewStint((p) => ({ ...p, [`pf${pos.label}`]: e.target.value }))}
                    placeholder="PSI" style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12 }} />
                </div>
              ))}
            </div>

            <Field label="Observação" textMuted={COLORS.textMuted}>
              <textarea value={newStint.observacao}
                onChange={(e) => setNewStint((p) => ({ ...p, observacao: e.target.value }))}
                placeholder="Ex: condições especiais, pneu novo..."
                rows={2} style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={saveNewStint}
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: COLORS.green, color: '#fff', border: 'none', cursor: 'pointer' }}>
                Salvar Saída
              </button>
              <button onClick={() => setShowStintForm(false)}
                style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista de saídas */}
        {stints.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {stints.map((stint) => {
              const isExp     = expandedStint === stint.id;
              const buildUp   = stintBuildUp(stint);
              const compEntry = compoundLibrary.find((c) => c.id === stint.compostoId);
              const compLabel = compEntry
                ? getCompoundDisplayName(compEntry)
                : (stint.compostoManual || '');

              return (
                <div key={stint.id} style={{
                  border: `1px solid ${isExp ? COLORS.green + '60' : COLORS.border}`,
                  borderRadius: 10, overflow: 'hidden',
                }}>
                  {/* Cabeçalho */}
                  <div onClick={() => setExpandedStint(isExp ? null : stint.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', cursor: 'pointer',
                      background: isExp ? `${COLORS.green}08` : 'transparent',
                      borderBottom: isExp ? `1px solid ${COLORS.border}33` : 'none',
                    }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{stint.label}</span>
                        {stint.horario && (
                          <span style={{ fontSize: 11, color: COLORS.textMuted }}>⏱ {stint.horario}</span>
                        )}
                        {stint.trackTemp && (
                          <span style={{ fontSize: 11, background: `${COLORS.accent}18`, color: COLORS.accent, padding: '1px 6px', borderRadius: 4 }}>
                            Pista {stint.trackTemp}°C
                          </span>
                        )}
                        {stint.ambientTemp && (
                          <span style={{ fontSize: 11, background: `${COLORS.orange}18`, color: COLORS.orange, padding: '1px 6px', borderRadius: 4 }}>
                            Amb. {stint.ambientTemp}°C
                          </span>
                        )}
                        {compLabel && (
                          <span style={{ fontSize: 11, background: `${COLORS.green}18`, color: COLORS.green, padding: '1px 6px', borderRadius: 4 }}>
                            {compLabel}
                          </span>
                        )}
                        {stint.parcialTroca && (
                          <span style={{ fontSize: 11, background: `${COLORS.yellow}18`, color: COLORS.yellow, padding: '1px 6px', borderRadius: 4 }}>
                            ⚠ Troca parcial{stint.parcialCanto ? ` — ${stint.parcialCanto}` : ''}
                          </span>
                        )}
                      </div>
                      {buildUp.length > 0 && (
                        <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                          {buildUp.map(({ label, v }) => (
                            <span key={label} style={{ fontSize: 11, color: COLORS.textMuted }}>
                              {label}: <span style={{ color: v >= 1.5 && v <= 7 ? COLORS.green : COLORS.yellow, fontWeight: 700 }}>
                                {v >= 0 ? '+' : ''}{v.toFixed(1)} psi
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={(e) => { e.stopPropagation(); deleteStint(stint.id); }}
                        style={{ background: 'transparent', border: 'none', color: COLORS.accent, cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>
                        ×
                      </button>
                      <span style={{ fontSize: 11, color: COLORS.textMuted }}>{isExp ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Painel de edição */}
                  {isExp && (
                    <div style={{ padding: '14px 16px' }}>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
                        <Field label="Label" textMuted={COLORS.textMuted}>
                          <input type="text" value={stint.label}
                            onChange={(e) => updateStintField(stint.id, 'label', e.target.value)}
                            style={INPUT_STYLE} />
                        </Field>
                        <Field label="Horário" textMuted={COLORS.textMuted}>
                          <input type="time" value={stint.horario}
                            onChange={(e) => updateStintField(stint.id, 'horario', e.target.value)}
                            style={INPUT_STYLE} />
                        </Field>
                        <Field label="Temp. Pista (°C)" labelColor={COLORS.accent} textMuted={COLORS.textMuted}>
                          <input type="number" step="0.5" value={stint.trackTemp}
                            onChange={(e) => updateStintField(stint.id, 'trackTemp', e.target.value)}
                            placeholder="—" style={INPUT_STYLE} />
                        </Field>
                        <Field label="Temp. Ambiente (°C)" labelColor={COLORS.orange} textMuted={COLORS.textMuted}>
                          <input type="number" step="0.5" value={stint.ambientTemp}
                            onChange={(e) => updateStintField(stint.id, 'ambientTemp', e.target.value)}
                            placeholder="—" style={INPUT_STYLE} />
                        </Field>
                        <Field label="Voltas" textMuted={COLORS.textMuted}>
                          <input type="number" step="1" min="0" value={stint.voltas}
                            onChange={(e) => updateStintField(stint.id, 'voltas', e.target.value)}
                            placeholder="—" style={INPUT_STYLE} />
                        </Field>
                        <Field label="Composto" textMuted={COLORS.textMuted}>
                          <select value={stint.compostoId}
                            onChange={(e) => updateStintField(stint.id, 'compostoId', e.target.value)}
                            style={SELECT_STYLE}>
                            <option value="">— Selecionar —</option>
                            {compoundLibrary.map((c) => (
                              <option key={c.id} value={c.id}>{getCompoundDisplayName(c)}</option>
                            ))}
                            <option value="manual">Outro (manual)</option>
                          </select>
                        </Field>
                        {stint.compostoId === 'manual' && (
                          <Field label="Composto (manual)" textMuted={COLORS.textMuted}>
                            <input type="text" value={stint.compostoManual}
                              onChange={(e) => updateStintField(stint.id, 'compostoManual', e.target.value)}
                              style={INPUT_STYLE} />
                          </Field>
                        )}
                      </div>

                      {/* Pressões por canto: Pf e Pq lado a lado */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        <div>
                          <SectionLabel color={COLORS.textMuted}>Pf — Fria (antes de sair)</SectionLabel>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {TYRE_POSITIONS.map((pos) => (
                              <div key={pos.key}>
                                <label style={{ fontSize: 11, color: COLORS.green, display: 'block', marginBottom: 3 }}>{pos.label}</label>
                                <input type="number" step="0.5" min="0"
                                  value={stint[`pf${pos.label}`] || ''}
                                  onChange={(e) => updateStintField(stint.id, `pf${pos.label}`, e.target.value)}
                                  placeholder="PSI" style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12 }} />
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <SectionLabel color={COLORS.textMuted}>Pq — Quente (ao retornar)</SectionLabel>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {TYRE_POSITIONS.map((pos) => (
                              <div key={pos.key}>
                                <label style={{ fontSize: 11, color: COLORS.purple, display: 'block', marginBottom: 3 }}>{pos.label}</label>
                                <input type="number" step="0.5" min="0"
                                  value={stint[`pq${pos.label}`] || ''}
                                  onChange={(e) => updateStintField(stint.id, `pq${pos.label}`, e.target.value)}
                                  placeholder="PSI" style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12 }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Temperatura por zona */}
                      <SectionLabel color={COLORS.textMuted}>Temperatura por Zona (°C) — Interno / Central / Externo</SectionLabel>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        {TYRE_POSITIONS.map((pos) => {
                          const zKey  = `z${pos.key.charAt(0).toUpperCase()}${pos.key.slice(1)}`;
                          const zone  = stint[zKey] || { inner: '', center: '', outer: '' };
                          return (
                            <div key={pos.key}>
                              <label style={{ fontSize: 12, color: COLORS.green, fontWeight: 700, display: 'block', marginBottom: 5 }}>{pos.label}</label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                                {[['inner', 'Int'], ['center', 'Cen'], ['outer', 'Ext']].map(([zk, zlabel]) => (
                                  <div key={zk}>
                                    <label style={{ fontSize: 9, color: COLORS.textMuted, display: 'block', marginBottom: 2, textTransform: 'uppercase' }}>
                                      {zlabel}
                                    </label>
                                    <input type="number" step="1" value={zone[zk] || ''}
                                      onChange={(e) => updateStintZone(stint.id, pos.key, zk, e.target.value)}
                                      placeholder="°C" style={{ ...INPUT_STYLE, padding: '4px 6px', fontSize: 11 }} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Troca parcial */}
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: COLORS.textSecondary }}>
                          <input type="checkbox"
                            checked={stint.parcialTroca}
                            onChange={(e) => updateStintField(stint.id, 'parcialTroca', e.target.checked)}
                            style={{ cursor: 'pointer' }} />
                          Troca parcial de pneu durante a saída
                        </label>
                        {stint.parcialTroca && (
                          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                            <div style={{ flex: '0 0 80px' }}>
                              <label style={{ fontSize: 10, color: COLORS.yellow, display: 'block', marginBottom: 3 }}>Canto</label>
                              <select value={stint.parcialCanto}
                                onChange={(e) => updateStintField(stint.id, 'parcialCanto', e.target.value)}
                                style={{ ...SELECT_STYLE, padding: '5px 8px', fontSize: 12 }}>
                                <option value="">—</option>
                                <option value="FL">FL</option>
                                <option value="FR">FR</option>
                                <option value="RL">RL</option>
                                <option value="RR">RR</option>
                              </select>
                            </div>
                            <div style={{ flex: '0 0 100px' }}>
                              <label style={{ fontSize: 10, color: COLORS.yellow, display: 'block', marginBottom: 3 }}>Volta da troca</label>
                              <input type="number" step="1" min="1" value={stint.parcialVolta}
                                onChange={(e) => updateStintField(stint.id, 'parcialVolta', e.target.value)}
                                placeholder="—" style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12 }} />
                            </div>
                            <div style={{ flex: '1 1 140px' }}>
                              <label style={{ fontSize: 10, color: COLORS.yellow, display: 'block', marginBottom: 3 }}>Composto substituto</label>
                              <input type="text" value={stint.parcialComposto}
                                onChange={(e) => updateStintField(stint.id, 'parcialComposto', e.target.value)}
                                placeholder="Ex: Slick médio" style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12 }} />
                            </div>
                          </div>
                        )}
                      </div>

                      <Field label="Observação" textMuted={COLORS.textMuted}>
                        <textarea value={stint.observacao}
                          onChange={(e) => updateStintField(stint.id, 'observacao', e.target.value)}
                          placeholder="Notas sobre esta saída..."
                          rows={2} style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit' }} />
                      </Field>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {stints.length === 0 && !showStintForm && (
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            Registre cada saída manualmente para comparar o comportamento dos pneus ao longo do evento. Os dados de temp. de pista são preenchidos automaticamente com as condições atuais.
          </div>
        )}

        {/* Tabela comparativa — aparece com 2+ saídas */}
        {stints.length >= 2 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, margin: '16px 0 10px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Comparativo
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: COLORS.textMuted, fontWeight: 700 }}>Saída</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', color: COLORS.accent, fontWeight: 700 }}>Pista (°C)</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', color: COLORS.orange, fontWeight: 700 }}>Amb. (°C)</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', color: COLORS.green, fontWeight: 700 }}>Δ FL</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', color: COLORS.green, fontWeight: 700 }}>Δ FR</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', color: COLORS.green, fontWeight: 700 }}>Δ RL</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', color: COLORS.green, fontWeight: 700 }}>Δ RR</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', color: COLORS.textMuted, fontWeight: 700 }}>Voltas</th>
                  </tr>
                </thead>
                <tbody>
                  {stints.map((stint, si) => {
                    const prev          = si > 0 ? stints[si - 1] : null;
                    const trackNum      = parseFloat(stint.trackTemp);
                    const prevTrackNum  = prev ? parseFloat(prev.trackTemp) : null;
                    const deltaTrack    = (prev && !isNaN(trackNum) && !isNaN(prevTrackNum))
                      ? trackNum - prevTrackNum : null;

                    return (
                      <tr key={stint.id} style={{
                        borderBottom: `1px solid ${COLORS.border}22`,
                        background: si % 2 === 0 ? 'transparent' : `${COLORS.bgCard}50`,
                      }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                          {stint.label}
                          {stint.horario && <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 6 }}>{stint.horario}</span>}
                        </td>
                        {/* Temp pista com delta em relação à saída anterior */}
                        <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                          {stint.trackTemp ? (
                            <div>
                              <span style={{ fontWeight: 700, color: COLORS.accent }}>{stint.trackTemp}°C</span>
                              {deltaTrack !== null && (
                                <span style={{
                                  fontSize: 10, marginLeft: 5, fontWeight: 700,
                                  color: Math.abs(deltaTrack) < 1
                                    ? COLORS.textMuted
                                    : deltaTrack > 0 ? COLORS.accent : COLORS.blue,
                                }}>
                                  {deltaTrack > 0 ? '+' : ''}{deltaTrack.toFixed(1)}°
                                </span>
                              )}
                            </div>
                          ) : <span style={{ color: COLORS.textMuted }}>—</span>}
                        </td>
                        {/* Temp ambiente */}
                        <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                          {stint.ambientTemp
                            ? <span style={{ color: COLORS.orange }}>{stint.ambientTemp}°C</span>
                            : <span style={{ color: COLORS.textMuted }}>—</span>}
                        </td>
                        {/* Build-up por canto */}
                        {TYRE_POSITIONS.map((pos) => {
                          const pf = parseFloat(stint[`pf${pos.label}`]);
                          const pq = parseFloat(stint[`pq${pos.label}`]);
                          const v  = (!isNaN(pf) && !isNaN(pq)) ? pq - pf : null;
                          return (
                            <td key={pos.key} style={{ textAlign: 'center', padding: '8px 10px' }}>
                              {v !== null
                                ? <span style={{ color: v >= 1.5 && v <= 7 ? COLORS.green : COLORS.yellow, fontWeight: 700 }}>
                                    {v >= 0 ? '+' : ''}{v.toFixed(1)}
                                  </span>
                                : <span style={{ color: COLORS.textMuted }}>—</span>}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center', padding: '8px 10px', color: COLORS.textMuted }}>
                          {stint.voltas || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6 }}>
                Δ = build-up de pressão (Pq − Pf) por canto &nbsp;·&nbsp;
                <span style={{ color: COLORS.green }}>verde</span> = dentro do range ideal (1.5–7 psi) &nbsp;·&nbsp;
                temp. de pista: delta em relação à saída anterior
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Quilometragem dos Pneus ── */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>📏 Quilometragem dos Pneus</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>
          Acompanhe os km acumulados por conjunto. O campo <b style={{ color: COLORS.textSecondary }}>Km Antes</b> no inventário define o ponto de partida; aqui você registra os km de cada sessão.
        </div>

        {inventory.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '6px 0' }}>
            Adicione conjuntos no <b style={{ color: COLORS.textSecondary }}>Inventário de Pneus</b> para começar a rastrear quilometragem.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {inventory.map((row, idx) => {
              const name      = row.compound?.trim() || `Conjunto ${idx + 1}`;
              const totalKm   = getTotalKm(row);
              const expanded  = entryRowId === row.id;
              const sessionKm = (row.kmEntries || []).reduce((s, e) => s + (parseFloat(e.km) || 0), 0);

              return (
                <div key={row.id} style={{
                  border: `1px solid ${expanded ? COLORS.green + '60' : COLORS.border}`,
                  borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s',
                }}>
                  {/* Cabeçalho do conjunto */}
                  <div onClick={() => expanded ? setEntryRowId(null) : openEntryRow(row.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', cursor: 'pointer',
                      background: expanded ? `${COLORS.green}10` : 'transparent',
                      borderBottom: expanded ? `1px solid ${COLORS.border}33` : 'none',
                    }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span>
                      {row.qty && (
                        <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8 }}>
                          ({row.qty} pneu{row.qty !== '1' ? 's' : ''})
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: totalKm > 0 ? COLORS.green : COLORS.textMuted }}>
                          {totalKm.toFixed(0)} km
                        </div>
                        {(row.kmEntries || []).length > 0 && (
                          <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                            base {parseFloat(row.kmAntes) || 0} + sessões {sessionKm.toFixed(0)}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: COLORS.textMuted }}>{expanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Painel expandido */}
                  {expanded && (
                    <div style={{ padding: '12px 14px' }}>

                      {/* Lista de entradas */}
                      {(row.kmEntries || []).length > 0 && (
                        <div style={{ marginBottom: 12, border: `1px solid ${COLORS.border}22`, borderRadius: 7, overflow: 'hidden' }}>
                          {row.kmEntries.map((entry, ei) => (
                            <div key={entry.id} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '7px 10px',
                              background: ei % 2 === 0 ? 'transparent' : `${COLORS.bgCard}50`,
                              borderBottom: ei < row.kmEntries.length - 1 ? `1px solid ${COLORS.border}22` : 'none',
                              fontSize: 12,
                            }}>
                              <span style={{ color: COLORS.green, fontWeight: 700, minWidth: 64 }}>
                                +{parseFloat(entry.km).toFixed(0)} km
                              </span>
                              {entry.date && (
                                <span style={{ color: COLORS.textMuted, minWidth: 72 }}>
                                  {entry.date.substring(8, 10)}/{entry.date.substring(5, 7)}/{entry.date.substring(0, 4)}
                                </span>
                              )}
                              <span style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                {entry.event && <span style={{ color: COLORS.textSecondary }}>{entry.event}</span>}
                                {(entry.sessionRefs || []).map((sr) => (
                                  <span key={sr.id} style={{ fontSize: 10, background: `${COLORS.green}20`, color: COLORS.green, padding: '1px 5px', borderRadius: 4 }}>
                                    📊 {sr.name}
                                  </span>
                                ))}
                                {(entry.tireSetRefs || []).map((tr) => (
                                  <span key={tr.id} style={{ fontSize: 10, background: `${COLORS.blue}20`, color: COLORS.blue, padding: '1px 5px', borderRadius: 4 }}>
                                    🏎️ {tr.name}
                                  </span>
                                ))}
                              </span>
                              <button onClick={() => deleteKmEntry(row.id, entry.id)}
                                style={{ background: 'transparent', border: 'none', color: COLORS.accent, cursor: 'pointer', fontSize: 16, padding: '0 2px', marginLeft: 'auto', lineHeight: 1 }}>
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {(row.kmEntries || []).length === 0 && (
                        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>
                          Nenhuma sessão registrada ainda. Km base: <b style={{ color: COLORS.textSecondary }}>{parseFloat(row.kmAntes) || 0} km</b>
                        </div>
                      )}

                      {/* Picker: Sessões salvas */}
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                          Sessões salvas no perfil
                        </label>
                        <button
                          onClick={() => { setShowSessionPicker((v) => !v); setShowTireSetPicker(false); }}
                          style={{
                            width: '100%', padding: '7px 10px', borderRadius: 7, fontSize: 12,
                            background: selectedSessionIds.length > 0 ? `${COLORS.green}18` : 'transparent',
                            color: selectedSessionIds.length > 0 ? COLORS.green : COLORS.textSecondary,
                            border: `1px solid ${selectedSessionIds.length > 0 ? COLORS.green + '60' : COLORS.border}`,
                            cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                          <span>
                            {selectedSessionIds.length === 0
                              ? (sessionsWithKm.length === 0 ? 'Nenhuma sessão com km registrado' : '— Selecionar sessões —')
                              : `${selectedSessionIds.length} sessão(ões) selecionada(s)`}
                          </span>
                          <span style={{ fontSize: 10 }}>{showSessionPicker ? '▲' : '▼'}</span>
                        </button>

                        {showSessionPicker && sessionsWithKm.length > 0 && (
                          <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden', marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
                            {sessionsWithKm.map((s, si) => {
                              const checked = selectedSessionIds.includes(s.id);
                              return (
                                <div key={s.id} onClick={() => toggleSession(s)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px', cursor: 'pointer',
                                    background: checked ? `${COLORS.green}12` : (si % 2 === 0 ? 'transparent' : `${COLORS.bgCard}50`),
                                    borderBottom: si < sessionsWithKm.length - 1 ? `1px solid ${COLORS.border}22` : 'none',
                                  }}>
                                  <div style={{
                                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                                    border: `2px solid ${checked ? COLORS.green : COLORS.border}`,
                                    background: checked ? COLORS.green : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    {checked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                                  </div>
                                  <div style={{ flex: 1, fontSize: 12 }}>
                                    <span style={{ color: COLORS.textPrimary, fontWeight: checked ? 600 : 400 }}>{s.name}</span>
                                    {s.savedAt && (
                                      <span style={{ color: COLORS.textMuted, marginLeft: 6, fontSize: 11 }}>
                                        {new Date(s.savedAt).toLocaleDateString('pt-BR')}
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.green, flexShrink: 0 }}>
                                    {s.sessionKm} km
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Km + Data + Registrar */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', borderTop: `1px solid ${COLORS.border}22`, paddingTop: 10, marginTop: 2 }}>
                        <div style={{ flex: '0 0 110px' }}>
                          <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>
                            Km rodados
                            {selectedSessionIds.length > 0 && <span style={{ color: COLORS.green, marginLeft: 4 }}>● auto</span>}
                          </label>
                          <input type="number" min="0" step="0.1"
                            value={entryKm}
                            onChange={(e) => setEntryKm(e.target.value)}
                            placeholder="0"
                            style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12 }} />
                        </div>
                        <div style={{ flex: '0 0 130px' }}>
                          <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Data</label>
                          <input type="date"
                            value={entryDate}
                            onChange={(e) => setEntryDate(e.target.value)}
                            style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12 }} />
                        </div>
                        <div style={{ flex: '1 1 140px' }}>
                          <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Evento / Descrição</label>
                          <input type="text"
                            value={entryEvent}
                            onChange={(e) => setEntryEvent(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addKmEntry(row.id)}
                            placeholder="Ex: Treino livre 1"
                            style={{ ...INPUT_STYLE, padding: '5px 8px', fontSize: 12 }} />
                        </div>
                        <button onClick={() => addKmEntry(row.id)}
                          style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, background: COLORS.green, color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                          + Registrar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Salvar no Perfil ── */}
      <div style={{ background: `${COLORS.purple}0a`, border: `1px solid ${COLORS.purple}30`, borderRadius: 12, padding: '14px 16px', marginBottom: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.purple, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
          Salvar no Perfil
        </div>
        {profilesList.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            Crie um perfil na aba <b style={{ color: COLORS.textSecondary }}>Perfis</b> para poder salvar.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Perfil</label>
                <select
                  value={profileSaveTarget || activeProfileId || ''}
                  onChange={(e) => { setProfileSaveTarget(e.target.value); setSelectedGroupId(''); setProfileSaveMsg(null); }}
                  style={{ ...SELECT_STYLE, width: '100%' }}>
                  <option value="">— Selecionar —</option>
                  {profilesList.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '1 1 160px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Pasta / Etapa (opcional)</label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => { setSelectedGroupId(e.target.value); setProfileSaveMsg(null); }}
                  style={{ ...SELECT_STYLE, width: '100%' }}>
                  <option value="">— Sem pasta —</option>
                  {profileGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <button onClick={() => setShowNewGroupForm((v) => !v)}
                style={{ padding: '8px 12px', borderRadius: 7, fontSize: 12, background: 'transparent', color: COLORS.textSecondary, border: `1px solid ${COLORS.border}`, cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-end' }}>
                + Nova etapa
              </button>
            </div>

            {showNewGroupForm && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, padding: '8px 10px', background: `${COLORS.border}22`, borderRadius: 8 }}>
                <input autoFocus type="text" value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                  placeholder="Ex: Etapa 1 — Interlagos"
                  style={{ ...INPUT_STYLE, flex: 1 }} />
                <button onClick={handleCreateGroup}
                  style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, background: COLORS.purple, color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Criar
                </button>
                <button onClick={() => { setShowNewGroupForm(false); setNewGroupName(''); }}
                  style={{ padding: '7px 10px', borderRadius: 7, fontSize: 12, background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '2 1 180px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Nome do conjunto</label>
                <input type="text"
                  value={profileSaveName}
                  onChange={(e) => { setProfileSaveName(e.target.value); setProfileSaveMsg(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveToProfile()}
                  placeholder="Ex: Pneus Q1 — Slick 28psi"
                  style={{ ...INPUT_STYLE, width: '100%' }} />
              </div>
              <button onClick={handleSaveToProfile}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: COLORS.purple, color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                Salvar Pneus
              </button>
            </div>
            {profileSaveMsg && (
              <div style={{ marginTop: 8, fontSize: 12, color: profileSaveMsg.ok ? COLORS.green : COLORS.accent }}>
                {profileSaveMsg.ok ? '✓ ' : '✗ '}{profileSaveMsg.text}
              </div>
            )}
          </>
        )}
      </div>

      {/* Botão Limpar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={handleReset}
          style={{
            padding: '9px 22px', borderRadius: 8, fontSize: 13,
            background: 'transparent', color: COLORS.textMuted,
            border: `1px solid ${COLORS.border}`, cursor: 'pointer',
          }}>
          Limpar
        </button>
      </div>
      <PrintFooter />
    </div>
  );
}
