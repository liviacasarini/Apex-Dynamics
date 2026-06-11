import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useColors } from '@/context/ThemeContext';
import { getTabsForVehicle } from '@/constants/tabs';
import { isTabEditable, isComingSoon } from '@/license/entitlements';

const TELEMETRY_ONLY = new Set(['laps', 'wot', 'report', 'track']);
const ORDER_KEY_BASE = 'rt_tab_order';
const orderKey = (vt) => (vt === 'moto' ? `${ORDER_KEY_BASE}_moto` : vt === 'truck' ? `${ORDER_KEY_BASE}_truck` : ORDER_KEY_BASE);

function loadOrder(TABS, vt) {
  try {
    const raw = localStorage.getItem(orderKey(vt));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const ids = TABS.map((t) => t.id);
    const filtered = saved.filter((id) => ids.includes(id));
    const missing  = ids.filter((id) => !filtered.includes(id));
    return [...filtered, ...missing];
  } catch { return null; }
}

function saveOrder(order, vt) {
  try { localStorage.setItem(orderKey(vt), JSON.stringify(order)); } catch { /* noop */ }
}

function ReorderModal({ order, onMove, onReset, onClose, COLORS, TABS }) {
  return createPortal(
    /* Overlay */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Caixa pop-up */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 14,
          padding: '24px 28px',
          width: 320,
          boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>Ordem das abas</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Use ▲ ▼ para reordenar</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: COLORS.textMuted, fontSize: 18, lineHeight: 1, padding: '2px 6px',
            }}
          >✕</button>
        </div>

        {/* Lista */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {order.map((id, i) => {
            const tab = TABS.find((t) => t.id === id);
            if (!tab) return null;
            const first = i === 0;
            const last  = i === order.length - 1;
            return (
              <div key={id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                background: `${COLORS.border}22`,
              }}>
                <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{tab.icon}</span>
                <span style={{ flex: 1, fontSize: 13, color: COLORS.textSecondary }}>{tab.label}</span>
                <button
                  onClick={() => onMove(i, -1)}
                  disabled={first}
                  style={{
                    background: first ? 'transparent' : `${COLORS.border}44`,
                    border: 'none', borderRadius: 4, cursor: first ? 'default' : 'pointer',
                    color: first ? COLORS.textMuted + '30' : COLORS.textSecondary,
                    fontSize: 12, padding: '3px 7px', lineHeight: 1,
                  }}
                >▲</button>
                <button
                  onClick={() => onMove(i, 1)}
                  disabled={last}
                  style={{
                    background: last ? 'transparent' : `${COLORS.border}44`,
                    border: 'none', borderRadius: 4, cursor: last ? 'default' : 'pointer',
                    color: last ? COLORS.textMuted + '30' : COLORS.textSecondary,
                    fontSize: 12, padding: '3px 7px', lineHeight: 1,
                  }}
                >▼</button>
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            onClick={onReset}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 7,
              background: 'transparent', border: `1px solid ${COLORS.border}`,
              color: COLORS.textMuted, fontSize: 12, cursor: 'pointer',
            }}
          >
            Restaurar padrão
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 7,
              background: COLORS.accent, border: 'none',
              color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function TabBar({ activeTab, onTabChange, isLoaded, vehicleType = 'car' }) {
  const COLORS = useColors();
  const TABS = getTabsForVehicle(vehicleType);
  const [order, setOrder] = useState(() => loadOrder(TABS, vehicleType) || TABS.map((t) => t.id));
  useEffect(() => {
    setOrder(loadOrder(TABS, vehicleType) || TABS.map((t) => t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleType]);
  const [open,  setOpen]  = useState(false);
  const [dragOverId, setDragOverId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const dragId = useRef(null);

  function move(index, dir) {
    const next = [...order];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setOrder(next);
    saveOrder(next, vehicleType);
  }

  function reset() {
    const def = TABS.map((t) => t.id);
    setOrder(def);
    saveOrder(def, vehicleType);
  }

  function handleDragStart(id) {
    dragId.current = id;
  }

  function handleDragOver(e, id) {
    e.preventDefault();
    if (id !== dragId.current) setDragOverId(id);
  }

  function handleDrop(targetId) {
    if (!dragId.current || dragId.current === targetId) {
      setDragOverId(null);
      return;
    }
    const next = [...order];
    const fromIdx = next.indexOf(dragId.current);
    const toIdx   = next.indexOf(targetId);
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragId.current);
    setOrder(next);
    saveOrder(next, vehicleType);
    dragId.current = null;
    setDragOverId(null);
  }

  function handleDragEnd() {
    dragId.current = null;
    setDragOverId(null);
  }

  const vehicleTabs = getTabsForVehicle(vehicleType);
  const orderedTabs = order.map((id) => vehicleTabs.find((t) => t.id === id)).filter(Boolean);
  const visibleTabs = isLoaded
    ? orderedTabs
    : orderedTabs.filter((t) => !TELEMETRY_ONLY.has(t.id));

  return (
    <>
      <nav style={{
        width: 206,
        minWidth: 206,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${COLORS.border}`,
        background: `linear-gradient(180deg, ${COLORS.bgCard} 0%, ${COLORS.bg} 130%)`,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '10px 8px',
      }}>
        <div style={{
          fontFamily: "'Rajdhani', 'Inter', sans-serif",
          fontSize: 10.5, fontWeight: 700, letterSpacing: '2.5px',
          textTransform: 'uppercase', color: COLORS.textMuted,
          padding: '2px 12px 8px',
          userSelect: 'none',
        }}>
          Navegação
        </div>

        {visibleTabs.map((tab) => {
          const active     = activeTab === tab.id;
          const isDragOver = dragOverId === tab.id;
          const hovered    = hoverId === tab.id;
          return (
            <div
              key={tab.id}
              draggable
              onClick={() => onTabChange(tab.id)}
              onDragStart={() => handleDragStart(tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDrop={() => handleDrop(tab.id)}
              onDragEnd={handleDragEnd}
              onMouseEnter={() => setHoverId(tab.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                position: 'relative',
                padding: '8.5px 12px',
                marginBottom: 1,
                borderRadius: 9,
                cursor: 'grab',
                fontSize: 13,
                color: active ? COLORS.accent : hovered ? COLORS.textPrimary : COLORS.textSecondary,
                background: isDragOver
                  ? `${COLORS.accent}22`
                  : active
                    ? (COLORS.accentSoft || `${COLORS.accent}12`)
                    : hovered ? `${COLORS.border}44` : 'transparent',
                boxShadow: active ? `inset 0 0 0 1px ${COLORS.accent}33, 0 4px 14px -10px ${COLORS.accentGlow}` : 'none',
                borderTop: isDragOver ? `2px solid ${COLORS.accent}` : '2px solid transparent',
                transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
                fontWeight: active ? 700 : 500,
                display: 'flex', alignItems: 'center', gap: 9,
                userSelect: 'none',
              }}
            >
              {/* Barra accent à esquerda quando ativo */}
              {active && (
                <span style={{
                  position: 'absolute', left: 0, top: '22%', bottom: '22%', width: 3,
                  borderRadius: 3,
                  background: `linear-gradient(180deg, ${COLORS.accent}, ${COLORS.accentDark || COLORS.accent})`,
                  boxShadow: `0 0 8px ${COLORS.accentGlow}`,
                  pointerEvents: 'none',
                }} />
              )}
              <span style={{
                fontSize: 14, pointerEvents: 'none',
                width: 24, height: 24, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6,
                background: active ? `${COLORS.accent}1a` : `${COLORS.border}55`,
                filter: active ? 'none' : 'saturate(0.85)',
                transition: 'background 0.15s',
              }}>{tab.icon}</span>
              <span style={{
                pointerEvents: 'none', flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                letterSpacing: '0.2px',
              }}>{tab.label}</span>
              {isTabEditable(tab.id) ? null : isComingSoon(tab.id) ? (
                <span style={{ pointerEvents: 'none', fontSize: 11, opacity: 0.8 }}
                      title="Funcionalidade futura — em breve">🔜</span>
              ) : (
                <span style={{ pointerEvents: 'none', fontSize: 11, opacity: 0.7 }}
                      title="Aba não incluída no seu plano (somente leitura)">🔒</span>
              )}
            </div>
          );
        })}

        {/* Botão reset ordem */}
        <div style={{ marginTop: 'auto', padding: '12px 4px 2px' }}>
          <button
            onClick={() => { reset(); }}
            title="Restaurar ordem padrão das abas"
            style={{
              width: '100%',
              background: 'transparent',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              color: COLORS.textMuted,
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 600,
              padding: '7px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = COLORS.borderLight;
              e.currentTarget.style.color = COLORS.textSecondary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = COLORS.border;
              e.currentTarget.style.color = COLORS.textMuted;
            }}
          >
            ↺ Restaurar ordem
          </button>
        </div>
      </nav>

      {open && (
        <ReorderModal
          order={order}
          onMove={move}
          onReset={reset}
          onClose={() => setOpen(false)}
          COLORS={COLORS}
          TABS={TABS}
        />
      )}
    </>
  );
}
