import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useColors } from '@/context/ThemeContext';
import { ChartCard, CustomTooltip, MetricCard, PrintFooter } from '@/components/common';
import { makeTheme } from '@/styles/theme';

/**
 * Analisa dados em condição WOT (Wide Open Throttle / pé cheio no acelerador).
 * Filtra amostras onde throttle > 90%.
 */
function analyzeWOT(laps, channels, lapsAnalysis) {
  const results = {};
  const globalWOT = [];

  for (const [lapNum, rows] of Object.entries(laps)) {
    // Ignora voltas muito curtas
    if (lapsAnalysis && lapsAnalysis[lapNum]?.lapTime <= 5) continue;

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
      let min = arr[0], max = arr[0], sum = 0;
      for (const v of arr) { if (v < min) min = v; if (v > max) max = v; sum += v; }
      return { min, max, avg: sum / arr.length };
    };

    // Tempo absoluto em WOT estimado via proporção de amostras * lapTime
    const lapTime = lapsAnalysis?.[lapNum]?.lapTime || 0;
    const totalRows = rows.length || 1;
    const wotTime = lapTime > 0
      ? (wotRows.length / totalRows) * lapTime
      : wotRows.length * 0.1; // fallback: 10 Hz

    results[lapNum] = {
      wotSamples: wotRows.length,
      totalSamples: rows.length,
      wotPct: rows.length > 0 ? (wotRows.length / rows.length * 100) : 0,
      wotTime,
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
    let min = arr[0], max = arr[0], sum = 0;
    for (const v of arr) { if (v < min) min = v; if (v > max) max = v; sum += v; }
    return { min, max, avg: sum / arr.length };
  };

  const findExtremeLap = (channel, type) => {
    let bestLap = '-';
    let bestVal = type === 'max' ? -Infinity : Infinity;
    for (const [lap, s] of Object.entries(results)) {
      if (!s[channel]) continue;
      const val = type === 'max' ? s[channel].max : s[channel].min;
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
      oilMin:  findExtremeLap('oil',  'min'),
      oilMax:  findExtremeLap('oil',  'max'),
      rpmMax:  findExtremeLap('rpm',  'max'),
    },
  };

  return { perLap: results, global, wotTrace: globalWOT };
}

