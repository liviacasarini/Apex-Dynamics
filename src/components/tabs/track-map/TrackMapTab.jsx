import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { LAP_COLORS } from '@/constants/colors';
import { makeTheme } from '@/styles/theme';
import { formatLapTime } from '@/utils/formatTime';
import { routeFile, FILE_ACCEPT_STRING, isProprietaryFormat, getFormatInfo } from '@/core/fileRouter';
import { detectChannels } from '@/core/channelDetector';
import { parseCSV } from '@/core/parsers/csvParser';
import { detectTrack } from '@/core/tracks';
import { analyzeRacingLine, projectAllDriverPoints, detectCornersFromCenterline } from '@/core/racingLineAnalyzer.js';
import { PrintFooter } from '@/components/common';

const COLOR_MODES = [
  { key: 'speed',    label: 'Velocidade' },
  { key: 'throttle', label: 'Acelerador' },
  { key: 'rpm',      label: 'RPM' },
];

const SVG_WIDTH  = 800;
const SVG_HEIGHT = 500;

/* ── Visualização track-relative ──────────────────────────────────────────
 * TRACK_BAND_PX: largura total da banda da pista no SVG (pixels).
 *   Representa visualmente TRACK_WIDTH_M metros reais.
 *   Exageramos a escala para que a posição lateral (esq/dir) seja visível
 *   ao nível do circuito inteiro — igual às imagens de telemetria F1.
 * TRACK_WIDTH_M: largura real da pista em metros (Interlagos ≈ 14 m).
 * M_TO_PX: fator de conversão metros → pixels dentro da banda.
 */
const TRACK_BAND_PX  = 26;
const TRACK_WIDTH_M  = 14;
const M_TO_PX        = TRACK_BAND_PX / TRACK_WIDTH_M;

/* ── Modo circuito: coordenadas GPS → pixels via bounding box real ──────
 * Interlagos BOUNDS (OSM): lat [-23.7100, -23.6940], lng [-46.7020, -46.6900]
 * Rotação 90° horária: lat → X (sul=esq, norte=dir), lng → Y (oeste=cima, leste=baixo).
 * Isso transforma o circuito portrait em landscape, preenchendo melhor o canvas 800×500. */
const CIRCUIT_BOUNDS_MINLAT = -23.7100;
const CIRCUIT_BOUNDS_MAXLAT = -23.6940;
const CIRCUIT_BOUNDS_MINLNG = -46.7020;
const CIRCUIT_BOUNDS_MAXLNG = -46.6900;
const CIRCUIT_PAD            = 12;
const _cLatM = (CIRCUIT_BOUNDS_MAXLAT - CIRCUIT_BOUNDS_MINLAT) * 111000; // ≈ 1776 m  → eixo X
const _cLngM = (CIRCUIT_BOUNDS_MAXLNG - CIRCUIT_BOUNDS_MINLNG) * 101700; // ≈ 1220 m  → eixo Y
// Escalas independentes para X e Y — preenche todo o canvas (igual ao project())
const CIRCUIT_GPS_SCALE_X  = (SVG_WIDTH  - 2 * CIRCUIT_PAD) / _cLatM;
const CIRCUIT_GPS_SCALE_Y  = (SVG_HEIGHT - 2 * CIRCUIT_PAD) / _cLngM;

/** Converte GPS (lat, lng) → pixel (x, y) no canvas 800×500 (rotação 90° horária). */
function gpsToCircuitSvg(lat, lng) {
  return {
    x: CIRCUIT_PAD + (lat - CIRCUIT_BOUNDS_MINLAT) * 111000 * CIRCUIT_GPS_SCALE_X,
    y: CIRCUIT_PAD + (lng - CIRCUIT_BOUNDS_MINLNG) * 101700 * CIRCUIT_GPS_SCALE_Y,
  };
}

/* Tooltip dimensions */
const TOOLTIP_W = 150;
const TOOLTIP_H = 90;

/** Cores para os trechos de pista — alto contraste entre setores adjacentes */
const SEGMENT_COLORS = [
  '#ff2d2d', '#00e5ff', '#ffdd00', '#ff6600', '#00ff88',
  '#cc44ff', '#ff69b4', '#00bfff', '#ff4500', '#39ff14',
];

/** Cores de alta distinção para sessões no mapa */
const SESSION_COLORS = [
  '#e63946', '#118ab2', '#8338ec', '#06d6a0', '#f77f00',
  '#00b4d8', '#ef476f', '#ffd166', '#2d6a4f', '#e9c46a',
];

/**
 * Interpola entre 5 stops de cor para um ratio [0..1].
 * Stops: Azul(lento) → Ciano → Verde → Amarelo → Vermelho(rápido)
 */
function lerpGradient(ratio) {
  const stops = [
    [30,  80, 255],   // azul   — lento
    [255, 220,  0],   // amarelo — médio
    [255,  20,  20],  // vermelho — rápido
  ];
  const t  = Math.min(1, Math.max(0, ratio)) * (stops.length - 1);
  const i  = Math.min(Math.floor(t), stops.length - 2);
  const f  = t - i;
  return `rgb(${Math.round(stops[i][0] + f*(stops[i+1][0]-stops[i][0]))},${
               Math.round(stops[i][1] + f*(stops[i+1][1]-stops[i][1]))},${
               Math.round(stops[i][2] + f*(stops[i+1][2]-stops[i][2]))})`;
}

function getPointColor(point, colorBy, colors, norm) {
  const val = point[colorBy] || 0;
  if (colorBy === 'brake') {
    // Freio: azul (sem freio) → vermelho (freio total)
    const ratio = Math.min(1, Math.max(0, val / 100));
    if (ratio < 0.05) return '#06d6a0';
    return lerpGradient(ratio);
  }
  // Speed / throttle / rpm — normalizado pelo min/max real da sessão
  const minV = norm?.min ?? 0;
  const maxV = norm?.max ?? (colorBy === 'speed' ? 200 : colorBy === 'rpm' ? 8000 : 100);
  const range = maxV - minV || 1;
  const ratio = Math.min(1, Math.max(0, (val - minV) / range));
  return lerpGradient(ratio);
}

function extractPoints(lapRows, channels, step) {
  return lapRows
    .filter((_, i) => i % step === 0)
    .map((r) => {
      let brake = 0;
      if (channels.brake) {
        brake = r[channels.brake] || 0;
      } else if (channels.accel) {
        brake = Math.max(0, -(r[channels.accel] || 0) * 100);
      }
      return {
        lat:      r[channels.gpsLat],
        lng:      r[channels.gpsLng],
        speed:    channels.gpsSpeed ? r[channels.gpsSpeed] || 0 : 0,
        throttle: channels.throttle ? Math.min(100, Math.max(0, r[channels.throttle] || 0)) : 0,
        brake,
        rpm:      channels.rpm      ? r[channels.rpm]      || 0 : 0,
      };
    })
    .filter((p) => p.lat && p.lng && p.lat !== 0);
}

function calcBounds(pointsArray) {
  const allPts = pointsArray.flat();
  if (!allPts.length) return null;
  let minLat = allPts[0].lat, maxLat = allPts[0].lat;
  let minLng = allPts[0].lng, maxLng = allPts[0].lng;
  for (const p of allPts) {
    if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
  }
  const padLat = (maxLat - minLat) * 0.08 || 0.001;
  const padLng = (maxLng - minLng) * 0.08 || 0.001;
  return {
    minLat: minLat - padLat, maxLat: maxLat + padLat,
    minLng: minLng - padLng, maxLng: maxLng + padLng,
  };
}

