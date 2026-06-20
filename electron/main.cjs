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

const { app, BrowserWindow, Menu, ipcMain, Notification, dialog, safeStorage } = require('electron');
const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const https  = require('https');
const crypto = require('crypto');
const os     = require('os');
const { getHWID } = require('./hwid.cjs');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const APEX_SERVER = 'api.apexdynamics.store';
const APEX_PORT   = 443;

/* ── Estado global de sessão ──────────────────────────────────────── */
let mainWindow        = null;
let sessionToken      = null;
let sessionHwid       = null;
let sseRequest        = null;  // conexão SSE ativa
let sseReconnectTimer = null;  // timer de reconexão após queda
let sseStopped        = false; // true quando parado intencionalmente (ban / logout)

/* ── Chat cloud: polling + histórico ─────────────────────────────── */
let chatPollTimer   = null;
let lastChatPollAt  = null; // ISO string da última mensagem vista no cloud

/* ── Estado do servidor de equipe (WebSocket local) ──────────────── */
const TEAM_WS_PORT  = 8765;
const TEAM_HTTP_PORT = 8766;
let   teamWss       = null;   // WebSocketServer instance
let   teamHttpServer = null;  // HTTP server for background polling
const teamDevices   = new Map(); // deviceId → { ws, info }
const pendingQueue          = new Map(); // deviceId → [msg, msg, ...] — mensagens para dispositivos offline
const disconnectTimers      = new Map(); // deviceId → setTimeout — grace period antes de anunciar "saiu"
const pushTokens            = new Map(); // deviceId → ExpoPushToken string
const deviceAssignmentStore = new Map(); // deviceId → { profiles, assignedAt } — última atribuição conhecida

/* ── Persistência da pendingQueue em disco ───────────────────────── */
const PENDING_QUEUE_FILE = () => path.join(app.getPath('userData'), 'pending-queue.json');

function savePendingQueue() {
  try {
    const obj = {};
    for (const [deviceId, msgs] of pendingQueue.entries()) {
      if (msgs.length > 0) obj[deviceId] = msgs;
    }
    fs.writeFileSync(PENDING_QUEUE_FILE(), JSON.stringify(obj), 'utf8');
  } catch { /* não-crítico */ }
}

function loadPendingQueue() {
  try {
    const raw = fs.readFileSync(PENDING_QUEUE_FILE(), 'utf8');
    const obj = JSON.parse(raw);
    for (const [deviceId, msgs] of Object.entries(obj)) {
      if (Array.isArray(msgs) && msgs.length > 0) pendingQueue.set(deviceId, msgs);
    }
    console.log('[PendingQueue] Carregados', pendingQueue.size, 'devices da fila persistida');
  } catch { /* arquivo pode não existir na primeira execução */ }
}
let   sessionName   = 'Sessão ApexDynamics';
let   pairingToken  = crypto.randomBytes(16).toString('hex'); // regenerado a cada inicialização

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

/** Push dedicado de emergência — máxima prioridade, som de alarme, TTL zero */
function sendEmergencyPush(pushToken, message, alertId) {
  if (!pushToken) return;
  const payload = JSON.stringify({
    to: pushToken,
    title: '🚨 EMERGÊNCIA',
    body: message,
    sound: 'alarm.wav',   // corresponde ao arquivo bundled no app
    priority: 'high',
    ttl: 0,               // entrega imediata ou descarta (não enfileira)
    channelId: 'emergency',
    data: { type: 'emergency', id: alertId },
    android: {
      priority: 'max',
      channelId: 'emergency',
      vibrationPattern: [0, 800, 200, 800, 200, 800],
    },
  });
  const req = https.request({
    hostname: 'exp.host', port: 443,
    path: '/--/api/v2/push/send', method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log('[EmergencyPush] Response:', res.statusCode, body.substring(0, 200)));
  });
  req.on('error', e => console.error('[EmergencyPush] Error:', e.message));
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

/**
 * Envia push notification via cloud para um device que não está na LAN
 * (e portanto não tem push token registrado localmente).
 * mobileDeviceId = UUID gerado pelo app mobile (AsyncStorage), que o servidor
 * armazena em users.mobile_device_id.
 */
function cloudNotifyDevice(mobileDeviceId, title, body, data = {}) {
  if (!sessionToken || !mobileDeviceId) return;
  cloudRequest('POST', '/api/team/notify-device', { mobileDeviceId, title, body, data }).catch(() => {});
}

