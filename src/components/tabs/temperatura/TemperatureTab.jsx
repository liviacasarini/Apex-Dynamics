import { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { useColors } from '@/context/ThemeContext';
import { ChartCard, CustomTooltip, MetricCard, PrintFooter } from '@/components/common';
import { makeTheme } from '@/styles/theme';

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** Formata "YYYY-MM-DD" → "DD/MM/YYYY" */
function fmtDate(iso) {
  if (!iso || iso.length < 10) return '—';
  return `${iso.substring(8, 10)}/${iso.substring(5, 7)}/${iso.substring(0, 4)}`;
}

/** Formata "YYYY-MM-DD" → "DD/MM" (curto, para gráfico) */
function fmtDateShort(iso) {
  if (!iso || iso.length < 10) return '';
  return `${iso.substring(8, 10)}/${iso.substring(5, 7)}`;
}

/** Converte "DD/MM/YYYY" (LD header) → "YYYY-MM-DD" (ISO, para input date) */
function ldDateToISO(ldDate) {
  if (!ldDate || ldDate.length < 10) return null;
  const parts = ldDate.split('/');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

/** Converte "HH:MM:SS" → "HH:MM" */
function ldTimeToHHMM(ldTime) {
  if (!ldTime || ldTime.length < 5) return null;
  return ldTime.substring(0, 5);
}

/** Pressão atmosférica padrão a partir da altitude (Standard Atmosphere ISA) */
function calcBaroFromAlt(altM) {
  if (altM == null || isNaN(altM)) return null;
  return parseFloat((101.325 * Math.pow(1 - 2.2557e-5 * Number(altM), 5.2559)).toFixed(1));
}

/** Média de um canal do ECU, com filtro de sanidade */
function ecuAvg(rows, channelName, minVal = -Infinity, maxVal = Infinity) {
  if (!rows?.length || !channelName) return null;
  const vals = rows.map(r => r[channelName]).filter(v => v != null && !isNaN(v) && v > minVal && v < maxVal);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

const PRECIP_OPTIONS = [
  { value: '',          label: '—'                  },
  { value: 'seca',      label: '☀️ Pista seca'       },
  { value: 'umida',     label: '💧 Pista úmida'      },
  { value: 'garoa',     label: '🌦 Garoa'            },
  { value: 'moderada',  label: '🌧 Chuva moderada'   },
  { value: 'forte',     label: '⛈ Chuva forte'      },
];

const WIND_DIR_OPTIONS = [
  { value: '',    label: '—'   },
  { value: 'N',   label: 'N'   },
  { value: 'NNE', label: 'NNE' },
  { value: 'NE',  label: 'NE'  },
  { value: 'ENE', label: 'ENE' },
  { value: 'E',   label: 'E'   },
  { value: 'ESE', label: 'ESE' },
  { value: 'SE',  label: 'SE'  },
  { value: 'SSE', label: 'SSE' },
  { value: 'S',   label: 'S'   },
  { value: 'SSW', label: 'SSW' },
  { value: 'SW',  label: 'SW'  },
  { value: 'WSW', label: 'WSW' },
  { value: 'W',   label: 'W'   },
  { value: 'WNW', label: 'WNW' },
  { value: 'NW',  label: 'NW'  },
  { value: 'NNW', label: 'NNW' },
];

const DEFAULT_TEMP_FORM = {
  date: todayISO(), time: nowHHMM(),
  trackTemp: '', ambientTemp: '', humidity: '',
  altitude: '', baroPressure: '',
  windSpeed: '', windDir: '',
  precipitation: '',
};

export default function TemperatureTab({
  data, channels, lapsAnalysis = {},
  tempLog = [],
  onAddTempLog, onUpdateTempLog, onDeleteTempLog, onClearTempLog,
  tempSets = [], onSaveTempSet, onLoadTempSet, onRenameTempSet, onDeleteTempSet,
  tempForm, setTempForm,
}) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);

  const tf = tempForm || DEFAULT_TEMP_FORM;
  const updateTempField = (field, value) =>
    setTempForm(prev => ({ ...(prev || DEFAULT_TEMP_FORM), [field]: value }));

  // Shortcuts para campos existentes
  const recordDate    = tf.date         || todayISO();
  const recordTime    = tf.time         || nowHHMM();
  const trackTemp     = tf.trackTemp    ?? '';
  const ambientTemp   = tf.ambientTemp  ?? '';
  const humidity      = tf.humidity     ?? '';
  const altitude      = tf.altitude     ?? '';
  const baroPressure  = tf.baroPressure ?? '';
  const windSpeed     = tf.windSpeed    ?? '';
  const windDir       = tf.windDir      ?? '';
  const precipitation = tf.precipitation ?? '';

  // ── Auto-valores da ECU ──────────────────────────────────────────────────
  const allRows = useMemo(() => data?.rows || [], [data]);

  const ecuIAT = useMemo(() => {
    const v = ecuAvg(allRows, channels?.iat, -40, 80);
    return v !== null ? parseFloat(v.toFixed(1)) : null;
  }, [allRows, channels]);

  const ecuAltitude = useMemo(() => {
    const v = ecuAvg(allRows, channels?.altitude, -500, 6000);
    return v !== null ? parseFloat(v.toFixed(0)) : null;
  }, [allRows, channels]);

  const ecuBaroPressure = useMemo(() => {
    const v = ecuAvg(allRows, channels?.baroPressure, 50, 120);
    return v !== null ? parseFloat(v.toFixed(1)) : null;
  }, [allRows, channels]);

  // Pressão calculada da altitude (ECU ou campo digitado)
  const baroFromAlt = useMemo(() => {
    const alt = parseFloat(altitude);
    if (!isNaN(alt)) return calcBaroFromAlt(alt);
    if (ecuAltitude !== null) return calcBaroFromAlt(ecuAltitude);
    return null;
  }, [altitude, ecuAltitude]);

  // sessionMeta do arquivo LD (data/hora da sessão)
  const sessionMeta = data?.sessionMeta || null;

  // ── Auto-preenchimento inicial (só se campo vazio) ───────────────────────
  useEffect(() => {
    const updates = {};
    if (ecuIAT !== null && !tf.ambientTemp)
      updates.ambientTemp = String(ecuIAT);
    if (ecuAltitude !== null && !tf.altitude)
      updates.altitude = String(ecuAltitude);
    if (!tf.baroPressure) {
      const baro = ecuBaroPressure ?? (ecuAltitude !== null ? calcBaroFromAlt(ecuAltitude) : null);
      if (baro !== null) updates.baroPressure = String(baro);
    }
    if (sessionMeta?.date && !tf.date) {
      const iso = ldDateToISO(sessionMeta.date);
      if (iso) updates.date = iso;
    }
    if (sessionMeta?.time && !tf.time) {
      const hhmm = ldTimeToHHMM(sessionMeta.time);
      if (hhmm) updates.time = hhmm;
    }
    if (Object.keys(updates).length > 0)
      setTempForm(prev => ({ ...(prev || DEFAULT_TEMP_FORM), ...updates }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecuIAT, ecuAltitude, ecuBaroPressure, sessionMeta]);

  // ── Edit entry state ─────────────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState(null);
  const [editValues, setEditValues] = useState({});
  const [dayFilter,  setDayFilter]  = useState('all');
  const [setName,       setSetName]       = useState('');
  const [editingSetId,  setEditingSetId]  = useState(null);
  const [editSetName,   setEditSetName]   = useState('');
  const [confirmLoadId, setConfirmLoadId] = useState(null);

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditValues({
      date:          entry.date         ?? '',
      time:          entry.time         ?? '',
      track:         entry.track        != null ? String(entry.track)        : '',
      ambient:       entry.ambient      != null ? String(entry.ambient)      : '',
      humidity:      entry.humidity     != null ? String(entry.humidity)     : '',
      altitude:      entry.altitude     != null ? String(entry.altitude)     : '',
      baroPressure:  entry.baroPressure != null ? String(entry.baroPressure) : '',
      windSpeed:     entry.windSpeed    != null ? String(entry.windSpeed)    : '',
      windDir:       entry.windDir      ?? '',
      precipitation: entry.precipitation ?? '',
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditValues({}); };
  const saveEdit = () => {
    onUpdateTempLog?.(editingId, {
      date:          editValues.date,
      time:          editValues.time,
      track:         editValues.track        !== '' ? parseFloat(editValues.track)        : null,
      ambient:       editValues.ambient      !== '' ? parseFloat(editValues.ambient)      : null,
      humidity:      editValues.humidity     !== '' ? parseFloat(editValues.humidity)     : null,
      altitude:      editValues.altitude     !== '' ? parseFloat(editValues.altitude)     : null,
      baroPressure:  editValues.baroPressure !== '' ? parseFloat(editValues.baroPressure) : null,
      windSpeed:     editValues.windSpeed    !== '' ? parseFloat(editValues.windSpeed)    : null,
      windDir:       editValues.windDir      || null,
      precipitation: editValues.precipitation || null,
    });
    cancelEdit();
  };

  const handleRegister = () => {
    if (!trackTemp && !ambientTemp && !altitude) return;
    onAddTempLog?.({
      date:          recordDate,
      time:          recordTime,
      track:         parseFloat(trackTemp)    || null,
      ambient:       parseFloat(ambientTemp)  || null,
      humidity:      parseFloat(humidity)     || null,
      altitude:      parseFloat(altitude)     || null,
      baroPressure:  parseFloat(baroPressure) || null,
      windSpeed:     parseFloat(windSpeed)    || null,
      windDir:       windDir                  || null,
      precipitation: precipitation            || null,
    });
    setTempForm(prev => ({
      ...(prev || DEFAULT_TEMP_FORM),
      time: nowHHMM(),
      trackTemp: '', ambientTemp: '', humidity: '',
      altitude: '', baroPressure: '', windSpeed: '', windDir: '', precipitation: '',
    }));
  };

  // ── Dados ordenados ──────────────────────────────────────────────────────
  const allTempData = [...tempLog].sort((a, b) => {
    const da = a.date || '9999', db = b.date || '9999';
    if (da !== db) return da.localeCompare(db);
    return (a.time || '').localeCompare(b.time || '');
  });
  const uniqueDates = [...new Set(allTempData.map(e => e.date).filter(Boolean))].sort();
  const chartData   = dayFilter === 'all' ? allTempData : allTempData.filter(e => e.date === dayFilter);

  // ── Telemetria — temp motor ──────────────────────────────────────────────
  const engineTempPerLap = data?.laps
    ? Object.entries(data.laps)
        .filter(([n]) => lapsAnalysis[n])
        .map(([n, rows]) => {
          const temps = rows.map(r => channels?.engineTemp ? r[channels.engineTemp] : null)
            .filter(v => v !== null && !isNaN(v));
          if (!temps.length) return null;
          let tMin = temps[0], tMax = temps[0], tSum = 0;
          for (const v of temps) { if (v < tMin) tMin = v; if (v > tMax) tMax = v; tSum += v; }
          return { lap: `V${n}`, avg: parseFloat((tSum / temps.length).toFixed(1)), max: parseFloat(tMax.toFixed(1)), min: parseFloat(tMin.toFixed(1)) };
        }).filter(Boolean)
    : [];

  const step = data?.rows?.length ? Math.max(1, Math.floor(data.rows.length / 600)) : 1;
  const engineTrace = data?.rows?.length
    ? data.rows.filter((_, i) => i % step === 0)
        .map(r => ({ t: channels?.time ? parseFloat((r[channels.time] || 0).toFixed(1)) : 0, engineTemp: channels?.engineTemp ? r[channels.engineTemp] : null }))
        .filter(r => r.engineTemp !== null)
    : [];

  // ── Estilos ──────────────────────────────────────────────────────────────
  const inputStyle = {
    background: COLORS.bg, color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`, borderRadius: 6,
    padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const selectStyle = { ...inputStyle, colorScheme: 'dark', cursor: 'pointer' };
  const editInput = {
    background: COLORS.bg, color: COLORS.textPrimary,
    border: `1px solid ${COLORS.accent}`, borderRadius: 5,
    padding: '4px 7px', fontSize: 12, outline: 'none', width: 80,
  };
  const editSelect = { ...editInput, width: 100, cursor: 'pointer', colorScheme: 'dark' };
  const smallBtnStyle = (bg, color) => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: `${bg}18`, color, border: `1px solid ${bg}44`, transition: 'background 0.15s',
  });

  /** Badge "📡 ECU" exibido ao lado do label quando dado vem da telemetria */
  const Badge = ({ type }) => {
    if (type !== 'ecu') return null;
    return (
      <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 5, padding: '1px 5px', borderRadius: 4,
        background: `${COLORS.cyan}22`, color: COLORS.cyan, border: `1px solid ${COLORS.cyan}44`,
      }}>
        📡 ECU
      </span>
    );
  };

  /** Campo do formulário com label e badge opcional */
  const Field = ({ label, badge, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'flex', alignItems: 'center' }}>
        {label}{badge && <Badge type={badge} />}
      </label>
      {children}
    </div>
  );

  return (
    <div style={{ padding: 24 }}>

      {/* ── Formulário de registro ─────────────────────────────────────────── */}
      <div style={{ ...theme.card, background: COLORS.bgCard }}>
        <div style={theme.cardTitle}>🌡️ Condições Ambientais — Registro</div>
        <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
          Registre as condições da sessão. Campos marcados com{' '}
          <strong style={{ color: COLORS.cyan }}>📡 ECU</strong> foram preenchidos automaticamente pelo arquivo de telemetria —
          você pode corrigir qualquer valor antes de registrar.
        </p>

        {/* Linha 1: Data/Hora + Temperaturas + Umidade */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 12 }}>
          <Field label="Data">
            <input type="date" value={recordDate} onChange={e => updateTempField('date', e.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }} />
          </Field>
          <Field label="Horário">
            <input type="time" value={recordTime} onChange={e => updateTempField('time', e.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }} />
          </Field>
          <Field label="Temp. Pista (°C)">
            <input type="number" step="0.5" value={trackTemp} placeholder="42"
              onChange={e => updateTempField('trackTemp', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Temp. Ar (°C)" badge={channels?.iat && ecuIAT !== null ? 'ecu' : null}>
            <input type="number" step="0.1" value={ambientTemp} placeholder="28"
              onChange={e => updateTempField('ambientTemp', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Umidade (%)">
            <input type="number" step="1" value={humidity} placeholder="65"
              onChange={e => updateTempField('humidity', e.target.value)} style={inputStyle} />
          </Field>
        </div>

        {/* Linha 2: Condições atmosféricas + Vento + Precipitação */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Field label="Altitude (m)" badge={channels?.altitude && ecuAltitude !== null ? 'ecu' : null}>
            <input type="number" step="1" value={altitude} placeholder="900"
              onChange={e => {
                updateTempField('altitude', e.target.value);
                // auto-calcular pressão se ainda não foi editada manualmente
                const newBaro = calcBaroFromAlt(parseFloat(e.target.value));
                if (newBaro !== null) updateTempField('baroPressure', String(newBaro));
              }} style={inputStyle} />
          </Field>
          <Field
            label="Pressão Atm. (hPa)"
            badge={channels?.baroPressure && ecuBaroPressure !== null ? 'ecu' : (baroFromAlt !== null && !ecuBaroPressure ? 'calc' : null)}
          >
            <input type="number" step="0.1" value={baroPressure} placeholder="101.3"
              onChange={e => updateTempField('baroPressure', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Vento (km/h)">
            <input type="number" step="1" min="0" value={windSpeed} placeholder="15"
              onChange={e => updateTempField('windSpeed', e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Direção do Vento">
            <select value={windDir} onChange={e => updateTempField('windDir', e.target.value)} style={selectStyle}>
              {WIND_DIR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Precipitação">
            <select value={precipitation} onChange={e => updateTempField('precipitation', e.target.value)} style={selectStyle}>
              {PRECIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        <button
          onClick={handleRegister}
          style={{
            padding: '9px 24px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', background: COLORS.accent, color: '#fff', border: 'none',
          }}
        >
          + Registrar
        </button>

        {/* ── Tabela de registros ─────────────────────────────────────────── */}
        {allTempData.length > 0 && (
          <div style={{ marginTop: 20, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left',   color: COLORS.textMuted }}>Data</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left',   color: COLORS.textMuted }}>Hora</th>
                  <th style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.orange    }}>Pista °C</th>
                  <th style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.cyan      }}>Ar °C</th>
                  <th style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.blue      }}>Umidade %</th>
                  <th style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.green     }}>Altitude m</th>
                  <th style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.purple    }}>Pressão hPa</th>
                  <th style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.textMuted }}>Vento</th>
                  <th style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.textMuted }}>Precip.</th>
                  <th style={{ padding: '6px 8px',  textAlign: 'center', color: COLORS.textMuted }}></th>
                </tr>
              </thead>
              <tbody>
                {allTempData.map((entry, i) => {
                  const isEditing = editingId === entry.id;
                  if (isEditing) {
                    return (
                      <tr key={entry.id} style={{ background: `${COLORS.accent}08`, borderBottom: `1px solid ${COLORS.accent}33` }}>
                        <td style={{ padding: '5px 10px' }}>
                          <input type="date" value={editValues.date}
                            onChange={e => setEditValues(p => ({ ...p, date: e.target.value }))}
                            style={{ ...editInput, width: 128, colorScheme: 'dark' }} />
                        </td>
                        <td style={{ padding: '5px 10px' }}>
                          <input type="time" value={editValues.time}
                            onChange={e => setEditValues(p => ({ ...p, time: e.target.value }))}
                            style={{ ...editInput, width: 90, colorScheme: 'dark' }} />
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                          <input type="number" step="0.5" placeholder="—" value={editValues.track}
                            onChange={e => setEditValues(p => ({ ...p, track: e.target.value }))} style={editInput} />
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                          <input type="number" step="0.1" placeholder="—" value={editValues.ambient}
                            onChange={e => setEditValues(p => ({ ...p, ambient: e.target.value }))} style={editInput} />
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                          <input type="number" step="1" placeholder="—" value={editValues.humidity}
                            onChange={e => setEditValues(p => ({ ...p, humidity: e.target.value }))} style={editInput} />
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                          <input type="number" step="1" placeholder="—" value={editValues.altitude}
                            onChange={e => setEditValues(p => ({ ...p, altitude: e.target.value }))} style={editInput} />
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                          <input type="number" step="0.1" placeholder="—" value={editValues.baroPressure}
                            onChange={e => setEditValues(p => ({ ...p, baroPressure: e.target.value }))} style={editInput} />
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input type="number" step="1" placeholder="—" value={editValues.windSpeed}
                              onChange={e => setEditValues(p => ({ ...p, windSpeed: e.target.value }))}
                              style={{ ...editInput, width: 55 }} />
                            <select value={editValues.windDir}
                              onChange={e => setEditValues(p => ({ ...p, windDir: e.target.value }))}
                              style={{ ...editSelect, width: 60, colorScheme: 'dark' }}>
                              {WIND_DIR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                          <select value={editValues.precipitation}
                            onChange={e => setEditValues(p => ({ ...p, precipitation: e.target.value }))}
                            style={{ ...editSelect, width: 110, colorScheme: 'dark' }}>
                            {PRECIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button onClick={saveEdit} style={{ background: COLORS.green, border: 'none', color: '#fff', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✓</button>
                            <button onClick={cancelEdit} style={{ background: 'none', border: `1px solid ${COLORS.border}`, color: COLORS.textMuted, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const precipLabel = PRECIP_OPTIONS.find(o => o.value === entry.precipitation)?.label || '—';
                  const windLabel   = entry.windSpeed != null
                    ? `${entry.windSpeed} km/h${entry.windDir ? ` ${entry.windDir}` : ''}`
                    : '—';

                  return (
                    <tr key={entry.id || i} style={{ borderBottom: `1px solid ${COLORS.border}11` }}>
                      <td style={{ padding: '6px 10px', color: COLORS.textSecondary }}>{fmtDate(entry.date)}</td>
                      <td style={{ padding: '6px 10px', color: COLORS.textSecondary }}>{entry.time}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: COLORS.orange }}>
                        {entry.track    != null ? `${entry.track}°`    : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: COLORS.cyan }}>
                        {entry.ambient  != null ? `${entry.ambient}°`  : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: COLORS.blue }}>
                        {entry.humidity != null ? `${entry.humidity}%` : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.green }}>
                        {entry.altitude != null ? `${entry.altitude}m` : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.purple }}>
                        {entry.baroPressure != null ? `${entry.baroPressure}` : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', color: COLORS.textSecondary, fontSize: 11 }}>
                        {windLabel}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11 }}>
                        {precipLabel}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button onClick={() => startEdit(entry)} title="Editar"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 14, padding: '2px 4px', borderRadius: 4 }}
                            onMouseEnter={e => e.currentTarget.style.color = COLORS.cyan}
                            onMouseLeave={e => e.currentTarget.style.color = COLORS.textMuted}>✏️</button>
                          <button onClick={() => onDeleteTempLog?.(entry.id)} title="Excluir"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 14, padding: '2px 4px', borderRadius: 4 }}
                            onMouseEnter={e => e.currentTarget.style.color = COLORS.accent}
                            onMouseLeave={e => e.currentTarget.style.color = COLORS.textMuted}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Gráficos de evolução ────────────────────────────────────────── */}
        {chartData.length > 1 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: COLORS.textMuted }}>Filtrar por dia:</label>
              <select value={dayFilter} onChange={e => setDayFilter(e.target.value)}
                style={{ background: COLORS.bg, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, outline: 'none', colorScheme: 'dark' }}>
                <option value="all">Todos os dias</option>
                {uniqueDates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
              </select>
            </div>
            <div style={theme.grid(2)}>
              <ChartCard title="Temperatura do Ar" height={240}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey={e => dayFilter !== 'all' ? (e.time || '') : `${fmtDateShort(e.date)} ${e.time || ''}`}
                      tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                    <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} unit="°C" domain={['auto', 'auto']} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const dateStr = payload[0]?.payload?.date ? fmtDate(payload[0].payload.date) : '';
                      return (
                        <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                          <div style={{ color: COLORS.textMuted, marginBottom: 6 }}>{dateStr && <span style={{ marginRight: 6 }}>{dateStr}</span>}{label}</div>
                          {payload.map(p => <div key={p.dataKey} style={{ color: p.stroke, fontWeight: 600 }}>{p.name}: {p.value != null ? `${p.value}°C` : '—'}</div>)}
                        </div>
                      );
                    }} />
                    <Line type="monotone" dataKey="ambient" stroke={COLORS.cyan} strokeWidth={2}
                      dot={{ fill: COLORS.cyan, r: 5, strokeWidth: 2, stroke: '#fff' }} connectNulls name="Ar °C" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Temperatura da Pista" height={240}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey={e => dayFilter !== 'all' ? (e.time || '') : `${fmtDateShort(e.date)} ${e.time || ''}`}
                      tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                    <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} unit="°C" domain={['auto', 'auto']} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const dateStr = payload[0]?.payload?.date ? fmtDate(payload[0].payload.date) : '';
                      return (
                        <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                          <div style={{ color: COLORS.textMuted, marginBottom: 6 }}>{dateStr && <span style={{ marginRight: 6 }}>{dateStr}</span>}{label}</div>
                          {payload.map(p => <div key={p.dataKey} style={{ color: p.stroke, fontWeight: 600 }}>{p.name}: {p.value != null ? `${p.value}°C` : '—'}</div>)}
                        </div>
                      );
                    }} />
                    <Line type="monotone" dataKey="track" stroke={COLORS.orange} strokeWidth={2}
                      dot={{ fill: COLORS.orange, r: 5, strokeWidth: 2, stroke: '#fff' }} connectNulls name="Pista °C" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        )}
      </div>

      {/* ── Conjuntos Salvos ──────────────────────────────────────────────────── */}
      <div style={theme.card}>
        <div style={theme.cardTitle}>📋 Conjuntos Salvos de Temperatura</div>
        {tempLog.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="text" value={setName} onChange={e => setSetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && setName.trim()) { onSaveTempSet?.(setName); setSetName(''); } }}
              placeholder="Nome do conjunto (ex: Interlagos Março)"
              style={{ background: COLORS.bg, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, outline: 'none', flex: '1 1 200px' }} />
            <button onClick={() => { if (!setName.trim()) return; onSaveTempSet?.(setName); setSetName(''); }}
              style={smallBtnStyle(COLORS.green, COLORS.green)}>💾 Salvar conjunto</button>
            <button onClick={() => onClearTempLog?.()}
              style={smallBtnStyle(COLORS.accent, COLORS.accent)}>🗑 Limpar registros</button>
          </div>
        )}
        {confirmLoadId && (
          <div style={{ background: '#78350f22', border: '1px solid #f59e0b66', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#f59e0b', flex: 1 }}>⚠️ Carregar este conjunto substituirá os registros atuais. Deseja continuar?</span>
            <button onClick={() => { onLoadTempSet?.(confirmLoadId); setConfirmLoadId(null); }} style={smallBtnStyle(COLORS.green, COLORS.green)}>Sim, carregar</button>
            <button onClick={() => setConfirmLoadId(null)} style={smallBtnStyle(COLORS.textMuted, COLORS.textMuted)}>Cancelar</button>
          </div>
        )}
        {tempSets.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tempSets.map(set => {
              const isEditingSet = editingSetId === set.id;
              const uniqueSetDates = [...new Set(set.entries.map(e => e.date).filter(Boolean))].sort();
              return (
                <div key={set.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: `${COLORS.border}11`, borderRadius: 8, border: `1px solid ${COLORS.border}33` }}>
                  {isEditingSet ? (
                    <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}>
                      <input autoFocus value={editSetName} onChange={e => setEditSetName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && editSetName.trim()) { onRenameTempSet?.(set.id, editSetName); setEditingSetId(null); } if (e.key === 'Escape') setEditingSetId(null); }}
                        style={{ background: COLORS.bg, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, outline: 'none', flex: 1 }} />
                      <button onClick={() => { onRenameTempSet?.(set.id, editSetName); setEditingSetId(null); }}
                        style={{ background: COLORS.green, border: 'none', color: '#fff', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✓</button>
                      <button onClick={() => setEditingSetId(null)}
                        style={{ background: 'none', border: `1px solid ${COLORS.border}`, color: COLORS.textMuted, borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.textPrimary }}>{set.name}</div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                          {set.entries.length} registro(s) · {uniqueSetDates.length} dia(s)
                          {uniqueSetDates.length > 0 && <span style={{ marginLeft: 6 }}>({uniqueSetDates.map(fmtDateShort).join(', ')})</span>}
                          <span style={{ marginLeft: 8 }}>Salvo em {new Date(set.savedAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => setConfirmLoadId(set.id)} style={smallBtnStyle(COLORS.cyan, COLORS.cyan)}>📂 Carregar</button>
                        <button onClick={() => { setEditingSetId(set.id); setEditSetName(set.name); }} style={smallBtnStyle(COLORS.orange, COLORS.orange)}>✏️</button>
                        <button onClick={() => onDeleteTempSet?.(set.id)} style={smallBtnStyle(COLORS.accent, COLORS.accent)}>🗑</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '4px 0' }}>
            Nenhum conjunto salvo. Registre condições e salve como conjunto para reutilizar depois.
          </div>
        )}
      </div>

      {/* ── Telemetria do motor ────────────────────────────────────────────────── */}
      {data ? (
        <>
          <div style={theme.card}>
            <div style={theme.cardTitle}>🔥 Temperatura do Motor (Telemetria)</div>
            <div style={theme.grid(3)}>
              {engineTempPerLap.length > 0 && (
                <>
                  <MetricCard label="Máx. Geral" value={engineTempPerLap.reduce((m, l) => Math.max(m, l.max), -Infinity).toFixed(1)} unit="°C" color={COLORS.accent} small />
                  <MetricCard label="Média Geral" value={(engineTempPerLap.reduce((a, l) => a + l.avg, 0) / engineTempPerLap.length).toFixed(1)} unit="°C" color={COLORS.orange} small />
                  <MetricCard label="Mín. Geral" value={engineTempPerLap.reduce((m, l) => Math.min(m, l.min), Infinity).toFixed(1)} unit="°C" color={COLORS.cyan} small />
                </>
              )}
            </div>
          </div>
          <ChartCard title="Temperatura do Motor por Volta (Mín / Méd / Máx)" height={260}>
            <ResponsiveContainer>
              <LineChart data={engineTempPerLap}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="lap" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} domain={['auto', 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="max" stroke={COLORS.accent} strokeWidth={2} dot name="Máx" />
                <Line type="monotone" dataKey="avg" stroke={COLORS.orange} strokeWidth={2} dot name="Média" />
                <Line type="monotone" dataKey="min" stroke={COLORS.cyan}   strokeWidth={2} dot name="Mín" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
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
        </>
      ) : (
        <div style={{ ...theme.card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 24px', textAlign: 'center' }}>
          <span style={{ fontSize: 40 }}>🔥</span>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textSecondary }}>Temperatura do Motor (Telemetria)</div>
          <p style={{ fontSize: 13, color: COLORS.textMuted, maxWidth: 380, margin: 0 }}>
            Carregue um arquivo de telemetria na tela inicial para visualizar os dados de temperatura do motor por volta e o traço completo da sessão.
          </p>
        </div>
      )}
      <PrintFooter />
    </div>
  );
}
