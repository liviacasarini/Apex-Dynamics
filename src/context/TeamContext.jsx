/**
 * TeamContext.jsx
 *
 * Gerencia o estado da equipe no desktop:
 *  - Dispositivos conectados
 *  - Mensagens de chat
 *  - Medições pendentes (aguardando aprovação)
 *  - Cronômetros pendentes
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const TeamContext = createContext(null);

export function TeamProvider({ children }) {
  const [serverInfo,        setServerInfo]        = useState(null);
  const [devices,           setDevices]           = useState([]);
  const [messages,          setMessages]          = useState([]);
  const [measurements,      setMeasurements]      = useState([]); // pendentes + histórico
  const [timers,            setTimers]            = useState([]);  // cronômetros pendentes
  const [unreadChat,        setUnreadChat]        = useState(0);
  const [teamTabOpen,       setTeamTabOpen]       = useState(false);
  const [deviceAssignments, setDeviceAssignments] = useState({}); // deviceId → [profileId, ...]

  const senderNameRef = useRef('Engenheiro (Desktop)');

  // Carrega info do servidor ao montar
  useEffect(() => {
    if (!window.teamAPI) return;
    window.teamAPI.getServerInfo().then(info => {
      setServerInfo(info);
      setDevices(info.devices || []);
    });
  }, []);

  // Escuta eventos do servidor WebSocket
  useEffect(() => {
    if (!window.teamAPI) return;

    window.teamAPI.onEvent((event) => {
      switch (event.type) {

        case 'team:devicesUpdate':
          setDevices(event.devices || []);
          break;

        case 'team:deviceJoined':
          setDevices(prev => {
            const exists = prev.find(d => d.deviceId === event.device.deviceId);
            return exists ? prev.map(d => d.deviceId === event.device.deviceId ? event.device : d)
                          : [...prev, event.device];
          });
          addSystemMessage(`📱 ${event.device.name} (${event.device.role}) entrou na equipe`);
          break;

        case 'team:deviceLeft':
          setDevices(prev => prev.filter(d => d.deviceId !== event.device?.deviceId));
          if (event.device) addSystemMessage(`📴 ${event.device.name} saiu`);
          break;

        case 'measurement:pending':
          setMeasurements(prev => [
            { ...event.measurement, status: 'pending', receivedAt: new Date().toISOString() },
            ...prev,
          ]);
          addSystemMessage(`📊 ${event.measurement.deviceName} enviou: ${event.measurement.label}`);
          break;

        case 'timer:pending':
          setTimers(prev => [
            { ...event.timer, status: 'pending', receivedAt: new Date().toISOString() },
            ...prev,
          ]);
          addSystemMessage(`⏱️ ${event.timer.deviceName} enviou cronômetro: ${event.timer.title} — ${formatTime(event.timer.totalTime)}`);
          break;

        case 'chat:message':
          // Evita duplicar mensagens que o desktop já adicionou localmente
          if (event.from?.deviceId !== 'desktop') {
            setMessages(prev => [...prev, { ...event, receivedAt: new Date().toISOString() }]);
            setUnreadChat(prev => teamTabOpen ? 0 : prev + 1);
          }
          break;

        default: break;
      }
    });

    return () => window.teamAPI.offEvent?.();
  }, [teamTabOpen]);

  function addSystemMessage(text) {
    setMessages(prev => [...prev, {
      type: 'chat:system',
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      content: { text },
    }]);
  }

  function formatTime(seconds) {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toFixed(2).padStart(5, '0');
    return `${m}:${s}`;
  }

  const sendChatMessage = useCallback(async (text) => {
    if (!text.trim() || !window.teamAPI) return;
    const msg = {
      type: 'chat:message',
      id: crypto.randomUUID(),
      from: { deviceId: 'desktop', name: senderNameRef.current, role: 'engenheiro', platform: 'desktop' },
      timestamp: new Date().toISOString(),
      content: { text: text.trim() },
      receivedAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, msg]);
    await window.teamAPI.sendChatMessage({ text: text.trim(), senderName: senderNameRef.current });
  }, []);

  const approveMeasurement = useCallback(async (measurementId, deviceId) => {
    setMeasurements(prev => prev.map(m =>
      m.id === measurementId ? { ...m, status: 'approved', approvedAt: new Date().toISOString() } : m
    ));
    await window.teamAPI?.approveMeasurement(measurementId, deviceId);
  }, []);

  const dismissMeasurement = useCallback(async (measurementId, deviceId) => {
    setMeasurements(prev => prev.map(m =>
      m.id === measurementId ? { ...m, status: 'dismissed' } : m
    ));
    await window.teamAPI?.dismissMeasurement(measurementId, deviceId);
  }, []);

  const approveTimer = useCallback(async (timerId, deviceId) => {
    setTimers(prev => prev.map(t =>
      t.id === timerId ? { ...t, status: 'approved', approvedAt: new Date().toISOString() } : t
    ));
    await window.teamAPI?.approveTimer(timerId, deviceId);
  }, []);

  const refreshServerInfo = useCallback(async () => {
    if (!window.teamAPI) return;
    const info = await window.teamAPI.getServerInfo();
    setServerInfo(info);
    setDevices(info.devices || []);
  }, []);

  const markChatRead = useCallback(() => setUnreadChat(0), []);

  const assignDeviceToProfile = useCallback((deviceId, profileIds, profileNames) => {
    // profileIds = array de IDs, profileNames = array de nomes
    const ids   = Array.isArray(profileIds) ? profileIds : (profileIds ? [profileIds] : []);
    const names = Array.isArray(profileNames) ? profileNames : (profileNames ? [profileNames] : []);
    setDeviceAssignments(prev => {
      if (ids.length === 0) {
        const next = { ...prev };
        delete next[deviceId];
        return next;
      }
      return { ...prev, [deviceId]: ids };
    });
    // Envia a atribuição via WebSocket para o celular (todos os perfis)
    const profiles = ids.map((id, i) => ({ id, name: names[i] || 'Perfil' }));
    window.teamAPI?.assignDevice(deviceId, profiles.length > 0 ? profiles : null, null);
  }, []);

  const sendEmergency = useCallback(async (message) => {
    if (!message?.trim() || !window.teamAPI) return;
    await window.teamAPI.sendEmergency(message.trim());
    addSystemMessage(`🚨 EMERGÊNCIA ENVIADA: ${message.trim()}`);
  }, []);

  const pendingCount = measurements.filter(m => m.status === 'pending').length
                     + timers.filter(t => t.status === 'pending').length;

  return (
    <TeamContext.Provider value={{
      serverInfo, devices, messages, measurements, timers,
      unreadChat, pendingCount,
      teamTabOpen, setTeamTabOpen,
      sendChatMessage, approveMeasurement, dismissMeasurement, approveTimer,
      refreshServerInfo, markChatRead,
      senderNameRef,
      deviceAssignments, assignDeviceToProfile,
      sendEmergency,
    }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam deve ser usado dentro de TeamProvider');
  return ctx;
}
