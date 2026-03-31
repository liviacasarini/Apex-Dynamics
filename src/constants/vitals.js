/**
 * vitals.js — Constantes de dados vitais do veículo.
 *
 * DEFAULT_VITALS_LIMITS extraído de useWorkspaces.js
 * VITAL_CHANNELS extraído de App.jsx
 */

/** Limites padrão dos dados vitais — usados quando um workspace não tem configuração própria. */
export const DEFAULT_VITALS_LIMITS = {
  engineTemp:      { max: '100', min: ''    },
  oilPressure:     { max: '',    min: '1.0' },
  battery:         { max: '',    min: '12.0'},
  lambda:          { max: '1.1', min: '0.9' },
  fuelPressure:    { max: '',    min: '2.5' },
  transOilTemp:    { max: '',    min: ''    },
  transOilPressure:{ max: '',    min: ''    },
  oilVolume:       { max: '',    min: ''    },
  transOilVolume:  { max: '',    min: ''    },
  waterVolume:     { max: '',    min: ''    },
};

/** Canais que têm limites verificáveis no CSV */
export const VITAL_CHANNELS = [
  { key: 'engineTemp',       label: 'Temp. Água'           },
  { key: 'oilPressure',      label: 'Pressão Óleo'         },
  { key: 'battery',          label: 'Bateria'              },
  { key: 'lambda',           label: 'Lambda'               },
  { key: 'fuelPressure',     label: 'Pressão Comb.'        },
  { key: 'transOilTemp',     label: 'Temp. Óleo Câmbio'    },
  { key: 'transOilPressure', label: 'Pressão Óleo Câmbio'  },
];
