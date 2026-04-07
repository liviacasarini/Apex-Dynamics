/**
 * SetupSheetMotoTab — Setup sheet completo para motocicletas (Superbike).
 *
 * Layout independente do SetupSheetTab (carro). Compartilha a MESMA API de props
 * (setupForm/setSetupForm/profileSetups/onSaveSetup/onLoadSetup/onDeleteSetup),
 * de modo que o backend de persistência por perfil funciona sem qualquer alteração.
 *
 * Seções: Evento · Geometria · Forquilha · Mono (Amortecedor) · Freios ·
 *         Transmissão (corrente/relações) · Eletrônica · Aerodinâmica · Ergonomia · Notas
 */

import { useState } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { PrintFooter } from '@/components/common';

export const EMPTY_MOTO_SETUP = {
  // Evento
  track: '', date: new Date().toISOString().split('T')[0], event: '',
  rider: '', bike: '', sessionId: '',

  // Geometria
  geo_wheelbase: '',         // mm
  geo_rake: '',              // °
  geo_trail: '',             // mm
  geo_offset: '',            // mm
  geo_swingarmLength: '',    // mm
  geo_swingarmAngle: '',     // °
  geo_antiSquat: '',         // %
  geo_frontRideHeight: '',   // mm
  geo_rearRideHeight: '',    // mm
  geo_cogHeight: '',         // mm
  geo_weightDistF: '',       // %
  geo_weightDistR: '',       // %

  // Forquilha (front fork — Öhlins NPX25/FGR300)
  fork_brand: '',            // Öhlins / Showa / KYB
  fork_model: '',            // NPX25, FGR300...
  fork_type: '',             // Pressurizada/Convencional
  fork_oilLevel: '',         // mm
  fork_oilWeight: '',        // SAE
  fork_springRate: '',       // N/mm
  fork_preload: '',          // mm/voltas
  fork_compHigh: '',         // clicks
  fork_compLow: '',          // clicks
  fork_rebHigh: '',          // clicks
  fork_rebLow: '',           // clicks
  fork_sag: '',              // mm
  fork_travel: '',           // mm
  fork_extension: '',        // mm tubo exposto

  // Mono (rear shock — Öhlins TTX36)
  shock_brand: '',
  shock_model: '',
  shock_springRate: '',      // N/mm
  shock_preload: '',         // mm
  shock_compHigh: '',        // clicks
  shock_compLow: '',         // clicks
  shock_rebound: '',         // clicks
  shock_length: '',          // mm
  shock_sag: '',             // mm
  shock_travel: '',          // mm

  // Freios (Brembo)
  brake_frontDiscDiam: '',   // mm
  brake_frontDiscType: '',   // T-Drive/flutuante
  brake_frontPads: '',       // composto
  brake_frontCaliper: '',    // M50/GP4-RX
  brake_frontMaster: '',     // 19x18 etc
  brake_rearDiscDiam: '',
  brake_rearPads: '',
  brake_rearCaliper: '',
  brake_lever: '',           // distância/posição
  brake_brakeBias: '',       // %F/%R
  brake_thumbBrake: '',      // sim/não, posição

  // Transmissão (corrente)
  trans_primaryRatio: '',
  trans_finalDriveFront: '', // dentes pinhão
  trans_finalDriveRear: '',  // dentes coroa
  trans_chainPitch: '',      // 520/525/530
  trans_chainLinks: '',
  trans_gear1: '', trans_gear2: '', trans_gear3: '',
  trans_gear4: '', trans_gear5: '', trans_gear6: '',
  trans_quickShifter: '',    // sim/não, sensibilidade
  trans_autoBlipper: '',     // sim/não
  trans_clutchType: '',      // slipper/anti-hop

  // Eletrônica (TC/AW/EBC/SC/LC/PL)
  elec_ecu: '',              // Marelli/Cosworth
  elec_tc: '',               // 1-8
  elec_antiWheelie: '',      // 1-4
  elec_engineBrake: '',      // 1-4
  elec_slideControl: '',     // 1-4
  elec_launchControl: '',    // sim/não, nível
  elec_pitLimiter: '',       // km/h
  elec_powerMap: '',         // Map 1/2/3
  elec_throttleMap: '',
  elec_abs: '',              // off/road/race
  elec_gpsLapTrigger: '',

  // Pneus (referência rápida — gerência completa em PneusTab)
  tyre_frontCompound: '',
  tyre_rearCompound: '',
  tyre_frontPressure: '',    // bar
  tyre_rearPressure: '',     // bar
  tyre_warmerTempF: '',      // °C
  tyre_warmerTempR: '',      // °C

  // Aerodinâmica (winglets/cúpula)
  aero_winglets: '',         // sim/não, nível
  aero_screen: '',           // baixa/média/alta
  aero_bellyPan: '',
  aero_dragNotes: '',

  // Ergonomia
  ergo_handlebarHeight: '',  // mm
  ergo_handlebarOffset: '',  // mm
  ergo_pegPosition: '',      // padrão/+5mm etc
  ergo_seatHeight: '',       // mm
  ergo_seatFoam: '',
  ergo_tankPad: '',

  // Motor (referência)
  engine_powerMap: '',
  engine_revLimit: '',       // rpm
  engine_idleRpm: '',
  engine_oilTemp: '',        // °C max
  engine_coolantTemp: '',    // °C max

  // Notas
  notes: '',
};