export default function WOTAnalysisTab({ data, channels, lapsAnalysis }) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);
  const wotData = useMemo(
    () => analyzeWOT(data.laps, channels, lapsAnalysis),
    [data.laps, channels, lapsAnalysis]
  );

  const lapNums = Object.keys(wotData.perLap).sort((a, b) => parseInt(a) - parseInt(b));
  const { global } = wotData;

  // Máximos globais para highlight na tabela
  const maxRPMGlobal  = lapNums.reduce((m, n) => Math.max(m, wotData.perLap[n].rpm.max  || 0), 0);
  const maxTempGlobal = lapNums.reduce((m, n) => Math.max(m, wotData.perLap[n].temp.max || 0), 0);

  // Dados para LineChart: tempo WOT e lambda por volta
  const wotLine = lapNums.map((n) => ({
    lap: `V${n}`,
    wotTime:   parseFloat(wotData.perLap[n].wotTime.toFixed(2)),
    lambdaAvg: parseFloat(wotData.perLap[n].lambda.avg.toFixed(3)),
  }));

  // Lambda + MAP trace durante WOT (todas as voltas concatenadas)
  const lambdaTrace = [];
  let idx = 0;
  for (const lapNum of Object.keys(data.laps)) {
    const rows = Array.isArray(data.laps[lapNum]) ? data.laps[lapNum] : [];
    if (rows.length === 0) continue;
    const step = Math.max(1, Math.floor(rows.length / 200));
    rows.filter((_, i) => i % step === 0).forEach((r) => {
      const t = channels.throttle ? r[channels.throttle] : 0;
      if (t > 90) {
        lambdaTrace.push({
          idx: idx++,
          lambda: channels.lambda ? r[channels.lambda] : null,
          map:    channels.map    ? r[channels.map]    : null,
        });
      }
    });
  }

  // Boost map: MAP vs RPM em WOT (binned por RPM)
  const boostMapData = useMemo(() => {
    if (!channels.map || !channels.rpm) return null;

    const BIN_SIZE = 500; // RPM por bin
    const perLap = {};

    for (const [lapNum, rows] of Object.entries(data.laps)) {
      if (lapsAnalysis && lapsAnalysis[lapNum]?.lapTime <= 5) continue;
      const wotRows = rows.filter((r) => {
        const t = channels.throttle ? r[channels.throttle] : 0;
        return t > 90;
      });
      if (wotRows.length < 5) continue;
      perLap[lapNum] = wotRows;
    }

    const allWotRows = Object.values(perLap).flat();
    if (allWotRows.length === 0) return null;

    const allRPMs = allWotRows.map((r) => r[channels.rpm]).filter((v) => v != null && !isNaN(v));
    if (allRPMs.length === 0) return null;

    const minRPM = Math.floor(Math.min(...allRPMs) / BIN_SIZE) * BIN_SIZE;
    const maxRPM = Math.ceil(Math.max(...allRPMs) / BIN_SIZE) * BIN_SIZE;

    const bins = [];
    for (let rpm = minRPM; rpm <= maxRPM; rpm += BIN_SIZE) {
      const bin = { rpm };

      // Média geral em cada bin
      const inBinAll = allWotRows.filter((r) => {
        const v = r[channels.rpm];
        return v >= rpm && v < rpm + BIN_SIZE;
      });
      if (inBinAll.length > 0) {
        const maps = inBinAll.map((r) => r[channels.map]).filter((v) => v != null && !isNaN(v));
        if (maps.length > 0) bin.avg = maps.reduce((s, v) => s + v, 0) / maps.length;
      }

      // Média por volta
      for (const [lapNum, lapRows] of Object.entries(perLap)) {
        const inBin = lapRows.filter((r) => {
          const v = r[channels.rpm];
          return v >= rpm && v < rpm + BIN_SIZE;
        });
        if (inBin.length > 0) {
          const maps = inBin.map((r) => r[channels.map]).filter((v) => v != null && !isNaN(v));
          if (maps.length > 0) bin[`lap${lapNum}`] = maps.reduce((s, v) => s + v, 0) / maps.length;
        }
      }

      if (bin.avg != null || Object.keys(bin).some((k) => k.startsWith('lap'))) {
        bins.push(bin);
      }
    }

    const lapKeys = Object.keys(perLap).sort((a, b) => parseInt(a) - parseInt(b));
    return bins.length > 0 ? { bins, lapKeys } : null;
  }, [data.laps, channels, lapsAnalysis]);

  // Guard: sem voltas com dados WOT suficientes
  if (lapNums.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ ...theme.card, textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>🏁</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>
            Nenhum dado WOT encontrado
          </div>
          <div style={{ fontSize: 13, color: COLORS.textMuted }}>
            Não foram encontradas amostras com acelerador acima de 90% nas voltas carregadas.
            <br />Verifique se o canal de throttle está mapeado corretamente.
          </div>
        </div>
        <PrintFooter />
      </div>
    );
  }

  const extremeStyle = (label, value, lap, color) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Volta {lap}</div>
    </div>
  );

  return (
    <div style={{ padding: 24 }}>
      {/* Header card */}
      <div style={{ ...theme.card, background: COLORS.bgCard }}>
        <div style={theme.cardTitle}>🔥 Análise em WOT (Pé Cheio no Acelerador)</div>
        <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16 }}>
          Dados coletados somente quando o acelerador está acima de 90%.
          Ideal para avaliar desempenho do motor, mistura e saúde dos sensores em carga máxima.
        </p>
        <div style={theme.grid(5)}>
          <MetricCard label="Lambda Médio WOT"  value={global.lambda.avg.toFixed(3)}  unit=""    color={COLORS.green}  small />
          <MetricCard label="MAP Médio WOT"      value={global.map.avg.toFixed(1)}      unit="kPa" color={COLORS.purple} small />
          <MetricCard label="Bateria Média"       value={global.battery.avg.toFixed(1)}  unit="V"   color={COLORS.blue}   small />
          <MetricCard label="RPM Máx WOT"         value={global.rpm.max.toFixed(0)}       unit=""    color={COLORS.accent} small />
          <MetricCard label="Temp Média WOT"      value={global.temp.avg.toFixed(1)}     unit="°C"  color={COLORS.orange} small />
        </div>
      </div>

      {/* Extremes */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>Extremos em WOT (com volta de referência)</div>
        <div style={theme.grid(5)}>
          {extremeStyle('Temp. Máxima',      `${global.extremes.tempMax.value.toFixed(1)}°C`,   global.extremes.tempMax.lap, COLORS.accent)}
          {extremeStyle('Pressão Óleo Mín.', `${global.extremes.oilMin.value.toFixed(2)} bar`,  global.extremes.oilMin.lap,  COLORS.yellow)}
          {extremeStyle('Pressão Óleo Máx.', `${global.extremes.oilMax.value.toFixed(2)} bar`,  global.extremes.oilMax.lap,  COLORS.green)}
          {extremeStyle('RPM Máximo',         global.extremes.rpmMax.value.toFixed(0),           global.extremes.rpmMax.lap,  COLORS.accent)}
          {extremeStyle('Óleo Médio WOT',    `${global.oil.avg.toFixed(2)} bar`,                '-',                          COLORS.yellow)}
        </div>
      </div>

      {/* Tempo WOT + Lambda — LineChart com pontos */}
      <div style={theme.grid(2)}>
        <ChartCard title="Tempo em WOT por Volta (s)" height={240}>
          <ResponsiveContainer>
            <LineChart data={wotLine}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="lap" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} domain={['auto', 'auto']} unit=" s" />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="wotTime"
                stroke={COLORS.accent}
                strokeWidth={2}
                dot={{ fill: COLORS.accent, r: 5, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 7 }}
                name="Tempo WOT (s)"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lambda Médio em WOT por Volta" height={240}>
          <ResponsiveContainer>
            <LineChart data={wotLine}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="lap" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip decimals={3} />} />
              <Line
                type="monotone"
                dataKey="lambdaAvg"
                stroke={COLORS.green}
                strokeWidth={2}
                dot={{ fill: COLORS.green, r: 5, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 7 }}
                name="Lambda Médio"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Lambda + MAP trace durante WOT */}
      <ChartCard title="Lambda e MAP durante WOT (todas as voltas)" height={300}>
        <ResponsiveContainer>
          <LineChart data={lambdaTrace}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="idx" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
            <YAxis yAxisId="lambda" tick={{ fill: COLORS.textMuted, fontSize: 10 }} domain={['auto', 'auto']} />
            <YAxis yAxisId="map" orientation="right" tick={{ fill: COLORS.textMuted, fontSize: 10 }} />
            <Tooltip content={<CustomTooltip perKeyDecimals={{ lambda: 3 }} />} />
            <Line yAxisId="lambda" type="monotone" dataKey="lambda" stroke={COLORS.green} strokeWidth={1.5} dot={false} name="Lambda" />
            <Line yAxisId="map"    type="monotone" dataKey="map"    stroke={COLORS.purple} strokeWidth={1}   dot={false} name="MAP" />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Mapa de Boost: MAP vs RPM em WOT */}
      {boostMapData && (() => {
        const lapPalette = [COLORS.blue, COLORS.green, COLORS.orange, COLORS.cyan, COLORS.yellow, COLORS.textSecondary];
        return (
          <ChartCard title="Mapa de Boost — MAP vs RPM (em WOT)" height={300}>
            <ResponsiveContainer>
              <LineChart data={boostMapData.bins} margin={{ top: 5, right: 24, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis
                  dataKey="rpm"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fill: COLORS.textMuted, fontSize: 10 }}
                  unit=" rpm"
                />
                <YAxis
                  tick={{ fill: COLORS.textMuted, fontSize: 10 }}
                  domain={['auto', 'auto']}
                  unit=" kPa"
                />
                <Tooltip content={<CustomTooltip decimals={1} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {boostMapData.lapKeys.map((n, i) => (
                  <Line
                    key={`lap${n}`}
                    type="monotone"
                    dataKey={`lap${n}`}
                    stroke={lapPalette[i % lapPalette.length]}
                    strokeWidth={1}
                    strokeOpacity={0.55}
                    dot={false}
                    name={`Volta ${n}`}
                    connectNulls
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke={COLORS.purple}
                  strokeWidth={2.5}
                  dot={false}
                  name="Média"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        );
      })()}

      {/* Tabela detalhada por volta */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>Detalhamento por Volta em WOT</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                {['Volta', 'Tempo WOT', 'Lambda Méd', 'Lambda Mín', 'MAP Méd', 'RPM Máx', 'Bateria', 'Óleo Méd', 'Óleo Mín', 'Temp Méd', 'Temp Máx'].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'center', color: COLORS.textMuted, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lapNums.map((n) => {
                const s = wotData.perLap[n];
                const isMaxRPM  = maxRPMGlobal  > 0 && s.rpm.max  === maxRPMGlobal;
                const isMaxTemp = maxTempGlobal > 0 && s.temp.max === maxTempGlobal;
                return (
                  <tr key={n} style={{ borderBottom: `1px solid ${COLORS.border}11` }}>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: COLORS.accent }}>V{n}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>{s.wotTime.toFixed(2)} s</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.green }}>{s.lambda.avg.toFixed(3)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.green }}>{s.lambda.min.toFixed(3)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.cyan }}>{s.map.avg.toFixed(1)}</td>
                    {/* RPM Máx — destaque se maior de todas as voltas */}
                    <td style={{
                      padding: '6px 10px', textAlign: 'center',
                      fontWeight: isMaxRPM ? 800 : 400,
                      color: isMaxRPM ? '#fff' : COLORS.accent,
                      background: isMaxRPM ? `${COLORS.accent}40` : 'transparent',
                      borderRadius: isMaxRPM ? 6 : 0,
                    }}>
                      {s.rpm.max.toFixed(0)}{isMaxRPM ? ' ★' : ''}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.blue }}>{s.battery.avg.toFixed(1)}V</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.yellow }}>{s.oil.avg.toFixed(2)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: s.oil.min < 1.5 ? COLORS.accent : COLORS.yellow }}>{s.oil.min.toFixed(2)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.orange }}>{s.temp.avg.toFixed(1)}</td>
                    {/* Temp Máx — destaque se maior de todas as voltas */}
                    <td style={{
                      padding: '6px 10px', textAlign: 'center',
                      fontWeight: isMaxTemp ? 800 : 400,
                      color: isMaxTemp ? '#fff' : (s.temp.max > 100 ? COLORS.accent : COLORS.orange),
                      background: isMaxTemp ? `${COLORS.accent}40` : 'transparent',
                      borderRadius: isMaxTemp ? 6 : 0,
                    }}>
                      {s.temp.max.toFixed(1)}{isMaxTemp ? ' ★' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <PrintFooter />
    </div>
  );
}
