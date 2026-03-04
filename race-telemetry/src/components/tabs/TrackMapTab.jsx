import { useState, useMemo } from 'react';
import { COLORS } from '@/constants/colors';
import { theme } from '@/styles/theme';

const COLOR_MODES = [
  { key: 'speed', label: 'Velocidade' },
  { key: 'throttle', label: 'Acelerador' },
  { key: 'brake', label: 'Freio' },
  { key: 'rpm', label: 'RPM' },
];

const SVG_WIDTH = 800;
const SVG_HEIGHT = 500;

function getPointColor(point, colorBy) {
  const val = point[colorBy] || 0;

  if (colorBy === 'brake') {
    return val > 5 ? COLORS.accent : COLORS.green;
  }

  const maxV = colorBy === 'speed' ? 200 : colorBy === 'rpm' ? 8000 : 100;
  const ratio = Math.min(1, Math.max(0, val / maxV));
  const r = Math.round(6 + ratio * 224);
  const g = Math.round(214 - ratio * 170);
  const b = Math.round(160 - ratio * 100);
  return `rgb(${r},${g},${b})`;
}

export default function TrackMapTab({ data, channels, lapsAnalysis }) {
  const validLaps = useMemo(
    () => Object.keys(data.laps).filter((n) => lapsAnalysis[n]?.lapTime > 5),
    [data.laps, lapsAnalysis]
  );

  const [selectedLap, setSelectedLap] = useState(validLaps[0] || '1');
  const [colorBy, setColorBy] = useState('speed');

  const hasGPS = channels.gpsLat && channels.gpsLng;

  // Compute track points
  const { points, bounds } = useMemo(() => {
    if (!hasGPS) return { points: [], bounds: null };

    const lapRows = data.laps[selectedLap] || [];
    const step = Math.max(1, Math.floor(lapRows.length / 600));

    const pts = lapRows
      .filter((_, i) => i % step === 0)
      .map((r) => ({
        lat: r[channels.gpsLat],
        lng: r[channels.gpsLng],
        speed: channels.gpsSpeed ? r[channels.gpsSpeed] || 0 : 0,
        throttle: channels.throttle ? r[channels.throttle] || 0 : 0,
        brake: channels.brake ? r[channels.brake] || 0 : 0,
        rpm: channels.rpm ? r[channels.rpm] || 0 : 0,
      }))
      .filter((p) => p.lat && p.lng && p.lat !== 0);

    if (!pts.length) return { points: [], bounds: null };

    const minLat = Math.min(...pts.map((p) => p.lat));
    const maxLat = Math.max(...pts.map((p) => p.lat));
    const minLng = Math.min(...pts.map((p) => p.lng));
    const maxLng = Math.max(...pts.map((p) => p.lng));
    const padLat = (maxLat - minLat) * 0.1 || 0.001;
    const padLng = (maxLng - minLng) * 0.1 || 0.001;

    return {
      points: pts,
      bounds: {
        minLat: minLat - padLat,
        maxLat: maxLat + padLat,
        minLng: minLng - padLng,
        maxLng: maxLng + padLng,
      },
    };
  }, [data.laps, selectedLap, channels, hasGPS]);

  // Project lat/lng to SVG coords
  const project = (p) => {
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: ((p.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * SVG_WIDTH,
      y: SVG_HEIGHT - ((p.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * SVG_HEIGHT,
    };
  };

  if (!hasGPS) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ ...theme.card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
          <div style={{ fontSize: 16, color: COLORS.textSecondary }}>
            Dados de GPS não encontrados nesta sessão
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selectedLap}
          onChange={(e) => setSelectedLap(e.target.value)}
          style={theme.select}
        >
          {validLaps.map((n) => (
            <option key={n} value={n}>
              Volta {n} — {lapsAnalysis[n]?.lapTime.toFixed(3)}s
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 4 }}>
          {COLOR_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setColorBy(m.key)}
              style={{
                ...theme.pillButton(colorBy === m.key),
                fontSize: 11,
                padding: '5px 12px',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Track SVG */}
      <div style={{ ...theme.card, padding: 0, overflow: 'hidden' }}>
        {points.length > 0 ? (
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            style={{ width: '100%', height: 'auto', background: '#080810' }}
          >
            {points.map((p, i) => {
              if (i === 0) return null;
              const prev = project(points[i - 1]);
              const cur = project(p);
              return (
                <line
                  key={i}
                  x1={prev.x}
                  y1={prev.y}
                  x2={cur.x}
                  y2={cur.y}
                  stroke={getPointColor(p, colorBy)}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              );
            })}
            {/* Start marker */}
            {(() => {
              const s = project(points[0]);
              return (
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={6}
                  fill={COLORS.green}
                  stroke="#fff"
                  strokeWidth={2}
                />
              );
            })()}
          </svg>
        ) : (
          <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
            Sem dados GPS para esta volta
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          marginTop: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textMuted }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.green }} />
          Início / Fim
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textMuted }}>
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: colorBy === 'brake'
                ? `linear-gradient(90deg, ${COLORS.green}, ${COLORS.accent})`
                : 'linear-gradient(90deg, #06d6a0, #ffd166, #e63946)',
            }}
          />
          {colorBy === 'speed'
            ? 'Baixa → Alta velocidade'
            : colorBy === 'brake'
            ? 'Sem freio → Frenando'
            : 'Baixo → Alto'}
        </div>
      </div>
    </div>
  );
}
