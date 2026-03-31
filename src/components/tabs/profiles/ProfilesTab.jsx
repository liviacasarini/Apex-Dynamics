/**
 * ProfilesTab.jsx
 *
 * Aba de gerenciamento completo de perfis de sessão.
 * Permite criar, renomear, deletar perfis e visualizar seus
 * setups, conjuntos de pneus e log de temperatura.
 */

import { useState, useRef, useCallback } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { PrintFooter } from '@/components/common';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch { return ''; }
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

const COMPOUND_LABELS = {
  slick: 'Slick', semi_slick: 'Semi-Slick',
  chuva: 'Chuva', radial: 'Radial', other: 'Outro',
};

/* ─── Badge de integridade (hash) ────────────────────────────────────────── */

const INTEGRITY_STYLES = {
  ok:        { bg: '#22c55e22', color: '#22c55e', border: '#22c55e44', label: 'Íntegro',      icon: '🟢' },
  corrupted: { bg: '#ef444422', color: '#ef4444', border: '#ef444444', label: 'Corrompido',    icon: '🔴' },
  'no-hash': { bg: '#9ca3af22', color: '#9ca3af', border: '#9ca3af44', label: 'Sem hash',      icon: '⚪' },
  'not-found':{ bg: '#f59e0b22', color: '#f59e0b', border: '#f59e0b44', label: 'Não encontrado',icon: '🟡' },
  error:     { bg: '#f59e0b22', color: '#f59e0b', border: '#f59e0b44', label: 'Erro',          icon: '🟡' },
  checking:  { bg: '#3b82f622', color: '#3b82f6', border: '#3b82f644', label: 'Verificando...', icon: '🔵' },
};

