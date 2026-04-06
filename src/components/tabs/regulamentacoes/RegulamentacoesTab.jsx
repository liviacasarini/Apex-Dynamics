/**
 * RegulamentacoesTab — Parâmetros Regulamentares
 *
 * Inputs numéricos ficam em chaves próprias (sufixo sem _obs) para uso
 * programático futuro. Descrições/observações ficam separadas (_obs / _desc).
 * Persistido em localStorage: rt_regulations
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { REG_PESO_CHANGED_EVENT, SETUP_REG_CHANGED_EVENT, useCarWeight } from '@/context/CarWeightContext';

const STORAGE_KEY = 'rt_regulations';

/* ── Valores padrão ──────────────────────────────────────────────── */
const EMPTY = {
  /* Peso */
  pesoMinimo: '',
  pesoComPiloto: '',
  pesoDistDiant: '',
  pesoLastreMax: '',
  pesoMinimoObs: '',

  /* Aerodinâmica — dimensões */
  aeroMaxLarguraDiant: '',
  aeroMaxAlturaTrasei: '',
  aeroDesc: '',

  /* Aerodinâmica — zonas de exclusão */
  zonaExclusaoInicio: '',
  zonaExclusaoFim: '',
  zonaExclusaoDesc: '',

  /* Dimensões do Carro */
  dimLarguraTotal: '',
  dimComprimento: '',
  dimWheelbase: '',
  dimBitolaDiant: '',
  dimBitolaTrasei: '',
  dimRideHeightMin: '',
  dimDesc: '',

  /* Motor */
  motorCilindrada: '',
  motorCilindros: '',
  motorPotenciaMax: '',
  motorRpmMax: '',
  motorBoostMax: '',
  motorRestrictor: '',
  motorUnidadesTemporada: '',
  motorTokens: '',
  motorDesc: '',

  /* Transmissão */
  transmMarchasMax: '',
  transmTipo: '',
  transmDiferencial: '',
  transmDesc: '',

  /* Freios */
  freioDiantDiamMax: '',
  freioTrasDiamMax: '',
  freioMaterial: '',
  freioDesc: '',

  /* Assoalho */
  assoalhoAlturaMin: '',
  skidDesgasteMax: '',
  assoalhoObs: '',

  /* Scrutineering */
  margemScrutin: '',
  margemScrutinObs: '',

  /* Eletrônica */
  eletronicaDesc: '',

  /* Segurança */
  segurancaDesc: '',

  /* Combustível */
  combustivelTipo: '',
  combustivelOctanagem: '',
  combustivelTempMax: '',
  combustivelMax: '',
  combustivelObs: '',

  /* Pneus */
  pneusLarguraDiant: '',
  pneusLarguraTras: '',
  pneusDiametro: '',
  pneusFornecedor: '',
  pneusPressaoMin: '',
  pneusCompostosMin: '',
  pneusCompostosMax: '',
  pneusObs: '',

  /* Pit Stop */
  pitMecanicosMax: '',
  pitTempoMinParada: '',
  pitReabastecimento: '',
  pitDesc: '',

  /* Homologação */
  homEntidade: '',
  homValidade: '',
  homDesc: '',
};

