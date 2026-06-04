/**
 * LicenseGate.jsx — Autenticação via ApexServer
 *
 * Fluxo de autenticação:
 *  1. Abertura → verifica certificado RS256 salvo localmente
 *  2. Certificado válido → acesso liberado (sem internet)
 *  3. Certificado expirado → tenta renovar via /api/auth/session-certificate
 *  4. Sem sessão → exibe formulário de login real (credenciais do ApexIdentityManager)
 *
 * Sessão salva em localStorage (chave: rt_session):
 *  { certificate, token, username, apexHash, email, role }
 */

import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { setEntitlements, parseCertEntitlements } from '@/license/entitlements';
import { setImportConfig, parseCertImportConfig } from '@/license/importConfig';
import { APEX_LEGAL } from '@/license/legalText';

const SESSION_KEY = 'rt_session';

/* Contato de suporte exibido quando a conta está bloqueada. */
const SUPPORT_PHONE    = '(11) 99301-9308';
const SUPPORT_WHATSAPP = 'https://wa.me/5511993019308';

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
  blockBox: {
    padding: '18px 18px', borderRadius: 12, marginBottom: 16, textAlign: 'left',
    background: 'rgba(230,57,70,0.07)', border: '1px solid rgba(230,57,70,0.28)',
    fontFamily: FONT,
  },
  blockTitle: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 15, fontWeight: 700, color: '#e63946', marginBottom: 8, fontFamily: FONT,
  },
  blockText: { fontSize: 13, color: '#c9c9d6', lineHeight: 1.6, marginBottom: 14, fontFamily: FONT },
  contactRow: {
    display: 'flex', flexDirection: 'column', gap: 6,
    paddingTop: 12, borderTop: '1px solid rgba(230,57,70,0.18)',
  },
  contactLabel: {
    fontSize: 11, fontWeight: 600, color: '#8888a0',
    textTransform: 'uppercase', letterSpacing: '0.6px', fontFamily: FONT,
  },
  contactBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '10px 14px', background: '#25D366', border: 'none', borderRadius: 8,
    color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    textDecoration: 'none', fontFamily: FONT, transition: 'opacity 0.2s',
  },
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

/* ─── Helpers ────────────────────────────────────────────────────────── */

/**
 * Verifica expiração do certificado RS256 e dispara notificação OS
 * se o app estiver dentro da janela de aviso (< 25h ou < 2.5h antes).
 * Chamado uma vez por abertura do app — evita spam ao usar debounce via
 * localStorage com chave baseada no `exp` do certificado.
 */
function checkAndNotifyCertExpiry(payload) {
  if (!payload?.exp || !window.electronAPI?.showNotification) return;

  const DEBOUNCE_KEY = `notif_sent_${payload.exp}`;
  const alreadySent  = sessionStorage.getItem(DEBOUNCE_KEY);
  if (alreadySent) return;

  const nowSec    = Math.floor(Date.now() / 1000);
  const secLeft   = payload.exp - nowSec;
  const hoursLeft = secLeft / 3600;

  if (secLeft <= 0) {
    // Já expirado (caso raro — normalmente o renew teria ocorrido)
    window.electronAPI.showNotification(
      '⛔ Licença Expirada — ApexDynamics',
      'Sua licença expirou. Faça login novamente para renovar o acesso.'
    );
    sessionStorage.setItem(DEBOUNCE_KEY, '1');
  } else if (hoursLeft <= 2.5) {
    const h = Math.ceil(hoursLeft);
    window.electronAPI.showNotification(
      '⏰ Licença expira em breve — ApexDynamics',
      `Sua licença expira em ~${h}h. Abra o ApexIdentityManager para renovar.`
    );
    sessionStorage.setItem(DEBOUNCE_KEY, '1');
  } else if (hoursLeft <= 25) {
    window.electronAPI.showNotification(
      '🔔 Licença expira amanhã — ApexDynamics',
      'Sua licença vence em menos de 1 dia. Abra o ApexIdentityManager para renovar.'
    );
    sessionStorage.setItem(DEBOUNCE_KEY, '1');
  }
}

