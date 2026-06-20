/**
 * LicenseGate.jsx — Autenticação via ApexServer
 *
 * Fluxo de autenticação:
 *  1. Abertura → verifica certificado RS256 salvo localmente
 *  2. Certificado válido → acesso liberado (sem internet)
 *  3. Certificado expirado → tenta renovar via /api/auth/session-certificate
 *  4. Sem sessão → exibe formulário de login/cadastro (credenciais do ApexServer)
 *
 * Sessão salva em localStorage (chave: rt_session):
 *  { certificate, token, username, apexHash, email, role }
 */

import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { setEntitlements, parseCertEntitlements, setWorkspaceConfig, parseCertWorkspaceConfig } from '@/license/entitlements';
import { setImportConfig, parseCertImportConfig } from '@/license/importConfig';
import { APEX_LEGAL } from '@/license/legalText';

const SESSION_KEY = 'rt_session';

/* Contato de suporte exibido quando a conta está bloqueada. */
const SUPPORT_PHONE    = '(11) 99301-9308';
const SUPPORT_WHATSAPP = 'https://wa.me/5511993019308';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FONT_DISPLAY = "'Rajdhani', 'Inter', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Consolas', monospace";

/* ─── SVG Icons ────────────────────────────────────────────────────── */

function EyeIcon({ open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.519 5.276l-.999 3.648 3.469-.823z"/>
    </svg>
  );
}

function IdIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <circle cx="9" cy="10" r="2"/>
      <path d="M15 8h3M15 12h3M7 16h10"/>
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-10 6L2 7"/>
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

/**
 * Verifica expiração do certificado RS256 e dispara notificação OS
 * se o app estiver dentro da janela de aviso (< 25h ou < 2.5h antes).
 * Chamado uma vez por abertura do app — evita spam ao usar debounce via
 * sessionStorage com chave baseada no `exp` do certificado.
 */
