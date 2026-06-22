import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS, ROLE_LABELS } from '../context/AppContext';
import { useCloud } from '../context/CloudContext';

const POSITIONS = [
  { key: 'FL', label: 'DE', sub: 'Dianteiro Esq.' },
  { key: 'FR', label: 'DD', sub: 'Dianteiro Dir.' },
  { key: 'RL', label: 'TE', sub: 'Traseiro Esq.'  },
  { key: 'RR', label: 'TD', sub: 'Traseiro Dir.'  },
];

const TYPES = [
  { value: 'fria',   label: 'FRIA',  sub: 'Pf'  },
  { value: 'quente', label: 'QUENTE', sub: 'Pq' },
  { value: 'ambas',  label: 'AMBAS',  sub: ''   },
];

const EMPTY_PRESSURES = { FL: { fria: '', quente: '' }, FR: { fria: '', quente: '' }, RL: { fria: '', quente: '' }, RR: { fria: '', quente: '' } };

export default function PressuresScreen() {
  const { notifications } = useApp();
  const { cars: assignedProfiles, submitMeasurement, loadCars, getMeasurementStatus } = useCloud();
  // Recarrega os carros sempre que a tela ganha foco → renomeações feitas
  // no desktop chefe aparecem na hora.
  useFocusEffect(useCallback(() => { loadCars(); }, [loadCars]));
  const [selectedProfileIdx, setSelectedProfileIdx] = useState(0);

  const [measureType, setMeasureType] = useState('ambas');
  const [pressures,   setPressures]   = useState(EMPTY_PRESSURES);
  const [notes,       setNotes]       = useState('');
  const [submittedId, setSubmittedId] = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [inputFocus,  setInputFocus]  = useState(null);

  // Status via polling na nuvem (o modelo nuvem não tem o push em tempo real da LAN).
  const [cloudStatus, setCloudStatus] = useState(null); // 'measurement:approved' | 'measurement:dismissed' | null
  useEffect(() => {
    setCloudStatus(null);
    if (!submittedId || submittedId === 'queued' || !getMeasurementStatus) return;
    let cancelled = false;
    let iv = null;
    const tick = async () => {
      try {
        const r = await getMeasurementStatus(submittedId);
        if (cancelled || !r?.success) return;
        if (r.status === 'approved')  { setCloudStatus('measurement:approved');  if (iv) clearInterval(iv); }
        if (r.status === 'dismissed') { setCloudStatus('measurement:dismissed'); if (iv) clearInterval(iv); }
      } catch { /* offline — tenta no próximo tick */ }
    };
    tick();
    iv = setInterval(tick, 6000);
    return () => { cancelled = true; if (iv) clearInterval(iv); };
  }, [submittedId, getMeasurementStatus]);

  const submitted  = submittedId ? notifications.find((n) => n.measurementId === submittedId) : null;
  const statusType = cloudStatus || submitted?.type;

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
    statusType === 'measurement:approved'  ? COLORS.green :
    statusType === 'measurement:dismissed' ? COLORS.textMuted : COLORS.yellow;

  const bannerBg =
    statusType === 'measurement:approved'  ? COLORS.green + '18' :
    statusType === 'measurement:dismissed' ? '#88888818' : COLORS.yellow + '18';

  const bannerText =
    statusType === 'measurement:approved'  ? '✅  Medição aprovada!' :
    statusType === 'measurement:dismissed' ? 'ℹ️  Medição dispensada.' :
    '⏳  Aguardando aprovação...';

  return (
    <SafeAreaView style={st.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">

          {/* Page header */}
          <View style={st.pageHeader}>
            <View style={st.pageHeaderAccent} />
            <View style={{ flex: 1 }}>
              <Text style={st.screenTitle}>PRESSÕES DE PNEUS</Text>
              <Text style={st.screenSub}>Fria · Quente · 4 pneus</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
              <View style={{ width: 5, height: 8,  backgroundColor: '#5a5a70', borderRadius: 1 }} />
              <View style={{ width: 5, height: 14, backgroundColor: COLORS.blue,   borderRadius: 1 }} />
              <View style={{ width: 5, height: 20, backgroundColor: COLORS.blue,   borderRadius: 1, opacity: 0.7 }} />
            </View>
            <Text style={st.screenIcon}>🔧</Text>
          </View>

          {/* Seletor de perfil */}
          {assignedProfiles && assignedProfiles.length > 1 ? (
            <View style={st.profileSelector}>
              <View style={st.profileSelectorAccent} />
              <View style={st.profileSelectorInner}>
                <Text style={st.profileSelectorLabel}>🏎️  ENVIAR PARA</Text>
                <View style={st.typeRow}>
                  {assignedProfiles.map((p, i) => (
                    <TouchableOpacity key={p.id}
                      style={[st.typeBtn, selectedProfileIdx === i && { backgroundColor: COLORS.green, borderColor: COLORS.green }]}
                      onPress={() => setSelectedProfileIdx(i)} activeOpacity={0.75}>
                      <Text style={[st.typeBtnText, selectedProfileIdx === i && { color: '#000', fontWeight: '900' }]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          ) : assignedProfiles && assignedProfiles.length === 1 ? (
            <View style={st.profileBanner}>
              <View style={st.profileBannerAccent} />
              <Text style={st.profileBannerIcon}>🏎️</Text>
              <Text style={st.profileBannerText}>
                Perfil: <Text style={{ color: COLORS.green, fontWeight: '900' }}>{assignedProfiles[0].name}</Text>
              </Text>
            </View>
          ) : (
            <View style={st.profileBanner}>
              <View style={[st.profileBannerAccent, { backgroundColor: '#f0a020' }]} />
              <Text style={st.profileBannerIcon}>⚠️</Text>
              <Text style={st.profileBannerText}>
                Nenhum perfil disponível. Peça ao chefe para sincronizar os perfis no desktop (Equipe → Visão Geral). A medição será enviada sem perfil.
              </Text>
            </View>
          )}

          {/* Status banner */}
          {submittedId && (
            <View style={[st.statusBanner, { backgroundColor: bannerBg, borderColor: bannerColor + '50' }]}>
              <Text style={[st.statusBannerText, { color: bannerColor }]}>{bannerText}</Text>
              {(statusType === 'measurement:approved' || statusType === 'measurement:dismissed') && (
                <TouchableOpacity onPress={handleReset} style={st.newMeasBtn} activeOpacity={0.75}>
                  <Text style={st.newMeasBtnText}>+ NOVA MEDIÇÃO</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Toggle tipo com visual premium */}
          <View style={st.sectionCard}>
            <View style={st.sectionCardHeader}>
              <View style={st.sectionCardAccent} />
              <Text style={st.sectionCardTitle}>TIPO DE MEDIÇÃO</Text>
            </View>
            <View style={[st.typeRow, { padding: 16 }]}>
              {TYPES.map((t) => {
                const active = measureType === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    style={[st.typeBtn, active && st.typeBtnActive]}
                    onPress={() => setMeasureType(t.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[st.typeBtnLabel, active && st.typeBtnLabelActive]}>{t.label}</Text>
                    {t.sub ? <Text style={[st.typeBtnSub, active && { color: '#ffffffcc' }]}>{t.sub}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Grid de pneus */}
          <View style={st.sectionCard}>
            <View style={st.sectionCardHeader}>
              <View style={st.sectionCardAccent} />
              <Text style={st.sectionCardTitle}>🛞  PRESSÕES POR PNEU</Text>
            </View>
            <View style={st.tireGrid}>
              {POSITIONS.map((pos) => (
                <View key={pos.key} style={st.tireCard}>
                  {/* Accent top bar azul */}
                  <View style={st.tireCardAccent} />
                  <View style={st.tireCardBody}>
                    <View style={st.tirePosHeader}>
                      <Text style={st.tirePos}>{pos.label}</Text>
                      <Text style={st.tirePosName}>{pos.sub}</Text>
                    </View>

                    {showFria && (
                      <View style={st.pressureGroup}>
                        <Text style={st.pressureLabel}>FRIA (bar)</Text>
                        <TextInput
                          style={[st.pressureInput, inputFocus === `${pos.key}_fria` && st.pressureInputFocus]}
                          value={pressures[pos.key].fria}
                          onChangeText={(v) => updatePressure(pos.key, 'fria', v)}
                          keyboardType="decimal-pad"
                          placeholder="0.0"
                          placeholderTextColor={COLORS.textMuted}
                          onFocus={() => setInputFocus(`${pos.key}_fria`)}
                          onBlur={() => setInputFocus(null)}
                        />
                      </View>
                    )}
                    {showQuente && (
                      <View style={st.pressureGroup}>
                        <Text style={[st.pressureLabel, { color: COLORS.orange }]}>QUENTE (bar)</Text>
                        <TextInput
                          style={[st.pressureInput, st.pressureInputHot, inputFocus === `${pos.key}_quente` && st.pressureInputHotFocus]}
                          value={pressures[pos.key].quente}
                          onChangeText={(v) => updatePressure(pos.key, 'quente', v)}
                          keyboardType="decimal-pad"
                          placeholder="0.0"
                          placeholderTextColor={COLORS.textMuted}
                          onFocus={() => setInputFocus(`${pos.key}_quente`)}
                          onBlur={() => setInputFocus(null)}
                        />
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Observações */}
          <View style={st.sectionCard}>
            <View style={st.sectionCardHeader}>
              <View style={st.sectionCardAccent} />
              <Text style={st.sectionCardTitle}>📝  OBSERVAÇÕES</Text>
            </View>
            <View style={{ padding: 16 }}>
              <TextInput
                style={[st.input, st.textArea, inputFocus === 'notes' && st.inputFocused]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Ex: Pneu TD com desgaste irregular"
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
                onFocus={() => setInputFocus('notes')}
                onBlur={() => setInputFocus(null)}
              />
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[st.submitBtn, (loading || !!submittedId) && st.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading || !!submittedId}
            activeOpacity={0.82}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="large" />
              : <Text style={st.submitBtnText}>📤  ENVIAR AO DESKTOP</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  pageHeaderAccent: { width: 3, height: 32, backgroundColor: COLORS.accent, borderRadius: 2 },
  screenTitle: {
    fontSize: 13, fontWeight: '900', color: COLORS.textPrimary,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  screenSub: { fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 1 },

  /* Profile */
  profileSelector: {
    flexDirection: 'row', backgroundColor: COLORS.green + '10',
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.green + '28', marginBottom: 14,
  },
  profileSelectorAccent: { width: 3, backgroundColor: COLORS.green },
  profileSelectorInner: { flex: 1, padding: 14 },
  profileSelectorLabel: {
    fontSize: 9, color: COLORS.green, fontWeight: '800',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10,
  },
  profileBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.green + '10', borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.green + '28',
    overflow: 'hidden', marginBottom: 14,
  },
  profileBannerAccent: { width: 3, alignSelf: 'stretch', backgroundColor: COLORS.green },
  profileBannerIcon: { fontSize: 18, paddingLeft: 10 },
  profileBannerText: { flex: 1, color: COLORS.textSecondary, fontSize: 13, paddingVertical: 12, paddingRight: 14 },

  /* Status */
  statusBanner: {
    borderRadius: 14, padding: 16, marginBottom: 14, alignItems: 'center', borderWidth: 1,
  },
  statusBannerText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  newMeasBtn: {
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard,
  },
  newMeasBtnText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  /* Section card */
  sectionCard: {
    backgroundColor: COLORS.bgCard, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 12,
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
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    letterSpacing: 2, textTransform: 'uppercase',
  },

  /* Type toggle */
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.bg, alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  typeBtnLabel: { color: COLORS.textMuted, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  typeBtnLabelActive: { color: '#fff' },
  typeBtnSub: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },
  typeBtnText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13 },

  /* Tire grid */
  tireGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14 },
  tireCard: {
    width: '47%', backgroundColor: COLORS.bg,
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
    elevation: 3, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
  },
  tireCardAccent: { height: 3, backgroundColor: COLORS.blue },
  tireCardBody: { padding: 14 },
  tirePosHeader: { marginBottom: 12 },
  tirePos: {
    fontSize: 30, fontWeight: '900', color: COLORS.accent,
    fontVariant: ['tabular-nums'], lineHeight: 34,
  },
  tirePosName: { fontSize: 10, color: COLORS.textMuted, marginTop: 2, letterSpacing: 0.3 },
  pressureGroup: { marginBottom: 8 },
  pressureLabel: {
    fontSize: 9, color: COLORS.textMuted, letterSpacing: 1.2,
    textTransform: 'uppercase', marginBottom: 5, fontWeight: '800',
  },
  pressureInput: {
    backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 12,
    color: COLORS.textPrimary, fontSize: 22, fontWeight: '800',
    textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  pressureInputFocus: { borderColor: COLORS.blue, borderWidth: 1.5 },
  pressureInputHot: { borderColor: COLORS.orange + '80', color: COLORS.orange },
  pressureInputHotFocus: { borderColor: COLORS.orange, borderWidth: 1.5 },

  /* Inputs genéricos */
  input: {
    backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.textPrimary, fontSize: 15,
  },
  inputFocused: { borderColor: COLORS.accent, borderWidth: 1.5 },
  textArea: { height: 80, textAlignVertical: 'top' },

  /* Submit */
  submitBtn: {
    marginTop: 8, backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 20, alignItems: 'center',
    elevation: 6, shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
});
