/**
 * useTelemetryData.js
 *
 * Hook principal que gerencia o estado dos dados de telemetria.
 * Suporta múltiplos workspaces com arquivos independentes e
 * múltiplos arquivos carregados simultaneamente para comparação entre sessões.
 */

import { useState, useMemo, useCallback } from 'react';
import { parseCSV } from '@/core/parsers/csvParser';
import { parseDLF } from '@/core/parsers/dlfParser';
import { parseBoschLog } from '@/core/parsers/logParser';
import { parseTDL } from '@/core/parsers/tdlParser';
import { detectChannels } from '@/core/channelDetector';
import { analyzeAllLaps } from '@/core/lapAnalyzer';
import { generateDriverFeedback } from '@/core/feedbackGenerator';
import { routeFile } from '@/core/fileRouter';

/** Mapa extensão → parser para fallback ao carregar sessões antigas. */
const FALLBACK_PARSERS = { dlf: parseDLF, log: parseBoschLog, tdl: parseTDL };

/**
 * Quando nenhum canal de aceleração G está disponível (sem IMU/acelerômetro),
 * deriva aceleração longitudinal em G a partir da variação da velocidade GPS.
 *
 * Usa diferença central (i-1, i+1) para suavização natural.
 * Fórmula: G = (ΔV_m/s) / (Δt_s × 9.81)
 */
function addDerivedAccelChannel(rows, channels) {
  if (channels.accel) return;                    // sensor direto já detectado
  const sc = channels.gpsSpeed;
  const tc = channels.time;
  if (!sc || !tc || rows.length < 3) return;    // precisa de velocidade + tempo

  const COL = '__g_lon';

  for (let i = 1; i < rows.length - 1; i++) {
    const dt = rows[i + 1][tc] - rows[i - 1][tc];
    if (dt > 0.001) {
      // ΔV: km/h → m/s  (÷ 3.6), depois divide por (Δt × g)
      const dv = (rows[i + 1][sc] - rows[i - 1][sc]) / 3.6;
      rows[i][COL] = Math.round((dv / (dt * 9.81)) * 100) / 100;
    } else {
      rows[i][COL] = 0;
    }
  }

  // Bordas: repete vizinho
  rows[0][COL]                  = rows[1]?.[COL]                   ?? 0;
  rows[rows.length - 1][COL]   = rows[rows.length - 2]?.[COL]    ?? 0;

  channels.accel = COL;
}

/**
 * Processa dados já parseados e retorna estrutura de sessão.
 * Aceita o resultado de qualquer parser (CSV, LD, LOG, TDL).
 */
function buildSession(parsed, fileName) {
  if (Object.keys(parsed.laps).length === 0) {
    throw new Error(
      'Nenhuma volta detectada no arquivo. Verifique se o arquivo contém uma coluna de número de volta ' +
      '(ex: "Volta", "Lap", "Beacon", "GPS Numero da Volta Dash").'
    );
  }

  const channels = detectChannels(parsed.headers, parsed.units || []);

  // Se não tem sensor G direto, deriva de velocidade GPS
  addDerivedAccelChannel(parsed.rows, channels);

  return {
    ...parsed,
    channels,
    fileName,
    sessionId: `${fileName}_${Date.now()}`,
  };
}

/**
 * Processa um arquivo CSV texto (retrocompatibilidade).
 * Usado internamente para loadFromText.
 */
function processFile(file, text) {
  const parsed = parseCSV(text);
  return buildSession(parsed, file.name);
}

const EMPTY_ENTRY = { rawData: null, extraSessions: [] };

/**
 * @param {string} activeWorkspaceId — ID do workspace ativo
 * @returns {Object} Estado completo da telemetria + funções de controle.
 */
