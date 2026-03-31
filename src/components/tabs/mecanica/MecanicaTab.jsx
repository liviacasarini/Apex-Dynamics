import { useState, useEffect, useRef } from 'react';
import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';
import { PrintFooter } from '@/components/common';

/* ─── Categorias fixas ───────────────────────────────────────────────────── */
const FIXED_CATEGORIES = ['suspensão', 'motor', 'transmissão', 'freio', 'aerodinâmica', 'térmico', 'elétrica', 'híbrido', 'chassi', 'outro'];

const CATEGORY_META = {
  'suspensão':     { icon: '🔩', label: 'Suspensão' },
  'motor':         { icon: '🔥', label: 'Motor' },
  'transmissão':   { icon: '⚙️', label: 'Transmissão' },
  'freio':         { icon: '🛑', label: 'Freio' },
  'aerodinâmica':  { icon: '🌬️', label: 'Aerodinâmica' },
  'térmico':       { icon: '🌡️', label: 'Sistemas Térmicos' },
  'elétrica':      { icon: '⚡', label: 'Elétrica' },
  'híbrido':       { icon: '🔋', label: 'Híbrido / ERS' },
  'chassi':        { icon: '🏗️', label: 'Chassi' },
  'outro':         { icon: '📦', label: 'Outro' },
};

const ALARM_THRESHOLD = 0.96;

const PART_STATUS_KEY  = (id) => `rt_part_status_${id  || 'global'}`;
const PART_HISTORY_KEY = (id) => `rt_part_history_${id || 'global'}`;
const PART_SPECS_KEY   = (id) => `rt_part_specs_${id   || 'global'}`;

