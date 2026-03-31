import { useState } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function InputField({ label, value, onChange, unit, half, inputBase, textMuted }) {
  return (
    <div style={{ flex: half ? '1 1 48%' : '1 1 100%', minWidth: half ? 140 : 280 }}>
      <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          style={inputBase}
        />
        {unit && <span style={{ fontSize: 11, color: textMuted, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
    </div>
  );
}

/* ─── Componente principal ───────────────────────────────────────────────── */
export default function LapTimeTab({ setupForm, setSetupForm }) {
  const COLORS = useColors();
  const theme  = makeTheme(COLORS);

  const INPUT_BASE = {
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

  const current    = setupForm || {};
  const setCurrent = setSetupForm;

  const [collapsed, setCollapsed] = useState({});
  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const SectionBox = ({ sectionKey, title, children }) => (
    <div style={theme.card}>
      <div
        onClick={() => toggleSection(sectionKey)}
        style={{
          fontSize: 13, fontWeight: 700, color: COLORS.accent,
          marginBottom: collapsed[sectionKey] ? 0 : 14, marginTop: 8,
          cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', userSelect: 'none',
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: COLORS.textMuted }}>
          {collapsed[sectionKey] ? '▸' : '▾'}
        </span>
      </div>
      {!collapsed[sectionKey] && children}
    </div>
  );

  const updateField = (field) => (val) =>
    setCurrent(prev => ({ ...(prev || {}), [field]: val }));

  const fieldRow = { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 };

  const CALC_BOX = (label, value, unit, color) => (
    <div key={label} style={{ flex: '1 1 140px', minWidth: 130 }}>
      <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>{label}</label>
      <div style={{
        background: COLORS.bg, border: `1px solid ${value !== null ? (color || COLORS.accent) : COLORS.border}`,
        borderRadius: 6, padding: '7px 12px',
        fontSize: 16, fontWeight: 800,
        color: value !== null ? (color || COLORS.accent) : COLORS.textMuted,
        textAlign: 'center', letterSpacing: '0.5px',
      }}>
        {value !== null ? `${value}${unit ? ` ${unit}` : ''}` : '—'}
      </div>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 28 }}>⏱️</span>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Lap Time</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>Powertrain, aerodinâmica, chassi e eletrônica avançada</div>
        </div>
      </div>

      {/* ── Motor / Powertrain ── */}
      <SectionBox sectionKey="motor" title="🔥 Motor / Powertrain">

        {/* Motor */}
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Motor</div>
        {(() => {
          const cv       = parseFloat(current.engine_maxPowerCv);
          const kw       = !isNaN(cv) ? (cv * 0.7355).toFixed(1) : null;
          const weightKg = parseFloat(current.chassis_weightTotal);
          const pwRatio  = (!isNaN(cv) && !isNaN(weightKg) && weightKg > 0) ? (cv / weightKg).toFixed(3) : null;
          return (
            <>
              <div style={fieldRow}>
                <InputField label="Potência Máxima"    value={current.engine_maxPowerCv}  onChange={updateField('engine_maxPowerCv')}  unit="cv"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Rotação de Pico"    value={current.engine_maxPowerRpm} onChange={updateField('engine_maxPowerRpm')} unit="RPM" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Torque Máximo"      value={current.engine_maxTorqueNm} onChange={updateField('engine_maxTorqueNm')} unit="Nm"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Rotação Torque Máx" value={current.engine_maxTorqueRpm} onChange={updateField('engine_maxTorqueRpm')} unit="RPM" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                {[
                  ['Potência em kW', kw, 'kW', COLORS.accent],
                  ['Relação Potência/Peso', pwRatio, 'cv/kg', COLORS.green],
                ].map(([lbl, val, unit, col]) => (
                  <div key={lbl} style={{ flex: '1 1 150px', minWidth: 140 }}>
                    <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>{lbl}</label>
                    <div style={{ background: COLORS.bg, border: `1px solid ${val ? col : COLORS.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 15, fontWeight: 800, color: val ? col : COLORS.textMuted, textAlign: 'center' }}>
                      {val ? `${val} ${unit}` : '—'}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4 }}>
                * Relação pot./peso usa o peso total com piloto do box Chassi
              </div>
            </>
          );
        })()}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={fieldRow}>
            <InputField label="Cilindrada Total"    value={current.engine_displacement}     onChange={updateField('engine_displacement')}     unit="cc"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Nº de Cilindros"     value={current.engine_cylinders}        onChange={updateField('engine_cylinders')}                   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Arquitetura"         value={current.engine_architecture}     onChange={updateField('engine_architecture')}                half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Taxa de Compressão"  value={current.engine_compressionRatio} onChange={updateField('engine_compressionRatio')} unit=":1"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Ângulo Virabrequim"  value={current.engine_crankAngle}       onChange={updateField('engine_crankAngle')}       unit="°"   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Throttle Response"   value={current.engine_throttleResponse} onChange={updateField('engine_throttleResponse')} unit="ms"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Rev Limiter"         value={current.engine_revLimit}         onChange={updateField('engine_revLimit')}         unit="RPM" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Temp. Operação Mín"  value={current.engine_opTempMin}        onChange={updateField('engine_opTempMin')}        unit="°C"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Temp. Operação Máx"  value={current.engine_opTempMax}        onChange={updateField('engine_opTempMax')}        unit="°C"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>

        {/* Gestão Eletrônica (ECU) */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Gestão Eletrônica (ECU)</div>
          <div style={fieldRow}>
            <InputField label="Mapa de Ignição"      value={current.engine_ecuIgnMap}  onChange={updateField('engine_ecuIgnMap')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Mapa de Injeção"      value={current.engine_ecuInjMap}  onChange={updateField('engine_ecuInjMap')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Corte de Combustível" value={current.engine_ecuFuelCut} onChange={updateField('engine_ecuFuelCut')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>

        {/* Transmissão */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Transmissão</div>
          {(() => {
            const numG    = parseInt(current.trans_numGears) || 0;
            const finalDr = parseFloat(current.trans_finalDrive);
            const revLimit= parseFloat(current.engine_revLimit);
            const rTyre   = parseFloat(current.trans_tyreRadius) / 1000;
            const gearKeys= ['trans_gear1','trans_gear2','trans_gear3','trans_gear4','trans_gear5','trans_gear6','trans_gear7','trans_gear8'];
            return (
              <>
                <div style={fieldRow}>
                  <InputField label="Nº de Marchas"         value={current.trans_numGears}    onChange={updateField('trans_numGears')}              half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                  <InputField label="Relação Final"         value={current.trans_finalDrive}  onChange={updateField('trans_finalDrive')}            half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                  <InputField label="Raio do Pneu"          value={current.trans_tyreRadius}  onChange={updateField('trans_tyreRadius')}  unit="mm"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                  <InputField label="Tipo de Câmbio"        value={current.trans_gearboxType} onChange={updateField('trans_gearboxType')}           half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                  <InputField label="Tempo de Troca"        value={current.trans_shiftTime}   onChange={updateField('trans_shiftTime')}   unit="ms" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                  <InputField label="Tipo de Embreagem"     value={current.trans_clutchType}  onChange={updateField('trans_clutchType')}            half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                  <InputField label="Eficiência"            value={current.trans_efficiency}  onChange={updateField('trans_efficiency')}  unit="%"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                  <InputField label="Inércia Trem de Força" value={current.trans_inertiaMoment} onChange={updateField('trans_inertiaMoment')} unit="kg·m²" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>Relações de Marcha</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {gearKeys.slice(0, Math.max(numG, 1)).map((key, i) => {
                      const ratio = parseFloat(current[key]);
                      const vMax  = (!isNaN(ratio) && ratio > 0 && !isNaN(finalDr) && !isNaN(revLimit) && !isNaN(rTyre))
                        ? ((revLimit / 60) * 2 * Math.PI * rTyre / (ratio * finalDr) * 3.6).toFixed(0) : null;
                      return (
                        <div key={key} style={{ flex: '1 1 90px', minWidth: 85 }}>
                          <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>
                            {i + 1}ª marcha {vMax ? <span style={{ color: COLORS.green }}>({vMax} km/h)</span> : ''}
                          </label>
                          <input
                            type="text"
                            value={current[key] || ''}
                            onChange={(e) => updateField(key)(e.target.value)}
                            placeholder="ratio"
                            style={{ ...INPUT_BASE, width: '100%' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {(numG > 0 && !isNaN(parseFloat(current.trans_finalDrive)) && !isNaN(parseFloat(current.engine_revLimit)) && !isNaN(parseFloat(current.trans_tyreRadius))) && (
                    <div style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4 }}>
                      Velocidade máx teórica por marcha calculada no rev limiter
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </SectionBox>

      {/* ── Turbocompressor ── */}
      <SectionBox sectionKey="turbo" title="🌀 Turbocompressor">

        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Boost</div>
        {(() => {
          const boostGauge = parseFloat(current.turbo_boostTarget);
          const pr = !isNaN(boostGauge) && boostGauge > 0 ? ((boostGauge + 1.013) / 1.013).toFixed(2) : null;
          return (
            <>
              <div style={fieldRow}>
                <InputField label="Boost Target"     value={current.turbo_boostTarget}  onChange={updateField('turbo_boostTarget')}  unit="bar gauge" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Razão de Pressão" value={current.turbo_pressureRatio} onChange={updateField('turbo_pressureRatio')} unit=":1"       half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Turbo Lag"        value={current.turbo_lag}           onChange={updateField('turbo_lag')}           unit="ms"       half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              </div>
              {pr && !current.turbo_pressureRatio && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, marginBottom: 10 }}>
                  <div style={{ flex: '0 0 auto' }}>
                    <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Razão de Pressão</label>
                    <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.purple}66`, borderRadius: 6, padding: '7px 16px', fontSize: 15, fontWeight: 800, color: COLORS.purple, textAlign: 'center' }}>
                      {pr} : 1
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Wastegate</div>
          <div style={fieldRow}>
            <InputField label="Tipo de Wastegate"      value={current.turbo_wastegateType} onChange={updateField('turbo_wastegateType')}           half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Pressão Máx. Wastegate" value={current.turbo_wastegateBar}  onChange={updateField('turbo_wastegateBar')}  unit="bar" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Temperatura e Eficiência</div>
          <div style={fieldRow}>
            <InputField label="EGT — Gases de Escape"    value={current.turbo_egt}            onChange={updateField('turbo_egt')}            unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Eficiência do Compressor" value={current.turbo_compEfficiency}  onChange={updateField('turbo_compEfficiency')} unit="%"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Limites do Compressor</div>
          <div style={fieldRow}>
            <InputField label="Surge — Pressão Mín." value={current.turbo_surgeBar}    onChange={updateField('turbo_surgeBar')}    unit="bar"    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Choke — Vazão Máx."   value={current.turbo_chokeFlow}   onChange={updateField('turbo_chokeFlow')}              half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Inércia do Rotor"     value={current.turbo_rotorInertia} onChange={updateField('turbo_rotorInertia')} unit="kg·cm²" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>
      </SectionBox>

      {/* ── Escapamento & Efeitos Aerodinâmicos ── */}
      <SectionBox sectionKey="escapamento" title="💨 Escapamento & Efeitos Aerodinâmicos">

        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Saída</div>
        <div style={fieldRow}>
          <InputField label="Posição de Saída" value={current.exh_exitPosition}  onChange={updateField('exh_exitPosition')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Blown Diffuser"   value={current.exh_blownDiffuser} onChange={updateField('exh_blownDiffuser')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Geometria do Coletor</div>
          <div style={fieldRow}>
            <InputField label="Comprimento"  value={current.exh_manifoldLength} onChange={updateField('exh_manifoldLength')} unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Diâmetro"     value={current.exh_manifoldDiam}   onChange={updateField('exh_manifoldDiam')}   unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Nº de Saídas" value={current.exh_outlets}        onChange={updateField('exh_outlets')}                 half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>

        {/* Temperatura & Contrapressão */}
        {(() => {
          const egtRef = current.turbo_egt && !current.exh_exhaustTemp ? current.turbo_egt : null;
          return (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Temperatura &amp; Contrapressão</div>
              <div style={fieldRow}>
                <div style={{ flex: '1 1 48%', minWidth: 140 }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
                    Temperatura dos Gases
                    {egtRef && <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.purple, fontWeight: 600 }}>🔢 do Turbo</span>}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="text" value={current.exh_exhaustTemp ?? ''} onChange={(e) => updateField('exh_exhaustTemp')(e.target.value)} placeholder={egtRef ?? ''} style={INPUT_BASE} />
                    <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>°C</span>
                  </div>
                  {egtRef && !current.exh_exhaustTemp && (
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3, fontStyle: 'italic' }}>
                      Usando {egtRef} °C (EGT do Turbo) — edite acima para sobrescrever
                    </div>
                  )}
                </div>
                <InputField label="Contrapressão" value={current.exh_backPressure} onChange={updateField('exh_backPressure')} unit="kPa" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              </div>
            </div>
          );
        })()}

        {/* Pulsação & Scavenging */}
        {(() => {
          const rpmTorque = parseFloat(current.engine_maxTorqueRpm);
          const cylinders = parseFloat(current.engine_cylinders);
          const rpmAlvo   = parseFloat(current.exh_tuningRpm);
          const rpmBase   = !isNaN(rpmAlvo) && rpmAlvo > 0 ? rpmAlvo : (!isNaN(rpmTorque) ? rpmTorque : NaN);
          const fPuls     = (!isNaN(rpmBase) && !isNaN(cylinders) && cylinders > 0)
            ? ((rpmBase * (cylinders / 2)) / 60).toFixed(1) : null;
          const tExh      = parseFloat(current.exh_exhaustTemp || current.turbo_egt || '');
          const tK        = !isNaN(tExh) ? tExh + 273.15 : 873.15;
          const cSom      = 331 * Math.sqrt(tK / 273.15);
          const lRes      = fPuls ? (cSom / (2 * parseFloat(fPuls)) * 1000).toFixed(0) : null;

          const CALC_BOX_EXH = (label, value, unit, color, note) => (
            <div style={{ flex: '1 1 160px', minWidth: 150 }}>
              <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
                {label}{note && <span style={{ fontSize: 10, color, marginLeft: 5 }}>{note}</span>}
              </label>
              <div style={{ background: COLORS.bg, border: `1px solid ${value !== null ? (color || COLORS.accent) : COLORS.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 16, fontWeight: 800, color: value !== null ? (color || COLORS.accent) : COLORS.textMuted, textAlign: 'center', letterSpacing: '0.5px' }}>
                {value !== null ? `${value}${unit ? ` ${unit}` : ''}` : '—'}
              </div>
            </div>
          );

          return (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Pulsação &amp; Scavenging</div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 10, fontStyle: 'italic' }}>
                f = RPM × (cil/2) / 60 &nbsp;|&nbsp; L = c_som / (2×f) × 1000 mm &nbsp;|&nbsp; c_som = 331 × √(T_K/273.15)
              </div>
              <div style={fieldRow}>
                <InputField
                  label={`RPM Alvo (scavenging)${!isNaN(rpmTorque) && !current.exh_tuningRpm ? ` — usando ${rpmTorque} rpm (torque máx.)` : ''}`}
                  value={current.exh_tuningRpm} onChange={updateField('exh_tuningRpm')} unit="rpm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                {CALC_BOX_EXH('Frequência de Pulsação', fPuls, 'Hz', COLORS.accent)}
                {CALC_BOX_EXH('Comprimento de Ressonância', lRes, 'mm', COLORS.green)}
              </div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6, fontStyle: 'italic' }}>
                {!isNaN(tExh)
                  ? `Velocidade do som calculada com T = ${tExh}°C → c = ${cSom.toFixed(0)} m/s`
                  : `Temp. dos gases não informada — usando 600°C como estimativa (c = ${cSom.toFixed(0)} m/s)`}
              </div>
            </div>
          );
        })()}
      </SectionBox>

      {/* ── Downforce & Arrasto ── */}
      <SectionBox sectionKey="aero" title="✈️ Downforce & Arrasto">
        {(() => {
          const cd   = parseFloat(current.aero_cd);
          const cl   = parseFloat(current.aero_cl);
          const A    = parseFloat(current.aero_frontalArea);
          const vKmh = parseFloat(current.aero_refSpeed);
          const dfF  = parseFloat(current.aero_dfFront);
          const dfR  = parseFloat(current.aero_dfRear);
          const rho  = 1.225;
          const vMs  = vKmh / 3.6;
          const efficiency = (!isNaN(cd) && !isNaN(cl) && cd !== 0) ? (cl / cd).toFixed(3) : null;
          const balance    = (!isNaN(dfF) && !isNaN(dfR) && (dfF + dfR) > 0) ? ((dfF / (dfF + dfR)) * 100).toFixed(1) : null;
          const fDrag      = (!isNaN(cd) && !isNaN(A) && !isNaN(vMs)) ? (0.5 * rho * vMs * vMs * cd * A).toFixed(0) : null;
          const fDown      = (!isNaN(cl) && !isNaN(A) && !isNaN(vMs)) ? (0.5 * rho * vMs * vMs * cl * A).toFixed(0) : null;

          return (
            <>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Coeficientes</div>
              <div style={fieldRow}>
                <InputField label="Coef. de Arrasto (Cd)"         value={current.aero_cd}          onChange={updateField('aero_cd')}          half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Coef. de Downforce (Cl)"       value={current.aero_cl}          onChange={updateField('aero_cl')}          half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Área Frontal (m²)"             value={current.aero_frontalArea} onChange={updateField('aero_frontalArea')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Velocidade de Ref. p/ cálculos" value={current.aero_refSpeed}   onChange={updateField('aero_refSpeed')}   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="km/h" />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                {CALC_BOX('Eficiência Aerodinâmica (Cl/Cd)', efficiency, '', COLORS.accent)}
                {CALC_BOX(`Força de Arrasto @ ${!isNaN(vKmh) ? vKmh : '—'} km/h`, fDrag, 'N', '#ff8c00')}
                {CALC_BOX(`Força de Downforce @ ${!isNaN(vKmh) ? vKmh : '—'} km/h`, fDown, 'N', COLORS.green)}
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Centro de Pressão Aerodinâmica</div>
                <div style={fieldRow}>
                  <InputField label="Posição Longitudinal" value={current.aero_cpLong} onChange={updateField('aero_cpLong')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="% entre-eixos" />
                  <InputField label="Posição Lateral"      value={current.aero_cpLat}  onChange={updateField('aero_cpLat')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="mm do centro" />
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Balanço Aerodinâmico Frente / Traseiro</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <InputField label="Downforce Dianteiro (N)" value={current.aero_dfFront} onChange={updateField('aero_dfFront')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                  <InputField label="Downforce Traseiro (N)"  value={current.aero_dfRear}  onChange={updateField('aero_dfRear')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                  {CALC_BOX('% Downforce no Eixo Dianteiro', balance, '%', COLORS.accent)}
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Sensibilidade ao Yaw</div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 8, fontStyle: 'italic' }}>
                  Variação de Cd e Cl por grau de ângulo de derrapagem (dados de túnel de vento / CFD)
                </div>
                <div style={fieldRow}>
                  <InputField label="ΔCd por grau de yaw" value={current.aero_yawDeltaCd} onChange={updateField('aero_yawDeltaCd')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="Cd/°" />
                  <InputField label="ΔCl por grau de yaw" value={current.aero_yawDeltaCl} onChange={updateField('aero_yawDeltaCl')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="Cl/°" />
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Efeito Solo (Ground Effect)</div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 8, fontStyle: 'italic' }}>
                  Variação de downforce com ride height (dados de teste / CFD)
                </div>
                <div style={fieldRow}>
                  <InputField label="ΔDownforce / mm de ride height" value={current.aero_groundDeltaDf} onChange={updateField('aero_groundDeltaDf')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="N/mm" />
                  <InputField label="Ride Height de Referência"       value={current.aero_groundRefRh}   onChange={updateField('aero_groundRefRh')}   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="mm" />
                </div>
              </div>
            </>
          );
        })()}
      </SectionBox>

      {/* ── Chassi / Estrutura ── */}
      <SectionBox sectionKey="chassi" title="🏗️ Chassi / Estrutura">

        {/* Peso e distribuição */}
        {(() => {
          const wF   = parseFloat(current.chassis_weightFront);
          const wR   = parseFloat(current.chassis_weightRear);
          const dist = (!isNaN(wF) && !isNaN(wR) && (wF + wR) > 0) ? (wF / (wF + wR) * 100).toFixed(1) : null;
          return (
            <>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Peso &amp; Distribuição</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <InputField label="Peso Total (com piloto)"   value={current.chassis_weightTotal}   onChange={updateField('chassis_weightTotal')}   unit="kg" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Peso Total (sem piloto)"   value={current.chassis_weightNoPilot} onChange={updateField('chassis_weightNoPilot')} unit="kg" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Peso Eixo Dianteiro"       value={current.chassis_weightFront}   onChange={updateField('chassis_weightFront')}   unit="kg" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Peso Eixo Traseiro"        value={current.chassis_weightRear}    onChange={updateField('chassis_weightRear')}    unit="kg" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <div style={{ flex: '1 1 150px', minWidth: 140 }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Distribuição (% Frente)</label>
                  <div style={{ background: COLORS.bg, border: `1px solid ${dist ? COLORS.accent : COLORS.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 15, fontWeight: 800, color: dist ? COLORS.accent : COLORS.textMuted, textAlign: 'center' }}>
                    {dist ? `${dist}%` : '—'}
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Centro de Gravidade (CG)</div>
          <div style={fieldRow}>
            <InputField label="Altura do CG"    value={current.chassis_cgHeight} onChange={updateField('chassis_cgHeight')} unit="mm"                 half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="CG Longitudinal" value={current.chassis_cgLong}   onChange={updateField('chassis_cgLong')}   unit="mm / % entre-eixos" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="CG Lateral"      value={current.chassis_cgLat}    onChange={updateField('chassis_cgLat')}    unit="mm do centro"       half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Rigidez &amp; Inércia</div>
          <div style={fieldRow}>
            <InputField label="Rigidez Torsional" value={current.chassis_torsionalRig} onChange={updateField('chassis_torsionalRig')} unit="Nm/°"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Rigidez em Flexão" value={current.chassis_flexRigidity} onChange={updateField('chassis_flexRigidity')}              half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Inércia em Roll"   value={current.chassis_inertiRoll}   onChange={updateField('chassis_inertiRoll')}   unit="kg·m²" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Inércia em Pitch"  value={current.chassis_inertiPitch}  onChange={updateField('chassis_inertiPitch')}  unit="kg·m²" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Inércia em Yaw"    value={current.chassis_inertiYaw}    onChange={updateField('chassis_inertiYaw')}    unit="kg·m²" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Material &amp; Estrutura</div>
          <div style={fieldRow}>
            <InputField label="Material do Chassi"             value={current.chassis_material}       onChange={updateField('chassis_material')}       half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Pontos de Ancoragem Susp."      value={current.chassis_anchorNotes}    onChange={updateField('chassis_anchorNotes')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Estrutura de Impacto (Crash)"   value={current.chassis_crashStructure} onChange={updateField('chassis_crashStructure')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Proteção Lateral (Side Impact)" value={current.chassis_sideImpact}     onChange={updateField('chassis_sideImpact')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Roll Hoop / Halo"               value={current.chassis_rollHoop}       onChange={updateField('chassis_rollHoop')}       half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>
      </SectionBox>

      {/* ── Direção ── */}
      <SectionBox sectionKey="direcao" title="🎯 Direção">
        {(() => {
          const ratio      = parseFloat(current.steer_ratio);
          const lockToLock = parseFloat(current.steer_lockToLock);
          const maxWheelAngle = (!isNaN(ratio) && ratio > 0 && !isNaN(lockToLock)) ? (lockToLock / ratio / 2).toFixed(1) : null;
          return (
            <>
              <div style={fieldRow}>
                <InputField label="Relação de Direção"  value={current.steer_ratio}          onChange={updateField('steer_ratio')}          half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Lock-to-Lock"        value={current.steer_lockToLock}     onChange={updateField('steer_lockToLock')}     unit="°" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Rigidez da Coluna"   value={current.steer_columnRigidity} onChange={updateField('steer_columnRigidity')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              </div>
              {maxWheelAngle && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ flex: '1 1 150px', minWidth: 140, display: 'inline-block' }}>
                    <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Ângulo Máx. de Esterçamento</label>
                    <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.accent}`, borderRadius: 6, padding: '7px 12px', fontSize: 15, fontWeight: 800, color: COLORS.accent, textAlign: 'center', minWidth: 140 }}>
                      {maxWheelAngle}° (cada lado)
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={fieldRow}>
            <InputField label="Caster Trail"         value={current.steer_casterTrail}    onChange={updateField('steer_casterTrail')}    unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Pneumatic Trail"      value={current.steer_pneumaticTrail} onChange={updateField('steer_pneumaticTrail')} unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Diâmetro do Volante"  value={current.steer_wheelDiam}      onChange={updateField('steer_wheelDiam')}      unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Geometria do Volante" value={current.steer_wheelGeometry}  onChange={updateField('steer_wheelGeometry')}        half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Quick Release"        value={current.steer_quickRelease}   onChange={updateField('steer_quickRelease')}         half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Power Steering"       value={current.steer_powerSteering}  onChange={updateField('steer_powerSteering')}        half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Feedback Tátil (obs)" value={current.steer_feedback}       onChange={updateField('steer_feedback')}             half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>
      </SectionBox>

      {/* ── Dados para Cálculo Dinâmico ── */}
      <SectionBox sectionKey="dinamica" title="📐 Dados para Cálculo Dinâmico">
        {(() => {
          const mrF    = parseFloat(current.susp_mrFront);
          const mrR    = parseFloat(current.susp_mrRear);
          const mrArbF = parseFloat(current.susp_mrArbFront);
          const mrArbR = parseFloat(current.susp_mrArbRear);
          const trkF   = parseFloat(current.susp_trackFront);
          const trkR   = parseFloat(current.susp_trackRear);
          const mF     = parseFloat(current.susp_massFront);
          const mR     = parseFloat(current.susp_massRear);
          const cF     = parseFloat(current.susp_damperFront);
          const cR     = parseFloat(current.susp_damperRear);

          const kSpringF = (() => {
            const fl = parseFloat(current.spring?.fl), fr = parseFloat(current.spring?.fr);
            const vals = [fl, fr].filter(v => !isNaN(v));
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
          })();
          const kSpringR = (() => {
            const rl = parseFloat(current.spring?.rl), rr = parseFloat(current.spring?.rr);
            const vals = [rl, rr].filter(v => !isNaN(v));
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
          })();
          const kArbF = parseFloat(current.frontBarRate);
          const kArbR = parseFloat(current.rearBarRate);

          const kwF = (!isNaN(kSpringF) && !isNaN(mrF)) ? kSpringF * mrF * mrF : NaN;
          const kwR = (!isNaN(kSpringR) && !isNaN(mrR)) ? kSpringR * mrR * mrR : NaN;

          const kRollF = (() => {
            const sp = (!isNaN(kwF) && !isNaN(trkF)) ? kwF * trkF * trkF / 2000 : NaN;
            const ap = (!isNaN(kArbF) && !isNaN(mrArbF) && !isNaN(trkF)) ? kArbF * mrArbF * mrArbF * trkF * trkF / 2000 : 0;
            return !isNaN(sp) ? (sp + ap) * (Math.PI / 180) : NaN;
          })();
          const kRollR = (() => {
            const sp = (!isNaN(kwR) && !isNaN(trkR)) ? kwR * trkR * trkR / 2000 : NaN;
            const ap = (!isNaN(kArbR) && !isNaN(mrArbR) && !isNaN(trkR)) ? kArbR * mrArbR * mrArbR * trkR * trkR / 2000 : 0;
            return !isNaN(sp) ? (sp + ap) * (Math.PI / 180) : NaN;
          })();
          const rollBalance = (!isNaN(kRollF) && !isNaN(kRollR) && (kRollF + kRollR) > 0)
            ? (kRollF / (kRollF + kRollR) * 100).toFixed(1) : null;

          const fnF = (!isNaN(kwF) && !isNaN(mF) && mF > 0) ? (1 / (2 * Math.PI)) * Math.sqrt(kwF * 1000 / mF) : NaN;
          const fnR = (!isNaN(kwR) && !isNaN(mR) && mR > 0) ? (1 / (2 * Math.PI)) * Math.sqrt(kwR * 1000 / mR) : NaN;
          const dampRatioF = (!isNaN(cF) && !isNaN(kwF) && !isNaN(mF) && mF > 0)
            ? (cF / (2 * Math.sqrt(kwF * 1000 * mF)) * 100).toFixed(1) : null;
          const dampRatioR = (!isNaN(cR) && !isNaN(kwR) && !isNaN(mR) && mR > 0)
            ? (cR / (2 * Math.sqrt(kwR * 1000 * mR)) * 100).toFixed(1) : null;

          const SUSP_CALC = (label, value, unit, color) => (
            <div style={{ flex: '1 1 150px', minWidth: 140 }}>
              <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>{label}</label>
              <div style={{ background: COLORS.bg, border: `1px solid ${value !== null && !isNaN(value) ? (color || COLORS.accent) : COLORS.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 15, fontWeight: 800, color: (value !== null && !isNaN(value)) ? (color || COLORS.accent) : COLORS.textMuted, textAlign: 'center' }}>
                {(value !== null && !isNaN(value)) ? `${typeof value === 'number' ? value.toFixed(2) : value}${unit ? ` ${unit}` : ''}` : '—'}
              </div>
            </div>
          );

          return (
            <>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Motion Ratio</div>
              <div style={fieldRow}>
                <InputField label="MR Mola — Dianteiro" value={current.susp_mrFront}    onChange={updateField('susp_mrFront')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="MR Mola — Traseiro"  value={current.susp_mrRear}     onChange={updateField('susp_mrRear')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="MR ARB — Dianteiro"  value={current.susp_mrArbFront} onChange={updateField('susp_mrArbFront')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="MR ARB — Traseiro"   value={current.susp_mrArbRear}  onChange={updateField('susp_mrArbRear')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Dados para cálculo dinâmico</div>
                <div style={fieldRow}>
                  <InputField label="Via Dianteira"              value={current.susp_trackFront}  onChange={updateField('susp_trackFront')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="mm" />
                  <InputField label="Via Traseira"               value={current.susp_trackRear}   onChange={updateField('susp_trackRear')}   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="mm" />
                  <InputField label="Massa/corner Dianteiro"     value={current.susp_massFront}   onChange={updateField('susp_massFront')}   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="kg" />
                  <InputField label="Massa/corner Traseiro"      value={current.susp_massRear}    onChange={updateField('susp_massRear')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="kg" />
                  <InputField label="Rate Amortecedor Dianteiro" value={current.susp_damperFront} onChange={updateField('susp_damperFront')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="N·s/m" />
                  <InputField label="Rate Amortecedor Traseiro"  value={current.susp_damperRear}  onChange={updateField('susp_damperRear')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="N·s/m" />
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, fontWeight: 600 }}>Roll Stiffness</div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 10, fontStyle: 'italic' }}>
                  Calculado a partir de: spring rate médio do eixo × MR² + ARB × MR_ARB² × via² / 2000 × π/180
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {SUSP_CALC('Roll Stiffness Dianteiro', kRollF, 'Nm/°', COLORS.accent)}
                  {SUSP_CALC('Roll Stiffness Traseiro',  kRollR, 'Nm/°', '#ff8c00')}
                  <div style={{ flex: '1 1 150px', minWidth: 140 }}>
                    <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Balanço de Rigidez (% Di.)</label>
                    <div style={{ background: COLORS.bg, border: `1px solid ${rollBalance ? COLORS.green : COLORS.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 15, fontWeight: 800, color: rollBalance ? COLORS.green : COLORS.textMuted, textAlign: 'center' }}>
                      {rollBalance ? `${rollBalance}%` : '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, fontWeight: 600 }}>Frequência Natural &amp; Amortecimento</div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 10, fontStyle: 'italic' }}>
                  f = (1/2π) × √(K_wheel×1000 / m) &nbsp;|&nbsp; ζ = C / (2×√(K_wheel×1000×m)) × 100%
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {SUSP_CALC('Freq. Natural Dianteira',   fnF,                           'Hz', COLORS.accent)}
                  {SUSP_CALC('Freq. Natural Traseira',    fnR,                           'Hz', '#ff8c00')}
                  {SUSP_CALC('Amort. Crítico Dianteiro',  dampRatioF !== null ? parseFloat(dampRatioF) : NaN, '%', COLORS.green)}
                  {SUSP_CALC('Amort. Crítico Traseiro',   dampRatioR !== null ? parseFloat(dampRatioR) : NaN, '%', COLORS.green)}
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Altura de Rolagem (Roll Center)</div>
                <div style={fieldRow}>
                  <InputField label="Roll Center Dianteiro" value={current.susp_rcFront} onChange={updateField('susp_rcFront')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="mm" />
                  <InputField label="Roll Center Traseiro"  value={current.susp_rcRear}  onChange={updateField('susp_rcRear')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="mm" />
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, fontWeight: 600 }}>Variação de Camber e Toe com Bump/Droop</div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 10, fontStyle: 'italic' }}>
                  Dados de software de geometria (LOTUS, Optimum K, etc.)
                </div>
                <div style={fieldRow}>
                  <InputField label="ΔCamber/mm bump — Dianteiro" value={current.susp_bumpCamberFront} onChange={updateField('susp_bumpCamberFront')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="°/mm" />
                  <InputField label="ΔCamber/mm bump — Traseiro"  value={current.susp_bumpCamberRear}  onChange={updateField('susp_bumpCamberRear')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="°/mm" />
                  <InputField label="ΔToe/mm bump — Dianteiro"    value={current.susp_bumpToeFront}    onChange={updateField('susp_bumpToeFront')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="mm/mm" />
                  <InputField label="ΔToe/mm bump — Traseiro"     value={current.susp_bumpToeRear}     onChange={updateField('susp_bumpToeRear')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="mm/mm" />
                </div>
              </div>
            </>
          );
        })()}
      </SectionBox>

      {/* ── Distância de Frenagem ── */}
      <SectionBox sectionKey="frenagem" title="🛑 Distância de Frenagem">

        {/* Distância de parada */}
        {(() => {
          const v    = parseFloat(current.brake_refSpeed);
          const decG = parseFloat(current.brake_decelG);
          const vMs  = v / 3.6;
          const dist = (!isNaN(v) && !isNaN(decG) && decG > 0) ? (vMs * vMs / (2 * 9.81 * decG)).toFixed(1) : null;
          return (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <InputField label="Velocidade de Ref." value={current.brake_refSpeed} onChange={updateField('brake_refSpeed')} unit="km/h" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              <InputField label="Desaceleração"      value={current.brake_decelG}   onChange={updateField('brake_decelG')}   unit="G"    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              <div style={{ flex: '1 1 140px', minWidth: 130 }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Distância de Parada</label>
                <div style={{ background: COLORS.bg, border: `1px solid ${dist ? COLORS.accent : COLORS.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 15, fontWeight: 800, color: dist ? COLORS.accent : COLORS.textMuted, textAlign: 'center' }}>
                  {dist ? `${dist} m` : '—'}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Torque de frenagem por eixo */}
        {(() => {
          const bias  = parseFloat(current.brakeBias) / 100;
          const force = parseFloat(current.brake_totalForce);
          const rF    = parseFloat(current.brake_discRadiusFront) / 1000;
          const rR    = parseFloat(current.brake_discRadiusRear)  / 1000;
          const tF    = (!isNaN(bias) && !isNaN(force) && !isNaN(rF)) ? (bias * force * rF).toFixed(0) : null;
          const tR    = (!isNaN(bias) && !isNaN(force) && !isNaN(rR)) ? ((1 - bias) * force * rR).toFixed(0) : null;
          return (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, fontWeight: 600 }}>Torque de Frenagem por Eixo</div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 8, fontStyle: 'italic' }}>T = bias × F_total × r_disco</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <InputField label="Força Total de Frenagem"  value={current.brake_totalForce}      onChange={updateField('brake_totalForce')}      unit="N"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Raio Ef. Disco Dianteiro" value={current.brake_discRadiusFront} onChange={updateField('brake_discRadiusFront')} unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Raio Ef. Disco Traseiro"  value={current.brake_discRadiusRear}  onChange={updateField('brake_discRadiusRear')}  unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                {[['Torque Eixo Dianteiro', tF, COLORS.accent], ['Torque Eixo Traseiro', tR, '#ff8c00']].map(([lbl, val, col]) => (
                  <div key={lbl} style={{ flex: '1 1 150px', minWidth: 140 }}>
                    <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>{lbl}</label>
                    <div style={{ background: COLORS.bg, border: `1px solid ${val ? col : COLORS.border}`, borderRadius: 6, padding: '7px 12px', fontSize: 15, fontWeight: 800, color: val ? col : COLORS.textMuted, textAlign: 'center' }}>
                      {val ? `${val} Nm` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Temperatura</div>
          <div style={fieldRow}>
            <InputField label="Temp. Trabalho Disco — Mín" value={current.brake_discTempMin}     onChange={updateField('brake_discTempMin')}     unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Temp. Trabalho Disco — Máx" value={current.brake_discTempMax}     onChange={updateField('brake_discTempMax')}     unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Fade Point das Pastilhas"   value={current.brake_padFadeTemp}     onChange={updateField('brake_padFadeTemp')}     unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Deformação do Disco"        value={current.brake_discDeformation} onChange={updateField('brake_discDeformation')} unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>
      </SectionBox>

      {/* ── Eletrônica & Controles ── */}
      <SectionBox sectionKey="eletronica" title="⚡ Sistemas Eletrônicos & Controles">

        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Engine Maps</div>
        <div style={fieldRow}>
          <InputField label="Mapa de Combustível" value={current.elecFuelMap}     onChange={updateField('elecFuelMap')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Mapa de Boost"       value={current.elecBoostMap}    onChange={updateField('elecBoostMap')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Modo de Potência"    value={current.enginePowerMode} onChange={updateField('enginePowerMode')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 14, marginBottom: 8 }}>ABS</div>
        <div style={fieldRow}>
          <InputField label="Ponto / Nível"          value={current.absPoint}    onChange={updateField('absPoint')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Threshold (km/h)"       value={current.absThreshold} onChange={updateField('absThreshold')} unit="km/h" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Nível de intervenção"   value={current.absLevel}    onChange={updateField('absLevel')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Sensibilidade dianteiro" value={current.absSensFront} onChange={updateField('absSensFront')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Sensibilidade traseiro"  value={current.absSensRear}  onChange={updateField('absSensRear')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 14, marginBottom: 8 }}>Traction Control</div>
        <div style={fieldRow}>
          <InputField label="Ponto / Nível"      value={current.tcPoint}      onChange={updateField('tcPoint')}      half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Mapa de slip ratio" value={current.tcSlipMap}    onChange={updateField('tcSlipMap')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Nível de corte"     value={current.tcCutLevel}   onChange={updateField('tcCutLevel')}   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Sensibilidade"      value={current.tcSensibility} onChange={updateField('tcSensibility')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 14, marginBottom: 8 }}>Launch Control</div>
        <div style={fieldRow}>
          <InputField label="RPM de lançamento"    value={current.launchRpm}    onChange={updateField('launchRpm')}    unit="RPM" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Mapa de partida"      value={current.launchMap}    onChange={updateField('launchMap')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Progressão embreagem" value={current.launchClutch} onChange={updateField('launchClutch')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 14, marginBottom: 8 }}>Brake Balance Controller</div>
        <div style={fieldRow}>
          <InputField label="Bias dianteiro (%)" value={current.bbcBiasFront} onChange={updateField('bbcBiasFront')} unit="%" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Bias traseiro (%)"  value={current.bbcBiasRear}  onChange={updateField('bbcBiasRear')}  unit="%" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Ajuste real-time"   value={current.bbcRealTime}  onChange={updateField('bbcRealTime')}       half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 14, marginBottom: 8 }}>DRS</div>
        <div style={fieldRow}>
          <InputField label="Velocidade de ativação" value={current.drsThreshold} onChange={updateField('drsThreshold')} unit="km/h" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Ganho de velocidade"    value={current.drsGain}      onChange={updateField('drsGain')}      unit="km/h" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 14, marginBottom: 8 }}>Ride Height Control</div>
        <div style={fieldRow}>
          <InputField label="Altura mínima" value={current.rhcMinHeight}  onChange={updateField('rhcMinHeight')}  unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Sensores"      value={current.rhcSensors}    onChange={updateField('rhcSensors')}         half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Atuadores"     value={current.rhcActuators}  onChange={updateField('rhcActuators')}       half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 14, marginBottom: 8 }}>ERS Deploy Map</div>
        <div style={fieldRow}>
          <InputField label="Estratégia por trecho" value={current.ersStrategy}    onChange={updateField('ersStrategy')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Modo de deploy"        value={current.ersDeployMode}  onChange={updateField('ersDeployMode')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 14, marginBottom: 8 }}>Differential Map (Eletrônico)</div>
        <div style={fieldRow}>
          <InputField label="Bloqueio aceleração" value={current.diffMapAccel} onChange={updateField('diffMapAccel')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Bloqueio frenagem"   value={current.diffMapBrake} onChange={updateField('diffMapBrake')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 14, marginBottom: 8 }}>Data Logger</div>
        <div style={fieldRow}>
          <InputField label="Canais configurados" value={current.loggerChannels} onChange={updateField('loggerChannels')} inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ── Híbrido / ERS — Estratégia ── */}
      <SectionBox sectionKey="hibrido" title="🔋 Híbrido / ERS — Estratégia">
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 14 }}>
          Mapas de deploy/harvest e estratégia de estado de carga por volta
        </div>
        <div style={fieldRow}>
          <InputField label="Deploy map (energia por volta)" value={current.ersDeployMap}   onChange={updateField('ersDeployMap')}   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Harvest map (recuperação)"      value={current.ersHarvestMap}  onChange={updateField('ersHarvestMap')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Modo regen vs. mecânico"    value={current.ersRegenMode}   onChange={updateField('ersRegenMode')}   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Eficiência round-trip"      value={current.ersRoundTrip}   onChange={updateField('ersRoundTrip')}   unit="%" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Estratégia SoC (volta/stint)" value={current.ersSoCStrategy} onChange={updateField('ersSoCStrategy')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="SoC alvo"                     value={current.ersSoCTarget}   onChange={updateField('ersSoCTarget')}   unit="%" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ── Lubrificação & Arrefecimento ── */}
      <SectionBox sectionKey="lubrificacao" title="🛢️ Lubrificação & Arrefecimento">
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 14 }}>
          Faixas ideais de operação e especificações de fluidos
        </div>
        <div style={fieldRow}>
          <InputField label="Pressão do óleo — mín (bar)" value={current.oilPressMin} onChange={updateField('oilPressMin')} unit="bar" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Pressão do óleo — máx (bar)" value={current.oilPressMax} onChange={updateField('oilPressMax')} unit="bar" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Temp. óleo — mín (°C)" value={current.oilTempMin} onChange={updateField('oilTempMin')} unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Temp. óleo — máx (°C)" value={current.oilTempMax} onChange={updateField('oilTempMax')} unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Temp. arrefecimento — mín (°C)" value={current.coolantTempMin} onChange={updateField('coolantTempMin')} unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Temp. arrefecimento — máx (°C)" value={current.coolantTempMax} onChange={updateField('coolantTempMax')} unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <div style={{ flex: '1 1 48%' }}>
            <label style={{ display: 'block', fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Viscosidade SAE</label>
            <select
              value={current.oilViscosity ?? ''}
              onChange={(e) => updateField('oilViscosity')(e.target.value)}
              style={{ ...INPUT_BASE, cursor: 'pointer' }}
            >
              <option value="">— Selecionar —</option>
              {['0W-20','0W-30','0W-40','5W-30','5W-40','5W-50','10W-40','10W-50','10W-60','15W-40','15W-50','20W-50'].map(v =>
                <option key={v} value={v}>{v}</option>
              )}
            </select>
          </div>
          <InputField label="Capacidade reservatório" value={current.oilCapacity}    onChange={updateField('oilCapacity')}    unit="L"         half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Taxa de consumo de óleo" value={current.oilConsumption} onChange={updateField('oilConsumption')} unit="mL/100km"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

    </div>
  );
}
