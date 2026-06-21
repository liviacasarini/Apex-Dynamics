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

  const sendChat = useCallback(async (text) => {
    if (!text?.trim()) return;
    try {
      await cloud.sendChat(text.trim());
      await loadMessages(); // traz a mensagem recém-enviada (marcada como própria)
    } catch { /* offline → Etapa 6 */ }
  }, [loadMessages]);

  // Polling de chat enquanto ativo na equipe.
  useEffect(() => {
    if (stage === 'active') {
      loadMessages();
      chatPollRef.current = setInterval(loadMessages, 10000);
    }
    return () => { if (chatPollRef.current) { clearInterval(chatPollRef.current); chatPollRef.current = null; } };
  }, [stage, loadMessages]);

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
    try {
      const res = await cloud.submitMeasurement({
        teamId: membership?.team_id,
        targetCarId: targetCarId || null,
        category: cat,
        payload: { label, ...payload },
      });
      return res?.id || null;
    } catch {
      return null; // offline → Etapa 6 (fila otimista) cobrirá
    }
  }, [membership]);

  return (
    <CloudContext.Provider value={{
      stage, deviceId, membership, profile, cars,
      refresh, onLoginSuccess, join, logout,
      loadCars, submitMeasurement,
      chatMessages, sendChat, loadMessages,
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
