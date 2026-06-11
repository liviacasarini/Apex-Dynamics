/**
 * Fábrica de estilos reutilizáveis.
 * Recebe o objeto COLORS do tema ativo e retorna os estilos correspondentes.
 * Uso nos componentes: const theme = makeTheme(COLORS);
 *
 * A API (nomes e assinaturas) é estável — todas as abas dependem dela.
 */
import { COLORS, FONTS } from '@/constants/colors';

export const makeTheme = (COLORS) => ({
  card: {
    background: `linear-gradient(180deg, ${COLORS.bgCard} 0%, ${COLORS.bg} 160%)`,
    borderRadius: 14,
    border: `1px solid ${COLORS.border}`,
    boxShadow: COLORS.shadowCard,
    padding: 20,
    marginBottom: 16,
  },

  cardTitle: {
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
  },

  stat: {
    textAlign: 'center',
    padding: '12px 8px',
  },

  statValue: (color) => ({
    fontFamily: FONTS.mono,
    fontSize: 27,
    fontWeight: 700,
    color: color || COLORS.textPrimary,
    lineHeight: 1.1,
    letterSpacing: '-0.5px',
  }),

  statLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '1.2px',
    marginTop: 5,
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
    fontWeight: 700,
    letterSpacing: '0.3px',
    background: `${color}1c`,
    color,
    border: `1px solid ${color}44`,
  }),

  select: {
    background: COLORS.bgElevated || COLORS.bgCard,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: '7px 12px',
    fontSize: 13,
    outline: 'none',
    cursor: 'pointer',
  },

  pillButton: (active) => ({
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 12,
    cursor: 'pointer',
    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    background: active ? (COLORS.accentSoft || `${COLORS.accent}20`) : 'transparent',
    color: active ? COLORS.accent : COLORS.textSecondary,
    fontWeight: 600,
    boxShadow: active ? `0 0 0 1px ${COLORS.accent}22, 0 4px 14px -8px ${COLORS.accent}88` : 'none',
    transition: 'all 0.2s',
  }),

  lapChip: (active, color) => ({
    padding: '8px 16px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: FONTS.mono,
    border: `2px solid ${active ? color : COLORS.border}`,
    background: active ? `${color}15` : 'transparent',
    color: active ? color : COLORS.textSecondary,
    fontWeight: active ? 700 : 500,
    boxShadow: active ? `0 4px 16px -8px ${color}99` : 'none',
    transition: 'all 0.2s',
  }),
});

/** Alias de retrocompatibilidade para componentes que ainda importam `theme` diretamente */
export const theme = makeTheme(COLORS);
