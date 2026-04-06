import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS, ROLE_LABELS } from '../context/AppContext';

const POSITIONS = [
  { key: 'FL', label: 'DE\nDianteiro Esq.' },
  { key: 'FR', label: 'DD\nDianteiro Dir.' },
  { key: 'RL', label: 'TE\nTraseiro Esq.'  },
  { key: 'RR', label: 'TD\nTraseiro Dir.'  },
];

const TYPES = [
  { value: 'fria',  label: 'Fria (Pf)'  },
  { value: 'quente',label: 'Quente (Pq)' },
  { value: 'ambas', label: 'Ambas'       },
];

const EMPTY_PRESSURES = { FL: { fria: '', quente: '' }, FR: { fria: '', quente: '' }, RL: { fria: '', quente: '' }, RR: { fria: '', quente: '' } };

export default function PressuresScreen() {
  const { submitMeasurement, notifications, assignedProfiles } = useApp();
  const [selectedProfileIdx, setSelectedProfileIdx] = useState(0);

  const [measureType, setMeasureType] = useState('ambas');
  const [pressures,   setPressures]   = useState(EMPTY_PRESSURES);
  const [notes,       setNotes]       = useState('');
  const [submittedId, setSubmittedId] = useState(null);
  const [loading,     setLoading]     = useState(false);

  const submitted  = submittedId ? notifications.find((n) => n.measurementId === submittedId) : null;
  const statusType = submitted?.type;

  function updatePressure(pos, type, val) {
    setPressures((prev) => ({ ...prev, [pos]: { ...prev[pos], [type]: val } }));
  }

  function handleSubmit() {
    setLoading(true);
    const data = {};
    POSITIONS.forEach((p) => {
      data[p.key] = {};
      if (measureType === 'fria'   || measureType === 'ambas') data[p.key].fria   = parseFloat(pressures[p.key].fria)   || null;
      if (measureType === 'quente' || measureType === 'ambas') data[p.key].quente = parseFloat(pressures[p.key].quente) || null;
    });
    data.observacoes = notes.trim() || null;
    data.tipo        = measureType;
    const selectedProfile = assignedProfiles?.[selectedProfileIdx] || null;
    const id = submitMeasurement('pressoes', 'Pressões de Pneus', data, selectedProfile?.id);
    setSubmittedId(id);
    setLoading(false);
  }

  function handleReset() {
    setPressures(EMPTY_PRESSURES);
    setNotes('');
    setSubmittedId(null);
  }

  const showFria   = measureType === 'fria'   || measureType === 'ambas';
  const showQuente = measureType === 'quente' || measureType === 'ambas';

  const bannerColor =
    statusType === 'measurement:approved'  ? '#06d6a022' :
    statusType === 'measurement:dismissed' ? '#88888822' : '#ffd16622';

  const bannerText =
    statusType === 'measurement:approved'  ? '✅ Medição aprovada!' :
    statusType === 'measurement:dismissed' ? 'ℹ️ Medição dispensada.' :
    '⏳ Aguardando aprovação...';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.screenTitle}>🔧 Pressões de Pneus</Text>

          {/* Seletor de perfil */}
          {assignedProfiles && assignedProfiles.length > 1 ? (
            <View style={styles.profileSelector}>
              <Text style={styles.profileSelectorLabel}>🏎️ Enviar para:</Text>
              <View style={styles.typeRow}>
                {assignedProfiles.map((p, i) => (
                  <TouchableOpacity key={p.id}
                    style={[styles.typeBtn, selectedProfileIdx === i && { backgroundColor: '#06d6a0', borderColor: '#06d6a0' }]}
                    onPress={() => setSelectedProfileIdx(i)}>
                    <Text style={[styles.typeBtnText, selectedProfileIdx === i && { color: '#000', fontWeight: '800' }]}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : assignedProfiles && assignedProfiles.length === 1 ? (
            <View style={styles.profileBanner}>
              <Text style={styles.profileBannerText}>🏎️ Perfil: <Text style={{ color: '#06d6a0', fontWeight: '800' }}>{assignedProfiles[0].name}</Text></Text>
            </View>
          ) : null}

          {submittedId && (
            <View style={[styles.statusBanner, { backgroundColor: bannerColor }]}>
              <Text style={styles.statusBannerText}>{bannerText}</Text>
              {(statusType === 'measurement:approved' || statusType === 'measurement:dismissed') && (
                <TouchableOpacity onPress={handleReset} style={styles.newMeasBtn}>
                  <Text style={styles.newMeasBtnText}>Nova medição</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={styles.label}>Tipo de medição</Text>
          <View style={styles.typeRow}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[styles.typeBtn, measureType === t.value && styles.typeBtnActive]}
                onPress={() => setMeasureType(t.value)}
              >
                <Text style={[styles.typeBtnText, measureType === t.value && styles.typeBtnTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.tireGrid}>
            {POSITIONS.map((pos) => (
              <View key={pos.key} style={styles.tireCard}>
                <Text style={styles.tirePos}>{pos.key}</Text>
                <Text style={styles.tirePosLabel}>{pos.label}</Text>
                {showFria && (
                  <>
                    <Text style={styles.pressureLabel}>Fria (bar)</Text>
                    <TextInput
                      style={styles.pressureInput}
                      value={pressures[pos.key].fria}
                      onChangeText={(v) => updatePressure(pos.key, 'fria', v)}
                      keyboardType="decimal-pad"
                      placeholder="0.0"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </>
                )}
                {showQuente && (
                  <>
                    <Text style={styles.pressureLabel}>Quente (bar)</Text>
                    <TextInput
                      style={[styles.pressureInput, styles.pressureInputHot]}
                      value={pressures[pos.key].quente}
                      onChangeText={(v) => updatePressure(pos.key, 'quente', v)}
                      keyboardType="decimal-pad"
                      placeholder="0.0"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </>
                )}
              </View>
            ))}
          </View>

          <Text style={styles.label}>Observações (opcional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Ex: Pneu TD com desgaste irregular"
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.submitBtn, (loading || !!submittedId) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading || !!submittedId}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>📤 ENVIAR AO DESKTOP</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  screenTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 14 },
  label: {
    color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5,
    textTransform: 'uppercase', marginTop: 16, marginBottom: 6,
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard, alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  typeBtnText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 13 },
  typeBtnTextActive: { color: '#fff' },
  tireGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  tireCard: {
    width: '47%', backgroundColor: COLORS.bgCard,
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  tirePos: { fontSize: 26, fontWeight: '900', color: COLORS.accent },
  tirePosLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2, marginBottom: 10 },
  pressureLabel: {
    fontSize: 10, color: COLORS.textMuted, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 4,
  },
  pressureInput: {
    backgroundColor: '#111', borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 11,
    color: COLORS.textPrimary, fontSize: 20, fontWeight: '700',
    textAlign: 'center', marginBottom: 6,
  },
  pressureInputHot: { borderColor: COLORS.orange, color: COLORS.orange },
  input: {
    backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.textPrimary, fontSize: 15,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  submitBtn: {
    marginTop: 24, backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 18, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  statusBanner: { borderRadius: 12, padding: 16, marginBottom: 12, alignItems: 'center' },
  statusBannerText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  newMeasBtn: {
    marginTop: 10, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  newMeasBtnText: { color: COLORS.textMuted, fontSize: 13 },
  profileSelector: {
    backgroundColor: '#06d6a008', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#06d6a020', marginBottom: 12,
  },
  profileSelectorLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  profileBanner: {
    backgroundColor: '#06d6a012', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#06d6a025', marginBottom: 12,
  },
  profileBannerText: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center' },
});
