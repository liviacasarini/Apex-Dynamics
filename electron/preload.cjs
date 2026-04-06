/**
 * electron/preload.cjs
 *
 * Bridge entre o processo principal (Node.js) e o renderer (React)
 * via contextBridge. contextIsolation = true, nodeIntegration = false.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Plataforma atual (win32, darwin, linux) */
  platform: process.platform,

  /** Versão do app */
  getVersion: () => ipcRenderer.invoke('get-version'),

  /** Abre diálogo de arquivo nativo */
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

  /**
   * Retorna o HWID desta máquina (SHA-256 hex, 64 chars).
   */
  getHWID: () => ipcRenderer.invoke('license:getHWID'),

  /**
   * Realiza login com username e senha.
   * Automaticamente solicita o certificado RS256 após autenticação.
   * @returns {Promise<{ success, token, apexHash, username, email, role, certificate, message? }>}
   */
  login: (username, password) =>
    ipcRenderer.invoke('license:login', { username, password }),

  /**
   * Verifica o certificado RS256 localmente (sem internet).
   * Valida assinatura + expiração por dias corridos de calendário.
   * @param {string} certificate — JWT RS256
   * @returns {Promise<{ valid, expired?, payload?, error? }>}
   */
  checkCertificate: (certificate) =>
    ipcRenderer.invoke('license:checkCertificate', { certificate }),

  /**
   * Solicita renovação do certificado RS256 usando o token JWT.
   * Requer internet. Chamado quando o certificado expira.
   * @param {string} token — JWT obtido no login
   * @returns {Promise<{ success, certificate?, message?, offline?, banned? }>}
   */
  requestCertificate: (token) =>
    ipcRenderer.invoke('license:requestCertificate', { token }),

  /**
   * Valida o APEX hash + HWID contra o ApexServer (mantido para compatibilidade).
   */
  validateApexHash: (apexHash, hwid) =>
    ipcRenderer.invoke('license:validate', { apexHash, hwid }),

  /**
   * Registra callback para ser chamado quando o servidor detectar ban/conta inativa
   * durante o heartbeat. Dispara com { reason: 'banned' }.
   */
  onForcedLogout: (callback) => {
    ipcRenderer.removeAllListeners('license:forcedLogout');
    ipcRenderer.once('license:forcedLogout', (_event, data) => callback(data));
  },

  /**
   * Notifica o processo principal que o usuário fez logout manualmente.
   * Para o heartbeat e limpa a sessão no main process.
   */
  logout: () =>
    ipcRenderer.invoke('license:logout'),
});

/* ── API de equipe (Team WebSocket) ──────────────────────────────────── */
contextBridge.exposeInMainWorld('teamAPI', {

  /** Retorna info do servidor: IP, porta, QR code data URL, dispositivos */
  getServerInfo: () => ipcRenderer.invoke('team:getServerInfo'),

  /** Define o nome da sessão exibido nos celulares */
  setSessionName: (name) => ipcRenderer.invoke('team:setSessionName', name),

  /** Envia mensagem de chat do desktop */
  sendChatMessage: (msg) => ipcRenderer.invoke('team:sendChatMessage', msg),

  /** Aprova uma medição recebida do celular */
  approveMeasurement: (measurementId, deviceId) =>
    ipcRenderer.invoke('team:approveMeasurement', { measurementId, deviceId }),

  /** Descarta uma medição */
  dismissMeasurement: (measurementId, deviceId) =>
    ipcRenderer.invoke('team:dismissMeasurement', { measurementId, deviceId }),

  /** Aprova um cronômetro recebido */
  approveTimer: (timerId, deviceId) =>
    ipcRenderer.invoke('team:approveTimer', { timerId, deviceId }),

  /** Atribui perfis a um dispositivo */
  assignDevice: (deviceId, profiles) =>
    ipcRenderer.invoke('team:assignDevice', { deviceId, profileId: profiles }),

  /** Envia alerta de emergência para todos os celulares */
  sendEmergency: (message) =>
    ipcRenderer.invoke('team:sendEmergency', { message }),

  /** Inicia o servidor WebSocket manualmente */
  startServer: () => ipcRenderer.invoke('team:startServer'),

  /** Para o servidor WebSocket */
  stopServer: () => ipcRenderer.invoke('team:stopServer'),

  /**
   * Registra callback para eventos de equipe em tempo real.
   * Eventos: team:deviceJoined, team:deviceLeft, team:devicesUpdate,
   *          measurement:pending, timer:pending, chat:message
   */
  onEvent: (callback) => {
    ipcRenderer.removeAllListeners('team:event');
    ipcRenderer.on('team:event', (_event, data) => callback(data));
  },

  /** Remove listener de eventos */
  offEvent: () => ipcRenderer.removeAllListeners('team:event'),
});
