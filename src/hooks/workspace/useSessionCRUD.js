/**
 * useSessionCRUD.js
 * Factory para operações CRUD de sessões e laps salvos.
 * Metadados ficam no localStorage (via updateWS); CSV bruto fica no IndexedDB.
 */

export function createSessionCRUD(updateWS, getActiveWorkspace) {

  const saveSession = (name, fileName, csvId, targetProfileId, hash, sessionKm, groupId) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
    const km = parseFloat(sessionKm);
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      if (!profileId) return w;
      const id = crypto.randomUUID();
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          const updatedTireKm = (!isNaN(km) && km > 0)
            ? {
                fl: (p.tireKm?.fl || 0) + km,
                fr: (p.tireKm?.fr || 0) + km,
                rl: (p.tireKm?.rl || 0) + km,
                rr: (p.tireKm?.rr || 0) + km,
              }
            : p.tireKm;
          return {
            ...p,
            tireKm: updatedTireKm,
            sessions: [
              { id, name: trimmed, fileName, csvId, hash: hash || null, savedAt: new Date().toISOString(), sessionKm: !isNaN(km) && km > 0 ? km : undefined, groupId: groupId || null },
              ...(p.sessions || []),
            ],
          };
        }),
      };
    });
    return { ok: true };
  };

  const saveTireKm = (tireKm, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      if (!profileId) return w;
      return {
        ...w,
        profiles: w.profiles.map((p) =>
          p.id !== profileId ? p : { ...p, tireKm }
        ),
      };
    });
  };

  const deleteSession = (sessionId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, sessions: (p.sessions || []).filter((s) => s.id !== sessionId) };
        }),
      };
    });
  };

  const findSession = (sessionId) => {
    const ws = getActiveWorkspace();
    if (!ws) return null;
    for (const p of ws.profiles) {
      const s = (p.sessions || []).find((s) => s.id === sessionId);
      if (s) return s;
    }
    return null;
  };

  const saveLap = (name, lapNumber, lapDataId, analysis, fileName, targetProfileId, hash, groupId) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
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
            savedLaps: [
              { id, name: trimmed, lapNumber, lapDataId, analysis, fileName, hash: hash || null, savedAt: new Date().toISOString(), groupId: groupId || null },
              ...(p.savedLaps || []),
            ],
          };
        }),
      };
    });
    return { ok: true };
  };

  const deleteLap = (lapId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, savedLaps: (p.savedLaps || []).filter((l) => l.id !== lapId) };
        }),
      };
    });
  };

  const findLap = (lapId) => {
    const ws = getActiveWorkspace();
    if (!ws) return null;
    for (const p of ws.profiles) {
      const l = (p.savedLaps || []).find((l) => l.id === lapId);
      if (l) return l;
    }
    return null;
  };

  return {
    saveSession,
    deleteSession,
    findSession,
    saveLap,
    deleteLap,
    findLap,
    saveTireKm,
  };
}
