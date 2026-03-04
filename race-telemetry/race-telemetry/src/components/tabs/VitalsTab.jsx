import { useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { COLORS } from '@/constants/colors';
import { ChartCard, CustomTooltip } from '@/components/common';
import { theme } from '@/styles/theme';

/**
 * Computa min/max/avg para um array numérico.
 */
function getStats(arr) {
  const vals = arr.filter((v) => v !== null && !isNaN(v) && v > -999);
  if (!vals.length) return null;
  return {
    min: Math.min(...vals),
    max: Math.max(...vals),
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
  };
}

export default function VitalsTab({ data, channels }) {
  // Downsample rows for chart performance
  const timeData = useMemo(() => {
    const step = Math.max(1, Math.floor(data.rows.length / 800));
    return data.rows
      .filter((_, i) => i % step === 0)
      .map((r) => ({
        t: channels.time ? parseFloat((r[channels.time] || 0).toFixed(1)) : 0,
        temp: channels.engineTemp ? r[channels.engineTemp] : null,
        oil: channels.oilPressure ? r[channels.oilPressure] : null,
        lambda: channels.lambda ? r[channels.lambda] : null,
        lambdaT: channels.lambdaTarget ? r[channels.lambdaTarget] : null,
        battery: channels.battery ? r[channels.battery] : null,
        fuel: channels.fuelPressure ? r[channels.fuelPressure] : null,
        map: channels.map ? r[channels.map] : null,
        rpm: channels.rpm ? r[channels.rpm] : null,
        ignAngle: channels.ignAngle ? r[channels.ignAngle] : null,
      }));
  }, [data.rows, channels]);

  // Summary vitals
  const vitals = useMemo(() => {
    const defs = [
      { key: 'temp', label: 'Temp. Motor', unit: '°C', color: COLORS.accent, warnMax: 100 },
      { key: 'oil', label: 'Pressão Óleo', unit: 'bar', color: COLORS.yellow, warnMin: 1.0 },
      { key: 'lambda', label: 'Lambda', unit: '', color: COLORS.green },
      { key: 'battery', label: 'Bateria', unit: 'V', color: COLORS.blue, warnMin: 12.0 },
      { key: 'fuel', label: 'Pressão Comb.', unit: 'bar', color: COLORS.orange },
    ];

    return defs
      .map((v) => ({
        ...v,
        stats: getStats(timeData.map((r) => r[v.key])),
      }))
      .filter((v) => v.stats);
  }, [timeData]);

  const interval = Math.floor(timeData.length / 8);

  return (
    <div style={{ padding: 24 }}>
      {/* Summary gauges */}
      <div
        style={{
          ...theme.card,
          background: 'linear-gradient(135deg, #12121a 0%, #0f1520 100%)',
        }}
      >
        <div style={theme.cardTitle}>Resumo dos Dados Vitais</div>
        <div style={theme.grid(vitals.length || 1)}>
          {vitals.map((v) => (
            <div key={v.key} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>
                {v.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: v.color }}>
                {v.stats.avg.toFixed(1)}
              </div>
              <div style={{ fontSize: 10, color: COLORS.textMuted }}>avg</div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 12,
                  marginTop: 6,
                  fontSize: 11,
                }}
              >
                <span style={{ color: COLORS.cyan }}>
                  ↓{v.stats.min.toFixed(1)}
                </span>
                <span style={{ color: COLORS.accent }}>
                  ↑{v.stats.max.toFixed(1)}
                </span>
              </div>
              {v.warnMax && v.stats.max > v.warnMax && (
                <div style={{ ...theme.badge(COLORS.accent), marginTop: 6, fontSize: 9 }}>
                  ⚠ PICO ALTO
                </div>
              )}
              {v.warnMin && v.stats.min < v.warnMin && (
                <div style={{ ...theme.badge(COLORS.yellow), marginTop: 6, fontSize: 9 }}>
                  ⚠ MÍNIMO BAIXO
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Temp + Oil row */}
      <div style={theme.grid(2)}>
        <ChartCard title="Temperatura do Motor" height={220}>
          <ResponsiveContainer>
            <AreaChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="t" tick={{ fill: COLORS.textMuted, fontSize: 10 }} interval={interval} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="temp" stroke={COLORS.accent} fill={COLORS.accent} fillOpacity={0.15} name="Temp °C" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Pressão de Óleo" height={220}>
          <ResponsiveContainer>
            <AreaChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="t" tick={{ fill: COLORS.textMuted, fontSize: 10 }} interval={interval} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="oil" stroke={COLORS.yellow} fill={COLORS.yellow} fillOpacity={0.15} name="Óleo (bar)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Lambda + Battery row */}
      <div style={theme.grid(2)}>
        <ChartCard title="Lambda (Real vs Alvo)" height={220}>
          <ResponsiveContainer>
            <LineChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="t" tick={{ fill: COLORS.textMuted, fontSize: 10 }} interval={interval} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="lambda" stroke={COLORS.green} strokeWidth={1.5} dot={false} name="Lambda Real" />
              <Line type="monotone" dataKey="lambdaT" stroke={COLORS.textMuted} strokeWidth={1} dot={false} strokeDasharray="4 4" name="Lambda Alvo" />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tensão da Bateria" height={220}>
          <ResponsiveContainer>
            <AreaChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="t" tick={{ fill: COLORS.textMuted, fontSize: 10 }} interval={interval} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="battery" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.15} name="Bateria (V)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* RPM + MAP + Ignition */}
      <ChartCard title="RPM, MAP e Ângulo de Ignição" height={280}>
        <ResponsiveContainer>
          <ComposedChart data={timeData}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="t" tick={{ fill: COLORS.textMuted, fontSize: 10 }} interval={Math.floor(timeData.length / 10)} />
            <YAxis yAxisId="rpm" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
            <YAxis yAxisId="map" orientation="right" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Line yAxisId="rpm" type="monotone" dataKey="rpm" stroke={COLORS.accent} strokeWidth={1} dot={false} name="RPM" />
            <Line yAxisId="map" type="monotone" dataKey="map" stroke={COLORS.cyan} strokeWidth={1} dot={false} name="MAP" />
            <Line yAxisId="map" type="monotone" dataKey="ignAngle" stroke={COLORS.purple} strokeWidth={1} dot={false} name="Ign Angle" />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
