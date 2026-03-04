import { COLORS } from '@/constants/colors';

export default function MetricCard({ label, value, unit, color, small }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 8px' }}>
      <div
        style={{
          fontSize: small ? 20 : 28,
          fontWeight: 800,
          color: color || COLORS.textPrimary,
          lineHeight: 1.1,
        }}
      >
        {value}
        <span
          style={{
            fontSize: small ? 11 : 13,
            color: COLORS.textMuted,
            marginLeft: 3,
          }}
        >
          {unit}
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          color: COLORS.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}
