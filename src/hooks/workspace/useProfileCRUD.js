/**
 * useProfileCRUD.js
 *
 * Factory for profile CRUD operations (scoped to active workspace).
 * Pure function — no React hooks inside.
 */

export function createProfileCRUD(updateWS) {
  const createProfile = (name) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome do perfil não pode ser vazio.' };
    const id = crypto.randomUUID();
    updateWS((w) => ({
      ...w,
      activeProfileId: id,
      profiles: [
        ...w.profiles,
        { id, name: trimmed, createdAt: new Date().toISOString(), setups: [], tireSets: [], groups: [], parts: [], customPartCategories: [], mechanicSnapshots: [] },
      ],
    }));
    return { id };
  };

  const renameProfile = (profileId, newName) => {
    const trimmed = newName?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
    updateWS((w) => ({
      ...w,
      profiles: w.profiles.map((p) =>
        p.id === profileId ? { ...p, name: trimmed } : p
      ),
    }));
    return { ok: true };
  };

  const deleteProfile = (profileId) => {
    updateWS((w) => {
      const remaining = w.profiles.filter((p) => p.id !== profileId);
      const newActive =
        w.activeProfileId === profileId
          ? (remaining[0]?.id ?? null)
          : w.activeProfileId;
      return { ...w, profiles: remaining, activeProfileId: newActive };
    });
  };

  const setActiveProfile = (profileId) => {
    updateWS((w) => ({ ...w, activeProfileId: profileId }));
  };

  return { createProfile, renameProfile, deleteProfile, setActiveProfile };
}