export function useTelemetryData(activeWorkspaceId) {
  // Map<workspaceId, { rawData, extraSessions }>
  const [telemetryMap, setTelemetryMap] = useState({});

  // Dados do workspace ativo
  const activeEntry = telemetryMap[activeWorkspaceId] || EMPTY_ENTRY;
  const rawData = activeEntry.rawData;
  const extraSessions = activeEntry.extraSessions;

  /**
   * Carrega o arquivo principal (substitui sessão do workspace ativo).
   * Suporta todos os formatos: CSV, LD, LOG, TDL e proprietários (com orientação).
   *
   * routeFile retorna { ...parsed, rawText } onde rawText é:
   *   - Texto original para formatos de texto (CSV, LOG, TDL)
   *   - CSV serializado para formatos binários (LD)
   * Isso garante que csvText esteja sempre disponível para salvar no perfil.
   */
  const loadFile = useCallback(async (file) => {
    const parsed = await routeFile(file);
    const { rawText, ...parsedData } = parsed;
    const session = buildSession(parsedData, file.name);
    setTelemetryMap(prev => ({
      ...prev,
      [activeWorkspaceId]: {
        rawData: { ...session, csvText: rawText || null },
        extraSessions: [],
      },
    }));
    return session;
  }, [activeWorkspaceId]);

  /**
   * Carrega uma sessão a partir de texto já lido (sem FileReader).
   * Usado para restaurar sessões salvas no perfil via IndexedDB.
   *
   * Tenta parseCSV primeiro. Se falhar (sessões antigas salvas em formato
   * proprietário como DLF/LOG/TDL antes da serialização para CSV), usa
   * o parser correspondente à extensão do arquivo como fallback.
   */
  const loadFromText = useCallback((text, fileName) => {
    const ext = fileName?.split('.').pop()?.toLowerCase();
    let parsed;
    try {
      parsed = parseCSV(text);
      if (Object.keys(parsed.laps).length === 0) throw new Error('no laps');
    } catch {
      const fallback = FALLBACK_PARSERS[ext];
      if (!fallback) throw new Error(
        'Nenhuma volta detectada no arquivo. Verifique se o arquivo contém uma coluna de número de volta ' +
        '(ex: "Volta", "Lap", "Beacon", "GPS Numero da Volta Dash").'
      );
      parsed = fallback(text);
    }
    const session = buildSession(parsed, fileName);
    setTelemetryMap(prev => ({
      ...prev,
      [activeWorkspaceId]: {
        rawData: { ...session, csvText: text },
        extraSessions: [],
      },
    }));
    return session;
  }, [activeWorkspaceId]);

  /**
   * Adiciona uma sessão extra para comparação cruzada de voltas.
   * Suporta todos os formatos via routeFile.
   */
  const addExtraSession = useCallback(async (file) => {
    const { rawText, ...parsedData } = await routeFile(file);
    const session = buildSession(parsedData, file.name);
    setTelemetryMap(prev => {
      const entry = prev[activeWorkspaceId] || EMPTY_ENTRY;
      const filtered = entry.extraSessions.filter((s) => s.fileName !== file.name);
      return {
        ...prev,
        [activeWorkspaceId]: {
          ...entry,
          extraSessions: [...filtered, session],
        },
      };
    });
    return session;
  }, [activeWorkspaceId]);

  /**
   * Adiciona uma sessão extra a partir de texto CSV (para sessões salvas no perfil).
   */
  const addExtraSessionFromText = useCallback((text, fileName) => {
    const ext = fileName?.split('.').pop()?.toLowerCase();
    let parsed;
    try {
      parsed = parseCSV(text);
      if (Object.keys(parsed.laps).length === 0) throw new Error('no laps');
    } catch {
      const fallback = FALLBACK_PARSERS[ext];
      if (!fallback) throw new Error('Nenhuma volta detectada no arquivo.');
      parsed = fallback(text);
    }
    const session = buildSession(parsed, fileName);
    setTelemetryMap(prev => {
      const entry = prev[activeWorkspaceId] || EMPTY_ENTRY;
      const filtered = entry.extraSessions.filter((s) => s.fileName !== fileName);
      return {
        ...prev,
        [activeWorkspaceId]: {
          ...entry,
          extraSessions: [...filtered, session],
        },
      };
    });
    return session;
  }, [activeWorkspaceId]);

  /**
   * Adiciona uma volta salva como sessão extra para comparação.
   */
  const addExtraSessionFromLapData = useCallback(({ lapRows, headers, channels: savedChannels, lapNumber, fileName }) => {
    const session = {
      headers,
      rows: lapRows,
      laps: { [lapNumber]: lapRows },
      channels: savedChannels,
      fileName,
      sessionId: `${fileName}_${Date.now()}`,
    };
    // Derive accel if missing
    addDerivedAccelChannel(session.rows, session.channels);
    setTelemetryMap(prev => {
      const entry = prev[activeWorkspaceId] || EMPTY_ENTRY;
      const filtered = entry.extraSessions.filter((s) => s.fileName !== fileName);
      return {
        ...prev,
        [activeWorkspaceId]: {
          ...entry,
          extraSessions: [...filtered, session],
        },
      };
    });
    return session;
  }, [activeWorkspaceId]);

  /**
   * Remove uma sessão extra pelo sessionId.
   */
  const removeExtraSession = useCallback((sessionId) => {
    setTelemetryMap(prev => {
      const entry = prev[activeWorkspaceId] || EMPTY_ENTRY;
      return {
        ...prev,
        [activeWorkspaceId]: {
          ...entry,
          extraSessions: entry.extraSessions.filter((s) => s.sessionId !== sessionId),
        },
      };
    });
  }, [activeWorkspaceId]);

  /**
   * Carrega uma volta salva diretamente a partir de dados pré-parseados (sem re-parsear CSV).
   * Usado para restaurar voltas salvas nos perfis via IndexedDB.
   */
  const loadLapDirect = useCallback(({ lapRows, headers, channels: savedChannels, lapNumber, fileName }) => {
    setTelemetryMap(prev => ({
      ...prev,
      [activeWorkspaceId]: {
        rawData: {
          headers,
          rows: lapRows,
          laps: { [lapNumber]: lapRows },
          channels: savedChannels,
          fileName,
          sessionId: `${fileName}_${Date.now()}`,
          csvText: null,
        },
        extraSessions: [],
      },
    }));
  }, [activeWorkspaceId]);

  /**
   * Limpa dados do workspace ativo (volta para tela de upload).
   */
  const clearData = useCallback(() => {
    setTelemetryMap(prev => {
      const next = { ...prev };
      delete next[activeWorkspaceId];
      return next;
    });
  }, [activeWorkspaceId]);

  /**
   * Limpa dados de um workspace específico (usado ao deletar workspace).
   */
  const clearWorkspaceData = useCallback((workspaceId) => {
    setTelemetryMap(prev => {
      const next = { ...prev };
      delete next[workspaceId];
      return next;
    });
  }, []);

  /**
   * Dados derivados da sessão principal (memoized).
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

    // Hook sempre retorna TODAS as voltas — filtragem acontece em App.jsx
    const { analysis, bestLapNum } = analyzeAllLaps(
      rawData.laps,
      rawData.channels,
      0,
      999999,
      rawData.deviceType
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

  /**
   * Dados derivados de todas as sessões extras (memoized).
   */
  const extraDerived = useMemo(() => {
    return extraSessions.map((session) => {
      const { analysis, bestLapNum } = analyzeAllLaps(
        session.laps,
        session.channels,
        0,
        999999,
        session.deviceType
      );
      return {
        sessionId: session.sessionId,
        fileName: session.fileName,
        data: session,
        channels: session.channels,
        lapsAnalysis: analysis,
        bestLapNum,
      };
    });
  }, [extraSessions]);

  /** IDs dos workspaces que têm dados carregados. */
  const loadedWorkspaceIds = useMemo(
    () => new Set(Object.keys(telemetryMap).filter(id => !!telemetryMap[id]?.rawData)),
    [telemetryMap]
  );

  return {
    data: rawData,
    ...derived,
    extraSessions: extraDerived,
    loadFile,
    loadFromText,
    loadLapDirect,
    addExtraSession,
    addExtraSessionFromText,
    addExtraSessionFromLapData,
    removeExtraSession,
    clearData,
    clearWorkspaceData,
    loadedWorkspaceIds,
    isLoaded: !!rawData,
  };
}
