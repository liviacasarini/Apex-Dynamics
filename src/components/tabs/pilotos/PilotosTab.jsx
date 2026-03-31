/**
 * PilotosTab — Gestão de Perfis de Piloto
 * Persiste em localStorage: rt_pilots
 */
import { useState, useCallback } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { PrintFooter } from '@/components/common';

const STORAGE_KEY = 'rt_pilots';

function loadPilots() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePilots(pilots) {
  try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(pilots)); }
  catch { /* noop */ }
}

function emptyPilot(id) {
  return {
    id,
    // ── Identificação ──
    name:           '',
    age:            '',
    bloodType:      '',
    // ── Peso & Posição ──
    weight:         '',   // Peso corporal (kg)
    weightEquipped: '',   // Peso com todos os equipamentos (kg)
    seatPosition:   '',   // Posição de assento — impacto no CG
    seatHeight:     '',   // Altura do banco / rake do piloto
    // ── Estilo de Pilotagem ──
    brakeAggressiveness: '', // Agressividade na frenagem (1-10 ou texto)
    throttleUsage:       '', // Uso do acelerador
    throttleProfile:     '', // Throttle application profile — progressão na saída de curva
    steeringSmoothness:  '', // Steering input smoothness (suavidade vs. agressividade)
    // ── Feedback Subjetivo ──
    feedbackUndersteer:   '', // Understeer — tolerância / percepção
    feedbackOversteer:    '', // Oversteer — tolerância / percepção
    setupComfort:         '', // Conforto com o setup atual
    brakeReferencePoints: '', // Pontos de referência de frenagem por curva
    adaptability:         '', // Capacidade de adaptação ao comportamento do carro
    engineerCommunication:'', // Qualidade do feedback técnico ao engenheiro
    // ── Consistência ──
    trajectoryDeviation:  '', // Desvio de trajetória entre voltas
    brakePointDeviation:  '', // Consistência de ponto de frenagem — desvio padrão (m)
    // ── Tolerâncias Físicas ──
    gLateral:      '',   // Tolerância G lateral (>3g)
    gLongitudinal: '',   // Tolerância G longitudinal (>4g)
    gVertical:     '',   // Tolerância G vertical
    hydration:     '',   // Hidratação (L/h ou notas)
    bodyTemp:      '',   // Temperatura corporal durante corrida (°C)
    // ── Cognitivo & Performance ──
    peripheralVision: '', // Visão periférica
    reactionTime:     '', // Tempo de reação (ms)
    cognitiveFatigue: '', // Fadiga cognitiva/física ao longo da corrida (texto)
    // ── Modelo de Fadiga (numérico, para Estratégia) ──
    fadigaDegradacao:     '',  // degradação em s/volta por cada 10min de corrida (ex: 0.05)
    stintMaxMinutos:      '',  // tempo máximo de stint antes de queda significativa (min)
    // ── Multiplicadores de Desgaste e Consumo (para Estratégia) ──
    tireWearMultiplier:   '',  // 1.0 = normal, 1.2 = 20% mais desgaste de pneu
    fuelConsMultiplier:   '',  // 1.0 = normal, 1.1 = 10% mais consumo
    brakeWearMultiplier:  '',  // 1.0 = normal, 1.15 = 15% mais desgaste de freio
    // ── Performance por Composto ──
    compoundPerformance:  [],  // [{ compound, baseTime, degradation }]
    // ── Histórico por Pista ──
    trackHistory:         [],  // [{ trackId, condition, bestLap, date, notes }]
    // ── Designação ──
    assignedProfileId: '',  // ID do perfil ao qual este piloto está designado
    // ── Notas ──
    notes: '',
  };
}

/* ─── Componentes auxiliares ────────────────────────────────────────── */

