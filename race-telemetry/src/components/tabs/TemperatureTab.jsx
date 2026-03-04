import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { COLORS } from '@/constants/colors';
import { ChartCard, CustomTooltip, MetricCard } from '@/components/common';
import { theme } from '@/styles/theme';

export default function TemperatureTab({ data, channels }) {
  // User inputs for track/ambient temp
  const [trackTemp, setTrackTemp] = useState('');
  const [ambientTemp, setAmbientTemp] = useState('');
  const [humidity, setHumidity] = useState('');
  const [tempLog, setTempLog] = useState([]);

  const addTempLog = () => {
    if (!trackTemp && !ambientTemp) return;
    setTempLog((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        track: parseFloat(trackTemp) || 0,
        ambient: parseFloat(ambientTemp) || 0,
        humidity: parseFloat(humidity) || 0,
      },
    ]);
  };

  // Engine temp from telemetry per lap
  const engineTempPerLap = Object.entries(data.laps)
    .map(([lapNum, rows]) => {
      const temps = rows
        .map((r) => (channels.engineTemp ? r[channels.engineTemp] : null))
        .filter((v) => v !== null && !isNaN(v));
      if (!temps.length) return null;
      return {
        lap: `V${lapNum}`,
        avg: parseFloat((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)),
        max: parseFloat(Math.max(...temps).toFixed(1)),
        min: parseFloat(Math.min(...temps).toFixed(1)),
      };
    })
    .filter(Boolean);

  // Full engine temp trace
  const step = Math.max(1, Math.floor(data.rows.length / 600));
  const engineTrace = data.rows
    .filter((_, i) => i % step === 0)
    .map((r) => ({
      t: channels.time ? parseFloat((r[channels.time] || 0).toFixed(1)) : 0,
      engineTemp: channels.engineTemp ? r[channels.engineTemp] : null,
    }))
    .filter((r) => r.engineTemp !== null);

  const inputStyle = {
    background: COLORS.bg,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    width: 120,
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Manual temp input */}
      <div style={{ ...theme.card, background: 'linear-gradient(135deg, #12121a, #15120f)' }}>
        <div style={theme.cardTitle}>🌡️ Temperaturas do Ambiente — Registro Manual</div>
        <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
          Registre as temperaturas ao longo do dia. Esses dados são importantes para análise de desempenho e setup.
        </p>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
              Temp. Pista (°C)
            </label>
            <input
              type="number"
              value={trackTemp}
              onChange={(e) => setTrackTemp(e.target.value)}
              style={inputStyle}
              placeholder="42"
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
              Temp. Ambiente (°C)
            </label>
            <input
              type="number"
              value={ambientTemp}
              onChange={(e) => setAmbientTemp(e.target.value)}
              style={inputStyle}
              placeholder="28"
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
              Umidade (%)
            </label>
            <input
              type="number"
              value={humidity}
              onChange={(e) => setHumidity(e.target.value)}
              style={inputStyle}
              placeholder="65"
            />
          </div>
          <button
            onClick={addTempLog}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: COLORS.accent,
              color: '#fff',
              border: 'none',
              height: 38,
            }}
          >
            + Registrar
          </button>
        </div>

        {/* Temp log table */}
        {tempLog.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left', color: COLORS.textMuted }}>Hora</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.orange }}>Pista °C</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.cyan }}>Ambiente °C</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.blue }}>Umidade %</th>
                </tr>
              </thead>
              <tbody>
                {tempLog.map((entry, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}11` }}>
                    <td style={{ padding: '6px 12px', color: COLORS.textSecondary }}>{entry.time}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, color: COLORS.orange }}>{entry.track}°</td>
                    <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, color: COLORS.cyan }}>{entry.ambient}°</td>
                    <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, color: COLORS.blue }}>{entry.humidity}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Temp evolution chart */}
        {tempLog.length > 1 && (
          <div style={{ marginTop: 16 }}>
            <ChartCard title="Evolução das Temperaturas" height={200}>
              <ResponsiveContainer>
                <LineChart data={tempLog}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                  <XAxis dataKey="time" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="track" stroke={COLORS.orange} strokeWidth={2} dot name="Pista °C" />
                  <Line type="monotone" dataKey="ambient" stroke={COLORS.cyan} strokeWidth={2} dot name="Ambiente °C" />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}
      </div>

      {/* Engine temp from telemetry */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>🔥 Temperatura do Motor (Telemetria)</div>
        <div style={theme.grid(3)}>
          {engineTempPerLap.length > 0 && (
            <>
              <MetricCard
                label="Máx. Geral"
                value={Math.max(...engineTempPerLap.map((l) => l.max)).toFixed(1)}
                unit="°C"
                color={COLORS.accent}
                small
              />
              <MetricCard
                label="Média Geral"
                value={(engineTempPerLap.reduce((a, l) => a + l.avg, 0) / engineTempPerLap.length).toFixed(1)}
                unit="°C"
                color={COLORS.orange}
                small
              />
              <MetricCard
                label="Mín. Geral"
                value={Math.min(...engineTempPerLap.map((l) => l.min)).toFixed(1)}
                unit="°C"
                color={COLORS.cyan}
                small
              />
            </>
          )}
        </div>
      </div>

      {/* Engine temp per lap */}
      <ChartCard title="Temperatura do Motor por Volta (Mín / Méd / Máx)" height={260}>
        <ResponsiveContainer>
          <LineChart data={engineTempPerLap}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="lap" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
            <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="max" stroke={COLORS.accent} strokeWidth={2} dot name="Máx" />
            <Line type="monotone" dataKey="avg" stroke={COLORS.orange} strokeWidth={2} dot name="Média" />
            <Line type="monotone" dataKey="min" stroke={COLORS.cyan} strokeWidth={2} dot name="Mín" />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Full trace */}
      <ChartCard title="Temperatura do Motor — Traço Completo" height={220}>
        <ResponsiveContainer>
          <AreaChart data={engineTrace}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="t" tick={{ fill: COLORS.textMuted, fontSize: 10 }} interval={Math.floor(engineTrace.length / 10)} />
            <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="engineTemp" stroke={COLORS.accent} fill={COLORS.accent} fillOpacity={0.15} name="Temp Motor °C" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
