import { useState, useEffect, useRef } from 'react';
import { useColors } from '@/context/ThemeContext';
import { useCarWeight, REG_PESO_CHANGED_EVENT, SETUP_REG_CHANGED_EVENT } from '@/context/CarWeightContext';
import { makeTheme } from '@/styles/theme';
import { PrintFooter } from '@/components/common';

/* ─── Objeto vazio de setup ─────────────────────────────────────────────── */
const EMPTY_CORNER = () => ({ fl: '', fr: '', rl: '', rr: '' });

const EMPTY_SETUP = {
  track: '',
  date: new Date().toISOString().split('T')[0],
  event: '',
  driver: '',
  car: '',
  sessionId: '',

  // ── Suspensão por canto (FL · FR · RL · RR) ──
  spring:        EMPTY_CORNER(),   // N/mm
  springPreload: EMPTY_CORNER(),   // mm
  rideHeight:    EMPTY_CORNER(),   // mm
  camber:        EMPTY_CORNER(),   // °
  toe:           EMPTY_CORNER(),   // mm
  caster:        EMPTY_CORNER(),   // °

  // ── Magic Number (Camber por eixo) ──
  magicCamberFront: '',
  magicCamberRear:  '',

  // ── Barra antirolamento (por eixo) ──
  frontBarRate: '',
  rearBarRate:  '',

  // ── Freios / Transmissão (legacy, kept for compat) ──
  brakeBias:  '',
  finalDrive: '',
  diffSetting:'',

  // ── Freio avançado ──
  brake_maxPedalPressure: '',
  brake_refSpeed:         '',
  brake_decelG:           '',
  brake_discTempMin:      '',
  brake_discTempMax:      '',
  brake_padFadeTemp:      '',
  brake_discDeformation:  '',
  brake_discRadiusFront:  '',
  brake_discRadiusRear:   '',
  brake_totalForce:       '',

  // ── Motor ──
  engine_maxPowerCv:       '',
  engine_maxPowerRpm:      '',
  engine_maxTorqueNm:      '',
  engine_maxTorqueRpm:     '',
  engine_displacement:     '',
  engine_cylinders:        '',
  engine_architecture:     '',
  engine_compressionRatio: '',
  engine_crankAngle:       '',
  engine_throttleResponse: '',
  engine_ecuIgnMap:        '',
  engine_ecuInjMap:        '',
  engine_ecuFuelCut:       '',
  engine_revLimit:         '',
  engine_opTempMin:        '',
  engine_opTempMax:        '',

  // ── Transmissão ──
  trans_numGears:   '',
  trans_gear1: '', trans_gear2: '', trans_gear3: '', trans_gear4: '',
  trans_gear5: '', trans_gear6: '', trans_gear7: '', trans_gear8: '',
  trans_finalDrive:    '',
  trans_gearboxType:   '',
  trans_shiftTime:     '',
  trans_clutchType:    '',
  trans_efficiency:    '',
  trans_inertiaMoment: '',
  trans_tyreRadius:    '',

  // ── Diferencial ──
  diff_type:              '',
  diff_rampAccel:         '',
  diff_rampDecel:         '',
  diff_lockAccel:         '',
  diff_lockBrake:         '',
  diff_preload:           '',
  diff_torqueSensitivity: '',

  // ── Chassi / Estrutura ──
  chassis_weightTotal:   '',
  chassis_weightNoPilot: '',
  chassis_weightFront:   '',
  chassis_weightRear:    '',
  chassis_cgHeight:      '',
  chassis_cgLong:        '',
  chassis_cgLat:         '',
  chassis_torsionalRig:  '',
  chassis_material:      '',
  chassis_inertiRoll:    '',
  chassis_inertiPitch:   '',
  chassis_inertiYaw:     '',
  chassis_flexRigidity:  '',
  chassis_anchorNotes:   '',
  chassis_crashStructure:'',
  chassis_sideImpact:    '',
  chassis_rollHoop:      '',

  // ── Direção ──
  steer_ratio:          '',
  steer_lockToLock:     '',
  steer_columnRigidity: '',
  steer_casterTrail:    '',
  steer_pneumaticTrail: '',
  steer_feedback:       '',
  steer_quickRelease:   '',
  steer_wheelDiam:      '',
  steer_wheelGeometry:  '',
  steer_powerSteering:  '',

  // ── Motor / Aero ──
  fuelMap:       '',
  ignitionMap:   '',
  boostPressure: '',
  frontWing:     '',
  rearWing:      '',

  // ── Aerodinâmica avançada ──
  aero_cd:              '',   // Coeficiente de arrasto
  aero_cl:              '',   // Coeficiente de downforce
  aero_frontalArea:     '',   // Área frontal (m²)
  aero_refSpeed:        '',   // Velocidade de referência p/ cálculos (km/h)
  aero_cpLong:          '',   // Centro de pressão longitudinal (% do entre-eixos)
  aero_cpLat:           '',   // Centro de pressão lateral (mm do centro)
  aero_dfFront:         '',   // Downforce dianteiro (N)
  aero_dfRear:          '',   // Downforce traseiro (N)
  aero_yawDeltaCd:      '',   // ΔCd por grau de yaw
  aero_yawDeltaCl:      '',   // ΔCl por grau de yaw
  aero_groundDeltaDf:   '',   // ΔDownforce por mm de ride height (N/mm)
  aero_groundRefRh:     '',   // Ride height de referência (mm)

  // ── Suspensão avançada ──
  susp_mrFront:         '',   // Motion ratio mola dianteira
  susp_mrRear:          '',   // Motion ratio mola traseira
  susp_mrArbFront:      '',   // Motion ratio ARB dianteiro
  susp_mrArbRear:       '',   // Motion ratio ARB traseiro
  susp_trackFront:      '',   // Largura de via dianteira (mm)
  susp_trackRear:       '',   // Largura de via traseira (mm)
  susp_massFront:       '',   // Massa suspensa por corner dianteiro (kg)
  susp_massRear:        '',   // Massa suspensa por corner traseiro (kg)
  susp_damperFront:     '',   // Rate amortecedor dianteiro (N·s/m)
  susp_damperRear:      '',   // Rate amortecedor traseiro (N·s/m)
  susp_rcFront:         '',   // Altura roll center dianteiro (mm)
  susp_rcRear:          '',   // Altura roll center traseiro (mm)
  susp_bumpCamberFront: '',   // ΔCamber/mm bump dianteiro (°/mm)
  susp_bumpCamberRear:  '',   // ΔCamber/mm bump traseiro (°/mm)
  susp_bumpToeFront:    '',   // ΔToe/mm bump dianteiro (mm/mm)
  susp_bumpToeRear:     '',   // ΔToe/mm bump traseiro (mm/mm)

  // ── Escapamento ──
  exh_exitPosition:   '',  // Posição de saída
  exh_exhaustTemp:    '',  // Temperatura dos gases (°C)
  exh_backPressure:   '',  // Contrapressão (kPa)
  exh_manifoldLength: '',  // Comprimento do coletor (mm)
  exh_manifoldDiam:   '',  // Diâmetro do coletor (mm)
  exh_outlets:        '',  // Número de saídas
  exh_blownDiffuser:  '',  // Blown diffuser (Sim/Não)
  exh_tuningRpm:      '',  // RPM alvo de scavenging (override)

  // ── Turbocompressor ──
  turbo_lag:            '',   // Turbo lag (ms)
  turbo_boostTarget:    '',   // Pressão de boost target (bar gauge)
  turbo_pressureRatio:  '',   // Razão de pressão do compressor
  turbo_wastegateType:  '',   // Tipo de wastegate (mecânica, eletrônica, etc.)
  turbo_wastegateBar:   '',   // Pressão máxima wastegate (bar)
  turbo_egt:            '',   // Temperatura gases de escape (°C)
  turbo_compEfficiency: '',   // Eficiência isentrópica do compressor (%)
  turbo_surgeBar:       '',   // Limite de surge — pressão mínima (bar)
  turbo_chokeFlow:      '',   // Limite de choke — vazão máxima
  turbo_rotorInertia:   '',   // Inércia do rotor (kg·cm²)

  // ── Eletrônica ──
  elecFuelMap:  '',
  elecBoostMap: '',
  tcPoint:      '',
  absPoint:     '',
  // ABS detalhado
  absThreshold:    '',  // velocidade de intervenção
  absLevel:        '',  // nível (1-12)
  absSensFront:    '',  // sensibilidade dianteiro
  absSensRear:     '',  // sensibilidade traseiro
  // TC detalhado
  tcSlipMap:       '',  // mapa de slip ratio
  tcCutLevel:      '',  // nível de corte
  tcSensibility:   '',  // sensibilidade
  // Launch Control
  launchRpm:       '',  // RPM de lançamento
  launchMap:       '',  // mapa de partida
  launchClutch:    '',  // progressão embreagem
  // Brake Balance Controller
  bbcBiasFront:    '',  // % bias dianteiro
  bbcBiasRear:     '',  // % bias traseiro
  bbcRealTime:     '',  // ajuste em tempo real
  // DRS
  drsThreshold:    '',  // velocidade de ativação (km/h)
  drsGain:         '',  // ganho de velocidade (km/h)
  // Ride Height Control
  rhcMinHeight:    '',  // altura mínima (mm)
  rhcSensors:      '',  // tipo de sensores
  rhcActuators:    '',  // atuadores
  // ERS Deploy Map
  ersStrategy:     '',  // estratégia por trecho
  ersDeployMode:   '',  // modo de deploy
  // Engine Map
  enginePowerMode: '',  // modo de potência
  // Differential Map
  diffMapAccel:    '',  // bloqueio eletrônico aceleração
  diffMapBrake:    '',  // bloqueio eletrônico frenagem
  // Data Logger
  loggerChannels:  '',  // canais configurados

  // ── Híbrido / ERS — Estratégia ──
  ersDeployMap:      '',  // onde usar energia por volta
  ersHarvestMap:     '',  // quando/quanto recuperar
  ersRegenMode:      '',  // frenagem regenerativa vs mecânica
  ersRoundTrip:      '',  // eficiência ciclo (%)
  ersSoCStrategy:    '',  // estratégia SoC por volta/stint
  ersSoCTarget:      '',  // SoC alvo (%)

  // ── Lubrificação & Arrefecimento ──
  oilPressMin:    '',   // bar
  oilPressMax:    '',   // bar
  oilTempMin:     '',   // °C
  oilTempMax:     '',   // °C
  coolantTempMin: '',   // °C
  coolantTempMax: '',   // °C
  oilViscosity:   '',   // SAE grade
  oilCapacity:    '',   // L
  oilConsumption: '',   // mL/100km

  // ── Correlação Aero ──
  cfdCorrelation: '',   // notas CFD/Túnel vs. pista

  // ── Notas ──
  notes: '',
};

