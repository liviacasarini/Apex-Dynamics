import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { COLORS } from '@/constants/colors';
import { ChartCard, CustomTooltip, MetricCard } from '@/components/common';
import { theme } from '@/styles/theme';

/**
 * Analisa dados em condição WOT (Wide Open Throttle / pé cheio no acelerador).
 * Filtra amostras onde throttle > 90%.
 */
function analyzeWOT(laps, channels) {
  const results = {};
  const globalWOT = [];

  for (const [lapNum, rows] of Object.entries(laps)) {
    const wotRows = rows.filter((r) => {
      const t = channels.throttle ? r[channels.throttle] : 0;
      return t > 90;
    });

    if (wotRows.length < 5) continue;

    const get = (arr, ch) => arr.map((r) => r[ch]).filter((v) => v !== null && v !== undefined && !isNaN(v));

    const lambdas = get(wotRows, channels.lambda);
    const maps = get(wotRows, channels.map);
    const rpms = get(wotRows, channels.rpm);
    const batts = get(wotRows, channels.battery);
    const oils = get(wotRows, channels.oilPressure);
    const temps = get(wotRows, channels.engineTemp);

    const safeStats = (arr) => {
      if (!arr.length) return { min: 0, max: 0, avg: 0 };
      return {
        min: Math.min(...arr),
        max: Math.max(...arr),
        avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      };
    };

    results[lapNum] = {
      wotSamples: wotRows.length,
      totalSamples: rows.length,
      wotPct: (wotRows.length / rows.length * 100),
      lambda: safeStats(lambdas),
      map: safeStats(maps),
      rpm: safeStats(rpms),
      battery: safeStats(batts),
      oil: safeStats(oils),
      temp: safeStats(temps),
    };

    wotRows.forEach((r) => globalWOT.push({ ...r, _lap: lapNum }));
  }

  // Global WOT stats
  const gGet = (ch) => globalWOT.map((r) => r[ch]).filter((v) => v !== null && v !== undefined && !isNaN(v));
  const gStats = (arr) => {
    if (!arr.length) return { min: 0, max: 0, avg: 0 };
    return {
      min: Math.min(...arr),
      max: Math.max(...arr),
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
    };
  };

  // Find which lap had min/max
  const findExtremeLap = (channel, type) => {
    let bestLap = '-';
    let bestVal = type === 'max' ? -Infinity : Infinity;
    for (const [lap, stats] of Object.entries(results)) {
      const key = channel;
      if (!stats[key]) continue;
      const val = type === 'max' ? stats[key].max : stats[key].min;
      if (type === 'max' && val > bestVal) { bestVal = val; bestLap = lap; }
      if (type === 'min' && val < bestVal) { bestVal = val; bestLap = lap; }
    }
    return { lap: bestLap, value: bestVal };
  };

  const global = {
    lambda: gStats(gGet(channels.lambda)),
    map: gStats(gGet(channels.map)),
    rpm: gStats(gGet(channels.rpm)),
    battery: gStats(gGet(channels.battery)),
    oil: gStats(gGet(channels.oilPressure)),
    temp: gStats(gGet(channels.engineTemp)),
    extremes: {
      tempMax: findExtremeLap('temp', 'max'),
      tempMin: findExtremeLap('temp', 'min'),
      oilMin: findExtremeLap('oil', 'min'),
      oilMax: findExtremeLap('oil', 'max'),
      rpmMax: findExtremeLap('rpm', 'max'),
    },
  };

  return { perLap: results, global, wotTrace: globalWOT };
}

