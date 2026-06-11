import { useColors } from '@/context/ThemeContext';
import { FONTS } from '@/constants/colors';

export default function MetricCard({ label, value, unit, color, small }) {
  const COLORS = useColors();
  return (
    <div style={{ textAlign: 'center', padding: '12px 8px' }}>
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: small ? 19 : 27,
          fontWeight: 700,
          color: color || COLORS.textPrimary,
          lineHeight: 1.1,
          letterSpacing: '-0.5px',
        }}
      >
        {value}
        <span
          style={{
            fontSize: small ? 10.5 : 12.5,
            fontWeight: 500,
            color: COLORS.textMuted,
            marginLeft: 4,
            letterSpacing: 0,
          }}
        >
          {unit}
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: COLORS.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '1.2px',
          marginTop: 5,
        }}
      >
        {label}
      </div>
    </div>
  );
}
