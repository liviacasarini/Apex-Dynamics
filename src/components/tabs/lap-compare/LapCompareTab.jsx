import { useState, useMemo, useRef, useCallback } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useColors } from '@/context/ThemeContext';
import { CHART_METRICS } from '@/constants/channels';
import { ChartCard, CustomTooltip, PrintFooter } from '@/components/common';
import { makeTheme } from '@/styles/theme';
import { formatLapTime } from '@/utils/formatTime';
import { FILE_ACCEPT_STRING } from '@/core/fileRouter';
import { loadCSV } from '@/storage/sessionStore';

/** Cores de alta distinção visual para voltas selecionadas (pela ordem de seleção). */
const COMPARE_COLORS = [
  '#e63946', // vermelho
  '#118ab2', // azul
  '#8338ec', // roxo
  '#06d6a0', // verde
  '#f77f00', // laranja
  '#00b4d8', // ciano
  '#ef476f', // rosa
  '#ffd166', // amarelo
  '#2d6a4f', // verde escuro
  '#e9c46a', // dourado
];

/**
 * Abrevia o nome do arquivo para uso nos chips/labels.
 * Ex: "session_2024_06_15.csv" → "sess…15"
 */
function shortName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, ''); // remove extensão
  return base.length > 12 ? base.slice(0, 8) + '…' : base;
}

