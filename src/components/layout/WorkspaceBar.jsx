import { useState, useRef, useEffect } from 'react';
import { useColors } from '@/context/ThemeContext';
import { VEHICLE_TYPES } from '@/constants/tabs';

const smallBtn = (color) => ({
  flex: 1,
  padding: '5px 10px',
  background: `${color}18`,
  border: `1px solid ${color}44`,
  color,
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
});

export default function WorkspaceBar({
  workspaces,
  activeWorkspaceId,
  onSetActive,
  onCreate,
  onRename,
  onDelete,
  loadedWorkspaceIds,
}) {
  const COLORS = useColors();
  const menuItem = {
    display: 'block',
    width: '100%',
    padding: '7px 10px',
    background: 'transparent',
    border: 'none',
    color: COLORS.textSecondary,
    fontSize: 12,
    cursor: 'pointer',
    textAlign: 'left',
    borderRadius: 4,
    transition: 'background 0.15s',
  };
  const [gearOpen,       setGearOpen]       = useState(false);
  const [renaming,       setRenaming]       = useState(false);
  const [renameVal,      setRenameVal]      = useState('');
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [creating,       setCreating]       = useState(false);
  const [createVal,      setCreateVal]      = useState('');
  const [createVehicle,  setCreateVehicle]  = useState('car');
  const gearRef    = useRef(null);
  const createRef  = useRef(null);

  // ApexID (apex_hash) do usuário logado — exibido no menu de configuração.
  const [apexId, setApexId] = useState('');
  const [apexCopied, setApexCopied] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const s = (await window.electronAPI?.sessionGet?.()) || null;
        let hash = s?.apexHash;
        if (!hash) { try { hash = JSON.parse(localStorage.getItem('rt_session') || 'null')?.apexHash; } catch { /* noop */ } }
        if (hash) setApexId(hash);
      } catch { /* noop */ }
    })();
  }, []);

  const copyApexId = () => {
    try {
      navigator.clipboard?.writeText(apexId);
      setApexCopied(true);
      setTimeout(() => setApexCopied(false), 1500);
    } catch { /* noop */ }
  };

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Close popup on outside click
  useEffect(() => {
    if (!gearOpen) return;
    const handler = (e) => {
      if (gearRef.current && !gearRef.current.contains(e.target)) {
        setGearOpen(false);
        setRenaming(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [gearOpen]);

  // Close create input on outside click (use click, not mousedown,
  // to avoid stealing focus/keystrokes from the input)
  useEffect(() => {
    if (!creating) return;
    const handler = (e) => {
      if (createRef.current && !createRef.current.contains(e.target)) {
        setCreating(false);
        setCreateVal('');
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [creating]);

  const openGear = () => {
    setGearOpen((v) => !v);
    setRenaming(false);
    setConfirmDelete(false);
  };

  const handleCreate = () => {
    setCreating(true);
    setCreateVal('');
    setCreateVehicle('car');
    setTimeout(() => createRef.current?.querySelector('input')?.focus(), 50);
  };

  const submitCreate = () => {
    if (createVal.trim()) onCreate(createVal.trim(), createVehicle);
    setCreating(false);
    setCreateVal('');
    setCreateVehicle('car');
  };

  const startRename = () => {
    setRenameVal(activeWorkspace?.name || '');
    setRenaming(true);
    setConfirmDelete(false);
  };

  const submitRename = () => {
    if (renameVal.trim()) onRename(activeWorkspaceId, renameVal.trim());
    setRenaming(false);
    setGearOpen(false);
  };

  const handleDelete = () => {
    if (workspaces.length <= 1) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete(activeWorkspaceId);
    setGearOpen(false);
    setConfirmDelete(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        background: COLORS.bg,
        borderBottom: `1px solid ${COLORS.border}66`,
        minHeight: 38,
      }}
    >
      {/* ── Workspace tabs + New ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflowX: 'auto', padding: '4px 0' }}>
        {workspaces.map((w) => {
          const active = w.id === activeWorkspaceId;
          return (
            <div
              key={w.id}
              onClick={() => onSetActive(w.id)}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                padding: '6px 14px',
                fontSize: 11.5,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                color: active ? COLORS.textPrimary : COLORS.textMuted,
                background: active ? `${COLORS.border}44` : 'transparent',
                borderRadius: 8,
                boxShadow: active ? `inset 0 -2px 0 ${COLORS.accent}` : 'none',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                transition: 'color 0.15s, background 0.15s, box-shadow 0.15s',
                letterSpacing: '0.4px',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = COLORS.textSecondary; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = COLORS.textMuted; }}
            >
              {loadedWorkspaceIds?.has(w.id) && (
                <span
                  title="Dados carregados"
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: COLORS.green,
                    boxShadow: `0 0 6px ${COLORS.green}aa`,
                    marginRight: 6,
                    flexShrink: 0,
                  }}
                />
              )}
              {w.vehicleType === 'truck' ? '🚛 ' : w.vehicleType === 'moto' ? '🏍️ ' : ''}{w.name}
              {workspaces.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Deletar workspace "${w.name}"? Esta ação não pode ser desfeita.`)) {
                      onDelete(w.id);
                    }
                  }}
                  title="Deletar workspace"
                  style={{
                    marginLeft: 8,
                    padding: '0 5px',
                    borderRadius: 3,
                    color: COLORS.textMuted,
                    fontSize: 12,
                    lineHeight: 1,
                    opacity: active ? 0.7 : 0.4,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = COLORS.accent;
                    e.currentTarget.style.background = `${COLORS.accent}22`;
                    e.currentTarget.style.opacity = 1;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = COLORS.textMuted;
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.opacity = active ? 0.7 : 0.4;
                  }}
                >
                  ✕
                </span>
              )}
            </div>
          );
        })}

        {/* + new workspace */}
        {creating ? (
          <div
            ref={createRef}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px' }}
          >
            {VEHICLE_TYPES.map((vt) => {
              const sel = createVehicle === vt.value;
              return (
                <button
                  key={vt.value}
                  type="button"
                  onClick={() => setCreateVehicle(vt.value)}
                  title={vt.label}
                  style={{
                    background: sel ? `${COLORS.accent}22` : 'transparent',
                    border: `1px solid ${sel ? COLORS.accent + '88' : COLORS.border}`,
                    color: sel ? COLORS.accent : COLORS.textMuted,
                    borderRadius: 4,
                    padding: '3px 7px',
                    fontSize: 12,
                    cursor: 'pointer',
                    lineHeight: 1,
                  }}
                >
                  {vt.icon}
                </button>
              );
            })}
            <input
              autoFocus
              value={createVal}
              onChange={(e) => setCreateVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate();
                if (e.key === 'Escape') { setCreating(false); setCreateVal(''); }
              }}
              placeholder="Nome do workspace..."
              style={{
                background: COLORS.bg,
                color: COLORS.textPrimary,
                border: `1px solid ${COLORS.accent}66`,
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 11,
                outline: 'none',
                width: 150,
              }}
            />
            <button
              onClick={submitCreate}
              style={{
                background: `${COLORS.accent}22`, border: `1px solid ${COLORS.accent}55`,
                color: COLORS.accent, borderRadius: 4, padding: '3px 8px',
                fontSize: 11, cursor: 'pointer', fontWeight: 700,
              }}
            >✓</button>
            <button
              onClick={() => { setCreating(false); setCreateVal(''); }}
              style={{
                background: 'transparent', border: `1px solid ${COLORS.border}`,
                color: COLORS.textMuted, borderRadius: 4, padding: '3px 6px',
                fontSize: 11, cursor: 'pointer',
              }}
            >✕</button>
          </div>
        ) : (
          <div
            onClick={handleCreate}
            title="Novo workspace"
            style={{
              width: 26,
              height: 26,
              marginLeft: 4,
              fontSize: 15,
              lineHeight: 1,
              cursor: 'pointer',
              color: COLORS.textMuted,
              border: `1px dashed ${COLORS.border}`,
              borderRadius: 7,
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'color 0.15s, border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = COLORS.accent;
              e.currentTarget.style.borderColor = `${COLORS.accent}88`;
              e.currentTarget.style.background = COLORS.accentSoft || `${COLORS.accent}12`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = COLORS.textMuted;
              e.currentTarget.style.borderColor = COLORS.border;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            +
          </div>
        )}
      </div>

      {/* ── Gear icon + popup ── */}
      <div ref={gearRef} style={{ position: 'relative', flexShrink: 0 }}>
        <div
          onClick={openGear}
          title="Configurar workspace"
          style={{
            cursor: 'pointer',
            padding: '3px 6px',
            borderRadius: 4,
            fontSize: 13,
            userSelect: 'none',
            color: gearOpen ? COLORS.textSecondary : COLORS.textMuted,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
          onMouseLeave={(e) => (e.currentTarget.style.color = gearOpen ? COLORS.textSecondary : COLORS.textMuted)}
        >
          ⚙️
        </div>

        {gearOpen && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 6px)',
              background: COLORS.bgElevated || COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: 12,
              zIndex: 200,
              minWidth: 190,
              boxShadow: COLORS.shadowPopup || '0 8px 28px rgba(0,0,0,0.7)',
            }}
          >
            {/* ApexID do usuário logado */}
            {apexId && (
              <div style={{
                marginBottom: 10, padding: '8px 10px', borderRadius: 8,
                background: `${COLORS.accent}10`, border: `1px solid ${COLORS.accent}33`,
              }}>
                <div style={{
                  fontSize: 9.5, color: COLORS.textMuted, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4,
                }}>
                  Seu ApexID
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    flex: 1, fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12, fontWeight: 700, color: COLORS.accent, letterSpacing: '0.5px',
                  }}>
                    {apexId}
                  </span>
                  <button
                    onClick={copyApexId}
                    title="Copiar ApexID"
                    style={{
                      background: 'transparent', border: `1px solid ${COLORS.border}`,
                      borderRadius: 5, color: apexCopied ? COLORS.green : COLORS.textMuted,
                      fontSize: 10, fontWeight: 600, cursor: 'pointer', padding: '3px 7px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {apexCopied ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            {/* Workspace label */}
            <div
              style={{
                fontSize: 10,
                color: COLORS.textMuted,
                marginBottom: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                padding: '0 6px',
              }}
            >
              {activeWorkspace?.name}
            </div>

            {renaming ? (
              /* ── Rename form ── */
              <div style={{ padding: '0 2px' }}>
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename();
                    if (e.key === 'Escape') { setRenaming(false); setGearOpen(false); }
                  }}
                  style={{
                    width: '100%',
                    background: COLORS.bg,
                    color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.accent}66`,
                    borderRadius: 4,
                    padding: '5px 8px',
                    fontSize: 12,
                    outline: 'none',
                    marginBottom: 8,
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={submitRename} style={smallBtn(COLORS.green)}>✓ OK</button>
                  <button onClick={() => setRenaming(false)} style={smallBtn(COLORS.textMuted)}>✕</button>
                </div>
              </div>
            ) : (
              /* ── Menu items ── */
              <>
                <button onClick={startRename} style={menuItem}>
                  ✏️&nbsp; Renomear
                </button>
                <button
                  onClick={handleDelete}
                  disabled={workspaces.length <= 1}
                  style={{
                    ...menuItem,
                    color: confirmDelete
                      ? COLORS.accent
                      : workspaces.length <= 1
                        ? COLORS.textMuted
                        : COLORS.textSecondary,
                    opacity: workspaces.length <= 1 ? 0.4 : 1,
                    cursor: workspaces.length <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  🗑️&nbsp; {confirmDelete ? 'Confirmar exclusão' : 'Deletar'}
                </button>
                {confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{ ...menuItem, fontSize: 10, color: COLORS.textMuted }}
                  >
                    Cancelar
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
