/**
 * PesoMotoTab — Pesagem de moto + piloto.
 *
 * 2 pontos (dianteiro/traseiro), peso seco/úmido, peso com piloto vestido,
 * equipamento (macacão+capacete+airbag+botas), referência regulamentar.
 */

import { useColors } from '@/context/ThemeContext';
import { MotoField, MotoCard, MotoHeader, motoFieldRow } from './_motoUI';
import { useMotoState } from './_motoStore';

const EMPTY = {
  date: new Date().toISOString().split('T')[0],
  // Moto
  bikeDryWeight: '',     // kg sem fluidos
  bikeWetWeight: '',     // kg com fluidos
  bikeFrontWeight: '',   // kg
  bikeRearWeight: '',    // kg
  // Piloto
  riderNakedWeight: '',  // kg sem equipamento
  riderGearWeight: '',   // kg com macacão+capacete+botas+airbag
  // Combinado
  totalWithRider: '',    // calculado, mas editável
  // Regulamentar
  regulationMin: '',     // ex: 168 kg WSBK
  notes: '',
};

export default function PesoMotoTab({ workspaceId }) {
  const COLORS = useColors();
  const [s, setS] = useMotoState(workspaceId, 'peso', EMPTY);
  const set = (k) => (v) => setS((p) => ({ ...(p || EMPTY), [k]: v }));

  const front = parseFloat(s.bikeFrontWeight);
  const rear  = parseFloat(s.bikeRearWeight);
  const total = (!isNaN(front) && !isNaN(rear)) ? (front + rear) : null;
  const distF = total ? ((front / total) * 100).toFixed(1) : null;
  const distR = total ? ((rear  / total) * 100).toFixed(1) : null;

  const reg     = parseFloat(s.regulationMin);
  const dryW    = parseFloat(s.bikeDryWeight);
  const regOK   = (!isNaN(reg) && !isNaN(dryW)) ? dryW >= reg : null;

  return (
    <div style={{ padding: '20px 12px', maxWidth: 1100, margin: '0 auto' }}>
      <MotoHeader icon="⚖️" title="Peso — Moto" />

      <MotoCard title="🏍️ Moto">
        <div style={motoFieldRow}>
          <MotoField label="Data" value={s.date} onChange={set('date')} third />
          <MotoField label="Peso Seco (sem fluidos)" unit="kg" value={s.bikeDryWeight} onChange={set('bikeDryWeight')} third />
          <MotoField label="Peso Úmido (com fluidos)" unit="kg" value={s.bikeWetWeight} onChange={set('bikeWetWeight')} third />
          <MotoField label="Peso Dianteiro" unit="kg" value={s.bikeFrontWeight} onChange={set('bikeFrontWeight')} half />
          <MotoField label="Peso Traseiro" unit="kg" value={s.bikeRearWeight} onChange={set('bikeRearWeight')} half />
        </div>
        {total !== null && (
          <div style={{
            background: COLORS.bg, border: `1px solid ${COLORS.border}`,
            borderRadius: 8, padding: 14, marginTop: 6,
            display: 'flex', gap: 24, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>Total (eixos)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.accent }}>{total.toFixed(1)} kg</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>Distribuição F / R</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.green }}>{distF}% / {distR}%</div>
            </div>
          </div>
        )}
      </MotoCard>

      <MotoCard title="🪖 Piloto">
        <div style={motoFieldRow}>
          <MotoField label="Piloto (sem equipamento)" unit="kg" value={s.riderNakedWeight} onChange={set('riderNakedWeight')} half />
          <MotoField label="Piloto + Equipamento (macacão, capacete, airbag, botas)" unit="kg" value={s.riderGearWeight} onChange={set('riderGearWeight')} half />
        </div>
        {(() => {
          const bw = parseFloat(s.bikeWetWeight) || parseFloat(s.bikeDryWeight);
          const rg = parseFloat(s.riderGearWeight);
          if (isNaN(bw) || isNaN(rg)) return null;
          return (
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 6 }}>
              Total moto + piloto vestido: <strong style={{ color: COLORS.accent }}>{(bw + rg).toFixed(1)} kg</strong>
            </div>
          );
        })()}
      </MotoCard>

      <MotoCard title="📜 Regulamentação">
        <div style={motoFieldRow}>
          <MotoField label="Peso Mínimo Regulamentar (categoria)" unit="kg" value={s.regulationMin} onChange={set('regulationMin')} half placeholder="Ex: 168 (WSBK)" />
        </div>
        {regOK !== null && (
          <div style={{
            padding: '10px 14px', borderRadius: 6, marginTop: 4,
            background: regOK ? `${COLORS.green}18` : `${COLORS.accent}18`,
            border: `1px solid ${regOK ? COLORS.green : COLORS.accent}55`,
            color: regOK ? COLORS.green : COLORS.accent, fontSize: 13, fontWeight: 600,
          }}>
            {regOK ? '✓ Acima do peso mínimo' : `⚠️ ${(reg - dryW).toFixed(1)} kg abaixo do mínimo`}
          </div>
        )}
      </MotoCard>

      <MotoCard title="📝 Notas">
        <textarea
          value={s.notes || ''} onChange={(e) => set('notes')(e.target.value)}
          rows={4}
          style={{
            width: '100%', background: COLORS.bg, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`, borderRadius: 6,
            padding: '10px 12px', fontSize: 13, outline: 'none',
            boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      </MotoCard>
    </div>
  );
}
