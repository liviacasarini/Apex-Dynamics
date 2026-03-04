import { COLORS } from '@/constants/colors';

export default function Header({ fileName, onNewSession }) {
  return (
    <header
      style={{
        padding: '16px 24px',
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(180deg, #111118 0%, #0a0a0f 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg, #e63946, #ff6b35)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          ⚡ RACE TELEMETRY
        </span>
        {fileName && (
          <span
            style={{
              fontSize: 12,
              color: COLORS.textMuted,
              padding: '4px 10px',
              background: COLORS.bgCard,
              borderRadius: 6,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {fileName}
          </span>
        )}
      </div>

      {onNewSession && (
        <button
          onClick={onNewSession}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            background: 'transparent',
            border: `1px solid ${COLORS.border}`,
            color: COLORS.textSecondary,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = COLORS.accent;
            e.target.style.color = COLORS.accent;
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = COLORS.border;
            e.target.style.color = COLORS.textSecondary;
          }}
        >
          📁 Nova Sessão
        </button>
      )}
    </header>
  );
}
