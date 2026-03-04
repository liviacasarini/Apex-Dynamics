/**
 * feedbackGenerator.js
 *
 * Gera feedback detalhado de pilotagem comparando cada volta
 * com a melhor volta da sessão. Identifica áreas de perda de tempo
 * e sugere melhorias.
 */

/**
 * @typedef {Object} FeedbackItem
 * @property {string} area       - Nome da área de perda
 * @property {'high'|'medium'|'low'} severity
 * @property {string} detail     - Descrição da diferença
 * @property {string} suggestion - Dica de melhoria
 * @property {string} estimatedLoss - Estimativa de tempo perdido
 */

/**
 * @typedef {Object} LapFeedback
 * @property {number} lapNum
 * @property {string} timeDiff  - Diferença total em segundos
 * @property {FeedbackItem[]} items
 */

/**
 * Gera feedback comparando cada volta com a melhor.
 *
 * @param {Object} lapsAnalysis - Resultado de analyzeAllLaps.
 * @param {string} bestLapNum - Número da melhor volta.
 * @returns {LapFeedback[]}
 */
export function generateDriverFeedback(lapsAnalysis, bestLapNum) {
  if (!lapsAnalysis || Object.keys(lapsAnalysis).length < 2) return [];

  const best = lapsAnalysis[bestLapNum];
  if (!best) return [];

  const feedback = [];

  for (const [lapNum, stats] of Object.entries(lapsAnalysis)) {
    if (String(lapNum) === String(bestLapNum)) continue;
    if (!stats || stats.lapTime <= 0) continue;

    const timeDiff = stats.lapTime - best.lapTime;
    if (timeDiff <= 0) continue;

    const items = [];

    // 1. Aceleração insuficiente
    if (stats.fullThrottlePct < best.fullThrottlePct - 2) {
      const gap = best.fullThrottlePct - stats.fullThrottlePct;
      const loss = ((gap / 100) * timeDiff).toFixed(2);
      items.push({
        area: 'Aceleração',
        severity: gap > 10 ? 'high' : 'medium',
        detail: `Tempo em aceleração total: ${stats.fullThrottlePct.toFixed(1)}% vs ${best.fullThrottlePct.toFixed(1)}% (melhor volta)`,
        suggestion:
          'Aplicar acelerador mais cedo na saída das curvas. Confiar mais no grip traseiro e buscar o ponto de aceleração ideal.',
        estimatedLoss: `~${loss}s`,
      });
    }

    // 2. Coasting excessivo
    if (stats.coastPct > best.coastPct + 2) {
      const gap = stats.coastPct - best.coastPct;
      items.push({
        area: 'Coasting (sem input)',
        severity: gap > 8 ? 'high' : 'medium',
        detail: `Coasting: ${stats.coastPct.toFixed(1)}% vs ${best.coastPct.toFixed(1)}% (melhor volta)`,
        suggestion:
          'Reduzir tempo sem acelerador ou freio. Usar trail braking na entrada e acelerar mais agressivamente na saída.',
        estimatedLoss: `~${((gap / 100) * timeDiff).toFixed(2)}s`,
      });
    }

    // 3. Velocidade máxima baixa
    if (stats.maxSpeed < best.maxSpeed - 3) {
      const gap = best.maxSpeed - stats.maxSpeed;
      items.push({
        area: 'Velocidade Máxima',
        severity: gap > 8 ? 'high' : 'medium',
        detail: `Vmax: ${stats.maxSpeed.toFixed(1)} km/h vs ${best.maxSpeed.toFixed(1)} km/h`,
        suggestion:
          'A velocidade máxima depende da saída da curva anterior. Melhorar a traçada e ponto de aceleração antes da reta.',
        estimatedLoss: `~${((gap / best.maxSpeed) * timeDiff).toFixed(2)}s`,
      });
    }

    // 4. Frenagens extras
    if (stats.brakeZones > best.brakeZones + 1) {
      items.push({
        area: 'Frenagens Extras',
        severity: 'low',
        detail: `${stats.brakeZones} zonas de frenagem vs ${best.brakeZones} (melhor)`,
        suggestion:
          'Frenagens adicionais indicam hesitação ou entrada de curva imprecisa. Trabalhar nos pontos de referência.',
        estimatedLoss: '~0.1-0.3s',
      });
    }

    // 5. RPM média baixa (trocas de marcha ruins)
    if (stats.avgRPM < best.avgRPM * 0.95 && best.avgRPM > 0) {
      items.push({
        area: 'Uso do Motor (RPM)',
        severity: 'low',
        detail: `RPM médio: ${stats.avgRPM.toFixed(0)} vs ${best.avgRPM.toFixed(0)}`,
        suggestion:
          'Motor fora da faixa ideal de potência. Revisar pontos de troca de marcha — pode estar engrenando cedo demais.',
        estimatedLoss: '~0.1-0.5s',
      });
    }

    // 6. Velocidade média baixa (curvas lentas)
    if (stats.avgSpeed < best.avgSpeed * 0.95 && best.avgSpeed > 0) {
      items.push({
        area: 'Velocidade em Curvas',
        severity: 'medium',
        detail: `Vel. média: ${stats.avgSpeed.toFixed(1)} km/h vs ${best.avgSpeed.toFixed(1)} km/h`,
        suggestion:
          'Velocidade média mais baixa indica curvas mais lentas. Trabalhar a confiança na entrada e manter velocidade no ápice.',
        estimatedLoss: `~${((1 - stats.avgSpeed / best.avgSpeed) * timeDiff).toFixed(2)}s`,
      });
    }

    if (items.length > 0) {
      feedback.push({
        lapNum: parseInt(lapNum),
        timeDiff: timeDiff.toFixed(3),
        items,
      });
    }
  }

  // Ordenar: volta com mais perda primeiro
  return feedback.sort((a, b) => parseFloat(b.timeDiff) - parseFloat(a.timeDiff));
}

/**
 * Dicas gerais de pilotagem (estáticas).
 */
export const DRIVING_TIPS = [
  {
    title: 'Trail Braking',
    tip: 'Manter leve pressão no freio enquanto vira o volante. Transfere peso para o eixo dianteiro e melhora grip na entrada.',
  },
  {
    title: 'Ponto de Aceleração',
    tip: 'O ponto onde começa a acelerar na saída da curva define a velocidade na reta seguinte. Encontre o ponto mais cedo possível sem perder tração.',
  },
  {
    title: 'Olhos à Frente',
    tip: 'Sempre olhar para o próximo ponto de referência, não para o que está fazendo agora. Visão à frente = antecipação = tempo.',
  },
  {
    title: 'Consistência',
    tip: 'Antes de buscar velocidade, busque repetibilidade. Uma volta boa repetida 10x vale mais que uma volta perfeita seguida de 9 ruins.',
  },
  {
    title: 'Suavidade nos Inputs',
    tip: 'Movimentos bruscos de volante, freio ou acelerador desestabilizam o carro. Inputs progressivos mantêm o equilíbrio e extraem mais grip.',
  },
];
