/**
 * usePartsCRUD.js
 *
 * Factory for parts CRUD operations + mechanic snapshots.
 * Pure function — no React hooks inside.
 */

export function createPartsCRUD(updateWS, getActiveWorkspace) {
  /** Adiciona uma peça ao perfil ativo. */
  const savePart = (name, kmLimit, targetProfileId, usedKm, category, observation) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome da peça não pode ser vazio.' };
    const km = parseFloat(kmLimit);
    if (isNaN(km) || km <= 0) return { error: 'Limite de quilometragem inválido.' };
    const initialUsed = parseFloat(usedKm);
    const initialEntries = (!isNaN(initialUsed) && initialUsed > 0)
      ? [{ id: crypto.randomUUID(), km: initialUsed, note: 'Km iniciais ao cadastrar', date: new Date().toISOString().split('T')[0] }]
      : [];
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      if (!profileId) return w;
      const id = crypto.randomUUID();
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return {
            ...p,
            parts: [
              ...(p.parts || []),
              { id, name: trimmed, kmLimit: km, category: category || 'outro', observation: observation || '', createdAt: new Date().toISOString(), entries: initialEntries },
            ],
          };
        }),
      };
    });
    return { ok: true };
  };

  /** Edita nome, kmLimit, categoria e observação de uma peça. */
  const editPart = (partId, name, kmLimit, targetProfileId, category, observation) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
    const km = parseFloat(kmLimit);
    if (isNaN(km) || km <= 0) return { error: 'Limite inválido.' };
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return {
            ...p,
            parts: (p.parts || []).map((pt) =>
              pt.id === partId
                ? { ...pt, name: trimmed, kmLimit: km, ...(category !== undefined ? { category } : {}), ...(observation !== undefined ? { observation } : {}) }
                : pt
            ),
          };
        }),
      };
    });
    return { ok: true };
  };

  /** Remove uma peça do perfil. */
  const deletePart = (partId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, parts: (p.parts || []).filter((pt) => pt.id !== partId) };
        }),
      };
    });
  };

  /** Adiciona uma entrada de km usada a uma peça. */
  const addPartEntry = (partId, km, note, date, targetProfileId) => {
    const usedKm = parseFloat(km);
    if (isNaN(usedKm) || usedKm <= 0) return { error: 'Quilometragem inválida.' };
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      const entryId = crypto.randomUUID();
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return {
            ...p,
            parts: (p.parts || []).map((pt) => {
              if (pt.id !== partId) return pt;
              return {
                ...pt,
                entries: [
                  ...(pt.entries || []),
                  { id: entryId, km: usedKm, note: note || '', date: date || new Date().toISOString().split('T')[0] },
                ],
              };
            }),
          };
        }),
      };
    });
    return { ok: true };
  };

  /** Remove uma entrada de km de uma peça. */
  const deletePartEntry = (partId, entryId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return {
            ...p,
            parts: (p.parts || []).map((pt) => {
              if (pt.id !== partId) return pt;
              return { ...pt, entries: (pt.entries || []).filter((e) => e.id !== entryId) };
            }),
          };
        }),
      };
    });
  };

  /** Adiciona uma categoria customizada de peças ao perfil. */
  const addCustomPartCategory = (name, targetProfileId) => {
    const trimmed = name?.trim().toLowerCase();
    if (!trimmed) return { error: 'Nome inválido.' };
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          const existing = p.customPartCategories || [];
          if (existing.includes(trimmed)) return p;
          return { ...p, customPartCategories: [...existing, trimmed] };
        }),
      };
    });
    return { ok: true };
  };

  /** Remove uma categoria customizada de peças do perfil. */
  const deleteCustomPartCategory = (name, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, customPartCategories: (p.customPartCategories || []).filter((c) => c !== name) };
        }),
      };
    });
  };

  /** Remove todas as peças e categorias customizadas do perfil. */
  const clearAllParts = (targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, parts: [], customPartCategories: [] };
        }),
      };
    });
  };

  /** Salva um snapshot nomeado do estado atual de peças e categorias no perfil alvo. */
  const saveMechanicSnapshot = (name, parts, customPartCategories, targetProfileId, groupId) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome do snapshot não pode ser vazio.' };
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      if (!profileId) return w;
      const id = crypto.randomUUID();
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return {
            ...p,
            mechanicSnapshots: [
              { id, name: trimmed, savedAt: new Date().toISOString(), data: { parts, customPartCategories }, groupId: groupId || null },
              ...(p.mechanicSnapshots || []),
            ],
          };
        }),
      };
    });
    return { ok: true };
  };

  /** Remove um snapshot de mecânica. */
  const deleteMechanicSnapshot = (snapshotId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, mechanicSnapshots: (p.mechanicSnapshots || []).filter((s) => s.id !== snapshotId) };
        }),
      };
    });
  };

  /** Retorna os dados de um snapshot de mecânica. */
  const getMechanicSnapshotData = (snapshotId) => {
    const activeWorkspace = getActiveWorkspace();
    if (!activeWorkspace) return null;
    for (const p of activeWorkspace.profiles) {
      const s = (p.mechanicSnapshots || []).find((s) => s.id === snapshotId);
      if (s) return s.data;
    }
    return null;
  };

  /** Carrega um snapshot de mecânica no perfil alvo (substitui parts e customPartCategories). */
  const loadMechanicSnapshot = (snapshotId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      // Find snapshot in any profile of the workspace
      let snapData = null;
      for (const p of w.profiles) {
        const s = (p.mechanicSnapshots || []).find((s) => s.id === snapshotId);
        if (s) { snapData = s.data; break; }
      }
      if (!snapData) return w;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return {
            ...p,
            parts: snapData.parts || [],
            customPartCategories: snapData.customPartCategories || [],
          };
        }),
      };
    });
  };

  return {
    savePart,
    editPart,
    deletePart,
    addPartEntry,
    deletePartEntry,
    addCustomPartCategory,
    deleteCustomPartCategory,
    clearAllParts,
    saveMechanicSnapshot,
    deleteMechanicSnapshot,
    getMechanicSnapshotData,
    loadMechanicSnapshot,
  };
}
