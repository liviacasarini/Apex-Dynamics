import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS, ROLE_LABELS } from '../context/AppContext';

const CATEGORIES = ['Pit Stop', 'Volta Manual', 'Warm-Up de Pneu', 'Reparo', 'Abastecimento', 'Outro'];

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centis  = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export default function TimerScreen() {
  const { submitTimer } = useApp();

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

  function handleSend() {
    const formattedSplits = splits.map((s, i) => ({
      index: s.index,
      name:  splitNames[i] || `Split ${s.index}`,
      splitTime: s.splitTime,
      totalTime: s.totalTime,
    }));
    const ok = submitTimer(category, title || category, elapsed, formattedSplits);
    if (ok) {
      setSent(true);
      Alert.alert('Enviado! ✅', 'O tempo foi enviado ao desktop com sucesso.');
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.screenTitle}>⏱️ Cronômetro</Text>

        {/* Config (só no idle) */}
        {timerState === 'idle' && (
          <>
            <Text style={styles.label}>Título (opcional)</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: Pit stop — volta 12"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.label}>Categoria</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.catBtn, category === c && styles.catBtnActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.catBtnText, category === c && styles.catBtnTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Display do tempo */}
        <View style={styles.timerDisplay}>
          <Text style={[styles.timerText, timerState === 'running' && styles.timerTextRunning]}>
            {formatTime(elapsed)}
          </Text>
          {timerState === 'running' && (
            <View style={styles.timerIndicator}>
              <View style={styles.timerDot} />
              <Text style={styles.timerRunningLabel}>EM ANDAMENTO</Text>
            </View>
          )}
          {timerState === 'idle' && (
            <Text style={styles.timerIdle}>Pronto para iniciar</Text>
          )}
        </View>

        {/* Botões por estado */}
        {timerState === 'idle' && (
          <TouchableOpacity style={styles.startBtn} onPress={startTimer}>
            <Text style={styles.startBtnText}>▶  INICIAR</Text>
          </TouchableOpacity>
        )}

        {timerState === 'running' && (
          <View style={styles.runningBtns}>
            <TouchableOpacity style={styles.splitBtn} onPress={recordSplit}>
              <Text style={styles.splitBtnText}>SPLIT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopBtn} onPress={stopTimer}>
              <Text style={styles.stopBtnText}>■  PARAR</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Lista de splits */}
        {splits.length > 0 && (
          <View style={styles.splitsSection}>
            <Text style={styles.sectionTitle}>SPLITS</Text>
            {splits.map((s, i) => (
              <View key={i} style={styles.splitRow}>
                <Text style={styles.splitIndex}>#{s.index}</Text>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={styles.splitNameInput}
                    value={splitNames[i] || ''}
                    onChangeText={(v) => updateSplitName(i, v)}
                    placeholder={`Split ${s.index}`}
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <View style={styles.splitTimes}>
                    <Text style={styles.splitTime}>{formatTime(s.splitTime)}</Text>
                    <Text style={styles.splitTotal}>  |  Total: {formatTime(s.totalTime)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Resultado final */}
        {timerState === 'stopped' && (
          <View style={styles.resultSection}>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>TEMPO TOTAL</Text>
              <Text style={styles.totalTime}>{formatTime(elapsed)}</Text>
              {title ? <Text style={styles.totalSubLabel}>{title}</Text> : null}
              <Text style={styles.totalCat}>{category}</Text>
            </View>
            <View style={styles.resultBtns}>
              <TouchableOpacity
                style={[styles.sendBtn, sent && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={sent}
              >
                <Text style={styles.sendBtnText}>
                  {sent ? '✓ ENVIADO AO DESKTOP' : '📤 ENVIAR AO DESKTOP'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
                <Text style={styles.resetBtnText}>↺  NOVO CRONÔMETRO</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  screenTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 16 },
  label: {
    color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 6, marginTop: 14,
  },
  input: {
    backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.textPrimary, fontSize: 16,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: {
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard,
  },
  catBtnActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  catBtnText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  catBtnTextActive: { color: COLORS.bg, fontWeight: '700' },
  timerDisplay: { alignItems: 'center', marginVertical: 32 },
  timerText: {
    fontSize: 56, fontWeight: '900', color: COLORS.textPrimary,
    letterSpacing: 2, fontVariant: ['tabular-nums'],
  },
  timerTextRunning: { color: COLORS.green },
  timerIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  timerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  timerRunningLabel: { color: COLORS.accent, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  timerIdle: { color: COLORS.textMuted, fontSize: 13, marginTop: 6, letterSpacing: 1 },
  startBtn: {
    backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 20, alignItems: 'center',
  },
  startBtnText: { color: COLORS.bg, fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  runningBtns: { flexDirection: 'row', gap: 12 },
  splitBtn: {
    flex: 1, backgroundColor: COLORS.blue, borderRadius: 14, paddingVertical: 20, alignItems: 'center',
  },
  splitBtnText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  stopBtn: {
    flex: 1, backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 20, alignItems: 'center',
  },
  stopBtnText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  splitsSection: { marginTop: 24 },
  sectionTitle: { color: COLORS.textMuted, fontSize: 11, letterSpacing: 2, marginBottom: 10, fontWeight: '600' },
  splitRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgCard,
    borderRadius: 10, padding: 12, marginBottom: 6, gap: 10,
  },
  splitIndex: { fontSize: 18, fontWeight: '800', color: COLORS.accent, width: 32 },
  splitNameInput: {
    color: COLORS.textPrimary, fontSize: 14, fontWeight: '600',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingBottom: 4, marginBottom: 4,
  },
  splitTimes: { flexDirection: 'row' },
  splitTime: { color: COLORS.green, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  splitTotal: { color: COLORS.textMuted, fontSize: 12 },
  resultSection: { marginTop: 24 },
  totalCard: {
    backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  totalLabel: { color: COLORS.textMuted, fontSize: 12, letterSpacing: 2 },
  totalTime: {
    fontSize: 48, fontWeight: '900', color: COLORS.yellow,
    marginTop: 8, fontVariant: ['tabular-nums'],
  },
  totalSubLabel: { color: COLORS.textPrimary, fontSize: 14, marginTop: 8, fontWeight: '600' },
  totalCat: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  resultBtns: { gap: 10 },
  sendBtn: {
    backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 18, alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: COLORS.bg, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  resetBtn: {
    backgroundColor: COLORS.bgCard, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  resetBtnText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
});
