import { useState, useRef, useMemo } from 'react';
import { detectChannels } from '@/core/channelDetector';
import { routeFile, FILE_ACCEPT_STRING, isProprietaryFormat, getFormatInfo } from '@/core/fileRouter';
import { LAP_COLORS } from '@/constants/colors';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { PrintFooter } from '@/components/common';

/** Acelerador mínimo (%) para considerar como WOT */
const WOT_THRESHOLD = 90;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function getVals(rows, channelKey) {
  if (!channelKey) return [];
  return rows
    .map((r) => r[channelKey])
    .filter((v) => v != null && !isNaN(v) && v > -9999);
}

/* Loop-based helpers — nunca estouram a call stack independente do tamanho do array */
function arrMax(arr) {
  if (!arr.length) return null;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}
function arrMin(arr) {
  if (!arr.length) return null;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m;
}
function arrAvg(arr) {
  if (!arr.length) return null;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

/**
 * @param {object[]} rows        - Linhas brutas da volta
 * @param {object}   channels    - Mapa de canais detectados
 * @param {number|null} warmupEndTime - Tempo absoluto (s) após o qual os dados são válidos.
 *                                     Linhas com time ≤ warmupEndTime são ignoradas.
 *                                     null = sem filtro de aquecimento.
 */
function computeLapStats(rows, channels, warmupEndTime) {
  // Descarta linhas anteriores a warmupEndTime (controlado pelo usuário via "Descartar início")
  const activeRows = (warmupEndTime != null && channels.time)
    ? rows.filter((r) => {
        const t = r[channels.time];
        return t != null && !isNaN(t) && t > warmupEndTime;
      })
    : rows;

  const engineTemps  = getVals(activeRows, channels.engineTemp);
  const transTemps   = getVals(activeRows, channels.transOilTemp);
  const oilPressures = getVals(activeRows, channels.oilPressure);
  const batteries    = getVals(activeRows, channels.battery);
  const speeds       = getVals(activeRows, channels.gpsSpeed);

  // WOT: acelerador ≥ 90%; se canal de marcha disponível, apenas 5ª marcha em diante
  const wotRows = channels.throttle
    ? activeRows.filter((r) => {
        const t = r[channels.throttle];
        if (t == null || isNaN(t) || t < WOT_THRESHOLD) return false;
        if (channels.gear) {
          const g = r[channels.gear];
          if (g == null || isNaN(g) || g < 5) return false;
        }
        return true;
      })
    : [];
  const transWOT         = getVals(wotRows, channels.transOilPressure);
  const transOilPressAll = getVals(activeRows, channels.transOilPressure);

  return {
    engineTempMax:        arrMax(engineTemps),
    transOilTempMax:      arrMax(transTemps),
    transOilTempMin:      arrMin(transTemps),
    oilPressureMin:       arrMin(oilPressures),
    transOilPressureWOT:  arrAvg(transWOT),
    transOilPressureMin:  arrMin(transOilPressAll),
    transOilPressureMax:  arrMax(transOilPressAll),
    batteryMin:           arrMin(batteries),
    maxSpeed:             arrMax(speeds),
  };
}

/**
 * Agrega os dados críticos de todas as voltas de uma sessão
 * em um único resumo (pior caso / melhor caso conforme a métrica).
 */
function computeSessionSummary(laps) {
  if (!laps.length) return null;

  const vals = (key) => laps.map((l) => l[key]).filter((v) => v != null);

  const engineTemps   = vals('engineTempMax');
  const transTemps    = vals('transOilTempMax');
  const transTempsMin = vals('transOilTempMin');
  const oilPressures  = vals('oilPressureMin');
  const transWOT      = vals('transOilPressureWOT');
  const transPressMin = vals('transOilPressureMin');
  const transPressMax = vals('transOilPressureMax');
  const batteries     = vals('batteryMin');
  const speeds        = vals('maxSpeed');

  return {
    engineTempMax:        arrMax(engineTemps),
    transOilTempMax:      arrMax(transTemps),
    transOilTempMin:      arrMin(transTempsMin),
    oilPressureMin:       arrMin(oilPressures),
    transOilPressureWOT:  transWOT.length ? arrAvg(transWOT) : null,
    transOilPressureMin:  arrMin(transPressMin),
    transOilPressureMax:  arrMax(transPressMax),
    batteryMin:           arrMin(batteries),
    maxSpeed:             arrMax(speeds),
    totalLaps:            laps.length,
  };
}

/**
 * Constrói sessão a partir de dados já parseados.
 * Armazena linhas brutas por volta (rawLapsData) para permitir recomputação
 * dinâmica de estatísticas quando o usuário ajustar skipSeconds.
 */
function buildSessionFromParsed(parsed, fileName) {
  const channels = detectChannels(parsed.headers, parsed.units || []);

  // Armazena linhas brutas por volta para recomputação dinâmica
  const rawLapsData = Object.entries(parsed.laps).map(([lapNum, rows]) => ({ lapNum, rows }));

  // Encontra o menor valor de tempo em todas as voltas para definir t0 da sessão
  let sessionStartTime = null;
  if (channels.time) {
    for (const { rows } of rawLapsData) {
      for (const r of rows) {
        const t = r[channels.time];
        if (t != null && !isNaN(t)) {
          if (sessionStartTime === null || t < sessionStartTime) sessionStartTime = t;
        }
      }
    }
  }

  // Computa estatísticas iniciais sem descarte (skipSeconds = 0)
  const allRows = rawLapsData.flatMap((d) => d.rows);
  const laps = rawLapsData
    .map(({ lapNum, rows }) => {
      const rawSpeeds   = getVals(rows, channels.gpsSpeed);
      const rawEngTemps = getVals(rows, channels.engineTemp);
      const hasRawData  = rawSpeeds.length > 0 || rawEngTemps.length > 0;
      return { lapNum, hasRawData, ...computeLapStats(rows, channels, null) };
    })
    .filter((l) => l.hasRawData)
    .sort((a, b) => parseFloat(a.lapNum) - parseFloat(b.lapNum));

  const sessionStats = {
    ...computeLapStats(allRows, channels, null),
    totalLaps: laps.length,
  };

  return { id: crypto.randomUUID(), fileName, channels, laps, sessionStats, rawLapsData, sessionStartTime };
}

function getLapAlerts(lap, vitalsLimits) {
  const alerts = {};

  const maxEngTemp = parseFloat(vitalsLimits?.engineTemp?.max);
  if (!isNaN(maxEngTemp) && lap.engineTempMax != null && lap.engineTempMax > maxEngTemp)
    alerts.engineTempMax = { limit: maxEngTemp };

  const maxTransTemp = parseFloat(vitalsLimits?.transOilTemp?.max);
  if (!isNaN(maxTransTemp) && lap.transOilTempMax != null && lap.transOilTempMax > maxTransTemp)
    alerts.transOilTempMax = { limit: maxTransTemp };

  const minTransTemp = parseFloat(vitalsLimits?.transOilTemp?.min);
  if (!isNaN(minTransTemp) && lap.transOilTempMin != null && lap.transOilTempMin < minTransTemp)
    alerts.transOilTempMin = { limit: minTransTemp };

  const minOilPress = parseFloat(vitalsLimits?.oilPressure?.min);
  if (!isNaN(minOilPress) && lap.oilPressureMin != null && lap.oilPressureMin < minOilPress)
    alerts.oilPressureMin = { limit: minOilPress };

  const minTransPress = parseFloat(vitalsLimits?.transOilPressure?.min);
  if (!isNaN(minTransPress) && lap.transOilPressureMin != null && lap.transOilPressureMin < minTransPress)
    alerts.transOilPressureMin = { limit: minTransPress };

  const maxTransPress = parseFloat(vitalsLimits?.transOilPressure?.max);
  if (!isNaN(maxTransPress) && lap.transOilPressureMax != null && lap.transOilPressureMax > maxTransPress)
    alerts.transOilPressureMax = { limit: maxTransPress };

  const minBattery = parseFloat(vitalsLimits?.battery?.min);
  if (!isNaN(minBattery) && lap.batteryMin != null && lap.batteryMin < minBattery)
    alerts.batteryMin = { limit: minBattery };

  return alerts;
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function ValueCell({ value, unit = '', decimals = 1, alert, isBest, isWorst, COLORS }) {
  let bg    = 'transparent';
  let color = value == null ? COLORS.textMuted : COLORS.textPrimary;
  let fw    = 400;

  if (alert)   { bg = `${COLORS.accent}18`; color = COLORS.accent; fw = 700; }
  if (isBest)  { bg = '#06d6a018'; color = COLORS.green;  fw = 700; }
  if (isWorst) { bg = '#ffd16618'; color = COLORS.yellow; fw = 700; }

  return (
    <td style={{
      padding: '7px 10px',
      textAlign: 'center',
      background: bg,
      color,
      fontWeight: fw,
      fontSize: 12,
      borderBottom: `1px solid ${COLORS.border}11`,
      whiteSpace: 'nowrap',
    }}>
      {value != null
        ? `${parseFloat(value).toFixed(decimals)}${unit}`
        : <span style={{ color: COLORS.textMuted }}>—</span>}
      {alert   && <span style={{ marginLeft: 4, fontSize: 11 }}>⚠</span>}
      {isBest  && <span style={{ marginLeft: 4, fontSize: 11 }}>↑</span>}
      {isWorst && <span style={{ marginLeft: 4, fontSize: 11 }}>↓</span>}
    </td>
  );
}

function ColHeader({ children, sub, COLORS }) {
  return (
    <th style={{
      padding: '8px 10px',
      textAlign: 'center',
      color: COLORS.textMuted,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.8px',
      borderBottom: `1px solid ${COLORS.border}`,
      whiteSpace: 'nowrap',
    }}>
      {children}
      {sub && <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, color: COLORS.textMuted }}>{sub}</div>}
    </th>
  );
}