function IntegrityBadge({ status }) {
  if (!status) return null;
  const s = INTEGRITY_STYLES[status];
  if (!s) return null;
  return (
    <span
      title={`Integridade: ${s.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '1px 7px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {s.icon} {s.label}
    </span>
  );
}

/* ─── Componente principal ────────────────────────────────────────────────── */

export default function ProfilesTab({
  profiles,
  activeProfileId,
  activeProfile,
  createProfile,
  renameProfile,
  deleteProfile,
  setActiveProfile,
  deleteSetup,
  deleteTireSet,
  exportProfiles,
  importProfiles,
  onLoadSetup,
  onLoadTireSet,
  onLoadSession,
  onDeleteSession,
  onLoadLap,
  onDeleteLap,
  verifyCSV,
  // Calculadora de combustível
  onLoadFuelCalc,
  onDeleteFuelCalc,
  // Peso
  onLoadWeightSnapshot,
  onDeleteWeightSnapshot,
  // Mecânica
  onDeleteMechanicSnapshot,
  onLoadMechanicSnapshot,
  // Anotações de pista
  onDeleteTrackAnnotations,
  onLoadTrackAnnotations,
  // Grupos unificados
  onSaveGroup,
  onRenameGroup,
  onDeleteGroup,
}) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);
  const INPUT_S = {
    background: COLORS.bg,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '7px 11px',
    fontSize: 13,
    outline: 'none',
    minWidth: 0,
  };
  const BTN = (accent) => ({
    padding: '7px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: accent ? 700 : 400,
    background: accent ? COLORS.accent : 'transparent',
    color: accent ? '#fff' : COLORS.textSecondary,
    border: accent ? 'none' : `1px solid ${COLORS.border}`,
    cursor: 'pointer',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    transition: 'opacity 0.15s',
  });
  const CHIP = (color) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 700,
    background: `${color}22`,
    color: color,
    border: `1px solid ${color}44`,
    flexShrink: 0,
  });
  const [newName,      setNewName]      = useState('');
  const [newNameErr,   setNewNameErr]   = useState(null);
  const [renamingId,   setRenamingId]   = useState(null);
  const [renameVal,    setRenameVal]    = useState('');
  const [renameErr,    setRenameErr]    = useState(null);
  const [importConfirm, setImportConfirm] = useState(false);
  const [importMsg,    setImportMsg]    = useState(null);
  const importRef = useRef();

  // Grupos expandidos (unified, used across all sections)
  const [expandedGroups, setExpandedGroups] = useState({});
  const toggleGroup = (id) => setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  // Group management
  const [newGroupName,   setNewGroupName]   = useState('');
  const [renamingGrpId,  setRenamingGrpId]  = useState(null);
  const [renameGrpVal,   setRenameGrpVal]   = useState('');
  const [groupErr,       setGroupErr]       = useState(null);

  // Session loading state
  const [loadingSessionId, setLoadingSessionId] = useState(null);
  const [sessionLoadErr,   setSessionLoadErr]   = useState(null);

  const handleLoadSessionClick = useCallback(async (session) => {
    setLoadingSessionId(session.id);
    setSessionLoadErr(null);
    try {
      const result = await onLoadSession?.(session.id);
      if (result?.error) setSessionLoadErr(result.error);
      // Update integrity status after loading
      if (result?.verified === false) {
        setIntegrityMap((prev) => ({ ...prev, [session.csvId]: 'corrupted' }));
      } else if (result?.ok) {
        setIntegrityMap((prev) => ({ ...prev, [session.csvId]: 'ok' }));
      }
    } catch (err) {
      setSessionLoadErr(err.message || 'Erro ao carregar sessão.');
    }
    setLoadingSessionId(null);
  }, [onLoadSession]);

  // Lap loading state
  const [loadingLapId, setLoadingLapId] = useState(null);
  const [lapLoadErr,   setLapLoadErr]   = useState(null);

  const handleLoadLapClick = useCallback(async (lap) => {
    setLoadingLapId(lap.id);
    setLapLoadErr(null);
    try {
      const result = await onLoadLap?.(lap.id);
      if (result?.error) setLapLoadErr(result.error);
      // Update integrity status after loading
      if (result?.verified === false) {
        setIntegrityMap((prev) => ({ ...prev, [lap.lapDataId]: 'corrupted' }));
      } else if (result?.ok) {
        setIntegrityMap((prev) => ({ ...prev, [lap.lapDataId]: 'ok' }));
      }
    } catch (err) {
      setLapLoadErr(err.message || 'Erro ao carregar volta.');
    }
    setLoadingLapId(null);
  }, [onLoadLap]);

  // Hash integrity verification state: { [storageId]: 'checking' | 'ok' | 'corrupted' | 'no-hash' }
  const [integrityMap, setIntegrityMap] = useState({});

  /** Verifica integridade de um registro individual no IndexedDB. */
  const handleVerifyIntegrity = useCallback(async (storageId, metadataHash) => {
    if (!verifyCSV) return;
    setIntegrityMap((prev) => ({ ...prev, [storageId]: 'checking' }));
    try {
      const result = await verifyCSV(storageId);
      if (!result) {
        setIntegrityMap((prev) => ({ ...prev, [storageId]: 'not-found' }));
      } else if (!result.hash && !metadataHash) {
        setIntegrityMap((prev) => ({ ...prev, [storageId]: 'no-hash' }));
      } else if (result.verified) {
        setIntegrityMap((prev) => ({ ...prev, [storageId]: 'ok' }));
      } else {
        setIntegrityMap((prev) => ({ ...prev, [storageId]: 'corrupted' }));
      }
    } catch {
      setIntegrityMap((prev) => ({ ...prev, [storageId]: 'error' }));
    }
  }, [verifyCSV]);

  /** Verifica integridade de todos os itens do perfil ativo. */
  const handleVerifyAll = useCallback(async () => {
    if (!activeProfile || !verifyCSV) return;
    const sessions = activeProfile.sessions || [];
    const laps = activeProfile.savedLaps || [];
    for (const s of sessions) {
      handleVerifyIntegrity(s.csvId, s.hash);
    }
    for (const l of laps) {
      handleVerifyIntegrity(l.lapDataId, l.hash);
    }
  }, [activeProfile, verifyCSV, handleVerifyIntegrity]);

  /* Profile actions */
  function handleCreate() {
    if (!newName.trim()) { setNewNameErr('Digite um nome.'); return; }
    const r = createProfile(newName.trim());
    if (r?.error) setNewNameErr(r.error);
    else { setNewName(''); setNewNameErr(null); }
  }

  function startRename(p) { setRenamingId(p.id); setRenameVal(p.name); setRenameErr(null); }
  function confirmRename() {
    const r = renameProfile(renamingId, renameVal);
    if (r?.error) setRenameErr(r.error);
    else { setRenamingId(null); setRenameErr(null); }
  }
  function cancelRename() { setRenamingId(null); setRenameErr(null); }

  /* Group management */
  function handleCreateGroup() {
    if (!newGroupName.trim()) { setGroupErr('Digite um nome.'); return; }
    const r = onSaveGroup?.(activeProfileId, newGroupName.trim());
    if (r?.error) { setGroupErr(r.error); return; }
    setNewGroupName(''); setGroupErr(null);
  }
  function startRenameGroup(g) { setRenamingGrpId(g.id); setRenameGrpVal(g.name); setGroupErr(null); }
  function confirmRenameGroup() {
    const r = onRenameGroup?.(activeProfileId, renamingGrpId, renameGrpVal);
    if (r?.error) { setGroupErr(r.error); return; }
    setRenamingGrpId(null); setGroupErr(null);
  }

  /**
   * Renders a section (setups, sessions, laps, etc.) grouped by profile.groups.
   * items: flat array with optional .groupId
   * groups: profile.groups = [{ id, name }]
   * renderItem: (item, idx) => JSX
   * emptyMsg: string
   */
  function renderGroupedSection(items, groups, renderItem, emptyMsg) {
    if (!items || items.length === 0) {
      return <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '8px 0' }}>{emptyMsg}</div>;
    }

    // Build lookup groupId → group
    const groupMap = Object.fromEntries((groups || []).map((g) => [g.id, g]));

    // Group items
    const byGroup = {};
    const ungrouped = [];
    for (const item of items) {
      if (item.groupId && groupMap[item.groupId]) {
        (byGroup[item.groupId] = byGroup[item.groupId] || []).push(item);
      } else {
        ungrouped.push(item);
      }
    }

    const hasGroups = (groups || []).length > 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Render each group folder */}
        {(groups || []).map((group) => {
          const groupItems = byGroup[group.id] || [];
          const isOpen = !!expandedGroups[group.id];
          return (
            <div key={group.id}>
              <div
                onClick={() => toggleGroup(group.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px',
                  background: isOpen ? `${COLORS.accent}0c` : COLORS.bg,
                  borderRadius: isOpen ? '8px 8px 0 0' : 8,
                  border: `1px solid ${isOpen ? COLORS.accent + '40' : COLORS.border}`,
                  cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 14 }}>{isOpen ? '📂' : '📁'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>{groupItems.length} item{groupItems.length !== 1 ? 's' : ''}</div>
                </div>
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>{isOpen ? '▲' : '▼'}</span>
              </div>
              {isOpen && (
                <div style={{ border: `1px solid ${COLORS.accent}40`, borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                  {groupItems.length === 0
                    ? <div style={{ padding: '10px 14px', fontSize: 12, color: COLORS.textMuted }}>Nenhum item nesta pasta.</div>
                    : groupItems.map((item, idx) => renderItem(item, idx, true))
                  }
                </div>
              )}
            </div>
          );
        })}

        {/* Ungrouped items */}
        {ungrouped.length > 0 && (
          hasGroups ? (
            <div>
              <div
                onClick={() => toggleGroup('__ungrouped__')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px',
                  background: expandedGroups['__ungrouped__'] ? `${COLORS.accent}0c` : COLORS.bg,
                  borderRadius: expandedGroups['__ungrouped__'] ? '8px 8px 0 0' : 8,
                  border: `1px solid ${expandedGroups['__ungrouped__'] ? COLORS.accent + '40' : COLORS.border}`,
                  cursor: 'pointer', userSelect: 'none',
                }}
              >
                <span style={{ fontSize: 14 }}>{expandedGroups['__ungrouped__'] ? '📂' : '📁'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textMuted }}>Sem pasta</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>{ungrouped.length} item{ungrouped.length !== 1 ? 's' : ''}</div>
                </div>
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>{expandedGroups['__ungrouped__'] ? '▲' : '▼'}</span>
              </div>
              {expandedGroups['__ungrouped__'] && (
                <div style={{ border: `1px solid ${COLORS.accent}40`, borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                  {ungrouped.map((item, idx) => renderItem(item, idx, true))}
                </div>
              )}
            </div>
          ) : (
            // No groups exist — show items flat
            ungrouped.map((item, idx) => renderItem(item, idx, false))
          )
        )}
      </div>
    );
  }

  /* Import */
  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    importProfiles(file)
      .then((r) => setImportMsg({ ok: true, text: `${r.count} perfil(s) importado(s) com sucesso.` }))
      .catch((err) => setImportMsg({ ok: false, text: err.message }));
    setImportConfirm(false);
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ══ Título ══════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>👤 Perfis de Sessão</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
            Organize setups, pneus e temperaturas por evento / treino
          </div>
        </div>
        {/* Export / Import — always accessible */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={exportProfiles} style={BTN(false)}>⬇ Exportar JSON</button>
          {!importConfirm ? (
            <button onClick={() => { setImportConfirm(true); setImportMsg(null); }} style={BTN(false)}>
              ⬆ Importar JSON
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: `${COLORS.accent}10`, border: `1px solid ${COLORS.accent}40`, borderRadius: 8, padding: '5px 10px' }}>
              <span style={{ fontSize: 11, color: COLORS.textSecondary }}>Substituir tudo?</span>
              <button onClick={() => importRef.current?.click()} style={{ ...BTN(true), padding: '4px 10px', fontSize: 11 }}>Sim</button>
              <button onClick={() => setImportConfirm(false)} style={{ ...BTN(false), padding: '4px 10px', fontSize: 11 }}>Não</button>
            </div>
          )}
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>
      </div>

      {importMsg && (
        <div style={{ marginBottom: 16, padding: '8px 14px', borderRadius: 8, fontSize: 12, background: importMsg.ok ? `${COLORS.green}15` : `${COLORS.accent}15`, color: importMsg.ok ? COLORS.green : COLORS.accent, border: `1px solid ${importMsg.ok ? COLORS.green : COLORS.accent}40` }}>
          {importMsg.ok ? '✓ ' : '✗ '}{importMsg.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ══ Coluna Esquerda: Lista de Perfis ════════════════════════════ */}
        <div style={theme.card}>
          <div style={theme.cardTitle}>Perfis</div>

          {/* Criar novo */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setNewNameErr(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Nome do novo perfil..."
                style={{ ...INPUT_S, flex: 1 }}
              />
              <button onClick={handleCreate} style={BTN(true)}>+ Criar</button>
            </div>
            {newNameErr && <div style={{ fontSize: 11, color: COLORS.accent, marginTop: 4 }}>{newNameErr}</div>}
          </div>

          {/* Lista */}
          {profiles.length === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', padding: '16px 0' }}>
              Nenhum perfil ainda. Crie o primeiro acima.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {profiles.map((p) => {
                const isActive   = p.id === activeProfileId;
                const isRenaming = p.id === renamingId;
                return (
                  <div
                    key={p.id}
                    onClick={() => !isRenaming && setActiveProfile(p.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '9px 10px',
                      borderRadius: 8,
                      borderLeft: isActive ? `3px solid ${COLORS.accent}` : '3px solid transparent',
                      background: isActive ? `${COLORS.accent}0e` : `${COLORS.bgCard}`,
                      cursor: isRenaming ? 'default' : 'pointer',
                      border: `1px solid ${isActive ? COLORS.accent + '44' : COLORS.border}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    {isRenaming ? (
                      <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <input
                            autoFocus
                            type="text"
                            value={renameVal}
                            onChange={(e) => { setRenameVal(e.target.value); setRenameErr(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') cancelRename(); }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ ...INPUT_S, width: '100%', fontSize: 12 }}
                          />
                          {renameErr && <div style={{ fontSize: 10, color: COLORS.accent, marginTop: 2 }}>{renameErr}</div>}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); confirmRename(); }} style={{ ...BTN(true), padding: '4px 8px', fontSize: 11 }}>OK</button>
                        <button onClick={(e) => { e.stopPropagation(); cancelRename(); }} style={{ ...BTN(false), padding: '4px 8px', fontSize: 11 }}>✕</button>
                      </>
                    ) : (
                      <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? COLORS.textPrimary : COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 1 }}>
                            {p.setups?.length ?? 0} setup(s) · {p.tireSets?.length ?? 0} pneu(s) · {p.parts?.length ?? 0} peça(s)
                          </div>
                        </div>
                        <button title="Renomear" onClick={(e) => { e.stopPropagation(); startRename(p); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 13, padding: '2px 4px' }}>✏️</button>
                        <button title="Deletar" onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 13, padding: '2px 4px' }}>🗑</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ══ Coluna Direita: Conteúdo do Perfil Ativo ════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {!activeProfile ? (
            <div style={{ ...theme.card, textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👈</div>
              <div style={{ fontSize: 14, color: COLORS.textMuted }}>
                Selecione um perfil à esquerda para ver seus dados.
              </div>
            </div>
          ) : (
            <>
              {/* Nome do perfil ativo */}
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, padding: '0 2px' }}>
                {activeProfile.name}
                <span style={{ fontSize: 11, fontWeight: 400, color: COLORS.textMuted, marginLeft: 10 }}>
                  criado em {fmtDate(activeProfile.createdAt)}
                </span>
              </div>

              {/* ── Pilotos Designados ── */}
              {(() => {
                let allPilots = [];
                try {
                  const raw = window.localStorage?.getItem('rt_pilots');
                  allPilots = raw ? JSON.parse(raw) : [];
                } catch { /* noop */ }
                const assigned = allPilots.filter((p) => p.assignedProfileId === activeProfile.id);
                if (assigned.length === 0) return null;
                return (
                  <div style={theme.card}>
                    <div style={theme.cardTitle}>👤 Pilotos Designados ({assigned.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {assigned.map((p) => (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 8,
                          background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                        }}>
                          <span style={{ fontSize: 18 }}>👤</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                              {p.name || 'Piloto sem nome'}
                            </div>
                            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              {p.age       && <span>{p.age} anos</span>}
                              {p.bloodType && <span>Tipo {p.bloodType}</span>}
                              {p.weight    && <span>{p.weight} kg corporal</span>}
                              {p.weightEquipped && <span>{p.weightEquipped} kg equipado</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Gerenciamento de Pastas ── */}
              <div style={theme.card}>
                <div style={theme.cardTitle}>📁 Pastas / Etapas</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>
                  Crie pastas aqui para organizar itens em todas as abas (Setups, Sessões, Pneus, etc.)
                </div>
                {/* Criar nova pasta */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => { setNewGroupName(e.target.value); setGroupErr(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                    placeholder="Ex: Etapa 1 — Interlagos"
                    style={{ ...INPUT_S, flex: 1 }}
                  />
                  <button onClick={handleCreateGroup} style={BTN(true)}>+ Criar</button>
                </div>
                {groupErr && <div style={{ fontSize: 11, color: COLORS.accent, marginBottom: 6 }}>{groupErr}</div>}
                {(activeProfile.groups || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '4px 0' }}>Nenhuma pasta criada.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(activeProfile.groups || []).map((g) => (
                      <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: COLORS.bg, borderRadius: 7, border: `1px solid ${COLORS.border}` }}>
                        <span style={{ fontSize: 13 }}>📁</span>
                        {renamingGrpId === g.id ? (
                          <>
                            <input autoFocus value={renameGrpVal} onChange={(e) => setRenameGrpVal(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') confirmRenameGroup(); if (e.key === 'Escape') setRenamingGrpId(null); }}
                              style={{ ...INPUT_S, flex: 1, fontSize: 12 }} />
                            <button onClick={confirmRenameGroup} style={{ ...BTN(true), padding: '4px 8px', fontSize: 11 }}>OK</button>
                            <button onClick={() => setRenamingGrpId(null)} style={{ ...BTN(false), padding: '4px 8px', fontSize: 11 }}>✕</button>
                          </>
                        ) : (
                          <>
                            <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                            <button onClick={() => startRenameGroup(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 13, padding: '2px 4px' }}>✏️</button>
                            <button onClick={() => onDeleteGroup?.(activeProfileId, g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 13, padding: '2px 4px' }}>🗑</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Setups ── */}
              <div style={theme.card}>
                <div style={theme.cardTitle}>🔩 Setups ({activeProfile.setups?.length ?? 0})</div>
                {renderGroupedSection(
                  activeProfile.setups || [],
                  activeProfile.groups || [],
                  (s, idx, inFolder) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: inFolder ? '9px 14px' : '9px 12px', background: inFolder ? (idx % 2 === 0 ? COLORS.bg : COLORS.bgCard) : COLORS.bg, borderRadius: inFolder ? 0 : 8, border: inFolder ? 'none' : `1px solid ${COLORS.border}`, borderTop: inFolder && idx > 0 ? `1px solid ${COLORS.border}22` : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                          {fmtDate(s.savedAt)} {fmtTime(s.savedAt)}
                          {s.data?.track && <span style={{ marginLeft: 8, color: COLORS.textSecondary }}>📍 {s.data.track}</span>}
                        </div>
                      </div>
                      <button onClick={() => onLoadSetup(s.id)} style={BTN(false)}>Carregar →</button>
                      <button title="Deletar" onClick={() => deleteSetup(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14, padding: '2px 4px' }}>🗑</button>
                    </div>
                  ),
                  'Nenhum setup salvo. Salve um setup na aba "Setup Sheet".'
                )}
              </div>

              {/* ── Conjuntos de Pneus ── */}
              <div style={theme.card}>
                <div style={theme.cardTitle}>🏎️ Conjuntos de Pneus ({activeProfile.tireSets?.length ?? 0})</div>
                {renderGroupedSection(
                  activeProfile.tireSets || [],
                  activeProfile.groups || [],
                  (ts, idx, inFolder) => {
                    const compound = ts.tyres?.compound;
                    const trackT   = ts.conditions?.trackTemp;
                    const ambT     = ts.conditions?.ambientTemp;
                    return (
                      <div key={ts.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: inFolder ? '9px 14px' : '9px 12px', background: inFolder ? (idx % 2 === 0 ? COLORS.bg : COLORS.bgCard) : COLORS.bg, borderRadius: inFolder ? 0 : 8, border: inFolder ? 'none' : `1px solid ${COLORS.border}`, borderTop: inFolder && idx > 0 ? `1px solid ${COLORS.border}22` : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{ts.name}</div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: COLORS.textMuted }}>{fmtDate(ts.savedAt)} {fmtTime(ts.savedAt)}</span>
                            {compound && compound !== 'other' && <span style={CHIP(COLORS.purple)}>{COMPOUND_LABELS[compound] || compound}</span>}
                            {ts.tyres?.compoundOther && <span style={CHIP(COLORS.purple)}>{ts.tyres.compoundOther}</span>}
                            {trackT && <span style={CHIP(COLORS.orange)}>Pista {trackT}°C</span>}
                            {ambT   && <span style={CHIP(COLORS.cyan)}>Amb. {ambT}°C</span>}
                          </div>
                        </div>
                        <button onClick={() => onLoadTireSet(ts.id)} style={BTN(false)}>Carregar →</button>
                        <button title="Deletar" onClick={() => deleteTireSet(ts.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14, padding: '2px 4px' }}>🗑</button>
                      </div>
                    );
                  },
                  'Nenhum conjunto salvo. Salve na aba "Pneus".'
                )}
              </div>

              {/* ── Calculadora de Combustível ── */}
              <div style={theme.card}>
                <div style={theme.cardTitle}>⛽ Calculadora de Combustível ({(activeProfile.fuelCalcs || []).length})</div>
                {renderGroupedSection(
                  activeProfile.fuelCalcs || [],
                  activeProfile.groups || [],
                  (fc, idx, inFolder) => (
                    <div key={fc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: inFolder ? '9px 14px' : '9px 12px', background: inFolder ? (idx % 2 === 0 ? COLORS.bg : COLORS.bgCard) : COLORS.bg, borderRadius: inFolder ? 0 : 8, border: inFolder ? 'none' : `1px solid ${COLORS.border}`, borderTop: inFolder && idx > 0 ? `1px solid ${COLORS.border}22` : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fc.name}</div>
                        <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{fmtDate(fc.savedAt)} {fmtTime(fc.savedAt)}</div>
                      </div>
                      <button onClick={() => onLoadFuelCalc?.(fc.id)} style={BTN(false)}>Carregar →</button>
                      <button title="Deletar" onClick={() => onDeleteFuelCalc?.(fc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14, padding: '2px 4px' }}>🗑</button>
                    </div>
                  ),
                  'Nenhuma configuração salva. Salve na aba "Overview" na seção de combustível.'
                )}
              </div>

              {/* ── Peso Salvo ── */}
              <div style={theme.card}>
                <div style={theme.cardTitle}>⚖️ Configurações de Peso ({(activeProfile.weightSnapshots || []).length})</div>
                {renderGroupedSection(
                  activeProfile.weightSnapshots || [],
                  activeProfile.groups || [],
                  (s, idx, inFolder) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: inFolder ? '9px 14px' : '9px 12px', background: inFolder ? (idx % 2 === 0 ? COLORS.bg : COLORS.bgCard) : COLORS.bg, borderRadius: inFolder ? 0 : 8, border: inFolder ? 'none' : `1px solid ${COLORS.border}`, borderTop: inFolder && idx > 0 ? `1px solid ${COLORS.border}22` : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                          {fmtDate(s.savedAt)} {fmtTime(s.savedAt)}
                          {s.data?.pesoCarro ? <span style={{ marginLeft: 8, color: COLORS.textSecondary }}>🚗 {s.data.pesoCarro} kg</span> : ''}
                          {s.data?.ballast?.length > 0 ? <span style={{ marginLeft: 8, color: COLORS.textSecondary }}>🔩 {s.data.ballast.length} ballast</span> : ''}
                        </div>
                      </div>
                      <button onClick={() => onLoadWeightSnapshot?.(s.id)} style={BTN(false)}>Carregar →</button>
                      <button title="Deletar" onClick={() => onDeleteWeightSnapshot?.(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14, padding: '2px 4px' }}>🗑</button>
                    </div>
                  ),
                  'Nenhuma configuração salva. Salve na aba "Peso".'
                )}
              </div>

              {/* ── Mecânica Salva ── */}
              <div style={theme.card}>
                <div style={theme.cardTitle}>⚙️ Mecânica Salva ({(activeProfile.mechanicSnapshots || []).length})</div>
                {renderGroupedSection(
                  activeProfile.mechanicSnapshots || [],
                  activeProfile.groups || [],
                  (s, idx, inFolder) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: inFolder ? '9px 14px' : '9px 12px', background: inFolder ? (idx % 2 === 0 ? COLORS.bg : COLORS.bgCard) : COLORS.bg, borderRadius: inFolder ? 0 : 8, border: inFolder ? 'none' : `1px solid ${COLORS.border}`, borderTop: inFolder && idx > 0 ? `1px solid ${COLORS.border}22` : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                          {fmtDate(s.savedAt)} {fmtTime(s.savedAt)}
                          {s.data?.parts?.length ? <span style={{ marginLeft: 8, color: COLORS.textSecondary }}>⚙️ {s.data.parts.length} peça(s)</span> : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if ((activeProfile.parts?.length ?? 0) > 0 && !window.confirm(`Carregar "${s.name}"? As peças atuais serão substituídas.`)) return;
                          onLoadMechanicSnapshot?.(s.id);
                        }}
                        style={BTN(false)}
                      >Carregar →</button>
                      <button title="Deletar" onClick={() => onDeleteMechanicSnapshot?.(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14, padding: '2px 4px' }}>🗑</button>
                    </div>
                  ),
                  'Nenhum snapshot salvo. Salve na aba "Mecânica".'
                )}
              </div>

              {/* ── Anotações de Pista ── */}
              <div style={theme.card}>
                <div style={theme.cardTitle}>🗺️ Anotações de Pista ({(activeProfile.trackAnnotations || []).length})</div>
                {renderGroupedSection(
                  activeProfile.trackAnnotations || [],
                  activeProfile.groups || [],
                  (ann, idx, inFolder) => {
                    const displayName  = ann.annotationName || ann.segmentName;
                    const commentCount = Object.values(ann.segmentComments || {}).filter((c) => c?.trim()).length;
                    const noteLines    = (ann.generalNotes || '').split('\n').filter((l) => l.trim()).length;
                    return (
                      <div key={ann.id} style={{ padding: inFolder ? '9px 14px' : '9px 12px', background: inFolder ? (idx % 2 === 0 ? COLORS.bg : COLORS.bgCard) : COLORS.bg, borderRadius: inFolder ? 0 : 8, border: inFolder ? 'none' : `1px solid ${COLORS.border}`, borderTop: inFolder && idx > 0 ? `1px solid ${COLORS.border}22` : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{displayName}</div>
                            {ann.annotationName && ann.annotationName !== ann.segmentName && (
                              <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>Template: {ann.segmentName}</div>
                            )}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: commentCount > 0 || noteLines > 0 ? 8 : 0 }}>
                              <span style={{ fontSize: 10, color: COLORS.textMuted }}>{fmtDate(ann.savedAt)} {fmtTime(ann.savedAt)}</span>
                              {ann.lapNum != null && <span style={CHIP(COLORS.green)}>V{ann.lapNum}</span>}
                              {ann.fileName && <span style={{ fontSize: 10, color: COLORS.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={ann.fileName}>📄 {ann.fileName}</span>}
                              {commentCount > 0 && <span style={CHIP(COLORS.cyan)}>{commentCount} trecho(s) anotado(s)</span>}
                              {noteLines > 0  && <span style={CHIP(COLORS.purple)}>{noteLines} nota(s) geral(is)</span>}
                            </div>
                            {noteLines > 0 && (
                              <div style={{ marginBottom: commentCount > 0 ? 6 : 0 }}>
                                {(ann.generalNotes || '').split('\n').filter((l) => l.trim()).map((line, li) => (
                                  <div key={li} style={{ display: 'flex', gap: 5, marginBottom: 2, alignItems: 'flex-start' }}>
                                    <span style={{ color: COLORS.accent, fontSize: 12, lineHeight: 1.3, flexShrink: 0 }}>•</span>
                                    <span style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.4 }}>{line.trim()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {commentCount > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {Object.entries(ann.segmentComments || {}).map(([num, comment]) =>
                                  comment?.trim() ? (
                                    <div key={num} style={{ background: `${COLORS.bgCard}`, borderRadius: 6, padding: '5px 8px', borderLeft: `2px solid ${COLORS.blue}44` }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.blue, marginBottom: 2 }}>Trecho {num}</div>
                                      <div style={{ fontSize: 10, color: COLORS.textSecondary, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{comment.trim().length > 80 ? comment.trim().slice(0, 80) + '…' : comment.trim()}</div>
                                    </div>
                                  ) : null
                                )}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                            <button onClick={() => onLoadTrackAnnotations?.(ann)} style={BTN(false)}>Carregar →</button>
                            <button title="Deletar anotação" onClick={() => onDeleteTrackAnnotations?.(ann.segmentId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14, padding: '2px 4px', textAlign: 'center' }}>🗑</button>
                          </div>
                        </div>
                      </div>
                    );
                  },
                  'Nenhuma anotação salva. Carregue um template na aba "Mapa da Pista" e salve as anotações.'
                )}
              </div>

              {/* ── Sessões Salvas ── */}
              <div style={theme.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={theme.cardTitle}>📂 Sessões Salvas ({(activeProfile.sessions || []).length})</div>
                  {(activeProfile.sessions || []).length > 0 && verifyCSV && (
                    <button onClick={handleVerifyAll} style={{ ...BTN(false), fontSize: 10, padding: '4px 10px' }} title="Verificar integridade de todos os itens">
                      🔒 Verificar todos
                    </button>
                  )}
                </div>
                {renderGroupedSection(
                  activeProfile.sessions || [],
                  activeProfile.groups || [],
                  (session, idx, inFolder) => (
                    <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: inFolder ? '9px 14px' : '9px 12px', background: inFolder ? (idx % 2 === 0 ? COLORS.bg : COLORS.bgCard) : COLORS.bg, borderRadius: inFolder ? 0 : 8, border: inFolder ? 'none' : `1px solid ${COLORS.border}`, borderTop: inFolder && idx > 0 ? `1px solid ${COLORS.border}22` : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{session.name}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: COLORS.textMuted }}>{fmtDate(session.savedAt)} {fmtTime(session.savedAt)}</span>
                          <span style={{ fontSize: 10, color: COLORS.textMuted }}>{session.fileName}</span>
                          {session.hash && <span style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: 'monospace' }} title={`SHA-256: ${session.hash}`}>#{session.hash.slice(0, 8)}</span>}
                          <IntegrityBadge status={integrityMap[session.csvId]} />
                        </div>
                      </div>
                      {verifyCSV && !integrityMap[session.csvId] && (
                        <button onClick={() => handleVerifyIntegrity(session.csvId, session.hash)} style={{ ...BTN(false), fontSize: 10, padding: '4px 8px' }} title="Verificar integridade SHA-256">🔒</button>
                      )}
                      <button onClick={() => handleLoadSessionClick(session)} disabled={loadingSessionId === session.id} style={{ ...BTN(false), color: loadingSessionId === session.id ? COLORS.textMuted : COLORS.textSecondary, cursor: loadingSessionId === session.id ? 'wait' : 'pointer' }}>
                        {loadingSessionId === session.id ? 'Carregando...' : 'Carregar →'}
                      </button>
                      <button title="Deletar" onClick={() => onDeleteSession?.(session.id, session.csvId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14, padding: '2px 4px' }}>🗑</button>
                    </div>
                  ),
                  'Nenhuma sessão salva. Salve uma sessão na aba "Overview" quando um CSV estiver carregado.'
                )}
                {sessionLoadErr && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: 12, background: `${COLORS.accent}15`, color: COLORS.accent, border: `1px solid ${COLORS.accent}40` }}>
                    {sessionLoadErr}
                  </div>
                )}
              </div>

              {/* ── Voltas Salvas ── */}
              <div style={theme.card}>
                <div style={theme.cardTitle}>🏁 Voltas Salvas ({(activeProfile.savedLaps || []).length})</div>
                {renderGroupedSection(
                  activeProfile.savedLaps || [],
                  activeProfile.groups || [],
                  (lap, idx, inFolder) => (
                    <div key={lap.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: inFolder ? '9px 14px' : '9px 12px', background: inFolder ? (idx % 2 === 0 ? COLORS.bg : COLORS.bgCard) : COLORS.bg, borderRadius: inFolder ? 0 : 8, border: inFolder ? 'none' : `1px solid ${COLORS.border}`, borderTop: inFolder && idx > 0 ? `1px solid ${COLORS.border}22` : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{lap.name}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: COLORS.textMuted }}>{fmtDate(lap.savedAt)} {fmtTime(lap.savedAt)}</span>
                          <span style={CHIP(COLORS.green)}>V{lap.lapNumber}</span>
                          {lap.analysis?.lapTime != null && (
                            <span style={CHIP(COLORS.cyan)}>
                              {Math.floor(lap.analysis.lapTime / 60)}:{String(Math.floor(lap.analysis.lapTime % 60)).padStart(2, '0')}.{String(Math.round((lap.analysis.lapTime % 1) * 1000)).padStart(3, '0')}
                            </span>
                          )}
                          {lap.analysis?.maxSpeed != null && <span style={CHIP(COLORS.orange)}>Vmax {lap.analysis.maxSpeed.toFixed(0)}</span>}
                          <span style={{ fontSize: 10, color: COLORS.textMuted }}>{lap.fileName}</span>
                          {lap.hash && <span style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: 'monospace' }} title={`SHA-256: ${lap.hash}`}>#{lap.hash.slice(0, 8)}</span>}
                          <IntegrityBadge status={integrityMap[lap.lapDataId]} />
                        </div>
                      </div>
                      {verifyCSV && !integrityMap[lap.lapDataId] && (
                        <button onClick={() => handleVerifyIntegrity(lap.lapDataId, lap.hash)} style={{ ...BTN(false), fontSize: 10, padding: '4px 8px' }} title="Verificar integridade SHA-256">🔒</button>
                      )}
                      <button onClick={() => handleLoadLapClick(lap)} disabled={loadingLapId === lap.id} style={{ ...BTN(false), color: loadingLapId === lap.id ? COLORS.textMuted : COLORS.textSecondary, cursor: loadingLapId === lap.id ? 'wait' : 'pointer' }}>
                        {loadingLapId === lap.id ? 'Carregando...' : 'Carregar →'}
                      </button>
                      <button title="Deletar" onClick={() => onDeleteLap?.(lap.id, lap.lapDataId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14, padding: '2px 4px' }}>🗑</button>
                    </div>
                  ),
                  'Nenhuma volta salva. Salve uma volta na aba "Overview" quando uma sessão estiver carregada.'
                )}
                {lapLoadErr && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, fontSize: 12, background: `${COLORS.accent}15`, color: COLORS.accent, border: `1px solid ${COLORS.accent}40` }}>
                    {lapLoadErr}
                  </div>
                )}
              </div>

              {/* Temperatura agora é salva por workspace — ver aba Temperaturas */}
            </>
          )}
        </div>
      </div>
      <PrintFooter />
    </div>
  );
}
