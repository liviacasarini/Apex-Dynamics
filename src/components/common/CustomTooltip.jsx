import { useColors } from '@/context/ThemeContext';

export default function CustomTooltip({ active, payload, label, decimals, perKeyDecimals }) {
  const COLORS = useColors();
  if (!active || !payload?.length) return null;

  const fmt = (p) => {
    if (typeof p.value !== 'number') return p.value;
    const d = perKeyDecimals?.[p.dataKey] ?? decimals ?? 1;
    return p.value.toFixed(d);
  };

  return (
    <div
      style={{
        background: COLORS.bgCard + 'ee',
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 12,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ color: COLORS.textMuted, marginBottom: 6 }}>
        {typeof label === 'number' ? label.toFixed(2) + 's' : label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}:{' '}
          <b>{fmt(p)}</b>
        </div>
      ))}
    </div>
  );
}
