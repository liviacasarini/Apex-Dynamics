/**
 * CalendarioTab — Calendário da Equipe
 *
 * App completo de calendário com vistas: Ano, Mês, Semana, Dia
 * Persistência: localStorage — chave rt_calendar_<profileId>
 *
 * Funcionalidades:
 * - Seleção de carros por evento (substitui campo piloto)
 * - Criação automática de grupo no perfil de cada carro selecionado
 * - Status do evento (Planejado / Confirmado / Em andamento / Concluído / Cancelado)
 * - Resultado pós-evento (posição, pontos, notas)
 * - Contador regressivo para próxima corrida
 * - Painel de agenda (próximos eventos)
 * - Eventos multi-dia
 * - Eventos recorrentes (semanal / quinzenal)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { PrintFooter } from '@/components/common';
import { TRACK_DATABASE } from '@/core/tracks';

/* ─── constantes ─────────────────────────────────────────────────── */

const VIEWS = ['year', 'month', 'week', 'day'];
const VIEW_LABELS = { year: 'Ano', month: 'Mês', week: 'Semana', day: 'Dia' };

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];
const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 – 23:00

const EVENT_COLORS = ['#e53e3e', '#38b2ac', '#4299e1', '#ed8936', '#9f7aea', '#48bb78', '#ed64a6', '#ecc94b'];

const CATEGORY_OPTIONS = [
  { value: 'corrida',    label: 'Corrida',       icon: '🏁' },
  { value: 'treino',     label: 'Treino/Teste',  icon: '🏎️' },
  { value: 'reuniao',    label: 'Reunião',       icon: '📋' },
  { value: 'logistica',  label: 'Logística',     icon: '🚛' },
  { value: 'manutencao', label: 'Manutenção',    icon: '🔧' },
  { value: 'marketing',  label: 'Marketing',     icon: '📢' },
  { value: 'outro',      label: 'Outro',         icon: '📌' },
];

const STATUS_OPTIONS = [
  { value: 'planejado',   label: 'Planejado',     color: '#4299e1' },
  { value: 'confirmado',  label: 'Confirmado',    color: '#48bb78' },
  { value: 'emandamento', label: 'Em andamento',  color: '#ed8936' },
  { value: 'concluido',   label: 'Concluído',     color: '#9f7aea' },
  { value: 'cancelado',   label: 'Cancelado',     color: '#718096' },
];

const RECURRENCE_OPTIONS = [
  { value: 'none',      label: 'Sem repetição' },
  { value: 'weekly',    label: 'Semanal' },
  { value: 'biweekly',  label: 'Quinzenal' },
  { value: 'monthly',   label: 'Mensal' },
];

/* ─── helpers de workspace (fallback read-only) ──────────────────── */

function loadWorkspaceProfilesFallback() {
  try {
    const raw = localStorage.getItem('rt_workspaces');
    if (!raw) return [];
    const state = JSON.parse(raw);
    const ws = state.workspaces?.find(w => w.id === state.activeWorkspaceId)
      || state.workspaces?.[0];
    return (ws?.profiles || []).filter(p => p.name);
  } catch { return []; }
}

/* ─── helpers de calendário ──────────────────────────────────────── */

const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const getFirstDayOfWeek = (y, m) => new Date(y, m, 1).getDay();

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isToday = (d) => isSameDay(d, new Date());

const getWeekDates = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const r = new Date(d);
    r.setDate(r.getDate() + i);
    return r;
  });
};

const formatHour = (h) => `${String(h).padStart(2, '0')}:00`;

const eventsForDay = (events, date) =>
  events.filter((e) => {
    const s = new Date(e.start);
    const en = new Date(e.end);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd   = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    return s < dayEnd && en > dayStart;
  });

const eventsInHour = (events, date, hour) =>
  events.filter((e) => {
    const s = new Date(e.start);
    const en = new Date(e.end);
    const hStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour);
    const hEnd   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1);
    return s < hEnd && en > hStart;
  });

const dateToInputValue = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const dateToDateValue = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/* ─── geração de recorrência ─────────────────────────────────────── */

function generateRecurringEvents(ev) {
  const { type, count } = ev.recurrence || {};
  const qty = Math.min(parseInt(count, 10) || 4, 52);
  const intervalMap = { weekly: 7, biweekly: 14, monthly: 30 };
  const intervalDays = intervalMap[type] || 7;
  const results = [];
  for (let i = 0; i < qty; i++) {
    const s = new Date(ev.start);
    s.setDate(s.getDate() + i * intervalDays);
    const en = new Date(ev.end);
    en.setDate(en.getDate() + i * intervalDays);
    results.push({
      ...ev,
      id: Date.now() + i * 1000 + Math.random(),
      start: dateToInputValue(s),
      end: dateToInputValue(en),
      recurrence: { type: 'none', count: 1 },
    });
  }
  return results;
}