function Field({ label, value, onChange, unit, half, inputBase, textMuted, multiline, placeholder }) {
  const containerStyle = { flex: half ? '1 1 48%' : '1 1 100%', minWidth: half ? 140 : 280 };
  return (
    <div style={containerStyle}>
      <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: multiline ? 'flex-start' : 'center', gap: 4 }}>
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? ''}
            rows={3}
            style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? ''}
            style={inputBase}
          />
        )}
        {unit && <span style={{ fontSize: 11, color: textMuted, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
    </div>
  );
}

function SubTitle({ children, COLORS }) {
  return (
    <div style={{
      fontSize: 11, color: COLORS.textMuted, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function Divider({ COLORS }) {
  return <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }} />;
}

/* ─── Card de piloto ────────────────────────────────────────────────── */

function PilotCard({ pilot, onUpdate, onDelete, profiles, COLORS, theme }) {
  const [expanded, setExpanded] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const INPUT_BASE = {
    width: '100%', background: COLORS.bg, color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`, borderRadius: 6,
    padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const fieldRow = { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 };

  const upd = (key) => (val) => onUpdate(pilot.id, key, val);

  const displayName = pilot.name || 'Piloto sem nome';

  return (
    <div style={{
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      {/* Header do card */}
      <div
        onClick={() => setExpanded((x) => !x)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          background: `${COLORS.accent}14`,
          cursor: 'pointer',
          borderBottom: expanded ? `1px solid ${COLORS.border}33` : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>👤</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>{displayName}</div>
            {(pilot.age || pilot.bloodType) && (
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                {[pilot.age && `${pilot.age} anos`, pilot.bloodType && `Tipo ${pilot.bloodType}`].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {confirmDelete ? (
            <>
              <span style={{ fontSize: 11, color: COLORS.accent }}>Confirmar exclusão?</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(pilot.id); }}
                style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: COLORS.accent, color: '#fff', border: 'none', cursor: 'pointer' }}
              >Sim</button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, cursor: 'pointer' }}
              >Não</button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 15, padding: '2px 6px' }}
              title="Excluir piloto"
            >🗑</button>
          )}
          <span style={{ fontSize: 13, color: COLORS.textMuted }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Corpo expandido */}
      {expanded && (
        <div style={{ padding: '16px 20px', background: COLORS.card }}>

          {/* ── Identificação ── */}
          <SubTitle COLORS={COLORS}>Identificação</SubTitle>
          <div style={fieldRow}>
            <Field label="Nome do Piloto"  value={pilot.name}      onChange={upd('name')}      half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            <Field label="Idade"           value={pilot.age}       onChange={upd('age')}       half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="anos" />
            <Field label="Tipo Sanguíneo"  value={pilot.bloodType} onChange={upd('bloodType')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="ex: A+" />
          </div>

          {/* ── Designar ao Perfil ── */}
          {profiles && profiles.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
              <SubTitle COLORS={COLORS}>Designar ao Perfil</SubTitle>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <select
                  value={pilot.assignedProfileId || ''}
                  onChange={(e) => upd('assignedProfileId')(e.target.value)}
                  style={{
                    ...INPUT_BASE,
                    maxWidth: 320,
                    cursor: 'pointer',
                    appearance: 'auto',
                  }}
                >
                  <option value="">— Nenhum perfil —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {pilot.assignedProfileId && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: COLORS.accent,
                    background: `${COLORS.accent}18`, border: `1px solid ${COLORS.accent}44`,
                    borderRadius: 8, padding: '3px 10px',
                  }}>
                    ✓ {profiles.find((p) => p.id === pilot.assignedProfileId)?.name ?? 'Perfil removido'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, fontStyle: 'italic' }}>
                O piloto aparecerá dentro do perfil selecionado na aba Perfis.
              </div>
            </div>
          )}

          {/* ── Peso & Posição ── */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
            <SubTitle COLORS={COLORS}>Peso &amp; Posição no Cockpit</SubTitle>
            <div style={fieldRow}>
              <Field label="Peso Corporal"             value={pilot.weight}         onChange={upd('weight')}         half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="kg" />
              <Field label="Peso com Equipamentos"     value={pilot.weightEquipped} onChange={upd('weightEquipped')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="kg"
                     placeholder="capacete + HANS + macacão + luvas + sapatos" />
            </div>
            <div style={fieldRow}>
              <Field label="Posição de Assento"        value={pilot.seatPosition} onChange={upd('seatPosition')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="impacto no CG do carro" />
              <Field label="Altura do Banco (rake)"    value={pilot.seatHeight}   onChange={upd('seatHeight')}   half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="mm" />
            </div>
          </div>

          {/* ── Estilo de Pilotagem ── */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
            <SubTitle COLORS={COLORS}>Estilo de Pilotagem</SubTitle>
            <div style={fieldRow}>
              <Field label="Agressividade na Frenagem"   value={pilot.brakeAggressiveness} onChange={upd('brakeAggressiveness')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="1–10 ou descrição" />
              <Field label="Uso do Acelerador"           value={pilot.throttleUsage}       onChange={upd('throttleUsage')}       half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="1–10 ou descrição" />
            </div>
            <div style={fieldRow}>
              <Field label="Throttle Application Profile"   value={pilot.throttleProfile}    onChange={upd('throttleProfile')}    half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="progressão na saída de curva" />
              <Field label="Steering Input Smoothness"      value={pilot.steeringSmoothness} onChange={upd('steeringSmoothness')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="suavidade vs. agressividade" />
            </div>
          </div>

          {/* ── Feedback Subjetivo ── */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
            <SubTitle COLORS={COLORS}>Feedback Subjetivo</SubTitle>
            <div style={fieldRow}>
              <Field label="Tolerância / Percepção de Understeer" value={pilot.feedbackUndersteer} onChange={upd('feedbackUndersteer')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              <Field label="Tolerância / Percepção de Oversteer"  value={pilot.feedbackOversteer}  onChange={upd('feedbackOversteer')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            </div>
            <div style={fieldRow}>
              <Field label="Conforto com o Setup"                   value={pilot.setupComfort}          onChange={upd('setupComfort')}          half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              <Field label="Capacidade de Adaptação ao Carro"       value={pilot.adaptability}          onChange={upd('adaptability')}          half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
            </div>
            <div style={fieldRow}>
              <Field label="Pontos de Referência de Frenagem (por curva)" value={pilot.brakeReferencePoints}  onChange={upd('brakeReferencePoints')} inputBase={INPUT_BASE} textMuted={COLORS.textMuted} multiline placeholder="ex: Curva 1 — placa 200m; Curva 3 — árvore grande..." />
            </div>
            <div style={fieldRow}>
              <Field label="Qualidade do Feedback Técnico ao Engenheiro"  value={pilot.engineerCommunication} onChange={upd('engineerCommunication')} inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="objetividade, vocabulário técnico, nível de detalhe..." />
            </div>
          </div>

          {/* ── Consistência ── */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
            <SubTitle COLORS={COLORS}>Consistência</SubTitle>
            <div style={fieldRow}>
              <Field label="Desvio de Trajetória entre Voltas"              value={pilot.trajectoryDeviation} onChange={upd('trajectoryDeviation')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="observação qualitativa ou métrica" />
              <Field label="Consistência de Ponto de Frenagem (desvio σ)"  value={pilot.brakePointDeviation} onChange={upd('brakePointDeviation')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="m" placeholder="desvio padrão entre voltas" />
            </div>
          </div>

          {/* ── Tolerâncias Físicas ── */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
            <SubTitle COLORS={COLORS}>Tolerâncias Físicas &amp; G-Force</SubTitle>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 8, fontStyle: 'italic' }}>
              Referência: G lateral &gt;3g · G longitudinal &gt;4g — impacto direto na concentração e no desempenho cognitivo
            </div>
            <div style={fieldRow}>
              <Field label="Tolerância G Lateral"       value={pilot.gLateral}      onChange={upd('gLateral')}      half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="g" placeholder=">3g" />
              <Field label="Tolerância G Longitudinal"  value={pilot.gLongitudinal} onChange={upd('gLongitudinal')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="g" placeholder=">4g" />
              <Field label="Tolerância G Vertical"      value={pilot.gVertical}     onChange={upd('gVertical')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="g" />
            </div>
            <div style={fieldRow}>
              <Field label="Hidratação"                 value={pilot.hydration} onChange={upd('hydration')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="L/h" placeholder="meta de consumo de água" />
              <Field label="Temperatura Corporal Alvo"  value={pilot.bodyTemp}  onChange={upd('bodyTemp')}  half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="°C" placeholder="intervalo de trabalho" />
            </div>
          </div>

          {/* ── Cognitivo & Performance ── */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
            <SubTitle COLORS={COLORS}>Cognitivo &amp; Performance</SubTitle>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 8, fontStyle: 'italic' }}>
              Desempenho cognitivo cai acima de certos níveis de fadiga, desidratação e temperatura corporal
            </div>
            <div style={fieldRow}>
              <Field label="Visão Periférica"                         value={pilot.peripheralVision} onChange={upd('peripheralVision')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} />
              <Field label="Tempo de Reação"                          value={pilot.reactionTime}     onChange={upd('reactionTime')}     half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="ms" />
            </div>
            <div style={fieldRow}>
              <Field label="Fadiga Cognitiva/Física ao Longo da Corrida" value={pilot.cognitiveFatigue} onChange={upd('cognitiveFatigue')} inputBase={INPUT_BASE} textMuted={COLORS.textMuted} multiline placeholder="queda de performance observada, volta em que ocorre, sintomas..." />
            </div>
          </div>

          {/* ── Modelo de Fadiga & Multiplicadores (Estratégia) ── */}
          <Divider COLORS={COLORS} />
          <div>
            <SubTitle COLORS={COLORS}>Modelo de Fadiga (para Estratégia)</SubTitle>
            <div style={fieldRow}>
              <Field label="Degradação por Fadiga" value={pilot.fadigaDegradacao} onChange={upd('fadigaDegradacao')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="s/volta por 10min" placeholder="Ex: 0.05" />
              <Field label="Stint Máximo" value={pilot.stintMaxMinutos} onChange={upd('stintMaxMinutos')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} unit="min" placeholder="Ex: 40" />
            </div>
            <SubTitle COLORS={COLORS}>Multiplicadores de Desgaste</SubTitle>
            <div style={fieldRow}>
              <Field label="Desgaste de Pneu" value={pilot.tireWearMultiplier} onChange={upd('tireWearMultiplier')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="1.0 = normal" />
              <Field label="Consumo de Combustível" value={pilot.fuelConsMultiplier} onChange={upd('fuelConsMultiplier')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="1.0 = normal" />
            </div>
            <div style={fieldRow}>
              <Field label="Desgaste de Freio" value={pilot.brakeWearMultiplier} onChange={upd('brakeWearMultiplier')} half inputBase={INPUT_BASE} textMuted={COLORS.textMuted} placeholder="1.0 = normal" />
            </div>
          </div>

          {/* ── Notas ── */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}33` }}>
            <SubTitle COLORS={COLORS}>Notas Gerais</SubTitle>
            <div style={fieldRow}>
              <Field label="" value={pilot.notes} onChange={upd('notes')} inputBase={INPUT_BASE} textMuted={COLORS.textMuted} multiline placeholder="Observações gerais, histórico, preferências, pontos de melhoria..." />
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

/* ─── Componente principal ───────────────────────────────────────────── */
export default function PilotosTab({ profiles = [] }) {
  const COLORS = useColors();
  const theme  = makeTheme(COLORS);

  const [pilots, setPilots] = useState(() => loadPilots());

  const addPilot = useCallback(() => {
    const np = emptyPilot(Date.now());
    setPilots((prev) => {
      const next = [...prev, np];
      savePilots(next);
      return next;
    });
  }, []);

  const updatePilot = useCallback((id, key, value) => {
    setPilots((prev) => {
      const next = prev.map((p) => p.id === id ? { ...p, [key]: value } : p);
      savePilots(next);
      return next;
    });
  }, []);

  const deletePilot = useCallback((id) => {
    setPilots((prev) => {
      const next = prev.filter((p) => p.id !== id);
      savePilots(next);
      return next;
    });
  }, []);

  return (
    <div style={{ padding: '20px 16px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.textPrimary }}>👤 Pilotos</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
            Perfis físicos, cognitivos e de estilo de pilotagem
          </div>
        </div>
        <button
          onClick={addPilot}
          style={{
            padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: COLORS.accent, color: '#fff', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          + Novo Piloto
        </button>
      </div>

      {/* Lista de pilotos */}
      {pilots.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          border: `2px dashed ${COLORS.border}`,
          borderRadius: 12,
          color: COLORS.textMuted,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: COLORS.textSecondary }}>Nenhum piloto cadastrado</div>
          <div style={{ fontSize: 12 }}>Clique em "+ Novo Piloto" para começar</div>
        </div>
      ) : (
        pilots.map((pilot) => (
          <PilotCard
            key={pilot.id}
            pilot={pilot}
            onUpdate={updatePilot}
            onDelete={deletePilot}
            profiles={profiles}
            COLORS={COLORS}
            theme={theme}
          />
        ))
      )}
      <PrintFooter />
    </div>
  );
}
