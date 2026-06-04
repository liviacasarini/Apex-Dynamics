/**
 * PneusMotoTab — Gestão de pneus para motocicleta (Superbike).
 *
 * Contempla apenas Front/Rear (vs 4 cantos do carro), compostos Pirelli Diablo
 * Superbike (SC0/SC1/SC2/SC3/SCX/SCQ/Wet), aquecedores, pressões frio/quente,
 * desgaste, ciclos térmicos e histórico de stints.
 *
 * Compartilha a mesma API de persistência de tire sets do car (onSaveTireSet,
 * onLoadTireSet, onDeleteTireSet) — zero impacto no workspace de carros.
 */

import { useState } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';

export const PIRELLI_COMPOUNDS = [
  { id: 'SC0', label: 'SC0 — Soft (qualy)' },
  { id: 'SC1', label: 'SC1 — Soft' },
  { id: 'SC2', label: 'SC2 — Medium' },
  { id: 'SC3', label: 'SC3 — Hard' },
  { id: 'SCX', label: 'SCX — Race extra' },
  { id: 'SCQ', label: 'SCQ — Qualifying' },
  { id: 'WET', label: 'Wet (Rain)' },
];

export const EMPTY_MOTO_TYRE = () => ({
  id: crypto.randomUUID(),
  name: '',
  date: new Date().toISOString().split('T')[0],
  // Front
  front: {
    compound: '', dot: '', serial: '',
    pressureCold: '', pressureHot: '',
    warmerTemp: '', warmerTimeMin: '',
    surfaceTemp: '', carcassTemp: '',
    wearLeft: '', wearCenter: '', wearRight: '',
    cycles: '', laps: '',
  },
  // Rear
  rear: {
    compound: '', dot: '', serial: '',
    pressureCold: '', pressureHot: '',
    warmerTemp: '', warmerTimeMin: '',
    surfaceTemp: '', carcassTemp: '',
    wearLeft: '', wearCenter: '', wearRight: '',
    cycles: '', laps: '',
  },
  notes: '',
});

