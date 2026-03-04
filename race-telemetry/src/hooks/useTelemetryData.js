/**
 * useTelemetryData.js
 *
 * Hook principal que gerencia o estado dos dados de telemetria.
 * Faz parse, detecção de canais, análise de voltas e geração de feedback.
 */

import { useState, useMemo, useCallback } from 'react';
import { parseCSV } from '@/utils/csvParser';
import { detectChannels } from '@/utils/channelDetector';
import { analyzeAllLaps } from '@/utils/lapAnalyzer';
import { generateDriverFeedback } from '@/utils/feedbackGenerator';

/**
 * @returns {Object} Estado completo da telemetria + funções de controle.
 */
export function useTelemetryData() {
  const [rawData, setRawData] = useState(null);

  /**
   * Carrega um arquivo CSV e processa tudo.
   */
  const loadFile = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const parsed = parseCSV(text);
          const channels = detectChannels(parsed.headers);

          setRawData({
            ...parsed,
            channels,
            fileName: file.name,
          });

          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsText(file, 'utf-8');
    });
  }, []);

  /**
   * Limpa os dados (volta para tela de upload).
   */
  const clearData = useCallback(() => {
    setRawData(null);
  }, []);

  /**
   * Dados derivados (memoized).
   */
  const derived = useMemo(() => {
    if (!rawData) {
      return {
        channels: {},
        lapsAnalysis: {},
        bestLapNum: null,
        feedback: [],
        validLapNums: [],
      };
    }

    const { analysis, bestLapNum } = analyzeAllLaps(
      rawData.laps,
      rawData.channels
    );

    const feedback = generateDriverFeedback(analysis, bestLapNum);

    const validLapNums = Object.keys(analysis).sort(
      (a, b) => analysis[a].lapTime - analysis[b].lapTime
    );

    return {
      channels: rawData.channels,
      lapsAnalysis: analysis,
      bestLapNum,
      feedback,
      validLapNums,
    };
  }, [rawData]);

  return {
    data: rawData,
    ...derived,
    loadFile,
    clearData,
    isLoaded: !!rawData,
  };
}
