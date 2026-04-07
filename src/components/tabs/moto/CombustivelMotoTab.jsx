/**
 * CombustivelMotoTab — Combustível para sprint e endurance.
 * Tanques menores (~21L sprint, ~24L endurance), consumo L/volta.
 */

import { useColors } from '@/context/ThemeContext';
import { MotoField, MotoCard, MotoHeader, motoFieldRow } from './_motoUI';
import { useMotoState } from './_motoStore';

const EMPTY = {
  raceType: 'sprint',          // sprint | endurance
  tankCapacity: '',            // L (21 sprint, 24 endurance típico)
  consumptionPerLap: '',       // L/volta
  raceLaps: '',                // voltas
  reservePct: '',              // % reserva
  pitStops: '',                // n° paradas (endurance)
  refuelTime: '',              // s por parada
  notes: '',
};

export default function CombustivelMotoTab({ workspaceId }) {
  const COLORS = useColors();
  const [s, setS] = useMotoState(workspaceId, 'combustivel', EMPTY);
  const set = (k) => (v) => setS((p) => ({ ...(p || EMPTY), [k]: v }));

  const cons = parseFloat(s.consumptionPerLap);
  const laps = parseFloat(s.raceLaps);
  const tank = parseFloat(s.tankCapacity);
  const reserve = parseFloat(s.reservePct);

  const totalNeeded = (!isNaN(cons) && !isNaN(laps)) ? cons * laps : null;
  const withReserve = (totalNeeded != null && !isNaN(reserve)) ? totalNeeded * (1 + reserve / 100) : totalNeeded;
  const stintsNeeded = (withReserve != null && !isNaN(tank) && tank > 0) ? Math.ceil(withReserve / tank) : null;
  const lapsPerTank = (!isNaN(cons) && cons > 0 && !isNaN(tank)) ? Math.floor(tank / cons) : null;

  return (
    <div style={{ padding: '20px 12px', maxWidth: 1100, margin: '0 auto' }}>
      <MotoHeader icon="⛽" title="Combustível — Moto" />

      <MotoCard title="🏁 Tipo de Corrida">
        <div style={motoFieldRow}>
          <MotoField
            label="Modalidade"
            value={s.raceType}
            onChange={set('raceType')}
            options={[
              { id: 'sprint', label: 'Sprint (≤ 25 voltas)' },
              { id: 'endurance', label: 'Endurance (8h, 12h, 24h)' },
            ]}
            half
          />
          <MotoField label="Capacidade Tanque" unit="L" value={s.tankCapacity} onChange={set('tankCapacity')} half placeholder="21 (sprint) / 24 (endurance)" />
        </div>
      </MotoCard>

      <MotoCard title="📊 Consumo">
        <div style={motoFieldRow}>
          <MotoField label="Consumo por volta" unit="L/volta" value={s.consumptionPerLap} onChange={set('consumptionPerLap')} third />
          <MotoField label="Voltas da corrida" value={s.raceLaps} onChange={set('raceLaps')} third />
          <MotoField label="Reserva de segurança" unit="%" value={s.reservePct} onChange={set('reservePct')} third />
        </div>
        {(totalNeeded != null || stintsNeeded != null) && (
          <div style={{
            display: 'flex', gap: 14, flexWrap: 'wrap',
            background: COLORS.bg, border: `1px solid ${COLORS.border}`,
            borderRadius: 8, padding: 14, marginTop: 6,
          }}>
            {totalNeeded != null && (
              <div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>Total estimado</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.accent }}>{totalNeeded.toFixed(2)} L</div>
              </div>
            )}
            {withReserve != null && withReserve !== totalNeeded && (
              <div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>Com reserva</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.green }}>{withReserve.toFixed(2)} L</div>
              </div>
            )}
            {lapsPerTank != null && (
              <div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>Voltas / tanque</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{lapsPerTank}</div>
              </div>
            )}
            {stintsNeeded != null && (
              <div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>Stints necessários</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{stintsNeeded}</div>
              </div>
            )}
          </div>
        )}
      </MotoCard>

      {s.raceType === 'endurance' && (
        <MotoCard title="🔧 Pit Stops (Endurance)">
          <div style={motoFieldRow}>
            <MotoField label="N° de pit stops planejados" value={s.pitStops} onChange={set('pitStops')} half />
            <MotoField label="Tempo médio de reabastecimento" unit="s" value={s.refuelTime} onChange={set('refuelTime')} half />
          </div>
        </MotoCard>
      )}

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
