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
const http   = require('http');
const https  = require('https');
const crypto = require('crypto');
const os     = require('os');
const { getHWID } = require('./hwid.cjs');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const APEX_SERVER = 'apexserver-production.up.railway.app';
const APEX_PORT   = 443;

/* ── Estado global de sessão ──────────────────────────────────────── */
let mainWindow        = null;
let sessionToken      = null;
let sessionHwid       = null;
let sseRequest        = null;  // conexão SSE ativa
let sseReconnectTimer = null;  // timer de reconexão após queda
let sseStopped        = false; // true quando parado intencionalmente (ban / logout)

/* ── Estado do servidor de equipe (WebSocket local) ──────────────── */
const TEAM_WS_PORT  = 8765;
const TEAM_HTTP_PORT = 8766;
let   teamWss       = null;   // WebSocketServer instance
let   teamHttpServer = null;  // HTTP server for background polling
const teamDevices   = new Map(); // deviceId → { ws, info }
const pendingQueue  = new Map(); // deviceId → [msg, msg, ...] — mensagens para dispositivos offline
const pushTokens    = new Map(); // deviceId → ExpoPushToken string
let   sessionName   = 'Sessão ApexDynamics';

/* ── Expo Push API — envia notificação real via Firebase/APNs ──── */
function sendExpoPush(pushToken, title, body, data = {}, channelId = 'team', priority = 'high') {
  if (!pushToken) return;
  const payload = JSON.stringify({
    to: pushToken,
    title,
    body,
    sound: 'default',
    priority,
    channelId,
    data,
  });
  console.log('[ExpoPush] Sending to', pushToken.substring(0, 30) + '...', title);
  const req = https.request({
    hostname: 'exp.host',
    port: 443,
    path: '/--/api/v2/push/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log('[ExpoPush] Response:', res.statusCode, body.substring(0, 200)));
  });
  req.on('error', e => console.error('[ExpoPush] Error:', e.message));
  req.write(payload);
  req.end();
}

/** Envia push para todos os devices offline (WS não aberto) */
function pushToOfflineDevices(title, body, data = {}, channelId = 'team', priority = 'high') {
  // Devices que estão no pushTokens mas não têm WS aberto
  for (const [deviceId, token] of pushTokens.entries()) {
    const dev = teamDevices.get(deviceId);
    if (!dev || dev.ws.readyState !== 1) {
      sendExpoPush(token, title, body, data, channelId, priority);
    }
  }
}

/** Retorna o IP local da máquina na rede Wi-Fi/LAN */
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

