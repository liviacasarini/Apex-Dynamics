/**
 * Analisador de Traçado de Corrida.
 *
 * Compara o traçado GPS do piloto com a linha de centro da pista (centerline)
 * e gera feedback por curva sobre posicionamento lateral.
 */

/** Converte graus para radianos */
const deg2rad = (d) => (d * Math.PI) / 180;

/**
 * Converte lat/lng para coordenadas planas em metros
 * usando aproximação equiretangular centrada num ponto de referência.
 * Válido para áreas pequenas (<50 km).
 */
function toMeters(lat, lng, refLat, refLng) {
  const R = 6371000;
  const x = (lng - refLng) * deg2rad(1) * R * Math.cos(deg2rad(refLat));
  const y = (lat - refLat) * deg2rad(1) * R;
  return { x, y };
}

/**
 * Distância perpendicular com sinal de um ponto P ao segmento A→B (em metros).
 * Positivo = P está à DIREITA do vetor A→B (lado externo em curva à direita).
 * Negativo = P está à ESQUERDA.
 *
 * Usa coordenadas planas (metros).
 */
function perpSignedDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return 0;
  // Produto vetorial 2D → positivo = à direita do vetor A→B
  return ((px - ax) * dy - (py - ay) * dx) / len;
}

/**
 * Para cada ponto do piloto, encontra o segmento mais próximo da centerline
 * e calcula o offset lateral perpendicular (em metros).
 *
 * @param {Array<{lat,lng}>} driverPoints
 * @param {Array<{lat,lng}>} centerline
 * @param {{lat,lng}} ref  — ponto de referência para conversão plana
 * @returns {Array<{clIdx: number, offset: number}>}
 */
function projectDriverPoints(driverPoints, centerline, ref) {
  const clM = centerline.map((p) => toMeters(p.lat, p.lng, ref.lat, ref.lng));
  const n = clM.length;

  return driverPoints.map((dp) => {
    const pm = toMeters(dp.lat, dp.lng, ref.lat, ref.lng);
    let bestDist = Infinity;
    let bestClIdx = 0;
    let bestOffset = 0;

    for (let i = 0; i < n - 1; i++) {
      const a = clM[i];
      const b = clM[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;

      // Projeção do ponto no segmento (t ∈ [0,1])
      let t = lenSq > 0 ? ((pm.x - a.x) * dx + (pm.y - a.y) * dy) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));

      const closestX = a.x + t * dx;
      const closestY = a.y + t * dy;
      const dist = Math.sqrt((pm.x - closestX) ** 2 + (pm.y - closestY) ** 2);

      if (dist < bestDist) {
        bestDist = dist;
        bestClIdx = i;
        bestOffset = perpSignedDistance(pm.x, pm.y, a.x, a.y, b.x, b.y);
      }
    }

    return { clIdx: bestClIdx, offset: bestOffset, distFromLine: bestDist };
  });
}

/**
 * Retorna o label de posição lateral para o piloto.
 * O sinal do offset depende do tipo de curva:
 *   curva à direita → lado de dentro = positivo (direita do vetor)
 *   curva à esquerda → lado de dentro = negativo (esquerda do vetor)
 */
function getPositionLabel(avgOffset, cornerType) {
  const abs = Math.abs(avgOffset);
  if (abs < 1.2) return { label: 'Traçado ideal', level: 'good', color: '#06d6a0' };

  const inside  = cornerType === 'right' ?  avgOffset > 0 : avgOffset < 0;
  const outside = !inside;

  if (abs < 2.8) {
    return inside
      ? { label: 'Ligeiramente por dentro', level: 'info',    color: '#ffd166' }
      : { label: 'Ligeiramente por fora',   level: 'info',    color: '#ffd166' };
  }
  if (abs < 5.0) {
    return inside
      ? { label: 'Muito por dentro',    level: 'warning', color: '#f77f00' }
      : { label: 'Muito por fora',      level: 'warning', color: '#f77f00' };
  }
  return inside
    ? { label: 'Extremamente por dentro', level: 'bad', color: '#e63946' }
    : { label: 'Extremamente por fora',   level: 'bad', color: '#e63946' };
}

/**
 * Gera texto de conselho por curva com base no desvio lateral médio.
 */
