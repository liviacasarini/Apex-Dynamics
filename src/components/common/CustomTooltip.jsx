import { useColors } from '@/context/ThemeContext';
import { FONTS } from '@/constants/colors';

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
        background: (COLORS.bgElevated || COLORS.bgCard) + 'f2',
        border: `1px solid ${COLORS.borderLight}`,
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 12,
        fontFamily: FONTS.mono,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: COLORS.shadowPopup || '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{
        color: COLORS.textMuted, marginBottom: 6,
        fontSize: 10.5, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '1px',
        fontFamily: FONTS.body,
      }}>
        {typeof label === 'number' ? label.toFixed(2) + 's' : label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{
          color: p.color, marginBottom: 3,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: 2, flexShrink: 0,
            background: p.color, boxShadow: `0 0 5px ${p.color}88`,
          }} />
          <span style={{ fontFamily: FONTS.body, fontSize: 11.5 }}>{p.name}:</span>
          <b>{fmt(p)}</b>
        </div>
      ))}
    </div>
  );
}