/** Retorna o IP local da máquina na rede Wi-Fi/LAN real (ignora adaptadores virtuais) */
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  // Padrões de adaptadores virtuais/VPN — não são acessíveis pelo celular na LAN
  const VIRTUAL = /virtualbox|vmware|hyper.?v|vethernet|tap.windows|openvpn|radmin|tunneled|isatap|teredo|6to4|pseudo|loopback adapter/i;

  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (VIRTUAL.test(name)) continue;
    for (const iface of addrs) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const isWifi = /wi.?fi|wireless|wlan/i.test(name);
      candidates.push({ address: iface.address, isWifi, name });
    }
  }
  // Prefere Wi-Fi; fallback para o primeiro candidato não-virtual
  const wifi = candidates.find(c => c.isWifi);
  if (wifi) return wifi.address;
  if (candidates.length > 0) return candidates[0].address;
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
          // Valida token de pareamento (dispositivos sem token são rejeitados)
          if (msg.pairingToken !== pairingToken) {
            wsSend(ws, { type: 'device:error', reason: 'invalid_token',
              message: 'Token de pareamento inválido. Reescaneie o QR code.' });
            setTimeout(() => ws.terminate(), 300);
            return;
          }
          deviceId = msg.deviceId || crypto.randomUUID();

          // Se havia um timer de grace period pendente, cancela — reconexão silenciosa
          const silentReconnect = disconnectTimers.has(deviceId);
          if (silentReconnect) {
            clearTimeout(disconnectTimers.get(deviceId));
            disconnectTimers.delete(deviceId);
          }

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
          // Re-envia atribuição de perfil se existia antes do device desconectar
          const storedAssignment = deviceAssignmentStore.get(deviceId);
          if (storedAssignment) {
            wsSend(ws, { type: 'device:profileAssigned', profiles: storedAssignment.profiles });
          }
          // Só anuncia "entrou" se não for uma reconexão silenciosa (app fechou/abriu rapidamente)
          if (!silentReconnect) {
            teamBroadcast({ type: 'team:deviceJoined',
              device: teamDevices.get(deviceId).info }, ws);
          }
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

        // Indicador de digitação — broadcast para desktop e outros celulares
        case 'chat:typing': {
          const typingInfo = { type: 'chat:typing', from: teamDevices.get(deviceId)?.info || { deviceId } };
          teamBroadcast(typingInfo, ws);
          mainWindow?.webContents.send('team:event', typingInfo);
          break;
        }

        // Mensagem de chat
        case 'chat:message': {
          const msgWithId = { ...msg, id: msg.id || crypto.randomUUID() };
          // Broadcast para todos (outros celulares + desktop)
          teamBroadcast(msgWithId, ws);
          // Bridge para cloud — persiste a mensagem e a torna disponível off-LAN
          if (sessionToken && msgWithId.content?.text) {
            const alias = msgWithId.from?.name
              ? `${msgWithId.from.name}${msgWithId.from.role ? ` (${msgWithId.from.role})` : ''}`
              : null;
            cloudRequest('POST', '/api/team/messages', {
              content:     msgWithId.content.text,
              senderAlias: alias,
              clientId:    msgWithId.id,
            }).catch(() => {});
          }
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
      // Atualiza lista imediatamente, mas anuncia "saiu" só após grace period de 6s
      // (evita spam quando o app é fechado e reaberto rapidamente)
      mainWindow?.webContents.send('team:event', {
        type: 'team:devicesUpdate',
        devices: [...teamDevices.values()].map(d => d.info),
      });
      const GRACE_MS = 6000;
      disconnectTimers.set(deviceId, setTimeout(() => {
        disconnectTimers.delete(deviceId);
        teamBroadcast({ type: 'team:deviceLeft', device: info });
        mainWindow?.webContents.send('team:event', {
          type: 'team:devicesUpdate',
          devices: [...teamDevices.values()].map(d => d.info),
        });
      }, GRACE_MS));
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
  savePendingQueue();
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

    // GET /pending?deviceId=xxx&token=yyy — retorna e limpa mensagens pendentes.
    // Exige o pairingToken da sessão (mesmo do QR/WebSocket) para impedir que
    // outro dispositivo na LAN drene a fila de um device só sabendo o deviceId.
    if (req.method === 'GET' && url.pathname === '/pending') {
      const did   = url.searchParams.get('deviceId');
      const token = url.searchParams.get('token');
      if (!did) { res.writeHead(400); res.end('{"error":"deviceId required"}'); return; }
      if (token !== pairingToken) {
        res.writeHead(401); res.end('{"error":"invalid_token"}'); return;
      }
      const msgs = pendingQueue.get(did) || [];
      pendingQueue.set(did, []); // limpa após entregar
      if (msgs.length > 0) savePendingQueue();
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

/** Chave pública RSA embutida — usada para verificar certificados RS256 localmente.
 *  Gerada em FASE 2 junto com a chave privada no ApexServer (Oracle Cloud).
 *  Certificados válidos por 7 dias corridos.
 */
const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqMwAeUvphxb/cDQdFucE
60OR+kad7c6xAGfA4vPlh0PsMb3mpHLENdedAequHx4Mzg5iYkO/ZsycsEbIyK7g
Sgo+hsUSAraHlTXSEsP7x2hQi5z9u+H01Zc0LioQFs4g6pqrL2LSVTgrsDIPn3aL
5ku4/Z7csIhBv10U1TCLuV/m56OxffrxH2fr2oelF1sUleTwPExnqKH1bhkD1SQK
2LflKrGodwLzHOPIyUH+pJ8Pg6xlFmZlu4I6bwBquKe3R9AxD7qj1vyHv77B0agB
TiyxZ9VXTbqRLiOA/e4Ui+H6qADijfRsVxXJkz7hFb8BbhTtP4c8VTsKJcmhI2nK
BwIDAQAB
-----END PUBLIC KEY-----`;

/** Em dev (não empacotado), carrega localhost; em produção, carrega o build */
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// Em produção, silencia logs informativos do processo principal (mantém warn/error
// para diagnóstico). Evita poluição e vazamento de detalhes internos.
if (!isDev) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

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
        'User-Agent':     `ApexDynamics/${app.getVersion()}`,
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

/** Requisição HTTPS GET simples para o ApexServer. */
function httpsGet(path, extraHeaders = {}) {
  return new Promise((resolve) => {
    const options = {
      hostname: APEX_SERVER, port: APEX_PORT, path, method: 'GET',
      headers: { 'User-Agent': `ApexDynamics/${app.getVersion()}`, ...extraHeaders },
      timeout: 8000,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ ok: true, data: JSON.parse(data) }); }
        catch { resolve({ ok: false, offline: false, error: 'Resposta inválida.' }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, offline: true, error: 'Timeout.' }); });
    req.on('error', (err) => {
      const offline = ['ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ECONNRESET'].includes(err.code);
      resolve({ ok: false, offline, error: offline ? 'Sem conexão.' : 'Erro de rede.' });
    });
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
      'User-Agent':    `ApexDynamics/${app.getVersion()}`,
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
          if (payload.type === 'entitlements_changed' || payload.type === 'import_config_changed') {
            // Admin mudou abas ou config de importação — renova o certificado
            // imediatamente para aplicar sem o cliente reiniciar.
            refreshCertificateBackground();
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

/* ── Chat cloud helpers ────────────────────────────────────────────── */

/** Registra o pairingToken do desktop no servidor para que mobiles off-LAN possam usá-lo. */
async function registerRelayToken() {
  if (!sessionToken) return;
  try {
    await cloudRequest('POST', '/api/team/register-relay-token', { relayToken: pairingToken });
    console.log('[relay] token registrado na nuvem');
  } catch { /* silencioso — falha de rede */ }
}

/** Carrega o histórico de mensagens do cloud e envia ao renderer. */
async function loadChatHistory() {
  if (!sessionToken || !mainWindow) return;
  try {
    const res = await cloudRequest('GET', '/api/team/messages?limit=100');
    if (res?.success && Array.isArray(res.messages) && res.messages.length > 0) {
      mainWindow.webContents.send('team:event', { type: 'chat:history', messages: res.messages });
      lastChatPollAt = res.messages[res.messages.length - 1].created_at;
    }
  } catch { /* silencioso */ }
}

/** Inicia polling de novas mensagens cloud a cada 15 s. */
function startChatPolling() {
  stopChatPolling();
  chatPollTimer = setInterval(async () => {
    if (!sessionToken || !mainWindow) return;
    try {
      const q = lastChatPollAt
        ? `?since=${encodeURIComponent(lastChatPollAt)}&limit=50`
        : '?limit=50';
      const res = await cloudRequest('GET', `/api/team/messages${q}`);
      if (res?.success && Array.isArray(res.messages) && res.messages.length > 0) {
        mainWindow.webContents.send('team:event', { type: 'chat:cloudMessages', messages: res.messages });
        lastChatPollAt = res.messages[res.messages.length - 1].created_at;
      }
    } catch { /* silencioso */ }
  }, 15000);
}

function stopChatPolling() {
  if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; }
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
      sandbox: true,
      devTools: isDev,
    },
    backgroundColor: '#07090f',
    show: false,
  });

  // Remove o menu nativo (File/Edit/View) em qualquer ambiente — visual limpo.
  Menu.setApplicationMenu(null);

  if (!isDev) {
    // Content-Security-Policy — só em produção (no dev o Vite/HMR precisa de
    // unsafe-eval + websocket, então não aplicamos pra não quebrar o hot-reload).
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com data:; " +
            "img-src 'self' data: blob:; " +
            "media-src 'self' blob:; " +
            "connect-src 'self' https://api.apexdynamics.store http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*;",
          ],
        },
      });
    });
  }

  if (isDev) {
    win.loadURL('http://127.0.0.1:3010');
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

/* ── IPC: Versão do app ────────────────────────────────────────────── */

ipcMain.handle('get-version', () => app.getVersion());

/* ── IPC: Sessão criptografada (safeStorage) ───────────────────────── */
/**
 * Guarda a sessão (certificado + token JWT) criptografada pela API do SO
 * (DPAPI no Windows / Keychain no macOS / libsecret no Linux) num arquivo
 * em userData — em vez de texto puro no localStorage do renderer.
 * Se o SO não tiver criptografia disponível (raro), grava em texto puro
 * como fallback para não travar o login.
 */
const SESSION_FILE = () => path.join(app.getPath('userData'), 'session.bin');

ipcMain.handle('session:get', () => {
  try {
    const file = SESSION_FILE();
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file);
    let json;
    if (safeStorage.isEncryptionAvailable()) {
      try { json = safeStorage.decryptString(raw); }
      catch { json = raw.toString('utf8'); } // arquivo pode ter sido salvo em texto puro
    } else {
      json = raw.toString('utf8');
    }
    return JSON.parse(json);
  } catch { return null; }
});

ipcMain.handle('session:set', (_event, data) => {
  try {
    const json = JSON.stringify(data);
    const buf  = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf8');
    fs.writeFileSync(SESSION_FILE(), buf, { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('session:clear', () => {
  try {
    const file = SESSION_FILE();
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

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
    await registerRelayToken(); // await garante que o token está no servidor antes do mobile escanear
    loadChatHistory();
    startChatPolling();

    return {
      ...loginData,
      certificate,
    };
  } catch {
    return { success: false, message: 'Erro ao processar login.' };
  }
});

/* ── IPC: Cadastro de nova conta (pendente de aprovação) ───────────── */

/**
 * Cria uma conta nova no ApexServer. Exige internet (httpsPost).
 * A conta nasce PENDENTE: o servidor não emite token nem certificado —
 * o usuário só consegue logar depois que o administrador aprovar no
 * painel admin. O HWID é enviado para o admin ver de qual máquina veio.
 */
ipcMain.handle('license:register', async (_event, payload) => {
  try {
    const { name, email, username, password, phone } = payload || {};

    if (!name || !email || !username || !password) {
      return { success: false, message: 'Preencha todos os campos obrigatórios.' };
    }

    const hwid = await getHWID();
    if (!hwid) {
      return { success: false, message: 'Não foi possível detectar o hardware desta máquina.' };
    }

    const res = await httpsPost('/api/auth/register', {
      name, email, username, password, phone: phone || '', hwid,
    });

    if (!res.ok) {
      // Sem internet → bloqueia o cadastro (1º acesso exige conexão)
      return { success: false, message: res.error || 'Erro de conexão.', offline: res.offline };
    }

    // Propaga a resposta do servidor: { success, message?, duplicate? }
    return res.data;
  } catch {
    return { success: false, message: 'Erro ao processar o cadastro.' };
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

/* ── IPC: Retomar sessão ao abrir com cert válido ──────────────────── */
/**
 * Chamado pelo LicenseGate quando o app abre e o certificado local já é válido
 * (sem passar pelo fluxo de login). Define sessionToken + sessionHwid e inicia
 * o canal SSE — necessário para notificações em tempo real (entitlements, ban).
 */
ipcMain.handle('license:resumeSession', async (_event, { token, hwid }) => {
  try {
    if (!token || !hwid) return { success: false };
    sessionToken = token;
    sessionHwid  = hwid;
    sseStopped   = false;
    startSSE();
    await registerRelayToken();
    loadChatHistory();
    startChatPolling();
    console.log('[resumeSession] sessão retomada, SSE e chat cloud iniciados');
    return { success: true };
  } catch (err) {
    console.error('[resumeSession] erro:', err.message);
    return { success: false };
  }
});

/* ── IPC: Verificar versão de entitlements (cert-status) ───────────── */
ipcMain.handle('license:checkCertStatus', async (_event, { ev, token, icv, wscv }) => {
  try {
    const authToken = token || sessionToken;
    if (!authToken) return { success: false, changed: false };
    const res = await httpsGet(
      `/api/auth/cert-status?ev=${ev ?? -1}&icv=${icv ?? -1}&wscv=${wscv ?? -1}`,
      { Authorization: `Bearer ${authToken}` }
    );
    if (!res.ok) return { success: false, changed: false, offline: res.offline };
    return { success: true, ...res.data };
  } catch {
    return { success: false, changed: false };
  }
});

/* ── Renovação silenciosa de certificado (entitlements mudaram via SSE) */
async function refreshCertificateBackground() {
  try {
    if (!sessionToken || !sessionHwid) return;
    const res = await httpsPost(
      '/api/auth/session-certificate',
      { hwid: sessionHwid },
      { Authorization: `Bearer ${sessionToken}` }
    );
    if (res.ok && res.data?.success && res.data?.certificate) {
      // Notifica o renderer para salvar o novo certificado e recarregar as abas
      mainWindow?.webContents.send('license:entitlementsChanged', {
        certificate: res.data.certificate,
      });
      console.log('[SSE] entitlements_changed — novo certificado emitido');
    }
  } catch (err) {
    console.error('[SSE] refreshCertificateBackground error:', err.message);
  }
}

/* ── IPC: Logout — fecha SSE e limpa sessão ────────────────────────── */

ipcMain.handle('license:logout', () => {
  sseStopped = true;
  stopSSE();
  stopChatPolling();
  lastChatPollAt = null;
  sessionToken = null;
  sessionHwid  = null;
  return { success: true };
});

/* ── IPC: Notificação OS nativa ────────────────────────────────────── */

ipcMain.handle('notify:show', (_event, { title, body }) => {
  if (!Notification.isSupported()) return { ok: false };
  try {
    const n = new Notification({ title: String(title), body: String(body) });
    n.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
    n.show();
    return { ok: true };
  } catch {
    return { ok: false };
  }
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
  const qrData = JSON.stringify({ wsUrl: url, sessionName, pairingToken });
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
  // Push notification para devices offline na LAN
  const sender = msg.senderName || 'Desktop';
  pushToOfflineDevices(`💬 ${sender}`, msg.text || 'Nova mensagem', { type: 'chat' });
  // Persiste no cloud — mensagens do desktop também devem sobreviver ao restart
  if (sessionToken && full.content?.text) {
    cloudRequest('POST', '/api/team/messages', {
      content:  full.content.text,
      clientId: full.id,
      // sem senderAlias → cloud usa o username do JWT (usuário desktop logado)
    }).catch(() => {});
  }
  return { ok: true };
});

/** Desktop aprova uma medição → notifica celular via WS ou push (LAN ou cloud) */
ipcMain.handle('team:approveMeasurement', (_e, { measurementId, deviceId: targetDeviceId }) => {
  const dev   = teamDevices.get(targetDeviceId);
  const msg   = { type: 'measurement:approved', measurementId, approvedAt: new Date().toISOString() };
  const sentOk = dev ? wsSend(dev.ws, msg) : false;
  if (!sentOk) {
    queueForDevice(targetDeviceId, msg);
    const localToken = pushTokens.get(targetDeviceId);
    if (localToken) {
      sendExpoPush(localToken, '✅ Medição Aprovada', 'Sua medição foi aprovada pelo engenheiro.');
    } else {
      // Device nunca esteve na LAN nesta sessão — notifica via cloud
      cloudNotifyDevice(targetDeviceId, '✅ Medição Aprovada', 'Sua medição foi aprovada pelo engenheiro.', { type: 'MEASUREMENT_APPROVED', measurementId });
    }
  }
  return { ok: true };
});

/** Desktop ignora uma medição → notifica celular via WS ou push (LAN ou cloud) */
ipcMain.handle('team:dismissMeasurement', (_e, { measurementId, deviceId: targetDeviceId }) => {
  const dev    = teamDevices.get(targetDeviceId);
  const msg    = { type: 'measurement:dismissed', measurementId };
  const sentOk = dev ? wsSend(dev.ws, msg) : false;
  if (!sentOk) {
    queueForDevice(targetDeviceId, msg);
    const localToken = pushTokens.get(targetDeviceId);
    if (localToken) {
      sendExpoPush(localToken, '❌ Medição Dispensada', 'Sua medição foi dispensada.');
    } else {
      cloudNotifyDevice(targetDeviceId, '❌ Medição Dispensada', 'Sua medição foi dispensada.', { type: 'MEASUREMENT_DISMISSED', measurementId });
    }
  }
  return { ok: true };
});

/** Desktop aprova um cronômetro → notifica celular via WS ou push */
ipcMain.handle('team:approveTimer', (_e, { timerId, deviceId: targetDeviceId }) => {
  const dev    = teamDevices.get(targetDeviceId);
  const msg    = { type: 'timer:approved', timerId };
  const sentOk = dev ? wsSend(dev.ws, msg) : false;
  if (!sentOk) {
    queueForDevice(targetDeviceId, msg);
    const localToken = pushTokens.get(targetDeviceId);
    if (localToken) {
      sendExpoPush(localToken, '⏱️ Cronômetro Aprovado', 'Seu tempo foi registrado pelo engenheiro.');
    } else {
      cloudNotifyDevice(targetDeviceId, '⏱️ Cronômetro Aprovado', 'Seu tempo foi registrado pelo engenheiro.', { type: 'TIMER_APPROVED', timerId });
    }
  }
  return { ok: true };
});

/** Desktop atribui perfis a um dispositivo → notifica celular e persiste para reconexão */
ipcMain.handle('team:assignDevice', (_e, { deviceId: targetDeviceId, profileId }) => {
  // Persiste atribuição para re-enviar ao reconectar (seja LAN ou cloud)
  if (profileId === null) {
    deviceAssignmentStore.delete(targetDeviceId);
  } else {
    deviceAssignmentStore.set(targetDeviceId, { profiles: profileId, assignedAt: new Date().toISOString() });
  }

  const dev    = teamDevices.get(targetDeviceId);
  const msg    = { type: 'device:profileAssigned', profiles: profileId };
  const sentOk = dev ? wsSend(dev.ws, msg) : false;
  if (!sentOk) {
    queueForDevice(targetDeviceId, msg);
    const profileLabel = Array.isArray(profileId) && profileId.length > 0
      ? profileId.map(p => p.name || p.id).join(', ')
      : 'removido';
    const localToken = pushTokens.get(targetDeviceId);
    if (localToken) {
      sendExpoPush(localToken, '🏎️ Perfil Atribuído', `Perfil: ${profileLabel}`);
    } else {
      cloudNotifyDevice(targetDeviceId, '🏎️ Perfil Atribuído', `Perfil: ${profileLabel}`, { type: 'PROFILE_ASSIGNED' });
    }
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
  // PUSH NOTIFICATION para TODOS os devices com máxima urgência
  for (const [, token] of pushTokens.entries()) {
    sendEmergencyPush(token, alertMsg, alert.id);
  }
  console.log('[Emergency] WS sent:', sent, '| Push sent to:', pushTokens.size, 'tokens');
  // Dispara FCM via cloud para membros off-LAN que não estão nos pushTokens locais
  if (sessionToken) {
    cloudRequest('POST', '/api/team/emergency', { reason: alertMsg }).catch(() => {});
  }
  return { ok: true, sent };
});

/** Persiste histórico de medições (aprovadas/dispensadas) entre sessões */
const MEASUREMENTS_FILE = () => path.join(app.getPath('userData'), 'measurements-history.json');

ipcMain.handle('team:saveMeasurements', (_e, measurements) => {
  try {
    fs.writeFileSync(MEASUREMENTS_FILE(), JSON.stringify(measurements), 'utf8');
    return { ok: true };
  } catch { return { ok: false }; }
});

ipcMain.handle('team:loadMeasurements', () => {
  try {
    const raw = fs.readFileSync(MEASUREMENTS_FILE(), 'utf8');
    return { ok: true, measurements: JSON.parse(raw) };
  } catch { return { ok: true, measurements: [] }; }
});

/** Desktop indica que está digitando — broadcast para celulares na LAN */
ipcMain.handle('team:sendTypingEvent', () => {
  const typingMsg = { type: 'chat:typing', from: { deviceId: 'desktop', name: 'Engenheiro (Desktop)', platform: 'desktop' } };
  for (const { ws } of teamDevices.values()) wsSend(ws, typingMsg);
  return { ok: true };
});

/** Inicia/para servidor manualmente (o app inicia automático, mas pode ser parado pelo usuário) */
ipcMain.handle('team:startServer', () => { startTeamServer(); return { ok: true }; });
ipcMain.handle('team:stopServer',  () => { stopTeamServer();  return { ok: true }; });

/* ── Cloud Team API ─────────────────────────────────────────────── */
function cloudRequest(method, urlPath, body = null) {
  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: APEX_SERVER,
      port: APEX_PORT,
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${sessionToken || ''}`,
        'Content-Type': 'application/json',
        'User-Agent': `ApexDynamics/${app.getVersion()}`,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      timeout: 10000,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ success: false, message: 'Resposta inválida.' }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ success: false, message: 'Timeout.' }); });
    req.on('error', () => resolve({ success: false, message: 'Erro de rede.' }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

ipcMain.handle('cloud:getMembers',        () => cloudRequest('GET',  '/api/team/members'));
ipcMain.handle('cloud:getCars',           () => cloudRequest('GET',  '/api/team/cars'));
ipcMain.handle('cloud:getMessages',       () => cloudRequest('GET',  '/api/team/messages?limit=50'));
ipcMain.handle('cloud:sendMessage',       (_e, { content }) => cloudRequest('POST', '/api/team/messages', { content }));
ipcMain.handle('cloud:triggerEmergency',  (_e, { reason }) => cloudRequest('POST',  '/api/team/emergency', { reason }));
ipcMain.handle('cloud:getActiveSession',  () => cloudRequest('GET',  '/api/team/sessions/active'));
ipcMain.handle('cloud:startSession',      (_e, { name }) => cloudRequest('POST', '/api/team/sessions', { name }));
ipcMain.handle('cloud:endSession',        (_e, { id }) => cloudRequest('PUT', `/api/team/sessions/${id}/end`, {}));
ipcMain.handle('cloud:getLatestCarData',  () => cloudRequest('GET',  '/api/team/car-data/latest'));
ipcMain.handle('cloud:getLatestTrackCond',() => cloudRequest('GET',  '/api/team/track-conditions/latest'));
ipcMain.handle('cloud:saveTrackCond',     (_e, data) => cloudRequest('POST', '/api/team/track-conditions', data));

/* ── App lifecycle ─────────────────────────────────────────────────── */

app.whenReady().then(() => {
  loadPendingQueue(); // restaura fila de mensagens pendentes da sessão anterior
  createWindow();
  startTeamServer();
  startTeamHttpServer();
  setupAutoUpdater();
});

/* ── Auto-Update (apenas em produção) ──────────────────────────────── */
function setupAutoUpdater() {
  if (!app.isPackaged) return;

  const { autoUpdater } = require('electron-updater');

  autoUpdater.autoDownload         = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type:      'info',
      title:     'Atualização pronta — ApexDynamics',
      message:   `Versão ${info.version} baixada com sucesso.`,
      detail:    'Deseja reiniciar agora para aplicar a atualização?',
      buttons:   ['Reiniciar agora', 'Mais tarde'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    }).catch(() => {});
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdate]', err.message);
  });

  // Verifica 10 segundos após iniciar (aguarda a janela carregar)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  stopTeamServer();
  if (process.platform !== 'darwin') app.quit();
});
