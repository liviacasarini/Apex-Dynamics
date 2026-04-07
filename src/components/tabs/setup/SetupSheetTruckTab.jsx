import { useState, useEffect, useRef } from 'react';
import { useColors } from '@/context/ThemeContext';
import { useCarWeight } from '@/context/CarWeightContext';
import { makeTheme } from '@/styles/theme';
import { PrintFooter } from '@/components/common';

/* ─── Objeto vazio de setup (Copa Truck) ───────────────────────────────── */
const EMPTY_SETUP = {
  track: '',
  date: new Date().toISOString().split('T')[0],
  event: '',
  driver: '',
  car: '',
  sessionId: '',

  // ── Suspensao Pneumatica ──
  airBagFront: '',          // bar
  airBagRear: '',           // bar
  rideHeightFront: '',      // mm
  rideHeightRear: '',       // mm
  levelingValve: '',        // posicao/calibracao

  damperFront_marca: '', damperFront_modelo: '',
  damperFront_lsc: '', damperFront_hsc: '',
  damperFront_lsr: '', damperFront_hsr: '',

  damperRear_marca: '', damperRear_modelo: '',
  damperRear_lsc: '', damperRear_hsc: '',
  damperRear_lsr: '', damperRear_hsr: '',

  frontBarRate: '',         // N/mm
  rearBarRate: '',          // N/mm

  // ── Freio Pneumatico ──
  brake_systemPressure: '',     // bar
  brake_airTankPrimary: '',     // bar
  brake_airTankSecondary: '',   // bar
  brake_absType: '',
  brake_absMode: '',
  brake_discDiamFront: '',      // mm
  brake_discDiamRear: '',       // mm
  brake_discMaterial: '',
  brake_discThickFront: '',     // mm
  brake_discThickRear: '',      // mm
  brake_padCompound: '',
  brake_padWear: '',            // %
  brake_retarderType: '',       // Voith/ZF Intarder/Telma
  brake_retarderLevel: '',
  brake_retarderCoupling: '',
  brake_engineBrakeMode: '',
  brake_engineBrakeRpm: '',

  // ── Motor Diesel Turbo ──
  engine_maxPowerCv: '',
  engine_maxPowerRpm: '',
  engine_maxTorqueNm: '',
  engine_maxTorqueRpm: '',
  engine_displacement: '',       // cc (~13000)
  engine_cylinders: '',          // tipicamente 6
  engine_architecture: '',       // 6 em linha
  engine_compressionRatio: '',   // ~17:1
  engine_manufacturer: '',       // Volvo/Scania/Mercedes/MAN/DAF
  engine_commonRailPressure: '', // bar
  engine_pilotInjection: '',     // BTDC
  engine_mainInjection: '',      // BTDC
  engine_postInjection: '',
  engine_revLimit: '',
  engine_opTempMin: '',
  engine_opTempMax: '',
  engine_ecuMap: '',

  // ── Turbocompressor ──
  turbo_boostTarget: '',        // bar gauge
  turbo_wastegateType: '',
  turbo_wastegateBar: '',
  turbo_egt: '',                // C
  turbo_compEfficiency: '',     // %
  turbo_intercoolerType: '',    // ar-ar / ar-agua
  turbo_intercoolerEfficiency: '', // %

  // ── Transmissao (16 marchas) ──
  trans_numGears: '',
  trans_gear1: '', trans_gear2: '', trans_gear3: '', trans_gear4: '',
  trans_gear5: '', trans_gear6: '', trans_gear7: '', trans_gear8: '',
  trans_gear9: '', trans_gear10: '', trans_gear11: '', trans_gear12: '',
  trans_gear13: '', trans_gear14: '', trans_gear15: '', trans_gear16: '',
  trans_finalDrive: '',
  trans_gearboxType: '',    // ZF/Eaton
  trans_shiftTime: '',      // ms
  trans_clutchType: '',     // seca dupla
  trans_efficiency: '',     // %
  trans_retarderIntegrated: '', // Sim/Nao

  // ── Diferencial ──
  diff_type: '',            // bloqueante, limited-slip, eletronico
  diff_ratio: '',
  diff_lockPercent: '',     // %
  diff_preload: '',         // Nm

  // ── Chassi ──
  chassis_weightTotal: '',  // kg
  chassis_weightFront: '',  // kg eixo diant.
  chassis_weightRear: '',   // kg eixo tras.
  chassis_cgHeight: '',     // mm
  chassis_wheelbase: '',    // mm
  chassis_trackFront: '',   // mm
  chassis_trackRear: '',    // mm

  // ── Direcao ──
  steer_ratio: '',
  steer_pumpPressure: '',   // bar
  steer_servoType: '',      // hidraulica

  // ── Carenagem / Aerodinamica ──
  aero_roofSpoiler: '',     // angulo
  aero_sideFairings: '',    // Sim/Nao
  aero_sideSkirts: '',      // Sim/Nao

  // ── Arrefecimento ──
  cooling_radiatorType: '',
  cooling_radiatorCapacity: '',  // L
  cooling_intercoolerType: '',
  cooling_fanType: '',           // viscoso/eletrico
  cooling_thermostatTemp: '',    // C

  // ── Eletronica ──
  elecFuelMap: '',
  elecBoostMap: '',
  absLevel: '',
  tcPoint: '',
  retarderMap: '',
  engineBrakeMap: '',

  // ── Lubrificacao ──
  oilViscosity: '',     // SAE
  oilCapacity: '',      // L
  oilPressMin: '',      // bar
  oilPressMax: '',      // bar
  oilTempMin: '',       // C
  oilTempMax: '',       // C
  coolantTempMin: '',   // C
  coolantTempMax: '',   // C

  // ── Notas ──
  notes: '',
};

