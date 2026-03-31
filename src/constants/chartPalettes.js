/**
 * chartPalettes.js — Paletas de cores para gráficos, centralizadas.
 *
 * Extraídas de MathTab, TrackMapTab e LapCompareTab para eliminar duplicação.
 */

/* ── MathTab ──────────────────────────────────────────────────────────── */

/** Cores para linhas de gráfico no MathTab */
export const CHART_COLORS = ['#00ccff','#ff8800','#00cc44','#ff4444','#aa44ff','#ffcc00','#ff44aa','#44ffaa'];

/** Cores para linhas de comparação no MathTab */
export const CMP_COLORS   = ['#ff44aa','#44ffaa','#aa44ff','#ffd700','#ff6644','#00ccaa','#cc44ff','#88ccff'];

/** Padrões de dash para linhas de comparação no MathTab */
export const CMP_DASHES   = ['6 3', '4 2', '8 4', '3 2'];

/** Paleta de cores por fonte: índice 0 = arquivo principal, 1+ = fontes do perfil */
export const SOURCE_PALETTE = ['#ff5555','#4499ff','#44dd88','#ffcc44','#ff88cc','#44ccff','#cc88ff','#ffaa44'];

/* ── TrackMapTab ──────────────────────────────────────────────────────── */

/** Cores para os trechos de pista — alto contraste entre setores adjacentes */
export const SEGMENT_COLORS = [
  '#ff2d2d', '#00e5ff', '#ffdd00', '#ff6600', '#00ff88',
  '#cc44ff', '#ff69b4', '#00bfff', '#ff4500', '#39ff14',
];

/** Cores de alta distinção para sessões no mapa */
export const SESSION_COLORS = [
  '#e63946', '#118ab2', '#8338ec', '#06d6a0', '#f77f00',
  '#00b4d8', '#ef476f', '#ffd166', '#2d6a4f', '#e9c46a',
];

/* ── LapCompareTab ────────────────────────────────────────────────────── */

/** Cores de alta distinção visual para voltas selecionadas (pela ordem de seleção). */
export const COMPARE_COLORS = [
  '#e63946', // vermelho
  '#118ab2', // azul
  '#8338ec', // roxo
  '#06d6a0', // verde
  '#f77f00', // laranja
  '#00b4d8', // ciano
  '#ef476f', // rosa
  '#ffd166', // amarelo
  '#2d6a4f', // verde escuro
  '#e9c46a', // dourado
];
