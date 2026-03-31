/**
 * OnboardingTab — Dois painéis de onboarding independentes lado a lado.
 *
 * Cada painel tem seu próprio vídeo, mapa, gauges e player.
 * NÃO há nenhuma relação entre o painel esquerdo e o direito.
 *
 * Arquitetura de performance:
 *  • TrackBackground   → React.memo: nunca re-renderiza durante a animação
 *  • ArcGauge / GearBox / VertBar → forwardRef + useImperativeHandle:
 *      atualizados via .update(v) direto no DOM, sem setState
 *  • Loop rAF → chama updateDOM() que escreve direto nos refs do DOM
 *      → ZERO re-renders React a 60fps
 */
import React, {
  useState, useMemo, useRef, useEffect, useCallback,
  forwardRef, useImperativeHandle,
} from 'react';
import { useTheme } from '@/context/ThemeContext';
import { detectTrack } from '@/core/tracks';
import { formatLapTime } from '@/utils/formatTime';
import { detectGearRatios, buildEstimatedGearKeyframes } from '@/core/gearEstimator';
import { PrintFooter } from '@/components/common';
import { extractGoProGPS, computeSyncOffset, computeActivitySync, extractSessionSpeeds, extractSessionDynamics, detectGapsAndOffsets, detectECUTimestampGaps, detectGoProLaps, mapGoProToECULaps } from '@/core/video';
import { parseCSV } from '@/core/parsers/csvParser';
import { detectChannels } from '@/core/channelDetector';
import { routeFile } from '@/core/fileRouter';
import { analyzeAllLaps } from '@/core/lapAnalyzer';

/* ── Constants ────────────────────────────────────────────────────────── */
const MAP_W = 640;
const MAP_H = 420;
const PAD   = 14;
const PLAYBACK_RATES = [0.5, 1, 2, 5, 10];

/* ── Color gradient (azul → amarelo → vermelho) ──────────────────────── */
function lerpColor(ratio) {
  const stops = [[30,80,255],[255,220,0],[255,20,20]];
  const t = Math.min(1, Math.max(0, ratio)) * (stops.length - 1);
  const i = Math.min(Math.floor(t), stops.length - 2);
  const f = t - i;
  return `rgb(${Math.round(stops[i][0]+f*(stops[i+1][0]-stops[i][0]))},${
               Math.round(stops[i][1]+f*(stops[i+1][1]-stops[i][1]))},${
               Math.round(stops[i][2]+f*(stops[i+1][2]-stops[i][2]))})`;
}

/* ── Projection helpers ───────────────────────────────────────────────── */
function calcBounds(points) {
  if (!points.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
  }
  const pLat = (maxLat - minLat) * 0.08 || 0.001;
  const pLng = (maxLng - minLng) * 0.08 || 0.001;
  return { minLat: minLat-pLat, maxLat: maxLat+pLat, minLng: minLng-pLng, maxLng: maxLng+pLng };
}

