/**
 * useWorkspaceCRUD.js
 *
 * Factory for workspace-level CRUD operations (create, rename, delete, set active).
 * Pure function — no React hooks inside.
 */

import { DEFAULT_VITALS_LIMITS, DEFAULT_VITALS_LIMITS_TRUCK } from '@/constants/vitals';
import { getMaxWorkspaces, getAllowedVehicleTypes } from '@/license/entitlements';

function getDefaultVitals(vehicleType) {
  if (vehicleType === 'truck') return DEFAULT_VITALS_LIMITS_TRUCK;
  return DEFAULT_VITALS_LIMITS;
}

export function createWorkspaceCRUD(update) {
  const createWorkspace = (name, vehicleType = 'car') => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };

    const allowedTypes = getAllowedVehicleTypes();
    const vt = ['car', 'moto', 'truck'].includes(vehicleType) ? vehicleType : 'car';
    if (allowedTypes && !allowedTypes.includes(vt)) {
      return { error: `Tipo de veículo "${vt}" não permitido para esta conta.` };
    }

    const maxWs = getMaxWorkspaces();
    const id = crypto.randomUUID();
    let blocked = null;

    update((prev) => {
      if (maxWs !== null && prev.workspaces.length >= maxWs) {
        blocked = `Limite de ${maxWs} workspace${maxWs !== 1 ? 's' : ''} atingido.`;
        return prev;
      }
      return {
        ...prev,
        activeWorkspaceId: id,
        workspaces: [
          ...prev.workspaces,
          { id, name: trimmed, vehicleType: vt, activeProfileId: null, activeTab: 'overview', vitalsLimits: getDefaultVitals(vt), savedReports: [], tempLog: [], tempSets: [], profiles: [] },
        ],
      };
    });

    if (blocked) return { error: blocked };
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
