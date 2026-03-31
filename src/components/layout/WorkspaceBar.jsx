import { useState, useRef, useEffect } from 'react';
import { useColors } from '@/context/ThemeContext';

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
  const gearRef    = useRef(null);
  const createRef  = useRef(null);

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

  // Close create input on outside click
  useEffect(() => {
    if (!creating) return;
    const handler = (e) => {
      if (createRef.current && !createRef.current.contains(e.target)) {
        setCreating(false);
        setCreateVal('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [creating]);

  const openGear = () => {
    setGearOpen((v) => !v);
    setRenaming(false);
    setConfirmDelete(false);
  };

  const handleCreate = () => {
    setCreating(true);
    setCreateVal('');
    setTimeout(() => createRef.current?.querySelector('input')?.focus(), 50);
  };

  const submitCreate = () => {
    if (createVal.trim()) onCreate(createVal.trim());
    setCreating(false);
    setCreateVal('');
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
        padding: '0 24px',
        background: COLORS.bg,
        borderBottom: `1px solid ${COLORS.border}44`,
        minHeight: 34,
      }}
    >
      {/* ── Workspace tabs + New ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
        {workspaces.map((w) => {
          const active = w.id === activeWorkspaceId;
          return (
            <div
              key={w.id}
              onClick={() => onSetActive(w.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 18px',
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                cursor: 'pointer',
                color: active ? COLORS.textPrimary : COLORS.textMuted,
                borderBottom: active
                  ? `2px solid ${COLORS.accent}99`
                  : '2px solid transparent',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                transition: 'color 0.15s',
                letterSpacing: '0.4px',
              }}
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
                    marginRight: 6,
                    flexShrink: 0,
                  }}
                />
              )}
              {w.name}
            </div>
          );
        })}

        {/* + new workspace */}
        {creating ? (
          <div
            ref={createRef}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px' }}
          >
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
              padding: '6px 12px',
              fontSize: 16,
              lineHeight: 1,
              cursor: 'pointer',
              color: COLORS.textMuted,
              borderBottom: '2px solid transparent',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textMuted)}
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
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: 12,
              zIndex: 200,
              minWidth: 190,
              boxShadow: '0 8px 28px rgba(0,0,0,0.7)',
            }}
          >
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
