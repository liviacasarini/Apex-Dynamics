import { useMemo, useState } from 'react';
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

  // Fuel/weight calculator state
  const [fuelDensity, setFuelDensity] = useState('0.755');
  const [carWeight, setCarWeight] = useState('');
  const [driverWeight, setDriverWeight] = useState('');
  const [startFuel, setStartFuel] = useState('');
  const [avgConsumption, setAvgConsumption] = useState('');
  const [raceLaps, setRaceLaps] = useState('');


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
                <th style={{ padding: '8px 12px', textAlign: 'center', color: COLORS.textMuted }}>Frenagem %</th>
              </tr>
            </thead>
            <tbody>
              {lapNums.map((n) => {
                const s = lapsAnalysis[n];
                const brakePct = 100 - s.fullThrottlePct - s.coastPct;
                const coastTime = (s.coastPct / 100 * s.lapTime).toFixed(2);
                return (
                  <tr key={n} style={{ borderBottom: `1px solid ${COLORS.border}11` }}>
                    <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700, color: COLORS.accent }}>V{n}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'center', color: s.coastPct > 15 ? COLORS.accent : COLORS.yellow }}>
                      {s.coastPct.toFixed(1)}%
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600 }}>{coastTime}s</td>
                    <td style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.green }}>{s.fullThrottlePct.toFixed(1)}%</td>
                    <td style={{ padding: '6px 12px', textAlign: 'center', color: COLORS.blue }}>{Math.max(0, brakePct).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weight & Fuel Calculator */}
      <div style={{ ...theme.card, background: 'linear-gradient(135deg, #12121a, #0f1518)' }}>
        <div style={theme.cardTitle}>⛽ Calculadora de Peso e Combustível</div>
        <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
          Configure as variáveis para calcular o peso total e consumo de combustível para a corrida.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { label: 'Densidade do combustível a 25°C', value: fuelDensity, set: setFuelDensity, unit: 'kg/L', placeholder: '0.755' },
            { label: 'Peso do carro (sem combustível)', value: carWeight, set: setCarWeight, unit: 'kg', placeholder: '980' },
            { label: 'Peso do piloto (com equipamento)', value: driverWeight, set: setDriverWeight, unit: 'kg', placeholder: '80' },
            { label: 'Litragem de combustível de saída', value: startFuel, set: setStartFuel, unit: 'L', placeholder: '45' },
            { label: 'Consumo médio por volta', value: avgConsumption, set: setAvgConsumption, unit: 'L/volta', placeholder: '2.5' },
            { label: 'Número de voltas da corrida', value: raceLaps, set: setRaceLaps, unit: 'voltas', placeholder: '25' },
          ].map((f) => (
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

        {/* Results */}
        {(() => {
          const d = parseFloat(fuelDensity) || 0;
          const cw = parseFloat(carWeight) || 0;
          const dw = parseFloat(driverWeight) || 0;
          const sf = parseFloat(startFuel) || 0;
          const ac = parseFloat(avgConsumption) || 0;
          const rl = parseFloat(raceLaps) || 0;

          const fuelWeightStart = sf * d;
          const totalFuelNeeded = ac * rl;
          const fuelWeightEnd = Math.max(0, (sf - totalFuelNeeded)) * d;
          const weightStart = cw + dw + fuelWeightStart;
          const weightEnd = cw + dw + fuelWeightEnd;
          const fuelRemaining = Math.max(0, sf - totalFuelNeeded);

          const hasData = cw > 0 || sf > 0;

          return hasData ? (
            <div
              style={{
                background: COLORS.bg,
                borderRadius: 8,
                padding: 20,
                border: `1px solid ${COLORS.border}`,
              }}
            >
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
          );
        })()}
      </div>
    </div>
  );
}
