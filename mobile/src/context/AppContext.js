import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import { AppState, Vibration, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Audio } from 'expo-av';

const CLOUD_BASE = 'https://api.apexdynamics.store';
const EMERGENCY_BG_TASK = 'APEX_EMERGENCY_ALERT';

/* ── Background task: emergência quando app está fechado/background ── */
TaskManager.defineTask(EMERGENCY_BG_TASK, async ({ data }) => {
  // Reproduz vibração longa ao receber emergência em background
  if (data?.notification?.request?.content?.data?.type === 'emergency') {
    Vibration.vibrate([0, 1000, 300, 1000, 300, 1000], false);
  }
});

/* ── Notificações: mostra imediatamente mesmo em foreground ─────────── */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isEmergency = notification?.request?.content?.data?.type === 'emergency';
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      // Emergência em foreground: reproduz o som do canal (alarm.wav)
      ...(isEmergency && Platform.OS === 'android' ? { priority: Notifications.AndroidNotificationPriority.MAX } : {}),
    };
  },
});

/** Obtém o Expo Push Token (necessário para push notifications reais) */
async function getExpoPushToken() {
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId: '1b7fb919-9b9b-4ab4-b919-5e62ddf035c9',
    });
    console.log('[Push] Expo Push Token:', data);
    return data; // Ex: "ExponentPushToken[xxxxxx]"
  } catch (e) {
    console.warn('[Push] Não foi possível obter push token:', e.message);
    return null;
  }
}

async function setupNotifications() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('team', {
      name: 'Equipe',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 100, 50, 100],
      sound: 'default',
    });
    // Canal de emergência usa o arquivo alarm.wav (tom pulsante alto)
    // IMPORTANTE: canal só pode ser criado/modificado antes da primeira notificação.
    // Se o usuário já tinha o app instalado, talvez precise desinstalar e reinstalar
    // para o novo canal com som personalizado ser aplicado.
    await Notifications.setNotificationChannelAsync('emergency', {
      name: 'EMERGÊNCIA — Apex Dynamics',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 800, 200, 800, 200, 800, 200, 800],
      sound: 'alarm.wav',
      enableLights: true,
      lightColor: '#FF0000',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      enableVibrate: true,
    });
  }
  // Registra background task para receber emergências com app fechado
  try {
    await Notifications.registerTaskAsync(EMERGENCY_BG_TASK);
  } catch { /* silencioso — task pode já estar registrada */ }
  return finalStatus === 'granted';
}

async function showNotification(title, body, isEmergency = false) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: isEmergency ? 'alarm.wav' : 'default',
        priority: isEmergency
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android'
          ? { channelId: isEmergency ? 'emergency' : 'team' }
          : {}),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('Notification error:', e);
  }
}

/* ── Paleta alinhada com desktop ApexDynamics ─────────────────────── */
export const COLORS = {
  bg:            '#0a0a0f',
  bgCard:        '#12121a',
  bgCardHover:   '#1a1a25',
  bgElevated:    '#16161f',
  border:        '#1e1e2e',
  borderLight:   '#2a2a3e',
  accent:        '#e63946',
  accentDim:     'rgba(230,57,70,0.15)',
  accentGlow:    'rgba(230,57,70,0.3)',
  green:         '#06d6a0',
  greenDim:      'rgba(6,214,160,0.15)',
  blue:          '#118ab2',
  blueDim:       'rgba(17,138,178,0.15)',
  purple:        '#8338ec',
  orange:        '#ff6b35',
  orangeDim:     'rgba(255,107,53,0.15)',
  yellow:        '#ffd166',
  yellowDim:     'rgba(255,209,102,0.15)',
  cyan:          '#00f5d4',
  textPrimary:   '#f0f0f5',
  textSecondary: '#8888a0',
  textMuted:     '#55556a',
  white:         '#ffffff',
};

/* ── Role helpers ─────────────────────────────────────────────────── */
export const ROLE_COLORS = {
  mecanico:   COLORS.orange,
  auxiliar:   COLORS.blue,
  engenheiro: COLORS.green,
  piloto:     COLORS.yellow,
};
export const ROLE_LABELS = {
  mecanico: 'Mecânico', auxiliar: 'Auxiliar',
  engenheiro: 'Engenheiro', piloto: 'Piloto',
};

