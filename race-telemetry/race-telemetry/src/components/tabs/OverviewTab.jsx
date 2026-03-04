import { useMemo } from 'react';
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { COLORS, LAP_COLORS } from '@/constants/colors';
import { MetricCard, ChartCard, CustomTooltip } from '@/components/common';
import { theme } from '@/styles/theme';

export default function OverviewTab({
  data,
  channels,
  lapsAnalysis,
  bestLapNum,
}) {
  const best = lapsAnalysis[bestLapNum];

  const lapNums = useMemo(
    () =>
      Object.keys(data.laps)
        .filter((n) => lapsAnalysis[n]?.lapTime > 5)
        .sort((a, b) => lapsAnalysis[a].lapTime - lapsAnalysis[b].lapTime),
    [data.laps, lapsAnalysis]
  );

  // Bar chart: tempo por volta
  const lapTimesChart = useMemo(
    () =>
      lapNums.map((n) => ({
        lap: `V${n}`,
        time: parseFloat(lapsAnalysis[n].lapTime.toFixed(2)),
      })),
    [lapNums, lapsAnalysis]
  );

  // Speed trace da melhor volta (downsampled)
  const speedTrace = useMemo(() => {
    const bestData = data.laps[bestLapNum] || [];
    return bestData
      .filter((_, i) => i % 3 === 0)
      .map((r) => ({
        t: channels.time ? r[channels.time]?.toFixed(1) : '',
        speed: channels.gpsSpeed ? r[channels.gpsSpeed] || 0 : 0,
        throttle: channels.throttle ? r[channels.throttle] || 0 : 0,
        brake: channels.brake ? r[channels.brake] || 0 : 0,
      }));
  }, [data.laps, bestLapNum, channels]);

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
        metric: 'Frenagem',
        getter: (n) =>
          Math.max(
            0,
            100 -
              Math.abs(
                lapsAnalysis[n].brakeZones - (best?.brakeZones || 0)
              ) *
                10
          ),
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

  if (!best) {
    return (
      <div style={{ padding: 24, color: COLORS.textMuted, textAlign: 'center' }}>
        Nenhuma volta válida encontrada.
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Session summary */}
      <div
        style={{
          ...theme.card,
          background:
            'linear-gradient(135deg, #12121a 0%, #1a1020 100%)',
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
          <span style={theme.badge(COLORS.accent)}>
            {lapNums.length} voltas válidas
          </span>
        </div>

        <div style={theme.grid(5)}>
          <MetricCard
            label="Melhor Volta"
            value={best.lapTime.toFixed(3)}
            unit="s"
            color={COLORS.green}
          />
          <MetricCard
            label="Vmax"
            value={best.maxSpeed.toFixed(1)}
            unit="km/h"
            color={COLORS.cyan}
          />
          <MetricCard
            label="RPM Máx"
            value={best.maxRPM.toFixed(0)}
            unit=""
            color={COLORS.accent}
          />
          <MetricCard
            label="Aceleração Total"
            value={best.fullThrottlePct.toFixed(1)}
            unit="%"
            color={COLORS.yellow}
          />
          <MetricCard
            label="Zonas de Freio"
            value={best.brakeZones}
            unit=""
            color={COLORS.orange}
          />
        </div>
      </div>

      {/* Charts row */}
      <div style={theme.grid(2)}>
        <ChartCard title="Tempo por Volta" height={240}>
          <ResponsiveContainer>
            <BarChart data={lapTimesChart}>
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
              <Bar
                dataKey="time"
                radius={[4, 4, 0, 0]}
                fill={COLORS.accent}
              />
            </BarChart>
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
            <Area
              yAxisId="pct"
              type="monotone"
              dataKey="brake"
              stroke="none"
              fill={COLORS.accent}
              fillOpacity={0.2}
              name="Freio"
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
    </div>
  );
}
