/**
 * LicenseGate.jsx — Modo Standalone (Offline)
 *
 * Autenticação local sem dependência de rede ou servidor.
 * Credenciais fixas: Admin123 / ApexDynamics2026
 */

import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';

const SESSION_KEY = 'rt_session';
const FIXED_USER  = 'Admin123';
const FIXED_PASS  = 'ApexDynamics2026';

/* ─── Estilos ────────────────────────────────────────────────────────── */

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const styles = {
  container: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: '#0a0a0f', padding: 24, fontFamily: FONT,
  },
  card: {
    background: 'linear-gradient(180deg, #111118 0%, #12121a 100%)',
    border: '1px solid #1e1e2e', borderRadius: 16,
    padding: '40px 40px 32px', maxWidth: 420, width: '100%',
    textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  logoWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 20 },
  title:    { fontSize: 19, fontWeight: 700, color: '#f0f0f5', marginBottom: 6, fontFamily: FONT },
  subtitle: { fontSize: 13, color: '#8888a0', marginBottom: 28, lineHeight: 1.6, fontFamily: FONT },
  formGroup: { textAlign: 'left', marginBottom: 14 },
  label: {
    display: 'block', fontSize: 11, fontWeight: 600, color: '#8888a0',
    textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5, fontFamily: FONT,
  },
  input: {
    width: '100%', padding: '10px 14px', background: '#0f0f1a',
    border: '1px solid #1e1e2e', borderRadius: 8, color: '#f0f0f5',
    fontSize: 14, fontFamily: FONT, outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s', boxSizing: 'border-box',
  },
  inputFocus: { borderColor: '#e63946', boxShadow: '0 0 0 2px rgba(230,57,70,0.12)' },
  inputWrap:  { position: 'relative', display: 'flex', alignItems: 'center' },
  eyeBtn: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 38,
    background: 'transparent', border: 'none', color: '#55556a',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 14, borderRadius: '0 8px 8px 0',
  },
  button: {
    width: '100%', padding: '11px', background: '#e63946', border: 'none',
    borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', marginTop: 8, marginBottom: 4,
    transition: 'background 0.2s, opacity 0.2s', fontFamily: FONT,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  message: (isError) => ({
    padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    marginBottom: 12, textAlign: 'left',
    background: isError ? 'rgba(230,57,70,0.08)' : 'rgba(6,214,160,0.08)',
    color: isError ? '#e63946' : '#06d6a0',
    border: `1px solid ${isError ? 'rgba(230,57,70,0.25)' : 'rgba(6,214,160,0.25)'}`,
    lineHeight: 1.5, fontFamily: FONT,
  }),
  info: { marginTop: 20, fontSize: 12, color: '#55556a', lineHeight: 1.6, fontFamily: FONT },
  loading: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', background: '#0a0a0f',
    gap: 14, fontFamily: FONT,
  },
  loadingText: { color: '#8888a0', fontSize: 13, fontFamily: FONT },
  spinner: {
    width: 28, height: 28, border: '2.5px solid #1e1e2e',
    borderTop: '2.5px solid #e63946', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  divider: {
    width: 40, height: 2,
    background: 'linear-gradient(90deg, transparent, #e63946, transparent)',
    borderRadius: 2, margin: '0 auto 20px',
  },
};

/* ─── SVG Icons ────────────────────────────────────────────────────── */

