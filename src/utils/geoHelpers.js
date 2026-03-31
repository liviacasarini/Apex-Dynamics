/**
 * geoHelpers.js — Helpers de projeção GPS para renderização de mapas.
 *
 * calcBounds e project extraídos de TrackMapTab.jsx e OnboardingTab.jsx.
 * Cada tab tinha sua própria versão; aqui unificamos as duas variantes.
 */

/**
 * Calcula bounding box a partir de um array (ou array de arrays) de pontos GPS.
 * Adiciona 8% de padding em cada direção.
 *
 * Versão do TrackMapTab (recebe array de arrays e faz flat).
 *
 * @param {Array<Array<{lat: number, lng: number}>>} pointsArray
 * @returns {{ minLat, maxLat, minLng, maxLng } | null}
 */
export function calcBounds(pointsArray) {
  const allPts = pointsArray.flat();
  if (!allPts.length) return null;
  let minLat = allPts[0].lat, maxLat = allPts[0].lat;
  let minLng = allPts[0].lng, maxLng = allPts[0].lng;
  for (const p of allPts) {
    if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
  }
  const padLat = (maxLat - minLat) * 0.08 || 0.001;
  const padLng = (maxLng - minLng) * 0.08 || 0.001;
  return {
    minLat: minLat - padLat, maxLat: maxLat + padLat,
    minLng: minLng - padLng, maxLng: maxLng + padLng,
  };
}

/**
 * Projeta coordenadas GPS (lat, lng) para coordenadas de pixel no SVG/Canvas.
 *
 * Versão genérica que aceita dimensões e padding como parâmetros.
 *
 * @param {{ lat: number, lng: number }} p — ponto GPS
 * @param {{ minLat, maxLat, minLng, maxLng }} bounds — bounding box
 * @param {number} width — largura do canvas/SVG
 * @param {number} height — altura do canvas/SVG
 * @param {number} [padding=0] — padding interno
 * @returns {{ x: number, y: number }}
 */
export function project(p, bounds, width, height, padding = 0) {
  if (!bounds) return { x: 0, y: 0 };
  return {
    x: padding + ((p.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (width - 2 * padding),
    y: padding + (1 - (p.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (height - 2 * padding),
  };
}
