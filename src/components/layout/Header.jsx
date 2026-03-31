import { useRef, useState } from 'react';
import { useColors, useTheme } from '@/context/ThemeContext';

export default function Header({ fileName, onNewSession, onLoad, onLogout, onProfilesToggle, profilesOpen }) {
  const COLORS = useColors();
  const { isDark, toggleTheme } = useTheme();
  const fileRef = useRef();
  const [loadError, setLoadError] = useState(null);
  return (
    <header
      style={{
        padding: '16px 24px',
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: isDark
          ? 'linear-gradient(180deg, #111118 0%, #0a0a0f 100%)'
          : 'linear-gradient(180deg, #ffffff 0%, #f4f4f8 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <img
          src={isDark ? './apex-logo.png' : './apex-logo-light.png'}
          alt="Apex Dynamics"
          style={{ height: 36, objectFit: 'contain' }}
        />
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Toggle dark/light */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Modo claro' : 'Modo escuro'}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 14,
            cursor: 'pointer',
            background: 'transparent',
            border: `1px solid ${COLORS.border}`,
            color: COLORS.textSecondary,
            transition: 'all 0.2s',
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = COLORS.accent;
            e.currentTarget.style.color = COLORS.accent;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = COLORS.border;
            e.currentTarget.style.color = COLORS.textSecondary;
          }}
        >
          {isDark ? '☀️' : '🌙'}
        </button>

        {onProfilesToggle && (
          <button
            onClick={onProfilesToggle}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              background: profilesOpen ? `${COLORS.accent}18` : 'transparent',
              border: `1px solid ${profilesOpen ? COLORS.accent : COLORS.border}`,
              color: profilesOpen ? COLORS.accent : COLORS.textSecondary,
              fontWeight: profilesOpen ? 700 : 400,
              transition: 'all 0.2s',
            }}
          >
            👤 Perfis
          </button>
        )}
        {onLoad && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.CSV,.txt,.ld,.log,.tdl,.dlf,.DLF"
              data-file-input="telemetry"
              style={{ display: 'none' }}
              onClick={(e) => { e.target.value = ''; }}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                setLoadError(null);
                try {
                  await onLoad(file);
                } catch (err) {
                  setLoadError(err.message || 'Erro ao carregar arquivo');
                }
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button
                onClick={() => { setLoadError(null); fileRef.current?.click(); }}
                title="Trocar arquivo de telemetria"
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  background: 'transparent',
                  border: `1px solid ${loadError ? COLORS.accent : COLORS.border}`,
                  color: loadError ? COLORS.accent : COLORS.textSecondary,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.accent;
                  e.currentTarget.style.color = COLORS.accent;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = loadError ? COLORS.accent : COLORS.border;
                  e.currentTarget.style.color = loadError ? COLORS.accent : COLORS.textSecondary;
                }}
              >
                📂 Trocar Arquivo
              </button>
              {loadError && (
                <span style={{
                  fontSize: 11,
                  color: COLORS.accent,
                  maxWidth: 200,
                  textAlign: 'right',
                  lineHeight: 1.3,
                }}>
                  ⚠️ {loadError}
                </span>
              )}
            </div>
          </>
        )}
        {onLogout && (
          <button
            onClick={onLogout}
            title="Sair da conta"
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
              e.currentTarget.style.borderColor = COLORS.accent;
              e.currentTarget.style.color = COLORS.accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = COLORS.border;
              e.currentTarget.style.color = COLORS.textSecondary;
            }}
          >
            🚪 Log Out
          </button>
        )}
      </div>
    </header>
  );
}