export default function WOTAnalysisTab({ data, channels }) {
  const wotData = useMemo(
    () => analyzeWOT(data.laps, channels),
    [data.laps, channels]
  );

  const lapNums = Object.keys(wotData.perLap).sort((a, b) => parseInt(a) - parseInt(b));
  const { global } = wotData;

  // Per-lap WOT bar chart
  const wotBars = lapNums.map((n) => ({
    lap: `V${n}`,
    wotPct: parseFloat(wotData.perLap[n].wotPct.toFixed(1)),
    lambdaAvg: parseFloat(wotData.perLap[n].lambda.avg.toFixed(3)),
    mapAvg: parseFloat(wotData.perLap[n].map.avg.toFixed(1)),
    rpmMax: parseFloat(wotData.perLap[n].rpm.max.toFixed(0)),
  }));

  // Lambda trace during WOT
  const lambdaTrace = [];
  let idx = 0;
  for (const [lapNum, rows] of Object.entries(data.laps)) {
    const step = Math.max(1, Math.floor(rows.length / 200));
    rows.filter((_, i) => i % step === 0).forEach((r) => {
      const t = channels.throttle ? r[channels.throttle] : 0;
      if (t > 90) {
        lambdaTrace.push({
          idx: idx++,
          lambda: channels.lambda ? r[channels.lambda] : null,
          map: channels.map ? r[channels.map] : null,
          rpm: channels.rpm ? r[channels.rpm] : null,
        });
      }
    });
  }

  const extremeStyle = (label, value, lap, color) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
        Volta {lap}
      </div>
    </div>
  );

  return (
    <div style={{ padding: 24 }}>
      {/* Header card */}
      <div style={{ ...theme.card, background: 'linear-gradient(135deg, #12121a 0%, #1a1015 100%)' }}>
        <div style={theme.cardTitle}>🔥 Análise em WOT (Pé Cheio no Acelerador)</div>
        <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16 }}>
          Dados coletados somente quando o acelerador está acima de 90%.
          Ideal para avaliar desempenho do motor, mistura e saúde dos sensores em carga máxima.
        </p>

        <div style={theme.grid(5)}>
          <MetricCard label="Lambda Médio WOT" value={global.lambda.avg.toFixed(3)} unit="" color={COLORS.green} small />
          <MetricCard label="MAP Médio WOT" value={global.map.avg.toFixed(1)} unit="kPa" color={COLORS.cyan} small />
          <MetricCard label="Bateria Média" value={global.battery.avg.toFixed(1)} unit="V" color={COLORS.blue} small />
          <MetricCard label="RPM Máx WOT" value={global.rpm.max.toFixed(0)} unit="" color={COLORS.accent} small />
          <MetricCard label="Temp Média WOT" value={global.temp.avg.toFixed(1)} unit="°C" color={COLORS.orange} small />
        </div>
      </div>

      {/* Extremes with lap reference */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>Extremos em WOT (com volta de referência)</div>
        <div style={theme.grid(5)}>
          {extremeStyle('Temp. Máxima', `${global.extremes.tempMax.value.toFixed(1)}°C`, global.extremes.tempMax.lap, COLORS.accent)}
          {extremeStyle('Pressão Óleo Mín.', `${global.extremes.oilMin.value.toFixed(2)} bar`, global.extremes.oilMin.lap, COLORS.yellow)}
          {extremeStyle('Pressão Óleo Máx.', `${global.extremes.oilMax.value.toFixed(2)} bar`, global.extremes.oilMax.lap, COLORS.green)}
          {extremeStyle('RPM Máximo', global.extremes.rpmMax.value.toFixed(0), global.extremes.rpmMax.lap, COLORS.accent)}
          {extremeStyle('Óleo Médio WOT', `${global.oil.avg.toFixed(2)} bar`, '-', COLORS.yellow)}
        </div>
      </div>

      {/* WOT% per lap */}
      <div style={theme.grid(2)}>
        <ChartCard title="% de Tempo em WOT por Volta" height={240}>
          <ResponsiveContainer>
            <BarChart data={wotBars}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="lap" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="wotPct" fill={COLORS.accent} radius={[4, 4, 0, 0]} name="WOT %" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lambda Médio em WOT por Volta" height={240}>
          <ResponsiveContainer>
            <BarChart data={wotBars}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="lap" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="lambdaAvg" fill={COLORS.green} radius={[4, 4, 0, 0]} name="Lambda" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Lambda + MAP + RPM trace during WOT */}
      <ChartCard title="Lambda, MAP e RPM durante WOT (todas as voltas)" height={300}>
        <ResponsiveContainer>
          <LineChart data={lambdaTrace}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="idx" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
            <YAxis yAxisId="lambda" tick={{ fill: COLORS.textMuted, fontSize: 10 }} domain={['auto', 'auto']} />
            <YAxis yAxisId="map" orientation="right" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Line yAxisId="lambda" type="monotone" dataKey="lambda" stroke={COLORS.green} strokeWidth={1.5} dot={false} name="Lambda" />
            <Line yAxisId="map" type="monotone" dataKey="map" stroke={COLORS.cyan} strokeWidth={1} dot={false} name="MAP" />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Detailed per-lap table */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>Detalhamento por Volta em WOT</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                {['Volta', 'WOT %', 'Lambda Méd', 'Lambda Mín', 'MAP Méd', 'RPM Máx', 'Bateria', 'Óleo Méd', 'Óleo Mín', 'Temp Méd', 'Temp Máx'].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'center', color: COLORS.textMuted, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lapNums.map((n) => {
                const s = wotData.perLap[n];
                return (
                  <tr key={n} style={{ borderBottom: `1px solid ${COLORS.border}11` }}>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: COLORS.accent }}>V{n}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>{s.wotPct.toFixed(1)}%</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.green }}>{s.lambda.avg.toFixed(3)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.green }}>{s.lambda.min.toFixed(3)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.cyan }}>{s.map.avg.toFixed(1)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.accent }}>{s.rpm.max.toFixed(0)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.blue }}>{s.battery.avg.toFixed(1)}V</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.yellow }}>{s.oil.avg.toFixed(2)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: s.oil.min < 1.5 ? COLORS.accent : COLORS.yellow }}>{s.oil.min.toFixed(2)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.orange }}>{s.temp.avg.toFixed(1)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: s.temp.max > 100 ? COLORS.accent : COLORS.orange }}>{s.temp.max.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
