import { useRef, useState, useCallback } from 'react';
import { useColors, useTheme } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { FILE_ACCEPT_STRING } from '@/core/fileRouter';

const UploadIcon = ({ color }) => (
  <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const WrenchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

export default function UploadView({ onLoad, onPreparation }) {
  const COLORS = useColors();
  const { isDark } = useTheme();
  const theme = makeTheme(COLORS);
  const fileRef = useRef();
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      setLoading(true);
      setError(null);

      try {
        await onLoad(file);
      } catch (err) {
        setError(err.message || 'Erro ao processar arquivo');
      } finally {
        setLoading(false);
      }
    },
    [onLoad]
  );

  const lit = dragging || hovering;

  return (
    /* Tela cheia, sem scroll */
    <div style={{
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    }}>
      {/* Glow ambiente atrás do conteúdo */}
      <div style={{
        position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)',
        width: 720, height: 380, borderRadius: '50%',
        background: `radial-gradient(ellipse, ${COLORS.accent}${isDark ? '14' : '0d'} 0%, transparent 65%)`,
        pointerEvents: 'none',
        filter: 'blur(8px)',
      }} />

      <div className="apex-tab-content" style={{ width: '100%', maxWidth: 700, padding: '0 24px', position: 'relative' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <img
            src={isDark ? '/apex-logo.png' : '/apex-logo-light.png'}
            alt="Apex Dynamics"
            style={{ width: '68%', maxWidth: 370, height: 'auto', objectFit: 'contain', marginBottom: 2 }}
          />
          <p style={{
            color: COLORS.textSecondary, fontSize: 13.5, margin: 0,
            letterSpacing: '0.3px',
          }}>
            Importe dados de telemetria — CSV, MoTec LD, Bosch LOG, TDL e mais
          </p>
        </div>

        {/* Drop zone */}
        <div
          style={{
            position: 'relative',
            border: `2px dashed ${lit ? COLORS.accent : COLORS.borderLight}`,
            borderRadius: 18,
            padding: '44px 40px',
            textAlign: 'center',
            cursor: loading ? 'wait' : 'pointer',
            transition: 'all 0.25s ease',
            background: dragging
              ? (COLORS.accentSoft || `${COLORS.accent}0c`)
              : `linear-gradient(180deg, ${COLORS.bgCard} 0%, ${COLORS.bg} 180%)`,
            boxShadow: lit
              ? `0 0 0 4px ${COLORS.accent}14, 0 18px 48px -22px ${COLORS.accentGlow}`
              : COLORS.shadowCard,
            transform: dragging ? 'scale(1.01)' : 'scale(1)',
          }}
          onClick={() => !loading && fileRef.current?.click()}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files[0]);
          }}
        >
          {loading ? (
            <>
              <div style={{
                width: 38, height: 38, margin: '0 auto 16px',
                border: `3px solid ${COLORS.border}`,
                borderTopColor: COLORS.accent,
                borderRadius: '50%',
                animation: 'apexSpin 0.8s linear infinite',
              }} />
              <div style={{ fontSize: 16, fontWeight: 600 }}>Processando…</div>
            </>
          ) : (
            <>
              <div style={{
                width: 72, height: 72, margin: '0 auto 16px',
                borderRadius: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: lit ? (COLORS.accentSoft || `${COLORS.accent}12`) : `${COLORS.border}55`,
                transition: 'all 0.25s ease',
              }}>
                <UploadIcon color={lit ? COLORS.accent : COLORS.textSecondary} />
              </div>
              <div style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 7, letterSpacing: '0.2px' }}>
                Arraste seu arquivo de telemetria aqui
              </div>
              <div style={{ color: COLORS.textMuted, fontSize: 13 }}>
                ou clique para selecionar •{' '}
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                  CSV, LD, LOG, TDL, DLF
                </span>
              </div>
            </>
          )}

          <input
            ref={fileRef}
            type="file"
            accept={FILE_ACCEPT_STRING}
            style={{ display: 'none' }}
            onClick={(e) => { e.target.value = ''; }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 12,
            padding: '12px 16px',
            borderRadius: 10,
            background: `${COLORS.accent}12`,
            border: `1px solid ${COLORS.accent}40`,
            color: COLORS.accent,
            fontSize: 13,
            whiteSpace: 'pre-line',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Supported formats */}
        <div style={{ marginTop: 16, ...theme.card }}>
          <div style={theme.cardTitle}>Formatos Suportados</div>

          {/* Native formats */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {[
              { label: 'CSV', desc: 'ProTune / MoTec / AiM / Genérico' },
              { label: 'LD',  desc: 'MoTec i2' },
              { label: 'LOG', desc: 'Bosch WinDarab' },
              { label: 'TDL', desc: 'Telemetry Data Log' },
              { label: 'DLF', desc: 'ProTune Data Log File' },
            ].map((f) => (
              <span key={f.label} style={{ ...theme.badge(COLORS.green), fontFamily: "'JetBrains Mono', monospace" }} title={f.desc}>
                .{f.label}
              </span>
            ))}
          </div>

          {/* Proprietary formats */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {[
              { label: 'XRK', desc: 'AiM — exportar CSV via Race Studio' },
              { label: 'FTL', desc: 'FuelTech — exportar CSV via FTManager' },
              { label: 'BIN', desc: 'Bosch — exportar CSV via WinDarab' },
            ].map((f) => (
              <span key={f.label} style={{ ...theme.badge(COLORS.yellow), fontFamily: "'JetBrains Mono', monospace" }} title={f.desc}>
                .{f.label}
              </span>
            ))}
          </div>

          <p style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 0, lineHeight: 1.5 }}>
            Formatos nativos (verde) abrem diretamente. Formatos proprietários (amarelo) exibem
            instruções para exportar como CSV.
            O parser auto-detecta separador ({';'}{' '},{','}{' '}tab) e formato decimal.
            Canais de diferentes sistemas (ProTune, MoTec, Bosch) são mapeados automaticamente.
          </p>
        </div>

        {/* Separator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 14px' }}>
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${COLORS.border})` }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: COLORS.textMuted }}>ou</span>
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${COLORS.border}, transparent)` }} />
        </div>

        {/* Preparation entry */}
        <button
          onClick={onPreparation}
          style={{
            width: '100%',
            padding: '13px 24px',
            borderRadius: 12,
            border: `1px solid ${COLORS.border}`,
            background: 'transparent',
            color: COLORS.textSecondary,
            fontSize: 13.5,
            fontWeight: 600,
            letterSpacing: '0.3px',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = COLORS.blue;
            e.currentTarget.style.color = COLORS.blue;
            e.currentTarget.style.background = `${COLORS.blue}0d`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = COLORS.border;
            e.currentTarget.style.color = COLORS.textSecondary;
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <WrenchIcon /> Preparação — Entrar sem telemetria
        </button>

      </div>
    </div>
  );
}
