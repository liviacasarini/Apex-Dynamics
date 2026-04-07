/**
 * RegulamentacoesMotoTab — Presets WSBK / MotoGP / Moto2 / SuperSport / SBK Brasil.
 * Editáveis e persistidos por workspace.
 */

import { useState } from 'react';
import { useColors } from '@/context/ThemeContext';
import { MotoField, MotoCard, MotoHeader, motoFieldRow } from './_motoUI';
import { useMotoState } from './_motoStore';

const PRESETS = {
  WSBK: {
    name: 'WSBK (FIM Superbike World Championship)',
    minWeight: '168',     // kg moto seca
    maxDisplacement: '1000',
    cylinders: '4 ou menos',
    fuel: '24 L (sprint) / 24 L',
    rimSize: '17"',
    tyreSupplier: 'Pirelli (único)',
    ecu: 'Homologada (Marelli)',
    abs: 'Permitido (Race ABS opcional)',
    tractionControl: 'Permitido (oficial Marelli)',
    quickShifter: 'Permitido',
    minRiderAge: '18',
  },
  MOTOGP: {
    name: 'MotoGP (FIM Grand Prix)',
    minWeight: '157',
    maxDisplacement: '1000',
    cylinders: '4 (max), 81 mm bore',
    fuel: '22 L',
    rimSize: '17"',
    tyreSupplier: 'Michelin (único)',
    ecu: 'Marelli unificada',
    abs: 'Proibido',
    tractionControl: 'Permitido (sob ECU unificada)',
    quickShifter: 'Permitido',
    minRiderAge: '18',
  },
  MOTO2: {
    name: 'Moto2 (Grand Prix)',
    minWeight: '217',     // moto+piloto
    maxDisplacement: '765',
    cylinders: 'Triumph 765 inline-3 (único)',
    fuel: '24 L',
    rimSize: '17"',
    tyreSupplier: 'Pirelli',
    ecu: 'Magneti Marelli (controlada)',
    abs: 'Proibido',
    tractionControl: 'Proibido',
    quickShifter: 'Permitido',
    minRiderAge: '16',
  },
  SUPERSPORT: {
    name: 'SuperSport World (SSP)',
    minWeight: '161',
    maxDisplacement: '600 (4cyl) / 750 (3cyl) / 955 (2cyl)',
    cylinders: 'Variável',
    fuel: '22 L',
    rimSize: '17"',
    tyreSupplier: 'Pirelli',
    ecu: 'Homologada',
    abs: 'Permitido',
    tractionControl: 'Permitido',
    quickShifter: 'Permitido',
    minRiderAge: '16',
  },
  SBK_BR: {
    name: 'SuperBike Brasil',
    minWeight: '168',
    maxDisplacement: '1000',
    cylinders: '4',
    fuel: '24 L',
    rimSize: '17"',
    tyreSupplier: 'Pirelli',
    ecu: 'Livre / categoria-dependente',
    abs: 'Conforme regulamento',
    tractionControl: 'Permitido',
    quickShifter: 'Permitido',
    minRiderAge: '16',
  },
};

const FIELDS = [
  ['minWeight', 'Peso mínimo', 'kg'],
  ['maxDisplacement', 'Cilindrada máxima', 'cm³'],
  ['cylinders', 'Cilindros / configuração', ''],
  ['fuel', 'Combustível (capacidade)', ''],
  ['rimSize', 'Rodas', ''],
  ['tyreSupplier', 'Pneus (fornecedor)', ''],
  ['ecu', 'ECU', ''],
  ['abs', 'ABS', ''],
  ['tractionControl', 'Traction Control', ''],
  ['quickShifter', 'Quick Shifter', ''],
  ['minRiderAge', 'Idade mínima do piloto', 'anos'],
];

export default function RegulamentacoesMotoTab({ workspaceId }) {
  const COLORS = useColors();
  const [data, setData] = useMotoState(workspaceId, 'regulamentacoes', { category: 'WSBK', custom: {} });
  const [presetKey, setPresetKey] = useState(data.category || 'WSBK');

  const merged = { ...PRESETS[presetKey], ...(data.custom?.[presetKey] || {}) };

  const update = (k) => (v) => {
    setData((p) => ({
      ...(p || {}),
      category: presetKey,
      custom: {
        ...(p?.custom || {}),
        [presetKey]: { ...(p?.custom?.[presetKey] || {}), [k]: v },
      },
    }));
  };

  const resetCategory = () => {
    if (!confirm('Restaurar valores padrão da categoria?')) return;
    setData((p) => ({
      ...(p || {}),
      custom: { ...(p?.custom || {}), [presetKey]: {} },
    }));
  };

  return (
    <div style={{ padding: '20px 12px', maxWidth: 1100, margin: '0 auto' }}>
      <MotoHeader icon="📜" title="Regulamentações — Moto" right={
        <button onClick={resetCategory} style={{
          background: 'transparent', border: `1px solid ${COLORS.border}`,
          color: COLORS.textSecondary, borderRadius: 6, padding: '8px 14px', fontSize: 12, cursor: 'pointer',
        }}>↺ Restaurar padrão</button>
      } />

      <MotoCard title="🏆 Categoria">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(PRESETS).map(([k, p]) => (
            <button key={k} onClick={() => { setPresetKey(k); setData((d) => ({ ...(d || {}), category: k })); }}
              style={{
                padding: '8px 14px', fontSize: 12, fontWeight: 600,
                borderRadius: 6, cursor: 'pointer',
                background: presetKey === k ? COLORS.accent : 'transparent',
                color: presetKey === k ? '#fff' : COLORS.textSecondary,
                border: `1px solid ${presetKey === k ? COLORS.accent : COLORS.border}`,
              }}>
              {p.name.split(' ')[0]}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 10 }}>
          {PRESETS[presetKey].name}
        </div>
      </MotoCard>

      <MotoCard title="📋 Parâmetros">
        <div style={motoFieldRow}>
          {FIELDS.map(([k, label, unit]) => (
            <MotoField key={k} label={label} unit={unit} value={merged[k]} onChange={update(k)} half />
          ))}
        </div>
      </MotoCard>
    </div>
  );
}
