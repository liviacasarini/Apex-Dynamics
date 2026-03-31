/**
 * Mapeamento de canais conhecidos para diferentes sistemas de telemetria.
 * Chave interna → Nome do canal no CSV.
 *
 * O channelDetector tenta casar os headers do CSV importado
 * com esses nomes (ou aliases).
 */
export const CHANNEL_MAP = {
  time:         'Datalog Time',
  lapTimeGPS:   'Lap Time',
  brake:        'Break pressure',
  accel:        'Acel. Longitudinal X',
  lateralG:     'Acel. Lateral Y',
  ve:           'Eficiencia Volumetrica VE',
  fuelPressure: 'Fuel Pressao de Combustivel',
  gpsDistance:  'GPS Distancia',
  gpsLat:       'GPS Latitude',
  gpsLng:       'GPS Longitude',
  lap:          'GPS Numero da Volta(Dash)',
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
  injDuty1:        'Fuel Percentual de Uso Inj 1',
  injDuty2:        'Fuel Percentual de Uso Inj 2',
  injDuty3:        'Fuel Percentual de Uso Inj 3',
  injDuty4:        'Fuel Percentual de Uso Inj 4',
  ignCharge:       'Ign Tempo de Carga da Bobina',
  fuelComp:        'Fuel Comp Total',
  transOilTemp:    'Temperatura Oleo Cambio',
  transOilPressure:'Pressao Oleo Cambio',
  gear:            'Marcha',
  iat:             'Temperatura Ar Admissao IAT',
  altitude:        'GPS Altitude',
  baroPressure:    'Pressao Barometrica',
  egt:             'Temperatura Gases de Escape EGT',
};

/**
 * Aliases adicionais para detectar canais de sistemas MoTec, AiM, Bosch, etc.
 * Formato: chave interna → array de regex patterns.
 *
 * Cobre nomes de canais de: ProTune CSV, MoTec i2/LD, AiM Race Studio,
 * Bosch WinDarab LOG, e formatos genéricos TSV/TDL.
 */
