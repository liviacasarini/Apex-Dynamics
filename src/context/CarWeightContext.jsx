/**
 * CarWeightContext — Estado compartilhado de variáveis de setup entre tabs
 *
 * Variáveis sincronizadas:
 *  - pesoCarro    (kg)  → PesoTab.pesoCarro     / CombustivelTab.carWeight
 *  - pesoPiloto   (kg)  → PesoTab.pesoPiloto    / CombustivelTab.driverWeight
 *  - wheelbase    (mm)  → PesoTab.wheelbase     / CombustivelTab.wheelbaseLen
 *
 * Checagem regulamentar:
 *  - pesoMinimo: limite da aba Regulamentações
 *  - violaRegulamento: true se pesoCarro > pesoMinimo
 *
 * Pilotos:
 *  - assignedPilots: lista de pilotos designados ao perfil ativo
 *  - selectedPilotId: piloto selecionado para usar o peso
 *  - Ao selecionar piloto, pesoPiloto é preenchido com weightEquipped
 */
import React, {
  createContext, useContext,
  useState, useEffect, useCallback, useMemo,
} from 'react';

const REG_KEY    = 'rt_regulations';
const PILOTS_KEY = 'rt_pilots';

/** Evento disparado pelo RegulamentacoesTab ao mudar pesoMinimo */
export const REG_PESO_CHANGED_EVENT = 'rt_reg_peso_changed';

const SharedSetupContext = createContext(null);

/** Lê pilotos designados ao perfil diretamente do localStorage */
function readAssignedPilots(profileId) {
  if (!profileId) return [];
  try {
    const all = JSON.parse(localStorage.getItem(PILOTS_KEY) || '[]');
    return all.filter(p => p.assignedProfileId === profileId);
  } catch { return []; }
}

export function CarWeightProvider({ activeProfileId, children }) {
  const profileId = activeProfileId || '';

  /* ── Peso do carro ── */
  const [pesoCarro, setPesoCarroState] = useState('');

  /* ── Peso do piloto ── */
  const [pesoPiloto, setPesoPilotoState] = useState('');

  /* ── Wheelbase ── */
  const [wheelbase, setWheelbaseState] = useState('');

  /* ── Pilotos designados ao perfil ── */
  const [assignedPilots, setAssignedPilots] = useState(() => readAssignedPilots(profileId));
  const [selectedPilotId, setSelectedPilotIdState] = useState('');

  /* ── Limites regulamentares ── */
  const [pesoMinimo,    setPesoMinimoState]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(REG_KEY) || '{}').pesoMinimo    || ''; } catch { return ''; }
  });
  const [combustivelMax, setCombustivelMaxState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(REG_KEY) || '{}').combustivelMax || ''; } catch { return ''; }
  });

  /* ── Reset ao trocar de perfil ── */
  useEffect(() => {
    setPesoCarroState('');
    setPesoPilotoState('');
    setWheelbaseState('');
    setSelectedPilotIdState('');
    setAssignedPilots(readAssignedPilots(activeProfileId));
  }, [activeProfileId]);

  /* ── Recarrega pilotos quando localStorage muda (PilotosTab salva) ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === PILOTS_KEY) {
        setAssignedPilots(readAssignedPilots(activeProfileId));
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [activeProfileId]);

  /* ── Escuta mudanças do RegulamentacoesTab ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.pesoMinimo    !== undefined) setPesoMinimoState(e.detail.pesoMinimo);
      if (e.detail?.combustivelMax !== undefined) setCombustivelMaxState(e.detail.combustivelMax);
    };
    window.addEventListener(REG_PESO_CHANGED_EVENT, handler);
    return () => window.removeEventListener(REG_PESO_CHANGED_EVENT, handler);
  }, []);

  /* ── Ao selecionar piloto, preenche pesoPiloto automaticamente ── */
  const selectPilot = useCallback((pilotId) => {
    setSelectedPilotIdState(pilotId);
    if (!pilotId) return;
    const pilot = readAssignedPilots(activeProfileId).find(p => p.id === pilotId);
    if (pilot?.weightEquipped) {
      setPesoPilotoState(String(pilot.weightEquipped));
    }
  }, [activeProfileId]);

  const setPesoCarro  = useCallback((v) => setPesoCarroState(v),  []);
  const setPesoPiloto = useCallback((v) => setPesoPilotoState(v), []);
  const setWheelbase  = useCallback((v) => setWheelbaseState(v),  []);

  /* ── Checagem regulamentar ── */
  const pesoCarroNum  = parseFloat(pesoCarro);
  const pesoMinimoNum = parseFloat(pesoMinimo);
  const violaRegulamento =
    !isNaN(pesoCarroNum)  && pesoCarroNum  > 0 &&
    !isNaN(pesoMinimoNum) && pesoMinimoNum > 0 &&
    pesoCarroNum > pesoMinimoNum;
  const excesso = violaRegulamento
    ? (pesoCarroNum - pesoMinimoNum).toFixed(1)
    : null;

  const value = useMemo(() => ({
    /* Peso carro */
    pesoCarro, setPesoCarro,
    /* Peso piloto */
    pesoPiloto, setPesoPiloto,
    /* Wheelbase */
    wheelbase, setWheelbase,
    /* Regulamentação */
    pesoMinimo, violaRegulamento, excesso,
    combustivelMax,
    /* Pilotos */
    assignedPilots, selectedPilotId, selectPilot,
  }), [
    pesoCarro, pesoPiloto, wheelbase,
    pesoMinimo, violaRegulamento, excesso, combustivelMax,
    assignedPilots, selectedPilotId, selectPilot,
    setPesoCarro, setPesoPiloto, setWheelbase,
  ]);

  return (
    <SharedSetupContext.Provider value={value}>
      {children}
    </SharedSetupContext.Provider>
  );
}

export function useCarWeight() {
  const ctx = useContext(SharedSetupContext);
  if (!ctx) throw new Error('useCarWeight deve ser usado dentro de CarWeightProvider');
  return ctx;
}
