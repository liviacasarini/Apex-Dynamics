import { useMemo } from 'react';
import { COLORS } from '@/constants/colors';
import { theme } from '@/styles/theme';

function findExtremeLap(laps, channels, channel, type) {
  let bestLap = '-';
  let bestVal = type === 'max' ? -Infinity : Infinity;

  for (const [lapNum, rows] of Object.entries(laps)) {
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

export default function ReportTab({ data, channels, lapsAnalysis, bestLapNum }) {
  const report = useMemo(() => {
    const batteryMin = findExtremeLap(data.laps, channels, 'battery', 'min');
    const rpmMax = findExtremeLap(data.laps, channels, 'rpm', 'max');
    const oilMin = findExtremeLap(data.laps, channels, 'oilPressure', 'min');
    const oilMax = findExtremeLap(data.laps, channels, 'oilPressure', 'max');
    const fuelPressMin = findExtremeLap(data.laps, channels, 'fuelPressure', 'min');
    const tempMax = findExtremeLap(data.laps, channels, 'engineTemp', 'max');
    const tempAvg = globalAvg(data.rows, channels, 'engineTemp');
    const lambdaAvg = globalAvg(
      data.rows.filter((r) => {
        const v = channels.lambda ? r[channels.lambda] : 0;
        return v > 0;
      }),
      channels,
      'lambda'
    );

    return { batteryMin, rpmMax, oilMin, oilMax, fuelPressMin, tempMax, tempAvg, lambdaAvg };
  }, [data, channels]);

  const ReportRow = ({ label, value, unit, lap, color, warning }) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 20px',
        borderBottom: `1px solid ${COLORS.border}11`,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{label}</div>
        {warning && (
          <div style={{ fontSize: 11, color: COLORS.accent, marginTop: 2 }}>⚠️ {warning}</div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: color || COLORS.textPrimary }}>
          {value}
        </span>
        <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 4 }}>{unit}</span>
        {lap && lap !== '-' && (
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
            Volta {lap}
          </div>
        )}
      </div>
    </div>
  );

  const best = lapsAnalysis[bestLapNum];

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ ...theme.card, background: 'linear-gradient(135deg, #12121a, #101825)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>📋</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Relatório da Sessão</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>{data.fileName}</div>
          </div>
        </div>
        {best && (
          <div style={{ ...theme.badge(COLORS.green), marginTop: 8 }}>
            Melhor volta: V{bestLapNum} — {best.lapTime.toFixed(3)}s
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

      {/* Print hint */}
      <div style={{ textAlign: 'center', marginTop: 24, color: COLORS.textMuted, fontSize: 12 }}>
        💡 Use Ctrl+P para imprimir este relatório
      </div>
    </div>
  );
}