export const CHANNEL_ALIASES = {
  time:        [/datalog.*time/i, /^time$/i, /^tempo$/i, /cur.*time/i, /^t\s*\[s\]$/i, /^zeit$/i, /^tiempo$/i, /^elapsed/i],
  lapTimeGPS:  [/^lap\s*time$/i, /gps.*tempo.*volta/i, /tempo.*volta.*gps/i, /gps.*lap.*time/i, /lap.*time/i, /^rundenzeit$/i],
  rpm:         [/rpm/i, /rotacao/i, /^engine\s*rpm$/i, /engine.*speed/i, /motor.*rpm/i, /^n\s*\[rpm\]$/i, /^drehzahl$/i],
  gpsSpeed:    [/^gps\s*[\-–]?\s*speed$/i, /gps.*vel/i, /gps.*speed/i, /ground.*speed/i, /^vehicle\s*speed$/i, /^wheel.*speed/i, /^veh.*speed/i, /^v\s*\[km\/h\]$/i, /^geschwindigkeit$/i, /velocidade/i, /speed/i],
  throttle:    [/throttle/i, /borboleta/i, /tps/i, /tp1/i, /acelerador/i, /^drosselklappe$/i, /^throttle\s*pos/i, /^pedal\s*pos/i],
  brake:       [/freio/i, /brake/i, /break/i, /^bremsdruck$/i, /^brake\s*press/i, /^brk/i],
  gpsLat:      [/latitude/i, /lat/i, /^gps.*lat/i],
  gpsLng:      [/longitude/i, /lon/i, /lng/i, /^gps.*lon/i],
  lap:         [/\bvolta\b/i, /\blap\b/i, /^beacon$/i, /^runde$/i, /^vuelta$/i, /^marker$/i],
  engineTemp:  [/temperatura.*motor/i, /engine.*temp/i, /coolant/i, /et\b/i, /^t\s*motor/i, /^kuehlmittel/i, /^water\s*temp/i, /^ect$/i, /^clt$/i, /^engine\s*temperature$/i],
  oilPressure: [/pressao.*oleo.*ecu/i, /oleo.*ecu/i, /oil.*press.*ecu/i, /ecu.*oil.*press/i, /pressao.*oleo/i, /oil.*press.*tdl/i, /oil.*press/i, /^oeldruck$/i, /^p\s*oil/i, /^oil\s*p$/i, /^oil\s*pressure$/i],
  lambda:      [/lambda.*valor/i, /^lambda\s*1$/i, /lambda.*1/i, /afr/i, /^lambda$/i, /^o2$/i, /^wideband/i],
  lambdaTarget:[/lambda.*alvo/i, /lambda.*target/i, /target.*lambda/i, /^lambda\s*target$/i, /^lambda\s*soll$/i, /^target\s*lambda$/i],
  map:         [/pressao.*admissao/i, /manifold/i, /\bmap\b/i, /^saugrohr/i, /^intake.*press/i, /^boost/i],
  battery:     [/bateria/i, /battery/i, /\bvbat\b/i, /^u\s*batt/i, /^batterie/i, /^supply.*volt/i, /tensao.*bateria/i, /bateria.*tdl/i, /bateria.*ecu/i],
  ignAngle:    [/ignicao/i, /ignition.*angle/i, /spark.*advance/i, /timing.*advance/i, /advance.*timing/i, /^zuendwinkel$/i, /^ign\s*adv/i, /^timing$/i],
  accel:       [/acel.*longitudinal/i, /longitudinal.*acel/i, /acel.*long/i, /\bg\s*lon/i, /\bgx\b/i, /accel\s*g/i, /g.*force.*lon/i, /longitudinal.*g/i, /acel.*[xX]\b/i, /^g\s*long/i, /^accel.*x/i],
  lateralG:    [/acel.*lateral/i, /lateral.*acel/i, /acel.*lat/i, /\bg\s*lat/i, /\bgy\b/i, /g.*force.*lat/i, /lateral.*g/i, /acel.*[yY]\b/i, /^g\s*lat/i, /^accel.*y/i, /lat.*accel/i],
  gpsDistance:  [/distancia/i, /distance/i, /^strecke$/i, /^odo/i],
  fuelPressure:    [/pressao.*combust.*ecu/i, /combustivel.*ecu/i, /fuel.*press.*ecu/i, /ecu.*fuel.*press/i, /pressao.*combust/i, /fuel.*press.*tdl/i, /tdl.*fuel.*press/i, /fuel.*press/i, /^kraftstoffdruck$/i, /^fuel\s*p$/i, /^p\s*fuel/i, /^fuel\s*pressure$/i],
  ve:              [/eficiencia.*volumetrica/i, /^ve\b/i, /volumetric.*eff/i],
  injDuty1:        [/inj.*1.*duty/i, /duty.*inj.*1/i, /uso.*inj.*1/i, /^inj1\s*%$/i],
  injDuty2:        [/inj.*2.*duty/i, /duty.*inj.*2/i, /uso.*inj.*2/i, /^inj2\s*%$/i],
  injDuty3:        [/inj.*3.*duty/i, /duty.*inj.*3/i, /uso.*inj.*3/i, /^inj3\s*%$/i],
  injDuty4:        [/inj.*4.*duty/i, /duty.*inj.*4/i, /uso.*inj.*4/i, /^inj4\s*%$/i],
  ignCharge:       [/carga.*bobina/i, /coil.*charge/i, /dwell/i],
  fuelComp:        [/comp.*total/i, /fuel.*comp/i, /fuel.*correction/i],
  transOilTemp:    [/temp.*cambio/i, /cambio.*temp/i, /trans.*oil.*temp/i, /gearbox.*oil.*temp/i, /oil.*temp.*trans/i, /temp.*oleo.*cambio/i, /oleo.*cambio.*temp/i, /^getriebeoel.*temp/i, /^t\s*gear/i, /sensor.*gearbox.*oil.*temp/i, /sensor.*temp.*cambio/i, /^oil\s*temp$/i, /^oil\s*temperature$/i],
  transOilPressure:[/press.*cambio/i, /cambio.*press/i, /trans.*oil.*press/i, /gearbox.*oil.*press/i, /oil.*press.*trans/i, /pressao.*oleo.*cambio/i, /oleo.*cambio.*press/i, /^getriebeoel.*druck/i, /^p\s*gear/i, /sensor.*gearbox.*oil.*press/i, /sensor.*pressao.*oleo.*cambio/i, /sensor.*pressao.*oleo/i],
  gear:            [/^gear$/i, /^marcha$/i, /^gang$/i, /^gear\s*pos/i, /^current\s*gear$/i, /^engaged\s*gear$/i, /^selected\s*gear$/i, /^gearbox\s*pos/i, /marcha.*atual/i, /atual.*marcha/i, /posicao.*marcha/i, /pos.*marcha/i],
  iat:             [/\biat\b/i, /intake\s*air\s*temp/i, /air\s*intake\s*temp/i, /temp.*ar\s*adm/i, /temperatura.*ar\b/i, /\btair\b/i, /ambient\s*air\s*temp/i, /air\s*temp(?:erature)?/i],
  altitude:        [/\baltitude\b/i, /gps\s*alt(?:itude)?/i, /alt(?:itude)?\s*gps/i, /\bheight\b/i, /\belevation\b/i, /\balt\b/i],
  baroPressure:    [/\bbaro(?:metric)?\b/i, /pressao\s*atm/i, /pressão\s*atm/i, /ambient\s*press/i, /atmospheric\s*press/i, /\bpatm\b/i, /^baro\s*press/i],
  egt:             [/\begt\b/i, /exhaust.*gas.*temp/i, /gas.*escape.*temp/i, /temp.*escape/i, /temp.*exh/i, /exh.*temp/i, /turb.*temp/i, /\bt5\b/i],
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
