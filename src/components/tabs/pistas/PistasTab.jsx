/**
 * PistasTab — Banco de Pistas & Evolução de Condições
 *
 * Seções:
 *  1. Características da Pista — identificação, curvas, altimetria, largura,
 *     asfalto, banking, pontos de freio, retas (auto-detect + editável)
 *  2. Evolução da Pista — entradas por sessão (borracha, temperatura,
 *     mármore, umidade, degradação, grip map, delta de tempo)
 *
 * Auto-detecção de retas via centerline GPS (haversine + bearing).
 * Persistência: localStorage
 *   rt_track_custom_<profileId>  — customizações por pista
 *   rt_track_evol_<profileId>    — entradas de evolução
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useColors } from '@/context/ThemeContext';
import { TRACK_DATABASE } from '@/core/tracks';
import { PrintFooter } from '@/components/common';
import { TRACK_SELECTED_EVENT } from '@/core/crossTabSync';

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Distância em metros entre dois pontos lat/lng (Haversine). */
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Bearing em graus (0–360) de p1 para p2. */
function bearingDeg(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Diferença angular mínima entre dois bearings (0–180). */
function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Detecta retas na centerline GPS.
 * @param {Array<{lat:number,lng:number}>} pts
 * @param {number} minLen comprimento mínimo da reta em metros (default 80)
 * @param {number} maxAngle variação máxima de bearing em graus (default 10)
 * @returns {Array<{startIdx:number, endIdx:number, length:number}>}
 */
function detectStraights(pts, minLen = 80, maxAngle = 10) {
  if (!pts || pts.length < 3) return [];
  const straights = [];
  let segStart = 0;
  let refBearing = bearingDeg(pts[0].lat, pts[0].lng, pts[1].lat, pts[1].lng);

  for (let i = 1; i < pts.length - 1; i++) {
    const b = bearingDeg(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
    if (angleDiff(b, refBearing) > maxAngle) {
      // end of straight candidate — measure total length
      let len = 0;
      for (let j = segStart; j < i; j++) {
        len += haversineM(pts[j].lat, pts[j].lng, pts[j + 1].lat, pts[j + 1].lng);
      }
      if (len >= minLen) {
        straights.push({ startIdx: segStart, endIdx: i, length: Math.round(len) });
      }
      segStart = i;
      refBearing = b;
    }
  }
  // check final segment
  let len = 0;
  for (let j = segStart; j < pts.length - 1; j++) {
    len += haversineM(pts[j].lat, pts[j].lng, pts[j + 1].lat, pts[j + 1].lng);
  }
  if (len >= minLen) {
    straights.push({ startIdx: segStart, endIdx: pts.length - 1, length: Math.round(len) });
  }
  return straights;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CUSTOM_KEY = 'rt_track_custom_';
const EVOL_KEY   = 'rt_track_evol_';

const ASPHALT_TYPES = [
  { value: '',           label: '— Selecionar —' },
  { value: 'liso',       label: 'Liso (novo)' },
  { value: 'medio',      label: 'Médio' },
  { value: 'rugoso',     label: 'Rugoso' },
  { value: 'desgastado', label: 'Desgastado / Polido' },
];

const SESSION_TYPES = [
  { value: 'treino_livre',  label: 'Treino Livre' },
  { value: 'classificacao', label: 'Classificação' },
  { value: 'corrida',       label: 'Corrida' },
  { value: 'teste',         label: 'Teste / Shakedown' },
];

const EMPTY_CUSTOM = () => ({
  length:          '',
  direction:       '',
  cornersLow:      '',
  cornersMedium:   '',
  cornersFast:     '',
  altVariation:    '',
  altMax:          '',
  altMin:          '',
  climbTotal:      '',
  descentTotal:    '',
  widthMain:       '',
  widthPit:        '',
  asphaltType:     '',
  asphaltAge:      '',
  macrotexture:    '',
  gripMu:          '',
  gripNotes:       '',
  bankingAngles:   [],
  brakingPoints:   [],
  straights:       [],
  // ── Pit Lane (para Estratégia) ──
  pitLaneLength:   '',   // comprimento do pit lane (m)
  pitSpeedLimit:   '',   // velocidade limite no pit (km/h)
  pitEntryLength:  '',   // comprimento da entrada do pit (m)
  pitExitLength:   '',   // comprimento da saída do pit (m)
  // ── Setores ──
  sectors:         [],   // [{ name, startDistance, endDistance }]
  // ── Consumo e desgaste ──
  fuelFactor:      '',   // multiplicador de consumo da pista (1.0 = referência)
  tireFactor:      '',   // multiplicador de desgaste da pista (1.0 = referência)
  notes:           '',
  _modified:       false,
});

const EMPTY_EVOL = (trackId) => ({
  id:                   crypto.randomUUID(),
  trackId,
  sessionName:          '',
  date:                 new Date().toISOString().split('T')[0],
  sessionType:          'treino_livre',
  rubberRating:         5,
  rubberNotes:          '',
  tempMorning:          '',
  tempAfternoon:        '',
  tempNight:            '',
  marblesRating:        0,
  marblesSectors:       '',
  dustRating:           0,
  humidityStart:        '',
  humidityEnd:          '',
  asphaltPolishRating:  0,
  degradationNotes:     '',
  gripMap:              [],
  lapDeltas:            [],
  deltaTotal:           '',
  notes:                '',
  _expanded:            false,
});

// ── TrackMiniMap ──────────────────────────────────────────────────────────────

function TrackMiniMap({ centerline, C }) {
  if (!centerline || centerline.length < 3) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of centerline) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const pad = 10;
  const w = 260, h = 160;
  const dLat = maxLat - minLat || 0.001;
  const dLng = maxLng - minLng || 0.001;
  const scale = Math.min((w - 2 * pad) / dLng, (h - 2 * pad) / dLat);
  const cx = w / 2, cy = h / 2;
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;

  const points = centerline.map(p => {
    const x = cx + (p.lng - midLng) * scale;
    const y = cy - (p.lat - midLat) * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const d = 'M' + points.join(' L') + ' Z';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: 280, height: 'auto', display: 'block', margin: '10px auto' }}>
      <path d={d} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* Start/finish marker */}
      <circle cx={parseFloat(points[0].split(',')[0])} cy={parseFloat(points[0].split(',')[1])} r={4} fill={C.green} />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PistasTab({ activeProfile, onSaveTrackToProfile }) {
  const C = useColors();
  const profileId = activeProfile?.id || 'default';

  const customKey = `${CUSTOM_KEY}${profileId}`;
  const evolKey   = `${EVOL_KEY}${profileId}`;

  // ── state ──────────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId]   = useState(TRACK_DATABASE[0]?.id || '');
  const [editMode, setEditMode]       = useState(false);
  const [customs, setCustoms]         = useState(() => {
    try { return JSON.parse(localStorage.getItem(customKey)) || {}; } catch { return {}; }
  });
  const [evols, setEvols]             = useState(() => {
    try { return JSON.parse(localStorage.getItem(evolKey)) || []; } catch { return []; }
  });
  const [showAddEvol, setShowAddEvol] = useState(false);
  const [newEvol, setNewEvol]         = useState(() => EMPTY_EVOL(''));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [trackSaveName, setTrackSaveName] = useState('');
  const [trackSaveMsg, setTrackSaveMsg]   = useState(null);

  // reload when profile changes
  useEffect(() => {
    try { setCustoms(JSON.parse(localStorage.getItem(customKey)) || {}); } catch { setCustoms({}); }
    try { setEvols(JSON.parse(localStorage.getItem(evolKey)) || []); }   catch { setEvols([]); }
  }, [customKey, evolKey]);

  // ── derived ────────────────────────────────────────────────────────────────
  const baseTrack  = useMemo(() => TRACK_DATABASE.find(t => t.id === selectedId), [selectedId]);
  const custom     = useMemo(() => customs[selectedId] || {}, [customs, selectedId]);
  const isModified = !!custom._modified;

  const autoStraights = useMemo(() => {
    if (!baseTrack?.centerline?.length) return [];
    return detectStraights(baseTrack.centerline);
  }, [baseTrack]);

  const effectiveStraights = useMemo(() =>
    (custom.straights?.length > 0)
      ? custom.straights
      : autoStraights.map((s, i) => ({
          id:         `straight_${i}`,
          name:       `Reta ${i + 1}`,
          lengthM:    s.length,
          speedStart: '',
          speedEnd:   '',
          gearRec:    '',
          notes:      '',
        })),
  [custom.straights, autoStraights]);

  const trackEvols = evols;

  // ── persist ────────────────────────────────────────────────────────────────
  const persistCustoms = useCallback((next) => {
    setCustoms(next);
    localStorage.setItem(customKey, JSON.stringify(next));
  }, [customKey]);

  const persistEvols = useCallback((next) => {
    setEvols(next);
    localStorage.setItem(evolKey, JSON.stringify(next));
  }, [evolKey]);

  // ── Salva pista ativa e dispara evento quando seleção muda ──────────────────
  useEffect(() => {
    if (!selectedId || !baseTrack) return;
    const lengthM = Number(custom.length || baseTrack.length) || 0;
    const data = {
      trackId:      selectedId,
      name:         baseTrack.name,
      lengthKm:     +(lengthM / 1000).toFixed(3),
      pitSpeedLimit: custom.pitSpeedLimit || '',
      fuelFactor:    custom.fuelFactor    || '',
      tireFactor:    custom.tireFactor    || '',
    };
    try { localStorage.setItem(`rt_active_track_${profileId}`, JSON.stringify(data)); } catch { /* noop */ }
    window.dispatchEvent(new CustomEvent(TRACK_SELECTED_EVENT, { detail: data }));
  }, [selectedId, baseTrack, custom, profileId]);

  // ── helpers ────────────────────────────────────────────────────────────────
  const setField = useCallback((field) => (val) => {
    persistCustoms({
      ...customs,
      [selectedId]: { ...EMPTY_CUSTOM(), ...custom, [field]: val, _modified: true },
    });
  }, [customs, custom, selectedId, persistCustoms]);

  const resetToOriginal = useCallback(() => {
    if (!window.confirm('Resetar para os dados originais da pista? As suas edições serão perdidas.')) return;
    const next = { ...customs };
    delete next[selectedId];
    persistCustoms(next);
  }, [customs, selectedId, persistCustoms]);

  // banking
  const addBanking = () => {
    const list = [...(custom.bankingAngles || []), { id: crypto.randomUUID(), name: '', angle: '' }];
    persistCustoms({ ...customs, [selectedId]: { ...EMPTY_CUSTOM(), ...custom, bankingAngles: list, _modified: true } });
  };
  const updateBanking = (id, field, val) => {
    const list = (custom.bankingAngles || []).map(b => b.id === id ? { ...b, [field]: val } : b);
    persistCustoms({ ...customs, [selectedId]: { ...EMPTY_CUSTOM(), ...custom, bankingAngles: list, _modified: true } });
  };
  const removeBanking = (id) => {
    const list = (custom.bankingAngles || []).filter(b => b.id !== id);
    persistCustoms({ ...customs, [selectedId]: { ...EMPTY_CUSTOM(), ...custom, bankingAngles: list, _modified: true } });
  };

  // braking points
  const addBraking = () => {
    const list = [...(custom.brakingPoints || []), { id: crypto.randomUUID(), name: '', distFromApex: '', refSpeedEntry: '', refSpeedMin: '', notes: '' }];
    persistCustoms({ ...customs, [selectedId]: { ...EMPTY_CUSTOM(), ...custom, brakingPoints: list, _modified: true } });
  };
  const updateBraking = (id, field, val) => {
    const list = (custom.brakingPoints || []).map(b => b.id === id ? { ...b, [field]: val } : b);
    persistCustoms({ ...customs, [selectedId]: { ...EMPTY_CUSTOM(), ...custom, brakingPoints: list, _modified: true } });
  };
  const removeBraking = (id) => {
    const list = (custom.brakingPoints || []).filter(b => b.id !== id);
    persistCustoms({ ...customs, [selectedId]: { ...EMPTY_CUSTOM(), ...custom, brakingPoints: list, _modified: true } });
  };

  // straights
  const updateStraight = (id, field, val) => {
    const list = effectiveStraights.map(s => s.id === id ? { ...s, [field]: val } : s);
    persistCustoms({ ...customs, [selectedId]: { ...EMPTY_CUSTOM(), ...custom, straights: list, _modified: true } });
  };
  const removeStraight = (id) => {
    const list = effectiveStraights.filter(s => s.id !== id);
    persistCustoms({ ...customs, [selectedId]: { ...EMPTY_CUSTOM(), ...custom, straights: list, _modified: true } });
  };
  const addStraight = () => {
    const list = [...effectiveStraights, {
      id: crypto.randomUUID(),
      name: `Reta ${effectiveStraights.length + 1}`,
      lengthM: '', speedStart: '', speedEnd: '', gearRec: '', notes: '',
    }];
    persistCustoms({ ...customs, [selectedId]: { ...EMPTY_CUSTOM(), ...custom, straights: list, _modified: true } });
  };

  // evolutions
  const addEvolution = () => {
    if (!newEvol.trackId) { alert('Selecione uma pista.'); return; }
    if (!newEvol.sessionName.trim()) { alert('Informe o nome da sessão.'); return; }
    const entry = { ...newEvol, id: crypto.randomUUID(), _expanded: false };
    persistEvols([entry, ...evols]);
    setNewEvol(EMPTY_EVOL(selectedId));
    setShowAddEvol(false);
  };
  const deleteEvol   = (id) => persistEvols(evols.filter(e => e.id !== id));
  const toggleEvol   = (id) => persistEvols(evols.map(e => e.id === id ? { ...e, _expanded: !e._expanded } : e));
  const updateEvol   = (id, field, val) => persistEvols(evols.map(e => e.id === id ? { ...e, [field]: val } : e));

  // grip map
  const addGripRegion = (evolId) => {
    const entry = evols.find(e => e.id === evolId);
    if (!entry) return;
    const gm = [...(entry.gripMap || []), { id: crypto.randomUUID(), label: '', gripLevel: 5, notes: '' }];
    persistEvols(evols.map(e => e.id === evolId ? { ...e, gripMap: gm } : e));
  };
  const updateGripRegion = (evolId, regionId, field, val) => {
    persistEvols(evols.map(e => {
      if (e.id !== evolId) return e;
      return { ...e, gripMap: (e.gripMap || []).map(g => g.id === regionId ? { ...g, [field]: val } : g) };
    }));
  };
  const removeGripRegion = (evolId, regionId) => {
    persistEvols(evols.map(e =>
      e.id !== evolId ? e : { ...e, gripMap: (e.gripMap || []).filter(g => g.id !== regionId) }
    ));
  };

  // ── save track to profile ─────────────────────────────────────────────────
  const handleSaveTrackToProfile = useCallback(() => {
    if (!baseTrack) return;
    const name = trackSaveName.trim() || baseTrack.shortName || baseTrack.name;
    const storageKey = `rt_track_profile_${profileId}`;
    try {
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const entry = {
        id: crypto.randomUUID(),
        trackId: selectedId,
        name,
        custom: customs[selectedId] || {},
        savedAt: new Date().toISOString(),
      };
      existing.unshift(entry);
      localStorage.setItem(storageKey, JSON.stringify(existing));
      setTrackSaveMsg({ ok: true, text: `"${name}" salvo no perfil` });
      setTrackSaveName('');
      if (onSaveTrackToProfile) onSaveTrackToProfile(entry);
    } catch (err) {
      setTrackSaveMsg({ ok: false, text: 'Erro ao salvar: ' + err.message });
    }
    setTimeout(() => setTrackSaveMsg(null), 4000);
  }, [baseTrack, trackSaveName, profileId, selectedId, customs, onSaveTrackToProfile]);

  // ── styles ─────────────────────────────────────────────────────────────────
  const GREEN = C.green || '#06d6a0';

  const theme = {
    card: {
      background: C.bgCard,
      borderRadius: 10,
      border: `1px solid ${C.border}`,
      padding: 20,
      marginBottom: 16,
    },
    cardTitle: {
      fontSize: 13,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '1.5px',
      color: C.textSecondary,
      marginBottom: 14,
    },
  };

  const IB = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.textPrimary,
    fontSize: 13,
    padding: '8px 12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  const LABEL = {
    fontSize: 11,
    color: C.textMuted,
    marginBottom: 4,
    display: 'block',
  };

  const GRID = (cols) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: 12,
    marginBottom: 14,
  });

  const BTN = (accent) => ({
    background: 'none',
    border: `1px solid ${accent}`,
    borderRadius: 6,
    color: accent,
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 12px',
    cursor: 'pointer',
  });

  const SUB_SECTION = {
    background: `${C.accent}08`,
    border: `1px solid ${C.border}30`,
    borderRadius: 8,
    padding: '12px 14px',
    marginBottom: 12,
  };

  const SECTION_TITLE = {
    fontSize: 12,
    fontWeight: 600,
    color: C.textSecondary,
    margin: '16px 0 10px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  };

  // value: custom override if set, else base track value
  const val = (field) =>
    (custom[field] !== undefined && custom[field] !== '') ? custom[field] : (baseTrack?.[field] ?? '');

  if (!TRACK_DATABASE.length) {
    return <div style={{ padding: 24, color: C.textMuted }}>Nenhuma pista disponível.</div>;
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.textPrimary }}>🏁 Banco de Pistas</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
          Visualize e edite as características de cada autódromo. Dados originais sempre preservados para reset.
        </div>
      </div>

      {/* ── Two-pane layout ── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Left: track list (240px) ── */}
        <div style={{ width: sidebarOpen ? 240 : 44, flexShrink: 0, transition: 'width 0.2s ease' }}>
          <div style={{ ...theme.card, padding: sidebarOpen ? 8 : 6 }}>
            {/* Header com toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: sidebarOpen ? '4px 8px 8px' : '4px 2px 6px',
            }}>
              {sidebarOpen && (
                <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Pistas ({TRACK_DATABASE.length})
                </span>
              )}
              <button
                onClick={() => setSidebarOpen(v => !v)}
                title={sidebarOpen ? 'Recolher lista' : 'Expandir lista'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 14, padding: '2px 4px', lineHeight: 1, marginLeft: sidebarOpen ? 0 : 'auto', marginRight: sidebarOpen ? 0 : 'auto', display: 'block' }}
              >
                {sidebarOpen ? '◀' : '▶'}
              </button>
            </div>
            {TRACK_DATABASE.map(t => {
              const isSelected = t.id === selectedId;
              const hasCustom  = !!(customs[t.id]?._modified);
              return (
                <div
                  key={t.id}
                  onClick={() => { setSelectedId(prev => prev === t.id ? '' : t.id); setEditMode(false); }}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 7,
                    cursor: 'pointer',
                    background: isSelected ? `${C.accent}20` : 'transparent',
                    border: isSelected ? `1px solid ${C.accent}50` : '1px solid transparent',
                    marginBottom: 2,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    fontSize: 13,
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? C.textPrimary : C.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  }}>
                    {t.flag && <span title={sidebarOpen ? '' : t.shortName}>{t.flag}</span>}
                    {sidebarOpen && t.shortName}
                    {sidebarOpen && hasCustom && (
                      <span style={{
                        fontSize: 9, background: C.accent, color: '#fff',
                        borderRadius: 3, padding: '1px 4px', fontWeight: 700,
                      }}>EDIT</span>
                    )}
                  </div>
                  {sidebarOpen && (
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                      {t.city} · {(t.length / 1000).toFixed(3)} km
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: content ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ══════════════════════════════════════════════════════════════
              Box 1 — Características da Pista
          ══════════════════════════════════════════════════════════════ */}
          {selectedId && baseTrack && <div style={theme.card}>

            {/* Box 1 header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary }}>
                  {baseTrack.flag && <span style={{ marginRight: 6 }}>{baseTrack.flag}</span>}
                  {baseTrack.name}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  {baseTrack.city} · {baseTrack.country} · {(val('direction') || baseTrack.direction) === 'clockwise' ? '↻ Horário' : '↺ Anti-horário'}
                </div>
              </div>
              <span style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4, fontWeight: 700,
                background: isModified ? `${C.accent}20` : `${GREEN}20`,
                color: isModified ? C.accent : GREEN,
                border: `1px solid ${isModified ? C.accent : GREEN}40`,
              }}>
                {isModified ? '✏️ MODIFICADO' : '✅ ORIGINAL'}
              </span>
              {isModified && (
                <button onClick={resetToOriginal} style={BTN(C.accent)}>↺ Resetar original</button>
              )}
              <button onClick={() => setEditMode(e => !e)} style={BTN(editMode ? C.accent : C.textSecondary)}>
                {editMode ? '✓ Concluir edição' : '✏️ Editar'}
              </button>
            </div>

            {editMode && (
              <div style={{
                background: `${C.accent}10`, border: `1px solid ${C.accent}40`,
                borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                fontSize: 12, color: C.accent,
              }}>
                ⚠️ <strong>Atenção:</strong> Você está editando dados sensíveis da pista. Mudanças afetam cálculos de setup, freio e relação final. O modo "original" sempre pode ser restaurado.
              </div>
            )}

            {/* ── Mini mapa da centerline ── */}
            <TrackMiniMap centerline={baseTrack.centerline} C={C} />

            {/* ── Identificação ── */}
            <div style={SECTION_TITLE}>Identificação</div>
            <div style={GRID(3)}>
              <div>
                <span style={LABEL}>Comprimento (m)</span>
                {editMode
                  ? <input style={IB} type="number" value={custom.length ?? ''} placeholder={String(baseTrack.length)} onChange={e => setField('length')(e.target.value)} />
                  : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 15, fontWeight: 700, color: C.textPrimary }}>
                      {val('length') || baseTrack.length} m{' '}
                      <span style={{ fontSize: 12, fontWeight: 400, color: C.textMuted }}>
                        ({((Number(val('length') || baseTrack.length)) / 1000).toFixed(3)} km)
                      </span>
                    </div>
                }
              </div>
              <div>
                <span style={LABEL}>Direção</span>
                {editMode
                  ? <select style={IB} value={custom.direction ?? ''} onChange={e => setField('direction')(e.target.value)}>
                      <option value="">— padrão —</option>
                      <option value="clockwise">Horário (↻)</option>
                      <option value="anti-clockwise">Anti-horário (↺)</option>
                    </select>
                  : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 14, color: C.textPrimary }}>
                      {(val('direction') || baseTrack.direction) === 'clockwise' ? '↻ Horário' : '↺ Anti-horário'}
                    </div>
                }
              </div>
              <div>
                <span style={LABEL}>Curvas totais</span>
                <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 15, fontWeight: 700, color: C.textPrimary }}>
                  {baseTrack.cornersCount ?? '—'}
                </div>
              </div>
            </div>
            {baseTrack.lapRecord && (
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: -8, marginBottom: 14 }}>
                Recorde de volta: <strong style={{ color: C.textSecondary }}>{baseTrack.lapRecord}</strong>
              </div>
            )}

            {/* ── Classificação de Curvas ── */}
            <div style={SECTION_TITLE}>Classificação de Curvas por Velocidade</div>
            <div style={GRID(3)}>
              {[
                { field: 'cornersLow',    label: 'Lentas (<100 km/h)',    color: GREEN },
                { field: 'cornersMedium', label: 'Médias (100–200 km/h)', color: '#f77f00' },
                { field: 'cornersFast',   label: 'Rápidas (>200 km/h)',   color: C.accent },
              ].map(({ field, label, color }) => (
                <div key={field}>
                  <span style={LABEL}>{label}</span>
                  {editMode
                    ? <input style={IB} type="number" min="0" value={custom[field] ?? ''} placeholder="0" onChange={e => setField(field)(e.target.value)} />
                    : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 15, fontWeight: 700, color }}>
                        {custom[field] || '—'}
                      </div>
                  }
                </div>
              ))}
            </div>

            {/* ── Altimetria ── */}
            <div style={SECTION_TITLE}>Altimetria</div>
            <div style={GRID(3)}>
              {[
                { field: 'altVariation',  label: 'Variação total (m)',      ph: 'ex: 42' },
                { field: 'altMax',        label: 'Altitude máx (m)',         ph: 'ex: 762' },
                { field: 'altMin',        label: 'Altitude mín (m)',         ph: 'ex: 720' },
                { field: 'climbTotal',    label: 'Subida acumulada (m)',     ph: 'ex: 85' },
                { field: 'descentTotal',  label: 'Descida acumulada (m)',    ph: 'ex: 85' },
              ].map(({ field, label, ph }) => (
                <div key={field}>
                  <span style={LABEL}>{label}</span>
                  {editMode
                    ? <input style={IB} type="number" value={custom[field] ?? ''} placeholder={ph} onChange={e => setField(field)(e.target.value)} />
                    : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 14, color: C.textPrimary }}>
                        {custom[field] ? `${custom[field]} m` : '—'}
                      </div>
                  }
                </div>
              ))}
            </div>

            {/* ── Largura ── */}
            <div style={SECTION_TITLE}>Largura da Pista</div>
            <div style={GRID(2)}>
              {[
                { field: 'widthMain', label: 'Largura principal (m)', ph: 'ex: 14' },
                { field: 'widthPit',  label: 'Largura pit lane (m)',  ph: 'ex: 10' },
              ].map(({ field, label, ph }) => (
                <div key={field}>
                  <span style={LABEL}>{label}</span>
                  {editMode
                    ? <input style={IB} type="number" value={custom[field] ?? ''} placeholder={ph} onChange={e => setField(field)(e.target.value)} />
                    : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 14, color: C.textPrimary }}>
                        {custom[field] ? `${custom[field]} m` : '—'}
                      </div>
                  }
                </div>
              ))}
            </div>

            {/* ── Pit Lane ── */}
            <div style={SECTION_TITLE}>Pit Lane</div>
            <div style={GRID(2)}>
              {[
                { field: 'pitLaneLength',  label: 'Comprimento total pit lane (m)', ph: 'ex: 350' },
                { field: 'pitSpeedLimit',  label: 'Velocidade limite (km/h)',        ph: 'ex: 60' },
                { field: 'pitEntryLength', label: 'Comprimento entrada pit (m)',     ph: 'ex: 80' },
                { field: 'pitExitLength',  label: 'Comprimento saída pit (m)',       ph: 'ex: 80' },
              ].map(({ field, label, ph }) => (
                <div key={field}>
                  <span style={LABEL}>{label}</span>
                  {editMode
                    ? <input style={IB} type="number" value={custom[field] ?? ''} placeholder={ph} onChange={e => setField(field)(e.target.value)} />
                    : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 14, color: C.textPrimary }}>
                        {custom[field] ? `${custom[field]}${field === 'pitSpeedLimit' ? ' km/h' : ' m'}` : '—'}
                      </div>
                  }
                </div>
              ))}
            </div>

            {/* ── Fatores de Consumo / Desgaste ── */}
            <div style={SECTION_TITLE}>Fatores de Estratégia</div>
            <div style={GRID(2)}>
              {[
                { field: 'fuelFactor', label: 'Fator de consumo (1.0 = ref)', ph: 'ex: 1.05' },
                { field: 'tireFactor', label: 'Fator de desgaste pneu (1.0 = ref)', ph: 'ex: 1.10' },
              ].map(({ field, label, ph }) => (
                <div key={field}>
                  <span style={LABEL}>{label}</span>
                  {editMode
                    ? <input style={IB} type="number" step="0.01" value={custom[field] ?? ''} placeholder={ph} onChange={e => setField(field)(e.target.value)} />
                    : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 14, color: C.textPrimary }}>
                        {custom[field] ? `×${custom[field]}` : '—'}
                      </div>
                  }
                </div>
              ))}
            </div>

            {/* ── Asfalto ── */}
            <div style={SECTION_TITLE}>Asfalto</div>
            <div style={GRID(2)}>
              <div>
                <span style={LABEL}>Tipo / Condição</span>
                {editMode
                  ? <select style={IB} value={custom.asphaltType ?? ''} onChange={e => setField('asphaltType')(e.target.value)}>
                      {ASPHALT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 14, color: C.textPrimary }}>
                      {ASPHALT_TYPES.find(o => o.value === custom.asphaltType)?.label || '—'}
                    </div>
                }
              </div>
              <div>
                <span style={LABEL}>Idade do asfalto (anos)</span>
                {editMode
                  ? <input style={IB} type="number" min="0" value={custom.asphaltAge ?? ''} placeholder="ex: 3" onChange={e => setField('asphaltAge')(e.target.value)} />
                  : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 14, color: C.textPrimary }}>
                      {custom.asphaltAge ? `${custom.asphaltAge} anos` : '—'}
                    </div>
                }
              </div>
              <div>
                <span style={LABEL}>Macrotextura MPD (mm)</span>
                {editMode
                  ? <input style={IB} type="number" step="0.1" value={custom.macrotexture ?? ''} placeholder="ex: 1.2" onChange={e => setField('macrotexture')(e.target.value)} />
                  : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 14, color: C.textPrimary }}>
                      {custom.macrotexture ? `${custom.macrotexture} mm` : '—'}
                    </div>
                }
              </div>
              <div>
                <span style={LABEL}>Coef. de grip estimado (μ)</span>
                {editMode
                  ? <input style={IB} type="number" step="0.01" min="0" max="2" value={custom.gripMu ?? ''} placeholder="ex: 1.15" onChange={e => setField('gripMu')(e.target.value)} />
                  : <div style={{ ...IB, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 14, fontWeight: 700, color: C.textPrimary }}>
                      {custom.gripMu ? `μ ${custom.gripMu}` : '—'}
                    </div>
                }
              </div>
            </div>
            {editMode && (
              <div style={{ marginBottom: 14 }}>
                <span style={LABEL}>Notas sobre asfalto / grip</span>
                <textarea
                  style={{ ...IB, height: 60, resize: 'vertical', fontFamily: 'inherit' }}
                  value={custom.gripNotes ?? ''}
                  placeholder="Observações sobre textura, grip, condições..."
                  onChange={e => setField('gripNotes')(e.target.value)}
                />
              </div>
            )}
            {!editMode && custom.gripNotes && (
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14, fontStyle: 'italic' }}>
                💬 {custom.gripNotes}
              </div>
            )}

            {/* ── Banking ── */}
            <div style={{ ...SECTION_TITLE, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Inclinação Transversal (Banking)</span>
              {editMode && (
                <button onClick={addBanking} style={{ ...BTN(C.accent), padding: '3px 8px', fontSize: 11 }}>
                  + Adicionar curva
                </button>
              )}
            </div>
            {(custom.bankingAngles || []).length === 0 && !editMode && (
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>
                Nenhuma curva inclinada registrada.
              </div>
            )}
            {(custom.bankingAngles || []).map(b => (
              <div key={b.id} style={{
                ...SUB_SECTION,
                display: 'grid',
                gridTemplateColumns: '1fr 120px auto',
                gap: 10,
                alignItems: 'center',
              }}>
                <div>
                  <span style={LABEL}>Curva / Seção</span>
                  {editMode
                    ? <input style={IB} value={b.name} placeholder="Nome da curva" onChange={e => updateBanking(b.id, 'name', e.target.value)} />
                    : <div style={{ fontSize: 13, color: C.textPrimary }}>{b.name || '—'}</div>
                  }
                </div>
                <div>
                  <span style={LABEL}>Ângulo (°)</span>
                  {editMode
                    ? <input style={IB} type="number" step="0.5" value={b.angle} placeholder="0.0" onChange={e => updateBanking(b.id, 'angle', e.target.value)} />
                    : <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>{b.angle ? `${b.angle}°` : '—'}</div>
                  }
                </div>
                {editMode && (
                  <button onClick={() => removeBanking(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 16, padding: 4 }}>
                    🗑
                  </button>
                )}
              </div>
            ))}

            {/* ── Pontos Críticos de Freio ── */}
            <div style={{ ...SECTION_TITLE, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Pontos Críticos de Freio</span>
              {editMode && (
                <button onClick={addBraking} style={{ ...BTN(C.accent), padding: '3px 8px', fontSize: 11 }}>
                  + Adicionar ponto
                </button>
              )}
            </div>
            {(custom.brakingPoints || []).length === 0 && !editMode && (
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>
                Nenhum ponto de freio registrado.
              </div>
            )}
            {(custom.brakingPoints || []).map(bp => (
              <div key={bp.id} style={SUB_SECTION}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <span style={LABEL}>Curva / Ponto</span>
                    {editMode
                      ? <input style={IB} value={bp.name} placeholder="Ex: Curva 1 — Senna" onChange={e => updateBraking(bp.id, 'name', e.target.value)} />
                      : <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{bp.name || '—'}</div>
                    }
                  </div>
                  <div>
                    <span style={LABEL}>Dist. do ápex (m)</span>
                    {editMode
                      ? <input style={IB} type="number" value={bp.distFromApex} placeholder="ex: 80" onChange={e => updateBraking(bp.id, 'distFromApex', e.target.value)} />
                      : <div style={{ fontSize: 13, color: C.textPrimary }}>{bp.distFromApex ? `${bp.distFromApex} m` : '—'}</div>
                    }
                  </div>
                  <div>
                    <span style={LABEL}>Vel. entrada (km/h)</span>
                    {editMode
                      ? <input style={IB} type="number" value={bp.refSpeedEntry} placeholder="ex: 285" onChange={e => updateBraking(bp.id, 'refSpeedEntry', e.target.value)} />
                      : <div style={{ fontSize: 13, color: C.textPrimary }}>{bp.refSpeedEntry ? `${bp.refSpeedEntry} km/h` : '—'}</div>
                    }
                  </div>
                  <div>
                    <span style={LABEL}>Vel. mínima (km/h)</span>
                    {editMode
                      ? <input style={IB} type="number" value={bp.refSpeedMin} placeholder="ex: 75" onChange={e => updateBraking(bp.id, 'refSpeedMin', e.target.value)} />
                      : <div style={{ fontSize: 13, color: C.textPrimary }}>{bp.refSpeedMin ? `${bp.refSpeedMin} km/h` : '—'}</div>
                    }
                  </div>
                  {editMode && (
                    <button onClick={() => removeBraking(bp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 16, padding: 4, alignSelf: 'center' }}>
                      🗑
                    </button>
                  )}
                </div>
                {editMode && (
                  <div style={{ marginTop: 8 }}>
                    <span style={LABEL}>Notas</span>
                    <input style={IB} value={bp.notes} placeholder="Referência visual, marcação, etc." onChange={e => updateBraking(bp.id, 'notes', e.target.value)} />
                  </div>
                )}
                {!editMode && bp.notes && (
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, fontStyle: 'italic' }}>💬 {bp.notes}</div>
                )}
              </div>
            ))}

            {/* ── Retas ── */}
            <div style={{ ...SECTION_TITLE, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span>Retas</span>
              {editMode && (
                <button onClick={addStraight} style={{ ...BTN(C.accent), padding: '2px 8px', fontSize: 11 }}>
                  + Adicionar
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>
              {autoStraights.length > 0
                ? `✅ ${autoStraights.length} reta(s) detectada(s) automaticamente da centerline GPS.`
                : 'Centerline insuficiente para detecção automática. Adicione manualmente.'}
            </div>
            {effectiveStraights.length === 0 && !editMode && (
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>Nenhuma reta registrada.</div>
            )}
            {effectiveStraights.map(s => (
              <div key={s.id} style={{
                ...SUB_SECTION,
                display: 'grid',
                gridTemplateColumns: '1fr 90px 90px 90px 70px auto',
                gap: 10,
                alignItems: 'end',
              }}>
                <div>
                  <span style={LABEL}>Nome</span>
                  {editMode
                    ? <input style={IB} value={s.name} onChange={e => updateStraight(s.id, 'name', e.target.value)} />
                    : <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{s.name}</div>
                  }
                </div>
                <div>
                  <span style={LABEL}>Comp. (m)</span>
                  {editMode
                    ? <input style={IB} type="number" value={s.lengthM} onChange={e => updateStraight(s.id, 'lengthM', e.target.value)} />
                    : <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>{s.lengthM} m</div>
                  }
                </div>
                <div>
                  <span style={LABEL}>Vel. início</span>
                  {editMode
                    ? <input style={IB} type="number" value={s.speedStart} placeholder="km/h" onChange={e => updateStraight(s.id, 'speedStart', e.target.value)} />
                    : <div style={{ fontSize: 12, color: C.textPrimary }}>{s.speedStart ? `${s.speedStart} km/h` : '—'}</div>
                  }
                </div>
                <div>
                  <span style={LABEL}>Vel. fim</span>
                  {editMode
                    ? <input style={IB} type="number" value={s.speedEnd} placeholder="km/h" onChange={e => updateStraight(s.id, 'speedEnd', e.target.value)} />
                    : <div style={{ fontSize: 12, color: C.textPrimary }}>{s.speedEnd ? `${s.speedEnd} km/h` : '—'}</div>
                  }
                </div>
                <div>
                  <span style={LABEL}>Marcha rec.</span>
                  {editMode
                    ? <input style={IB} value={s.gearRec} placeholder="ex: 6" onChange={e => updateStraight(s.id, 'gearRec', e.target.value)} />
                    : <div style={{ fontSize: 12, color: C.textPrimary }}>{s.gearRec || '—'}</div>
                  }
                </div>
                {editMode && (
                  <button onClick={() => removeStraight(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 16, padding: 4, alignSelf: 'center' }}>
                    🗑
                  </button>
                )}
              </div>
            ))}

            {/* ── Notas gerais ── */}
            {(editMode || custom.notes) && (
              <>
                <div style={SECTION_TITLE}>Notas Gerais</div>
                {editMode
                  ? <textarea
                      style={{ ...IB, height: 72, resize: 'vertical', fontFamily: 'inherit' }}
                      value={custom.notes ?? ''}
                      placeholder="Observações gerais sobre a pista..."
                      onChange={e => setField('notes')(e.target.value)}
                    />
                  : <div style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>💬 {custom.notes}</div>
                }
              </>
            )}

            {/* ── Salvar no perfil ── */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}30` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                Salvar Pista no Perfil
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 3 }}>Nome</label>
                  <input value={trackSaveName} onChange={e => setTrackSaveName(e.target.value)}
                    placeholder={baseTrack?.shortName || 'Nome...'}
                    style={{ ...IB, width: '100%' }} />
                </div>
                <button onClick={handleSaveTrackToProfile} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: C.purple, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Salvar
                </button>
              </div>
              {trackSaveMsg && <div style={{ marginTop: 6, fontSize: 11, color: trackSaveMsg.ok ? C.green : C.accent }}>{trackSaveMsg.ok ? '✓ ' : '✗ '}{trackSaveMsg.text}</div>}
            </div>
          </div>}

          {/* ══════════════════════════════════════════════════════════════
              Box 2 — Evolução da Pista
          ══════════════════════════════════════════════════════════════ */}
          <div style={theme.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={theme.cardTitle}>📈 Evolução da Pista</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: -10, marginBottom: 10 }}>
                  Grip, temperatura, mármore e condições por sessão{baseTrack ? ` em ${baseTrack.shortName}` : ''}
                </div>
              </div>
              <button
                onClick={() => { setNewEvol(EMPTY_EVOL(selectedId || '')); setShowAddEvol(v => !v); }}
                style={BTN(C.accent)}
              >
                {showAddEvol ? '✕ Cancelar' : '+ Nova sessão'}
              </button>
            </div>

            {/* Add new evolution form */}
            {showAddEvol && (
              <div style={{ ...SUB_SECTION, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, marginBottom: 12 }}>
                  Nova entrada de evolução
                </div>
                <div style={GRID(2)}>
                  <div>
                    <span style={LABEL}>Pista *</span>
                    <select style={IB} value={newEvol.trackId} onChange={e => { const v = e.target.value; setNewEvol(prev => ({ ...prev, trackId: v })); }}>
                      <option value="">— Selecionar —</option>
                      {TRACK_DATABASE.map(t => <option key={t.id} value={t.id}>{t.shortName} ({t.city})</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={LABEL}>Nome da sessão *</span>
                    <input
                      style={IB}
                      value={newEvol.sessionName}
                      placeholder="Ex: TL1 — Interlagos Mar/25"
                      onChange={e => { const v = e.target.value; setNewEvol(prev => ({ ...prev, sessionName: v })); }}
                    />
                  </div>
                  <div>
                    <span style={LABEL}>Data</span>
                    <input
                      style={IB}
                      type="date"
                      value={newEvol.date}
                      onChange={e => { const v = e.target.value; setNewEvol(prev => ({ ...prev, date: v })); }}
                    />
                  </div>
                  <div>
                    <span style={LABEL}>Tipo de sessão</span>
                    <select style={IB} value={newEvol.sessionType} onChange={e => { const v = e.target.value; setNewEvol(prev => ({ ...prev, sessionType: v })); }}>
                      {SESSION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button onClick={addEvolution} style={{ ...BTN(C.accent), flex: 1 }}>Salvar sessão</button>
                  <button onClick={() => setShowAddEvol(false)} style={BTN(C.textMuted)}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Evolution list */}
            {trackEvols.length === 0 && (
              <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: '20px 0' }}>
                Nenhuma sessão registrada. Clique em "+ Nova sessão" para começar.
              </div>
            )}

            {trackEvols.map(ev => (
              <div key={ev.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>

                {/* Entry header */}
                <div
                  onClick={() => toggleEvol(ev.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', cursor: 'pointer',
                    background: ev._expanded ? `${C.accent}10` : C.bg,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{ev.sessionName}</div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                      {ev.date} · {SESSION_TYPES.find(s => s.value === ev.sessionType)?.label}
                      {ev.tempAfternoon && ` · ☀️ ${ev.tempAfternoon}°C`}
                      {ev.rubberRating > 0 && ` · 🔴 Borracha ${ev.rubberRating}/10`}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: C.textMuted }}>{ev._expanded ? '▲' : '▼'}</span>
                  <button
                    onClick={e => { e.stopPropagation(); deleteEvol(ev.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 14, padding: '2px 4px' }}
                  >
                    🗑
                  </button>
                </div>

                {/* Entry body */}
                {ev._expanded && (
                  <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}` }}>

                    {/* Temperatura do asfalto */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                      🌡️ Temperatura do Asfalto
                    </div>
                    <div style={GRID(3)}>
                      {[
                        { field: 'tempMorning',   label: 'Manhã (°C)',  ph: 'ex: 28' },
                        { field: 'tempAfternoon', label: 'Tarde (°C)',   ph: 'ex: 48' },
                        { field: 'tempNight',     label: 'Noite (°C)',   ph: 'ex: 32' },
                      ].map(({ field, label, ph }) => (
                        <div key={field}>
                          <span style={LABEL}>{label}</span>
                          <input style={IB} type="number" value={ev[field]} placeholder={ph} onChange={e => updateEvol(ev.id, field, e.target.value)} />
                        </div>
                      ))}
                    </div>

                    {/* Borracha / Mármore / Poeira */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '1px', margin: '14px 0 8px' }}>
                      🔴 Borracha, Mármore & Poeira
                    </div>
                    <div style={GRID(3)}>
                      {[
                        { field: 'rubberRating',  label: 'Borracha depositada (0–10)' },
                        { field: 'marblesRating', label: 'Mármore fora da linha (0–10)' },
                        { field: 'dustRating',    label: 'Poeira / sujeira (0–10)' },
                      ].map(({ field, label }) => (
                        <div key={field}>
                          <span style={LABEL}>{label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                              type="range" min="0" max="10" step="1"
                              value={ev[field]}
                              onChange={e => updateEvol(ev.id, field, Number(e.target.value))}
                              style={{ flex: 1, accentColor: C.accent }}
                            />
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, minWidth: 20 }}>{ev[field]}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={GRID(2)}>
                      <div>
                        <span style={LABEL}>Setores com mármore</span>
                        <input style={IB} value={ev.marblesSectors} placeholder="ex: S2, S3 — saída das curvas" onChange={e => updateEvol(ev.id, 'marblesSectors', e.target.value)} />
                      </div>
                      <div>
                        <span style={LABEL}>Notas de borracha</span>
                        <input style={IB} value={ev.rubberNotes} placeholder="ex: linha ideal bem marcada no setor 1" onChange={e => updateEvol(ev.id, 'rubberNotes', e.target.value)} />
                      </div>
                    </div>

                    {/* Umidade */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '1px', margin: '14px 0 8px' }}>
                      💧 Umidade Residual
                    </div>
                    <div style={GRID(2)}>
                      <div>
                        <span style={LABEL}>Umidade início sessão (%)</span>
                        <input style={IB} type="number" min="0" max="100" value={ev.humidityStart} placeholder="ex: 75" onChange={e => updateEvol(ev.id, 'humidityStart', e.target.value)} />
                      </div>
                      <div>
                        <span style={LABEL}>Umidade fim sessão (%)</span>
                        <input style={IB} type="number" min="0" max="100" value={ev.humidityEnd} placeholder="ex: 55" onChange={e => updateEvol(ev.id, 'humidityEnd', e.target.value)} />
                      </div>
                    </div>

                    {/* Degradação do asfalto */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '1px', margin: '14px 0 8px' }}>
                      ⚠️ Degradação do Asfalto
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <span style={LABEL}>Polimento superficial (0 = sem efeito · 10 = muito polido)</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="range" min="0" max="10" step="1"
                          value={ev.asphaltPolishRating}
                          onChange={e => updateEvol(ev.id, 'asphaltPolishRating', Number(e.target.value))}
                          style={{ flex: 1, accentColor: C.accent }}
                        />
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, minWidth: 20 }}>{ev.asphaltPolishRating}</span>
                      </div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <span style={LABEL}>Notas de degradação</span>
                      <textarea
                        style={{ ...IB, height: 52, resize: 'vertical', fontFamily: 'inherit' }}
                        value={ev.degradationNotes}
                        placeholder="Ex: perda de macrotextura no setor 2 após 40 voltas"
                        onChange={e => updateEvol(ev.id, 'degradationNotes', e.target.value)}
                      />
                    </div>

                    {/* Track Grip Map */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '1px', margin: '14px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>🗺️ Mapa de Grip por Região</span>
                      <button onClick={() => addGripRegion(ev.id)} style={{ ...BTN(C.accent), padding: '2px 8px', fontSize: 11 }}>
                        + Região
                      </button>
                    </div>
                    {(ev.gripMap || []).length === 0 && (
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>
                        Adicione regiões da pista com grip diferenciado.
                      </div>
                    )}
                    {(ev.gripMap || []).map(g => (
                      <div key={g.id} style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 140px 1fr auto',
                        gap: 10, alignItems: 'end', marginBottom: 8,
                        background: `${C.accent}06`, borderRadius: 6, padding: '8px 10px',
                      }}>
                        <div>
                          <span style={LABEL}>Região / Setor</span>
                          <input style={IB} value={g.label} placeholder="ex: Curva 1 — S1" onChange={e => updateGripRegion(ev.id, g.id, 'label', e.target.value)} />
                        </div>
                        <div>
                          <span style={LABEL}>Grip (0–10)</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="range" min="0" max="10" step="1"
                              value={g.gripLevel}
                              onChange={e => updateGripRegion(ev.id, g.id, 'gripLevel', Number(e.target.value))}
                              style={{ flex: 1, accentColor: C.accent }}
                            />
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, minWidth: 18 }}>{g.gripLevel}</span>
                          </div>
                        </div>
                        <div>
                          <span style={LABEL}>Notas</span>
                          <input style={IB} value={g.notes} placeholder="ex: linha suja, mármore, asfalto polido" onChange={e => updateGripRegion(ev.id, g.id, 'notes', e.target.value)} />
                        </div>
                        <button onClick={() => removeGripRegion(ev.id, g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 16, padding: 4, alignSelf: 'center' }}>
                          🗑
                        </button>
                      </div>
                    ))}

                    {/* Delta de tempo */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '1px', margin: '14px 0 8px' }}>
                      ⏱️ Delta de Tempo por Evolução da Pista
                    </div>
                    <div style={GRID(2)}>
                      <div>
                        <span style={LABEL}>Melhora total da sessão (s/volta)</span>
                        <input
                          style={IB}
                          type="number"
                          step="0.001"
                          value={ev.deltaTotal}
                          placeholder="ex: 1.250 (pista ganhou 1.25s/volta)"
                          onChange={e => updateEvol(ev.id, 'deltaTotal', e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>
                      💡 Preencha o delta comparando a volta 1 com a última volta da sessão. Valores positivos = pista melhorou.
                    </div>

                    {/* Notas gerais da sessão */}
                    <div>
                      <span style={LABEL}>Notas gerais da sessão</span>
                      <textarea
                        style={{ ...IB, height: 60, resize: 'vertical', fontFamily: 'inherit' }}
                        value={ev.notes}
                        placeholder="Observações gerais sobre a evolução da pista nessa sessão..."
                        onChange={e => updateEvol(ev.id, 'notes', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <PrintFooter />
    </div>
  );
}
