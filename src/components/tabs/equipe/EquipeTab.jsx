/**
 * EquipeTab.jsx
 *
 * Aba de gerenciamento de equipe no desktop.
 * Exibe: servidor (QR code / IP), dispositivos conectados,
 * medições pendentes (aprovar/ignorar), cronômetros e chat da equipe.
 * Também expõe seções de nuvem: Visão Geral e Sessão.
 */

import { useState, useEffect, useRef } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { useTeam } from '@/context/TeamContext';

const ROLE_LABEL = {
  mecanico:   '🔧 Mecânico',
  auxiliar:   '🛠️ Auxiliar',
  engenheiro: '📐 Engenheiro',
  piloto:     '🏎️ Piloto',
};

const CATEGORY_LABEL = {
  temperaturas: '🌡️ Temperaturas & Condições',
  pressoes:     '🔧 Pressões de Pneus',
  mecanica:     '📐 Medições Mecânicas',
  combustivel:  '⛽ Combustível',
  peso:         '⚖️ Peso',
  pit_stop:     '🏁 Pit Stop',
  volta_manual: '🕐 Volta Manual',
  warmup_pneu:  '🔥 Warm-Up de Pneu',
  reparo:       '🔩 Reparo / Ajuste',
  abastecimento:'⛽ Abastecimento',
  outro:        '📋 Outro',
};

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}

function fmtTs(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return iso; }
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR'); }
  catch { return iso; }
}

