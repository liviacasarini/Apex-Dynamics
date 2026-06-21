/**
 * CloudContext.js — estado de onboarding 100% nuvem (Etapa 5).
 *
 * Máquina de estados que dirige a navegação do app:
 *   'loading' → carregando token/estado inicial
 *   'login'   → sem JWT válido            → LoginScreen
 *   'join'    → logado, sem vínculo        → JoinScreen (escanear QR)
 *   'pending' → vínculo aguardando chefe   → WaitingApprovalScreen
 *   'active'  → aprovado                   → MainTabs
 *
 * Enquanto 'pending', faz polling de getMe a cada 15s para detectar a
 * aprovação do chefe e avançar para 'active' automaticamente.
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as cloud from '../api/cloud';

const CloudContext = createContext(null);

function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Escolhe o vínculo "principal" entre as memberships (ativo > pendente). */
function pickMembership(memberships) {
  if (!Array.isArray(memberships) || memberships.length === 0) return null;
  return memberships.find(m => m.status === 'active')
      || memberships.find(m => m.status === 'pending')
      || null;
}

export function CloudProvider({ children }) {
  const [stage,      setStage]      = useState('loading'); // loading|login|join|pending|active
  const [deviceId,   setDeviceId]   = useState(null);
  const [membership, setMembership] = useState(null);      // { team_id, team_name, role, status, device_type }
  const [profile,    setProfile]    = useState(null);      // { apexHash, role } do login
  const [cars,       setCars]       = useState([]);        // Perfis/Carros da equipe (id, name, number)
  const [chatMessages, setChatMessages] = useState([]);    // mensagens normalizadas p/ o ChatScreen

  const pollRef     = useRef(null);
  const chatPollRef = useRef(null);
  const chatSinceRef = useRef(null);
  const usernameRef = useRef(null);
  const queueRef    = useRef([]);   // fila offline otimista (medições + chat)
  const [pendingQueueCount, setPendingQueueCount] = useState(0);

  // Mapeia a categoria das telas (pt) para a do servidor.
  const CATEGORY_MAP = { pressoes: 'pressures', temperaturas: 'temperatures', timer: 'timer' };

  /* ── deviceId estável (reusa o do app, se já existir) ── */
  useEffect(() => {
    (async () => {
      let id = await AsyncStorage.getItem('deviceId');
      if (!id) { id = genUUID(); await AsyncStorage.setItem('deviceId', id); }
      setDeviceId(id);
    })();
  }, []);

  /* ── Recalcula o estágio a partir do servidor ── */
  const refresh = useCallback(async () => {
    const token = await cloud.loadToken();
    if (!token) { setStage('login'); return; }
    try {
      const res = await cloud.getMe();
      const m = pickMembership(res?.memberships);
      setMembership(m);
      if (!m)                       setStage('join');
      else if (m.status === 'active') setStage('active');
      else                          setStage('pending');
    } catch (e) {
      if (e?.status === 401) { setStage('login'); return; }
      // Offline: mantém o último estágio conhecido (não derruba para login).
      setStage(prev => (prev === 'loading' ? 'join' : prev));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /* ── Polling enquanto pendente (detecta aprovação do chefe) ── */
  useEffect(() => {
    if (stage === 'pending') {
      pollRef.current = setInterval(refresh, 15000);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [stage, refresh]);

  /* ── Ações ── */
  const onLoginSuccess = useCallback(async (data) => {
    usernameRef.current = data?.username || null;
    setProfile({ apexHash: data?.apexHash, role: data?.role, username: data?.username });
    await refresh();
  }, [refresh]);

  /* ── Chat (cloud) ── */
  const normalizeChat = useCallback((m) => {
    const own = usernameRef.current && m.sender_name === usernameRef.current;
    return {
      id: `c-${m.id}`,
      type: 'chat',
      from: { deviceId: own ? deviceId : 'cloud', name: m.sender_name || 'Equipe', role: null },
      content: { text: m.content },
      timestamp: m.created_at,
    };
  }, [deviceId]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await cloud.getMessages(chatSinceRef.current, 50);
      if (!res?.success || !Array.isArray(res.messages) || res.messages.length === 0) return;
      const norm = res.messages.map(normalizeChat);
      setChatMessages(prev => {
        const seen = new Set(prev.map(p => p.id));
        const toAdd = norm.filter(n => !seen.has(n.id));
        return toAdd.length ? [...prev, ...toAdd] : prev;
      });
      chatSinceRef.current = res.messages[res.messages.length - 1].created_at;
    } catch { /* offline */ }
  }, [normalizeChat]);

  /* ── Fila offline otimista (Etapa 6) ──
   * Definida ANTES de sendChat / do useEffect de chat porque ambos a
   * referenciam em seus arrays de dependência (evita TDZ com Hermes). */
  const persistQueue = useCallback(async () => {
    setPendingQueueCount(queueRef.current.length);
    try { await AsyncStorage.setItem('cloudQueue', JSON.stringify(queueRef.current)); } catch { /* ignore */ }
  }, []);

  const enqueue = useCallback(async (item) => {
    queueRef.current.push(item);
    await persistQueue();
  }, [persistQueue]);

  /** Reenvia a fila em ordem; para no 1º erro de rede (offline), descarta erro permanente. */
  const flushQueue = useCallback(async () => {
    let i = 0;
    let sent = 0;
    while (i < queueRef.current.length) {
      const item = queueRef.current[i];
      try {
        if (item.kind === 'measurement') await cloud.submitMeasurement(item.payload);
        else if (item.kind === 'chat')   await cloud.sendChat(item.text);
        queueRef.current.splice(i, 1); // enviado → remove
        sent++;
      } catch (e) {
        if (e?.offline) break;          // ainda offline → mantém este e o resto
        queueRef.current.splice(i, 1);  // erro permanente (400/403) → descarta
      }
    }
    if (sent > 0) await persistQueue(); else setPendingQueueCount(queueRef.current.length);
    return sent;
  }, [persistQueue]);

  const sendChat = useCallback(async (text) => {
    if (!text?.trim()) return;
    try {
      await cloud.sendChat(text.trim());
      await loadMessages(); // traz a mensagem recém-enviada (marcada como própria)
    } catch (e) {
      if (e?.offline) await enqueue({ kind: 'chat', text: text.trim() });
    }
  }, [loadMessages, enqueue]);

  // Polling de chat enquanto ativo na equipe.
  useEffect(() => {
    if (stage === 'active') {
      flushQueue();
      loadMessages();
      chatPollRef.current = setInterval(() => { flushQueue(); loadMessages(); }, 10000);
    }
    return () => { if (chatPollRef.current) { clearInterval(chatPollRef.current); chatPollRef.current = null; } };
  }, [stage, loadMessages, flushQueue]);

  /* ── Push: registra o token NATIVO (FCM) quando ativo ──
   * O servidor envia via Firebase Admin (messaging().send), que exige o
   * device token nativo do FCM — NÃO o Expo token. Por isso usamos
   * getDevicePushTokenAsync (e não getExpoPushTokenAsync). As permissões
   * e os canais já são montados pelo AppContext. */
  useEffect(() => {
    if (stage !== 'active') return;
    (async () => {
      try {
        const { data: fcmToken } = await Notifications.getDevicePushTokenAsync();
        if (fcmToken) await cloud.registerPushToken(fcmToken);
      } catch { /* sem push — não crítico para o fluxo */ }
    })();
  }, [stage]);

  const registerAndJoin = useCallback(async ({ joinToken, username, phone, password }) => {
    const res = await cloud.registerAndJoin({ joinToken, username, phone, password, deviceId });
    if (res?.success) {
      usernameRef.current = res.username;
      setProfile({ apexHash: res.apexHash, role: 'user', username: res.username });
      setMembership({ team_id: res.teamId, team_name: res.teamName, status: res.status, device_type: 'mobile' });
      setStage(res.status === 'active' ? 'active' : 'pending');
    }
    return res;
  }, [deviceId]);

  const join = useCallback(async (joinToken) => {
    const res = await cloud.joinWorkspace(joinToken, 'mobile', deviceId);
    if (res?.success) {
      setMembership({ team_id: res.teamId, team_name: res.teamName, status: res.status, device_type: 'mobile' });
      setStage(res.status === 'active' ? 'active' : 'pending');
    }
    return res;
  }, [deviceId]);

  const logout = useCallback(async () => {
    await cloud.clearToken();
    setMembership(null);
    setProfile(null);
    setCars([]);
    setStage('login');
  }, []);

  // Carrega a fila persistida no boot.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem('cloudQueue');
      if (raw) { try { queueRef.current = JSON.parse(raw) || []; } catch { queueRef.current = []; } }
      setPendingQueueCount(queueRef.current.length);
    })();
  }, []);

  /** Carrega os carros (Perfis) da equipe — usado pelas telas de medição. */
  const loadCars = useCallback(async () => {
    try {
      const res = await cloud.getCars();
      if (res?.success && Array.isArray(res.cars)) setCars(res.cars);
    } catch { /* offline — mantém lista atual */ }
  }, []);

  /**
   * Envia uma medição à nuvem. Mantém a MESMA assinatura da versão LAN
   * (category, label, payload, targetCarId) para as telas trocarem só a
   * fonte. Retorna o id da submissão ou null.
   */
  const submitMeasurement = useCallback(async (category, label, payload, targetCarId) => {
    const cat = CATEGORY_MAP[category] || category;
    const body = {
      teamId: membership?.team_id,
      targetCarId: targetCarId || null,
      category: cat,
      payload: { label, ...payload },
    };
    try {
      const res = await cloud.submitMeasurement(body);
      return res?.id || null;
    } catch (e) {
      if (e?.offline) { await enqueue({ kind: 'measurement', payload: body }); return 'queued'; }
      return null; // erro permanente
    }
  }, [membership, enqueue]);

  return (
    <CloudContext.Provider value={{
      stage, deviceId, membership, profile, cars,
      refresh, onLoginSuccess, join, registerAndJoin, logout,
      loadCars, submitMeasurement,
      chatMessages, sendChat, loadMessages,
      pendingQueueCount, flushQueue,
    }}>
      {children}
    </CloudContext.Provider>
  );
}

export function useCloud() {
  const ctx = useContext(CloudContext);
  if (!ctx) throw new Error('useCloud deve ser usado dentro de CloudProvider');
  return ctx;
}