/**
 * Classifica o motivo de um bloqueio de conta a partir da resposta do servidor.
 * Retorna { title, text } para exibir a tela de contato, ou null se não for
 * um bloqueio que exija contato (ex.: senha errada, offline, rate-limit).
 */
function classifyBlock(result) {
  const msg = (result?.message || '').toLowerCase();

  if (result?.expired || msg.includes('expirad') || msg.includes('assinatura') || msg.includes('venceu') || msg.includes('vencid')) {
    return {
      title: 'Assinatura expirada',
      text: 'Seu plano de acesso ao ApexDynamics venceu. Para reativar sua conta e voltar a usar o aplicativo, entre em contato com o administrador pelo número abaixo.',
    };
  }
  if (result?.banned || msg.includes('banid')) {
    return {
      title: 'Conta bloqueada',
      text: 'Sua conta foi bloqueada pelo administrador. Se você acredita que isso é um engano, entre em contato pelo número abaixo para esclarecer.',
    };
  }
  if (result?.suspended || msg.includes('suspens') || msg.includes('inativ')) {
    return {
      title: 'Conta suspensa',
      text: 'Sua conta está temporariamente suspensa. Para regularizar a situação e reativar o acesso, entre em contato pelo número abaixo.',
    };
  }
  return null;
}

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/* ─── Componente ─────────────────────────────────────────────────────── */

