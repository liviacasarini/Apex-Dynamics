/**
 * CarWeightContext — Estado compartilhado de variáveis de setup entre tabs
 *
 * Tópico 1 — pesoCarro        (kg)  → PesoTab.pesoCarro       / CombustivelTab.carWeight
 * Tópico 2 — pesoHomologado   (kg)  → PesoTab.pesoHomologado  / CombustivelTab.minWeight / RegulamentacoesTab.pesoMinimo
 * Tópico 3 — pesoPiloto       (kg)  → PesoTab.pesoPiloto      / CombustivelTab.driverWeight / PilotosTab.weightEquipped
 * Tópico 4 — wheelbase        (mm)  → PesoTab.wheelbase       / CombustivelTab.wheelbaseLen / RegulamentacoesTab.dimWheelbase
 * Tópico 5 — trackFront       (mm)  → PesoTab.trackFront      / SetupSheetTab.susp_trackFront  [max: RegulamentacoesTab.dimBitolaDiant]
 * Tópico 6 — trackRear        (mm)  → PesoTab.trackRear       / SetupSheetTab.susp_trackRear   [max: RegulamentacoesTab.dimBitolaTrasei]
 * Tópico 7 — cgLong           (mm)  → CombustivelTab.cgCarX   / SetupSheetTab.chassis_cgLong
 * Tópico 8 — cgHeight         (mm)  → PesoTab.alturaCG        / SetupSheetTab.chassis_cgHeight
 * Tópico 9 — rcFront          (mm)  → PesoTab.rollCenterFront / SetupSheetTab.susp_rcFront
 * Tópico 10 — rcRear          (mm)  → PesoTab.rollCenterRear  / SetupSheetTab.susp_rcRear
 * Tópico 11 — tankPos         (mm)  → PesoTab.tanqueLongPos   / CombustivelTab.tankPosX
 *
 * Checagem regulamentar:
 *  violaRegulamento  : (pesoCarro + pesoPiloto) > pesoMinimo
 *  violaWheelbase    : wheelbase  > dimWheelbase
 *  violaTrackFront   : trackFront > dimBitolaDiant
 *  violaTrackRear    : trackRear  > dimBitolaTrasei
 *
 * Pilotos:
 *  assignedPilots   : pilotos designados ao perfil ativo
 *  selectedPilotId  : piloto selecionado — ao selecionar, pesoPiloto é preenchido automaticamente
 */
import React, {
  createContext, useContext,
  useState, useEffect, useCallback, useMemo,
} from 'react';

const REG_KEY    = 'rt_regulations';
const PILOTS_KEY = 'rt_pilots';

/** Evento disparado pelo RegulamentacoesTab ao salvar qualquer campo regulamentar */
export const REG_PESO_CHANGED_EVENT = 'rt_reg_peso_changed';

/** Evento disparado pelo PilotosTab quando weightEquipped do piloto designado muda */
export const PESO_PILOTO_SYNC = 'rt_peso_piloto_sync';

/** Evento disparado pelo SetupSheetTab ao alterar campos de motor/transmissão/freio */
export const SETUP_REG_CHANGED_EVENT = 'rt_setup_reg_changed';

const SharedSetupContext = createContext(null);

function readAssignedPilots(profileId) {
  if (!profileId) return [];
  try {
    const all = JSON.parse(localStorage.getItem(PILOTS_KEY) || '[]');
    return all.filter(p => p.assignedProfileId === profileId);
  } catch { return []; }
}

function readReg(key) {
  try { return JSON.parse(localStorage.getItem(REG_KEY) || '{}')[key] || ''; }
  catch { return ''; }
}

function persistReg(updates) {
  try {
    const current = JSON.parse(localStorage.getItem(REG_KEY) || '{}');
    localStorage.setItem(REG_KEY, JSON.stringify({ ...current, ...updates }));
  } catch { /* noop */ }
}