const STORAGE_KEY = 'race_telemetry_setups';

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

const CORNERS = [
  { key: 'fl', label: 'FL', sub: 'Di. Esq.' },
  { key: 'fr', label: 'FR', sub: 'Di. Dir.' },
  { key: 'rl', label: 'RL', sub: 'Tr. Esq.' },
  { key: 'rr', label: 'RR', sub: 'Tr. Dir.' },
];

/**
 * Grade de cantos: uma linha por parâmetro, quatro colunas (FL, FR, RL, RR).
 * rows = [{ field, label, unit }]
 */
function CornerGrid({ rows, current, onUpdate, cornerInput, borderColor, greenColor, textMuted, textSecondary }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '110px repeat(4, 1fr)',
        gap: 6,
        marginBottom: 4,
        paddingBottom: 6,
        borderBottom: `1px solid ${borderColor}33`,
      }}>
        <div />
        {CORNERS.map((c) => (
          <div key={c.key} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: greenColor }}>{c.label}</div>
            <div style={{ fontSize: 10, color: textMuted }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Linhas de parâmetros */}
      {rows.map(({ field, label, unit }) => (
        <div
          key={field}
          style={{
            display: 'grid',
            gridTemplateColumns: '110px repeat(4, 1fr)',
            gap: 6,
            marginBottom: 6,
            alignItems: 'center',
          }}
        >
          {/* Rótulo */}
          <div style={{ fontSize: 11, color: textSecondary, fontWeight: 600 }}>
            {label}
            {unit && <span style={{ color: textMuted, fontWeight: 400, marginLeft: 3 }}>({unit})</span>}
          </div>

          {/* Inputs por canto */}
          {CORNERS.map((c) => (
            <input
              key={c.key}
              type="text"
              value={current[field]?.[c.key] ?? ''}
              onChange={(e) => onUpdate(field, c.key, e.target.value)}
              placeholder="—"
              style={cornerInput}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Painel de Peças ────────────────────────────────────────────────────── */

const ALARM_THRESHOLD = 0.96; // 96%

function PartsPanel({ parts = [], activeProfileId, onSavePart, onEditPart, onDeletePart, onAddEntry, onDeleteEntry, COLORS, theme }) {
  const [newName,    setNewName]    = useState('');
  const [newKm,      setNewKm]      = useState('');
  const [newUsedKm,  setNewUsedKm]  = useState('');
  const [addErr,     setAddErr]     = useState('');

  // Estado de edição por peça
  const [editingId,   setEditingId]   = useState(null);
  const [editName,    setEditName]    = useState('');
  const [editKm,      setEditKm]      = useState('');
  const [editErr,     setEditErr]     = useState('');

  // Estado de entrada de km por peça
  const [entryPartId, setEntryPartId] = useState(null);
  const [entryKm,     setEntryKm]     = useState('');
  const [entryNote,   setEntryNote]   = useState('');
  const [entryDate,   setEntryDate]   = useState(new Date().toISOString().split('T')[0]);
  const [entryErr,    setEntryErr]    = useState('');

  const BTN_S = (accent, danger) => ({
    padding: '5px 10px', borderRadius: 5, fontSize: 11, fontWeight: accent ? 700 : 400,
    background: danger ? `${COLORS.accent}18` : accent ? COLORS.accent : 'transparent',
    color: danger ? COLORS.accent : accent ? '#fff' : COLORS.textSecondary,
    border: danger ? `1px solid ${COLORS.accent}40` : accent ? 'none' : `1px solid ${COLORS.border}`,
    cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
  });

  const INPUT_S2 = {
    background: COLORS.bg, color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`, borderRadius: 5,
    padding: '6px 10px', fontSize: 12, outline: 'none', minWidth: 0,
  };

  function handleAddPart() {
    const r = onSavePart?.(newName, newKm, activeProfileId, newUsedKm);
    if (r?.error) { setAddErr(r.error); return; }
    setNewName(''); setNewKm(''); setNewUsedKm(''); setAddErr('');
  }

  function startEdit(pt) {
    setEditingId(pt.id); setEditName(pt.name); setEditKm(String(pt.kmLimit)); setEditErr('');
  }
  function confirmEdit() {
    const r = onEditPart?.(editingId, editName, editKm, activeProfileId);
    if (r?.error) { setEditErr(r.error); return; }
    setEditingId(null); setEditErr('');
  }

  function openEntry(partId) {
    setEntryPartId(partId); setEntryKm(''); setEntryNote('');
    setEntryDate(new Date().toISOString().split('T')[0]); setEntryErr('');
  }
  function submitEntry() {
    const r = onAddEntry?.(entryPartId, entryKm, entryNote, entryDate, activeProfileId);
    if (r?.error) { setEntryErr(r.error); return; }
    setEntryPartId(null); setEntryErr('');
  }

  return (
    <div style={theme.card}>
      <div style={theme.cardTitle}>🔧 Controle de Peças e Quilometragem</div>
      <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>
        Cadastre peças com limite de km e registre o uso. Alarme automático ao atingir 96% da vida útil.
      </p>

      {/* Adicionar nova peça */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Nome da peça (ex: Correia dentada)"
          value={newName}
          onChange={(e) => { setNewName(e.target.value); setAddErr(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAddPart()}
          style={{ ...INPUT_S2, flex: '2 1 180px' }}
        />
        <input
          type="number"
          placeholder="Limite km"
          value={newKm}
          onChange={(e) => { setNewKm(e.target.value); setAddErr(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAddPart()}
          style={{ ...INPUT_S2, flex: '1 1 80px', maxWidth: 100 }}
          min={1}
        />
        <input
          type="number"
          placeholder="km já usados"
          value={newUsedKm}
          onChange={(e) => { setNewUsedKm(e.target.value); setAddErr(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAddPart()}
          style={{ ...INPUT_S2, flex: '1 1 80px', maxWidth: 110 }}
          min={0}
          title="Quilometragem que a peça já acumulou antes do cadastro"
        />
        <button onClick={handleAddPart} style={BTN_S(true)}>+ Adicionar</button>
      </div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        "km já usados" é opcional — informe se a peça já estava em uso ao ser cadastrada.
      </div>
      {addErr && <div style={{ fontSize: 11, color: COLORS.accent, marginBottom: 10 }}>{addErr}</div>}

      {/* Lista de peças */}
      {parts.length === 0 ? (
        <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '12px 0', textAlign: 'center' }}>
          Nenhuma peça cadastrada. Adicione acima.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {parts.map((pt) => {
            const usedKm = (pt.entries || []).reduce((s, e) => s + (e.km || 0), 0);
            const pct    = pt.kmLimit > 0 ? usedKm / pt.kmLimit : 0;
            const remaining = Math.max(0, pt.kmLimit - usedKm);
            const alarm  = pct >= ALARM_THRESHOLD;
            const isEditing = editingId === pt.id;
            const isEntry   = entryPartId === pt.id;

            const barColor = alarm ? COLORS.accent : pct >= 0.75 ? COLORS.yellow : COLORS.green;

            return (
              <div key={pt.id} style={{
                border: `1px solid ${alarm ? `${COLORS.accent}60` : COLORS.border}`,
                borderRadius: 8,
                background: alarm ? `${COLORS.accent}08` : COLORS.bg,
                padding: '12px 14px',
              }}>
                {/* Linha principal */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {isEditing ? (
                    <>
                      <input value={editName} onChange={(e) => { setEditName(e.target.value); setEditErr(''); }}
                        style={{ ...INPUT_S2, flex: '2 1 130px' }} />
                      <input type="number" value={editKm} onChange={(e) => { setEditKm(e.target.value); setEditErr(''); }}
                        style={{ ...INPUT_S2, flex: '1 1 80px', maxWidth: 100 }} min={1} />
                      <span style={{ fontSize: 11, color: COLORS.textMuted }}>km</span>
                      <button onClick={confirmEdit} style={BTN_S(true)}>OK</button>
                      <button onClick={() => setEditingId(null)} style={BTN_S(false)}>✕</button>
                      {editErr && <span style={{ fontSize: 11, color: COLORS.accent }}>{editErr}</span>}
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: alarm ? COLORS.accent : COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {alarm && <span title="Troca necessária!" style={{ fontSize: 14 }}>⚠️</span>}
                          {pt.name}
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                          Limite: {pt.kmLimit.toFixed(0)} km
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 100 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: barColor }}>
                          {usedKm.toFixed(0)} / {pt.kmLimit.toFixed(0)} km
                        </div>
                        <div style={{ fontSize: 11, color: alarm ? COLORS.accent : COLORS.textMuted }}>
                          {alarm ? '⚠ TROCA NECESSÁRIA' : `Restam ${remaining.toFixed(0)} km`}
                        </div>
                      </div>
                      <button onClick={() => startEdit(pt)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 14, padding: '2px 4px' }}>✏️</button>
                      <button onClick={() => onDeletePart?.(pt.id, activeProfileId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14, padding: '2px 4px' }}>🗑</button>
                    </>
                  )}
                </div>

                {/* Barra de progresso */}
                <div style={{ height: 6, background: `${COLORS.border}`, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${Math.min(100, pct * 100).toFixed(1)}%`,
                    background: barColor,
                    transition: 'width 0.3s',
                  }} />
                </div>

                {/* Histórico de entradas */}
                {(pt.entries || []).length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
                      Histórico de uso
                    </div>
                    {pt.entries.map((en) => (
                      <div key={en.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: COLORS.textSecondary, marginBottom: 3 }}>
                        <span style={{ color: COLORS.textMuted }}>{en.date}</span>
                        <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>{en.km.toFixed(0)} km</span>
                        {en.note && <span style={{ color: COLORS.textMuted, fontStyle: 'italic' }}>{en.note}</span>}
                        <button onClick={() => onDeleteEntry?.(pt.id, en.id, activeProfileId)}
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 12, padding: '0 2px' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formulário de nova entrada */}
                {isEntry ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${COLORS.border}33` }}>
                    <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)}
                      style={{ ...INPUT_S2, flex: '0 1 120px' }} />
                    <input type="number" placeholder="km percorridos" value={entryKm}
                      onChange={(e) => { setEntryKm(e.target.value); setEntryErr(''); }}
                      style={{ ...INPUT_S2, flex: '1 1 80px', maxWidth: 110 }} min={0.1} step={0.1} />
                    <input type="text" placeholder="Nota (opcional)" value={entryNote}
                      onChange={(e) => setEntryNote(e.target.value)}
                      style={{ ...INPUT_S2, flex: '2 1 130px' }} />
                    <button onClick={submitEntry} style={BTN_S(true)}>+ Adicionar km</button>
                    <button onClick={() => setEntryPartId(null)} style={BTN_S(false)}>Cancelar</button>
                    {entryErr && <span style={{ fontSize: 11, color: COLORS.accent }}>{entryErr}</span>}
                  </div>
                ) : (
                  <button onClick={() => openEntry(pt.id)} style={{ ...BTN_S(false), fontSize: 10, marginTop: 2 }}>
                    + Registrar km usado
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Componente principal ───────────────────────────────────────────────── */
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

export default function SetupSheetTab({
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
  const CORNER_INPUT = {
    ...INPUT_BASE,
    padding: '7px 6px',
    textAlign: 'center',
    fontSize: 13,
  };
  // Estado do formulário levantado para App.jsx (persiste ao trocar de tab/workspace)
  const current = setupForm || { ...EMPTY_SETUP };
  const setCurrent = setSetupForm;

  // Tópicos 5-10: sync com CarWeightContext
  const {
    trackFront: ctxTrackFront, setTrackFront,
    trackRear:  ctxTrackRear,  setTrackRear,
    cgLong:     ctxCgLong,     setCgLong,
    cgHeight:   ctxCgHeight,   setCgHeight,
    rcFront:    ctxRcFront,    setRcFront,
    rcRear:     ctxRcRear,     setRcRear,
  } = useCarWeight();

  // Contexto → formulário (quando PesoTab ou CombustivelTab atualizam)
  useEffect(() => {
    if (!ctxTrackFront) return;
    setCurrent(prev => { const c = prev || EMPTY_SETUP; if (c.susp_trackFront === ctxTrackFront) return prev; return { ...c, susp_trackFront: ctxTrackFront }; });
  }, [ctxTrackFront]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ctxTrackRear) return;
    setCurrent(prev => { const c = prev || EMPTY_SETUP; if (c.susp_trackRear === ctxTrackRear) return prev; return { ...c, susp_trackRear: ctxTrackRear }; });
  }, [ctxTrackRear]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tópico 7: CG longitudinal
  useEffect(() => {
    if (!ctxCgLong) return;
    setCurrent(prev => { const c = prev || EMPTY_SETUP; if (c.chassis_cgLong === ctxCgLong) return prev; return { ...c, chassis_cgLong: ctxCgLong }; });
  }, [ctxCgLong]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tópico 8: Altura do CG
  useEffect(() => {
    if (!ctxCgHeight) return;
    setCurrent(prev => { const c = prev || EMPTY_SETUP; if (c.chassis_cgHeight === ctxCgHeight) return prev; return { ...c, chassis_cgHeight: ctxCgHeight }; });
  }, [ctxCgHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tópico 9: Roll center dianteiro
  useEffect(() => {
    if (!ctxRcFront) return;
    setCurrent(prev => { const c = prev || EMPTY_SETUP; if (c.susp_rcFront === ctxRcFront) return prev; return { ...c, susp_rcFront: ctxRcFront }; });
  }, [ctxRcFront]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tópico 10: Roll center traseiro
  useEffect(() => {
    if (!ctxRcRear) return;
    setCurrent(prev => { const c = prev || EMPTY_SETUP; if (c.susp_rcRear === ctxRcRear) return prev; return { ...c, susp_rcRear: ctxRcRear }; });
  }, [ctxRcRear]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fase 8: Regulamentações → Setup (preenche apenas campos vazios)
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail) return;
      const d = e.detail;
      setCurrent(prev => {
        const c = prev || EMPTY_SETUP;
        const up = {};
        if (d.motorPotenciaMax  && !c.engine_maxPowerCv)    up.engine_maxPowerCv    = d.motorPotenciaMax;
        if (d.motorRpmMax       && !c.engine_revLimit)      up.engine_revLimit      = d.motorRpmMax;
        if (d.motorCilindrada   && !c.engine_displacement)  up.engine_displacement  = d.motorCilindrada;
        if (d.motorCilindros    && !c.engine_cylinders)     up.engine_cylinders     = d.motorCilindros;
        if (d.motorBoostMax     && !c.turbo_boostTarget)    up.turbo_boostTarget    = d.motorBoostMax;
        if (d.transmMarchasMax  && !c.trans_numGears)       up.trans_numGears       = d.transmMarchasMax;
        if (d.transmTipo        && !c.trans_gearboxType)    up.trans_gearboxType    = d.transmTipo;
        if (d.transmDiferencial && !c.diff_type)            up.diff_type            = d.transmDiferencial;
        if (d.freioDiantDiamMax && !c.brake_discRadiusFront) {
          const r = parseFloat(d.freioDiantDiamMax) / 2;
          if (!isNaN(r)) up.brake_discRadiusFront = String(r);
        }
        if (d.freioTrasDiamMax && !c.brake_discRadiusRear) {
          const r = parseFloat(d.freioTrasDiamMax) / 2;
          if (!isNaN(r)) up.brake_discRadiusRear = String(r);
        }
        if (!Object.keys(up).length) return prev;
        return { ...c, ...up };
      });
    };
    window.addEventListener(REG_PESO_CHANGED_EVENT, handler);
    return () => window.removeEventListener(REG_PESO_CHANGED_EVENT, handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fase 8: Setup → Regulamentações (quando campos de motor/transmissão mudam)
  useEffect(() => {
    if (!current.engine_maxPowerCv && !current.engine_revLimit &&
        !current.engine_displacement && !current.engine_cylinders &&
        !current.trans_numGears && !current.trans_gearboxType && !current.diff_type) return;
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent(SETUP_REG_CHANGED_EVENT, {
        detail: {
          engine_maxPowerCv:   current.engine_maxPowerCv,
          engine_revLimit:     current.engine_revLimit,
          engine_displacement: current.engine_displacement,
          engine_cylinders:    current.engine_cylinders,
          trans_numGears:      current.trans_numGears,
          trans_gearboxType:   current.trans_gearboxType,
          diff_type:           current.diff_type,
        },
      }));
    }, 1000);
    return () => clearTimeout(t);
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    current.engine_maxPowerCv, current.engine_revLimit,
    current.engine_displacement, current.engine_cylinders,
    current.trans_numGears, current.trans_gearboxType, current.diff_type,
  ]);

  const [showSaved, setShowSaved] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));


  // Salvar no perfil
  const [profileSaveName,   setProfileSaveName]   = useState('');
  const [profileSaveTarget, setProfileSaveTarget] = useState('');
  const [profileSaveMsg,    setProfileSaveMsg]    = useState(null); // { ok, text }
  const [setupGroupId,      setSetupGroupId]      = useState('');

  // Inicializa o dropdown com o perfil ativo
  useEffect(() => {
    if (activeProfileId && !profileSaveTarget) setProfileSaveTarget(activeProfileId);
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega dados vindos do sistema de perfis
  // Usa ref para evitar re-load acidental se o componente remontar com seq > 0
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

  /* Atualiza campo por canto: current[field][corner] = val */
  const updateCorner = (field, corner, val) => {
    setCurrent((prev) => ({
      ...(prev || EMPTY_SETUP),
      [field]: { ...(prev || EMPTY_SETUP)[field], [corner]: val },
    }));
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

  /* Linhas da grade de cantos */
  const SUSPENSION_ROWS = [
    { field: 'spring',        label: 'Mola',      unit: 'N/mm' },
    { field: 'springPreload', label: 'Pré-carga da mola', unit: 'mm' },
    { field: 'rideHeight',    label: 'Altura',    unit: 'mm'   },
    { field: 'camber',        label: 'Camber',    unit: '°'    },
    { field: 'toe',           label: 'Toe',       unit: 'mm'   },
    { field: 'caster',        label: 'Caster',    unit: '°'    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>⚙️</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Setup Sheet</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>Salve e recupere setups por autódromo e data</div>
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

      {/* ── Evento ── */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="evento" title="📍 Evento">
        <div style={fieldRow}>
          <InputField label="Autódromo"      value={current.track}  onChange={updateField('track')} inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Data da Etapa"  value={current.date}   onChange={updateField('date')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Etapa / Evento" value={current.event}  onChange={updateField('event')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Piloto" value={current.driver} onChange={updateField('driver')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Carro"  value={current.car}    onChange={updateField('car')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        {/* ── Telemetria vinculada ── */}
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
                ⚠️ Sessão não encontrada no perfil atual
              </div>
            );
          })()}
        </div>
      </SectionBox>

      {/* ── Aerodinâmica ── */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="aerodinamica" title="🌬️ Aerodinâmica">

        {/* Asas */}
        <div style={fieldRow}>
          <InputField label="Asa Dianteira" value={current.frontWing} onChange={updateField('frontWing')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Asa Traseira"  value={current.rearWing}  onChange={updateField('rearWing')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

      </SectionBox>

      {/* ── Suspensão ── */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="suspensao" title="🔩 Suspensão">
        <CornerGrid
          rows={SUSPENSION_ROWS}
          current={current}
          onUpdate={updateCorner}
          cornerInput={CORNER_INPUT}
          borderColor={COLORS.border}
          greenColor={COLORS.green}
          textMuted={COLORS.textMuted}
          textSecondary={COLORS.textSecondary}
        />

        {/* Barra antirolamento (por eixo — valor único) */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
            Barra Antirolamento (por eixo)
          </div>
          <div style={fieldRow}>
            <InputField label="Barra Dianteira" value={current.frontBarRate} onChange={updateField('frontBarRate')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Barra Traseira"  value={current.rearBarRate}  onChange={updateField('rearBarRate')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>

        {/* Magic Number */}
        {(() => {
          const f = parseFloat(current.magicCamberFront);
          const r = parseFloat(current.magicCamberRear);
          const magic = (!isNaN(f) && !isNaN(r) && r !== 0) ? (f / r).toFixed(3) : null;
          return (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
                Magic Number (Camber Di. ÷ Camber Tr.)
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <InputField label="Camber Dianteiro" unit="°" value={current.magicCamberFront} onChange={updateField('magicCamberFront')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <InputField label="Camber Traseiro"  unit="°" value={current.magicCamberRear}  onChange={updateField('magicCamberRear')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
                <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
                    Número Mágico
                  </label>
                  <div style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 6,
                    padding: '8px 14px',
                    fontSize: 18,
                    fontWeight: 800,
                    color: magic ? COLORS.accent : COLORS.textMuted,
                    letterSpacing: '0.5px',
                    textAlign: 'center',
                  }}>
                    {magic ?? '—'}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Motion Ratio */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600 }}>Motion Ratio</div>
          <div style={fieldRow}>
            <InputField label="MR Mola — Dianteiro"  value={current.susp_mrFront}    onChange={updateField('susp_mrFront')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="MR Mola — Traseiro"   value={current.susp_mrRear}     onChange={updateField('susp_mrRear')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="MR ARB — Dianteiro"   value={current.susp_mrArbFront} onChange={updateField('susp_mrArbFront')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="MR ARB — Traseiro"    value={current.susp_mrArbRear}  onChange={updateField('susp_mrArbRear')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>
      </SectionBox>

      {/* ── Freio ── */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="freio" title="🛑 Freio">

        {/* Brake bias */}
        <div style={fieldRow}>
          <InputField label="Brake Bias (% frente)" value={current.brakeBias} onChange={updateField('brakeBias')} unit="%" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Pressão Máx. no Pedal" value={current.brake_maxPedalPressure} onChange={updateField('brake_maxPedalPressure')} unit="bar" half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

      </SectionBox>

      {/* ── Motor / Powertrain ── */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="motor" title="🔥 Motor / Powertrain">

        {/* Diferencial */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Diferencial</div>
          <div style={fieldRow}>
            <InputField label="Tipo"                     value={current.diff_type}              onChange={updateField('diff_type')}                          half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Ramp Aceleração"          value={current.diff_rampAccel}         onChange={updateField('diff_rampAccel')}         unit="°"    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Ramp Desaceleração"       value={current.diff_rampDecel}         onChange={updateField('diff_rampDecel')}         unit="°"    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="% Bloqueio — Aceleração"  value={current.diff_lockAccel}         onChange={updateField('diff_lockAccel')}         unit="%"    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="% Bloqueio — Frenagem"    value={current.diff_lockBrake}         onChange={updateField('diff_lockBrake')}         unit="%"    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Preload"                  value={current.diff_preload}           onChange={updateField('diff_preload')}           unit="Nm"   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <InputField label="Sensibilidade ao Torque"  value={current.diff_torqueSensitivity} onChange={updateField('diff_torqueSensitivity')}             half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          </div>
        </div>
      </SectionBox>

      {/* ── Eletrônica & Controles ── */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="eletronica" title="⚡ Sistemas Eletrônicos & Controles">

        {/* Mapas gerais */}
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Engine Maps</div>
        <div style={fieldRow}>
          <InputField label="Mapa de Combustível" value={current.elecFuelMap}  onChange={updateField('elecFuelMap')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
          <InputField label="Mapa de Boost"       value={current.elecBoostMap} onChange={updateField('elecBoostMap')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>
        <div style={fieldRow}>
          <InputField label="Modo de Potência" value={current.enginePowerMode} onChange={updateField('enginePowerMode')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
        </div>

      </SectionBox>

      {/* ── Correlação Aero ── */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="cfd" title="🌬️ Correlação CFD / Túnel de Vento">
        <textarea
          value={current.cfdCorrelation}
          onChange={(e) => updateField('cfdCorrelation')(e.target.value)}
          rows={3}
          style={{
            width: '100%', background: COLORS.bg, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '10px 14px',
            fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
          placeholder="Diferenças entre dados simulados (CFD/túnel de vento) e comportamento real em pista..."
        />
      </SectionBox>

      {/* ── Notas ── */}
      <SectionBox collapsed={collapsed} toggleSection={toggleSection} sectionKey="notas" title="📝 Notas">
        <textarea
          value={current.notes}
          onChange={(e) => updateField('notes')(e.target.value)}
          rows={4}
          style={{
            width: '100%',
            background: COLORS.bg,
            color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 13,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          placeholder="Comportamento do carro, mudanças, observações..."
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
                  placeholder="Ex: Setup Q1 — Subviragem leve"
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
