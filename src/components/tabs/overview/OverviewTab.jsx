import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { formatLapTime } from '@/utils/formatTime';
import { LAP_COLORS } from '@/constants/colors';
import { useColors } from '@/context/ThemeContext';
import { MetricCard, ChartCard, CustomTooltip, FilterModeBar, PrintFooter } from '@/components/common';
import { makeTheme } from '@/styles/theme';
import { useCarWeight } from '@/context/CarWeightContext';

function FuelCalcProfileSection({
  profilesList, activeProfileId,
  profileGroups,
  profileFuelCalcs,
  onDeleteFuelCalc, onLoadFuelCalc,
  fuelSaveName, setFuelSaveName,
  fuelSaveTarget, setFuelSaveTarget,
  fuelGroupId, setFuelGroupId,
  fuelSaveMsg, setFuelSaveMsg,
  showFuelSaved, setShowFuelSaved,
  onSave,
  COLORS, INPUT_S,
}) {
  return (
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

      {/* Configurações salvas */}
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
            <div style={{
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              overflow: 'hidden',
            }}>
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

      {/* Formulário de salvar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 180px' }}>
          <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Nome da configuração</label>
          <input
            type="text"
            value={fuelSaveName}
            onChange={(e) => { setFuelSaveName(e.target.value); setFuelSaveMsg(null); }}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
            placeholder="Ex: Corrida 10 voltas — 45L"
            style={INPUT_S}
          />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Perfil de destino</label>
          <select
            value={fuelSaveTarget || activeProfileId || ''}
            onChange={(e) => { setFuelSaveTarget(e.target.value); setFuelSaveMsg(null); }}
            style={{ ...INPUT_S, cursor: 'pointer' }}
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
              style={{ ...INPUT_S, cursor: 'pointer' }}
            >
              <option value="">— Sem pasta —</option>
              {(profileGroups || []).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}
        <button
          onClick={onSave}
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
  );
}

function FuelCalculator({
  fuelDensity, setFuelDensity,
  carWeight,   setCarWeight,
  driverWeight, setDriverWeight,
  startFuel,   setStartFuel,
  avgConsumption, setAvgConsumption,
  raceLaps,    setRaceLaps,
  COLORS, theme,
}) {
  const d  = parseFloat(fuelDensity)    || 0;
  const cw = parseFloat(carWeight)      || 0;
  const dw = parseFloat(driverWeight)   || 0;
  const sf = parseFloat(startFuel)      || 0;
  const ac = parseFloat(avgConsumption) || 0;
  const rl = parseFloat(raceLaps)       || 0;

  const fuelWeightStart = sf * d;
  const totalFuelNeeded = ac * rl;
  const fuelWeightEnd   = Math.max(0, sf - totalFuelNeeded) * d;
  const weightStart     = cw + dw + fuelWeightStart;
  const weightEnd       = cw + dw + fuelWeightEnd;
  const fuelRemaining   = Math.max(0, sf - totalFuelNeeded);
  const hasData         = cw > 0 || sf > 0;

  const fields = [
    { label: 'Densidade do combustível a 25°C', value: fuelDensity, set: setFuelDensity, unit: 'kg/L', placeholder: '0.755' },
    { label: 'Peso do carro (sem combustível)',  value: carWeight,   set: setCarWeight,   unit: 'kg',   placeholder: '980'   },
    { label: 'Peso do piloto (com equipamento)', value: driverWeight,set: setDriverWeight,unit: 'kg',   placeholder: '80'    },
    { label: 'Litragem de combustível de saída', value: startFuel,   set: setStartFuel,   unit: 'L',    placeholder: '45'    },
    { label: 'Consumo médio por volta',          value: avgConsumption, set: setAvgConsumption, unit: 'L/volta', placeholder: '2.5' },
    { label: 'Número de voltas da corrida',      value: raceLaps,    set: setRaceLaps,    unit: 'voltas', placeholder: '25'  },
  ];

  return (
    <div style={{ ...theme.card, background: COLORS.bgCard }}>
      <div style={theme.cardTitle}>⛽ Calculadora de Peso e Combustível</div>
      <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
        Configure as variáveis para calcular o peso total e consumo de combustível para a corrida.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        {fields.map((f) => (
          <div key={f.label} style={{ flex: '1 1 200px', minWidth: 180 }}>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
              {f.label}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                step="any"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.placeholder}
                style={{
                  width: '100%',
                  background: COLORS.bg,
                  color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{f.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {hasData ? (
        <div style={{ background: COLORS.bg, borderRadius: 8, padding: 20, border: `1px solid ${COLORS.border}` }}>
          <div style={theme.grid(4)}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Peso Combustível Saída</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.orange }}>{fuelWeightStart.toFixed(1)}<span style={{ fontSize: 12, color: COLORS.textMuted }}> kg</span></div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Peso Total Largada</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.green }}>{weightStart.toFixed(1)}<span style={{ fontSize: 12, color: COLORS.textMuted }}> kg</span></div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Consumo Total Corrida</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.cyan }}>{totalFuelNeeded.toFixed(1)}<span style={{ fontSize: 12, color: COLORS.textMuted }}> L</span></div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Combustível Restante</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: fuelRemaining < 3 ? COLORS.accent : COLORS.green }}>
                {fuelRemaining.toFixed(1)}<span style={{ fontSize: 12, color: COLORS.textMuted }}> L</span>
              </div>
              {fuelRemaining < 0.1 && (
                <div style={{ fontSize: 10, color: COLORS.accent, marginTop: 4 }}>⚠️ Combustível insuficiente!</div>
              )}
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 16, paddingTop: 16 }}>
            <div style={theme.grid(2)}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Peso Final (chegada)</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.accent }}>
                  {weightEnd.toFixed(1)}<span style={{ fontSize: 14, color: COLORS.textMuted }}> kg</span>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Diferença de Peso (largada → chegada)</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.yellow }}>
                  -{(weightStart - weightEnd).toFixed(1)}<span style={{ fontSize: 14, color: COLORS.textMuted }}> kg</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: 13, padding: 20 }}>
          Preencha os campos acima para ver o cálculo.
        </div>
      )}
    </div>
  );
}

export default function OverviewTab({
  data,
  channels,
  lapsAnalysis,
  bestLapNum,
  sessionMaxRPM = 0,
  sessionMaxSpeed = 0,
  vitalsAlerts,
  partsAlerts = [],
  isLoaded,
  onLoad,
  profileFuelCalcLoad,
  profilesList = [],
  activeProfileId,
  profileGroups = [],
  onSaveFuelCalc,
  profileFuelCalcs = [],
  onDeleteFuelCalc,
  onLoadFuelCalc,
  onSaveSession,
  onSaveLap,
  onAddPartEntry,
  filterMode = 'filtered',
  setFilterMode,
  pitExitConfig = { speedKmh: 30, rpmMin: 3000 },
  setPitExitConfig,
  hasOutLap = false,
}) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);
  const { pesoCarro: ctxPesoCarro, setPesoCarro, violaRegulamento, excesso, pesoMinimo } = useCarWeight();
  const syncingFromCtx = useRef(false);
  const INPUT_S = {
    background: COLORS.bg,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };
  const best = isLoaded ? lapsAnalysis[bestLapNum] : null;

  // Pit exit config — estado local para edição sem aplicar imediatamente
  const [draftSpeed, setDraftSpeed] = useState(pitExitConfig.speedKmh);
  const [draftRpm,   setDraftRpm]   = useState(pitExitConfig.rpmMin);
  // Sincroniza draft quando a config é alterada externamente (ex: troca de workspace)
  useEffect(() => {
    setDraftSpeed(pitExitConfig.speedKmh);
    setDraftRpm(pitExitConfig.rpmMin);
  }, [pitExitConfig.speedKmh, pitExitConfig.rpmMin]);
  const draftChanged = draftSpeed !== pitExitConfig.speedKmh || draftRpm !== pitExitConfig.rpmMin;
  const applyPitExit = () => setPitExitConfig?.(c => ({ ...c, speedKmh: draftSpeed, rpmMin: draftRpm }));

  // Fuel/weight calculator state
  const [fuelDensity, setFuelDensity] = useState('0.755');
  const [carWeight, setCarWeight] = useState('');
  const [driverWeight, setDriverWeight] = useState('');
  const [startFuel, setStartFuel] = useState('');
  const [avgConsumption, setAvgConsumption] = useState('');
  const [raceLaps, setRaceLaps] = useState('');


  // Fuel calc — profile save form state
  const [fuelSaveName,   setFuelSaveName]   = useState('');
  const [fuelSaveTarget, setFuelSaveTarget] = useState('');
  const [fuelGroupId,    setFuelGroupId]    = useState('');
  const [fuelSaveMsg,    setFuelSaveMsg]    = useState(null); // { ok, text }
  const [showFuelSaved,  setShowFuelSaved]  = useState(false);

  // Session save — profile save form state
  const [showSessForm,   setShowSessForm]   = useState(false);
  const [sessSaveName,   setSessSaveName]   = useState('');
  const [sessSaveTarget, setSessSaveTarget] = useState('');
  const [sessGroupId,    setSessGroupId]    = useState('');
  const [sessSaveMsg,    setSessSaveMsg]    = useState(null); // { ok, text }
  const [sessSaving,     setSessSaving]     = useState(false);

  // Lap save — profile save form state
  const [showLapForm,    setShowLapForm]    = useState(false);
  const [lapSaveName,    setLapSaveName]    = useState('');
  const [lapSaveTarget,  setLapSaveTarget]  = useState('');
  const [lapGroupId,     setLapGroupId]     = useState('');
  const [lapSaveLapNum,  setLapSaveLapNum]  = useState('');
  const [lapSaveMsg,     setLapSaveMsg]     = useState(null);
  const [lapSaving,      setLapSaving]      = useState(false);

  // Parts km registration (session save panel — GPS-assisted)
  const [partKmValue,    setPartKmValue]    = useState('');
  const [partKmChecked,  setPartKmChecked]  = useState({});
  const [partKmNote,     setPartKmNote]     = useState('');
  const [partKmDate,     setPartKmDate]     = useState(() => new Date().toISOString().split('T')[0]);
  const [partKmMsg,      setPartKmMsg]      = useState(null);

  // Manual km registration (preparation mode / without telemetry)
  const [showManualKm,    setShowManualKm]    = useState(false);
  const [manualKmValue,   setManualKmValue]   = useState('');
  const [manualKmTarget,  setManualKmTarget]  = useState('');
  const [manualKmChecked, setManualKmChecked] = useState({});
  const [manualKmNote,    setManualKmNote]    = useState('');
  const [manualKmDate,    setManualKmDate]    = useState(() => new Date().toISOString().split('T')[0]);
  const [manualKmMsg,     setManualKmMsg]     = useState(null);

  // Initialise dropdown with active profile
  useEffect(() => {
    if (activeProfileId && !fuelSaveTarget) setFuelSaveTarget(activeProfileId);
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load fuel calc data from profile
  useEffect(() => {
    if (!profileFuelCalcLoad?.data || profileFuelCalcLoad.seq === 0) return;
    const d = profileFuelCalcLoad.data;
    if (d.fuelDensity    != null) setFuelDensity(d.fuelDensity);
    if (d.carWeight      != null) {
      setCarWeight(d.carWeight);
      setPesoCarro(d.carWeight);
    }
    if (d.driverWeight   != null) setDriverWeight(d.driverWeight);
    if (d.startFuel      != null) setStartFuel(d.startFuel);
    if (d.avgConsumption != null) setAvgConsumption(d.avgConsumption);
    if (d.raceLaps       != null) setRaceLaps(d.raceLaps);
  }, [profileFuelCalcLoad?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quando o contexto global muda (outra tab atualizou pesoCarro), sincroniza carWeight local
  useEffect(() => {
    if (!ctxPesoCarro) return;
    if (ctxPesoCarro === carWeight) return;
    syncingFromCtx.current = true;
    setCarWeight(ctxPesoCarro);
  }, [ctxPesoCarro]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handler que propaga alteração do carWeight para o contexto global
  const handleCarWeightChange = useCallback((val) => {
    setCarWeight(val);
    if (!syncingFromCtx.current) {
      setPesoCarro(val);
    }
    syncingFromCtx.current = false;
  }, [setPesoCarro]);

  // Auto-detect total session distance from GPS channel (cumulative odometer)
  const sessionDistanceKm = useMemo(() => {
    if (!isLoaded || !data?.laps || !channels?.gpsDistance) return null;
    let maxVal = 0;
    Object.values(data.laps).forEach((lapRows) => {
      if (!Array.isArray(lapRows)) return;
      lapRows.forEach((row) => {
        const v = parseFloat(row[channels.gpsDistance]);
        if (!isNaN(v) && v > maxVal) maxVal = v;
      });
    });
    if (maxVal <= 0) return null;
    // Heuristic: values > 500 are in metres → convert to km
    return maxVal > 500 ? +(maxVal / 1000).toFixed(2) : +maxVal.toFixed(2);
  }, [isLoaded, data, channels]);

  // Auto-fill GPS distance into parts km input when it becomes available
  useEffect(() => {
    if (sessionDistanceKm != null) setPartKmValue(String(sessionDistanceKm));
  }, [sessionDistanceKm]);

  // Init all parts as checked when session save target profile changes
  useEffect(() => {
    const targetId = sessSaveTarget || activeProfileId;
    const tp = profilesList.find((p) => p.id === targetId);
    const checked = {};
    (tp?.parts || []).forEach((p) => { checked[p.id] = true; });
    setPartKmChecked(checked);
  }, [sessSaveTarget, activeProfileId, profilesList]);

  // Init manual km target to active profile
  useEffect(() => {
    if (activeProfileId && !manualKmTarget) setManualKmTarget(activeProfileId);
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Init manual km parts checked state when target changes
  useEffect(() => {
    const tp = profilesList.find((p) => p.id === (manualKmTarget || activeProfileId));
    const checked = {};
    (tp?.parts || []).forEach((p) => { checked[p.id] = true; });
    setManualKmChecked(checked);
  }, [manualKmTarget, activeProfileId, profilesList]);

  const handleSaveFuelCalcToProfile = () => {
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
      fuelDensity, carWeight, driverWeight, startFuel, avgConsumption, raceLaps,
    }, fuelGroupId || undefined);
    if (result?.error) {
      setFuelSaveMsg({ ok: false, text: result.error });
    } else {
      const pName = profilesList.find((p) => p.id === targetId)?.name || 'perfil';
      setFuelSaveMsg({ ok: true, text: `Salvo em "${pName}"!` });
      setFuelSaveName('');
      setTimeout(() => setFuelSaveMsg(null), 3500);
    }
  };

  const handleSaveSessionToProfile = async () => {
    if (!sessSaveName.trim()) {
      setSessSaveMsg({ ok: false, text: 'Digite um nome para a sessão.' });
      return;
    }
    const targetId = sessSaveTarget || activeProfileId;
    if (!targetId) {
      setSessSaveMsg({ ok: false, text: 'Selecione um perfil de destino.' });
      return;
    }
    if (!data?.csvText) {
      setSessSaveMsg({ ok: false, text: 'Dados da sessão não disponíveis.' });
      return;
    }
    setSessSaving(true);
    setSessSaveMsg(null);
    const result = await onSaveSession?.(targetId, sessSaveName.trim(), data.csvText, data.fileName, sessionDistanceKm ?? '', sessGroupId || undefined);
    setSessSaving(false);
    if (result?.error) {
      setSessSaveMsg({ ok: false, text: result.error });
    } else {
      const pName = profilesList.find((p) => p.id === targetId)?.name || 'perfil';
      setSessSaveMsg({ ok: true, text: `Sessão salva em "${pName}"!` });
      setSessSaveName('');
      setShowSessForm(false);
      setTimeout(() => setSessSaveMsg(null), 4000);
    }
  };

  // Register km on selected parts using session data (GPS-assisted, editable)
  const handleRegisterPartsKm = () => {
    const km = parseFloat(partKmValue);
    if (!km || km <= 0) { setPartKmMsg({ ok: false, text: 'Informe a quilometragem percorrida.' }); return; }
    const targetId = sessSaveTarget || activeProfileId;
    const tp = profilesList.find((p) => p.id === targetId);
    const parts = (tp?.parts || []).filter((p) => partKmChecked[p.id]);
    if (!parts.length) { setPartKmMsg({ ok: false, text: 'Selecione ao menos uma peça.' }); return; }
    let hasError = false;
    parts.forEach((pt) => {
      const r = onAddPartEntry?.(pt.id, km, partKmNote || `Sessão: ${data?.fileName || '—'}`, partKmDate, targetId);
      if (r?.error) hasError = true;
    });
    if (hasError) {
      setPartKmMsg({ ok: false, text: 'Erro ao registrar em algumas peças.' });
    } else {
      setPartKmMsg({ ok: true, text: `${km} km registrados em ${parts.length} peça(s).` });
      setTimeout(() => setPartKmMsg(null), 4000);
    }
  };

  // Register km on parts manually (no telemetry loaded)
  const handleManualRegisterKm = () => {
    const km = parseFloat(manualKmValue);
    if (!km || km <= 0) { setManualKmMsg({ ok: false, text: 'Informe a quilometragem percorrida.' }); return; }
    const targetId = manualKmTarget || activeProfileId;
    const tp = profilesList.find((p) => p.id === targetId);
    const parts = (tp?.parts || []).filter((p) => manualKmChecked[p.id]);
    if (!parts.length) { setManualKmMsg({ ok: false, text: 'Selecione ao menos uma peça.' }); return; }
    let hasError = false;
    parts.forEach((pt) => {
      const r = onAddPartEntry?.(pt.id, km, manualKmNote || 'Registro manual', manualKmDate, targetId);
      if (r?.error) hasError = true;
    });
    if (hasError) {
      setManualKmMsg({ ok: false, text: 'Erro ao registrar em algumas peças.' });
    } else {
      setManualKmMsg({ ok: true, text: `${km} km registrados em ${parts.length} peça(s).` });
      setManualKmValue('');
      setTimeout(() => setManualKmMsg(null), 4000);
    }
  };

  const handleSaveLapToProfile = async () => {
    if (!lapSaveName.trim()) {
      setLapSaveMsg({ ok: false, text: 'Digite um nome para a volta.' });
      return;
    }
    const targetId = lapSaveTarget || activeProfileId;
    if (!targetId) {
      setLapSaveMsg({ ok: false, text: 'Selecione um perfil de destino.' });
      return;
    }
    if (!lapSaveLapNum) {
      setLapSaveMsg({ ok: false, text: 'Selecione uma volta.' });
      return;
    }
    setLapSaving(true);
    setLapSaveMsg(null);
    const result = await onSaveLap?.(targetId, lapSaveName.trim(), lapSaveLapNum, lapGroupId || undefined);
    setLapSaving(false);
    if (result?.error) {
      setLapSaveMsg({ ok: false, text: result.error });
    } else {
      const pName = profilesList.find((p) => p.id === targetId)?.name || 'perfil';
      setLapSaveMsg({ ok: true, text: `Volta V${lapSaveLapNum} salva em "${pName}"!` });
      setLapSaveName('');
      setLapSaveLapNum('');
      setShowLapForm(false);
      setTimeout(() => setLapSaveMsg(null), 4000);
    }
  };

  // Mini upload state (used in preparation mode)
  const fileRef   = useRef();
  const [uploading, setUploading]   = useState(false);
  const [uploadErr, setUploadErr]   = useState(null);
  const [draggingUp, setDraggingUp] = useState(false);

  const handleUploadFile = useCallback(async (file) => {
    if (!file || !onLoad) return;
    setUploading(true);
    setUploadErr(null);
    try { await onLoad(file); }
    catch (err) { setUploadErr(err.message || 'Erro ao processar arquivo'); }
    finally { setUploading(false); }
  }, [onLoad]);

  // Voltas ordenadas por tempo (para radar — top 5 mais rápidas)
  const lapNums = useMemo(
    () =>
      !isLoaded ? [] :
      Object.keys(data.laps)
        .filter((n) => lapsAnalysis[n] != null)
        .sort((a, b) => lapsAnalysis[a].lapTime - lapsAnalysis[b].lapTime),
    [data, lapsAnalysis, isLoaded]
  );

  // Voltas ordenadas por número (ordem cronológica — para gráfico e tabela)
  const lapNumsByOrder = useMemo(
    () =>
      !isLoaded ? [] :
      Object.keys(data.laps)
        .filter((n) => lapsAnalysis[n] != null)
        .sort((a, b) => Number(a) - Number(b)),
    [data, lapsAnalysis, isLoaded]
  );

  // Line chart: tempo por volta em ordem cronológica
  const lapTimesChart = useMemo(
    () =>
      lapNumsByOrder.map((n) => ({
        lap: `V${n}`,
        time: parseFloat(lapsAnalysis[n].lapTime.toFixed(2)),
      })),
    [lapNumsByOrder, lapsAnalysis]
  );

  // Speed trace da melhor volta (downsampled)
  const speedTrace = useMemo(() => {
    if (!isLoaded) return [];
    const bestData = data.laps[bestLapNum] || [];
    const hasBrake = !!channels.brake;
    const raw = bestData.filter((_, i) => i % 3 === 0);
    const speeds = raw.map((r) => (channels.gpsSpeed ? r[channels.gpsSpeed] || 0 : 0));

    return raw.map((r, i) => {
      const speed = speeds[i];
      const throttle = channels.throttle ? Math.min(100, Math.max(0, r[channels.throttle] || 0)) : 0;
      let brake = 0;
      if (hasBrake) {
        brake = r[channels.brake] || 0;
      } else if (i > 0) {
        // Estima freio pela desaceleração: queda de velocidade → escala 0–100
        const decel = speeds[i - 1] - speed;
        brake = Math.min(100, Math.max(0, decel * 15));
      }
      return {
        t: channels.time ? r[channels.time]?.toFixed(1) : '',
        speed,
        throttle,
        brake,
      };
    });
  }, [data, bestLapNum, channels, isLoaded]);

  // Radar de consistência
  const radarData = useMemo(() => {
    const top5 = lapNums.slice(0, 5);
    const metrics = [
      {
        metric: 'Velocidade',
        getter: (n) =>
          (lapsAnalysis[n].avgSpeed / (best?.maxSpeed || 1)) * 100,
      },
      {
        metric: 'Aceleração',
        getter: (n) => lapsAnalysis[n].fullThrottlePct,
      },
      {
        metric: 'RPM',
        getter: (n) =>
          (lapsAnalysis[n].avgRPM / (best?.maxRPM || 1)) * 100,
      },
      {
        metric: 'Eficiência',
        getter: (n) => 100 - lapsAnalysis[n].coastPct,
      },
    ];

    return metrics.map((m) => {
      const point = { metric: m.metric };
      top5.forEach((n) => {
        point[`v${n}`] = m.getter(n);
      });
      return point;
    });
  }, [lapNums, lapsAnalysis, best]);

  // ── Preparation mode: no telemetry loaded yet ──────────────────────────
  if (!isLoaded) {
    return (
      <div style={{ padding: 24 }}>

        {/* Parts alarm — available in preparation mode too */}
        {partsAlerts.length > 0 && (
          <div style={{
            ...theme.card,
            border: `1px solid ${COLORS.accent}50`,
            background: `${COLORS.accent}08`,
            marginBottom: 16,
          }}>
            <div style={{ ...theme.cardTitle, color: COLORS.accent }}>
              ⚠️ Alarme de Peças — Troca Necessária
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {partsAlerts.map((pt) => (
                <div key={pt.id} style={{
                  background: COLORS.bgCard,
                  borderRadius: 8,
                  padding: '10px 14px',
                  border: `1px solid ${COLORS.accent}40`,
                  minWidth: 160,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent, marginBottom: 4 }}>
                    🔧 {pt.name}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 }}>
                    {pt.usedKm.toFixed(0)} / {pt.kmLimit.toFixed(0)} km &nbsp;
                    <span style={{ color: COLORS.accent, fontWeight: 700 }}>({(pt.pct * 100).toFixed(0)}%)</span>
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                    Restam {pt.remaining.toFixed(0)} km
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 10 }}>
              Acesse <b style={{ color: COLORS.textSecondary }}>Mecânica</b> para registrar troca ou ajustar os limites.
            </div>
          </div>
        )}

        {/* Mini upload card */}
        <div style={{ ...theme.card, marginBottom: 20 }}>
          <div style={{ ...theme.cardTitle, marginBottom: 14 }}>📂 Carregar Telemetria</div>
          <div
            style={{
              border: `2px dashed ${draggingUp ? COLORS.accent : COLORS.border}`,
              borderRadius: 12,
              padding: '36px 32px',
              textAlign: 'center',
              cursor: uploading ? 'wait' : 'pointer',
              transition: 'all 0.3s',
              background: draggingUp ? `${COLORS.accent}08` : COLORS.bg,
            }}
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDraggingUp(true); }}
            onDragLeave={() => setDraggingUp(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDraggingUp(false);
              handleUploadFile(e.dataTransfer.files[0]);
            }}
          >
            {uploading ? (
              <>
                <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textSecondary }}>Processando...</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 12 }}>📁</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                  Arraste seu arquivo de telemetria aqui
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                  ou clique para selecionar • CSV, LD, LOG, TDL, DLF
                </div>
              </>
            )}
          </div>
          {uploadErr && (
            <div style={{
              marginTop: 10, padding: '10px 14px', borderRadius: 8,
              background: `${COLORS.accent}15`, border: `1px solid ${COLORS.accent}40`,
              color: COLORS.accent, fontSize: 13,
            }}>
              ⚠️ {uploadErr}
            </div>
          )}
          {/* Hidden file input — shared with "Trocar Arquivo" button */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.CSV,.txt,.ld,.log,.tdl,.dlf,.DLF"
            style={{ display: 'none' }}
            onClick={(e) => { e.target.value = ''; }}
            onChange={(e) => handleUploadFile(e.target.files[0])}
          />
        </div>


        {/* ── Registrar km manualmente nas peças (sem telemetria) ── */}
        {profilesList.some((p) => (p.parts || []).length > 0) && (() => {
          const tp = profilesList.find((p) => p.id === (manualKmTarget || activeProfileId));
          const parts = tp?.parts || [];
          return (
            <div style={{ ...theme.card, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showManualKm ? 10 : 0 }}>
                <div style={theme.cardTitle}>📍 Registrar km nas Peças</div>
                <button
                  onClick={() => setShowManualKm((v) => !v)}
                  style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: showManualKm ? `${COLORS.accent}20` : 'transparent',
                    border: `1px solid ${showManualKm ? COLORS.accent : COLORS.border}`,
                    color: showManualKm ? COLORS.accent : COLORS.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  {showManualKm ? '▲ Fechar' : '▼ Abrir'}
                </button>
              </div>
              {showManualKm && (
                <>
                  <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>
                    Registre quilometragem nas peças mesmo sem um arquivo de telemetria carregado — útil quando o carro rodou mais sem obtenção de dados.
                  </p>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Perfil</label>
                    <select
                      value={manualKmTarget || activeProfileId || ''}
                      onChange={(e) => setManualKmTarget(e.target.value)}
                      style={{ ...INPUT_S, cursor: 'pointer', maxWidth: 260 }}
                    >
                      <option value="">— Selecionar —</option>
                      {profilesList.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {parts.length === 0 ? (
                    <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                      Nenhuma peça cadastrada neste perfil. Acesse <b style={{ color: COLORS.textSecondary }}>Setup Sheet</b> para adicionar.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {parts.map((pt) => (
                          <label key={pt.id} style={{
                            display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                            fontSize: 11,
                            color: manualKmChecked[pt.id] ? COLORS.textPrimary : COLORS.textMuted,
                            background: manualKmChecked[pt.id] ? `${COLORS.accent}15` : COLORS.bg,
                            border: `1px solid ${manualKmChecked[pt.id] ? COLORS.accent : COLORS.border}`,
                            borderRadius: 5, padding: '3px 8px',
                          }}>
                            <input
                              type="checkbox"
                              checked={!!manualKmChecked[pt.id]}
                              onChange={(e) => setManualKmChecked((prev) => ({ ...prev, [pt.id]: e.target.checked }))}
                              style={{ cursor: 'pointer', accentColor: COLORS.accent }}
                            />
                            {pt.name}
                          </label>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="number"
                          value={manualKmValue}
                          onChange={(e) => { setManualKmValue(e.target.value); setManualKmMsg(null); }}
                          placeholder="km percorridos"
                          min={0.1} step={0.1}
                          style={{ ...INPUT_S, width: 150, padding: '7px 10px', fontSize: 13 }}
                        />
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>km</span>
                        <input
                          type="date"
                          value={manualKmDate}
                          onChange={(e) => setManualKmDate(e.target.value)}
                          style={{ ...INPUT_S, width: 140, padding: '7px 10px', fontSize: 13 }}
                        />
                        <input
                          type="text"
                          value={manualKmNote}
                          onChange={(e) => setManualKmNote(e.target.value)}
                          placeholder="Nota (opcional)"
                          style={{ ...INPUT_S, flex: '1 1 150px', padding: '7px 10px', fontSize: 13 }}
                        />
                        <button
                          onClick={handleManualRegisterKm}
                          style={{
                            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                            background: COLORS.accent, color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          Registrar
                        </button>
                      </div>
                      {manualKmMsg && (
                        <div style={{ marginTop: 8, fontSize: 12, color: manualKmMsg.ok ? COLORS.green : COLORS.accent }}>
                          {manualKmMsg.ok ? '✓ ' : '✗ '}{manualKmMsg.text}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          );
        })()}
      </div>
    );
  }

  if (!best) {
    return (
      <div style={{ padding: 24, color: COLORS.textMuted, textAlign: 'center' }}>
        Nenhuma volta válida encontrada.
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>

      {/* Vitals alerts — shown only when there are violations */}
      {vitalsAlerts?.length > 0 && (() => {
        // Group alerts by variable
        const grouped = {};
        vitalsAlerts.forEach((a) => {
          if (!grouped[a.variable]) grouped[a.variable] = [];
          grouped[a.variable].push(a);
        });
        return (
          <div style={{
            ...theme.card,
            border: `1px solid ${COLORS.accent}50`,
            background: `${COLORS.accent}08`,
            marginBottom: 16,
          }}>
            <div style={{ ...theme.cardTitle, color: COLORS.accent }}>
              ⚠️ Alertas de Vitais — Limites Ultrapassados
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {Object.entries(grouped).map(([variable, items]) => (
                <div key={variable} style={{
                  background: COLORS.bgCard,
                  borderRadius: 8,
                  padding: '10px 14px',
                  border: `1px solid ${COLORS.border}`,
                  minWidth: 160,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent, marginBottom: 6 }}>
                    {variable}
                  </div>
                  {items.map((a, i) => (
                    <div key={i} style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 }}>
                      V{a.lap} — {a.issue === 'max' ? '↑' : '↓'} {a.value}
                      <span style={{ color: COLORS.textMuted }}> (lim: {a.limit})</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Parts alarm — shown when any part in active profile reaches 96%+ usage */}
      {partsAlerts.length > 0 && (
        <div style={{
          ...theme.card,
          border: `1px solid ${COLORS.accent}50`,
          background: `${COLORS.accent}08`,
          marginBottom: 16,
        }}>
          <div style={{ ...theme.cardTitle, color: COLORS.accent }}>
            ⚠️ Alarme de Peças — Troca Necessária
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {partsAlerts.map((pt) => (
              <div key={pt.id} style={{
                background: COLORS.bgCard,
                borderRadius: 8,
                padding: '10px 14px',
                border: `1px solid ${COLORS.accent}40`,
                minWidth: 160,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent, marginBottom: 4 }}>
                  🔧 {pt.name}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 }}>
                  {pt.usedKm.toFixed(0)} / {pt.kmLimit.toFixed(0)} km &nbsp;
                  <span style={{ color: COLORS.accent, fontWeight: 700 }}>({(pt.pct * 100).toFixed(0)}%)</span>
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                  Restam {pt.remaining.toFixed(0)} km
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 10 }}>
            Acesse <b style={{ color: COLORS.textSecondary }}>Mecânica</b> para registrar troca ou ajustar os limites.
          </div>
        </div>
      )}

      {/* Session summary */}
      <div
        style={{
          ...theme.card,
          background: COLORS.bgCard,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: COLORS.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Sessão Carregada
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
              {data.fileName}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={theme.badge(COLORS.accent)}>
              {lapNums.length} {filterMode !== 'all' ? 'voltas válidas' : 'voltas'}
            </span>
            <FilterModeBar filterMode={filterMode} setFilterMode={setFilterMode} hasOutLap={hasOutLap} />
            {profilesList.length > 0 && (
              <button
                onClick={() => { setShowSessForm((v) => !v); setSessSaveMsg(null); }}
                style={{
                  padding: '5px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  background: showSessForm ? `${COLORS.purple}18` : 'transparent',
                  border: `1px solid ${showSessForm ? COLORS.purple : COLORS.border}`,
                  color: showSessForm ? COLORS.purple : COLORS.textSecondary,
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                💾 Salvar no Perfil
              </button>
            )}
            {profilesList.length > 0 && (
              <button
                onClick={() => { setShowLapForm((v) => !v); setLapSaveMsg(null); }}
                style={{
                  padding: '5px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  background: showLapForm ? `${COLORS.green}18` : 'transparent',
                  border: `1px solid ${showLapForm ? COLORS.green : COLORS.border}`,
                  color: showLapForm ? COLORS.green : COLORS.textSecondary,
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                🏁 Salvar Volta
              </button>
            )}
            <button
              onClick={() => !uploading && fileRef.current?.click()}
              disabled={uploading}
              style={{
                padding: '5px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: uploading ? 'wait' : 'pointer',
                background: 'transparent',
                border: `1px solid ${COLORS.border}`,
                color: uploading ? COLORS.textMuted : COLORS.textSecondary,
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { if (!uploading) { e.currentTarget.style.borderColor = COLORS.accent; e.currentTarget.style.color = COLORS.accent; } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.textSecondary; }}
            >
              {uploading ? '⏳ Carregando...' : '📂 Trocar Arquivo'}
            </button>
          </div>

          {/* ── Configuração do filtro Pit Exit ── */}
          {hasOutLap && filterMode === 'pitexit' && setPitExitConfig && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              marginTop: 10, padding: '8px 12px',
              background: `${COLORS.blue}10`,
              border: `1px solid ${COLORS.blue}30`,
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.blue, textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>
                Início da contagem quando:
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                Vel. min
                <input
                  type="number" min="1" max="200" step="1"
                  value={draftSpeed}
                  onChange={e => setDraftSpeed(Number(e.target.value))}
                  style={{ ...INPUT_S, width: 60, padding: '3px 7px', fontSize: 12 }}
                />
                km/h
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                RPM min
                <input
                  type="number" min="100" max="20000" step="100"
                  value={draftRpm}
                  onChange={e => setDraftRpm(Number(e.target.value))}
                  style={{ ...INPUT_S, width: 75, padding: '3px 7px', fontSize: 12 }}
                />
              </label>
              <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                sustentados por 2s
              </span>
              <button
                onClick={applyPitExit}
                disabled={!draftChanged}
                style={{
                  padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  cursor: draftChanged ? 'pointer' : 'default',
                  background: draftChanged ? COLORS.blue : `${COLORS.blue}30`,
                  border: `1px solid ${COLORS.blue}`,
                  color: draftChanged ? '#fff' : `${COLORS.blue}80`,
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                Aplicar
              </button>
            </div>
          )}
        </div>

        {/* ── Salvar sessão no perfil (inline expandable form) ── */}
        {showSessForm && (
          <div style={{
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: 16,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.purple, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
              💾 Salvar Sessão no Perfil
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '2 1 180px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Nome da sessão</label>
                <input
                  type="text"
                  value={sessSaveName}
                  onChange={(e) => { setSessSaveName(e.target.value); setSessSaveMsg(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveSessionToProfile()}
                  placeholder={`Ex: Treino Qualifying — ${data.fileName}`}
                  style={INPUT_S}
                />
              </div>
<div style={{ flex: '1 1 150px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Perfil de destino</label>
                <select
                  value={sessSaveTarget || activeProfileId || ''}
                  onChange={(e) => { setSessSaveTarget(e.target.value); setSessSaveMsg(null); }}
                  style={{ ...INPUT_S, cursor: 'pointer' }}
                >
                  <option value="">— Selecionar —</option>
                  {profilesList.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {profileGroups.length > 0 && (
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Pasta (opcional)</label>
                  <select
                    value={sessGroupId}
                    onChange={(e) => { setSessGroupId(e.target.value); setSessSaveMsg(null); }}
                    style={{ ...INPUT_S, cursor: 'pointer' }}
                  >
                    <option value="">— Sem pasta —</option>
                    {profileGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={handleSaveSessionToProfile}
                disabled={sessSaving}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: sessSaving ? COLORS.bgCard : COLORS.purple,
                  color: sessSaving ? COLORS.textMuted : '#fff',
                  border: 'none', cursor: sessSaving ? 'wait' : 'pointer', flexShrink: 0,
                }}
              >
                {sessSaving ? '⏳ Salvando...' : 'Salvar'}
              </button>
            </div>
            {/* Parts status + km registration for selected profile */}
            {(() => {
              const targetId = sessSaveTarget || activeProfileId;
              const targetProfile = profilesList.find((p) => p.id === targetId);
              const parts = targetProfile?.parts || [];
              if (!parts.length) return null;
              const ALARM_THRESHOLD = 0.96;
              return (
                <div style={{ width: '100%', marginTop: 10, padding: '10px 12px', background: COLORS.bgCard, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                    🔧 Quilometragem restante das peças — {targetProfile.name}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {parts.map((pt) => {
                      const usedKm = (pt.entries || []).reduce((s, e) => s + (e.km || 0), 0);
                      const pct = pt.kmLimit > 0 ? usedKm / pt.kmLimit : 0;
                      const remaining = Math.max(0, pt.kmLimit - usedKm);
                      const alarm = pct >= ALARM_THRESHOLD;
                      const barColor = alarm ? COLORS.accent : pct >= 0.75 ? COLORS.yellow : COLORS.green;
                      return (
                        <div key={pt.id} style={{
                          background: alarm ? `${COLORS.accent}10` : 'transparent',
                          border: `1px solid ${alarm ? `${COLORS.accent}40` : COLORS.border}`,
                          borderRadius: 6, padding: '6px 10px', minWidth: 120,
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: alarm ? COLORS.accent : COLORS.textPrimary, marginBottom: 3 }}>
                            {alarm && '⚠️ '}{pt.name}
                          </div>
                          <div style={{ fontSize: 10, color: barColor, marginBottom: 4 }}>
                            {alarm ? 'TROCA NECESSÁRIA' : `Restam ${remaining.toFixed(0)} km`}
                          </div>
                          <div style={{ height: 3, background: COLORS.border, borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: barColor, width: `${Math.min(100, pct * 100).toFixed(1)}%`, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Registrar km desta sessão nas peças ── */}
                  <div style={{ borderTop: `1px solid ${COLORS.border}33`, paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>
                      📍 Registrar km desta sessão nas peças
                      {sessionDistanceKm != null && (
                        <span style={{ marginLeft: 8, fontWeight: 400, color: COLORS.textMuted }}>
                          — GPS detectou {sessionDistanceKm} km
                        </span>
                      )}
                    </div>

                    {/* Checkboxes das peças */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {parts.map((pt) => (
                        <label key={pt.id} style={{
                          display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                          fontSize: 11,
                          color: partKmChecked[pt.id] ? COLORS.textPrimary : COLORS.textMuted,
                          background: partKmChecked[pt.id] ? `${COLORS.accent}15` : COLORS.bg,
                          border: `1px solid ${partKmChecked[pt.id] ? COLORS.accent : COLORS.border}`,
                          borderRadius: 5, padding: '3px 8px',
                        }}>
                          <input
                            type="checkbox"
                            checked={!!partKmChecked[pt.id]}
                            onChange={(e) => setPartKmChecked((prev) => ({ ...prev, [pt.id]: e.target.checked }))}
                            style={{ cursor: 'pointer', accentColor: COLORS.accent }}
                          />
                          {pt.name}
                        </label>
                      ))}
                    </div>

                    {/* Inputs de km, data, nota */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="number"
                          value={partKmValue}
                          onChange={(e) => { setPartKmValue(e.target.value); setPartKmMsg(null); }}
                          placeholder="km percorridos"
                          min={0.1} step={0.1}
                          style={{ ...INPUT_S, width: 140, padding: '6px 10px', fontSize: 12, paddingRight: sessionDistanceKm != null && parseFloat(partKmValue) !== sessionDistanceKm ? 52 : 10 }}
                        />
                        {sessionDistanceKm != null && parseFloat(partKmValue) !== sessionDistanceKm && (
                          <button
                            onClick={() => setPartKmValue(String(sessionDistanceKm))}
                            title="Restaurar valor do GPS"
                            style={{
                              position: 'absolute', right: 4,
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: COLORS.textMuted, fontSize: 10, padding: '2px 4px', whiteSpace: 'nowrap',
                            }}
                          >↩ GPS</button>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: COLORS.textMuted }}>km</span>
                      <input
                        type="date"
                        value={partKmDate}
                        onChange={(e) => setPartKmDate(e.target.value)}
                        style={{ ...INPUT_S, width: 130, padding: '6px 10px', fontSize: 12 }}
                      />
                      <input
                        type="text"
                        value={partKmNote}
                        onChange={(e) => setPartKmNote(e.target.value)}
                        placeholder="Nota (opcional)"
                        style={{ ...INPUT_S, flex: '1 1 120px', padding: '6px 10px', fontSize: 12 }}
                      />
                      <button
                        onClick={handleRegisterPartsKm}
                        style={{
                          padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                          background: COLORS.accent, color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        Registrar
                      </button>
                    </div>
                    {partKmMsg && (
                      <div style={{ marginTop: 6, fontSize: 11, color: partKmMsg.ok ? COLORS.green : COLORS.accent }}>
                        {partKmMsg.ok ? '✓ ' : '✗ '}{partKmMsg.text}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {sessSaveMsg && (
              <div style={{ marginTop: 8, fontSize: 12, color: sessSaveMsg.ok ? COLORS.green : COLORS.accent }}>
                {sessSaveMsg.ok ? '✓ ' : '✗ '}{sessSaveMsg.text}
              </div>
            )}
          </div>
        )}

        {/* ── Salvar volta no perfil (inline expandable form) ── */}
        {showLapForm && (
          <div style={{
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: 16,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.green, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
              🏁 Salvar Volta no Perfil
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 100px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Volta</label>
                <select
                  value={lapSaveLapNum}
                  onChange={(e) => { setLapSaveLapNum(e.target.value); setLapSaveMsg(null); }}
                  style={{ ...INPUT_S, cursor: 'pointer' }}
                >
                  <option value="">— Selecionar —</option>
                  {lapNumsByOrder.map((n) => (
                    <option key={n} value={n}>V{n} — {formatLapTime(lapsAnalysis[n].lapTime)}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '2 1 180px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Nome</label>
                <input
                  type="text"
                  value={lapSaveName}
                  onChange={(e) => { setLapSaveName(e.target.value); setLapSaveMsg(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveLapToProfile()}
                  placeholder="Ex: Melhor volta Interlagos"
                  style={INPUT_S}
                />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Perfil de destino</label>
                <select
                  value={lapSaveTarget || activeProfileId || ''}
                  onChange={(e) => { setLapSaveTarget(e.target.value); setLapSaveMsg(null); }}
                  style={{ ...INPUT_S, cursor: 'pointer' }}
                >
                  <option value="">— Selecionar —</option>
                  {profilesList.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {profileGroups.length > 0 && (
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Pasta (opcional)</label>
                  <select
                    value={lapGroupId}
                    onChange={(e) => { setLapGroupId(e.target.value); setLapSaveMsg(null); }}
                    style={{ ...INPUT_S, cursor: 'pointer' }}
                  >
                    <option value="">— Sem pasta —</option>
                    {profileGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={handleSaveLapToProfile}
                disabled={lapSaving}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: lapSaving ? COLORS.bgCard : COLORS.green,
                  color: lapSaving ? COLORS.textMuted : '#fff',
                  border: 'none', cursor: lapSaving ? 'wait' : 'pointer', flexShrink: 0,
                }}
              >
                {lapSaving ? '⏳ Salvando...' : 'Salvar'}
              </button>
            </div>
            {lapSaveMsg && (
              <div style={{ marginTop: 8, fontSize: 12, color: lapSaveMsg.ok ? COLORS.green : COLORS.accent }}>
                {lapSaveMsg.ok ? '✓ ' : '✗ '}{lapSaveMsg.text}
              </div>
            )}
          </div>
        )}

        <div style={theme.grid(5)}>
          <MetricCard
            label="Melhor Volta"
            value={formatLapTime(best.lapTime)}
            unit=""
            color={COLORS.green}
            small
          />
          <MetricCard
            label="Vmax"
            value={(sessionMaxSpeed || best.maxSpeed).toFixed(1)}
            unit="km/h"
            color={COLORS.cyan}
          />
          <MetricCard
            label="RPM Máx"
            value={(sessionMaxRPM || best.maxRPM).toFixed(0)}
            unit=""
            color={COLORS.accent}
          />
          <MetricCard
            label="Aceleração Total"
            value={channels.throttle ? best.fullThrottlePct.toFixed(1) : 'N/D'}
            unit={channels.throttle ? '%' : ''}
            color={COLORS.yellow}
          />
        </div>
      </div>

      {/* Charts row */}
      <div style={theme.grid(2)}>
        <ChartCard title="Tempo por Volta" height={240}>
          <ResponsiveContainer>
            <ComposedChart data={lapTimesChart}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis
                dataKey="lap"
                tick={{ fill: COLORS.textMuted, fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: COLORS.textMuted, fontSize: 11 }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="time"
                stroke={COLORS.accent}
                strokeWidth={2}
                dot={{ fill: COLORS.accent, r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                name="Tempo (s)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Consistência entre Voltas" height={240}>
          <ResponsiveContainer>
            <RadarChart data={radarData}>
              <PolarGrid stroke={COLORS.border} />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: COLORS.textMuted, fontSize: 10 }}
              />
              {lapNums.slice(0, 5).map((n, i) => (
                <Radar
                  key={n}
                  name={`V${n}`}
                  dataKey={`v${n}`}
                  stroke={LAP_COLORS[i]}
                  fill={LAP_COLORS[i]}
                  fillOpacity={0.1}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Speed trace */}
      <ChartCard
        title={`Traço de Velocidade — Melhor Volta (V${bestLapNum})`}
        height={300}
      >
        <ResponsiveContainer>
          <ComposedChart data={speedTrace}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis
              dataKey="t"
              tick={{ fill: COLORS.textMuted, fontSize: 10 }}
              interval={Math.floor(speedTrace.length / 15)}
            />
            <YAxis
              yAxisId="speed"
              tick={{ fill: COLORS.textMuted, fontSize: 10 }}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              domain={[0, 100]}
              hide
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              yAxisId="pct"
              type="monotone"
              dataKey="throttle"
              stroke="none"
              fill={COLORS.green}
              fillOpacity={0.15}
              name="Acelerador %"
            />
            <Line
              yAxisId="speed"
              type="monotone"
              dataKey="speed"
              stroke={COLORS.cyan}
              strokeWidth={2}
              dot={false}
              name="Velocidade (km/h)"
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Coasting analysis */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>⏱️ Tempo de Coasting (sem pedal nenhum)</div>
        <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>
          Tempo em que o piloto não está nem acelerando nem freando — indica hesitação ou transição entre inputs.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <th style={{ padding: '8px 12px', textAlign: 'center', color: COLORS.textMuted }}>Volta</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', color: COLORS.textMuted }}>Coasting %</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', color: COLORS.textMuted }}>Tempo Estimado</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', color: COLORS.textMuted }}>Aceleração %</th>
              </tr>
            </thead>
            <tbody>
              {lapNumsByOrder.map((n) => {
                const s = lapsAnalysis[n];
                const coastTime = (s.coastPct / 100 * s.lapTime).toFixed(2);
                return (
                  <tr key={n} style={{ borderBottom: `1px solid ${COLORS.border}11` }}>
                    <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700, color: COLORS.accent }}>V{n}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'center', color: s.coastPct > 15 ? COLORS.accent : COLORS.yellow }}>
                      {s.coastPct.toFixed(1)}%
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600 }}>{coastTime}s</td>
                    <td style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.green }}>{channels.throttle ? `${s.fullThrottlePct.toFixed(1)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>


      {/* Upload error toast (trocar arquivo) */}
      {uploadErr && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 18px', borderRadius: 8, zIndex: 9999,
          background: `${COLORS.accent}15`, border: `1px solid ${COLORS.accent}50`,
          color: COLORS.accent, fontSize: 13, boxShadow: '0 4px 20px #0008',
        }}>
          ⚠️ {uploadErr}
        </div>
      )}

      {/* Hidden file input — reutilizado pelo botão "Trocar Arquivo" */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.CSV,.txt,.ld,.log,.tdl,.dlf,.DLF"
        style={{ display: 'none' }}
        onClick={(e) => { e.target.value = ''; }}
        onChange={(e) => handleUploadFile(e.target.files[0])}
      />
      <PrintFooter />
    </div>
  );
}
