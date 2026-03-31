/**
 * colorInterpolation.js — Interpolação de cores para gradientes de telemetria.
 *
 * lerpGradient extraído de TrackMapTab.jsx
 * lerpColor extraído de OnboardingTab.jsx
 *
 * Ambas funções usam a mesma lógica de interpolação multi-stop
 * (azul → amarelo → vermelho) para mapear valores normalizados [0..1] a cores.
 */

/**
 * Interpola entre 3 stops de cor para um ratio [0..1].
 * Stops: Azul(lento) → Amarelo(médio) → Vermelho(rápido)
 *
 * Extraído de TrackMapTab.jsx.
 */
export function lerpGradient(ratio) {
  const stops = [
    [30,  80, 255],   // azul   — lento
    [255, 220,  0],   // amarelo — médio
    [255,  20,  20],  // vermelho — rápido
  ];
  const t  = Math.min(1, Math.max(0, ratio)) * (stops.length - 1);
  const i  = Math.min(Math.floor(t), stops.length - 2);
  const f  = t - i;
  return `rgb(${Math.round(stops[i][0] + f*(stops[i+1][0]-stops[i][0]))},${
               Math.round(stops[i][1] + f*(stops[i+1][1]-stops[i][1]))},${
               Math.round(stops[i][2] + f*(stops[i+1][2]-stops[i][2]))})`;
}

/**
 * Interpola entre 3 stops de cor para um ratio [0..1].
 * Stops: Azul(lento) → Amarelo(médio) → Vermelho(rápido)
 *
 * Extraído de OnboardingTab.jsx.
 */
export function lerpColor(ratio) {
  const stops = [[30,80,255],[255,220,0],[255,20,20]];
  const t = Math.min(1, Math.max(0, ratio)) * (stops.length - 1);
  const i = Math.min(Math.floor(t), stops.length - 2);
  const f = t - i;
  return `rgb(${Math.round(stops[i][0]+f*(stops[i+1][0]-stops[i][0]))},${
               Math.round(stops[i][1]+f*(stops[i+1][1]-stops[i][1]))},${
               Math.round(stops[i][2]+f*(stops[i+1][2]-stops[i][2]))})`;
}
