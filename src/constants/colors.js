export const DARK_COLORS = {
  bg:           '#0a0a0f',
  bgCard:       '#12121a',
  bgCardHover:  '#1a1a25',
  border:       '#1e1e2e',
  borderLight:  '#2a2a3e',

  accent:       '#e63946',
  accentGlow:   'rgba(230,57,70,0.3)',

  green:        '#06d6a0',
  yellow:       '#ffd166',
  blue:         '#118ab2',
  purple:       '#8338ec',
  orange:       '#ff6b35',
  cyan:         '#00f5d4',

  textPrimary:   '#f0f0f5',
  textSecondary: '#8888a0',
  textMuted:     '#55556a',
};

export const LIGHT_COLORS = {
  bg:           '#f4f4f8',
  bgCard:       '#ffffff',
  bgCardHover:  '#f0f0f5',
  border:       '#e0e0e8',
  borderLight:  '#d0d0dc',

  accent:       '#e63946',
  accentGlow:   'rgba(230,57,70,0.2)',

  green:        '#05b88a',
  yellow:       '#c49000',
  blue:         '#0066aa',
  purple:       '#6a00d4',
  orange:       '#d44a00',
  cyan:         '#009b8a',

  textPrimary:   '#111111',
  textSecondary: '#444455',
  textMuted:     '#777788',
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