export default function LicenseGate({ children }) {
  const { isDark, toggleTheme } = useTheme();

  const [status,    setStatus]    = useState('checking'); // checking | login | valid | renewing
  const [block,     setBlock]     = useState(null); // { title, text } quando a conta está bloqueada
  const [legal,     setLegal]     = useState(null); // 'terms' | 'privacy' | null
  // entKey: incrementado quando entitlements mudam em tempo real via SSE.
  // Passado como `key` pro wrapper dos filhos → força remontagem do TabGate
  // que então relê os entitlements corretos do localStorage.
  const [entKey,    setEntKey]    = useState(0);
  const [username,  setUsername]  = useState('');
  const [password,  setPassword]  = useState('');
  const [message,   setMessage]   = useState('');
  const [isError,   setIsError]   = useState(false);
  const [logging,   setLogging]   = useState(false);
  const [showPass,  setShowPass]  = useState(false);
  const [userFocus, setUserFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);

  /* ── Verificar sessão ao abrir ───────────────────────────────────── */
  useEffect(() => {
    async function checkSession() {
      const session = loadSession();

      if (!session?.certificate) {
        setStatus('login');
        return;
      }

      // Verifica certificado RS256 localmente (sem internet)
      const check = await window.electronAPI.checkCertificate(session.certificate);

      if (check.valid && !check.expired) {
        // Certificado válido localmente — mas verifica online se os entitlements
        // Retoma sessão no processo principal (define token + hwid + inicia SSE).
        // Necessário porque ao abrir com cert válido o login é ignorado.
        if (session.token && check.payload?.hwid) {
          window.electronAPI.resumeSession(session.token, check.payload.hwid).catch(() => {});
        }

        // Verifica online se abas OU import_config mudaram desde a emissão do cert.
        // Passa o token explicitamente pois sessionToken no main pode ainda ser null.
        const certEv  = check.payload?.ev ?? -1;
        const certIcv = check.payload?.icv ?? -1;
        const statusRes = await window.electronAPI
          .checkCertStatus(certEv, session.token, certIcv).catch(() => null);

        if (statusRes?.success && statusRes.changed && session.token) {
          // Entitlements mudaram — busca novo certificado com as abas atualizadas
          const renewal = await window.electronAPI.requestCertificate(session.token);
          if (renewal.success && renewal.certificate) {
            saveSession({ ...session, certificate: renewal.certificate });
            setEntitlements(parseCertEntitlements(renewal.certificate));
            setImportConfig(parseCertImportConfig(renewal.certificate));
            checkAndNotifyCertExpiry(check.payload);
            setStatus('valid');
            return;
          }
        }
        // Sem mudança (ou offline) — usa o certificado atual
        setEntitlements(check.payload?.ent || []);
        setImportConfig(check.payload?.ic || null);
        checkAndNotifyCertExpiry(check.payload);
        setStatus('valid');
        return;
      }

      if (check.valid && check.expired) {
        // Expirado → tenta renovar com o token salvo
        setStatus('renewing');
        if (!session.token) {
          clearSession();
          setStatus('login');
          setMessage('Sua sessão expirou. Faça login novamente.');
          setIsError(true);
          return;
        }

        const renewal = await window.electronAPI.requestCertificate(session.token);

        if (renewal.success && renewal.certificate) {
          saveSession({ ...session, certificate: renewal.certificate });
          setEntitlements(parseCertEntitlements(renewal.certificate));
          setImportConfig(parseCertImportConfig(renewal.certificate));
          setStatus('valid');
          return;
        }

        if (renewal.offline) {
          // Sem internet e certificado expirado → bloqueia
          clearSession();
          setStatus('login');
          setMessage('Certificado expirado. Conecte-se à internet para renovar.');
          setIsError(true);
          return;
        }

        // Bloqueio que exige contato (banido, suspenso ou assinatura expirada)
        const renewBlock = classifyBlock(renewal);
        if (renewBlock) {
          clearSession();
          setBlock(renewBlock);
          setStatus('login');
          return;
        }

        // Token JWT expirado (>7 dias sem login) → força re-login
        clearSession();
        setStatus('login');
        setMessage('Sua licença expirou (7 dias). Faça login novamente.');
        setIsError(true);
        return;
      }

      // Certificado inválido (adulterado ou HWID errado)
      clearSession();
      setStatus('login');
    }

    // Registra listener para mudança de abas em tempo real (via SSE)
    // O main.cjs já renovou o certificado; salva e força remontagem do TabGate.
    window.electronAPI?.onEntitlementsChanged?.((data) => {
      if (data?.certificate) {
        const currentSession = loadSession();
        if (currentSession) {
          saveSession({ ...currentSession, certificate: data.certificate });
          setEntitlements(parseCertEntitlements(data.certificate));
          setImportConfig(parseCertImportConfig(data.certificate));
          // Incrementar entKey força remontagem do TabGate →
          // ele relê os entitlements corretos do localStorage imediatamente.
          setEntKey(k => k + 1);
          console.log('[LicenseGate] entitlements atualizados via SSE');
        }
      }
    });

    // Registra listener para ban em tempo real (via SSE)
    window.electronAPI?.onForcedLogout?.((data) => {
      clearSession();
      const blk = classifyBlock({ banned: true, ...(data || {}) })
        || { title: 'Conta bloqueada', text: 'Seu acesso foi encerrado pelo administrador. Entre em contato pelo número abaixo.' };
      setBlock(blk);
      setStatus('login');
    });

    checkSession();
  }, []);

  /* ── Login real via ApexServer ───────────────────────────────────── */
  const handleLogin = async () => {
    const user = username.trim();
    const pass = password;

    if (!user) { setMessage('Informe o nome de usuário.'); setIsError(true); return; }
    if (!pass) { setMessage('Informe a senha.');           setIsError(true); return; }

    setLogging(true);
    setMessage('');
    setBlock(null);

    try {
      const result = await window.electronAPI.login(user, pass);

      if (result.success) {
        // Salva sessão completa com certificado RS256
        saveSession({
          certificate: result.certificate || null,
          token:       result.token,
          username:    result.username || user,
          apexHash:    result.apexHash || null,
          email:       result.email    || null,
          role:        result.role     || 'user',
        });
        setEntitlements(parseCertEntitlements(result.certificate));
        setImportConfig(parseCertImportConfig(result.certificate));
        setMessage('');
        setStatus('valid');
        return;
      }

      // Bloqueios que exigem contato (banido, suspenso, assinatura expirada)
      const blk = classifyBlock(result);
      if (blk) {
        setBlock(blk);
        return;
      }

      // Erros comuns / recuperáveis
      if (result.locked) {
        setMessage('Acesso bloqueado por excesso de tentativas. Tente novamente em 30 minutos.');
      } else if (result.offline) {
        setMessage('Sem conexão com o servidor. Verifique sua internet.');
      } else {
        setMessage(result.message || 'Usuário ou senha incorretos.');
      }
      setIsError(true);

    } catch {
      setMessage('Erro inesperado. Tente novamente.');
      setIsError(true);
    } finally {
      setLogging(false);
    }
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

  /* ── Render: verificando / renovando sessão ──────────────────────── */
  if (status === 'checking' || status === 'renewing') {
    return (
      <div style={dynStyles.loading}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        {toggleBtn}
        <img src="./apex-icon.png" alt="Apex Dynamics"
             style={{ width: 180, height: 'auto', objectFit: 'contain', marginBottom: 8 }} />
        <div style={styles.spinner} />
        <span style={dynStyles.loadingText}>
          {status === 'renewing' ? 'Renovando licença…' : 'Verificando sessão…'}
        </span>
      </div>
    );
  }

  /* ── Render: app liberado ─────────────────────────────────────────── */
  // entKey como key força remontagem do TabGate quando entitlements mudam via SSE
  if (status === 'valid') return <div key={entKey} style={{ display: 'contents' }}>{children}</div>;

  /* ── Render: conta bloqueada (banido / suspenso / assinatura vencida) ── */
  if (block) {
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

          <div style={styles.blockBox}>
            <div style={styles.blockTitle}>
              <span style={{ fontSize: 18 }}>⛔</span> {block.title}
            </div>
            <div style={styles.blockText}>{block.text}</div>

            <div style={styles.contactRow}>
              <span style={styles.contactLabel}>Fale com o administrador</span>
              <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer"
                 style={styles.contactBtn}
                 onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
                 onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.519 5.276l-.999 3.648 3.469-.823z"/>
                </svg>
                {SUPPORT_PHONE}
              </a>
            </div>
          </div>

          <button
            onClick={() => { setBlock(null); setMessage(''); setIsError(false); }}
            style={{ ...styles.button, background: 'transparent', color: isDark ? '#8888a0' : '#666677',
                     border: isDark ? '1px solid #1e1e2e' : '1px solid #d0d0dc' }}
          >
            Voltar ao login
          </button>
        </div>
      </div>
    );
  }

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
          Use as credenciais cadastradas no <strong>ApexIdentityManager</strong>.
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
          {logging ? 'Autenticando…' : 'Entrar'}
        </button>

        <div style={dynStyles.info}>
          Licença válida por 7 dias · Renovação automática ao abrir o app
        </div>
        <div style={{ ...dynStyles.info, marginTop: 8, fontSize: 11 }}>
          <span
            onClick={() => setLegal('terms')}
            style={{ color: '#e63946', cursor: 'pointer', fontWeight: 600 }}
          >Termos de Uso</span>
          {' · '}
          <span
            onClick={() => setLegal('privacy')}
            style={{ color: '#e63946', cursor: 'pointer', fontWeight: 600 }}
          >Política de Privacidade</span>
        </div>
      </div>

      {legal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setLegal(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.62)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 28,
          }}
        >
          <div style={{
            background: isDark ? '#12141c' : '#ffffff',
            border: `1px solid ${isDark ? '#232633' : '#e0e0e8'}`,
            borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '82vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 64px rgba(0,0,0,0.55)', fontFamily: FONT,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: `1px solid ${isDark ? '#232633' : '#e8e8f0'}`,
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isDark ? '#f0f0f5' : '#111' }}>
                {legal === 'terms' ? 'Termos de Uso' : 'Política de Privacidade'}
              </h3>
              <button onClick={() => setLegal(null)} style={{
                background: 'none', border: 'none', color: '#8c8ca2',
                fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: '0 4px',
              }}>×</button>
            </div>
            <div style={{
              padding: '18px 20px', overflowY: 'auto', whiteSpace: 'pre-wrap',
              fontSize: 12.5, lineHeight: 1.65, color: isDark ? '#c3c8d4' : '#33333a',
            }}>
              {legal === 'terms' ? APEX_LEGAL.termos : APEX_LEGAL.privacidade}
            </div>
            <div style={{
              padding: '14px 20px', borderTop: `1px solid ${isDark ? '#232633' : '#e8e8f0'}`,
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button onClick={() => setLegal(null)} style={{
                ...styles.button, width: 'auto', padding: '9px 26px', marginTop: 0, marginBottom: 0,
              }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