function project(p, bounds) {
  if (!bounds) return { x: 0, y: 0 };
  return {
    x: ((p.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * SVG_WIDTH,
    y: SVG_HEIGHT - ((p.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * SVG_HEIGHT,
  };
}

function fmtValue(key, val) {
  if (val == null) return '—';
  switch (key) {
    case 'speed':    return `${val.toFixed(1)} km/h`;
    case 'throttle': return `${val.toFixed(1)} %`;
    case 'brake':    return `${val.toFixed(2)} ${val > 10 ? 'bar' : '%'}`;
    case 'rpm':      return `${Math.round(val)} rpm`;
    default:         return val.toFixed(2);
  }
}

function findNearest(points, mx, my, bounds, threshold = 55, projFn = null) {
  let nearest = null;
  let minDist = threshold;
  for (const p of points) {
    const { x, y } = projFn ? projFn(p) : project(p, bounds);
    const d = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
    if (d < minDist) { minDist = d; nearest = { projX: x, projY: y, data: p }; }
  }
  return nearest;
}

function findNearestWithIndex(points, mx, my, bounds, threshold = 55, projFn = null) {
  let nearest = null;
  let minDist = threshold;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const { x, y } = projFn ? projFn(p) : project(p, bounds);
    const d = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
    if (d < minDist) { minDist = d; nearest = { projX: x, projY: y, data: p, index: i }; }
  }
  return nearest;
}

/**
 * Em modo circuito: snap visual à centerline do traçado (não ao GPS do piloto).
 * Passo 1 — acha o ponto da centerline mais próximo ao clique (coords SVG).
 * Passo 2 — acha o ponto do driver mais próximo a esse ponto da centerline (GPS).
 * Retorna o boundary com posição SVG da centerline + índice do driver (para corte de segmento).
 */
function findNearestOnTrackWithIndex(centerline, driverPoints, mx, my, threshold = 30, bounds = null) {
  // Projeta o cursor sobre cada segmento da polyline para obter o ponto exato no traçado.
  const proj = (p) => bounds ? project(p, bounds) : gpsToCircuitSvg(p.lat, p.lng);
  let minDist = threshold;
  let bestPt = null;   // ponto interpolado no segmento (GPS + SVG)
  let bestClIdx = -1;  // índice do segmento inicial

  for (let ci = 0; ci < centerline.length; ci++) {
    const A = centerline[ci];
    const B = centerline[(ci + 1) % centerline.length];
    const asvg = proj(A);
    const bsvg = proj(B);
    const dx = bsvg.x - asvg.x, dy = bsvg.y - asvg.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((mx - asvg.x) * dx + (my - asvg.y) * dy) / len2)) : 0;
    const px = asvg.x + t * dx, py = asvg.y + t * dy;
    const d = Math.sqrt((px - mx) ** 2 + (py - my) ** 2);
    if (d < minDist) {
      minDist = d;
      bestPt = { lat: A.lat + t * (B.lat - A.lat), lng: A.lng + t * (B.lng - A.lng), svgX: px, svgY: py, t };
      bestClIdx = ci;
    }
  }
  if (!bestPt) return null;

  // Snap para o ponto discreto mais próximo da centerline (A ou B)
  // para que o clIndex coincida exatamente com a fronteira de cor do setor.
  const snappedClIdx = bestPt.t >= 0.5
    ? (bestClIdx + 1) % centerline.length
    : bestClIdx;
  const snappedPt = centerline[snappedClIdx];
  const snappedSvg = proj(snappedPt);

  // Acha o ponto do driver mais próximo ao ponto snapped (GPS)
  let minGpsDist = Infinity;
  let driverIdx = -1;
  for (let i = 0; i < driverPoints.length; i++) {
    const p = driverPoints[i];
    const dlat = parseFloat(p.lat) - snappedPt.lat;
    const dlng = parseFloat(p.lng) - snappedPt.lng;
    const gd = dlat * dlat + dlng * dlng;
    if (gd < minGpsDist) { minGpsDist = gd; driverIdx = i; }
  }
  if (driverIdx < 0) return null;

  return {
    projX: snappedSvg.x, projY: snappedSvg.y,
    data: { lat: snappedPt.lat, lng: snappedPt.lng },
    index: driverIdx,
    clIndex: snappedClIdx,
  };
}

function avgArr(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Encontra o índice da row mais próxima de uma coordenada GPS */
function findClosestRowIdx(lapRows, targetLat, targetLng, latCh, lngCh) {
  let minDist = Infinity;
  let idx = 0;
  for (let i = 0; i < lapRows.length; i++) {
    const lat = lapRows[i][latCh];
    const lng = lapRows[i][lngCh];
    if (!lat || !lng) continue;
    const d = (lat - targetLat) ** 2 + (lng - targetLng) ** 2;
    if (d < minDist) { minDist = d; idx = i; }
  }
  return idx;
}

function fmtSegTime(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds.toFixed(3)}s`;
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

function shortName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '');
  return base.length > 14 ? base.slice(0, 10) + '…' : base;
}

/* Loop-based helpers */
function arrMax(arr) {
  if (!arr.length) return null;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}
function arrMin(arr) {
  if (!arr.length) return null;
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m;
}

/* ─── SessionStatsTable ──────────────────────────────────────────────────── */
function SessionStatsTable({ reports, title, COLORS, theme }) {
  if (!reports || !reports.length) return null;
  return (
    <div style={{ ...theme.card, padding: 0, overflow: 'hidden', marginTop: 16 }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${COLORS.border}` }}>
        <span style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
          {title}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: `${COLORS.bg}cc` }}>
              {[
                { label: 'Sessão',         color: COLORS.textMuted,     align: 'left' },
                { label: 'Voltas',         color: COLORS.textMuted                    },
                { label: 'Vel. Máx\nkm/h', color: COLORS.green                       },
                { label: 'Vel. Mín\nkm/h', color: COLORS.cyan                        },
                { label: 'RPM Máx',        color: COLORS.orange                      },
                { label: 'RPM Mín',        color: COLORS.blue                        },
                { label: 'Acel. Máx\n%',   color: COLORS.purple                      },
                { label: 'Acel. Mín\n%',   color: COLORS.textSecondary               },
              ].map(({ label, color, align }, ci) => (
                <th key={ci} style={{
                  padding: '8px 10px', textAlign: align || 'center',
                  color, fontSize: 10, fontWeight: 600,
                  borderBottom: `1px solid ${COLORS.border}`,
                  whiteSpace: 'pre-line', lineHeight: 1.3,
                }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.map((r, ri) => {
              const color = r.id === 'main' ? COLORS.green : SESSION_COLORS[ri % SESSION_COLORS.length];
              return (
                <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                  <td style={{ padding: '8px 12px', borderLeft: `3px solid ${color}` }}>
                    <span style={{ color: COLORS.textPrimary, fontSize: 12, fontWeight: 600 }}>{shortName(r.fileName)}</span>
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.textSecondary, fontWeight: 600 }}>{r.laps}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.green,         fontWeight: 600 }}>{r.speed.max    != null ? r.speed.max.toFixed(1)    : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.cyan,          fontWeight: 600 }}>{r.speed.min    != null ? r.speed.min.toFixed(1)    : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.orange,        fontWeight: 600 }}>{r.rpm.max      != null ? Math.round(r.rpm.max)      : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.blue,          fontWeight: 600 }}>{r.rpm.min      != null ? Math.round(r.rpm.min)      : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.purple,        fontWeight: 600 }}>{r.throttle.max != null ? r.throttle.max.toFixed(1) : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.textSecondary, fontWeight: 600 }}>{r.throttle.min != null ? r.throttle.min.toFixed(1) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function TrackMapTab({
  data, channels, lapsAnalysis,
  extraSessions = [],
  addExtraSession,
  removeExtraSession,
  activeProfile,
  profiles = [],
  activeProfileId,
  saveTrackSegments,
  deleteTrackSegments,
  trackTemplates = {},
  saveTrackTemplate,
  deleteTrackTemplate,
  saveTrackAnnotations,
  pendingAnnotation,
  onAnnotationLoaded,
  segmentBoundaries: segmentBoundariesProp = [],
  setSegmentBoundaries: setSegmentBoundariesProp,
}) {
  const { colors: COLORS, isDark } = useTheme();
  const theme = makeTheme(COLORS);
  /* segmentBoundaries vem do App (persiste entre trocas de aba) */
  const [_localBoundaries, _setLocalBoundaries] = useState([]);
  const segmentBoundaries = setSegmentBoundariesProp ? segmentBoundariesProp : _localBoundaries;
  const setSegmentBoundaries = setSegmentBoundariesProp ?? _setLocalBoundaries;

  const validLaps = useMemo(
    () => data ? Object.keys(data.laps).filter((n) => lapsAnalysis[n]?.lapTime > 5) : [],
    [data, lapsAnalysis]
  );

  const [overlayMode,        setOverlayMode]        = useState(false);
  const [selectedLap,        setSelectedLap]        = useState(validLaps[0] || '1');
  const [overlayLaps,        setOverlayLaps]        = useState(() => validLaps.slice(0, 3).map(n => ({ sessionId: 'main', lapNum: n })));
  const [colorBy,            setColorBy]            = useState('speed');
  const [overlayColorMode,   setOverlayColorMode]   = useState('lap');
  const [hoverInfo,          setHoverInfo]          = useState(null);
  const [extraLoading,       setExtraLoading]       = useState(false);
  const [extraError,         setExtraError]         = useState(null);
  const [pendingLapRestore,  setPendingLapRestore]  = useState(null);
  const [annotationLap,      setAnnotationLap]      = useState(null);
  const [segmentMode,        setSegmentMode]        = useState(false);
  const [selectedBoundaryIdx, setSelectedBoundaryIdx] = useState(null);
  const [isDraggingBoundary,  setIsDraggingBoundary]  = useState(false);
  const [showSaveInput,      setShowSaveInput]      = useState(false);
  const [saveSegmentName,    setSaveSegmentName]    = useState('');
  const [saveHint,           setSaveHint]           = useState('');
  const [segmentNames,       setSegmentNames]       = useState({});
  const [segmentComments,    setSegmentComments]    = useState({});
  const [editingSegName,     setEditingSegName]     = useState(null);
  const [tempSegName,        setTempSegName]        = useState('');
  const [clickedSegmentNum,  setClickedSegmentNum]  = useState(null);
  const [clickPopupPos,      setClickPopupPos]      = useState({ x: 0, y: 0 });
  const [hoveredSegmentNum,  setHoveredSegmentNum]  = useState(null);
  const [hoverSegPos,        setHoverSegPos]        = useState({ x: 0, y: 0 });
  const [generalNotes,       setGeneralNotes]       = useState('');
  const [loadedSegmentId,         setLoadedSegmentId]         = useState(null);
  const [loadedSegmentName,       setLoadedSegmentName]       = useState('');
  const [annotationName,          setAnnotationName]          = useState('');
  const [editingAnnotationName,   setEditingAnnotationName]   = useState(false);
  const [tempAnnotationName,      setTempAnnotationName]      = useState('');
  const [annotationSaved,         setAnnotationSaved]         = useState(false);
  const [saveAnnotationProfileId, setSaveAnnotationProfileId] = useState(null);
  const [saveAnnotationGroupId,   setSaveAnnotationGroupId]   = useState(null);

  const svgRef = useRef(null);
  const mapContainerRef = useRef(null);
  const extraFileRef = useRef(null);
  const hasGPS = channels.gpsLat && channels.gpsLng;

  /* ── Track Reference ─────────────────────────────────────────────────── */
  const [detectedTrack,      setDetectedTrack]      = useState(null);
  const [showRefLine,        setShowRefLine]        = useState(true);
  const [showAnalysisPanel,  setShowAnalysisPanel]  = useState(false);
  const [analysisLap,        setAnalysisLap]        = useState(null); // null = selectedLap

  // Anotações visíveis somente na volta anotada e fora do modo overlay
  const showAnnotations = !overlayMode && (annotationLap == null || selectedLap === String(annotationLap));

  const isOverlaySelected = (sessionId, lapNum) =>
    overlayLaps.some(l => l.sessionId === sessionId && l.lapNum === lapNum);

  const toggleOverlayLap = (sessionId, lapNum) => {
    setOverlayLaps(prev => {
      const exists = prev.some(l => l.sessionId === sessionId && l.lapNum === lapNum);
      if (exists) return prev.filter(l => !(l.sessionId === sessionId && l.lapNum === lapNum));
      return [...prev, { sessionId, lapNum }];
    });
  };

  /* ── Carregar arquivo extra ── */
  const handleExtraFile = useCallback(async (file) => {
    if (!file || !addExtraSession) return;
    setExtraLoading(true);
    setExtraError(null);
    try {
      await addExtraSession(file);
    } catch (err) {
      setExtraError(err.message || 'Erro ao processar arquivo');
    } finally {
      setExtraLoading(false);
    }
  }, [addExtraSession]);

  // ── Single lap (sempre computado para que "Carregar Trecho" funcione em qualquer modo) ──
  const singleData = useMemo(() => {
    if (!hasGPS || !data) return { points: [], bounds: null };
    const rows = data.laps[selectedLap] || [];
    const step = Math.max(1, Math.floor(rows.length / 600));
    const pts  = extractPoints(rows, channels, step);
    return { points: pts, bounds: calcBounds([pts]) };
  }, [data, selectedLap, channels, hasGPS]);

  // ── Overlay — inclui voltas da sessão principal e de sessões extras ──
  const overlayPointSets = useMemo(() => {
    if (!hasGPS || !overlayMode || !data) return [];
    return overlayLaps.map(({ sessionId, lapNum }) => {
      let rows, ch;
      if (sessionId === 'main') {
        rows = data.laps[lapNum] || [];
        ch   = channels;
      } else {
        const sess = extraSessions.find(s => s.sessionId === sessionId);
        if (!sess) return [];
        rows = sess.data.laps[lapNum] || [];
        ch   = sess.channels;
      }
      const step = Math.max(1, Math.floor(rows.length / 600));
      return extractPoints(rows, ch, step);
    });
  }, [data, overlayLaps, channels, hasGPS, overlayMode, extraSessions]);

  const overlayBounds = useMemo(
    () => (overlayMode ? calcBounds(overlayPointSets) : null),
    [overlayPointSets, overlayMode]
  );

  /* ── Salvar / carregar trechos ────────────────────────────────────────── */
  const handleSaveSegments = useCallback(() => {
    if (!saveTrackTemplate || !saveSegmentName.trim()) return;
    const trackId = detectedTrack?.id || 'unknown';
    const result = saveTrackTemplate(trackId, saveSegmentName.trim(), segmentBoundaries, segmentNames);
    if (result?.ok) { setShowSaveInput(false); setSaveSegmentName(''); setSaveHint(''); }
  }, [saveTrackTemplate, saveSegmentName, segmentBoundaries, segmentNames, detectedTrack]);

  const handleLoadSegments = useCallback((savedSeg) => {
    if (!singleData.points.length || !singleData.bounds) return;
    const remapped = savedSeg.boundaries.map(({ lat, lng }) => {
      let minDist = Infinity;
      let result  = null;
      for (let i = 0; i < singleData.points.length; i++) {
        const p = singleData.points[i];
        const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
        if (d < minDist) {
          minDist = d;
          const { x, y } = hasCircuit ? project({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }, circuitBounds) : project(p, singleData.bounds);
          result = { projX: x, projY: y, data: p, index: i };
        }
      }
      return result;
    }).filter(Boolean);
    if (remapped.length > 0) {
      setSegmentBoundaries(remapped);
      setSegmentNames(savedSeg.segmentNames || {});
      setEditingSegName(null);
      setClickedSegmentNum(null);
      // Restaurar anotações salvas para este template (se houver)
      const annotation = (activeProfile?.trackAnnotations || []).find((a) => a.segmentId === savedSeg.id);
      setSegmentComments(annotation?.segmentComments || {});
      setGeneralNotes(annotation?.generalNotes || '');
      setAnnotationLap(annotation?.lapNum ?? null);
      // Registrar template carregado
      setLoadedSegmentId(savedSeg.id);
      setLoadedSegmentName(savedSeg.name);
      setAnnotationName(annotation?.annotationName || savedSeg.name);
      setAnnotationSaved(false);
    }
  }, [singleData, activeProfile]);

  /* ── Salvar anotações (vinculadas ao template carregado) ──────────────── */
  const handleSaveAnnotations = useCallback(() => {
    if (!saveTrackAnnotations || !loadedSegmentId) return;
    const targetProfile = saveAnnotationProfileId || activeProfileId;
    const result = saveTrackAnnotations(loadedSegmentId, loadedSegmentName, annotationName, segmentComments, generalNotes, targetProfile, selectedLap, data?.fileName, saveAnnotationGroupId);
    if (result?.ok) {
      setAnnotationLap(selectedLap);
      setAnnotationSaved(true);
      setTimeout(() => setAnnotationSaved(false), 2500);
    }
  }, [saveTrackAnnotations, loadedSegmentId, loadedSegmentName, annotationName, segmentComments, generalNotes, saveAnnotationProfileId, activeProfileId, selectedLap, data?.fileName, saveAnnotationGroupId]);

  /* ── Carregar anotação via ProfilesTab ───────────────────────────────── */
  useEffect(() => {
    if (!pendingAnnotation) return;
    setSegmentComments(pendingAnnotation.segmentComments || {});
    setGeneralNotes(pendingAnnotation.generalNotes || '');
    setAnnotationLap(pendingAnnotation.lapNum ?? null);
    setLoadedSegmentId(pendingAnnotation.segmentId);
    setLoadedSegmentName(pendingAnnotation.segmentName);
    setAnnotationName(pendingAnnotation.annotationName || pendingAnnotation.segmentName);
    setAnnotationSaved(false);
    setSaveAnnotationGroupId(pendingAnnotation.groupId ?? null);
    setClickedSegmentNum(null);
    setEditingSegName(null);
    // Restaura volta selecionada — usa pendingLapRestore para aguardar validLaps
    if (pendingAnnotation.lapNum != null) {
      const lapStr = String(pendingAnnotation.lapNum);
      if (validLaps.includes(lapStr)) {
        setSelectedLap(lapStr);
      } else {
        // validLaps ainda não foi populado (race condition); guardar para aplicar depois
        setPendingLapRestore(lapStr);
      }
    }
    // Tenta restaurar template de trechos se disponível e se GPS carregado
    const template = (activeProfile?.trackSegments || []).find((s) => s.id === pendingAnnotation.segmentId);
    if (template && singleData.points.length > 0 && singleData.bounds) {
      const remapped = template.boundaries.map(({ lat, lng }) => {
        let minDist = Infinity;
        let result = null;
        for (let i = 0; i < singleData.points.length; i++) {
          const p = singleData.points[i];
          const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
          if (d < minDist) {
            minDist = d;
            const { x, y } = hasCircuit ? project({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }, circuitBounds) : project(p, singleData.bounds);
            result = { projX: x, projY: y, data: p, index: i };
          }
        }
        return result;
      }).filter(Boolean);
      if (remapped.length > 0) {
        setSegmentBoundaries(remapped);
        setSegmentNames(template.segmentNames || {});
      }
    }
    onAnnotationLoaded?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAnnotation]);

  /* ── Aplica volta pendente quando validLaps for populado ─────────────── */
  useEffect(() => {
    if (!pendingLapRestore) return;
    if (validLaps.includes(pendingLapRestore)) {
      setSelectedLap(pendingLapRestore);
      setPendingLapRestore(null);
    }
  }, [pendingLapRestore, validLaps]);

  /* ── Limpar setorização ao trocar de arquivo ─────────────────────────── */
  useEffect(() => {
    setSegmentBoundaries([]);
    setSegmentNames({});
    setLoadedSegmentId(null);
    setLoadedSegmentName('');
    setAnnotationName('');
    setSegmentComments({});
    setGeneralNotes('');
    setShowSaveInput(false);
    setSaveSegmentName('');
    setSaveHint('');
  }, [data?.fileName]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Detecção automática de pista ────────────────────────────────────── */
  useEffect(() => {
    if (!hasGPS || !data) { setDetectedTrack(null); return; }
    // Coleta pontos GPS de todas as voltas válidas (amostra)
    const pts = [];
    // Usa data.laps diretamente para não depender de validLaps (que depende de lapsAnalysis)
    const lapKeys = Object.keys(data.laps || {}).slice(0, 5);
    lapKeys.forEach((n) => {
      const rows = data.laps[n] || [];
      const step = Math.max(1, Math.floor(rows.length / 150));
      rows.filter((_, i) => i % step === 0).forEach((r) => {
        const lat = parseFloat(r[channels.gpsLat]);
        const lng = parseFloat(r[channels.gpsLng]);
        if (lat && lng && lat !== 0 && !isNaN(lat) && !isNaN(lng)) pts.push({ lat, lng });
      });
    });
    const track = detectTrack(pts);
    if (track) {
      setDetectedTrack(track);
      setShowRefLine(true);
    } else if (pts.length >= 20) {
      // Pista não reconhecida — constrói pista sintética a partir do GPS do piloto
      // Usa a primeira volta válida como centerline de referência
      const bestLapKey = lapKeys[0];
      const bestRows = data.laps[bestLapKey] || [];
      const step = Math.max(1, Math.floor(bestRows.length / 200));
      const centerline = bestRows
        .filter((_, i) => i % step === 0)
        .map((r) => ({
          lat: parseFloat(r[channels.gpsLat]),
          lng: parseFloat(r[channels.gpsLng]),
        }))
        .filter((p) => p.lat && p.lng && !isNaN(p.lat) && !isNaN(p.lng));
      if (centerline.length >= 20) {
        const corners = detectCornersFromCenterline(centerline);
        const center = {
          lat: centerline.reduce((s, p) => s + p.lat, 0) / centerline.length,
          lng: centerline.reduce((s, p) => s + p.lng, 0) / centerline.length,
        };
        setDetectedTrack({
          id: 'synthetic',
          name: 'Pista Detectada (GPS)',
          centerline,
          corners,
          center,
          sectors: [],
          isSynthetic: true,
        });
      } else {
        setDetectedTrack(null);
      }
    } else {
      setDetectedTrack(null);
    }
  }, [data, hasGPS, channels.gpsLat, channels.gpsLng]);

  /* ── Centerline alinhada ao centróide do GPS do piloto ────────────────
   *
   * Em vez de usar coordenadas absolutas (que podem não bater com o GPS real
   * por offset de equipamento), translada o centerline de referência para que
   * seu centróide coincida com o centróide do traçado GPS do piloto.
   * Isso garante sobreposição visual perfeita independente de offset.
   * ─────────────────────────────────────────────────────────────────────── */
  const alignedCenterline = useMemo(() => {
    if (!detectedTrack || !singleData.points.length) return [];
    const pts = singleData.points;
    // Centróide do GPS do piloto (parseFloat garante que strings de CSV viram números)
    const dLat = pts.reduce((s, p) => s + parseFloat(p.lat), 0) / pts.length;
    const dLng = pts.reduce((s, p) => s + parseFloat(p.lng), 0) / pts.length;
    // Centróide do centerline de referência
    const cl = detectedTrack.centerline;
    const rLat = cl.reduce((s, p) => s + p.lat, 0) / cl.length;
    const rLng = cl.reduce((s, p) => s + p.lng, 0) / cl.length;
    // Offset de translação
    const offLat = dLat - rLat;
    const offLng = dLng - rLng;
    return cl.map((p) => ({ lat: p.lat + offLat, lng: p.lng + offLng }));
  }, [detectedTrack, singleData.points]);

  /* ── Fundo do circuito: centerline ORIGINAL (não alinhada) → pixels fixos
   *    Independente da volta selecionada — o circuito não se move. ── */
  /* ── Bounds calculados dinamicamente da centerline real (preenche o canvas) ── */
  const circuitBounds = useMemo(() => {
    if (!detectedTrack?.centerline?.length) return null;
    const pts = detectedTrack.centerline;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const latPad = (maxLat - minLat) * 0.05;
    const lngPad = (maxLng - minLng) * 0.05;
    return { minLat: minLat - latPad, maxLat: maxLat + latPad, minLng: minLng - lngPad, maxLng: maxLng + lngPad };
  }, [detectedTrack]);

  const circuitBgPoints = useMemo(() => {
    if (!detectedTrack || !circuitBounds) return [];
    return detectedTrack.centerline.map((p) => project(p, circuitBounds));
  }, [detectedTrack, circuitBounds]);

  /* ── Pontos da centerline projetados para SVG ── */
  const refLinePoints = useMemo(() => {
    if (!detectedTrack || !showRefLine || !alignedCenterline.length) return [];
    if (showRefLine && detectedTrack && circuitBounds) {
      return alignedCenterline.map((p) => project(p, circuitBounds));
    }
    if (!singleData.bounds) return [];
    return alignedCenterline.map((p) => project(p, singleData.bounds));
  }, [detectedTrack, showRefLine, alignedCenterline, singleData.bounds, circuitBounds]);

  /* ── effectiveSingleBounds: sempre usa singleData.bounds
   *    (referência é projetada sobre os mesmos bounds do piloto) ─────────── */
  const effectiveSingleBounds = singleData.bounds;

  /* ── Normalização min/max do canal ativo para coloração do traçado ─────── */
  const colorNorm = useMemo(() => {
    const pts = singleData.points;
    if (!pts.length || !colorBy) return null;
    let min = Infinity, max = -Infinity;
    for (const p of pts) {
      const v = p[colorBy] || 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min, max };
  }, [singleData.points, colorBy]);

  /* ── Modo circuito: usa o SVG vetorizado + transform GPS→SVG fixo ───────
   *    Ativado automaticamente quando Interlagos é detectado e showRefLine
   *    está ligado. Neste modo, todo o rendering usa gpsToCircuitSvg() em
   *    vez de project() com bounds dinâmicos. ────────────────────────────── */
  // useCircuitMode: controla apenas se o fundo da pista é exibido
  const useCircuitMode = showRefLine && !!detectedTrack;
  // hasCircuit: quando há circuito detectado, sempre usa circuitBounds para projeção
  // (mantém o traçado na mesma posição com ou sem linha de referência)
  const hasCircuit = !!detectedTrack && !!circuitBounds;
  const activeSvgW = SVG_WIDTH;
  const activeSvgH = SVG_HEIGHT;
  const projectFn  = (p) => hasCircuit
    ? project({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }, circuitBounds)
    : project(p, effectiveSingleBounds);

  /* ── Projeção track-relative: cada ponto GPS do piloto → (segIdx, t, lateralOffset)
   *    Usa a centerline já alinhada como referência.
   *    Só calcula quando a linha de referência está ativa (showRefLine). ─── */
  const driverProjections = useMemo(() => {
    if (!showRefLine || !detectedTrack || !alignedCenterline.length || !singleData.points.length) return [];
    // Centróide da centerline alinhada como ponto de referência plana
    const refLat = alignedCenterline.reduce((s, p) => s + p.lat, 0) / alignedCenterline.length;
    const refLng = alignedCenterline.reduce((s, p) => s + p.lng, 0) / alignedCenterline.length;
    return projectAllDriverPoints(singleData.points, alignedCenterline, { lat: refLat, lng: refLng });
  }, [showRefLine, detectedTrack, alignedCenterline, singleData.points]);

  /* ── Coordenadas SVG do piloto dentro da banda da pista ─────────────────
   *    Para cada projeção, interpola o ponto na centerline SVG e aplica
   *    o offset perpendicular em pixels (M_TO_PX px por metro).
   *
   *    Direção perpendicular "direita" no SVG (y invertido vs. geo):
   *      right_perp = normalize(-dy_svg, dx_svg)
   *    Porque SVG y cresce para baixo (norte = y menor), a perp "direita"
   *    geográfica (east) corresponde a (-dy_svg, dx_svg) normalizado. ──── */
  const svgDriverOnTrack = useMemo(() => {
    if (!driverProjections.length || refLinePoints.length < 2) return [];
    const halfTrackM = TRACK_WIDTH_M / 2;
    return driverProjections.map(({ segIdx, t, lateralOffset, speed, throttle, brake }) => {
      const i  = Math.min(segIdx, refLinePoints.length - 2);
      const A  = refLinePoints[i];
      const B  = refLinePoints[i + 1];
      // Ponto na centerline SVG (interpolado)
      const cx = A.x + t * (B.x - A.x);
      const cy = A.y + t * (B.y - A.y);
      // Direção do segmento no SVG
      const dx  = B.x - A.x;
      const dy  = B.y - A.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) return { x: cx, y: cy, speed, throttle, brake };
      // Perpendicular "direita" no SVG
      const nx = -dy / len;
      const ny =  dx / len;
      // Offset em pixels (clampado a ±1.8× a meia largura para pontos fora da pista)
      const clampedM  = Math.max(-halfTrackM * 1.8, Math.min(halfTrackM * 1.8, lateralOffset));
      const lateralPx = clampedM * M_TO_PX;
      return { x: cx + nx * lateralPx, y: cy + ny * lateralPx, speed, throttle, brake };
    });
  }, [driverProjections, refLinePoints]);

  /* ── Marcadores de curvas ────────────────────────────────────────────────
   *    Usa a centerline ORIGINAL (não alinhada) porque o SVG path é fixo
   *    e não se move com o offset do centróide do GPS do piloto. ─────────── */
  const alignedCornerMarkers = useMemo(() => {
    if (!detectedTrack || !showRefLine) return [];
    const cl = detectedTrack.centerline;
    return detectedTrack.corners.map((corner) => {
      const midIdx = Math.min(Math.floor((corner.startIdx + corner.endIdx) / 2), cl.length - 1);
      const pt = cl[midIdx];
      if (!pt) return null;
      const { x, y } = project(pt, circuitBounds);
      return { ...corner, x, y };
    }).filter(Boolean);
  }, [detectedTrack, showRefLine, circuitBounds]);

  /* ── Marcadores de setor ─────────────────────────────────────────────────
   *    Mesma razão: usa centerline original. ────────────────────────────── */
  const alignedSectorMarkers = useMemo(() => {
    if (!detectedTrack || !showRefLine) return [];
    const cl = detectedTrack.centerline;
    return detectedTrack.sectors.map((sector) => {
      const idx = Math.min(sector.startIdx, cl.length - 1);
      const pt = cl[idx];
      if (!pt) return null;
      const { x, y } = project(pt, circuitBounds);
      return { ...sector, x, y };
    }).filter(Boolean);
  }, [detectedTrack, showRefLine, circuitBounds]);

  /* ── Análise de traçado ─────────────────────────────────────────────────── */
  const lapForAnalysis = analysisLap || selectedLap;
  const racingLineAnalysis = useMemo(() => {
    if (!detectedTrack || !hasGPS || !data) return null;
    const rows = data.laps[lapForAnalysis] || [];
    const pts = rows.map((r) => ({
      lat: parseFloat(r[channels.gpsLat]),
      lng: parseFloat(r[channels.gpsLng]),
    })).filter((p) => p.lat && p.lng && p.lat !== 0 && !isNaN(p.lat));
    // Usa track com centerline alinhada para análise mais precisa
    const trackForAnalysis = alignedCenterline.length
      ? { ...detectedTrack, centerline: alignedCenterline }
      : detectedTrack;
    return analyzeRacingLine(pts, trackForAnalysis);
  }, [detectedTrack, alignedCenterline, hasGPS, data, lapForAnalysis, channels.gpsLat, channels.gpsLng]);

  /* ── Click para definir trechos ───────────────────────────────────────── */
  const handleMapClick = useCallback((e) => {
    // Ignorar se estava arrastando (botão direito)
    if (isDraggingBoundary) return;
    const svg = e.currentTarget;
    if (!svg || !singleData.points.length || !effectiveSingleBounds) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM().inverse();
    const svgPt = pt.matrixTransform(ctm);
    const mx = svgPt.x;
    const my = svgPt.y;

    if (!segmentMode) {
      // Detectar clique em trecho colorido
      const segsForDetection = useCircuitMode ? circuitSegments : segments;
      if (segsForDetection.length > 0) {
        const activeBounds = overlayMode && overlayBounds ? overlayBounds : effectiveSingleBounds;
        let nearestSegIdx = -1;
        let minDist = 14;
        segsForDetection.forEach((seg, si) => {
          for (const p of seg.points) {
            const { x, y } = hasCircuit ? project(p, circuitBounds) : project(p, activeBounds);
            const d = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
            if (d < minDist) { minDist = d; nearestSegIdx = si; }
          }
        });
        if (nearestSegIdx >= 0) {
          const containerRect = mapContainerRef.current?.getBoundingClientRect() || svg.getBoundingClientRect();
          const px = e.clientX - containerRect.left;
          const py = e.clientY - containerRect.top;
          const popupW = 250;
          const safeX = Math.min(Math.max(px - popupW / 2, 8), containerRect.width - popupW - 8);
          const safeY = Math.max(py - 150, 8);
          setClickedSegmentNum(nearestSegIdx + 1);
          setClickPopupPos({ x: safeX, y: safeY });
          return;
        }
      }
      setClickedSegmentNum(null);
      return;
    }

    const searchBounds = overlayMode && overlayBounds ? overlayBounds : effectiveSingleBounds;

    // Após salvo: clique esquerdo em marcador existente → deletar
    if (loadedSegmentId && segmentBoundaries.length > 0) {
      const HIT_THRESHOLD = 22;
      let nearestIdx = -1;
      let nearestDist = HIT_THRESHOLD;
      segmentBoundaries.forEach((b, i) => {
        const bx = (b.projX != null && !useCircuitMode && !(overlayMode && overlayBounds)) ? b.projX : useCircuitMode ? projectFn(b.data).x : overlayMode && overlayBounds ? project(b.data, overlayBounds).x : b.projX;
        const by = (b.projY != null && !useCircuitMode && !(overlayMode && overlayBounds)) ? b.projY : useCircuitMode ? projectFn(b.data).y : overlayMode && overlayBounds ? project(b.data, overlayBounds).y : b.projY;
        const dist = Math.sqrt((bx - mx) ** 2 + (by - my) ** 2);
        if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
      });
      if (nearestIdx >= 0) {
        setSegmentBoundaries((prev) => prev.filter((_, i) => i !== nearestIdx));
        return;
      }
    }

    // Fechar circuito: clique próximo do primeiro marcador cria o último trecho e encerra
    if (segmentBoundaries.length >= 2) {
      const first = segmentBoundaries[0];
      const firstX = (first.projX != null && !useCircuitMode && !(overlayMode && overlayBounds)) ? first.projX : useCircuitMode ? projectFn(first.data).x : overlayMode && overlayBounds ? project(first.data, overlayBounds).x : first.projX;
      const firstY = (first.projY != null && !useCircuitMode && !(overlayMode && overlayBounds)) ? first.projY : useCircuitMode ? projectFn(first.data).y : overlayMode && overlayBounds ? project(first.data, overlayBounds).y : first.projY;
      const distToFirst = Math.sqrt((firstX - mx) ** 2 + (firstY - my) ** 2);
      if (distToFirst < 50) {
        // Clique no marcador 1 fecha o circuito — abre o dialog de salvar
        if (activeProfile && !showSaveInput) setShowSaveInput(true);
        return;
      }
    }

    // Adicionar novo marcador — em modo circuito snap à centerline do traçado;
    // se não achar nada na centerline, faz fallback para o ponto GPS mais próximo
    let nearest = (hasCircuit && detectedTrack?.centerline?.length)
      ? findNearestOnTrackWithIndex(detectedTrack.centerline, singleData.points, mx, my, 55, circuitBounds)
      : findNearestWithIndex(singleData.points, mx, my, searchBounds, 55, null);
    if (!nearest && hasCircuit) {
      nearest = findNearestWithIndex(singleData.points, mx, my, searchBounds, 55, projectFn);
    }
    if (!nearest) return;
    // Armazenar posição EXATA do clique SVG — não re-projetar do GPS
    nearest.projX = mx;
    nearest.projY = my;
    const newBoundary = nearest;

    // Inserir entre dois limites adjacentes se o índice se encaixa
    if (segmentBoundaries.length >= 2) {
      for (let i = 0; i < segmentBoundaries.length - 1; i++) {
        const si = segmentBoundaries[i].index;
        const ei = segmentBoundaries[i + 1].index;
        const ni = nearest.index;
        const isInside = si < ei ? (ni > si && ni < ei) : (ni > si || ni < ei);
        if (isInside) {
          setSegmentBoundaries((prev) => [
            ...prev.slice(0, i + 1),
            newBoundary,
            ...prev.slice(i + 1),
          ]);
          return;
        }
      }
    }
    setSegmentBoundaries((prev) => [...prev, newBoundary]);
  }, [segmentMode, overlayMode, singleData, overlayBounds, segmentBoundaries, loadedSegmentId, isDraggingBoundary, activeProfile, showSaveInput, setShowSaveInput, effectiveSingleBounds, showRefLine, detectedTrack]);

  /* ── Iniciar arrasto de marcador (botão direito) ──────────────────────── */
  const handleBoundaryMouseDown = useCallback((e, idx) => {
    if (!segmentMode || !loadedSegmentId) return;
    if (e.button !== 2) return; // apenas botão direito
    e.preventDefault();
    e.stopPropagation();
    setSelectedBoundaryIdx(idx);
    setIsDraggingBoundary(true);
  }, [segmentMode, loadedSegmentId]);

  /* ── Segmentos computados ──────────────────────────────────────────────── */
  const segments = useMemo(() => {
    if (segmentBoundaries.length < 2) return [];
    const pts  = singleData.points;
    const segs = [];
    const n = segmentBoundaries.length;
    for (let i = 0; i < n; i++) {
      const si = segmentBoundaries[i].index;
      const ei = segmentBoundaries[(i + 1) % n].index; // fecha o anel no último trecho
      const segPts = si <= ei
        ? pts.slice(si, ei + 1)
        : [...pts.slice(si), ...pts.slice(0, ei + 1)];
      segs.push({ points: segPts, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] });
    }
    return segs;
  }, [segmentBoundaries, singleData.points]);

  /* ── Segmentos na pista (centerline) para renderização visual em modo circuito ── */
  const circuitSegments = useMemo(() => {
    if (!useCircuitMode || !detectedTrack?.centerline || segmentBoundaries.length < 2) return [];
    const cl = detectedTrack.centerline;
    const getClIdx = (b) => {
      if (b.clIndex != null) return b.clIndex;
      // Fallback para boundaries carregados sem clIndex: acha ponto mais próximo por GPS
      let minD = Infinity, idx = 0;
      for (let i = 0; i < cl.length; i++) {
        const dlat = cl[i].lat - parseFloat(b.data?.lat ?? 0);
        const dlng = cl[i].lng - parseFloat(b.data?.lng ?? 0);
        const d = dlat * dlat + dlng * dlng;
        if (d < minD) { minD = d; idx = i; }
      }
      return idx;
    };
    const n = segmentBoundaries.length;
    return Array.from({ length: n }, (_, i) => {
      const si = getClIdx(segmentBoundaries[i]);
      const ei = getClIdx(segmentBoundaries[(i + 1) % n]);
      const pts = si <= ei ? cl.slice(si, ei + 1) : [...cl.slice(si), ...cl.slice(0, ei + 1)];
      return { points: pts, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] };
    });
  }, [useCircuitMode, detectedTrack, segmentBoundaries]);

  const segmentStats = useMemo(() => segments.map((seg, i) => {
    const speeds    = seg.points.map((p) => p.speed).filter((v) => v > 0);
    const rpms      = seg.points.map((p) => p.rpm).filter((v) => v > 0);
    const throttles = seg.points.map((p) => p.throttle);
    const brakes    = seg.points.map((p) => p.brake).filter((v) => v > 0);
    return {
      num:      i + 1,
      color:    seg.color,
      speed:    { avg: avgArr(speeds),    max: arrMax(speeds),    min: arrMin(speeds) },
      rpm:      { avg: avgArr(rpms),      max: arrMax(rpms),      min: arrMin(rpms) },
      throttle: { avg: avgArr(throttles), max: arrMax(throttles), min: arrMin(throttles) },
      brake:    { avg: avgArr(brakes),    max: arrMax(brakes),    min: arrMin(brakes) },
    };
  }), [segments]);

  /* ── Tempo de cada volta por trecho ───────────────────────────────────── */
  const segmentLapTiming = useMemo(() => {
    if (segmentBoundaries.length < 2 || !hasGPS || !data) return [];

    // Em overlay: analisa todas as voltas selecionadas (de qualquer sessão)
    // Em volta única: analisa todas as voltas da sessão principal
    const lapsToAnalyze = overlayMode
      ? overlayLaps.map(({ sessionId, lapNum }) => {
          if (sessionId === 'main') {
            return { sessionId, lapNum, rows: data?.laps[lapNum], ch: channels, lapTime: lapsAnalysis[lapNum]?.lapTime };
          }
          const sess = extraSessions.find(s => s.sessionId === sessionId);
          if (!sess) return null;
          return { sessionId, lapNum, rows: sess.data.laps[lapNum], ch: sess.channels, lapTime: sess.lapsAnalysis[lapNum]?.lapTime };
        }).filter(Boolean)
      : validLaps.map(lapNum => ({ sessionId: 'main', lapNum, rows: data?.laps[lapNum], ch: channels, lapTime: lapsAnalysis[lapNum]?.lapTime }));

    if (!lapsToAnalyze.length) return [];

    return Array.from({ length: segmentBoundaries.length - 1 }, (_, i) => {
      const startB = segmentBoundaries[i];
      const endB   = segmentBoundaries[i + 1];

      const lapResults = lapsToAnalyze.map(({ sessionId, lapNum, rows, ch, lapTime }) => {
        if (!rows?.length) return { sessionId, lapNum, time: null };

        const startIdx = findClosestRowIdx(rows, startB.data.lat, startB.data.lng, ch.gpsLat, ch.gpsLng);
        const endIdx   = findClosestRowIdx(rows, endB.data.lat,   endB.data.lng,   ch.gpsLat, ch.gpsLng);

        let segTime = null;

        if (ch.time) {
          const t0 = rows[startIdx]?.[ch.time];
          const t1 = rows[endIdx]?.[ch.time];
          if (t0 != null && t1 != null) {
            const diff = t1 - t0;
            if (diff > 0) segTime = diff;
          }
        }

        // Fallback: proporção de amostras × tempo total da volta
        if (segTime == null) {
          if (lapTime && rows.length > 0) {
            const span = Math.abs(endIdx - startIdx);
            segTime = (span / rows.length) * lapTime;
          }
        }

        return { sessionId, lapNum, time: segTime != null && segTime > 0 ? segTime : null };
      });

      const valid   = lapResults.filter((r) => r.time != null);
      const fastest = valid.reduce((best, r) => (!best || r.time < best.time ? r : best), null);

      return {
        segNum:          i + 1,
        color:           SEGMENT_COLORS[i % SEGMENT_COLORS.length],
        lapResults,
        fastestLap:      fastest?.lapNum ?? null,
        fastestSessionId: fastest?.sessionId ?? null,
        fastestTime:     fastest?.time ?? null,
        usedFallback:    !lapsToAnalyze.some(l => l.ch?.time),
      };
    });
  }, [segmentBoundaries, validLaps, overlayLaps, data, channels, lapsAnalysis, hasGPS, overlayMode, extraSessions]);

  /* ── Mouse handlers ───────────────────────────────────────────────────── */
  const handleMouseMove = useCallback((e) => {
    const svg = e.currentTarget;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM().inverse();
    const svgPt = pt.matrixTransform(ctm);
    const mx = svgPt.x;
    const my = svgPt.y;

    // Arrastar delimitação com botão direito
    if (isDraggingBoundary && selectedBoundaryIdx !== null && singleData.points.length && effectiveSingleBounds) {
      const useBounds = overlayMode && overlayBounds ? overlayBounds : effectiveSingleBounds;
      const nearest = (hasCircuit && detectedTrack?.centerline?.length)
        ? findNearestOnTrackWithIndex(detectedTrack.centerline, singleData.points, mx, my, 55, circuitBounds)
        : findNearestWithIndex(singleData.points, mx, my, useBounds, 55, null);
      if (nearest) {
        nearest.projX = mx;
        nearest.projY = my;
        setSegmentBoundaries((prev) => prev.map((b, i) =>
          i === selectedBoundaryIdx ? nearest : b
        ));
      }
      return;
    }

    // Detectar hover sobre trecho colorido
    const segsForHover = useCircuitMode ? circuitSegments : segments;
    if (segsForHover.length > 0) {
      const activeBounds = overlayMode && overlayBounds ? overlayBounds : effectiveSingleBounds;
      if (activeBounds || useCircuitMode) {
        let nearestSegIdx = -1;
        let minSegDist = 14;
        segsForHover.forEach((seg, si) => {
          for (const p of seg.points) {
            const { x, y } = hasCircuit ? project(p, circuitBounds) : project(p, activeBounds);
            const d = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
            if (d < minSegDist) { minSegDist = d; nearestSegIdx = si; }
          }
        });
        if (nearestSegIdx >= 0) {
          const containerRect = mapContainerRef.current?.getBoundingClientRect() || svg.getBoundingClientRect();
          setHoveredSegmentNum(nearestSegIdx + 1);
          setHoverSegPos({ x: e.clientX - containerRect.left, y: e.clientY - containerRect.top });
        } else {
          setHoveredSegmentNum(null);
        }
      }
    } else {
      setHoveredSegmentNum(null);
    }

    // Projeta pontos GPS → SVG de acordo com modo (circuito ou bounds dinâmicos)
    const hoverProjectFn = hasCircuit
      ? (p) => project({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }, circuitBounds)
      : null; // null = usa bounds default do findNearest
    const hoverBounds = hasCircuit ? circuitBounds : (overlayMode ? overlayBounds : effectiveSingleBounds);
    const HOVER_RADIUS = 20;

    if (!overlayMode) {
      if (!singleData.points.length || (!effectiveSingleBounds && !hasCircuit)) { setHoverInfo(null); return; }
      const nearest = findNearest(singleData.points, mx, my, hoverBounds, HOVER_RADIUS, hoverProjectFn);
      setHoverInfo(nearest ? { ...nearest, lapColor: null } : null);
    } else {
      if (!overlayBounds && !hasCircuit) { setHoverInfo(null); return; }

      // Busca o ponto GPS mais próximo do mouse em CADA volta independentemente
      const allHits = [];
      let closestDist = HOVER_RADIUS;
      let closestHit = null;
      overlayPointSets.forEach((pts, li) => {
        const found = findNearest(pts, mx, my, hoverBounds, HOVER_RADIUS, hoverProjectFn);
        if (found) {
          const dist = Math.sqrt((found.projX - mx) ** 2 + (found.projY - my) ** 2);
          const { lapNum } = overlayLaps[li];
          const color = LAP_COLORS[li % LAP_COLORS.length];
          const hit = { ...found, lapColor: color, lapNum, dist };
          allHits.push(hit);
          if (dist < closestDist) { closestDist = dist; closestHit = hit; }
        }
      });
      if (closestHit && allHits.length > 0) {
        closestHit.multiHits = allHits;
      }
      setHoverInfo(closestHit);
    }
  }, [overlayMode, singleData, overlayPointSets, overlayBounds, overlayLaps, validLaps, segments, isDraggingBoundary, selectedBoundaryIdx, effectiveSingleBounds, showRefLine, detectedTrack, hasCircuit, circuitBounds]);

  /* ── Finalizar arrasto de delimitação ─────────────────────────────────── */
  const handleSvgMouseUp = useCallback((e) => {
    if (isDraggingBoundary) {
      setIsDraggingBoundary(false);
      setSelectedBoundaryIdx(null);
    }
  }, [isDraggingBoundary]);

  const handleMouseLeave = useCallback(() => {
    setHoverInfo(null);
    setHoveredSegmentNum(null);
    if (isDraggingBoundary) {
      setIsDraggingBoundary(false);
      setSelectedBoundaryIdx(null);
    }
  }, [isDraggingBoundary]);

  const displayKey = overlayMode
    ? (overlayColorMode !== 'lap' ? overlayColorMode : 'speed')
    : colorBy;

  /* ── Estatísticas da sessão principal — todas as voltas (volta única) ── */
  const singleSessionStats = useMemo(() => {
    const allPoints = [];
    validLaps.forEach((n) => {
      const rows = data?.laps[n] || [];
      rows.forEach((r) => {
        let brake = 0;
        if (channels.brake) brake = r[channels.brake] || 0;
        else if (channels.accel) brake = Math.max(0, -(r[channels.accel] || 0) * 100);
        allPoints.push({
          speed:    channels.gpsSpeed ? r[channels.gpsSpeed] || 0 : 0,
          rpm:      channels.rpm      ? r[channels.rpm]      || 0 : 0,
          throttle: channels.throttle ? Math.min(100, Math.max(0, r[channels.throttle] || 0)) : 0,
          brake,
        });
      });
    });
    const speeds    = allPoints.map((p) => p.speed).filter((v) => v > 0);
    const rpms      = allPoints.map((p) => p.rpm).filter((v) => v > 0);
    const brakes    = allPoints.map((p) => p.brake).filter((v) => v > 0);
    const throttles = allPoints.map((p) => p.throttle).filter((v) => v > 0);
    return {
      id: 'main',
      fileName: data?.fileName || 'Principal',
      laps: validLaps.length,
      speed:    { max: arrMax(speeds),    min: arrMin(speeds) },
      rpm:      { max: arrMax(rpms),      min: arrMin(rpms) },
      brake:    { max: arrMax(brakes),    min: arrMin(brakes) },
      throttle: { max: arrMax(throttles), min: arrMin(throttles) },
    };
  }, [validLaps, data?.laps, data?.fileName, channels]);

  /* ── Relatório de todas as sessões (sobreposição) ── */
  const allSessionsReport = useMemo(() => {
    const allSources = [
      { id: 'main', fileName: data?.fileName || 'Principal', channels, laps: data?.laps, lapsAnalysis },
      ...extraSessions.map((sess) => ({
        id: sess.sessionId,
        fileName: sess.fileName,
        channels: sess.channels,
        laps: sess.data.laps,
        lapsAnalysis: sess.lapsAnalysis,
      })),
    ];
    return allSources.filter((src) => src.laps).map((src) => {
      const validLapNums = Object.keys(src.laps).filter((n) => src.lapsAnalysis[n]?.lapTime > 5);
      const allPoints = [];
      validLapNums.forEach((n) => {
        const rows = src.laps[n] || [];
        rows.forEach((r) => {
          let brake = 0;
          if (src.channels.brake) brake = r[src.channels.brake] || 0;
          else if (src.channels.accel) brake = Math.max(0, -(r[src.channels.accel] || 0) * 100);
          allPoints.push({
            speed:    src.channels.gpsSpeed ? r[src.channels.gpsSpeed] || 0 : 0,
            rpm:      src.channels.rpm      ? r[src.channels.rpm]      || 0 : 0,
            throttle: src.channels.throttle ? Math.min(100, Math.max(0, r[src.channels.throttle] || 0)) : 0,
            brake,
          });
        });
      });
      const speeds    = allPoints.map((p) => p.speed).filter((v) => v > 0);
      const rpms      = allPoints.map((p) => p.rpm).filter((v) => v > 0);
      const brakes    = allPoints.map((p) => p.brake).filter((v) => v > 0);
      const throttles = allPoints.map((p) => p.throttle).filter((v) => v > 0);
      return {
        id: src.id,
        fileName: src.fileName,
        laps: validLapNums.length,
        speed:    { max: arrMax(speeds),    min: arrMin(speeds) },
        rpm:      { max: arrMax(rpms),      min: arrMin(rpms) },
        brake:    { max: arrMax(brakes),    min: arrMin(brakes) },
        throttle: { max: arrMax(throttles), min: arrMin(throttles) },
      };
    });
  }, [data, channels, lapsAnalysis, extraSessions]);

  /* ── Hover tooltip SVG element ────────────────────────────────────────── */
  const renderHoverOverlay = () => {
    if (!hoverInfo) return null;
    const { projX, projY, data: pt, lapColor, lapNum, multiHits } = hoverInfo;
    const dotColor = lapColor || COLORS.accent;

    // Se tem múltiplas voltas (overlay), mostra todas no mesmo balão
    const hits = (multiHits && multiHits.length > 1) ? multiHits : null;
    const MULTI_TIP_W = hits ? 200 : TOOLTIP_W;

    const lines = [];
    if (hits) {
      // Tooltip multi-volta: header + dados de cada volta
      const metricLabel = COLOR_MODES.find(m => m.key === displayKey)?.label || displayKey;
      lines.push({ text: `${metricLabel} — ${hits.length} voltas`, color: '#f0f0f5', bold: true });
      hits.forEach((h) => {
        const hpt = h.data;
        const val = hpt[displayKey];
        lines.push({
          text: `V${h.lapNum}: ${fmtValue(displayKey, val)}  |  ${fmtValue('speed', hpt.speed)}`,
          color: h.lapColor || '#8888a0',
          bold: false,
        });
      });
    } else {
      // Tooltip single
      if (lapNum) lines.push({ text: `Volta ${lapNum}`, color: '#8888a0', bold: false });
      const val = pt[displayKey];
      lines.push({ text: `${COLOR_MODES.find(m => m.key === displayKey)?.label || displayKey}: ${fmtValue(displayKey, val)}`, color: '#f0f0f5', bold: true });
      lines.push({ text: `Vel: ${fmtValue('speed', pt.speed)}`, color: '#8888a0', bold: false });
      if (displayKey !== 'throttle') lines.push({ text: `Acel: ${pt.throttle.toFixed(1)}%`, color: '#8888a0', bold: false });
      if (displayKey !== 'rpm') lines.push({ text: `RPM: ${fmtValue('rpm', pt.rpm)}`, color: '#8888a0', bold: false });
    }

    const tipX = projX + 16 > activeSvgW - MULTI_TIP_W - 10
      ? projX - MULTI_TIP_W - 16
      : projX + 16;
    const tipH = lines.length * 16 + 14;
    const tipY = Math.min(Math.max(projY - tipH / 2, 6), activeSvgH - tipH - 6);

    return (
      <g>
        <line
          x1={projX} y1={projY}
          x2={tipX < projX ? tipX + MULTI_TIP_W : tipX}
          y2={tipY + tipH / 2}
          stroke={dotColor} strokeWidth={1} strokeOpacity={0.4} strokeDasharray="3 2"
        />
        {/* Dot para cada volta no overlay */}
        {hits ? hits.map((h, i) => (
          <circle key={i} cx={h.projX} cy={h.projY} r={5} fill={h.lapColor} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5} />
        )) : (
          <circle cx={projX} cy={projY} r={7} fill={dotColor} fillOpacity={0.9} stroke="#fff" strokeWidth={2} />
        )}
        <rect
          x={tipX} y={tipY}
          width={MULTI_TIP_W} height={tipH}
          rx={6} ry={6}
          fill={isDark ? '#12121a' : '#f0f0f5'} fillOpacity={0.97}
          stroke={isDark ? '#2a2a3e' : '#b0b0c0'} strokeWidth={1}
        />
        {lines.map((line, i) => (
          <text
            key={i}
            x={tipX + 8} y={tipY + 16 + i * 16}
            fill={line.color}
            fontSize={line.bold ? 12 : 10}
            fontWeight={line.bold ? 700 : 400}
            fontFamily="monospace"
          >
            {line.text}
          </text>
        ))}
      </g>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────── */

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

      {/* ── Banner de pista detectada ── */}
      {detectedTrack && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
          padding: '10px 16px', borderRadius: 10,
          background: `${COLORS.blue}15`,
          border: `1px solid ${COLORS.blue}40`,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 18 }}>{detectedTrack.flag}</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: COLORS.blue }}>
              {detectedTrack.name}
            </span>
            <span style={{ marginLeft: 10, fontSize: 11, color: COLORS.textMuted }}>
              {(detectedTrack.length / 1000).toFixed(3)} km · {detectedTrack.corners.length} curvas · {detectedTrack.direction}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowRefLine((v) => !v)}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', border: `1px solid ${showRefLine ? COLORS.blue : COLORS.border}`,
                background: showRefLine ? `${COLORS.blue}25` : 'transparent',
                color: showRefLine ? COLORS.blue : COLORS.textMuted,
              }}
            >
              {showRefLine ? '⊙ Linha de Referência' : '○ Linha de Referência'}
            </button>
            <button
              onClick={() => setShowAnalysisPanel((v) => !v)}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', border: `1px solid ${showAnalysisPanel ? COLORS.orange : COLORS.border}`,
                background: showAnalysisPanel ? `${COLORS.orange}20` : 'transparent',
                color: showAnalysisPanel ? COLORS.orange : COLORS.textMuted,
              }}
            >
              📐 Análise de Traçado
            </button>
          </div>
        </div>
      )}

      {/* Controles superiores */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => { setOverlayMode(false); setHoverInfo(null); }}
            style={{ ...theme.pillButton(!overlayMode), fontSize: 12, padding: '5px 14px' }}
          >
            Volta única
          </button>
          <button
            onClick={() => { setOverlayMode(true); setHoverInfo(null); setSegmentMode(false); setSelectedBoundaryIdx(null); }}
            style={{ ...theme.pillButton(overlayMode), fontSize: 12, padding: '5px 14px' }}
          >
            Sobrepor voltas
          </button>
        </div>

        {overlayMode && (
          <>
            <button
              onClick={() => extraFileRef.current?.click()}
              disabled={extraLoading}
              style={{
                padding: '5px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: COLORS.purple, color: '#fff', border: 'none',
                cursor: extraLoading ? 'wait' : 'pointer', opacity: extraLoading ? 0.7 : 1,
              }}
            >
              {extraLoading ? '⏳ Carregando...' : '+ Adicionar Sessão'}
            </button>
            <input
              ref={extraFileRef}
              type="file"
              accept={FILE_ACCEPT_STRING}
              style={{ display: 'none' }}
              onClick={(e) => { e.target.value = ''; }}
              onChange={(e) => handleExtraFile(e.target.files[0])}
            />
          </>
        )}

        {/* Controles de trechos — disponíveis em ambos os modos */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setSegmentMode((v) => !v); setSelectedBoundaryIdx(null); setSaveHint(''); }}
            style={{
              ...theme.pillButton(segmentMode),
              fontSize: 11, padding: '5px 12px',
              borderColor: segmentMode ? SEGMENT_COLORS[0] : undefined,
              color: segmentMode ? SEGMENT_COLORS[0] : undefined,
            }}
          >
            {segmentMode ? '📍 Clique na pista…' : '✂️'}
          </button>
          {segmentBoundaries.length > 0 && (
            <button
              onClick={() => { setSegmentBoundaries([]); setShowSaveInput(false); setSaveHint(''); }}
              style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 12px' }}
            >
              Limpar ({segmentBoundaries.length})
            </button>
          )}
          {/* Salvar Template — sempre visível */}
          {showSaveInput ? (
            <>
              <input
                type="text"
                value={saveSegmentName}
                onChange={(e) => setSaveSegmentName(e.target.value)}
                placeholder="Nome do template…"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveSegments();
                  if (e.key === 'Escape') setShowSaveInput(false);
                }}
                style={{
                  background: COLORS.bgCard, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.border}`, borderRadius: 6,
                  padding: '4px 10px', fontSize: 11, outline: 'none',
                  minWidth: 150,
                }}
              />
              <button
                onClick={handleSaveSegments}
                disabled={!saveSegmentName.trim()}
                style={{ ...theme.pillButton(true), fontSize: 11, padding: '5px 12px', opacity: saveSegmentName.trim() ? 1 : 0.5 }}
              >
                Salvar
              </button>
              <button
                onClick={() => setShowSaveInput(false)}
                style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 8px' }}
              >
                ✕
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                if (segmentBoundaries.length < 2) {
                  setSaveHint('Use ✂️ para marcar pelo menos 2 trechos na pista');
                  setTimeout(() => setSaveHint(''), 3000);
                  return;
                }
                setSaveHint('');
                setShowSaveInput(true);
                setSaveSegmentName('');
              }}
              style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 12px' }}
            >
              💾 Salvar Template
            </button>
          )}
          {saveHint && (
            <span style={{ fontSize: 10, color: COLORS.orange, alignSelf: 'center' }}>
              {saveHint}
            </span>
          )}
        </div>

        {!overlayMode && (
          <>
            <select
              value={selectedLap}
              onChange={(e) => { setSelectedLap(e.target.value); setHoverInfo(null); }}
              style={theme.select}
            >
              {validLaps.map((n) => (
                <option key={n} value={n}>
                  V{n} — {formatLapTime(lapsAnalysis[n]?.lapTime)}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              {COLOR_MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setColorBy(m.key)}
                  style={{ ...theme.pillButton(colorBy === m.key), fontSize: 11, padding: '5px 12px' }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Templates de setorização da pista ── */}
      {(() => {
        const tid = detectedTrack?.id || 'unknown';
        const templates = trackTemplates[tid] || [];
        if (!templates.length) return null;
        return (
          <div style={{ ...theme.card, marginBottom: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, marginBottom: 8 }}>
              Templates — {detectedTrack?.shortName || 'Pista'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {templates.map((seg) => (
                <div key={seg.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, color: COLORS.textPrimary, fontSize: 12, fontWeight: 600, minWidth: 80 }}>
                    {seg.name}
                  </span>
                  <span style={{ fontSize: 10, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                    {new Date(seg.savedAt).toLocaleDateString('pt-BR')} · {seg.boundaries.length} marcadores
                  </span>
                  <button
                    onClick={() => handleLoadSegments(seg)}
                    style={{
                      padding: '3px 12px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
                      background: `${COLORS.blue}20`, color: COLORS.blue,
                      border: `1px solid ${COLORS.blue}44`, fontWeight: 600,
                    }}
                  >
                    Carregar
                  </button>
                  <button
                    onClick={() => deleteTrackTemplate?.(tid, seg.id)}
                    style={{
                      padding: '3px 8px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
                      background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Overlay: seleção de voltas + modo de cor */}
      {overlayMode && (
        <div style={{ ...theme.card, marginBottom: 12, paddingBottom: 14 }}>
          <div style={{ ...theme.cardTitle, marginBottom: 10 }}>Selecione as voltas para sobrepor</div>

          {/* ── Sessão principal ── */}
          {validLaps.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
                Sessão principal
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {validLaps.map((n) => {
                  const isActive = isOverlaySelected('main', n);
                  const activeIdx = overlayLaps.findIndex(l => l.sessionId === 'main' && l.lapNum === n);
                  const color = isActive ? LAP_COLORS[activeIdx % LAP_COLORS.length] : COLORS.border;
                  return (
                    <div
                      key={n}
                      onClick={() => toggleOverlayLap('main', n)}
                      style={{
                        padding: '5px 14px', borderRadius: 20, fontSize: 12,
                        fontWeight: 600, cursor: 'pointer',
                        border: `2px solid ${color}`,
                        background: isActive ? `${color}25` : 'transparent',
                        color: isActive ? color : COLORS.textMuted,
                        transition: 'all 0.15s',
                      }}
                    >
                      V{n} — {formatLapTime(lapsAnalysis[n]?.lapTime)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Sessões extras ── */}
          {extraSessions.map((sess) => {
            const sessLaps = Object.keys(sess.data.laps).filter(n => sess.lapsAnalysis[n]?.lapTime > 5);
            if (!sessLaps.length) return null;
            return (
              <div key={sess.sessionId} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
                  {shortName(sess.fileName)}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {sessLaps.map((n) => {
                    const isActive = isOverlaySelected(sess.sessionId, n);
                    const activeIdx = overlayLaps.findIndex(l => l.sessionId === sess.sessionId && l.lapNum === n);
                    const color = isActive ? LAP_COLORS[activeIdx % LAP_COLORS.length] : COLORS.border;
                    return (
                      <div
                        key={n}
                        onClick={() => toggleOverlayLap(sess.sessionId, n)}
                        style={{
                          padding: '5px 14px', borderRadius: 20, fontSize: 12,
                          fontWeight: 600, cursor: 'pointer',
                          border: `2px solid ${color}`,
                          background: isActive ? `${color}25` : 'transparent',
                          color: isActive ? color : COLORS.textMuted,
                          transition: 'all 0.15s',
                        }}
                      >
                        V{n} — {formatLapTime(sess.lapsAnalysis[n]?.lapTime)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div style={{ borderTop: `1px solid ${COLORS.border}33`, paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Colorir por
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => setOverlayColorMode('lap')}
                style={{ ...theme.pillButton(overlayColorMode === 'lap'), fontSize: 11, padding: '5px 12px' }}
              >
                Por volta
              </button>
              {COLOR_MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setOverlayColorMode(m.key)}
                  style={{ ...theme.pillButton(overlayColorMode === m.key), fontSize: 11, padding: '5px 12px' }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SVG do mapa + painel de notas */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div ref={mapContainerRef} style={{ flex: 1, ...theme.card, padding: 0, overflow: 'hidden', position: 'relative' }}>
        {overlayMode ? (
          overlayBounds && overlayPointSets.some((pts) => pts.length > 0) ? (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              style={{ width: '100%', height: 'auto', background: useCircuitMode ? (isDark ? '#0e0e1a' : '#e8e8f0') : COLORS.bgCard, display: 'block', cursor: segmentMode ? 'crosshair' : 'default' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onMouseUp={handleSvgMouseUp}
              onClick={handleMapClick}
              onContextMenu={(e) => { if (segmentMode) e.preventDefault(); }}
            >
              {/* ── Pista de fundo no overlay (mesma renderização da volta única) ── */}
              {(() => {
                if (useCircuitMode && circuitBgPoints.length > 1) {
                  const bgD = circuitBgPoints.map((p, i) =>
                    `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
                  ).join(' ') + ' Z';
                  return (
                    <g>
                      <path d={bgD} fill="none" stroke={isDark ? '#000000' : '#b0b0c0'}
                        strokeWidth={24} strokeOpacity={0.75}
                        strokeLinecap="round" strokeLinejoin="round" />
                      <path d={bgD} fill="none" stroke={isDark ? '#c8c8e8' : '#888898'}
                        strokeWidth={19} strokeOpacity={0.9}
                        strokeLinecap="round" strokeLinejoin="round" />
                      <path d={bgD} fill="none" stroke={isDark ? '#252535' : '#d0d0dd'}
                        strokeWidth={14}
                        strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  );
                }
                if (showRefLine && refLinePoints.length > 1) {
                  const d = refLinePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
                  const bw = TRACK_BAND_PX;
                  return (
                    <g>
                      <path d={d} fill="none" stroke={isDark ? '#000000' : '#b0b0c0'} strokeWidth={bw + 6}
                        strokeOpacity={0.55} strokeLinecap="round" strokeLinejoin="round" />
                      <path d={d} fill="none" stroke={isDark ? '#e8e8ff' : '#888898'} strokeWidth={bw + 2}
                        strokeOpacity={0.70} strokeLinecap="round" strokeLinejoin="round" />
                      <path d={d} fill="none" stroke={isDark ? '#2c2c3e' : '#c0c0d0'} strokeWidth={bw - 2}
                        strokeLinecap="round" strokeLinejoin="round" />
                      <path d={d} fill="none" stroke={isDark ? '#ffffff' : '#888898'} strokeWidth={1.2}
                        strokeOpacity={isDark ? 0.35 : 0.5} strokeLinecap="butt" strokeLinejoin="round"
                        strokeDasharray="10 7" />
                    </g>
                  );
                }
                return null;
              })()}
              {/* ── Traçados GPS das voltas sobrepostas ── */}
              {overlayPointSets.map((pts, li) => {
                if (!pts.length) return null;
                const lapColor = LAP_COLORS[li % LAP_COLORS.length];
                const useBounds = hasCircuit ? circuitBounds : overlayBounds;
                return pts.map((p, i) => {
                  if (i === 0) return null;
                  const prev   = project(hasCircuit ? { lat: parseFloat(pts[i-1].lat), lng: parseFloat(pts[i-1].lng) } : pts[i - 1], useBounds);
                  const cur    = project(hasCircuit ? { lat: parseFloat(p.lat), lng: parseFloat(p.lng) } : p, useBounds);
                  const stroke = overlayColorMode === 'lap' ? lapColor : getPointColor(p, overlayColorMode, COLORS, colorNorm);
                  return (
                    <line
                      key={`${li}_${i}`}
                      x1={prev.x} y1={prev.y} x2={cur.x} y2={cur.y}
                      stroke={stroke} strokeWidth={2.5}
                      strokeLinecap="round" strokeOpacity={0.85}
                    />
                  );
                });
              })}
              {/* Trechos destacados no overlay (re-projetados com overlayBounds) */}
              {segments.map((seg, si) =>
                seg.points.map((p, i) => {
                  if (i === 0) return null;
                  const prev = project(seg.points[i - 1], overlayBounds);
                  const cur  = project(p, overlayBounds);
                  return (
                    <line
                      key={`oseg${si}_${i}`}
                      x1={prev.x} y1={prev.y} x2={cur.x} y2={cur.y}
                      stroke={seg.color} strokeWidth={5} strokeLinecap="round" strokeOpacity={0.75}
                    />
                  );
                })
              )}
              {/* Marcadores de fronteira no overlay */}
              {segmentBoundaries.map((b, i) => {
                const { x, y } = (b.projX != null && b.projY != null && !overlayBounds)
                  ? { x: b.projX, y: b.projY }
                  : project(b.data, overlayBounds);
                const isDraggingThis = isDraggingBoundary && selectedBoundaryIdx === i;
                const markerColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
                const isFirstCloseable = i === 0 && segmentMode && !loadedSegmentId && segmentBoundaries.length >= 2;
                const cursorStyle = segmentMode && loadedSegmentId
                  ? (isDraggingThis ? 'grabbing' : 'pointer')
                  : isFirstCloseable ? 'pointer' : 'default';
                return (
                  <g key={`oboundary${i}`}
                    style={{ cursor: cursorStyle }}
                    onMouseDown={(e) => handleBoundaryMouseDown(e, i)}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={isFirstCloseable ? (e) => {
                      e.stopPropagation();
                      if (activeProfile && !showSaveInput) setShowSaveInput(true);
                    } : undefined}>
                    {isDraggingThis && <circle cx={x} cy={y} r={18} fill="none" stroke="#fff" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.8} />}
                    {isFirstCloseable && <circle cx={x} cy={y} r={16} fill="none" stroke="#06d6a0" strokeWidth={2} strokeDasharray="4 3" strokeOpacity={0.9} />}
                    <circle cx={x} cy={y} r={14} fill="rgba(0,0,0,0.01)" pointerEvents="all" />
                    <circle cx={x} cy={y} r={11} fill={isDark ? '#0a0a14' : '#e0e0ec'} stroke={isFirstCloseable ? '#06d6a0' : (isDark ? '#fff' : '#444')} strokeWidth={isDraggingThis ? 2.5 : 2} strokeOpacity={0.9} />
                    <circle cx={x} cy={y} r={9} fill={markerColor} fillOpacity={isDraggingThis ? 1 : 0.85} />
                    <text x={x} y={y + 4} textAnchor="middle"
                      fill="#000" fontSize={9} fontWeight={700} fontFamily="monospace"
                    >
                      {i + 1}
                    </text>
                  </g>
                );
              })}
              {overlayPointSets.map((pts, li) => {
                if (!pts.length) return null;
                const s     = project(pts[0], overlayBounds);
                const color = LAP_COLORS[li % LAP_COLORS.length];
                return <circle key={`s${li}`} cx={s.x} cy={s.y} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />;
              })}
              {renderHoverOverlay()}
            </svg>
          ) : (
            <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
              Selecione ao menos uma volta acima
            </div>
          )
        ) : (
          singleData.points.length > 0 ? (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              style={{ width: '100%', height: 'auto', background: useCircuitMode ? (isDark ? '#0e0e1a' : '#e8e8f0') : COLORS.bgCard, display: 'block', cursor: 'crosshair' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onMouseUp={handleSvgMouseUp}
              onClick={handleMapClick}
              onContextMenu={(e) => { if (segmentMode) e.preventDefault(); }}
            >
              {/* ── Pista de fundo: SVG vetorizado do Autódromo de Interlagos ──
               *   Em modo circuito, renderizamos o path real da pista (importado
               *   do arquivo RaceCircuitInterlagos.svg) com stroke largo para
               *   criar o visual de asfalto. O driver GPS é sobreposto acima.
               *   Em modo sem referência, mantemos a banda da centerline do OSM. */}
              {useCircuitMode && circuitBgPoints.length > 1 ? (() => {
                /* Fundo do circuito: centerline OSM original projetada via gpsToCircuitSvg().
                 * Posição FIXA — não muda por volta. O driver GPS usa o mesmo sistema de
                 * coordenadas, então qualquer offset é o offset real do receptor GPS vs OSM. */
                const bgD = circuitBgPoints.map((p, i) =>
                  `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
                ).join(' ') + ' Z';
                return (
                  <g>
                    <path d={bgD} fill="none" stroke={isDark ? '#000000' : '#b0b0c0'}
                      strokeWidth={24} strokeOpacity={0.75}
                      strokeLinecap="round" strokeLinejoin="round" />
                    <path d={bgD} fill="none" stroke={isDark ? '#c8c8e8' : '#888898'}
                      strokeWidth={19} strokeOpacity={0.9}
                      strokeLinecap="round" strokeLinejoin="round" />
                    <path d={bgD} fill="none" stroke={isDark ? '#252535' : '#d0d0dd'}
                      strokeWidth={14}
                      strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                );
              })() : showRefLine && refLinePoints.length > 1 && (() => {
                const d = refLinePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
                const bw = TRACK_BAND_PX;
                return (
                  <g>
                    <path d={d} fill="none" stroke={isDark ? '#000000' : '#b0b0c0'} strokeWidth={bw + 6}
                      strokeOpacity={0.55} strokeLinecap="round" strokeLinejoin="round" />
                    <path d={d} fill="none" stroke={isDark ? '#e8e8ff' : '#888898'} strokeWidth={bw + 2}
                      strokeOpacity={0.70} strokeLinecap="round" strokeLinejoin="round" />
                    <path d={d} fill="none" stroke={isDark ? '#2c2c3e' : '#c0c0d0'} strokeWidth={bw - 2}
                      strokeLinecap="round" strokeLinejoin="round" />
                    <path d={d} fill="none" stroke={isDark ? '#ffffff' : '#888898'} strokeWidth={1.2}
                      strokeOpacity={isDark ? 0.35 : 0.5} strokeLinecap="butt" strokeLinejoin="round"
                      strokeDasharray="10 7" />
                  </g>
                );
              })()}

              {/* Setores coloridos na pista (centerline) — apenas em modo circuito */}
              {useCircuitMode && circuitSegments.map((seg, si) => {
                const d = seg.points.map((p, j) => {
                  const { x, y } = project(p, circuitBounds);
                  return `${j === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(' ');
                return (
                  <path key={`cseg${si}`} d={d} fill="none"
                    stroke={seg.color} strokeWidth={14} strokeOpacity={0.45}
                    strokeLinecap="round" strokeLinejoin="round" />
                );
              })}

              {/* Traçado do piloto ─────────────────────────────────────────────
               *   Em modo circuito: GPS → gpsToCircuitSvg (coordenadas fixas).
               *   Sem ref: GPS bruto com bounds dinâmicos. */}
              {singleData.points.map((p, i) => {
                if (i === 0) return null;
                const prev = projectFn(singleData.points[i - 1]);
                const cur  = projectFn(p);
                return (
                  <line
                    key={i}
                    x1={prev.x.toFixed(2)} y1={prev.y.toFixed(2)}
                    x2={cur.x.toFixed(2)}  y2={cur.y.toFixed(2)}
                    stroke={getPointColor(p, colorBy, COLORS, colorNorm)}
                    strokeWidth={useCircuitMode ? 2 : 3}
                    strokeLinecap="round"
                    strokeOpacity={useCircuitMode ? 0.92 : 1}
                  />
                );
              })}
              {/* Marcador de início de volta */}
              {singleData.points.length > 0 && (() => {
                const s = projectFn(singleData.points[0]);
                return <circle cx={s.x} cy={s.y} r={useCircuitMode ? 3 : 6} fill={COLORS.green} stroke="#fff" strokeWidth={1.5} />;
              })()}
              {/* Trechos destacados no GPS — apenas fora do modo circuito (em circuito os setores ficam na pista) */}
              {!useCircuitMode && segments.map((seg, si) =>
                seg.points.map((p, i) => {
                  if (i === 0) return null;
                  const prev = projectFn(seg.points[i - 1]);
                  const cur  = projectFn(p);
                  return (
                    <line
                      key={`seg${si}_${i}`}
                      x1={prev.x} y1={prev.y} x2={cur.x} y2={cur.y}
                      stroke={seg.color} strokeWidth={5} strokeLinecap="round" strokeOpacity={0.85}
                    />
                  );
                })
              )}
              {/* Marcadores de fronteira */}
              {segmentBoundaries.map((b, i) => {
                const { x: bx, y: by } = (b.projX != null && b.projY != null)
                  ? { x: b.projX, y: b.projY }
                  : b.data ? projectFn(b.data) : { x: 0, y: 0 };
                const isDraggingThis = isDraggingBoundary && selectedBoundaryIdx === i;
                const markerColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
                const isFirstCloseable = i === 0 && segmentMode && !loadedSegmentId && segmentBoundaries.length >= 2;
                const cursorStyle = segmentMode && loadedSegmentId
                  ? (isDraggingThis ? 'grabbing' : 'pointer')
                  : isFirstCloseable ? 'pointer' : 'default';
                return (
                  <g key={`boundary${i}`}
                    style={{ cursor: cursorStyle }}
                    onMouseDown={(e) => handleBoundaryMouseDown(e, i)}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={isFirstCloseable ? (e) => {
                      e.stopPropagation();
                      if (activeProfile && !showSaveInput) setShowSaveInput(true);
                    } : undefined}>
                    {/* Área de clique invisível */}
                    <circle cx={bx} cy={by} r={12} fill="rgba(0,0,0,0.01)" pointerEvents="all" />
                    {/* Marca pequena: losango + número */}
                    {isDraggingThis && <circle cx={bx} cy={by} r={10} fill="none" stroke="#fff" strokeWidth={1} strokeDasharray="3 2" strokeOpacity={0.7} />}
                    {isFirstCloseable && <circle cx={bx} cy={by} r={10} fill="none" stroke="#06d6a0" strokeWidth={1.5} strokeDasharray="3 2" strokeOpacity={0.9} />}
                    <rect x={bx - 5} y={by - 5} width={10} height={10}
                      transform={`rotate(45,${bx},${by})`}
                      fill={markerColor} fillOpacity={0.9}
                      stroke={isDark ? '#000' : '#888'} strokeWidth={1} strokeOpacity={0.7} />
                    <text x={bx + 9} y={by - 6} textAnchor="start"
                      fill={markerColor} fontSize={7} fontWeight={700} fontFamily="monospace"
                      stroke={isDark ? '#000' : '#fff'} strokeWidth={2} paintOrder="stroke"
                    >
                      {i + 1}
                    </text>
                  </g>
                );
              })}
              {renderHoverOverlay()}
            </svg>
          ) : (
            <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
              Sem dados GPS para esta volta
            </div>
          )
        )}

        <div style={{
          position: 'absolute', bottom: 8, right: 12,
          fontSize: 10, color: COLORS.textMuted, pointerEvents: 'none',
          textAlign: 'right', lineHeight: 1.5,
        }}>
          {segmentMode
            ? selectedBoundaryIdx !== null
              ? `Marcador ${selectedBoundaryIdx + 1} selecionado — clique onde deseja mover`
              : segmentBoundaries.length >= 2 && !loadedSegmentId
                ? 'Clique na pista para adicionar divisões • Clique no marcador 1 (verde) para fechar o circuito'
                : 'Clique na pista para adicionar divisões de setor'
            : segments.length > 0
              ? 'Passe o mouse para ver anotação • Clique para editar'
              : !hoverInfo ? 'Passe o mouse sobre a pista para ver os valores' : null}
        </div>

        {/* Tooltip de hover do trecho */}
        {hoveredSegmentNum !== null && clickedSegmentNum === null && (() => {
          const segColor = SEGMENT_COLORS[(hoveredSegmentNum - 1) % SEGMENT_COLORS.length];
          const segName  = segmentNames[hoveredSegmentNum] || `Trecho ${hoveredSegmentNum}`;
          const comment  = showAnnotations ? (segmentComments[hoveredSegmentNum] || '') : '';
          const containerW = mapContainerRef.current?.getBoundingClientRect().width || 600;
          const ttW = 220;
          const rawX = hoverSegPos.x + 14;
          const safeX = rawX + ttW > containerW - 8 ? hoverSegPos.x - ttW - 14 : rawX;
          const safeY = Math.max(hoverSegPos.y - 10, 8);
          return (
            <div style={{
              position: 'absolute',
              left: safeX,
              top: safeY,
              zIndex: 15,
              background: COLORS.bgCard,
              border: `1.5px solid ${segColor}`,
              borderRadius: 8,
              padding: '8px 12px',
              maxWidth: ttW,
              minWidth: 120,
              boxShadow: '0 4px 20px rgba(0,0,0,0.75)',
              pointerEvents: 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: comment ? 6 : 0 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: segColor, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 700, color: '#000',
                }}>
                  {hoveredSegmentNum}
                </div>
                <span style={{ fontWeight: 700, fontSize: 12, color: segColor }}>{segName}</span>
              </div>
              {comment ? (
                <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {comment}
                </div>
              ) : (
                <div style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic' }}>
                  Clique para adicionar anotação
                </div>
              )}
            </div>
          );
        })()}

        {/* Popup de anotação do trecho */}
        {clickedSegmentNum !== null && (
          <div style={{
            position: 'absolute',
            left: clickPopupPos.x,
            top: clickPopupPos.y,
            zIndex: 20,
            background: COLORS.bgCard,
            border: `1.5px solid ${SEGMENT_COLORS[(clickedSegmentNum - 1) % SEGMENT_COLORS.length]}`,
            borderRadius: 8,
            padding: '10px 12px',
            width: 250,
            boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: SEGMENT_COLORS[(clickedSegmentNum - 1) % SEGMENT_COLORS.length],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 700, color: '#000', flexShrink: 0,
                }}>
                  {clickedSegmentNum}
                </div>
                <span style={{ fontWeight: 700, fontSize: 12, color: SEGMENT_COLORS[(clickedSegmentNum - 1) % SEGMENT_COLORS.length] }}>
                  {segmentNames[clickedSegmentNum] || `Trecho ${clickedSegmentNum}`}
                </span>
              </div>
              <button
                onClick={() => setClickedSegmentNum(null)}
                style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
              >✕</button>
            </div>
            <textarea
              autoFocus
              value={segmentComments[clickedSegmentNum] || ''}
              onChange={(e) => setSegmentComments((prev) => ({ ...prev, [clickedSegmentNum]: e.target.value }))}
              placeholder="Anotações sobre este trecho..."
              rows={3}
              style={{
                width: '100%', background: COLORS.bgCard, color: COLORS.textSecondary,
                border: `1px solid ${COLORS.border}`, borderRadius: 4,
                padding: '5px 7px', fontSize: 11, resize: 'vertical',
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>
        )}
      </div>

      {/* Painel de notas gerais */}
      <div style={{ width: 220, ...theme.card, padding: '12px 14px', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, marginBottom: 10 }}>
          📋 Notas Gerais
        </div>

        {/* Notas por trecho (read-only, identificadas) */}
        {showAnnotations && segments.length > 0 && Object.keys(segmentComments).some((k) => segmentComments[k]?.trim()) && (
          <div style={{ marginBottom: 10 }}>
            {segments.map((seg, si) => {
              const num     = si + 1;
              const comment = segmentComments[num];
              if (!comment?.trim()) return null;
              const name = segmentNames[num] || `Trecho ${num}`;
              return (
                <div key={num} style={{ marginBottom: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%', background: seg.color,
                      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 7, fontWeight: 700, color: '#000',
                    }}>{num}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: seg.color }}>{name}</span>
                  </div>
                  {comment.trim().split('\n').map((line, li) =>
                    line.trim() ? (
                      <div key={li} style={{ display: 'flex', gap: 4, marginBottom: 2, paddingLeft: 17, alignItems: 'flex-start' }}>
                        <span style={{ color: seg.color, fontSize: 12, lineHeight: 1.3, flexShrink: 0 }}>•</span>
                        <span style={{ fontSize: 10, color: COLORS.textSecondary, lineHeight: 1.4 }}>{line.trim()}</span>
                      </div>
                    ) : null
                  )}
                </div>
              );
            })}
            {generalNotes.trim() && (
              <div style={{ borderTop: `1px solid ${COLORS.border}33`, marginTop: 4, paddingTop: 6 }} />
            )}
          </div>
        )}

        {/* Preview bullets das notas gerais */}
        {showAnnotations && generalNotes.split('\n').filter((l) => l.trim()).length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gerais</div>
            {generalNotes.split('\n').map((line, i) =>
              line.trim() ? (
                <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 4, alignItems: 'flex-start' }}>
                  <span style={{ color: COLORS.accent, fontSize: 13, lineHeight: 1.3, flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.4 }}>{line.trim()}</span>
                </div>
              ) : null
            )}
          </div>
        )}

        <textarea
          value={generalNotes}
          onChange={(e) => setGeneralNotes(e.target.value)}
          placeholder={'Linha 1 → bullet 1\nLinha 2 → bullet 2\n...'}
          rows={6}
          style={{
            width: '100%', background: COLORS.bgCard, color: COLORS.textSecondary,
            border: `1px solid ${COLORS.border}`, borderRadius: 4,
            padding: '5px 7px', fontSize: 11, resize: 'vertical',
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            lineHeight: 1.5,
          }}
        />
        <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 4 }}>
          Notas por trecho aparecem automaticamente acima
        </div>

        {/* Salvar anotações */}
        {loadedSegmentId && profiles.length > 0 && (
          <div style={{ marginTop: 10, borderTop: `1px solid ${COLORS.border}33`, paddingTop: 10 }}>
            {/* Nome da anotação (duplo clique para renomear) */}
            {editingAnnotationName ? (
              <input
                autoFocus
                value={tempAnnotationName}
                onChange={(e) => setTempAnnotationName(e.target.value)}
                onBlur={() => {
                  const v = tempAnnotationName.trim();
                  if (v) setAnnotationName(v);
                  setEditingAnnotationName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = tempAnnotationName.trim();
                    if (v) setAnnotationName(v);
                    setEditingAnnotationName(false);
                  }
                  if (e.key === 'Escape') setEditingAnnotationName(false);
                }}
                style={{
                  width: '100%', background: COLORS.bgCard, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.blue}`, borderRadius: 4,
                  padding: '3px 6px', fontSize: 12, fontWeight: 700,
                  outline: 'none', boxSizing: 'border-box', marginBottom: 4,
                }}
              />
            ) : (
              <div
                title="Duplo clique para renomear"
                onDoubleClick={() => { setTempAnnotationName(annotationName); setEditingAnnotationName(true); }}
                style={{
                  fontSize: 12, fontWeight: 700, color: COLORS.textPrimary,
                  marginBottom: 2, cursor: 'default', userSelect: 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {annotationName || loadedSegmentName}
              </div>
            )}
            <div style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 6 }}>
              Template: <span style={{ color: COLORS.textSecondary }}>{loadedSegmentName}</span>
            </div>
            <div style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 4 }}>Salvar no perfil:</div>
            <select
              value={saveAnnotationProfileId || activeProfileId || ''}
              onChange={(e) => { setSaveAnnotationProfileId(e.target.value); setSaveAnnotationGroupId(null); }}
              style={{
                width: '100%', background: COLORS.bgCard, color: COLORS.textSecondary,
                border: `1px solid ${COLORS.border}`, borderRadius: 4,
                padding: '4px 6px', fontSize: 11, outline: 'none',
                marginBottom: 7,
              }}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.id === activeProfileId ? ' (ativo)' : ''}</option>
              ))}
            </select>
            {(() => {
              const selProfileId = saveAnnotationProfileId || activeProfileId;
              const selProfile = profiles.find((p) => p.id === selProfileId);
              const groups = selProfile?.groups || [];
              if (groups.length === 0) return null;
              return (
                <>
                  <div style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 4 }}>Subpasta (opcional):</div>
                  <select
                    value={saveAnnotationGroupId || ''}
                    onChange={(e) => setSaveAnnotationGroupId(e.target.value || null)}
                    style={{
                      width: '100%', background: COLORS.bgCard, color: COLORS.textSecondary,
                      border: `1px solid ${COLORS.border}`, borderRadius: 4,
                      padding: '4px 6px', fontSize: 11, outline: 'none',
                      marginBottom: 7,
                    }}
                  >
                    <option value=''>— Sem subpasta —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </>
              );
            })()}
            <button
              onClick={handleSaveAnnotations}
              style={{
                width: '100%', padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', border: 'none',
                background: annotationSaved ? `${COLORS.green}30` : `${COLORS.blue}25`,
                color: annotationSaved ? COLORS.green : COLORS.blue,
                transition: 'background 0.3s, color 0.3s',
              }}
            >
              {annotationSaved ? '✓ Salvo' : '💾 Salvar anotações'}
            </button>
          </div>
        )}
        {!loadedSegmentId && segments.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 9, color: COLORS.textMuted, lineHeight: 1.4, borderTop: `1px solid ${COLORS.border}33`, paddingTop: 8 }}>
            Carregue um template para salvar anotações
          </div>
        )}
      </div>

      </div>{/* fim flex mapa+notas */}

      {/* Legenda */}
      {overlayMode ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', marginBottom: overlayColorMode !== 'lap' ? 8 : 0 }}>
            {overlayLaps.map(({ sessionId, lapNum }, li) => {
              const color = LAP_COLORS[li % LAP_COLORS.length];
              const lapInfo = sessionId === 'main'
                ? lapsAnalysis[lapNum]
                : extraSessions.find(s => s.sessionId === sessionId)?.lapsAnalysis?.[lapNum];
              const sessLabel = sessionId !== 'main'
                ? ` [${shortName(extraSessions.find(s => s.sessionId === sessionId)?.fileName || '')}]`
                : '';
              return (
                <div key={`${sessionId}:${lapNum}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color }}>
                  <div style={{ width: 24, height: 3, borderRadius: 2, background: color }} />
                  V{lapNum}{sessLabel} — {formatLapTime(lapInfo?.lapTime)}
                </div>
              );
            })}
          </div>
          {overlayColorMode !== 'lap' && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textMuted }}>
                <div style={{
                  width: 60, height: 4, borderRadius: 2,
                  background: 'linear-gradient(90deg, #06d6a0, #ffd166, #e63946)',
                }} />
                {overlayColorMode === 'speed' ? 'Baixa → Alta velocidade' : 'Baixo → Alto'}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textMuted }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS.green }} />
            Início / Fim
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textMuted }}>
            <div style={{
              width: 60, height: 4, borderRadius: 2,
              background: 'linear-gradient(90deg, #06d6a0, #ffd166, #e63946)',
            }} />
            {colorBy === 'speed' ? 'Baixa → Alta velocidade' : 'Baixo → Alto'}
          </div>
        </div>
      )}

      {/* ── Tabela de Trechos (somente modo volta única) ── */}
      {!overlayMode && segmentStats.length > 0 && (
        <div style={{ ...theme.card, padding: 0, overflow: 'hidden', marginTop: 16 }}>
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
              Análise por Trecho — Volta {selectedLap}
            </span>
            <button
              onClick={() => setSegmentBoundaries([])}
              style={{
                background: 'transparent', border: `1px solid ${COLORS.border}`,
                color: COLORS.textMuted, borderRadius: 6, fontSize: 11,
                padding: '3px 10px', cursor: 'pointer',
              }}
            >
              Limpar trechos
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: `${COLORS.bg}cc` }}>
                  {[
                    { label: 'Trecho',      color: COLORS.textMuted },
                    { label: 'Vel. Méd\nkm/h', color: COLORS.green },
                    { label: 'Vel. Máx\nkm/h', color: COLORS.green },
                    { label: 'Vel. Mín\nkm/h', color: COLORS.cyan },
                    { label: 'RPM Méd',    color: COLORS.orange },
                    { label: 'RPM Máx',    color: COLORS.orange },
                    { label: 'Acel. Méd\n%', color: COLORS.purple },
                    { label: 'Acel. Máx\n%', color: COLORS.purple },
                  ].map(({ label, color }, ci) => (
                    <th
                      key={ci}
                      style={{
                        padding: '8px 10px',
                        textAlign: ci === 0 ? 'left' : 'center',
                        color, fontSize: 10, fontWeight: 600,
                        borderBottom: `1px solid ${COLORS.border}`,
                        whiteSpace: 'pre-line', lineHeight: 1.3,
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {segmentStats.map((s) => (
                  <tr key={s.num} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                    {/* Nome do trecho (duplo clique para renomear) */}
                    <td style={{ padding: '8px 12px', borderLeft: `3px solid ${s.color}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: s.color, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: '#000',
                        }}>
                          {s.num}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {editingSegName === s.num ? (
                            <input
                              autoFocus
                              value={tempSegName}
                              onChange={(e) => setTempSegName(e.target.value)}
                              onBlur={() => {
                                const v = tempSegName.trim();
                                setSegmentNames((prev) => ({ ...prev, [s.num]: v || undefined }));
                                setEditingSegName(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const v = tempSegName.trim();
                                  setSegmentNames((prev) => ({ ...prev, [s.num]: v || undefined }));
                                  setEditingSegName(null);
                                }
                                if (e.key === 'Escape') setEditingSegName(null);
                              }}
                              style={{
                                background: COLORS.bgCard, color: COLORS.textPrimary,
                                border: `1px solid ${s.color}`, borderRadius: 4,
                                padding: '2px 6px', fontSize: 12, fontWeight: 600,
                                outline: 'none', width: 120,
                              }}
                            />
                          ) : (
                            <span
                              title="Duplo clique para renomear"
                              onDoubleClick={() => {
                                setTempSegName(segmentNames[s.num] || `Trecho ${s.num}`);
                                setEditingSegName(s.num);
                              }}
                              style={{
                                color: COLORS.textPrimary, fontWeight: 600,
                                cursor: 'text', userSelect: 'none',
                              }}
                            >
                              {segmentNames[s.num] || `Trecho ${s.num}`}
                            </span>
                          )}
                          {showAnnotations && segmentComments[s.num] && (
                            <span
                              style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic', maxWidth: 200, cursor: 'default' }}
                              title={segmentComments[s.num]}
                            >
                              💬 {segmentComments[s.num].length > 40 ? segmentComments[s.num].slice(0, 40) + '…' : segmentComments[s.num]}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.green, fontWeight: 600 }}>
                      {s.speed.avg != null ? s.speed.avg.toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.green, fontWeight: 600 }}>
                      {s.speed.max != null ? s.speed.max.toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.cyan, fontWeight: 600 }}>
                      {s.speed.min != null ? s.speed.min.toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.orange, fontWeight: 600 }}>
                      {s.rpm.avg != null ? Math.round(s.rpm.avg) : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.orange, fontWeight: 600 }}>
                      {s.rpm.max != null ? Math.round(s.rpm.max) : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.purple, fontWeight: 600 }}>
                      {s.throttle.avg != null ? s.throttle.avg.toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', color: COLORS.purple, fontWeight: 600 }}>
                      {s.throttle.max != null ? s.throttle.max.toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{
            padding: '8px 16px', borderTop: `1px solid ${COLORS.border}`,
            fontSize: 10, color: COLORS.textMuted,
          }}>
            Cada trecho é definido entre dois marcadores consecutivos clicados na pista.
          </div>
        </div>
      )}

      {/* ── Tabela: Volta mais rápida por trecho ── */}
      {segmentLapTiming.length > 0 && (
        <div style={{ ...theme.card, padding: 0, overflow: 'hidden', marginTop: 16 }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${COLORS.border}` }}>
            <span style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
              Volta mais rápida por trecho
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: `${COLORS.bg}cc` }}>
                  <th style={{
                    padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap',
                    color: COLORS.textMuted, fontSize: 10, fontWeight: 600,
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                    Trecho
                  </th>
                  <th style={{
                    padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap',
                    color: COLORS.green, fontSize: 10, fontWeight: 600,
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                    ⚡ Melhor Volta
                  </th>
                  <th style={{
                    padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap',
                    color: COLORS.green, fontSize: 10, fontWeight: 600,
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                    Tempo
                  </th>
                  {segmentLapTiming[0].lapResults.map(({ sessionId, lapNum }, li) => {
                    const sessLabel = sessionId !== 'main'
                      ? ` [${shortName(extraSessions.find(s => s.sessionId === sessionId)?.fileName || '')}]`
                      : '';
                    return (
                      <th key={`${sessionId}:${lapNum}`} style={{
                        padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap',
                        color: LAP_COLORS[li % LAP_COLORS.length],
                        fontSize: 10, fontWeight: 600,
                        borderBottom: `1px solid ${COLORS.border}`,
                      }}>
                        V{lapNum}{sessLabel}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {segmentLapTiming.map((seg) => (
                  <tr key={seg.segNum} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                    {/* Trecho */}
                    <td style={{ padding: '8px 12px', borderLeft: `3px solid ${seg.color}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%', background: seg.color,
                          flexShrink: 0, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#000',
                        }}>
                          {seg.segNum}
                        </div>
                        <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>
                          {segmentNames[seg.segNum] || `Trecho ${seg.segNum}`}
                        </span>
                      </div>
                    </td>
                    {/* Melhor volta */}
                    <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                      {seg.fastestLap != null ? (
                        <span style={{
                          background: `${COLORS.green}20`, color: COLORS.green,
                          borderRadius: 6, padding: '2px 10px', fontWeight: 700, fontSize: 12,
                        }}>
                          V{seg.fastestLap}
                        </span>
                      ) : '—'}
                    </td>
                    {/* Tempo do melhor */}
                    <td style={{ padding: '7px 12px', textAlign: 'center', color: COLORS.green, fontWeight: 700 }}>
                      {fmtSegTime(seg.fastestTime)}
                    </td>
                    {/* Uma coluna por volta */}
                    {seg.lapResults.map(({ sessionId, lapNum, time }, li) => {
                      const isFastest = lapNum === seg.fastestLap && sessionId === seg.fastestSessionId;
                      const delta = isFastest || seg.fastestTime == null || time == null
                        ? null
                        : time - seg.fastestTime;
                      return (
                        <td key={`${sessionId}:${lapNum}`} style={{
                          padding: '7px 10px', textAlign: 'center',
                          fontWeight: isFastest ? 700 : 400,
                          color: isFastest ? COLORS.green : time != null ? COLORS.textSecondary : COLORS.textMuted,
                          background: isFastest ? `${COLORS.green}10` : 'transparent',
                        }}>
                          {time != null ? (
                            <>
                              {fmtSegTime(time)}
                              {delta != null && (
                                <div style={{ fontSize: 9, color: COLORS.accent, marginTop: 1 }}>
                                  +{delta.toFixed(3)}s
                                </div>
                              )}
                            </>
                          ) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {segmentLapTiming[0]?.usedFallback && (
            <div style={{ padding: '8px 16px', borderTop: `1px solid ${COLORS.border}`, fontSize: 10, color: COLORS.textMuted }}>
              * Tempos estimados por proporção de amostras (canal de tempo não detectado)
            </div>
          )}
        </div>
      )}

      {/* ── Painel de Análise de Traçado ─────────────────────────────────── */}
      {showAnalysisPanel && detectedTrack && racingLineAnalysis && !overlayMode && (
        <div style={{ ...theme.card, padding: 0, overflow: 'hidden', marginTop: 16 }}>
          {/* Cabeçalho */}
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          }}>
            <div>
              <span style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
                📐 Análise de Traçado — {detectedTrack.shortName}
              </span>
              {racingLineAnalysis.overallScore !== null && (
                <span style={{
                  marginLeft: 12, fontSize: 12, fontWeight: 700,
                  color: racingLineAnalysis.overallScore >= 75 ? COLORS.green
                       : racingLineAnalysis.overallScore >= 50 ? COLORS.orange
                       : COLORS.accent,
                }}>
                  Score: {racingLineAnalysis.overallScore}%
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>Volta:</span>
              <select
                value={analysisLap || selectedLap}
                onChange={(e) => setAnalysisLap(e.target.value)}
                style={{ ...theme.select, fontSize: 11, padding: '3px 8px' }}
              >
                {validLaps.map((n) => (
                  <option key={n} value={n}>V{n} — {formatLapTime(lapsAnalysis[n]?.lapTime)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards das curvas */}
          <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {racingLineAnalysis.cornerAnalysis.map((corner) => {
              const levelColor = corner.position?.color || COLORS.textMuted;
              return (
                <div key={corner.id} style={{
                  borderRadius: 8,
                  border: `1px solid ${corner.hasData ? levelColor + '50' : COLORS.border}`,
                  background: corner.hasData ? `${levelColor}08` : `${COLORS.bgCard}`,
                  padding: '10px 12px',
                }}>
                  {/* Header da curva */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: levelColor, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary }}>{corner.name}</span>
                    </div>
                    {corner.hasData && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: levelColor }}>
                        {corner.position?.label}
                      </span>
                    )}
                  </div>

                  {/* Offset lateral */}
                  {corner.hasData && corner.avgOffset !== null && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{
                        height: 4, borderRadius: 2, background: `${COLORS.border}55`,
                        position: 'relative', overflow: 'visible', marginBottom: 3,
                      }}>
                        {/* Barra de offset */}
                        <div style={{
                          position: 'absolute',
                          left: '50%',
                          top: 0, height: '100%',
                          width: `${Math.min(Math.abs(corner.avgOffset) * 6, 50)}%`,
                          transform: corner.avgOffset > 0 ? 'translateX(0)' : 'translateX(-100%)',
                          background: levelColor,
                          borderRadius: 2,
                          transition: 'width 0.3s',
                        }} />
                        {/* Linha central */}
                        <div style={{
                          position: 'absolute', left: '50%', top: -2,
                          width: 2, height: 8, background: COLORS.textMuted,
                          transform: 'translateX(-50%)',
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: COLORS.textMuted }}>
                        <span>← Esquerda</span>
                        <span style={{ color: levelColor, fontWeight: 600 }}>
                          {Math.abs(corner.avgOffset).toFixed(1)}m {corner.avgOffset > 0 ? '→ dir' : '← esq'}
                        </span>
                        <span>Direita →</span>
                      </div>
                    </div>
                  )}

                  {/* Conselho */}
                  <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5 }}>
                    {corner.advice}
                  </div>

                  {!corner.hasData && (
                    <div style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic' }}>
                      Dados insuficientes para esta curva
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legenda */}
          <div style={{
            padding: '8px 16px', borderTop: `1px solid ${COLORS.border}`,
            display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, color: COLORS.textMuted,
          }}>
            {[
              { color: '#06d6a0', label: 'Traçado ideal (< 1.2m)' },
              { color: '#ffd166', label: 'Levemente fora (1.2–2.8m)' },
              { color: '#f77f00', label: 'Muito fora (2.8–5m)' },
              { color: '#e63946', label: 'Extremamente fora (> 5m)' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                {label}
              </div>
            ))}
            <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>
              Offset em relação à linha de centro da pista
            </span>
          </div>
        </div>
      )}

      {/* ── Relatório máx/mín — Volta única ── */}
      {!overlayMode && validLaps.length > 0 && (
        <SessionStatsTable
          reports={[singleSessionStats]}
          title="Relatório — Máximos e Mínimos da Sessão"
          COLORS={COLORS}
          theme={theme}
        />
      )}

      {/* ── Sessões de referência + relatório — Sobreposição ── */}
      {overlayMode && (
        <>
          {/* Lista de sessões adicionadas (só quando existem) */}
          {extraSessions.length > 0 && <div style={{ ...theme.card, marginTop: 16 }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, marginBottom: 10 }}>
              Sessões de referência adicionadas
            </div>
            {extraError && (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: `${COLORS.accent}15`, color: COLORS.accent, fontSize: 12, marginBottom: 10 }}>
                ⚠️ {extraError}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {extraSessions.map((sess, i) => {
                const color = SESSION_COLORS[(i + 1) % SESSION_COLORS.length];
                return (
                  <div
                    key={sess.sessionId}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 6,
                      border: `2px solid ${color}`,
                      background: `${color}18`,
                      color,
                    }}
                  >
                    {shortName(sess.fileName)}
                    <span
                      onClick={() => removeExtraSession?.(sess.sessionId)}
                      title="Remover sessão"
                      style={{ cursor: 'pointer', opacity: 0.55, fontSize: 14, marginLeft: 2 }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.55)}
                    >
                      ✕
                    </span>
                  </div>
                );
              })}
            </div>
          </div>}

          {/* Tabela máx/mín — principal + todas as sessões adicionadas */}
          <SessionStatsTable
            reports={allSessionsReport}
            title="Relatório — Máximos e Mínimos por Sessão"
            COLORS={COLORS}
            theme={theme}
          />
        </>
      )}
      <PrintFooter />
    </div>
  );
}
