import { useState, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { COLORS, LAP_COLORS } from '@/constants/colors';
import { CHART_METRICS } from '@/constants/channels';
import { ChartCard, CustomTooltip } from '@/components/common';
import { theme } from '@/styles/theme';

export default function LapCompareTab({ data, channels, lapsAnalysis }) {
  const validLaps = useMemo(
    () => Object.keys(data.laps).filter((n) => lapsAnalysis[n]?.lapTime > 5),
    [data.laps, lapsAnalysis]
  );

  const [selected, setSelected] = useState(validLaps.slice(0, 2));
  const [metricKey, setMetricKey] = useState('gpsSpeed');

  const availableMetrics = useMemo(
    () => CHART_METRICS.filter((m) => channels[m.key]),
    [channels]
  );

  const toggleLap = (n) => {
    setSelected((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
  };

  // Overlay chart data
  const chartData = useMemo(() => {
    const maxLen = Math.max(
      ...selected.map((n) => (data.laps[n]?.length || 0))
    );
    const step = Math.max(1, Math.floor(maxLen / 500));
    const points = [];

    for (let i = 0; i < maxLen; i += step) {
      const point = { idx: i };
      selected.forEach((n) => {
        const rows = data.laps[n] || [];
        const row = rows[Math.min(i, rows.length - 1)];
        if (row && channels[metricKey]) {
          point[`v${n}`] = row[channels[metricKey]] || 0;
        }
      });
      points.push(point);
    }

    return points;
  }, [selected, metricKey, data.laps, channels]);

  // Delta time between 2 laps
  const deltaData = useMemo(() => {
    if (selected.length !== 2) return [];
    const [a, b] = selected;
    const lapA = data.laps[a] || [];
    const lapB = data.laps[b] || [];
    const len = Math.min(lapA.length, lapB.length);
    const step = Math.max(1, Math.floor(len / 400));
    const points = [];
    let cumDelta = 0;

    for (let i = 0; i < len; i += step) {
      const sA = channels.gpsSpeed ? (lapA[i]?.[channels.gpsSpeed] || 0) : 0;
      const sB = channels.gpsSpeed ? (lapB[i]?.[channels.gpsSpeed] || 0) : 0;
      const dt = step * 0.1;
      cumDelta += (sB - sA) * dt / 3600;
      points.push({ idx: i, delta: parseFloat(cumDelta.toFixed(3)) });
    }

    return points;
  }, [selected, data.laps, channels]);

  // Comparison table rows
  const tableMetrics = [
    { label: 'Tempo (s)', key: 'lapTime', fmt: (v) => v.toFixed(3) },
    { label: 'Vel. Máx (km/h)', key: 'maxSpeed', fmt: (v) => v.toFixed(1) },
    { label: 'Vel. Média (km/h)', key: 'avgSpeed', fmt: (v) => v.toFixed(1) },
    { label: 'RPM Máx', key: 'maxRPM', fmt: (v) => v.toFixed(0) },
    { label: 'Aceleração Total', key: 'fullThrottlePct', fmt: (v) => v.toFixed(1) + '%' },
    { label: 'Coasting', key: 'coastPct', fmt: (v) => v.toFixed(1) + '%' },
    { label: 'Zonas Freio', key: 'brakeZones', fmt: (v) => v },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Lap selector */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>Selecione Voltas para Comparar</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {validLaps.map((n) => (
            <div
              key={n}
              onClick={() => toggleLap(n)}
              style={theme.lapChip(
                selected.includes(n),
                LAP_COLORS[validLaps.indexOf(n)]
              )}
            >
              V{n} — {lapsAnalysis[n]?.lapTime.toFixed(3)}s
            </div>
          ))}
        </div>
      </div>

      {/* Metric pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {availableMetrics.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetricKey(m.key)}
            style={theme.pillButton(metricKey === m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Overlay chart */}
      {selected.length > 0 && (
        <ChartCard
          title={`Comparação: ${availableMetrics.find((m) => m.key === metricKey)?.label || metricKey}`}
          height={320}
        >
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="idx" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              {selected.map((n) => (
                <Line
                  key={n}
                  type="monotone"
                  dataKey={`v${n}`}
                  name={`Volta ${n}`}
                  stroke={LAP_COLORS[validLaps.indexOf(n)]}
                  strokeWidth={1.5}
                  dot={false}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Delta chart */}
      {selected.length === 2 && deltaData.length > 0 && (
        <ChartCard title={`Delta: V${selected[0]} vs V${selected[1]}`} height={200}>
          <ResponsiveContainer>
            <AreaChart data={deltaData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="idx" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
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

      {/* Comparison table */}
      {selected.length >= 2 && (
        <div style={theme.card}>
          <div style={theme.cardTitle}>Comparação Numérica</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: COLORS.textMuted }}>
                    Métrica
                  </th>
                  {selected.map((n) => (
                    <th
                      key={n}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'center',
                        color: LAP_COLORS[validLaps.indexOf(n)],
                      }}
                    >
                      Volta {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableMetrics.map((row) => (
                  <tr key={row.label} style={{ borderBottom: `1px solid ${COLORS.border}11` }}>
                    <td style={{ padding: '8px 12px', color: COLORS.textSecondary }}>
                      {row.label}
                    </td>
                    {selected.map((n) => {
                      const val = lapsAnalysis[n]?.[row.key];
                      return (
                        <td
                          key={n}
                          style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}
                        >
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
    </div>
  );
}
