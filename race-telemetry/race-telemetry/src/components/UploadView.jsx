import { useRef, useState, useCallback } from 'react';
import { COLORS } from '@/constants/colors';
import { theme } from '@/styles/theme';

export default function UploadView({ onLoad }) {
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
    <div style={{ maxWidth: 700, margin: '80px auto', padding: '0 24px' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏎️</div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 800,
            marginBottom: 8,
            background:
              'linear-gradient(135deg, #e63946, #ff6b35, #ffd166)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Race Telemetry Analyzer
        </h1>
        <p style={{ color: COLORS.textSecondary, fontSize: 14 }}>
          Importe dados da ProTune, MoTec, AiM ou qualquer CSV de telemetria
        </p>
      </div>

      {/* Drop zone */}
      <div
        style={{
          border: `2px dashed ${dragging ? COLORS.accent : COLORS.border}`,
          borderRadius: 16,
          padding: '80px 40px',
          textAlign: 'center',
          cursor: loading ? 'wait' : 'pointer',
          transition: 'all 0.3s',
          background: dragging ? `${COLORS.accent}08` : COLORS.bgCard,
        }}
        onClick={() => !loading && fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
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
              Arraste seu arquivo CSV aqui
            </div>
            <div style={{ color: COLORS.textMuted, fontSize: 13 }}>
              ou clique para selecionar • Suporta ProTune, MoTec, AiM
            </div>
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.CSV,.txt,.ld"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            borderRadius: 8,
            background: `${COLORS.accent}15`,
            border: `1px solid ${COLORS.accent}40`,
            color: COLORS.accent,
            fontSize: 13,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Supported formats */}
      <div style={{ marginTop: 32, ...theme.card }}>
        <div style={theme.cardTitle}>Formatos Suportados</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {['ProTune CSV', 'MoTec CSV Export', 'AiM CSV', 'Custom CSV'].map(
            (f) => (
              <span key={f} style={theme.badge(COLORS.green)}>
                {f}
              </span>
            )
          )}
        </div>
        <p
          style={{
            color: COLORS.textMuted,
            fontSize: 12,
            marginTop: 12,
            lineHeight: 1.5,
          }}
        >
          O parser auto-detecta separador ({';'}{'  '},{','}{' '}tab) e formato
          decimal (vírgula ou ponto). Canais são mapeados automaticamente.
        </p>
      </div>
    </div>
  );
}
