/**
 * electron/main.cjs
 *
 * Processo principal do Electron para o Apex Race Telemetry.
 * Inclui detecção de HWID, validação de licença e sistema de
 * certificado de sessão RS256 com expiração por dias corridos de calendário.
 *
 * Fluxo de autenticação:
 *  1. Login → servidor retorna JWT token
 *  2. Main solicita certificado RS256 ao servidor (válido 5 dias corridos)
 *  3. Certificado armazenado localmente (localStorage do renderer)
 *  4. Nas próximas aberturas: verifica assinatura RS256 + expiração localmente
 *  5. Após 5 dias: requer internet para renovar ou bloqueia
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path   = require('path');
const https  = require('https');
const crypto = require('crypto');
const { getHWID } = require('./hwid.cjs');

const APEX_SERVER = 'apexserver-production.up.railway.app';
const APEX_PORT   = 443;

/* ── Estado global de sessão ──────────────────────────────────────── */
let mainWindow        = null;
let sessionToken      = null;
let sessionHwid       = null;
let sseRequest        = null;  // conexão SSE ativa
let sseReconnectTimer = null;  // timer de reconexão após queda
let sseStopped        = false; // true quando parado intencionalmente (ban / logout)

/** Chave pública RSA embutida — usada para verificar certificados RS256 localmente. */
const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArMpSSe3lP1eM64JMut9A
A5dOhhMruIu3Z6yzOVnNJl/M2n55SL8VFkg/TKUhQx7rJx+Xj+w+IFTRk1d69ic/
nWyTzWdhkIbgZmAw1zcHrjlqVDkV+pr8rCDExgTu0IDnZVwR5JYuUOeA7oMll3ym
lq1hsEGuujOZIdYk9wAtbOc+RYBjzQRvMcbzC2LLHW0wW4j978l7Y65rAIRtMRXO
rA2TwfXsDUn6WMgM7qEgyl0QR7kPMBqrhpjV87SE5XlajmYkXHyc+YXA5eUnbWm9
FPvWGbcSMId6gDHdhj7ZWQayQoYEIRFmtSqHqHqx8k4zOMPJGf3QScSOnqzqBrrq
zQIDAQAB
-----END PUBLIC KEY-----`;

/** Em dev (não empacotado), carrega localhost; em produção, carrega o build */
const isDev = !app.isPackaged;

/* ── Helper: HTTPS POST genérico ──────────────────────────────────── */

/**
 * Faz uma requisição HTTPS POST ao ApexServer.
 * @returns {Promise<{ ok: boolean, data?: object, offline?: boolean, error?: string }>}
 */
function httpsPost(path, body, extraHeaders = {}) {
  return new Promise((resolve) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: APEX_SERVER,
      port:     APEX_PORT,
      path,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent':     'ApexDynamics/1.0.0',
        ...extraHeaders,
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: true, data: JSON.parse(data) });
        } catch {
          resolve({ ok: false, offline: false, error: 'Resposta inválida do servidor.' });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, offline: true, error: 'Tempo limite excedido. Verifique sua conexão.' });
    });

    req.on('error', (err) => {
      const offline = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(err.code);
      resolve({ ok: false, offline, error: offline ? 'Sem conexão com a internet.' : 'Erro de rede.' });
    });

    req.write(bodyStr);
    req.end();
  });
}

/* ── SSE: notificação instantânea de ban ───────────────────────────── */

/**
 * Abre uma conexão SSE persistente com o servidor.
 * Quando o admin bane o usuário, o servidor empurra o evento imediatamente
 * sem nenhum polling — zero requisições periódicas.
 */
function startSSE() {
  stopSSE();
  sseStopped = false;
  if (!sessionToken || !mainWindow) return;

  const options = {
    hostname: APEX_SERVER,
    port:     APEX_PORT,
    path:     '/api/events/stream',
    method:   'GET',
    headers:  {
      'Authorization': `Bearer ${sessionToken}`,
      'Accept':        'text/event-stream',
      'Cache-Control': 'no-cache',
      'User-Agent':    'ApexDynamics/1.0.0',
    },
    timeout: 0, // sem timeout — conexão persistente
  };

  const req = https.request(options, (res) => {
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // preserva linha incompleta

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.type === 'banned') {
            sseStopped = true;
            stopSSE();
            mainWindow?.webContents.send('license:forcedLogout', { reason: 'banned' });
          }
        } catch { /* ignora linhas mal formadas */ }
      }
    });

    res.on('end', () => {
      // Servidor fechou a conexão — reconecta em 5s (se não foi por ban/logout)
      if (!sseStopped) scheduleSSEReconnect();
    });
  });

  req.on('error', () => {
    // Queda de rede — reconecta em 5s
    if (!sseStopped) scheduleSSEReconnect();
  });

  req.end();
  sseRequest = req;
}

/** Para a conexão SSE e cancela qualquer reconexão pendente. */
function stopSSE() {
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }
  if (sseRequest) {
    sseRequest.destroy();
    sseRequest = null;
  }
}

/** Agenda reconexão após queda de rede (5 segundos). */
function scheduleSSEReconnect() {
  stopSSE();
  sseReconnectTimer = setTimeout(() => {
    if (!sseStopped && sessionToken && mainWindow) startSSE();
  }, 5000);
}

/* ── Janela principal ──────────────────────────────────────────────── */

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Apex Race Telemetry',
    icon: isDev
      ? path.join(__dirname, '..', 'public', 'icon.ico')
      : path.join(process.resourcesPath, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      devTools: true,
    },
    backgroundColor: '#0a0a0f',
    show: false,
  });

  if (!isDev) {
    Menu.setApplicationMenu(null);
  }

  if (isDev) {
    win.loadURL('http://127.0.0.1:3000');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow = win;

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('closed', () => {
    stopSSE();
    mainWindow = null;
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://127.0.0.1') && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Zoom global: Ctrl++ / Ctrl+= aumenta, Ctrl+- diminui, Ctrl+0 reseta
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control) return;
    const key = input.key;
    if (key === '+' || key === '=' || key === 'Add') {
      const current = win.webContents.getZoomFactor();
      win.webContents.setZoomFactor(Math.min(current + 0.1, 3.0));
      event.preventDefault();
    } else if (key === '-' || key === 'Subtract') {
      const current = win.webContents.getZoomFactor();
      win.webContents.setZoomFactor(Math.max(current - 0.1, 0.3));
      event.preventDefault();
    } else if (key === '0') {
      win.webContents.setZoomFactor(1.0);
      event.preventDefault();
    }
  });

  if (!isDev) {
    win.webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key === 'I') ||
        (input.control && input.shift && input.key === 'J') ||
        (input.control && input.shift && input.key === 'C') ||
        (input.control && input.key === 'U')
      ) {
        event.preventDefault();
      }
    });
  }
}

/* ── IPC: HWID ─────────────────────────────────────────────────────── */

ipcMain.handle('license:getHWID', async () => {
  try { return await getHWID(); }
  catch { return null; }
});

/* ── IPC: Login + buscar certificado RS256 ─────────────────────────── */

ipcMain.handle('license:login', async (_event, { username, password }) => {
  try {
    const hwid = await getHWID();
    if (!hwid) {
      return { success: false, message: 'Não foi possível detectar o hardware desta máquina.' };
    }

    // 1. Autenticar no servidor
    const loginRes = await httpsPost('/api/auth/login', { username, password, hwid });

    if (!loginRes.ok) {
      return { success: false, message: loginRes.error || 'Erro de conexão.', offline: loginRes.offline };
    }

    const loginData = loginRes.data;
    if (!loginData.success) {
      return loginData; // propaga mensagem do servidor (ex: banido, HWID inválido)
    }

    // 2. Solicitar certificado RS256 imediatamente após login
    const certRes = await httpsPost(
      '/api/auth/session-certificate',
      { hwid },
      { Authorization: `Bearer ${loginData.token}` }
    );

    const certificate = (certRes.ok && certRes.data?.success) ? certRes.data.certificate : null;

    // Armazena sessão e abre canal SSE para notificação instantânea de ban
    sessionToken = loginData.token;
    sessionHwid  = hwid;
    startSSE();

    return {
      ...loginData,
      certificate,
    };
  } catch {
    return { success: false, message: 'Erro ao processar login.' };
  }
});

/* ── IPC: Verificar certificado RS256 localmente ───────────────────── */

/**
 * Verifica a assinatura RS256 e a expiração por dias corridos de calendário.
 *
 * Expiração: compara a data atual (UTC, meia-noite) com o campo `exp` do certificado.
 * Se o usuário adulterou o payload, a verificação de assinatura falha.
 *
 * @returns {{ valid: boolean, expired?: boolean, payload?: object, error?: string }}
 */
ipcMain.handle('license:checkCertificate', async (_event, { certificate }) => {
  try {
    if (!certificate || typeof certificate !== 'string') {
      return { valid: false, error: 'Certificado ausente.' };
    }

    const parts = certificate.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Formato de certificado inválido.' };
    }

    const [headerB64, payloadB64, sigB64] = parts;

    // Verificar assinatura RS256
    const dataToVerify = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature    = Buffer.from(sigB64, 'base64url');

    const signatureOk = crypto.verify(
      'sha256',
      dataToVerify,
      { key: RSA_PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PADDING },
      signature
    );

    if (!signatureOk) {
      return { valid: false, error: 'Assinatura do certificado inválida.' };
    }

    // Decodificar payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    // Verificar HWID: o certificado deve pertencer a esta máquina
    if (payload.hwid) {
      try {
        const currentHwid = await getHWID();
        if (currentHwid && payload.hwid !== currentHwid) {
          return { valid: false, error: 'Certificado não pertence a esta máquina.' };
        }
      } catch { /* se getHWID falhar, pula a verificação */ }
    }

    // Verificar expiração por dia de calendário (UTC meia-noite)
    const now = new Date();
    const todayMidnightUTC = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    const certExpiryMs = payload.exp * 1000;

    if (certExpiryMs <= todayMidnightUTC) {
      return { valid: true, expired: true, payload };
    }

    return { valid: true, expired: false, payload };
  } catch (err) {
    return { valid: false, error: `Erro ao verificar certificado: ${err.message}` };
  }
});

/* ── IPC: Renovar certificado RS256 usando token JWT ───────────────── */

/**
 * Tenta renovar o certificado de sessão usando o JWT token armazenado.
 * Chamado quando o certificado expirou e há internet disponível.
 *
 * @returns {{ success: boolean, certificate?: string, message?: string, offline?: boolean, banned?: boolean }}
 */
ipcMain.handle('license:requestCertificate', async (_event, { token }) => {
  try {
    if (!token) {
      return { success: false, message: 'Token de sessão não encontrado. Faça login novamente.' };
    }

    const hwid = await getHWID();
    if (!hwid) {
      return { success: false, message: 'Não foi possível detectar o hardware desta máquina.' };
    }

    const res = await httpsPost(
      '/api/auth/session-certificate',
      { hwid },
      { Authorization: `Bearer ${token}` }
    );

    if (!res.ok) {
      return { success: false, message: res.error, offline: res.offline };
    }

    const data = res.data;

    if (!data.success) {
      // Verifica se é ban ou token expirado
      const banned = data.message?.toLowerCase().includes('banid') ||
                     data.message?.toLowerCase().includes('inativ');
      return { success: false, message: data.message, banned, offline: false };
    }

    return { success: true, certificate: data.certificate };
  } catch {
    return { success: false, message: 'Erro ao solicitar certificado.', offline: false };
  }
});

/* ── IPC: Logout — fecha SSE e limpa sessão ────────────────────────── */

ipcMain.handle('license:logout', () => {
  sseStopped = true;
  stopSSE();
  sessionToken = null;
  sessionHwid  = null;
  return { success: true };
});

/* ── IPC: Validar APEX hash (mantido para compatibilidade) ─────────── */

ipcMain.handle('license:validate', (_event, { apexHash, hwid }) => {
  return httpsPost('/api/auth/validate', { apexHash, hwid })
    .then((res) => {
      if (!res.ok) return { success: false, valid: false, message: res.error };
      return res.data;
    });
});

/* ── App lifecycle ─────────────────────────────────────────────────── */

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