const AppContext = createContext(null);

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function AppProvider({ children }) {
  const wsRef = useRef(null);
  const heartbeatRef = useRef(null);
  const reconnectRef = useRef(null);
  const intentionalDisconnect = useRef(false);
  const cloudPollRef = useRef(null);
  const cloudLastSeenAt = useRef(null); // ISO da última msg cloud vista

  // Mirrors de estado como refs — lidos em callbacks/timers para evitar closure stale
  const connectedRef  = useRef(false);
  const connectingRef = useRef(false);

  const [connected,  _setConnected]  = useState(false);
  const [connecting, _setConnecting] = useState(false);

  // Wrappers que mantêm ref e state sincronizados
  function setConnected(v)  { connectedRef.current  = v; _setConnected(v);  }
  function setConnecting(v) { connectingRef.current = v; _setConnecting(v); }
  const [deviceId, setDeviceId] = useState(null);
  const [deviceName, setDeviceName] = useState('');
  const [deviceRole, setDeviceRole] = useState('mecanico');
  const [serverUrl, setServerUrl] = useState('');
  const [pairingToken, setPairingToken] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cloudActive, setCloudActive] = useState(false); // true quando polling cloud está rodando
  const [offlineMeasurements, setOfflineMeasurements] = useState([]); // fila de medições offline
  const [typingUsers, setTypingUsers] = useState({}); // deviceId → name
  const typingTimersRef = useRef({});

  // Perfis atribuídos pelo desktop — array de { id, name }
  const [assignedProfiles, setAssignedProfiles] = useState([]);

  const [emergencyAlert, setEmergencyAlert] = useState(null); // { message, timestamp, id }
  const emergencyVibrateRef = useRef(null);
  const emergencySoundRef   = useRef(null); // expo-av Sound instance em loop

  const pushTokenRef = useRef(null);

  /* ── Alarme sonoro em loop (só quando app está aberto/foreground) ── */
  async function startAlarmLoop() {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });
      if (emergencySoundRef.current) {
        await emergencySoundRef.current.stopAsync().catch(() => {});
        await emergencySoundRef.current.unloadAsync().catch(() => {});
        emergencySoundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/alarm.wav'),
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      emergencySoundRef.current = sound;
    } catch (e) {
      console.warn('[AlarmLoop] Erro ao tocar alarme:', e.message);
    }
  }

  async function stopAlarmLoop() {
    if (!emergencySoundRef.current) return;
    try {
      await emergencySoundRef.current.stopAsync();
      await emergencySoundRef.current.unloadAsync();
    } catch {}
    emergencySoundRef.current = null;
  }
  const saveMsgTimer = useRef(null); // debounce de escrita no AsyncStorage

  /* ── Persiste histórico de chat no AsyncStorage (debounced 1.5s) ── */
  useEffect(() => {
    if (messages.length === 0) return;
    if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
    saveMsgTimer.current = setTimeout(() => {
      const toSave = messages.slice(-200); // mantém últimas 200 mensagens
      AsyncStorage.setItem('chatHistory', JSON.stringify(toSave)).catch(() => {});
    }, 1500);
  }, [messages]);

  /* ── Init: carrega perfil e tenta auto-reconectar ──────────────── */
  useEffect(() => {
    setupNotifications().then(() => {
      // Após permissões concedidas, obtém o push token
      getExpoPushToken().then(token => { pushTokenRef.current = token; });
    });
    (async () => {
      const info = await initDevice();
      // Carrega perfis atribuídos salvos
      const saved = await AsyncStorage.getItem('assignedProfiles');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) setAssignedProfiles(parsed);
        } catch {}
      }
      // Carrega histórico de chat local (exibe imediatamente, inclusive offline)
      const savedChat = await AsyncStorage.getItem('chatHistory');
      if (savedChat) {
        try {
          const parsed = JSON.parse(savedChat);
          if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
        } catch {}
      }
      if (info.url && info.name) {
        tryAutoConnect(info.url, info.name, info.role);
      }
      // Carrega histórico de mensagens do cloud (independe de estar na LAN)
      if (info.pairingToken) {
        loadCloudHistory(info.pairingToken);
      }
    })();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (cloudPollRef.current) clearInterval(cloudPollRef.current);
      if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
      stopAlarmLoop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Cloud relay helpers ───────────────────────────────────────── */

  /** Normaliza msg do cloud para o formato interno do app. */
  function normalizeCloudMsg(m) {
    return {
      type: 'chat:message',
      id: `cloud-${m.id}`,
      _clientId: m.client_id || null,
      from: { deviceId: 'cloud', name: m.sender_name || 'Equipe', role: null, platform: 'cloud' },
      timestamp: m.created_at,
      content: { text: m.content },
    };
  }

  /** Carrega histórico de msgs da nuvem (chamado no init). */
  async function loadCloudHistory(token) {
    if (!token) return;
    try {
      const resp = await fetch(`${CLOUD_BASE}/api/team/relay-messages?limit=80`, {
        headers: { 'X-Relay-Token': token },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data.success || !Array.isArray(data.messages) || data.messages.length === 0) return;
      const normalized = data.messages.map(normalizeCloudMsg);
      setMessages(normalized);
      cloudLastSeenAt.current = data.messages[data.messages.length - 1].created_at;
    } catch { /* silencioso */ }
  }

  /** Faz polling HTTP ao desktop para buscar mensagens que chegaram enquanto o app estava em background */
  const pollPending = useCallback(async () => {
    try {
      const url = serverUrl || await AsyncStorage.getItem('serverUrl');
      const did = deviceId || await AsyncStorage.getItem('deviceId');
      if (!url || !did) return;
      const pToken = await AsyncStorage.getItem('pairingToken');
      if (!pToken) return; // sem token de pareamento não há o que buscar
      const match = url.match(/\/\/([^:]+):(\d+)/);
      if (!match) return;
      const httpUrl = `http://${match[1]}:8766/pending?deviceId=${encodeURIComponent(did)}`
        + `&token=${encodeURIComponent(pToken)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(httpUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) return;
      const { messages: msgs } = await resp.json();
      if (!msgs || msgs.length === 0) return;
      console.log('[FgPoll] Received', msgs.length, 'pending messages');
      for (const msg of msgs) {
        handleIncoming(msg);
      }
    } catch (e) {
      // silencioso — desktop pode estar offline
    }
  }, [serverUrl, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Polling cloud quando off-LAN ─────────────────────────────── */
  useEffect(() => {
    if (connected) {
      // Conectado via LAN — para polling cloud (não necessário)
      if (cloudPollRef.current) { clearInterval(cloudPollRef.current); cloudPollRef.current = null; }
      return;
    }
    // Offline da LAN — inicia polling cloud a cada 20 s
    if (cloudPollRef.current) return; // já rodando
    setCloudActive(true);
    cloudPollRef.current = setInterval(async () => {
      const token = await AsyncStorage.getItem('pairingToken');
      if (!token) return;
      try {
        const since = cloudLastSeenAt.current
          ? `?since=${encodeURIComponent(cloudLastSeenAt.current)}&limit=50`
          : '?limit=50';
        const resp = await fetch(`${CLOUD_BASE}/api/team/relay-messages${since}`, {
          headers: { 'X-Relay-Token': token },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data.success || !Array.isArray(data.messages) || data.messages.length === 0) return;
        const newMsgs = data.messages.map(normalizeCloudMsg);
        setMessages(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const toAdd = newMsgs.filter(m => !existingIds.has(m.id));
          if (toAdd.length === 0) return prev;
          toAdd.forEach(() => setUnreadCount(c => c + 1));
          return [...prev, ...toAdd];
        });
        cloudLastSeenAt.current = data.messages[data.messages.length - 1].created_at;
      } catch { /* silencioso */ }
    }, 20000);
    return () => {
      if (cloudPollRef.current) { clearInterval(cloudPollRef.current); cloudPollRef.current = null; }
      setCloudActive(false);
    };
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Reconecta quando app volta do background ──────────────────── */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Voltou ao foreground — usa refs para ter valor atual, não closure stale
        if (!connectedRef.current && !connectingRef.current) {
          AsyncStorage.getItem('serverUrl').then(url => {
            if (url) tryAutoConnect(url);
          });
        }
        pollPending();
      }
    });
    return () => sub.remove();
  }, [connected, connecting, serverUrl, pollPending]); // eslint-disable-line react-hooks/exhaustive-deps

  async function initDevice() {
    let id = await AsyncStorage.getItem('deviceId');
    if (!id) {
      id = generateUUID();
      await AsyncStorage.setItem('deviceId', id);
    }
    setDeviceId(id);

    const name   = await AsyncStorage.getItem('deviceName');
    const role   = await AsyncStorage.getItem('deviceRole');
    const url    = await AsyncStorage.getItem('serverUrl');
    const sName  = await AsyncStorage.getItem('sessionName');
    const pToken = await AsyncStorage.getItem('pairingToken');

    if (name)   setDeviceName(name);
    if (role)   setDeviceRole(role);
    if (url)    setServerUrl(url);
    if (sName)  setSessionName(sName);
    if (pToken) setPairingToken(pToken);

    return { id, name, role, url, pairingToken: pToken };
  }

  async function saveProfile(name, role) {
    setDeviceName(name);
    setDeviceRole(role);
    await AsyncStorage.setItem('deviceName', name);
    await AsyncStorage.setItem('deviceRole', role);
  }

  function sendRaw(obj) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  function startHeartbeat(id, name, role) {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      sendRaw({
        type: 'device:ping',
        deviceId: id, deviceName: name, deviceRole: role,
        battery: null, platform: 'mobile',
      });
    }, 30000);
  }

  /* ── Auto-reconexão silenciosa ─────────────────────────────────── */
  async function tryAutoConnect(url, name, role) {
    // Usa ref em vez de closure para ter o valor atual, não o do render anterior
    if (connectedRef.current || connectingRef.current) return;
    const useUrl   = url || await AsyncStorage.getItem('serverUrl');
    const useName  = name || await AsyncStorage.getItem('deviceName');
    const useRole  = role || await AsyncStorage.getItem('deviceRole') || 'mecanico';
    const useToken = await AsyncStorage.getItem('pairingToken');
    if (!useUrl || !useName) return;
    try {
      intentionalDisconnect.current = false;
      await connect(useUrl, useName, useRole, undefined, useToken);
    } catch {
      // silencioso — tenta novamente em 5s
      scheduleReconnect(useUrl, useName, useRole);
    }
  }

  function scheduleReconnect(url, name, role) {
    if (intentionalDisconnect.current) return;
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    reconnectRef.current = setTimeout(() => tryAutoConnect(url, name, role), 5000);
  }

  /* ── Conexão principal ─────────────────────────────────────────── */
  const connect = useCallback(async (url, name, role, sName, token) => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const id = await AsyncStorage.getItem('deviceId') || generateUUID();
    const useName = name || await AsyncStorage.getItem('deviceName') || 'Mecânico';
    const useRole = role || await AsyncStorage.getItem('deviceRole') || 'mecanico';

    await AsyncStorage.setItem('serverUrl', url);
    if (sName) {
      await AsyncStorage.setItem('sessionName', sName);
      setSessionName(sName);
    }
    if (token) {
      await AsyncStorage.setItem('pairingToken', token);
      setPairingToken(token);
    }
    setServerUrl(url);
    setConnecting(true);
    intentionalDisconnect.current = false;

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        // true se a conexão nunca chegou a abrir (onerror antes de onopen)
        let neverOpened = true;

        const timeout = setTimeout(() => {
          // neverOpened permanece true — timeout não é uma conexão bem-sucedida
          ws.close();
          setConnecting(false);
          reject(new Error('Timeout ao conectar. Verifique o endereço e a rede Wi-Fi.'));
        }, 8000);

        ws.onopen = () => {
          neverOpened = false;
          clearTimeout(timeout);
          setConnected(true);
          setConnecting(false);
          setCloudActive(false);
          ws.send(JSON.stringify({
            type: 'device:identify',
            deviceId: id, deviceName: useName, deviceRole: useRole,
            platform: 'mobile',
            pushToken: pushTokenRef.current || null,
            pairingToken: token || null,
          }));
          startHeartbeat(id, useName, useRole);
          // Envia medições que ficaram na fila enquanto estava off-LAN
          setOfflineMeasurements(prev => {
            if (prev.length > 0) {
              prev.forEach(m => ws.send(JSON.stringify(m)));
              showNotification('📊 Medições Enviadas', `${prev.length} medição(ões) pendente(s) enviada(s) ao desktop.`);
            }
            return [];
          });
          resolve(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            handleIncoming(msg);
          } catch {}
        };

        ws.onerror = (e) => {
          clearTimeout(timeout);
          setConnected(false);
          setConnecting(false);
          const detail = e?.message || e?.type || 'desconhecido';
          reject(new Error(`Erro WebSocket (${detail}). URL: ${url}`));
          // neverOpened permanece true — onclose que vem a seguir não vai agendar reconexão
        };

        ws.onclose = () => {
          setConnected(false);
          setConnecting(false);
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          // Só reconecta se a conexão chegou a abrir (drop genuíno, não falha inicial)
          if (!intentionalDisconnect.current && !neverOpened) {
            scheduleReconnect(url, useName, useRole);
          }
        };
      } catch (e) {
        setConnecting(false);
        reject(e);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleIncoming(msg) {
    // ── Erro de autenticação (token inválido) ────────────────────────
    if (msg.type === 'device:error' && msg.reason === 'invalid_token') {
      intentionalDisconnect.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      AsyncStorage.removeItem('pairingToken');
      AsyncStorage.removeItem('serverUrl');
      AsyncStorage.removeItem('sessionName');
      AsyncStorage.removeItem('assignedProfiles');
      setPairingToken('');
      setServerUrl('');
      setSessionName('');
      setAssignedProfiles([]);
      setConnected(false);
      setConnecting(false);
      Alert.alert(
        'Sessão expirada',
        'O desktop foi reiniciado ou a sessão mudou. Reescaneie o QR code para parear novamente.',
        [{ text: 'OK' }]
      );
      return;
    }

    // ── Emergência ─────────────────────────────────────────────────────
    if (msg.type === 'emergency:alert') {
      setEmergencyAlert({ message: msg.message, timestamp: msg.timestamp, id: msg.id });
      // Vibração intensa em loop
      if (emergencyVibrateRef.current) clearInterval(emergencyVibrateRef.current);
      Vibration.vibrate([0, 800, 200, 800, 200, 800, 200, 800], true);
      // Toca alarme sonoro em loop enquanto app está aberto
      startAlarmLoop();
      // Notificação do sistema (funciona mesmo com app fechado) com alarm.wav
      showNotification('🚨 EMERGÊNCIA', msg.message || 'Alerta de emergência da equipe!', true);
      return;
    }

    // ── Typing indicator ────────────────────────────────────────────
    if (msg.type === 'chat:typing') {
      const did  = msg.from?.deviceId || 'unknown';
      const name = msg.from?.name || 'Alguém';
      if (typingTimersRef.current[did]) clearTimeout(typingTimersRef.current[did]);
      setTypingUsers(prev => ({ ...prev, [did]: name }));
      typingTimersRef.current[did] = setTimeout(() => {
        setTypingUsers(prev => { const n = { ...prev }; delete n[did]; return n; });
      }, 3000);
      return;
    }

    // ── Chat ────────────────────────────────────────────────────────
    if (msg.type === 'chat:message') {
      // Limpa typing do remetente ao receber mensagem
      if (msg.from?.deviceId) {
        if (typingTimersRef.current[msg.from.deviceId]) clearTimeout(typingTimersRef.current[msg.from.deviceId]);
        setTypingUsers(prev => { const n = { ...prev }; delete n[msg.from.deviceId]; return n; });
      }
      setMessages((prev) => [...prev, msg]);
      setUnreadCount((prev) => prev + 1);
      Vibration.vibrate(100);
      // Notificação local (aparece mesmo em background)
      const sender = msg.from?.name || 'Equipe';
      showNotification(`💬 ${sender}`, msg.content?.text || 'Nova mensagem');
      return;
    }

    // ── Welcome do servidor ─────────────────────────────────────────
    if (msg.type === 'welcome' || msg.type === 'device:welcome') {
      if (msg.sessionName) setSessionName(msg.sessionName);
      return;
    }

    // ── Atribuição de perfis pelo desktop ──────────────────────────
    if (msg.type === 'device:profileAssigned') {
      const profs = msg.profiles; // null ou [{id, name}, ...]
      if (Array.isArray(profs) && profs.length > 0) {
        setAssignedProfiles(profs);
        AsyncStorage.setItem('assignedProfiles', JSON.stringify(profs));
        Vibration.vibrate([0, 100, 50, 100]);
        const names = profs.map(p => p.name).join(', ');
        showNotification('🏎️ Perfis Atribuídos', `Você foi designado para: ${names}`);
      } else {
        setAssignedProfiles([]);
        AsyncStorage.removeItem('assignedProfiles');
        Vibration.vibrate(200);
        showNotification('🏎️ Perfis Removidos', 'Sua atribuição foi removida. Aguarde nova atribuição.');
      }
      return;
    }

    // ── Medições: recebido / aprovado / dispensado ──────────────────
    if (
      msg.type === 'measurement:received' ||
      msg.type === 'measurement:approved' ||
      msg.type === 'measurement:dismissed'
    ) {
      setNotifications((prev) => {
        const filtered = prev.filter((n) => n.measurementId !== msg.measurementId);
        return [...filtered, { ...msg, localTs: Date.now() }];
      });
      if (msg.type === 'measurement:approved') {
        Vibration.vibrate([0, 100, 50, 100]);
        showNotification('✅ Medição Aprovada', 'Sua medição foi aprovada pelo engenheiro.');
      }
      if (msg.type === 'measurement:dismissed') {
        showNotification('❌ Medição Dispensada', 'Sua medição foi dispensada.');
      }
      return;
    }

    // ── Cronômetro aprovado ─────────────────────────────────────────
    if (msg.type === 'timer:approved') {
      setNotifications((prev) => [...prev, { ...msg, localTs: Date.now() }]);
      Vibration.vibrate([0, 100, 50, 100]);
      showNotification('⏱️ Cronômetro Aprovado', 'Seu cronômetro foi registrado.');
    }
  }

  const disconnect = useCallback(async () => {
    intentionalDisconnect.current = true;
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    await AsyncStorage.removeItem('serverUrl');
    await AsyncStorage.removeItem('sessionName');
    await AsyncStorage.removeItem('assignedProfiles');
    await AsyncStorage.removeItem('pairingToken');
    setConnected(false);
    setConnecting(false);
    setServerUrl('');
    setSessionName('');
    setPairingToken('');
    setMessages([]);
    setNotifications([]);
    setUnreadCount(0);
    setAssignedProfiles([]);
  }, []);

  const sendMessage = useCallback(async (text) => {
    const id = generateUUID();
    const msg = {
      type: 'chat:message', id,
      from: { deviceId: deviceId || 'mobile', name: deviceName, role: deviceRole, platform: 'mobile' },
      timestamp: new Date().toISOString(),
      content: { text },
    };
    const sent = sendRaw(msg);
    if (sent) {
      setMessages((prev) => [...prev, msg]);
      return true;
    }
    // Não está na LAN — tenta enviar via cloud relay
    try {
      const token = await AsyncStorage.getItem('pairingToken');
      if (!token) return false;
      const resp = await fetch(`${CLOUD_BASE}/api/team/relay-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Relay-Token': token },
        body: JSON.stringify({ content: text, senderName: deviceName, senderRole: deviceRole, clientId: id }),
      });
      if (resp.ok) {
        setMessages((prev) => [...prev, msg]);
        return true;
      }
    } catch { /* silencioso */ }
    return false;
  }, [deviceId, deviceName, deviceRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitMeasurement = useCallback((category, label, data, targetProfileId) => {
    const measurementId = generateUUID();
    const payload = {
      type: 'measurement:submit', id: measurementId,
      deviceId, deviceName, deviceRole,
      timestamp: new Date().toISOString(),
      category, label, data,
      targetProfileId: targetProfileId || null,
    };
    const sent = sendRaw(payload);
    if (sent) {
      setNotifications((prev) => [
        ...prev,
        { type: 'measurement:received', measurementId, label, localTs: Date.now() },
      ]);
      return measurementId;
    }
    // Sem LAN — enfileira para enviar quando reconectar
    setOfflineMeasurements(prev => [...prev, payload]);
    Alert.alert(
      'Sem conexão com o desktop',
      'A medição foi salva e será enviada automaticamente quando você reconectar ao Wi-Fi da equipe.',
      [{ text: 'OK' }]
    );
    return measurementId;
  }, [deviceId, deviceName, deviceRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitTimer = useCallback((category, title, totalTime, splits) => {
    return sendRaw({
      type: 'timer:submit', id: generateUUID(),
      deviceId, deviceName,
      timestamp: new Date().toISOString(),
      category, title, totalTime, splits,
    });
  }, [deviceId, deviceName]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearUnread = useCallback(() => setUnreadCount(0), []);

  const sendTyping = useCallback(() => {
    sendRaw({ type: 'chat:typing', deviceId, deviceName, deviceRole });
  }, [deviceId, deviceName, deviceRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissEmergency = useCallback(() => {
    setEmergencyAlert(null);
    Vibration.cancel();
    if (emergencyVibrateRef.current) {
      clearInterval(emergencyVibrateRef.current);
      emergencyVibrateRef.current = null;
    }
    stopAlarmLoop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppContext.Provider value={{
      connected, connecting, deviceId, deviceName, deviceRole,
      serverUrl, sessionName, messages, notifications, unreadCount,
      assignedProfiles, emergencyAlert, dismissEmergency,
      cloudActive, offlineMeasurements, typingUsers,
      connect, disconnect, sendMessage, sendTyping, submitMeasurement, submitTimer,
      saveProfile, clearUnread, initDevice,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp deve ser usado dentro de AppProvider');
  return ctx;
}
