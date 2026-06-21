import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS, ROLE_LABELS } from '../context/AppContext';
import { useCloud } from '../context/CloudContext';

const CATEGORIES = ['Pit Stop', 'Volta Manual', 'Warm-Up de Pneu', 'Reparo', 'Abastecimento', 'Outro'];

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis  = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export default function TimerScreen() {
  const { submitMeasurement } = useCloud();

  const [title,      setTitle]      = useState('');
  const [category,   setCategory]   = useState('Pit Stop');
  const [timerState, setTimerState] = useState('idle'); // idle | running | stopped
  const [elapsed,    setElapsed]    = useState(0);
  const [splits,     setSplits]     = useState([]);
  const [splitNames, setSplitNames] = useState({});
  const [sent,       setSent]       = useState(false);

  const startTimeRef  = useRef(null);
  const splitStartRef = useRef(null);
  const intervalRef   = useRef(null);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  function startTimer() {
    const now = Date.now();
    startTimeRef.current  = now;
    splitStartRef.current = now;
    setSplits([]);
    setSplitNames({});
    setElapsed(0);
    setSent(false);
    setTimerState('running');
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 33);
  }

  function recordSplit() {
    const now       = Date.now();
    const splitTime = now - splitStartRef.current;
    const totalTime = now - startTimeRef.current;
    setSplits((prev) => [...prev, { index: prev.length + 1, splitTime, totalTime }]);
    splitStartRef.current = now;
  }

  function stopTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsed(Date.now() - startTimeRef.current);
    setTimerState('stopped');
  }

  async function handleSend() {
    const formattedSplits = splits.map((s, i) => ({
      index: s.index,
      name:  splitNames[i] || `Split ${s.index}`,
      splitTime: s.splitTime,
      totalTime: s.totalTime,
    }));
    const id = await submitMeasurement('timer', title || category, {
      category, totalTime: elapsed, splits: formattedSplits,
    }, null);
    if (id) {
      setSent(true);
      Alert.alert('Enviado! ✅', 'O tempo foi enviado à equipe com sucesso.');
    } else {
      Alert.alert('Erro', 'Não foi possível enviar. Verifique a conexão.');
    }
  }

  function handleReset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerState('idle');
    setElapsed(0);
    setSplits([]);
    setSplitNames({});
    setSent(false);
    setTitle('');
  }

  function updateSplitName(index, name) {
    setSplitNames((prev) => ({ ...prev, [index]: name }));
  }

  const timerColor = timerState === 'running' ? COLORS.green : timerState === 'stopped' ? COLORS.yellow : COLORS.textPrimary;

  return (
    <SafeAreaView style={st.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">

        {/* Page header */}
        <View style={st.pageHeader}>
          <View style={st.pageHeaderAccent} />
          <View style={{ flex: 1 }}>
            <Text style={st.screenTitle}>CRONÔMETRO · PIT STOP</Text>
            <Text style={st.screenSub}>Registre tempos e splits</Text>
          </View>
          {/* Mini barras de performance decorativas */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginLeft: 8 }}>
            <View style={{ width: 5, height: 8,  backgroundColor: '#5a5a70', borderRadius: 1 }} />
            <View style={{ width: 5, height: 14, backgroundColor: COLORS.blue,   borderRadius: 1 }} />
            <View style={{ width: 5, height: 20, backgroundColor: COLORS.yellow, borderRadius: 1 }} />
          </View>
        </View>

        {/* Config (só no idle) */}
        {timerState === 'idle' && (
          <View style={st.configCard}>
            <View style={st.sectionCardHeader}>
              <View style={st.sectionCardAccent} />
              <Text style={st.sectionCardTitle}>CONFIGURAÇÃO</Text>
            </View>
            <View style={st.configBody}>
              <Text style={st.label}>Título (opcional)</Text>
              <TextInput
                style={st.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Ex: Pit stop — volta 12"
                placeholderTextColor={COLORS.textMuted}
              />

              <Text style={st.label}>Categoria</Text>
              <View style={st.catGrid}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[st.catBtn, category === c && st.catBtnActive]}
                    onPress={() => setCategory(c)}
                    activeOpacity={0.75}
                  >
                    <Text style={[st.catBtnText, category === c && st.catBtnTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Display do tempo — DRAMÁTICO */}
        <View style={[st.timerDisplayCard, timerState === 'running' && st.timerDisplayCardRunning]}>
          <View style={[st.timerDisplayAccent, { backgroundColor: timerColor }]} />
          <View style={st.timerDisplayBody}>
            <Text style={[st.timerText, { color: timerColor }]}>
              {formatTime(elapsed)}
            </Text>

            {timerState === 'running' && (
              <View style={st.timerIndicator}>
                <View style={st.timerDot} />
                <Text style={st.timerRunningLabel}>EM ANDAMENTO</Text>
              </View>
            )}
            {timerState === 'idle' && (
              <Text style={st.timerIdle}>PRONTO PARA INICIAR</Text>
            )}
            {timerState === 'stopped' && (
              <Text style={[st.timerIdle, { color: COLORS.yellow }]}>CRONÔMETRO PARADO</Text>
            )}

            {/* Categoria ativa */}
            {timerState !== 'idle' && (
              <View style={st.categoryPill}>
                <Text style={st.categoryPillText}>{category.toUpperCase()}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Botões por estado */}
        {timerState === 'idle' && (
          <TouchableOpacity style={st.startBtn} onPress={startTimer} activeOpacity={0.82}>
            <Text style={st.startBtnText}>▶  INICIAR</Text>
          </TouchableOpacity>
        )}

        {timerState === 'running' && (
          <View style={st.runningBtns}>
            <TouchableOpacity style={st.splitBtn} onPress={recordSplit} activeOpacity={0.8}>
              <Text style={st.splitBtnText}>✦  SPLIT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.stopBtn} onPress={stopTimer} activeOpacity={0.8}>
              <Text style={st.stopBtnText}>■  PARAR</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Lista de splits */}
        {splits.length > 0 && (
          <View style={st.splitsCard}>
            <View style={st.sectionCardHeader}>
              <View style={st.sectionCardAccent} />
              <Text style={st.sectionCardTitle}>SPLITS</Text>
              <Text style={st.splitCount}>{splits.length}</Text>
            </View>
            <View style={st.splitsList}>
              {splits.map((split, i) => (
                <View key={i} style={st.splitRow}>
                  <View style={st.splitIndexBadge}>
                    <Text style={st.splitIndex}>#{split.index}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={st.splitNameInput}
                      value={splitNames[i] || ''}
                      onChangeText={(v) => updateSplitName(i, v)}
                      placeholder={`Split ${split.index}`}
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <View style={st.splitTimes}>
                      <Text style={st.splitTime}>{formatTime(split.splitTime)}</Text>
                      <Text style={st.splitSep}> | </Text>
                      <Text style={st.splitTotal}>Total: {formatTime(split.totalTime)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Resultado final — card dramático */}
        {timerState === 'stopped' && (
          <View style={st.resultSection}>
            <View style={st.totalCard}>
              <View style={st.totalCardAccent} />
              <View style={st.totalCardBody}>
                <Text style={st.totalLabel}>TEMPO TOTAL</Text>
                <Text style={st.totalTime}>{formatTime(elapsed)}</Text>
                {title ? <Text style={st.totalSubLabel}>{title}</Text> : null}
                <View style={st.categoryPillResult}>
                  <Text style={st.categoryPillResultText}>{category.toUpperCase()}</Text>
                </View>
                {splits.length > 0 && (
                  <Text style={st.totalSplitsCount}>{splits.length} split{splits.length > 1 ? 's' : ''} registrado{splits.length > 1 ? 's' : ''}</Text>
                )}
              </View>
            </View>

            <View style={st.resultBtns}>
              <TouchableOpacity
                style={[st.sendBtn, sent && st.sendBtnDisabled]}
                onPress={handleSend}
                disabled={sent}
                activeOpacity={0.82}
              >
                <Text style={st.sendBtnText}>
                  {sent ? '✓  ENVIADO AO DESKTOP' : '📤  ENVIAR AO DESKTOP'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.resetBtn} onPress={handleReset} activeOpacity={0.75}>
                <Text style={st.resetBtnText}>↺  NOVO CRONÔMETRO</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 64 },

  /* Page header */
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
  },
  pageHeaderAccent: { width: 3, height: 22, backgroundColor: COLORS.accent, borderRadius: 2 },
  screenTitle: {
    fontSize: 13, fontWeight: '900', color: COLORS.textPrimary,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  screenSub: { fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 1 },

  /* Config card */
  configCard: {
    backgroundColor: COLORS.bgCard, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 5,
  },
  sectionCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
  },
  sectionCardAccent: { width: 3, height: 16, backgroundColor: COLORS.accent, borderRadius: 2 },
  sectionCardTitle: {
    flex: 1, fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  splitCount: {
    fontSize: 11, fontWeight: '900', color: COLORS.accent,
    backgroundColor: COLORS.accentDim, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10,
  },
  configBody: { padding: 16 },
  label: {
    color: COLORS.textMuted, fontSize: 10, letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 6, marginTop: 4, fontWeight: '700',
  },
  input: {
    backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.textPrimary, fontSize: 16,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  catBtn: {
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  catBtnActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  catBtnText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  catBtnTextActive: { color: COLORS.bg, fontWeight: '800' },

  /* Timer display */
  timerDisplayCard: {
    backgroundColor: COLORS.bgCard, borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10,
  },
  timerDisplayCardRunning: {
    borderColor: COLORS.green + '50',
    elevation: 12, shadowColor: COLORS.green, shadowOpacity: 0.2,
  },
  timerDisplayAccent: { height: 4 },
  timerDisplayBody: { padding: 32, alignItems: 'center' },
  timerText: {
    fontSize: 68, fontWeight: '900', letterSpacing: 2,
    fontVariant: ['tabular-nums'], textAlign: 'center',
    lineHeight: 80,
  },
  timerIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  timerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  timerRunningLabel: {
    color: COLORS.accent, fontSize: 11, letterSpacing: 2.5, fontWeight: '800', textTransform: 'uppercase',
  },
  timerIdle: {
    color: COLORS.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: '700',
    marginTop: 8, textTransform: 'uppercase',
  },
  categoryPill: {
    marginTop: 16, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: COLORS.bgElevated, borderWidth: 1, borderColor: COLORS.border,
  },
  categoryPillText: {
    fontSize: 10, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 1.5,
  },

  /* Botões de controle */
  startBtn: {
    backgroundColor: COLORS.green, borderRadius: 16, paddingVertical: 22,
    alignItems: 'center', marginBottom: 16,
    elevation: 6, shadowColor: COLORS.green, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10,
  },
  startBtnText: { color: COLORS.bg, fontSize: 22, fontWeight: '900', letterSpacing: 3 },
  runningBtns: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  splitBtn: {
    flex: 1, backgroundColor: COLORS.blue, borderRadius: 16, paddingVertical: 20, alignItems: 'center',
    elevation: 4, shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 6,
  },
  splitBtnText: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 2 },
  stopBtn: {
    flex: 1, backgroundColor: COLORS.accent, borderRadius: 16, paddingVertical: 20, alignItems: 'center',
    elevation: 4, shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 6,
  },
  stopBtnText: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 2 },

  /* Splits list */
  splitsCard: {
    backgroundColor: COLORS.bgCard, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 5,
  },
  splitsList: { padding: 12 },
  splitRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bg, borderRadius: 12, padding: 12,
    marginBottom: 8, gap: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  splitIndexBadge: {
    width: 40, height: 40, borderRadius: 8, backgroundColor: COLORS.accentDim,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.accent + '40',
  },
  splitIndex: { fontSize: 14, fontWeight: '900', color: COLORS.accent },
  splitNameInput: {
    color: COLORS.textPrimary, fontSize: 14, fontWeight: '600',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingBottom: 4, marginBottom: 6,
  },
  splitTimes: { flexDirection: 'row', alignItems: 'center' },
  splitTime: {
    color: COLORS.green, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'],
  },
  splitSep: { color: COLORS.textMuted, fontSize: 12, marginHorizontal: 4 },
  splitTotal: { color: COLORS.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },

  /* Resultado final */
  resultSection: { gap: 12 },
  totalCard: {
    backgroundColor: COLORS.bgCard, borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.yellow + '40',
    elevation: 8, shadowColor: COLORS.yellow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 10,
  },
  totalCardAccent: { height: 4, backgroundColor: COLORS.yellow },
  totalCardBody: { padding: 32, alignItems: 'center' },
  totalLabel: {
    color: COLORS.textMuted, fontSize: 11, letterSpacing: 2.5, fontWeight: '800',
    textTransform: 'uppercase', marginBottom: 8,
  },
  totalTime: {
    fontSize: 56, fontWeight: '900', color: COLORS.yellow,
    fontVariant: ['tabular-nums'], lineHeight: 66,
  },
  totalSubLabel: {
    color: COLORS.textPrimary, fontSize: 15, marginTop: 12, fontWeight: '700',
  },
  categoryPillResult: {
    marginTop: 12, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
    backgroundColor: COLORS.yellow + '18', borderWidth: 1, borderColor: COLORS.yellow + '50',
  },
  categoryPillResultText: {
    fontSize: 11, fontWeight: '800', color: COLORS.yellow, letterSpacing: 1.5,
  },
  totalSplitsCount: {
    color: COLORS.textMuted, fontSize: 11, marginTop: 10, letterSpacing: 0.5,
  },
  resultBtns: { gap: 10 },
  sendBtn: {
    backgroundColor: COLORS.green, borderRadius: 16, paddingVertical: 20, alignItems: 'center',
    elevation: 6, shadowColor: COLORS.green, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: COLORS.bg, fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },
  resetBtn: {
    backgroundColor: COLORS.bgCard, borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  resetBtnText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
});
