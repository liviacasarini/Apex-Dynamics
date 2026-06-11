/**
 * Paleta de cores ApexDynamics — identidade visual racing premium.
 * O vermelho #e63946 é a cor da marca e não deve mudar.
 * Tons de fundo são "carbon black" com leve tinta azulada (estética cockpit).
 */

export const DARK_COLORS = {
  bg:           '#07090f',
  bgCard:       '#0f131c',
  bgCardHover:  '#151a26',
  bgElevated:   '#141927',
  border:       '#1d2433',
  borderLight:  '#2a3347',

  accent:       '#e63946',
  accentDark:   '#b01e2b',
  accentGlow:   'rgba(230,57,70,0.35)',
  accentSoft:   'rgba(230,57,70,0.12)',

  green:        '#06d6a0',
  yellow:       '#ffd166',
  blue:         '#118ab2',
  purple:       '#8338ec',
  orange:       '#ff6b35',
  cyan:         '#00f5d4',

  textPrimary:   '#f2f4f8',
  textSecondary: '#8f98ab',
  textMuted:     '#566073',

  shadowCard:   '0 1px 2px rgba(0,0,0,0.35), 0 12px 32px -16px rgba(0,0,0,0.55)',
  shadowPopup:  '0 16px 48px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
};

export const LIGHT_COLORS = {
  bg:           '#f3f4f8',
  bgCard:       '#ffffff',
  bgCardHover:  '#f5f6fa',
  bgElevated:   '#ffffff',
  border:       '#e2e5ee',
  borderLight:  '#d3d8e4',

  accent:       '#e63946',
  accentDark:   '#b01e2b',
  accentGlow:   'rgba(230,57,70,0.22)',
  accentSoft:   'rgba(230,57,70,0.09)',

  green:        '#05b88a',
  yellow:       '#c49000',
  blue:         '#0066aa',
  purple:       '#6a00d4',
  orange:       '#d44a00',
  cyan:         '#009b8a',

  textPrimary:   '#15181f',
  textSecondary: '#4a5264',
  textMuted:     '#79839a',

  shadowCard:   '0 1px 2px rgba(20,24,40,0.05), 0 10px 28px -18px rgba(20,24,40,0.16)',
  shadowPopup:  '0 16px 48px rgba(20,24,40,0.18), 0 2px 8px rgba(20,24,40,0.08)',
};

/** Fontes compartilhadas — display (racing), texto e dados numéricos */
export const FONTS = {
  display: "'Rajdhani', 'Inter', sans-serif",
  body:    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono:    "'JetBrains Mono', 'Consolas', monospace",
};

/** Alias de retrocompatibilidade — para componentes que ainda não usam useColors() */
export const COLORS = DARK_COLORS;

export const LAP_COLORS = [
  '#e63946', '#06d6a0', '#118ab2', '#ffd166', '#8338ec',
  '#ff6b35', '#00f5d4', '#f77f00', '#d62828', '#4cc9f0',
  '#7209b7', '#3a86a7', '#fb5607', '#06d6a0',
];

export const SEVERITY_COLORS = {
  high:   DARK_COLORS.accent,
  medium: DARK_COLORS.yellow,
  low:    DARK_COLORS.blue,
};