function Field({ label, value, onChange, unit, half, third, COLORS, type = 'text', options }) {
  const flexBasis = third ? '1 1 30%' : half ? '1 1 47%' : '1 1 100%';
  const minW = third ? 110 : half ? 150 : 240;
  const inputStyle = {
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
  return (
    <div style={{ flex: flexBasis, minWidth: minW }}>
      <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {options ? (
          <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">—</option>
            {options.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
          </select>
        ) : (
          <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
        )}
        {unit && <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
    </div>
  );
}

// Lei de Gay-Lussac em bar (P_abs / T_abs = const). pAtm ≈ 1.01325 bar (sea level).
function estimateTOpMoto({ tTrackC, compoundType, position }) {
  const t = parseFloat(tTrackC);
  if (isNaN(t)) return null;
  let base = 50; // moto slick típico (mais quente que carro)
  if (compoundType) {
    const k = String(compoundType).toLowerCase();
    if      (k.includes('soft') || k.includes('sc1')) base = 56;
    else if (k.includes('medium') || k.includes('sc2')) base = 50;
    else if (k.includes('hard') || k.includes('sc3')) base = 44;
    else if (k.includes('rain') || k.includes('wet')) base = 18;
  }
  const posDelta = position === 'rear' ? 8 : 0; // moto: traseiro tracionado, mais quente
  return t + base + posDelta;
}
function calcColdBarPhysics({ pIdealBar, tAmbC, tOpC, altitudeM = 0 }) {
  if (!pIdealBar || !tAmbC || tOpC == null || isNaN(tOpC)) return null;
  const pAtmBar = 1.01325 * Math.pow(1 - 2.25577e-5 * (altitudeM || 0), 5.25588);
  const tAmbK = parseFloat(tAmbC) + 273.15;
  const tOpK  = parseFloat(tOpC)  + 273.15;
  if (tOpK <= 0) return null;
  const pIdealAbs = parseFloat(pIdealBar) + pAtmBar;
  const pColdAbs  = pIdealAbs * (tAmbK / tOpK);
  return pColdAbs - pAtmBar;
}
// Aprende ΔP do histórico de tireSets de moto: cada set tem front/rear com
// pressureCold/pressureHot/compound. Filtra por compound + faixa de surfaceTemp ±10°C.
function learnDeltaPMotoFromHistory({ tireSets = [], compoundName, trackTempTargetC, position = 'rear' }) {
  if (!compoundName || !tireSets.length) return null;
  const target = parseFloat(trackTempTargetC);
  const samples = [];
  for (const ts of tireSets) {
    const axle = ts?.data?.[position] || ts?.[position];
    if (!axle) continue;
    if (axle.compound !== compoundName) continue;
    const c = parseFloat(axle.pressureCold);
    const h = parseFloat(axle.pressureHot);
    if (isNaN(c) || isNaN(h) || h <= c) continue;
    if (!isNaN(target)) {
      const tt = parseFloat(axle.surfaceTemp);
      if (isNaN(tt) || Math.abs(tt - target) > 10) continue;
    }
    samples.push(h - c);
  }
  if (samples.length < 2) return null;
  const mean = samples.reduce((a,b)=>a+b,0) / samples.length;
  return { deltaP: mean, n: samples.length };
}

function AxlePanel({ title, axleKey, data, update, COLORS, accent }) {
  return (
    <div style={{
      flex: '1 1 380px', minWidth: 300,
      background: COLORS.bg, border: `1px solid ${COLORS.border}`,
      borderRadius: 8, padding: 14,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: accent, marginBottom: 12, letterSpacing: 0.5 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <Field label="Composto" value={data.compound} onChange={(v) => update(axleKey, 'compound', v)} options={PIRELLI_COMPOUNDS} COLORS={COLORS} />
        <Field label="DOT" value={data.dot} onChange={(v) => update(axleKey, 'dot', v)} half COLORS={COLORS} />
        <Field label="Série/Barcode" value={data.serial} onChange={(v) => update(axleKey, 'serial', v)} half COLORS={COLORS} />
        <Field label="Pressão Frio" unit="bar" value={data.pressureCold} onChange={(v) => update(axleKey, 'pressureCold', v)} half COLORS={COLORS} />
        <Field label="Pressão Quente" unit="bar" value={data.pressureHot} onChange={(v) => update(axleKey, 'pressureHot', v)} half COLORS={COLORS} />
        <Field label="Aquecedor Temp." unit="°C" value={data.warmerTemp} onChange={(v) => update(axleKey, 'warmerTemp', v)} half COLORS={COLORS} />
        <Field label="Aquecedor Tempo" unit="min" value={data.warmerTimeMin} onChange={(v) => update(axleKey, 'warmerTimeMin', v)} half COLORS={COLORS} />
        <Field label="Temp. Superfície" unit="°C" value={data.surfaceTemp} onChange={(v) => update(axleKey, 'surfaceTemp', v)} half COLORS={COLORS} />
        <Field label="Temp. Carcaça" unit="°C" value={data.carcassTemp} onChange={(v) => update(axleKey, 'carcassTemp', v)} half COLORS={COLORS} />
      </div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, margin: '8px 0 6px' }}>Desgaste (mm)</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Field label="Esquerda" value={data.wearLeft} onChange={(v) => update(axleKey, 'wearLeft', v)} third COLORS={COLORS} />
        <Field label="Centro" value={data.wearCenter} onChange={(v) => update(axleKey, 'wearCenter', v)} third COLORS={COLORS} />
        <Field label="Direita" value={data.wearRight} onChange={(v) => update(axleKey, 'wearRight', v)} third COLORS={COLORS} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Ciclos térmicos" value={data.cycles} onChange={(v) => update(axleKey, 'cycles', v)} half COLORS={COLORS} />
        <Field label="Voltas acumuladas" value={data.laps} onChange={(v) => update(axleKey, 'laps', v)} half COLORS={COLORS} />
      </div>
    </div>
  );
}

export default function PneusMotoTab({
  activeProfileId,
  onSaveTireSet,
  profileTireSets = [],
  onLoadTireSet,
  onDeleteTireSet,
  pneusForm, setPneusForm,
}) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);

  const current = pneusForm && pneusForm.front && pneusForm.rear ? pneusForm : EMPTY_MOTO_TYRE();
  const setCurrent = setPneusForm;

  const update = (axle, field, value) => {
    setCurrent((prev) => {
      const base = (prev && prev.front && prev.rear) ? prev : EMPTY_MOTO_TYRE();
      return { ...base, [axle]: { ...base[axle], [field]: value } };
    });
  };
  const updateRoot = (field, value) => {
    setCurrent((prev) => {
      const base = (prev && prev.front && prev.rear) ? prev : EMPTY_MOTO_TYRE();
      return { ...base, [field]: value };
    });
  };

  const [showSaved, setShowSaved] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showColdCalc, setShowColdCalc] = useState(false);
  const [coldCalc, setColdCalc] = useState({
    pIdeal: '', tAmb: '', tTrack: '', altitude: '',
    compound: '', position: 'rear',
  });

  const handleSave = () => {
    if (!saveName.trim()) return;
    if (!activeProfileId) {
      alert('Crie/selecione uma moto na aba "Motos" antes de salvar.');
      return;
    }
    onSaveTireSet?.(activeProfileId, saveName.trim(), current, null);
    setSaveName('');
  };
  const handleNew = () => setCurrent(EMPTY_MOTO_TYRE());

  return (
    <div style={{ padding: '20px 12px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>
          🏍️ Pneus — Moto
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={saveName} onChange={(e) => setSaveName(e.target.value)}
            placeholder="Nome do conjunto..."
            style={{
              background: COLORS.bg, color: COLORS.textPrimary,
              border: `1px solid ${COLORS.border}`, borderRadius: 6,
              padding: '8px 12px', fontSize: 12, outline: 'none', minWidth: 180,
            }}
          />
          <button onClick={handleSave} style={{ ...theme.pillButton(true), padding: '8px 16px' }}>💾 Salvar</button>
          {profileTireSets.length > 0 && (
            <button onClick={() => setShowSaved((v) => !v)} style={{ ...theme.pillButton(showSaved), padding: '8px 16px' }}>
              📂 Salvos ({profileTireSets.length})
            </button>
          )}
          <button onClick={handleNew} style={{ ...theme.pillButton(false), padding: '8px 16px' }}>➕ Novo</button>
        </div>
      </div>

      {showSaved && profileTireSets.length > 0 && (
        <div style={{ ...theme.card, marginBottom: 8 }}>
          <div style={theme.cardTitle}>📂 Conjuntos Salvos</div>
          {profileTireSets.map((s) => (
            <div key={s.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}22`,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                  {s.data?.front?.compound && <span style={{ marginRight: 8 }}>F: {s.data.front.compound}</span>}
                  {s.data?.rear?.compound && <span>R: {s.data.rear.compound}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { onLoadTireSet?.(s.id); setShowSaved(false); }}
                  style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 12px' }}>Carregar</button>
                <button onClick={() => onDeleteTireSet?.(s.id)}
                  style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 12px', borderColor: COLORS.accent, color: COLORS.accent }}>
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Identificação */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>🪪 Identificação</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Field label="Nome do conjunto" value={current.name} onChange={(v) => updateRoot('name', v)} half COLORS={COLORS} />
          <Field label="Data" value={current.date} onChange={(v) => updateRoot('date', v)} half COLORS={COLORS} />
        </div>
      </div>

      {/* Eixos */}
      <div style={{ ...theme.card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={theme.cardTitle}>⚫ Front / Rear</div>
          <button
            onClick={() => setShowColdCalc(v => !v)}
            title="Calcular pressão fria a partir da pressão ideal"
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: showColdCalc ? `${COLORS.accent}18` : 'transparent',
              border: `1px solid ${showColdCalc ? COLORS.accent : COLORS.border}`,
              color: showColdCalc ? COLORS.accent : COLORS.textSecondary,
            }}>
            🧮 Calc. Fria
          </button>
        </div>
        {showColdCalc && (() => {
          const compoundName = coldCalc.compound
            || current?.[coldCalc.position]?.compound
            || '';
          const learned = learnDeltaPMotoFromHistory({
            tireSets: profileTireSets,
            compoundName,
            trackTempTargetC: coldCalc.tTrack,
            position: coldCalc.position,
          });
          let result = null;
          let mode = 'physics';
          if (learned && coldCalc.pIdeal) {
            result = parseFloat(coldCalc.pIdeal) - learned.deltaP;
            mode = 'history';
          } else {
            const tOp = estimateTOpMoto({
              tTrackC: coldCalc.tTrack,
              compoundType: compoundName,
              position: coldCalc.position,
            });
            result = calcColdBarPhysics({
              pIdealBar: coldCalc.pIdeal,
              tAmbC: coldCalc.tAmb,
              tOpC: tOp,
              altitudeM: coldCalc.altitude,
            });
          }
          const inputBase = {
            background: COLORS.bg, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`, borderRadius: 5,
            padding: '6px 9px', fontSize: 12, outline: 'none', width: '100%',
            boxSizing: 'border-box',
          };
          const labelStyle = { fontSize: 10, color: COLORS.textMuted, fontWeight: 600, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.4px' };
          return (
            <div style={{
              background: `${COLORS.accent}08`,
              border: `1px solid ${COLORS.accent}44`,
              borderRadius: 10,
              padding: 14,
              marginBottom: 14,
            }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>
                {mode === 'history'
                  ? `Aprendendo do histórico (${learned.n} sessões compatíveis) · ΔP médio observado`
                  : 'Modelo físico — salve sessões para melhorar a precisão'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>Pressão Ideal (bar)</label>
                  <input type="number" step="0.01" placeholder="Ex: 2.10"
                    value={coldCalc.pIdeal}
                    onChange={e => setColdCalc(prev => ({ ...prev, pIdeal: e.target.value }))}
                    style={inputBase} />
                </div>
                <div>
                  <label style={labelStyle}>Composto</label>
                  <select value={coldCalc.compound}
                    onChange={e => setColdCalc(prev => ({ ...prev, compound: e.target.value }))}
                    style={{ ...inputBase, padding: '6px 8px' }}>
                    <option value="">— usar atual ({current?.[coldCalc.position]?.compound || 'nenhum'}) —</option>
                    {PIRELLI_COMPOUNDS.map(c => (
                      <option key={c.value || c} value={c.value || c}>{c.label || c.value || c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Posição</label>
                  <select value={coldCalc.position}
                    onChange={e => setColdCalc(prev => ({ ...prev, position: e.target.value }))}
                    style={{ ...inputBase, padding: '6px 8px' }}>
                    <option value="front">Dianteiro</option>
                    <option value="rear">Traseiro</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Temp. Pista (°C)</label>
                  <input type="number" step="1" placeholder="Ex: 35"
                    value={coldCalc.tTrack}
                    onChange={e => setColdCalc(prev => ({ ...prev, tTrack: e.target.value }))}
                    style={inputBase} />
                </div>
                <div>
                  <label style={labelStyle}>Temp. Ambiente (°C)</label>
                  <input type="number" step="1" placeholder="Ex: 25"
                    value={coldCalc.tAmb}
                    onChange={e => setColdCalc(prev => ({ ...prev, tAmb: e.target.value }))}
                    style={inputBase} />
                </div>
                <div>
                  <label style={labelStyle}>Altitude (m) — opcional</label>
                  <input type="number" step="10" placeholder="0"
                    value={coldCalc.altitude}
                    onChange={e => setColdCalc(prev => ({ ...prev, altitude: e.target.value }))}
                    style={inputBase} />
                </div>
              </div>
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8,
                background: result != null ? `${COLORS.green}15` : `${COLORS.border}22`,
                border: `1px solid ${result != null ? COLORS.green + '55' : COLORS.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Pressão Fria Recomendada
                    {mode === 'history' && (
                      <span style={{ marginLeft: 8, color: COLORS.green, fontWeight: 700 }}>
                        ⭐ {learned.n} sessão(ões) aprendida(s)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: result != null ? COLORS.green : COLORS.textMuted, marginTop: 2 }}>
                    {result != null ? `${result.toFixed(2)} bar` : '—'}
                    {result != null && coldCalc.pIdeal && (
                      <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 500, marginLeft: 8 }}>
                        (Δ {(parseFloat(coldCalc.pIdeal) - result).toFixed(2)} bar build-up)
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, maxWidth: 280, lineHeight: 1.4 }}>
                  {mode === 'history'
                    ? 'Precisão alta — usando ΔP médio das sessões salvas (mesmo composto, ±10°C track temp).'
                    : 'Sem histórico suficiente. Salve ≥2 sessões com Pf+Pq medidos para ativar aprendizado.'}
                </div>
              </div>
            </div>
          );
        })()}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <AxlePanel title="🔵 FRONT (Dianteiro)" axleKey="front" data={current.front} update={update} COLORS={COLORS} accent={COLORS.green} />
          <AxlePanel title="🔴 REAR (Traseiro)" axleKey="rear" data={current.rear} update={update} COLORS={COLORS} accent={COLORS.accent} />
        </div>
      </div>

      {/* Notas */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>📝 Notas</div>
        <textarea
          value={current.notes || ''}
          onChange={(e) => updateRoot('notes', e.target.value)}
          rows={5}
          placeholder="Comportamento, vibração, granulação, blistering, etc."
          style={{
            width: '100%', background: COLORS.bg, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`, borderRadius: 6,
            padding: '10px 12px', fontSize: 13, outline: 'none',
            boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      </div>
    </div>
  );
}