/* ── Definição de seções e campos ────────────────────────────────── */
// type: 'number' | 'text' | 'textarea'
// group: agrupa visualmente num mesmo bloco horizontal (label + [num] + [desc])
const SECTIONS = [
  {
    title: 'Peso', color: '#4499ff', icon: '⚖️',
    fields: [
      {
        row: [
          { key: 'pesoMinimo',    label: 'Peso mínimo homologado', unit: 'kg', type: 'number', placeholder: '800', flex: 1 },
          { key: 'pesoComPiloto', label: 'Referência',             unit: '',   type: 'text',   placeholder: 'com piloto / sem piloto', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'pesoDistDiant', label: 'Distribuição dianteira mín./máx.', unit: '%',  type: 'text',   placeholder: '42–46', flex: 1 },
          { key: 'pesoLastreMax', label: 'Lastre máximo permitido',           unit: 'kg', type: 'number', placeholder: '30',    flex: 1 },
        ],
      },
      {
        row: [
          { key: 'pesoMinimoObs', label: 'Observações', unit: '', type: 'textarea', placeholder: 'Ex: peso pós-corrida com 1 L de combustível residual', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Aerodinâmica — Dimensões', color: '#ff5555', icon: '💨',
    fields: [
      {
        label: 'Dimensões máximas',
        row: [
          { key: 'aeroMaxLarguraDiant', label: 'Largura máx. asa diant.', unit: 'mm', type: 'number', placeholder: '1800', flex: 1 },
          { key: 'aeroMaxAlturaTrasei', label: 'Altura máx. asa tras.',   unit: 'mm', type: 'number', placeholder: '800',  flex: 1 },
        ],
      },
      {
        row: [
          { key: 'aeroDesc', label: 'Descrição / outras restrições', unit: '', type: 'textarea', placeholder: 'Ex: bargeboards proibidos, difusor máx 175 mm...', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Aerodinâmica — Zonas de Exclusão', color: '#ff8844', icon: '🚫',
    fields: [
      {
        label: 'Intervalo de exclusão (referência ao eixo traseiro)',
        row: [
          { key: 'zonaExclusaoInicio', label: 'Início', unit: 'mm', type: 'number', placeholder: '150', flex: 1 },
          { key: 'zonaExclusaoFim',    label: 'Fim',    unit: 'mm', type: 'number', placeholder: '200', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'zonaExclusaoDesc', label: 'Descrição da zona', unit: '', type: 'textarea', placeholder: 'Ex: proibido elemento aerodinâmico entre 150–200 mm à frente do eixo', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Dimensões do Carro', color: '#ff6688', icon: '📏',
    fields: [
      {
        label: 'Envelope externo',
        row: [
          { key: 'dimLarguraTotal', label: 'Largura máxima total', unit: 'mm', type: 'number', placeholder: '1900', flex: 1 },
          { key: 'dimComprimento',  label: 'Comprimento máximo',   unit: 'mm', type: 'number', placeholder: '4800', flex: 1 },
        ],
      },
      {
        label: 'Geometria',
        row: [
          { key: 'dimWheelbase',     label: 'Entre-eixos (wheelbase)', unit: 'mm', type: 'number', placeholder: '2700', flex: 1 },
          { key: 'dimRideHeightMin', label: 'Altura mínima ao solo',   unit: 'mm', type: 'number', placeholder: '50',   flex: 1 },
        ],
      },
      {
        row: [
          { key: 'dimBitolaDiant',  label: 'Bitola dianteira', unit: 'mm', type: 'number', placeholder: '1600', flex: 1 },
          { key: 'dimBitolaTrasei', label: 'Bitola traseira',  unit: 'mm', type: 'number', placeholder: '1580', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'dimDesc', label: 'Observações', unit: '', type: 'textarea', placeholder: 'Ex: medição com pneus na posição reta, sem spoilers ativos', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Motor', color: '#ffcc44', icon: '🔧',
    fields: [
      {
        label: 'Especificações técnicas',
        row: [
          { key: 'motorCilindrada', label: 'Cilindrada máxima', unit: 'cc',  type: 'number', placeholder: '2000', flex: 1 },
          { key: 'motorCilindros',  label: 'Nº de cilindros',   unit: 'cil', type: 'number', placeholder: '4',    flex: 1 },
        ],
      },
      {
        row: [
          { key: 'motorPotenciaMax', label: 'Potência máxima homologada', unit: 'cv',  type: 'number', placeholder: '300', flex: 1 },
          { key: 'motorRpmMax',      label: 'RPM máximo permitido',       unit: 'rpm', type: 'number', placeholder: '8500', flex: 1 },
        ],
      },
      {
        label: 'Limitação de performance',
        row: [
          { key: 'motorBoostMax',   label: 'Pressão de turbo/MAP máx.', unit: 'bar', type: 'number', placeholder: '1.5',  flex: 1 },
          { key: 'motorRestrictor', label: 'Restrictor de ar',           unit: 'mm',  type: 'number', placeholder: '28',   flex: 1 },
        ],
      },
      {
        label: 'Regras de uso',
        row: [
          { key: 'motorUnidadesTemporada', label: 'Unidades por temporada', unit: 'unid.',  type: 'number', placeholder: '3', flex: 1 },
          { key: 'motorTokens',            label: 'Tokens de desenvolvimento', unit: 'tok', type: 'number', placeholder: '4', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'motorDesc', label: 'Observações', unit: '', type: 'textarea', placeholder: 'Ex: motor de série homologado, bloco bloqueado, cabeçote livre...', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Transmissão', color: '#ffaa22', icon: '⚙️',
    fields: [
      {
        row: [
          { key: 'transmMarchasMax', label: 'Marchas máximas', unit: 'marchas', type: 'number', placeholder: '6', flex: 1 },
          { key: 'transmTipo',       label: 'Tipo de câmbio',  unit: '',        type: 'text',   placeholder: 'Sequencial / H-pattern / Paddle shift', flex: 2 },
        ],
      },
      {
        row: [
          { key: 'transmDiferencial', label: 'Tipo de diferencial permitido', unit: '', type: 'text', placeholder: 'Ex: diferencial mecânico limitado de deslizamento (LSD)', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'transmDesc', label: 'Observações', unit: '', type: 'textarea', placeholder: 'Ex: paddle shift proibido, câmbio sequencial obrigatório a partir de 2024', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Freios', color: '#dd5533', icon: '🛑',
    fields: [
      {
        label: 'Diâmetro máximo dos discos',
        row: [
          { key: 'freioDiantDiamMax', label: 'Dianteiro', unit: 'mm', type: 'number', placeholder: '330', flex: 1 },
          { key: 'freioTrasDiamMax',  label: 'Traseiro',  unit: 'mm', type: 'number', placeholder: '280', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'freioMaterial', label: 'Material dos discos/pastilhas', unit: '', type: 'text', placeholder: 'Ex: ferro fundido obrigatório, carbono proibido', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'freioDesc', label: 'Observações', unit: '', type: 'textarea', placeholder: 'Ex: ABS proibido, brake-by-wire proibido, divisor de frenagem obrigatório', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Assoalho / Skid Block', color: '#44dd88', icon: '📐',
    fields: [
      {
        row: [
          { key: 'assoalhoAlturaMin', label: 'Altura mínima do assoalho', unit: 'mm', type: 'number', placeholder: '10',  flex: 1 },
          { key: 'skidDesgasteMax',   label: 'Desgaste máximo skid block',  unit: 'mm', type: 'number', placeholder: '1',   flex: 1 },
        ],
      },
      {
        row: [
          { key: 'assoalhoObs', label: 'Observações', unit: '', type: 'textarea', placeholder: 'Ex: medição feita em 3 pontos definidos no regulamento técnico', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Scrutineering', color: '#cc88ff', icon: '🔍',
    fields: [
      {
        row: [
          { key: 'margemScrutin', label: 'Margem de segurança nos limites', unit: '%', type: 'number', placeholder: '0.5', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'margemScrutinObs', label: 'Contexto / histórico de penalidades', unit: '', type: 'textarea', placeholder: 'Ex: FIA aceita ±0.5 % no peso pós-corrida', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Eletrônica', color: '#4499ff', icon: '💻',
    fields: [
      {
        row: [
          { key: 'eletronicaDesc', label: 'Sistemas proibidos / restrições', unit: '', type: 'textarea', placeholder: 'Ex: tração ativa, ABS, controle de lançamento automático proibidos', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Segurança', color: '#ff44aa', icon: '🛡️',
    fields: [
      {
        row: [
          { key: 'segurancaDesc', label: 'Componentes obrigatórios e homologações', unit: '', type: 'textarea', placeholder: 'Ex: HANS FIA 8858-2002, roll hoop homologado, FIA 8860 monocoque', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Combustível', color: '#44ccff', icon: '⛽',
    fields: [
      {
        label: 'Tipo e especificação',
        row: [
          { key: 'combustivelTipo',      label: 'Tipo / especificação', unit: '',    type: 'text',   placeholder: 'E100 / E27 / Gasolina premium / Spec fuel', flex: 2 },
          { key: 'combustivelOctanagem', label: 'Octanagem mínima',     unit: 'RON', type: 'number', placeholder: '98', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'combustivelMax',     label: 'Quantidade máxima por corrida', unit: 'kg', type: 'number', placeholder: '110', flex: 1 },
          { key: 'combustivelTempMax', label: 'Temperatura máxima na largada', unit: '°C', type: 'number', placeholder: '10',  flex: 1 },
        ],
      },
      {
        row: [
          { key: 'combustivelObs', label: 'Observações', unit: '', type: 'textarea', placeholder: 'Ex: medido na largada, tolerância ±0.5 kg, etanol obrigatório conforme CBF', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Pneus', color: '#aabb44', icon: '⚫',
    fields: [
      {
        label: 'Dimensões',
        row: [
          { key: 'pneusLarguraDiant', label: 'Largura máx. dianteira', unit: 'mm', type: 'number', placeholder: '270', flex: 1 },
          { key: 'pneusLarguraTras',  label: 'Largura máx. traseira',  unit: 'mm', type: 'number', placeholder: '310', flex: 1 },
          { key: 'pneusDiametro',     label: 'Diâmetro das rodas',     unit: 'pol', type: 'number', placeholder: '18', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'pneusFornecedor',  label: 'Fornecedor',              unit: '', type: 'text',   placeholder: 'Ex: Pirelli (único) / Hankook (único) / livre', flex: 2 },
          { key: 'pneusPressaoMin',  label: 'Pressão mínima homolog.', unit: 'PSI', type: 'number', placeholder: '22', flex: 1 },
        ],
      },
      {
        label: 'Uso em corrida',
        row: [
          { key: 'pneusCompostosMin', label: 'Compostos obrig. mín. por corrida', unit: 'compost.', type: 'number', placeholder: '2',  flex: 1 },
          { key: 'pneusCompostosMax', label: 'Compostos disponíveis por evento',   unit: 'compost.', type: 'number', placeholder: '13', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'pneusObs', label: 'Observações', unit: '', type: 'textarea', placeholder: 'Ex: mínimo 1 set de pneu intermediário obrigatório em corridas molhadas', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Pit Stop', color: '#22ccaa', icon: '🔩',
    fields: [
      {
        row: [
          { key: 'pitMecanicosMax',    label: 'Mecânicos máx. no box', unit: 'pess.', type: 'number', placeholder: '6',  flex: 1 },
          { key: 'pitTempoMinParada',  label: 'Tempo mínimo de parada', unit: 's',    type: 'number', placeholder: '30', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'pitReabastecimento', label: 'Reabastecimento', unit: '', type: 'text', placeholder: 'Permitido / Proibido / Obrigatório', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'pitDesc', label: 'Observações', unit: '', type: 'textarea', placeholder: 'Ex: troca de pneus obrigatória, reabastecimento somente com motor desligado', flex: 1 },
        ],
      },
    ],
  },
  {
    title: 'Homologação', color: '#bb88ff', icon: '📋',
    fields: [
      {
        row: [
          { key: 'homEntidade', label: 'Entidade homologadora',   unit: '', type: 'text', placeholder: 'CBA / FIA / ambas', flex: 1 },
          { key: 'homValidade', label: 'Validade da homologação', unit: '', type: 'text', placeholder: 'Ex: 2024–2026', flex: 1 },
        ],
      },
      {
        row: [
          { key: 'homDesc', label: 'Observações / número do documento', unit: '', type: 'textarea', placeholder: 'Ex: Regulamento Técnico CBA 2024, artigo 12.3 — homologação válida até 31/12/2026', flex: 1 },
        ],
      },
    ],
  },
];

/* ── Sub-componente: célula de input ─────────────────────────────── */
function FieldCell({ def, value, onChange, COLORS, sectionColor }) {
  const isNum = def.type === 'number';
  const borderColor = value ? `${sectionColor}88` : COLORS.border;
  const base = {
    background: COLORS.bg,
    border: `1px solid ${borderColor}`,
    borderRadius: 6,
    color: isNum ? sectionColor : COLORS.textPrimary,
    fontWeight: isNum ? 700 : 400,
    fontSize: isNum ? 14 : 12,
    fontFamily: isNum ? 'monospace' : 'inherit',
    padding: isNum ? '6px 10px' : '7px 10px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    resize: def.type === 'textarea' ? 'vertical' : undefined,
    transition: 'border-color 0.15s',
  };
  return (
    <div style={{ flex: def.flex || 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600 }}>{def.label}</span>
        {def.unit && (
          <span style={{
            fontSize: 9, color: sectionColor, background: `${sectionColor}18`,
            borderRadius: 3, padding: '1px 5px', fontWeight: 700,
          }}>{def.unit}</span>
        )}
      </div>
      {def.type === 'textarea' ? (
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(def.key, e.target.value)}
          placeholder={def.placeholder}
          style={{ ...base, minHeight: 52, fontSize: 11 }}
          onFocus={(e) => { e.target.style.borderColor = sectionColor; }}
          onBlur={(e)  => { e.target.style.borderColor = value ? `${sectionColor}88` : COLORS.border; }}
        />
      ) : (
        <input
          type={def.type}
          value={value}
          onChange={(e) => onChange(def.key, e.target.value)}
          placeholder={def.placeholder}
          style={base}
          onFocus={(e) => { e.target.style.borderColor = sectionColor; }}
          onBlur={(e)  => { e.target.style.borderColor = value ? `${sectionColor}88` : COLORS.border; }}
        />
      )}
    </div>
  );
}

/* ── Componente Principal ─────────────────────────────────────────── */
export default function RegulamentacoesTab() {
  const { colors: COLORS } = useTheme();
  const { pesoCarro, violaRegulamento, excesso, pesoMinimo: ctxPesoMinimo } = useCarWeight();

  const [values, setValues] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...EMPTY, ...JSON.parse(saved) } : { ...EMPTY };
    } catch { return { ...EMPTY }; }
  });

  const [saved, setSaved] = useState(false);

  // Fase 8: quando SetupSheetTab altera motor/transmissão, atualiza campos de regulamentações (apenas se vazio)
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail) return;
      const d = e.detail;
      setValues(prev => {
        const up = {};
        if (d.engine_maxPowerCv   && !prev.motorPotenciaMax)  up.motorPotenciaMax  = d.engine_maxPowerCv;
        if (d.engine_revLimit     && !prev.motorRpmMax)       up.motorRpmMax       = d.engine_revLimit;
        if (d.engine_displacement && !prev.motorCilindrada)   up.motorCilindrada   = d.engine_displacement;
        if (d.engine_cylinders    && !prev.motorCilindros)    up.motorCilindros    = d.engine_cylinders;
        if (d.trans_numGears      && !prev.transmMarchasMax)  up.transmMarchasMax  = d.trans_numGears;
        if (d.trans_gearboxType   && !prev.transmTipo)        up.transmTipo        = d.trans_gearboxType;
        if (d.diff_type           && !prev.transmDiferencial) up.transmDiferencial = d.diff_type;
        if (!Object.keys(up).length) return prev;
        return { ...prev, ...up };
      });
    };
    window.addEventListener(SETUP_REG_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SETUP_REG_CHANGED_EVENT, handler);
  }, []);

  // Tópico 2: quando PesoTab ou CombustivelTab alteram pesoMinimo via contexto, reflete aqui
  const prevCtxPesoMinimo = useRef(ctxPesoMinimo);
  useEffect(() => {
    if (ctxPesoMinimo === prevCtxPesoMinimo.current) return;
    prevCtxPesoMinimo.current = ctxPesoMinimo;
    if (ctxPesoMinimo !== '' && ctxPesoMinimo !== values.pesoMinimo) {
      setValues(prev => ({ ...prev, pesoMinimo: ctxPesoMinimo }));
    }
  }, [ctxPesoMinimo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      // Notifica o contexto global com todos os limites regulamentares relevantes
      window.dispatchEvent(new CustomEvent(REG_PESO_CHANGED_EVENT, {
        detail: {
          // Peso & geometria (Topics 2, 4, 5, 6)
          pesoMinimo:      values.pesoMinimo,
          combustivelMax:  values.combustivelMax,
          dimWheelbase:    values.dimWheelbase,
          dimBitolaDiant:  values.dimBitolaDiant,
          dimBitolaTrasei: values.dimBitolaTrasei,
          // Fase 8 — Motor, Transmissão, Freios, Pneus (para SetupSheetTab)
          motorPotenciaMax:  values.motorPotenciaMax,
          motorRpmMax:       values.motorRpmMax,
          motorCilindrada:   values.motorCilindrada,
          motorCilindros:    values.motorCilindros,
          motorBoostMax:     values.motorBoostMax,
          transmMarchasMax:  values.transmMarchasMax,
          transmTipo:        values.transmTipo,
          transmDiferencial: values.transmDiferencial,
          freioDiantDiamMax: values.freioDiantDiamMax,
          freioTrasDiamMax:  values.freioTrasDiamMax,
          // Fase 9 — Pneus (para PneusTab)
          pneusLarguraDiant: values.pneusLarguraDiant,
          pneusLarguraTras:  values.pneusLarguraTras,
          pneusFornecedor:   values.pneusFornecedor,
          pneusPressaoMin:   values.pneusPressaoMin,
          // Combustível (para CombustivelTab)
          combustivelTipo:   values.combustivelTipo,
        },
      }));
    }, 800);
    return () => clearTimeout(t);
  }, [values]);

  const handleChange = useCallback((key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleClear = useCallback(() => {
    if (window.confirm('Limpar todos os parâmetros regulamentares?')) {
      setValues({ ...EMPTY });
    }
  }, []);

  const allKeys = Object.keys(EMPTY);
  const numericKeys = allKeys.filter(k => !k.endsWith('Obs') && !k.endsWith('Desc') && !k.endsWith('desc'));
  const filledNumeric = numericKeys.filter(k => values[k] !== '').length;
  const filledAll = allKeys.filter(k => values[k] !== '').length;

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Banner de infração regulamentar ──────────────────────────── */}
      {violaRegulamento && (
        <div style={{
          background: '#ff222215',
          border: '1.5px solid #ff4444',
          borderRadius: 10,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>🚨</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ff4444' }}>
              Infração Regulamentar — Peso
            </div>
            <div style={{ fontSize: 12, color: '#ff7777', marginTop: 2 }}>
              O peso do carro cadastrado ({pesoCarro} kg) excede o limite de {values.pesoMinimo} kg
              em <strong>{excesso} kg</strong>. Revise o setup ou ajuste o regulamento.
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20 }}>📜</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>Regulamentações</span>
        <span style={{ fontSize: 11, color: COLORS.textSecondary }}>Parâmetros técnicos e legais da categoria</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {saved && <span style={{ fontSize: 10, color: '#44cc88', fontWeight: 600 }}>✓ Salvo</span>}
          {/* Progresso numéricos */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: COLORS.textMuted }}>Numéricos</span>
              <div style={{ width: 80, height: 4, background: COLORS.border, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((filledNumeric / numericKeys.length) * 100)}%`, height: '100%', background: '#4499ff', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 9, color: '#4499ff', fontWeight: 600 }}>{filledNumeric}/{numericKeys.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: COLORS.textMuted }}>Total</span>
              <div style={{ width: 80, height: 4, background: COLORS.border, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((filledAll / allKeys.length) * 100)}%`, height: '100%', background: '#44cc88', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 9, color: '#44cc88', fontWeight: 600 }}>{filledAll}/{allKeys.length}</span>
            </div>
          </div>
          <button
            onClick={handleClear}
            style={{ background: 'transparent', border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.textMuted, fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}
          >Limpar</button>
        </div>
      </div>

      {/* ── Grid de seções ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
        {SECTIONS.map(section => {
          // Identifica quais chaves numéricas da seção estão preenchidas
          const sectionNumKeys = section.fields.flatMap(f => f.row.filter(d => d.type === 'number').map(d => d.key));
          const sectionNumFilled = sectionNumKeys.filter(k => values[k] !== '').length;
          const allNumFilled = sectionNumKeys.length > 0 && sectionNumFilled === sectionNumKeys.length;
          return (
            <div key={section.title} style={{
              background: COLORS.bgCard, borderRadius: 12, padding: 16,
              border: `1px solid ${allNumFilled ? section.color + '66' : COLORS.border}`,
              display: 'flex', flexDirection: 'column', gap: 10,
              transition: 'border-color 0.2s',
            }}>
              {/* Cabeçalho */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15 }}>{section.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: section.color }}>{section.title}</span>
                {sectionNumKeys.length > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                    color: allNumFilled ? section.color : COLORS.textMuted,
                    background: allNumFilled ? `${section.color}18` : 'transparent',
                    border: `1px solid ${allNumFilled ? section.color + '44' : 'transparent'}`,
                    borderRadius: 4, padding: '1px 6px',
                  }}>
                    {sectionNumFilled}/{sectionNumKeys.length} num.
                  </span>
                )}
              </div>

              {/* Linhas de campos */}
              {section.fields.map((fieldGroup, gi) => (
                <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {fieldGroup.label && (
                    <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {fieldGroup.label}
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {fieldGroup.row.map(def => (
                      <FieldCell
                        key={def.key}
                        def={def}
                        value={values[def.key]}
                        onChange={handleChange}
                        COLORS={COLORS}
                        sectionColor={section.color}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