export default function EquipeTab({ onApplyMeasurement, onApplyCloudRecord, profilesList = [] }) {
  const COLORS = useColors();
  const theme  = makeTheme(COLORS);
  const {
    serverInfo, devices, messages, measurements, timers,
    unreadChat, pendingCount,
    sendChatMessage, approveMeasurement, dismissMeasurement, approveTimer,
    refreshServerInfo, markChatRead, senderNameRef,
    deviceAssignments, assignDeviceToProfile,
    sendEmergency, typingUsers,
    // Workspace pago (Etapa 4)
    cloudSeats, pendingMembers, cloudMeasurements, joinTokenInfo,
    approveMember, rejectMember, approveCloudMeasurement, dismissCloudMeasurement,
  } = useTeam();

  const [activeSection, setActiveSection] = useState('conexao');
  const [chatInput,     setChatInput]     = useState('');
  const [chatSearch,    setChatSearch]    = useState('');
  const [senderName,    setSenderName]    = useState(senderNameRef.current);
  const typingThrottle  = useRef(null);
  const [sessionInput,  setSessionInput]  = useState('');
  const [emergencyMsg,  setEmergencyMsg]  = useState('');
  const [emergencySent, setEmergencySent] = useState(false);

  // Cloud: Visão Geral
  const [cloudCars,       setCloudCars]       = useState([]);
  const [cloudCarData,    setCloudCarData]     = useState([]);
  const [cloudTrackCond,  setCloudTrackCond]   = useState(null);
  const [cloudMembers,    setCloudMembers]     = useState([]);
  const [cloudLoading,    setCloudLoading]     = useState(false);

  // Cloud: Sessão
  const [activeSession,     setActiveSession]     = useState(null);
  const [sessionLoading,    setSessionLoading]    = useState(false);
  const [newSessionName,    setNewSessionName]    = useState('');
  const [sessionFeedback,   setSessionFeedback]   = useState('');

  // Cloud: Dispositivos (membros da nuvem — substitui o conceito LAN)
  const [deviceMembers,     setDeviceMembers]     = useState([]);
  const [devLoading,        setDevLoading]        = useState(false);

  // Cloud: Medições (histórico completo — uma lista, sem sobrescrever)
  const [allMeasurements,   setAllMeasurements]   = useState([]);
  const [measLoading,       setMeasLoading]       = useState(false);

  // Cloud: sincronização de Perfis → carros (chefe)
  const [syncing,           setSyncing]           = useState(false);
  const [syncMsg,           setSyncMsg]           = useState('');

  // Cloud: Relatório de fim de evento (chefe gera)
  const [showReport,        setShowReport]        = useState(false);
  const [reportChecklist,   setReportChecklist]   = useState([]);

  // Cloud: Checklist
  const [checklistOverview, setChecklistOverview] = useState([]);
  const [checklistCarId,    setChecklistCarId]    = useState(null);
  const [checklistItems,    setChecklistItems]    = useState([]);
  const [checklistLoading,  setChecklistLoading]  = useState(false);
  const [newItemLabel,      setNewItemLabel]      = useState('');
  const [newItemScope,      setNewItemScope]      = useState('universal'); // 'universal' | 'car'

  // Apenas o chefe possui join token → usado como gate para deletar medições.
  const isChefe = !!joinTokenInfo?.joinToken;

  const chatEndRef = useRef(null);

  useEffect(() => {
    refreshServerInfo();
  }, []);

  useEffect(() => {
    if (activeSection === 'chat') {
      markChatRead();
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [activeSection, messages.length]);

  useEffect(() => {
    if (activeSection === 'visao-geral') {
      // Chefe: empurra os Perfis para a nuvem ao abrir (e depois carrega).
      // Garante que o mobile veja os perfis mesmo que o sync automático não
      // tenha disparado. Participante apenas carrega.
      if (isChefe && profilesList.length > 0) {
        syncProfilesToCloud().finally(() => loadCloudOverview());
      } else {
        loadCloudOverview();
      }
    }
  }, [activeSection]);

  // Sincroniza os Perfis do desktop → carros da nuvem (somente chefe).
  // Diferente do auto-sync silencioso do App.jsx, aqui há feedback visível.
  async function syncProfilesToCloud() {
    if (!isChefe || !window.cloudTeamAPI?.syncCars) return;
    const payload = (profilesList || []).map(p => ({
      clientId: p.id, name: p.name, number: p.number ?? null, color: p.color ?? null,
    }));
    if (payload.length === 0) { setSyncMsg('Nenhum perfil para sincronizar.'); return; }
    setSyncing(true);
    setSyncMsg('');
    try {
      const r = await window.cloudTeamAPI.syncCars(payload);
      if (r?.success) {
        setSyncMsg(`✓ ${payload.length} perfil(is) sincronizado(s) com a nuvem.`);
      } else {
        setSyncMsg(`Falha ao sincronizar: ${r?.message || 'erro desconhecido'}`);
      }
    } catch (e) {
      setSyncMsg('Falha ao sincronizar (sem conexão?).');
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (activeSection === 'sessao') {
      loadActiveSession();
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'dispositivos') {
      loadDeviceMembers();
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'notificacoes') {
      loadAllMeasurements();
    }
  }, [activeSection]);

  // Checklist: carrega ao abrir e faz polling a cada 8s para refletir o
  // andamento que os celulares vão marcando, em tempo quase real.
  useEffect(() => {
    if (activeSection !== 'checklist') return;
    loadChecklistOverview();
    const iv = setInterval(() => {
      loadChecklistOverview();
      if (checklistCarId) loadChecklistDetail(checklistCarId);
    }, 8000);
    return () => clearInterval(iv);
  }, [activeSection, checklistCarId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAllMeasurements() {
    setMeasLoading(true);
    try {
      const res = await window.cloudTeamAPI?.getAllMeasurements();
      const list = Array.isArray(res?.measurements ?? res) ? (res?.measurements ?? res) : [];
      setAllMeasurements(list);
    } catch (e) {
      console.error('Cloud measurements error:', e);
    } finally {
      setMeasLoading(false);
    }
  }

  // Aprovar uma medição da nuvem: grava como registro local na aba correta
  // (desktop = centralizador) e marca aprovada no servidor (notifica o mobile).
  async function handleApproveCloud(m) {
    try { onApplyCloudRecord?.(m); } catch (e) { console.error('Erro ao aplicar registro:', e); }
    try { await approveCloudMeasurement(m.id); } catch (e) { console.error('Erro ao aprovar:', e); }
    loadAllMeasurements();
  }

  async function handleDismissCloud(m) {
    try { await dismissCloudMeasurement(m.id); } catch (e) { console.error('Erro ao dispensar:', e); }
    loadAllMeasurements();
  }

  async function handleDeleteCloudMeasurement(id) {
    try {
      const res = await window.cloudTeamAPI?.deleteMeasurement(id);
      if (res?.success) {
        setAllMeasurements(prev => prev.filter(m => m.id !== id));
      } else {
        console.error('Delete measurement failed:', res?.message);
      }
    } catch (e) {
      console.error('Delete measurement error:', e);
    }
  }

  async function loadDeviceMembers() {
    setDevLoading(true);
    try {
      const res = await window.cloudTeamAPI?.getMembers();
      const list = Array.isArray(res?.members ?? res) ? (res?.members ?? res) : [];
      setDeviceMembers(list);
    } catch (e) {
      console.error('Cloud members error:', e);
    } finally {
      setDevLoading(false);
    }
  }

  /* ── Checklist ── */
  async function loadChecklistOverview() {
    setChecklistLoading(true);
    try {
      const [ov, cars] = await Promise.all([
        window.cloudTeamAPI?.getChecklistOverview(),
        cloudCars.length === 0 ? window.cloudTeamAPI?.getCars() : Promise.resolve(null),
      ]);
      if (cars) setCloudCars(Array.isArray(cars?.cars ?? cars) ? (cars?.cars ?? cars) : []);
      const list = Array.isArray(ov?.overview) ? ov.overview : [];
      setChecklistOverview(list);
      // Seleciona o 1º carro por padrão se ainda não houver seleção.
      const firstCar = list[0]?.car?.id || (cars?.cars ?? cars)?.[0]?.id || cloudCars[0]?.id || null;
      const carId = checklistCarId || firstCar;
      if (carId) { setChecklistCarId(carId); loadChecklistDetail(carId); }
    } catch (e) {
      console.error('Checklist overview error:', e);
    } finally {
      setChecklistLoading(false);
    }
  }

  async function loadChecklistDetail(carId) {
    if (!carId) { setChecklistItems([]); return; }
    try {
      const res = await window.cloudTeamAPI?.getChecklist(carId);
      setChecklistItems(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      console.error('Checklist detail error:', e);
    }
  }

  function selectChecklistCar(carId) {
    setChecklistCarId(carId);
    loadChecklistDetail(carId);
  }

  // Relatório de fim de evento (somente chefe). Agrega os dados já carregados
  // (medições por carro + membros) e busca o resumo do checklist.
  async function handleGenerateReport() {
    try {
      const [ov] = await Promise.all([
        window.cloudTeamAPI?.getChecklistOverview(),
        allMeasurements.length === 0 ? loadAllMeasurements() : Promise.resolve(),
      ]);
      setReportChecklist(Array.isArray(ov?.overview) ? ov.overview : []);
    } catch (e) {
      console.error('Report data error:', e);
      setReportChecklist([]);
    }
    setShowReport(true);
  }

  async function handleAddChecklistItem() {
    const label = newItemLabel.trim();
    if (!label) return;
    const targetCarId = newItemScope === 'car' ? checklistCarId : null;
    try {
      const r = await window.cloudTeamAPI?.addChecklistItem(label, targetCarId);
      if (r?.success) {
        setNewItemLabel('');
        await loadChecklistDetail(checklistCarId);
        loadChecklistOverview();
      } else {
        window.alert(r?.message || 'Erro ao adicionar item.');
      }
    } catch (e) { console.error('Add checklist item error:', e); }
  }

  async function handleDeleteChecklistItem(itemId) {
    try {
      const r = await window.cloudTeamAPI?.deleteChecklistItem(itemId);
      if (r?.success) {
        setChecklistItems(prev => prev.filter(i => i.id !== itemId));
        loadChecklistOverview();
      }
    } catch (e) { console.error('Delete checklist item error:', e); }
  }

  async function handleResetChecklist() {
    if (!checklistCarId) return;
    if (!window.confirm('Resetar o checklist deste carro? Todas as marcações serão apagadas.')) return;
    try {
      const r = await window.cloudTeamAPI?.resetChecklist(checklistCarId);
      if (r?.success) { await loadChecklistDetail(checklistCarId); loadChecklistOverview(); }
    } catch (e) { console.error('Reset checklist error:', e); }
  }

  // Chefe remove um membro ativo da equipe (libera o seat).
  async function handleRemoveMember(m) {
    const nome = m.label || m.username || 'este membro';
    if (!window.confirm(`Remover ${nome} da equipe? O dispositivo perderá o acesso e o seat será liberado.`)) return;
    try {
      const r = await window.cloudTeamAPI?.removeMember(m.id);
      if (r?.success) {
        setDeviceMembers(prev => prev.filter(x => x.id !== m.id));
      } else {
        window.alert(r?.message || 'Não foi possível remover o membro.');
      }
    } catch (e) {
      console.error('Remove member error:', e);
    }
  }

  async function loadCloudOverview() {
    setCloudLoading(true);
    try {
      const [cars, trackCond, members, meas] = await Promise.all([
        window.cloudTeamAPI?.getCars(),
        window.cloudTeamAPI?.getLatestTrackCond(),
        window.cloudTeamAPI?.getMembers(),
        window.cloudTeamAPI?.getAllMeasurements(),
      ]);
      setCloudCars(Array.isArray(cars?.cars ?? cars) ? (cars?.cars ?? cars) : []);
      setCloudTrackCond(trackCond?.condition ?? trackCond ?? null);
      setCloudMembers(Array.isArray(members?.members ?? members) ? (members?.members ?? members) : []);
      setAllMeasurements(Array.isArray(meas?.measurements ?? meas) ? (meas?.measurements ?? meas) : []);
    } catch (e) {
      console.error('Cloud overview error:', e);
    } finally {
      setCloudLoading(false);
    }
  }

  async function loadActiveSession() {
    setSessionLoading(true);
    try {
      const res = await window.cloudTeamAPI?.getActiveSession();
      setActiveSession(res?.session ?? res ?? null);
    } catch (e) {
      console.error('Cloud session error:', e);
    } finally {
      setSessionLoading(false);
    }
  }

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const handleChatInputChange = (e) => {
    setChatInput(e.target.value);
    // Envia evento typing via WebSocket (throttle 2 s)
    if (!e.target.value.trim() || typingThrottle.current) return;
    window.teamAPI?.sendTypingEvent?.();
    typingThrottle.current = setTimeout(() => { typingThrottle.current = null; }, 2000);
  };

  const handleApprove = (m) => {
    try { onApplyMeasurement?.(m); } catch (e) { console.error('Erro ao aplicar medição:', e); }
    approveMeasurement(m.id, m.deviceId).catch(() => {});
  };

  const handleStartSession = async () => {
    const name = newSessionName.trim();
    if (!name) return;
    setSessionLoading(true);
    setSessionFeedback('');
    try {
      const res = await window.cloudTeamAPI?.startSession(name);
      if (res?.success || res?.session) {
        setNewSessionName('');
        setSessionFeedback('Sessão iniciada com sucesso!');
        await loadActiveSession();
      } else {
        setSessionFeedback(res?.message || 'Erro ao iniciar sessão.');
      }
    } catch {
      setSessionFeedback('Erro ao iniciar sessão.');
    } finally {
      setSessionLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession?.id) return;
    setSessionLoading(true);
    setSessionFeedback('');
    try {
      const res = await window.cloudTeamAPI?.endSession(activeSession.id);
      if (res?.success || res?.session) {
        setSessionFeedback('Sessão encerrada.');
        setActiveSession(null);
      } else {
        setSessionFeedback(res?.message || 'Erro ao encerrar sessão.');
      }
    } catch {
      setSessionFeedback('Erro ao encerrar sessão.');
    } finally {
      setSessionLoading(false);
    }
  };

  const C = COLORS;

  const NAV = [
    { key: 'conexao',       label: '📡 Conexão'       },
    { key: 'dispositivos',  label: `📱 Dispositivos ${(deviceMembers.length + devices.length) > 0 ? `(${deviceMembers.length + devices.length})` : ''}` },
    { key: 'notificacoes',  label: `🔔 Medições ${(pendingCount + (cloudMeasurements?.length || 0)) > 0 ? `(${pendingCount + (cloudMeasurements?.length || 0)})` : ''}` },
    { key: 'checklist',     label: '✅ Checklist' },
    { key: 'chat',          label: `💬 Chat ${unreadChat > 0 ? `(${unreadChat})` : ''}` },
    { key: 'visao-geral',   label: '📊 Visão Geral' },
    { key: 'sessao',        label: '🏁 Sessão' },
    { key: 'emergencia',    label: '🚨 EMERGÊNCIA' },
  ];

  const INPUT_STYLE = {
    background: C.bg, color: C.textPrimary, border: `1px solid ${C.border}`,
    borderRadius: 7, padding: '8px 12px', fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: 24 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.textPrimary, marginBottom: 4 }}>
          📡 Equipe Conectada
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          Gerencie dispositivos, medições recebidas e chat da equipe em tempo real via Wi-Fi local
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {NAV.map(n => (
          <button key={n.key} onClick={() => setActiveSection(n.key)} style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: n.key === 'emergencia' ? 800 : 600, cursor: 'pointer',
            background: n.key === 'emergencia'
              ? (activeSection === n.key ? `${C.accent}25` : `${C.accent}10`)
              : (activeSection === n.key ? `${C.blue}20` : 'transparent'),
            border: `1px solid ${n.key === 'emergencia'
              ? C.accent
              : (activeSection === n.key ? C.blue : C.border)}`,
            color: n.key === 'emergencia'
              ? C.accent
              : (activeSection === n.key ? C.blue : C.textSecondary),
          }}>
            {n.label}
          </button>
        ))}
      </div>

      {/* ─── Seção: Conexão / QR Code ─── */}
      {activeSection === 'conexao' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>

          {/* ─── Workspace na nuvem (Etapa 4) ─── */}
          <div style={{ ...theme.card, flex: '1 1 100%' }}>
            <div style={theme.cardTitle}>☁️ Workspace na nuvem</div>

            {/* Resumo de seats */}
            {cloudSeats ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                {[
                  { n: `${cloudSeats.used ?? 0}/${cloudSeats.seatLimit ?? '∞'}`, l: 'Seats' },
                  { n: `🖥️ ${cloudSeats.byType?.desktop ?? 0}`, l: 'Desktop' },
                  { n: `📱 ${cloudSeats.byType?.mobile ?? 0}`, l: 'Mobile' },
                  { n: `⏳ ${cloudSeats.pendingCount ?? 0}`, l: 'Pendentes' },
                ].map((s, i) => (
                  <div key={i} style={{ background: `${C.bgCard}80`, border: `1px solid ${C.border}22`,
                    borderRadius: 8, padding: '8px 16px', textAlign: 'center', minWidth: 72 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.textPrimary }}>{s.n}</div>
                    <div style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{s.l}</div>
                  </div>
                ))}
                {cloudSeats.workspaceStatus === 'suspended' && (
                  <div style={{ alignSelf: 'center', color: C.accent, fontWeight: 700, fontSize: 12 }}>⚠️ Workspace suspenso</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Carregando dados do workspace…</div>
            )}

            {/* Dispositivos aguardando aprovação (chefe) */}
            {pendingMembers?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                  Aguardando aprovação
                </div>
                {pendingMembers.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: `${C.yellow}10`, border: `1px solid ${C.yellow}30`, borderRadius: 8,
                    padding: '8px 12px', marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>
                      {m.device_type === 'mobile' ? '📱' : '🖥️'} {m.full_name || m.username || m.apex_hash}
                    </span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => approveMember(m.id)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', border: 'none',background: C.green, color: '#fff' }}>Aprovar</button>
                      <button onClick={() => rejectMember(m.id)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: C.textMuted, border: `1px solid ${C.border}` }}>Rejeitar</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Medições pendentes da nuvem → aprovação acontece na aba Medições
                (lá o registro é gravado no perfil correto). */}
            {cloudMeasurements?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                  Medições aguardando aprovação
                </div>
                <button onClick={() => setActiveSection('notificacoes')} style={{
                  width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: `${C.blue}10`, border: `1px solid ${C.blue}30`, borderRadius: 8,
                  padding: '10px 12px', cursor: 'pointer', color: C.textPrimary }}>
                  <span style={{ fontSize: 13 }}>
                    🔔 <strong>{cloudMeasurements.length}</strong> medição{cloudMeasurements.length !== 1 ? 'ões' : ''} aguardando
                  </span>
                  <span style={{ fontSize: 12, color: C.blue, fontWeight: 700 }}>Ver na aba Medições →</span>
                </button>
              </div>
            )}

            {/* Token de pareamento da nuvem (chefe) */}
            {joinTokenInfo?.joinToken && (
              <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted }}>
                Token de pareamento: <code style={{ color: C.cyan }}>{joinTokenInfo.joinToken}</code>
              </div>
            )}
          </div>

          {/* Card QR */}
          <div style={{ ...theme.card, flex: '0 0 auto', minWidth: 280, textAlign: 'center' }}>
            <div style={theme.cardTitle}>🔗 Pareamento via QR Code</div>
            {joinTokenInfo?.qrDataUrl ? (
              <>
                <img src={joinTokenInfo.qrDataUrl} alt="QR Code"
                  style={{ width: 220, height: 220, borderRadius: 8, margin: '8px auto', display: 'block',
                    border: `2px solid ${C.border}`, background: '#fff' }} />
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
                  Escaneie com o app ApexDynamics Mobile
                </div>
              </>
            ) : (
              <div style={{ padding: 40, color: C.textMuted, fontSize: 13 }}>Gerando QR Code...</div>
            )}
          </div>

          {/* Card Info do servidor */}
          <div style={{ ...theme.card, flex: 1, minWidth: 260 }}>
            <div style={theme.cardTitle}>🌐 Servidor Local</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: serverInfo?.running ? `${C.green}12` : `${C.accent}12`,
                borderRadius: 8, border: `1px solid ${serverInfo?.running ? C.green : C.accent}40` }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {serverInfo?.running ? '🟢 Servidor ativo' : '🔴 Servidor inativo'}
                </span>
                <span style={{ fontSize: 11, color: C.textMuted }}>porta {serverInfo?.port ?? 8765}</span>
              </div>

              <div style={{ background: `${C.bgCard}80`, borderRadius: 8, padding: '10px 14px',
                border: `1px solid ${C.border}22` }}>
                <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase',
                  letterSpacing: '0.8px', marginBottom: 4 }}>Endereço IP</div>
                <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: C.blue }}>
                  {serverInfo?.ip ?? '—'}:{serverInfo?.port ?? 8765}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Nome da sessão</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={sessionInput || serverInfo?.sessionName || ''}
                    onChange={e => setSessionInput(e.target.value)}
                    placeholder="Ex: Treino Interlagos R1"
                    style={{ ...INPUT_STYLE, flex: 1 }} />
                  <button onClick={async () => {
                    if (!sessionInput.trim()) return;
                    await window.teamAPI?.setSessionName(sessionInput.trim());
                    await refreshServerInfo();
                    setSessionInput('');
                  }} style={{
                    padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                    background: `${C.blue}18`, color: C.blue,
                    border: `1px solid ${C.blue}40`, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                    Salvar
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Seu nome no chat</div>
                <input value={senderName}
                  onChange={e => { setSenderName(e.target.value); senderNameRef.current = e.target.value; }}
                  placeholder="Ex: Lucas — Engenheiro"
                  style={INPUT_STYLE} />
              </div>

              <button onClick={refreshServerInfo} style={{
                padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: 'transparent', color: C.textSecondary,
                border: `1px solid ${C.border}`, cursor: 'pointer', marginTop: 4,
              }}>
                🔄 Atualizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Seção: Dispositivos ─── */}
      {activeSection === 'dispositivos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Membros da equipe (nuvem) */}
        <div style={theme.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={theme.cardTitle}>📱 Dispositivos da Equipe</div>
            <button onClick={loadDeviceMembers} disabled={devLoading} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: devLoading ? 'default' : 'pointer',
              background: `${C.blue}18`, color: C.blue, border: `1px solid ${C.blue}40`,
              opacity: devLoading ? 0.6 : 1,
            }}>{devLoading ? '⏳' : '🔄 Atualizar'}</button>
          </div>
          {deviceMembers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: C.textMuted, fontSize: 13 }}>
              {devLoading ? 'Carregando…' : (<>Nenhum dispositivo vinculado ainda.<br/>
              <span style={{ fontSize: 11 }}>Compartilhe o QR Code (aba Conexão) para o app mobile entrar.</span></>)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deviceMembers.map(m => {
                const online = m.last_login && (Date.now() - new Date(m.last_login).getTime() < 5 * 60 * 1000);
                return (
                  <div key={m.id} style={{
                    padding: '12px 16px', background: `${C.bgCard}80`,
                    borderRadius: 10, border: `1px solid ${C.border}33`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%',
                        background: online ? C.green : C.textMuted,
                        boxShadow: online ? `0 0 6px ${C.green}` : 'none' }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          {m.label || m.username || '—'}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          {m.username && m.label ? `@${m.username} · ` : ''}
                          {m.last_login ? `visto ${fmtTs(m.last_login)}` : 'nunca conectou'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10,
                        color: m.is_mobile ? C.blue : C.purple,
                        background: `${m.is_mobile ? C.blue : C.purple}18`,
                        padding: '2px 8px', borderRadius: 4,
                        border: `1px solid ${m.is_mobile ? C.blue : C.purple}30` }}>
                        {m.is_mobile ? '📱 mobile' : '🖥️ desktop'}
                      </span>
                      {m.role === 'chefe' && (
                        <span style={{ fontSize: 10, color: C.green, background: `${C.green}18`,
                          padding: '2px 8px', borderRadius: 4, border: `1px solid ${C.green}30` }}>👑 chefe</span>
                      )}
                      {isChefe && m.role !== 'chefe' && (
                        <button onClick={() => handleRemoveMember(m)} title="Remover da equipe" style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                          background: 'transparent', color: C.accent, border: `1px solid ${C.accent}40` }}>
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dispositivos LAN (Wi-Fi local) — legado, exibido só se houver */}
        {devices.length > 0 && (
          <div style={theme.card}>
            <div style={theme.cardTitle}>🌐 Conectados via Wi-Fi local</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {devices.map(d => {
                const assignedIds = deviceAssignments[d.deviceId] || [];
                const toggleProfile = (profileId) => {
                  const current = Array.isArray(assignedIds) ? assignedIds : [];
                  let next, nextNames;
                  if (current.includes(profileId)) {
                    next = current.filter(id => id !== profileId);
                    nextNames = next.map(id => profilesList.find(p => p.id === id)?.name || 'Perfil');
                  } else {
                    next = [...current, profileId];
                    nextNames = next.map(id => profilesList.find(p => p.id === id)?.name || 'Perfil');
                  }
                  assignDeviceToProfile(d.deviceId, next.length > 0 ? next : null, next.length > 0 ? nextNames : null);
                };
                return (
                  <div key={d.deviceId} style={{
                    padding: '12px 16px', background: `${C.bgCard}80`,
                    borderRadius: 10, border: `1px solid ${C.green}30`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%',
                          background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name}</div>
                          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                            {ROLE_LABEL[d.role] || d.role} · conectado {fmtTs(d.connectedAt)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {d.battery !== null && d.battery !== undefined && (
                          <span style={{ fontSize: 11, color: d.battery < 20 ? C.accent : C.textMuted }}>
                            🔋 {d.battery}%
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: C.blue, background: `${C.blue}18`,
                          padding: '2px 8px', borderRadius: 4, border: `1px solid ${C.blue}30` }}>
                          📱 mobile
                        </span>
                      </div>
                    </div>

                    {/* Atribuição de perfis — multi-select com checkboxes */}
                    <div style={{ marginTop: 10, padding: '8px 10px', background: `${C.bg}80`, borderRadius: 8,
                      border: `1px solid ${C.border}44` }}>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
                        🏎️ Perfis atribuídos {assignedIds.length > 0 ? `(${assignedIds.length})` : '— nenhum'}:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {profilesList.map(p => {
                          const isChecked = Array.isArray(assignedIds) && assignedIds.includes(p.id);
                          return (
                            <button key={p.id} onClick={() => toggleProfile(p.id)} style={{
                              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                              cursor: 'pointer',
                              background: isChecked ? `${C.green}20` : 'transparent',
                              border: `1px solid ${isChecked ? C.green + '60' : C.border}`,
                              color: isChecked ? C.green : C.textMuted,
                            }}>
                              {isChecked ? '✓ ' : ''}{p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        </div>
      )}

      {/* ─── Seção: Medições / Notificações ─── */}
      {activeSection === 'notificacoes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Histórico de medições da nuvem — lista por perfil, sem sobrescrever */}
          <div style={theme.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={theme.cardTitle}>📋 Medições Recebidas</div>
              <button onClick={loadAllMeasurements} disabled={measLoading} style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: measLoading ? 'default' : 'pointer',
                background: `${C.blue}18`, color: C.blue, border: `1px solid ${C.blue}40`,
                opacity: measLoading ? 0.6 : 1,
              }}>{measLoading ? '⏳' : '🔄 Atualizar'}</button>
            </div>

            {allMeasurements.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: C.textMuted, fontSize: 13 }}>
                {measLoading ? 'Carregando…' : 'Nenhuma medição recebida ainda.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  ...cloudCars.map(c => ({ id: c.id, name: c.name, number: c.number, color: c.color })),
                  { id: null, name: 'Sem perfil', number: null, color: null },
                ].map(car => {
                  const list = allMeasurements.filter(m => (m.target_car_id ?? null) === (car.id ?? null));
                  if (list.length === 0) return null;
                  return (
                    <div key={car.id || 'none'}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%',
                          background: car.color || C.textMuted, border: `1px solid ${C.border}`, flexShrink: 0 }} />
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>
                          {car.number != null ? `#${car.number} ` : ''}{car.name}
                          <span style={{ color: C.textMuted, fontWeight: 400, marginLeft: 6 }}>
                            · {list.length} medição{list.length !== 1 ? 'ões' : ''}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {list.map(m => (
                          <CloudMeasurementRow key={m.id} m={m} COLORS={C} isChefe={isChefe}
                            onApprove={m.status === 'pending' ? () => handleApproveCloud(m) : null}
                            onDismiss={m.status === 'pending' ? () => handleDismissCloud(m) : null}
                            onDelete={() => handleDeleteCloudMeasurement(m.id)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {isChefe && allMeasurements.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted }}>
                🗑️ Como chefe, você pode deletar qualquer medição desta lista.
              </div>
            )}
          </div>

          {/* Medições LAN (legado — Wi-Fi local), exibidas só se houver */}
          {measurements.filter(m => m.status === 'pending').length > 0 && (
            <div style={theme.card}>
              <div style={{ ...theme.cardTitle, color: C.orange }}>🔔 Medições Wi-Fi Aguardando Aprovação</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {measurements.filter(m => m.status === 'pending').map(m => (
                  <MeasurementCard key={m.id} m={m} COLORS={C}
                    onApprove={() => handleApprove(m)}
                    onDismiss={() => dismissMeasurement(m.id, m.deviceId)} />
                ))}
              </div>
            </div>
          )}

          {/* Cronômetros pendentes (LAN) */}
          {timers.filter(t => t.status === 'pending').length > 0 && (
            <div style={theme.card}>
              <div style={{ ...theme.cardTitle, color: C.orange }}>⏱️ Cronômetros Aguardando Aprovação</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {timers.filter(t => t.status === 'pending').map(t => (
                  <TimerCard key={t.id} t={t} COLORS={C}
                    onApprove={() => approveTimer(t.id, t.deviceId)}
                    onDismiss={() => {}} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Seção: Chat ─── */}
      {activeSection === 'chat' && (() => {
        const typingNames = Object.values(typingUsers || {});
        const filtered = chatSearch.trim()
          ? messages.filter(m => m.content?.text?.toLowerCase().includes(chatSearch.toLowerCase()))
          : messages;
        return (
          <div style={{ ...theme.card, display: 'flex', flexDirection: 'column', height: 540 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={theme.cardTitle}>💬 Chat da Equipe</div>
              <input
                value={chatSearch}
                onChange={e => setChatSearch(e.target.value)}
                placeholder="🔍 Buscar mensagem..."
                style={{ ...INPUT_STYLE, width: 200, fontSize: 12, padding: '5px 10px' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
              gap: 8, padding: '4px 0', marginBottom: 6 }}>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 12, padding: '24px 0' }}>
                  {chatSearch.trim() ? 'Nenhuma mensagem encontrada.' : 'O chat da equipe aparecerá aqui.'}
                </div>
              )}
              {filtered.map((msg, i) => {
                const isSystem = msg.type === 'chat:system';
                const isMe     = msg.from?.deviceId === 'desktop';
                if (isSystem) return (
                  <div key={msg.id || i} style={{ textAlign: 'center', fontSize: 11,
                    color: C.textMuted, fontStyle: 'italic', padding: '2px 0' }}>
                    {msg.content?.text}
                  </div>
                );
                return (
                  <div key={msg.id || i} style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: isMe ? 'flex-end' : 'flex-start',
                  }}>
                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2, paddingLeft: 4 }}>
                      {isMe ? 'Você' : msg.from?.name} · {fmtTs(msg.timestamp)}
                    </div>
                    <div style={{
                      maxWidth: '75%', padding: '8px 12px', borderRadius: 10, fontSize: 13,
                      background: isMe ? `${C.blue}25` : C.bgCard,
                      border: `1px solid ${isMe ? C.blue + '40' : C.border + '44'}`,
                      color: C.textPrimary,
                    }}>
                      {msg.content?.text}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            {typingNames.length > 0 && (
              <div style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic', marginBottom: 6, paddingLeft: 2 }}>
                ✏️ {typingNames.join(', ')} {typingNames.length === 1 ? 'está digitando...' : 'estão digitando...'}
              </div>
            )}
            <form onSubmit={handleSendChat} style={{ display: 'flex', gap: 8 }}>
              <input
                value={chatInput}
                onChange={handleChatInputChange}
                placeholder="Digite uma mensagem..."
                style={{ ...INPUT_STYLE, flex: 1 }}
              />
              <button type="submit" disabled={!chatInput.trim()} style={{
                padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 700,
                background: chatInput.trim() ? C.blue : 'transparent',
                color: chatInput.trim() ? '#fff' : C.textMuted,
                border: `1px solid ${chatInput.trim() ? C.blue : C.border}`,
                cursor: chatInput.trim() ? 'pointer' : 'default',
              }}>
                Enviar
              </button>
            </form>
          </div>
        );
      })()}

      {/* ─── Seção: Checklist ─── */}
      {activeSection === 'checklist' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>✅ Checklist da Equipe</div>
            <button onClick={loadChecklistOverview} disabled={checklistLoading} style={{
              padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: checklistLoading ? 'default' : 'pointer',
              background: `${C.blue}18`, color: C.blue, border: `1px solid ${C.blue}40`, opacity: checklistLoading ? 0.6 : 1,
            }}>{checklistLoading ? '⏳' : '🔄 Atualizar'}</button>
          </div>
          <div style={{ fontSize: 11, color: C.textMuted }}>
            {isChefe ? '👑 Você é o chefe: pode criar itens (universais ou de um carro), deletar e resetar. Todos veem o andamento.'
                     : '👀 Somente o chefe edita o checklist. Você acompanha o andamento aqui e marca pelo app mobile.'}
          </div>

          {checklistOverview.length === 0 ? (
            <div style={{ ...theme.card, textAlign: 'center', padding: '28px 0', color: C.textMuted, fontSize: 13 }}>
              {checklistLoading ? 'Carregando…' : 'Nenhum carro/perfil na nuvem. Sincronize os perfis na Visão Geral.'}
            </div>
          ) : (
            <>
              {/* Andamento por carro — clique para abrir */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {checklistOverview.map(o => {
                  const sel = o.car.id === checklistCarId;
                  const pct = o.total > 0 ? Math.round((o.done / o.total) * 100) : 0;
                  return (
                    <button key={o.car.id} onClick={() => selectChecklistCar(o.car.id)} style={{
                      flex: '1 1 220px', minWidth: 200, maxWidth: 320, textAlign: 'left', cursor: 'pointer',
                      ...theme.card, padding: 12,
                      border: `1px solid ${sel ? C.blue : C.border + '33'}`,
                      boxShadow: sel ? `0 0 0 1px ${C.blue}` : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: o.car.color || C.blue, border: `1px solid ${C.border}` }} />
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.textPrimary }}>
                          {o.car.number != null ? `#${o.car.number} ` : ''}{o.car.name}
                        </div>
                        {o.finished && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: C.green, background: `${C.green}18`, padding: '2px 8px', borderRadius: 4 }}>✓ Finalizado</span>}
                      </div>
                      <div style={{ height: 6, borderRadius: 4, background: `${C.border}44`, overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: o.finished ? C.green : C.blue }} />
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>
                        {o.done}/{o.total} itens{o.lastBy ? ` · último: ${o.lastBy}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Detalhe do carro selecionado */}
              {checklistCarId && (
                <div style={theme.card}>
                  {(() => {
                    const car = checklistOverview.find(o => o.car.id === checklistCarId)?.car;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={theme.cardTitle}>
                          📋 {car ? `${car.number != null ? `#${car.number} ` : ''}${car.name}` : 'Checklist'}
                        </div>
                        {isChefe && (
                          <button onClick={handleResetChecklist} style={{
                            fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                            background: 'transparent', color: C.orange, border: `1px solid ${C.orange}40` }}>♻️ Resetar</button>
                        )}
                      </div>
                    );
                  })()}

                  {checklistItems.length === 0 ? (
                    <div style={{ fontSize: 13, color: C.textMuted, padding: '12px 0' }}>
                      Nenhum item de checklist {isChefe ? '— adicione abaixo.' : 'ainda.'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {checklistItems.map(it => (
                        <div key={it.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          background: `${C.bgCard}60`, borderRadius: 8, border: `1px solid ${C.border}22`,
                        }}>
                          <span style={{ fontSize: 16 }}>{it.checked ? '✅' : '⬜'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: C.textPrimary, textDecoration: it.checked ? 'line-through' : 'none', opacity: it.checked ? 0.7 : 1 }}>
                              {it.label}
                              {it.scope === 'universal'
                                ? <span style={{ fontSize: 9, color: C.textMuted, marginLeft: 6, border: `1px solid ${C.border}55`, borderRadius: 3, padding: '1px 5px' }}>universal</span>
                                : <span style={{ fontSize: 9, color: C.purple, marginLeft: 6, border: `1px solid ${C.purple}55`, borderRadius: 3, padding: '1px 5px' }}>este carro</span>}
                            </div>
                            {it.checked && (
                              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                                por {it.checkedByName || 'equipe'}{it.checkedAt ? ` · ${fmtDateTime(it.checkedAt)}` : ''}
                              </div>
                            )}
                          </div>
                          {isChefe && (
                            <button onClick={() => handleDeleteChecklistItem(it.id)} title="Remover item" style={{
                              fontSize: 12, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                              background: 'transparent', color: C.accent, border: `1px solid ${C.accent}40` }}>🗑️</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Editor do chefe */}
                  {isChefe && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}33` }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        {['universal', 'car'].map(sc => (
                          <button key={sc} onClick={() => setNewItemScope(sc)} style={{
                            fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                            background: newItemScope === sc ? `${C.blue}22` : 'transparent',
                            color: newItemScope === sc ? C.blue : C.textMuted,
                            border: `1px solid ${newItemScope === sc ? C.blue : C.border}40` }}>
                            {sc === 'universal' ? '🌐 Para todos os carros' : '🎯 Só para este carro'}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={newItemLabel} onChange={e => setNewItemLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddChecklistItem(); }}
                          placeholder="Ex.: Verificar pressão dos pneus"
                          style={{ flex: 1, padding: '9px 12px', borderRadius: 7, fontSize: 13,
                            background: C.bgCard, color: C.textPrimary, border: `1px solid ${C.border}` }} />
                        <button onClick={handleAddChecklistItem} style={{
                          padding: '9px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                          background: C.blue, color: '#fff' }}>+ Adicionar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Seção: Visão Geral (Cloud) ─── */}
      {activeSection === 'visao-geral' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header com botões Atualizar e (chefe) Sincronizar perfis */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>
              📊 Visão Geral da Equipe — Nuvem
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isChefe && (
                <button onClick={handleGenerateReport} style={{
                  padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: `${C.purple}18`, color: C.purple, border: `1px solid ${C.purple}40`,
                }}>
                  📄 Gerar relatório
                </button>
              )}
              {isChefe && (
                <button onClick={() => syncProfilesToCloud().then(loadCloudOverview)} disabled={syncing} style={{
                  padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: syncing ? 'default' : 'pointer',
                  background: `${C.green}18`, color: C.green, border: `1px solid ${C.green}40`,
                  opacity: syncing ? 0.6 : 1,
                }}>
                  {syncing ? '⏳ Sincronizando...' : '🏎️ Sincronizar perfis'}
                </button>
              )}
              <button onClick={loadCloudOverview} disabled={cloudLoading} style={{
                padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: cloudLoading ? 'default' : 'pointer',
                background: `${C.blue}18`, color: C.blue, border: `1px solid ${C.blue}40`,
                opacity: cloudLoading ? 0.6 : 1,
              }}>
                {cloudLoading ? '⏳ Carregando...' : '🔄 Atualizar'}
              </button>
            </div>
          </div>

          {/* Feedback da sincronização de perfis (chefe) */}
          {isChefe && syncMsg && (
            <div style={{ fontSize: 12, color: syncMsg.startsWith('✓') ? C.green : C.orange,
              background: `${syncMsg.startsWith('✓') ? C.green : C.orange}12`,
              border: `1px solid ${syncMsg.startsWith('✓') ? C.green : C.orange}33`,
              borderRadius: 7, padding: '7px 12px' }}>
              {syncMsg}
            </div>
          )}
          {isChefe && (
            <div style={{ fontSize: 11, color: C.textMuted }}>
              💡 Os perfis criados aqui (chefe) viram os carros que o app mobile da equipe pode selecionar. Renomear um perfil atualiza no mobile automaticamente.
            </div>
          )}

          {/* Cards por Perfil/Carro — cada um com pressão E temperatura */}
          {cloudCars.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary }}>🏎️ Perfis</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {cloudCars.map((car, idx) => {
                  // Última medição de cada categoria deste perfil (lista vem ordenada DESC).
                  const carMeas    = allMeasurements.filter(m => m.target_car_id === car.id);
                  const latestPres = carMeas.find(m => m.category === 'pressures');
                  const latestTemp = carMeas.find(m => m.category === 'temperatures');
                  const assignedMember = cloudMembers.find(m => m.id === car.assigned_user_id || m.user_id === car.assigned_user_id);

                  return (
                    <div key={car.id || idx} style={{
                      ...theme.card, flex: '1 1 320px', minWidth: 300, maxWidth: 460,
                    }}>
                      {/* Header do perfil */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%',
                          background: car.color || C.blue, border: `2px solid ${C.border}`, flexShrink: 0,
                        }} />
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary }}>
                            #{car.number ?? '—'} {car.name ?? ''}
                          </div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>
                            👤 {assignedMember?.username ?? assignedMember?.name ?? '— não atribuído'}
                          </div>
                        </div>
                      </div>

                      {/* Box Pressões */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase',
                          letterSpacing: '0.7px', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                          <span>🔧 Pressões dos Pneus</span>
                          {latestPres && <span style={{ textTransform: 'none', letterSpacing: 0 }}>{fmtTs(latestPres.created_at)}</span>}
                        </div>
                        {latestPres
                          ? <PressurePayload p={latestPres.payload} COLORS={C} />
                          : <div style={{ fontSize: 12, color: C.textMuted }}>Sem pressões registradas.</div>}
                      </div>

                      {/* Box Temperatura */}
                      <div>
                        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase',
                          letterSpacing: '0.7px', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                          <span>🌡️ Temperatura & Pista</span>
                          {latestTemp && <span style={{ textTransform: 'none', letterSpacing: 0 }}>{fmtTs(latestTemp.created_at)}</span>}
                        </div>
                        {latestTemp
                          ? <TempPayload p={latestTemp.payload} COLORS={C} />
                          : <div style={{ fontSize: 12, color: C.textMuted }}>Sem temperatura registrada.</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ ...theme.card, textAlign: 'center', padding: '28px 0', color: C.textMuted, fontSize: 13 }}>
              {cloudLoading ? 'Carregando…' : 'Nenhum perfil sincronizado na nuvem. Sincronize os Perfis no desktop chefe.'}
            </div>
          )}

          {/* Relatório de fim de evento (overlay) */}
          {showReport && (
            <div onClick={() => setShowReport(false)} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto',
            }}>
              <div onClick={e => e.stopPropagation()} style={{
                background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, width: '100%', maxWidth: 820, padding: 24,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.textPrimary }}>📄 Relatório de Fim de Evento</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>Gerado em {new Date().toLocaleString('pt-BR')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => window.print()} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: `${C.blue}18`, color: C.blue, border: `1px solid ${C.blue}40` }}>🖨️ Imprimir / PDF</button>
                    <button onClick={() => setShowReport(false)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.textMuted, border: `1px solid ${C.border}` }}>Fechar</button>
                  </div>
                </div>

                {cloudCars.length === 0 ? (
                  <div style={{ color: C.textMuted, fontSize: 13 }}>Nenhum perfil/carro na nuvem.</div>
                ) : cloudCars.map(car => {
                  const cm = allMeasurements.filter(m => m.target_car_id === car.id);
                  const pres = cm.find(m => m.category === 'pressures')?.payload || null;
                  const temp = cm.find(m => m.category === 'temperatures')?.payload || null;
                  const cl = reportChecklist.find(o => o.car.id === car.id);
                  return (
                    <div key={car.id} style={{ ...theme.card, marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: car.color || C.blue }} />
                        <span style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary }}>{car.number != null ? `#${car.number} ` : ''}{car.name}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 6 }}>🔧 Pressões</div>
                      {pres ? <PressurePayload p={pres} COLORS={C} /> : <div style={{ fontSize: 12, color: C.textMuted }}>Sem pressões.</div>}
                      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.7px', margin: '10px 0 6px' }}>🌡️ Temperatura</div>
                      {temp ? <TempPayload p={temp} COLORS={C} /> : <div style={{ fontSize: 12, color: C.textMuted }}>Sem temperatura.</div>}
                      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.7px', margin: '10px 0 4px' }}>✅ Checklist</div>
                      <div style={{ fontSize: 13, color: C.textPrimary }}>
                        {cl ? `${cl.done}/${cl.total} itens${cl.finished ? ' · ✓ finalizado' : ''}${cl.lastBy ? ` · último: ${cl.lastBy}` : ''}` : 'Sem checklist.'}
                      </div>
                    </div>
                  );
                })}

                <div style={{ ...theme.card }}>
                  <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8 }}>👥 Membros</div>
                  <div style={{ fontSize: 13, color: C.textPrimary }}>
                    {cloudMembers.length > 0 ? cloudMembers.map(m => m.username || m.label || '—').join(', ') : 'Nenhum membro.'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comparar carros lado a lado */}
          {cloudCars.length >= 2 && (() => {
            const cmp = cloudCars.map(car => {
              const cm = allMeasurements.filter(m => m.target_car_id === car.id);
              return {
                car,
                pres: cm.find(m => m.category === 'pressures')?.payload || null,
                temp: cm.find(m => m.category === 'temperatures')?.payload || null,
              };
            });
            const presRows = [{ k: 'FL', l: 'Pressão DE' }, { k: 'FR', l: 'Pressão DD' }, { k: 'RL', l: 'Pressão TE' }, { k: 'RR', l: 'Pressão TD' }];
            const tempRows = [{ k: 'tempPista', l: 'Temp. Pista', u: '°C' }, { k: 'tempAmbiente', l: 'Temp. Ar', u: '°C' }, { k: 'umidade', l: 'Umidade', u: '%' }, { k: 'condicaoPista', l: 'Condição', u: '' }];
            const th = { textAlign: 'left', padding: '7px 10px', fontSize: 11, color: C.textMuted, fontWeight: 700, borderBottom: `1px solid ${C.border}44` };
            const td = { padding: '7px 10px', fontSize: 12, color: C.textPrimary, fontFamily: 'monospace', borderBottom: `1px solid ${C.border}22` };
            const tdL = { ...td, fontFamily: 'inherit', color: C.textSecondary, fontWeight: 600 };
            const presCell = (p, k) => { const c = p?.[k] || {}; const f = c.fria, q = c.quente; if (f == null && q == null) return '—'; return `${f != null ? `❄${f}` : ''}${f != null && q != null ? ' ' : ''}${q != null ? `🔥${q}` : ''}`; };
            return (
              <div style={theme.card}>
                <div style={theme.cardTitle}>📐 Comparar Carros</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
                    <thead>
                      <tr>
                        <th style={th}></th>
                        {cmp.map(({ car }) => (
                          <th key={car.id} style={th}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: car.color || C.blue, display: 'inline-block' }} />
                              {car.number != null ? `#${car.number} ` : ''}{car.name}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {presRows.map(r => (
                        <tr key={r.k}>
                          <td style={tdL}>{r.l}</td>
                          {cmp.map(({ car, pres }) => <td key={car.id} style={td}>{presCell(pres, r.k)}</td>)}
                        </tr>
                      ))}
                      {tempRows.map(r => (
                        <tr key={r.k}>
                          <td style={tdL}>{r.l}</td>
                          {cmp.map(({ car, temp }) => {
                            const v = temp?.[r.k];
                            return <td key={car.id} style={td}>{v != null && v !== '' ? `${v}${r.u}` : '—'}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8 }}>❄ fria · 🔥 quente · valores da última medição de cada carro.</div>
              </div>
            );
          })()}

          {/* Track Conditions */}
          <div style={theme.card}>
            <div style={theme.cardTitle}>🌤️ Condições de Pista</div>
            {cloudTrackCond ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {[
                  { label: 'Temp. Asfalto', value: cloudTrackCond.asphalt_temp ?? cloudTrackCond.track_temp, unit: '°C' },
                  { label: 'Temp. Ar', value: cloudTrackCond.air_temp, unit: '°C' },
                  { label: 'Humidade', value: cloudTrackCond.humidity, unit: '%' },
                  { label: 'Condição', value: cloudTrackCond.condition ?? cloudTrackCond.status, unit: '' },
                ].map(({ label, value, unit }) => (
                  <div key={label} style={{
                    flex: '1 1 120px', padding: '10px 14px', borderRadius: 8,
                    background: `${C.bgCard}80`, border: `1px solid ${C.border}22`, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.textPrimary, fontFamily: 'monospace' }}>
                      {value !== undefined && value !== null ? `${value}${unit}` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.textMuted }}>
                {cloudLoading ? 'Carregando...' : 'Nenhuma condição de pista disponível.'}
              </div>
            )}
          </div>

          {/* Members */}
          <div style={theme.card}>
            <div style={theme.cardTitle}>👥 Membros da Equipe</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>
              Wi-Fi Local: {devices.length} online · Nuvem: {cloudMembers.length} cadastrado{cloudMembers.length !== 1 ? 's' : ''}
            </div>
            {cloudMembers.length === 0 && devices.length === 0 && (
              <div style={{ fontSize: 12, color: C.textMuted }}>Nenhum membro encontrado.</div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {/* Local (Wi-Fi) devices */}
              {devices.map(d => (
                <div key={`local-${d.deviceId}`} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                  borderRadius: 8, background: `${C.green}10`, border: `1px solid ${C.green}30`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green,
                    boxShadow: `0 0 5px ${C.green}` }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>{d.name}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>{ROLE_LABEL[d.role] || d.role} · Wi-Fi</div>
                  </div>
                </div>
              ))}
              {/* Cloud members */}
              {cloudMembers.map((m, idx) => (
                <div key={`cloud-${m.id || idx}`} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                  borderRadius: 8, background: `${C.blue}10`, border: `1px solid ${C.blue}25`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.blue }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>
                      {m.username ?? m.name ?? '—'}
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>
                      {m.role ?? 'Membro'} · Nuvem
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Seção: Sessão (Cloud) ─── */}
      {activeSection === 'sessao' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>🏁 Gestão de Sessão — Nuvem</div>

          {/* Active session card */}
          <div style={theme.card}>
            <div style={theme.cardTitle}>Sessão Atual</div>
            {sessionLoading ? (
              <div style={{ fontSize: 12, color: C.textMuted }}>Carregando...</div>
            ) : activeSession ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{
                  padding: '12px 16px', borderRadius: 9,
                  background: `${C.green}10`, border: `1px solid ${C.green}35`,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.green, marginBottom: 4 }}>
                    🟢 {activeSession.name ?? activeSession.session_name ?? 'Sem nome'}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>
                    Iniciada em: {fmtDateTime(activeSession.started_at ?? activeSession.created_at)}
                  </div>
                  {activeSession.id && (
                    <div style={{ fontSize: 10, color: C.textMuted, fontFamily: 'monospace', marginTop: 2 }}>
                      ID: {activeSession.id}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleEndSession}
                  disabled={sessionLoading}
                  style={{
                    padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: sessionLoading ? 'default' : 'pointer', width: '100%',
                    background: `${C.accent}18`, color: C.accent,
                    border: `1px solid ${C.accent}40`,
                    opacity: sessionLoading ? 0.6 : 1,
                  }}
                >
                  🏁 Encerrar Sessão
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.textMuted }}>Nenhuma sessão ativa no momento.</div>
            )}
          </div>

          {/* Start session */}
          <div style={theme.card}>
            <div style={theme.cardTitle}>Iniciar Nova Sessão</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>Nome da sessão</div>
                <input
                  value={newSessionName}
                  onChange={e => setNewSessionName(e.target.value)}
                  placeholder="Ex: Treino Livre 1 — Interlagos"
                  style={INPUT_STYLE}
                  onKeyDown={e => e.key === 'Enter' && handleStartSession()}
                />
              </div>
              <button
                onClick={handleStartSession}
                disabled={!newSessionName.trim() || sessionLoading}
                style={{
                  padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: newSessionName.trim() && !sessionLoading ? 'pointer' : 'default', width: '100%',
                  background: newSessionName.trim() ? `${C.blue}22` : 'transparent',
                  color: newSessionName.trim() ? C.blue : C.textMuted,
                  border: `1px solid ${newSessionName.trim() ? C.blue + '50' : C.border}`,
                  opacity: sessionLoading ? 0.6 : 1,
                }}
              >
                🚀 Iniciar Sessão
              </button>
              {sessionFeedback && (
                <div style={{
                  fontSize: 12, textAlign: 'center', padding: '6px 0',
                  color: sessionFeedback.includes('sucesso') || sessionFeedback.includes('Sessão iniciada')
                    ? C.green : C.accent,
                }}>
                  {sessionFeedback}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Seção: Emergência ─── */}
      {activeSection === 'emergencia' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
          <div style={{
            background: `${C.accent}12`, border: `2px solid ${C.accent}`,
            borderRadius: 14, padding: 24,
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.accent, marginBottom: 4 }}>
              🚨 ALERTA DE EMERGÊNCIA
            </div>
            <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 20 }}>
              Envia um alerta sonoro de alta prioridade para <strong style={{ color: C.textPrimary }}>TODOS</strong> os celulares da equipe.
              O alarme toca mesmo que o app esteja em segundo plano. Use com responsabilidade.
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                Mensagem de emergência
              </div>
              <textarea
                value={emergencyMsg}
                onChange={e => { setEmergencyMsg(e.target.value); setEmergencySent(false); }}
                placeholder="Ex: RECOLHAM O CARRO IMEDIATAMENTE — Problema no motor"
                rows={3}
                style={{
                  ...INPUT_STYLE,
                  resize: 'vertical', minHeight: 60, fontWeight: 600, fontSize: 14,
                }}
              />
            </div>

            <button
              onClick={() => {
                if (!emergencyMsg.trim()) return;
                sendEmergency(emergencyMsg.trim());
                window.cloudTeamAPI?.triggerEmergency(emergencyMsg.trim());
                setEmergencySent(true);
              }}
              disabled={!emergencyMsg.trim() || emergencySent}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 10,
                fontSize: 16, fontWeight: 900, letterSpacing: 1,
                cursor: emergencyMsg.trim() && !emergencySent ? 'pointer' : 'default',
                background: emergencySent ? `${C.green}20` : emergencyMsg.trim() ? C.accent : `${C.accent}30`,
                color: emergencySent ? C.green : '#fff',
                border: emergencySent ? `2px solid ${C.green}` : `2px solid ${C.accent}`,
                transition: 'all 0.2s',
              }}
            >
              {emergencySent ? '✅ ALERTA ENVIADO!' : '🚨 ENVIAR ALERTA PARA TODOS'}
            </button>

            {emergencySent && (
              <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: C.green }}>
                Alerta enviado para {devices.length} dispositivo{devices.length !== 1 ? 's' : ''} (Wi-Fi) + equipe via FCM às {new Date().toLocaleTimeString('pt-BR')}
              </div>
            )}
          </div>

          <div style={{
            padding: '14px 18px', borderRadius: 10,
            background: `${C.yellow}08`, border: `1px solid ${C.yellow}30`,
          }}>
            <div style={{ fontSize: 12, color: C.yellow, fontWeight: 700, marginBottom: 4 }}>
              ⚠️ Atenção
            </div>
            <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>
              O alerta de emergência faz o celular vibrar intensamente e tocar um alarme alto,
              mesmo se o app estiver em segundo plano. Use apenas em situações reais de emergência.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ── Sub-componentes ─────────────────────────────────────────────────── */

/** Renderiza o payload de uma medição de pressões (FL/FR/RL/RR, fria/quente). */
function PressurePayload({ p, COLORS: C }) {
  const positions = [
    { key: 'FL', label: 'DE — Diant. Esq.' },
    { key: 'FR', label: 'DD — Diant. Dir.' },
    { key: 'RL', label: 'TE — Tras. Esq.'  },
    { key: 'RR', label: 'TD — Tras. Dir.'  },
  ];
  const val = (v) => (v != null && v !== '' ? v : null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {positions.map(({ key, label }) => {
        const cell = (p && p[key]) || {};
        const fria = val(cell.fria), quente = val(cell.quente);
        return (
          <div key={key} style={{ padding: '6px 10px', borderRadius: 7,
            background: `${C.bgCard}80`, border: `1px solid ${C.border}22` }}>
            <div style={{ fontSize: 10, color: C.textMuted }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
              {fria != null && <span style={{ color: C.blue }}>❄ {fria}</span>}
              {fria != null && quente != null && <span style={{ color: C.textMuted }}> · </span>}
              {quente != null && <span style={{ color: C.orange }}>🔥 {quente}</span>}
              {fria == null && quente == null && <span style={{ color: C.textMuted }}>—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Renderiza o payload de uma medição de temperatura/condições de pista. */
function TempPayload({ p, COLORS: C }) {
  const items = [
    { l: 'Temp. Pista', v: p?.tempPista,     u: '°C' },
    { l: 'Temp. Ar',    v: p?.tempAmbiente,  u: '°C' },
    { l: 'Umidade',     v: p?.umidade,       u: '%'  },
    { l: 'Condição',    v: p?.condicaoPista, u: ''   },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {items.map(({ l, v, u }) => (
        <div key={l} style={{ padding: '6px 10px', borderRadius: 7,
          background: `${C.bgCard}80`, border: `1px solid ${C.border}22` }}>
          <div style={{ fontSize: 10, color: C.textMuted }}>{l}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, fontFamily: 'monospace' }}>
            {v != null && v !== '' ? `${v}${u}` : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Uma linha da lista de medições da nuvem (histórico, não sobrescreve). */
function CloudMeasurementRow({ m, COLORS: C, isChefe, onApprove, onDismiss, onDelete }) {
  const isPres = m.category === 'pressures';
  const isTemp = m.category === 'temperatures';
  const statusMap = {
    pending:   { l: 'Pendente',   c: C.orange },
    approved:  { l: 'Aprovada',   c: C.green  },
    dismissed: { l: 'Dispensada', c: C.textMuted },
  };
  const st = statusMap[m.status] || statusMap.pending;
  return (
    <div style={{ padding: '10px 12px', background: `${C.bgCard}60`,
      borderRadius: 9, border: `1px solid ${C.border}22` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>
          {isPres ? '🔧 Pressões' : isTemp ? '🌡️ Temperatura' : `📋 ${m.category}`}
          <span style={{ color: C.textMuted, fontWeight: 400, marginLeft: 8 }}>
            {m.submitter_name || 'Equipe'} · {fmtDateTime(m.created_at)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            color: st.c, background: `${st.c}18`, border: `1px solid ${st.c}33` }}>
            {st.l}
          </span>
          {isChefe && (
            <button onClick={onDelete} title="Deletar medição" style={{
              fontSize: 12, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', color: C.accent, border: `1px solid ${C.accent}40`,
            }}>🗑️</button>
          )}
        </div>
      </div>
      {isPres && <PressurePayload p={m.payload} COLORS={C} />}
      {isTemp && <TempPayload p={m.payload} COLORS={C} />}
      {!isPres && !isTemp && (
        <div style={{ fontSize: 11, color: C.textMuted, wordBreak: 'break-all' }}>
          {JSON.stringify(m.payload)}
        </div>
      )}
      {m.payload?.observacoes && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>
          📝 {m.payload.observacoes}
        </div>
      )}

      {/* Ações de aprovação — só para medições pendentes */}
      {m.status === 'pending' && (onApprove || onDismiss) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {onApprove && (
            <button onClick={onApprove} style={{
              flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 700,
              background: `${C.green}18`, color: C.green, border: `1px solid ${C.green}40`, cursor: 'pointer',
            }}>✅ Aprovar e registrar</button>
          )}
          {onDismiss && (
            <button onClick={onDismiss} style={{
              padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: 'transparent', color: C.textMuted, border: `1px solid ${C.border}`, cursor: 'pointer',
            }}>❌ Dispensar</button>
          )}
        </div>
      )}
    </div>
  );
}

function MeasurementCard({ m, COLORS: C, onApprove, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: `${C.orange}08`, border: `1.5px solid ${C.orange}40`,
      borderRadius: 10, padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {CATEGORY_LABEL[m.category] || m.label}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            👤 {m.deviceName} · {ROLE_LABEL[m.deviceRole] || m.deviceRole} · {fmtTs(m.timestamp)}
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)} style={{
          background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5,
          color: C.textMuted, fontSize: 10, cursor: 'pointer', padding: '2px 8px',
        }}>
          {expanded ? '▲ menos' : '▼ detalhes'}
        </button>
      </div>

      {/* Preview dos dados */}
      {expanded && m.data && (
        <div style={{ marginBottom: 10, padding: '8px 10px', background: `${C.bgCard}80`,
          borderRadius: 7, border: `1px solid ${C.border}22` }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(m.data).map(([k, v]) => v !== '' && v !== null && v !== undefined ? (
              <span key={k} style={{ fontSize: 11 }}>
                <span style={{ color: C.textMuted }}>{k}:</span>{' '}
                <span style={{ color: C.textPrimary, fontWeight: 600 }}>{v}</span>
              </span>
            ) : null)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onApprove} style={{
          flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 700,
          background: `${C.green}18`, color: C.green,
          border: `1px solid ${C.green}40`, cursor: 'pointer',
        }}>
          ✅ Usar Medidas
        </button>
        <button onClick={onDismiss} style={{
          padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600,
          background: 'transparent', color: C.textMuted,
          border: `1px solid ${C.border}`, cursor: 'pointer',
        }}>
          ❌ Ignorar
        </button>
      </div>
    </div>
  );
}

function TimerCard({ t, COLORS: C, onApprove, onDismiss }) {
  return (
    <div style={{
      background: `${C.blue}08`, border: `1.5px solid ${C.blue}40`,
      borderRadius: 10, padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {CATEGORY_LABEL[t.category] || t.category} — {t.title}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            👤 {t.deviceName} · {fmtTs(t.timestamp)}
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: C.blue }}>
          {formatTime(t.totalTime)}
        </div>
      </div>

      {t.splits?.length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {t.splits.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
              fontSize: 11, color: C.textMuted, padding: '2px 0',
              borderBottom: `1px solid ${C.border}11` }}>
              <span>{i + 1}. {s.label || `Split ${i + 1}`}</span>
              <span style={{ fontFamily: 'monospace', color: C.textPrimary }}>{formatTime(s.time)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onApprove} style={{
          flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 700,
          background: `${C.green}18`, color: C.green,
          border: `1px solid ${C.green}40`, cursor: 'pointer',
        }}>
          ✅ Registrar
        </button>
        <button onClick={onDismiss} style={{
          padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600,
          background: 'transparent', color: C.textMuted,
          border: `1px solid ${C.border}`, cursor: 'pointer',
        }}>
          ❌ Ignorar
        </button>
      </div>
    </div>
  );
}