/* ─── Export Excel (HTML table → .xls, abre no Excel sem dependências) ───── */

function exportToExcel(sessions, sessionSummaries, vitalsLimits) {
  const fmt = (v, d = 1) => (v != null ? parseFloat(v).toFixed(d) : '—');

  const engLimit        = parseFloat(vitalsLimits?.engineTemp?.max);
  const transOilTempMax = parseFloat(vitalsLimits?.transOilTemp?.max);
  const oilLimit        = parseFloat(vitalsLimits?.oilPressure?.min);
  const transPresMin    = parseFloat(vitalsLimits?.transOilPressure?.min);

  const headerRow = [
    'Sessão', 'Tipo', 'Volta',
    'T. Motor Máx (°C)', 'T. Óleo Câmbio Máx (°C)', 'P. Óleo Mín (bar)',
    'P. Óleo Câmbio WOT (bar)', 'Bateria Mín (V)', 'Vel. Máx (km/h)',
  ];

  const rows = [];
  sessions.forEach((session, si) => {
    const sum = sessionSummaries[si];
    // Linha de resumo da sessão
    rows.push([
      session.fileName, 'Sessão', '',
      fmt(sum?.engineTempMax), fmt(sum?.transOilTempMax), fmt(sum?.oilPressureMin, 2),
      fmt(sum?.transOilPressureWOT, 2), fmt(sum?.batteryMin, 2), fmt(sum?.maxSpeed),
    ]);
    // Linhas de volta
    session.laps.forEach((lap) => {
      rows.push([
        session.fileName, 'Volta', `V${lap.lapNum}`,
        fmt(lap.engineTempMax), fmt(lap.transOilTempMax), fmt(lap.oilPressureMin, 2),
        fmt(lap.transOilPressureWOT, 2), fmt(lap.batteryMin, 2), fmt(lap.maxSpeed),
      ]);
    });
  });

  // Legenda de limites
  const limits = [
    ['Limites ativos:', ''],
    !isNaN(engLimit)        ? ['T. Motor Máx ≤', `${engLimit} °C`]        : null,
    !isNaN(transOilTempMax) ? ['T. Câmbio Máx ≤', `${transOilTempMax} °C`] : null,
    !isNaN(oilLimit)        ? ['P. Óleo Mín ≥', `${oilLimit} bar`]        : null,
    !isNaN(transPresMin)    ? ['P. Câmbio Mín ≥', `${transPresMin} bar`]   : null,
  ].filter(Boolean);

  // Montar HTML
  const cellStyle = 'border:1px solid #999;padding:5px 8px;font-size:12px;';
  const thStyle   = `${cellStyle}background:${COLORS.bgCard};color:#e63946;font-weight:bold;`;
  const tdRowStyle = (type) =>
    type === 'Sessão'
      ? `${cellStyle}background:${COLORS.bgCard};font-weight:bold;color:${COLORS.textPrimary};`
      : `${cellStyle}background:${COLORS.bgCard};color:${COLORS.textSecondary};padding-left:20px;`;

  const thCells  = headerRow.map((h) => `<th style="${thStyle}">${h}</th>`).join('');
  const dataRows = rows.map((r) => {
    const type = r[1];
    return `<tr>${r.map((c, i) => `<td style="${i === 0 ? tdRowStyle(type) : cellStyle}">${c}</td>`).join('')}</tr>`;
  }).join('');

  const limitsRows = limits.map((l) => `<tr><td style="${cellStyle}font-style:italic;color:#888;">${l[0]}</td><td style="${cellStyle}">${l[1]}</td></tr>`).join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"><style>
      body{font-family:Arial,sans-serif;font-size:12px;}
      table{border-collapse:collapse;}
    </style></head>
    <body>
      <h2 style="color:#e63946;font-family:Arial;">ApexDynamics — Multi-Sessão</h2>
      <p style="color:#888;font-size:11px;">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
      <table><thead><tr>${thCells}</tr></thead><tbody>${dataRows}</tbody></table>
      <br/>
      <table><tbody>${limitsRows}</tbody></table>
    </body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `multisessao_${new Date().toISOString().split('T')[0]}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

export default function MultiSessionTab({
  vitalsLimits = {},
  sessions,
  setSessions,
  failedFiles,
  setFailedFiles,
  savedReports = [],
  onSaveReport,
  onDeleteReport,
}) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);
  const [isDragging,    setIsDragging]    = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [reportName,    setReportName]    = useState('');
  const [saveError,     setSaveError]     = useState('');
  const [savedBanner,   setSavedBanner]   = useState(false);
  const [showSaved,     setShowSaved]     = useState(false);
  const [expandedSessions, setExpandedSessions] = useState(new Set());
  const [skipSeconds,      setSkipSeconds]      = useState(0);
  const [skipInput,        setSkipInput]        = useState('');
  const [skipSecondsMap,   setSkipSecondsMap]   = useState({});   // { [sessionId]: number }
  const [skipInputMap,     setSkipInputMap]     = useState({});   // { [sessionId]: string }
  const fileInputRef = useRef(null);

  /* Toggle expandir/recolher sessão */
  const toggleSession = (id) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll   = () => setExpandedSessions(new Set(processedSessions.map((s) => s.id)));
  const collapseAll = () => setExpandedSessions(new Set());

  /* Sessões com estatísticas recomputadas a partir de rawLapsData + skipSeconds.
     O descarte é aplicado apenas na primeira volta de cada arquivo (onde ficam
     os transientes de partida). Voltas seguintes não são afetadas.
     Relatórios salvos (sem rawLapsData) são passados sem alteração. */
  const processedSessions = useMemo(() => {
    const globalSkip = parseFloat(skipSeconds) || 0;
    return sessions.map((s) => {
      if (!s.rawLapsData) return s; // relatório salvo — sem dados brutos

      // Per-file skip tem prioridade; se não definido, usa o global
      const perFileSkip = skipSecondsMap[s.id];
      const skip = perFileSkip != null ? perFileSkip : globalSkip;

      // Ordena voltas por número
      const sorted = [...s.rawLapsData].sort((a, b) => parseFloat(a.lapNum) - parseFloat(b.lapNum));

      const laps = sorted
        .map(({ lapNum, rows }) => {
          const rawSpeeds   = getVals(rows, s.channels.gpsSpeed);
          const rawEngTemps = getVals(rows, s.channels.engineTemp);
          const hasRawData  = rawSpeeds.length > 0 || rawEngTemps.length > 0;

          // Descarte de início: aplica a cada volta individualmente, usando o t0 da própria volta
          let warmupEndTime = null;
          if (skip > 0 && s.channels.time) {
            const lapT0 = rows.reduce((m, r) => {
              const t = r[s.channels.time];
              return (t != null && !isNaN(t) && (m === null || t < m)) ? t : m;
            }, null);
            warmupEndTime = lapT0 !== null ? lapT0 + skip : null;
          }

          return { lapNum, hasRawData, ...computeLapStats(rows, s.channels, warmupEndTime) };
        })
        .filter((l) => l.hasRawData);

      const sessionStats = { ...computeSessionSummary(laps), totalLaps: laps.length };
      return { ...s, laps, sessionStats };
    });
  }, [sessions, skipSeconds, skipSecondsMap]);

  /* Resumos por sessão (memoizado). */
  const sessionSummaries = useMemo(
    () => processedSessions.map((s) => s.sessionStats ?? computeSessionSummary(s.laps)),
    [processedSessions],
  );

  /* Load files — aceita múltiplos formatos via routeFile.
     Coleta TODOS os resultados antes de chamar setSessions uma única vez. */
  const addFiles = (files) => {
    const validFiles = Array.from(files).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      // Aceitar qualquer extensão reconhecida pelo fileRouter
      return ext && (
        ['csv', 'txt', 'tdl', 'ld', 'log', 'xrk', 'drk', 'dlf', 'ftl', 'bin'].includes(ext)
      );
    });
    if (!validFiles.length) return;

    const incomingNames = validFiles.map((f) => f.name);
    setFailedFiles((prev) => (prev || []).filter((n) => !incomingNames.includes(n)));

    const results = new Array(validFiles.length).fill(null);
    const errors  = [];
    let done = 0;

    const finalize = () => {
      const loaded = results.filter(Boolean);
      if (loaded.length) {
        setSessions((prev) => {
          const newNames = new Set(loaded.map((s) => s.fileName));
          const kept = (prev || []).filter((s) => !newNames.has(s.fileName));
          return [...kept, ...loaded];
        });
      }
      if (errors.length) {
        setFailedFiles((prev) => [...new Set([...(prev || []), ...errors])]);
      }
    };

    validFiles.forEach((file, idx) => {
      // Verificar se é formato proprietário antes de tentar parsear
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (isProprietaryFormat(ext)) {
        const info = getFormatInfo(ext);
        errors.push(`${file.name}: ${info?.exportMsg || 'Formato proprietário — exporte como CSV.'}`);
        done += 1;
        if (done === validFiles.length) finalize();
        return;
      }

      routeFile(file)
        .then((parsed) => {
          results[idx] = buildSessionFromParsed(parsed, file.name);
        })
        .catch(() => {
          errors.push(file.name);
        })
        .finally(() => {
          done += 1;
          if (done === validFiles.length) finalize();
        });
    });
  };

  const removeSession  = (id) => setSessions((prev) => (prev || []).filter((s) => s.id !== id));
  const clearAll       = () => { setSessions([]); setFailedFiles([]); };

  /* Save report */
  const handleSave = () => {
    const name = reportName.trim();
    if (!name) { setSaveError('Informe um nome para o relatório.'); return; }
    const result = onSaveReport?.(name, sessions);
    if (result?.error) { setSaveError(result.error); return; }
    setSaveModalOpen(false);
    setReportName('');
    setSaveError('');
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3000);
  };

  /* Load a saved report back into sessions (display-only, no raw rows) */
  const handleLoadReport = (report) => {
    setSessions(report.sessions);
  };

  /* Drag-and-drop */
  const onDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = ()  => setIsDragging(false);
  const onDrop      = (e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  /* ── Global speed stats ─────────────────────────────────────────── */
  const allLapRows = processedSessions.flatMap((s, si) =>
    s.laps.map((l) => ({ ...l, sessionIdx: si, sessionId: s.id, fileName: s.fileName }))
  );

  // Velocidade máx/mín calculada sobre o máximo de CADA SESSÃO (não de cada volta)
  const sessionSpeedRows = sessionSummaries
    .map((sum, si) => ({ maxSpeed: sum?.maxSpeed ?? null, fileName: processedSessions[si].fileName }))
    .filter((r) => r.maxSpeed != null);

  const bestSpeed  = sessionSpeedRows.length ? arrMax(sessionSpeedRows.map((r) => r.maxSpeed)) : null;
  const worstSpeed = sessionSpeedRows.length ? arrMin(sessionSpeedRows.map((r) => r.maxSpeed)) : null;

  const bestSpeedRow  = sessionSpeedRows.find((r) => r.maxSpeed === bestSpeed);
  const worstSpeedRow = sessionSpeedRows.find((r) => r.maxSpeed === worstSpeed);

  /* ── Alerts count per session (recalcula sempre que vitalsLimits mudar) ── */
  const sessionAlertCounts = useMemo(
    () => processedSessions.map((s) =>
      s.laps.reduce((total, lap) => total + Object.keys(getLapAlerts(lap, vitalsLimits)).length, 0)
    ),
    [processedSessions, vitalsLimits],
  );
  const totalAlerts = useMemo(
    () => sessionAlertCounts.reduce((a, b) => a + b, 0),
    [sessionAlertCounts],
  );

  /* ── Limit labels ───────────────────────────────────────────────── */
  const engLimit       = parseFloat(vitalsLimits?.engineTemp?.max);
  const oilLimit       = parseFloat(vitalsLimits?.oilPressure?.min);
  const batLimit       = parseFloat(vitalsLimits?.battery?.min);
  const transOilTempMax = parseFloat(vitalsLimits?.transOilTemp?.max);
  const transOilTempMin = parseFloat(vitalsLimits?.transOilTemp?.min);
  const transPresMax   = parseFloat(vitalsLimits?.transOilPressure?.max);
  const transPresMin   = parseFloat(vitalsLimits?.transOilPressure?.min);

  const activeHintParts = [
    !isNaN(engLimit)       && `T.Motor ≤ ${engLimit}°C`,
    !isNaN(oilLimit)       && `P.Óleo ≥ ${oilLimit} bar`,
    !isNaN(batLimit)       && `Bateria ≥ ${batLimit} V`,
    !isNaN(transOilTempMax)&& `T.Câmbio ≤ ${transOilTempMax}°C`,
    !isNaN(transOilTempMin)&& `T.Câmbio ≥ ${transOilTempMin}°C`,
    !isNaN(transPresMax)   && `P.Câmbio ≤ ${transPresMax} bar`,
    !isNaN(transPresMin)   && `P.Câmbio ≥ ${transPresMin} bar`,
  ].filter(Boolean);

  /* ─────────────────────────────────────────────────────────────────── */

  return (
    <div style={{ padding: 24 }}>

      {/* ── Saved banner ───────────────────────────────────────────── */}
      {savedBanner && (
        <div style={{
          background: '#06d6a015', border: `1px solid ${COLORS.green}44`,
          borderRadius: 8, padding: '10px 16px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: COLORS.green,
        }}>
          ✓ Relatório salvo neste workspace com sucesso!
        </div>
      )}

      {/* ── Drop Zone ──────────────────────────────────────────────── */}
      <div style={{ ...theme.card, background: COLORS.bgCard }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={theme.cardTitle}>📊 Comparativo Multi-Sessão</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {sessions.length > 0 && (
              <>
                <button
                  onClick={() => exportToExcel(processedSessions, sessionSummaries, vitalsLimits)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    background: `${COLORS.cyan}20`, border: `1px solid ${COLORS.cyan}50`,
                    color: COLORS.cyan, cursor: 'pointer',
                  }}
                >
                  📊 Exportar Excel
                </button>
                <button
                  onClick={() => { setSaveModalOpen(true); setSaveError(''); setReportName(''); }}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    background: `${COLORS.green}20`, border: `1px solid ${COLORS.green}50`,
                    color: COLORS.green, cursor: 'pointer',
                  }}
                >
                  💾 Salvar Relatório
                </button>
                <button
                  onClick={clearAll}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    background: `${COLORS.accent}15`, border: `1px solid ${COLORS.accent}40`,
                    color: COLORS.accent, cursor: 'pointer',
                  }}
                >
                  🗑️ Limpar Tudo
                </button>
              </>
            )}
            {savedReports.length > 0 && (
              <button
                onClick={() => setShowSaved((v) => !v)}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: `${COLORS.purple}20`, border: `1px solid ${COLORS.purple}50`,
                  color: COLORS.purple, cursor: 'pointer',
                }}
              >
                📂 Relatórios Salvos ({savedReports.length})
              </button>
            )}
          </div>
        </div>

        <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>
          Carregue múltiplos arquivos de telemetria para comparar vitais, velocidade e pressões por volta em todas as sessões.
        </p>

        {/* Drop area */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? COLORS.accent : COLORS.borderLight}`,
            borderRadius: 8,
            padding: '20px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragging ? `${COLORS.accent}08` : 'transparent',
            transition: 'all 0.2s',
            marginBottom: sessions.length ? 14 : 0,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 600 }}>
            Arraste arquivos de telemetria aqui ou clique para selecionar
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
            CSV, LD, LOG, TDL — múltiplos arquivos e formatos suportados
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_ACCEPT_STRING}
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        {/* Loaded sessions list */}
        {sessions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sessions.map((s, i) => (
              <div key={s.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: `${LAP_COLORS[i % LAP_COLORS.length]}18`,
                border: `1px solid ${LAP_COLORS[i % LAP_COLORS.length]}44`,
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 12,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: LAP_COLORS[i % LAP_COLORS.length],
                  flexShrink: 0,
                }} />
                <span style={{ color: COLORS.textSecondary, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.fileName}
                </span>
                <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
                  ({s.laps.length}V)
                </span>
                {sessionAlertCounts[i] > 0 && (
                  <span style={{
                    background: `${COLORS.accent}22`, color: COLORS.accent,
                    borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700,
                  }}>
                    ⚠ {sessionAlertCounts[i]}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                  title="Remover sessão"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: COLORS.textMuted, fontSize: 14, padding: '0 2px', lineHeight: 1,
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.color = COLORS.accent)}
                  onMouseLeave={(ev) => (ev.currentTarget.style.color = COLORS.textMuted)}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Save modal ─────────────────────────────────────────────── */}
      {saveModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: COLORS.bgCard, borderRadius: 12,
            border: `1px solid ${COLORS.border}`,
            padding: 28, minWidth: 360, maxWidth: 460,
          }}>
            <div style={{ ...theme.cardTitle, marginBottom: 16 }}>💾 Salvar Relatório no Workspace</div>
            <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>
              O relatório será salvo permanentemente neste workspace e poderá ser carregado a qualquer momento.
            </p>
            <input
              autoFocus
              type="text"
              value={reportName}
              onChange={(e) => { setReportName(e.target.value); setSaveError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Ex: Treino livre 1 — Interlagos"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: COLORS.bg, color: COLORS.textPrimary,
                border: `1px solid ${saveError ? COLORS.accent : COLORS.border}`,
                borderRadius: 6, padding: '10px 12px', fontSize: 13, outline: 'none',
                marginBottom: saveError ? 6 : 16,
              }}
            />
            {saveError && (
              <div style={{ fontSize: 12, color: COLORS.accent, marginBottom: 12 }}>{saveError}</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setSaveModalOpen(false); setSaveError(''); }}
                style={{
                  padding: '8px 18px', borderRadius: 6, fontSize: 13,
                  background: 'transparent', border: `1px solid ${COLORS.border}`,
                  color: COLORS.textSecondary, cursor: 'pointer',
                }}
              >Cancelar</button>
              <button
                onClick={handleSave}
                style={{
                  padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                  background: COLORS.green, border: 'none',
                  color: '#000', cursor: 'pointer',
                }}
              >Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Saved reports panel ────────────────────────────────────── */}
      {showSaved && savedReports.length > 0 && (
        <div style={{ ...theme.card, background: COLORS.bgCard }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={theme.cardTitle}>📂 Relatórios Salvos neste Workspace</div>
            <button
              onClick={() => setShowSaved(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 16 }}
            >✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedReports.map((report) => (
              <div key={report.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: COLORS.bg, borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                padding: '10px 14px',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                    {report.name}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                    {new Date(report.savedAt).toLocaleString('pt-BR')} · {report.sessions.length} arquivo{report.sessions.length !== 1 ? 's' : ''} · {report.sessions.reduce((n, s) => n + s.laps.length, 0)} volta{report.sessions.reduce((n, s) => n + s.laps.length, 0) !== 1 ? 's' : ''}
                  </div>
                </div>
                <button
                  onClick={() => { handleLoadReport(report); setShowSaved(false); }}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    background: `${COLORS.cyan}20`, border: `1px solid ${COLORS.cyan}50`,
                    color: COLORS.cyan, cursor: 'pointer',
                  }}
                >
                  Carregar
                </button>
                <button
                  onClick={() => onDeleteReport?.(report.id)}
                  title="Apagar relatório"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: COLORS.textMuted, fontSize: 15, padding: '0 4px',
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.color = COLORS.accent)}
                  onMouseLeave={(ev) => (ev.currentTarget.style.color = COLORS.textMuted)}
                >🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Arquivos que falharam ao carregar ──────────────────────── */}
      {failedFiles.length > 0 && (
        <div style={{
          background: `${COLORS.accent}12`,
          border: `1px solid ${COLORS.accent}33`,
          borderRadius: 8,
          padding: '10px 16px',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: 12,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>❌</span>
          <div>
            <div style={{ color: COLORS.accent, fontWeight: 700, marginBottom: 4 }}>
              {failedFiles.length} arquivo{failedFiles.length > 1 ? 's' : ''} não pôde{failedFiles.length > 1 ? 'ram' : ''} ser carregado{failedFiles.length > 1 ? 's' : ''}:
            </div>
            {failedFiles.map((name) => (
              <div key={name} style={{ color: COLORS.textMuted, fontSize: 11 }}>• {name}</div>
            ))}
            <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 4 }}>
              Verifique se o arquivo é de telemetria válido (CSV, LD, LOG, TDL) com coluna de volta identificável.
            </div>
          </div>
          <button
            onClick={() => setFailedFiles([])}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 14, marginLeft: 'auto', flexShrink: 0 }}
          >✕</button>
        </div>
      )}

      {/* ── Nothing loaded ─────────────────────────────────────────── */}
      {sessions.length === 0 && (
        <div style={{
          ...theme.card,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 40 }}>📊</span>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textSecondary }}>
            Nenhuma sessão carregada
          </div>
          <p style={{ fontSize: 13, color: COLORS.textMuted, maxWidth: 400, margin: 0 }}>
            Carregue dois ou mais arquivos de telemetria (CSV, LD, LOG, TDL) para comparar dados vitais,
            velocidade máxima e pressões entre todas as voltas de todas as sessões.
            {savedReports.length > 0 && (
              <span style={{ display: 'block', marginTop: 8, color: COLORS.purple }}>
                Você tem {savedReports.length} relatório{savedReports.length !== 1 ? 's' : ''} salvo{savedReports.length !== 1 ? 's' : ''} — clique em "Relatórios Salvos" acima para carregar.
              </span>
            )}
          </p>
        </div>
      )}

      {sessions.length > 0 && (
        <>
          {/* ── Speed summary cards ─────────────────────────────────── */}
          {bestSpeed != null && (
            <div style={{ ...theme.grid(2), marginBottom: 16 }}>
              <div style={{
                ...theme.card, marginBottom: 0,
                background: '#06d6a010', border: `1px solid ${COLORS.green}33`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>↑</span>
                  <div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Maior Velocidade Máxima
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: COLORS.green, lineHeight: 1.1 }}>
                      {bestSpeed.toFixed(1)} <span style={{ fontSize: 14, fontWeight: 400 }}>km/h</span>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                      {bestSpeedRow?.fileName}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                ...theme.card, marginBottom: 0,
                background: '#ffd16610', border: `1px solid ${COLORS.yellow}33`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>↓</span>
                  <div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Menor Velocidade Máxima
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: COLORS.yellow, lineHeight: 1.1 }}>
                      {worstSpeed.toFixed(1)} <span style={{ fontSize: 14, fontWeight: 400 }}>km/h</span>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                      {worstSpeedRow?.fileName}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Alerts summary banner ───────────────────────────────── */}
          {totalAlerts > 0 && (
            <div style={{
              background: `${COLORS.accent}12`, border: `1px solid ${COLORS.accent}33`,
              borderRadius: 8, padding: '10px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13, color: COLORS.accent,
            }}>
              <span style={{ fontSize: 18 }}>⚠</span>
              <div>
                <strong>{totalAlerts} violação{totalAlerts !== 1 ? 'ões' : ''} de limites vitais</strong>
                {' '}detectada{totalAlerts !== 1 ? 's' : ''} — células em vermelho indicam cada ocorrência.
                {activeHintParts.length > 0 && (
                  <span style={{ color: COLORS.textMuted, fontSize: 11, marginLeft: 8 }}>
                    Limites ativos: {activeHintParts.join(' · ')}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Comparison table ────────────────────────────────────── */}
          <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '14px 16px 10px',
              borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{
                fontSize: 11, color: COLORS.textMuted,
                textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600,
              }}>
                Resumo por Sessão — {processedSessions.length} Sessão{processedSessions.length !== 1 ? 'ões' : ''} · {allLapRows.length} Volta{allLapRows.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Campo para descartar início da sessão */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>Descartar início:</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={skipInput}
                    onChange={(e) => setSkipInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSkipSeconds(Math.max(0, parseFloat(skipInput) || 0));
                    }}
                    style={{
                      width: 52, textAlign: 'center',
                      background: COLORS.bg, color: COLORS.textPrimary,
                      border: `1px solid ${skipSeconds > 0 ? COLORS.yellow : COLORS.border}`,
                      borderRadius: 4, padding: '2px 6px', fontSize: 11, outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>s</span>
                  <button
                    onClick={() => setSkipSeconds(Math.max(0, parseFloat(skipInput) || 0))}
                    style={{
                      background: `${COLORS.accent}20`, border: `1px solid ${COLORS.accent}50`,
                      borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700,
                      color: COLORS.accent, cursor: 'pointer',
                    }}
                  >
                    Aplicar
                  </button>
                  {skipSeconds > 0 && (
                    <>
                      <span style={{
                        background: `${COLORS.yellow}22`, border: `1px solid ${COLORS.yellow}55`,
                        borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 700,
                        color: COLORS.yellow,
                      }}>
                        ✂ {skipSeconds}s descartados
                      </span>
                      <button
                        onClick={() => { setSkipSeconds(0); setSkipInput(''); }}
                        title="Remover filtro de início"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: COLORS.textMuted, fontSize: 13, padding: '0 2px', lineHeight: 1,
                        }}
                        onMouseEnter={(ev) => (ev.currentTarget.style.color = COLORS.accent)}
                        onMouseLeave={(ev) => (ev.currentTarget.style.color = COLORS.textMuted)}
                      >✕</button>
                    </>
                  )}
                </div>
                <div style={{ width: 1, height: 16, background: COLORS.border }} />
                <button
                  onClick={expandAll}
                  style={{
                    background: 'transparent', border: `1px solid ${COLORS.border}`,
                    borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600,
                    color: COLORS.textMuted, cursor: 'pointer',
                  }}
                >
                  Expandir Todas
                </button>
                <button
                  onClick={collapseAll}
                  style={{
                    background: 'transparent', border: `1px solid ${COLORS.border}`,
                    borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 600,
                    color: COLORS.textMuted, cursor: 'pointer',
                  }}
                >
                  Recolher Todas
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: `${COLORS.bg}cc` }}>
                    <ColHeader COLORS={COLORS}>Sessão</ColHeader>
                    <ColHeader COLORS={COLORS} sub="individual">
                      Descarte<br /><span style={{ fontSize: 9, fontWeight: 400 }}>s</span>
                    </ColHeader>
                    <ColHeader COLORS={COLORS}>Voltas</ColHeader>
                    <ColHeader COLORS={COLORS} sub={!isNaN(engLimit) ? `lim ≤ ${engLimit}°C` : null}>
                      T. Motor Máx<br /><span style={{ fontSize: 9, fontWeight: 400 }}>°C</span>
                    </ColHeader>
                    <ColHeader COLORS={COLORS} sub={(!isNaN(transOilTempMax) || !isNaN(transOilTempMin)) ? `lim ${!isNaN(transOilTempMin) ? `≥${transOilTempMin}` : ''} ${!isNaN(transOilTempMax) ? `≤${transOilTempMax}` : ''}°C`.trim() : null}>
                      T. Óleo Câmbio Máx<br /><span style={{ fontSize: 9, fontWeight: 400 }}>°C</span>
                    </ColHeader>
                    <ColHeader COLORS={COLORS} sub={!isNaN(oilLimit) ? `lim ≥ ${oilLimit} bar` : null}>
                      P. Óleo Mín<br /><span style={{ fontSize: 9, fontWeight: 400 }}>bar</span>
                    </ColHeader>
                    <ColHeader COLORS={COLORS} sub={(!isNaN(transPresMax) || !isNaN(transPresMin)) ? `WOT · lim ${!isNaN(transPresMin) ? `≥${transPresMin}` : ''} ${!isNaN(transPresMax) ? `≤${transPresMax}` : ''}`.trim() : null}>
                      P. Óleo Câmbio<br /><span style={{ fontSize: 9, fontWeight: 400 }}>WOT · bar</span>
                    </ColHeader>
                    <ColHeader COLORS={COLORS} sub={!isNaN(batLimit) ? `lim ≥ ${batLimit} V` : null}>
                      Bateria Mín<br /><span style={{ fontSize: 9, fontWeight: 400 }}>V</span>
                    </ColHeader>
                    <ColHeader COLORS={COLORS}>
                      Vel. Máx<br /><span style={{ fontSize: 9, fontWeight: 400 }}>km/h</span>
                    </ColHeader>
                  </tr>
                </thead>
                <tbody>
                  {processedSessions.map((session, si) => {
                    const color = LAP_COLORS[si % LAP_COLORS.length];
                    const summary = sessionSummaries[si];
                    const isExpanded = expandedSessions.has(session.id);
                    const summaryAlerts = summary ? getLapAlerts(summary, vitalsLimits) : {};
                    const alertCount = sessionAlertCounts[si];
                    const isBestV  = summary?.maxSpeed != null && summary.maxSpeed === bestSpeed;
                    const isWorstV = summary?.maxSpeed != null && summary.maxSpeed === worstSpeed && bestSpeed !== worstSpeed;

                    const rows = [];

                    /* ── Linha de resumo da sessão (sempre visível) ── */
                    rows.push(
                      <tr
                        key={`summary-${session.id}`}
                        onClick={() => toggleSession(session.id)}
                        style={{
                          background: `${color}08`,
                          borderBottom: `1px solid ${COLORS.border}44`,
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(ev) => (ev.currentTarget.style.background = `${color}14`)}
                        onMouseLeave={(ev) => (ev.currentTarget.style.background = `${color}08`)}
                      >
                        <td style={{
                          padding: '10px 12px',
                          borderLeft: `3px solid ${color}`,
                          minWidth: 160,
                          maxWidth: 220,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              fontSize: 11, color: COLORS.textMuted,
                              transition: 'transform 0.2s',
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              flexShrink: 0, width: 14, textAlign: 'center',
                            }}>
                              {'▶'}
                            </span>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: color, flexShrink: 0,
                            }} />
                            <span style={{
                              color: COLORS.textPrimary, fontSize: 12, fontWeight: 700,
                              wordBreak: 'break-all', lineHeight: 1.3,
                            }}>
                              {session.fileName}
                            </span>
                            {alertCount > 0 && (
                              <span style={{
                                background: `${COLORS.accent}22`, color: COLORS.accent,
                                borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
                                flexShrink: 0,
                              }}>
                                ⚠ {alertCount}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Per-file skip input */}
                        <td
                          style={{
                            padding: '5px 8px', textAlign: 'center',
                            borderBottom: `1px solid ${COLORS.border}11`,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder={skipSeconds > 0 ? String(skipSeconds) : '0'}
                              value={skipInputMap[session.id] ?? ''}
                              onChange={(e) => setSkipInputMap((prev) => ({ ...prev, [session.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const val = parseFloat(skipInputMap[session.id]) || 0;
                                  setSkipSecondsMap((prev) => {
                                    const next = { ...prev };
                                    if (val > 0) next[session.id] = val;
                                    else delete next[session.id];
                                    return next;
                                  });
                                }
                              }}
                              onBlur={() => {
                                const val = parseFloat(skipInputMap[session.id]) || 0;
                                setSkipSecondsMap((prev) => {
                                  const next = { ...prev };
                                  if (val > 0) next[session.id] = val;
                                  else delete next[session.id];
                                  return next;
                                });
                              }}
                              title="Descartar início individual (segundos) — sobrepõe o valor global"
                              style={{
                                width: 44, textAlign: 'center',
                                background: COLORS.bg, color: COLORS.textPrimary,
                                border: `1px solid ${skipSecondsMap[session.id] != null && skipSecondsMap[session.id] > 0 ? COLORS.yellow : COLORS.border}`,
                                borderRadius: 4, padding: '3px 4px', fontSize: 11, outline: 'none',
                              }}
                            />
                            {skipSecondsMap[session.id] != null && skipSecondsMap[session.id] > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSkipSecondsMap((prev) => { const next = { ...prev }; delete next[session.id]; return next; });
                                  setSkipInputMap((prev) => { const next = { ...prev }; delete next[session.id]; return next; });
                                }}
                                title="Remover descarte individual"
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: COLORS.yellow, fontSize: 11, padding: '0 2px', lineHeight: 1, fontWeight: 700,
                                }}
                              >✕</button>
                            )}
                          </div>
                        </td>

                        <td style={{
                          padding: '7px 10px', textAlign: 'center',
                          color: COLORS.textSecondary, fontSize: 12, fontWeight: 700,
                          borderBottom: `1px solid ${COLORS.border}11`,
                        }}>
                          {summary?.totalLaps ?? 0}
                        </td>

                        <ValueCell COLORS={COLORS} value={summary?.engineTempMax} unit="°" alert={!!summaryAlerts.engineTempMax} />
                        <ValueCell COLORS={COLORS}
                          value={summary?.transOilTempMax} unit="°"
                          alert={!!(summaryAlerts.transOilTempMax || summaryAlerts.transOilTempMin)}
                        />
                        <ValueCell COLORS={COLORS} value={summary?.oilPressureMin} unit=" bar" decimals={2} alert={!!summaryAlerts.oilPressureMin} />
                        <ValueCell COLORS={COLORS}
                          value={summary?.transOilPressureWOT} unit=" bar" decimals={2}
                          alert={!!(summaryAlerts.transOilPressureMin || summaryAlerts.transOilPressureMax)}
                        />
                        <ValueCell COLORS={COLORS} value={summary?.batteryMin} unit=" V" decimals={2} alert={!!summaryAlerts.batteryMin} />
                        <ValueCell COLORS={COLORS} value={summary?.maxSpeed} unit=" km/h" isBest={isBestV} isWorst={isWorstV} />
                      </tr>
                    );

                    /* ── Linhas detalhadas por volta (visíveis apenas se expandido) ── */
                    if (isExpanded) {
                      session.laps.forEach((lap, li) => {
                        const alerts   = getLapAlerts(lap, vitalsLimits);
                        const lapBestV  = lap.maxSpeed != null && lap.maxSpeed === bestSpeed;
                        const lapWorstV = lap.maxSpeed != null && lap.maxSpeed === worstSpeed && bestSpeed !== worstSpeed;

                        rows.push(
                          <tr
                            key={`${session.id}-${lap.lapNum}`}
                            style={{
                              background: li % 2 === 0 ? `${COLORS.bg}88` : `${COLORS.bgCard}44`,
                            }}
                          >
                            <td style={{
                              padding: '5px 12px 5px 40px',
                              fontSize: 11, color: COLORS.textMuted,
                              borderLeft: `3px solid ${color}44`,
                              borderBottom: li === session.laps.length - 1
                                ? `2px solid ${color}33`
                                : `1px solid ${COLORS.border}11`,
                            }}>
                              <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
                                Volta {lap.lapNum}
                              </span>
                            </td>

                            <td style={{
                              padding: '5px 8px', textAlign: 'center',
                              borderBottom: `1px solid ${COLORS.border}11`,
                            }} />

                            <td style={{
                              padding: '5px 10px', textAlign: 'center',
                              color: COLORS.textMuted, fontSize: 11,
                              borderBottom: `1px solid ${COLORS.border}11`,
                            }}>—</td>

                            <ValueCell COLORS={COLORS} value={lap.engineTempMax} unit="°" alert={!!alerts.engineTempMax} />
                            <ValueCell COLORS={COLORS}
                              value={lap.transOilTempMax} unit="°"
                              alert={!!(alerts.transOilTempMax || alerts.transOilTempMin)}
                            />
                            <ValueCell COLORS={COLORS} value={lap.oilPressureMin} unit=" bar" decimals={2} alert={!!alerts.oilPressureMin} />
                            <ValueCell COLORS={COLORS}
                              value={lap.transOilPressureWOT} unit=" bar" decimals={2}
                              alert={!!(alerts.transOilPressureMin || alerts.transOilPressureMax)}
                            />
                            <ValueCell COLORS={COLORS} value={lap.batteryMin} unit=" V" decimals={2} alert={!!alerts.batteryMin} />
                            <ValueCell COLORS={COLORS} value={lap.maxSpeed} unit=" km/h" isBest={lapBestV} isWorst={lapWorstV} />
                          </tr>
                        );
                      });
                    }

                    return rows;
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div style={{
              padding: '10px 16px', borderTop: `1px solid ${COLORS.border}`,
              display: 'flex', gap: 20, flexWrap: 'wrap',
            }}>
              {[
                { color: COLORS.accent, bg: `${COLORS.accent}18`, label: '⚠ Limite vital ultrapassado' },
                { color: COLORS.green,  bg: '#06d6a018', label: '↑ Maior vel. máxima' },
                { color: COLORS.yellow, bg: '#ffd16618', label: '↓ Menor vel. máxima' },
                { color: COLORS.textMuted, bg: 'transparent', label: '— Canal não disponível' },
                { color: COLORS.textSecondary, bg: `${COLORS.accent}08`, label: '▶ Clique na sessão para expandir voltas' },
              ].map(({ color, bg, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textMuted }}>
                  <span style={{ display: 'inline-block', width: 28, height: 14, background: bg, border: `1px solid ${color}44`, borderRadius: 3 }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <PrintFooter />
    </div>
  );
}
