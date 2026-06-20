import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { OnboardingPanel } from '@/components/tabs/onboard/OnboardingTab';
import { PrintFooter } from '@/components/common';

function globalBtnStyle(COLORS) {
  return {
    background: 'transparent',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    color: COLORS.textSecondary,
    fontSize: 11,
    padding: '4px 9px',
    cursor: 'pointer',
    fontWeight: 600,
  };
}

export default function ReplayTab() {
  const [globalPlaying, setGlobalPlaying] = useState(false);
  const { colors: COLORS } = useTheme();

  const panel1Ref      = useRef(null);
  const panel2Ref      = useRef(null);
  const activePanelRef = useRef(null);

  /* ── Controles globais ────────────────────────────────────────────── */
  const globalPlay = useCallback(() => {
    panel1Ref.current?.play();
    panel2Ref.current?.play();
    setGlobalPlaying(true);
  }, []);

  const globalPause = useCallback(() => {
    panel1Ref.current?.pause();
    panel2Ref.current?.pause();
    setGlobalPlaying(false);
  }, []);

  const globalToggle = useCallback(() => {
    if (globalPlaying) globalPause(); else globalPlay();
  }, [globalPlaying, globalPlay, globalPause]);

  const globalSeek = useCallback((delta) => {
    panel1Ref.current?.seekRelative(delta);
    panel2Ref.current?.seekRelative(delta);
  }, []);

  /* ── Teclado ─────────────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e) {
      const el  = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (tag === 'BUTTON' && !el?.closest('[data-global-player]')) return;

      const delta = e.shiftKey ? 15 : 5;
      const ap = activePanelRef.current;
      const targetRef = ap === 1 ? panel1Ref : ap === 2 ? panel2Ref : null;

      if (e.code === 'Space') {
        e.preventDefault();
        if (targetRef) targetRef.current?.togglePlay();
        else           globalToggle();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (targetRef) targetRef.current?.seekRelative(delta);
        else           globalSeek(delta);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (targetRef) targetRef.current?.seekRelative(-delta);
        else           globalSeek(-delta);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [globalToggle, globalSeek]);

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Painéis ── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }} onMouseDown={() => { activePanelRef.current = 1; }}>
          <OnboardingPanel
            ref={panel1Ref}
            selfManaged
            replayMode
            videoOnlyMode
            label="Replay 1"
            accentColor="#4466ff"
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }} onMouseDown={() => { activePanelRef.current = 2; }}>
          <OnboardingPanel
            ref={panel2Ref}
            selfManaged
            replayMode
            videoOnlyMode
            label="Replay 2"
            accentColor="#ffaa00"
          />
        </div>
      </div>

      {/* ── Player Universal ── */}
      <div
        data-global-player="true"
        onMouseDown={() => { activePanelRef.current = null; }}
        style={{
          background: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: '18px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            textTransform: 'uppercase', color: COLORS.textMuted,
          }}>
            🎮 Controle Universal — ambas as câmeras
          </span>
          <span style={{ fontSize: 10, color: COLORS.textMuted, opacity: 0.6 }}>
            (← → Espaço)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => globalSeek(-15)} title="−15s (Shift+←)"
            style={{ ...globalBtnStyle(COLORS), fontSize: 13, padding: '8px 16px' }}>
            ◀◀ 15s
          </button>
          <button onClick={() => globalSeek(-5)} title="−5s (←)"
            style={{ ...globalBtnStyle(COLORS), fontSize: 13, padding: '8px 14px' }}>
            ◀ 5s
          </button>

          <button
            onClick={globalToggle}
            style={{
              background: globalPlaying ? '#cc2222' : '#4466ff',
              border: 'none', borderRadius: 50,
              color: '#fff', fontSize: 24,
              width: 62, height: 62,
              cursor: 'pointer', fontWeight: 700,
              boxShadow: `0 0 18px ${globalPlaying ? '#cc222266' : '#4466ff66'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {globalPlaying ? '⏸' : '▶'}
          </button>

          <button onClick={() => globalSeek(5)} title="+5s (→)"
            style={{ ...globalBtnStyle(COLORS), fontSize: 13, padding: '8px 14px' }}>
            5s ▶
          </button>
          <button onClick={() => globalSeek(15)} title="+15s (Shift+→)"
            style={{ ...globalBtnStyle(COLORS), fontSize: 13, padding: '8px 16px' }}>
            15s ▶▶
          </button>
        </div>
      </div>

      <PrintFooter />
    </div>
  );
}
