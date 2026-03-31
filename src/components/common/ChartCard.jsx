import { useColors } from '@/context/ThemeContext';

export default function ChartCard({ title, children, height = 280 }) {
  const COLORS = useColors();
  return (
    <div
      style={{
        background: COLORS.bgCard,
        borderRadius: 10,
        border: `1px solid ${COLORS.border}`,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: COLORS.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      <div style={{ width: '100%', height }}>{children}</div>
    </div>
  );
}
