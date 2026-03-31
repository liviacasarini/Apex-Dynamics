import { useMemo, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useColors } from '@/context/ThemeContext';
import { LAP_COLORS } from '@/constants/colors';
import { ChartCard, CustomTooltip, FilterModeBar, PrintFooter } from '@/components/common';
import { makeTheme } from '@/styles/theme';

export default function VitalsTab({ data, channels, lapsAnalysis, vitalsLimits, setVitalsLimits, isLoaded, filterMode, setFilterMode, hasOutLap }) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);

  /** Vitais com canal de telemetria */
  const VITAL_DEFS = [
    { key: 'engineTemp',       label: 'Temp. Água (Motor)',    unit: '°C',  color: COLORS.accent,  hasMax: true,  hasMin: false },
    { key: 'oilPressure',      label: 'Pressão Óleo Motor',   unit: 'bar', color: COLORS.yellow,  hasMax: true,  hasMin: true  },
    { key: 'battery',          label: 'Tensão da Bateria',    unit: 'V',   color: COLORS.blue,    hasMax: false, hasMin: true  },
    { key: 'lambda',           label: 'Lambda',               unit: '',    color: COLORS.green,   hasMax: true,  hasMin: true,  decimals: 3 },
    { key: 'fuelPressure',     label: 'Pressão Combustível',  unit: 'bar', color: COLORS.orange,  hasMax: true,  hasMin: true  },
    { key: 'transOilTemp',     label: 'Temp. Óleo Câmbio',   unit: '°C',  color: COLORS.cyan,    hasMax: true,  hasMin: true  },
    { key: 'transOilPressure', label: 'Pressão Óleo Câmbio', unit: 'bar', color: COLORS.purple,  hasMax: true,  hasMin: true  },
  ];

  const INPUT_STYLE = {
    width: '100%',
    background: COLORS.bg,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 12,
    outline: 'none',
  };

  // Voltas válidas em ordem cronológica
  const lapNums = useMemo(
    () => !isLoaded ? [] : Object.keys(data.laps)
      .filter((n) => lapsAnalysis[n] != null)
      .sort((a, b) => Number(a) - Number(b)),
    [data, lapsAnalysis, isLoaded]
  );

  // Estatísticas por vital e por volta
  const lapStats = useMemo(() => {
    if (!isLoaded) return {};
    const result = {};
    VITAL_DEFS.forEach(({ key }) => {
      if (!channels[key]) return;
      result[key] = {};
      lapNums.forEach((n) => {
        const rows = data.laps[n] || [];
        const vals = rows
          .map((r) => r[channels[key]])
          .filter((v) => v != null && !isNaN(v) && v > -999);
        if (!vals.length) return;
        let vMin = vals[0], vMax = vals[0], vSum = 0;
        for (const v of vals) { if (v < vMin) vMin = v; if (v > vMax) vMax = v; vSum += v; }
        result[key][n] = { min: vMin, max: vMax, avg: vSum / vals.length };
      });
    });
    return result;
  }, [data, channels, lapNums, isLoaded]);

  // Dados de gráfico por volta para cada vital (uma linha por volta)
  const vitalsChartData = useMemo(() => {
    if (!isLoaded) return {};
    const result = {};
    VITAL_DEFS.forEach(({ key }) => {
      if (!channels[key]) return;
      const maxLen = lapNums.reduce((m, n) => Math.max(m, data.laps[n]?.length || 0), 1);
      const step = Math.max(1, Math.floor(maxLen / 300));
      const points = [];
      for (let i = 0; i < maxLen; i += step) {
        const point = { idx: i };
        lapNums.forEach((n) => {
          const rows = data.laps[n] || [];
          if (i >= rows.length) return;
          const val = rows[i]?.[channels[key]];
          if (val != null && !isNaN(val) && val > -999) point[`v${n}`] = val;
        });
        points.push(point);
      }
      result[key] = points;
    });
    return result;
  }, [data, channels, lapNums, isLoaded]);

  const updateLimit = (key, field, value) => {
    setVitalsLimits({
      ...vitalsLimits,
      [key]: { ...(vitalsLimits[key] || {}), [field]: value },
    });
  };

  /* ── Visibilidade de voltas por gráfico ───────────────────────────────── */
  // hiddenLaps: { [vitalKey]: { [lapNum]: true } } — objeto plain (imutável, React-safe)
  const [hiddenLaps, setHiddenLaps] = useState({});
  const [collapsedTables, setCollapsedTables] = useState({});
  const toggleTable = (key) => setCollapsedTables(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleLapVisibility = useCallback((vitalKey, lapNum) => {
    setHiddenLaps((prev) => {
      const current = prev[vitalKey] || {};
      const next = { ...current };
      if (next[lapNum]) delete next[lapNum];
      else next[lapNum] = true;
      return { ...prev, [vitalKey]: next };
    });
  }, []);

  const hideAllLaps = useCallback((vitalKey) => {
    setHiddenLaps((prev) => {
      const all = {};
      lapNums.forEach((n) => { all[n] = true; });
      return { ...prev, [vitalKey]: all };
    });
  }, [lapNums]);

  const showAllLaps = useCallback((vitalKey) => {
    setHiddenLaps((prev) => ({ ...prev, [vitalKey]: {} }));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      {/* ── Configuração de Limites ── */}
      <div style={{ ...theme.card, background: COLORS.bgCard }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={theme.cardTitle}>⚙️ Limites de Alerta dos Vitais</div>
          <FilterModeBar filterMode={filterMode} setFilterMode={setFilterMode} hasOutLap={hasOutLap} />
        </div>
        <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
          Defina os limites para cada canal. Voltas que ultrapassarem os limites serão sinalizadas
          nos gráficos abaixo e no painel Overview.
        </p>

        {/* Vitais com telemetria */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          {VITAL_DEFS.map((def) => (
            <div key={def.key} style={{ flex: '1 1 140px', minWidth: 130 }}>
              <div style={{ fontSize: 11, color: def.color, marginBottom: 6, fontWeight: 600 }}>
                {def.label}
                {!channels[def.key] && (
                  <span style={{ color: COLORS.textMuted, fontWeight: 400 }}> (sem dados)</span>
                )}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: COLORS.textMuted, marginBottom: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={vitalsLimits[def.key]?.alarmEnabled !== false}
                  onChange={(e) => updateLimit(def.key, 'alarmEnabled', e.target.checked)}
                  style={{ accentColor: def.color, cursor: 'pointer' }}
                />
                Alarme ativo
              </label>
              {def.hasMax && (
                <div style={{ marginBottom: 6 }}>
                  <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 2 }}>
                    Máx ({def.unit || '—'})
                  </label>
                  <input
                    type="number" step="any"
                    value={vitalsLimits[def.key]?.max ?? ''}
                    onChange={(e) => updateLimit(def.key, 'max', e.target.value)}
                    placeholder="—"
                    style={INPUT_STYLE}
                  />
                </div>
              )}
              {def.hasMin && (
                <div>
                  <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 2 }}>
                    Mín ({def.unit || '—'})
                  </label>
                  <input
                    type="number" step="any"
                    value={vitalsLimits[def.key]?.min ?? ''}
                    onChange={(e) => updateLimit(def.key, 'min', e.target.value)}
                    placeholder="—"
                    style={INPUT_STYLE}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

      </div>

      {/* ── Placeholder when no telemetry loaded ── */}
      {!isLoaded && (
        <div style={{
          ...theme.card,
          textAlign: 'center',
          padding: '40px 24px',
          background: COLORS.bgCard,
        }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>
            Nenhum arquivo carregado
          </div>
          <div style={{ fontSize: 13, color: COLORS.textMuted }}>
            Acesse a aba <strong style={{ color: COLORS.textSecondary }}>Overview</strong> e carregue um arquivo de telemetria para visualizar os dados vitais por volta.
          </div>
        </div>
      )}

      {/* ── Canais não disponíveis neste arquivo ── */}
      {isLoaded && (() => {
        const missing = VITAL_DEFS.filter((def) => !channels[def.key]);
        if (!missing.length) return null;
        return (
          <div style={{
            ...theme.card,
            marginBottom: 16,
            padding: '10px 16px',
            background: COLORS.bgCard,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>
              Canais não encontrados neste arquivo:
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {missing.map((def) => (
                <span key={def.key} style={{
                  fontSize: 11,
                  color: COLORS.textMuted,
                  background: `${COLORS.border}30`,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 20,
                  padding: '2px 10px',
                }}>
                  {def.label}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Gráfico + Tabela por Vital ── */}
      {isLoaded && VITAL_DEFS.map((def) => {
        if (!channels[def.key]) return null;

        const chartData   = vitalsChartData[def.key] || [];
        const stats       = lapStats[def.key] || {};
        const limit       = vitalsLimits[def.key] || {};
        const maxLimit    = parseFloat(limit.max);
        const minLimit    = parseFloat(limit.min);
        const hiddenSet   = hiddenLaps[def.key] || {};
        const visibleLaps = lapNums.filter((n) => !hiddenSet[n]);
        const allHidden   = visibleLaps.length === 0;

        const visibleKeys = visibleLaps.map((n) => `v${n}`);

        // Filtra pontos onde ao menos uma volta visível tem dado (ajusta eixo X)
        const visibleChartData = allHidden
          ? chartData
          : chartData.filter((point) => visibleKeys.some((k) => point[k] != null && !isNaN(point[k])));

        // Domínio do YAxis baseado apenas nas voltas visíveis
        const yDomain = (() => {
          if (allHidden || !visibleChartData.length) return ['auto', 'auto'];
          let yMin = Infinity, yMax = -Infinity;
          for (const point of visibleChartData) {
            for (const k of visibleKeys) {
              const v = point[k];
              if (v != null && !isNaN(v)) {
                if (v < yMin) yMin = v;
                if (v > yMax) yMax = v;
              }
            }
          }
          if (yMin === Infinity) return ['auto', 'auto'];
          const pad = (yMax - yMin) * 0.05 || 1;
          return [yMin - pad, yMax + pad];
        })();

        return (
          <div key={def.key}>
            {/* ── Filtro de voltas por gráfico ── */}
            <div style={{
              ...theme.card,
              marginBottom: 4,
              padding: '10px 16px',
              background: COLORS.bgCard,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {def.label} — voltas:
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                {lapNums.map((n, i) => {
                  const color   = LAP_COLORS[i % LAP_COLORS.length];
                  const visible = !hiddenSet[n];
                  return (
                    <button
                      key={n}
                      onClick={() => toggleLapVisibility(def.key, n)}
                      title={visible ? 'Clique para ocultar' : 'Clique para mostrar'}
                      style={{
                        padding: '3px 10px',
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `2px solid ${color}`,
                        background: visible ? `${color}22` : 'transparent',
                        color: visible ? color : COLORS.textMuted,
                        textDecoration: visible ? 'none' : 'line-through',
                        opacity: visible ? 1 : 0.5,
                        transition: 'all 0.15s',
                      }}
                    >
                      V{n}
                    </button>
                  );
                })}
              </div>
              {/* Ações rápidas */}
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
                <button
                  onClick={() => showAllLaps(def.key)}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 10,
                    border: `1px solid ${COLORS.border}`, background: 'transparent',
                    color: COLORS.textMuted, cursor: 'pointer',
                  }}
                >
                  Todas
                </button>
                <button
                  onClick={() => hideAllLaps(def.key)}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 10,
                    border: `1px solid ${COLORS.border}`, background: 'transparent',
                    color: COLORS.textMuted, cursor: 'pointer',
                  }}
                >
                  Nenhuma
                </button>
              </div>
            </div>

            {/* Gráfico: uma linha por volta (somente visíveis) */}
            <div>
              <ChartCard title={`${def.label} — por Volta`} height={240}>
                {allHidden ? (
                  <div style={{
                    height: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: COLORS.textMuted, fontSize: 13,
                  }}>
                    Todas as voltas estão ocultas — clique nos botões acima para exibir
                  </div>
                ) : (
                  <ResponsiveContainer>
                    <LineChart data={visibleChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                      <XAxis dataKey="idx" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
                      <YAxis
                        tick={{ fill: COLORS.textMuted, fontSize: 10 }}
                        domain={yDomain}
                        unit={def.unit ? ` ${def.unit}` : ''}
                      />
                      <Tooltip content={<CustomTooltip decimals={def.key === 'lambda' ? 3 : undefined} />} />
                      {lapNums.map((n, i) => {
                        if (hiddenSet[n]) return null;
                        return (
                          <Line
                            key={n}
                            type="monotone"
                            dataKey={`v${n}`}
                            name={`V${n}`}
                            stroke={LAP_COLORS[i % LAP_COLORS.length]}
                            strokeWidth={1.5}
                            dot={false}
                          />
                        );
                      })}
                      {!isNaN(maxLimit) && (
                        <ReferenceLine
                          y={maxLimit}
                          stroke={COLORS.accent}
                          strokeDasharray="5 3"
                          label={{ value: `Máx: ${maxLimit}${def.unit}`, fill: COLORS.accent, fontSize: 10, position: 'insideTopRight' }}
                        />
                      )}
                      {!isNaN(minLimit) && (
                        <ReferenceLine
                          y={minLimit}
                          stroke={COLORS.yellow}
                          strokeDasharray="5 3"
                          label={{ value: `Mín: ${minLimit}${def.unit}`, fill: COLORS.yellow, fontSize: 10, position: 'insideBottomRight' }}
                        />
                      )}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* Tabela: máx/mín/média por volta + status */}
            <div style={{ ...theme.card, marginTop: -8, marginBottom: 24 }}>
              <div
                onClick={() => toggleTable(def.key)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', paddingBottom: collapsedTables[def.key] ? 0 : 8 }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                  Detalhes por Volta — {def.label}
                </span>
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                  {collapsedTables[def.key] ? '▸ Expandir' : '▾ Recolher'}
                </span>
              </div>
              {!collapsedTables[def.key] && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <th style={{ padding: '6px 12px', textAlign: 'left',   color: COLORS.textMuted }}>Volta</th>
                      <th style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.textMuted }}>Mínimo</th>
                      <th style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.textMuted }}>Máximo</th>
                      <th style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.textMuted }}>Média</th>
                      <th style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.textMuted }}>Status</th>
                      <th style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.textMuted }}>No gráfico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lapNums.map((n, i) => {
                      const s = stats[n]; // pode ser undefined se a volta não tem dados desse canal
                      const excMax  = s && !isNaN(maxLimit) && s.max > maxLimit;
                      const excMin  = s && !isNaN(minLimit) && s.min < minLimit;
                      const ok      = !excMax && !excMin;
                      const visible = !hiddenSet[n];
                      const color   = LAP_COLORS[i % LAP_COLORS.length];
                      return (
                        <tr
                          key={n}
                          style={{
                            borderBottom: `1px solid ${COLORS.border}11`,
                            opacity: visible ? 1 : 0.45,
                          }}
                        >
                          <td style={{ padding: '6px 12px', fontWeight: 700, color }}>
                            V{n}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'center', color: excMin ? COLORS.accent : COLORS.textPrimary }}>
                            {s ? `${s.min.toFixed(def.decimals ?? 2)}${def.unit}` : '—'}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'center', color: excMax ? COLORS.accent : COLORS.textPrimary }}>
                            {s ? `${s.max.toFixed(def.decimals ?? 2)}${def.unit}` : '—'}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.textSecondary }}>
                            {s ? `${s.avg.toFixed(def.decimals ?? 2)}${def.unit}` : '—'}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                            {!s ? (
                              <span style={{ color: COLORS.textMuted, fontSize: 11 }}>sem dados</span>
                            ) : ok ? (
                              <span style={{ color: COLORS.green, fontSize: 11 }}>✓ OK</span>
                            ) : (
                              <span style={{ ...theme.badge(COLORS.accent), fontSize: 10 }}>
                                ⚠{excMax ? ` ↑${s.max.toFixed(def.decimals ?? 2)}` : ''}
                                {excMax && excMin ? ' /' : ''}
                                {excMin ? ` ↓${s.min.toFixed(def.decimals ?? 2)}` : ''}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                            <button
                              onClick={() => toggleLapVisibility(def.key, n)}
                              style={{
                                padding: '2px 10px', borderRadius: 20, fontSize: 10,
                                border: `1px solid ${visible ? color : COLORS.border}`,
                                background: visible ? `${color}18` : 'transparent',
                                color: visible ? color : COLORS.textMuted,
                                cursor: 'pointer', fontWeight: 600,
                              }}
                            >
                              {visible ? '● visível' : '○ oculta'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </div>
        );
      })}
      <PrintFooter />
    </div>
  );
}