const STORAGE_KEY = 'race_telemetry_truck_setups';

function loadSetups() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSetups(setups) {
  try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(setups)); }
  catch { /* noop */ }
}

/* ─── Componentes auxiliares ────────────────────────────────────────────── */

function InputField({ label, value, onChange, unit, half, inputBase, textMuted, type = 'text' }) {
  return (
    <div style={{ flex: half ? '1 1 48%' : '1 1 100%', minWidth: half ? 140 : 280 }}>
      <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={inputBase}
        />
        {unit && <span style={{ fontSize: 11, color: textMuted, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ children, accentColor }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: accentColor, marginBottom: 14, marginTop: 8 }}>
      {children}
    </div>
  );
}

/**
 * Grade de eixo: duas colunas (Dianteiro, Traseiro) para suspensao pneumatica.
 * rows = [{ fieldFront, fieldRear, label, unit }]
 */
function AxleGrid({ rows, current, onUpdate, inputBase, borderColor, greenColor, textMuted, textSecondary }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Cabecalho */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '140px repeat(2, 1fr)',
        gap: 6,
        marginBottom: 4,
        paddingBottom: 6,
        borderBottom: `1px solid ${borderColor}33`,
      }}>
        <div />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: greenColor }}>Dianteiro</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: greenColor }}>Traseiro</div>
        </div>
      </div>

      {/* Linhas de parametros */}
      {rows.map(({ fieldFront, fieldRear, label, unit }) => (
        <div
          key={fieldFront}
          style={{
            display: 'grid',
            gridTemplateColumns: '140px repeat(2, 1fr)',
            gap: 6,
            marginBottom: 6,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 11, color: textSecondary, fontWeight: 600 }}>
            {label}
            {unit && <span style={{ color: textMuted, fontWeight: 400, marginLeft: 3 }}>({unit})</span>}
          </div>
          <input
            type="text"
            value={current[fieldFront] ?? ''}
            onChange={(e) => onUpdate(fieldFront)(e.target.value)}
            placeholder="\u2014"
            style={{ ...inputBase, padding: '7px 6px', textAlign: 'center', fontSize: 13 }}
          />
          <input
            type="text"
            value={current[fieldRear] ?? ''}
            onChange={(e) => onUpdate(fieldRear)(e.target.value)}
            placeholder="\u2014"
            style={{ ...inputBase, padding: '7px 6px', textAlign: 'center', fontSize: 13 }}
          />
        </div>
      ))}
    </div>
  );
}

