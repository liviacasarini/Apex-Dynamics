/**
 * vitals.js — Constantes de dados vitais do veículo.
 *
 * DEFAULT_VITALS_LIMITS extraído de useWorkspaces.js
 * VITAL_CHANNELS extraído de App.jsx
 */

/* ═══════════════════════════════════════════════════════════════════════
   CARRO
═══════════════════════════════════════════════════════════════════════ */

/** Limites padrão dos dados vitais — carro. */
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

/** Canais que têm limites verificáveis no CSV — carro. */
export const VITAL_CHANNELS = [
  { key: 'engineTemp',       label: 'Temp. Água'           },
  { key: 'oilPressure',      label: 'Pressão Óleo'         },
  { key: 'battery',          label: 'Bateria'              },
  { key: 'lambda',           label: 'Lambda'               },
  { key: 'fuelPressure',     label: 'Pressão Comb.'        },
  { key: 'transOilTemp',     label: 'Temp. Óleo Câmbio'    },
  { key: 'transOilPressure', label: 'Pressão Óleo Câmbio'  },
];

/* ═══════════════════════════════════════════════════════════════════════
   CAMINHÃO (Copa Truck)
═══════════════════════════════════════════════════════════════════════ */

/** Limites padrão dos dados vitais — caminhão Copa Truck.
 *  Sistema 24 V, diesel turbo, freio pneumático, retarder. */
export const DEFAULT_VITALS_LIMITS_TRUCK = {
  engineTemp:      { max: '105', min: ''     },   // Motor diesel — temp. líquido arrefecimento
  oilPressure:     { max: '',    min: '2.0'  },   // Pressão óleo motor (bar)
  battery:         { max: '',    min: '24.0' },   // Sistema 24 V
  egt:             { max: '650', min: ''     },   // Temperatura gases de escape (°C)
  map:             { max: '3.5', min: ''     },   // Boost / MAP turbo (bar)
  fuelPressure:    { max: '',    min: '250'  },   // Pressão common rail (bar) — faixa 250-2000
  transOilTemp:    { max: '120', min: ''     },   // Óleo câmbio (°C)
  transOilPressure:{ max: '',    min: '1.5'  },   // Pressão óleo câmbio (bar)
  iat:             { max: '55',  min: ''     },   // Temp. ar admissão (pós-intercooler)
  oilVolume:       { max: '',    min: ''     },
  transOilVolume:  { max: '',    min: ''     },
  waterVolume:     { max: '',    min: ''     },
};

/** Canais monitorados — caminhão. */
export const VITAL_CHANNELS_TRUCK = [
  { key: 'engineTemp',       label: 'Temp. Motor',          unit: '°C'  },
  { key: 'oilPressure',      label: 'Pressão Óleo Motor',   unit: 'bar' },
  { key: 'battery',          label: 'Bateria (24 V)',       unit: 'V'   },
  { key: 'egt',              label: 'Temp. Gases Escape',   unit: '°C'  },
  { key: 'map',              label: 'Boost / MAP Turbo',    unit: 'bar' },
  { key: 'fuelPressure',     label: 'Pressão Common Rail',  unit: 'bar' },
  { key: 'transOilTemp',     label: 'Temp. Óleo Câmbio',    unit: '°C'  },
  { key: 'transOilPressure', label: 'Pressão Óleo Câmbio',  unit: 'bar' },
  { key: 'iat',              label: 'Temp. Ar Admissão',    unit: '°C'  },
];

/** Retorna definições de vitals conforme o tipo de veículo. */
export function getVitalChannels(vehicleType) {
  return vehicleType === 'truck' ? VITAL_CHANNELS_TRUCK : VITAL_CHANNELS;
}

/** Retorna limites padrão conforme o tipo de veículo. */
export function getDefaultVitalsLimits(vehicleType) {
  return vehicleType === 'truck' ? DEFAULT_VITALS_LIMITS_TRUCK : DEFAULT_VITALS_LIMITS;
}