export function CarWeightProvider({ activeProfileId, children }) {
  const profileId = activeProfileId || '';

  /* ── Tópico 1: Peso do carro (seco) ── */
  const [pesoCarro,   setPesoCarroState]   = useState('');

  /* ── Tópico 3: Peso do piloto com equipamentos ── */
  const [pesoPiloto,  setPesoPilotoState]  = useState('');

  /* ── Tópico 4: Wheelbase ── */
  const [wheelbase,   setWheelbaseState]   = useState('');

  /* ── Tópico 5: Track width dianteiro ── */
  const [trackFront,  setTrackFrontState]  = useState('');

  /* ── Tópico 6: Track width traseiro ── */
  const [trackRear,   setTrackRearState]   = useState('');

  /* ── Tópico 7: CG longitudinal ── */
  const [cgLong,   setCgLongState]   = useState('');

  /* ── Tópico 8: Altura do CG ── */
  const [cgHeight, setCgHeightState] = useState('');

  /* ── Tópico 9: Roll center dianteiro ── */
  const [rcFront,  setRcFrontState]  = useState('');

  /* ── Tópico 10: Roll center traseiro ── */
  const [rcRear,   setRcRearState]   = useState('');

  /* ── Tópico 11: Posição longitudinal do tanque ── */
  const [tankPos,  setTankPosState]  = useState('');

  /* ── Pilotos designados ao perfil ── */
  const [assignedPilots,  setAssignedPilots]  = useState(() => readAssignedPilots(profileId));
  const [selectedPilotId, setSelectedPilotId] = useState('');

  /* ── Limites regulamentares ── */
  const [pesoMinimo,      setPesoMinimoState]      = useState(() => readReg('pesoMinimo'));
  const [combustivelMax,  setCombustivelMaxState]   = useState(() => readReg('combustivelMax'));
  const [dimWheelbase,    setDimWheelbaseState]     = useState(() => readReg('dimWheelbase'));
  const [dimBitolaDiant,  setDimBitolaDiantState]   = useState(() => readReg('dimBitolaDiant'));
  const [dimBitolaTrasei, setDimBitolaTraseiState]  = useState(() => readReg('dimBitolaTrasei'));

  /* ── Reset ao trocar de perfil ── */
  useEffect(() => {
    setPesoCarroState('');
    setPesoPilotoState('');
    setWheelbaseState('');
    setTrackFrontState('');
    setTrackRearState('');
    setCgLongState('');
    setCgHeightState('');
    setRcFrontState('');
    setRcRearState('');
    setTankPosState('');
    setSelectedPilotId('');
    setAssignedPilots(readAssignedPilots(activeProfileId));
  }, [activeProfileId]);

  /* ── Recarrega pilotos quando PilotosTab salva (evento storage) ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== PILOTS_KEY) return;
      const fresh = readAssignedPilots(activeProfileId);
      setAssignedPilots(fresh);
      setSelectedPilotId(prev => {
        if (prev) {
          const p = fresh.find(pi => pi.id === prev);
          if (p?.weightEquipped) setPesoPilotoState(String(p.weightEquipped));
        }
        return prev;
      });
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [activeProfileId]);

  /* ── Escuta evento do RegulamentacoesTab ── */
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail) return;
      if (e.detail.pesoMinimo     !== undefined) setPesoMinimoState(e.detail.pesoMinimo);
      if (e.detail.combustivelMax !== undefined) setCombustivelMaxState(e.detail.combustivelMax);
      if (e.detail.dimWheelbase   !== undefined) setDimWheelbaseState(e.detail.dimWheelbase);
      if (e.detail.dimBitolaDiant !== undefined) setDimBitolaDiantState(e.detail.dimBitolaDiant);
      if (e.detail.dimBitolaTrasei!== undefined) setDimBitolaTraseiState(e.detail.dimBitolaTrasei);
    };
    window.addEventListener(REG_PESO_CHANGED_EVENT, handler);
    return () => window.removeEventListener(REG_PESO_CHANGED_EVENT, handler);
  }, []);

  /* ── Escuta evento do PilotosTab (weightEquipped do piloto designado) ── */
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail) return;
      if (e.detail.profileId && activeProfileId && e.detail.profileId !== activeProfileId) return;
      if (e.detail.value !== undefined) setPesoPilotoState(String(e.detail.value));
    };
    window.addEventListener(PESO_PILOTO_SYNC, handler);
    return () => window.removeEventListener(PESO_PILOTO_SYNC, handler);
  }, [activeProfileId]);

  /* ── Ao selecionar piloto, preenche pesoPiloto automaticamente ── */
  const selectPilot = useCallback((pilotId) => {
    setSelectedPilotId(pilotId);
    if (!pilotId) return;
    const pilot = readAssignedPilots(activeProfileId).find(p => p.id === pilotId);
    if (pilot?.weightEquipped) setPesoPilotoState(String(pilot.weightEquipped));
  }, [activeProfileId]);

  /* ── Setters públicos ── */
  const setPesoCarro  = useCallback((v) => setPesoCarroState(v),  []);
  const setPesoPiloto = useCallback((v) => setPesoPilotoState(v), []);
  const setWheelbase  = useCallback((v) => setWheelbaseState(v),  []);
  const setTrackFront = useCallback((v) => setTrackFrontState(v), []);
  const setTrackRear  = useCallback((v) => setTrackRearState(v),  []);
  const setCgLong     = useCallback((v) => setCgLongState(v),     []);
  const setCgHeight   = useCallback((v) => setCgHeightState(v),   []);
  const setRcFront    = useCallback((v) => setRcFrontState(v),    []);
  const setRcRear     = useCallback((v) => setRcRearState(v),     []);
  const setTankPos    = useCallback((v) => setTankPosState(v),    []);

  /**
   * setPesoHomologado — Tópico 2
   * Atualiza contexto + rt_regulations + notifica RegulamentacoesTab.
   */
  const setPesoHomologado = useCallback((val) => {
    setPesoMinimoState(val);
    persistReg({ pesoMinimo: val });
    window.dispatchEvent(new CustomEvent(REG_PESO_CHANGED_EVENT, {
      detail: { pesoMinimo: val },
    }));
  }, []);

  /* Setters simples para tópicos 4, 5, 6 — apenas atualizam o contexto.
   * Os limites regulamentares (dimWheelbase, dimBitolaDiant, dimBitolaTrasei)
   * são definidos exclusivamente pela RegulamentacoesTab via REG_PESO_CHANGED_EVENT. */

  /* ── Checagens regulamentares ── */
  const pesoCarroNum   = parseFloat(pesoCarro)      || 0;
  const pesoPilotoNum  = parseFloat(pesoPiloto)     || 0;
  const pesoMinimoNum  = parseFloat(pesoMinimo)     || 0;
  const totalPeso      = pesoCarroNum + pesoPilotoNum;
  const wheelbaseNum   = parseFloat(wheelbase)      || 0;
  const dimWheelbaseNum= parseFloat(dimWheelbase)   || 0;
  const trackFrontNum  = parseFloat(trackFront)     || 0;
  const trackRearNum   = parseFloat(trackRear)      || 0;
  const bitolaDiantNum = parseFloat(dimBitolaDiant) || 0;
  const bitolaTrasNum  = parseFloat(dimBitolaTrasei)|| 0;

  const violaRegulamento  = totalPeso    > 0 && pesoMinimoNum   > 0 && totalPeso    < pesoMinimoNum;
  const violaWheelbase    = wheelbaseNum > 0 && dimWheelbaseNum > 0 && wheelbaseNum > dimWheelbaseNum;
  const violaTrackFront   = trackFrontNum> 0 && bitolaDiantNum  > 0 && trackFrontNum> bitolaDiantNum;
  const violaTrackRear    = trackRearNum > 0 && bitolaTrasNum   > 0 && trackRearNum > bitolaTrasNum;

  const excesso           = violaRegulamento ? (pesoMinimoNum   - totalPeso    ).toFixed(1) : null;
  const excessoWheelbase  = violaWheelbase   ? (wheelbaseNum  - dimWheelbaseNum).toFixed(0) : null;
  const excessoTrackFront = violaTrackFront  ? (trackFrontNum - bitolaDiantNum ).toFixed(0) : null;
  const excessoTrackRear  = violaTrackRear   ? (trackRearNum  - bitolaTrasNum  ).toFixed(0) : null;

  const value = useMemo(() => ({
    /* Tópico 1 */
    pesoCarro,  setPesoCarro,
    /* Tópico 2 */
    pesoMinimo, setPesoHomologado,
    /* Tópico 3 */
    pesoPiloto, setPesoPiloto,
    /* Tópico 4 */
    wheelbase,  setWheelbase,
    dimWheelbase,   violaWheelbase,   excessoWheelbase,
    /* Tópico 5 */
    trackFront, setTrackFront,
    dimBitolaDiant, violaTrackFront, excessoTrackFront,
    /* Tópico 6 */
    trackRear,  setTrackRear,
    dimBitolaTrasei, violaTrackRear, excessoTrackRear,
    /* Tópico 7 */
    cgLong,   setCgLong,
    /* Tópico 8 */
    cgHeight, setCgHeight,
    /* Tópico 9 */
    rcFront,  setRcFront,
    /* Tópico 10 */
    rcRear,   setRcRear,
    /* Tópico 11 */
    tankPos,  setTankPos,
    /* Regulamentação geral */
    violaRegulamento, excesso,
    combustivelMax,
    /* Pilotos */
    assignedPilots, selectedPilotId, selectPilot,
  }), [
    pesoCarro, pesoPiloto, wheelbase, trackFront, trackRear,
    cgLong, cgHeight, rcFront, rcRear, tankPos,
    pesoMinimo, dimWheelbase, dimBitolaDiant, dimBitolaTrasei,
    violaRegulamento, excesso,
    violaWheelbase, excessoWheelbase,
    violaTrackFront, excessoTrackFront,
    violaTrackRear, excessoTrackRear,
    combustivelMax,
    assignedPilots, selectedPilotId, selectPilot,
    setPesoCarro, setPesoPiloto, setWheelbase, setTrackFront, setTrackRear,
    setCgLong, setCgHeight, setRcFront, setRcRear, setTankPos,
    setPesoHomologado,
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
