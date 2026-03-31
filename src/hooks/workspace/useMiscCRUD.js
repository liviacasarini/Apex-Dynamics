/**
 * useMiscCRUD.js
 * Factory para operações diversas: fuel calc, weight snapshots, brake pad,
 * vitals limits, active tab, multi-session reports, export/import.
 */

export function createMiscCRUD(update, updateWS, getActiveWorkspace) {

  /* ── Active Tab ───────────────────────────────────────────────────────── */

  const setActiveTab = (tabId) => {
    updateWS((w) => ({ ...w, activeTab: tabId }));
  };

  /* ── Vitals Limits ────────────────────────────────────────────────────── */

  const setVitalsLimits = (newLimits) => {
    updateWS((w) => ({ ...w, vitalsLimits: newLimits }));
  };

  /* ── Brake Pad ────────────────────────────────────────────────────────── */

  const saveBrakePad = (brakePad, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      if (!profileId) return w;
      return {
        ...w,
        profiles: w.profiles.map((p) =>
          p.id !== profileId ? p : { ...p, brakePad }
        ),
      };
    });
  };

  /* ── Fuel Calculator Configs ──────────────────────────────────────────── */

  const saveFuelCalc = (name, data, targetProfileId, groupId) => {
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
            fuelCalcs: [
              { id, name: trimmed, savedAt: new Date().toISOString(), data, groupId: groupId || null },
              ...(p.fuelCalcs || []),
            ],
          };
        }),
      };
    });
    return { ok: true };
  };

  const deleteFuelCalc = (fuelCalcId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, fuelCalcs: (p.fuelCalcs || []).filter((fc) => fc.id !== fuelCalcId) };
        }),
      };
    });
  };

  const getFuelCalcData = (fuelCalcId) => {
    const ws = getActiveWorkspace();
    if (!ws) return null;
    for (const p of ws.profiles) {
      const fc = (p.fuelCalcs || []).find((fc) => fc.id === fuelCalcId);
      if (fc) return fc.data;
    }
    return null;
  };

  /* ── Weight Snapshots ─────────────────────────────────────────────────── */

  const saveWeightSnapshot = (name, data, targetProfileId, groupId) => {
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
            weightSnapshots: [
              { id, name: trimmed, savedAt: new Date().toISOString(), data, groupId: groupId || null },
              ...(p.weightSnapshots || []),
            ],
          };
        }),
      };
    });
    return { ok: true };
  };

  const deleteWeightSnapshot = (snapshotId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, weightSnapshots: (p.weightSnapshots || []).filter((s) => s.id !== snapshotId) };
        }),
      };
    });
  };

  const getWeightSnapshotData = (snapshotId) => {
    const ws = getActiveWorkspace();
    if (!ws) return null;
    for (const p of ws.profiles) {
      const s = (p.weightSnapshots || []).find((s) => s.id === snapshotId);
      if (s) return s.data;
    }
    return null;
  };

  /* ── Multi-Session Reports ────────────────────────────────────────────── */

  const saveMultiSessionReport = (name, sessions) => {
    const trimmed = name?.trim();
    if (!trimmed) return { error: 'Nome do relatório não pode ser vazio.' };
    const id = crypto.randomUUID();
    const lightSessions = sessions.map((s) => ({
      id:       s.id,
      fileName: s.fileName,
      laps:     s.laps,
    }));
    updateWS((w) => ({
      ...w,
      savedReports: [
        { id, name: trimmed, savedAt: new Date().toISOString(), sessions: lightSessions },
        ...(w.savedReports || []),
      ],
    }));
    return { id };
  };

  const deleteMultiSessionReport = (reportId) => {
    updateWS((w) => ({
      ...w,
      savedReports: (w.savedReports || []).filter((r) => r.id !== reportId),
    }));
  };

  /* ── Export / Import ──────────────────────────────────────────────────── */

  const exportProfiles = () => {
    const ws = getActiveWorkspace();
    const exportData = {
      activeProfileId: ws?.activeProfileId ?? null,
      profiles: ws?.profiles ?? [],
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `profiles_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importProfiles = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!Array.isArray(parsed?.profiles)) {
            reject(new Error('Arquivo inválido: campo "profiles" não encontrado.'));
            return;
          }
          updateWS((w) => ({
            ...w,
            activeProfileId: parsed.activeProfileId ?? null,
            profiles: parsed.profiles,
          }));
          resolve({ count: parsed.profiles.length });
        } catch (err) {
          reject(new Error('Erro ao ler JSON: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
      reader.readAsText(file, 'utf-8');
    });
  };

  return {
    setActiveTab,
    setVitalsLimits,
    saveBrakePad,
    saveFuelCalc,
    deleteFuelCalc,
    getFuelCalcData,
    saveWeightSnapshot,
    deleteWeightSnapshot,
    getWeightSnapshotData,
    saveMultiSessionReport,
    deleteMultiSessionReport,
    exportProfiles,
    importProfiles,
  };
}
