/**
 * useProfileCRUD.js
 *
 * Factory for profile CRUD operations (scoped to active workspace).
 * Pure function — no React hooks inside.
 */

import { getMaxProfiles } from '@/license/entitlements';

export function createProfileCRUD(updateWS) {
  const createProfile = (name) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome do perfil não pode ser vazio.' };
    const maxP = getMaxProfiles();
    const id = crypto.randomUUID();
    let blocked = null;

    updateWS((w) => {
      if (maxP !== null && w.profiles.length >= maxP) {
        blocked = `Limite de ${maxP} perfil${maxP !== 1 ? 'is' : ''} atingido.`;
        return w;
      }
      return {
        ...w,
        activeProfileId: id,
        profiles: [
          ...w.profiles,
          { id, name: trimmed, createdAt: new Date().toISOString(), setups: [], tireSets: [], groups: [], parts: [], customPartCategories: [], mechanicSnapshots: [] },
        ],
      };
    });

    if (blocked) return { error: blocked };
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