function project(p, bounds) {
  if (!bounds) return { x: 0, y: 0 };
  return {
    x: PAD + ((p.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (MAP_W - 2*PAD),
    y: PAD + (1 - (p.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (MAP_H - 2*PAD),
  };
}

/* ── Format time ──────────────────────────────────────────────────────── */
function fmtTime(s) {
  if (!s && s !== 0) return '0:00.000';
  const m   = Math.floor(s / 60);
  const sec = (s % 60).toFixed(3).padStart(6, '0');
  return `${m}:${sec}`;
}

/* ── Keyframe helpers ─────────────────────────────────────────────────── */
function buildKeyframes(rows, colName, timeCol, lapStart) {
  if (!colName || !rows.length) return [];
  const frames = [];
  let prev = undefined;
  for (const row of rows) {
    const v = row[colName];
    if (v == null || isNaN(v)) continue;
    if (v !== prev) {
      frames.push({ t: (row[timeCol] || 0) - lapStart, v });
      prev = v;
    }
  }
  return frames;
}

function interpKF(frames, t) {
  if (!frames.length) return 0;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    frames[mid].t <= t ? (lo = mid) : (hi = mid - 1);
  }
  const f0   = frames[lo];
  const f1   = frames[Math.min(lo + 1, frames.length - 1)];
  const span = f1.t - f0.t;
  const frac = span > 0 ? Math.max(0, Math.min(1, (t - f0.t) / span)) : 0;
  return f0.v + (f1.v - f0.v) * frac;
}

function stepKF(frames, t) {
  if (!frames.length) return null;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    frames[mid].t <= t ? (lo = mid) : (hi = mid - 1);
  }
  return frames[lo].v;
}

/* ══════════════════════════════════════════════════════════════════════
   STATIC COMPONENTS (React.memo — nunca re-renderizam durante animação)
   ══════════════════════════════════════════════════════════════════════ */

const TrackBackground = React.memo(function TrackBackground({
  mapPoints, centerlinePath, colorBy, normMin, normMax, proj, isDark,
}) {
  return (
    <>
      {centerlinePath && (
        <>
          <path d={centerlinePath} fill="none" stroke={isDark ? '#2a2a2a' : '#c0c0cc'} strokeWidth={22}
            strokeLinejoin="round" strokeLinecap="round" />
          <path d={centerlinePath} fill="none" stroke={isDark ? '#1a1a1a' : '#d5d5e0'} strokeWidth={18}
            strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}
      {mapPoints.length > 1 && mapPoints.map((p, i) => {
        if (i === mapPoints.length - 1) return null;
        const a = proj(p);
        const b = proj(mapPoints[i + 1]);
        const ratio = ((p[colorBy] || 0) - normMin) / (normMax - normMin);
        return (
          <line key={i}
            x1={a.x.toFixed(1)} y1={a.y.toFixed(1)}
            x2={b.x.toFixed(1)} y2={b.y.toFixed(1)}
            stroke={lerpColor(ratio)} strokeWidth={4} strokeLinecap="round"
          />
        );
      })}
      {mapPoints.length > 0 && (() => {
        const sp = proj(mapPoints[0]);
        return (
          <circle cx={sp.x} cy={sp.y} r={5} fill="#00ff88"
            style={{ filter: 'drop-shadow(0 0 4px #00ff88)' }} />
        );
      })()}
    </>
  );
});

/* ══════════════════════════════════════════════════════════════════════
   ANIMATED COMPONENTS (forwardRef + useImperativeHandle)
   ══════════════════════════════════════════════════════════════════════ */

const ArcGauge = forwardRef(function ArcGauge(
  { max, label, color, unit, size = 130, redlineRatio = null, COLORS }, ref,
) {
  const r      = size * 0.36;
  const cx     = size / 2;
  const cy     = size * 0.54;
  const circ   = 2 * Math.PI * r;
  const arcLen = circ * (260 / 360);

  const arcFillRef = useRef(null);
  const valTextRef = useRef(null);

  useImperativeHandle(ref, () => ({
    update(value) {
      if (!arcFillRef.current || !valTextRef.current) return;
      const ratio      = Math.min(1, Math.max(0, value / (max || 1)));
      const gaugeColor = (redlineRatio && ratio >= redlineRatio) ? '#ff3333' : color;
      arcFillRef.current.setAttribute(
        'stroke-dasharray',
        `${(arcLen * ratio).toFixed(3)} ${circ.toFixed(3)}`,
      );
      arcFillRef.current.setAttribute('stroke', gaugeColor);
      arcFillRef.current.style.filter = `drop-shadow(0 0 4px ${gaugeColor}66)`;
      valTextRef.current.textContent  = Math.round(value);
    },
  }), [max, color, redlineRatio, arcLen, circ]);

  return (
    <svg width={size} height={size * 0.96} style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={COLORS?.borderLight || '#2a2a2a'}
        strokeWidth={size * 0.065} strokeDasharray={`${arcLen} ${circ}`}
        strokeLinecap="round" transform={`rotate(140, ${cx}, ${cy})`} />
      {redlineRatio && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ff333322"
          strokeWidth={size * 0.065}
          strokeDasharray={`${arcLen * (1 - redlineRatio)} ${circ}`}
          strokeDashoffset={`${-arcLen * redlineRatio}`}
          strokeLinecap="round" transform={`rotate(140, ${cx}, ${cy})`} />
      )}
      <circle ref={arcFillRef} cx={cx} cy={cy} r={r} fill="none" stroke={color}
        strokeWidth={size * 0.065} strokeDasharray={`0 ${circ}`}
        strokeLinecap="round" transform={`rotate(140, ${cx}, ${cy})`} />
      <text ref={valTextRef} x={cx} y={cy - 2} textAnchor="middle"
        dominantBaseline="middle" fill={COLORS?.textPrimary || '#fff'}
        fontSize={size * 0.21} fontWeight="800" fontFamily="monospace">
        0
      </text>
      <text x={cx} y={cy + size * 0.18} textAnchor="middle"
        fill={COLORS?.textSecondary || '#888'} fontSize={size * 0.095} fontWeight="500">{unit}</text>
      <text x={cx} y={size * 0.11} textAnchor="middle" fill={COLORS?.textSecondary || '#bbb'}
        fontSize={size * 0.092} fontWeight="700"
        style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>
        {label}
      </text>
    </svg>
  );
});

const GearBox = forwardRef(function GearBox({ COLORS, gearMode, onToggleMode, gearHasChannel, gearHasCalc }, ref) {
  const labelRef = useRef(null);

  useImperativeHandle(ref, () => ({
    update(gear, COLORS) {
      if (!labelRef.current) return;
      const label = gear === null ? '—' : gear === 0 ? 'N' : String(Math.round(gear));
      const col   = gear === null ? (COLORS?.textMuted || '#444') : gear === 0 ? (COLORS?.textSecondary || '#888') : (COLORS?.textPrimary || '#fff');
      labelRef.current.textContent = label;
      labelRef.current.style.color = col;
    },
  }), []);

  const isCalc = gearMode === 'calc' || (gearMode === 'auto' && !gearHasChannel);
  const modeLabel = isCalc ? 'Calculada' : 'Canal';
  const canToggle = gearHasChannel || gearHasCalc;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ fontSize: 11, color: COLORS?.textSecondary || '#aaa', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>
        Marcha
      </div>
      <div style={{
        width: 62, height: 62, border: `2px solid ${COLORS?.border || '#333'}`,
        borderRadius: 10, background: COLORS?.bgCard || '#111',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span ref={labelRef} style={{
          fontSize: 34, fontWeight: 900, color: COLORS?.textMuted || '#444',
          fontFamily: 'monospace', lineHeight: 1,
        }}>—</span>
      </div>
      {canToggle && (
        <button onClick={onToggleMode} style={{
          fontSize: 9, padding: '2px 6px', borderRadius: 4,
          border: `1px solid ${COLORS?.border || '#444'}`,
          background: isCalc ? (COLORS?.accent || '#0af') + '22' : 'transparent',
          color: isCalc ? (COLORS?.accent || '#0af') : (COLORS?.textSecondary || '#888'),
          cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
        }} title={isCalc ? 'Marcha estimada via RPM/Velocidade' : 'Marcha do sensor ECU'}>
          {modeLabel}
        </button>
      )}
    </div>
  );
});

const VertBar = forwardRef(function VertBar({ label, color, COLORS }, ref) {
  const fillRef = useRef(null);
  const pctRef  = useRef(null);

  useImperativeHandle(ref, () => ({
    update(value) {
      const pct = Math.min(100, Math.max(0, value || 0));
      if (fillRef.current) {
        fillRef.current.style.height    = `${pct}%`;
        fillRef.current.style.boxShadow = pct > 5 ? `0 0 8px ${color}66` : 'none';
      }
      if (pctRef.current) pctRef.current.textContent = `${Math.round(pct)}%`;
    },
  }), [color]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ fontSize: 11, color: COLORS?.textSecondary || '#aaa', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{
        width: 24, height: 90, background: COLORS?.bgCard || '#111',
        border: `1px solid ${COLORS?.border || '#2a2a2a'}`, borderRadius: 4,
        position: 'relative', overflow: 'hidden',
      }}>
        <div ref={fillRef} style={{
          position: 'absolute', bottom: 0, width: '100%',
          height: '0%', background: color, borderRadius: '3px 3px 0 0',
        }} />
      </div>
      <div ref={pctRef} style={{ fontSize: 10, color: COLORS?.textPrimary || '#fff', fontWeight: 700, fontFamily: 'monospace' }}>
        0%
      </div>
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════════════
   ONBOARDING PANEL — componente independente e autocontido
   Cada instância gerencia seu próprio vídeo, mapa, gauges e playback.
   ══════════════════════════════════════════════════════════════════════ */

function OnboardingPanel({
  selfManaged = false,
  externalData, externalChannels, externalLapsAnalysis, externalBestLapNum,
  externalVideoConfig, setExternalVideoConfig, externalIsLoaded,
  onLoadFile,
  label, accentColor,
}) {
  const { colors: COLORS, isDark } = useTheme();

  /* ── Local state (selfManaged mode) ──────────────────────────────── */
  const [localData, setLocalData]               = useState(null);
  const [localChannels, setLocalChannels]       = useState(null);
  const [localLapsAnalysis, setLocalLapsAnalysis] = useState({});
  const [localBestLapNum, setLocalBestLapNum]   = useState(null);
  const [localVideoConfig, setLocalVideoConfig] = useState(null);
  const [localFileName, setLocalFileName]       = useState('');

  /* ── Resolve effective values ────────────────────────────────────── */
  const data           = selfManaged ? localData           : externalData;
  const channels       = selfManaged ? localChannels       : externalChannels;
  const lapsAnalysis   = selfManaged ? localLapsAnalysis   : (externalLapsAnalysis || {});
  const bestLapNum     = selfManaged ? localBestLapNum     : externalBestLapNum;
  const videoConfig    = selfManaged ? localVideoConfig    : externalVideoConfig;
  const setVideoConfig = selfManaged ? setLocalVideoConfig : setExternalVideoConfig;
  const isLoaded       = selfManaged ? !!localData         : !!externalIsLoaded;
  const hasGPS         = !!(channels?.gpsLat && channels?.gpsLng);

  /* ── State do painel ─────────────────────────────────────────────── */
  const [selectedLap,  setSelectedLap]  = useState('');
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [colorBy,      setColorBy]      = useState('speed');
  const [gearMode,     setGearMode]     = useState('auto');

  const [videoSyncState, setVideoSyncState] = useState('idle');
  const [videoSyncMsg,   setVideoSyncMsg]   = useState('');
  const [isSyncing,      setIsSyncing]      = useState(false);

  /* ── Refs ────────────────────────────────────────────────────────── */
  const rafRef              = useRef(null);
  const lastWallRef         = useRef(null);
  const playbackRef         = useRef(0);
  const playbackRateRef     = useRef(1);
  const lapDurationRef      = useRef(0);

  const carHalo1Ref         = useRef(null);
  const carHalo2Ref         = useRef(null);
  const carDotRef           = useRef(null);
  const scrubberRef         = useRef(null);
  const timeCurRef          = useRef(null);
  const timeLapRef          = useRef(null);
  const lapLabelRef         = useRef(null);

  const videoRef            = useRef(null);
  const videoInputRef       = useRef(null);
  const dataFileRef         = useRef(null);
  const externalDataFileRef = useRef(null); // picker para painel externo (Onboarding 1)
  const lastVideoCorrectionRef = useRef(0);
  const lapSyncOffsetRef    = useRef(0);
  const clockDriftRef       = useRef(0);
  const gapOffsetsRef       = useRef(null);

  const rpmGaugeRef         = useRef(null);
  const spdGaugeRef         = useRef(null);
  const thrBarRef           = useRef(null);
  const brkBarRef           = useRef(null);
  const gearBoxRef          = useRef(null);

  /* ── Valid laps ──────────────────────────────────────────────────── */
  const validLaps = useMemo(
    () => data ? Object.keys(data.laps).filter((n) => (lapsAnalysis[n]?.lapTime || 0) > 5) : [],
    [data, lapsAnalysis],
  );

  // Auto-selecionar volta quando dados mudam
  useEffect(() => {
    if (!validLaps.length) { setSelectedLap(''); return; }
    const defaultLap = String(bestLapNum ?? validLaps[0] ?? '1');
    setSelectedLap(prev => validLaps.includes(prev) ? prev : defaultLap);
  }, [validLaps, bestLapNum]);

  /* ── Dados da sessão ─────────────────────────────────────────────── */
  const timeCol = channels?.time;

  const allRows = useMemo(() => {
    if (!data?.laps || !timeCol) return [];
    const rows = Object.values(data.laps).flat();
    rows.sort((a, b) => (a[timeCol] || 0) - (b[timeCol] || 0));
    return rows;
  }, [data, timeCol]);

  const sessionStart    = allRows.length ? (allRows[0][timeCol]                  || 0) : 0;
  const sessionEnd      = allRows.length ? (allRows[allRows.length - 1][timeCol] || 0) : 0;
  const sessionDuration = sessionEnd - sessionStart;

  const lapRows = useMemo(() => {
    if (!data || !selectedLap) return [];
    return data.laps[selectedLap] || [];
  }, [data, selectedLap]);

  const lapStart = lapRows.length ? (lapRows[0][timeCol] || 0) : 0;
  const lapEnd   = lapRows.length ? (lapRows[lapRows.length - 1][timeCol] || 0) : 0;

  const lapBoundaries = useMemo(() => {
    if (!data?.laps || !timeCol) return [];
    return validLaps.map((n) => {
      const rows = data.laps[n];
      if (!rows?.length) return null;
      const t0 = (rows[0][timeCol] || 0) - sessionStart;
      const t1 = (rows[rows.length - 1][timeCol] || 0) - sessionStart;
      return { num: n, start: t0, end: t1 };
    }).filter(Boolean);
  }, [data, validLaps, timeCol, sessionStart]);

  const sessionVideoOffset = useMemo(() => {
    if (videoConfig?.videoTimeBase == null) return null;
    return videoConfig.videoTimeBase + sessionStart;
  }, [videoConfig, sessionStart]);

  /* ── Gear ─────────────────────────────────────────────────────────── */
  const gearHasData = useMemo(() => {
    if (!channels?.gear || !allRows.length) return false;
    return allRows.some(r => (r[channels.gear] || 0) > 0);
  }, [allRows, channels?.gear]);

  /* ── Normalização do freio ───────────────────────────────────────── */
  const maxBrake = useMemo(() => {
    if (!allRows.length || !channels?.brake) return 100;
    let mx = 1;
    for (const r of allRows) { const v = Math.abs(r[channels.brake] || 0); if (v > mx) mx = v; }
    return mx;
  }, [allRows, channels?.brake]);

  /* ── Escala máxima para gauges ────────────────────────────────────── */
  const maxRpm = useMemo(() => {
    if (!allRows.length || !channels?.rpm) return 8000;
    let mx = 0;
    for (const r of allRows) { const v = r[channels.rpm] || 0; if (v > mx) mx = v; }
    return Math.max(mx * 1.05, 6000);
  }, [allRows, channels?.rpm]);

  const maxSpeed = useMemo(() => {
    if (!allRows.length || !channels?.gpsSpeed) return 250;
    let mx = 0;
    for (const r of allRows) { const v = r[channels.gpsSpeed] || 0; if (v > mx) mx = v; }
    return Math.max(mx * 1.1, 100);
  }, [allRows, channels?.gpsSpeed]);

  /* ── Keyframes ───────────────────────────────────────────────────── */
  const kfGpsLat   = useMemo(() => buildKeyframes(allRows, channels?.gpsLat,   timeCol, sessionStart), [allRows, channels?.gpsLat,   timeCol, sessionStart]);
  const kfGpsLng   = useMemo(() => buildKeyframes(allRows, channels?.gpsLng,   timeCol, sessionStart), [allRows, channels?.gpsLng,   timeCol, sessionStart]);
  const kfSpeed    = useMemo(() => buildKeyframes(allRows, channels?.gpsSpeed, timeCol, sessionStart), [allRows, channels?.gpsSpeed, timeCol, sessionStart]);
  const kfRpm      = useMemo(() => buildKeyframes(allRows, channels?.rpm,      timeCol, sessionStart), [allRows, channels?.rpm,      timeCol, sessionStart]);
  const kfThrottle = useMemo(() => buildKeyframes(allRows, channels?.throttle, timeCol, sessionStart), [allRows, channels?.throttle, timeCol, sessionStart]);
  const kfBrake    = useMemo(() => buildKeyframes(allRows, channels?.brake,    timeCol, sessionStart), [allRows, channels?.brake,    timeCol, sessionStart]);
  const kfAccel    = useMemo(() => buildKeyframes(allRows, channels?.accel,    timeCol, sessionStart), [allRows, channels?.accel,    timeCol, sessionStart]);
  const kfGearChannel = useMemo(() => buildKeyframes(allRows, channels?.gear,  timeCol, sessionStart), [allRows, channels?.gear,  timeCol, sessionStart]);

  /* ── Gear estimation ─────────────────────────────────────────────── */
  const gearRatios = useMemo(() => {
    if (!data || !channels?.rpm || !channels?.gpsSpeed) return null;
    const rows = Object.values(data.laps).flat();
    return detectGearRatios(rows, channels.rpm, channels.gpsSpeed);
  }, [data, channels?.rpm, channels?.gpsSpeed]);

  const kfGearCalc = useMemo(() => {
    if (!gearRatios || !allRows.length) return [];
    return buildEstimatedGearKeyframes(
      allRows, channels.rpm, channels.gpsSpeed, timeCol, sessionStart,
      gearRatios.centers, gearRatios.boundaries,
    );
  }, [allRows, channels?.rpm, channels?.gpsSpeed, timeCol, sessionStart, gearRatios]);

  const useCalcGear = gearMode === 'calc' || (gearMode === 'auto' && !gearHasData);
  const kfGear = useCalcGear ? kfGearCalc : kfGearChannel;
  const effectiveGearHasData = useCalcGear ? kfGearCalc.length > 0 : gearHasData;

  /* ── GPS points para o mapa ──────────────────────────────────────── */
  const useGoProMap = !!(videoConfig?.gpsTrack?.length && videoConfig?.videoTimeBase != null);

  const mapPointsECU = useMemo(() => {
    if (!hasGPS || !lapRows.length) return [];
    return lapRows
      .filter((_, i) => i % 3 === 0)
      .map((r) => ({
        lat: r[channels.gpsLat], lng: r[channels.gpsLng],
        speed: channels.gpsSpeed ? (r[channels.gpsSpeed] || 0) : 0,
        throttle: channels.throttle ? Math.min(100, Math.max(0, r[channels.throttle] || 0)) : 0,
        rpm: channels.rpm ? (r[channels.rpm] || 0) : 0,
      }))
      .filter((p) => p.lat && p.lng && p.lat !== 0);
  }, [lapRows, channels, hasGPS]);

  const mapPointsGoPro = useMemo(() => {
    const track = videoConfig?.gpsTrack;
    if (!track?.length) return [];
    return track
      .filter((_, i) => i % 3 === 0)
      .map(p => ({ lat: p.lat, lng: p.lon, speed: p.v, throttle: 0, rpm: 0 }))
      .filter(p => p.lat && p.lng);
  }, [videoConfig?.gpsTrack]);

  const effectiveMapPoints = useGoProMap ? mapPointsGoPro : mapPointsECU;

  const detectedTrack = useMemo(() => {
    if (!effectiveMapPoints.length) return null;
    return detectTrack(effectiveMapPoints);
  }, [effectiveMapPoints]);

  const mapBounds = useMemo(() => {
    if (detectedTrack?.bounds) return detectedTrack.bounds;
    return calcBounds(effectiveMapPoints);
  }, [detectedTrack, effectiveMapPoints]);

  const proj = useCallback((p) => project(p, mapBounds), [mapBounds]);

  const [normMin, normMax] = useMemo(() => {
    if (!effectiveMapPoints.length) return [0, 1];
    let mn = Infinity, mx = -Infinity;
    for (const p of effectiveMapPoints) {
      const v = p[colorBy] || 0;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    return [mn, mx === mn ? mn + 1 : mx];
  }, [effectiveMapPoints, colorBy]);

  const centerlinePath = useMemo(() => {
    const cl = detectedTrack?.centerline;
    if (!cl?.length || !mapBounds) return '';
    const pts = cl.map((c) => project(c, mapBounds));
    return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
  }, [detectedTrack, mapBounds]);

  /* ── GoPro GPS keyframes ─────────────────────────────────────────── */
  const kfGoProLat = useMemo(() => {
    const track = videoConfig?.gpsTrack;
    if (!track?.length) return null;
    return track.map(p => ({ t: p.t, v: p.lat }));
  }, [videoConfig?.gpsTrack]);

  const kfGoProLng = useMemo(() => {
    const track = videoConfig?.gpsTrack;
    if (!track?.length) return null;
    return track.map(p => ({ t: p.t, v: p.lon }));
  }, [videoConfig?.gpsTrack]);

  /* ── GoPro lap detection ─────────────────────────────────────────── */
  const goProLaps = useMemo(() => videoConfig?.goProLapData || null, [videoConfig?.goProLapData]);

  const goProToECUMap = useMemo(() => {
    if (!goProLaps?.laps?.length || !data || videoConfig?.videoTimeBase == null) return null;
    return mapGoProToECULaps(
      goProLaps.laps, data, channels,
      videoConfig.videoTimeBase, sessionStart,
      videoConfig.gapOffsets,
    );
  }, [goProLaps, data, channels, videoConfig?.videoTimeBase, sessionStart, videoConfig?.gapOffsets]);

  const goProLapBoundaries = useMemo(() => {
    if (!goProLaps?.laps?.length || videoConfig?.videoTimeBase == null) return null;
    const vtb = videoConfig.videoTimeBase;
    const gaps = videoConfig.gapOffsets;
    return goProLaps.laps.map(gLap => {
      let ptStart, ptEnd;
      if (gaps && gaps.length > 0) {
        const findPT = (vt) => {
          for (let i = gaps.length - 1; i >= 0; i--) {
            const pt = vt - gaps[i].offset;
            if (pt >= gaps[i].playbackTime || i === 0) return Math.max(0, pt);
          }
          return Math.max(0, vt - gaps[0].offset);
        };
        ptStart = findPT(gLap.startT);
        ptEnd   = findPT(gLap.endT);
      } else {
        const offset = vtb + sessionStart;
        const drift  = videoConfig?.clockDrift ?? 0;
        const div    = 1 + drift || 1;
        ptStart = (gLap.startT - offset) / div;
        ptEnd   = (gLap.endT   - offset) / div;
      }
      return {
        num: gLap.num,
        start: Math.max(0, ptStart),
        end: Math.max(0, ptEnd),
        ecuLap: goProToECUMap?.[gLap.num] ?? null,
      };
    });
  }, [goProLaps, videoConfig, sessionStart, goProToECUMap]);

  const effectiveBoundaries = goProLapBoundaries || lapBoundaries;

  /* ── Manter refs atualizados ─────────────────────────────────────── */
  useEffect(() => { lapDurationRef.current = sessionDuration; }, [sessionDuration]);
  useEffect(() => { lapSyncOffsetRef.current = sessionVideoOffset; }, [sessionVideoOffset]);
  useEffect(() => { clockDriftRef.current = videoConfig?.clockDrift ?? 0; }, [videoConfig?.clockDrift]);
  useEffect(() => { gapOffsetsRef.current = videoConfig?.gapOffsets ?? null; }, [videoConfig?.gapOffsets]);

  /* ── animRef ─────────────────────────────────────────────────────── */
  const animRef = useRef({});
  animRef.current = {
    kfLat: kfGpsLat, kfLng: kfGpsLng,
    kfGoProLat, kfGoProLng, useGoProMap,
    kfSpeed, kfRpm, kfThrottle, kfBrake, kfAccel, kfGear,
    mapBounds, maxBrake, maxRpm, maxSpeed,
    gearHasData: effectiveGearHasData, hasGPS, channels, COLORS,
    lapBoundaries: effectiveBoundaries, selectedLap,
    lapStart, lapEnd,
  };

  /* ── seekVideo ───────────────────────────────────────────────────── */
  const seekVideo = useCallback((playbackTime) => {
    const vid = videoRef.current;
    if (!vid?.src) return;
    if (!vid.duration || isNaN(vid.duration)) {
      vid.addEventListener('loadedmetadata', () => seekVideo(playbackTime), { once: true });
      return;
    }
    let videoTime;
    const gaps = gapOffsetsRef.current;
    if (gaps && gaps.length > 0) {
      let offset = gaps[0].offset;
      for (let i = gaps.length - 1; i >= 0; i--) {
        if (playbackTime >= gaps[i].playbackTime) { offset = gaps[i].offset; break; }
      }
      videoTime = playbackTime + offset;
    } else {
      const offset = lapSyncOffsetRef.current ?? 0;
      const drift  = clockDriftRef.current ?? 0;
      videoTime = playbackTime * (1 + drift) + offset;
    }
    const clamped = Math.max(0, Math.min(videoTime, vid.duration - 0.01));
    vid.currentTime = clamped;

    if (vid.paused) {
      const forceFrame = () => {
        if (!vid.paused) return;
        vid.play().then(() => {
          if ('requestVideoFrameCallback' in vid) {
            vid.requestVideoFrameCallback(() => { if (!vid.paused) vid.pause(); });
          } else {
            setTimeout(() => { if (!vid.paused) vid.pause(); }, 250);
          }
        }).catch(() => {});
      };
      vid.addEventListener('seeked', forceFrame, { once: true });
    }
  }, []);

  const playbackToVideoTime = useCallback((t) => {
    const gaps = gapOffsetsRef.current;
    if (gaps && gaps.length > 0) {
      let offset = gaps[0].offset;
      for (let i = gaps.length - 1; i >= 0; i--) {
        if (t >= gaps[i].playbackTime) { offset = gaps[i].offset; break; }
      }
      return t + offset;
    }
    const offset = lapSyncOffsetRef.current ?? 0;
    const drift  = clockDriftRef.current ?? 0;
    return t * (1 + drift) + offset;
  }, []);

  /* ── updateDOM ───────────────────────────────────────────────────── */
  const updateDOM = useCallback((t) => {
    const a = animRef.current;

    /* 1. Dot do carro no mapa */
    if (a.mapBounds && carDotRef.current) {
      let lat, lng;
      if (a.useGoProMap && a.kfGoProLat && a.kfGoProLng) {
        const videoTime = playbackToVideoTime(t);
        lat = interpKF(a.kfGoProLat, videoTime);
        lng = interpKF(a.kfGoProLng, videoTime);
      } else if (a.hasGPS) {
        lat = interpKF(a.kfLat, t);
        lng = interpKF(a.kfLng, t);
      }
      if (lat && lng) {
        const pos = project({ lat, lng }, a.mapBounds);
        const cx  = pos.x.toFixed(2);
        const cy  = pos.y.toFixed(2);
        carDotRef.current.setAttribute('cx', cx);
        carDotRef.current.setAttribute('cy', cy);
        carHalo1Ref.current?.setAttribute('cx', cx);
        carHalo1Ref.current?.setAttribute('cy', cy);
        carHalo2Ref.current?.setAttribute('cx', cx);
        carHalo2Ref.current?.setAttribute('cy', cy);
      }
    }

    /* 2. Scrubber + tempo */
    if (scrubberRef.current) scrubberRef.current.value = t;
    if (timeCurRef.current)  timeCurRef.current.textContent = fmtTime(t);

    /* 2b. Tempo relativo à volta */
    if (timeLapRef.current && a.lapBoundaries?.length) {
      const cur = a.lapBoundaries.find(b => t >= b.start && t <= b.end + 0.5);
      if (cur) {
        timeLapRef.current.textContent = fmtTime(t - cur.start);
        if (lapLabelRef.current) lapLabelRef.current.textContent = `V${cur.ecuLap ?? cur.num}`;
      } else {
        timeLapRef.current.textContent = '--:--.---';
        if (lapLabelRef.current) lapLabelRef.current.textContent = '';
      }
    }

    /* 3. Valores dos canais */
    const speed    = interpKF(a.kfSpeed,    t);
    const rpm      = interpKF(a.kfRpm,      t);
    const throttle = interpKF(a.kfThrottle, t);
    const gear     = (a.gearHasData && a.kfGear.length) ? stepKF(a.kfGear, t) : null;
    let   brake    = 0;
    if (a.channels?.brake)      brake = (interpKF(a.kfBrake, t) / a.maxBrake) * 100;
    else if (a.channels?.accel) brake = Math.max(0, -interpKF(a.kfAccel, t) * 100);

    /* 4. Gauges */
    rpmGaugeRef.current?.update(rpm);
    spdGaugeRef.current?.update(speed);
    thrBarRef.current?.update(throttle);
    brkBarRef.current?.update(brake);
    gearBoxRef.current?.update(gear, a.COLORS);
  }, [playbackToVideoTime]);

  /* ── Animation loop ──────────────────────────────────────────────── */
  const stopAnim = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (videoRef.current) videoRef.current.pause();
    setIsPlaying(false);
  }, []);

  const startAnim = useCallback(() => {
    if (!lapDurationRef.current) return;
    lastWallRef.current = performance.now();
    lastVideoCorrectionRef.current = 0;
    setIsPlaying(true);

    if (videoRef.current?.src) {
      videoRef.current.playbackRate = playbackRateRef.current;
      seekVideo(playbackRef.current);
      videoRef.current.play().catch(() => {});
    }

    function frame(now) {
      const elapsed = (now - lastWallRef.current) / 1000;
      lastWallRef.current = now;
      const next = Math.min(
        playbackRef.current + elapsed * playbackRateRef.current,
        lapDurationRef.current,
      );
      playbackRef.current = next;
      updateDOM(next);

      // Correção de drift do vídeo
      if (videoRef.current?.src && videoRef.current.duration) {
        if (now - lastVideoCorrectionRef.current > 500) {
          lastVideoCorrectionRef.current = now;
          let expected;
          const gaps = gapOffsetsRef.current;
          if (gaps && gaps.length > 0) {
            let gapOff = gaps[0].offset;
            for (let gi = gaps.length - 1; gi >= 0; gi--) {
              if (next >= gaps[gi].playbackTime) { gapOff = gaps[gi].offset; break; }
            }
            expected = Math.max(0, Math.min(next + gapOff, videoRef.current.duration - 0.01));
          } else {
            const offset = lapSyncOffsetRef.current ?? 0;
            const driftRate = clockDriftRef.current ?? 0;
            expected = Math.max(0, Math.min(next * (1 + driftRate) + offset, videoRef.current.duration - 0.01));
          }
          const drift = Math.abs(videoRef.current.currentTime - expected);
          if (drift > 0.15) videoRef.current.currentTime = expected;
          if (videoRef.current.playbackRate !== playbackRateRef.current) {
            videoRef.current.playbackRate = playbackRateRef.current;
          }
        }
      }

      if (next < lapDurationRef.current) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        if (videoRef.current) videoRef.current.pause();
        setIsPlaying(false);
      }
    }
    rafRef.current = requestAnimationFrame(frame);
  }, [updateDOM, seekVideo]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopAnim();
    } else {
      if (playbackRef.current >= lapDurationRef.current - 0.5) {
        const gMatch = effectiveBoundaries?.find(b => String(b.num) === String(selectedLap) || String(b.ecuLap) === String(selectedLap));
        const jumpTo = gMatch ? gMatch.start : (lapStart - sessionStart);
        playbackRef.current = jumpTo;
        updateDOM(jumpTo);
      }
      startAnim();
    }
  }, [isPlaying, stopAnim, startAnim, updateDOM, lapStart, sessionStart, effectiveBoundaries, selectedLap]);

  /* Cleanup */
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  /* Quando a volta muda — pular para o início */
  useEffect(() => {
    if (!selectedLap || !data) return;
    stopAnim();
    const gMatch = effectiveBoundaries?.find(b => String(b.num) === String(selectedLap) || String(b.ecuLap) === String(selectedLap));
    const jumpTo = gMatch ? gMatch.start : (lapStart - sessionStart);
    playbackRef.current = jumpTo;
    if (scrubberRef.current) scrubberRef.current.value = jumpTo;
    updateDOM(jumpTo);
    if (videoRef.current?.src) {
      videoRef.current.pause();
      seekVideo(jumpTo);
    }
  }, [selectedLap]); // eslint-disable-line

  /* Reposicionar vídeo quando videoTimeBase muda */
  useEffect(() => {
    if (!videoRef.current?.src || videoConfig?.videoTimeBase == null) return;
    lapSyncOffsetRef.current = sessionVideoOffset;
    clockDriftRef.current = videoConfig?.clockDrift ?? 0;
    gapOffsetsRef.current = videoConfig?.gapOffsets ?? null;
    seekVideo(playbackRef.current);
  }, [videoConfig?.videoTimeBase, videoConfig?.clockDrift, videoConfig?.gapOffsets]); // eslint-disable-line

  /* Atualizar DOM quando dados mudam */
  useEffect(() => {
    updateDOM(playbackRef.current);
  }, [mapBounds, kfGpsLat, kfGpsLng, kfGoProLat, kfGoProLng, maxRpm, maxSpeed, updateDOM]);

  /* Scrubber */
  const handleScrub = useCallback((e) => {
    const v = parseFloat(e.target.value);
    playbackRef.current = v;
    updateDOM(v);
    seekVideo(v);
  }, [updateDOM, seekVideo]);

  /* ── File loading (selfManaged only) ─────────────────────────────── */
  const handleLoadDataFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const parsed = await routeFile(file);
      const { rawText, ...parsedData } = parsed;
      const ch = detectChannels(parsedData.headers, parsedData.units || []);
      const { analysis } = analyzeAllLaps(parsedData.laps, ch);
      setLocalData(parsedData);
      setLocalChannels(ch);
      setLocalLapsAnalysis(analysis);
      setLocalFileName(file.name);
      // Find best lap
      const vLaps = Object.keys(parsedData.laps).filter(n => {
        const rows = parsedData.laps[n];
        if (!rows?.length) return false;
        const tc = ch.time;
        return tc ? ((rows[rows.length - 1][tc] || 0) - (rows[0][tc] || 0)) > 5 : false;
      });
      let bestN = vLaps[0] || null, bestT = Infinity;
      for (const n of vLaps) { const lt = analysis[n]?.lapTime; if (lt && lt > 5 && lt < bestT) { bestT = lt; bestN = n; } }
      setLocalBestLapNum(bestN);
    } catch (err) {
      console.warn('[OnboardingPanel] Erro ao carregar arquivo:', err);
    }
  }, []);

  /* ── Video handling ──────────────────────────────────────────────── */
  const handleVideoFile = useCallback(async (file) => {
    if (!file) return;
    // Sem dados: apenas carrega o vídeo sem tentar sincronizar
    if (!data || !channels) {
      const videoUrl = URL.createObjectURL(file);
      setVideoConfig(prev => ({ ...(prev || {}), videoUrl, videoTimeBase: null, fileName: file.name }));
      setVideoSyncState('manual');
      setVideoSyncMsg('Carregue os dados de telemetria para sincronizar.');
      return;
    }
    const videoUrl = URL.createObjectURL(file);
    setVideoSyncState('extracting');
    setVideoSyncMsg('Extraindo GPS do vídeo...');
    setVideoConfig(prev => ({ ...(prev || {}), videoUrl, videoTimeBase: null, fileName: file.name, goProGPS: null, confidence: 0 }));

    const getVideoDuration = () => new Promise((resolve) => {
      const tmpVid = document.createElement('video');
      tmpVid.preload = 'metadata';
      tmpVid.onloadedmetadata = () => { resolve(tmpVid.duration); tmpVid.src = ''; };
      tmpVid.onerror = () => resolve(0);
      tmpVid.src = videoUrl;
    });
    const videoDuration = await getVideoDuration();

    try {
      const { speeds, accels, gyros, gpsPoints, hasGPS: goProHasGPS, hasGPSCoords, hasAccel, hasGyro } = await extractGoProGPS(file, (p) => {
        const pct = Math.round(Math.min(100, p * 100));
        if (p < 0.5) setVideoSyncMsg(`Extraindo metadados... ${pct}%`);
        else if (p < 0.85) setVideoSyncMsg(`Decodificando sensores... ${pct}%`);
        else setVideoSyncMsg(`Processando dados... ${pct}%`);
      });

      const goProLapData = hasGPSCoords ? detectGoProLaps(gpsPoints) : null;
      const gpsTrack = hasGPSCoords ? gpsPoints : null;

      const validateOffset = (vtb) => {
        if (!videoDuration || videoDuration <= 0) return vtb;
        // Não destruir o offset quando a sessão ECU é mais longa que o vídeo.
        // O playback já faz clamp em [0, duration-0.01], então voltas sem
        // cobertura de vídeo simplesmente ficam no último frame.
        // Apenas corrigir offsets absurdamente negativos (antes do início do vídeo).
        if (vtb < -videoDuration) return 0;
        return vtb;
      };

      // ── Passo 1: Activity sync (acelerômetro) → offset aproximado ──
      // Sempre rodar primeiro para ter uma referência independente.
      // O acelerômetro NÃO sofre ambiguidade de periodicidade.
      const imuSignal = hasAccel ? accels : hasGyro ? gyros : null;
      const imuName = hasAccel ? 'acelerômetro' : 'giroscópio';
      let activityOffset = null;
      let activityResult = null;
      let actSessionTStart = 0;

      if (imuSignal && imuSignal.length >= 100) {
        const { signal: teleDynamics, tStart: tStart } = extractSessionDynamics(data, channels);
        actSessionTStart = tStart;
        if (teleDynamics.length >= 20) {
          setVideoSyncMsg(`Detectando atividade via ${imuName}...`);
          await new Promise(r => setTimeout(r, 10));
          const ecuDuration = teleDynamics[teleDynamics.length - 1].t - teleDynamics[0].t;
          activityResult = computeActivitySync(imuSignal, ecuDuration, teleDynamics);
          if (activityResult) {
            activityOffset = activityResult.offsetSeconds;
            console.log(`[videoSync] Activity offset: ${activityOffset.toFixed(1)}s`);
          }
        }
      }

      // ── Passo 2: GPS cross-correlation ──
      // Se o GPS também estiver disponível, usar para sync preciso.
      // VALIDAR contra o acelerômetro: se discordam > 30s, o GPS
      // provavelmente travou no lap errado (sinal periódico).
      // Nesse caso, corrigir o offset GPS por N × lapTime.
      if (goProHasGPS && speeds.length >= 20) {
        const { speeds: sessionSpeeds, tStart: sessionTStart } = extractSessionSpeeds(data, channels);
        if (sessionSpeeds.length >= 20) {
          setVideoSyncMsg('Sincronizando via GPS...');
          const { offsetSeconds, confidence, clockDrift } = computeSyncOffset(speeds, sessionSpeeds);
          let videoTimeBase = validateOffset(offsetSeconds - sessionTStart);

          if (confidence >= 0.4) {
            // Validar contra acelerômetro
            if (activityOffset != null) {
              const actVTB = validateOffset(activityOffset - actSessionTStart);
              const diff = Math.abs(videoTimeBase - actVTB);
              console.log(`[videoSync] GPS vtb=${videoTimeBase.toFixed(1)}s, Activity vtb=${actVTB.toFixed(1)}s, diff=${diff.toFixed(1)}s`);

              if (diff > 30) {
                // GPS travou no lap errado. Calcular lapTime mediano e corrigir.
                const lapDurations = Object.keys(data.laps)
                  .map(n => {
                    const rows = data.laps[n];
                    if (!rows?.length) return 0;
                    const tc = channels.time;
                    return tc ? ((rows[rows.length - 1][tc] || 0) - (rows[0][tc] || 0)) : 0;
                  })
                  .filter(d => d > 30)
                  .sort((a, b) => a - b);
                const medianLapTime = lapDurations.length
                  ? lapDurations[Math.floor(lapDurations.length / 2)]
                  : 0;

                if (medianLapTime > 30) {
                  const rawDiff = videoTimeBase - actVTB;
                  const N = Math.round(rawDiff / medianLapTime);
                  if (N !== 0) {
                    const corrected = videoTimeBase - N * medianLapTime;
                    console.log(`[videoSync] GPS-Activity mismatch (${diff.toFixed(0)}s). Corrigindo por ${N} volta(s) (${medianLapTime.toFixed(0)}s/volta): ${videoTimeBase.toFixed(1)}→${corrected.toFixed(1)}s`);
                    videoTimeBase = validateOffset(corrected);
                  }
                } else {
                  // Sem lap time confiável, usar activity offset diretamente
                  console.log(`[videoSync] GPS-Activity mismatch (${diff.toFixed(0)}s), sem lapTime confiável. Usando activity.`);
                  videoTimeBase = actVTB;
                }
              }
            }

            setVideoSyncMsg('Detectando stints...');
            await new Promise(r => setTimeout(r, 50));
            let gapOffsets = detectGapsAndOffsets(speeds, sessionSpeeds, offsetSeconds, sessionTStart);
            if (!gapOffsets) gapOffsets = detectECUTimestampGaps(data, channels, videoTimeBase);

            setVideoConfig(prev => ({
              ...(prev || {}), videoUrl, videoTimeBase, goProGPS: speeds, confidence,
              clockDrift: gapOffsets ? 0 : (clockDrift || 0),
              gapOffsets, gpsTrack, goProLapData,
            }));
            setVideoSyncState('synced');
            const lapMsg = goProLapData ? ` — ${goProLapData.laps.length} volta(s) GoPro` : '';
            const gapCount = gapOffsets ? gapOffsets.length - 1 : 0;
            setVideoSyncMsg(
              gapCount > 0
                ? `GPS+IMU (${Math.round(confidence * 100)}%) — ${gapCount + 1} stints${lapMsg}`
                : `GPS+IMU (${Math.round(confidence * 100)}%)${lapMsg}`
            );
            return;
          }
        }
      }

      // ── Passo 3: Fallback — usar activity sync sozinho ──
      if (activityResult) {
        const videoTimeBase = validateOffset(activityResult.offsetSeconds - actSessionTStart);
        setVideoConfig(prev => ({
          ...(prev || {}), videoUrl, videoTimeBase, goProGPS: speeds.length ? speeds : null,
          confidence: activityResult.confidence, clockDrift: 0,
          gapOffsets: activityResult.gapOffsets, gpsTrack, goProLapData,
        }));
        setVideoSyncState('synced');
        const lapMsg = goProLapData ? ` — ${goProLapData.laps.length} volta(s) GoPro` : '';
        setVideoSyncMsg(`${imuName} (${Math.round(activityResult.confidence * 100)}%)${lapMsg}`);
        return;
      }

      // Fallback: manual
      setVideoConfig(prev => ({ ...(prev || {}), videoUrl, gpsTrack, goProLapData }));
      setVideoSyncState('manual');
      setVideoSyncMsg('Ajuste manualmente.');
      setIsSyncing(true);
    } catch (err) {
      console.warn('[videoSync]', err);
      setVideoSyncState('manual');
      setVideoSyncMsg('Erro ao processar vídeo.');
      setIsSyncing(true);
    }
  }, [data, channels, setVideoConfig, sessionDuration, sessionStart]);

  const handleRemoveVideo = useCallback(() => {
    if (videoConfig?.videoUrl) URL.revokeObjectURL(videoConfig.videoUrl);
    setVideoConfig(selfManaged ? null : (prev => null));
    setVideoSyncState('idle');
    setVideoSyncMsg('');
    setIsSyncing(false);
    if (videoInputRef.current) videoInputRef.current.value = '';
  }, [videoConfig, setVideoConfig, selfManaged]);

  const handleManualSync = useCallback(() => {
    if (!videoRef.current) return;
    const absoluteTime = sessionStart + playbackRef.current;
    const videoTimeBase = videoRef.current.currentTime - absoluteTime;
    setVideoConfig(prev => ({
      ...(prev || {}), videoTimeBase, confidence: 1, clockDrift: 0, gapOffsets: null,
    }));
    setVideoSyncState('synced');
    setVideoSyncMsg('Sincronizado manualmente');
    setIsSyncing(false);
  }, [setVideoConfig, sessionStart]);

  /* ── Handle drop (data or video) ─────────────────────────────────── */
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.type.startsWith('video/')) {
      handleVideoFile(f);
    } else if (selfManaged) {
      handleLoadDataFile(f);
    }
  }, [handleVideoFile, selfManaged, handleLoadDataFile]);

  /* ─────────────────────────────── RENDER ───────────────────── */
  const noData   = !data || !validLaps.length;
  const noGPS    = !hasGPS && !useGoProMap;
  const lap1Idx  = validLaps.indexOf(selectedLap);
  const prevLap  = lap1Idx > 0 ? validLaps[lap1Idx - 1] : null;
  const nextLap  = lap1Idx < validLaps.length - 1 ? validLaps[lap1Idx + 1] : null;

  const syncBadge =
    videoSyncState === 'extracting' ? { label: '⏳ Analisando…',  color: '#aaaaaa', bg: '#1a1a1a' }
  : videoSyncState === 'synced'     ? { label: '✓ Sync', color: '#88ffaa', bg: '#0d2a14' }
  : videoSyncState === 'manual'     ? { label: '⚠ Manual',     color: '#ffcc44', bg: '#2a2600' }
  : null;

  const navBtn = (disabled) => ({
    background: 'none', border: 'none',
    color: disabled ? COLORS.border : COLORS.textMuted,
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11, padding: '2px 5px',
    opacity: disabled ? 0.4 : 1, lineHeight: 1,
    fontWeight: 700, flexShrink: 0,
  });

  const offBtn = {
    background: '#252525', border: 'none', borderRadius: 4,
    color: '#999', padding: '2px 6px', cursor: 'pointer', fontSize: 9, flexShrink: 0,
  };

  const forceFrame = (vid) => {
    if (!vid || !vid.paused) return;
    vid.play().then(() => {
      if ('requestVideoFrameCallback' in vid) {
        vid.requestVideoFrameCallback(() => { if (!vid.paused) vid.pause(); });
      } else {
        setTimeout(() => { if (!vid.paused) vid.pause(); }, 80);
      }
    }).catch(() => {});
  };

  const syncSeekVid = (delta) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = Math.max(0, Math.min(vid.currentTime + delta, (vid.duration || 999) - 0.01));
    forceFrame(vid);
  };

  const syncOverlayStyle = {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20,
    background: 'linear-gradient(to top, rgba(0,0,0,0.95) 60%, rgba(0,0,0,0.5) 85%, transparent 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'flex-end', gap: 8, padding: '40px 16px 12px', borderRadius: '0 0 12px 12px',
  };

  /* ── Layout principal do painel (sempre renderiza completo) ────────── */
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
      onDragOver={selfManaged ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
      onDrop={selfManaged ? handleDrop : undefined}
    >
      {/* Input oculto para carregar dados (selfManaged) */}
      {selfManaged && (
        <input ref={dataFileRef} type="file" accept=".csv,.dlf,.tdl,.ld,.log" style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files[0]) { handleLoadDataFile(e.target.files[0]); e.target.value = ''; } }} />
      )}
      {/* Input oculto para carregar dados do painel externo (Onboarding 1) */}
      {!selfManaged && onLoadFile && (
        <input ref={externalDataFileRef} type="file" accept=".csv,.dlf,.tdl,.ld,.log" style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files[0]) { onLoadFile(e.target.files[0]); e.target.value = ''; } }} />
      )}

      {/* ── Header: label + lap selector + map color ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <div style={{
          fontSize: 12, color: accentColor, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: 1.5, padding: '4px 10px', background: accentColor + '15',
          borderRadius: 6, border: `1px solid ${accentColor}44`, flexShrink: 0,
        }}>
          {label}
        </div>

        {/* Botão de carregar / nome do arquivo (selfManaged) */}
        {selfManaged && (
          localFileName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: COLORS.textMuted, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📂 {localFileName}
              </span>
              <button onClick={() => dataFileRef.current?.click()} style={{
                background: 'none', border: `1px solid ${accentColor}44`, borderRadius: 4,
                color: accentColor, fontSize: 9, cursor: 'pointer', padding: '2px 6px', fontWeight: 600,
              }}>
                Trocar
              </button>
            </div>
          ) : (
            <button onClick={() => dataFileRef.current?.click()} style={{
              background: accentColor + '18', border: `1px solid ${accentColor}55`, borderRadius: 6,
              color: accentColor, fontSize: 11, cursor: 'pointer', padding: '4px 12px', fontWeight: 700,
            }}>
              📂 Carregar dados
            </button>
          )
        )}

        {!noData && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: COLORS.bgCard, border: `1px solid ${accentColor}55`, borderRadius: 8, padding: '3px 8px',
          }}>
            <span style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginRight: 2 }}>V</span>
            <button style={navBtn(!prevLap)} onClick={() => prevLap && setSelectedLap(prevLap)}>◀</button>
            <select value={selectedLap} onChange={(e) => setSelectedLap(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: COLORS.textPrimary, fontSize: 12, cursor: 'pointer', outline: 'none', fontWeight: 600, maxWidth: 150 }}>
              {validLaps.map((n) => (
                <option key={n} value={n}>
                  V{n} — {formatLapTime(lapsAnalysis[n]?.lapTime || 0)}{String(n) === String(bestLapNum) ? ' ★' : ''}
                </option>
              ))}
            </select>
            <button style={navBtn(!nextLap)} onClick={() => nextLap && setSelectedLap(nextLap)}>▶</button>
            <div style={{ width: 1, height: 14, background: COLORS.border, margin: '0 4px' }} />
            <span style={{ fontSize: 13, color: accentColor, fontFamily: 'monospace', fontWeight: 700 }}>
              {formatLapTime(lapsAnalysis[selectedLap]?.lapTime || 0)}
            </span>
            {String(selectedLap) === String(bestLapNum) && (
              <span style={{ fontSize: 11, color: '#ffcc00', marginLeft: 2 }} title="Melhor volta">★</span>
            )}
          </div>
        )}

        {/* Map color */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {['speed','throttle','rpm'].map((k) => (
            <button key={k} onClick={() => setColorBy(k)} style={{
              background: colorBy === k ? COLORS.bgCardHover : 'transparent',
              border: `1px solid ${colorBy === k ? COLORS.borderLight : COLORS.border}`,
              borderRadius: 5, color: colorBy === k ? COLORS.textPrimary : COLORS.textMuted,
              fontSize: 10, padding: '3px 8px', cursor: 'pointer',
            }}>
              {{ speed: 'Vel', throttle: 'Acel', rpm: 'RPM' }[k]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Vídeo Player ── */}
      <div style={{
        background: '#050508', borderRadius: 12, border: `1px solid ${COLORS.border}`,
        minHeight: 240, position: 'relative', overflow: 'hidden',
      }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation();
          const f = e.dataTransfer.files[0];
          if (!f) return;
          if (f.type.startsWith('video/')) handleVideoFile(f);
          else if (selfManaged) handleLoadDataFile(f);
        }}
      >
        {/* Header overlay */}
        <div style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', borderRadius: 5, padding: '3px 8px', fontSize: 10, color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: accentColor, fontSize: 8 }}>●</span>
            V{selectedLap}
          </div>
          {syncBadge && (
            <div style={{ background: syncBadge.bg, border: `1px solid ${syncBadge.color}55`, borderRadius: 5, padding: '2px 8px', fontSize: 9, color: syncBadge.color, fontWeight: 600 }}>
              {syncBadge.label}
            </div>
          )}
        </div>

        <input ref={videoInputRef} type="file" accept="video/*" style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files[0]) { handleVideoFile(e.target.files[0]); e.target.value = ''; } }} />

        {videoConfig?.videoUrl ? (
          <>
            <video ref={videoRef} src={videoConfig.videoUrl}
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12 }}
              muted playsInline preload="auto" />

            {/* Bottom controls */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.88))',
              padding: '20px 10px 8px', borderRadius: '0 0 12px 12px',
            }}>
              {(videoSyncState === 'synced' || videoSyncState === 'manual') && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ color: '#666', fontSize: 8, marginRight: 2 }}>Offset:</span>
                  {[-10,-1,-0.1,-(1/30)].map((d,i) => (
                    <button key={i} onClick={() => setVideoConfig(p => ({ ...p, videoTimeBase: (p?.videoTimeBase ?? 0) + d, gapOffsets: null }))} style={offBtn}>
                      {d === -(1/30) ? '-1f' : `${d}s`}
                    </button>
                  ))}
                  <span style={{ color: '#aaa', fontSize: 9, fontFamily: 'monospace', minWidth: 44, textAlign: 'center', background: '#111', borderRadius: 3, padding: '1px 4px' }}>
                    {(videoConfig?.videoTimeBase ?? 0).toFixed(2)}s
                  </span>
                  {[(1/30),0.1,1,10].map((d,i) => (
                    <button key={i} onClick={() => setVideoConfig(p => ({ ...p, videoTimeBase: (p?.videoTimeBase ?? 0) + d, gapOffsets: null }))} style={offBtn}>
                      {d === (1/30) ? '+1f' : `+${d}s`}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {videoSyncState !== 'extracting' && (
                  <button onClick={() => { setIsSyncing(true); setVideoSyncState('manual'); }} style={{
                    background: accentColor + '20', border: `1px solid ${accentColor}66`, borderRadius: 5,
                    color: accentColor, fontSize: 10, cursor: 'pointer', padding: '4px 10px', fontWeight: 600,
                  }}>
                    🔄 Sync
                  </button>
                )}
                {videoSyncState === 'extracting' && (
                  <span style={{ fontSize: 10, color: '#aaa' }}>⏳ {videoSyncMsg}</span>
                )}
                <button onClick={handleRemoveVideo} style={{ background: 'none', border: '1px solid #553333', borderRadius: 5, color: '#ff6666', fontSize: 10, cursor: 'pointer', padding: '4px 8px' }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Sync overlay */}
            {isSyncing && (
              <div style={syncOverlayStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <div style={{ background: 'rgba(8,8,18,0.85)', borderRadius: 6, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 700, color: accentColor }}>
                      {Math.round(interpKF(kfSpeed, playbackRef.current))}
                    </span>
                    <span style={{ fontSize: 9, color: '#555' }}>km/h</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: accentColor + 'aa' }}>
                      {fmtTime(playbackRef.current)}
                    </span>
                  </div>
                  <span style={{ fontSize: 9, color: '#888' }}>Navegue o vídeo até este momento</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {[[-5,'-5s'],[-1,'-1s'],[-(1/30),'-1f']].map(([d,l]) => (
                    <button key={l} onClick={() => syncSeekVid(d)}
                      style={{ background: 'rgba(42,42,42,0.9)', border: 'none', borderRadius: 5, color: '#ccc', padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>{l}</button>
                  ))}
                  <button onClick={() => { if (!videoRef.current) return; videoRef.current.paused ? videoRef.current.play().catch(()=>{}) : videoRef.current.pause(); }}
                    style={{ background: accentColor, border: 'none', borderRadius: 6, color: '#fff', padding: '4px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>▶/⏸</button>
                  {[[1/30,'+1f'],[1,'+1s'],[5,'+5s']].map(([d,l]) => (
                    <button key={l} onClick={() => syncSeekVid(d)}
                      style={{ background: 'rgba(42,42,42,0.9)', border: 'none', borderRadius: 5, color: '#ccc', padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>{l}</button>
                  ))}
                </div>
                <input type="range" min={0} max={videoRef.current?.duration || 1} step={0.01} defaultValue={0}
                  onChange={(e) => { if (videoRef.current) { videoRef.current.currentTime = parseFloat(e.target.value); forceFrame(videoRef.current); } }}
                  style={{ width: '90%', accentColor, cursor: 'pointer' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={handleManualSync} style={{ background: '#1a8833', border: 'none', borderRadius: 6, color: '#fff', padding: '6px 18px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    ✔ Confirmar
                  </button>
                  <button onClick={() => { setIsSyncing(false); if (videoSyncState === 'manual' && (videoConfig?.confidence ?? 0) >= 0.5) setVideoSyncState('synced'); }}
                    style={{ background: 'rgba(42,42,42,0.9)', border: 'none', borderRadius: 6, color: '#aaa', padding: '6px 14px', cursor: 'pointer', fontSize: 11 }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Empty state — upload vídeo */
          <div onClick={() => videoInputRef.current?.click()} style={{
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 10, width: '100%', minHeight: 240, position: 'relative',
          }}>
            <div style={{ fontSize: 40, opacity: 0.15 }}>🎥</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#bbb', fontWeight: 600 }}>Arraste o vídeo aqui</div>
              <div style={{ fontSize: 10, color: '#555' }}>ou clique para selecionar · MP4 · MOV</div>
            </div>
            {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([vp,hp]) => (
              <div key={vp+hp} style={{
                position: 'absolute', [vp]: 12, [hp]: 12, width: 18, height: 18,
                [`border${vp[0].toUpperCase()+vp.slice(1)}`]: '2px solid #2a2a3a',
                [`border${hp[0].toUpperCase()+hp.slice(1)}`]: '2px solid #2a2a3a',
              }} />
            ))}
          </div>
        )}
      </div>

      {/* ── Mapa + Gauges ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>

        {/* Mapa */}
        <div style={{ flex: '1 1 55%', minWidth: 0, background: COLORS.bg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${COLORS.border}`, position: 'relative' }}>
          {(noData || noGPS) ? (
            <div
              onClick={() => {
                if (selfManaged) dataFileRef.current?.click();
                else if (onLoadFile) externalDataFileRef.current?.click();
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 260,
                color: COLORS.textMuted, cursor: (selfManaged || onLoadFile) ? 'pointer' : 'default',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.3 }}>{(selfManaged || onLoadFile) ? '📂' : '🗺️'}</div>
                <div style={{ fontSize: 11 }}>
                  {noData
                    ? ((selfManaged || onLoadFile) ? 'Clique para carregar telemetria' : 'Sem dados carregados')
                    : 'Sem GPS'}
                </div>
                {(selfManaged || (!selfManaged && onLoadFile)) && noData && (
                  <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 4, opacity: 0.6 }}>CSV · DLF · LD · LOG · TDL</div>
                )}
              </div>
            </div>
          ) : (
            <>
              <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width="100%" height="100%" style={{ display: 'block', minHeight: 260 }}>
                <TrackBackground mapPoints={effectiveMapPoints} centerlinePath={centerlinePath}
                  colorBy={colorBy} normMin={normMin} normMax={normMax} proj={proj} isDark={isDark} />
                <circle ref={carHalo1Ref} cx={0} cy={0} r={14} fill={accentColor} opacity={0.08} />
                <circle ref={carHalo2Ref} cx={0} cy={0} r={8}  fill={accentColor} opacity={0.18} />
                <circle ref={carDotRef}   cx={0} cy={0} r={5}  fill={accentColor} style={{ filter: `drop-shadow(0 0 6px ${accentColor})` }} />
              </svg>
              {detectedTrack && (
                <div style={{ position: 'absolute', bottom: 6, left: 10, fontSize: 10, color: COLORS.textMuted }}>
                  🏁 {detectedTrack.shortName || detectedTrack.name}
                </div>
              )}
            </>
          )}
        </div>

        {/* Gauges */}
        <div style={{
          flex: '0 0 auto', background: COLORS.bgCard, borderRadius: 12,
          border: `1px solid ${COLORS.border}`, padding: '10px 12px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArcGauge ref={spdGaugeRef} max={maxSpeed} label="Vel" color="#00ccff" unit="km/h" size={100} COLORS={COLORS} />
            <ArcGauge ref={rpmGaugeRef} max={maxRpm}   label="RPM" color="#ff8800" unit="rpm"  size={100} redlineRatio={0.85} COLORS={COLORS} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <GearBox ref={gearBoxRef} COLORS={COLORS} gearMode={gearMode} gearHasChannel={gearHasData} gearHasCalc={kfGearCalc.length > 0}
              onToggleMode={() => {
                if (gearHasData && kfGearCalc.length > 0) setGearMode(m => m==='auto'?'channel':m==='channel'?'calc':'auto');
                else if (gearHasData) setGearMode(m => m==='channel'?'auto':'channel');
                else setGearMode(m => m==='calc'?'auto':'calc');
              }} />
            <VertBar ref={thrBarRef} label="Acel."  color="#00cc44" COLORS={COLORS} />
            <VertBar ref={brkBarRef} label="Freio"  color="#ff2222" COLORS={COLORS} />
          </div>
        </div>
      </div>

      {/* ── Player ── */}
      <div style={{ background: COLORS.bgCard, borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Tempo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'monospace', color: COLORS.textMuted }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span ref={timeCurRef} style={{ color: COLORS.textSecondary }}>{fmtTime(0)}</span>
            <span style={{ color: COLORS.border }}>|</span>
            <span ref={lapLabelRef} style={{ color: accentColor, fontSize: 9, fontWeight: 700 }}></span>
            <span ref={timeLapRef} style={{ color: accentColor, fontSize: 10 }}>--:--.---</span>
          </div>
          <span style={{ fontSize: 10 }}>{fmtTime(sessionDuration)}</span>
        </div>

        {/* Timeline com marcadores */}
        <div style={{ position: 'relative', width: '100%', paddingTop: 18 }}>
          {sessionDuration > 0 && effectiveBoundaries.map((b) => {
            const leftPct = (b.start / sessionDuration) * 100;
            const isSelected = String(b.ecuLap ?? b.num) === String(selectedLap);
            const isBest = String(b.ecuLap ?? b.num) === String(bestLapNum);
            return (
              <React.Fragment key={b.num}>
                <div style={{
                  position: 'absolute', left: `${leftPct}%`, top: 18, bottom: 0,
                  width: isSelected ? 2 : 1,
                  background: isSelected ? accentColor : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
                  zIndex: 3, pointerEvents: 'none',
                }} />
                <div
                  onClick={() => setSelectedLap(String(b.ecuLap ?? b.num))}
                  title={`V${b.ecuLap ?? b.num}`}
                  style={{ position: 'absolute', left: `${leftPct}%`, top: 0, transform: 'translateX(-50%)', cursor: 'pointer', zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
                >
                  <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `5px solid ${isSelected ? accentColor : isBest ? '#ffcc00' : COLORS.textMuted}` }} />
                  <span style={{ fontSize: 8, fontWeight: isSelected ? 700 : 500, color: isSelected ? accentColor : isBest ? '#ffcc00' : COLORS.textMuted, lineHeight: 1 }}>
                    V{b.ecuLap ?? b.num}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
          <input ref={scrubberRef} type="range" min={0} max={sessionDuration || 1}
            step={sessionDuration > 0 ? sessionDuration / 10000 : 0.001} defaultValue={0}
            onChange={handleScrub} onMouseDown={() => { if (isPlaying) stopAnim(); }}
            style={{ width: '100%', accentColor, cursor: 'pointer', margin: 0, position: 'relative', zIndex: 2 }} />
        </div>

        {/* Controles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => {
            stopAnim();
            const gMatch = effectiveBoundaries?.find(b => String(b.ecuLap ?? b.num) === String(selectedLap));
            const jumpTo = gMatch ? gMatch.start : lapStart - sessionStart;
            playbackRef.current = jumpTo;
            updateDOM(jumpTo);
            if (scrubberRef.current) scrubberRef.current.value = jumpTo;
            seekVideo(jumpTo);
          }} style={{ background: COLORS.bgCardHover, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.textSecondary, fontSize: 14, padding: '5px 10px', cursor: 'pointer' }} title="Reiniciar">⏮</button>

          <button onClick={togglePlay} style={{
            background: isPlaying ? '#cc2222' : accentColor, border: 'none', borderRadius: 8,
            color: '#fff', fontSize: 16, padding: '6px 16px', cursor: 'pointer', fontWeight: 700,
            boxShadow: `0 0 10px ${isPlaying ? '#cc222244' : accentColor + '44'}`,
            minWidth: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isPlaying ? '⏸' : '▶'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
            {PLAYBACK_RATES.map((r) => (
              <button key={r} onClick={() => { playbackRateRef.current = r; setPlaybackRate(r); if (videoRef.current) videoRef.current.playbackRate = r; }}
                style={{
                  background: playbackRate === r ? COLORS.bgCardHover : 'transparent',
                  border: `1px solid ${playbackRate === r ? COLORS.borderLight : COLORS.border}`,
                  borderRadius: 5, color: playbackRate === r ? COLORS.textPrimary : COLORS.textMuted,
                  fontSize: 10, padding: '2px 6px', cursor: 'pointer',
                }}>
                {r}×
              </button>
            ))}
          </div>

          {selfManaged && (
            <button onClick={() => {
              setLocalData(null); setLocalChannels(null); setLocalLapsAnalysis({});
              setLocalBestLapNum(null); setLocalFileName('');
              handleRemoveVideo();
            }} style={{
              marginLeft: 'auto', background: 'none', border: '1px solid #553333',
              borderRadius: 5, color: '#ff6666', fontSize: 10, cursor: 'pointer', padding: '3px 8px',
            }}>
              ✕ Remover dados
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   ONBOARDING TAB — renderiza dois painéis independentes lado a lado
   ══════════════════════════════════════════════════════════════════════ */

export default function OnboardingTab({ data, channels, lapsAnalysis, bestLapNum, videoConfig, setVideoConfig, isLoaded, profiles, activeProfile, onLoadPrimaryFile }) {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <OnboardingPanel
          externalData={data}
          externalChannels={channels}
          externalLapsAnalysis={lapsAnalysis}
          externalBestLapNum={bestLapNum}
          externalVideoConfig={videoConfig}
          setExternalVideoConfig={setVideoConfig}
          externalIsLoaded={isLoaded}
          onLoadFile={onLoadPrimaryFile}
          label="Onboarding 1"
          accentColor="#4466ff"
        />
        <OnboardingPanel
          selfManaged
          label="Onboarding 2"
          accentColor="#ffaa00"
        />
      </div>
      <PrintFooter />
    </div>
  );
}
