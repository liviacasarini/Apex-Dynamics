/**
 * TelemetriaLiveTab — Live telemetry dashboard for Superbike (placeholder-ready).
 *
 * Layout pronto para receber stream ao vivo (CAN, MoTeC, Marelli, AiM, 2D).
 * Engenheiros podem configurar alarmes por canal e ver tudo em tempo real.
 * Enquanto não há fonte de dados conectada, exibe estado "aguardando conexão"
 * mantendo todos os widgets, gauges e tabela de alarmes funcionais (mock-ready).
 */

import { useEffect, useMemo, useState } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';

// ── Catálogo completo de canais de telemetria moto (Superbike) ──
// Mesma lista usada em VitalsTab moto + canais derivados úteis em live.
const LIVE_CHANNELS = [
  { group: 'Motor',     key: 'rpm',                label: 'RPM',                 unit: 'rpm', min: 0,    max: 16000, warn: 14500, crit: 15500 },
  { group: 'Motor',     key: 'gear',               label: 'Marcha',              unit: '',    min: 0,    max: 6,     warn: null,  crit: null },
  { group: 'Motor',     key: 'tps',                label: 'TPS',                 unit: '%',   min: 0,    max: 100,   warn: null,  crit: null },
  { group: 'Motor',     key: 'engineTemp',         label: 'Temp. Água',          unit: '°C',  min: 60,   max: 130,   warn: 105,   crit: 115 },
  { group: 'Motor',     key: 'oilTemp',            label: 'Temp. Óleo',          unit: '°C',  min: 60,   max: 150,   warn: 125,   crit: 140 },
  { group: 'Motor',     key: 'oilPressure',        label: 'Pressão Óleo',        unit: 'bar', min: 0,    max: 8,     warn: 2.0,   crit: 1.2 },
  { group: 'Motor',     key: 'lambda',             label: 'Lambda',              unit: '',    min: 0.7,  max: 1.3,   warn: 1.05,  crit: 1.15 },
  { group: 'Motor',     key: 'mapPressure',        label: 'MAP',                 unit: 'kPa', min: 0,    max: 130,   warn: null,  crit: null },
  { group: 'Motor',     key: 'airboxTemp',         label: 'Temp. Airbox',        unit: '°C',  min: 0,    max: 80,    warn: 55,    crit: 65 },
  { group: 'Motor',     key: 'airboxPressure',     label: 'Pressão Airbox',      unit: 'bar', min: 0.9,  max: 1.4,   warn: null,  crit: null },
  { group: 'Motor',     key: 'fuelPressure',       label: 'Pressão Comb.',       unit: 'bar', min: 0,    max: 6,     warn: 3.0,   crit: 2.5 },
  { group: 'Motor',     key: 'fuelTemp',           label: 'Temp. Comb.',         unit: '°C',  min: 0,    max: 80,    warn: 50,    crit: 65 },
  { group: 'Motor',     key: 'exhaustTempCyl1',    label: 'EGT Cil. 1',          unit: '°C',  min: 0,    max: 950,   warn: 850,   crit: 920 },
  { group: 'Motor',     key: 'exhaustTempCyl2',    label: 'EGT Cil. 2',          unit: '°C',  min: 0,    max: 950,   warn: 850,   crit: 920 },
  { group: 'Motor',     key: 'exhaustTempCyl3',    label: 'EGT Cil. 3',          unit: '°C',  min: 0,    max: 950,   warn: 850,   crit: 920 },
  { group: 'Motor',     key: 'exhaustTempCyl4',    label: 'EGT Cil. 4',          unit: '°C',  min: 0,    max: 950,   warn: 850,   crit: 920 },
  { group: 'Elétrico', key: 'battery',            label: 'Bateria',             unit: 'V',   min: 11,   max: 15,    warn: 12.0,  crit: 11.5 },
  { group: 'Elétrico', key: 'alternator',         label: 'Carga Alt.',          unit: 'A',   min: 0,    max: 40,    warn: 5,     crit: 2 },
  { group: 'Embreagem',key: 'clutchTemp',         label: 'Temp. Embr.',         unit: '°C',  min: 0,    max: 250,   warn: 180,   crit: 220 },
  { group: 'Freios',   key: 'brakeTempFront',     label: 'Disco Diant.',        unit: '°C',  min: 0,    max: 800,   warn: 650,   crit: 750 },
  { group: 'Freios',   key: 'brakeTempRear',      label: 'Disco Tras.',         unit: '°C',  min: 0,    max: 600,   warn: 450,   crit: 550 },
  { group: 'Freios',   key: 'brakePressureFront', label: 'Pressão Diant.',      unit: 'bar', min: 0,    max: 30,    warn: null,  crit: null },
  { group: 'Freios',   key: 'brakePressureRear',  label: 'Pressão Tras.',       unit: 'bar', min: 0,    max: 25,    warn: null,  crit: null },
  { group: 'Pneus',    key: 'tirePressFront',     label: 'Pressão Pneu Diant.', unit: 'bar', min: 1.5,  max: 2.6,   warn: 2.4,   crit: 2.5 },
  { group: 'Pneus',    key: 'tirePressRear',      label: 'Pressão Pneu Tras.',  unit: 'bar', min: 1.3,  max: 2.4,   warn: 2.2,   crit: 2.3 },
  { group: 'Pneus',    key: 'tireTempFront',      label: 'Temp. Pneu Diant.',   unit: '°C',  min: 30,   max: 130,   warn: 110,   crit: 120 },
  { group: 'Pneus',    key: 'tireTempRear',       label: 'Temp. Pneu Tras.',    unit: '°C',  min: 30,   max: 130,   warn: 110,   crit: 120 },
  { group: 'Suspensão',key: 'forkTravel',         label: 'Curso Forquilha',     unit: 'mm',  min: 0,    max: 130,   warn: 120,   crit: 128 },
  { group: 'Suspensão',key: 'shockTravel',        label: 'Curso Mono',          unit: 'mm',  min: 0,    max: 75,    warn: 68,    crit: 73 },
  { group: 'Suspensão',key: 'forkSpeed',          label: 'Vel. Forquilha',      unit: 'mm/s',min: -2000,max: 2000,  warn: null,  crit: null },
  { group: 'Suspensão',key: 'shockSpeed',         label: 'Vel. Mono',           unit: 'mm/s',min: -2000,max: 2000,  warn: null,  crit: null },
  { group: 'Chassi',   key: 'leanAngle',          label: 'Inclinação',          unit: '°',   min: -65,  max: 65,    warn: 60,    crit: 64 },
  { group: 'Chassi',   key: 'pitchAngle',         label: 'Pitch',               unit: '°',   min: -25,  max: 25,    warn: null,  crit: null },
  { group: 'Chassi',   key: 'yawRate',            label: 'Yaw Rate',            unit: '°/s', min: -180, max: 180,   warn: null,  crit: null },
  { group: 'Chassi',   key: 'gLat',               label: 'G Lateral',           unit: 'g',   min: -2,   max: 2,     warn: 1.6,   crit: 1.9 },
  { group: 'Chassi',   key: 'gLon',               label: 'G Longitudinal',      unit: 'g',   min: -2,   max: 2,     warn: 1.6,   crit: 1.9 },
  { group: 'Chassi',   key: 'gVert',              label: 'G Vertical',          unit: 'g',   min: -3,   max: 3,     warn: 2.5,   crit: 2.9 },
  { group: 'Velocidade', key: 'wheelSpeedFront',  label: 'Vel. Roda Diant.',    unit: 'km/h',min: 0,    max: 320,   warn: null,  crit: null },
  { group: 'Velocidade', key: 'wheelSpeedRear',   label: 'Vel. Roda Tras.',     unit: 'km/h',min: 0,    max: 340,   warn: null,  crit: null },
  { group: 'Velocidade', key: 'slipRatio',        label: 'Slip Ratio',          unit: '%',   min: 0,    max: 100,   warn: 15,    crit: 25 },
  { group: 'Eletrônica',key: 'tcLevel',           label: 'TC',                  unit: '',    min: 0,    max: 8,     warn: null,  crit: null },
  { group: 'Eletrônica',key: 'awLevel',           label: 'Anti-Wheelie',        unit: '',    min: 0,    max: 4,     warn: null,  crit: null },
  { group: 'Eletrônica',key: 'ebcLevel',          label: 'EBC',                 unit: '',    min: 0,    max: 4,     warn: null,  crit: null },
  { group: 'Eletrônica',key: 'launchActive',      label: 'Launch',              unit: '',    min: 0,    max: 1,     warn: null,  crit: null },
  { group: 'Eletrônica',key: 'pitLimiter',        label: 'Pit Limiter',         unit: '',    min: 0,    max: 1,     warn: null,  crit: null },
  { group: 'Eletrônica',key: 'absActive',         label: 'ABS Ativo',           unit: '',    min: 0,    max: 1,     warn: null,  crit: null },
];

