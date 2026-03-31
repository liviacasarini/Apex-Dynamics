/**
 * MathTab — Canal Matemático
 *
 * Permite ao usuário:
 *  • Ver todos os canais disponíveis no arquivo
 *  • Criar fórmulas personalizadas usando esses canais
 *  • Escolher o output: gráfico (com config de eixos), tabela ou lista
 *  • Configurar eixos X, Y esquerdo e Y direito (canais + fórmulas)
 *  • Salvar/carregar fórmulas no localStorage
 *  • Comparar resultados com voltas/sessões salvas no perfil
 *  • Funciona mesmo sem arquivo carregado (usando apenas fontes do perfil)
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { PrintFooter } from '@/components/common';

/* ── Constantes ────────────────────────────────────────────────────── */
const STORAGE_KEY = 'rt_math_formulas';
const OUTPUT_MODES = [
  { key: 'var',   label: 'Variável', icon: '🔢' },
  { key: 'chart', label: 'Gráfico',  icon: '📈' },
  { key: 'table', label: 'Tabela',   icon: '📋' },
  { key: 'list',  label: 'Lista',    icon: '📝' },
];
const CHART_COLORS = ['#00ccff','#ff8800','#00cc44','#ff4444','#aa44ff','#ffcc00','#ff44aa','#44ffaa'];
const CMP_COLORS   = ['#ff44aa','#44ffaa','#aa44ff','#ffd700','#ff6644','#00ccaa','#cc44ff','#88ccff'];
const CMP_DASHES   = ['6 3', '4 2', '8 4', '3 2'];
// Paleta de cores por fonte: índice 0 = arquivo principal, 1+ = fontes do perfil
const SOURCE_PALETTE = ['#ff5555','#4499ff','#44dd88','#ffcc44','#ff88cc','#44ccff','#cc88ff','#ffaa44'];

/* ── buildChartDataBase ────────────────────────────────────────────── */
/**
 * Constrói dados para gráfico multi-eixo a partir de qualquer fonte.
 * Função pura, sem dependências de estado do componente.
 */
