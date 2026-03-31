/**
 * Banco de pistas conhecidas.
 * Adicionar novos autódromos aqui no futuro.
 */
import * as Interlagos     from './interlagos.js';
import * as Cascavel       from './cascavel.js';
import * as Londrina       from './londrina.js';
import * as CampoGrande    from './campo_grande.js';
import * as Velocitta      from './velocitta.js';
import * as Goiania        from './goiania.js';
import * as Taruma         from './taruma.js';
import * as SantaCruzDoSul from './santa_cruz_do_sul.js';
import * as Brasilia       from './brasilia.js';
import * as Caruaru        from './caruaru.js';

function makeEntry(mod) {
  return {
    ...mod.TRACK_INFO,
    bounds:          mod.BOUNDS,
    center:          mod.CENTER,
    detectionRadius: mod.DETECTION_RADIUS_M,
    centerline:      mod.CENTERLINE,
    corners:         mod.CORNERS,         // array de objetos de curva (usado pelo TrackMapTab)
    cornersCount:    mod.TRACK_INFO.corners, // número de curvas do TRACK_INFO (usado pelo PistasTab)
    sectors:         mod.SECTORS,
  };
}

export const TRACK_DATABASE = [
  makeEntry(Interlagos),
  makeEntry(Cascavel),
  makeEntry(Londrina),
  makeEntry(CampoGrande),
  makeEntry(Velocitta),
  makeEntry(Goiania),
  makeEntry(Taruma),
  makeEntry(SantaCruzDoSul),
  makeEntry(Brasilia),
  makeEntry(Caruaru),
];

/**
 * Calcula distância em metros entre dois pontos lat/lng (Haversine).
 */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Tenta detectar a pista com base em um conjunto de pontos GPS do piloto.
 *
 * @param {Array<{lat: number, lng: number}>} gpsPoints
 * @returns {object|null} Track object or null if not recognized
 */
export function detectTrack(gpsPoints) {
  if (!gpsPoints || gpsPoints.length < 10) return null;

  // Amostrar até 300 pontos
  const step = Math.max(1, Math.floor(gpsPoints.length / 300));
  const sampled = gpsPoints.filter((_, i) => i % step === 0);

  for (const track of TRACK_DATABASE) {
    const b = track.bounds;
    // Padding de ~1 km em cada lado para absorver saídas do box, etc.
    const padLat = 0.010;
    const padLng = 0.010;

    // Verificação 1: quantos pontos amostrados caem dentro do bounding box (com padding)?
    const inBounds = sampled.filter((p) =>
      p.lat >= b.minLat - padLat && p.lat <= b.maxLat + padLat &&
      p.lng >= b.minLng - padLng && p.lng <= b.maxLng + padLng
    );

    // Precisa de pelo menos 15 % dos pontos dentro dos bounds para continuar
    if (inBounds.length < sampled.length * 0.15) continue;

    // Verificação 2: centróide apenas dos pontos dentro dos bounds vs centro da pista
    const centLat = inBounds.reduce((s, p) => s + p.lat, 0) / inBounds.length;
    const centLng = inBounds.reduce((s, p) => s + p.lng, 0) / inBounds.length;
    const dist = haversineMeters(centLat, centLng, track.center.lat, track.center.lng);
    if (dist <= track.detectionRadius) return track;
  }

  return null;
}

/**
 * Retorna uma pista pelo ID.
 */
export function getTrackById(id) {
  return TRACK_DATABASE.find((t) => t.id === id) || null;
}