/* ─── Campos de especificação por tipo de peça ───────────────────────────── */
// Helpers reutilizáveis
const _AMO = [
  { key: 'marca',    label: 'Marca',                         type: 'text',   pl: 'Ex: Bilstein',       w: '1 1 130px' },
  { key: 'modelo',   label: 'Modelo',                        type: 'text',   pl: 'Ex: B6',             w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',                    type: 'text',   pl: 'Código',             w: '1 1 120px' },
  { key: 'lsc',      label: 'Clicks compressão lenta (LSC)', type: 'number', pl: '0',                  w: '1 1 100px' },
  { key: 'hsc',      label: 'Clicks compressão rápida (HSC)',type: 'number', pl: '0',                  w: '1 1 100px' },
  { key: 'lsr',      label: 'Clicks rebound lento (LSR)',    type: 'number', pl: '0',                  w: '1 1 100px' },
  { key: 'hsr',      label: 'Clicks rebound rápido (HSR)',   type: 'number', pl: '0',                  w: '1 1 100px' },
  { key: 'taxaMola', label: 'Taxa de mola (N/mm)',           type: 'number', pl: 'Ex: 65',             w: '1 1 110px' },
  { key: 'ride',     label: 'Altura de ride (mm)',           type: 'number', pl: 'Ex: 30',             w: '1 1 100px' },
  { key: 'preload',  label: 'Preload (mm)',                  type: 'number', pl: '0',                  w: '1 1 100px' },
  { key: 'n2',        label: 'Pressão N₂ (bar)',              type: 'number', pl: 'Ex: 10',             w: '1 1 100px' },
  { key: 'curvaFrio',  label: 'Curva a frio (N·s/m)',         type: 'number', pl: 'Ex: 2500',           w: '1 1 120px' },
  { key: 'curvaQuente',label: 'Curva a quente (N·s/m)',       type: 'number', pl: 'Ex: 2200',           w: '1 1 120px' },
  { key: 'repeatability',label: 'Repeatability (%)',          type: 'number', pl: 'Ex: 98',             w: '1 1 100px' },
  { key: 'tolDim',     label: 'Tolerância dimensional (mm)', type: 'number', pl: 'Ex: 0.05',           w: '1 1 120px' },
  { key: 'rigidezProj',label: 'Rigidez projetada (N/mm)',    type: 'number', pl: 'Ex: 2500',           w: '1 1 130px' },
  { key: 'rigidezReal',label: 'Rigidez real (N/mm)',         type: 'number', pl: 'Ex: 2400',           w: '1 1 130px' },
  { key: 'rigidezDesvio',label: 'Desvio rigidez (%)',        type: 'computed',                         w: '1 1 100px' },
];
const _MOL = [
  { key: 'marca',      label: 'Marca',               type: 'text',   pl: 'Ex: Eibach',  w: '1 1 130px' },
  { key: 'modelo',     label: 'Modelo',              type: 'text',   pl: 'Ex: Pro-Kit', w: '1 1 130px' },
  { key: 'ref',        label: 'Referência',          type: 'text',   pl: 'Código',      w: '1 1 120px' },
  { key: 'taxa',       label: 'Taxa (N/mm)',         type: 'number', pl: 'Ex: 65',      w: '1 1 100px' },
  { key: 'compLivre',  label: 'Comp. livre (mm)',    type: 'number', pl: 'Ex: 250',     w: '1 1 110px' },
  { key: 'diam',       label: 'Diâmetro int. (mm)',  type: 'number', pl: 'Ex: 60',      w: '1 1 110px' },
  { key: 'preload',    label: 'Preload (mm)',         type: 'number', pl: '0',           w: '1 1 100px' },
  { key: 'tolDim',     label: 'Tolerância dimensional (mm)', type: 'number', pl: 'Ex: 0.05',  w: '1 1 120px' },
  { key: 'rigidezProj',label: 'Rigidez projetada (N/mm)',    type: 'number', pl: 'Ex: 65',    w: '1 1 130px' },
  { key: 'rigidezReal',label: 'Rigidez real (N/mm)',         type: 'number', pl: 'Ex: 63',    w: '1 1 130px' },
  { key: 'rigidezDesvio',label: 'Desvio rigidez (%)',        type: 'computed',                 w: '1 1 100px' },
];
const _BUC = [
  { key: 'marca',    label: 'Marca',           type: 'text', pl: 'Ex: SuperPro',       w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',      type: 'text', pl: 'Código',             w: '1 1 130px' },
  { key: 'material', label: 'Material',        type: 'text', pl: 'Ex: Poliuretano',    w: '1 1 150px' },
  { key: 'dureza',   label: 'Dureza (Shore)',  type: 'text', pl: 'Ex: 80A',            w: '1 1 100px' },
  { key: 'posicao',  label: 'Posição',         type: 'text', pl: 'Ex: Bandeja inferior',w: '2 1 200px' },
];
const _ROL = [
  { key: 'marca',       label: 'Marca',              type: 'text',   pl: 'Ex: SKF',  w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',         type: 'text',   pl: 'Código',   w: '1 1 150px' },
  { key: 'folgaAxial',  label: 'Folga axial (mm)',   type: 'number', pl: '0.05',     w: '1 1 110px' },
  { key: 'folgaRadial', label: 'Folga radial (mm)',  type: 'number', pl: '0.05',     w: '1 1 110px' },
];
const _BAR_DIR = [
  { key: 'marca', label: 'Marca',             type: 'text',   pl: 'Ex: TRW',  w: '1 1 130px' },
  { key: 'ref',   label: 'Referência',        type: 'text',   pl: 'Código',   w: '1 1 140px' },
  { key: 'comp',  label: 'Comprimento (mm)',  type: 'number', pl: 'Ex: 350',  w: '1 1 110px' },
];
const _BAR_ESTAB = [
  { key: 'marca',     label: 'Marca',            type: 'text',   pl: 'Ex: H&R',          w: '1 1 130px' },
  { key: 'modelo',    label: 'Modelo',           type: 'text',   pl: 'Ex: Sport',         w: '1 1 130px' },
  { key: 'diam',      label: 'Diâmetro (mm)',    type: 'number', pl: 'Ex: 22',            w: '1 1 100px' },
  { key: 'regulagem', label: 'Posição/Regulagem',type: 'text',   pl: 'Ex: Furo 2 de 3',  w: '1 1 150px' },
  { key: 'rigidezProj',label: 'Rigidez projetada (N·m/°)',   type: 'number', pl: 'Ex: 800',   w: '1 1 130px' },
  { key: 'rigidezReal',label: 'Rigidez real (N·m/°)',        type: 'number', pl: 'Ex: 780',   w: '1 1 130px' },
  { key: 'rigidezDesvio',label: 'Desvio rigidez (%)',        type: 'computed',                 w: '1 1 100px' },
];
const _COR = [
  { key: 'marca',   label: 'Marca',               type: 'text',   pl: 'Ex: Gates',  w: '1 1 130px' },
  { key: 'ref',     label: 'Referência',          type: 'text',   pl: 'Código',     w: '1 1 140px' },
  { key: 'dentes',  label: 'Nº de dentes',        type: 'number', pl: 'Ex: 128',    w: '1 1 100px' },
  { key: 'largura', label: 'Largura (mm)',         type: 'number', pl: 'Ex: 25',     w: '1 1 100px' },
  { key: 'tensao',  label: 'Tensão montagem',     type: 'text',   pl: 'Hz ou Nm',   w: '1 1 120px' },
];
const _FIL_OL = [
  { key: 'marca', label: 'Marca',        type: 'text', pl: 'Ex: Mann',        w: '1 1 130px' },
  { key: 'ref',   label: 'Referência',  type: 'text', pl: 'Ex: W 610/3',     w: '1 1 150px' },
  { key: 'rosca', label: 'Rosca',       type: 'text', pl: 'Ex: M20x1.5',     w: '1 1 120px' },
];
const _FIL_AR = [
  { key: 'marca', label: 'Marca',      type: 'text', pl: 'Ex: K&N',          w: '1 1 130px' },
  { key: 'ref',   label: 'Referência',type: 'text', pl: 'Ex: 33-2031',       w: '1 1 150px' },
  { key: 'tipo',  label: 'Tipo',       type: 'text', pl: 'Ex: Seco / Úmido', w: '1 1 130px' },
];
const _OLEO_M = [
  { key: 'marca',      label: 'Marca',              type: 'text',   pl: 'Ex: Motul',     w: '1 1 130px' },
  { key: 'modelo',     label: 'Especificação',      type: 'text',   pl: 'Ex: 300V 5W40', w: '1 1 160px' },
  { key: 'viscosidade',label: 'Viscosidade',        type: 'text',   pl: 'Ex: 5W40',      w: '1 1 100px' },
  { key: 'norma',      label: 'Norma (API/ACEA)',   type: 'text',   pl: 'Ex: API SN',    w: '1 1 130px' },
  { key: 'volume',     label: 'Volume (L)',          type: 'number', pl: 'Ex: 4.5',       w: '1 1 90px'  },
];
const _VELA = [
  { key: 'marca',       label: 'Marca',          type: 'text',   pl: 'Ex: NGK',    w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',     type: 'text',   pl: 'Ex: BKR6E', w: '1 1 140px' },
  { key: 'gap',         label: 'Gap (mm)',        type: 'number', pl: '0.8',        w: '1 1 90px'  },
  { key: 'grauTermico', label: 'Grau térmico',   type: 'number', pl: 'Ex: 6',      w: '1 1 100px' },
];
const _VALVULA = [
  { key: 'marca',    label: 'Marca',              type: 'text',   pl: 'Ex: Ferrea',    w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',         type: 'text',   pl: 'Código',        w: '1 1 140px' },
  { key: 'diam',     label: 'Diâmetro (mm)',      type: 'number', pl: 'Ex: 33',        w: '1 1 100px' },
  { key: 'material', label: 'Material',           type: 'text',   pl: 'Ex: Aço inox', w: '1 1 140px' },
  { key: 'abertura', label: 'Levantamento (mm)', type: 'number', pl: 'Ex: 10.5',      w: '1 1 120px' },
];
const _JUNTA = [
  { key: 'marca',     label: 'Marca',                  type: 'text',   pl: 'Ex: Cometic', w: '1 1 130px' },
  { key: 'ref',       label: 'Referência',             type: 'text',   pl: 'Código',      w: '1 1 140px' },
  { key: 'espessura', label: 'Espessura (mm)',          type: 'number', pl: 'Ex: 1.2',     w: '1 1 100px' },
  { key: 'furo',      label: 'Furo (mm)',               type: 'number', pl: 'Ex: 83',      w: '1 1 90px'  },
  { key: 'torque',    label: 'Torque cabeçote (Nm)',   type: 'number', pl: 'Ex: 80',      w: '1 1 130px' },
];
const _OLEO_C = [
  { key: 'marca',       label: 'Marca',        type: 'text',   pl: 'Ex: Motul',   w: '1 1 130px' },
  { key: 'viscosidade', label: 'Viscosidade',  type: 'text',   pl: 'Ex: 75W90',   w: '1 1 110px' },
  { key: 'norma',       label: 'Norma',        type: 'text',   pl: 'Ex: GL-4',    w: '1 1 110px' },
  { key: 'volume',      label: 'Volume (L)',    type: 'number', pl: 'Ex: 2.5',     w: '1 1 90px'  },
];
const _EMB = [
  { key: 'marca',  label: 'Marca',                type: 'text',   pl: 'Ex: Sachs',          w: '1 1 130px' },
  { key: 'ref',    label: 'Referência',           type: 'text',   pl: 'Código',             w: '1 1 140px' },
  { key: 'tipo',   label: 'Tipo/Composto',        type: 'text',   pl: 'Ex: Orgânica, Cerâmica', w: '1 1 160px' },
  { key: 'diam',   label: 'Diâmetro (mm)',        type: 'number', pl: 'Ex: 228',            w: '1 1 100px' },
  { key: 'carga',  label: 'Carga pressão (kgf)', type: 'number', pl: 'Ex: 600',            w: '1 1 120px' },
];
const _DISCO_EMB = [
  { key: 'marca',    label: 'Marca',        type: 'text',   pl: 'Ex: Sachs',      w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',  type: 'text',   pl: 'Código',         w: '1 1 140px' },
  { key: 'material', label: 'Material',    type: 'text',   pl: 'Ex: Orgânico',   w: '1 1 140px' },
  { key: 'diam',     label: 'Diâmetro (mm)',type: 'number', pl: 'Ex: 228',        w: '1 1 100px' },
];
const _SEMI = [
  { key: 'marca',  label: 'Marca',            type: 'text',   pl: 'Ex: OEM',                   w: '1 1 130px' },
  { key: 'ref',    label: 'Referência',       type: 'text',   pl: 'Código',                    w: '1 1 140px' },
  { key: 'comp',   label: 'Comprimento (mm)', type: 'number', pl: 'Ex: 580',                   w: '1 1 110px' },
  { key: 'juntas', label: 'Tipo de juntas',   type: 'text',   pl: 'Ex: Birfield + Tripode',    w: '2 1 200px' },
];
const _DIFF = [
  { key: 'marca',    label: 'Marca',             type: 'text',   pl: 'Ex: Quaife',          w: '1 1 130px' },
  { key: 'modelo',   label: 'Modelo',            type: 'text',   pl: 'Ex: ATB',             w: '1 1 130px' },
  { key: 'tipo',     label: 'Tipo',              type: 'text',   pl: 'Ex: Torsen, Spool',   w: '1 1 140px' },
  { key: 'precarga', label: 'Pré-carga (Nm)',    type: 'number', pl: 'Ex: 50',              w: '1 1 100px' },
  { key: 'oleo',     label: 'Óleo utilizado',    type: 'text',   pl: 'Ex: 75W90 GL-5',      w: '1 1 150px' },
];
const _PAST = [
  { key: 'marca',    label: 'Marca',                     type: 'text',   pl: 'Ex: Ferodo',         w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',                type: 'text',   pl: 'Ex: DS2500',         w: '1 1 140px' },
  { key: 'composto', label: 'Composto',                  type: 'text',   pl: 'Ex: Endurance, Rally',w: '1 1 160px' },
  { key: 'tempMin',  label: 'Temp. mín. trabalho (°C)', type: 'number', pl: 'Ex: 100',            w: '1 1 120px' },
  { key: 'tempMax',  label: 'Temp. máx. trabalho (°C)', type: 'number', pl: 'Ex: 700',            w: '1 1 120px' },
  { key: 'espNova',  label: 'Espessura nova (mm)',       type: 'number', pl: 'Ex: 14',             w: '1 1 110px' },
  { key: 'espMin',   label: 'Espessura mín. (mm)',       type: 'number', pl: 'Ex: 2',              w: '1 1 110px' },
  { key: 'atrito',        label: 'Coef. atrito (μ)',          type: 'text',   pl: 'Ex: 0.45',  w: '1 1 100px' },
  { key: 'taxaDesgaste',  label: 'Taxa de desgaste (mm/km)',  type: 'number', pl: 'Ex: 0.02',  w: '1 1 130px' },
  { key: 'espessuraAtual',label: 'Espessura atual (mm)',      type: 'number', pl: 'Ex: 10',    w: '1 1 120px' },
  { key: 'atrioLoteMin', label: 'μ lote — mín',              type: 'number', pl: 'Ex: 0.42',  w: '1 1 100px' },
  { key: 'atrioLoteMax', label: 'μ lote — máx',              type: 'number', pl: 'Ex: 0.48',  w: '1 1 100px' },
  { key: 'atrioLoteVar', label: 'Variação μ lote (%)',       type: 'computed',                 w: '1 1 110px' },
  { key: 'tolPeso',      label: 'Tolerância de peso (g)',     type: 'number', pl: 'Ex: 5',     w: '1 1 120px' },
];
const _DISCO_FR = [
  { key: 'marca',   label: 'Marca',                type: 'text',   pl: 'Ex: Brembo',             w: '1 1 130px' },
  { key: 'ref',     label: 'Referência',           type: 'text',   pl: 'Código',                 w: '1 1 140px' },
  { key: 'diam',    label: 'Diâmetro (mm)',        type: 'number', pl: 'Ex: 330',                w: '1 1 100px' },
  { key: 'tipo',    label: 'Tipo',                 type: 'text',   pl: 'Ex: Ventilado, Ranhurado',w: '1 1 160px' },
  { key: 'espNova', label: 'Espessura nova (mm)',  type: 'number', pl: 'Ex: 32',                 w: '1 1 110px' },
  { key: 'espMin',  label: 'Espessura mín. (mm)', type: 'number', pl: 'Ex: 29',                 w: '1 1 110px' },
  { key: 'peso',       label: 'Peso (g)',              type: 'number', pl: 'Ex: 8500',  w: '1 1 100px' },
  { key: 'pesoInicial',label: 'Peso inicial (g)',      type: 'number', pl: 'Ex: 8500',  w: '1 1 110px' },
  { key: 'pesoAtual',  label: 'Peso atual (g)',         type: 'number', pl: 'Ex: 8200',  w: '1 1 110px' },
  { key: 'espAtual',   label: 'Espessura atual (mm)',   type: 'number', pl: 'Ex: 30.5',  w: '1 1 120px' },
  { key: 'materialD',  label: 'Material',               type: 'text',   pl: 'Ex: Ferro fundido',w: '1 1 140px' },
  { key: 'ventilacao', label: 'Ventilação',             type: 'text',   pl: 'Ex: Ventilado',    w: '1 1 120px' },
  { key: 'furacao',    label: 'Furação',                type: 'text',   pl: 'Ex: Cross-drilled', w: '1 1 130px' },
  { key: 'tolDim',     label: 'Tolerância dimensional (mm)', type: 'number', pl: 'Ex: 0.1',   w: '1 1 120px' },
  { key: 'tolPeso',    label: 'Tolerância de peso (g)',      type: 'number', pl: 'Ex: 10',    w: '1 1 120px' },
];
const _FLUID_FR = [
  { key: 'marca',    label: 'Marca',                   type: 'text',   pl: 'Ex: Motul',    w: '1 1 130px' },
  { key: 'modelo',   label: 'Especificação',           type: 'text',   pl: 'Ex: RBF 600',  w: '1 1 150px' },
  { key: 'dot',      label: 'DOT',                     type: 'text',   pl: 'Ex: DOT 4',    w: '1 1 80px'  },
  { key: 'ebulSeco', label: 'P. ebulição seco (°C)',   type: 'number', pl: 'Ex: 312',      w: '1 1 120px' },
  { key: 'ebulUmid', label: 'P. ebulição úmido (°C)',  type: 'number', pl: 'Ex: 204',      w: '1 1 120px' },
  { key: 'viscFluido',label: 'Viscosidade (cSt)',       type: 'number', pl: 'Ex: 1.5',      w: '1 1 100px' },
  { key: 'volume',   label: 'Volume (ml)',              type: 'number', pl: 'Ex: 500',      w: '1 1 90px'  },
];
const _MANG_FR = [
  { key: 'marca',    label: 'Marca',            type: 'text',   pl: 'Ex: Goodridge',      w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',      type: 'text',   pl: 'Código',             w: '1 1 140px' },
  { key: 'material', label: 'Material',         type: 'text',   pl: 'Ex: Aço trançado',  w: '1 1 150px' },
  { key: 'comp',     label: 'Comprimento (mm)', type: 'number', pl: 'Ex: 480',            w: '1 1 110px' },
];
const _BAT = [
  { key: 'marca',      label: 'Marca',            type: 'text',   pl: 'Ex: Odyssey',     w: '1 1 130px' },
  { key: 'modelo',     label: 'Modelo',           type: 'text',   pl: 'Ex: PC925',       w: '1 1 130px' },
  { key: 'tipo',       label: 'Tipo',             type: 'text',   pl: 'Ex: AGM, Lítio',  w: '1 1 130px' },
  { key: 'capacidade', label: 'Capacidade (Ah)',  type: 'number', pl: 'Ex: 28',          w: '1 1 100px' },
  { key: 'cca',        label: 'CCA (A)',           type: 'number', pl: 'Ex: 330',         w: '1 1 90px'  },
  { key: 'tensao',     label: 'Tensão (V)',        type: 'number', pl: '12',              w: '1 1 80px'  },
];
const _BOBINA = [
  { key: 'marca',   label: 'Marca',                        type: 'text',   pl: 'Ex: Bosch', w: '1 1 130px' },
  { key: 'ref',     label: 'Referência',                   type: 'text',   pl: 'Código',    w: '1 1 140px' },
  { key: 'resPrim', label: 'Resistência primária (Ω)',     type: 'number', pl: '0.5',       w: '1 1 130px' },
  { key: 'resSec',  label: 'Resistência secundária (kΩ)', type: 'number', pl: '12',        w: '1 1 130px' },
];
const _ALTERN = [
  { key: 'marca',     label: 'Marca',                 type: 'text',   pl: 'Ex: Bosch', w: '1 1 130px' },
  { key: 'ref',       label: 'Referência',            type: 'text',   pl: 'Código',    w: '1 1 140px' },
  { key: 'corrente',  label: 'Corrente máx. (A)',     type: 'number', pl: 'Ex: 90',    w: '1 1 110px' },
  { key: 'tensaoReg', label: 'Tensão regulagem (V)', type: 'number', pl: 'Ex: 14.2',  w: '1 1 110px' },
];
const _SENSOR = [
  { key: 'marca', label: 'Marca',            type: 'text', pl: 'Ex: Bosch',          w: '1 1 130px' },
  { key: 'ref',   label: 'Referência',       type: 'text', pl: 'Código',             w: '1 1 140px' },
  { key: 'tipo',  label: 'Tipo',             type: 'text', pl: 'Ex: Analógico, Hall',w: '1 1 150px' },
  { key: 'faixa', label: 'Faixa de medição', type: 'text', pl: 'Ex: 0-300 kPa',      w: '1 1 140px' },
];
const _LAMBDA = [
  { key: 'marca', label: 'Marca',        type: 'text', pl: 'Ex: Bosch',             w: '1 1 130px' },
  { key: 'ref',   label: 'Referência',   type: 'text', pl: 'Código',                w: '1 1 140px' },
  { key: 'tipo',  label: 'Tipo',         type: 'text', pl: 'Ex: Wideband, Narrowband',w: '1 1 170px' },
  { key: 'faixa', label: 'Faixa (λ)',    type: 'text', pl: 'Ex: 0.68-1.36',         w: '1 1 130px' },
];
const _PONT = [
  { key: 'marca', label: 'Marca',             type: 'text',   pl: 'Ex: TRW',  w: '1 1 130px' },
  { key: 'ref',   label: 'Referência',        type: 'text',   pl: 'Código',   w: '1 1 140px' },
  { key: 'comp',  label: 'Comprimento (mm)',  type: 'number', pl: 'Ex: 280',  w: '1 1 110px' },
  { key: 'toe',   label: 'Toe resultante (°)',type: 'number', pl: '0.0',      w: '1 1 110px' },
];
const _SUPORTE_M = [
  { key: 'marca',    label: 'Marca',          type: 'text', pl: 'Ex: SuperPro',      w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',     type: 'text', pl: 'Código',            w: '1 1 140px' },
  { key: 'material', label: 'Material',       type: 'text', pl: 'Ex: Poliuretano',   w: '1 1 150px' },
  { key: 'dureza',   label: 'Dureza (Shore)', type: 'text', pl: 'Ex: 80A',           w: '1 1 100px' },
];
const _MOTOR_UNIT = [
  { key: 'marca',        label: 'Marca',                   type: 'text',   pl: 'Ex: Honda',        w: '1 1 130px' },
  { key: 'modelo',       label: 'Modelo',                  type: 'text',   pl: 'Ex: K20A',         w: '1 1 130px' },
  { key: 'ref',          label: 'Referência',              type: 'text',   pl: 'Código',           w: '1 1 120px' },
  { key: 'cilindrada',   label: 'Cilindrada (cc)',          type: 'number', pl: 'Ex: 2000',         w: '1 1 100px' },
  { key: 'potencia',     label: 'Potência (cv)',            type: 'number', pl: 'Ex: 220',          w: '1 1 100px' },
  { key: 'torqueMax',    label: 'Torque máx. (Nm)',         type: 'number', pl: 'Ex: 200',          w: '1 1 110px' },
  { key: 'numCilindros', label: 'Nº de cilindros',          type: 'number', pl: 'Ex: 4',            w: '1 1 100px' },
  { key: 'compressao',   label: 'Taxa de compressão',       type: 'text',   pl: 'Ex: 11.5:1',       w: '1 1 120px' },
  { key: 'vidaUtilKm',   label: 'Vida útil total (km)',     type: 'number', pl: 'Ex: 100000',       w: '1 1 130px' },
  { key: 'kmAcumulados', label: 'Km acumulados',            type: 'number', pl: 'Ex: 12000',        w: '1 1 120px' },
  { key: 'tempMaxOleo',  label: 'Temp. máx. óleo (°C)',    type: 'number', pl: 'Ex: 130',          w: '1 1 120px' },
];
const _CHASSI_STRUCT = [
  { key: 'marca',        label: 'Marca',                   type: 'text',   pl: 'Ex: OEM',          w: '1 1 130px' },
  { key: 'modelo',       label: 'Modelo',                  type: 'text',   pl: 'Ex: Tipo R',       w: '1 1 130px' },
  { key: 'ref',          label: 'Referência',              type: 'text',   pl: 'Código',           w: '1 1 120px' },
  { key: 'kmAcumulados', label: 'Km acumulados',            type: 'number', pl: 'Ex: 15000',        w: '1 1 120px' },
  { key: 'kmLimite',     label: 'Km limite',               type: 'number', pl: 'Ex: 100000',       w: '1 1 120px' },
];
const _ROL_TRANS = [
  { key: 'marca',       label: 'Marca',             type: 'text',   pl: 'Ex: SKF',   w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',        type: 'text',   pl: 'Código',   w: '1 1 150px' },
  { key: 'folgaAxial',  label: 'Folga axial (mm)',  type: 'number', pl: '0.05',     w: '1 1 110px' },
  { key: 'folgaRadial', label: 'Folga radial (mm)', type: 'number', pl: '0.05',     w: '1 1 110px' },
];
const _MANG_RAD = [
  { key: 'marca',    label: 'Marca',            type: 'text',   pl: 'Ex: Gates',          w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',       type: 'text',   pl: 'Código',             w: '1 1 140px' },
  { key: 'material', label: 'Material',         type: 'text',   pl: 'Ex: Borracha reforç',w: '1 1 150px' },
  { key: 'tempMax',  label: 'Temp. máx. (°C)',  type: 'number', pl: 'Ex: 120',            w: '1 1 110px' },
];

/* ─── Suspensão — componentes adicionais ────────────────────────────── */
const _PUSH_PULL = [
  { key: 'marca',    label: 'Marca',             type: 'text',   pl: 'Ex: OEM',           w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',        type: 'text',   pl: 'Código',            w: '1 1 140px' },
  { key: 'tipo',     label: 'Tipo',              type: 'text',   pl: 'Ex: Push rod',      w: '1 1 120px' },
  { key: 'angulo',   label: 'Ângulo (°)',         type: 'number', pl: 'Ex: 45',            w: '1 1 100px' },
  { key: 'comp',     label: 'Comprimento (mm)',  type: 'number', pl: 'Ex: 380',           w: '1 1 110px' },
  { key: 'material', label: 'Material',          type: 'text',   pl: 'Ex: Aço 4130',      w: '1 1 130px' },
  { key: 'rigidez',  label: 'Rigidez (N/mm)',    type: 'number', pl: 'Ex: 50000',         w: '1 1 110px' },
];
const _ROCKER = [
  { key: 'marca',       label: 'Marca',             type: 'text',   pl: 'Ex: OEM',        w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',        type: 'text',   pl: 'Código',         w: '1 1 140px' },
  { key: 'motionRatio', label: 'Motion ratio',      type: 'number', pl: 'Ex: 0.85',       w: '1 1 100px' },
  { key: 'peso',        label: 'Peso (g)',           type: 'number', pl: 'Ex: 450',        w: '1 1 100px' },
  { key: 'geometria',   label: 'Geometria',         type: 'text',   pl: 'Ex: L-shape',    w: '1 1 130px' },
];
const _BUMP_STOP = [
  { key: 'marca',       label: 'Marca',                  type: 'text',   pl: 'Ex: Ohlins',       w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',             type: 'text',   pl: 'Código',           w: '1 1 140px' },
  { key: 'taxa',        label: 'Taxa progressiva (N/mm)',type: 'number', pl: 'Ex: 200',          w: '1 1 130px' },
  { key: 'altAtiv',     label: 'Altura acionamento (mm)',type: 'number', pl: 'Ex: 25',           w: '1 1 130px' },
  { key: 'material',    label: 'Material',               type: 'text',   pl: 'Ex: Poliuretano',  w: '1 1 130px' },
];
const _A_ARM = [
  { key: 'marca',    label: 'Marca',             type: 'text',   pl: 'Ex: OEM',           w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',        type: 'text',   pl: 'Código',            w: '1 1 140px' },
  { key: 'comp',     label: 'Comprimento (mm)',  type: 'number', pl: 'Ex: 350',           w: '1 1 110px' },
  { key: 'angulo',   label: 'Ângulo (°)',         type: 'number', pl: 'Ex: 12',            w: '1 1 100px' },
  { key: 'material', label: 'Material',          type: 'text',   pl: 'Ex: Aço CrMo',     w: '1 1 130px' },
];
const _HUB = [
  { key: 'marca',    label: 'Marca',           type: 'text',   pl: 'Ex: OEM',         w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',      type: 'text',   pl: 'Código',          w: '1 1 140px' },
  { key: 'rigidez',  label: 'Rigidez (N/mm)',  type: 'number', pl: 'Ex: 80000',       w: '1 1 110px' },
  { key: 'peso',     label: 'Peso (g)',         type: 'number', pl: 'Ex: 3500',        w: '1 1 100px' },
  { key: 'rolamento',label: 'Tipo rolamento',  type: 'text',   pl: 'Ex: Cônico duplo',w: '1 1 140px' },
];

/* ─── Freio — componentes adicionais ───────────────────────────────── */
const _CALIPER = [
  { key: 'marca',     label: 'Marca',                type: 'text',   pl: 'Ex: Brembo',         w: '1 1 130px' },
  { key: 'ref',       label: 'Referência',           type: 'text',   pl: 'Código',             w: '1 1 140px' },
  { key: 'pistoes',   label: 'Nº de pistões',        type: 'number', pl: 'Ex: 4',              w: '1 1 100px' },
  { key: 'material',  label: 'Material',             type: 'text',   pl: 'Ex: Alumínio',       w: '1 1 130px' },
  { key: 'rigidez',   label: 'Rigidez (N/mm)',       type: 'number', pl: 'Ex: 15000',          w: '1 1 110px' },
  { key: 'posicao',   label: 'Posicionamento',       type: 'text',   pl: 'Ex: Radial',         w: '1 1 130px' },
];
const _DUTO_FR = [
  { key: 'marca',    label: 'Marca',                  type: 'text',   pl: 'Ex: OEM',            w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',             type: 'text',   pl: 'Código',             w: '1 1 140px' },
  { key: 'diam',     label: 'Diâmetro (mm)',          type: 'number', pl: 'Ex: 63',             w: '1 1 100px' },
  { key: 'comp',     label: 'Comprimento (mm)',       type: 'number', pl: 'Ex: 400',            w: '1 1 110px' },
  { key: 'posicao',  label: 'Posição',                type: 'text',   pl: 'Ex: Interna',        w: '1 1 120px' },
  { key: 'tipoEntr', label: 'Tipo de entrada de ar', type: 'text',   pl: 'Ex: NACA duct',      w: '1 1 140px' },
];
const _MASTER_CYL = [
  { key: 'marca',     label: 'Marca',                type: 'text',   pl: 'Ex: Tilton',     w: '1 1 130px' },
  { key: 'ref',       label: 'Referência',           type: 'text',   pl: 'Código',         w: '1 1 140px' },
  { key: 'diamCil',   label: 'Diâmetro cilindro (mm)',type: 'number', pl: 'Ex: 19.05',     w: '1 1 130px' },
  { key: 'relPedal',  label: 'Relação de pedal',     type: 'number', pl: 'Ex: 5.5',        w: '1 1 110px' },
];

/* ─── Aerodinâmica ─────────────────────────────────────────────────── */
const _ASA_DIANT = [
  { key: 'marca',       label: 'Marca',               type: 'text',   pl: 'Ex: OEM',           w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',          type: 'text',   pl: 'Código',            w: '1 1 140px' },
  { key: 'anguloAtaq',  label: 'Ângulo de ataque (°)', type: 'number', pl: 'Ex: 12',            w: '1 1 110px' },
  { key: 'numElementos',label: 'Nº de elementos',     type: 'number', pl: 'Ex: 3',             w: '1 1 100px' },
  { key: 'envergadura', label: 'Envergadura (mm)',     type: 'number', pl: 'Ex: 1800',          w: '1 1 110px' },
  { key: 'corda',       label: 'Corda (mm)',           type: 'number', pl: 'Ex: 300',           w: '1 1 100px' },
  { key: 'endplates',   label: 'Endplates',           type: 'text',   pl: 'Ex: Sim, carbono',  w: '1 1 130px' },
  { key: 'gurneyFlap',  label: 'Gurney flap (mm)',    type: 'number', pl: 'Ex: 10',            w: '1 1 100px' },
];
const _ASA_TRAS = [
  { key: 'marca',       label: 'Marca',                type: 'text',   pl: 'Ex: OEM',           w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',           type: 'text',   pl: 'Código',            w: '1 1 140px' },
  { key: 'anguloAtaq',  label: 'Ângulo (°)',            type: 'number', pl: 'Ex: 8',             w: '1 1 100px' },
  { key: 'drs',         label: 'DRS',                  type: 'text',   pl: 'Ex: Sim / Não',     w: '1 1 100px' },
  { key: 'altura',      label: 'Altura (mm)',           type: 'number', pl: 'Ex: 950',           w: '1 1 100px' },
  { key: 'envergadura', label: 'Envergadura (mm)',      type: 'number', pl: 'Ex: 1000',          w: '1 1 110px' },
  { key: 'numPlanos',   label: 'Nº de planos',          type: 'number', pl: 'Ex: 2',             w: '1 1 100px' },
  { key: 'endplates',   label: 'Endplates',            type: 'text',   pl: 'Ex: Sim',           w: '1 1 100px' },
];
const _FUNDO_DIFF = [
  { key: 'marca',       label: 'Marca',                    type: 'text',   pl: 'Ex: OEM',     w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',               type: 'text',   pl: 'Código',      w: '1 1 140px' },
  { key: 'comp',        label: 'Comprimento (mm)',         type: 'number', pl: 'Ex: 2200',    w: '1 1 110px' },
  { key: 'angSaida',    label: 'Ângulo de saída (°)',       type: 'number', pl: 'Ex: 7',       w: '1 1 100px' },
  { key: 'rideH',       label: 'Ride height ref. (mm)',    type: 'number', pl: 'Ex: 30',      w: '1 1 110px' },
  { key: 'numCanais',   label: 'Nº de canais',             type: 'number', pl: 'Ex: 5',       w: '1 1 100px' },
];
const _BARGEBOARD = [
  { key: 'marca',       label: 'Marca',                 type: 'text',   pl: 'Ex: OEM',        w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',            type: 'text',   pl: 'Código',         w: '1 1 140px' },
  { key: 'posicao',     label: 'Posição',               type: 'text',   pl: 'Ex: Lateral',    w: '1 1 130px' },
  { key: 'numPlanos',   label: 'Nº de planos',           type: 'number', pl: 'Ex: 3',          w: '1 1 100px' },
  { key: 'interacao',   label: 'Interação com fluxo',   type: 'text',   pl: 'Ex: Vortex dir.',w: '1 1 150px' },
];
const _BODYWORK = [
  { key: 'marca',       label: 'Marca',                    type: 'text',   pl: 'Ex: OEM',           w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',               type: 'text',   pl: 'Código',            w: '1 1 140px' },
  { key: 'curvatura',   label: 'Curvatura',                type: 'text',   pl: 'Ex: Alta convex.',  w: '1 1 130px' },
  { key: 'furosExtr',   label: 'Furos de extração calor', type: 'text',   pl: 'Ex: 4 x 60mm',     w: '1 1 140px' },
  { key: 'perfilLat',   label: 'Perfil lateral',           type: 'text',   pl: 'Ex: Undercut',      w: '1 1 130px' },
];
const _SIDEPOD = [
  { key: 'marca',       label: 'Marca',                    type: 'text',   pl: 'Ex: OEM',        w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',               type: 'text',   pl: 'Código',         w: '1 1 140px' },
  { key: 'areaEntrada', label: 'Área de entrada (cm²)',    type: 'number', pl: 'Ex: 800',        w: '1 1 120px' },
  { key: 'angIncl',     label: 'Ângulo inclinação (°)',     type: 'number', pl: 'Ex: 15',         w: '1 1 110px' },
  { key: 'saidaCalor',  label: 'Saída de calor',           type: 'text',   pl: 'Ex: Louvers',    w: '1 1 130px' },
];
const _ESPELHO = [
  { key: 'marca',    label: 'Marca',                    type: 'text',   pl: 'Ex: OEM',        w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',               type: 'text',   pl: 'Código',         w: '1 1 140px' },
  { key: 'area',     label: 'Área (cm²)',               type: 'number', pl: 'Ex: 120',        w: '1 1 100px' },
  { key: 'posicao',  label: 'Posição',                  type: 'text',   pl: 'Ex: Porta',      w: '1 1 120px' },
  { key: 'impacto',  label: 'Impacto fluxo lateral',   type: 'text',   pl: 'Ex: Baixo',      w: '1 1 140px' },
];
const _VORTEX_GEN = [
  { key: 'marca',    label: 'Marca',          type: 'text',   pl: 'Ex: OEM',   w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',     type: 'text',   pl: 'Código',    w: '1 1 140px' },
  { key: 'numero',   label: 'Número',         type: 'number', pl: 'Ex: 12',    w: '1 1 80px'  },
  { key: 'posicao',  label: 'Posição',        type: 'text',   pl: 'Ex: Teto',  w: '1 1 120px' },
  { key: 'altura',   label: 'Altura (mm)',     type: 'number', pl: 'Ex: 8',     w: '1 1 100px' },
  { key: 'angulo',   label: 'Ângulo (°)',      type: 'number', pl: 'Ex: 15',    w: '1 1 100px' },
];
const _WINGLET = [
  { key: 'marca',    label: 'Marca',            type: 'text',   pl: 'Ex: OEM',            w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',       type: 'text',   pl: 'Código',             w: '1 1 140px' },
  { key: 'geometria',label: 'Geometria',        type: 'text',   pl: 'Ex: Delta',          w: '1 1 130px' },
  { key: 'posicao',  label: 'Posição',          type: 'text',   pl: 'Ex: Dianteiro lat.', w: '1 1 140px' },
  { key: 'interacao',label: 'Interação c/ asa', type: 'text',   pl: 'Ex: Downwash',       w: '1 1 140px' },
];

/* ─── Sistemas Térmicos ────────────────────────────────────────────── */
const _RAD_AGUA = [
  { key: 'marca',       label: 'Marca',                type: 'text',   pl: 'Ex: Mishimoto',    w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',           type: 'text',   pl: 'Código',           w: '1 1 140px' },
  { key: 'tamanho',     label: 'Tamanho (m²)',         type: 'number', pl: 'Ex: 0.35',         w: '1 1 100px' },
  { key: 'posicao',     label: 'Posição',              type: 'text',   pl: 'Ex: Frontal',      w: '1 1 120px' },
  { key: 'fluxoAr',     label: 'Fluxo de ar (m³/s)',   type: 'number', pl: 'Ex: 0.8',          w: '1 1 110px' },
  { key: 'eficiencia',  label: 'Eficiência térmica (%)',type: 'number', pl: 'Ex: 85',           w: '1 1 120px' },
];
const _RAD_OLEO = [
  { key: 'marca',      label: 'Marca',                type: 'text',   pl: 'Ex: Setrab',    w: '1 1 130px' },
  { key: 'ref',        label: 'Referência',           type: 'text',   pl: 'Código',        w: '1 1 140px' },
  { key: 'tempAlvo',   label: 'Temp. alvo (°C)',      type: 'number', pl: 'Ex: 100',       w: '1 1 110px' },
  { key: 'tamanho',    label: 'Tamanho (linhas)',     type: 'text',   pl: 'Ex: 19 linhas', w: '1 1 110px' },
  { key: 'posicao',    label: 'Posição',              type: 'text',   pl: 'Ex: Frontal',   w: '1 1 120px' },
  { key: 'bypass',     label: 'Bypass térmico',       type: 'text',   pl: 'Ex: 80°C',      w: '1 1 110px' },
];
const _INTERCOOLER = [
  { key: 'marca',       label: 'Marca',                    type: 'text',   pl: 'Ex: Garrett',    w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',               type: 'text',   pl: 'Código',         w: '1 1 140px' },
  { key: 'eficiencia',  label: 'Eficiência (%)',           type: 'number', pl: 'Ex: 92',         w: '1 1 100px' },
  { key: 'deltaP',      label: 'Queda de pressão (kPa)',   type: 'number', pl: 'Ex: 3',          w: '1 1 120px' },
  { key: 'posicao',     label: 'Posição',                  type: 'text',   pl: 'Ex: TMIC',       w: '1 1 120px' },
];
const _DUTO_RESF_FR = [
  { key: 'marca',    label: 'Marca',                  type: 'text',   pl: 'Ex: OEM',         w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',             type: 'text',   pl: 'Código',          w: '1 1 140px' },
  { key: 'vazao',    label: 'Vazão (m³/s)',            type: 'number', pl: 'Ex: 0.1',         w: '1 1 100px' },
  { key: 'tempAlvo', label: 'Temp. alvo disco (°C)',  type: 'number', pl: 'Ex: 600',         w: '1 1 120px' },
];
const _RESF_ELET = [
  { key: 'marca',      label: 'Marca',                 type: 'text',   pl: 'Ex: OEM',        w: '1 1 130px' },
  { key: 'ref',        label: 'Referência',            type: 'text',   pl: 'Código',         w: '1 1 140px' },
  { key: 'componente', label: 'Componente protegido', type: 'text',   pl: 'Ex: ECU',        w: '1 1 130px' },
  { key: 'tempMax',    label: 'Temp. máx. (°C)',       type: 'number', pl: 'Ex: 85',         w: '1 1 100px' },
];
const _VENT_COCKPIT = [
  { key: 'marca',    label: 'Marca',                  type: 'text',   pl: 'Ex: Cool Suit',  w: '1 1 130px' },
  { key: 'ref',      label: 'Referência',             type: 'text',   pl: 'Código',         w: '1 1 140px' },
  { key: 'tempInt',  label: 'Temp. interna alvo (°C)',type: 'number', pl: 'Ex: 35',         w: '1 1 120px' },
  { key: 'ventilacao',label: 'Tipo ventilação',       type: 'text',   pl: 'Ex: Forçada',    w: '1 1 130px' },
];
const _ISOL_ESCAPE = [
  { key: 'marca',       label: 'Marca',                  type: 'text',   pl: 'Ex: DEI',          w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',             type: 'text',   pl: 'Código',           w: '1 1 140px' },
  { key: 'tipoIsol',    label: 'Tipo isolamento',        type: 'text',   pl: 'Ex: Wrap cerâmico',w: '1 1 140px' },
  { key: 'compProteg',  label: 'Componentes protegidos', type: 'text',   pl: 'Ex: Assoalho',     w: '1 1 150px' },
];

/* ─── Híbrido / ERS ────────────────────────────────────────────────── */
const _MGU_K = [
  { key: 'marca',       label: 'Marca',                type: 'text',   pl: 'Ex: Mercedes HPP',  w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',           type: 'text',   pl: 'Código',            w: '1 1 140px' },
  { key: 'potencia',    label: 'Potência (kW)',         type: 'number', pl: 'Ex: 120',           w: '1 1 100px' },
  { key: 'torque',      label: 'Torque (Nm)',           type: 'number', pl: 'Ex: 200',           w: '1 1 100px' },
  { key: 'rpm',         label: 'Rotação máx. (RPM)',    type: 'number', pl: 'Ex: 50000',         w: '1 1 110px' },
  { key: 'peso',        label: 'Peso (kg)',              type: 'number', pl: 'Ex: 7',             w: '1 1 80px'  },
  { key: 'posicao',     label: 'Posição no chassi',     type: 'text',   pl: 'Ex: Eixo traseiro', w: '1 1 140px' },
  { key: 'eficiencia',  label: 'Eficiência (%)',        type: 'number', pl: 'Ex: 95',            w: '1 1 100px' },
];
const _MGU_H = [
  { key: 'marca',       label: 'Marca',                type: 'text',   pl: 'Ex: Mercedes HPP',  w: '1 1 130px' },
  { key: 'ref',         label: 'Referência',           type: 'text',   pl: 'Código',            w: '1 1 140px' },
  { key: 'potencia',    label: 'Potência (kW)',         type: 'number', pl: 'Ex: 80',            w: '1 1 100px' },
  { key: 'rpm',         label: 'Rotação máx. (RPM)',    type: 'number', pl: 'Ex: 125000',        w: '1 1 110px' },
  { key: 'peso',        label: 'Peso (kg)',              type: 'number', pl: 'Ex: 4',             w: '1 1 80px'  },
  { key: 'posicao',     label: 'Posição no chassi',     type: 'text',   pl: 'Ex: Turbo',         w: '1 1 130px' },
  { key: 'eficiencia',  label: 'Eficiência (%)',        type: 'number', pl: 'Ex: 90',            w: '1 1 100px' },
];
const _ERS_BATTERY = [
  { key: 'marca',       label: 'Marca',                    type: 'text',   pl: 'Ex: McLaren Applied', w: '1 1 150px' },
  { key: 'ref',         label: 'Referência',               type: 'text',   pl: 'Código',              w: '1 1 140px' },
  { key: 'capacidadeMJ',label: 'Capacidade (MJ)',          type: 'number', pl: 'Ex: 4',               w: '1 1 100px' },
  { key: 'capacidadeKWh',label: 'Capacidade (kWh)',        type: 'number', pl: 'Ex: 1.1',             w: '1 1 100px' },
  { key: 'tensaoNom',   label: 'Tensão nominal (V)',       type: 'number', pl: 'Ex: 800',             w: '1 1 110px' },
  { key: 'tempMin',     label: 'Temp. mín. operação (°C)', type: 'number', pl: 'Ex: 20',              w: '1 1 130px' },
  { key: 'tempMax',     label: 'Temp. máx. operação (°C)', type: 'number', pl: 'Ex: 60',              w: '1 1 130px' },
  { key: 'peso',        label: 'Peso (kg)',                  type: 'number', pl: 'Ex: 25',              w: '1 1 80px'  },
  { key: 'posicao',     label: 'Posição no chassi',         type: 'text',   pl: 'Ex: Sob o assento',   w: '1 1 150px' },
  { key: 'roundTrip',   label: 'Eficiência round-trip (%)',type: 'number', pl: 'Ex: 92',              w: '1 1 130px' },
];

// Campos base para peças sem template específico
export const BASE_SPEC_FIELDS = [
  { key: 'marca',  label: 'Marca',  type: 'text', pl: 'Fabricante/Marca',  w: '1 1 140px' },
  { key: 'modelo', label: 'Modelo', type: 'text', pl: 'Modelo/Referência', w: '2 1 200px' },
];

/* ─── Todos os campos únicos de especificação (para criação de templates) ── */
const ALL_SPEC_FIELDS_FLAT = (() => {
  const seen = new Set();
  const result = [];
  for (const arr of [
    _AMO, _MOL, _BUC, _ROL, _BAR_DIR, _BAR_ESTAB, _COR,
    _FIL_OL, _FIL_AR, _OLEO_M, _VELA, _VALVULA, _JUNTA,
    _OLEO_C, _EMB, _DISCO_EMB, _SEMI, _DIFF, _PAST, _DISCO_FR,
    _FLUID_FR, _MANG_FR, _BAT, _BOBINA, _ALTERN, _SENSOR,
    _LAMBDA, _PONT, _SUPORTE_M, _MOTOR_UNIT, _CHASSI_STRUCT,
    _ROL_TRANS, _MANG_RAD,
    // Suspensão adicionais
    _PUSH_PULL, _ROCKER, _BUMP_STOP, _A_ARM, _HUB,
    // Freio adicionais
    _CALIPER, _DUTO_FR, _MASTER_CYL,
    // Aerodinâmica
    _ASA_DIANT, _ASA_TRAS, _FUNDO_DIFF, _BARGEBOARD, _BODYWORK,
    _SIDEPOD, _ESPELHO, _VORTEX_GEN, _WINGLET,
    // Térmico
    _RAD_AGUA, _RAD_OLEO, _INTERCOOLER, _DUTO_RESF_FR,
    _RESF_ELET, _VENT_COCKPIT, _ISOL_ESCAPE,
    // Híbrido / ERS
    _MGU_K, _MGU_H, _ERS_BATTERY,
  ]) {
    for (const f of arr) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        result.push({ key: f.key, label: f.label, type: f.type || 'text' });
      }
    }
  }
  return result;
})();

const CUSTOM_TEMPLATES_KEY = 'rt_custom_templates';
const PART_PRICES_KEY = (id) => `rt_part_prices_${id || 'global'}`;

export const PART_SPEC_FIELDS = {
  // Suspensão
  'Amortecedor Dianteiro Esq':   _AMO,
  'Amortecedor Dianteiro Dir':   _AMO,
  'Amortecedor Traseiro Esq':    _AMO,
  'Amortecedor Traseiro Dir':    _AMO,
  'Mola Dianteira Esq':          _MOL,
  'Mola Dianteira Dir':          _MOL,
  'Bucha de Bandeja':            _BUC,
  'Rolamento de Roda':           _ROL,
  'Barra de Direção':            _BAR_DIR,
  // Motor
  'Correia Dentada':             _COR,
  'Filtro de Óleo':              _FIL_OL,
  'Filtro de Ar':                _FIL_AR,
  'Óleo do Motor':               _OLEO_M,
  'Vela de Ignição':             _VELA,
  'Válvula de Admissão':         _VALVULA,
  'Válvula de Escape':           _VALVULA,
  'Junta de Cabeçote':           _JUNTA,
  // Transmissão
  'Óleo de Câmbio':              _OLEO_C,
  'Embreagem':                   _EMB,
  'Disco de Embreagem':          _DISCO_EMB,
  'Semi-eixo Esq':               _SEMI,
  'Semi-eixo Dir':               _SEMI,
  'Diferencial':                 _DIFF,
  // Freio
  'Pastilha Dianteira':          _PAST,
  'Pastilha Traseira':           _PAST,
  'Disco Dianteiro Esq':         _DISCO_FR,
  'Disco Dianteiro Dir':         _DISCO_FR,
  'Disco Traseiro Esq':          _DISCO_FR,
  'Disco Traseiro Dir':          _DISCO_FR,
  'Fluido de Freio':             _FLUID_FR,
  'Mangueira de Freio':          _MANG_FR,
  // Elétrica
  'Bateria':                     _BAT,
  'Bobina de Ignição':           _BOBINA,
  'Alternador':                  _ALTERN,
  'Sensor MAP':                  _SENSOR,
  'Sensor TPS':                  _SENSOR,
  'Sensor Lambda':               _LAMBDA,
  // Motor — unidade do motor
  'Motor':                       _MOTOR_UNIT,
  // Chassi
  'Ponteira de Direção Esq':     _PONT,
  'Ponteira de Direção Dir':     _PONT,
  'Barra Estabilizadora Diant':  _BAR_ESTAB,
  'Barra Estabilizadora Tras':   _BAR_ESTAB,
  'Suporte de Motor':            _SUPORTE_M,
  'Estrutura do Chassi':         _CHASSI_STRUCT,
  // Transmissão — adicionais
  'Rolamento de Transmissão':    _ROL_TRANS,
  // Motor — radiador
  'Mangueira do Radiador':       _MANG_RAD,
  // Suspensão — adicionais
  'Push Rod Dianteiro':          _PUSH_PULL,
  'Push Rod Traseiro':           _PUSH_PULL,
  'Pull Rod Dianteiro':          _PUSH_PULL,
  'Pull Rod Traseiro':           _PUSH_PULL,
  'Rocker Dianteiro':            _ROCKER,
  'Rocker Traseiro':             _ROCKER,
  'Bump Stop Dianteiro':         _BUMP_STOP,
  'Bump Stop Traseiro':          _BUMP_STOP,
  'Triângulo Superior Diant':    _A_ARM,
  'Triângulo Inferior Diant':    _A_ARM,
  'Triângulo Superior Tras':     _A_ARM,
  'Triângulo Inferior Tras':     _A_ARM,
  'Manga de Eixo Dianteira':     _HUB,
  'Manga de Eixo Traseira':      _HUB,
  // Freio — adicionais
  'Pinça Dianteira':             _CALIPER,
  'Pinça Traseira':              _CALIPER,
  'Duto Resfriamento Freio Diant': _DUTO_FR,
  'Duto Resfriamento Freio Tras':  _DUTO_FR,
  'Master Cylinder':             _MASTER_CYL,
  // Aerodinâmica
  'Asa Dianteira':               _ASA_DIANT,
  'Asa Traseira':                _ASA_TRAS,
  'Fundo Plano / Diffuser':     _FUNDO_DIFF,
  'Bargeboard Esq':              _BARGEBOARD,
  'Bargeboard Dir':              _BARGEBOARD,
  'Capô / Bodywork':             _BODYWORK,
  'Side Pod Esq':                _SIDEPOD,
  'Side Pod Dir':                _SIDEPOD,
  'Espelho Esq':                 _ESPELHO,
  'Espelho Dir':                 _ESPELHO,
  'Vortex Generators':           _VORTEX_GEN,
  'Winglet / Canard Esq':       _WINGLET,
  'Winglet / Canard Dir':        _WINGLET,
  // Sistemas Térmicos
  'Radiador de Água':            _RAD_AGUA,
  'Radiador de Óleo':            _RAD_OLEO,
  'Intercooler':                 _INTERCOOLER,
  'Duto Resf. Freio Dianteiro':  _DUTO_RESF_FR,
  'Duto Resf. Freio Traseiro':   _DUTO_RESF_FR,
  'Resfriamento ECU':            _RESF_ELET,
  'Resfriamento Inversor':       _RESF_ELET,
  'Resfriamento Bateria':        _RESF_ELET,
  'Ventilação Cockpit':          _VENT_COCKPIT,
  'Isolamento Térmico Escape':   _ISOL_ESCAPE,
  // Híbrido / ERS
  'MGU-K':                       _MGU_K,
  'MGU-H':                       _MGU_H,
  'Energy Store / Bateria ERS':  _ERS_BATTERY,
};

/* ─── Templates de peças por categoria ──────────────────────────────────── */
const PART_TEMPLATES = {
  'suspensão': [
    { name: 'Amortecedor Dianteiro Esq',  kmLimit: 3000,  obs: '' },
    { name: 'Amortecedor Dianteiro Dir',  kmLimit: 3000,  obs: '' },
    { name: 'Amortecedor Traseiro Esq',   kmLimit: 3000,  obs: '' },
    { name: 'Amortecedor Traseiro Dir',   kmLimit: 3000,  obs: '' },
    { name: 'Mola Dianteira Esq',         kmLimit: 10000, obs: '' },
    { name: 'Mola Dianteira Dir',         kmLimit: 10000, obs: '' },
    { name: 'Bucha de Bandeja',           kmLimit: 5000,  obs: '' },
    { name: 'Rolamento de Roda',          kmLimit: 8000,  obs: '' },
    { name: 'Barra de Direção',           kmLimit: 15000, obs: '' },
    { name: 'Push Rod Dianteiro',         kmLimit: 20000, obs: '' },
    { name: 'Push Rod Traseiro',          kmLimit: 20000, obs: '' },
    { name: 'Rocker Dianteiro',           kmLimit: 30000, obs: '' },
    { name: 'Rocker Traseiro',            kmLimit: 30000, obs: '' },
    { name: 'Bump Stop Dianteiro',        kmLimit: 5000,  obs: '' },
    { name: 'Bump Stop Traseiro',         kmLimit: 5000,  obs: '' },
    { name: 'Triângulo Superior Diant',   kmLimit: 30000, obs: '' },
    { name: 'Triângulo Inferior Diant',   kmLimit: 30000, obs: '' },
    { name: 'Triângulo Superior Tras',    kmLimit: 30000, obs: '' },
    { name: 'Triângulo Inferior Tras',    kmLimit: 30000, obs: '' },
    { name: 'Manga de Eixo Dianteira',    kmLimit: 50000, obs: '' },
    { name: 'Manga de Eixo Traseira',     kmLimit: 50000, obs: '' },
  ],
  'motor': [
    { name: 'Motor',              kmLimit: 100000, obs: '' },
    { name: 'Correia Dentada',    kmLimit: 5000,   obs: '' },
    { name: 'Filtro de Óleo',     kmLimit: 1000,   obs: '' },
    { name: 'Filtro de Ar',       kmLimit: 3000,   obs: '' },
    { name: 'Óleo do Motor',      kmLimit: 1000,   obs: '' },
    { name: 'Vela de Ignição',    kmLimit: 3000,   obs: '' },
    { name: 'Válvula de Admissão',kmLimit: 10000,  obs: '' },
    { name: 'Válvula de Escape',  kmLimit: 10000,  obs: '' },
    { name: 'Junta de Cabeçote',  kmLimit: 20000,  obs: '' },
    { name: 'Mangueira do Radiador', kmLimit: 30000, obs: '' },
  ],
  'transmissão': [
    { name: 'Óleo de Câmbio',           kmLimit: 2000,  obs: '' },
    { name: 'Embreagem',                kmLimit: 5000,  obs: '' },
    { name: 'Disco de Embreagem',       kmLimit: 5000,  obs: '' },
    { name: 'Semi-eixo Esq',            kmLimit: 10000, obs: '' },
    { name: 'Semi-eixo Dir',            kmLimit: 10000, obs: '' },
    { name: 'Diferencial',              kmLimit: 15000, obs: '' },
    { name: 'Rolamento de Transmissão', kmLimit: 20000, obs: '' },
  ],
  'freio': [
    { name: 'Pastilha Dianteira',  kmLimit: 500,   obs: 'Verificar espessura mínima' },
    { name: 'Pastilha Traseira',   kmLimit: 800,   obs: 'Verificar espessura mínima' },
    { name: 'Disco Dianteiro Esq', kmLimit: 3000,  obs: '' },
    { name: 'Disco Dianteiro Dir', kmLimit: 3000,  obs: '' },
    { name: 'Disco Traseiro Esq',  kmLimit: 5000,  obs: '' },
    { name: 'Disco Traseiro Dir',  kmLimit: 5000,  obs: '' },
    { name: 'Fluido de Freio',     kmLimit: 2000,  obs: 'Trocar após uso intenso em pista' },
    { name: 'Mangueira de Freio',  kmLimit: 10000, obs: '' },
    { name: 'Pinça Dianteira',            kmLimit: 30000, obs: '' },
    { name: 'Pinça Traseira',             kmLimit: 30000, obs: '' },
    { name: 'Duto Resfriamento Freio Diant', kmLimit: 15000, obs: '' },
    { name: 'Duto Resfriamento Freio Tras',  kmLimit: 15000, obs: '' },
    { name: 'Master Cylinder',            kmLimit: 30000, obs: '' },
  ],
  'elétrica': [
    { name: 'Bateria',         kmLimit: 20000, obs: '' },
    { name: 'Bobina de Ignição',kmLimit: 10000, obs: '' },
    { name: 'Alternador',      kmLimit: 30000, obs: '' },
    { name: 'Sensor MAP',      kmLimit: 15000, obs: '' },
    { name: 'Sensor TPS',      kmLimit: 15000, obs: '' },
    { name: 'Sensor Lambda',   kmLimit: 15000, obs: '' },
  ],
  'chassi': [
    { name: 'Estrutura do Chassi',       kmLimit: 100000, obs: '' },
    { name: 'Ponteira de Direção Esq',   kmLimit: 8000,   obs: '' },
    { name: 'Ponteira de Direção Dir',   kmLimit: 8000,   obs: '' },
    { name: 'Barra Estabilizadora Diant',kmLimit: 20000,  obs: '' },
    { name: 'Barra Estabilizadora Tras', kmLimit: 20000,  obs: '' },
    { name: 'Suporte de Motor',          kmLimit: 30000,  obs: '' },
  ],
  'aerodinâmica': [
    { name: 'Asa Dianteira',           kmLimit: 50000, obs: '' },
    { name: 'Asa Traseira',            kmLimit: 50000, obs: '' },
    { name: 'Fundo Plano / Diffuser',  kmLimit: 50000, obs: '' },
    { name: 'Bargeboard Esq',          kmLimit: 50000, obs: '' },
    { name: 'Bargeboard Dir',          kmLimit: 50000, obs: '' },
    { name: 'Capô / Bodywork',         kmLimit: 50000, obs: '' },
    { name: 'Side Pod Esq',            kmLimit: 50000, obs: '' },
    { name: 'Side Pod Dir',            kmLimit: 50000, obs: '' },
    { name: 'Espelho Esq',             kmLimit: 50000, obs: '' },
    { name: 'Espelho Dir',             kmLimit: 50000, obs: '' },
    { name: 'Vortex Generators',       kmLimit: 50000, obs: '' },
    { name: 'Winglet / Canard Esq',    kmLimit: 50000, obs: '' },
    { name: 'Winglet / Canard Dir',    kmLimit: 50000, obs: '' },
  ],
  'térmico': [
    { name: 'Radiador de Água',          kmLimit: 30000, obs: '' },
    { name: 'Radiador de Óleo',          kmLimit: 30000, obs: '' },
    { name: 'Intercooler',               kmLimit: 50000, obs: '' },
    { name: 'Duto Resf. Freio Dianteiro',kmLimit: 15000, obs: '' },
    { name: 'Duto Resf. Freio Traseiro', kmLimit: 15000, obs: '' },
    { name: 'Resfriamento ECU',          kmLimit: 50000, obs: '' },
    { name: 'Resfriamento Inversor',     kmLimit: 50000, obs: '' },
    { name: 'Resfriamento Bateria',      kmLimit: 50000, obs: '' },
    { name: 'Ventilação Cockpit',        kmLimit: 50000, obs: '' },
    { name: 'Isolamento Térmico Escape', kmLimit: 10000, obs: '' },
  ],
  'híbrido': [
    { name: 'MGU-K',                     kmLimit: 10000, obs: '' },
    { name: 'MGU-H',                     kmLimit: 10000, obs: '' },
    { name: 'Energy Store / Bateria ERS',kmLimit: 5000,  obs: 'Monitorar SoC e temperatura' },
  ],
  'outro': [],
};

/* ─── Card de categoria com lista de peças ──────────────────────────────── */
function CategoryBox({
  categoryKey, icon, label,
  parts,
  activeProfileId,
  onEditPart, onDeletePart, onAddEntry, onDeleteEntry,
  isCustom, onDeleteCategory,
  headerContent,
  partStatus, usedHistory, onSetPartStatus, onDoReplace, onUpdateUsed, onRestoreUsed,
  partSpecs, onSetPartSpecs,
  activeFilter,
  COLORS, INPUT_S, CARD, CARD_TITLE, btn,
}) {
  const getStatus    = (pt) => (partStatus && partStatus[pt.id]) || 'ativo';
  const reservaParts = parts.filter((pt) => getStatus(pt) === 'reserva');
  const ativoParts   = parts.filter((pt) => getStatus(pt) === 'ativo');
  const usadoParts   = (usedHistory || []).filter((h) => h.category === categoryKey);

  /* ── edição inline ── */
  const [editingId, setEditingId] = useState(null);
  const [editName,  setEditName]  = useState('');
  const [editKm,    setEditKm]    = useState('');
  const [editObs,   setEditObs]   = useState('');
  const [editErr,   setEditErr]   = useState('');

  /* ── nova entrada de km ── */
  const [entryPartId, setEntryPartId] = useState(null);
  const [entryKm,     setEntryKm]     = useState('');
  const [entryNote,   setEntryNote]   = useState('');
  const [entryDate,   setEntryDate]   = useState(new Date().toISOString().split('T')[0]);
  const [entryErr,    setEntryErr]    = useState('');

  /* ── "Troca feita" (Em Uso → Já Utilizado) ── */
  const [replaceId,   setReplaceId]   = useState(null);
  const [replaceKm,   setReplaceKm]   = useState('');
  const [replaceNote, setReplaceNote] = useState('');
  const [replaceErr,  setReplaceErr]  = useState('');

  /* ── mover Reserva → Já Utilizado inline ── */
  const [quickReplaceId,   setQuickReplaceId]   = useState(null);
  const [quickReplaceKm,   setQuickReplaceKm]   = useState('0');
  const [quickReplaceNote, setQuickReplaceNote] = useState('');

  /* ── popup reserva ── */
  const [popupReserva,  setPopupReserva]  = useState(null);
  const [popupPeName,   setPopupPeName]   = useState('');
  const [popupPeKm,     setPopupPeKm]     = useState('');
  const [popupPeObs,    setPopupPeObs]    = useState('');
  const [popupPeSpecs,  setPopupPeSpecs]  = useState({});

  /* ── popup usado ── */
  const [popupUsed,  setPopupUsed]  = useState(null);
  const [popupUKm,   setPopupUKm]   = useState('');
  const [popupUObs,  setPopupUObs]  = useState('');
  const [popupUSpecs,setPopupUSpecs]= useState({});

  function startEdit(pt) {
    setEditingId(pt.id); setEditName(pt.name);
    setEditKm(String(pt.kmLimit)); setEditObs(pt.observation || ''); setEditErr('');
  }
  function confirmEdit() {
    const r = onEditPart?.(editingId, editName, editKm, activeProfileId, categoryKey, editObs);
    if (r?.error) { setEditErr(r.error); return; }
    setEditingId(null);
  }
  function openEntry(partId) {
    setEntryPartId(partId); setEntryKm(''); setEntryNote('');
    setEntryDate(new Date().toISOString().split('T')[0]); setEntryErr('');
  }
  function submitEntry() {
    const r = onAddEntry?.(entryPartId, entryKm, entryNote, entryDate, activeProfileId);
    if (r?.error) { setEntryErr(r.error); return; }
    setEntryPartId(null);
  }
  function openReplace(pt) {
    const total = (pt.entries || []).reduce((s, e) => s + (e.km || 0), 0);
    setReplaceId(pt.id);
    setReplaceKm(total > 0 ? total.toFixed(1) : '');
    setReplaceNote(''); setReplaceErr('');
  }
  function submitReplace() {
    if (!replaceKm || isNaN(parseFloat(replaceKm)) || parseFloat(replaceKm) <= 0) {
      setReplaceErr('Informe os km utilizados antes de registrar a troca.');
      return;
    }
    onDoReplace?.(replaceId, parseFloat(replaceKm), replaceNote, categoryKey);
    setReplaceId(null);
  }
  function openPopupReserva(pt) {
    setPopupReserva(pt); setPopupPeName(pt.name);
    setPopupPeKm(String(pt.kmLimit)); setPopupPeObs(pt.observation || '');
    setPopupPeSpecs(partSpecs?.[pt.id] || {});
  }
  function savePopupReserva() {
    onEditPart?.(popupReserva.id, popupPeName, popupPeKm, activeProfileId, categoryKey, popupPeObs);
    onSetPartSpecs?.(popupReserva.id, popupPeSpecs);
    setPopupReserva(null);
  }
  function openPopupUsed(h) {
    setPopupUsed(h); setPopupUKm(String(h.kmUsed || 0)); setPopupUObs(h.note || '');
    setPopupUSpecs(h.specs || {});
  }
  function savePopupUsed() {
    onUpdateUsed?.(popupUsed.id, parseFloat(popupUKm) || 0, popupUObs, popupUSpecs);
    setPopupUsed(null);
  }

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const modal = {
    background: COLORS.bgCard, border: `1px solid ${COLORS.borderLight}`,
    borderRadius: 12, padding: '24px 28px', maxWidth: 460, width: '90%',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  };

  /* ── colunas laterais helper ── */
  const sideCol = (accentColor) => ({
    width: 155, flexShrink: 0,
    background: `${accentColor}0a`,
    border: `1px solid ${accentColor}30`,
    borderRadius: 8, padding: '10px 12px',
  });
  const sideTitle = (accentColor) => ({
    fontSize: 10, fontWeight: 700, color: accentColor,
    textTransform: 'uppercase', letterSpacing: '0.8px',
    marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  });
  const sideBadge = (accentColor, count) => (
    <span style={{ background: `${accentColor}22`, borderRadius: 10, padding: '1px 7px', fontSize: 11, color: accentColor }}>
      {count}
    </span>
  );
  const sideItem = (hoverColor) => ({
    cursor: 'pointer', fontSize: 11, fontWeight: 500,
    color: COLORS.textPrimary, lineHeight: 1.4,
    background: COLORS.bg, border: `1px solid ${COLORS.border}`,
    borderRadius: 6, padding: '5px 8px', transition: 'border-color 0.15s',
  });

  return (
    <div style={CARD}>
      {/* ── cabeçalho ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={CARD_TITLE}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          {label}
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 400 }}>
            ({ativoParts.length} ativo{ativoParts.length !== 1 ? 's' : ''} · {reservaParts.length} reserva{reservaParts.length !== 1 ? 's' : ''} · {usadoParts.length} usado{usadoParts.length !== 1 ? 's' : ''})
          </span>
        </div>
        {isCustom && parts.length === 0 && (
          <button onClick={() => onDeleteCategory?.(categoryKey)} style={btn(false, true)}>
            🗑 Excluir categoria
          </button>
        )}
      </div>

      {headerContent && <div style={{ marginBottom: 12 }}>{headerContent}</div>}

      {/* ── Lista filtrada por status global ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* ── FILTER: RESERVA ── */}
        {activeFilter === 'reserva' && (
          reservaParts.length === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', padding: '20px 0', border: `1px dashed ${COLORS.border}`, borderRadius: 8 }}>
              Nenhuma peça em reserva nesta categoria
            </div>
          ) : reservaParts.map((pt) => {
            const isQR = quickReplaceId === pt.id;
            const specs = partSpecs?.[pt.id] || {};
            const marcaMod = [specs.marca, specs.modelo].filter(Boolean).join(' · ');
            return (
              <div key={pt.id} style={{ border: `1px solid ${COLORS.green}40`, borderRadius: 8, background: `${COLORS.green}05`, padding: '12px 14px' }}>
                {/* Cabeçalho */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{pt.name}</div>
                    {marcaMod && <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 1 }}>🏷 {marcaMod}</div>}
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Limite: {pt.kmLimit.toFixed(0)} km</div>
                    {pt.observation && <div style={{ fontSize: 11, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 2 }}>📝 {pt.observation}</div>}
                  </div>
                  <button onClick={() => startEdit(pt)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 14 }}>✏️</button>
                  <button onClick={() => onDeletePart?.(pt.id, activeProfileId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14 }}>🗑</button>
                </div>
                {/* Edição inline */}
                {editingId === pt.id && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, padding: '8px 10px', background: `${COLORS.border}22`, borderRadius: 7 }}>
                    <input value={editName} onChange={(e) => { setEditName(e.target.value); setEditErr(''); }} placeholder="Nome" style={{ ...INPUT_S, flex: '2 1 130px' }} />
                    <input type="number" value={editKm} onChange={(e) => { setEditKm(e.target.value); setEditErr(''); }} placeholder="Limite km" style={{ ...INPUT_S, flex: '1 1 80px', maxWidth: 100 }} min={1} />
                    <button onClick={confirmEdit} style={btn(true)}>OK</button>
                    <button onClick={() => setEditingId(null)} style={btn(false)}>✕</button>
                    {editErr && <span style={{ fontSize: 11, color: COLORS.accent }}>{editErr}</span>}
                  </div>
                )}
                {/* Form: Reserva → Já Utilizado */}
                {isQR && (
                  <div style={{ marginBottom: 8, padding: '10px 12px', background: `${COLORS.yellow}10`, border: `1px solid ${COLORS.yellow}40`, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.yellow, marginBottom: 8 }}>🗂️ Mover para Já Utilizado</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <div style={{ flex: '1 1 110px' }}>
                        <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 2 }}>Km utilizados</label>
                        <input type="number" value={quickReplaceKm} onChange={(e) => setQuickReplaceKm(e.target.value)} min={0} step={0.1} style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: '2 1 160px' }}>
                        <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 2 }}>Observação</label>
                        <input value={quickReplaceNote} onChange={(e) => setQuickReplaceNote(e.target.value)} placeholder="Motivo..." style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { onDoReplace?.(pt.id, parseFloat(quickReplaceKm) || 0, quickReplaceNote, categoryKey); setQuickReplaceId(null); }} style={{ ...btn(true), background: COLORS.yellow, borderColor: COLORS.yellow }}>✓ Confirmar</button>
                      <button onClick={() => setQuickReplaceId(null)} style={btn(false)}>Cancelar</button>
                    </div>
                  </div>
                )}
                {/* Botões de status */}
                {!isQR && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => onSetPartStatus?.(pt.id, 'ativo')} style={{ ...btn(false), fontSize: 11, borderColor: COLORS.green, color: COLORS.green }}>⚙️ Em Uso</button>
                    <button onClick={() => { setQuickReplaceId(pt.id); setQuickReplaceKm('0'); setQuickReplaceNote(''); }} style={{ ...btn(false), fontSize: 11, borderColor: COLORS.yellow, color: COLORS.yellow }}>🗂️ Já Utilizado</button>
                    <button onClick={() => openPopupReserva(pt)} style={{ ...btn(false), fontSize: 11 }}>📝 Detalhes</button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* ── FILTER: EM USO (ATIVO) ── */}
        {activeFilter === 'ativo' && (
          ativoParts.length === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', padding: '24px 0', border: `1px dashed ${COLORS.border}`, borderRadius: 8 }}>
              Nenhuma peça ativa nesta categoria
            </div>
          ) : ativoParts.map((pt) => {
            const usedKm    = (pt.entries || []).reduce((s, e) => s + (e.km || 0), 0);
            const pct       = pt.kmLimit > 0 ? usedKm / pt.kmLimit : 0;
            const remaining = Math.max(0, pt.kmLimit - usedKm);
            const alarm     = pct >= ALARM_THRESHOLD;
            const barColor  = alarm ? COLORS.accent : pct >= 0.75 ? COLORS.yellow : COLORS.green;
            const isEditing = editingId === pt.id;
            const isEntry   = entryPartId === pt.id;
            const isReplace = replaceId === pt.id;
            const specs     = partSpecs?.[pt.id] || {};
            const marcaMod  = [specs.marca, specs.modelo].filter(Boolean).join(' · ');
            return (
              <div key={pt.id} style={{ border: `1px solid ${alarm ? `${COLORS.accent}60` : COLORS.border}`, borderRadius: 8, background: alarm ? `${COLORS.accent}08` : COLORS.bg, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {isEditing ? (
                    <>
                      <input value={editName} onChange={(e) => { setEditName(e.target.value); setEditErr(''); }} placeholder="Nome da peça" style={{ ...INPUT_S, flex: '2 1 130px' }} />
                      <input type="number" value={editKm} onChange={(e) => { setEditKm(e.target.value); setEditErr(''); }} placeholder="Limite km" style={{ ...INPUT_S, flex: '1 1 80px', maxWidth: 100 }} min={1} />
                      <button onClick={confirmEdit} style={btn(true)}>OK</button>
                      <button onClick={() => setEditingId(null)} style={btn(false)}>✕</button>
                      {editErr && <span style={{ fontSize: 11, color: COLORS.accent }}>{editErr}</span>}
                      <div style={{ width: '100%', marginTop: 4 }}>
                        <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Observação</label>
                        <textarea value={editObs} onChange={(e) => setEditObs(e.target.value)} rows={2} placeholder="Observação…" style={{ ...INPUT_S, width: '100%', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: alarm ? COLORS.accent : COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {alarm && <span title="Troca necessária!">⚠️</span>}
                          {pt.name}
                        </div>
                        {marcaMod && <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 1, fontWeight: 500 }}>🏷 {marcaMod}</div>}
                        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Limite: {pt.kmLimit.toFixed(0)} km</div>
                        {pt.observation && <div style={{ fontSize: 11, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 3 }}>📝 {pt.observation}</div>}
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 100 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: barColor }}>{usedKm.toFixed(0)} / {pt.kmLimit.toFixed(0)} km</div>
                        <div style={{ fontSize: 11, color: alarm ? COLORS.accent : COLORS.textMuted }}>{alarm ? '⚠ TROCA NECESSÁRIA' : `Restam ${remaining.toFixed(0)} km`}</div>
                      </div>
                      <button onClick={() => startEdit(pt)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 14 }}>✏️</button>
                      <button onClick={() => onDeletePart?.(pt.id, activeProfileId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14 }}>🗑</button>
                    </>
                  )}
                </div>
                <div style={{ height: 6, background: COLORS.border, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, pct * 100).toFixed(1)}%`, background: barColor, transition: 'width 0.3s' }} />
                </div>
                {(pt.entries || []).length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>Histórico de uso</div>
                    {pt.entries.map((en) => (
                      <div key={en.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: COLORS.textSecondary, marginBottom: 3 }}>
                        <span style={{ color: COLORS.textMuted }}>{en.date}</span>
                        <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>{en.km.toFixed(0)} km</span>
                        {en.note && <span style={{ color: COLORS.textMuted, fontStyle: 'italic' }}>{en.note}</span>}
                        <button onClick={() => onDeleteEntry?.(pt.id, en.id, activeProfileId)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 12 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {isEntry ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${COLORS.border}33` }}>
                    <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={{ ...INPUT_S, flex: '0 1 120px' }} />
                    <input type="number" placeholder="km percorridos" value={entryKm} onChange={(e) => { setEntryKm(e.target.value); setEntryErr(''); }} style={{ ...INPUT_S, flex: '1 1 80px', maxWidth: 110 }} min={0.1} step={0.1} />
                    <input type="text" placeholder="Nota (opcional)" value={entryNote} onChange={(e) => setEntryNote(e.target.value)} style={{ ...INPUT_S, flex: '2 1 130px' }} />
                    <button onClick={submitEntry} style={btn(true)}>+ Adicionar km</button>
                    <button onClick={() => setEntryPartId(null)} style={btn(false)}>Cancelar</button>
                    {entryErr && <span style={{ fontSize: 11, color: COLORS.accent }}>{entryErr}</span>}
                  </div>
                ) : !isReplace && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    <button onClick={() => openEntry(pt.id)} style={{ ...btn(false), fontSize: 10 }}>+ Registrar km</button>
                    <button onClick={() => openReplace(pt)} style={{ ...btn(false), fontSize: 10, borderColor: COLORS.yellow, color: COLORS.yellow }}>🔄 Troca feita</button>
                    <button onClick={() => onSetPartStatus?.(pt.id, 'reserva')} style={{ ...btn(false), fontSize: 10, borderColor: COLORS.green, color: COLORS.green }}>📦 Reserva</button>
                  </div>
                )}
                {isReplace && (
                  <div style={{ marginTop: 8, padding: '12px 14px', background: `${COLORS.yellow}10`, border: `1px solid ${COLORS.yellow}40`, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.yellow, marginBottom: 10 }}>🔄 Registrar Troca — informe os km utilizados</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <div style={{ flex: '1 1 120px' }}>
                        <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Km total utilizados <span style={{ color: COLORS.accent }}>*</span></label>
                        <input type="number" value={replaceKm} min={0.1} step={0.1} onChange={(e) => { setReplaceKm(e.target.value); setReplaceErr(''); }} placeholder="km usados" style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: '2 1 180px' }}>
                        <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Observação (opcional)</label>
                        <input type="text" value={replaceNote} onChange={(e) => setReplaceNote(e.target.value)} placeholder="Ex: desgaste excessivo, preventiva…" style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    {replaceErr && <div style={{ fontSize: 11, color: COLORS.accent, marginBottom: 6 }}>{replaceErr}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={submitReplace} style={{ ...btn(true), background: COLORS.yellow, borderColor: COLORS.yellow }}>✓ Confirmar Troca</button>
                      <button onClick={() => setReplaceId(null)} style={btn(false)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* ── FILTER: JÁ UTILIZADO ── */}
        {activeFilter === 'usado' && (
          usadoParts.length === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', padding: '20px 0', border: `1px dashed ${COLORS.border}`, borderRadius: 8 }}>
              Nenhuma peça descartada nesta categoria
            </div>
          ) : [...usadoParts].reverse().map((h) => {
            const specs = h.specs || {};
            const marcaMod = [specs.marca, specs.modelo].filter(Boolean).join(' · ');
            return (
              <div key={h.id} style={{ border: `1px solid ${COLORS.accent}40`, borderRadius: 8, background: `${COLORS.accent}05`, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{h.name}</div>
                    {marcaMod && <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 1 }}>🏷 {marcaMod}</div>}
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                      {(h.kmUsed || 0).toFixed(0)} km usados
                      {h.movedAt && ` · ${new Date(h.movedAt).toLocaleDateString('pt-BR')}`}
                    </div>
                    {h.note && <div style={{ fontSize: 11, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 2 }}>📝 {h.note}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => onRestoreUsed?.(h.id, 'ativo')} style={{ ...btn(false), fontSize: 11, borderColor: COLORS.green, color: COLORS.green }}>⚙️ Em Uso</button>
                  <button onClick={() => onRestoreUsed?.(h.id, 'reserva')} style={{ ...btn(false), fontSize: 11, borderColor: COLORS.textMuted, color: COLORS.textMuted }}>📦 Reserva</button>
                  <button onClick={() => openPopupUsed(h)} style={{ ...btn(false), fontSize: 11 }}>📝 Detalhes</button>
                </div>
              </div>
            );
          })
        )}

      </div>{/* fim lista filtrada */}

      {/* ── POPUP: Reserva ── */}
      {popupReserva && (
        <div style={overlay} onClick={() => setPopupReserva(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>📦 Detalhes da Reserva</div>
              <button onClick={() => setPopupReserva(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 20 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 160px' }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Nome</label>
                  <input value={popupPeName} onChange={(e) => setPopupPeName(e.target.value)}
                    style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: '1 1 100px' }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Limite de km</label>
                  <input type="number" value={popupPeKm} onChange={(e) => setPopupPeKm(e.target.value)}
                    style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box' }} min={1} />
                </div>
              </div>
              {/* Especificações técnicas */}
              {(() => {
                const fields = PART_SPEC_FIELDS[popupReserva?.name] || BASE_SPEC_FIELDS;
                return (
                  <div style={{ padding: '10px 12px', background: `${COLORS.border}22`, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                      ⚙ Especificações técnicas
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {fields.map((f) => (
                        <div key={f.key} style={{ flex: f.w }}>
                          <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 2 }}>{f.label}</label>
                          {f.type === 'computed' ? (
                            <div style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box', fontSize: 11, background: `${COLORS.accent}10`, color: COLORS.accent, fontWeight: 600 }}>
                              {computeSpecValue(f.key, popupPeSpecs)}
                            </div>
                          ) : (
                            <input
                              type={f.type || 'text'}
                              value={popupPeSpecs[f.key] || ''}
                              onChange={(e) => setPopupPeSpecs((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              placeholder={f.pl || ''}
                              step={f.type === 'number' ? 'any' : undefined}
                              style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box', fontSize: 11 }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Observação</label>
                <textarea value={popupPeObs} onChange={(e) => setPopupPeObs(e.target.value)}
                  rows={2} style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={savePopupReserva} style={btn(true)}>Salvar</button>
              <button
                onClick={() => { onSetPartStatus?.(popupReserva.id, 'ativo'); setPopupReserva(null); }}
                style={{ ...btn(false), borderColor: COLORS.green, color: COLORS.green }}
              >
                ▶ Colocar em Uso
              </button>
              <button onClick={() => setPopupReserva(null)} style={btn(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── POPUP: Usado ── */}
      {popupUsed && (
        <div style={overlay} onClick={() => setPopupUsed(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>🗂️ Peça Descartada</div>
              <button onClick={() => setPopupUsed(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 20 }}>✕</button>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 4 }}>{popupUsed.name}</div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: COLORS.textMuted, marginBottom: 14 }}>
              <span>Limite: <b style={{ color: COLORS.textPrimary }}>{(popupUsed.kmLimit || 0).toFixed(0)} km</b></span>
              {popupUsed.movedAt && (
                <span>Trocada em: <b style={{ color: COLORS.textPrimary }}>{new Date(popupUsed.movedAt).toLocaleDateString('pt-BR')}</b></span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 110px' }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Km utilizados</label>
                  <input type="number" value={popupUKm} onChange={(e) => setPopupUKm(e.target.value)}
                    min={0} style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: '2 1 180px' }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Observação</label>
                  <input value={popupUObs} onChange={(e) => setPopupUObs(e.target.value)}
                    style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>
              {/* Especificações técnicas */}
              {(() => {
                const fields = PART_SPEC_FIELDS[popupUsed?.name] || BASE_SPEC_FIELDS;
                return (
                  <div style={{ padding: '10px 12px', background: `${COLORS.border}22`, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                      ⚙ Especificações técnicas
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {fields.map((f) => (
                        <div key={f.key} style={{ flex: f.w }}>
                          <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 2 }}>{f.label}</label>
                          {f.type === 'computed' ? (
                            <div style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box', fontSize: 11, background: `${COLORS.accent}10`, color: COLORS.accent, fontWeight: 600 }}>
                              {computeSpecValue(f.key, popupUSpecs)}
                            </div>
                          ) : (
                            <input
                              type={f.type || 'text'}
                              value={popupUSpecs[f.key] || ''}
                              onChange={(e) => setPopupUSpecs((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              placeholder={f.pl || ''}
                              step={f.type === 'number' ? 'any' : undefined}
                              style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box', fontSize: 11 }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {popupUsed.entries?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
                    Histórico registrado
                  </div>
                  {popupUsed.entries.map((en, i) => (
                    <div key={i} style={{ fontSize: 11, color: COLORS.textSecondary, display: 'flex', gap: 10, marginBottom: 3 }}>
                      <span style={{ color: COLORS.textMuted }}>{en.date}</span>
                      <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>{(en.km || 0).toFixed(0)} km</span>
                      {en.note && <span style={{ color: COLORS.textMuted, fontStyle: 'italic' }}>{en.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={savePopupUsed} style={btn(true)}>Salvar</button>
              <button onClick={() => setPopupUsed(null)} style={btn(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ─── Componente principal ───────────────────────────────────────────────── */
export default function MecanicaTab({
  profileParts = [],
  activeProfileId,
  customPartCategories = [],
  profilesList = [],
  profileGroups = [],
  mechanicSnapshots = [],
  onSavePart,
  onEditPart,
  onDeletePart,
  onAddPartEntry,
  onDeletePartEntry,
  onAddCustomCategory,
  onDeleteCustomCategory,
  onClearAllParts,
  onSaveMechanicSnapshot,
  onDeleteMechanicSnapshot,
  onLoadMechanicSnapshot,
}) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);
  const INPUT_S = {
    background: COLORS.bg,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 12,
    outline: 'none',
    minWidth: 0,
  };
  /** Calcula valor automático para campos type:'computed' */
  const computeSpecValue = (fieldKey, specs) => {
    if (fieldKey === 'rigidezDesvio') {
      const proj = parseFloat(specs?.rigidezProj);
      const real = parseFloat(specs?.rigidezReal);
      if (proj && real) return (((real - proj) / proj) * 100).toFixed(1) + '%';
      return '—';
    }
    if (fieldKey === 'atrioLoteVar') {
      const min = parseFloat(specs?.atrioLoteMin);
      const max = parseFloat(specs?.atrioLoteMax);
      if (min && max) { const avg = (min + max) / 2; return (((max - min) / avg) * 100).toFixed(1) + '%'; }
      return '—';
    }
    return '—';
  };

  const CARD = { ...theme.card };
  const CARD_TITLE = { ...theme.cardTitle, display: 'flex', alignItems: 'center', gap: 8 };
  const btn = (accent, danger) => ({
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: accent ? 700 : 400,
    background: danger ? `${COLORS.accent}18` : accent ? COLORS.accent : 'transparent',
    color: danger ? COLORS.accent : accent ? '#fff' : COLORS.textSecondary,
    border: danger ? `1px solid ${COLORS.accent}40` : accent ? 'none' : `1px solid ${COLORS.border}`,
    cursor: 'pointer',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  });
  /* ── Status de peças (reserva / ativo / usado) ── */
  const [partStatus, setPartStatus] = useState(() => {
    try { const s = localStorage.getItem(PART_STATUS_KEY(activeProfileId)); return s ? JSON.parse(s) : {}; }
    catch { return {}; }
  });
  const [partHistory, setPartHistory] = useState(() => {
    try { const s = localStorage.getItem(PART_HISTORY_KEY(activeProfileId)); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });

  // Recarrega ao trocar de perfil
  useEffect(() => {
    try { const s = localStorage.getItem(PART_STATUS_KEY(activeProfileId)); setPartStatus(s ? JSON.parse(s) : {}); }
    catch { setPartStatus({}); }
    try { const s = localStorage.getItem(PART_HISTORY_KEY(activeProfileId)); setPartHistory(s ? JSON.parse(s) : []); }
    catch { setPartHistory([]); }
  }, [activeProfileId]);

  // Auto-salva
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(PART_STATUS_KEY(activeProfileId), JSON.stringify(partStatus)), 400);
    return () => clearTimeout(t);
  }, [partStatus, activeProfileId]);
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(PART_HISTORY_KEY(activeProfileId), JSON.stringify(partHistory)), 400);
    return () => clearTimeout(t);
  }, [partHistory, activeProfileId]);

  /* ── Especificações técnicas de cada peça ── */
  const [partSpecs, setPartSpecs] = useState(() => {
    try { const s = localStorage.getItem(PART_SPECS_KEY(activeProfileId)); return s ? JSON.parse(s) : {}; }
    catch { return {}; }
  });
  useEffect(() => {
    try { const s = localStorage.getItem(PART_SPECS_KEY(activeProfileId)); setPartSpecs(s ? JSON.parse(s) : {}); }
    catch { setPartSpecs({}); }
  }, [activeProfileId]);
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(PART_SPECS_KEY(activeProfileId), JSON.stringify(partSpecs)), 400);
    return () => clearTimeout(t);
  }, [partSpecs, activeProfileId]);

  function handleSetPartStatus(partId, status) {
    setPartStatus(prev => ({ ...prev, [partId]: status }));
  }
  function handleSetPartSpecs(partId, specs) {
    setPartSpecs(prev => ({ ...prev, [partId]: specs }));
  }
  function handleSetPartPrices(partId, price) {
    setPartPrices(prev => ({ ...prev, [partId]: price }));
  }
  function handleDoReplace(partId, kmUsed, note, category) {
    const pt = profileParts.find((p) => p.id === partId);
    if (!pt) return;
    const entry = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      partId, name: pt.name, category,
      kmLimit: pt.kmLimit, kmUsed, note,
      movedAt: new Date().toISOString(),
      entries: JSON.parse(JSON.stringify(pt.entries || [])),
      specs: JSON.parse(JSON.stringify(partSpecs[partId] || {})),
    };
    setPartHistory(prev => [...prev, entry]);
    setPartStatus(prev => ({ ...prev, [partId]: 'usado' }));
  }
  function handleUpdateUsed(histId, kmUsed, note, specs) {
    setPartHistory(prev => prev.map((h) =>
      h.id === histId ? { ...h, kmUsed, note, specs: specs ?? h.specs } : h
    ));
  }

  /* ── Preços das peças ── */
  const [partPrices, setPartPrices] = useState(() => {
    try { const s = localStorage.getItem(PART_PRICES_KEY(activeProfileId)); return s ? JSON.parse(s) : {}; }
    catch { return {}; }
  });
  useEffect(() => {
    try { const s = localStorage.getItem(PART_PRICES_KEY(activeProfileId)); setPartPrices(s ? JSON.parse(s) : {}); }
    catch { setPartPrices({}); }
  }, [activeProfileId]);
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(PART_PRICES_KEY(activeProfileId), JSON.stringify(partPrices)), 400);
    return () => clearTimeout(t);
  }, [partPrices, activeProfileId]);

  // Aplica status + specs pendentes quando uma nova peça é adicionada
  const pendingNewPartRef = useRef(null);
  const prevPartsLenRef   = useRef(profileParts.length);
  useEffect(() => {
    if (profileParts.length > prevPartsLenRef.current && pendingNewPartRef.current) {
      const { status, category, specs, price, count } = pendingNewPartRef.current;
      const catParts = profileParts.filter((p) => (p.category || 'outro') === category);
      const newParts = catParts.slice(-count);
      const statusUpd = {}, specsUpd = {}, priceUpd = {};
      for (const part of newParts) {
        if (status !== 'ativo') statusUpd[part.id] = status;
        if (specs && Object.keys(specs).length > 0) specsUpd[part.id] = { ...specs };
        if (price) priceUpd[part.id] = price;
      }
      if (Object.keys(statusUpd).length) setPartStatus(prev => ({ ...prev, ...statusUpd }));
      if (Object.keys(specsUpd).length)  setPartSpecs(prev => ({ ...prev, ...specsUpd }));
      if (Object.keys(priceUpd).length)  setPartPrices(prev => ({ ...prev, ...priceUpd }));
      pendingNewPartRef.current = null;
    }
    prevPartsLenRef.current = profileParts.length;
  }, [profileParts]);


  /* ── Modal de adição + filtro global ── */
  const [showAddModal, setShowAddModal] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('ativo');

  function handleRestoreUsed(histId, newStatus) {
    const h = partHistory.find((e) => e.id === histId);
    if (!h) return;
    setPartHistory((prev) => prev.filter((e) => e.id !== histId));
    setPartStatus((prev) => ({ ...prev, [h.partId]: newStatus }));
  }

  const [newName,     setNewName]     = useState('');
  const [newKm,       setNewKm]       = useState('');
  const [newUsedKm,   setNewUsedKm]   = useState('');
  const [newCategory, setNewCategory] = useState('suspensão');
  const [newObs,      setNewObs]      = useState('');
  const [newStatus,   setNewStatus]   = useState('ativo');
  const [newQty,      setNewQty]      = useState(1);
  const [newSpecs,    setNewSpecs]    = useState({});
  const [addErr,      setAddErr]      = useState('');

  const [showNewCat, setShowNewCat]   = useState(false);
  const [newCatName, setNewCatName]   = useState('');
  const [newCatErr,  setNewCatErr]    = useState('');

  /* ── Custom templates ── */
  const [customTemplates, setCustomTemplates] = useState(() => {
    try { const s = localStorage.getItem(CUSTOM_TEMPLATES_KEY); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(customTemplates)), 400);
    return () => clearTimeout(t);
  }, [customTemplates]);

  /* ── UI: modais e inventário ── */
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showInventory, setShowInventory] = useState(false);

  /* ── Formulário de criação de template ── */
  const [tplName, setTplName]                   = useState('');
  const [tplCategory, setTplCategory]           = useState('suspensão');
  const [tplKmLimit, setTplKmLimit]             = useState('');
  const [tplObs, setTplObs]                     = useState('');
  const [tplSelectedFields, setTplSelectedFields] = useState([]);
  const [tplErr, setTplErr]                     = useState('');

  /* ── Preço no formulário de nova peça ── */
  const [newPrice, setNewPrice] = useState('');

  // Salvar snapshot
  const [snapName,       setSnapName]       = useState('');
  const [snapTarget,     setSnapTarget]     = useState('');
  const [snapGroupId,    setSnapGroupId]    = useState('');
  const [snapMsg,        setSnapMsg]        = useState(null);
  const [showSnapshots,  setShowSnapshots]  = useState(false);

  // Confirmação inline (substitui window.confirm que não funciona no Electron)
  const [confirmState, setConfirmState] = useState(null); // { msg, onConfirm }
  const askConfirm = (msg, onConfirm) => setConfirmState({ msg, onConfirm });
  const doConfirm  = () => { confirmState?.onConfirm(); setConfirmState(null); };
  const doCancel   = () => setConfirmState(null);

  function handleNew() {
    if (profileParts.length > 0 || customPartCategories.length > 0) {
      askConfirm(
        `Zerar mecânica? Todas as ${profileParts.length} peça(s) e categorias customizadas serão removidas.`,
        () => {
          onClearAllParts?.(activeProfileId);
          setNewName(''); setNewKm(''); setNewUsedKm(''); setNewObs('');
          setNewCategory('suspensão'); setAddErr('');
        }
      );
      return;
    }
    onClearAllParts?.(activeProfileId);
    setNewName(''); setNewKm(''); setNewUsedKm(''); setNewObs('');
    setNewCategory('suspensão'); setAddErr('');
  }

  // Todas as categorias: fixas + customizadas
  const allCategories = [
    ...FIXED_CATEGORIES.map((k) => ({ key: k, ...CATEGORY_META[k], isCustom: false })),
    ...customPartCategories.map((k) => ({
      key: k,
      icon: '🏷️',
      label: k.charAt(0).toUpperCase() + k.slice(1),
      isCustom: true,
    })),
  ];

  function handleAddPart() {
    if (!activeProfileId) { setAddErr('Nenhum perfil selecionado. Selecione um perfil na aba Perfis antes de adicionar peças.'); return; }
    if (!newName.trim()) { setAddErr('Digite o nome da peça.'); return; }
    if (!newKm || isNaN(parseFloat(newKm)) || parseFloat(newKm) <= 0) { setAddErr('Informe um limite de km válido.'); return; }
    const qty = Math.max(1, Math.min(50, parseInt(newQty) || 1));
    const hasSpecs = Object.values(newSpecs).some((v) => v !== '' && v !== undefined);
    if (newStatus !== 'ativo' || hasSpecs || newPrice) {
      pendingNewPartRef.current = { status: newStatus, category: newCategory, specs: hasSpecs ? { ...newSpecs } : {}, price: newPrice || '', count: qty };
    }
    for (let i = 0; i < qty; i++) {
      const name = qty > 1 ? `${newName.trim()} #${i + 1}` : newName.trim();
      const r = onSavePart?.(name, newKm, activeProfileId, i === 0 ? newUsedKm : '', newCategory, newObs.trim());
      if (r?.error) { pendingNewPartRef.current = null; setAddErr(r.error); return; }
    }
    setNewName(''); setNewKm(''); setNewUsedKm(''); setNewObs(''); setNewQty(1); setNewSpecs({}); setAddErr(''); setNewPrice('');
    setShowAddModal(false);
  }

  /* ── Templates efetivos (built-in + custom) ── */
  const effectiveTemplates = { ...PART_TEMPLATES };
  for (const ct of customTemplates) {
    if (!effectiveTemplates[ct.category]) effectiveTemplates[ct.category] = [];
    if (!effectiveTemplates[ct.category].find((t) => t.name === ct.name)) {
      effectiveTemplates[ct.category] = [...effectiveTemplates[ct.category], { name: ct.name, kmLimit: ct.kmLimit, obs: ct.obs || '', isCustom: true }];
    }
  }

  function handleSaveCustomTemplate() {
    if (!tplName.trim()) { setTplErr('Digite um nome para o template.'); return; }
    if (!tplKmLimit || isNaN(parseFloat(tplKmLimit)) || parseFloat(tplKmLimit) <= 0) { setTplErr('Informe um limite de km válido.'); return; }
    if (tplSelectedFields.length === 0) { setTplErr('Selecione ao menos um campo de especificação.'); return; }
    const fields = tplSelectedFields
      .map((key) => ALL_SPEC_FIELDS_FLAT.find((f) => f.key === key))
      .filter(Boolean)
      .map((f) => ({ ...f, w: '1 1 140px', pl: '' }));
    setCustomTemplates((prev) => [...prev, {
      id: `tpl_${Date.now()}`,
      name: tplName.trim(),
      category: tplCategory,
      kmLimit: parseFloat(tplKmLimit),
      obs: tplObs.trim(),
      fields,
    }]);
    setTplName(''); setTplCategory('suspensão'); setTplKmLimit(''); setTplObs('');
    setTplSelectedFields([]); setTplErr('');
    setShowTemplateModal(false);
  }

  function handleDeleteCustomTemplate(id) {
    setCustomTemplates((prev) => prev.filter((ct) => ct.id !== id));
  }

  function exportInventoryCSV() {
    const BOM = '\uFEFF';
    const headers = ['Nome', 'Categoria', 'Status', 'Km Atual', 'Km Limite', '%', 'Preço (R$)', 'Marca', 'Modelo', 'Referência', 'Observação'];
    const rows = profileParts.map((p) => {
      const status = partStatus[p.id] || 'ativo';
      const statusLabel = status === 'ativo' ? 'Em Uso' : status === 'reserva' ? 'Reserva' : 'Já Utilizado';
      const specs = partSpecs[p.id] || {};
      const kmUsed = (p.entries || []).reduce((s, e) => s + (e.km || 0), 0) + (p.usedKm || 0);
      const pct = p.kmLimit > 0 ? Math.min(100, (kmUsed / p.kmLimit) * 100).toFixed(1) : '0';
      const price = partPrices[p.id] !== undefined ? partPrices[p.id] : '';
      return [
        p.name,
        p.category || 'outro',
        statusLabel,
        kmUsed.toFixed(1),
        p.kmLimit,
        pct + '%',
        price,
        specs.marca || '',
        specs.modelo || '',
        specs.ref || '',
        p.observation || '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';');
    });
    const totalPrice = profileParts.reduce((s, p) => {
      const pr = parseFloat(partPrices[p.id]);
      return s + (isNaN(pr) ? 0 : pr);
    }, 0);
    rows.push(['', '', '', '', '', 'TOTAL', totalPrice.toFixed(2), '', '', '', ''].map((v) => `"${v}"`).join(';'));
    const csv = BOM + headers.map((h) => `"${h}"`).join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventario_mecanica.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function handleSaveSnapshot() {
    if (!snapName.trim()) { setSnapMsg({ ok: false, text: 'Digite um nome para o snapshot.' }); return; }
    const targetId = snapTarget || activeProfileId;
    if (!targetId) { setSnapMsg({ ok: false, text: 'Selecione um perfil de destino.' }); return; }
    const r = onSaveMechanicSnapshot?.(targetId, snapName.trim(), profileParts, customPartCategories, snapGroupId || undefined);
    if (r?.error) { setSnapMsg({ ok: false, text: r.error }); return; }
    const pName = profilesList.find((p) => p.id === targetId)?.name || 'perfil';
    setSnapMsg({ ok: true, text: `Salvo em "${pName}"!` });
    setSnapName('');
    setTimeout(() => setSnapMsg(null), 3500);
  }

  function handleAddCategory() {
    const trimmed = newCatName.trim().toLowerCase();
    if (!trimmed) { setNewCatErr('Digite um nome para a categoria.'); return; }
    if (FIXED_CATEGORIES.includes(trimmed) || customPartCategories.includes(trimmed)) {
      setNewCatErr('Essa categoria já existe.'); return;
    }
    onAddCustomCategory?.(trimmed, activeProfileId);
    setNewCatName('');
    setShowNewCat(false);
    setNewCatErr('');
    setNewCategory(trimmed);
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Modal de confirmação inline ── */}
      {confirmState && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: COLORS.bgCard, border: `1px solid ${COLORS.borderLight}`,
            borderRadius: 12, padding: '24px 28px', maxWidth: 420, width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize: 14, color: COLORS.textPrimary, marginBottom: 20, lineHeight: 1.5 }}>
              ⚠️ {confirmState.msg}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={doCancel} style={{
                padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'transparent', border: `1px solid ${COLORS.borderLight}`, color: COLORS.textSecondary, cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={doConfirm} style={{
                padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: COLORS.accent, border: 'none', color: '#fff', cursor: 'pointer',
              }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Aviso: sem perfil ativo ── */}
      {!activeProfileId && (
        <div style={{
          background: '#f59e0b18',
          border: '1px solid #f59e0b60',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 16,
          fontSize: 13,
          color: '#f59e0b',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span>
            Nenhum perfil ativo.{' '}
            <b style={{ color: '#fcd34d' }}>Crie ou selecione um perfil na aba Perfis</b>{' '}
            para registrar peças e histórico.
          </span>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>🔧</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Mecânica</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>Controle de peças, quilometragem e vida útil por categoria</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {/* Linha 1: Mecânica Salva (se houver) + Inventário + Nova */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {mechanicSnapshots.length > 0 && (
              <button
                onClick={() => setShowSnapshots((v) => !v)}
                style={{ ...theme.pillButton(showSnapshots), padding: '7px 14px', fontSize: 12 }}
              >
                📂 Mecânica Salva ({mechanicSnapshots.length})
              </button>
            )}
            <button
              onClick={() => setShowInventory((v) => !v)}
              style={{ ...theme.pillButton(showInventory), padding: '7px 14px', fontSize: 12 }}
            >
              📊 Inventário
            </button>
            <button onClick={handleNew} style={{ ...theme.pillButton(false), padding: '7px 14px', fontSize: 12 }}>
              ➕ Nova
            </button>
          </div>
          {/* Linha 2: Criar Template + Adicionar Peça */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowTemplateModal(true)}
              style={{ ...theme.pillButton(false), padding: '7px 14px', fontSize: 12 }}
            >
              🧩 Criar Template
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: COLORS.accent, color: '#fff', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              + Adicionar Peça
            </button>
          </div>
        </div>
      </div>

      {/* ── Mecânica salva no perfil (expansível) ── */}
      {showSnapshots && mechanicSnapshots.length > 0 && (
        <div style={{ ...CARD, marginBottom: 8 }}>
          <div style={CARD_TITLE}>📂 Mecânica Salva no Perfil</div>
          {mechanicSnapshots.map((s) => (
            <div key={s.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}22`,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                  {s.savedAt ? new Date(s.savedAt).toLocaleDateString('pt-BR') : ''}
                  {s.data?.parts?.length ? <span style={{ marginLeft: 8 }}>⚙️ {s.data.parts.length} peça(s)</span> : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    if (profileParts.length > 0) {
                      askConfirm(`Carregar "${s.name}"? As peças atuais serão substituídas.`, () => {
                        onLoadMechanicSnapshot?.(s.id);
                        setShowSnapshots(false);
                      });
                    } else {
                      onLoadMechanicSnapshot?.(s.id);
                      setShowSnapshots(false);
                    }
                  }}
                  style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 12px' }}
                >
                  Carregar
                </button>
                <button
                  onClick={() => onDeleteMechanicSnapshot?.(s.id)}
                  style={{ ...theme.pillButton(false), fontSize: 11, padding: '5px 12px', borderColor: COLORS.accent, color: COLORS.accent }}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filtros globais ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
        {/* 3 filtros globais — ordem: Reserva | Em Uso (centro) | Já Utilizado */}
        {[
          { k: 'reserva', label: 'Reserva',       icon: '📦', color: COLORS.yellow,  count: profileParts.filter((p) => (partStatus[p.id] || 'ativo') === 'reserva').length },
          { k: 'ativo',   label: 'Em Uso',        icon: '⚙️', color: COLORS.green,   count: profileParts.filter((p) => (partStatus[p.id] || 'ativo') === 'ativo').length },
          { k: 'usado',   label: 'Já Utilizado',  icon: '🗂️', color: COLORS.accent,  count: partHistory.length },
        ].map(({ k, label, icon, color, count }) => (
          <button
            key={k}
            onClick={() => setGlobalFilter(k)}
            style={{
              flex: '1 1 120px', minHeight: 72, borderRadius: 10, cursor: 'pointer',
              border: `2px solid ${globalFilter === k ? color : COLORS.border}`,
              background: globalFilter === k ? `${color}18` : COLORS.bgCard,
              color: globalFilter === k ? color : COLORS.textMuted,
              fontWeight: globalFilter === k ? 700 : 400,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 18 }}>{icon}</div>
            <div style={{ fontSize: 11 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: globalFilter === k ? color : COLORS.textPrimary, lineHeight: 1 }}>{count}</div>
          </button>
        ))}
      </div>

      {/* ── Modal: Adicionar Peça ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'auto' }}
          onClick={() => setShowAddModal(false)}
        >
          <div style={{ ...CARD, maxWidth: 680, width: '100%', maxHeight: '92vh', overflow: 'auto', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={CARD_TITLE}><span>🔧</span> Nova Peça</div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 22, lineHeight: 1 }}>✕</button>
            </div>

        {/* Linha 1: nome + km + quantidade */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'flex-end' }}>
          <input
            type="text"
            placeholder="Nome da peça (ex: Correia dentada)"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setAddErr(''); }}
            style={{ ...INPUT_S, flex: '2 1 180px' }}
          />
          <input
            type="number"
            placeholder="Limite km"
            value={newKm}
            onChange={(e) => { setNewKm(e.target.value); setAddErr(''); }}
            style={{ ...INPUT_S, flex: '1 1 80px', maxWidth: 110 }}
            min={1}
          />
          <input
            type="number"
            placeholder="km já usados"
            value={newUsedKm}
            onChange={(e) => { setNewUsedKm(e.target.value); setAddErr(''); }}
            style={{ ...INPUT_S, flex: '1 1 80px', maxWidth: 120 }}
            min={0}
            title="Quilometragem que a peça já acumulou antes do cadastro"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
            <label style={{ fontSize: 10, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>Preço (R$)</label>
            <input
              type="number"
              placeholder="0,00"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              style={{ ...INPUT_S, width: 100 }}
              min={0}
              step="0.01"
              title="Custo da peça (aparece no inventário)"
            />
          </div>
          {/* Quantidade */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
            <label style={{ fontSize: 10, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
              Qtd
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                onClick={() => setNewQty((v) => Math.max(1, (parseInt(v) || 1) - 1))}
                style={{
                  width: 26, height: 30, borderRadius: 6, border: `1px solid ${COLORS.border}`,
                  background: COLORS.bg, color: COLORS.textPrimary, fontSize: 14,
                  cursor: 'pointer', flexShrink: 0, lineHeight: 1,
                }}
              >−</button>
              <input
                type="number"
                value={newQty}
                onChange={(e) => setNewQty(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                style={{ ...INPUT_S, width: 44, textAlign: 'center', padding: '4px 6px' }}
                min={1} max={50}
              />
              <button
                type="button"
                onClick={() => setNewQty((v) => Math.min(50, (parseInt(v) || 1) + 1))}
                style={{
                  width: 26, height: 30, borderRadius: 6, border: `1px solid ${COLORS.border}`,
                  background: COLORS.bg, color: COLORS.textPrimary, fontSize: 14,
                  cursor: 'pointer', flexShrink: 0, lineHeight: 1,
                }}
              >+</button>
            </div>
          </div>
        </div>
        {newQty > 1 && (
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8, marginTop: -4 }}>
            💡 Serão criadas <b style={{ color: COLORS.textPrimary }}>{newQty} peças</b> com o nome <b style={{ color: COLORS.textPrimary }}>"{newName || '...'} #1", "{newName || '...'} #2"</b>…
          </div>
        )}

        {/* Linha 2: categoria */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>Categoria</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              style={{ ...INPUT_S, width: '100%', cursor: 'pointer' }}
            >
              {allCategories.map((c) => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
          <div style={{ paddingTop: 18 }}>
            <button onClick={() => { setShowNewCat((v) => !v); setNewCatErr(''); }} style={btn(false)}>
              + Nova categoria
            </button>
          </div>
        </div>

        {/* Criar nova categoria */}
        {showNewCat && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, padding: '10px 12px', background: `${COLORS.border}22`, borderRadius: 8 }}>
            <input
              type="text"
              placeholder="Nome da nova categoria"
              value={newCatName}
              onChange={(e) => { setNewCatName(e.target.value); setNewCatErr(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              style={{ ...INPUT_S, flex: '2 1 180px' }}
            />
            <button onClick={handleAddCategory} style={btn(true)}>Criar</button>
            <button onClick={() => { setShowNewCat(false); setNewCatName(''); setNewCatErr(''); }} style={btn(false)}>Cancelar</button>
            {newCatErr && <span style={{ fontSize: 11, color: COLORS.accent }}>{newCatErr}</span>}
          </div>
        )}

        {/* Linha 3: onde adicionar a peça */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 6 }}>Adicionar como</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { k: 'reserva', label: '📦 Reserva',    color: COLORS.green },
              { k: 'ativo',   label: '⚙️ Em Uso',     color: COLORS.textPrimary },
              { k: 'usado',   label: '🗂️ Já Utilizado', color: COLORS.accent },
            ].map(({ k, label, color }) => (
              <button
                key={k}
                type="button"
                onClick={() => setNewStatus(k)}
                style={{
                  flex: '1 1 100px',
                  padding: '7px 10px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: newStatus === k ? 700 : 400,
                  background: newStatus === k ? `${color}20` : 'transparent',
                  color: newStatus === k ? color : COLORS.textMuted,
                  border: `1.5px solid ${newStatus === k ? color : COLORS.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Templates rápidos por categoria */}
        {(effectiveTemplates[newCategory] || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 6 }}>
              Templates rápidos — clique para preencher
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {effectiveTemplates[newCategory].map((t) => {
                const isSelected = newName === t.name && newKm === String(t.kmLimit);
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => {
                      setNewName(t.name);
                      setNewKm(String(t.kmLimit));
                      setNewObs(t.obs || '');
                      setNewSpecs({});
                      setAddErr('');
                    }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: isSelected ? 700 : 400,
                      background: isSelected ? `${COLORS.accent}22` : `${COLORS.border}33`,
                      color: isSelected ? COLORS.accent : COLORS.textSecondary,
                      border: `1px solid ${isSelected ? COLORS.accent : COLORS.border}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.name}
                    <span style={{ opacity: 0.55, marginLeft: 5, fontSize: 10 }}>
                      {t.kmLimit.toLocaleString('pt-BR')} km
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Linha 4: especificações técnicas */}
        {(() => {
          const specFields = PART_SPEC_FIELDS[newName]
            || customTemplates.find((ct) => ct.name === newName)?.fields
            || BASE_SPEC_FIELDS;
          return (
            <div style={{ marginBottom: 12, padding: '10px 12px', background: `${COLORS.border}22`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                ⚙ Especificações técnicas
                {PART_SPEC_FIELDS[newName] && (
                  <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    — {newName}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {specFields.map((f) => (
                  <div key={f.key} style={{ flex: f.w }}>
                    <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'block', marginBottom: 2 }}>{f.label}</label>
                    {f.type === 'computed' ? (
                      <div style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box', fontSize: 11, background: `${COLORS.accent}10`, color: COLORS.accent, fontWeight: 600 }}>
                        {computeSpecValue(f.key, newSpecs)}
                      </div>
                    ) : (
                      <input
                        type={f.type || 'text'}
                        value={newSpecs[f.key] || ''}
                        onChange={(e) => setNewSpecs((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.pl || ''}
                        step={f.type === 'number' ? 'any' : undefined}
                        style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box', fontSize: 11 }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Linha 5: observação */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 3 }}>
            Observação (opcional)
          </label>
          <textarea
            placeholder="Ex: Peça substituída após batida, verificar alinhamento..."
            value={newObs}
            onChange={(e) => setNewObs(e.target.value)}
            rows={2}
            style={{ ...INPUT_S, width: '100%', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleAddPart} style={btn(true)}>+ Adicionar Peça</button>
          {addErr && <span style={{ fontSize: 12, color: COLORS.accent }}>{addErr}</span>}
        </div>

        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
          "km já usados" é opcional — informe se a peça já estava em uso ao ser cadastrada.
        </div>
          </div>{/* fim modal inner */}
        </div>
      )}{/* fim modal */}

      {/* ── Modal: Criar Template Personalizado ── */}
      {showTemplateModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowTemplateModal(false)}
        >
          <div
            style={{ ...CARD, maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={CARD_TITLE}><span>🧩</span> Criar Template de Peça</div>
              <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: 22 }}>✕</button>
            </div>

            {/* Nome + categoria + km + obs */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Nome do template (ex: Pastilha de Competição)"
                value={tplName}
                onChange={(e) => { setTplName(e.target.value); setTplErr(''); }}
                style={{ ...INPUT_S, flex: '3 1 200px' }}
              />
              <select
                value={tplCategory}
                onChange={(e) => setTplCategory(e.target.value)}
                style={{ ...INPUT_S, flex: '1 1 130px', cursor: 'pointer' }}
              >
                {allCategories.map((c) => (
                  <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Limite km padrão"
                value={tplKmLimit}
                onChange={(e) => { setTplKmLimit(e.target.value); setTplErr(''); }}
                style={{ ...INPUT_S, flex: '1 1 110px', maxWidth: 140 }}
                min={1}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <input
                type="text"
                placeholder="Observação padrão (opcional)"
                value={tplObs}
                onChange={(e) => setTplObs(e.target.value)}
                style={{ ...INPUT_S, width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Seleção de campos */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                ⚙ Parâmetros de especificação — selecione os que deseja incluir
                <span style={{ marginLeft: 8, fontWeight: 400, textTransform: 'none', color: COLORS.accent, fontSize: 11 }}>
                  {tplSelectedFields.length} selecionado(s)
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ALL_SPEC_FIELDS_FLAT.map((f) => {
                  const sel = tplSelectedFields.includes(f.key);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        setTplSelectedFields((prev) =>
                          prev.includes(f.key) ? prev.filter((k) => k !== f.key) : [...prev, f.key]
                        );
                        setTplErr('');
                      }}
                      style={{
                        padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                        fontWeight: sel ? 700 : 400,
                        background: sel ? `${COLORS.accent}22` : `${COLORS.border}22`,
                        color: sel ? COLORS.accent : COLORS.textSecondary,
                        border: `1px solid ${sel ? COLORS.accent : COLORS.border}`,
                        transition: 'all 0.12s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleSaveCustomTemplate} style={btn(true)}>💾 Salvar Template</button>
              <button onClick={() => setShowTemplateModal(false)} style={btn(false)}>Cancelar</button>
              {tplErr && <span style={{ fontSize: 12, color: COLORS.accent }}>{tplErr}</span>}
            </div>

            {/* Templates customizados existentes */}
            {customTemplates.length > 0 && (
              <div style={{ marginTop: 20, borderTop: `1px solid ${COLORS.border}`, paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                  Templates criados por você
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {customTemplates.map((ct) => (
                    <div key={ct.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      padding: '8px 12px', borderRadius: 8, background: `${COLORS.border}22`, border: `1px solid ${COLORS.border}`,
                    }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{ct.name}</span>
                        <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8 }}>
                          {CATEGORY_META[ct.category]?.label || ct.category} · {ct.kmLimit.toLocaleString('pt-BR')} km · {ct.fields.length} campos
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteCustomTemplate(ct.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: 14, flexShrink: 0 }}
                      >🗑</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Inventário ── */}
      {showInventory && (
        <div style={{ ...CARD, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={CARD_TITLE}><span>📊</span> Inventário de Peças</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>{profileParts.length} peça(s)</span>
              <button
                onClick={exportInventoryCSV}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                📥 Exportar Excel
              </button>
            </div>
          </div>

          {profileParts.length === 0 ? (
            <div style={{ fontSize: 13, color: COLORS.textMuted, textAlign: 'center', padding: '24px 0' }}>
              Nenhuma peça cadastrada.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                    {['Nome', 'Categoria', 'Status', 'Km Atual', 'Km Limite', '%', 'Preço (R$)', 'Marca', 'Modelo', 'Ref.'].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: COLORS.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.7px', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profileParts.map((p, i) => {
                    const status = partStatus[p.id] || 'ativo';
                    const statusColor = status === 'ativo' ? COLORS.green : status === 'reserva' ? COLORS.yellow : COLORS.textMuted;
                    const statusLabel = status === 'ativo' ? 'Em Uso' : status === 'reserva' ? 'Reserva' : 'Utilizado';
                    const specs = partSpecs[p.id] || {};
                    const kmUsed = (p.entries || []).reduce((s, e) => s + (e.km || 0), 0) + (p.usedKm || 0);
                    const pct = p.kmLimit > 0 ? Math.min(100, (kmUsed / p.kmLimit) * 100) : 0;
                    const pctColor = pct >= 96 ? COLORS.accent : pct >= 80 ? COLORS.yellow : COLORS.green;
                    const price = partPrices[p.id];
                    const catMeta = CATEGORY_META[p.category] || CATEGORY_META['outro'];
                    return (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${COLORS.border}22`, background: i % 2 === 0 ? 'transparent' : `${COLORS.border}11` }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: COLORS.textPrimary, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</td>
                        <td style={{ padding: '8px 10px', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{catMeta.icon} {catMeta.label}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
                        </td>
                        <td style={{ padding: '8px 10px', color: COLORS.textSecondary, textAlign: 'right', whiteSpace: 'nowrap' }}>{kmUsed.toFixed(0)}</td>
                        <td style={{ padding: '8px 10px', color: COLORS.textSecondary, textAlign: 'right', whiteSpace: 'nowrap' }}>{p.kmLimit.toLocaleString('pt-BR')}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{ color: pctColor, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <input
                            type="number"
                            value={price !== undefined ? price : ''}
                            onChange={(e) => setPartPrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder="0,00"
                            min={0}
                            step="0.01"
                            style={{
                              ...INPUT_S,
                              width: 90, textAlign: 'right', padding: '3px 6px',
                              fontSize: 12, background: 'transparent',
                              border: `1px solid ${COLORS.border}`,
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{specs.marca || '—'}</td>
                        <td style={{ padding: '8px 10px', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{specs.modelo || '—'}</td>
                        <td style={{ padding: '8px 10px', color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{specs.ref || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${COLORS.border}` }}>
                    <td colSpan={6} style={{ padding: '10px 10px', fontWeight: 700, color: COLORS.textPrimary, fontSize: 12 }}>
                      Total ({profileParts.length} peças)
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: COLORS.green, fontSize: 13, whiteSpace: 'nowrap' }}>
                      R$ {profileParts.reduce((s, p) => {
                        const pr = parseFloat(partPrices[p.id]);
                        return s + (isNaN(pr) ? 0 : pr);
                      }, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Boxes por categoria ── */}
      {allCategories.map(({ key, icon, label, isCustom }) => {
        const catParts = profileParts.filter((p) => (p.category || 'outro') === key);
        return (
          <CategoryBox
            key={key}
            categoryKey={key}
            icon={icon}
            label={label}
            parts={catParts}
            activeProfileId={activeProfileId}
            onEditPart={onEditPart}
            onDeletePart={onDeletePart}
            onAddEntry={onAddPartEntry}
            onDeleteEntry={onDeletePartEntry}
            isCustom={isCustom}
            onDeleteCategory={onDeleteCustomCategory}
            partStatus={partStatus}
            usedHistory={partHistory}
            onSetPartStatus={handleSetPartStatus}
            onDoReplace={handleDoReplace}
            onUpdateUsed={handleUpdateUsed}
            onRestoreUsed={handleRestoreUsed}
            partSpecs={partSpecs}
            onSetPartSpecs={handleSetPartSpecs}
            activeFilter={globalFilter}
            COLORS={COLORS}
            INPUT_S={INPUT_S}
            CARD={CARD}
            CARD_TITLE={CARD_TITLE}
            btn={btn}
          />
        );
      })}

      {/* ── Salvar no Perfil ── */}
      <div style={{ background: `${COLORS.purple}0a`, border: `1px solid ${COLORS.purple}30`, borderRadius: 12, padding: '14px 16px', marginTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.purple, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
          Salvar no Perfil
        </div>
        {profilesList.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            Crie um perfil na aba <b style={{ color: COLORS.textSecondary }}>Perfis</b> para poder salvar.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '2 1 180px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Nome do snapshot</label>
                <input
                  type="text"
                  value={snapName}
                  onChange={(e) => { setSnapName(e.target.value); setSnapMsg(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveSnapshot()}
                  placeholder="Ex: Pré-corrida etapa 3"
                  style={{ ...INPUT_S, width: '100%' }}
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Perfil de destino</label>
                <select
                  value={snapTarget || activeProfileId || ''}
                  onChange={(e) => { setSnapTarget(e.target.value); setSnapMsg(null); }}
                  style={{ ...INPUT_S, width: '100%', cursor: 'pointer' }}
                >
                  <option value="">— Selecionar —</option>
                  {profilesList.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {profileGroups.length > 0 && (
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Pasta (opcional)</label>
                  <select
                    value={snapGroupId}
                    onChange={(e) => { setSnapGroupId(e.target.value); setSnapMsg(null); }}
                    style={{ ...INPUT_S, width: '100%', cursor: 'pointer' }}
                  >
                    <option value="">— Sem pasta —</option>
                    {profileGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={handleSaveSnapshot}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: COLORS.purple, color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                Salvar Mecânica
              </button>
            </div>
            {snapMsg && (
              <div style={{ marginTop: 8, fontSize: 12, color: snapMsg.ok ? COLORS.green : COLORS.accent }}>
                {snapMsg.ok ? '✓ ' : '✗ '}{snapMsg.text}
              </div>
            )}
          </>
        )}
      </div>

      <PrintFooter />
    </div>
  );
}
