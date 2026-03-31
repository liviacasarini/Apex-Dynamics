/**
 * workspaceStorage.js
 *
 * Persistence layer for workspaces: localStorage read/write and migration
 * from the legacy `rt_profiles` format.
 */

import { DEFAULT_VITALS_LIMITS } from '@/constants/vitals';

export const WS_KEY  = 'rt_workspaces';
export const OLD_KEY = 'rt_profiles';

/* ─── Migration / Load ────────────────────────────────────────────────────── */

export function loadOrMigrate() {
  // Tenta ler limites vitais globais legados (rt_vitals_limits) para migrar para o workspace
  let migratedVitals = null;
  try {
    const vRaw = window.localStorage?.getItem('rt_vitals_limits');
    if (vRaw) migratedVitals = { ...DEFAULT_VITALS_LIMITS, ...JSON.parse(vRaw) };
  } catch { /* ignore */ }

  try {
    const raw = window.localStorage?.getItem(WS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.workspaces) && parsed.workspaces.length > 0) {
        // Migration: ensure every workspace has activeTab, vitalsLimits, savedReports, tempLog, tempSets
        parsed.workspaces = parsed.workspaces.map((w) => {
          const base = {
            activeTab: 'overview',
            vitalsLimits: migratedVitals ?? DEFAULT_VITALS_LIMITS,
            savedReports: [],
            tempLog: [],
            tempSets: [],
            ...w,
            vitalsLimits: {
              transOilTemp:     { max: '', min: '' },
              transOilPressure: { max: '', min: '' },
              ...(w.vitalsLimits ?? migratedVitals ?? DEFAULT_VITALS_LIMITS),
            },
          };
          // Migrate profile-level tempLog → workspace-level (one-time lift)
          let result = base;
          if (!w.tempLog) {
            const migratedEntries = [];
            const updatedProfiles = (base.profiles || []).map((p) => {
              if (p.tempLog?.length) {
                const dated = p.tempLog.map((e) => ({
                  ...e,
                  date: e.date || (p.createdAt ? p.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]),
                }));
                migratedEntries.push(...dated);
              }
              const { tempLog: _removed, ...rest } = p;
              return rest;
            });
            result = { ...result, tempLog: migratedEntries, profiles: updatedProfiles };
          }
          // Migrate to unified groups system (one-time)
          result = {
            ...result,
            profiles: (result.profiles || []).map((p) => {
              if (p.groups !== undefined) return p; // already migrated
              const newGroups = [];
              const newTireSets = [];
              // Extract from tireGroups (nested structure from previous migration)
              for (const tg of (p.tireGroups || [])) {
                newGroups.push({ id: tg.id, name: tg.name, createdAt: tg.createdAt });
                for (const ts of (tg.sets || [])) {
                  newTireSets.push({ ...ts, groupId: tg.id });
                }
              }
              // Handle legacy flat tireSets that never had tireGroups
              for (const ts of (p.tireSets || [])) {
                if (!newTireSets.find((t) => t.id === ts.id)) {
                  newTireSets.push(ts);
                }
              }
              const { tireGroups: _tg, ...rest } = p;
              return { ...rest, groups: newGroups, tireSets: newTireSets };
            }),
          };
          return result;
        });
        return parsed;
      }
    }
  } catch { /* fall through to migration */ }

  // Try migrating legacy rt_profiles data into a default workspace
  let profiles = [];
  let activeProfileId = null;
  try {
    const oldRaw = window.localStorage?.getItem(OLD_KEY);
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      if (Array.isArray(old?.profiles)) {
        profiles = old.profiles;
        activeProfileId = old.activeProfileId ?? null;
      }
    }
  } catch { /* ignore */ }

  const defaultId = crypto.randomUUID();
  return {
    activeWorkspaceId: defaultId,
    workspaces: [{
      id: defaultId,
      name: 'Padrão',
      activeProfileId,
      activeTab: 'overview',
      vitalsLimits: migratedVitals ?? DEFAULT_VITALS_LIMITS,
      savedReports: [],
      profiles,
    }],
  };
}

/* ─── Persist ─────────────────────────────────────────────────────────────── */

export function persist(state) {
  try {
    window.localStorage?.setItem(WS_KEY, JSON.stringify(state));
  } catch { /* noop */ }
}