/** Envia JSON para um WebSocket, ignora se fechado */
function wsSend(ws, obj) {
  try {
    if (ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    return false;
  } catch { return false; }
}

/** Broadcast para todos os dispositivos conectados + desktop renderer.
 *  Mensagens de chat e emergência também são enfileiradas para devices offline. */
function teamBroadcast(msg, excludeWs = null) {
  const str = JSON.stringify(msg);
  for (const [deviceId, { ws }] of teamDevices.entries()) {
    try {
      if (ws !== excludeWs && ws.readyState === 1) {
        ws.send(str);
      } else if (ws !== excludeWs) {
        // Device está conectado mas WS não está aberto — enfileira
        queueForDevice(deviceId, msg);
      }
    } catch {
      queueForDevice(deviceId, msg);
    }
  }
  // Enfileira para devices que já se desconectaram (removidos do teamDevices)
  for (const [deviceId] of pendingQueue.entries()) {
    if (!teamDevices.has(deviceId)) {
      queueForDevice(deviceId, msg);
    }
  }
  // Envia também para o renderer do desktop
  mainWindow?.webContents.send('team:event', msg);
}

/** Inicia o servidor WebSocket da equipe */
function startTeamServer() {
  if (teamWss) return;
  teamWss = new WebSocketServer({ port: TEAM_WS_PORT });

  teamWss.on('connection', (ws) => {
    let deviceId = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {

        // Dispositivo se identifica ao conectar
        case 'device:identify': {
          deviceId = msg.deviceId || crypto.randomUUID();
          teamDevices.set(deviceId, { ws, info: {
            deviceId,
            name:     msg.deviceName || 'Desconhecido',
            role:     msg.deviceRole || 'auxiliar',
            platform: msg.platform   || 'mobile',
            connectedAt: new Date().toISOString(),
            battery:  msg.battery    ?? null,
          }});
          // Armazena push token para notificações quando offline
          if (msg.pushToken) {
            pushTokens.set(deviceId, msg.pushToken);
            console.log('[Push] Token registrado para', deviceId, ':', msg.pushToken.substring(0, 30) + '...');
          }
          // Confirma conexão
          wsSend(ws, { type: 'device:welcome', deviceId, sessionName,
            devicesOnline: [...teamDevices.values()].map(d => d.info) });
          // Notifica todos (inclusive desktop)
          teamBroadcast({ type: 'team:deviceJoined',
            device: teamDevices.get(deviceId).info }, ws);
          // Atualiza desktop com lista
          mainWindow?.webContents.send('team:event', {
            type: 'team:devicesUpdate',
            devices: [...teamDevices.values()].map(d => d.info),
          });
          break;
        }

        // Heartbeat / ping
        case 'device:ping': {
          if (deviceId && teamDevices.has(deviceId)) {
            teamDevices.get(deviceId).info.battery = msg.battery ?? null;
            teamDevices.get(deviceId).info.lastSeen = new Date().toISOString();
          }
          wsSend(ws, { type: 'device:pong' });
          break;
        }

        // Medição enviada pelo celular — NÃO aplica, manda notificação pro desktop
        case 'measurement:submit': {
          const measurementId = msg.id || crypto.randomUUID();
          // Confirma recebimento para o celular
          wsSend(ws, { type: 'measurement:received', measurementId, status: 'pending' });
          // Envia ao desktop para aprovação
          mainWindow?.webContents.send('team:event', {
            type:    'measurement:pending',
            measurement: { ...msg, id: measurementId },
          });
          break;
        }

        // Cronômetro enviado
        case 'timer:submit': {
          const timerId = msg.id || crypto.randomUUID();
          wsSend(ws, { type: 'timer:received', timerId });
          mainWindow?.webContents.send('team:event', {
            type:  'timer:pending',
            timer: { ...msg, id: timerId },
          });
          break;
        }

        // Mensagem de chat
        case 'chat:message': {
          // Broadcast para todos (outros celulares + desktop)
          teamBroadcast({ ...msg, id: msg.id || crypto.randomUUID() }, ws);
          break;
        }

        default: break;
      }
    });

    ws.on('close', () => {
      if (!deviceId) return;
      const info = teamDevices.get(deviceId)?.info;
      teamDevices.delete(deviceId);
      // Garante que o deviceId continua na pendingQueue para receber mensagens futuras
      if (!pendingQueue.has(deviceId)) pendingQueue.set(deviceId, []);
      teamBroadcast({ type: 'team:deviceLeft', device: info });
      mainWindow?.webContents.send('team:event', {
        type: 'team:devicesUpdate',
        devices: [...teamDevices.values()].map(d => d.info),
      });
    });

    ws.on('error', () => {});
  });

  teamWss.on('error', (err) => {
    console.error('[TeamWS] erro:', err.message);
  });
}

/** Para o servidor WebSocket da equipe */
function stopTeamServer() {
  if (!teamWss) return;
  for (const { ws } of teamDevices.values()) { try { ws.terminate(); } catch {} }
  teamDevices.clear();
  teamWss.close();
  teamWss = null;
  if (teamHttpServer) { teamHttpServer.close(); teamHttpServer = null; }
}

/** Enfileira mensagem para um dispositivo offline (máx 50 por device) */
function queueForDevice(deviceId, msg) {
  if (!pendingQueue.has(deviceId)) pendingQueue.set(deviceId, []);
  const q = pendingQueue.get(deviceId);
  q.push({ ...msg, _queuedAt: Date.now() });
  if (q.length > 50) q.shift(); // mantém últimas 50
}