/* ─── Componente de secao colapsavel ───────────────────────────────────── */
function SectionBox({ sectionKey, title, children, collapsed, toggleSection }) {
  const COLORS = useColors();
  const theme  = makeTheme(COLORS);
  return (
    <div style={theme.card}>
      <div
        onClick={() => toggleSection(sectionKey)}
        style={{ fontSize: 13, fontWeight: 700, color: COLORS.accent, marginBottom: collapsed[sectionKey] ? 0 : 14, marginTop: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: COLORS.textMuted }}>
          {collapsed[sectionKey] ? '\u25B8' : '\u25BE'}
        </span>
      </div>
      {!collapsed[sectionKey] && children}
    </div>
  );
}

/* ─── Componente principal ──────────────────────────────────────────────── */
export default function SetupSheetTruckTab({
  profileLoad, profilesList = [], activeProfileId,
  profileGroups = [],
  onSaveSetup, profileSetups = [], onLoadSetup, onDeleteSetup,
  setupForm, setSetupForm,
  profileSessions = [],
}) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);
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

  const current = setupForm || { ...EMPTY_SETUP };
  const setCurrent = setSetupForm;

  const [showSaved, setShowSaved] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // Salvar no perfil
  const [profileSaveName,   setProfileSaveName]   = useState('');
  const [profileSaveTarget, setProfileSaveTarget] = useState('');
  const [profileSaveMsg,    setProfileSaveMsg]    = useState(null);
  const [setupGroupId,      setSetupGroupId]      = useState('');

  // Inicializa o dropdown com o perfil ativo
  useEffect(() => {
    if (activeProfileId && !profileSaveTarget) setProfileSaveTarget(activeProfileId);
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega dados vindos do sistema de perfis
  const lastLoadedSeqRef = useRef(0);
  useEffect(() => {
    if (!profileLoad?.data || profileLoad.seq <= lastLoadedSeqRef.current) return;
    lastLoadedSeqRef.current = profileLoad.seq;
    setCurrent({ ...EMPTY_SETUP, ...profileLoad.data });
  }, [profileLoad?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Atualiza campo simples */
  const updateField = (field) => (val) => {
    setCurrent((prev) => ({ ...(prev || EMPTY_SETUP), [field]: val }));
  };

  const handleNew = () => { setCurrent({ ...EMPTY_SETUP }); };

  const handleSaveToProfile = () => {
    if (!profileSaveName.trim()) {
      setProfileSaveMsg({ ok: false, text: 'Digite um nome para o setup.' });
      return;
    }
    const targetId = profileSaveTarget || activeProfileId;
    if (!targetId) {
      setProfileSaveMsg({ ok: false, text: 'Selecione um perfil de destino.' });
      return;
    }
    const result = onSaveSetup?.(targetId, profileSaveName.trim(), current, setupGroupId || undefined);
    if (result?.error) {
      setProfileSaveMsg({ ok: false, text: result.error });
    } else {
      setProfileSaveMsg({ ok: true, text: `Salvo em "${profilesList.find(p => p.id === targetId)?.name || 'perfil'}"!` });
      setProfileSaveName('');
      setTimeout(() => setProfileSaveMsg(null), 3500);
    }
  };

  const fieldRow = { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 };

  /* Linhas do AxleGrid para suspensao */
  const AXLE_SUSPENSION_ROWS = [
    { fieldFront: 'airBagFront',     fieldRear: 'airBagRear',     label: 'Air Bag',       unit: 'bar' },
    { fieldFront: 'rideHeightFront', fieldRear: 'rideHeightRear', label: 'Altura de Roda', unit: 'mm' },
  ];

  const TEXTAREA_STYLE = {
    width: '100%', background: COLORS.bg, color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '10px 14px',
    fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>🚛</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Setup Sheet — Copa Truck</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>Salve e recupere setups de caminhao por etapa e data</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {profileSetups.length > 0 && (
            <button
              onClick={() => setShowSaved((v) => !v)}
              style={{ ...theme.pillButton(showSaved), padding: '8px 16px' }}
            >
              📂 Setups Salvos ({profileSetups.length})
            </button>
          )}
          <button onClick={handleNew} style={{ ...theme.pillButton(false), padding: '8px 16px' }}>
            ➕ Novo
          </button>
        </div>
      </div>

      {/* ── Setups salvos no perfil ── */}
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
                  {s.data?.driver && <span style={{ marginRight: 8 }}>👤 {s.data.driver}</span>}
                  {s.data?.sessionId && (() => {
                    const linked = profileSessions.find((ps) => ps.id === s.data.sessionId);
                    return linked
                      ? <span style={{ color: COLORS.green }}>📂 {linked.name}</span>
                      : null;
                  })()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { onLoadSetup?.(s.id); setShowSaved(false); }}
                  style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 12px' }}
                >
                  Carregar
                </button>
                <button
                  onClick={() => onDeleteSetup?.(s.id)}
                  style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 12px', borderColor: COLORS.accent, color: COLORS.accent }}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  📋 EVENTO                                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="evento" title="📋 Evento">
        <div style={fieldRow}>
          <InputField label="Autodromo"      value={current.track}  onChange={updateField('track')} inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Data da Etapa"  value={current.date}   onChange={updateField('date')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Etapa / Evento" value={current.event}  onChange={updateField('event')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Piloto"   value={current.driver} onChange={updateField('driver')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Caminhao" value={current.car}    onChange={updateField('car')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        {/* Telemetria vinculada */}
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
            Telemetria Vinculada
          </label>
          <select
            value={current.sessionId || ''}
            onChange={(e) => updateField('sessionId')(e.target.value)}
            style={{ ...INPUT_BASE, cursor: 'pointer' }}
          >
            <option value="">— Nenhuma —</option>
            {profileSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.fileName ? ` — ${s.fileName}` : ''}
              </option>
            ))}
          </select>
          {current.sessionId && (() => {
            const linked = profileSessions.find((s) => s.id === current.sessionId);
            return linked ? (
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
                📅 Salvo em: {new Date(linked.savedAt).toLocaleString('pt-BR')}
                {linked.sessionKm ? ` · ${linked.sessionKm} km` : ''}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: COLORS.yellow, marginTop: 4 }}>
                ⚠️ Sessao nao encontrada no perfil atual
              </div>
            );
          })()}
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  🔧 SUSPENSAO PNEUMATICA                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="suspensao" title="🔧 Suspensao Pneumatica">
        <AxleGrid
          rows={AXLE_SUSPENSION_ROWS}
          current={current}
          onUpdate={updateField}
          inputBase={INPUT_BASE}
          borderColor={COLORS.border}
          greenColor={COLORS.green}
          textMuted={COLORS.textMuted}
          textSecondary={COLORS.textSecondary}
        />

        <div style={fieldRow}>
          <InputField label="Valvula Niveladora" value={current.levelingValve} onChange={updateField('levelingValve')} inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        {/* Amortecedores Dianteiros */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <SectionTitle accentColor={COLORS.green}>Amortecedor Dianteiro</SectionTitle>
          <div style={fieldRow}>
            <InputField label="Marca"  value={current.damperFront_marca}  onChange={updateField('damperFront_marca')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Modelo" value={current.damperFront_modelo} onChange={updateField('damperFront_modelo')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
          <div style={fieldRow}>
            <InputField label="LSC (Low Speed Compression)" value={current.damperFront_lsc} onChange={updateField('damperFront_lsc')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="HSC (High Speed Compression)" value={current.damperFront_hsc} onChange={updateField('damperFront_hsc')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
          <div style={fieldRow}>
            <InputField label="LSR (Low Speed Rebound)" value={current.damperFront_lsr} onChange={updateField('damperFront_lsr')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="HSR (High Speed Rebound)" value={current.damperFront_hsr} onChange={updateField('damperFront_hsr')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>

        {/* Amortecedores Traseiros */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <SectionTitle accentColor={COLORS.green}>Amortecedor Traseiro</SectionTitle>
          <div style={fieldRow}>
            <InputField label="Marca"  value={current.damperRear_marca}  onChange={updateField('damperRear_marca')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Modelo" value={current.damperRear_modelo} onChange={updateField('damperRear_modelo')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
          <div style={fieldRow}>
            <InputField label="LSC (Low Speed Compression)" value={current.damperRear_lsc} onChange={updateField('damperRear_lsc')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="HSC (High Speed Compression)" value={current.damperRear_hsc} onChange={updateField('damperRear_hsc')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
          <div style={fieldRow}>
            <InputField label="LSR (Low Speed Rebound)" value={current.damperRear_lsr} onChange={updateField('damperRear_lsr')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="HSR (High Speed Rebound)" value={current.damperRear_hsr} onChange={updateField('damperRear_hsr')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>

        {/* Barra Antirolamento */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
            Barra Antirolamento (por eixo)
          </div>
          <div style={fieldRow}>
            <InputField label="Barra Dianteira" value={current.frontBarRate} onChange={updateField('frontBarRate')} unit="N/mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Barra Traseira"  value={current.rearBarRate}  onChange={updateField('rearBarRate')}  unit="N/mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  🛑 FREIO PNEUMATICO / RETARDER                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="freio" title="🛑 Freio Pneumatico / Retarder">
        <SectionTitle accentColor={COLORS.accent}>Sistema Pneumatico</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Pressao do Sistema"     value={current.brake_systemPressure}   onChange={updateField('brake_systemPressure')}   unit="bar" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Reservatorio Primario"  value={current.brake_airTankPrimary}   onChange={updateField('brake_airTankPrimary')}   unit="bar" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Reservatorio Secundario" value={current.brake_airTankSecondary} onChange={updateField('brake_airTankSecondary')} unit="bar" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <SectionTitle accentColor={COLORS.accent}>ABS</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Tipo ABS"  value={current.brake_absType} onChange={updateField('brake_absType')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Modo ABS"  value={current.brake_absMode} onChange={updateField('brake_absMode')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <SectionTitle accentColor={COLORS.accent}>Discos e Pastilhas</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Diam. Disco Dianteiro" value={current.brake_discDiamFront}  onChange={updateField('brake_discDiamFront')}  unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Diam. Disco Traseiro"  value={current.brake_discDiamRear}   onChange={updateField('brake_discDiamRear')}   unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Material do Disco"     value={current.brake_discMaterial}   onChange={updateField('brake_discMaterial')}           half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Espessura Disco Diant." value={current.brake_discThickFront} onChange={updateField('brake_discThickFront')} unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Espessura Disco Tras."  value={current.brake_discThickRear}  onChange={updateField('brake_discThickRear')}  unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Composto da Pastilha" value={current.brake_padCompound} onChange={updateField('brake_padCompound')}       half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Desgaste da Pastilha" value={current.brake_padWear}     onChange={updateField('brake_padWear')} unit="%" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <SectionTitle accentColor={COLORS.accent}>Retarder / Freio Motor</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Tipo Retarder"      value={current.brake_retarderType}     onChange={updateField('brake_retarderType')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Nivel Retarder"     value={current.brake_retarderLevel}    onChange={updateField('brake_retarderLevel')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Acoplamento Retarder" value={current.brake_retarderCoupling} onChange={updateField('brake_retarderCoupling')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Modo Freio Motor"   value={current.brake_engineBrakeMode} onChange={updateField('brake_engineBrakeMode')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="RPM Freio Motor"    value={current.brake_engineBrakeRpm}  onChange={updateField('brake_engineBrakeRpm')}  unit="rpm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  🔥 MOTOR DIESEL TURBO                                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="motor" title="🔥 Motor Diesel Turbo">
        <SectionTitle accentColor={COLORS.yellow}>Dados Gerais</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Fabricante"           value={current.engine_manufacturer}     onChange={updateField('engine_manufacturer')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Arquitetura"          value={current.engine_architecture}     onChange={updateField('engine_architecture')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Cilindros"            value={current.engine_cylinders}        onChange={updateField('engine_cylinders')}        half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Cilindrada"           value={current.engine_displacement}     onChange={updateField('engine_displacement')} unit="cc" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Taxa de Compressao"   value={current.engine_compressionRatio} onChange={updateField('engine_compressionRatio')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <SectionTitle accentColor={COLORS.yellow}>Desempenho</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Potencia Maxima"      value={current.engine_maxPowerCv}   onChange={updateField('engine_maxPowerCv')}   unit="cv"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="RPM Potencia Max."    value={current.engine_maxPowerRpm}  onChange={updateField('engine_maxPowerRpm')}  unit="rpm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Torque Maximo"        value={current.engine_maxTorqueNm}  onChange={updateField('engine_maxTorqueNm')}  unit="Nm"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="RPM Torque Max."      value={current.engine_maxTorqueRpm} onChange={updateField('engine_maxTorqueRpm')} unit="rpm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Limite de Rotacao"    value={current.engine_revLimit}     onChange={updateField('engine_revLimit')}     unit="rpm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <SectionTitle accentColor={COLORS.yellow}>Injecao Common Rail</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Pressao Common Rail"  value={current.engine_commonRailPressure} onChange={updateField('engine_commonRailPressure')} unit="bar"    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Injecao Piloto"       value={current.engine_pilotInjection}     onChange={updateField('engine_pilotInjection')}     unit="°BTDC" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Injecao Principal"    value={current.engine_mainInjection}      onChange={updateField('engine_mainInjection')}      unit="°BTDC" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Pos-Injecao"          value={current.engine_postInjection}      onChange={updateField('engine_postInjection')}                   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        <SectionTitle accentColor={COLORS.yellow}>Temperaturas / ECU</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Temp. Operacao Min." value={current.engine_opTempMin} onChange={updateField('engine_opTempMin')} unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Temp. Operacao Max." value={current.engine_opTempMax} onChange={updateField('engine_opTempMax')} unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Mapa ECU"            value={current.engine_ecuMap}    onChange={updateField('engine_ecuMap')}            half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  💨 TURBOCOMPRESSOR                                                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="turbo" title="💨 Turbocompressor">
        <div style={fieldRow}>
          <InputField label="Boost Target"          value={current.turbo_boostTarget}    onChange={updateField('turbo_boostTarget')}    unit="bar"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Tipo Wastegate"        value={current.turbo_wastegateType}  onChange={updateField('turbo_wastegateType')}              half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Pressao Wastegate"     value={current.turbo_wastegateBar}   onChange={updateField('turbo_wastegateBar')}   unit="bar"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="EGT"                   value={current.turbo_egt}            onChange={updateField('turbo_egt')}            unit="°C"   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Efic. Compressor"      value={current.turbo_compEfficiency} onChange={updateField('turbo_compEfficiency')} unit="%"    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Tipo Intercooler"      value={current.turbo_intercoolerType}       onChange={updateField('turbo_intercoolerType')}              half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Efic. Intercooler"     value={current.turbo_intercoolerEfficiency}  onChange={updateField('turbo_intercoolerEfficiency')} unit="%" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  ⚙️ TRANSMISSAO                                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="transmissao" title="⚙️ Transmissao">
        <div style={fieldRow}>
          <InputField label="Numero de Marchas" value={current.trans_numGears}   onChange={updateField('trans_numGears')}           half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Tipo Cambio"       value={current.trans_gearboxType} onChange={updateField('trans_gearboxType')}        half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Tempo de Troca"    value={current.trans_shiftTime}  onChange={updateField('trans_shiftTime')} unit="ms" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Tipo Embreagem"    value={current.trans_clutchType}  onChange={updateField('trans_clutchType')}        half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Eficiencia"        value={current.trans_efficiency}  onChange={updateField('trans_efficiency')} unit="%" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Retarder Integrado" value={current.trans_retarderIntegrated} onChange={updateField('trans_retarderIntegrated')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

        {/* Relacoes de marcha */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Relacoes de Marcha</div>
          <div style={fieldRow}>
            {[1,2,3,4,5,6,7,8].map(n => (
              <InputField key={n} label={`${n}a`} value={current[`trans_gear${n}`]} onChange={updateField(`trans_gear${n}`)} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            ))}
          </div>
          <div style={fieldRow}>
            {[9,10,11,12,13,14,15,16].map(n => (
              <InputField key={n} label={`${n}a`} value={current[`trans_gear${n}`]} onChange={updateField(`trans_gear${n}`)} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            ))}
          </div>
          <div style={fieldRow}>
            <InputField label="Relacao Final" value={current.trans_finalDrive} onChange={updateField('trans_finalDrive')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  🔗 DIFERENCIAL                                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="diferencial" title="🔗 Diferencial">
        <div style={fieldRow}>
          <InputField label="Tipo"          value={current.diff_type}        onChange={updateField('diff_type')}                  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Relacao"       value={current.diff_ratio}       onChange={updateField('diff_ratio')}                 half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="% Bloqueio"    value={current.diff_lockPercent} onChange={updateField('diff_lockPercent')} unit="%"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Preload"       value={current.diff_preload}     onChange={updateField('diff_preload')}     unit="Nm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  🏗️ CHASSI                                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="chassi" title="🏗️ Chassi">
        <div style={fieldRow}>
          <InputField label="Peso Total"         value={current.chassis_weightTotal} onChange={updateField('chassis_weightTotal')} unit="kg" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Peso Eixo Diant."   value={current.chassis_weightFront} onChange={updateField('chassis_weightFront')} unit="kg" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Peso Eixo Tras."    value={current.chassis_weightRear}  onChange={updateField('chassis_weightRear')}  unit="kg" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Altura do CG"       value={current.chassis_cgHeight}    onChange={updateField('chassis_cgHeight')}    unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Entre-eixos"        value={current.chassis_wheelbase}   onChange={updateField('chassis_wheelbase')}   unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Bitola Dianteira"   value={current.chassis_trackFront}  onChange={updateField('chassis_trackFront')}  unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Bitola Traseira"    value={current.chassis_trackRear}   onChange={updateField('chassis_trackRear')}   unit="mm" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  🔄 DIRECAO                                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="direcao" title="🔄 Direcao">
        <div style={fieldRow}>
          <InputField label="Relacao de Direcao" value={current.steer_ratio}        onChange={updateField('steer_ratio')}                    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Pressao da Bomba"   value={current.steer_pumpPressure} onChange={updateField('steer_pumpPressure')} unit="bar"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Tipo Servo"         value={current.steer_servoType}    onChange={updateField('steer_servoType')}                half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  🌬️ CARENAGEM / AERODINAMICA                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="carenagem" title="🌬️ Carenagem / Aerodinamica">
        <div style={fieldRow}>
          <InputField label="Spoiler de Teto"    value={current.aero_roofSpoiler}  onChange={updateField('aero_roofSpoiler')}  unit="°" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Carenagens Laterais" value={current.aero_sideFairings} onChange={updateField('aero_sideFairings')}          half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Side Skirts"        value={current.aero_sideSkirts}   onChange={updateField('aero_sideSkirts')}             half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  ❄️ ARREFECIMENTO                                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="arrefecimento" title="❄️ Arrefecimento">
        <div style={fieldRow}>
          <InputField label="Tipo Radiador"      value={current.cooling_radiatorType}     onChange={updateField('cooling_radiatorType')}              half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Capacidade Radiador" value={current.cooling_radiatorCapacity} onChange={updateField('cooling_radiatorCapacity')} unit="L" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Tipo Intercooler"   value={current.cooling_intercoolerType}  onChange={updateField('cooling_intercoolerType')}            half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Tipo Ventilador"    value={current.cooling_fanType}          onChange={updateField('cooling_fanType')}                    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Temp. Termostato"   value={current.cooling_thermostatTemp}   onChange={updateField('cooling_thermostatTemp')} unit="°C"   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  ⚡ ELETRONICA                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="eletronica" title="⚡ Eletronica">
        <div style={fieldRow}>
          <InputField label="Mapa de Combustivel" value={current.elecFuelMap}  onChange={updateField('elecFuelMap')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Mapa de Boost"       value={current.elecBoostMap} onChange={updateField('elecBoostMap')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Nivel ABS"           value={current.absLevel}        onChange={updateField('absLevel')}        half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Tracao (TC)"         value={current.tcPoint}         onChange={updateField('tcPoint')}         half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Mapa Retarder"       value={current.retarderMap}     onChange={updateField('retarderMap')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Mapa Freio Motor"    value={current.engineBrakeMap}  onChange={updateField('engineBrakeMap')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  🛢️ LUBRIFICACAO                                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="lubrificacao" title="🛢️ Lubrificacao">
        <div style={fieldRow}>
          <InputField label="Viscosidade Oleo" value={current.oilViscosity} onChange={updateField('oilViscosity')} unit="SAE" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Capacidade Oleo"  value={current.oilCapacity}  onChange={updateField('oilCapacity')}  unit="L"   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Pressao Oleo Min."  value={current.oilPressMin}    onChange={updateField('oilPressMin')}    unit="bar" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Pressao Oleo Max."  value={current.oilPressMax}    onChange={updateField('oilPressMax')}    unit="bar" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Temp. Oleo Min."    value={current.oilTempMin}     onChange={updateField('oilTempMin')}     unit="°C"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Temp. Oleo Max."    value={current.oilTempMax}     onChange={updateField('oilTempMax')}     unit="°C"  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Temp. Liquido Arref. Min." value={current.coolantTempMin} onChange={updateField('coolantTempMin')} unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Temp. Liquido Arref. Max." value={current.coolantTempMax} onChange={updateField('coolantTempMax')} unit="°C" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
      </SectionBox>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/*  📝 NOTAS                                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="notas" title="📝 Notas">
        <textarea
          value={current.notes}
          onChange={(e) => updateField('notes')(e.target.value)}
          rows={4}
          style={TEXTAREA_STYLE}
          placeholder="Comportamento do caminhao, mudancas, observacoes..."
        />
      </SectionBox>

      {/* ── Salvar no Perfil ── */}
      <div style={{ background: `${COLORS.purple}0a`, border: `1px solid ${COLORS.purple}30`, borderRadius: 12, padding: '14px 16px', marginTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.purple, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
          Salvar no Perfil
        </div>
        {profilesList.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            Crie um perfil na aba <b style={{ color: COLORS.textSecondary }}>Perfis</b> para poder salvar.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '2 1 180px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Nome do setup</label>
                <input
                  type="text"
                  value={profileSaveName}
                  onChange={(e) => { setProfileSaveName(e.target.value); setProfileSaveMsg(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveToProfile()}
                  placeholder="Ex: Setup Q1 — Freio duro curva 3"
                  style={{ ...INPUT_BASE, padding: '7px 11px' }}
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Perfil de destino</label>
                <select
                  value={profileSaveTarget || activeProfileId || ''}
                  onChange={(e) => { setProfileSaveTarget(e.target.value); setProfileSaveMsg(null); }}
                  style={{ ...INPUT_BASE, cursor: 'pointer', padding: '7px 11px' }}
                >
                  <option value="">— Selecionar —</option>
                  {profilesList.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {profileGroups.length > 0 && (
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Pasta (opcional)</label>
                  <select
                    value={setupGroupId}
                    onChange={(e) => { setSetupGroupId(e.target.value); setProfileSaveMsg(null); }}
                    style={{ ...INPUT_BASE, cursor: 'pointer', padding: '7px 11px' }}
                  >
                    <option value="">— Sem pasta —</option>
                    {profileGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={handleSaveToProfile}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: COLORS.purple, color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                Salvar Setup
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

      <PrintFooter />
    </div>
  );
}
