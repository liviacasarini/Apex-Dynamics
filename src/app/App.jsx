import { useState, useMemo, useCallback, useEffect } from 'react';
import { findPitExitTime, analyzeLap } from '@/core/lapAnalyzer';
import { useColors } from '@/context/ThemeContext';
import { CarWeightProvider } from '@/context/CarWeightContext';
import { TeamProvider, useTeam } from '@/context/TeamContext';
import { useWorkspaces, useTelemetryData } from '@/hooks';
import { saveCSV, loadCSV, deleteCSV, verifyCSV } from '@/storage/sessionStore';
import { parseCSV } from '@/core/parsers/csvParser';
import { detectChannels } from '@/core/channelDetector';
import { Header, TabBar, WorkspaceBar } from '@/components/layout';
import {
  OverviewTab,
  LapCompareTab,
  WOTAnalysisTab,
  VitalsTab,
  ReportTab,
  TrackMapTab,
  TemperatureTab,
  SetupSheetTab,
  PneusTab,
  ProfilesTab,
  MultiSessionTab,
  MecanicaTab,
  OnboardingTab,
  MathTab,
  RegulamentacoesTab,
  CombustivelTab,
  PesoTab,
  PilotosTab,
  PistasTab,
  EstrategiaTab,
  PerformanceTab,
  CalendarioTab,
  LapTimeTab,
  EquipeTab,
} from '@/components/tabs';

/* ── Canais monitorados para alertas de vitals ──────────────────────── */
const VITAL_CHANNELS = [
  { key: 'engineTemp',       label: 'Temp. Água'          },
  { key: 'oilPressure',      label: 'Pressão Óleo'        },
  { key: 'battery',          label: 'Bateria'             },
  { key: 'lambda',           label: 'Lambda'              },
  { key: 'fuelPressure',     label: 'Pressão Comb.'       },
  { key: 'transOilTemp',     label: 'Temp. Óleo Câmbio'   },
  { key: 'transOilPressure', label: 'Pressão Óleo Câmbio' },
];

// Tabs que exigem telemetria carregada (redirecionam para overview sem dados)
const TELEMETRY_ONLY_TABS = new Set(['laps', 'wot', 'report']);

const EMPTY_BRAKE_PAD = { fl: '', fr: '', rl: '', rr: '' };

/* ── Helpers de per-workspace state map ─────────────────────────────── */
function makeMapSetter(setMap, wsId) {
  return (v) =>
    setMap((prev) => ({
      ...prev,
      [wsId]: typeof v === 'function' ? v(prev[wsId] ?? undefined) : v,
    }));
}

/* ═══════════════════════════════════════════════════════════════════════
   App — Orquestrador raiz
═══════════════════════════════════════════════════════════════════════ */
export default function App() {
  return (
    <TeamProvider>
      <AppInner />
    </TeamProvider>
  );
}

