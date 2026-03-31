/**
 * useSetupCRUD.js
 *
 * Factory for setup CRUD operations + unified group CRUD.
 * Pure function — no React hooks inside.
 */

export function createSetupCRUD(updateWS, getActiveWorkspace) {
  const saveSetup = (name, setupData, targetProfileId, groupId) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome do setup não pode ser vazio.' };
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
            setups: [
              { id, name: trimmed, savedAt: new Date().toISOString(), data: setupData, groupId: groupId || null },
              ...p.setups,
            ],
          };
        }),
      };
    });
    return { ok: true };
  };

  const deleteSetup = (setupId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, setups: p.setups.filter((s) => s.id !== setupId) };
        }),
      };
    });
  };

  const getSetupData = (setupId) => {
    const activeWorkspace = getActiveWorkspace();
    if (!activeWorkspace) return null;
    for (const p of activeWorkspace.profiles) {
      const s = p.setups.find((s) => s.id === setupId);
      if (s) return s.data;
    }
    return null;
  };

  /* ── Unified Group CRUD (shared across all sections) ───────────────────── */

  const saveGroup = (groupName, targetProfileId) => {
    const trimmed = groupName?.trim();
    if (!trimmed) return { error: 'Nome da pasta não pode ser vazio.' };
    const id = crypto.randomUUID();
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      if (!profileId) return w;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, groups: [...(p.groups || []), { id, name: trimmed, createdAt: new Date().toISOString() }] };
        }),
      };
    });
    return { id };
  };

  const renameGroup = (groupId, newName, targetProfileId) => {
    const trimmed = newName?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      if (!profileId) return w;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, groups: (p.groups || []).map((g) => g.id === groupId ? { ...g, name: trimmed } : g) };
        }),
      };
    });
    return { ok: true };
  };

  const deleteGroup = (groupId, targetProfileId) => {
    // Deleting a group does NOT delete items — they become ungrouped (groupId remains but group no longer exists)
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, groups: (p.groups || []).filter((g) => g.id !== groupId) };
        }),
      };
    });
  };

  return { saveSetup, deleteSetup, getSetupData, saveGroup, renameGroup, deleteGroup };
}
