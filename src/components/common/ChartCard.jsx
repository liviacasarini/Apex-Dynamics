import { useColors } from '@/context/ThemeContext';
import { FONTS } from '@/constants/colors';

export default function ChartCard({ title, children, height = 280 }) {
  const COLORS = useColors();
  return (
    <div
      style={{
        background: `linear-gradient(180deg, ${COLORS.bgCard} 0%, ${COLORS.bg} 160%)`,
        borderRadius: 14,
        border: `1px solid ${COLORS.border}`,
        boxShadow: COLORS.shadowCard,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 14,
          fontWeight: 700,
          color: COLORS.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '2px',
          marginBottom: 14,
          paddingLeft: 10,
          borderLeft: `3px solid ${COLORS.accent}`,
          lineHeight: 1.2,
        }}
      >
        {title}
      </div>
      <div style={{ width: '100%', height }}>{children}</div>
    </div>
  );
}
