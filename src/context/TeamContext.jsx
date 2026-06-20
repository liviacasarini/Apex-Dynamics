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
  const [chatToast,         setChatToast]         = useState(null);
  const [typingUsers,       setTypingUsers]       = useState({}); // deviceId → { name, expiresAt }

  const senderNameRef   = useRef('Engenheiro (Desktop)');
  const seenClientIds   = useRef(new Set()); // UUIDs de msgs LAN já adicionadas → evita duplicata do polling
  const typingTimers    = useRef({});        // deviceId → clearTimeout handle

  // Carrega info do servidor e histórico de medições ao montar
  useEffect(() => {
    if (!window.teamAPI) return;
    window.teamAPI.getServerInfo().then(info => {
      setServerInfo(info);
      setDevices(info.devices || []);
    });
    window.teamAPI.loadMeasurements?.().then(res => {
      if (res?.measurements?.length) setMeasurements(res.measurements);
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

        case 'chat:history': {
          // Carga inicial do cloud — normaliza e popula estado (sem toast/unread)
          const msgs = (event.messages || []).map(normalizeCloudMsg);
          msgs.forEach(m => { if (m._clientId) seenClientIds.current.add(m._clientId); });
          setMessages(msgs);
          break;
        }

        case 'chat:cloudMessages': {
          // Novas mensagens do polling — filtra as que já chegaram via LAN
          const newMsgs = (event.messages || [])
            .filter(m => !seenClientIds.current.has(m.client_id))
            .map(normalizeCloudMsg);
          if (newMsgs.length === 0) break;
          newMsgs.forEach(m => { if (m._clientId) seenClientIds.current.add(m._clientId); });
          setMessages(prev => {
            const existing = new Set(prev.map(p => p.id));
            const toAdd = newMsgs.filter(m => !existing.has(m.id));
            return toAdd.length ? [...prev, ...toAdd].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) : prev;
          });
          newMsgs.forEach(m => {
            setUnreadChat(prev => teamTabOpen ? 0 : prev + 1);
            setChatToast({ senderName: m.from.name, preview: (m.content.text || '').slice(0, 60) });
          });
          break;
        }

        case 'chat:typing': {
          const did  = event.from?.deviceId;
          const name = event.from?.name || 'Alguém';
          if (!did || did === 'desktop') break;
          // Limpa timer anterior para este device
          if (typingTimers.current[did]) clearTimeout(typingTimers.current[did]);
          setTypingUsers(prev => ({ ...prev, [did]: name }));
          // Remove após 3 s sem nova notificação
          typingTimers.current[did] = setTimeout(() => {
            setTypingUsers(prev => { const n = { ...prev }; delete n[did]; return n; });
          }, 3000);
          break;
        }

        case 'chat:message':
          // Limpa typing indicator de quem acabou de mandar mensagem
          if (event.from?.deviceId) {
            if (typingTimers.current[event.from.deviceId]) {
              clearTimeout(typingTimers.current[event.from.deviceId]);
              delete typingTimers.current[event.from.deviceId];
            }
            setTypingUsers(prev => { const n = { ...prev }; delete n[event.from.deviceId]; return n; });
          }
          // Evita duplicar mensagens que o desktop já adicionou localmente
          if (event.from?.deviceId !== 'desktop') {
            if (event.id) seenClientIds.current.add(event.id);
            setMessages(prev => [...prev, { ...event, receivedAt: new Date().toISOString() }]);
            setUnreadChat(prev => teamTabOpen ? 0 : prev + 1);
            setChatToast({
              senderName: event.from?.name || 'Equipe Mobile',
              preview: (event.content?.text || '').slice(0, 60),
            });
          }
          break;

        default: break;
      }
    });

    return () => window.teamAPI.offEvent?.();
  }, [teamTabOpen]);

  function normalizeCloudMsg(m) {
    return {
      type: 'chat:message',
      id: `cloud-${m.id}`,
      _clientId: m.client_id || null,
      from: { deviceId: 'cloud', name: m.sender_name || 'Equipe', role: null, platform: 'cloud' },
      timestamp: m.created_at,
      content: { text: m.content },
      receivedAt: m.created_at,
    };
  }

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
    setMeasurements(prev => {
      const found = prev.find(m => m.id === measurementId);
      // Bridge: condições de pista para o cloud (não precisa de carId)
      if (found?.category === 'temperature' || found?.label?.toLowerCase().includes('temperatura')) {
        const d = found.data || {};
        window.cloudTeamAPI?.saveTrackCond?.({
          asphaltTemp: d.tempPista   ?? d.asphaltTemp ?? null,
          airTemp:     d.tempAmbiente ?? d.airTemp    ?? null,
          humidity:    d.umidade      ?? d.humidity   ?? null,
          condition:   d.condicaoPista ?? d.condition ?? null,
        }).catch?.(() => {});
      }
      return prev.map(m =>
        m.id === measurementId ? { ...m, status: 'approved', approvedAt: new Date().toISOString() } : m
      );
    });
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

  // Persiste histórico de medições em disco sempre que muda
  useEffect(() => {
    if (!window.teamAPI?.saveMeasurements) return;
    if (measurements.length === 0) return;
    window.teamAPI.saveMeasurements(measurements).catch(() => {});
  }, [measurements]);

  const refreshServerInfo = useCallback(async () => {
    if (!window.teamAPI) return;
    const info = await window.teamAPI.getServerInfo();
    setServerInfo(info);
    setDevices(info.devices || []);
  }, []);

  const markChatRead = useCallback(() => setUnreadChat(0), []);
  const dismissChatToast = useCallback(() => setChatToast(null), []);

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
      chatToast, dismissChatToast,
      typingUsers,
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
