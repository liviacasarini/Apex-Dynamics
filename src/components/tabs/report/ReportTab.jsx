import { useMemo, useEffect, useState } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { formatLapTime } from '@/utils/formatTime';
import { FilterModeBar } from '@/components/common';

function findExtremeLap(laps, channels, channel, type, selectedSet) {
  let bestLap = '-';
  let bestVal = type === 'max' ? -Infinity : Infinity;

  for (const [lapNum, rows] of Object.entries(laps)) {
    if (selectedSet && !selectedSet.has(Number(lapNum))) continue;
    for (const r of rows) {
      const val = channels[channel] ? r[channels[channel]] : null;
      if (val === null || isNaN(val)) continue;
      if (type === 'max' && val > bestVal) { bestVal = val; bestLap = lapNum; }
      if (type === 'min' && val < bestVal) { bestVal = val; bestLap = lapNum; }
    }
  }

  return { lap: bestLap, value: bestVal === Infinity || bestVal === -Infinity ? 0 : bestVal };
}

function globalAvg(rows, channels, channel) {
  const vals = rows
    .map((r) => channels[channel] ? r[channels[channel]] : null)
    .filter((v) => v !== null && !isNaN(v) && v > -999);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function ReportRow({ label, value, unit, lap, color, warning }) {
  const COLORS = useColors();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${COLORS.border}11` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{label}</div>
        {warning && <div style={{ fontSize: 11, color: COLORS.accent, marginTop: 2 }}>⚠️ {warning}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: color || COLORS.textPrimary }}>{value}</span>
        <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 4 }}>{unit}</span>
        {lap && lap !== '-' && <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Volta {lap}</div>}
      </div>
    </div>
  );
}

export default function ReportTab({ data, channels, lapsAnalysis = {}, bestLapNum, filterMode, setFilterMode, hasOutLap }) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);
  const lapNums = useMemo(() =>
    Object.keys(lapsAnalysis)
      .filter((n) => lapsAnalysis[n]?.lapTime > 5)
      .map(Number)
      .sort((a, b) => a - b),
    [lapsAnalysis]
  );

  const [selectedLaps, setSelectedLaps] = useState(() => new Set(lapNums));

  useEffect(() => {
    setSelectedLaps(new Set(lapNums));
  }, [lapNums.join(',')]);

  const toggleLap = (n) => {
    setSelectedLaps((prev) => {
      const next = new Set(prev);
      if (next.has(n)) {
        if (next.size === 1) return prev; // manter ao menos 1 selecionada
        next.delete(n);
      } else {
        next.add(n);
      }
      return next;
    });
  };

  const report = useMemo(() => {
    const batteryMin  = findExtremeLap(data.laps, channels, 'battery',      'min', selectedLaps);
    const rpmMax      = findExtremeLap(data.laps, channels, 'rpm',          'max', selectedLaps);
    const oilMin      = findExtremeLap(data.laps, channels, 'oilPressure',  'min', selectedLaps);
    const oilMax      = findExtremeLap(data.laps, channels, 'oilPressure',  'max', selectedLaps);
    const fuelPressMin= findExtremeLap(data.laps, channels, 'fuelPressure', 'min', selectedLaps);
    const tempMax     = findExtremeLap(data.laps, channels, 'engineTemp',   'max', selectedLaps);

    const validLapNums = Object.keys(lapsAnalysis).filter(
      (n) => lapsAnalysis[n]?.lapTime > 5 && selectedLaps.has(Number(n))
    );
    const validRows = validLapNums.flatMap((n) => data.laps[n] || []);
    const tempAvg = globalAvg(validRows, channels, 'engineTemp');

    const lambdaAvg = globalAvg(
      validRows.filter((r) => {
        const v = channels.lambda ? r[channels.lambda] : 0;
        return v > 0.5 && v < 2.0;
      }),
      channels,
      'lambda'
    );

    return { batteryMin, rpmMax, oilMin, oilMax, fuelPressMin, tempMax, tempAvg, lambdaAvg };
  }, [data, channels, lapsAnalysis, selectedLaps]);

  // Intercepta Ctrl+P no Electron (não funciona nativamente)
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);


  const effectiveBestNum = useMemo(() => {
    if (selectedLaps.has(bestLapNum)) return bestLapNum;
    let bestN = null;
    let bestTime = Infinity;
    for (const n of selectedLaps) {
      const la = lapsAnalysis[n];
      if (la && la.lapTime > 5 && la.lapTime < bestTime) {
        bestTime = la.lapTime;
        bestN = n;
      }
    }
    return bestN;
  }, [selectedLaps, bestLapNum, lapsAnalysis]);

  const best = effectiveBestNum ? lapsAnalysis[effectiveBestNum] : null;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ ...theme.card, background: COLORS.bgCard }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>📋</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Relatório da Sessão</div>
              <div style={{ fontSize: 12, color: COLORS.textMuted }}>{data.fileName}</div>
            </div>
          </div>
          <FilterModeBar filterMode={filterMode} setFilterMode={setFilterMode} hasOutLap={hasOutLap} />
        </div>
        {best && effectiveBestNum && (
          <div style={{ ...theme.badge(COLORS.green), marginBottom: 12 }}>
            Melhor volta: V{effectiveBestNum} — {formatLapTime(best.lapTime)}
          </div>
        )}

        {/* Lap toggle chips */}
        {lapNums.length > 1 && (
          <div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>
              Voltas incluídas nos cálculos:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {lapNums.map((n) => {
                const active = selectedLaps.has(n);
                return (
                  <button
                    key={n}
                    onClick={() => toggleLap(n)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: `1px solid ${active ? COLORS.green : COLORS.border}`,
                      background: active ? `${COLORS.green}22` : 'transparent',
                      color: active ? COLORS.green : COLORS.textMuted,
                      transition: 'all 0.15s',
                    }}
                  >
                    V{n}{n === bestLapNum ? ' ⭐' : ''} — {formatLapTime(lapsAnalysis[n].lapTime)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Motor */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>🔧 Motor</div>
        <ReportRow
          label="RPM Máximo"
          value={report.rpmMax.value.toFixed(0)}
          unit="rpm"
          lap={report.rpmMax.lap}
          color={COLORS.accent}
        />
        <ReportRow
          label="Temperatura Máxima do Motor"
          value={report.tempMax.value.toFixed(1)}
          unit="°C"
          lap={report.tempMax.lap}
          color={report.tempMax.value > 100 ? COLORS.accent : COLORS.orange}
          warning={report.tempMax.value > 105 ? 'Temperatura acima do limite seguro!' : null}
        />
        <ReportRow
          label="Temperatura Média do Motor"
          value={report.tempAvg.toFixed(1)}
          unit="°C"
          color={COLORS.orange}
        />
        <ReportRow
          label="Lambda Médio"
          value={report.lambdaAvg.toFixed(3)}
          unit=""
          color={COLORS.green}
        />
      </div>

      {/* Pressões */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>⛽ Pressões</div>
        <ReportRow
          label="Pressão Mínima de Óleo"
          value={report.oilMin.value.toFixed(2)}
          unit="bar"
          lap={report.oilMin.lap}
          color={report.oilMin.value < 1.0 ? COLORS.accent : COLORS.yellow}
          warning={report.oilMin.value < 1.0 ? 'Pressão de óleo perigosamente baixa!' : null}
        />
        <ReportRow
          label="Pressão Máxima de Óleo"
          value={report.oilMax.value.toFixed(2)}
          unit="bar"
          lap={report.oilMax.lap}
          color={COLORS.yellow}
        />
        <ReportRow
          label="Pressão Mínima de Combustível"
          value={report.fuelPressMin.value.toFixed(2)}
          unit="bar"
          lap={report.fuelPressMin.lap}
          color={report.fuelPressMin.value < 2.5 ? COLORS.accent : COLORS.orange}
          warning={report.fuelPressMin.value < 2.5 ? 'Pressão de combustível baixa — checar bomba/regulador' : null}
        />
      </div>

      {/* Elétrica */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>🔋 Elétrica</div>
        <ReportRow
          label="Tensão Mínima da Bateria"
          value={report.batteryMin.value.toFixed(1)}
          unit="V"
          lap={report.batteryMin.lap}
          color={report.batteryMin.value < 12.0 ? COLORS.accent : COLORS.blue}
          warning={report.batteryMin.value < 12.0 ? 'Tensão abaixo de 12V — checar alternador/bateria' : null}
        />
      </div>

      {/* Print button */}
      <div style={{ textAlign: 'center', marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '8px 28px',
            background: COLORS.bgCard,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            color: COLORS.textSecondary,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          🖨️ Imprimir relatório
        </button>
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>ou Ctrl+P</span>
      </div>
    </div>
  );
}
