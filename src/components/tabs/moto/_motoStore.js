/**
 * _motoStore.js — Persistência local dedicada aos tabs do workspace Moto.
 *
 * Cada tab moto guarda seu estado em localStorage sob a chave
 *   `moto::<workspaceId>::<scope>`
 * mantendo o schema do workspace de carros 100% intocado.
 */

import { useEffect, useState } from 'react';

const KEY = (workspaceId, scope) => `moto::${workspaceId || 'default'}::${scope}`;

export function loadMoto(workspaceId, scope, fallback) {
  try {
    const raw = localStorage.getItem(KEY(workspaceId, scope));
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveMoto(workspaceId, scope, data) {
  try {
    localStorage.setItem(KEY(workspaceId, scope), JSON.stringify(data));
  } catch { /* noop */ }
}

/** Hook utilitário: carrega e persiste um state automaticamente. */
export function useMotoState(workspaceId, scope, fallback) {
  const [state, setState] = useState(() => loadMoto(workspaceId, scope, fallback));
  useEffect(() => {
    setState(loadMoto(workspaceId, scope, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, scope]);
  useEffect(() => {
    saveMoto(workspaceId, scope, state);
  }, [workspaceId, scope, state]);
  return [state, setState];
}
