import { useColors } from '@/context/ThemeContext';

/**
 * Controle segmentado de 3 estados para filtro de voltas.
 * Usado em Overview, Relatório e Vitais.
 */
export default function FilterModeBar({ filterMode = 'filtered', setFilterMode, hasOutLap = false }) {
  const COLORS = useColors();

  if (!setFilterMode) return null;

  const buttons = [
    { mode: 'all',      label: 'Todas' },
    { mode: 'filtered', label: 'Filtradas' },
    ...(hasOutLap ? [{ mode: 'pitexit', label: 'Pit Exit' }] : []),
  ];

  return (
    <div style={{
      display: 'flex',
      borderRadius: 7,
      overflow: 'hidden',
      border: `1px solid ${COLORS.border}`,
      width: 'fit-content',
    }}>
      {buttons.map(({ mode, label }, idx) => {
        const active = filterMode === mode;
        const activeColor = mode === 'pitexit' ? COLORS.blue : mode === 'filtered' ? COLORS.green : COLORS.yellow;
        return (
          <button
            key={mode}
            onClick={() => setFilterMode(mode)}
            title={
              mode === 'all'      ? 'Ver todas as voltas sem filtro' :
              mode === 'filtered' ? 'Ocultar out-lap e voltas inválidas' :
              'Out-lap: tempo começa quando o carro acelerou na pista'
            }
            style={{
              padding: '5px 13px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              background: active ? `${activeColor}22` : 'transparent',
              border: 'none',
              borderLeft: idx > 0 ? `1px solid ${COLORS.border}` : 'none',
              color: active ? activeColor : COLORS.textSecondary,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