/* ─── utilitários de status ──────────────────────────────────────── */

const getStatus = (val) => STATUS_OPTIONS.find(s => s.value === val) || STATUS_OPTIONS[0];

const statusDot = (status, size = 8) => {
  const s = getStatus(status);
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: s.color,
      flexShrink: 0,
      marginRight: 4,
    }} title={s.label} />
  );
};

/* ─── componente principal ───────────────────────────────────────── */

export default function CalendarioTab({ activeProfile, allProfiles = [], saveGroup }) {
  const C = useColors();
  const theme = makeTheme(C);
  const IB = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.textPrimary,
    fontSize: 13,
    padding: '8px 12px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
  };

  const profileId = activeProfile?.id || 'default';
  const storageKey = `rt_calendar_${profileId}`;

  /* ── state ─────────────────────────────────────────────────────── */
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month');
  const [events, setEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  /* ── persistence ───────────────────────────────────────────────── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setEvents(raw ? JSON.parse(raw) : []);
    } catch { setEvents([]); }
  }, [storageKey]);

  const persist = useCallback((next) => {
    setEvents(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }, [storageKey]);

  /* ── computed: próxima corrida ─────────────────────────────────── */
  const nextRace = useMemo(() => {
    const now = new Date();
    return events
      .filter(e => e.category === 'corrida' && new Date(e.start) > now && e.status !== 'cancelado')
      .sort((a, b) => new Date(a.start) - new Date(b.start))[0] || null;
  }, [events]);

  const daysUntilRace = useMemo(() => {
    if (!nextRace) return null;
    const diff = new Date(nextRace.start) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [nextRace]);

  /* ── computed: agenda ──────────────────────────────────────────── */
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return events
      .filter(e => new Date(e.end) >= now && e.status !== 'cancelado')
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 15);
  }, [events]);

  /* ── novo evento ────────────────────────────────────────────────── */
  const openNewEvent = useCallback((date, hour) => {
    const start = new Date(date);
    start.setHours(hour ?? 9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    setEditingEvent({
      id: null,
      title: '',
      description: '',
      category: 'outro',
      status: 'planejado',
      carIds: [],
      result: { position: '', points: '', notes: '' },
      isMultiDay: false,
      endDate: dateToDateValue(end),
      recurrence: { type: 'none', count: 4 },
      start: dateToInputValue(start),
      end: dateToInputValue(end),
      color: EVENT_COLORS[0],
      trackId: '',
      raceLaps: '',
      mandatoryPitStops: '',
      minStintLaps: '',
      minPitTime: '',
      tireRestriction: '',
      fuelRestriction: '',
    });
    setShowModal(true);
  }, []);

  const openEditEvent = useCallback((ev) => {
    setEditingEvent({
      result: { position: '', points: '', notes: '' },
      recurrence: { type: 'none', count: 4 },
      carIds: [],
      isMultiDay: false,
      endDate: '',
      status: 'planejado',
      ...ev,
    });
    setShowModal(true);
  }, []);

  /* ── salvar evento ──────────────────────────────────────────────── */
  const saveEvent = useCallback((ev) => {
    if (!ev.title.trim()) return;

    // Ajustar end para multi-dia
    let finalEv = { ...ev };
    if (ev.isMultiDay && ev.endDate) {
      finalEv = { ...finalEv, end: ev.endDate + 'T23:59' };
    }

    // Criar grupos nos carros selecionados via hook (atualiza React state corretamente)
    if (finalEv.carIds && finalEv.carIds.length > 0 && saveGroup) {
      const profiles = allProfiles.length > 0 ? allProfiles : loadWorkspaceProfilesFallback();
      finalEv.carIds.forEach(carId => {
        const profile = profiles.find(p => p.id === carId);
        if (!profile) return;
        const alreadyExists = (profile.groups || []).some(g => g.name === finalEv.title);
        if (!alreadyExists) saveGroup(finalEv.title, carId);
      });
    }

    // Recorrência: gerar múltiplos eventos
    if (!ev.id && ev.recurrence && ev.recurrence.type !== 'none') {
      const generated = generateRecurringEvents(finalEv);
      persist([...events, ...generated]);
    } else if (ev.id) {
      persist(events.map(e => e.id === ev.id ? finalEv : e));
    } else {
      persist([...events, { ...finalEv, id: Date.now() }]);
    }

    setShowModal(false);
    setEditingEvent(null);
  }, [events, persist]);

  const deleteEvent = useCallback((id) => {
    persist(events.filter((e) => e.id !== id));
    setShowModal(false);
    setEditingEvent(null);
  }, [events, persist]);

  /* ── navigation ────────────────────────────────────────────────── */
  const navigate = useCallback((delta) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === 'year')  d.setFullYear(d.getFullYear() + delta);
      if (view === 'month') d.setMonth(d.getMonth() + delta);
      if (view === 'week')  d.setDate(d.getDate() + 7 * delta);
      if (view === 'day')   d.setDate(d.getDate() + delta);
      return d;
    });
  }, [view]);

  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  const goToDate = useCallback((d, v) => {
    setCurrentDate(new Date(d));
    if (v) setView(v);
  }, []);

  /* ── header label ──────────────────────────────────────────────── */
  const headerLabel = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    if (view === 'year') return `${y}`;
    if (view === 'month') return `${MONTHS_PT[m]} ${y}`;
    if (view === 'week') {
      const wd = getWeekDates(currentDate);
      const s = wd[0], e = wd[6];
      if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${MONTHS_PT[s.getMonth()]} ${y}`;
      return `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]} ${y}`;
    }
    return `${currentDate.getDate()} ${MONTHS_PT[m]} ${y} (${WEEKDAYS_PT[currentDate.getDay()]})`;
  }, [currentDate, view]);

  /* ── styles ────────────────────────────────────────────────────── */
  const navBtn = {
    background: 'none',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.textPrimary,
    fontSize: 16,
    cursor: 'pointer',
    padding: '4px 10px',
    lineHeight: 1,
  };
  const todayBtn = {
    ...theme.pillButton(false),
    fontSize: 11,
    padding: '4px 12px',
  };

  /* ─── render ───────────────────────────────────────────────────── */
  return (
    <div style={{ padding: '20px 24px', maxWidth: 1500, margin: '0 auto' }}>
      {/* Title */}
      <div style={{ fontSize: 20, fontWeight: 800, color: C.textPrimary }}>
        📅 Calendário
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2, marginBottom: 16 }}>
        Planejamento de treinos, corridas e eventos da equipe
      </div>

      {/* Contador regressivo */}
      {nextRace && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          padding: '12px 18px',
          background: `${C.accent}12`,
          border: `1px solid ${C.accent}40`,
          borderRadius: 10,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 22 }}>🏁</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>
              Próxima corrida: <span style={{ color: C.accent }}>{nextRace.title}</span>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              {new Date(nextRace.start).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              {nextRace.trackId && (() => {
                const track = TRACK_DATABASE.find(t => t.id === nextRace.trackId);
                return track ? ` · ${track.name}` : '';
              })()}
            </div>
          </div>
          <div style={{
            marginLeft: 'auto',
            textAlign: 'center',
            background: C.accent,
            borderRadius: 10,
            padding: '6px 16px',
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
              {daysUntilRace}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
              {daysUntilRace === 1 ? 'dia' : 'dias'}
            </div>
          </div>
        </div>
      )}

      {/* Navigation + View Switcher */}
      <div style={{ ...theme.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={navBtn} onClick={() => navigate(-1)}>◀</button>
          <button style={navBtn} onClick={() => navigate(1)}>▶</button>
          <button style={todayBtn} onClick={goToday}>Hoje</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, marginLeft: 8 }}>
            {headerLabel}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {VIEWS.map((v) => (
            <button key={v} style={theme.pillButton(view === v)} onClick={() => setView(v)}>
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar body */}
      <div style={theme.card}>
        {view === 'year'  && <YearView  currentDate={currentDate} events={events} C={C} theme={theme} goToDate={goToDate} />}
        {view === 'month' && <MonthView currentDate={currentDate} events={events} C={C} theme={theme} goToDate={goToDate} onNewEvent={openNewEvent} onEditEvent={openEditEvent} />}
        {view === 'week'  && <WeekView  currentDate={currentDate} events={events} C={C} theme={theme} goToDate={goToDate} onNewEvent={openNewEvent} onEditEvent={openEditEvent} allProfiles={allProfiles} />}
        {view === 'day'   && <DayView   currentDate={currentDate} events={events} C={C} theme={theme} onNewEvent={openNewEvent} onEditEvent={openEditEvent} allProfiles={allProfiles} />}
      </div>

      {/* Painel de Agenda */}
      <AgendaPanel events={upcomingEvents} C={C} theme={theme} onEditEvent={openEditEvent} allProfiles={allProfiles} />

      {/* Event modal */}
      {showModal && editingEvent && (
        <EventModal
          event={editingEvent}
          onChange={setEditingEvent}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => { setShowModal(false); setEditingEvent(null); }}
          C={C}
          theme={theme}
          IB={IB}
          allProfiles={allProfiles}
        />
      )}
      <PrintFooter />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   YEAR VIEW
   ═══════════════════════════════════════════════════════════════════ */

function YearView({ currentDate, events, C, theme, goToDate }) {
  const year = currentDate.getFullYear();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {MONTHS_PT.map((name, mi) => {
        const days = getDaysInMonth(year, mi);
        const firstDay = getFirstDayOfWeek(year, mi);
        const cells = Array(firstDay).fill(null).concat(Array.from({ length: days }, (_, i) => i + 1));

        return (
          <div
            key={mi}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 10,
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
            onClick={() => goToDate(new Date(year, mi, 1), 'month')}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, marginBottom: 6, textAlign: 'center' }}>
              {name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {WEEKDAYS_PT.map((wd) => (
                <div key={wd} style={{ fontSize: 8, color: C.textMuted, textAlign: 'center' }}>{wd[0]}</div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} />;
                const date = new Date(year, mi, day);
                const dayEvs = eventsForDay(events, date);
                const hasEvents = dayEvs.length > 0;
                const today = isToday(date);
                return (
                  <div
                    key={i}
                    onClick={(e) => { e.stopPropagation(); goToDate(date, 'day'); }}
                    style={{
                      fontSize: 9,
                      textAlign: 'center',
                      padding: '2px 0',
                      borderRadius: 3,
                      cursor: 'pointer',
                      background: today ? C.accent : hasEvents ? `${C.accent}15` : 'transparent',
                      color: today ? '#fff' : hasEvents ? C.accent : C.textSecondary,
                      fontWeight: today ? 700 : 400,
                    }}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MONTH VIEW
   ═══════════════════════════════════════════════════════════════════ */

function MonthView({ currentDate, events, C, theme, goToDate, onNewEvent, onEditEvent }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  const cells = Array(firstDay).fill(null).concat(Array.from({ length: days }, (_, i) => i + 1));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 4 }}>
        {WEEKDAYS_PT.map((wd) => (
          <div key={wd} style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textAlign: 'center', padding: '6px 0' }}>
            {wd}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} style={{ minHeight: 90, background: `${C.bg}44`, borderRadius: 4 }} />;
          const date = new Date(year, month, day);
          const dayEvents = eventsForDay(events, date);
          const today = isToday(date);
          const MAX_SHOW = 3;

          return (
            <div
              key={i}
              style={{
                minHeight: 90,
                border: `1px solid ${today ? C.accent : C.border}33`,
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
                background: today ? `${C.accent}08` : 'transparent',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={() => goToDate(date, 'day')}
              onDoubleClick={(e) => { e.stopPropagation(); onNewEvent(date); }}
            >
              <div style={{
                fontSize: 12,
                fontWeight: today ? 700 : 400,
                color: today ? C.accent : C.textPrimary,
                marginBottom: 3,
                textAlign: 'right',
                paddingRight: 2,
              }}>
                {day}
              </div>
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayEvents.slice(0, MAX_SHOW).map((ev) => (
                  <EventPill key={ev.id} ev={ev} C={C} onClick={(e) => { e.stopPropagation(); onEditEvent(ev); }} />
                ))}
                {dayEvents.length > MAX_SHOW && (
                  <div style={{ fontSize: 9, color: C.textMuted, paddingLeft: 4 }}>+{dayEvents.length - MAX_SHOW} mais</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   WEEK VIEW
   ═══════════════════════════════════════════════════════════════════ */

function WeekView({ currentDate, events, C, theme, goToDate, onNewEvent, onEditEvent, allProfiles = [] }) {
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', minWidth: 700 }}>
        <div style={{ borderBottom: `1px solid ${C.border}`, padding: 6 }} />
        {weekDates.map((d, i) => {
          const today = isToday(d);
          return (
            <div
              key={i}
              style={{ borderBottom: `1px solid ${C.border}`, padding: '8px 4px', textAlign: 'center', cursor: 'pointer' }}
              onClick={() => goToDate(d, 'day')}
            >
              <div style={{ fontSize: 10, color: C.textMuted }}>{WEEKDAYS_PT[d.getDay()]}</div>
              <div style={{
                fontSize: 18, fontWeight: today ? 800 : 500,
                color: today ? C.accent : C.textPrimary,
                width: 32, height: 32, lineHeight: '32px',
                borderRadius: '50%', margin: '2px auto',
                background: today ? `${C.accent}20` : 'transparent',
              }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
        {HOURS.map((h) => (
          <HourRow key={h} hour={h} weekDates={weekDates} events={events} C={C} onNewEvent={onNewEvent} onEditEvent={onEditEvent} allProfiles={allProfiles} />
        ))}
      </div>
    </div>
  );
}

function HourRow({ hour, weekDates, events, C, onNewEvent, onEditEvent, allProfiles = [] }) {
  const profiles = useMemo(() => allProfiles.length > 0 ? allProfiles : loadWorkspaceProfilesFallback(), [allProfiles]);
  return (
    <>
      <div style={{
        fontSize: 10, color: C.textMuted, textAlign: 'right',
        paddingRight: 8, paddingTop: 2,
        borderBottom: `1px solid ${C.border}22`,
      }}>
        {formatHour(hour)}
      </div>
      {weekDates.map((d, i) => {
        const hourEvents = eventsInHour(events, d, hour);
        return (
          <div
            key={i}
            style={{
              borderBottom: `1px solid ${C.border}22`,
              borderLeft: `1px solid ${C.border}22`,
              minHeight: 44, padding: 2, cursor: 'pointer', position: 'relative',
            }}
            onClick={() => onNewEvent(d, hour)}
          >
            {hourEvents.map((ev) => {
              const carNames = (ev.carIds || [])
                .map(id => profiles.find(p => p.id === id)?.name)
                .filter(Boolean);
              return (
                <div
                  key={ev.id}
                  onClick={(e) => { e.stopPropagation(); onEditEvent(ev); }}
                  style={{
                    background: `${ev.color}25`,
                    borderLeft: `3px solid ${ev.color}`,
                    borderRadius: 4,
                    padding: '2px 5px',
                    fontSize: 10,
                    color: ev.color,
                    fontWeight: 600,
                    marginBottom: 1,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  {statusDot(ev.status, 6)}
                  {ev.title}{carNames.length > 0 ? ` · ${carNames.join(', ')}` : ''}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DAY VIEW
   ═══════════════════════════════════════════════════════════════════ */

function DayView({ currentDate, events, C, theme, onNewEvent, onEditEvent, allProfiles = [] }) {
  const dayEvents = useMemo(() => eventsForDay(events, currentDate), [events, currentDate]);
  const profiles = useMemo(() => allProfiles.length > 0 ? allProfiles : loadWorkspaceProfilesFallback(), [allProfiles]);

  return (
    <div>
      {dayEvents.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {dayEvents.map((ev) => (
            <span key={ev.id} style={pillStyle(ev.color)} onClick={() => onEditEvent(ev)}>
              {statusDot(ev.status, 7)}
              {new Date(ev.start).getHours()}h – {ev.title}
            </span>
          ))}
        </div>
      )}

      <div>
        {HOURS.map((h) => {
          const hourEvs = eventsInHour(events, currentDate, h);
          return (
            <div
              key={h}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr',
                borderBottom: `1px solid ${C.border}22`,
                minHeight: 56,
              }}
            >
              <div style={{
                fontSize: 11, color: C.textMuted,
                textAlign: 'right', paddingRight: 12,
                paddingTop: 4, fontWeight: 500,
              }}>
                {formatHour(h)}
              </div>
              <div
                style={{
                  borderLeft: `1px solid ${C.border}33`,
                  padding: '4px 8px', cursor: 'pointer', minHeight: 56,
                }}
                onClick={() => onNewEvent(currentDate, h)}
              >
                {hourEvs.map((ev) => {
                  const cat = CATEGORY_OPTIONS.find((c) => c.value === ev.category);
                  const sta = getStatus(ev.status);
                  const startH = new Date(ev.start).getHours();
                  const startM = new Date(ev.start).getMinutes();
                  const endH = new Date(ev.end).getHours();
                  const endM = new Date(ev.end).getMinutes();
                  const carNames = (ev.carIds || [])
                    .map(id => profiles.find(p => p.id === id)?.name)
                    .filter(Boolean);
                  return (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); onEditEvent(ev); }}
                      style={{
                        background: `${ev.color}18`,
                        borderLeft: `4px solid ${ev.color}`,
                        borderRadius: 6,
                        padding: '8px 12px',
                        marginBottom: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        {cat && <span style={{ fontSize: 13 }}>{cat.icon}</span>}
                        <span style={{ fontSize: 13, fontWeight: 700, color: ev.color }}>{ev.title}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 600,
                          color: sta.color,
                          background: `${sta.color}18`,
                          border: `1px solid ${sta.color}40`,
                          borderRadius: 6, padding: '1px 7px',
                          marginLeft: 4,
                        }}>
                          {sta.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted }}>
                        {String(startH).padStart(2,'0')}:{String(startM).padStart(2,'0')} – {String(endH).padStart(2,'0')}:{String(endM).padStart(2,'0')}
                        {carNames.length > 0 && <span style={{ marginLeft: 8 }}>🏎️ {carNames.join(', ')}</span>}
                      </div>
                      {ev.description && (
                        <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 3 }}>{ev.description}</div>
                      )}
                      {ev.result?.position && (
                        <div style={{ fontSize: 11, color: C.green, marginTop: 3, fontWeight: 600 }}>
                          🏆 {ev.result.position}{ev.result.points ? ` · ${ev.result.points} pts` : ''}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT PILL
   ═══════════════════════════════════════════════════════════════════ */

function EventPill({ ev, C, onClick }) {
  const cat = CATEGORY_OPTIONS.find((c) => c.value === ev.category);
  return (
    <div
      onClick={onClick}
      style={{
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 10,
        background: `${ev.color}20`,
        color: ev.color,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        borderLeft: `3px solid ${ev.color}`,
        display: 'flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {statusDot(ev.status, 6)}
      {cat ? cat.icon + ' ' : ''}{ev.title}
    </div>
  );
}

const pillStyle = (color) => ({
  padding: '3px 10px',
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 600,
  background: `${color}22`,
  color,
  border: `1px solid ${color}44`,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
});

/* ═══════════════════════════════════════════════════════════════════
   AGENDA PANEL
   ═══════════════════════════════════════════════════════════════════ */

function AgendaPanel({ events, C, theme, onEditEvent, allProfiles = [] }) {
  const [expanded, setExpanded] = useState(true);
  const profiles = useMemo(() => allProfiles.length > 0 ? allProfiles : loadWorkspaceProfilesFallback(), [allProfiles]);

  const grouped = useMemo(() => {
    const map = new Map();
    events.forEach(ev => {
      const d = new Date(ev.start);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!map.has(key)) map.set(key, { date: d, events: [] });
      map.get(key).events.push(ev);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  const today = new Date();

  return (
    <div style={{
      ...theme.card,
      marginTop: 0,
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(x => !x)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}>Próximos Eventos</span>
          {events.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: `${C.accent}20`,
              color: C.accent,
              border: `1px solid ${C.accent}40`,
              borderRadius: 8, padding: '1px 8px',
            }}>
              {events.length}
            </span>
          )}
        </div>
        <span style={{ fontSize: 13, color: C.textMuted }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          {grouped.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: '24px 0', fontStyle: 'italic' }}>
              Nenhum evento próximo
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {grouped.map(([key, { date, events: dayEvs }]) => {
                const isPast = date < today && !isSameDay(date, today);
                const isDay = isSameDay(date, today);
                return (
                  <div key={key} style={{ marginBottom: 14 }}>
                    {/* Data */}
                    <div style={{
                      fontSize: 11, fontWeight: 700,
                      color: isDay ? C.accent : isPast ? C.textMuted : C.textSecondary,
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                      marginBottom: 6,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      {isDay && <span style={{ color: C.accent }}>● HOJE —</span>}
                      {date.getDate()} {MONTHS_SHORT[date.getMonth()]} {date.getFullYear()} · {WEEKDAYS_PT[date.getDay()]}
                    </div>

                    {/* Eventos do dia */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 12, borderLeft: `2px solid ${isDay ? C.accent : C.border}40` }}>
                      {dayEvs.map(ev => {
                        const cat = CATEGORY_OPTIONS.find(c => c.value === ev.category);
                        const sta = getStatus(ev.status);
                        const carNames = (ev.carIds || [])
                          .map(id => profiles.find(p => p.id === id)?.name)
                          .filter(Boolean);
                        const startH = new Date(ev.start).getHours();
                        const startM = new Date(ev.start).getMinutes();
                        return (
                          <div
                            key={ev.id}
                            onClick={() => onEditEvent(ev)}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: 10,
                              padding: '8px 12px',
                              background: `${ev.color}10`,
                              borderLeft: `3px solid ${ev.color}`,
                              borderRadius: '0 6px 6px 0',
                              cursor: 'pointer',
                              transition: 'background 0.15s',
                            }}
                          >
                            <span style={{ fontSize: 16, flexShrink: 0 }}>{cat?.icon || '📌'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: ev.color }}>{ev.title}</span>
                                <span style={{
                                  fontSize: 10, fontWeight: 600,
                                  color: sta.color,
                                  background: `${sta.color}18`,
                                  border: `1px solid ${sta.color}40`,
                                  borderRadius: 5, padding: '1px 6px',
                                }}>
                                  {sta.label}
                                </span>
                                {ev.isMultiDay && (
                                  <span style={{ fontSize: 10, color: C.textMuted, fontStyle: 'italic' }}>multi-dia</span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <span>
                                  {String(startH).padStart(2,'0')}:{String(startM).padStart(2,'0')}
                                </span>
                                {carNames.length > 0 && (
                                  <span>🏎️ {carNames.join(', ')}</span>
                                )}
                                {ev.trackId && (() => {
                                  const track = TRACK_DATABASE.find(t => t.id === ev.trackId);
                                  return track ? <span>📍 {track.name}</span> : null;
                                })()}
                              </div>
                              {ev.result?.position && (
                                <div style={{ fontSize: 11, color: C.green, marginTop: 2, fontWeight: 600 }}>
                                  🏆 {ev.result.position}{ev.result.points ? ` · ${ev.result.points} pts` : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT MODAL
   ═══════════════════════════════════════════════════════════════════ */

function EventModal({ event, onChange, onSave, onDelete, onClose, C, theme, IB, allProfiles = [] }) {
  const set = (k) => (e) => onChange({ ...event, [k]: e.target ? e.target.value : e });
  const setNested = (k, field) => (e) => onChange({
    ...event,
    [k]: { ...(event[k] || {}), [field]: e.target.value },
  });

  const profiles = useMemo(() => allProfiles.length > 0 ? allProfiles : loadWorkspaceProfilesFallback(), [allProfiles]);
  const isPast = event.start && new Date(event.start) < new Date();

  const toggleCar = (profileId) => {
    const current = event.carIds || [];
    const next = current.includes(profileId)
      ? current.filter(id => id !== profileId)
      : [...current, profileId];
    onChange({ ...event, carIds: next });
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...theme.card,
          maxWidth: 520, width: '92%', margin: 0,
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={theme.cardTitle}>{event.id ? 'Editar Evento' : 'Novo Evento'}</div>

        {/* Título */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Título *</label>
          <input style={IB} value={event.title} onChange={set('title')} placeholder="Nome do evento" autoFocus />
        </div>

        {/* Categoria + Status */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Categoria</label>
            <select style={{ ...IB, cursor: 'pointer' }} value={event.category} onChange={set('category')}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Status</label>
            <select style={{ ...IB, cursor: 'pointer' }} value={event.status || 'planejado'} onChange={set('status')}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Carros participantes */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 6 }}>
            🏎️ Carros participantes
          </label>
          {profiles.length === 0 ? (
            <div style={{
              fontSize: 11, color: C.textMuted, fontStyle: 'italic',
              padding: '8px 10px', background: `${C.border}20`,
              borderRadius: 6, border: `1px dashed ${C.border}`,
            }}>
              Nenhum carro cadastrado na tab Carros
            </div>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '8px 10px',
              background: `${C.border}10`,
              borderRadius: 6,
              border: `1px solid ${C.border}40`,
              maxHeight: 160, overflowY: 'auto',
            }}>
              {profiles.map(p => {
                const checked = (event.carIds || []).includes(p.id);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      cursor: 'pointer', fontSize: 12,
                      color: checked ? C.textPrimary : C.textSecondary,
                      padding: '3px 4px', borderRadius: 4,
                      background: checked ? `${C.accent}12` : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCar(p.id)}
                      style={{ accentColor: C.accent, cursor: 'pointer' }}
                    />
                    🏎️ {p.name}
                  </label>
                );
              })}
            </div>
          )}
          {(event.carIds || []).length > 0 && (
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4, fontStyle: 'italic' }}>
              ✓ Uma pasta "{event.title || 'Evento'}" será criada no perfil de cada carro selecionado.
            </div>
          )}
        </div>

        {/* Início / Fim */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Início</label>
            <input type="datetime-local" style={IB} value={event.start} onChange={set('start')} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Fim</label>
            <input type="datetime-local" style={IB} value={event.end} onChange={set('end')} />
          </div>
        </div>

        {/* Multi-dia */}
        <div style={{ marginBottom: 10 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', fontSize: 12, color: C.textSecondary,
          }}>
            <input
              type="checkbox"
              checked={!!event.isMultiDay}
              onChange={(e) => onChange({ ...event, isMultiDay: e.target.checked })}
              style={{ accentColor: C.accent }}
            />
            Evento multi-dia
          </label>
          {event.isMultiDay && (
            <div style={{ marginTop: 6 }}>
              <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Data de término</label>
              <input
                type="date"
                style={IB}
                value={event.endDate || ''}
                onChange={set('endDate')}
              />
            </div>
          )}
        </div>

        {/* Recorrência (apenas para novos eventos) */}
        {!event.id && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Repetição</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                style={{ ...IB, cursor: 'pointer', flex: 2 }}
                value={event.recurrence?.type || 'none'}
                onChange={(e) => onChange({ ...event, recurrence: { ...(event.recurrence || {}), type: e.target.value } })}
              >
                {RECURRENCE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {(event.recurrence?.type && event.recurrence.type !== 'none') && (
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    style={{ ...IB }}
                    value={event.recurrence?.count || 4}
                    onChange={(e) => onChange({ ...event, recurrence: { ...(event.recurrence || {}), count: parseInt(e.target.value, 10) || 4 } })}
                    min={2} max={52}
                    title="Número de repetições"
                    placeholder="Qtd"
                  />
                </div>
              )}
            </div>
            {(event.recurrence?.type && event.recurrence.type !== 'none') && (
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, fontStyle: 'italic' }}>
                Serão criados {event.recurrence?.count || 4} eventos {event.recurrence?.type === 'weekly' ? 'semanais' : event.recurrence?.type === 'biweekly' ? 'quinzenais' : 'mensais'}.
              </div>
            )}
          </div>
        )}

        {/* Descrição */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Descrição</label>
          <textarea
            style={{ ...IB, minHeight: 60, resize: 'vertical' }}
            value={event.description}
            onChange={set('description')}
            placeholder="Detalhes, local, notas..."
          />
        </div>

        {/* Pista & Regulamento */}
        {(event.category === 'corrida' || event.category === 'treino') && (
          <div style={{
            marginBottom: 12, padding: '10px 12px',
            background: `${C.cyan}08`, border: `1px solid ${C.cyan}25`,
            borderRadius: 8,
          }}>
            <label style={{ fontSize: 11, color: C.cyan, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              Pista &amp; Regulamento
            </label>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 2 }}>Pista</label>
              <select style={{ ...IB, cursor: 'pointer' }} value={event.trackId || ''} onChange={set('trackId')}>
                <option value="">— Selecionar pista —</option>
                {TRACK_DATABASE.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            {event.category === 'corrida' && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 100px' }}>
                    <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 2 }}>Voltas da corrida</label>
                    <input type="number" style={IB} value={event.raceLaps || ''} onChange={set('raceLaps')} placeholder="Ex: 30" />
                  </div>
                  <div style={{ flex: '1 1 100px' }}>
                    <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 2 }}>Pit stops obrigatórios</label>
                    <input type="number" style={IB} value={event.mandatoryPitStops || ''} onChange={set('mandatoryPitStops')} placeholder="Ex: 1" />
                  </div>
                  <div style={{ flex: '1 1 100px' }}>
                    <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 2 }}>Stint mínimo (voltas)</label>
                    <input type="number" style={IB} value={event.minStintLaps || ''} onChange={set('minStintLaps')} placeholder="Ex: 8" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 100px' }}>
                    <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 2 }}>Tempo mín. pit (s)</label>
                    <input type="number" style={IB} value={event.minPitTime || ''} onChange={set('minPitTime')} placeholder="Ex: 25" />
                  </div>
                  <div style={{ flex: '1 1 130px' }}>
                    <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 2 }}>Restrição de pneu</label>
                    <input style={IB} value={event.tireRestriction || ''} onChange={set('tireRestriction')} placeholder="Ex: mín. 2 compostos" />
                  </div>
                  <div style={{ flex: '1 1 130px' }}>
                    <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 2 }}>Restrição de combustível</label>
                    <input style={IB} value={event.fuelRestriction || ''} onChange={set('fuelRestriction')} placeholder="Ex: máx. 110L total" />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Resultado pós-evento */}
        {isPast && (event.category === 'corrida' || event.category === 'treino') && (
          <div style={{
            marginBottom: 12, padding: '10px 12px',
            background: `${C.green}08`, border: `1px solid ${C.green}25`,
            borderRadius: 8,
          }}>
            <label style={{ fontSize: 11, color: C.green, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              🏆 Resultado do Evento
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 2 }}>Posição final</label>
                <input
                  style={IB}
                  value={event.result?.position || ''}
                  onChange={setNested('result', 'position')}
                  placeholder="Ex: 1º, P3, DNF..."
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 2 }}>Pontos</label>
                <input
                  type="number"
                  style={IB}
                  value={event.result?.points || ''}
                  onChange={setNested('result', 'points')}
                  placeholder="Ex: 25"
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textMuted, display: 'block', marginBottom: 2 }}>Observações</label>
              <textarea
                style={{ ...IB, minHeight: 50, resize: 'vertical' }}
                value={event.result?.notes || ''}
                onChange={setNested('result', 'notes')}
                placeholder="Notas sobre o desempenho, incidentes, desgaste..."
              />
            </div>
          </div>
        )}

        {/* Cor */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 6 }}>Cor</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {EVENT_COLORS.map((color) => (
              <div
                key={color}
                onClick={() => onChange({ ...event, color })}
                style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: color, cursor: 'pointer',
                  border: event.color === color ? '3px solid white' : '3px solid transparent',
                  boxShadow: event.color === color ? `0 0 0 2px ${color}` : 'none',
                  transition: 'all 0.15s',
                }}
              />
            ))}
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {event.id && (
            <button
              onClick={() => { if (window.confirm('Excluir este evento?')) onDelete(event.id); }}
              style={{
                padding: '8px 16px', borderRadius: 6,
                border: `1px solid ${C.accent}`, background: 'transparent',
                color: C.accent, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', marginRight: 'auto',
              }}
            >
              Excluir
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 6,
              border: `1px solid ${C.border}`, background: 'transparent',
              color: C.textSecondary, fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(event)}
            style={{
              padding: '8px 16px', borderRadius: 6,
              border: 'none', background: C.accent,
              color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