function checkAndNotifyCertExpiry(payload) {
  if (!payload?.exp || !window.electronAPI?.showNotification) return;

  const DEBOUNCE_KEY = `notif_sent_${payload.exp}`;
  if (sessionStorage.getItem(DEBOUNCE_KEY)) return;

  const nowSec    = Math.floor(Date.now() / 1000);
  const secLeft   = payload.exp - nowSec;
  const hoursLeft = secLeft / 3600;

  if (secLeft <= 0) {
    window.electronAPI.showNotification(
      '⛔ Licença Expirada — ApexDynamics',
      'Sua licença expirou. Faça login novamente para renovar o acesso.'
    );
    sessionStorage.setItem(DEBOUNCE_KEY, '1');
  } else if (hoursLeft <= 2.5) {
    const h = Math.ceil(hoursLeft);
    window.electronAPI.showNotification(
      '⏰ Licença expira em breve — ApexDynamics',
      `Sua licença expira em ~${h}h. Abra o ApexDynamics conectado à internet para renovar automaticamente.`
    );
    sessionStorage.setItem(DEBOUNCE_KEY, '1');
  } else if (hoursLeft <= 25) {
    window.electronAPI.showNotification(
      '🔔 Licença expira amanhã — ApexDynamics',
      'Sua licença vence em menos de 1 dia. Abra o ApexDynamics conectado à internet para renovar automaticamente.'
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

  if (result?.pending || msg.includes('pendente') || msg.includes('aprovaç') || msg.includes('aguard') || msg.includes('liberaç') || msg.includes('análise') || msg.includes('analise')) {
    return {
      title: 'Conta aguardando aprovação',
      text: 'Seu cadastro foi recebido e está em análise. Assim que o administrador liberar seu acesso, você poderá entrar normalmente. Em caso de dúvida, fale com o administrador pelo número abaixo.',
    };
  }
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

/**
 * Sessão (certificado + token) guardada de forma criptografada pelo SO
 * via Electron safeStorage (IPC session:get/set/clear), num arquivo em
 * userData — não fica em texto puro no localStorage. Fora do Electron
 * (modo navegador/visualização) cai no localStorage como fallback.
 */
async function saveSession(data) {
  if (window.electronAPI?.sessionSet) { try { await window.electronAPI.sessionSet(data); return; } catch { /* fallthrough */ } }
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* noop */ }
}
async function loadSession() {
  if (window.electronAPI?.sessionGet) { try { return await window.electronAPI.sessionGet(); } catch { return null; } }
  try { const r = localStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
async function clearSession() {
  if (window.electronAPI?.sessionClear) { try { await window.electronAPI.sessionClear(); return; } catch { /* fallthrough */ } }
  try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
}

/* ─── Componente Principal ───────────────────────────────────────────── */

export default function LicenseGate({ children }) {
  const { isDark, toggleTheme } = useTheme();

  const [status,     setStatus]     = useState('checking'); // checking | login | valid | renewing
  const [block,      setBlock]      = useState(null); // { title, text } quando a conta está bloqueada
  const [legal,      setLegal]      = useState(null); // 'terms' | 'privacy' | null
  // entKey: incrementado quando entitlements mudam em tempo real via SSE.
  // Passado como `key` pro wrapper dos filhos → força remontagem do TabGate
  // que então relê os entitlements corretos do localStorage.
  const [entKey,     setEntKey]     = useState(0);
  const [username,   setUsername]   = useState('');
  const [password,   setPassword]   = useState('');
  const [message,    setMessage]    = useState('');
  const [isError,    setIsError]    = useState(false);
  const [logging,    setLogging]    = useState(false);
  const [showPass,   setShowPass]   = useState(false);
  const [userFocus,  setUserFocus]  = useState(false);
  const [passFocus,  setPassFocus]  = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [appVersion, setAppVersion] = useState('');

  // view: alterna o conteúdo do card entre login, cadastro e tela de sucesso.
  const [view,       setView]       = useState('login'); // 'login' | 'register' | 'registered'
  const [reg,        setReg]        = useState({ name: '', email: '', user: '', pass: '', pass2: '', phone: '' });
  const [regAccept,  setRegAccept]  = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regMsg,     setRegMsg]     = useState('');
  const [regErr,     setRegErr]     = useState(false);
  const [regShowPass,setRegShowPass]= useState(false);
  const [regFocus,   setRegFocus]   = useState(null);

  /* Detecta execução fora do Electron (navegador) — login indisponível. */
  const isElectron = !!window.electronAPI?.login;

  const setRegField = (k) => (e) => { setReg((r) => ({ ...r, [k]: e.target.value })); setRegMsg(''); };
  const goLogin    = () => { setView('login'); setMessage(''); setIsError(false); };
  const goRegister = () => { setView('register'); setRegMsg(''); setRegErr(false); setMessage(''); };

  /* ── Verificar sessão ao abrir ───────────────────────────────────── */
  useEffect(() => {
    window.electronAPI?.getVersion?.().then(v => { if (v) setAppVersion(`v${v}`); }).catch(() => {});

    async function checkSession() {
      // Navegador (sem preload do Electron): vai direto pro formulário,
      // que exibe o aviso de modo visualização.
      if (!window.electronAPI?.checkCertificate) {
        setStatus('login');
        return;
      }

      const session = await loadSession();

      if (!session?.certificate) {
        setStatus('login');
        return;
      }

      // Verifica certificado RS256 localmente (sem internet)
      const check = await window.electronAPI.checkCertificate(session.certificate);

      if (check.valid && !check.expired) {
        // Retoma sessão no processo principal (define token + hwid + inicia SSE).
        // Necessário porque ao abrir com cert válido o login é ignorado.
        if (session.token && check.payload?.hwid) {
          window.electronAPI.resumeSession(session.token, check.payload.hwid, session.certificate).catch(() => {});
        }

        // Verifica online se abas OU import_config mudaram desde a emissão do cert.
        // Passa o token explicitamente pois sessionToken no main pode ainda ser null.
        const certEv   = check.payload?.ev   ?? -1;
        const certIcv  = check.payload?.icv  ?? -1;
        const certWscv = check.payload?.wscv ?? -1;
        const statusRes = await window.electronAPI
          .checkCertStatus(certEv, session.token, certIcv, certWscv).catch(() => null);

        if (statusRes?.success && statusRes.changed && session.token) {
          // Entitlements mudaram — busca novo certificado com as abas atualizadas
          const renewal = await window.electronAPI.requestCertificate(session.token);
          if (renewal.success && renewal.certificate) {
            await saveSession({ ...session, certificate: renewal.certificate });
            setEntitlements(parseCertEntitlements(renewal.certificate));
            setImportConfig(parseCertImportConfig(renewal.certificate));
            setWorkspaceConfig(parseCertWorkspaceConfig(renewal.certificate));
            checkAndNotifyCertExpiry(check.payload);
            setStatus('valid');
            return;
          }
        }
        // Sem mudança (ou offline) — usa o certificado atual
        setEntitlements(check.payload?.ent || []);
        setImportConfig(check.payload?.ic || null);
        setWorkspaceConfig(check.payload?.wsc ?? null);
        checkAndNotifyCertExpiry(check.payload);
        setStatus('valid');
        return;
      }

      if (check.valid && check.expired) {
        // Expirado → tenta renovar com o token salvo
        setStatus('renewing');
        if (!session.token) {
          await clearSession();
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
          setWorkspaceConfig(parseCertWorkspaceConfig(renewal.certificate));
          setStatus('valid');
          return;
        }

        if (renewal.offline) {
          // Sem internet e certificado expirado → bloqueia
          await clearSession();
          setStatus('login');
          setMessage('Certificado expirado. Conecte-se à internet para renovar.');
          setIsError(true);
          return;
        }

        // Bloqueio que exige contato (banido, suspenso ou assinatura expirada)
        const renewBlock = classifyBlock(renewal);
        if (renewBlock) {
          await clearSession();
          setBlock(renewBlock);
          setStatus('login');
          return;
        }

        // Token JWT expirado (>7 dias sem login) → força re-login
        await clearSession();
        setStatus('login');
        setMessage('Sua licença expirou (7 dias). Faça login novamente.');
        setIsError(true);
        return;
      }

      // Certificado inválido (adulterado ou HWID errado)
      await clearSession();
      setStatus('login');
    }

    // Registra listener para mudança de abas em tempo real (via SSE)
    // O main.cjs já renovou o certificado; salva e força remontagem do TabGate.
    window.electronAPI?.onEntitlementsChanged?.(async (data) => {
      if (data?.certificate) {
        const currentSession = await loadSession();
        if (currentSession) {
          await saveSession({ ...currentSession, certificate: data.certificate });
          setEntitlements(parseCertEntitlements(data.certificate));
          setImportConfig(parseCertImportConfig(data.certificate));
          setWorkspaceConfig(parseCertWorkspaceConfig(data.certificate));
          // Incrementar entKey força remontagem do TabGate →
          // ele relê os entitlements corretos imediatamente.
          setEntKey(k => k + 1);
          console.log('[LicenseGate] entitlements atualizados via SSE');
        }
      }
    });

    // Registra listener para ban em tempo real (via SSE)
    window.electronAPI?.onForcedLogout?.(async (data) => {
      await clearSession();
      const blk = classifyBlock({ banned: true, ...(data || {}) })
        || { title: 'Conta bloqueada', text: 'Seu acesso foi encerrado pelo administrador. Entre em contato pelo número abaixo.' };
      setBlock(blk);
      setStatus('login');
    });

    checkSession();
  }, []);

  /* ── Login real via ApexServer ───────────────────────────────────── */
  const handleLogin = async () => {
    if (!isElectron) {
      setMessage('O login está disponível apenas no aplicativo desktop ApexDynamics.');
      setIsError(true);
      return;
    }

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
        // Salva sessão completa com certificado RS256 (criptografada via safeStorage)
        await saveSession({
          certificate: result.certificate || null,
          token:       result.token,
          username:    result.username || user,
          apexHash:    result.apexHash || null,
          email:       result.email    || null,
          role:        result.role     || 'user',
        });
        setEntitlements(parseCertEntitlements(result.certificate));
        setImportConfig(parseCertImportConfig(result.certificate));
        setWorkspaceConfig(parseCertWorkspaceConfig(result.certificate));
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

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !logging) handleLogin(); };

  /* ── Cadastro de nova conta (pendente de aprovação) ──────────────── */
  const handleRegister = async () => {
    if (!isElectron) {
      setRegMsg('O cadastro está disponível apenas no aplicativo desktop ApexDynamics.');
      setRegErr(true);
      return;
    }

    const name  = reg.name.trim();
    const email = reg.email.trim();
    const user  = reg.user.trim();

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    // Regra de senha alinhada ao servidor: 10+ caracteres com letra, número e símbolo.
    const pass = reg.pass;
    const passStrong = pass.length >= 10 && /[a-zA-Z]/.test(pass) && /[0-9]/.test(pass) && /[^a-zA-Z0-9]/.test(pass);

    if (name.length < 3)        { setRegMsg('Informe seu nome completo.');                 setRegErr(true); return; }
    if (!emailOk)               { setRegMsg('Informe um e-mail válido.');                  setRegErr(true); return; }
    if (user.length < 3)        { setRegMsg('O usuário deve ter ao menos 3 caracteres.');  setRegErr(true); return; }
    if (!passStrong)            { setRegMsg('A senha deve ter no mínimo 10 caracteres, com letra, número e símbolo (ex.: ! @ # $).'); setRegErr(true); return; }
    if (reg.pass !== reg.pass2) { setRegMsg('As senhas não coincidem.');                   setRegErr(true); return; }
    if (!regAccept)             { setRegMsg('É preciso aceitar os Termos de Uso e a Política de Privacidade.'); setRegErr(true); return; }

    setRegLoading(true);
    setRegMsg('');

    try {
      const result = await window.electronAPI.register({
        name, email, username: user, password: reg.pass, phone: reg.phone.trim(),
      });

      if (result.success) {
        // Conta criada como PENDENTE — sem login até o admin aprovar.
        setView('registered');
        setReg({ name: '', email: '', user: '', pass: '', pass2: '', phone: '' });
        setRegAccept(false);
        return;
      }

      if (result.offline) {
        setRegMsg('Sem conexão com a internet. O cadastro exige internet.');
      } else if (result.duplicate || (result.message || '').toLowerCase().includes('já')) {
        setRegMsg(result.message || 'Usuário ou e-mail já cadastrado.');
      } else {
        setRegMsg(result.message || 'Não foi possível criar a conta. Tente novamente.');
      }
      setRegErr(true);
    } catch {
      setRegMsg('Erro inesperado. Tente novamente.');
      setRegErr(true);
    } finally {
      setRegLoading(false);
    }
  };

  /* ── Botão de tema ───────────────────────────────────────────────── */
  const ThemeToggle = () => (
    <button onClick={toggleTheme} title={isDark ? 'Modo claro' : 'Modo escuro'} style={{
      position: 'fixed', top: 14, right: 14, zIndex: 9999,
      background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
      width: 36, height: 36, display: 'flex', alignItems: 'center',
      justifyContent: 'center', cursor: 'pointer', fontSize: 16,
    }}>
      {isDark ? '☀️' : '🌙'}
    </button>
  );

  /* ── Loading / Renewing ──────────────────────────────────────────── */
  if (status === 'checking' || status === 'renewing') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh',
        background: '#07080d', gap: 16, fontFamily: FONT,
      }}>
        <style>{`
          @keyframes spin  { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
        `}</style>
        <ThemeToggle />
        <img src="./apex-icon.png" alt="Apex Dynamics"
             style={{ width: 150, height: 'auto', objectFit: 'contain', marginBottom: 8, animation: 'pulse 2s ease-in-out infinite' }} />
        <div style={{ width: 26, height: 26, border: '2.5px solid #1d2433', borderTop: '2.5px solid #e63946', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{
          color: '#8f98ab', fontSize: 12, fontFamily: FONT_DISPLAY,
          fontWeight: 600, letterSpacing: '2.5px', textTransform: 'uppercase',
        }}>
          {status === 'renewing' ? 'Renovando licença' : 'Verificando sessão'}
        </span>
      </div>
    );
  }

  /* ── App liberado ────────────────────────────────────────────────── */
  // entKey como key força remontagem do TabGate quando entitlements mudam via SSE
  if (status === 'valid') return <div key={entKey} style={{ display: 'contents' }}>{children}</div>;

  /* ── Tela de Login ───────────────────────────────────────────────── */
  const canSubmit = !logging && username.trim() && password;

  // Helper de input do cadastro. É uma FUNÇÃO que retorna JSX (não um
  // componente) — chamada inline, o React reconcilia por posição e não
  // remonta a cada tecla (evita perda de foco).
  const regInput = ({ field, label, placeholder, icon, type = 'text', maxLength = 64, autoComplete = 'off' }) => {
    const focused = regFocus === field;
    const isPass  = field === 'pass' || field === 'pass2';
    const inputType = isPass ? (regShowPass ? 'text' : 'password') : type;
    return (
      <div style={{ marginBottom: 11 }}>
        <label style={{ display: 'block', fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, color: '#9ba6b6', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>
          {label}
        </label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', left: 12, color: focused ? '#e63946' : '#5a6473', transition: 'color 0.2s', pointerEvents: 'none', display: 'flex' }}>
            {icon}
          </div>
          <input
            className="apex-input"
            type={inputType}
            placeholder={placeholder}
            value={reg[field]}
            onChange={setRegField(field)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !regLoading) handleRegister(); }}
            onFocus={() => setRegFocus(field)}
            onBlur={() => setRegFocus(null)}
            autoComplete={autoComplete} spellCheck={false} maxLength={maxLength}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: field === 'pass' ? '11px 42px 11px 36px' : '11px 14px 11px 36px',
              background: focused ? 'rgba(20,24,34,0.9)' : 'rgba(12,14,22,0.8)',
              border: `1.5px solid ${focused ? '#e63946' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 10, color: '#f4f6fa', fontSize: 14, fontFamily: FONT,
              boxShadow: focused ? '0 0 0 3px rgba(230,57,70,0.12)' : 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
            }}
          />
          {field === 'pass' && (
            <button onClick={() => setRegShowPass((p) => !p)} tabIndex={-1} type="button"
              aria-label={regShowPass ? 'Ocultar senha' : 'Mostrar senha'}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, background: 'transparent', border: 'none', cursor: 'pointer', color: '#5a6473', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0 10px 10px 0' }}>
              <EyeIcon open={regShowPass} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'relative', minHeight: '100vh', width: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      fontFamily: FONT, overflow: 'hidden',
      background: '#07080d',
    }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity:0; transform:translateX(32px); } to { opacity:1; transform:translateX(0); } }
        .apex-input::placeholder { color: #5a6473; }
        .apex-input:focus        { outline: none; }
        .apex-link:hover         { opacity: 0.7 !important; }
        .apex-btn:hover:not(:disabled) { background: #cc2d39 !important; box-shadow: 0 8px 28px rgba(230,57,70,0.5) !important; }
        .apex-btn:active:not(:disabled){ transform: scale(0.985); }
      `}</style>

      <ThemeToggle />

      {/* ── Wallpaper fullscreen — preenche tudo sem cortar nem barra preta ── */}
      <img
        src="./Wallpaper_Login.png"
        alt=""
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'fill',
          pointerEvents: 'none',
        }}
      />

      {/* ── Gradiente suave sobre o lado direito para legibilidade do card ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, transparent 40%, rgba(5,6,10,0.45) 60%, rgba(5,6,10,0.80) 78%, rgba(5,6,10,0.90) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Card de Login ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: 400,
        marginRight: 'clamp(32px, 15vw, 220px)',
        animation: 'slideIn 0.55s cubic-bezier(0.22,1,0.36,1) both',
      }}>

        {/* Barra vermelha topo */}
        <div style={{ height: 3, borderRadius: '12px 12px 0 0', background: 'linear-gradient(90deg, #e63946, #b01e2b)' }} />

        {/* Corpo do card */}
        <div style={{
          background: 'rgba(10, 12, 18, 0.82)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderTop: 'none',
          borderRadius: '0 0 16px 16px',
          padding: '32px 36px 28px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
          maxHeight: 'calc(100vh - 96px)',
          overflowY: 'auto',
        }}>

          {block ? (
            /* ── Conta bloqueada (banido / suspenso / assinatura vencida) ── */
            <>
              <div style={{
                padding: '18px 18px', borderRadius: 12, marginBottom: 16, textAlign: 'left',
                background: 'rgba(230,57,70,0.07)', border: '1px solid rgba(230,57,70,0.28)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: '#e63946', marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>⛔</span> {block.title}
                </div>
                <div style={{ fontSize: 13, color: '#c9c9d6', lineHeight: 1.6, marginBottom: 14 }}>
                  {block.text}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12, borderTop: '1px solid rgba(230,57,70,0.18)' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#9ba6b6', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Fale com o administrador
                  </span>
                  <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer"
                     style={{
                       display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                       padding: '10px 14px', background: '#25D366', border: 'none', borderRadius: 8,
                       color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                       textDecoration: 'none', transition: 'opacity 0.2s',
                     }}
                     onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
                     onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}>
                    <WhatsAppIcon />
                    {SUPPORT_PHONE}
                  </a>
                </div>
              </div>

              <button
                onClick={() => { setBlock(null); setMessage(''); setIsError(false); }}
                style={{
                  width: '100%', padding: '11px', background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                  color: '#9ba6b6', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: FONT, transition: 'border-color 0.2s, color 0.2s',
                }}
              >
                Voltar ao login
              </button>
            </>
          ) : view === 'registered' ? (
            /* ── Cadastro enviado — aguardando aprovação ── */
            <div style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{
                width: 72, height: 72, margin: '0 auto 18px', borderRadius: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(6,214,160,0.12)', color: '#06d6a0',
                boxShadow: '0 0 28px -6px rgba(6,214,160,0.5)',
              }}>
                <CheckCircleIcon />
              </div>
              <h1 style={{ fontFamily: FONT_DISPLAY, margin: '0 0 10px', fontSize: 27, fontWeight: 700, color: '#f4f6fa', letterSpacing: '0.5px' }}>
                Conta criada!
              </h1>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: '#9ba6b6', lineHeight: 1.6 }}>
                Seu cadastro foi enviado e está{' '}
                <strong style={{ color: '#c8d0dc' }}>aguardando liberação do administrador</strong>.
                Assim que aprovado, você poderá fazer login com seu usuário e senha.
              </p>

              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                padding: '14px', borderRadius: 12, marginBottom: 18,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#9ba6b6', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Quer agilizar a liberação?
                </span>
                <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer"
                   style={{
                     display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                     padding: '10px 14px', background: '#25D366', border: 'none', borderRadius: 8,
                     color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                     textDecoration: 'none', transition: 'opacity 0.2s',
                   }}
                   onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
                   onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}>
                  <WhatsAppIcon /> {SUPPORT_PHONE}
                </a>
              </div>

              <button
                onClick={goLogin}
                style={{
                  width: '100%', padding: '12px 20px', background: '#e63946', border: 'none',
                  borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700,
                  letterSpacing: '2px', fontFamily: FONT_DISPLAY, cursor: 'pointer',
                  boxShadow: '0 6px 24px rgba(230,57,70,0.38)',
                }}
              >
                VOLTAR AO LOGIN
              </button>
            </div>
          ) : view === 'register' ? (
            /* ── Formulário de Cadastro ── */
            <>
              {/* Header */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, fontWeight: 700, color: '#e63946', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: 8 }}>
                  Novo na Apex
                </div>
                <h1 style={{ fontFamily: FONT_DISPLAY, margin: '0 0 6px', fontSize: 28, fontWeight: 700, color: '#f4f6fa', letterSpacing: '0.5px', lineHeight: 1.05 }}>
                  Criar conta
                </h1>
                <p style={{ margin: 0, fontSize: 12.5, color: '#9ba6b6', lineHeight: 1.55 }}>
                  Seu cadastro passa por <strong style={{ color: '#c8d0dc', fontWeight: 600 }}>aprovação do administrador</strong> antes de liberar o acesso.
                </p>
              </div>

              {/* Aviso: rodando no navegador (sem Electron) */}
              {!isElectron && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '11px 14px', borderRadius: 10, marginBottom: 16,
                  background: 'rgba(17,138,178,0.10)', border: '1px solid rgba(17,138,178,0.35)', lineHeight: 1.55,
                }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>🖥️</span>
                  <span style={{ fontSize: 12.5, color: '#9fc9dd' }}>
                    <strong style={{ color: '#cfe8f4' }}>Modo visualização (navegador).</strong>{' '}
                    O cadastro só funciona no aplicativo desktop <strong style={{ color: '#cfe8f4' }}>ApexDynamics</strong>.
                  </span>
                </div>
              )}

              {/* Mensagem erro/sucesso do cadastro */}
              {regMsg && (
                <div style={{
                  padding: '9px 13px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  marginBottom: 14, lineHeight: 1.5,
                  background: regErr ? 'rgba(230,57,70,0.08)' : 'rgba(6,214,160,0.08)',
                  color:      regErr ? '#e63946'               : '#06d6a0',
                  border:     `1px solid ${regErr ? 'rgba(230,57,70,0.25)' : 'rgba(6,214,160,0.25)'}`,
                }}>
                  {regMsg}
                </div>
              )}

              {regInput({ field: 'name',  label: 'Nome completo',       placeholder: 'Seu nome',            icon: <IdIcon />,    autoComplete: 'name',         maxLength: 80 })}
              {regInput({ field: 'email', label: 'E-mail',              placeholder: 'voce@email.com',      icon: <MailIcon />,  type: 'email', autoComplete: 'email', maxLength: 120 })}
              {regInput({ field: 'user',  label: 'Usuário',             placeholder: 'Nome de usuário',     icon: <UserIcon />,  maxLength: 64 })}
              {regInput({ field: 'pass',  label: 'Senha',               placeholder: '10+ com letra, nº e símbolo', icon: <LockIcon />,  type: 'password', autoComplete: 'new-password', maxLength: 128 })}
              {regInput({ field: 'pass2', label: 'Confirmar senha',     placeholder: 'Repita a senha',      icon: <LockIcon />,  type: 'password', autoComplete: 'new-password', maxLength: 128 })}
              {regInput({ field: 'phone', label: 'WhatsApp (opcional)', placeholder: '(11) 99999-9999',     icon: <PhoneIcon />, type: 'tel', autoComplete: 'tel', maxLength: 20 })}

              {/* Aceite dos termos */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', userSelect: 'none', marginTop: 4, marginBottom: 18 }}>
                <div
                  onClick={() => setRegAccept((p) => !p)}
                  style={{
                    width: 16, height: 16, marginTop: 1, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                    background: regAccept ? '#e63946' : 'transparent',
                    border: `2px solid ${regAccept ? '#e63946' : 'rgba(255,255,255,0.15)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  {regAccept && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="2,6 5,9 10,3"/>
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: 12.5, color: '#9ba6b6', lineHeight: 1.5 }}>
                  Li e aceito os{' '}
                  <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegal('terms'); }} style={{ color: '#e63946', fontWeight: 600 }}>Termos de Uso</span>
                  {' '}e a{' '}
                  <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLegal('privacy'); }} style={{ color: '#e63946', fontWeight: 600 }}>Política de Privacidade</span>.
                </span>
              </label>

              {/* Botão CRIAR CONTA */}
              <button
                className="apex-btn"
                onClick={handleRegister}
                disabled={regLoading}
                style={{
                  width: '100%', padding: '12px 20px', marginBottom: 16,
                  background: regLoading ? 'rgba(255,255,255,0.04)' : '#e63946',
                  border: `1px solid ${regLoading ? 'rgba(255,255,255,0.07)' : 'transparent'}`,
                  borderRadius: 10, color: regLoading ? '#5a6473' : '#fff',
                  fontSize: 16, fontWeight: 700, letterSpacing: '3px', fontFamily: FONT_DISPLAY,
                  cursor: regLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  boxShadow: regLoading ? 'none' : '0 6px 24px rgba(230,57,70,0.38)',
                  transition: 'background 0.2s, box-shadow 0.2s, color 0.2s, transform 0.1s',
                }}
              >
                {regLoading
                  ? <><div style={{ width: 17, height: 17, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Enviando…</>
                  : <><span>CRIAR CONTA</span><ArrowIcon /></>
                }
              </button>

              {/* Voltar ao login */}
              <div style={{ textAlign: 'center', fontSize: 13, color: '#9ba6b6' }}>
                Já tem conta?{' '}
                <button type="button" className="apex-link"
                  onClick={goLogin}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#e63946', fontFamily: FONT, padding: 0, fontWeight: 700 }}>
                  Fazer login
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Header */}
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, fontWeight: 700, color: '#e63946', letterSpacing: '4px', textTransform: 'uppercase', marginBottom: 8 }}>
                  Bem-vindo de volta
                </div>
                <h1 style={{ fontFamily: FONT_DISPLAY, margin: '0 0 6px', fontSize: 30, fontWeight: 700, color: '#f4f6fa', letterSpacing: '0.5px', lineHeight: 1.05 }}>
                  Acesse sua equipe
                </h1>
                <p style={{ margin: 0, fontSize: 13, color: '#9ba6b6', lineHeight: 1.6 }}>
                  Entre com seu usuário e senha do{' '}
                  <strong style={{ color: '#c8d0dc', fontWeight: 600 }}>ApexDynamics</strong>.
                </p>
              </div>

              {/* Aviso: rodando no navegador (sem Electron) */}
              {!isElectron && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '11px 14px', borderRadius: 10, marginBottom: 16,
                  background: 'rgba(17,138,178,0.10)',
                  border: '1px solid rgba(17,138,178,0.35)',
                  lineHeight: 1.55,
                }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>🖥️</span>
                  <span style={{ fontSize: 12.5, color: '#9fc9dd' }}>
                    <strong style={{ color: '#cfe8f4' }}>Modo visualização (navegador).</strong>{' '}
                    Para fazer login e usar o sistema, abra o aplicativo
                    desktop <strong style={{ color: '#cfe8f4' }}>ApexDynamics</strong>.
                  </span>
                </div>
              )}

              {/* Mensagem erro/sucesso */}
              {message && (
                <div style={{
                  padding: '9px 13px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  marginBottom: 16, lineHeight: 1.5,
                  background: isError ? 'rgba(230,57,70,0.08)' : 'rgba(6,214,160,0.08)',
                  color:      isError ? '#e63946'               : '#06d6a0',
                  border:     `1px solid ${isError ? 'rgba(230,57,70,0.25)' : 'rgba(6,214,160,0.25)'}`,
                }}>
                  {message}
                </div>
              )}

              {/* USUÁRIO */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, color: '#9ba6b6', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
                  Usuário
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <div style={{ position: 'absolute', left: 12, color: userFocus ? '#e63946' : '#5a6473', transition: 'color 0.2s', pointerEvents: 'none' }}>
                    <UserIcon />
                  </div>
                  <input
                    className="apex-input"
                    type="text"
                    placeholder="Nome de usuário"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setUserFocus(true)}
                    onBlur={() => setUserFocus(false)}
                    autoComplete="off" spellCheck={false} maxLength={64}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '11px 14px 11px 36px',
                      background: userFocus ? 'rgba(20,24,34,0.9)' : 'rgba(12,14,22,0.8)',
                      border: `1.5px solid ${userFocus ? '#e63946' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 10, color: '#f4f6fa', fontSize: 14, fontFamily: FONT,
                      boxShadow: userFocus ? '0 0 0 3px rgba(230,57,70,0.12)' : 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
                    }}
                  />
                </div>
              </div>

              {/* SENHA */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, color: '#9ba6b6', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
                  Senha
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <div style={{ position: 'absolute', left: 12, color: passFocus ? '#e63946' : '#5a6473', transition: 'color 0.2s', pointerEvents: 'none' }}>
                    <LockIcon />
                  </div>
                  <input
                    className="apex-input"
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setPassFocus(true)}
                    onBlur={() => setPassFocus(false)}
                    autoComplete="current-password" maxLength={128}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '11px 42px 11px 36px',
                      background: passFocus ? 'rgba(20,24,34,0.9)' : 'rgba(12,14,22,0.8)',
                      border: `1.5px solid ${passFocus ? '#e63946' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 10, color: '#f4f6fa', fontSize: 14, fontFamily: FONT,
                      boxShadow: passFocus ? '0 0 0 3px rgba(230,57,70,0.12)' : 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
                    }}
                  />
                  <button
                    onClick={() => setShowPass(p => !p)}
                    tabIndex={-1} type="button"
                    aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                    style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0, width: 40,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: '#5a6473', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '0 10px 10px 0', transition: 'color 0.2s',
                    }}
                  >
                    <EyeIcon open={showPass} />
                  </button>
                </div>
              </div>

              {/* Lembrar de mim + Esqueceu senha */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <div
                    onClick={() => setRememberMe(p => !p)}
                    style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                      background: rememberMe ? '#e63946' : 'transparent',
                      border: `2px solid ${rememberMe ? '#e63946' : 'rgba(255,255,255,0.15)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    {rememberMe && (
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="2,6 5,9 10,3"/>
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: '#9ba6b6' }}>Lembrar de mim</span>
                </label>
                <button type="button" className="apex-link"
                  onClick={() => window.electronAPI?.openExternal?.(SUPPORT_WHATSAPP)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#e63946', fontFamily: FONT, padding: 0, fontWeight: 600, transition: 'opacity 0.2s' }}>
                  Esqueceu sua senha?
                </button>
              </div>

              {/* Botão ENTRAR */}
              <button
                className="apex-btn"
                onClick={handleLogin}
                disabled={!canSubmit}
                style={{
                  width: '100%', padding: '12px 20px', marginBottom: 20,
                  background: canSubmit ? '#e63946' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${canSubmit ? 'transparent' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 10,
                  color: canSubmit ? '#fff' : '#5a6473',
                  fontSize: 16, fontWeight: 700, letterSpacing: '3px', fontFamily: FONT_DISPLAY,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  boxShadow: canSubmit ? '0 6px 24px rgba(230,57,70,0.38)' : 'none',
                  transition: 'background 0.2s, box-shadow 0.2s, color 0.2s, transform 0.1s',
                }}
              >
                {logging
                  ? <><div style={{ width: 17, height: 17, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Autenticando…</>
                  : <><span>ENTRAR</span><ArrowIcon /></>
                }
              </button>

              {/* Criar conta */}
              <div style={{ textAlign: 'center', marginBottom: 20, fontSize: 13, color: '#9ba6b6' }}>
                Ainda não tem acesso?{' '}
                <button type="button" className="apex-link"
                  onClick={goRegister}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#e63946', fontFamily: FONT, padding: 0, fontWeight: 700 }}>
                  Criar conta
                </button>
              </div>

              {/* Separador */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 18 }} />

              {/* Licença */}
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, color: '#4a5260', letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 2 }}>
                  Licença válida por 7 dias
                </div>
                <div style={{ fontSize: 11, color: '#3a4050' }}>
                  Renovação automática ao abrir o app
                </div>
              </div>

              {/* Links legais — abrem modal in-app (funciona offline) */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                <button type="button" className="apex-link"
                  onClick={() => setLegal('terms')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#e63946', fontFamily: FONT, padding: 0, fontWeight: 600, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <DocIcon /> Termos de Uso
                </button>
                <span style={{ color: '#2b3340' }}>|</span>
                <button type="button" className="apex-link"
                  onClick={() => setLegal('privacy')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#e63946', fontFamily: FONT, padding: 0, fontWeight: 600, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <ShieldIcon /> Política de Privacidade
                </button>
              </div>
            </>
          )}
        </div>

        {/* Rodapé abaixo do card */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <div style={{ width: 20, height: 1, background: 'linear-gradient(90deg, transparent, rgba(230,57,70,0.6))' }} />
          <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: 'rgba(255,255,255,0.22)', letterSpacing: '2.5px', textTransform: 'uppercase' }}>
            APEX DYNAMICS{appVersion ? ` · ${appVersion}` : ''}
          </span>
          <div style={{ width: 20, height: 1, background: 'linear-gradient(90deg, rgba(230,57,70,0.6), transparent)' }} />
        </div>

      </div>

      {/* ── Modal de Termos / Privacidade ── */}
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
            background: 'rgba(14, 16, 24, 0.97)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '82vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 64px rgba(0,0,0,0.55)', fontFamily: FONT,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f0f0f5' }}>
                {legal === 'terms' ? 'Termos de Uso' : 'Política de Privacidade'}
              </h3>
              <button onClick={() => setLegal(null)} style={{
                background: 'none', border: 'none', color: '#8c8ca2',
                fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: '0 4px',
              }}>×</button>
            </div>
            <div style={{
              padding: '18px 20px', overflowY: 'auto', whiteSpace: 'pre-wrap',
              fontSize: 12.5, lineHeight: 1.65, color: '#c3c8d4',
            }}>
              {legal === 'terms' ? APEX_LEGAL.termos : APEX_LEGAL.privacidade}
            </div>
            <div style={{
              padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button onClick={() => setLegal(null)} style={{
                padding: '9px 26px', background: '#e63946', border: 'none',
                borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: FONT,
              }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
