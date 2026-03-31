/**
 * useTempLogCRUD.js
 * Factory para operações de log de temperatura e conjuntos de temperatura.
 * Ambos são workspace-level (não per-profile).
 */

export function createTempLogCRUD(updateWS) {

  const addTempLog = (entry) => {
    updateWS((w) => ({
      ...w,
      tempLog: [...(w.tempLog || []), { ...entry, id: crypto.randomUUID() }],
    }));
  };

  const updateTempLog = (entryId, fields) => {
    updateWS((w) => ({
      ...w,
      tempLog: (w.tempLog || []).map((e) =>
        e.id === entryId ? { ...e, ...fields } : e
      ),
    }));
  };

  const deleteTempLog = (entryId) => {
    updateWS((w) => ({
      ...w,
      tempLog: (w.tempLog || []).filter((e) => e.id !== entryId),
    }));
  };

  const clearTempLog = () => {
    updateWS((w) => ({ ...w, tempLog: [] }));
  };

  /* ── Temperature Sets ─────────────────────────────────────────────────── */

  const saveTempSet = (name) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome do conjunto não pode ser vazio.' };
    const id = crypto.randomUUID();
    updateWS((w) => ({
      ...w,
      tempSets: [
        { id, name: trimmed, savedAt: new Date().toISOString(), entries: [...(w.tempLog || [])] },
        ...(w.tempSets || []),
      ],
    }));
    return { id };
  };

  const loadTempSet = (setId) => {
    updateWS((w) => {
      const set = (w.tempSets || []).find((s) => s.id === setId);
      if (!set) return w;
      return { ...w, tempLog: [...set.entries] };
    });
  };

  const renameTempSet = (setId, newName) => {
    const trimmed = newName?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
    updateWS((w) => ({
      ...w,
      tempSets: (w.tempSets || []).map((s) =>
        s.id === setId ? { ...s, name: trimmed } : s
      ),
    }));
    return { ok: true };
  };

  const deleteTempSet = (setId) => {
    updateWS((w) => ({
      ...w,
      tempSets: (w.tempSets || []).filter((s) => s.id !== setId),
    }));
  };

  return {
    addTempLog,
    updateTempLog,
    deleteTempLog,
    clearTempLog,
    saveTempSet,
    loadTempSet,
    renameTempSet,
    deleteTempSet,
  };
}