function generateCornerAdvice(corner, avgOffset) {
  const abs = Math.abs(avgOffset);
  if (abs < 1.2) return 'Traçado dentro do ideal — bom trabalho!';

  const type = corner.type;
  const isRight = type === 'right' || type === 'complex';
  const isInsideLine = isRight ? avgOffset > 0 : avgOffset < 0;

  if (corner.id === 'senna_s') {
    if (isInsideLine && abs > 2) return 'Entre mais aberto na Curva 1 para ter melhor ângulo na Curva 2.';
    if (!isInsideLine && abs > 2) return 'Não abra tanto a entrada — você perde ângulo para a segunda parte do S.';
    return corner.description;
  }

  if (corner.id === 'cotovelo') {
    if (!isInsideLine && abs > 2) return 'Saída muito aberta no Cotovelo — perde velocidade na reta principal.';
    if (isInsideLine && abs > 2) return 'Ápex muito fechado — abra mais a saída para maximizar velocidade na reta.';
  }

  if (corner.id === 'bico_de_pato') {
    if (isInsideLine && abs > 2) return 'Entrada muito por dentro no Bico de Pato — retarde o ápex para melhor saída.';
    if (!isInsideLine && abs > 2) return 'Entrada muito por fora — chega tarde ao ponto de frenagem ideal.';
  }

  // Conselho genérico baseado na direção do desvio
  const offsetM = abs.toFixed(1);
  if (isInsideLine) {
    return `Traçado ${offsetM}m por dentro do ideal em ${corner.name}. Abra mais a entrada para usar toda a largura.`;
  } else {
    return `Traçado ${offsetM}m por fora do ideal em ${corner.name}. Aproxime-se mais do lado de dentro na entrada.`;
  }
}

/**
 * Projeta todos os pontos GPS do piloto na centerline.
 * Retorna por ponto: segIdx, t (0..1 ao longo do segmento),
 * lateralOffset (metros, + = direita, - = esquerda) e telemetria.
 *
 * Usado para renderização "track-relative": posicionar o traçado do
 * piloto dentro da banda da pista em vez de usar coordenadas GPS brutas.
 *
 * @param {Array<{lat,lng,speed,throttle,brake}>} driverPoints
 * @param {Array<{lat,lng}>}                      centerline  — já alinhada ao GPS do piloto
 * @param {{lat,lng}}                             ref         — ponto de referência para conversão plana
 * @returns {Array<{segIdx,t,lateralOffset,speed,throttle,brake}>}
 */
export function projectAllDriverPoints(driverPoints, centerline, ref) {
  if (!driverPoints?.length || !centerline || centerline.length < 2) return [];

  const valid = driverPoints.filter((p) => {
    const lat = parseFloat(p.lat);
    const lng = parseFloat(p.lng);
    return lat && lng && lat !== 0 && !isNaN(lat) && !isNaN(lng);
  });
  if (!valid.length) return [];

  const clM = centerline.map((p) =>
    toMeters(parseFloat(p.lat), parseFloat(p.lng), ref.lat, ref.lng)
  );
  const n = clM.length;

  return valid.map((dp) => {
    const pm = toMeters(parseFloat(dp.lat), parseFloat(dp.lng), ref.lat, ref.lng);

    let bestDist = Infinity;
    let bestSegIdx = 0;
    let bestT = 0;
    let bestOffset = 0;

    for (let i = 0; i < n - 1; i++) {
      const a = clM[i];
      const b = clM[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;

      let t = lenSq > 0 ? ((pm.x - a.x) * dx + (pm.y - a.y) * dy) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));

      const cx = a.x + t * dx;
      const cy = a.y + t * dy;
      const dist = Math.sqrt((pm.x - cx) ** 2 + (pm.y - cy) ** 2);

      if (dist < bestDist) {
        bestDist = dist;
        bestSegIdx = i;
        bestT = t;
        bestOffset = perpSignedDistance(pm.x, pm.y, a.x, a.y, b.x, b.y);
      }
    }

    return {
      segIdx: bestSegIdx,
      t: bestT,
      lateralOffset: bestOffset,
      speed: parseFloat(dp.speed) || 0,
      throttle: parseFloat(dp.throttle) || 0,
      brake: parseFloat(dp.brake) || 0,
    };
  });
}

/**
 * Auto-detecta curvas a partir da geometria da centerline.
 * Calcula a variação de ângulo em cada vértice, suaviza e identifica regiões de curvatura.
 */
