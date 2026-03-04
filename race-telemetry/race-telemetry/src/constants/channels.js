/**
 * Mapeamento de canais conhecidos para diferentes sistemas de telemetria.
 * Chave interna → Nome do canal no CSV.
 *
 * O channelDetector tenta casar os headers do CSV importado
 * com esses nomes (ou aliases).
 */
export const CHANNEL_MAP = {
  time:         'Datalog Time',
  brake:        'Break pressure',
  accel:        'Aceleracao',
  ve:           'Eficiencia Volumetrica VE',
  fuelPressure: 'Fuel Pressao de Combustivel',
  gpsDistance:  'GPS Distancia',
  gpsLat:       'GPS Latitude',
  gpsLng:       'GPS Longitude',
  lap:          'GPS Numero da Volta Dash',
  gpsSpeed:     'GPS Velocidade',
  ignAngle:     'Ign Angulo de Ignicao',
  lambda:       'Lambda 1 Valor',
  lambdaTarget: 'Lambda Alvo',
  throttle:     'Posicao da Borboleta TP TP1L',
  map:          'Pressao de Admissao MAP',
  oilPressure:  'Pressao de Oleo OP',
  rpm:          'Rotacao do Motor',
  engineTemp:   'Temperatura do Motor ET',
  battery:      'Tensao da Bateria',
  injDuty1:     'Fuel Percentual de Uso Inj 1',
  injDuty2:     'Fuel Percentual de Uso Inj 2',
  injDuty3:     'Fuel Percentual de Uso Inj 3',
  injDuty4:     'Fuel Percentual de Uso Inj 4',
  ignCharge:    'Ign Tempo de Carga da Bobina',
  fuelComp:     'Fuel Comp Total',
};

/**
 * Aliases adicionais para detectar canais de sistemas MoTec, AiM, etc.
 * Formato: chave interna → array de regex patterns.
 */
export const CHANNEL_ALIASES = {
  time:        [/time/i, /tempo/i, /datalog.*time/i],
  rpm:         [/rpm/i, /rotacao/i, /engine.*speed/i, /motor.*rpm/i],
  gpsSpeed:    [/velocidade/i, /speed/i, /gps.*vel/i, /ground.*speed/i],
  throttle:    [/throttle/i, /borboleta/i, /tps/i, /tp1/i, /acelerador/i],
  brake:       [/brake/i, /freio/i, /break/i],
  gpsLat:      [/latitude/i, /lat/i],
  gpsLng:      [/longitude/i, /lon/i, /lng/i],
  lap:         [/volta/i, /lap/i],
  engineTemp:  [/temperatura.*motor/i, /engine.*temp/i, /coolant/i, /et\b/i],
  oilPressure: [/pressao.*oleo/i, /oil.*press/i],
  lambda:      [/lambda.*valor/i, /lambda.*1/i, /afr/i],
  lambdaTarget:[/lambda.*alvo/i, /lambda.*target/i],
  map:         [/pressao.*admissao/i, /manifold/i, /\bmap\b/i],
  battery:     [/bateria/i, /battery/i, /\bvbat\b/i],
  ignAngle:    [/ignicao/i, /ignition.*angle/i, /spark.*advance/i],
  accel:       [/aceleracao/i, /g.*force/i, /lateral/i],
  gpsDistance:  [/distancia/i, /distance/i],
  fuelPressure: [/pressao.*combust/i, /fuel.*press/i],
};

/**
 * Métricas disponíveis para comparação de voltas.
 */
export const CHART_METRICS = [
  { key: 'gpsSpeed', label: 'Velocidade',  unit: 'km/h' },
  { key: 'rpm',      label: 'RPM',         unit: 'rpm'   },
  { key: 'throttle', label: 'Acelerador',  unit: '%'     },
  { key: 'brake',    label: 'Freio',       unit: 'bar'   },
  { key: 'accel',    label: 'Aceleração G', unit: 'G'    },
  { key: 'lambda',   label: 'Lambda',      unit: ''      },
  { key: 'map',      label: 'MAP',         unit: 'kPa'   },
  { key: 'ignAngle', label: 'Ignição',     unit: '°'     },
];