export default function LapCompareTab({
  data, channels, lapsAnalysis,
  extraSessions = [],
  addExtraSession,
  addExtraSessionFromText,
  addExtraSessionFromLapData,
  removeExtraSession,
  profiles = [],
  activeProfile,
}) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);
  const extraFileRef = useRef();
  const [extraLoading, setExtraLoading] = useState(false);
  const [extraError,   setExtraError]   = useState(null);

  // ── Construir lista unificada de todas as voltas de todas as sessões ──
  // Cada item: { id, session, lapNum, fileName, channels, laps, lapsAnalysis }
  const allLapItems = useMemo(() => {
    const items = [];

    // Sessão principal
    const mainLaps = Object.keys(data.laps)
      .filter((n) => lapsAnalysis[n]?.lapTime > 5)
      .sort((a, b) => Number(a) - Number(b));

    mainLaps.forEach((n) => {
      items.push({
        id: `main:${n}`,
        session: 'main',
        lapNum: n,
        fileName: data.fileName || 'Principal',
        channels,
        laps: data.laps,
        lapsAnalysis,
      });
    });

    // Sessões extras
    extraSessions.forEach((sess) => {
      const sessLaps = Object.keys(sess.data.laps)
        .filter((n) => sess.lapsAnalysis[n]?.lapTime > 5)
        .sort((a, b) => Number(a) - Number(b));

      sessLaps.forEach((n) => {
        items.push({
          id: `${sess.sessionId}:${n}`,
          session: sess.sessionId,
          lapNum: n,
          fileName: sess.fileName,
          channels: sess.channels,
          laps: sess.data.laps,
          lapsAnalysis: sess.lapsAnalysis,
        });
      });
    });

    return items;
  }, [data, channels, lapsAnalysis, extraSessions]);

  // ── Estado de seleção ──
  const [selected, setSelected] = useState(() => {
    const first = allLapItems.slice(0, 2).map((i) => i.id);
    return first;
  });
  const [metricKeys, setMetricKeys] = useState(['gpsSpeed']);

  // ── Mapa de cores por ordem de seleção ──
  // A 1ª volta selecionada = vermelho, 2ª = azul, 3ª = roxo, etc.
  const selectionColorMap = useMemo(() => {
    const map = {};
    selected.forEach((id, i) => {
      map[id] = COMPARE_COLORS[i % COMPARE_COLORS.length];
    });
    return map;
  }, [selected]);

  // Métricas disponíveis (union de todas as sessões)
  const availableMetrics = useMemo(() => {
    const allChannels = { ...channels };
    extraSessions.forEach((s) => Object.assign(allChannels, s.channels));
    return CHART_METRICS.filter((m) => allChannels[m.key]);
  }, [channels, extraSessions]);

  const toggleLap = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleMetric = (key) => {
    setMetricKeys((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      }
      if (prev.length >= 2) return [prev[0], key];
      return [...prev, key];
    });
  };

  // Itens selecionados — cada um recebe a cor baseada na posição de seleção
  const selectedItems = useMemo(
    () => selected.map((id, i) => {
      const item = allLapItems.find((it) => it.id === id);
      return item ? { ...item, color: COMPARE_COLORS[i % COMPARE_COLORS.length] } : null;
    }).filter(Boolean),
    [selected, allLapItems]
  );

  // ── Dados do gráfico overlay (eixo X = tempo real em segundos) ──
  // A volta mais longa define a largura total do gráfico.
  // Voltas mais curtas terminam antes — suas linhas simplesmente param.
  const CHART_PTS = 500;
  const chartData = useMemo(() => {
    if (!selectedItems.length) return [];

    // Calcula duração real de cada volta e tempo acumulado por amostra
    const lapInfos = selectedItems.map((it) => {
      const rows = it.laps[it.lapNum] || [];
      if (!rows.length) return { rows, cumTime: null, duration: 0 };
      const tc = it.channels.time;

      if (tc && rows.length > 1) {
        const cumTime = new Float64Array(rows.length);
        for (let i = 1; i < rows.length; i++) {
          cumTime[i] = cumTime[i - 1] + Math.abs((rows[i][tc] - rows[i - 1][tc]) || 0);
        }
        return { rows, cumTime, duration: cumTime[cumTime.length - 1] };
      }

      // Fallback: usa lapTime do analysis, distribui uniformemente
      const lapTime = it.lapsAnalysis[it.lapNum]?.lapTime || rows.length * 0.1;
      const cumTime = new Float64Array(rows.length);
      for (let i = 0; i < rows.length; i++) {
        cumTime[i] = (i / (rows.length - 1)) * lapTime;
      }
      return { rows, cumTime, duration: lapTime };
    });

    // Eixo X vai de 0 até a duração da volta mais longa
    const maxDuration = Math.max(...lapInfos.map((l) => l.duration));
    if (maxDuration <= 0) return [];

    const points = [];
    for (let pi = 0; pi < CHART_PTS; pi++) {
      const targetTime = (pi / (CHART_PTS - 1)) * maxDuration;
      const point = { pct: parseFloat(targetTime.toFixed(1)) };

      selectedItems.forEach((it, idx) => {
        const { rows, cumTime, duration } = lapInfos[idx];
        // Se o tempo alvo excede a duração desta volta, não plota (null)
        if (targetTime > duration) return;

        // Busca binária pelo ponto nesse tempo
        let lo = 0, hi = cumTime.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (cumTime[mid] <= targetTime) lo = mid;
          else hi = mid;
        }
        const row = rows[lo];
        if (row) {
          metricKeys.forEach((mk) => {
            if (it.channels[mk]) {
              point[`${it.id}_${mk}`] = row[it.channels[mk]] ?? null;
            }
          });
        }
      });
      points.push(point);
    }
    return points;
  }, [selectedItems, metricKeys]);

  // ── Delta de tempo entre 2 voltas (normalizado por distância quando possível) ──
  const DELTA_PTS = 400;
  const deltaData = useMemo(() => {
    if (selectedItems.length !== 2) return [];
    const [a, b] = selectedItems;
    const lapA   = a.laps[a.lapNum] || [];
    const lapB   = b.laps[b.lapNum] || [];
    if (!lapA.length || !lapB.length) return [];

    const tcA = a.channels.time, scA = a.channels.gpsSpeed;
    const tcB = b.channels.time, scB = b.channels.gpsSpeed;
    const canDist = tcA && scA && tcB && scB;

    if (canDist) {
      // Distância acumulada para cada volta
      const distA = new Float64Array(lapA.length);
      for (let i = 1; i < lapA.length; i++) {
        const dt = Math.abs((lapA[i][tcA] - lapA[i-1][tcA]) || 0);
        const avg = ((lapA[i][scA] || 0) + (lapA[i-1][scA] || 0)) / 2;
        distA[i] = distA[i-1] + (avg / 3.6) * dt;
      }
      const distB = new Float64Array(lapB.length);
      for (let i = 1; i < lapB.length; i++) {
        const dt = Math.abs((lapB[i][tcB] - lapB[i-1][tcB]) || 0);
        const avg = ((lapB[i][scB] || 0) + (lapB[i-1][scB] || 0)) / 2;
        distB[i] = distB[i-1] + (avg / 3.6) * dt;
      }
      const commonMax = Math.min(distA[distA.length-1], distB[distB.length-1]);
      if (commonMax <= 0) return [];

      // Tempo acumulado em cada ponto de distância
      const points = [];
      let loA = 0, loB = 0;
      for (let pi = 0; pi < DELTA_PTS; pi++) {
        const targetDist = (pi / (DELTA_PTS - 1)) * commonMax;
        while (loA < distA.length - 2 && distA[loA+1] <= targetDist) loA++;
        while (loB < distB.length - 2 && distB[loB+1] <= targetDist) loB++;
        const timeA = lapA[loA][tcA] - lapA[0][tcA];
        const timeB = lapB[loB][tcB] - lapB[0][tcB];
        points.push({ pct: pi, delta: parseFloat((timeA - timeB).toFixed(3)) });
      }
      return points;
    }

    // Fallback: índice percentual
    const dtA = (a.lapsAnalysis[a.lapNum]?.lapTime || lapA.length * 0.1) / DELTA_PTS;
    const dtB = (b.lapsAnalysis[b.lapNum]?.lapTime || lapB.length * 0.1) / DELTA_PTS;
    const points = [];
    let cumDelta = 0;
    for (let pi = 0; pi < DELTA_PTS; pi++) {
      const riA = Math.round((pi / (DELTA_PTS - 1)) * (lapA.length - 1));
      const riB = Math.round((pi / (DELTA_PTS - 1)) * (lapB.length - 1));
      const sA  = scA ? (lapA[riA]?.[scA] || 0) : 0;
      const sB  = scB ? (lapB[riB]?.[scB] || 0) : 0;
      if (sA > 0 && sB > 0) {
        cumDelta += dtA - dtB * (sA / sB);
      }
      points.push({ pct: pi, delta: parseFloat(cumDelta.toFixed(3)) });
    }
    return points;
  }, [selectedItems]);

  // ── Tabela de comparação ──
  const tableMetrics = [
    { label: 'Tempo',             key: 'lapTime',         fmt: (v) => formatLapTime(v) },
    { label: 'Vel. Máx (km/h)',   key: 'maxSpeed',        fmt: (v) => v.toFixed(1)    },
    { label: 'Vel. Média (km/h)', key: 'avgSpeed',        fmt: (v) => v.toFixed(1)    },
    { label: 'RPM Máx',           key: 'maxRPM',          fmt: (v) => v.toFixed(0)    },
    { label: 'Aceleração Total',  key: 'fullThrottlePct', fmt: (v) => v.toFixed(1) + '%' },
    { label: 'Coasting',          key: 'coastPct',        fmt: (v) => v.toFixed(1) + '%' },
  ];

  // ── Domínio Y dinâmico baseado nos dados reais de cada métrica ──
  const yDomains = useMemo(() => {
    if (!chartData.length || !selectedItems.length) return {};
    const domains = {};
    metricKeys.forEach((mk, mi) => {
      let min = Infinity, max = -Infinity;
      selectedItems.forEach((it) => {
        const key = `${it.id}_${mk}`;
        for (const pt of chartData) {
          const v = pt[key];
          if (v != null && isFinite(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
      });
      if (min === Infinity) { min = 0; max = 100; }
      const range = max - min || 1;
      const pad = range * 0.05;
      domains[`y${mi}`] = [
        parseFloat((min - pad).toFixed(4)),
        parseFloat((max + pad).toFixed(4)),
      ];
    });
    return domains;
  }, [chartData, selectedItems, metricKeys]);

  const metric1 = availableMetrics.find((m) => m.key === metricKeys[0]);
  const metric2 = metricKeys[1] ? availableMetrics.find((m) => m.key === metricKeys[1]) : null;
  const chartTitle = metric2
    ? `Comparação: ${metric1?.label}  +  ${metric2?.label}`
    : `Comparação: ${metric1?.label}`;

  // ── Carregar arquivo extra ──
  const handleExtraFile = useCallback(async (file) => {
    if (!file || !addExtraSession) return;
    setExtraLoading(true);
    setExtraError(null);
    try {
      await addExtraSession(file);
    } catch (err) {
      setExtraError(err.message || 'Erro ao processar arquivo');
    } finally {
      setExtraLoading(false);
    }
  }, [addExtraSession]);

  const [showSavedPicker, setShowSavedPicker] = useState(false);

  // Sessões e voltas salvas de TODOS os perfis (agrupados por perfil)
  const profilesWithData = useMemo(() => {
    return profiles
      .map((p) => ({
        id: p.id,
        name: p.name,
        sessions: p.sessions || [],
        savedLaps: p.savedLaps || [],
      }))
      .filter((p) => p.sessions.length > 0 || p.savedLaps.length > 0);
  }, [profiles]);

  const hasSavedData = profilesWithData.length > 0;

  const handleLoadSavedSession = useCallback(async (session) => {
    if (!addExtraSessionFromText) return;
    setExtraLoading(true);
    setExtraError(null);
    try {
      const result = await loadCSV(session.csvId);
      if (!result) throw new Error('Dados não encontrados no armazenamento local.');
      addExtraSessionFromText(result.csvText, session.name || session.fileName);
      setShowSavedPicker(false);
    } catch (err) {
      setExtraError(err.message || 'Erro ao carregar sessão salva');
    } finally {
      setExtraLoading(false);
    }
  }, [addExtraSessionFromText]);

  const handleLoadSavedLap = useCallback(async (lap) => {
    if (!addExtraSessionFromLapData) return;
    setExtraLoading(true);
    setExtraError(null);
    try {
      const result = await loadCSV(lap.lapDataId);
      if (!result) throw new Error('Dados não encontrados no armazenamento local.');
      const { lapRows, headers, channels: savedChannels } = JSON.parse(result.csvText);
      addExtraSessionFromLapData({
        lapRows,
        headers,
        channels: savedChannels,
        lapNumber: lap.lapNumber,
        fileName: `${lap.name || lap.fileName} — V${lap.lapNumber}`,
      });
      setShowSavedPicker(false);
    } catch (err) {
      setExtraError(err.message || 'Erro ao carregar volta salva');
    } finally {
      setExtraLoading(false);
    }
  }, [addExtraSessionFromLapData]);

  const hasExtra = extraSessions.length > 0;
  const mainFileName = shortName(data.fileName || 'Principal');

  return (
    <div style={{ padding: 24 }}>

      {/* ── Painel de sessões ── */}
      <div style={{ ...theme.card, background: COLORS.bgCard }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={theme.cardTitle}>Sessões Carregadas</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {hasSavedData && (
              <button
                onClick={() => setShowSavedPicker((v) => !v)}
                disabled={extraLoading}
                style={{
                  padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: COLORS.green, color: '#fff', border: 'none',
                  cursor: extraLoading ? 'wait' : 'pointer', opacity: extraLoading ? 0.7 : 1,
                }}
              >
                {showSavedPicker ? 'Fechar' : 'Carregar Salvo'}
              </button>
            )}
            <button
              onClick={() => extraFileRef.current?.click()}
              disabled={extraLoading}
              style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: COLORS.purple, color: '#fff', border: 'none',
                cursor: extraLoading ? 'wait' : 'pointer', opacity: extraLoading ? 0.7 : 1,
              }}
            >
              {extraLoading ? 'Carregando...' : '+ Adicionar Arquivo'}
            </button>
            <input
              ref={extraFileRef}
              type="file"
              accept={FILE_ACCEPT_STRING}
              style={{ display: 'none' }}
              onClick={(e) => { e.target.value = ''; }}
              onChange={(e) => handleExtraFile(e.target.files[0])}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          {/* Badge sessão principal */}
          <div style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: `${COLORS.green}20`, border: `1px solid ${COLORS.green}60`,
            color: COLORS.green,
          }}>
            🟢 {mainFileName} (principal)
          </div>
          {extraSessions.map((sess) => (
            <div key={sess.sessionId} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: `${COLORS.purple}20`, border: `1px solid ${COLORS.purple}60`,
              color: COLORS.purple, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              🟣 {shortName(sess.fileName)}
              <span
                onClick={() => removeExtraSession?.(sess.sessionId)}
                title="Remover sessão"
                style={{ cursor: 'pointer', opacity: 0.6, fontSize: 14 }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.6)}
              >
                ✕
              </span>
            </div>
          ))}
        </div>

        {extraError && (
          <div style={{ padding: '8px 12px', borderRadius: 6, background: `${COLORS.accent}15`, color: COLORS.accent, fontSize: 12, marginTop: 8 }}>
            {extraError}
          </div>
        )}

        {/* Picker de sessões/voltas salvas — todos os perfis */}
        {showSavedPicker && (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: `${COLORS.bgCard}`, border: `1px solid ${COLORS.border}`, maxHeight: 340, overflowY: 'auto' }}>
            {profilesWithData.map((prof, idx) => (
              <div key={prof.id} style={{ marginBottom: idx < profilesWithData.length - 1 ? 14 : 0 }}>
                {/* Nome do perfil */}
                <div style={{
                  fontSize: 12, fontWeight: 800, color: COLORS.text, marginBottom: 8,
                  paddingBottom: 4, borderBottom: `1px solid ${COLORS.border}`,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ fontSize: 10, color: COLORS.textMuted }}>👤</span>
                  {prof.name}
                  {prof.id === activeProfile?.id && (
                    <span style={{ fontSize: 9, color: COLORS.green, fontWeight: 600, background: `${COLORS.green}15`, padding: '1px 6px', borderRadius: 4 }}>ativo</span>
                  )}
                </div>

                {/* Sessões deste perfil */}
                {prof.sessions.length > 0 && (
                  <div style={{ marginBottom: prof.savedLaps.length > 0 ? 8 : 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.green, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sessões Salvas</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {prof.sessions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleLoadSavedSession(s)}
                          disabled={extraLoading}
                          title={`${s.name} — ${s.fileName}`}
                          style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: `${COLORS.green}18`, border: `1px solid ${COLORS.green}40`,
                            color: COLORS.text, cursor: extraLoading ? 'wait' : 'pointer',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = `${COLORS.green}35`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = `${COLORS.green}18`; }}
                        >
                          {s.name} ({shortName(s.fileName)})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Voltas salvas deste perfil */}
                {prof.savedLaps.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.purple, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Voltas Salvas</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {prof.savedLaps.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => handleLoadSavedLap(l)}
                          disabled={extraLoading}
                          title={`${l.name} — Volta ${l.lapNumber} de ${l.fileName}`}
                          style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: `${COLORS.purple}18`, border: `1px solid ${COLORS.purple}40`,
                            color: COLORS.text, cursor: extraLoading ? 'wait' : 'pointer',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = `${COLORS.purple}35`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = `${COLORS.purple}18`; }}
                        >
                          {l.name} (V{l.lapNumber})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {profilesWithData.length === 0 && (
              <div style={{ fontSize: 11, color: COLORS.textMuted, textAlign: 'center', padding: 12 }}>
                Nenhuma sessão ou volta salva nos perfis. Salve dados na aba Overview primeiro.
              </div>
            )}
          </div>
        )}

        {!hasExtra && !showSavedPicker && (
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
            Clique em "+ Adicionar Arquivo"{hasSavedData ? ' ou "Carregar Salvo"' : ''} para comparar voltas de sessões diferentes
          </div>
        )}
      </div>

      {/* ── Seletor de voltas (todas as sessões) ── */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>Selecione Voltas para Comparar</div>

        {/* Sessão principal */}
        <div style={{ marginBottom: hasExtra ? 12 : 0 }}>
          {hasExtra && (
            <div style={{ fontSize: 11, color: COLORS.green, fontWeight: 700, marginBottom: 6 }}>
              📁 {mainFileName}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {allLapItems
              .filter((it) => it.session === 'main')
              .map((it) => {
                const isActive = selected.includes(it.id);
                const chipColor = selectionColorMap[it.id] || COLORS.textMuted;
                return (
                  <div
                    key={it.id}
                    onClick={() => toggleLap(it.id)}
                    style={theme.lapChip(isActive, chipColor)}
                  >
                    V{it.lapNum} — {formatLapTime(it.lapsAnalysis[it.lapNum]?.lapTime)}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Voltas de sessões extras */}
        {extraSessions.map((sess) => (
          <div key={sess.sessionId} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: COLORS.purple, fontWeight: 700, marginBottom: 6 }}>
              📁 {shortName(sess.fileName)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {allLapItems
                .filter((it) => it.session === sess.sessionId)
                .map((it) => {
                  const isActive = selected.includes(it.id);
                  const chipColor = selectionColorMap[it.id] || COLORS.textMuted;
                  return (
                    <div
                      key={it.id}
                      onClick={() => toggleLap(it.id)}
                      style={theme.lapChip(isActive, chipColor)}
                    >
                      V{it.lapNum} — {formatLapTime(it.lapsAnalysis[it.lapNum]?.lapTime)}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Seleção de métricas (até 2) ── */}
      <div style={{ ...theme.card, paddingBottom: 14 }}>
        <div style={theme.cardTitle}>Métricas (selecione até 2)</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {availableMetrics.map((m) => {
            const isActive = metricKeys.includes(m.key);
            const isSecond = metricKeys.indexOf(m.key) === 1;
            return (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                style={{
                  ...theme.pillButton(isActive),
                  borderStyle: isSecond ? 'dashed' : 'solid',
                }}
              >
                {m.label}
                {isActive && (
                  <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>
                    {isSecond ? '(eixo dir.)' : '(eixo esq.)'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {metric2 && (
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>
            — linha sólida = {metric1?.label} &nbsp;|&nbsp; - - linha tracejada = {metric2?.label}
          </div>
        )}
      </div>

      {/* ── Gráfico overlay ── */}
      {selectedItems.length > 0 && (
        <ChartCard title={chartTitle} height={340}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <defs>
                {selectedItems.map((it, idx) => (
                  <filter key={`glow-${idx}`} id={`glow-${idx}`} x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={it.color} floodOpacity="0.5" />
                  </filter>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis
                dataKey="pct"
                tick={{ fill: COLORS.textMuted, fontSize: 9 }}
                tickFormatter={(v) => {
                  const m = Math.floor(v / 60);
                  const s = Math.floor(v % 60);
                  return `${m}:${String(s).padStart(2, '0')}`;
                }}
                label={{ value: 'tempo na volta', position: 'insideBottom', fill: COLORS.textMuted, fontSize: 10, dy: 6 }}
                height={34}
              />
              <YAxis yAxisId="0" tick={{ fill: COLORS.textMuted, fontSize: 10 }} domain={yDomains.y0 || ['auto', 'auto']} allowDataOverflow />
              {metric2 && (
                <YAxis yAxisId="1" orientation="right" tick={{ fill: COLORS.textMuted, fontSize: 10 }} domain={yDomains.y1 || ['auto', 'auto']} allowDataOverflow />
              )}
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine yAxisId="0" y={yDomains.y0 ? (yDomains.y0[0] + yDomains.y0[1]) / 2 : 0} stroke={COLORS.textMuted} strokeDasharray="6 4" strokeOpacity={0.3} />
              {selectedItems.map((it, selIdx) =>
                metricKeys.map((mk, mi) => {
                  const metricLabel = availableMetrics.find((m) => m.key === mk)?.label || mk;
                  const label = hasExtra
                    ? `[${shortName(it.fileName)}] V${it.lapNum} — ${metricLabel}`
                    : `V${it.lapNum} — ${metricLabel}`;
                  return (
                    <Line
                      key={`${it.id}_${mk}`}
                      yAxisId={metric2 ? String(mi) : '0'}
                      type="monotone"
                      dataKey={`${it.id}_${mk}`}
                      name={label}
                      stroke={it.color}
                      strokeWidth={2.5}
                      dot={false}
                      strokeDasharray={mi === 1 ? '6 3' : undefined}
                      opacity={mi === 1 ? 0.7 : 1}
                      filter={mi === 0 ? `url(#glow-${selIdx})` : undefined}
                    />
                  );
                })
              )}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── Delta de tempo (apenas 2 voltas da mesma sessão ou cross-session) ── */}
      {selectedItems.length === 2 && deltaData.length > 0 && (
        <ChartCard
          title={`Delta: [${shortName(selectedItems[0].fileName)}] V${selectedItems[0].lapNum} vs [${shortName(selectedItems[1].fileName)}] V${selectedItems[1].lapNum}`}
          height={200}
        >
          <ResponsiveContainer>
            <AreaChart data={deltaData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="pct" tick={false} height={18} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke={COLORS.textMuted} strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="delta"
                stroke={COLORS.purple}
                fill={COLORS.purple}
                fillOpacity={0.2}
                name="Delta (s)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── Tabela de comparação ── */}
      {selectedItems.length >= 2 && (
        <div style={theme.card}>
          <div style={theme.cardTitle}>Comparação Numérica</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: COLORS.textMuted }}>
                    Métrica
                  </th>
                  {selectedItems.map((it) => (
                    <th key={it.id} style={{ padding: '8px 12px', textAlign: 'center', color: it.color }}>
                      {hasExtra ? `[${shortName(it.fileName)}] ` : ''}V{it.lapNum}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableMetrics.map((row) => (
                  <tr key={row.label} style={{ borderBottom: `1px solid ${COLORS.border}11` }}>
                    <td style={{ padding: '8px 12px', color: COLORS.textSecondary }}>{row.label}</td>
                    {selectedItems.map((it) => {
                      const val = it.lapsAnalysis[it.lapNum]?.[row.key];
                      return (
                        <td key={it.id} style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>
                          {val !== undefined ? row.fmt(val) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <PrintFooter />
    </div>
  );
}
