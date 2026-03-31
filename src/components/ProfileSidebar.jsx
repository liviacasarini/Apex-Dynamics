/**
 * ProfileSidebar.jsx
 *
 * Painel lateral direito para gerenciar perfis de sessão.
 * Permite criar/renomear/deletar perfis, salvar e carregar
 * setups e conjuntos de pneus, e exportar/importar JSON.
 */

import { useState, useRef } from 'react';
import { useColors } from '@/context/ThemeContext';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch { return ''; }
}

/* ─── Sub-componentes ─────────────────────────────────────────────────────── */

/** Formulário de salvar (setup ou tire set) */
function SaveForm({ placeholder, onSave, disabled, COLORS, INPUT_S, BTN_PRIMARY, ERR_TEXT }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  function handleSave() {
    if (!name.trim()) { setError('Digite um nome.'); return; }
    const result = onSave(name.trim());
    if (result?.error) { setError(result.error); }
    else { setName(''); setError(null); }
  }

  return (
    <div style={{ padding: '10px 16px 0' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder={placeholder}
          disabled={disabled}
          style={{ ...INPUT_S, opacity: disabled ? 0.4 : 1 }}
        />
        <button
          onClick={handleSave}
          disabled={disabled}
          style={{ ...BTN_PRIMARY, opacity: disabled ? 0.4 : 1 }}
        >
          Salvar
        </button>
      </div>
      {error && <div style={ERR_TEXT}>{error}</div>}
    </div>
  );
}

/** Linha de item (setup ou tire set) */
function ItemRow({ label, date, onLoad, onDelete, COLORS, BTN_GHOST, BTN_ICON }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '7px 16px',
      borderBottom: `1px solid ${COLORS.border}22`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
        {date && (
          <div style={{ fontSize: 10, color: COLORS.textMuted }}>{date}</div>
        )}
      </div>
      <button onClick={onLoad} style={{ ...BTN_GHOST, fontSize: 11 }}>Carregar</button>
      <button onClick={onDelete} style={{ ...BTN_ICON, color: COLORS.accent }} title="Deletar">
        🗑
      </button>
    </div>
  );
}

/* ─── Componente principal ────────────────────────────────────────────────── */

export default function ProfileSidebar({
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
  onSaveSetup,
  onSaveTireSet,
  onLoadSetup,
  onLoadTireSet,
  onClose,
}) {
  const COLORS = useColors();

  /* ─── Estilos dinâmicos (dependem do tema) ──────────────────────────────── */
  const SIDEBAR = {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 340,
    height: '100vh',
    background: COLORS.bgCard,
    borderLeft: `1px solid ${COLORS.border}`,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-6px 0 32px rgba(0,0,0,0.7)',
    fontFamily: 'inherit',
  };

  const SECTION_HEADER = {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    padding: '14px 16px 8px',
    borderBottom: `1px solid ${COLORS.border}`,
    flexShrink: 0,
  };

  const INPUT_S = {
    flex: 1,
    background: COLORS.bg,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    outline: 'none',
    minWidth: 0,
  };

  const BTN_PRIMARY = {
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    background: COLORS.accent,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  };

  const BTN_GHOST = {
    padding: '5px 10px',
    borderRadius: 6,
    fontSize: 11,
    background: 'transparent',
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    cursor: 'pointer',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  };

  const BTN_ICON = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: COLORS.textMuted,
    fontSize: 13,
    padding: '2px 5px',
    borderRadius: 4,
    lineHeight: 1,
    flexShrink: 0,
  };

  const ERR_TEXT = {
    fontSize: 11,
    color: COLORS.accent,
    padding: '0 16px 6px',
  };

  /* Local state */
  const [newName,      setNewName]      = useState('');
  const [newNameErr,   setNewNameErr]   = useState(null);
  const [renamingId,   setRenamingId]   = useState(null);
  const [renameVal,    setRenameVal]    = useState('');
  const [renameErr,    setRenameErr]    = useState(null);
  const [importConfirm, setImportConfirm] = useState(false);
  const [importMsg,    setImportMsg]    = useState(null); // { ok: bool, text: str }
  const importRef = useRef();

  /* Profile: create */
  function handleCreate() {
    if (!newName.trim()) { setNewNameErr('Digite um nome.'); return; }
    const result = createProfile(newName.trim());
    if (result?.error) { setNewNameErr(result.error); }
    else { setNewName(''); setNewNameErr(null); }
  }

  /* Profile: rename */
  function startRename(p) {
    setRenamingId(p.id);
    setRenameVal(p.name);
    setRenameErr(null);
  }
  function confirmRename() {
    const result = renameProfile(renamingId, renameVal);
    if (result?.error) { setRenameErr(result.error); }
    else { setRenamingId(null); setRenameErr(null); }
  }
  function cancelRename() { setRenamingId(null); setRenameErr(null); }

  /* Import */
  function handleImportFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    importProfiles(file)
      .then((res) => setImportMsg({ ok: true, text: `${res.count} perfil(s) importado(s).` }))
      .catch((err) => setImportMsg({ ok: false, text: err.message }));
    setImportConfirm(false);
  }

  const noProfile = !activeProfile;

  return (
    <div style={SIDEBAR}>

      {/* ── Header da sidebar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: `1px solid ${COLORS.border}`,
        background: `${COLORS.accent}0a`,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
          👤 Perfis de Sessão
        </span>
        <button onClick={onClose} style={{ ...BTN_ICON, fontSize: 16, color: COLORS.textSecondary }}>✕</button>
      </div>

      {/* ── Corpo com scroll ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ════ SEÇÃO 1: Perfis ════ */}
        <div style={SECTION_HEADER}>Perfis</div>

        {/* Criar novo perfil */}
        <div style={{ padding: '10px 16px 0' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setNewNameErr(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Nome do novo perfil..."
              style={INPUT_S}
            />
            <button onClick={handleCreate} style={BTN_PRIMARY}>Criar</button>
          </div>
          {newNameErr && <div style={ERR_TEXT}>{newNameErr}</div>}
        </div>

        {/* Lista de perfis */}
        <div style={{ padding: '10px 0 4px' }}>
          {profiles.length === 0 && (
            <div style={{ padding: '8px 16px', fontSize: 12, color: COLORS.textMuted }}>
              Nenhum perfil criado ainda.
            </div>
          )}
          {profiles.map((p) => {
            const isActive  = p.id === activeProfileId;
            const isRenaming = p.id === renamingId;
            return (
              <div
                key={p.id}
                onClick={() => !isRenaming && setActiveProfile(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  cursor: isRenaming ? 'default' : 'pointer',
                  borderLeft: isActive ? `3px solid ${COLORS.accent}` : '3px solid transparent',
                  background: isActive ? `${COLORS.accent}0d` : 'transparent',
                  borderBottom: `1px solid ${COLORS.border}22`,
                  transition: 'background 0.15s',
                }}
              >
                {isRenaming ? (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        type="text"
                        value={renameVal}
                        autoFocus
                        onChange={(e) => { setRenameVal(e.target.value); setRenameErr(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') cancelRename(); }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...INPUT_S, fontSize: 13 }}
                      />
                      {renameErr && <div style={{ ...ERR_TEXT, padding: '2px 0 0' }}>{renameErr}</div>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); confirmRename(); }} style={BTN_PRIMARY}>OK</button>
                    <button onClick={(e) => { e.stopPropagation(); cancelRename(); }} style={BTN_GHOST}>✕</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 400, color: isActive ? COLORS.textPrimary : COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isActive ? '▶ ' : '• '}{p.name}
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                        {p.setups.length} setup(s) · {p.tireSets.length} pneu(s)
                      </div>
                    </div>
                    <button
                      title="Renomear"
                      onClick={(e) => { e.stopPropagation(); startRename(p); }}
                      style={BTN_ICON}
                    >✏️</button>
                    <button
                      title="Deletar perfil"
                      onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }}
                      style={{ ...BTN_ICON, color: COLORS.accent }}
                    >🗑</button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ════ SEÇÃO 2: Setups ════ */}
        <div style={SECTION_HEADER}>🔩 Setups</div>

        {noProfile ? (
          <div style={{ padding: '10px 16px', fontSize: 12, color: COLORS.textMuted }}>
            Selecione ou crie um perfil acima.
          </div>
        ) : (
          <>
            <SaveForm
              placeholder="Nome do setup..."
              onSave={onSaveSetup}
              disabled={false}
              COLORS={COLORS}
              INPUT_S={INPUT_S}
              BTN_PRIMARY={BTN_PRIMARY}
              ERR_TEXT={ERR_TEXT}
            />
            <div style={{ marginTop: 8 }}>
              {activeProfile.setups.length === 0 ? (
                <div style={{ padding: '6px 16px 10px', fontSize: 12, color: COLORS.textMuted }}>
                  Nenhum setup salvo neste perfil.
                </div>
              ) : (
                activeProfile.setups.map((s) => (
                  <ItemRow
                    key={s.id}
                    label={s.name}
                    date={fmtDate(s.savedAt)}
                    onLoad={() => onLoadSetup(s.id)}
                    onDelete={() => deleteSetup(s.id)}
                    COLORS={COLORS}
                    BTN_GHOST={BTN_GHOST}
                    BTN_ICON={BTN_ICON}
                  />
                ))
              )}
            </div>
          </>
        )}

        {/* ════ SEÇÃO 3: Conjuntos de Pneus ════ */}
        <div style={SECTION_HEADER}>🏎️ Conjuntos de Pneus</div>

        {noProfile ? (
          <div style={{ padding: '10px 16px', fontSize: 12, color: COLORS.textMuted }}>
            Selecione ou crie um perfil acima.
          </div>
        ) : (
          <>
            <SaveForm
              placeholder="Nome do conjunto de pneus..."
              onSave={onSaveTireSet}
              disabled={false}
              COLORS={COLORS}
              INPUT_S={INPUT_S}
              BTN_PRIMARY={BTN_PRIMARY}
              ERR_TEXT={ERR_TEXT}
            />
            <div style={{ marginTop: 8 }}>
              {activeProfile.tireSets.length === 0 ? (
                <div style={{ padding: '6px 16px 10px', fontSize: 12, color: COLORS.textMuted }}>
                  Nenhum conjunto de pneus salvo neste perfil.
                </div>
              ) : (
                activeProfile.tireSets.map((ts) => (
                  <ItemRow
                    key={ts.id}
                    label={ts.name}
                    date={fmtDate(ts.savedAt)}
                    onLoad={() => onLoadTireSet(ts.id)}
                    onDelete={() => deleteTireSet(ts.id)}
                    COLORS={COLORS}
                    BTN_GHOST={BTN_GHOST}
                    BTN_ICON={BTN_ICON}
                  />
                ))
              )}
            </div>
          </>
        )}

        {/* ════ SEÇÃO 4: Export / Import ════ */}
        <div style={SECTION_HEADER}>Exportar / Importar</div>

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={exportProfiles} style={{ ...BTN_GHOST, width: '100%', textAlign: 'center', padding: '8px' }}>
            ⬇ Exportar JSON
          </button>

          {!importConfirm ? (
            <button
              onClick={() => { setImportConfirm(true); setImportMsg(null); }}
              style={{ ...BTN_GHOST, width: '100%', textAlign: 'center', padding: '8px' }}
            >
              ⬆ Importar JSON
            </button>
          ) : (
            <div style={{
              background: `${COLORS.accent}10`,
              border: `1px solid ${COLORS.accent}40`,
              borderRadius: 8,
              padding: '10px 12px',
            }}>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>
                ⚠️ Isso substituirá <b>todos</b> os perfis atuais. Confirmar?
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => importRef.current?.click()}
                  style={{ ...BTN_PRIMARY, flex: 1, textAlign: 'center' }}
                >
                  Sim, importar
                </button>
                <button
                  onClick={() => setImportConfirm(false)}
                  style={{ ...BTN_GHOST, flex: 1, textAlign: 'center' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <input
            ref={importRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImportFileChange}
          />

          {importMsg && (
            <div style={{
              fontSize: 12,
              color: importMsg.ok ? COLORS.green : COLORS.accent,
              padding: '4px 0',
            }}>
              {importMsg.ok ? '✓ ' : '✗ '}{importMsg.text}
            </div>
          )}
        </div>

        {/* Espaço extra no final para scroll confortável */}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