function AppInner() {
  const COLORS = useColors();
  const { pendingCount, unreadChat, markChatRead, setTeamTabOpen, deviceAssignments } = useTeam();

  /* ── Workspace + perfis ─────────────────────────────────────────── */
  const profiles = useWorkspaces();
  const wsId = profiles.activeWorkspaceId;

  /* ── Telemetria (por workspace) ─────────────────────────────────── */
  const {
    data, channels, lapsAnalysis: rawLapsAnalysis, bestLapNum,
    loadFile, loadFromText, loadLapDirect,
    clearData, clearWorkspaceData,
    loadedWorkspaceIds, isLoaded,
    extraSessions, addExtraSession, addExtraSessionFromText,
    addExtraSessionFromLapData, removeExtraSession,
  } = useTelemetryData(wsId);

  /* ── Estado por workspace (Maps) ────────────────────────────────── */
  const [filterModeMap,       setFilterModeMap]       = useState({});
  const [preparationModeMap,  setPreparationModeMap]  = useState({});
  const [pitExitConfigMap,    setPitExitConfigMap]    = useState({});
  const [videoConfigMap,      setVideoConfigMap]      = useState({});
  const [multiSessionsMap,    setMultiSessionsMap]    = useState({});
  const [multiFailedMap,      setMultiFailedMap]      = useState({});
  const [setupFormMap,        setSetupFormMap]        = useState({});
  const [pneusFormMap,        setPneusFormMap]        = useState({});
  const [tempFormMap,         setTempFormMap]         = useState({});
  const [segmentBoundMap,     setSegmentBoundMap]     = useState({});
  // Valores do workspace ativo (com defaults)
  const PIT_EXIT_DEFAULTS     = { speedKmh: 30, rpmMin: 3000 };
  const filterMode            = filterModeMap[wsId]      ?? 'filtered';
  const preparationMode       = !!preparationModeMap[wsId];
  const pitExitConfig         = { ...PIT_EXIT_DEFAULTS, ...pitExitConfigMap[wsId] };
  const videoConfig           = videoConfigMap[wsId]     ?? null;
  const multiSessions         = multiSessionsMap[wsId]   || [];
  const multiFailedFiles      = multiFailedMap[wsId]     || [];
  const segmentBoundaries     = segmentBoundMap[wsId]    || [];
  const setupForm             = setupFormMap[wsId]       || null;
  const pneusForm             = pneusFormMap[wsId]       || null;
  const tempForm              = tempFormMap[wsId]        || null;

  // Setters convenientes
  const setFilterMode       = useCallback((v) => makeMapSetter(setFilterModeMap,      wsId)(v), [wsId]);
  const setPreparationMode  = useCallback((v) => makeMapSetter(setPreparationModeMap, wsId)(v), [wsId]);
  const setVideoConfig      = useCallback((v) => makeMapSetter(setVideoConfigMap,     wsId)(v), [wsId]);
  const setMultiSessions    = useCallback((v) => makeMapSetter(setMultiSessionsMap,   wsId)(v), [wsId]);
  const setMultiFailedFiles = useCallback((v) => makeMapSetter(setMultiFailedMap,     wsId)(v), [wsId]);
  const setSegmentBoundaries= useCallback((v) => makeMapSetter(setSegmentBoundMap,    wsId)(v), [wsId]);
  const setSetupForm        = useCallback((v) => makeMapSetter(setSetupFormMap,       wsId)(v), [wsId]);
  const setPneusForm        = useCallback((v) => makeMapSetter(setPneusFormMap,       wsId)(v), [wsId]);
  const setTempForm         = useCallback((v) => makeMapSetter(setTempFormMap,        wsId)(v), [wsId]);
  const setPitExitConfig    = useCallback((v) =>
    setPitExitConfigMap((prev) => ({
      ...prev,
      [wsId]: typeof v === 'function'
        ? v({ ...PIT_EXIT_DEFAULTS, ...prev[wsId] })
        : v,
    })), [wsId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Out-lap & filtros de volta ─────────────────────────────────── */
  const _firstLapKey = data?.laps ? Object.keys(data.laps)[0] : null;
  const outLapKey = data?.outLapIndex != null
    ? String(data.outLapIndex)
    : (_firstLapKey != null ? String(_firstLapKey) : null);

  // Modo pitexit: recorta out-lap a partir do instante de saída detectado
  const lapsAnalysis = useMemo(() => {
    if (filterMode !== 'pitexit' || !outLapKey || !data?.laps?.[outLapKey]) return rawLapsAnalysis;
    const lapRows = data.laps[outLapKey];
    const pitTime = findPitExitTime(lapRows, data.channels, pitExitConfig.speedKmh, pitExitConfig.rpmMin);
    if (pitTime == null) return rawLapsAnalysis;
    const tc = data.channels?.time;
    if (!tc) return rawLapsAnalysis;
    const trimmed = lapRows.filter((r) => r[tc] != null && r[tc] >= pitTime);
    if (trimmed.length < 10) return rawLapsAnalysis;
    const reanalyzed = analyzeLap(trimmed, data.channels, data.deviceType || 'DASH');
    if (!reanalyzed) return rawLapsAnalysis;
    return { ...rawLapsAnalysis, [outLapKey]: reanalyzed };
  }, [rawLapsAnalysis, filterMode, pitExitConfig, outLapKey, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const isECU = data?.deviceType === 'ECU';
  const _maxSampleCount = Object.values(lapsAnalysis)
    .reduce((m, v) => (v.lapTime > 0 ? Math.max(m, v.sampleCount || 0) : m), 0);

  const displayedLapsAnalysis = filterMode === 'all'
    ? lapsAnalysis
    : Object.fromEntries(Object.entries(lapsAnalysis).filter(([lapNum, v]) => {
        if (outLapKey && lapNum === outLapKey) return false;
        if (v.lapTime <= 0) return false;
        if (isECU && (v.longestSegmentTime ?? v.lapTime) >= 300) return false;
        if (_maxSampleCount > 0 && (v.sampleCount || 0) < _maxSampleCount * 0.15) return false;
        return true;
      }));

  const _statsSource    = filterMode === 'pitexit' ? displayedLapsAnalysis : lapsAnalysis;
  const sessionMaxRPM   = Object.values(_statsSource).reduce((m, v) => Math.max(m, v.maxRPM   || 0), 0);
  const sessionMaxSpeed = Object.values(_statsSource).reduce((m, v) => Math.max(m, v.maxSpeed || 0), 0);

  const displayedBestLapNum = useMemo(() => {
    let best = null, bestTime = Infinity;
    for (const [num, v] of Object.entries(displayedLapsAnalysis)) {
      if (v.lapTime > 0 && v.lapTime < bestTime) { bestTime = v.lapTime; best = num; }
    }
    return best;
  }, [displayedLapsAnalysis]);

  const activeTab = (!isLoaded && TELEMETRY_ONLY_TABS.has(profiles.activeTab))
    ? 'overview'
    : profiles.activeTab;

  // Sincroniza teamTabOpen com a aba ativa
  useEffect(() => {
    if (activeTab === 'equipe') {
      setTeamTabOpen(true);
      markChatRead();
    } else {
      setTeamTabOpen(false);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Alertas ─────────────────────────────────────────────────────── */
  const partsAlerts = useMemo(() => {
    return (profiles.activeProfile?.parts || [])
      .map((pt) => {
        const usedKm = (pt.entries || []).reduce((s, e) => s + (e.km || 0), 0);
        const pct = pt.kmLimit > 0 ? usedKm / pt.kmLimit : 0;
        if (pct < 0.96) return null;
        return { id: pt.id, name: pt.name, usedKm, kmLimit: pt.kmLimit, remaining: Math.max(0, pt.kmLimit - usedKm), pct };
      })
      .filter(Boolean);
  }, [profiles.activeProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  const vitalsAlerts = useMemo(() => {
    if (!isLoaded || !data) return [];
    const alerts = [];
    VITAL_CHANNELS.forEach(({ key, label }) => {
      if (!channels[key] || key === 'lambda') return;
      const limit = profiles.vitalsLimits[key] || {};
      if (limit.alarmEnabled === false) return;
      const maxL = parseFloat(limit.max);
      const minL = parseFloat(limit.min);
      if (isNaN(maxL) && isNaN(minL)) return;
      Object.keys(lapsAnalysis).forEach((lapNum) => {
        const vals = (data.laps[lapNum] || [])
          .map((r) => r[channels[key]])
          .filter((v) => v != null && !isNaN(v) && v > -999);
        if (!vals.length) return;
        let lapMax = vals[0], lapMin = vals[0];
        for (const v of vals) { if (v > lapMax) lapMax = v; if (v < lapMin) lapMin = v; }
        if (!isNaN(maxL) && lapMax > maxL) alerts.push({ variable: label, lap: lapNum, issue: 'max', value: lapMax.toFixed(2), limit: maxL });
        if (!isNaN(minL) && lapMin < minL) alerts.push({ variable: label, lap: lapNum, issue: 'min', value: lapMin.toFixed(2), limit: minL });
      });
    });
    return alerts;
  }, [profiles.vitalsLimits, lapsAnalysis, data, channels, isLoaded]);

  /* ── Load state triggers (para comunicação App → Tab) ────────────── */
  const [profileSetupLoad,    setProfileSetupLoad]    = useState({ seq: 0, data: null });
  const [profileTyreLoad,     setProfileTyreLoad]     = useState({ seq: 0, data: null });
  const [profileFuelCalcLoad, setProfileFuelCalcLoad] = useState({ seq: 0, data: null });
  const [profileWeightLoad,   setProfileWeightLoad]   = useState({ seq: 0, data: null });
  const [pendingAnnotationLoad, setPendingAnnotationLoad] = useState(null);

  /* ── Workspace delete ────────────────────────────────────────────── */
  const handleDeleteWorkspace = useCallback((workspaceId) => {
    clearWorkspaceData(workspaceId);
    [setFilterModeMap, setPreparationModeMap, setMultiSessionsMap, setMultiFailedMap,
     setSetupFormMap, setPneusFormMap, setTempFormMap, setSegmentBoundMap,
     setPitExitConfigMap, setVideoConfigMap].forEach((setter) =>
      setter((prev) => { const n = { ...prev }; delete n[workspaceId]; return n; })
    );
    profiles.deleteWorkspace(workspaceId);
  }, [clearWorkspaceData, profiles]);

  /* ── Sessões & Voltas ───────────────────────────────────────────── */
  const handleSaveSession = useCallback(async (profileId, name, csvText, fileName, sessionKm, groupId) => {
    const csvId = crypto.randomUUID();
    try {
      const { hash } = await saveCSV(csvId, csvText);
      return profiles.saveSession(name, fileName, csvId, profileId, hash, sessionKm, groupId);
    } catch (err) {
      return { error: err.message || 'Erro ao salvar sessão.' };
    }
  }, [profiles]);

  const handleLoadSession = useCallback(async (sessionId) => {
    const session = profiles.findSession(sessionId);
    if (!session) return { error: 'Sessão não encontrada.' };
    try {
      const result = await loadCSV(session.csvId);
      if (!result) return { error: 'Dados da sessão não encontrados no armazenamento local.' };
      loadFromText(result.csvText, session.fileName);
      profiles.setActiveTab('overview');
      return { ok: true, verified: result.verified };
    } catch (err) {
      return { error: err.message || 'Erro ao carregar sessão.' };
    }
  }, [profiles, loadFromText]);

  const handleDeleteSession = useCallback(async (sessionId, csvId) => {
    try { await deleteCSV(csvId); } catch { /* ignora */ }
    profiles.deleteSession(sessionId);
  }, [profiles]);

  const handleSaveLap = useCallback(async (profileId, name, lapNumber, groupId) => {
    const lapRows = data?.laps?.[lapNumber];
    if (!lapRows?.length) return { error: 'Dados da volta não encontrados.' };
    const lapAnalysis = lapsAnalysis?.[lapNumber];
    if (!lapAnalysis) return { error: 'Análise da volta não disponível.' };
    const lapDataId = crypto.randomUUID();
    try {
      const { hash } = await saveCSV(lapDataId, JSON.stringify({ lapRows, headers: data.headers, channels }));
      return profiles.saveLap(name, Number(lapNumber), lapDataId, lapAnalysis, data.fileName, profileId, hash, groupId);
    } catch (err) {
      return { error: err.message || 'Erro ao salvar volta.' };
    }
  }, [profiles, data, lapsAnalysis, channels]);

  const handleLoadLap = useCallback(async (lapId) => {
    const lap = profiles.findLap(lapId);
    if (!lap) return { error: 'Volta não encontrada.' };
    try {
      const result = await loadCSV(lap.lapDataId);
      if (!result) return { error: 'Dados da volta não encontrados no armazenamento local.' };
      const { lapRows, headers, channels: savedChannels } = JSON.parse(result.csvText);
      loadLapDirect({ lapRows, headers, channels: savedChannels, lapNumber: lap.lapNumber, fileName: `${lap.fileName} — V${lap.lapNumber}` });
      profiles.setActiveTab('overview');
      return { ok: true, verified: result.verified };
    } catch (err) {
      return { error: err.message || 'Erro ao carregar volta.' };
    }
  }, [profiles, loadLapDirect]);

  const handleDeleteLap = useCallback(async (lapId, lapDataId) => {
    try { await deleteCSV(lapDataId); } catch { /* ignora */ }
    profiles.deleteLap(lapId);
  }, [profiles]);

  /* ── Track annotations ──────────────────────────────────────────── */
  const handleLoadTrackAnnotations = useCallback(async (ann) => {
    if (ann.fileName && data?.fileName === ann.fileName) {
      setPendingAnnotationLoad(ann);
      profiles.setActiveTab('track');
      return;
    }
    const candidates = [];
    if (ann.csvId) candidates.push(ann.csvId);
    if (ann.fileName) {
      const allSessions = (profiles.activeWorkspace?.profiles ?? []).flatMap((p) => p.sessions ?? []);
      for (const s of allSessions) {
        if (s.fileName === ann.fileName && s.csvId && !candidates.includes(s.csvId)) candidates.push(s.csvId);
      }
    }
    if (!candidates.length) {
      alert(`Arquivo "${ann.fileName ?? '(desconhecido)'}" não encontrado no armazenamento.\nAbra manualmente, salve a sessão e as anotações novamente.`);
      return;
    }
    for (const csvId of candidates) {
      try {
        const stored = await loadCSV(csvId);
        if (stored?.csvText) {
          loadFromText(stored.csvText, ann.fileName);
          setPendingAnnotationLoad(ann);
          profiles.setActiveTab('track');
          return;
        }
      } catch { /* tenta o próximo */ }
    }
    alert(`Dados do arquivo "${ann.fileName ?? '(desconhecido)'}" não encontrados.\nAbra manualmente, salve a sessão e as anotações novamente.`);
  }, [profiles, loadFromText, data]);

  const handleSaveTrackAnnotations = useCallback((segmentId, segmentName, annotationName, segmentComments, generalNotes, targetProfileId, lapNum, fileName, groupId) => {
    let csvId = null;
    if (data?.fileName === fileName) {
      const allSessions = (profiles.activeWorkspace?.profiles ?? []).flatMap((p) => p.sessions ?? []);
      const existing = allSessions.find((s) => s.fileName === fileName);
      if (existing?.csvId) {
        csvId = existing.csvId;
      } else if (data?.csvText) {
        const newCsvId = crypto.randomUUID();
        saveCSV(newCsvId, data.csvText)
          .then(({ hash }) => {
            profiles.saveSession(fileName, fileName, newCsvId, targetProfileId || profiles.activeProfileId, hash, 0, null);
            profiles.saveTrackAnnotations(segmentId, segmentName, annotationName, segmentComments, generalNotes, targetProfileId, lapNum, fileName, newCsvId, groupId);
          })
          .catch(() => {});
      }
    }
    return profiles.saveTrackAnnotations(segmentId, segmentName, annotationName, segmentComments, generalNotes, targetProfileId, lapNum, fileName, csvId, groupId);
  }, [profiles, data]);

  /* ── Setup & Pneus (load entre abas) ───────────────────────────── */
  const handleSaveSetup   = useCallback((profileId, name, data, groupId) => profiles.saveSetup(name, data, profileId, groupId),  [profiles]);
  const handleDeleteSetup = useCallback((id) => profiles.deleteSetup(id),  [profiles]);
  const handleLoadSetup   = useCallback((id) => {
    const d = profiles.getSetupData(id);
    if (d) { setProfileSetupLoad((p) => ({ seq: p.seq + 1, data: d })); profiles.setActiveTab('setup'); }
  }, [profiles]);

  const handleSaveTireSet   = useCallback((profileId, name, tyres, conditions, groupId) => profiles.saveTireSet(name, tyres, conditions, profileId, groupId), [profiles]);
  const handleDeleteTireSet = useCallback((id) => profiles.deleteTireSet(id), [profiles]);
  const handleLoadTireSet   = useCallback((id) => {
    const d = profiles.getTireSetData(id);
    if (d) { setProfileTyreLoad((p) => ({ seq: p.seq + 1, data: d })); profiles.setActiveTab('pneus'); }
  }, [profiles]);

  /* ── Combustível calc ───────────────────────────────────────────── */
  const handleSaveFuelCalc   = useCallback((profileId, name, data, groupId) => profiles.saveFuelCalc(name, data, profileId, groupId), [profiles]);
  const handleDeleteFuelCalc = useCallback((id) => profiles.deleteFuelCalc(id), [profiles]);
  const handleLoadFuelCalc   = useCallback((id) => {
    const d = profiles.getFuelCalcData(id);
    if (d) { setProfileFuelCalcLoad((p) => ({ seq: p.seq + 1, data: d })); profiles.setActiveTab('overview'); }
  }, [profiles]);

  /* ── Peso snapshots ─────────────────────────────────────────────── */
  const handleSaveWeightSnapshot   = useCallback((profileId, name, data, groupId) => profiles.saveWeightSnapshot(name, data, profileId, groupId), [profiles]);
  const handleDeleteWeightSnapshot = useCallback((id) => profiles.deleteWeightSnapshot(id), [profiles]);
  const handleLoadWeightSnapshot   = useCallback((id) => {
    const d = profiles.getWeightSnapshotData(id);
    if (d) { setProfileWeightLoad((p) => ({ seq: p.seq + 1, data: d })); profiles.setActiveTab('peso'); }
  }, [profiles]);

  /* ── Temperatura ────────────────────────────────────────────────── */
  const handleAddTempLog    = useCallback((entry)      => profiles.addTempLog(entry),          [profiles]);
  const handleUpdateTempLog = useCallback((id, fields) => profiles.updateTempLog(id, fields),  [profiles]);
  const handleDeleteTempLog = useCallback((id)         => profiles.deleteTempLog(id),          [profiles]);
  const handleClearTempLog  = useCallback(()           => profiles.clearTempLog(),             [profiles]);
  const handleSaveTempSet   = useCallback((name)       => profiles.saveTempSet(name),          [profiles]);
  const handleLoadTempSet   = useCallback((id)         => profiles.loadTempSet(id),            [profiles]);
  const handleRenameTempSet = useCallback((id, n)      => profiles.renameTempSet(id, n),       [profiles]);
  const handleDeleteTempSet = useCallback((id)         => profiles.deleteTempSet(id),          [profiles]);

  /* ── Mecânica ───────────────────────────────────────────────────── */
  const handleSavePart              = useCallback((name, km, pId, usedKm, cat, obs) => profiles.savePart(name, km, pId, usedKm, cat, obs), [profiles]);
  const handleEditPart              = useCallback((id, name, km, pId, cat, obs)     => profiles.editPart(id, name, km, pId, cat, obs),     [profiles]);
  const handleDeletePart            = useCallback((id, pId)                         => profiles.deletePart(id, pId),                       [profiles]);
  const handleAddPartEntry          = useCallback((partId, km, note, date, pId)     => profiles.addPartEntry(partId, km, note, date, pId),  [profiles]);
  const handleDeletePartEntry       = useCallback((partId, entryId, pId)            => profiles.deletePartEntry(partId, entryId, pId),      [profiles]);
  const handleAddCustomCategory     = useCallback((name, pId)                       => profiles.addCustomPartCategory(name, pId),           [profiles]);
  const handleDeleteCustomCategory  = useCallback((name, pId)                       => profiles.deleteCustomPartCategory(name, pId),        [profiles]);
  const handleClearAllParts         = useCallback((pId)                             => profiles.clearAllParts(pId),                         [profiles]);
  const handleSaveMechanicSnapshot  = useCallback((pId, name, parts, cats, groupId) => profiles.saveMechanicSnapshot(name, parts, cats, pId, groupId), [profiles]);
  const handleDeleteMechanicSnapshot= useCallback((id)                              => profiles.deleteMechanicSnapshot(id),                 [profiles]);
  const handleLoadMechanicSnapshot  = useCallback((id)                              => profiles.loadMechanicSnapshot(id, profiles.activeProfileId), [profiles]);

  /* ── Groups ─────────────────────────────────────────────────────── */
  const handleSaveGroup   = useCallback((profileId, name)         => profiles.saveGroup(name, profileId),              [profiles]);
  const handleRenameGroup = useCallback((profileId, groupId, name)=> profiles.renameGroup(groupId, name, profileId),   [profiles]);
  const handleDeleteGroup = useCallback((profileId, groupId)      => profiles.deleteGroup(groupId, profileId),         [profiles]);

  /* ── Math source ────────────────────────────────────────────────── */
  const handleLoadMathSource = useCallback(async (source) => {
    try {
      if (source.type === 'lap') {
        const result = await loadCSV(source.lapDataId);
        if (!result) return { error: 'Dados da volta não encontrados.' };
        const { lapRows, headers: lapHeaders, channels: savedChannels } = JSON.parse(result.csvText);
        return { ok: true, rows: lapRows, headers: lapHeaders, channels: savedChannels, name: source.name };
      } else {
        const result = await loadCSV(source.csvId);
        if (!result) return { error: 'Dados da sessão não encontrados.' };
        const parsed = parseCSV(result.csvText);
        return { ok: true, rows: Object.values(parsed.laps).flat(), headers: parsed.headers, channels: detectChannels(parsed.headers), name: source.name };
      }
    } catch (err) {
      return { error: err.message || 'Erro ao carregar fonte.' };
    }
  }, []);

  /* ── Auth ────────────────────────────────────────────────────────── */
  const handleLogout     = () => { localStorage.removeItem('rt_session'); window.location.reload(); };
  const handleNewSession = () => { clearData(); setPreparationMode(false); };

  /* ── Equipe: aplica medições aprovadas nos campos da tab correspondente */
  const handleApplyMeasurement = useCallback((measurement) => {
    console.log('[ApplyMeasurement] category:', measurement.category, 'data:', measurement.data, 'wsId:', wsId);

    // Se o dispositivo está atribuído a um perfil, muda para esse perfil
    const assignedIds = deviceAssignments[measurement.deviceId];
    if (assignedIds) {
      const firstId = Array.isArray(assignedIds) ? assignedIds[0] : assignedIds;
      if (firstId && firstId !== profiles.activeProfileId) {
        profiles.setActiveProfile(firstId);
      }
    }

    const cat = measurement.category;
    const d   = measurement.data || {};

    // ── Pressões de pneus ──────────────────────────────────────────
    if (cat === 'pressures' || cat === 'tires' || cat === 'pressoes') {
      const tyresUpdate = {};
      const posMap = { FL: 'fl', FR: 'fr', RL: 'rl', RR: 'rr' };
      for (const [mobileKey, desktopKey] of Object.entries(posMap)) {
        if (d[mobileKey]) {
          tyresUpdate[desktopKey] = {};
          if (d[mobileKey].fria   != null) tyresUpdate[desktopKey].cold = String(d[mobileKey].fria);
          if (d[mobileKey].quente != null) tyresUpdate[desktopKey].hot  = String(d[mobileKey].quente);
        }
      }
      console.log('[ApplyMeasurement] pneus tyresUpdate:', tyresUpdate);
      setPneusFormMap((prev) => {
        const cur = prev[wsId] || {};
        const prevTyres = cur.tyres || {};
        const mergedTyres = { ...prevTyres };
        for (const [corner, vals] of Object.entries(tyresUpdate)) {
          mergedTyres[corner] = { ...(prevTyres[corner] || {}), ...vals };
        }
        const merged = { ...cur, tyres: mergedTyres };
        if (d.observacoes) {
          merged.conditions = { ...(cur.conditions || {}), notes: d.observacoes };
        }
        console.log('[ApplyMeasurement] pneusFormMap updated for wsId:', wsId, merged);
        return { ...prev, [wsId]: merged };
      });
      profiles.setActiveTab('pneus');

    // ── Temperaturas / condições ambientais ─────────────────────────
    } else if (cat === 'temperature' || cat === 'temperaturas') {
      const mapped = {};
      if (d.date)                         mapped.date         = String(d.date);
      if (d.time)                         mapped.time         = String(d.time);
      if (d.tempPista    != null)         mapped.trackTemp    = String(d.tempPista);
      if (d.tempAmbiente != null)         mapped.ambientTemp  = String(d.tempAmbiente);
      if (d.umidade      != null)         mapped.humidity     = String(d.umidade);
      if (d.altitude     != null)         mapped.altitude     = String(d.altitude);
      if (d.pressaoAtm   != null)         mapped.baroPressure = String(d.pressaoAtm);
      if (d.vento        != null)         mapped.windSpeed    = String(d.vento);
      if (d.direcaoVento && d.direcaoVento !== '—') mapped.windDir = d.direcaoVento;
      if (d.precipitacao && d.precipitacao !== '—') mapped.precipitation = d.precipitacao;
      if (d.condicaoPista) {
        const condMap = { 'Seca': 'dry', 'Úmida': 'damp', 'Molhada': 'wet', 'Intermediária': 'intermediate' };
        if (!mapped.precipitation) mapped.precipitation = condMap[d.condicaoPista] || d.condicaoPista;
      }
      console.log('[ApplyMeasurement] temperature mapped:', mapped);
      setTempFormMap((prev) => {
        const updated = { ...(prev[wsId] || {}), ...mapped };
        console.log('[ApplyMeasurement] tempFormMap updated for wsId:', wsId, updated);
        return { ...prev, [wsId]: updated };
      });
      profiles.setActiveTab('temperature');

    // ── Setup mecânico ──────────────────────────────────────────────
    } else if (cat === 'setup' || cat === 'mecanica') {
      console.log('[ApplyMeasurement] setup data:', d);
      setSetupFormMap((prev) => ({
        ...prev,
        [wsId]: { ...(prev[wsId] || {}), ...d },
      }));
      profiles.setActiveTab('setup');
    }
  }, [wsId, profiles, deviceAssignments]);

  /* ═══════════════════════════════════════════════════════════════════
     Render
  ═══════════════════════════════════════════════════════════════════ */
  return (
    <CarWeightProvider activeProfileId={profiles.activeProfileId}>
    <div style={{ background: COLORS.bg, minHeight: '100vh', color: COLORS.textPrimary }}>
      <Header
        fileName={isLoaded ? data.fileName : null}
        onLoad={loadFile}
        onLogout={handleLogout}
        teamPending={pendingCount}
        teamUnread={unreadChat}
        onTeamClick={() => {
          profiles.setActiveTab('equipe');
          setTeamTabOpen(true);
          markChatRead();
        }}
      />
      <WorkspaceBar
        workspaces={profiles.workspaces}
        activeWorkspaceId={profiles.activeWorkspaceId}
        onSetActive={profiles.setActiveWorkspace}
        onCreate={profiles.createWorkspace}
        onRename={profiles.renameWorkspace}
        onDelete={handleDeleteWorkspace}
        loadedWorkspaceIds={loadedWorkspaceIds}
      />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 96px)' }}>
        <TabBar activeTab={activeTab} onTabChange={profiles.setActiveTab} isLoaded={isLoaded} />
        <main style={{ flex: 1, minWidth: 0, maxWidth: 1600, margin: '0 auto', width: '100%', padding: '0 8px' }}>

          {activeTab === 'overview' && (
            <OverviewTab
              data={data} channels={channels}
              lapsAnalysis={displayedLapsAnalysis} bestLapNum={displayedBestLapNum}
              sessionMaxRPM={sessionMaxRPM} sessionMaxSpeed={sessionMaxSpeed}
              vitalsAlerts={vitalsAlerts} partsAlerts={partsAlerts}
              isLoaded={isLoaded} onLoad={loadFile}
              filterMode={filterMode} setFilterMode={setFilterMode}
              pitExitConfig={pitExitConfig} setPitExitConfig={setPitExitConfig}
              hasOutLap={!!outLapKey}
              profileFuelCalcLoad={profileFuelCalcLoad}
              profilesList={profiles.profiles}
              activeProfileId={profiles.activeProfileId}
              profileGroups={profiles.activeProfile?.groups || []}
              onSaveFuelCalc={handleSaveFuelCalc}
              profileFuelCalcs={profiles.activeProfile?.fuelCalcs || []}
              onDeleteFuelCalc={handleDeleteFuelCalc}
              onLoadFuelCalc={handleLoadFuelCalc}
              onSaveSession={handleSaveSession}
              onSaveLap={handleSaveLap}
              onAddPartEntry={handleAddPartEntry}
            />
          )}

          {activeTab === 'laps' && (
            <LapCompareTab
              data={data} channels={channels} lapsAnalysis={displayedLapsAnalysis}
              extraSessions={extraSessions}
              addExtraSession={addExtraSession}
              addExtraSessionFromText={addExtraSessionFromText}
              addExtraSessionFromLapData={addExtraSessionFromLapData}
              removeExtraSession={removeExtraSession}
              profiles={profiles.profiles} activeProfile={profiles.activeProfile}
            />
          )}

          {activeTab === 'wot' && (
            <WOTAnalysisTab data={data} channels={channels} lapsAnalysis={displayedLapsAnalysis} />
          )}

          {activeTab === 'vitals' && (
            <VitalsTab
              data={data} channels={channels} lapsAnalysis={displayedLapsAnalysis}
              vitalsLimits={profiles.vitalsLimits} setVitalsLimits={profiles.setVitalsLimits}
              isLoaded={isLoaded}
              filterMode={filterMode} setFilterMode={setFilterMode} hasOutLap={!!outLapKey}
            />
          )}

          {activeTab === 'report' && (
            <ReportTab
              data={data} channels={channels}
              lapsAnalysis={displayedLapsAnalysis} bestLapNum={displayedBestLapNum}
              filterMode={filterMode} setFilterMode={setFilterMode} hasOutLap={!!outLapKey}
            />
          )}

          {activeTab === 'track' && (
            <TrackMapTab
              data={data} channels={channels}
              lapsAnalysis={displayedLapsAnalysis}
              extraSessions={extraSessions}
              addExtraSession={addExtraSession} removeExtraSession={removeExtraSession}
              profiles={profiles.profiles}
              activeProfileId={profiles.activeProfileId}
              activeProfile={profiles.activeProfile}
              saveTrackSegments={profiles.saveTrackSegments}
              deleteTrackSegments={profiles.deleteTrackSegments}
              trackTemplates={profiles.trackTemplates}
              saveTrackTemplate={profiles.saveTrackTemplate}
              deleteTrackTemplate={profiles.deleteTrackTemplate}
              saveTrackAnnotations={handleSaveTrackAnnotations}
              pendingAnnotation={pendingAnnotationLoad}
              onAnnotationLoaded={() => setPendingAnnotationLoad(null)}
              segmentBoundaries={segmentBoundaries}
              setSegmentBoundaries={setSegmentBoundaries}
            />
          )}

          {activeTab === 'temperature' && (
            <TemperatureTab
              data={data} channels={channels} lapsAnalysis={displayedLapsAnalysis}
              tempLog={profiles.tempLog}
              onAddTempLog={handleAddTempLog} onUpdateTempLog={handleUpdateTempLog}
              onDeleteTempLog={handleDeleteTempLog} onClearTempLog={handleClearTempLog}
              tempSets={profiles.tempSets}
              onSaveTempSet={handleSaveTempSet} onLoadTempSet={handleLoadTempSet}
              onRenameTempSet={handleRenameTempSet} onDeleteTempSet={handleDeleteTempSet}
              tempForm={tempForm} setTempForm={setTempForm}
            />
          )}

          {activeTab === 'pneus' && (
            <PneusTab
              profileLoad={profileTyreLoad}
              profilesList={profiles.profiles}
              activeProfileId={profiles.activeProfileId}
              onSaveTireSet={handleSaveTireSet}
              profileGroups={profiles.activeProfile?.groups || []}
              onSaveGroup={handleSaveGroup}
              profileTempLog={profiles.tempLog}
              profileTireSets={profiles.activeProfile?.tireSets || []}
              onLoadTireSet={handleLoadTireSet}
              onDeleteTireSet={handleDeleteTireSet}
              pneusForm={pneusForm} setPneusForm={setPneusForm}
              profileTireKm={profiles.activeProfile?.tireKm}
              onSaveTireKm={profiles.saveTireKm}
              profileSessions={profiles.activeProfile?.sessions || []}
            />
          )}

          {activeTab === 'setup' && (
            <SetupSheetTab
              profileLoad={profileSetupLoad}
              profilesList={profiles.profiles}
              activeProfileId={profiles.activeProfileId}
              profileGroups={profiles.activeProfile?.groups || []}
              onSaveSetup={handleSaveSetup}
              profileSetups={profiles.activeProfile?.setups || []}
              onLoadSetup={handleLoadSetup}
              onDeleteSetup={handleDeleteSetup}
              setupForm={setupForm} setSetupForm={setSetupForm}
              profileSessions={profiles.activeProfile?.sessions || []}
            />
          )}

          {activeTab === 'profiles' && (
            <ProfilesTab
              profiles={profiles.profiles}
              activeProfileId={profiles.activeProfileId}
              activeProfile={profiles.activeProfile}
              createProfile={profiles.createProfile}
              renameProfile={profiles.renameProfile}
              deleteProfile={profiles.deleteProfile}
              setActiveProfile={profiles.setActiveProfile}
              deleteSetup={profiles.deleteSetup}
              deleteTireSet={profiles.deleteTireSet}
              exportProfiles={profiles.exportProfiles}
              importProfiles={profiles.importProfiles}
              onLoadSetup={handleLoadSetup}
              onLoadTireSet={handleLoadTireSet}
              onLoadSession={handleLoadSession}
              onDeleteSession={handleDeleteSession}
              onLoadLap={handleLoadLap}
              onDeleteLap={handleDeleteLap}
              verifyCSV={verifyCSV}
              onLoadFuelCalc={handleLoadFuelCalc}
              onDeleteFuelCalc={handleDeleteFuelCalc}
              onDeleteMechanicSnapshot={handleDeleteMechanicSnapshot}
              onLoadMechanicSnapshot={handleLoadMechanicSnapshot}
              onDeleteTrackAnnotations={profiles.deleteTrackAnnotations}
              onLoadTrackAnnotations={handleLoadTrackAnnotations}
              onLoadWeightSnapshot={handleLoadWeightSnapshot}
              onDeleteWeightSnapshot={handleDeleteWeightSnapshot}
              onSaveGroup={handleSaveGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
            />
          )}

          {activeTab === 'multisession' && (
            <MultiSessionTab
              vitalsLimits={profiles.vitalsLimits}
              sessions={multiSessions} setSessions={setMultiSessions}
              failedFiles={multiFailedFiles} setFailedFiles={setMultiFailedFiles}
              savedReports={profiles.savedReports}
              onSaveReport={profiles.saveMultiSessionReport}
              onDeleteReport={profiles.deleteMultiSessionReport}
            />
          )}

          {activeTab === 'mecanica' && (
            <MecanicaTab
              profileParts={profiles.activeProfile?.parts || []}
              activeProfileId={profiles.activeProfileId}
              customPartCategories={profiles.activeProfile?.customPartCategories || []}
              profilesList={profiles.profiles}
              profileGroups={profiles.activeProfile?.groups || []}
              mechanicSnapshots={profiles.activeProfile?.mechanicSnapshots || []}
              brakePad={profiles.activeProfile?.brakePad || EMPTY_BRAKE_PAD}
              onSaveBrakePad={profiles.saveBrakePad}
              onSavePart={handleSavePart}
              onEditPart={handleEditPart}
              onDeletePart={handleDeletePart}
              onAddPartEntry={handleAddPartEntry}
              onDeletePartEntry={handleDeletePartEntry}
              onAddCustomCategory={handleAddCustomCategory}
              onDeleteCustomCategory={handleDeleteCustomCategory}
              onClearAllParts={handleClearAllParts}
              onSaveMechanicSnapshot={handleSaveMechanicSnapshot}
              onDeleteMechanicSnapshot={handleDeleteMechanicSnapshot}
              onLoadMechanicSnapshot={handleLoadMechanicSnapshot}
            />
          )}

          {activeTab === 'onboard' && (
            <OnboardingTab
              data={data} channels={channels}
              lapsAnalysis={lapsAnalysis} bestLapNum={bestLapNum}
              isLoaded={isLoaded}
              videoConfig={videoConfig} setVideoConfig={setVideoConfig}
              profiles={profiles.profiles} activeProfile={profiles.activeProfile}
              onLoadPrimaryFile={loadFile}
            />
          )}

          {activeTab === 'math' && (
            <MathTab
              data={data} channels={channels}
              lapsAnalysis={displayedLapsAnalysis}
              activeProfile={profiles.activeProfile}
              onLoadMathSource={handleLoadMathSource}
            />
          )}

          {activeTab === 'regulamentacoes' && <RegulamentacoesTab />}

          {activeTab === 'combustivel' && (
            <CombustivelTab
              activeProfile={profiles.activeProfile}
              profilesList={profiles.profiles}
              activeProfileId={profiles.activeProfileId}
              profileGroups={profiles.activeProfile?.groups || []}
              onSaveFuelCalc={handleSaveFuelCalc}
              profileFuelCalcs={profiles.activeProfile?.fuelCalcs || []}
              onDeleteFuelCalc={handleDeleteFuelCalc}
              onLoadFuelCalc={handleLoadFuelCalc}
            />
          )}

          {activeTab === 'peso' && (
            <PesoTab
              activeProfile={profiles.activeProfile}
              data={data} channels={channels}
              onSaveSnapshot={handleSaveWeightSnapshot}
              profileWeightLoad={profileWeightLoad}
            />
          )}

          {activeTab === 'pilotos' && (
            <PilotosTab profiles={profiles.profiles} />
          )}

          {activeTab === 'pistas' && (
            <PistasTab activeProfile={profiles.activeProfile} />
          )}

          {activeTab === 'estrategia' && (
            <EstrategiaTab activeProfile={profiles.activeProfile} />
          )}

          {activeTab === 'performance' && (
            <PerformanceTab
              activeProfile={profiles.activeProfile}
              profileParts={profiles.activeProfile?.parts || []}
            />
          )}

          {activeTab === 'calendario' && (
            <CalendarioTab
              activeProfile={profiles.activeProfile}
              allProfiles={profiles.profiles}
              saveGroup={profiles.saveGroup}
            />
          )}

          {activeTab === 'laptime' && (
            <LapTimeTab
              setupForm={setupForm}
              setSetupForm={setSetupForm}
              profileId={profiles.activeProfileId}
            />
          )}

          {activeTab === 'equipe' && (
            <EquipeTab
              onApplyMeasurement={handleApplyMeasurement}
              profilesList={profiles.profiles}
            />
          )}

        </main>
      </div>
    </div>
    </CarWeightProvider>
  );
}
