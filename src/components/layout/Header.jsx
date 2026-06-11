import { useRef, useState } from 'react';
import { useColors, useTheme } from '@/context/ThemeContext';

/* ─── Ícones SVG ─────────────────────────────────────────────────────── */

const ic = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const RadioIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...ic}>
    <circle cx="12" cy="12" r="2"/>
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>
  </svg>
);

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...ic}>
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...ic}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...ic}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...ic}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...ic}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const FileIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" {...ic}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

/* ─── Botão padrão do header ─────────────────────────────────────────── */

function HeaderButton({ onClick, title, children, highlight = false, badge = 0, COLORS }) {
  const [hover, setHover] = useState(false);
  const lit = highlight || hover;
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 7,
        height: 32, padding: '0 13px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: highlight ? 700 : 600,
        letterSpacing: '0.3px',
        cursor: 'pointer',
        background: highlight
          ? (COLORS.accentSoft || `${COLORS.accent}15`)
          : hover ? `${COLORS.border}55` : 'transparent',
        border: `1px solid ${lit ? COLORS.accent : COLORS.border}`,
        color: lit ? COLORS.accent : COLORS.textSecondary,
        boxShadow: highlight ? `0 0 14px -4px ${COLORS.accentGlow}` : 'none',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
      {badge > 0 && (
        <span style={{
          position: 'absolute', top: -7, right: -7,
          background: COLORS.accent, color: '#fff',
          borderRadius: 9, minWidth: 18, height: 18, padding: '0 4px',
          fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
          boxShadow: `0 2px 8px ${COLORS.accentGlow}`,
        }}>
          {Math.min(badge, 99)}
        </span>
      )}
    </button>
  );
}

/* ─── Header ─────────────────────────────────────────────────────────── */

export default function Header({ fileName, onNewSession, onLoad, onLogout, onProfilesToggle, profilesOpen, teamPending = 0, teamUnread = 0, onTeamClick }) {
  const COLORS = useColors();
  const { isDark, toggleTheme } = useTheme();
  const fileRef = useRef();
  const [loadError, setLoadError] = useState(null);
  const teamAlert = (teamPending + teamUnread) > 0;

  return (
    <header
      style={{
        position: 'relative',
        padding: '0 22px',
        height: 58,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: isDark
          ? 'linear-gradient(180deg, rgba(18,22,32,0.92) 0%, rgba(10,12,18,0.88) 100%)'
          : 'linear-gradient(180deg, #ffffff 0%, #f7f8fb 100%)',
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      {/* Hairline vermelha — assinatura visual no rodapé do header */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: -1, height: 2,
        background: `linear-gradient(90deg, ${COLORS.accent} 0%, ${COLORS.accent}55 220px, transparent 480px)`,
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <img
          src={isDark ? './apex-logo.png' : './apex-logo-light.png'}
          alt="Apex Dynamics"
          style={{ height: 34, objectFit: 'contain', flexShrink: 0 }}
        />
        {fileName && (
          <span
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11.5,
              fontFamily: "'JetBrains Mono', monospace",
              color: COLORS.textSecondary,
              padding: '5px 11px',
              background: isDark ? 'rgba(255,255,255,0.03)' : COLORS.bgCardHover,
              borderRadius: 7,
              border: `1px solid ${COLORS.border}`,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 320,
            }}
            title={fileName}
          >
            <span style={{ color: COLORS.green, display: 'flex' }}><FileIcon /></span>
            {fileName}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        {/* Equipe / notificações de equipe */}
        {onTeamClick && (
          <HeaderButton
            onClick={onTeamClick}
            title="Equipe — dispositivos conectados"
            highlight={teamAlert}
            badge={teamPending + teamUnread}
            COLORS={COLORS}
          >
            <RadioIcon /> Equipe
          </HeaderButton>
        )}

        {/* Toggle dark/light */}
        <HeaderButton
          onClick={toggleTheme}
          title={isDark ? 'Modo claro' : 'Modo escuro'}
          COLORS={COLORS}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </HeaderButton>

        {onProfilesToggle && (
          <HeaderButton
            onClick={onProfilesToggle}
            title="Perfis"
            highlight={profilesOpen}
            COLORS={COLORS}
          >
            <UserIcon /> Perfis
          </HeaderButton>
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
              <HeaderButton
                onClick={() => { setLoadError(null); fileRef.current?.click(); }}
                title="Trocar arquivo de telemetria"
                highlight={!!loadError}
                COLORS={COLORS}
              >
                <FolderIcon /> Trocar Arquivo
              </HeaderButton>
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
          <HeaderButton onClick={onLogout} title="Sair da conta" COLORS={COLORS}>
            <LogoutIcon /> Sair
          </HeaderButton>
        )}
      </div>
    </header>
  );
}
