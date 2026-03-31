import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useColors } from '@/context/ThemeContext';
import { TABS } from '@/constants/tabs';

const TELEMETRY_ONLY = new Set(['laps', 'wot', 'report', 'track']);
const ORDER_KEY = 'rt_tab_order';

function loadOrder() {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const ids = TABS.map((t) => t.id);
    const filtered = saved.filter((id) => ids.includes(id));
    const missing  = ids.filter((id) => !filtered.includes(id));
    return [...filtered, ...missing];
  } catch { return null; }
}

function saveOrder(order) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* noop */ }
}

function ReorderModal({ order, onMove, onReset, onClose, COLORS }) {
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

export default function TabBar({ activeTab, onTabChange, isLoaded }) {
  const COLORS = useColors();
  const [order, setOrder] = useState(() => loadOrder() || TABS.map((t) => t.id));
  const [open,  setOpen]  = useState(false);
  const [dragOverId, setDragOverId] = useState(null);
  const dragId = useRef(null);

  function move(index, dir) {
    const next = [...order];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setOrder(next);
    saveOrder(next);
  }

  function reset() {
    const def = TABS.map((t) => t.id);
    setOrder(def);
    saveOrder(def);
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
    saveOrder(next);
    dragId.current = null;
    setDragOverId(null);
  }

  function handleDragEnd() {
    dragId.current = null;
    setDragOverId(null);
  }

  const orderedTabs = order.map((id) => TABS.find((t) => t.id === id)).filter(Boolean);
  const visibleTabs = isLoaded
    ? orderedTabs
    : orderedTabs.filter((t) => !TELEMETRY_ONLY.has(t.id));

  return (
    <>
      <nav style={{
        width: 200,
        minWidth: 200,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${COLORS.border}`,
        background: COLORS.bgCard,
        overflowY: 'auto',
        paddingTop: 8,
        paddingBottom: 8,
      }}>
        {visibleTabs.map((tab) => {
          const active   = activeTab === tab.id;
          const isDragOver = dragOverId === tab.id;
          return (
            <div
              key={tab.id}
              draggable
              onClick={() => onTabChange(tab.id)}
              onDragStart={() => handleDragStart(tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDrop={() => handleDrop(tab.id)}
              onDragEnd={handleDragEnd}
              style={{
                padding: '10px 16px',
                cursor: 'grab',
                fontSize: 13,
                color: active ? COLORS.accent : COLORS.textSecondary,
                borderLeft: active ? `3px solid ${COLORS.accent}` : '3px solid transparent',
                background: isDragOver
                  ? `${COLORS.accent}22`
                  : active ? `${COLORS.accent}12` : 'transparent',
                borderTop: isDragOver ? `2px solid ${COLORS.accent}` : '2px solid transparent',
                transition: 'background 0.1s, border 0.1s',
                fontWeight: active ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: 9,
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: 15, pointerEvents: 'none' }}>{tab.icon}</span>
              <span style={{ pointerEvents: 'none' }}>{tab.label}</span>
            </div>
          );
        })}

        {/* Botão reset ordem */}
        <div style={{ marginTop: 'auto', padding: '12px 12px 4px' }}>
          <button
            onClick={() => { reset(); }}
            title="Restaurar ordem padrão das abas"
            style={{
              width: '100%',
              background: 'transparent',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              color: COLORS.textMuted,
              cursor: 'pointer',
              fontSize: 12,
              padding: '6px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
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
        />
      )}
    </>
  );
}