/* ─── UI helpers ───────────────────────────────────────────────────────── */

function Field({ label, value, onChange, unit, half, third, COLORS }) {
  return (
    <div style={{
      flex: third ? '1 1 30%' : half ? '1 1 47%' : '1 1 100%',
      minWidth: third ? 110 : half ? 150 : 240,
    }}>
      <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            background: COLORS.bg,
            color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {unit && <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
    </div>
  );
}

function Section({ sectionKey, title, collapsed, toggle, children, theme, COLORS }) {
  return (
    <div style={theme.card}>
      <div
        onClick={() => toggle(sectionKey)}
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
}

const fieldRow = { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 };

/* ─── Componente principal ─────────────────────────────────────────────── */

export default function SetupSheetMotoTab({
  activeProfileId,
  onSaveSetup, profileSetups = [], onLoadSetup, onDeleteSetup,
  setupForm, setSetupForm,
  profileSessions = [],
}) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);

  const current = setupForm || { ...EMPTY_MOTO_SETUP };
  const setCurrent = setSetupForm;

  const update = (field) => (value) => {
    setCurrent((prev) => ({ ...(prev || EMPTY_MOTO_SETUP), [field]: value }));
  };

  const [collapsed, setCollapsed] = useState({});
  const toggle = (k) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  const [showSaved, setShowSaved] = useState(false);
  const [saveName, setSaveName] = useState('');

  const handleSave = () => {
    if (!saveName.trim()) return;
    if (!activeProfileId) {
      alert('Crie/selecione uma moto na aba "Motos" antes de salvar.');
      return;
    }
    onSaveSetup?.(activeProfileId, saveName.trim(), current);
    setSaveName('');
  };

  const handleNew = () => setCurrent({ ...EMPTY_MOTO_SETUP });

  return (
    <div style={{ padding: '20px 12px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>
          🏍️ Setup Sheet — Moto
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Nome do setup..."
            style={{
              background: COLORS.bg, color: COLORS.textPrimary,
              border: `1px solid ${COLORS.border}`, borderRadius: 6,
              padding: '8px 12px', fontSize: 12, outline: 'none', minWidth: 180,
            }}
          />
          <button onClick={handleSave} style={{ ...theme.pillButton(true), padding: '8px 16px' }}>
            💾 Salvar
          </button>
          {profileSetups.length > 0 && (
            <button onClick={() => setShowSaved((v) => !v)} style={{ ...theme.pillButton(showSaved), padding: '8px 16px' }}>
              📂 Setups Salvos ({profileSetups.length})
            </button>
          )}
          <button onClick={handleNew} style={{ ...theme.pillButton(false), padding: '8px 16px' }}>
            ➕ Novo
          </button>
        </div>
      </div>

      {/* Saved list */}
      {showSaved && profileSetups.length > 0 && (
        <div style={{ ...theme.card, marginBottom: 8 }}>
          <div style={theme.cardTitle}>📂 Setups Salvos no Perfil</div>
          {profileSetups.map((s) => (
            <div key={s.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}22`,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                  {s.data?.track && <span style={{ marginRight: 8 }}>📍 {s.data.track}</span>}
                  {s.data?.date  && <span style={{ marginRight: 8 }}>📅 {s.data.date}</span>}
                  {s.data?.rider && <span style={{ marginRight: 8 }}>🪖 {s.data.rider}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { onLoadSetup?.(s.id); setShowSaved(false); }}
                  style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 12px' }}>
                  Carregar
                </button>
                <button onClick={() => onDeleteSetup?.(s.id)}
                  style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 12px', borderColor: COLORS.accent, color: COLORS.accent }}>
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Evento */}
      <Section sectionKey="evento" title="📍 Evento" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="Autódromo" value={current.track} onChange={update('track')} COLORS={COLORS} />
          <Field label="Data da Etapa" value={current.date} onChange={update('date')} half COLORS={COLORS} />
          <Field label="Etapa / Evento" value={current.event} onChange={update('event')} half COLORS={COLORS} />
        </div>
        <div style={fieldRow}>
          <Field label="Piloto" value={current.rider} onChange={update('rider')} half COLORS={COLORS} />
          <Field label="Moto" value={current.bike} onChange={update('bike')} half COLORS={COLORS} />
        </div>
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
            Telemetria Vinculada
          </label>
          <select
            value={current.sessionId || ''}
            onChange={(e) => update('sessionId')(e.target.value)}
            style={{
              width: '100%', background: COLORS.bg, color: COLORS.textPrimary,
              border: `1px solid ${COLORS.border}`, borderRadius: 6,
              padding: '8px 12px', fontSize: 13, outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">— Nenhuma —</option>
            {profileSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.fileName ? ` — ${s.fileName}` : ''}
              </option>
            ))}
          </select>
        </div>
      </Section>

      {/* Geometria */}
      <Section sectionKey="geometria" title="📐 Geometria" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="Entre-eixos" unit="mm" value={current.geo_wheelbase} onChange={update('geo_wheelbase')} third COLORS={COLORS} />
          <Field label="Rake (caster)" unit="°" value={current.geo_rake} onChange={update('geo_rake')} third COLORS={COLORS} />
          <Field label="Trail" unit="mm" value={current.geo_trail} onChange={update('geo_trail')} third COLORS={COLORS} />
          <Field label="Offset (mesa)" unit="mm" value={current.geo_offset} onChange={update('geo_offset')} third COLORS={COLORS} />
          <Field label="Comprimento Balança" unit="mm" value={current.geo_swingarmLength} onChange={update('geo_swingarmLength')} third COLORS={COLORS} />
          <Field label="Ângulo Balança" unit="°" value={current.geo_swingarmAngle} onChange={update('geo_swingarmAngle')} third COLORS={COLORS} />
          <Field label="Anti-Squat" unit="%" value={current.geo_antiSquat} onChange={update('geo_antiSquat')} third COLORS={COLORS} />
          <Field label="Altura Dianteira" unit="mm" value={current.geo_frontRideHeight} onChange={update('geo_frontRideHeight')} third COLORS={COLORS} />
          <Field label="Altura Traseira" unit="mm" value={current.geo_rearRideHeight} onChange={update('geo_rearRideHeight')} third COLORS={COLORS} />
          <Field label="Altura CG" unit="mm" value={current.geo_cogHeight} onChange={update('geo_cogHeight')} third COLORS={COLORS} />
          <Field label="Distrib. Peso Diant." unit="%" value={current.geo_weightDistF} onChange={update('geo_weightDistF')} third COLORS={COLORS} />
          <Field label="Distrib. Peso Tras." unit="%" value={current.geo_weightDistR} onChange={update('geo_weightDistR')} third COLORS={COLORS} />
        </div>
      </Section>

      {/* Forquilha */}
      <Section sectionKey="fork" title="🔱 Forquilha (Front)" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="Marca" value={current.fork_brand} onChange={update('fork_brand')} third COLORS={COLORS} />
          <Field label="Modelo" value={current.fork_model} onChange={update('fork_model')} third COLORS={COLORS} />
          <Field label="Tipo" value={current.fork_type} onChange={update('fork_type')} third COLORS={COLORS} />
          <Field label="Nível Óleo" unit="mm" value={current.fork_oilLevel} onChange={update('fork_oilLevel')} third COLORS={COLORS} />
          <Field label="Visc. Óleo" unit="SAE" value={current.fork_oilWeight} onChange={update('fork_oilWeight')} third COLORS={COLORS} />
          <Field label="Mola" unit="N/mm" value={current.fork_springRate} onChange={update('fork_springRate')} third COLORS={COLORS} />
          <Field label="Pré-carga" unit="mm" value={current.fork_preload} onChange={update('fork_preload')} third COLORS={COLORS} />
          <Field label="Comp. Alta" unit="clicks" value={current.fork_compHigh} onChange={update('fork_compHigh')} third COLORS={COLORS} />
          <Field label="Comp. Baixa" unit="clicks" value={current.fork_compLow} onChange={update('fork_compLow')} third COLORS={COLORS} />
          <Field label="Reb. Alta" unit="clicks" value={current.fork_rebHigh} onChange={update('fork_rebHigh')} third COLORS={COLORS} />
          <Field label="Reb. Baixa" unit="clicks" value={current.fork_rebLow} onChange={update('fork_rebLow')} third COLORS={COLORS} />
          <Field label="Sag" unit="mm" value={current.fork_sag} onChange={update('fork_sag')} third COLORS={COLORS} />
          <Field label="Curso" unit="mm" value={current.fork_travel} onChange={update('fork_travel')} third COLORS={COLORS} />
          <Field label="Tubo Exposto" unit="mm" value={current.fork_extension} onChange={update('fork_extension')} third COLORS={COLORS} />
        </div>
      </Section>

      {/* Mono */}
      <Section sectionKey="shock" title="💥 Mono / Amortecedor (Rear)" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="Marca" value={current.shock_brand} onChange={update('shock_brand')} third COLORS={COLORS} />
          <Field label="Modelo" value={current.shock_model} onChange={update('shock_model')} third COLORS={COLORS} />
          <Field label="Mola" unit="N/mm" value={current.shock_springRate} onChange={update('shock_springRate')} third COLORS={COLORS} />
          <Field label="Pré-carga" unit="mm" value={current.shock_preload} onChange={update('shock_preload')} third COLORS={COLORS} />
          <Field label="Comp. Alta" unit="clicks" value={current.shock_compHigh} onChange={update('shock_compHigh')} third COLORS={COLORS} />
          <Field label="Comp. Baixa" unit="clicks" value={current.shock_compLow} onChange={update('shock_compLow')} third COLORS={COLORS} />
          <Field label="Rebound" unit="clicks" value={current.shock_rebound} onChange={update('shock_rebound')} third COLORS={COLORS} />
          <Field label="Comprimento" unit="mm" value={current.shock_length} onChange={update('shock_length')} third COLORS={COLORS} />
          <Field label="Sag" unit="mm" value={current.shock_sag} onChange={update('shock_sag')} third COLORS={COLORS} />
          <Field label="Curso" unit="mm" value={current.shock_travel} onChange={update('shock_travel')} third COLORS={COLORS} />
        </div>
      </Section>

      {/* Freios */}
      <Section sectionKey="brakes" title="🛑 Freios (Brembo)" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="Diâm. Disco Diant." unit="mm" value={current.brake_frontDiscDiam} onChange={update('brake_frontDiscDiam')} third COLORS={COLORS} />
          <Field label="Tipo Disco Diant." value={current.brake_frontDiscType} onChange={update('brake_frontDiscType')} third COLORS={COLORS} />
          <Field label="Pastilha Diant." value={current.brake_frontPads} onChange={update('brake_frontPads')} third COLORS={COLORS} />
          <Field label="Pinça Diant." value={current.brake_frontCaliper} onChange={update('brake_frontCaliper')} third COLORS={COLORS} />
          <Field label="Cilindro Mestre" value={current.brake_frontMaster} onChange={update('brake_frontMaster')} third COLORS={COLORS} />
          <Field label="Posição Manete" value={current.brake_lever} onChange={update('brake_lever')} third COLORS={COLORS} />
          <Field label="Diâm. Disco Tras." unit="mm" value={current.brake_rearDiscDiam} onChange={update('brake_rearDiscDiam')} third COLORS={COLORS} />
          <Field label="Pastilha Tras." value={current.brake_rearPads} onChange={update('brake_rearPads')} third COLORS={COLORS} />
          <Field label="Pinça Tras." value={current.brake_rearCaliper} onChange={update('brake_rearCaliper')} third COLORS={COLORS} />
          <Field label="Brake Bias" value={current.brake_brakeBias} onChange={update('brake_brakeBias')} third COLORS={COLORS} />
          <Field label="Thumb Brake" value={current.brake_thumbBrake} onChange={update('brake_thumbBrake')} third COLORS={COLORS} />
        </div>
      </Section>

      {/* Transmissão */}
      <Section sectionKey="trans" title="⛓️ Transmissão & Corrente" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="Relação Primária" value={current.trans_primaryRatio} onChange={update('trans_primaryRatio')} third COLORS={COLORS} />
          <Field label="Pinhão (dentes)" value={current.trans_finalDriveFront} onChange={update('trans_finalDriveFront')} third COLORS={COLORS} />
          <Field label="Coroa (dentes)" value={current.trans_finalDriveRear} onChange={update('trans_finalDriveRear')} third COLORS={COLORS} />
          <Field label="Passo Corrente" value={current.trans_chainPitch} onChange={update('trans_chainPitch')} third COLORS={COLORS} />
          <Field label="Elos" value={current.trans_chainLinks} onChange={update('trans_chainLinks')} third COLORS={COLORS} />
          <Field label="Quick Shifter" value={current.trans_quickShifter} onChange={update('trans_quickShifter')} third COLORS={COLORS} />
          <Field label="Auto Blipper" value={current.trans_autoBlipper} onChange={update('trans_autoBlipper')} third COLORS={COLORS} />
          <Field label="Tipo Embreagem" value={current.trans_clutchType} onChange={update('trans_clutchType')} third COLORS={COLORS} />
        </div>
        <div style={{ ...fieldRow, marginTop: 4 }}>
          <Field label="1ª" value={current.trans_gear1} onChange={update('trans_gear1')} third COLORS={COLORS} />
          <Field label="2ª" value={current.trans_gear2} onChange={update('trans_gear2')} third COLORS={COLORS} />
          <Field label="3ª" value={current.trans_gear3} onChange={update('trans_gear3')} third COLORS={COLORS} />
          <Field label="4ª" value={current.trans_gear4} onChange={update('trans_gear4')} third COLORS={COLORS} />
          <Field label="5ª" value={current.trans_gear5} onChange={update('trans_gear5')} third COLORS={COLORS} />
          <Field label="6ª" value={current.trans_gear6} onChange={update('trans_gear6')} third COLORS={COLORS} />
        </div>
      </Section>

      {/* Eletrônica */}
      <Section sectionKey="elec" title="🛰️ Eletrônica" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="ECU" value={current.elec_ecu} onChange={update('elec_ecu')} third COLORS={COLORS} />
          <Field label="TC (Traction Control)" unit="1-8" value={current.elec_tc} onChange={update('elec_tc')} third COLORS={COLORS} />
          <Field label="Anti-Wheelie" unit="1-4" value={current.elec_antiWheelie} onChange={update('elec_antiWheelie')} third COLORS={COLORS} />
          <Field label="Engine Brake (EBC)" unit="1-4" value={current.elec_engineBrake} onChange={update('elec_engineBrake')} third COLORS={COLORS} />
          <Field label="Slide Control" unit="1-4" value={current.elec_slideControl} onChange={update('elec_slideControl')} third COLORS={COLORS} />
          <Field label="Launch Control" value={current.elec_launchControl} onChange={update('elec_launchControl')} third COLORS={COLORS} />
          <Field label="Pit Limiter" unit="km/h" value={current.elec_pitLimiter} onChange={update('elec_pitLimiter')} third COLORS={COLORS} />
          <Field label="Power Map" value={current.elec_powerMap} onChange={update('elec_powerMap')} third COLORS={COLORS} />
          <Field label="Throttle Map" value={current.elec_throttleMap} onChange={update('elec_throttleMap')} third COLORS={COLORS} />
          <Field label="ABS" value={current.elec_abs} onChange={update('elec_abs')} third COLORS={COLORS} />
          <Field label="GPS Lap Trigger" value={current.elec_gpsLapTrigger} onChange={update('elec_gpsLapTrigger')} third COLORS={COLORS} />
        </div>
      </Section>

      {/* Pneus referência */}
      <Section sectionKey="tyres" title="⚫ Pneus (referência)" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="Composto Diant." value={current.tyre_frontCompound} onChange={update('tyre_frontCompound')} third COLORS={COLORS} />
          <Field label="Composto Tras." value={current.tyre_rearCompound} onChange={update('tyre_rearCompound')} third COLORS={COLORS} />
          <Field label="Pressão Diant." unit="bar" value={current.tyre_frontPressure} onChange={update('tyre_frontPressure')} third COLORS={COLORS} />
          <Field label="Pressão Tras." unit="bar" value={current.tyre_rearPressure} onChange={update('tyre_rearPressure')} third COLORS={COLORS} />
          <Field label="Aquecedor Diant." unit="°C" value={current.tyre_warmerTempF} onChange={update('tyre_warmerTempF')} third COLORS={COLORS} />
          <Field label="Aquecedor Tras." unit="°C" value={current.tyre_warmerTempR} onChange={update('tyre_warmerTempR')} third COLORS={COLORS} />
        </div>
      </Section>

      {/* Aerodinâmica */}
      <Section sectionKey="aero" title="🌬️ Aerodinâmica" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="Winglets" value={current.aero_winglets} onChange={update('aero_winglets')} third COLORS={COLORS} />
          <Field label="Cúpula (screen)" value={current.aero_screen} onChange={update('aero_screen')} third COLORS={COLORS} />
          <Field label="Belly Pan" value={current.aero_bellyPan} onChange={update('aero_bellyPan')} third COLORS={COLORS} />
          <Field label="Notas Drag/Downforce" value={current.aero_dragNotes} onChange={update('aero_dragNotes')} COLORS={COLORS} />
        </div>
      </Section>

      {/* Ergonomia */}
      <Section sectionKey="ergo" title="🧍 Ergonomia" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="Altura Guidão" unit="mm" value={current.ergo_handlebarHeight} onChange={update('ergo_handlebarHeight')} third COLORS={COLORS} />
          <Field label="Offset Guidão" unit="mm" value={current.ergo_handlebarOffset} onChange={update('ergo_handlebarOffset')} third COLORS={COLORS} />
          <Field label="Posição Pedaleira" value={current.ergo_pegPosition} onChange={update('ergo_pegPosition')} third COLORS={COLORS} />
          <Field label="Altura Banco" unit="mm" value={current.ergo_seatHeight} onChange={update('ergo_seatHeight')} third COLORS={COLORS} />
          <Field label="Espuma Banco" value={current.ergo_seatFoam} onChange={update('ergo_seatFoam')} third COLORS={COLORS} />
          <Field label="Tank Pad" value={current.ergo_tankPad} onChange={update('ergo_tankPad')} third COLORS={COLORS} />
        </div>
      </Section>

      {/* Motor */}
      <Section sectionKey="engine" title="🔥 Motor (referência)" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <div style={fieldRow}>
          <Field label="Power Map" value={current.engine_powerMap} onChange={update('engine_powerMap')} third COLORS={COLORS} />
          <Field label="Rev Limit" unit="rpm" value={current.engine_revLimit} onChange={update('engine_revLimit')} third COLORS={COLORS} />
          <Field label="Idle" unit="rpm" value={current.engine_idleRpm} onChange={update('engine_idleRpm')} third COLORS={COLORS} />
          <Field label="Temp. Óleo Máx" unit="°C" value={current.engine_oilTemp} onChange={update('engine_oilTemp')} third COLORS={COLORS} />
          <Field label="Temp. Água Máx" unit="°C" value={current.engine_coolantTemp} onChange={update('engine_coolantTemp')} third COLORS={COLORS} />
        </div>
      </Section>

      {/* Notas */}
      <Section sectionKey="notes" title="📝 Notas" collapsed={collapsed} toggle={toggle} theme={theme} COLORS={COLORS}>
        <textarea
          value={current.notes || ''}
          onChange={(e) => update('notes')(e.target.value)}
          rows={6}
          style={{
            width: '100%', background: COLORS.bg, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`, borderRadius: 6,
            padding: '10px 12px', fontSize: 13, outline: 'none',
            boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      </Section>

      <PrintFooter />
    </div>
  );
}
