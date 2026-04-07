/**
 * useWorkspaceCRUD.js
 *
 * Factory for workspace-level CRUD operations (create, rename, delete, set active).
 * Pure function — no React hooks inside.
 */

import { DEFAULT_VITALS_LIMITS, DEFAULT_VITALS_LIMITS_TRUCK } from '@/constants/vitals';

function getDefaultVitals(vehicleType) {
  if (vehicleType === 'truck') return DEFAULT_VITALS_LIMITS_TRUCK;
  return DEFAULT_VITALS_LIMITS;
}

export function createWorkspaceCRUD(update) {
  const createWorkspace = (name, vehicleType = 'car') => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
    const vt = ['car', 'moto', 'truck'].includes(vehicleType) ? vehicleType : 'car';
    const id = crypto.randomUUID();
    update((prev) => ({
      ...prev,
      activeWorkspaceId: id,
      workspaces: [
        ...prev.workspaces,
        { id, name: trimmed, vehicleType: vt, activeProfileId: null, activeTab: 'overview', vitalsLimits: getDefaultVitals(vt), savedReports: [], tempLog: [], tempSets: [], profiles: [] },
      ],
    }));
    return { id };
  };

  const renameWorkspace = (workspaceId, newName) => {
    const trimmed = newName?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
    update((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, name: trimmed } : w
      ),
    }));
    return { ok: true };
  };

  const deleteWorkspace = (workspaceId) => {
    update((prev) => {
      const remaining = prev.workspaces.filter((w) => w.id !== workspaceId);
      const newActiveId =
        prev.activeWorkspaceId === workspaceId
          ? (remaining[0]?.id ?? null)
          : prev.activeWorkspaceId;
      return { ...prev, workspaces: remaining, activeWorkspaceId: newActiveId };
    });
  };

  const setActiveWorkspace = (workspaceId) => {
    update((prev) => ({ ...prev, activeWorkspaceId: workspaceId }));
  };

  return { createWorkspace, renameWorkspace, deleteWorkspace, setActiveWorkspace };
}
