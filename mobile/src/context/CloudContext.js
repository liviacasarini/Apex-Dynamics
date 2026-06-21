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

  const pollRef = useRef(null);

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
    setProfile({ apexHash: data?.apexHash, role: data?.role });
    await refresh();
  }, [refresh]);

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
    setStage('login');
  }, []);

  return (
    <CloudContext.Provider value={{
      stage, deviceId, membership, profile,
      refresh, onLoginSuccess, join, logout,
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
