/**
 * useTireSetCRUD.js
 *
 * Factory for tire set CRUD operations + tire km tracking.
 * Pure function — no React hooks inside.
 */

export function createTireSetCRUD(updateWS, getActiveWorkspace) {
  const saveTireSet = (name, tyres, conditions, targetProfileId, groupId) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome do conjunto de pneus não pode ser vazio.' };
    const id = crypto.randomUUID();
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      if (!profileId) return w;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return {
            ...p,
            tireSets: [
              { id, name: trimmed, savedAt: new Date().toISOString(), tyres, conditions, groupId: groupId || null },
              ...(p.tireSets || []),
            ],
          };
        }),
      };
    });
    return { ok: true };
  };

  const deleteTireSet = (tireSetId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, tireSets: (p.tireSets || []).filter((ts) => ts.id !== tireSetId) };
        }),
      };
    });
  };

  const getTireSetData = (tireSetId) => {
    const activeWorkspace = getActiveWorkspace();
    if (!activeWorkspace) return null;
    for (const p of activeWorkspace.profiles) {
      const ts = (p.tireSets || []).find((ts) => ts.id === tireSetId);
      if (ts) return { tyres: ts.tyres, conditions: ts.conditions };
    }
    return null;
  };

  return { saveTireSet, deleteTireSet, getTireSetData };
}
