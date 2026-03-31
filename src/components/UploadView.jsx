import { useRef, useState, useCallback } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { FILE_ACCEPT_STRING } from '@/core/fileRouter';

export default function UploadView({ onLoad, onPreparation }) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);
  const fileRef = useRef();
  const [dragging, setDragging] = useState(false);
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

  return (
    /* Tela cheia, sem scroll */
    <div style={{
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 700, padding: '0 24px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/apex-logo.png"
            alt="Apex Dynamics"
            style={{ width: '70%', maxWidth: 380, height: 'auto', objectFit: 'contain', marginBottom: 0 }}
          />
          <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: 0 }}>
            Importe dados de telemetria — CSV, MoTec LD, Bosch LOG, TDL e mais
          </p>
        </div>

        {/* Drop zone */}
        <div
          style={{
            border: `2px dashed ${dragging ? COLORS.accent : COLORS.border}`,
            borderRadius: 16,
            padding: '48px 40px',
            textAlign: 'center',
            cursor: loading ? 'wait' : 'pointer',
            transition: 'all 0.3s',
            background: dragging ? `${COLORS.accent}08` : COLORS.bgCard,
          }}
          onClick={() => !loading && fileRef.current?.click()}
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
              <div style={{ fontSize: 36, marginBottom: 16, animation: 'spin 1s linear infinite' }}>⏳</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Processando...</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36, marginBottom: 16 }}>📁</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                Arraste seu arquivo de telemetria aqui
              </div>
              <div style={{ color: COLORS.textMuted, fontSize: 13 }}>
                ou clique para selecionar • CSV, LD, LOG, TDL, DLF
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
            borderRadius: 8,
            background: `${COLORS.accent}15`,
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
              <span key={f.label} style={theme.badge(COLORS.green)} title={f.desc}>
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
              <span key={f.label} style={theme.badge(COLORS.yellow)} title={f.desc}>
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
          <div style={{ flex: 1, height: 1, background: COLORS.border }} />
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>ou</span>
          <div style={{ flex: 1, height: 1, background: COLORS.border }} />
        </div>

        {/* Preparation entry */}
        <button
          onClick={onPreparation}
          style={{
            width: '100%',
            padding: '14px 24px',
            borderRadius: 10,
            border: `1px solid ${COLORS.border}`,
            background: 'transparent',
            color: COLORS.textSecondary,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = COLORS.blue;
            e.currentTarget.style.color = COLORS.blue;
            e.currentTarget.style.background = `${COLORS.blue}10`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = COLORS.border;
            e.currentTarget.style.color = COLORS.textSecondary;
            e.currentTarget.style.background = 'transparent';
          }}
        >
          🔧 Preparação — Entrar sem telemetria
        </button>

      </div>
    </div>
  );
}
