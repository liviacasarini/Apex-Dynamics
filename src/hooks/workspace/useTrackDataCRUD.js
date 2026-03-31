/**
 * useTrackDataCRUD.js
 * Factory para operações de setorização de pista, templates e anotações.
 */

export function createTrackDataCRUD(updateWS) {

  const saveTrackSegments = (name, boundaries, segmentNames, targetProfileId) => {
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
            trackSegments: [
              {
                id,
                name: trimmed,
                savedAt: new Date().toISOString(),
                boundaries: boundaries.map((b) => ({ lat: b.data.lat, lng: b.data.lng })),
                segmentNames: segmentNames || {},
              },
              ...(p.trackSegments || []),
            ],
          };
        }),
      };
    });
    return { ok: true };
  };

  const deleteTrackSegments = (segId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, trackSegments: (p.trackSegments || []).filter((s) => s.id !== segId) };
        }),
      };
    });
  };

  /* ── Track Templates (scoped to track, not profile) ───────────────────── */

  const saveTrackTemplate = (trackId, name, boundaries, segmentNames) => {
    const trimmed = name?.trim();
    const tid = trackId || 'unknown';
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
    const id = crypto.randomUUID();
    updateWS((w) => ({
      ...w,
      trackTemplates: {
        ...(w.trackTemplates || {}),
        [tid]: [
          {
            id,
            name: trimmed,
            savedAt: new Date().toISOString(),
            boundaries: boundaries.map((b) => ({ lat: b.data.lat, lng: b.data.lng })),
            segmentNames: segmentNames || {},
          },
          ...(w.trackTemplates?.[tid] || []),
        ],
      },
    }));
    return { ok: true, id };
  };

  const deleteTrackTemplate = (trackId, templateId) => {
    const tid = trackId || 'unknown';
    updateWS((w) => ({
      ...w,
      trackTemplates: {
        ...(w.trackTemplates || {}),
        [tid]: (w.trackTemplates?.[tid] || []).filter((t) => t.id !== templateId),
      },
    }));
  };

  /* ── Track Annotations (linked to segment template) ───────────────────── */

  const saveTrackAnnotations = (segmentId, segmentName, annotationName, segmentComments, generalNotes, targetProfileId, lapNum, fileName, csvId, groupId) => {
    if (!segmentId) return { error: 'Nenhum template carregado.' };
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      if (!profileId) return w;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          const existing = p.trackAnnotations || [];
          const hasEntry = existing.some((a) => a.segmentId === segmentId);

          let finalName = (annotationName || segmentName || '').trim() || segmentName;
          if (!hasEntry) {
            const namesInUse = existing.map((a) => a.annotationName || a.segmentName);
            if (namesInUse.includes(finalName)) {
              let counter = 1;
              while (namesInUse.includes(`${finalName} (${counter})`)) counter++;
              finalName = `${finalName} (${counter})`;
            }
          }

          const updated = hasEntry
            ? existing.map((a) =>
                a.segmentId === segmentId
                  ? { ...a, annotationName: finalName, segmentComments: segmentComments || {}, generalNotes: generalNotes || '', savedAt: new Date().toISOString(), lapNum: lapNum ?? a.lapNum, fileName: fileName ?? a.fileName, csvId: csvId ?? a.csvId, groupId: groupId ?? a.groupId }
                  : a
              )
            : [
                ...existing,
                {
                  id: crypto.randomUUID(),
                  segmentId,
                  segmentName,
                  annotationName: finalName,
                  savedAt: new Date().toISOString(),
                  segmentComments: segmentComments || {},
                  generalNotes: generalNotes || '',
                  lapNum: lapNum ?? null,
                  fileName: fileName ?? null,
                  csvId: csvId ?? null,
                  groupId: groupId ?? null,
                },
              ];
          return { ...p, trackAnnotations: updated };
        }),
      };
    });
    return { ok: true };
  };

  const renameTrackAnnotation = (annotationId, newName, targetProfileId) => {
    const trimmed = newName?.trim();
    if (!trimmed) return { error: 'Nome não pode ser vazio.' };
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return {
            ...p,
            trackAnnotations: (p.trackAnnotations || []).map((a) =>
              a.id === annotationId ? { ...a, annotationName: trimmed } : a
            ),
          };
        }),
      };
    });
    return { ok: true };
  };

  const deleteTrackAnnotations = (segmentId, targetProfileId) => {
    updateWS((w) => {
      const profileId = targetProfileId || w.activeProfileId;
      return {
        ...w,
        profiles: w.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return { ...p, trackAnnotations: (p.trackAnnotations || []).filter((a) => a.segmentId !== segmentId) };
        }),
      };
    });
  };

  return {
    saveTrackSegments,
    deleteTrackSegments,
    saveTrackTemplate,
    deleteTrackTemplate,
    saveTrackAnnotations,
    deleteTrackAnnotations,
    renameTrackAnnotation,
  };
}
