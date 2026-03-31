/**
 * Fábrica de estilos reutilizáveis.
 * Recebe o objeto COLORS do tema ativo e retorna os estilos correspondentes.
 * Uso nos componentes: const theme = makeTheme(COLORS);
 */
import { COLORS } from '@/constants/colors';
export const makeTheme = (COLORS) => ({
  card: {
    background: COLORS.bgCard,
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    padding: 20,
    marginBottom: 16,
  },

  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    marginBottom: 14,
  },

  stat: {
    textAlign: 'center',
    padding: '12px 8px',
  },

  statValue: (color) => ({
    fontSize: 28,
    fontWeight: 800,
    color: color || COLORS.textPrimary,
    lineHeight: 1.1,
  }),

  statLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginTop: 4,
  },

  grid: (cols) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: 16,
  }),

  badge: (color) => ({
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: `${color}22`,
    color,
    border: `1px solid ${color}44`,
  }),

  select: {
    background: COLORS.bgCard,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 13,
    outline: 'none',
    cursor: 'pointer',
  },

  pillButton: (active) => ({
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    background: active ? `${COLORS.accent}20` : 'transparent',
    color: active ? COLORS.accent : COLORS.textSecondary,
    fontWeight: active ? 600 : 400,
    transition: 'all 0.2s',
  }),

  lapChip: (active, color) => ({
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    border: `2px solid ${active ? color : COLORS.border}`,
    background: active ? `${color}15` : 'transparent',
    color: active ? color : COLORS.textSecondary,
    fontWeight: active ? 700 : 400,
    transition: 'all 0.2s',
  }),
});

/** Alias de retrocompatibilidade para componentes que ainda importam `theme` diretamente */
export const theme = makeTheme(COLORS);