/** Enfileira msg para TODOS os dispositivos cujo WS não está aberto */
function queueForOfflineDevices(msg) {
  // Todos deviceIds que já se conectaram alguma vez
  const knownIds = new Set([...pendingQueue.keys(), ...teamDevices.keys()]);
  for (const id of knownIds) {
    const dev = teamDevices.get(id);
    if (!dev || dev.ws.readyState !== 1) {
      queueForDevice(id, msg);
    }
  }
}

/** Inicia servidor HTTP para polling de background (porta 8766) */
function startTeamHttpServer() {
  if (teamHttpServer) return;
  teamHttpServer = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const url = new URL(req.url, `http://localhost:${TEAM_HTTP_PORT}`);

    // GET /pending?deviceId=xxx — retorna e limpa mensagens pendentes
    if (req.method === 'GET' && url.pathname === '/pending') {
      const did = url.searchParams.get('deviceId');
      if (!did) { res.writeHead(400); res.end('{"error":"deviceId required"}'); return; }
      const msgs = pendingQueue.get(did) || [];
      pendingQueue.set(did, []); // limpa após entregar
      console.log('[HTTP] /pending for', did, '→', msgs.length, 'messages');
      res.writeHead(200);
      res.end(JSON.stringify({ messages: msgs }));
      return;
    }

    // GET /ping — health check
    if (req.method === 'GET' && url.pathname === '/ping') {
      res.writeHead(200);
      res.end('{"ok":true}');
      return;
    }

    res.writeHead(404);
    res.end('{"error":"not found"}');
  });

  teamHttpServer.on('error', (err) => {
    console.error('[TeamHTTP] erro:', err.message);
  });

  teamHttpServer.listen(TEAM_HTTP_PORT, () => {
    console.log('[TeamHTTP] Servidor HTTP de polling em porta', TEAM_HTTP_PORT);
  });
}

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

/* ── IPC: Equipe / Team WebSocket ──────────────────────────────────── */

/** Retorna info do servidor (IP, porta, QR code, dispositivos conectados) */
ipcMain.handle('team:getServerInfo', async () => {
  const ip  = getLocalIP();
  const url = `ws://${ip}:${TEAM_WS_PORT}`;
  const qrData = JSON.stringify({ wsUrl: url, sessionName });
  let qrDataUrl = null;
  try { qrDataUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2 }); } catch {}
  return {
    ip, port: TEAM_WS_PORT, url, sessionName, qrDataUrl,
    devices: [...teamDevices.values()].map(d => d.info),
    running: !!teamWss,
  };
});

/** Atualiza nome da sessão */
ipcMain.handle('team:setSessionName', (_e, name) => {
  sessionName = name || 'Sessão ApexDynamics';
  return { ok: true };
});

/** Desktop envia mensagem de chat */
ipcMain.handle('team:sendChatMessage', (_e, msg) => {
  const full = { type: 'chat:message', id: crypto.randomUUID(),
    from: { deviceId: 'desktop', name: msg.senderName || 'Desktop', role: 'engenheiro', platform: 'desktop' },
    timestamp: new Date().toISOString(), content: { text: msg.text } };
  console.log('[TeamChat] broadcasting to', teamDevices.size, 'devices:', full.content.text);
  teamBroadcast(full);
  // Push notification para devices offline
  const sender = msg.senderName || 'Desktop';
  pushToOfflineDevices(`💬 ${sender}`, msg.text || 'Nova mensagem', { type: 'chat' });
  return { ok: true };
});

