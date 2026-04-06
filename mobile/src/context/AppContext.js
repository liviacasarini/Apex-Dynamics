import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import { AppState, Vibration, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

/* ── Configuração de notificações ─────────────────────────────────── */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
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
    await Notifications.setNotificationChannelAsync('emergency', {
      name: 'Emergência',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      sound: 'default',
      enableLights: true,
      lightColor: '#FF0000',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
  }
  return finalStatus === 'granted';
}

async function showNotification(title, body, isEmergency = false) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: isEmergency
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android'
          ? { channelId: isEmergency ? 'emergency' : 'team' }
          : {}),
      },
      trigger: null, // imediato
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

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [deviceName, setDeviceName] = useState('');
  const [deviceRole, setDeviceRole] = useState('mecanico');
  const [serverUrl, setServerUrl] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Perfis atribuídos pelo desktop — array de { id, name }
  const [assignedProfiles, setAssignedProfiles] = useState([]);

  const [emergencyAlert, setEmergencyAlert] = useState(null); // { message, timestamp, id }
  const emergencyVibrateRef = useRef(null);

  const pushTokenRef = useRef(null);

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
      if (info.url && info.name) {
        tryAutoConnect(info.url, info.name, info.role);
      }
    })();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Faz polling HTTP ao desktop para buscar mensagens que chegaram enquanto o app estava em background */
  const pollPending = useCallback(async () => {
    try {
      const url = serverUrl || await AsyncStorage.getItem('serverUrl');
      const did = deviceId || await AsyncStorage.getItem('deviceId');
      if (!url || !did) return;
      const match = url.match(/\/\/([^:]+):(\d+)/);
      if (!match) return;
      const httpUrl = `http://${match[1]}:8766/pending?deviceId=${encodeURIComponent(did)}`;
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

  /* ── Reconecta quando app volta do background ──────────────────── */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Voltou ao foreground — reconecta e busca mensagens pendentes via HTTP
        if (!connected && !connecting && serverUrl) {
          tryAutoConnect(serverUrl);
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

    const name = await AsyncStorage.getItem('deviceName');
    const role = await AsyncStorage.getItem('deviceRole');
    const url  = await AsyncStorage.getItem('serverUrl');
    const sName = await AsyncStorage.getItem('sessionName');

    if (name)  setDeviceName(name);
    if (role)  setDeviceRole(role);
    if (url)   setServerUrl(url);
    if (sName) setSessionName(sName);

    return { id, name, role, url };
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
    if (connected || connecting) return;
    const useUrl  = url || await AsyncStorage.getItem('serverUrl');
    const useName = name || await AsyncStorage.getItem('deviceName');
    const useRole = role || await AsyncStorage.getItem('deviceRole') || 'mecanico';
    if (!useUrl || !useName) return;
    try {
      intentionalDisconnect.current = false;
      await connect(useUrl, useName, useRole);
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
  const connect = useCallback(async (url, name, role, sName) => {
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
    setServerUrl(url);
    setConnecting(true);
    intentionalDisconnect.current = false;

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        const timeout = setTimeout(() => {
          ws.close();
          setConnecting(false);
          reject(new Error('Timeout ao conectar. Verifique o endereço e a rede Wi-Fi.'));
        }, 8000);

        ws.onopen = () => {
          clearTimeout(timeout);
          setConnected(true);
          setConnecting(false);
          ws.send(JSON.stringify({
            type: 'device:identify',
            deviceId: id, deviceName: useName, deviceRole: useRole,
            platform: 'mobile',
            pushToken: pushTokenRef.current || null,
          }));
          startHeartbeat(id, useName, useRole);
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
        };

        ws.onclose = () => {
          setConnected(false);
          setConnecting(false);
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          // Auto-reconecta se não foi intencional
          if (!intentionalDisconnect.current) {
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
    // ── Emergência ─────────────────────────────────────────────────────
    if (msg.type === 'emergency:alert') {
      setEmergencyAlert({ message: msg.message, timestamp: msg.timestamp, id: msg.id });
      // Vibração intensa e repetida
      if (emergencyVibrateRef.current) clearInterval(emergencyVibrateRef.current);
      Vibration.vibrate([0, 1000, 200, 1000, 200, 1000], true); // repeat=true
      // Notificação de alta prioridade com canal de emergência
      showNotification('🚨 EMERGÊNCIA', msg.message || 'Alerta de emergência da equipe!', true);
      return;
    }

    // ── Chat ────────────────────────────────────────────────────────
    if (msg.type === 'chat:message') {
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
    setConnected(false);
    setConnecting(false);
    setServerUrl('');
    setSessionName('');
    setMessages([]);
    setNotifications([]);
    setUnreadCount(0);
    setAssignedProfiles([]);
  }, []);

  const sendMessage = useCallback((text) => {
    const id = generateUUID();
    const msg = {
      type: 'chat:message', id,
      from: { deviceId: deviceId || 'mobile', name: deviceName, role: deviceRole, platform: 'mobile' },
      timestamp: new Date().toISOString(),
      content: { text },
    };
    const sent = sendRaw(msg);
    if (sent) setMessages((prev) => [...prev, msg]);
    return sent;
  }, [deviceId, deviceName, deviceRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitMeasurement = useCallback((category, label, data, targetProfileId) => {
    const measurementId = generateUUID();
    const sent = sendRaw({
      type: 'measurement:submit', id: measurementId,
      deviceId, deviceName, deviceRole,
      timestamp: new Date().toISOString(),
      category, label, data,
      targetProfileId: targetProfileId || null,
    });
    if (sent) {
      setNotifications((prev) => [
        ...prev,
        { type: 'measurement:received', measurementId, label, localTs: Date.now() },
      ]);
    }
    return sent ? measurementId : null;
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

  const dismissEmergency = useCallback(() => {
    setEmergencyAlert(null);
    Vibration.cancel();
    if (emergencyVibrateRef.current) {
      clearInterval(emergencyVibrateRef.current);
      emergencyVibrateRef.current = null;
    }
  }, []);

  return (
    <AppContext.Provider value={{
      connected, connecting, deviceId, deviceName, deviceRole,
      serverUrl, sessionName, messages, notifications, unreadCount,
      assignedProfiles, emergencyAlert, dismissEmergency,
      connect, disconnect, sendMessage, submitMeasurement, submitTimer,
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
