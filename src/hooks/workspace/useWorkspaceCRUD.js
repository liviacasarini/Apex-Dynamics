/**
 * useWorkspaceCRUD.js
 *
 * Factory for workspace-level CRUD operations (create, rename, delete, set active).
 * Pure function — no React hooks inside.
 */

import { DEFAULT_VITALS_LIMITS } from '@/constants/vitals';

export function createWorkspaceCRUD(update) {
  const createWorkspace = (name) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
    const id = crypto.randomUUID();
    update((prev) => ({
      ...prev,
      activeWorkspaceId: id,
      workspaces: [
        ...prev.workspaces,
        { id, name: trimmed, activeProfileId: null, activeTab: 'overview', vitalsLimits: DEFAULT_VITALS_LIMITS, savedReports: [], tempLog: [], tempSets: [], profiles: [] },
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
