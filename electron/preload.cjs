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

  /**
   * Sessão criptografada via safeStorage (em userData, não no localStorage).
   * sessionGet → objeto da sessão ou null; sessionSet(data) → persiste;
   * sessionClear → remove.
   */
  sessionGet:   ()     => ipcRenderer.invoke('session:get'),
  sessionSet:   (data) => ipcRenderer.invoke('session:set', data),
  sessionClear: ()     => ipcRenderer.invoke('session:clear'),

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
   * Solicita a criação de uma nova conta (cadastro). Exige internet.
   * A conta é criada como PENDENTE no servidor — sem acesso até o
   * administrador aprovar no painel admin. Não retorna sessão/token.
   * @param {{ name, email, username, password, phone }} payload
   * @returns {Promise<{ success, message?, offline?, duplicate? }>}
   */
  register: (payload) =>
    ipcRenderer.invoke('license:register', payload),

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
   * Verifica junto ao servidor se o ev (entitlements_version) do certificado local
   * ainda é igual ao do banco. Se mudou, o app deve renovar o certificado.
   */
  checkCertStatus: (ev, token, icv, wscv) =>
    ipcRenderer.invoke('license:checkCertStatus', { ev, token, icv, wscv }),

  resumeSession: (token, hwid, certificate) =>
    ipcRenderer.invoke('license:resumeSession', { token, hwid, certificate }),

  /**
   * Registra callback para ser chamado quando o servidor notificar mudança de abas
   * via SSE (entitlements_changed). O app renova o cert e recarrega as abas.
   */
  onEntitlementsChanged: (callback) => {
    ipcRenderer.removeAllListeners('license:entitlementsChanged');
    ipcRenderer.on('license:entitlementsChanged', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('license:entitlementsChanged');
  },

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

  /**
   * Exibe uma notificação nativa do sistema operacional.
   * Funciona mesmo com a janela minimizada.
   */
  showNotification: (title, body) =>
    ipcRenderer.invoke('notify:show', { title: String(title), body: String(body) }),
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

  /** Persiste e restaura histórico de medições entre sessões */
  saveMeasurements: (data) => ipcRenderer.invoke('team:saveMeasurements', data),
  loadMeasurements: ()     => ipcRenderer.invoke('team:loadMeasurements'),

  /** Informa ao servidor que o desktop está digitando (typing indicator) */
  sendTypingEvent: () => ipcRenderer.invoke('team:sendTypingEvent'),

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

/* ── Cloud Team API (Oracle Cloud) ──────────────────────────────── */
contextBridge.exposeInMainWorld('cloudTeamAPI', {
  getMembers:        ()           => ipcRenderer.invoke('cloud:getMembers'),
  getCars:           ()           => ipcRenderer.invoke('cloud:getCars'),
  syncCars:          (cars)       => ipcRenderer.invoke('cloud:syncCars', { cars }),
  getMessages:       ()           => ipcRenderer.invoke('cloud:getMessages'),
  sendMessage:       (content)    => ipcRenderer.invoke('cloud:sendMessage', { content }),
  triggerEmergency:  (reason)     => ipcRenderer.invoke('cloud:triggerEmergency', { reason }),
  getActiveSession:  ()           => ipcRenderer.invoke('cloud:getActiveSession'),
  startSession:      (name)       => ipcRenderer.invoke('cloud:startSession', { name }),
  endSession:        (id)         => ipcRenderer.invoke('cloud:endSession', { id }),
  getLatestCarData:  ()           => ipcRenderer.invoke('cloud:getLatestCarData'),
  getLatestTrackCond:()           => ipcRenderer.invoke('cloud:getLatestTrackCond'),
  saveTrackCond:     (data)       => ipcRenderer.invoke('cloud:saveTrackCond', data),

  /* ── Workspace pago (Etapa 4) ── */
  getSeats:               ()                 => ipcRenderer.invoke('cloud:getSeats'),
  getJoinToken:           ()                 => ipcRenderer.invoke('cloud:getJoinToken'),
  getPendingMembers:      ()                 => ipcRenderer.invoke('cloud:getPendingMembers'),
  approveMember:          (memberId)         => ipcRenderer.invoke('cloud:approveMember', { memberId }),
  rejectMember:           (memberId)         => ipcRenderer.invoke('cloud:rejectMember', { memberId }),
  removeMember:           (memberId)         => ipcRenderer.invoke('cloud:removeMember', { memberId }),
  setMemberRole:          (memberId, role)   => ipcRenderer.invoke('cloud:setMemberRole', { memberId, role }),
  getPendingMeasurements: ()                 => ipcRenderer.invoke('cloud:getPendingMeasurements'),
  getAllMeasurements:     ()                 => ipcRenderer.invoke('cloud:getAllMeasurements'),
  approveMeasurement:     (id)               => ipcRenderer.invoke('cloud:approveMeasurement', { id }),
  dismissMeasurement:     (id)               => ipcRenderer.invoke('cloud:dismissMeasurement', { id }),
  deleteMeasurement:      (id)               => ipcRenderer.invoke('cloud:deleteMeasurement', { id }),

  /* ── Checklist ── */
  getChecklistOverview:   ()                      => ipcRenderer.invoke('cloud:getChecklistOverview'),
  getChecklist:           (carId)                 => ipcRenderer.invoke('cloud:getChecklist', { carId }),
  addChecklistItem:       (label, targetCarId)    => ipcRenderer.invoke('cloud:addChecklistItem', { label, targetCarId }),
  deleteChecklistItem:    (id)                    => ipcRenderer.invoke('cloud:deleteChecklistItem', { id }),
  checkChecklistItem:     (carId, itemId, checked)=> ipcRenderer.invoke('cloud:checkChecklistItem', { carId, itemId, checked }),
  resetChecklist:         (carId)                 => ipcRenderer.invoke('cloud:resetChecklist', { carId }),
});
