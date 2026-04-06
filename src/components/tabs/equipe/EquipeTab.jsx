/**
 * EquipeTab.jsx
 *
 * Aba de gerenciamento de equipe no desktop.
 * Exibe: servidor (QR code / IP), dispositivos conectados,
 * medições pendentes (aprovar/ignorar), cronômetros e chat da equipe.
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

export default function EquipeTab({ onApplyMeasurement, profilesList = [] }) {
  const COLORS = useColors();
  const theme  = makeTheme(COLORS);
  const {
    serverInfo, devices, messages, measurements, timers,
    unreadChat, pendingCount,
    sendChatMessage, approveMeasurement, dismissMeasurement, approveTimer,
    refreshServerInfo, markChatRead, senderNameRef,
    deviceAssignments, assignDeviceToProfile,
    sendEmergency,
  } = useTeam();

  const [activeSection, setActiveSection] = useState('conexao'); // 'conexao' | 'dispositivos' | 'notificacoes' | 'chat'
  const [chatInput,     setChatInput]     = useState('');
  const [senderName,    setSenderName]    = useState(senderNameRef.current);
  const [sessionInput,  setSessionInput]  = useState('');
  const [emergencyMsg, setEmergencyMsg] = useState('');
  const [emergencySent, setEmergencySent] = useState(false);
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

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const handleApprove = (m) => {
    // Aplica os dados na aba correspondente IMEDIATAMENTE
    try { onApplyMeasurement?.(m); } catch (e) { console.error('Erro ao aplicar medição:', e); }
    // Depois aprova (envia confirmação pro celular)
    approveMeasurement(m.id, m.deviceId).catch(() => {});
  };

  const C = COLORS;

  const NAV = [
    { key: 'conexao',       label: '📡 Conexão'       },
    { key: 'dispositivos',  label: `📱 Dispositivos ${devices.length > 0 ? `(${devices.length})` : ''}` },
    { key: 'notificacoes',  label: `🔔 Medições ${pendingCount > 0 ? `(${pendingCount})` : ''}` },
    { key: 'chat',          label: `💬 Chat ${unreadChat > 0 ? `(${unreadChat})` : ''}` },
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

          {/* Card QR */}
          <div style={{ ...theme.card, flex: '0 0 auto', minWidth: 280, textAlign: 'center' }}>
            <div style={theme.cardTitle}>🔗 Pareamento via QR Code</div>
            {serverInfo?.qrDataUrl ? (
              <>
                <img src={serverInfo.qrDataUrl} alt="QR Code"
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
        <div style={theme.card}>
          <div style={theme.cardTitle}>📱 Dispositivos Conectados</div>
          {devices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: C.textMuted, fontSize: 13 }}>
              Nenhum dispositivo conectado ainda.<br/>
              <span style={{ fontSize: 11 }}>Escaneie o QR Code na aba Conexão.</span>
            </div>
          ) : (
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
          )}
        </div>
      )}

      {/* ─── Seção: Medições / Notificações ─── */}
      {activeSection === 'notificacoes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Medições pendentes */}
          {measurements.filter(m => m.status === 'pending').length > 0 && (
            <div style={theme.card}>
              <div style={{ ...theme.cardTitle, color: C.orange }}>🔔 Medições Aguardando Aprovação</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {measurements.filter(m => m.status === 'pending').map(m => (
                  <MeasurementCard key={m.id} m={m} COLORS={C}
                    onApprove={() => handleApprove(m)}
                    onDismiss={() => dismissMeasurement(m.id, m.deviceId)} />
                ))}
              </div>
            </div>
          )}

          {/* Cronômetros pendentes */}
          {timers.filter(t => t.status === 'pending').length > 0 && (
            <div style={theme.card}>
              <div style={{ ...theme.cardTitle, color: C.orange }}>⏱️ Cronômetros Aguardando Aprovação</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {timers.filter(t => t.status === 'pending').map(t => (
                  <TimerCard key={t.id} t={t} COLORS={C}
                    onApprove={() => approveTimer(t.id, t.deviceId)}
                    onDismiss={() => setTimers(prev => prev.map(x => x.id === t.id ? {...x, status:'dismissed'} : x))} />
                ))}
              </div>
            </div>
          )}

          {/* Histórico */}
          {measurements.filter(m => m.status !== 'pending').length > 0 && (
            <div style={theme.card}>
              <div style={theme.cardTitle}>📋 Histórico de Medições</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {measurements.filter(m => m.status !== 'pending').map(m => (
                  <div key={m.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', background: `${C.bgCard}50`, borderRadius: 8,
                    border: `1px solid ${C.border}22`, opacity: 0.7,
                  }}>
                    <div>
                      <span style={{ fontSize: 12, color: C.textPrimary }}>{m.label}</span>
                      <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>
                        {m.deviceName} · {fmtTs(m.receivedAt)}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: m.status === 'approved' ? `${C.green}18` : `${C.border}22`,
                      color: m.status === 'approved' ? C.green : C.textMuted,
                    }}>
                      {m.status === 'approved' ? '✓ Aplicada' : '— Ignorada'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {measurements.length === 0 && timers.length === 0 && (
            <div style={{ ...theme.card, textAlign: 'center', padding: '40px 0', color: C.textMuted }}>
              Nenhuma medição recebida ainda.
            </div>
          )}
        </div>
      )}

      {/* ─── Seção: Chat ─── */}
      {activeSection === 'chat' && (
        <div style={{ ...theme.card, display: 'flex', flexDirection: 'column', height: 520 }}>
          <div style={theme.cardTitle}>💬 Chat da Equipe</div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
            gap: 8, padding: '4px 0', marginBottom: 12 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: C.textMuted, fontSize: 12, padding: '24px 0' }}>
                O chat da equipe aparecerá aqui.
              </div>
            )}
            {messages.map((msg, i) => {
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
                    background: isMe ? `${C.blue}25` : `${C.bgCard}`,
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

          {/* Input */}
          <form onSubmit={handleSendChat} style={{ display: 'flex', gap: 8 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
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
                Alerta enviado para {devices.length} dispositivo{devices.length !== 1 ? 's' : ''} às {new Date().toLocaleTimeString('pt-BR')}
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