function buildChartDataBase(formula, srcRows, srcTimeCol, srcFormulaMap) {
  const xKey = formula.chartX || '__time__';
  const yVars = formula.chartY || [];
  const y2Vars = formula.chartY2 || [];
  const allVars = [...yVars, ...y2Vars];
  if (!allVars.length || !srcRows.length) return [];

  const startTime = srcRows[0][srcTimeCol] || 0;
  const step = Math.max(1, Math.ceil(srcRows.length / 2000));

  const resolveFx = (fxName, rowTime) => {
    const fxData = srcFormulaMap[fxName];
    if (!fxData) return 0;
    let closest = fxData[0]?.value ?? 0;
    let minDist = Infinity;
    for (const d of fxData) {
      const dist = Math.abs(d.t - rowTime);
      if (dist < minDist) { minDist = dist; closest = d.value; }
      if (d.t > rowTime) break;
    }
    return closest;
  };

  const result = [];
  for (let i = 0; i < srcRows.length; i += step) {
    const row = srcRows[i];
    const rowTime = row[srcTimeCol] || 0;
    const point = {};

    if (xKey === '__time__') {
      point.__x = rowTime - startTime;
    } else if (xKey.startsWith('ch:')) {
      point.__x = row[xKey.slice(3)] ?? 0;
    } else if (xKey.startsWith('fx:')) {
      point.__x = resolveFx(xKey.slice(3), rowTime);
    }

    for (const v of allVars) {
      if (v.key.startsWith('ch:')) {
        const val = row[v.key.slice(3)];
        if (val != null && typeof val === 'number' && isFinite(val)) point[v.key] = val;
      } else if (v.key.startsWith('fx:')) {
        point[v.key] = resolveFx(v.key.slice(3), rowTime);
      }
    }
    result.push(point);
  }
  return result;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

/** Avalia uma fórmula para cada row, retornando array de { t, value } */
function evaluateFormula(formula, rows, timeCol, headers) {
  const sortedHeaders = [...headers].sort((a, b) => b.length - a.length);
  let expr = formula;
  const usedChannels = [];
  for (const h of sortedHeaders) {
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b|\\[${escaped}\\]`, 'g');
    if (re.test(expr)) {
      usedChannels.push(h);
      const replaceRe = new RegExp(`\\b${escaped}\\b|\\[${escaped}\\]`, 'g');
      expr = expr.replace(replaceRe, `(__row[${JSON.stringify(h)}] ?? 0)`);
    }
  }
  const safeExpr = expr
    .replace(/\babs\b/g,   'Math.abs')
    .replace(/\bsqrt\b/g,  'Math.sqrt')
    .replace(/\bpow\b/g,   'Math.pow')
    .replace(/\bmin\b/g,   'Math.min')
    .replace(/\bmax\b/g,   'Math.max')
    .replace(/\bround\b/g, 'Math.round')
    .replace(/\bfloor\b/g, 'Math.floor')
    .replace(/\bceil\b/g,  'Math.ceil')
    .replace(/\blog\b/g,   'Math.log')
    .replace(/\bexp\b/g,   'Math.exp')
    .replace(/\bPI\b/g,    'Math.PI')
    .replace(/\bsin\b/g,   'Math.sin')
    .replace(/\bcos\b/g,   'Math.cos')
    .replace(/\btan\b/g,   'Math.tan');
  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function('__row', `"use strict"; try { return (${safeExpr}); } catch { return NaN; }`);
  } catch (e) {
    return { error: `Erro de sintaxe: ${e.message}`, data: [], usedChannels };
  }
  const data = [];
  for (const row of rows) {
    const t = row[timeCol] ?? 0;
    const v = fn(row);
    if (typeof v === 'number' && isFinite(v)) {
      data.push({ t, value: v });
    }
  }
  return { error: null, data, usedChannels };
}

/** Estatísticas rápidas */
function calcStats(data) {
  if (!data.length) return null;
  let sum = 0, min = Infinity, max = -Infinity;
  for (const d of data) {
    sum += d.value;
    if (d.value < min) min = d.value;
    if (d.value > max) max = d.value;
  }
  return { min, max, avg: sum / data.length, count: data.length };
}

/** Dropdown de seleção de variável (canal ou fórmula) */
function VarSelect({ value, onChange, options, placeholder, color, COLORS, allowNone }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        background: COLORS.bg, border: `1px solid ${value ? (color || COLORS.accent || '#4466ff') : COLORS.border}`,
        borderRadius: 6, color: value ? COLORS.textPrimary : COLORS.textMuted,
        fontSize: 11, padding: '4px 8px', cursor: 'pointer', maxWidth: 200,
      }}
    >
      {allowNone && <option value="">{placeholder || '— Nenhum —'}</option>}
      {!allowNone && <option value="" disabled>{placeholder || 'Selecionar...'}</option>}
      {options.map(o => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  );
}

/** Pill tag removível */
function VarPill({ label, color, onRemove, COLORS }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 4,
      background: `${color}18`, border: `1px solid ${color}44`, color,
    }}>
      {label}
      <span onClick={onRemove} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12, lineHeight: 1 }}>&times;</span>
    </span>
  );
}

/* ── Componente Principal ──────────────────────────────────────────── */
export default function MathTab({ data, channels, lapsAnalysis, activeProfile, onLoadMathSource }) {
  const { colors: COLORS } = useTheme();

  /* ── State ───────────────────────────────────────────────────────── */
  const [formulas, setFormulas] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedLap, setSelectedLap] = useState('all');
  const [search, setSearch] = useState('');
  const [editingIdx, setEditingIdx] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [draftFormula, setDraftFormula] = useState('');
  const [draftOutput, setDraftOutput] = useState('chart');
  const [draftDecimalPlaces, setDraftDecimalPlaces] = useState(2);
  const [draftChartX, setDraftChartX] = useState('__time__');
  const [draftChartY, setDraftChartY] = useState([]);
  const [draftChartY2, setDraftChartY2] = useState([]);
  const [addYTarget, setAddYTarget] = useState('');
  const [addY2Target, setAddY2Target] = useState('');
  const [draftCompare, setDraftCompare] = useState([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [sourceCache, setSourceCache] = useState({});
  const [primarySources, setPrimarySources] = useState([]); // fontes carregadas do perfil como dados principais
  const [addYSource, setAddYSource] = useState('__main__'); // fonte ativa ao adicionar variáveis ao eixo Y
  const [selectedChannels, setSelectedChannels] = useState({}); // { [sourceId]: Set<channelName> }
  const formulaInputRef = useRef(null);

  /* ── Persistência ────────────────────────────────────────────────── */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formulas));
  }, [formulas]);

  /* ── Dados efetivos (arquivo carregado OU fonte do perfil) ──────── */
  const firstPrimary = primarySources[0] ?? null;
  const primaryCached = firstPrimary ? sourceCache[firstPrimary.id] : null;

  // Se há uma fonte primária do perfil carregada, ela sobrepõe o arquivo
  const timeCol = primaryCached?.channels?.time || channels?.time;
  const headers = primaryCached?.headers || data?.headers || [];

  const validLaps = useMemo(
    () => data && primarySources.length === 0 ? Object.keys(data.laps).filter(n => (lapsAnalysis[n]?.lapTime || 0) > 5) : [],
    [data, lapsAnalysis, primarySources],
  );

  const rows = useMemo(() => {
    if (primaryCached?.rows) return primaryCached.rows;
    if (!data?.laps) return [];
    if (selectedLap === 'all') return Object.values(data.laps).flat();
    return data.laps[selectedLap] || [];
  }, [data, selectedLap, primaryCached]);

  /* ── Fontes salvas do perfil ─────────────────────────────────────── */
  const savedSources = useMemo(() => {
    if (!activeProfile) return [];
    const laps = (activeProfile.savedLaps || []).map(l => ({
      id: l.id, name: l.name, type: 'lap', lapDataId: l.lapDataId,
      label: `🏁 V${l.lapNumber} — ${l.name}`,
      detail: l.analysis?.lapTime ? `${l.analysis.lapTime.toFixed(1)}s` : '',
    }));
    const sessions = (activeProfile.sessions || []).map(s => ({
      id: s.id, name: s.name, type: 'session', csvId: s.csvId,
      label: `📁 ${s.name}`,
      detail: s.fileName !== s.name ? s.fileName : '',
    }));
    return [...laps, ...sessions];
  }, [activeProfile]);

  /* ── Lista ordenada de fontes (arquivo + perfil) ─────────────────── */
  const sourceList = useMemo(() => {
    const list = [];
    let ci = 0;
    if (data) list.push({ id: '__main__', name: 'Arquivo Atual', color: SOURCE_PALETTE[ci++], type: 'main', headers: data.headers || [] });
    for (const ps of primarySources) {
      const cached = sourceCache[ps.id];
      list.push({ id: ps.id, name: ps.name, color: SOURCE_PALETTE[ci++ % SOURCE_PALETTE.length], type: ps.type, headers: cached?.headers || [], loading: cached?.loading, error: cached?.error });
    }
    return list;
  }, [data, primarySources, sourceCache]);

  /* ── Mapa sourceId → cor ─────────────────────────────────────────── */
  const sourceColors = useMemo(() => {
    const map = {};
    for (const s of sourceList) map[s.id] = s.color;
    return map;
  }, [sourceList]);

  /* ── Sincroniza addYSource com fontes disponíveis ────────────────── */
  useEffect(() => {
    const validIds = sourceList.map(s => s.id);
    if (validIds.length > 0 && !validIds.includes(addYSource)) {
      setAddYSource(validIds[0]);
    }
  }, [sourceList]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Stats por fonte (para sidebar) ─────────────────────────────── */
  const allChannelStats = useMemo(() => {
    const compute = (srcRows, srcHeaders) => {
      if (!srcRows?.length || !srcHeaders?.length) return {};
      const st = {};
      const sample = srcRows.length > 500 ? srcRows.filter((_, i) => i % Math.ceil(srcRows.length / 500) === 0) : srcRows;
      for (const h of srcHeaders) {
        let min = Infinity, max = -Infinity, ok = false;
        for (const r of sample) {
          const v = r[h];
          if (v != null && typeof v === 'number' && isFinite(v)) { ok = true; if (v < min) min = v; if (v > max) max = v; }
        }
        if (ok) st[h] = { min, max };
      }
      return st;
    };
    const result = {};
    if (rows.length > 0) result['__main__'] = compute(rows, data?.headers || []);
    for (const ps of primarySources) {
      const cached = sourceCache[ps.id];
      if (cached?.rows) result[ps.id] = compute(cached.rows, cached.headers || []);
    }
    return result;
  }, [rows, data, primarySources, sourceCache]);

  /* ── Headers ativos ─────────────────────────────────────────────── */
  // União de headers do arquivo + todas as fontes primárias do perfil
  const activeHeaders = useMemo(() => {
    const all = new Set(headers);
    for (const ps of primarySources) {
      const c = sourceCache[ps.id];
      if (c?.headers) c.headers.forEach(h => all.add(h));
    }
    if (all.size > 0) return [...all];
    // fallback: headers da primeira fonte de comparação em cache
    for (const cached of Object.values(sourceCache)) {
      if (cached.headers?.length > 0) return cached.headers;
    }
    return [];
  }, [headers, primarySources, sourceCache]);

  /* ── Canais filtrados (busca) ────────────────────────────────────── */
  const filteredHeaders = useMemo(() => {
    if (!search.trim()) return activeHeaders;
    const q = search.toLowerCase();
    return activeHeaders.filter(h => h.toLowerCase().includes(q));
  }, [activeHeaders, search]);

  /* ── Channel stats (amostra rápida para sidebar) ─────────────────── */
  const channelStats = useMemo(() => {
    const srcRows = rows.length > 0 ? rows : (() => {
      for (const cached of Object.values(sourceCache)) {
        if (cached.rows?.length > 0) return cached.rows;
      }
      return [];
    })();
    if (!srcRows.length || !activeHeaders.length) return {};
    const stats = {};
    const sample = srcRows.length > 500
      ? srcRows.filter((_, i) => i % Math.ceil(srcRows.length / 500) === 0)
      : srcRows;
    for (const h of activeHeaders) {
      let min = Infinity, max = -Infinity, hasData = false;
      for (const r of sample) {
        const v = r[h];
        if (v != null && typeof v === 'number' && isFinite(v)) {
          hasData = true;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (hasData) stats[h] = { min, max, range: max - min };
    }
    return stats;
  }, [rows, activeHeaders, sourceCache]);

  /* ── Lista unificada de variáveis (canais + fórmulas) ────────────── */
  const varOptions = useMemo(() => {
    const opts = [{ key: '__time__', label: `⏱ Tempo (${timeCol || 's'})`, group: 'system' }];
    for (const h of activeHeaders) {
      opts.push({ key: `ch:${h}`, label: h, group: 'channel' });
    }
    for (const f of formulas) {
      opts.push({ key: `fx:${f.name}`, label: `f(x) ${f.name}`, group: 'formula' });
    }
    return opts;
  }, [activeHeaders, formulas, timeCol]);

  const xOptions = varOptions;
  const yOptions = useMemo(() => varOptions.filter(o => o.key !== '__time__'), [varOptions]);

  /* ── Inserir canal na fórmula ────────────────────────────────────── */
  const insertChannel = useCallback((channelName) => {
    if (!formulaInputRef.current) return;
    const input = formulaInputRef.current;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const needsBrackets = /[^a-zA-Z0-9_]/.test(channelName);
    const insert = needsBrackets ? `[${channelName}]` : channelName;
    const next = draftFormula.substring(0, start) + insert + draftFormula.substring(end);
    setDraftFormula(next);
    setTimeout(() => {
      input.focus();
      input.selectionStart = input.selectionEnd = start + insert.length;
    }, 10);
  }, [draftFormula]);

  /* ── Seleção múltipla de canais ──────────────────────────────────── */
  const toggleChannelSelect = useCallback((srcId, channelName) => {
    setSelectedChannels(prev => {
      const srcSet = new Set(prev[srcId] || []);
      if (srcSet.has(channelName)) srcSet.delete(channelName);
      else srcSet.add(channelName);
      return { ...prev, [srcId]: srcSet };
    });
  }, []);

  const insertSelectedChannels = useCallback((srcId) => {
    const set = selectedChannels[srcId];
    if (!set || set.size === 0 || !formulaInputRef.current) return;
    const input = formulaInputRef.current;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const channels = [...set];
    const parts = channels.map(h => /[^a-zA-Z0-9_]/.test(h) ? `[${h}]` : h);
    const insert = parts.join(', ');
    const next = draftFormula.substring(0, start) + insert + draftFormula.substring(end);
    setDraftFormula(next);
    setSelectedChannels(prev => ({ ...prev, [srcId]: new Set() }));
    setTimeout(() => {
      input.focus();
      input.selectionStart = input.selectionEnd = start + insert.length;
    }, 10);
  }, [selectedChannels, draftFormula]);

  /* ── Carregar fonte de comparação ────────────────────────────────── */
  const loadSource = useCallback(async (src) => {
    if (!onLoadMathSource) return;
    if (sourceCache[src.id]?.rows || sourceCache[src.id]?.loading) return;
    setSourceCache(prev => ({ ...prev, [src.id]: { ...src, loading: true } }));
    const result = await onLoadMathSource(src);
    if (result.error) {
      setSourceCache(prev => ({ ...prev, [src.id]: { ...src, loading: false, error: result.error } }));
    } else {
      setSourceCache(prev => ({
        ...prev,
        [src.id]: { ...src, loading: false, rows: result.rows, headers: result.headers, channels: result.channels },
      }));
    }
  }, [sourceCache, onLoadMathSource]);

  /* ── Trigger carregamento automático de fontes ───────────────────── */
  useEffect(() => {
    if (!onLoadMathSource) return;
    // Garante que fontes primárias estejam carregadas
    for (const ps of primarySources) {
      const cached = sourceCache[ps.id];
      if (!cached || (!cached.rows && !cached.loading && !cached.error)) loadSource(ps);
    }
    // Garante que fontes de comparação das fórmulas estejam carregadas
    for (const f of formulas) {
      for (const cmp of (f.compare || [])) {
        const cached = sourceCache[cmp.id];
        if (!cached || (!cached.rows && !cached.loading && !cached.error)) {
          const srcMeta = savedSources.find(s => s.id === cmp.id);
          if (srcMeta) loadSource(srcMeta);
        }
      }
    }
  }, [formulas, primarySources, savedSources, sourceCache, loadSource, onLoadMathSource]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── CRUD fórmulas ───────────────────────────────────────────────── */
  const resetDraft = useCallback(() => {
    setDraftName(''); setDraftFormula(''); setDraftOutput('chart'); setDraftDecimalPlaces(2);
    setDraftChartX('__time__'); setDraftChartY([]); setDraftChartY2([]);
    setAddYTarget(''); setAddY2Target(''); setDraftCompare([]);
    setSelectedChannels({});
    setShowNewForm(false); setEditingIdx(null);
  }, []);

  const saveFormula = useCallback(() => {
    if (!draftName.trim() || !draftFormula.trim()) return;
    const entry = {
      name: draftName.trim(), formula: draftFormula.trim(), output: draftOutput, decimals: draftDecimalPlaces,
      chartX: draftChartX, chartY: draftChartY, chartY2: draftChartY2, compare: draftCompare,
    };
    if (editingIdx !== null) {
      setFormulas(prev => prev.map((f, i) => i === editingIdx ? entry : f));
    } else {
      setFormulas(prev => [...prev, entry]);
    }
    resetDraft();
  }, [draftName, draftFormula, draftOutput, draftDecimalPlaces, draftChartX, draftChartY, draftChartY2, draftCompare, editingIdx, resetDraft]);

  const deleteFormula = useCallback((idx) => {
    setFormulas(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) resetDraft();
  }, [editingIdx, resetDraft]);

  const editFormula = useCallback((idx) => {
    const f = formulas[idx];
    setDraftName(f.name);
    setDraftFormula(f.formula);
    setDraftOutput(f.output);
    setDraftDecimalPlaces(f.decimals ?? 2);
    setDraftChartX(f.chartX || '__time__');
    setDraftChartY(f.chartY || []);
    setDraftChartY2(f.chartY2 || []);
    setDraftCompare(f.compare || []);
    setEditingIdx(idx);
    setShowNewForm(true);
  }, [formulas]);

  /* ── Adicionar fonte de comparação ao draft ──────────────────────── */
  const addCompareSource = useCallback((srcId) => {
    if (!srcId) return;
    const src = savedSources.find(s => s.id === srcId);
    if (!src || draftCompare.find(c => c.id === srcId)) return;
    setDraftCompare(prev => [...prev, {
      id: src.id, name: src.name, type: src.type,
      lapDataId: src.lapDataId, csvId: src.csvId,
    }]);
  }, [savedSources, draftCompare]);

  /* ── Carregar fonte do perfil como dado principal ────────────────── */
  const loadPrimarySource = useCallback(async (src) => {
    if (primarySources.find(ps => ps.id === src.id)) return;
    setPrimarySources(prev => [...prev, src]);
    await loadSource(src);
  }, [primarySources, loadSource]);

  /* ── Adicionar variável ao eixo Y ────────────────────────────────── */
  const addToY = useCallback((key, axis) => {
    if (!key) return;
    // Cor = cor da fonte selecionada; fallback para CHART_COLORS
    const color = sourceColors[addYSource] || CHART_COLORS[(axis === 'y' ? draftChartY.length : draftChartY2.length) % CHART_COLORS.length];
    const entry = { key, color, sourceId: addYSource };
    if (axis === 'y') {
      if (!draftChartY.find(v => v.key === key)) setDraftChartY(prev => [...prev, entry]);
      setAddYTarget('');
    } else {
      if (!draftChartY2.find(v => v.key === key)) setDraftChartY2(prev => [...prev, entry]);
      setAddY2Target('');
    }
  }, [draftChartY, draftChartY2, addYSource, sourceColors]);

  /* ── Resultados (inclui compareData por fórmula) ─────────────────── */
  const results = useMemo(() => {
    return formulas.map(f => {
      const { error, data: evalData, usedChannels } = evaluateFormula(f.formula, rows, timeCol, headers);
      const stats = error ? null : calcStats(evalData);

      // Fontes primárias extras viram comparação automática em todas as fórmulas:
      // - se há arquivo aberto: todas as fontes primárias são "extras"
      // - se não há arquivo: primeira fonte já é a principal, demais são extras
      const extraPrimaries = (data ? primarySources : primarySources.slice(1))
        .filter(ps => !(f.compare || []).find(c => c.id === ps.id));
      const allCompareSources = [...extraPrimaries, ...(f.compare || [])];

      const compareData = {};
      for (const cmp of allCompareSources) {
        const cached = sourceCache[cmp.id];
        if (cached?.loading) {
          compareData[cmp.id] = { loading: true, name: cmp.name };
        } else if (cached?.error) {
          compareData[cmp.id] = { error: cached.error, name: cmp.name };
        } else if (cached?.rows) {
          const srcTimeCol = cached.channels?.time || timeCol;
          const srcHeaders = cached.headers || headers;
          const { error: cErr, data: cData } = evaluateFormula(f.formula, cached.rows, srcTimeCol, srcHeaders);

          // Mapa de fórmulas avaliadas nessa fonte (para gráfico multi-eixo)
          const srcFormulaMap = {};
          for (const otherF of formulas) {
            const { error: oErr, data: oData } = evaluateFormula(otherF.formula, cached.rows, srcTimeCol, srcHeaders);
            if (!oErr && oData.length) srcFormulaMap[otherF.name] = oData;
          }

          const chartDataMulti = (f.chartY?.length || f.chartY2?.length)
            ? buildChartDataBase(f, cached.rows, srcTimeCol, srcFormulaMap)
            : null;

          compareData[cmp.id] = {
            name: cmp.name,
            error: cErr,
            data: cErr ? [] : cData,
            stats: cErr ? null : calcStats(cData),
            chartDataMulti,
          };
        }
      }

      return { ...f, error, data: evalData, stats, usedChannels, compareData };
    });
  }, [formulas, rows, timeCol, headers, sourceCache, primarySources, data]);

  /* ── Mapa de fórmulas avaliadas (sessão principal) ───────────────── */
  const formulaDataMap = useMemo(() => {
    const map = {};
    results.forEach(r => {
      if (!r.error && r.data.length) map[r.name] = r.data;
    });
    return map;
  }, [results]);

  /* ── Gerar dados do gráfico multi-eixo (sessão principal) ────────── */
  const buildChartData = useCallback((formula) => {
    return buildChartDataBase(formula, rows, timeCol, formulaDataMap);
  }, [rows, timeCol, formulaDataMap]);

  const sessionStartTime = rows.length ? (rows[0][timeCol] || 0) : 0;

  const resolveLabel = (key) => {
    if (key === '__time__') return 'Tempo';
    if (key.startsWith('ch:')) return key.slice(3);
    if (key.startsWith('fx:')) return `f(x) ${key.slice(3)}`;
    return key;
  };

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'monospace' }}>f(x)</span>
        <span style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 600 }}>Canal Matemático</span>

        {/* Pills de fontes primárias do perfil */}
        {primarySources.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Perfil</span>
            {primarySources.map(ps => {
              const cached = sourceCache[ps.id];
              const clr = cached?.error ? '#ff4444' : '#00ccaa';
              return (
                <div key={ps.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: `${clr}18`, border: `1px solid ${clr}44`, borderRadius: 4, padding: '2px 6px',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: cached?.loading ? COLORS.textMuted : clr, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cached?.loading ? `⌛ ${ps.name}` : cached?.error ? `⚠ ${ps.name}` : `✓ ${ps.name}`}
                  </span>
                  <button
                    onClick={() => setPrimarySources(prev => prev.filter(p => p.id !== ps.id))}
                    title="Remover fonte"
                    style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
                  >×</button>
                </div>
              );
            })}
          </div>
        )}

        {!data && primarySources.length === 0 && (
          <span style={{
            fontSize: 11, color: COLORS.textMuted,
            background: `${COLORS.border}44`, borderRadius: 4, padding: '2px 8px',
          }}>
            Sem arquivo — carregue do perfil ou abra um arquivo
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Dados: arquivo carregado (sem fontes do perfil) */}
          {data && primarySources.length === 0 && (
            <>
              <span style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Dados</span>
              <select
                value={selectedLap}
                onChange={(e) => setSelectedLap(e.target.value)}
                style={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.textPrimary, fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}
              >
                <option value="all">Sessão Inteira</option>
                {validLaps.map(n => <option key={n} value={n}>Volta {n}</option>)}
              </select>
            </>
          )}
          {/* Carregar do perfil — sempre visível quando há fontes salvas */}
          {savedSources.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const src = savedSources.find(s => s.id === e.target.value);
                if (src) loadPrimarySource(src);
              }}
              style={{
                background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
                borderRadius: 6, color: COLORS.textMuted, fontSize: 11, padding: '4px 8px', cursor: 'pointer',
              }}
            >
              <option value="">📂 Carregar do perfil...</option>
              {savedSources.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}{s.detail ? ` (${s.detail})` : ''}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => { resetDraft(); setShowNewForm(true); }}
            style={{ background: '#2255ee', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
          >+ Nova Fórmula</button>
          <button
            onClick={() => { resetDraft(); setDraftOutput('var'); setShowNewForm(true); }}
            style={{ background: 'transparent', border: '1px solid #44cc88', borderRadius: 8, color: '#44cc88', fontSize: 12, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
          >🔢 Nova Variável</button>
        </div>
      </div>

      {/* ── Painel principal ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Sidebar esquerda: canais + variáveis criadas ──────── */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Busca global */}
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar canal..."
            style={{
              width: '100%', background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
              borderRadius: 8, color: COLORS.textPrimary, fontSize: 11, padding: '7px 10px',
              outline: 'none', boxSizing: 'border-box',
            }}
          />

          {/* Box por fonte — uma por arquivo */}
          {sourceList.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: COLORS.textMuted,
              background: COLORS.bgCard, borderRadius: 12, border: `1px solid ${COLORS.border}` }}>
              Carregue um arquivo ou adicione fontes do perfil
            </div>
          )}
          {sourceList.map(src => {
            const srcStats = allChannelStats[src.id] || {};
            const filteredSrcHeaders = src.headers.filter(h =>
              !search.trim() || h.toLowerCase().includes(search.toLowerCase())
            );
            const isActiveAddY = addYSource === src.id;
            return (
              <div key={src.id} style={{
                background: COLORS.bgCard, borderRadius: 12,
                border: `2px solid ${isActiveAddY ? src.color : src.color + '44'}`,
                display: 'flex', flexDirection: 'column', maxHeight: 320,
                transition: 'border-color 0.15s',
              }}>
                {/* Header colorido */}
                {(() => {
                  const srcSelected = selectedChannels[src.id];
                  const selCount = srcSelected?.size || 0;
                  return (
                    <>
                      <div style={{
                        padding: '8px 12px', borderBottom: `1px solid ${src.color}33`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: `${src.color}12`, borderRadius: '10px 10px 0 0',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: src.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: src.color,
                            maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {src.loading ? `⌛ ${src.name}` : src.error ? `⚠ ${src.name}` : src.name}
                          </span>
                          <span style={{ fontSize: 9, color: COLORS.textMuted }}>{src.headers.length} ch</span>
                        </div>
                        {showNewForm && (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {/* Botão inserir selecionados */}
                            {selCount > 0 && (
                              <button
                                onClick={() => insertSelectedChannels(src.id)}
                                title="Inserir canais selecionados na fórmula (separados por vírgula)"
                                style={{
                                  background: src.color, border: 'none',
                                  borderRadius: 4, color: '#fff',
                                  fontSize: 9, padding: '2px 7px', cursor: 'pointer', fontWeight: 700,
                                }}>
                                Inserir {selCount}
                              </button>
                            )}
                            {/* Botão "usar como fonte Y" */}
                            <button
                              onClick={() => setAddYSource(src.id)}
                              title={`Usar ${src.name} como fonte ao adicionar ao eixo Y`}
                              style={{
                                background: isActiveAddY ? src.color : 'transparent',
                                border: `1px solid ${src.color}`,
                                borderRadius: 4, color: isActiveAddY ? '#fff' : src.color,
                                fontSize: 9, padding: '2px 6px', cursor: 'pointer', fontWeight: 600,
                              }}>
                              {isActiveAddY ? '✓ Y' : 'Y'}
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Lista de canais */}
                      <div style={{ overflowY: 'auto', flex: 1, padding: '2px 0' }}>
                        {filteredSrcHeaders.map(h => {
                          const st = srcStats[h];
                          const isMapped = Object.values(channels || {}).includes(h);
                          const isChecked = srcSelected?.has(h) || false;
                          return (
                            <div
                              key={h}
                              style={{
                                padding: '4px 8px 4px 10px', cursor: showNewForm ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5,
                                borderBottom: `1px solid ${COLORS.border}18`, transition: 'background 0.1s',
                                background: isChecked ? `${src.color}22` : 'transparent',
                              }}
                              onMouseEnter={(e) => { if (showNewForm && !isChecked) e.currentTarget.style.background = `${src.color}14`; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = isChecked ? `${src.color}22` : 'transparent'; }}
                              title={st ? `Min: ${st.min.toFixed(2)} | Max: ${st.max.toFixed(2)}` : 'Sem dados numéricos'}
                            >
                              {/* Checkbox de seleção múltipla */}
                              {showNewForm && (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleChannelSelect(src.id, h)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ accentColor: src.color, cursor: 'pointer', flexShrink: 0, margin: 0 }}
                                />
                              )}
                              {/* Nome e mapeamento */}
                              <div
                                onClick={() => { if (showNewForm) { insertChannel(h); setAddYSource(src.id); } }}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}
                              >
                                {isMapped && <div style={{ width: 4, height: 4, borderRadius: '50%', background: src.color, flexShrink: 0 }} />}
                                <span style={{
                                  fontSize: 11, fontFamily: 'monospace',
                                  color: isChecked ? src.color : isMapped ? COLORS.textPrimary : COLORS.textSecondary,
                                  fontWeight: isChecked || isMapped ? 600 : 400,
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>{h}</span>
                              </div>
                              {st && (
                                <span style={{ fontSize: 9, color: COLORS.textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {st.min.toFixed(1)}~{st.max.toFixed(1)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {filteredSrcHeaders.length === 0 && src.headers.length > 0 && (
                          <div style={{ padding: 10, textAlign: 'center', fontSize: 10, color: COLORS.textMuted }}>
                            Nenhum canal encontrado
                          </div>
                        )}
                        {src.loading && (
                          <div style={{ padding: 10, textAlign: 'center', fontSize: 10, color: COLORS.textMuted }}>
                            Carregando...
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            );
          })}

          {/* Variáveis Criadas (fórmulas salvas) */}
          {formulas.length > 0 && (
            <div style={{
              background: COLORS.bgCard, borderRadius: 12, border: `1px solid ${COLORS.accent || '#4466ff'}33`,
              display: 'flex', flexDirection: 'column', maxHeight: 200,
            }}>
              <div style={{ padding: '10px 14px 6px', borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 11, color: COLORS.accent || '#4466ff', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
                  Variáveis Criadas ({formulas.length})
                </div>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                {formulas.map((f, idx) => {
                  const r = results[idx];
                  return (
                    <div
                      key={idx}
                      onClick={() => showNewForm && insertChannel(f.name)}
                      style={{
                        padding: '5px 14px', cursor: showNewForm ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                        borderBottom: `1px solid ${COLORS.border}22`, transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => { if (showNewForm) e.currentTarget.style.background = COLORS.bgCardHover; }}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      title={f.formula}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 10, color: COLORS.accent || '#4466ff', fontWeight: 700, flexShrink: 0 }}>fx</span>
                        <span style={{
                          fontSize: 11, color: COLORS.textPrimary, fontFamily: 'monospace',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600,
                        }}>{f.name}</span>
                      </div>
                      {r?.stats && (
                        <span style={{ fontSize: 9, color: COLORS.textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {r.stats.min.toFixed(1)}~{r.stats.max.toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Área principal: editor + resultados ─────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Editor de fórmula ───────────────────────────────── */}
          {showNewForm && (
            <div style={{
              background: COLORS.bgCard, borderRadius: 12,
              border: `1px solid ${COLORS.accent || '#4466ff'}44`,
              padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>
                {editingIdx !== null
                  ? (draftOutput === 'var' ? 'Editar Variável' : 'Editar Fórmula')
                  : (draftOutput === 'var' ? 'Nova Variável' : 'Nova Fórmula')}
              </span>

              {/* Nome */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: COLORS.textMuted, width: 55, flexShrink: 0 }}>Nome:</span>
                <input
                  type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Ex: Relação RPM/Vel"
                  style={{ flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.textPrimary, fontSize: 12, padding: '6px 10px', outline: 'none' }}
                />
              </div>

              {/* Fórmula */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 11, color: COLORS.textMuted, width: 55, flexShrink: 0, paddingTop: 6 }}>f(x) =</span>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input
                    ref={formulaInputRef} type="text" value={draftFormula}
                    onChange={(e) => setDraftFormula(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveFormula(); }}
                    placeholder="Ex: RPM / [GPS Speed] * 100"
                    style={{ width: '100%', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.textPrimary, fontSize: 12, padding: '8px 10px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
                    Clique nos canais à esquerda para inserir. Funções: abs, sqrt, pow, min, max, round, floor, ceil, log, sin, cos, tan, PI
                  </div>
                </div>
              </div>

              {/* Output mode + decimais */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, color: COLORS.textMuted, width: 55, flexShrink: 0 }}>Output:</span>
                {draftOutput === 'var' ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#44cc88', background: '#44cc8822', border: '1px solid #44cc8844', borderRadius: 6, padding: '4px 10px' }}>
                    🔢 Variável
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {OUTPUT_MODES.filter(m => m.key !== 'var').map(({ key, label, icon }) => (
                      <button key={key} onClick={() => setDraftOutput(key)} style={{
                        background: draftOutput === key ? (COLORS.bgCardHover || '#2a2a2a') : 'transparent',
                        border: `1px solid ${draftOutput === key ? (COLORS.accent || '#4466ff') : COLORS.border}`,
                        borderRadius: 6, color: draftOutput === key ? COLORS.textPrimary : COLORS.textMuted,
                        fontSize: 11, padding: '4px 10px', cursor: 'pointer',
                      }}>{icon} {label}</button>
                    ))}
                  </div>
                )}
                <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8 }}>Decimais:</span>
                <input
                  type="number" min={0} max={6} value={draftDecimalPlaces}
                  onChange={(e) => setDraftDecimalPlaces(Math.max(0, Math.min(6, parseInt(e.target.value) || 0)))}
                  style={{ width: 45, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.textPrimary, fontSize: 11, padding: '4px 6px', textAlign: 'center', outline: 'none' }}
                />
              </div>

              {/* ── Configuração de eixos (só para gráfico) ──────── */}
              {(draftOutput === 'chart') && (
                <div style={{
                  background: COLORS.bg, borderRadius: 8, padding: 12,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                      Configuração dos Eixos
                    </span>
                    {/* Seletor de fonte ativa para variáveis Y */}
                    {sourceList.length > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: COLORS.textMuted }}>Fonte Y:</span>
                        <select
                          value={addYSource}
                          onChange={(e) => setAddYSource(e.target.value)}
                          style={{
                            background: `${sourceColors[addYSource] || COLORS.bg}22`,
                            border: `1px solid ${sourceColors[addYSource] || COLORS.border}`,
                            borderRadius: 5, color: sourceColors[addYSource] || COLORS.textPrimary,
                            fontSize: 11, padding: '3px 6px', cursor: 'pointer', fontWeight: 600,
                          }}
                        >
                          {sourceList.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: COLORS.textMuted, width: 80, flexShrink: 0, fontWeight: 600 }}>Eixo X:</span>
                    <VarSelect value={draftChartX} onChange={setDraftChartX} options={xOptions} placeholder="Tempo" COLORS={COLORS} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#00ccff', width: 80, flexShrink: 0, fontWeight: 600, paddingTop: 4 }}>Eixo Y ◀:</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <VarSelect value={addYTarget} onChange={(v) => { setAddYTarget(v); if (v) addToY(v, 'y'); }}
                        options={yOptions} placeholder="+ Adicionar variável..." COLORS={COLORS} color="#00ccff" allowNone />
                      {draftChartY.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {draftChartY.map((v, i) => (
                            <VarPill key={v.key} label={resolveLabel(v.key)} color={v.color} COLORS={COLORS}
                              onRemove={() => setDraftChartY(prev => prev.filter((_, j) => j !== i))} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#ff8800', width: 80, flexShrink: 0, fontWeight: 600, paddingTop: 4 }}>Eixo Y2 ▶:</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <VarSelect value={addY2Target} onChange={(v) => { setAddY2Target(v); if (v) addToY(v, 'y2'); }}
                        options={yOptions} placeholder="+ Adicionar variável..." COLORS={COLORS} color="#ff8800" allowNone />
                      {draftChartY2.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {draftChartY2.map((v, i) => (
                            <VarPill key={v.key} label={resolveLabel(v.key)} color={v.color} COLORS={COLORS}
                              onRemove={() => setDraftChartY2(prev => prev.filter((_, j) => j !== i))} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Comparar com fontes do perfil ────────────────── */}
              {savedSources.length > 0 && (
                <div style={{
                  background: COLORS.bg, borderRadius: 8, padding: 12,
                  display: 'flex', flexDirection: 'column', gap: 8,
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <span style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Comparar com fontes do perfil
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) addCompareSource(e.target.value); }}
                      style={{
                        background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                        borderRadius: 6, color: COLORS.textMuted, fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                      }}
                    >
                      <option value="">+ Adicionar volta / sessão...</option>
                      {savedSources
                        .filter(s => !draftCompare.find(c => c.id === s.id))
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.label}{s.detail ? ` (${s.detail})` : ''}
                          </option>
                        ))
                      }
                    </select>
                    {draftCompare.map((cmp, i) => (
                      <VarPill
                        key={cmp.id}
                        label={cmp.name}
                        color={sourceColors[cmp.id] || CMP_COLORS[i % CMP_COLORS.length]}
                        COLORS={COLORS}
                        onRemove={() => setDraftCompare(prev => prev.filter((_, j) => j !== i))}
                      />
                    ))}
                  </div>
                  {draftCompare.length === 0 && (
                    <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                      A mesma fórmula será aplicada nos dados de cada fonte selecionada
                    </div>
                  )}
                </div>
              )}

              {/* Botões */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={resetDraft} style={{
                  background: 'transparent', border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, color: COLORS.textMuted, fontSize: 11, padding: '6px 14px', cursor: 'pointer',
                }}>Cancelar</button>
                <button
                  onClick={saveFormula}
                  disabled={!draftName.trim() || !draftFormula.trim()}
                  style={{
                    background: draftName.trim() && draftFormula.trim() ? '#22aa44' : COLORS.bgCardHover,
                    border: 'none', borderRadius: 6, color: '#fff', fontSize: 11,
                    padding: '6px 16px', cursor: draftName.trim() && draftFormula.trim() ? 'pointer' : 'not-allowed',
                    fontWeight: 600, opacity: draftName.trim() && draftFormula.trim() ? 1 : 0.5,
                  }}>{editingIdx !== null ? 'Salvar' : 'Criar'}</button>
              </div>
            </div>
          )}

          {/* ── Placeholder (sem fórmulas) ─────────────────────── */}
          {results.length === 0 && !showNewForm && (
            <div style={{ background: COLORS.bgCard, borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4, fontFamily: 'monospace', fontWeight: 800 }}>f(x)</div>
              <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>
                Crie fórmulas personalizadas combinando os canais de telemetria
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.8 }}>
                Exemplos:<br />
                <span style={{ fontFamily: 'monospace', color: COLORS.textSecondary }}>RPM / [GPS Speed]</span> — relação marcha<br />
                <span style={{ fontFamily: 'monospace', color: COLORS.textSecondary }}>[Throttle Pos] * [Engine RPM] / 100</span> — potência relativa<br />
                <span style={{ fontFamily: 'monospace', color: COLORS.textSecondary }}>sqrt(pow([Lat G], 2) + pow([Long G], 2))</span> — G total
              </div>
            </div>
          )}

          {/* ── Resultados de cada fórmula ───────────────────────── */}
          {results.map((r, idx) => {
            const cmpEntries = Object.entries(r.compareData || {});
            const hasMainData = r.data.length > 0;
            const hasCmpData  = cmpEntries.some(([, c]) => c.data?.length > 0);
            const hasAnyData  = hasMainData || hasCmpData;

            return (
              <div key={idx} style={{ background: COLORS.bgCard, borderRadius: 12, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>

                {/* Header da fórmula */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{r.name}</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: COLORS.textMuted, background: COLORS.bg, padding: '2px 8px', borderRadius: 4 }}>
                      {r.formula}
                    </span>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 4,
                      background: r.output === 'var' ? '#44cc8822' : r.output === 'chart' ? '#2255ee22' : r.output === 'table' ? '#22aa4422' : '#ff880022',
                      color: r.output === 'var' ? '#44cc88' : r.output === 'chart' ? '#4488ff' : r.output === 'table' ? '#44cc66' : '#ffaa44',
                    }}>
                      {OUTPUT_MODES.find(m => m.key === r.output)?.icon} {OUTPUT_MODES.find(m => m.key === r.output)?.label}
                    </span>
                    {cmpEntries.map(([id, cmp], ci) => {
                      const badgeColor = sourceColors[id] || CMP_COLORS[ci % CMP_COLORS.length];
                      return (
                        <span key={id} style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 4,
                          background: `${badgeColor}22`, color: badgeColor, fontWeight: 600,
                        }}>
                          {cmp.loading ? `⌛ ${cmp.name}` : cmp.error ? `⚠ ${cmp.name}` : `⊕ ${cmp.name}`}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => editFormula(idx)} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 12, padding: '2px 6px' }} title="Editar">✏️</button>
                    <button onClick={() => deleteFormula(idx)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 12, padding: '2px 6px' }} title="Excluir">🗑️</button>
                  </div>
                </div>

                {/* Conteúdo */}
                <div style={{ padding: 16 }}>

                  {/* Erro na fórmula principal */}
                  {r.error && (
                    <div style={{ color: '#ff4444', fontSize: 12, fontFamily: 'monospace', padding: '8px 0', marginBottom: 8 }}>
                      {r.error}
                    </div>
                  )}

                  {/* Sem nenhum dado */}
                  {!r.error && !hasAnyData && cmpEntries.every(([, c]) => !c.loading) && (
                    <div style={{ color: COLORS.textMuted, fontSize: 12, textAlign: 'center', padding: 16 }}>
                      Sem resultados — verifique se os canais existem nos dados
                    </div>
                  )}

                  {/* ── Estatísticas ─────────────────────────────── */}
                  {(hasMainData || hasCmpData || cmpEntries.some(([, c]) => c.loading)) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>

                      {/* Sessão principal */}
                      {hasMainData && r.stats && (
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 90, fontWeight: 600 }}>
                            {firstPrimary
                              ? firstPrimary.name
                              : data ? (selectedLap === 'all' ? 'Sessão' : `Volta ${selectedLap}`) : 'Principal'}
                          </span>
                          {[
                            { label: 'Mín', value: r.stats.min, color: '#00ccff' },
                            { label: 'Máx', value: r.stats.max, color: '#ff4444' },
                            { label: 'Média', value: r.stats.avg, color: '#ffcc00' },
                            { label: 'N', value: r.stats.count, color: COLORS.textMuted, isInt: true },
                          ].map(({ label, value, color, isInt }) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}:</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace' }}>
                                {isInt ? value : value.toFixed(r.decimals ?? 2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Fontes de comparação */}
                      {cmpEntries.map(([id, cmp], ci) => {
                        const cmpColor = sourceColors[id] || CMP_COLORS[ci % CMP_COLORS.length];
                        if (cmp.loading) return (
                          <div key={id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: cmpColor, minWidth: 90, fontWeight: 600 }}>{cmp.name}</span>
                            <span style={{ fontSize: 10, color: COLORS.textMuted }}>Carregando...</span>
                          </div>
                        );
                        if (cmp.error) return (
                          <div key={id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: cmpColor, minWidth: 90, fontWeight: 600 }}>{cmp.name}</span>
                            <span style={{ fontSize: 10, color: '#ff4444' }}>{cmp.error}</span>
                          </div>
                        );
                        if (!cmp.stats) return null;
                        return (
                          <div key={id} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: cmpColor, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 90, fontWeight: 600 }}>
                              {cmp.name}
                            </span>
                            {[
                              { label: 'Mín', value: cmp.stats.min, color: cmpColor },
                              { label: 'Máx', value: cmp.stats.max, color: cmpColor },
                              { label: 'Média', value: cmp.stats.avg, color: cmpColor },
                              { label: 'N', value: cmp.stats.count, color: COLORS.textMuted, isInt: true },
                            ].map(({ label, value, color, isInt }) => (
                              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}:</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace' }}>
                                  {isInt ? value : value.toFixed(r.decimals ?? 2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Output: Variável (só stats compactas) ─── */}
                  {r.output === 'var' && (
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '6px 2px' }}>
                      {hasMainData && r.stats && [
                        { label: 'Mín', value: r.stats.min },
                        { label: 'Máx', value: r.stats.max },
                        { label: 'Média', value: r.stats.avg },
                        { label: 'Último', value: r.data[r.data.length - 1]?.value },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'monospace' }}>
                            {typeof value === 'number' ? value.toFixed(r.decimals ?? 2) : '—'}
                          </div>
                        </div>
                      ))}
                      {cmpEntries.filter(([, c]) => c.stats).map(([id, cmp], ci) => {
                        const cc = sourceColors[id] || CMP_COLORS[ci % CMP_COLORS.length];
                        return (
                          <div key={id} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', borderLeft: `2px solid ${cc}44`, paddingLeft: 12 }}>
                            <div style={{ fontSize: 9, color: cc, fontWeight: 700, marginBottom: 2, alignSelf: 'flex-start' }}>{cmp.name}</div>
                            {[{ label: 'Mín', v: cmp.stats.min }, { label: 'Máx', v: cmp.stats.max }, { label: 'Média', v: cmp.stats.avg }].map(({ label, v }) => (
                              <div key={label} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 9, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: cc, fontFamily: 'monospace' }}>{v.toFixed(r.decimals ?? 2)}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                      {!hasMainData && cmpEntries.length === 0 && (
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>Sem dados — carregue uma fonte para calcular</span>
                      )}
                    </div>
                  )}

                  {/* ── Output: Gráfico ─────────────────────────── */}
                  {r.output === 'chart' && hasAnyData && (() => {
                    const yVars  = r.chartY  || [];
                    const y2Vars = r.chartY2 || [];
                    const hasAxes = yVars.length > 0 || y2Vars.length > 0;
                    const hasY2   = y2Vars.length > 0;
                    const xLabel  = resolveLabel(r.chartX || '__time__');

                    /* ── Multi-eixo configurado ─────────────────── */
                    if (hasAxes) {
                      const mainChartData = hasMainData ? buildChartData(r) : [];
                      return (
                        <div>
                          <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap', fontSize: 10 }}>
                            <span style={{ color: COLORS.textMuted }}>X: <strong style={{ color: COLORS.textSecondary }}>{xLabel}</strong></span>
                            {yVars.map(v => <span key={v.key} style={{ color: v.color }}>● {resolveLabel(v.key)}</span>)}
                            {y2Vars.map(v => <span key={v.key} style={{ color: v.color }}>○ {resolveLabel(v.key)} (Y2)</span>)}
                          </div>
                          <div style={{ width: '100%', height: 280 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart>
                                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                                <XAxis dataKey="__x" type="number" domain={['auto', 'auto']}
                                  stroke={COLORS.textMuted} fontSize={10}
                                  tickFormatter={(v) => (r.chartX || '__time__') === '__time__' ? `${v.toFixed(1)}s` : v.toFixed(1)}
                                  label={{ value: xLabel, position: 'insideBottomRight', offset: -5, fontSize: 10, fill: COLORS.textMuted }}
                                />
                                <YAxis yAxisId="left" stroke="#00ccff" fontSize={10} />
                                {hasY2 && <YAxis yAxisId="right" orientation="right" stroke="#ff8800" fontSize={10} />}
                                <Tooltip
                                  contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 11 }}
                                  labelFormatter={(v) => `${xLabel} = ${typeof v === 'number' ? v.toFixed(2) : v}`}
                                  formatter={(v, name) => [typeof v === 'number' ? v.toFixed(r.decimals ?? 2) : v, name]}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                {/* Sessão principal */}
                                {hasMainData && yVars.map(v => (
                                  <Line key={v.key} data={mainChartData} yAxisId="left" type="monotone"
                                    dataKey={v.key} stroke={v.color} dot={false} strokeWidth={2}
                                    name={resolveLabel(v.key)} />
                                ))}
                                {hasMainData && y2Vars.map(v => (
                                  <Line key={v.key} data={mainChartData} yAxisId={hasY2 ? 'right' : 'left'} type="monotone"
                                    dataKey={v.key} stroke={v.color} dot={false} strokeWidth={2}
                                    strokeDasharray="5 3" name={`${resolveLabel(v.key)} (Y2)`} />
                                ))}
                                {/* Fontes de comparação */}
                                {cmpEntries.map(([id, cmp], ci) => {
                                  if (!cmp.chartDataMulti?.length) return null;
                                  const cmpColor = sourceColors[id] || CMP_COLORS[ci % CMP_COLORS.length];
                                  const dash = CMP_DASHES[ci % CMP_DASHES.length];
                                  return [
                                    ...yVars.map(v => (
                                      <Line key={`${id}_${v.key}`} data={cmp.chartDataMulti} yAxisId="left"
                                        type="monotone" dataKey={v.key} stroke={cmpColor} dot={false}
                                        strokeWidth={1.5} strokeDasharray={dash}
                                        name={`${resolveLabel(v.key)} — ${cmp.name}`} />
                                    )),
                                    ...y2Vars.map(v => (
                                      <Line key={`${id}_${v.key}_y2`} data={cmp.chartDataMulti}
                                        yAxisId={hasY2 ? 'right' : 'left'} type="monotone" dataKey={v.key}
                                        stroke={cmpColor} dot={false} strokeWidth={1.5}
                                        strokeDasharray={dash}
                                        name={`${resolveLabel(v.key)} Y2 — ${cmp.name}`} />
                                    )),
                                  ];
                                })}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    }

                    /* ── Gráfico simples (fórmula como único Y) ──── */
                    const mainStart = r.data[0]?.t || 0;
                    const mainStep  = Math.max(1, Math.ceil(r.data.length / 2000));
                    const mainSub   = r.data
                      .filter((_, i) => i % mainStep === 0)
                      .map(d => ({ ...d, t: d.t - mainStart }));

                    return (
                      <div style={{ width: '100%', height: 250 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart>
                            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                            <XAxis dataKey="t" type="number" domain={['auto', 'auto']}
                              stroke={COLORS.textMuted} fontSize={10}
                              tickFormatter={(v) => `${v.toFixed(1)}s`} />
                            <YAxis stroke={COLORS.textMuted} fontSize={10}
                              tickFormatter={(v) => v.toFixed(r.decimals > 2 ? 1 : 0)} />
                            <Tooltip
                              contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 11 }}
                              labelFormatter={(v) => `t = ${v.toFixed(2)}s`}
                              formatter={(v, name) => [typeof v === 'number' ? v.toFixed(r.decimals ?? 2) : v, name]}
                            />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            {hasMainData && (
                              <Line data={mainSub} type="monotone" dataKey="value"
                                stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                                dot={false} strokeWidth={2}
                                name={firstPrimary ? firstPrimary.name : data ? (selectedLap === 'all' ? 'Sessão' : `Volta ${selectedLap}`) : r.name} />
                            )}
                            {cmpEntries.map(([id, cmp], ci) => {
                              if (!cmp.data?.length) return null;
                              const cmpStart = cmp.data[0]?.t || 0;
                              const cmpStep  = Math.max(1, Math.ceil(cmp.data.length / 2000));
                              const cmpSub   = cmp.data
                                .filter((_, i) => i % cmpStep === 0)
                                .map(d => ({ ...d, t: d.t - cmpStart }));
                              return (
                                <Line key={id} data={cmpSub} type="monotone" dataKey="value"
                                  stroke={sourceColors[id] || CMP_COLORS[ci % CMP_COLORS.length]}
                                  strokeDasharray={CMP_DASHES[ci % CMP_DASHES.length]}
                                  dot={false} strokeWidth={1.5} name={cmp.name} />
                              );
                            })}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}

                  {/* ── Output: Tabela ───────────────────────────── */}
                  {r.output === 'table' && hasAnyData && (() => {
                    const activeCmp  = cmpEntries.filter(([, c]) => c.data?.length);
                    const mainStep   = Math.max(1, Math.ceil(r.data.length / 500));
                    const mainRows   = r.data.filter((_, i) => i % mainStep === 0);
                    const mainStart  = r.data[0]?.t || 0;
                    const cmpSampled = {};
                    for (const [id, cmp] of activeCmp) {
                      const s = Math.max(1, Math.ceil(cmp.data.length / 500));
                      cmpSampled[id] = {
                        rows: cmp.data.filter((_, i) => i % s === 0),
                        start: cmp.data[0]?.t || 0,
                      };
                    }
                    const maxRowCount = Math.max(
                      mainRows.length,
                      ...Object.values(cmpSampled).map(c => c.rows.length),
                    );
                    return (
                      <div style={{ maxHeight: 300, overflowY: 'auto', borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
                          <thead>
                            <tr style={{ background: COLORS.bg, position: 'sticky', top: 0 }}>
                              <th style={{ padding: '6px 12px', textAlign: 'left', color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600 }}>#</th>
                              {hasMainData && <>
                                <th style={{ padding: '6px 12px', textAlign: 'right', color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600 }}>t (s)</th>
                                <th style={{ padding: '6px 12px', textAlign: 'right', color: COLORS.textPrimary, borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600 }}>{r.name}</th>
                              </>}
                              {activeCmp.map(([id, cmp], ci) => {
                                const thColor = sourceColors[id] || CMP_COLORS[ci % CMP_COLORS.length];
                                return (
                                  <React.Fragment key={id}>
                                    <th style={{ padding: '6px 12px', textAlign: 'right', color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600 }}>t (s)</th>
                                    <th style={{ padding: '6px 12px', textAlign: 'right', color: thColor, borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600 }}>
                                      {cmp.name}
                                    </th>
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: maxRowCount }, (_, i) => {
                              const mp = mainRows[i];
                              return (
                                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                                  <td style={{ padding: '4px 12px', color: COLORS.textMuted }}>{i + 1}</td>
                                  {hasMainData && <>
                                    <td style={{ padding: '4px 12px', textAlign: 'right', color: COLORS.textSecondary }}>
                                      {mp ? (mp.t - mainStart).toFixed(3) : '—'}
                                    </td>
                                    <td style={{ padding: '4px 12px', textAlign: 'right', color: COLORS.textPrimary, fontWeight: 600 }}>
                                      {mp ? mp.value.toFixed(r.decimals ?? 2) : '—'}
                                    </td>
                                  </>}
                                  {activeCmp.map(([id, cmp], ci) => {
                                    const { rows: cr, start: cs } = cmpSampled[id];
                                    const cp = cr[i];
                                    const tdColor = sourceColors[id] || CMP_COLORS[ci % CMP_COLORS.length];
                                    return (
                                      <React.Fragment key={id}>
                                        <td style={{ padding: '4px 12px', textAlign: 'right', color: COLORS.textSecondary }}>
                                          {cp ? (cp.t - cs).toFixed(3) : '—'}
                                        </td>
                                        <td style={{ padding: '4px 12px', textAlign: 'right', color: tdColor, fontWeight: 600 }}>
                                          {cp ? cp.value.toFixed(r.decimals ?? 2) : '—'}
                                        </td>
                                      </React.Fragment>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {/* ── Output: Lista ────────────────────────────── */}
                  {r.output === 'list' && hasAnyData && (
                    <div style={{ maxHeight: 300, overflowY: 'auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {hasMainData && (
                        <div>
                          {(data || primarySources.length > 0 || cmpEntries.length > 0) && (
                            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4, fontWeight: 600 }}>
                              {firstPrimary
                                ? firstPrimary.name
                                : data ? (selectedLap === 'all' ? 'Sessão' : `Volta ${selectedLap}`) : 'Principal'}
                            </div>
                          )}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {r.data.filter((_, i) => i % Math.max(1, Math.ceil(r.data.length / 200)) === 0).map((d, i) => (
                              <span key={i} style={{
                                fontSize: 10, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 4,
                                background: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}33`,
                              }}>{d.value.toFixed(r.decimals ?? 2)}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {cmpEntries.map(([id, cmp], ci) => {
                        if (!cmp.data?.length) return null;
                        const cmpColor = sourceColors[id] || CMP_COLORS[ci % CMP_COLORS.length];
                        return (
                          <div key={id}>
                            <div style={{ fontSize: 10, color: cmpColor, fontWeight: 600, marginBottom: 4 }}>{cmp.name}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {cmp.data.filter((_, i) => i % Math.max(1, Math.ceil(cmp.data.length / 200)) === 0).map((d, i) => (
                                <span key={i} style={{
                                  fontSize: 10, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 4,
                                  background: `${cmpColor}11`, color: cmpColor, border: `1px solid ${cmpColor}33`,
                                }}>{d.value.toFixed(r.decimals ?? 2)}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <PrintFooter />
    </div>
  );
}