/** Desktop aprova uma medição → notifica celular + retorna dados para o renderer */
ipcMain.handle('team:approveMeasurement', (_e, { measurementId, deviceId: targetDeviceId }) => {
  const dev = teamDevices.get(targetDeviceId);
  const msg = { type: 'measurement:approved', measurementId, approvedAt: new Date().toISOString() };
  const sentOk = dev ? wsSend(dev.ws, msg) : false;
  if (!sentOk) {
    queueForDevice(targetDeviceId, msg);
    const token = pushTokens.get(targetDeviceId);
    if (token) sendExpoPush(token, '✅ Medição Aprovada', 'Sua medição foi aprovada pelo engenheiro.');
  }
  return { ok: true };
});

/** Desktop ignora uma medição → notifica celular */
ipcMain.handle('team:dismissMeasurement', (_e, { measurementId, deviceId: targetDeviceId }) => {
  const dev = teamDevices.get(targetDeviceId);
  const msg = { type: 'measurement:dismissed', measurementId };
  const sentOk = dev ? wsSend(dev.ws, msg) : false;
  if (!sentOk) {
    queueForDevice(targetDeviceId, msg);
    const token = pushTokens.get(targetDeviceId);
    if (token) sendExpoPush(token, '❌ Medição Dispensada', 'Sua medição foi dispensada.');
  }
  return { ok: true };
});

/** Desktop aprova um cronômetro → notifica celular */
ipcMain.handle('team:approveTimer', (_e, { timerId, deviceId: targetDeviceId }) => {
  const dev = teamDevices.get(targetDeviceId);
  if (dev) wsSend(dev.ws, { type: 'timer:approved', timerId });
  return { ok: true };
});

/** Desktop atribui perfis a um dispositivo → notifica celular */
ipcMain.handle('team:assignDevice', (_e, { deviceId: targetDeviceId, profileId, profileName }) => {
  const dev = teamDevices.get(targetDeviceId);
  if (dev) {
    // profileId pode ser: null (remover), array de {id,name}, ou string legada
    wsSend(dev.ws, {
      type: 'device:profileAssigned',
      profiles: profileId, // null ou [{id, name}, ...]
    });
  }
  return { ok: true };
});

/** Desktop envia alerta de emergência para TODOS os celulares */
ipcMain.handle('team:sendEmergency', (_e, { message }) => {
  console.log('[Emergency] Sending to', teamDevices.size, 'devices:', message);
  const alertMsg = message || 'EMERGÊNCIA';
  const alert = {
    type: 'emergency:alert',
    id: crypto.randomUUID(),
    message: alertMsg,
    timestamp: new Date().toISOString(),
  };
  // Envia via WebSocket para dispositivos conectados
  let sent = 0;
  for (const [deviceId, { ws }] of teamDevices.entries()) {
    const ok = wsSend(ws, alert);
    console.log('[Emergency] →', deviceId, 'ws.readyState:', ws.readyState, ok ? 'OK' : 'FAIL');
    if (!ok) queueForDevice(deviceId, alert);
    sent++;
  }
  // Enfileira para devices desconectados
  for (const [deviceId] of pendingQueue.entries()) {
    if (!teamDevices.has(deviceId)) {
      queueForDevice(deviceId, alert);
    }
  }
  // PUSH NOTIFICATION para TODOS os devices (inclusive os com WS aberto, para garantir)
  for (const [deviceId, token] of pushTokens.entries()) {
    sendExpoPush(token, '🚨 EMERGÊNCIA', alertMsg,
      { type: 'emergency', id: alert.id },
      'emergency', 'high');
  }
  console.log('[Emergency] WS sent:', sent, '| Push sent to:', pushTokens.size, 'tokens');
  return { ok: true, sent };
});

/** Inicia/para servidor manualmente (o app inicia automático, mas pode ser parado pelo usuário) */
ipcMain.handle('team:startServer', () => { startTeamServer(); return { ok: true }; });
ipcMain.handle('team:stopServer',  () => { stopTeamServer();  return { ok: true }; });

/* ── App lifecycle ─────────────────────────────────────────────────── */

app.whenReady().then(() => {
  createWindow();
  startTeamServer();
  startTeamHttpServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  stopTeamServer();
  if (process.platform !== 'darwin') app.quit();
});