const LS_KEY = 'rt_telemetria_live_alarms';
const SOURCE_KEY = 'rt_telemetria_live_source';

function loadAlarms() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Default: warn/crit do catálogo
  const defaults = {};
  LIVE_CHANNELS.forEach((c) => {
    defaults[c.key] = { enabled: c.warn != null || c.crit != null, warn: c.warn ?? '', crit: c.crit ?? '' };
  });
  return defaults;
}

export default function TelemetriaLiveTab() {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);

  const [alarms, setAlarms] = useState(loadAlarms);
  const [source, setSource] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SOURCE_KEY)) || { type: 'none', host: '', port: '' }; }
    catch { return { type: 'none', host: '', port: '' }; }
  });
  const [connected, setConnected] = useState(false);
  const [live, setLive] = useState({}); // { [channelKey]: number }
  const [activeGroup, setActiveGroup] = useState('Todos');
  const [showAlarmConfig, setShowAlarmConfig] = useState(false);

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(alarms)); }, [alarms]);
  useEffect(() => { localStorage.setItem(SOURCE_KEY, JSON.stringify(source)); }, [source]);

  const groups = useMemo(() => ['Todos', ...Array.from(new Set(LIVE_CHANNELS.map((c) => c.group)))], []);
  const visibleChannels = activeGroup === 'Todos'
    ? LIVE_CHANNELS
    : LIVE_CHANNELS.filter((c) => c.group === activeGroup);

  const triggeredAlarms = useMemo(() => {
    const list = [];
    LIVE_CHANNELS.forEach((c) => {
      const a = alarms[c.key];
      const v = live[c.key];
      if (!a || !a.enabled || v == null) return;
      const warn = parseFloat(a.warn);
      const crit = parseFloat(a.crit);
      if (!isNaN(crit) && v >= crit) list.push({ channel: c, value: v, level: 'crit' });
      else if (!isNaN(warn) && v >= warn) list.push({ channel: c, value: v, level: 'warn' });
    });
    return list;
  }, [alarms, live]);

  const setAlarmField = (key, field, val) => {
    setAlarms((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val } }));
  };

  const handleConnect = () => {
    // Stub: a integração real (CAN/UDP/WebSocket/MoTeC i2) será plugada aqui.
    alert('Conexão ao vivo ainda não implementada nesta versão.\n\nA aba está pronta para receber stream — integre um adapter (UDP/WebSocket/CAN-USB) e despeje os valores em setLive().');
  };
  const handleDisconnect = () => { setConnected(false); setLive({}); };

  return (
    <div style={{ padding: '20px 12px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: COLORS.textPrimary }}>
          📡 Telemetria ao Vivo
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: connected ? `${COLORS.green}22` : `${COLORS.textMuted}22`,
            color: connected ? COLORS.green : COLORS.textMuted,
            border: `1px solid ${connected ? COLORS.green : COLORS.border}`,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? COLORS.green : COLORS.textMuted }} />
            {connected ? 'AO VIVO' : 'DESCONECTADO'}
          </span>
          <button onClick={() => setShowAlarmConfig((s) => !s)} style={{ ...theme.pillButton(showAlarmConfig), padding: '6px 14px' }}>
            🚨 Alarmes
          </button>
        </div>
      </div>

      {/* Conexão */}
      <div style={{
        background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
        borderRadius: 8, padding: 14, marginBottom: 14,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 8 }}>
          🔌 FONTE DE DADOS
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={source.type}
            onChange={(e) => setSource({ ...source, type: e.target.value })}
            style={{
              background: COLORS.bg, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}`,
              borderRadius: 6, padding: '8px 10px', fontSize: 12, outline: 'none',
            }}
          >
            <option value="none">— Selecione —</option>
            <option value="udp">UDP (MoTeC / 2D / AiM)</option>
            <option value="websocket">WebSocket</option>
            <option value="can">CAN-USB Bridge</option>
            <option value="marelli">Marelli WSBK ECU</option>
            <option value="mock">Demo / Mock</option>
          </select>
          <input
            placeholder="Host / Endereço"
            value={source.host}
            onChange={(e) => setSource({ ...source, host: e.target.value })}
            style={{
              background: COLORS.bg, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}`,
              borderRadius: 6, padding: '8px 10px', fontSize: 12, outline: 'none', minWidth: 180,
            }}
          />
          <input
            placeholder="Porta"
            value={source.port}
            onChange={(e) => setSource({ ...source, port: e.target.value })}
            style={{
              background: COLORS.bg, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}`,
              borderRadius: 6, padding: '8px 10px', fontSize: 12, outline: 'none', width: 100,
            }}
          />
          {connected
            ? <button onClick={handleDisconnect} style={{ ...theme.pillButton(true), padding: '8px 16px', background: COLORS.accent }}>⏹ Desconectar</button>
            : <button onClick={handleConnect}    style={{ ...theme.pillButton(true), padding: '8px 16px' }}>▶ Conectar</button>
          }
        </div>
        {!connected && (
          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' }}>
            ⚠ Adapter de stream ao vivo ainda não conectado. A aba está pronta para receber dados —
            todos os widgets, gauges e alarmes funcionarão automaticamente assim que <code>setLive()</code> receber o stream.
          </div>
        )}
      </div>

      {/* Painel de alarmes disparados */}
      {triggeredAlarms.length > 0 && (
        <div style={{
          background: `${COLORS.accent}11`, border: `1px solid ${COLORS.accent}`,
          borderRadius: 8, padding: 12, marginBottom: 14,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent, marginBottom: 6 }}>
            🚨 ALARMES ATIVOS ({triggeredAlarms.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {triggeredAlarms.map((t) => (
              <div key={t.channel.key} style={{
                fontSize: 11, fontWeight: 700,
                padding: '4px 10px', borderRadius: 6,
                background: t.level === 'crit' ? COLORS.accent : COLORS.yellow,
                color: '#000',
              }}>
                {t.channel.label}: {t.value.toFixed(2)} {t.channel.unit}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtro por grupo */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {groups.map((g) => (
          <button key={g} onClick={() => setActiveGroup(g)}
            style={{ ...theme.pillButton(activeGroup === g), padding: '5px 12px', fontSize: 11 }}>
            {g}
          </button>
        ))}
      </div>

      {/* Grid de canais ao vivo (gauges/cards) */}
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      }}>
        {visibleChannels.map((c) => {
          const v = live[c.key];
          const a = alarms[c.key] || {};
          const warn = parseFloat(a.warn);
          const crit = parseFloat(a.crit);
          let state = 'ok';
          if (v != null) {
            if (!isNaN(crit) && v >= crit) state = 'crit';
            else if (!isNaN(warn) && v >= warn) state = 'warn';
          }
          const stateColor = state === 'crit' ? COLORS.accent : state === 'warn' ? COLORS.yellow : COLORS.green;
          const range = c.max - c.min || 1;
          const pct = v == null ? 0 : Math.max(0, Math.min(100, ((v - c.min) / range) * 100));

          return (
            <div key={c.key} style={{
              background: COLORS.bgCard,
              border: `1px solid ${state === 'ok' ? COLORS.border : stateColor}`,
              borderRadius: 8, padding: 12, position: 'relative',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {c.group}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginTop: 2 }}>
                {c.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: state === 'ok' ? COLORS.textPrimary : stateColor, fontVariantNumeric: 'tabular-nums' }}>
                  {v == null ? '—' : v.toFixed(c.unit === '' ? 0 : 1)}
                </span>
                <span style={{ fontSize: 10, color: COLORS.textMuted }}>{c.unit}</span>
              </div>
              <div style={{
                marginTop: 8, height: 4, borderRadius: 2,
                background: COLORS.border, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: stateColor, transition: 'width 200ms',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 8, color: COLORS.textMuted }}>
                <span>{c.min}</span><span>{c.max}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Configuração de alarmes */}
      {showAlarmConfig && (
        <div style={{
          marginTop: 16,
          background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
          borderRadius: 8, padding: 14,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 10 }}>
            🚨 CONFIGURAÇÃO DE ALARMES
          </div>
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}>
            {LIVE_CHANNELS.map((c) => {
              const a = alarms[c.key] || {};
              return (
                <div key={c.key} style={{
                  border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: 8,
                  background: COLORS.bg,
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.textPrimary, fontWeight: 600 }}>
                    <input type="checkbox" checked={!!a.enabled}
                      onChange={(e) => setAlarmField(c.key, 'enabled', e.target.checked)} />
                    {c.label} <span style={{ color: COLORS.textMuted, fontWeight: 400 }}>({c.unit || '—'})</span>
                  </label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input type="number" placeholder="Warn" value={a.warn ?? ''}
                      onChange={(e) => setAlarmField(c.key, 'warn', e.target.value)}
                      style={{ flex: 1, background: COLORS.bgCard, color: COLORS.yellow,
                               border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: '4px 6px', fontSize: 11, outline: 'none' }} />
                    <input type="number" placeholder="Crit" value={a.crit ?? ''}
                      onChange={(e) => setAlarmField(c.key, 'crit', e.target.value)}
                      style={{ flex: 1, background: COLORS.bgCard, color: COLORS.accent,
                               border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: '4px 6px', fontSize: 11, outline: 'none' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