function EyeIcon({ open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

/* ─── Componente ─────────────────────────────────────────────────────── */

export default function LicenseGate({ children }) {
  const { isDark, toggleTheme } = useTheme();

  const [status,    setStatus]    = useState('checking');
  const [username,  setUsername]  = useState('');
  const [password,  setPassword]  = useState('');
  const [message,   setMessage]   = useState('');
  const [isError,   setIsError]   = useState(false);
  const [logging,   setLogging]   = useState(false);
  const [showPass,  setShowPass]  = useState(false);
  const [userFocus, setUserFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);

  /* ── Verificar sessão salva ao abrir ─────────────────────────────── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        if (session?.authenticated) {
          setStatus('valid');
          return;
        }
      }
    } catch { /* ignora */ }
    setStatus('login');
  }, []);

  /* ── Login offline com credenciais fixas ─────────────────────────── */
  const handleLogin = () => {
    const user = username.trim();
    const pass = password;

    if (!user) { setMessage('Informe o nome de usuário.'); setIsError(true); return; }
    if (!pass) { setMessage('Informe a senha.');           setIsError(true); return; }

    setLogging(true);
    setMessage('');

    if (user === FIXED_USER && pass === FIXED_PASS) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ authenticated: true, username: user }));
      setMessage('Login realizado com sucesso!');
      setIsError(false);
      setTimeout(() => setStatus('valid'), 600);
    } else {
      setMessage('Usuário ou senha incorretos.');
      setIsError(true);
    }

    setLogging(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !logging) handleLogin();
  };

  /* ── Estilos dinâmicos por tema ──────────────────────────────────── */
  const dynStyles = {
    container: { ...styles.container, background: isDark ? '#0a0a0f' : '#f0f0f6' },
    card: {
      ...styles.card,
      background: isDark ? 'linear-gradient(180deg, #111118 0%, #12121a 100%)' : '#ffffff',
      border: isDark ? '1px solid #1e1e2e' : '1px solid #e0e0e8',
    },
    title:    { ...styles.title,    color: isDark ? '#f0f0f5' : '#111111' },
    subtitle: { ...styles.subtitle, color: isDark ? '#8888a0' : '#444455' },
    label:    { ...styles.label,    color: isDark ? '#8888a0' : '#444455' },
    input: {
      ...styles.input,
      background: isDark ? '#0f0f1a' : '#f8f8fc',
      border:     isDark ? '1px solid #1e1e2e' : '1px solid #d0d0dc',
      color:      isDark ? '#f0f0f5' : '#111111',
    },
    loading:      { ...styles.loading,      background: isDark ? '#0a0a0f' : '#f0f0f6' },
    loadingText:  { ...styles.loadingText,  color: isDark ? '#8888a0' : '#555566' },
    info:         { ...styles.info,         color: isDark ? '#55556a' : '#666677' },
    eyeBtn:       { ...styles.eyeBtn,       color: isDark ? '#55556a' : '#888899' },
  };

  const toggleBtn = (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      style={{
        position: 'fixed', top: 14, right: 14,
        background: isDark ? '#1e1e2e' : '#e8e8f0',
        border: isDark ? '1px solid #2a2a3e' : '1px solid #d0d0dc',
        borderRadius: 8, width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: 16, zIndex: 9999, transition: 'background 0.2s',
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );

  /* ── Render: verificando sessão ──────────────────────────────────── */
  if (status === 'checking') {
    return (
      <div style={dynStyles.loading}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        {toggleBtn}
        <img src="./apex-icon.png" alt="Apex Dynamics"
             style={{ width: 180, height: 'auto', objectFit: 'contain', marginBottom: 8 }} />
        <div style={styles.spinner} />
        <span style={dynStyles.loadingText}>Verificando sessão...</span>
      </div>
    );
  }

  /* ── Render: app liberado ─────────────────────────────────────────── */
  if (status === 'valid') return children;

  /* ── Render: formulário de login ─────────────────────────────────── */
  return (
    <div style={dynStyles.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {toggleBtn}
      <div style={dynStyles.card}>

        <div style={styles.logoWrap}>
          <img src={isDark ? './apex-logo.png' : './apex-logo-light.png'} alt="Apex Dynamics"
               style={{ width: '80%', maxWidth: 300, height: 'auto', objectFit: 'contain' }} />
        </div>

        <div style={styles.divider} />

        <h1 style={dynStyles.title}>Bem-vindo de volta</h1>
        <p style={dynStyles.subtitle}>
          Entre com suas credenciais para acessar o software.
        </p>

        {/* Usuário */}
        <div style={styles.formGroup}>
          <label style={dynStyles.label}>Usuário</label>
          <input
            type="text"
            placeholder="nome de usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setUserFocus(true)}
            onBlur={() => setUserFocus(false)}
            style={{ ...dynStyles.input, ...(userFocus ? styles.inputFocus : {}) }}
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
          />
        </div>

        {/* Senha */}
        <div style={styles.formGroup}>
          <label style={dynStyles.label}>Senha</label>
          <div style={styles.inputWrap}>
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setPassFocus(true)}
              onBlur={() => setPassFocus(false)}
              style={{ ...dynStyles.input, paddingRight: 40, ...(passFocus ? styles.inputFocus : {}) }}
              autoComplete="current-password"
              maxLength={128}
            />
            <button onClick={() => setShowPass(p => !p)} style={dynStyles.eyeBtn}
                    tabIndex={-1} type="button"
                    aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}>
              <EyeIcon open={showPass} />
            </button>
          </div>
        </div>

        {message && <div style={styles.message(isError)}>{message}</div>}

        <button
          onClick={handleLogin}
          disabled={logging || !username.trim() || !password}
          style={{ ...styles.button, ...(logging || !username.trim() || !password ? styles.buttonDisabled : {}) }}
        >
          {logging ? 'Autenticando...' : 'Entrar'}
        </button>

        <div style={dynStyles.info}>
          Versão standalone — acesso local sem necessidade de internet.
        </div>
      </div>
    </div>
  );
}