export function detectCornersFromCenterline(centerline) {
  if (!centerline || centerline.length < 4) return [];

  const ref = centerline[0];
  const pts = centerline.map((p) => toMeters(p.lat, p.lng, ref.lat, ref.lng));
  const n = pts.length;

  // Variação de ângulo (radianos) em cada vértice — positivo = esquerda, negativo = direita
  const delta = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const ax = pts[i].x - pts[i - 1].x, ay = pts[i].y - pts[i - 1].y;
    const bx = pts[i + 1].x - pts[i].x,   by = pts[i + 1].y - pts[i].y;
    let ang = Math.atan2(by, bx) - Math.atan2(ay, ax);
    while (ang >  Math.PI) ang -= 2 * Math.PI;
    while (ang < -Math.PI) ang += 2 * Math.PI;
    delta[i] = ang;
  }

  // Suavização com janela de ±2 vértices
  const W = 2;
  const smooth = delta.map((_, i) => {
    let s = 0, cnt = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) { s += delta[j]; cnt++; }
    return s / cnt;
  });

  const THRESH     = 0.05;  // ~3° por vértice — limiar de entrada na curva
  const EXIT_MULT  = 0.25;  // sai da curva quando cai abaixo de 25% do limiar
  const MIN_VERTS  = 2;     // mínimo de vértices para ser considerada curva

  const corners = [];
  let inCorner = false, startI = 0, cornerType = 'right', num = 1;

  for (let i = 1; i < n - 1; i++) {
    const abs = Math.abs(smooth[i]);
    const type = smooth[i] > 0 ? 'left' : 'right';

    if (!inCorner && abs > THRESH) {
      inCorner = true;
      startI = Math.max(0, i - 1);
      cornerType = type;
    } else if (inCorner && abs < THRESH * EXIT_MULT) {
      const endI = Math.min(n - 1, i + 1);
      if (endI - startI >= MIN_VERTS) {
        corners.push({ id: `c${num}`, name: `Curva ${num}`, type: cornerType,
          startIdx: startI, endIdx: endI, description: `Curva ${num}` });
        num++;
      }
      inCorner = false;
    }
  }
  if (inCorner && (n - 1 - startI) >= MIN_VERTS) {
    corners.push({ id: `c${num}`, name: `Curva ${num}`, type: cornerType,
      startIdx: startI, endIdx: n - 2, description: `Curva ${num}` });
  }

  return corners;
}

/**
 * Analisa o traçado do piloto em relação à linha de centro da pista.
 *
 * @param {Array<{lat,lng}>} driverPoints  — pontos GPS do piloto (uma volta)
 * @param {object}           track         — objeto da pista (de TRACK_DATABASE)
 * @returns {object}  { cornerAnalysis, overallScore, detectedTrack }
 */
export function analyzeRacingLine(driverPoints, track) {
  if (!driverPoints?.length || !track?.centerline?.length) {
    return { cornerAnalysis: [], overallScore: null };
  }

  const validPoints = driverPoints.filter((p) => p.lat && p.lng && p.lat !== 0);
  if (validPoints.length < 20) return { cornerAnalysis: [], overallScore: null };

  const ref = track.center;
  const projections = projectDriverPoints(validPoints, track.centerline, ref);

  // Agrupa projeções por índice de centerline
  const byClIdx = {};
  projections.forEach(({ clIdx, offset }) => {
    if (!byClIdx[clIdx]) byClIdx[clIdx] = [];
    byClIdx[clIdx].push(offset);
  });

  /**
   * Calcula offset médio para um range de índices da centerline.
   */
  function avgOffsetForRange(startIdx, endIdx) {
    const offsets = [];
    for (let i = startIdx; i < endIdx; i++) {
      if (byClIdx[i]) offsets.push(...byClIdx[i]);
    }
    if (!offsets.length) return null;
    return offsets.reduce((s, v) => s + v, 0) / offsets.length;
  }

  // Usa curvas definidas manualmente ou auto-detecta pela geometria da centerline
  const corners = (track.corners?.length > 0)
    ? track.corners
    : detectCornersFromCenterline(track.centerline);

  const cornerAnalysis = corners.map((corner) => {
    const avgOffset = avgOffsetForRange(corner.startIdx, corner.endIdx);
    if (avgOffset === null) {
      return {
        ...corner,
        avgOffset: null,
        position: null,
        advice: 'Dados insuficientes para esta curva.',
        hasData: false,
      };
    }

    const position = getPositionLabel(avgOffset, corner.type);
    const advice   = generateCornerAdvice(corner, avgOffset);

    return {
      ...corner,
      avgOffset,
      position,
      advice,
      hasData: true,
    };
  });

  // Score geral: % de curvas no traçado ideal
  const withData   = cornerAnalysis.filter((c) => c.hasData);
  const goodCorners = withData.filter((c) => c.position?.level === 'good').length;
  const overallScore = withData.length > 0
    ? Math.round((goodCorners / withData.length) * 100)
    : null;

  return { cornerAnalysis, overallScore };
}
