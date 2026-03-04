import { COLORS } from '@/constants/colors';

export default function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: '#1a1a25ee',
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
          <b>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</b>
        </div>
      ))}
    </div>
  );
}
