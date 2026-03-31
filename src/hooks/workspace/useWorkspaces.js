/**
 * useWorkspaces.js — Orquestrador
 *
 * Hook principal que compõe todos os CRUDs de domínio.
 * Mantém um único useState + persistência em localStorage.
 * Cada CRUD de domínio é uma factory function (não React hook).
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { loadOrMigrate, persist } from './workspaceStorage';
import { createWorkspaceCRUD } from './useWorkspaceCRUD';
import { createProfileCRUD } from './useProfileCRUD';
import { createSetupCRUD } from './useSetupCRUD';
import { createTireSetCRUD } from './useTireSetCRUD';
import { createPartsCRUD } from './usePartsCRUD';
import { createSessionCRUD } from './useSessionCRUD';
import { createTempLogCRUD } from './useTempLogCRUD';
import { createTrackDataCRUD } from './useTrackDataCRUD';
import { createMiscCRUD } from './useMiscCRUD';
import { DEFAULT_VITALS_LIMITS } from '@/constants/vitals';

export { DEFAULT_VITALS_LIMITS };

export function useWorkspaces() {
  const [state, setState] = useState(() => loadOrMigrate());

  const { workspaces, activeWorkspaceId } = state;
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  // Ref para acesso síncrono ao activeWorkspace em factories
  const wsRef = useRef(activeWorkspace);
  wsRef.current = activeWorkspace;
  const getActiveWorkspace = useCallback(() => wsRef.current, []);

  /** Update full state atomically and persist. */
  const update = useCallback((fn) => {
    setState((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, []);

  /** Update only the active workspace's sub-fields. */
  const updateWS = useCallback((fn) => {
    update((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((w) =>
        w.id === prev.activeWorkspaceId ? fn(w) : w
      ),
    }));
  }, [update]);

  /* ── Compose domain CRUDs ─────────────────────────────────────────────── */

  const workspaceCRUD = useMemo(() => createWorkspaceCRUD(update), [update]);
  const profileCRUD   = useMemo(() => createProfileCRUD(updateWS), [updateWS]);
  const setupCRUD     = useMemo(() => createSetupCRUD(updateWS, getActiveWorkspace), [updateWS, getActiveWorkspace]);
  const tireSetCRUD   = useMemo(() => createTireSetCRUD(updateWS, getActiveWorkspace), [updateWS, getActiveWorkspace]);
  const partsCRUD     = useMemo(() => createPartsCRUD(updateWS, getActiveWorkspace), [updateWS, getActiveWorkspace]);
  const sessionCRUD   = useMemo(() => createSessionCRUD(updateWS, getActiveWorkspace), [updateWS, getActiveWorkspace]);
  const tempLogCRUD   = useMemo(() => createTempLogCRUD(updateWS), [updateWS]);
  const trackDataCRUD = useMemo(() => createTrackDataCRUD(updateWS), [updateWS]);
  const miscCRUD      = useMemo(() => createMiscCRUD(update, updateWS, getActiveWorkspace), [update, updateWS, getActiveWorkspace]);

  /* ── Derived values ───────────────────────────────────────────────────── */

  const profiles        = activeWorkspace?.profiles        ?? [];
  const activeProfileId = activeWorkspace?.activeProfileId ?? null;
  const activeProfile   = profiles.find((p) => p.id === activeProfileId) ?? null;
  const trackTemplates  = activeWorkspace?.trackTemplates  ?? {};
  const activeTab       = activeWorkspace?.activeTab       ?? 'overview';
  const vitalsLimits    = activeWorkspace?.vitalsLimits    ?? DEFAULT_VITALS_LIMITS;
  const savedReports    = activeWorkspace?.savedReports    ?? [];
  const tempLog         = activeWorkspace?.tempLog         ?? [];
  const tempSets        = activeWorkspace?.tempSets        ?? [];

  /* ── Return ───────────────────────────────────────────────────────────── */

  return {
    // Workspace management
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    ...workspaceCRUD,

    // Profile management (scoped to active workspace)
    profiles,
    activeProfileId,
    activeProfile,
    ...profileCRUD,

    // Setups
    ...setupCRUD,

    // TireSets (flat, with groupId)
    ...tireSetCRUD,

    // Parts (scoped to active profile)
    ...partsCRUD,

    // Sessions & Laps
    ...sessionCRUD,

    // TempLog (workspace-level)
    tempLog,
    tempSets,
    ...tempLogCRUD,

    // Track Data
    trackTemplates,
    ...trackDataCRUD,

    // Misc (tab, vitals, fuel, weight, reports, export/import, brakePad)
    activeTab,
    vitalsLimits,
    savedReports,
    ...miscCRUD,
  };
}
