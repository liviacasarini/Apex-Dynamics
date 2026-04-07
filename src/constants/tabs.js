export const TABS = [
  { id: 'overview',    label: 'Overview',          icon: '⚡' },
  { id: 'laps',        label: 'Comparar Voltas',   icon: '🔄' },
  { id: 'wot',         label: 'Análise WOT',       icon: '🔥' },
  { id: 'vitals',      label: 'Dados Vitais',      icon: '🔧' },
  { id: 'report',      label: 'Relatório',         icon: '📋' },
  { id: 'track',       label: 'Mapa da Pista',     icon: '🗺️' },
  { id: 'temperature', label: 'Temperaturas',      icon: '🌡️' },
  { id: 'pneus',       label: 'Pneus',             icon: '⚫' },
  { id: 'setup',       label: 'Setup Sheet',       icon: '📄' },
  { id: 'profiles',     label: 'Carros',            icon: '🏎️' },
  { id: 'multisession', label: 'Multi-Sessão',      icon: '📊' },
  { id: 'mecanica',    label: 'Inventário',          icon: '⚙️' },
  { id: 'onboard',    label: 'Onboarding',         icon: '🎬' },
  { id: 'math',            label: 'Matemática',     icon: '🧮' },
  { id: 'regulamentacoes', label: 'Regulamentações', icon: '📜' },
  { id: 'combustivel',     label: 'Combustível',        icon: '⛽' },
  { id: 'peso',            label: 'Peso',               icon: '⚖️' },
  { id: 'pilotos',         label: 'Pilotos',            icon: '👤' },
  { id: 'pistas',          label: 'Pistas',             icon: '🏁' },
  { id: 'estrategia',      label: 'Estratégia',         icon: '🏆' },
  { id: 'performance',     label: 'Performance',        icon: '📈' },
  { id: 'calendario',      label: 'Calendário',         icon: '📅' },
  { id: 'laptime',         label: 'Lap Time',           icon: '⏱️' },
  { id: 'equipe',          label: 'Equipe',             icon: '📡' },
];

/* ── Overrides de labels/ícones por tipo de veículo ─────────────── */
const VEHICLE_TAB_OVERRIDES = {
  moto: {
    profiles: { label: 'Motos', icon: '🏍️' },
  },
  truck: {
    profiles: { label: 'Caminhões', icon: '🚛' },
  },
};

/** Tipos de veículo disponíveis */
export const VEHICLE_TYPES = [
  { value: 'car',   label: 'Carro',    icon: '🏎️' },
  { value: 'moto',  label: 'Moto',     icon: '🏍️' },
  { value: 'truck', label: 'Caminhão', icon: '🚛' },
];

/** Retorna as abas filtradas/adaptadas para o tipo de veículo */
export function getTabsForVehicle(vehicleType) {
  const overrides = VEHICLE_TAB_OVERRIDES[vehicleType] || {};
  return TABS.map((tab) => {
    const ov = overrides[tab.id];
    return ov ? { ...tab, ...ov } : tab;
  });
}
