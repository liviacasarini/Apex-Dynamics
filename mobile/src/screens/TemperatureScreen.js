import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS, ROLE_LABELS } from '../context/AppContext';
import { useCloud } from '../context/CloudContext';

const TRACK_CONDITIONS = ['Seca', 'Úmida', 'Molhada', 'Intermediária'];
const WIND_DIRS = ['—', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const PRECIP_OPTIONS = ['—', 'Nenhuma', 'Garoa', 'Chuva leve', 'Chuva moderada', 'Chuva forte'];

const CONDITION_COLORS = {
  'Seca': COLORS.orange,
  'Úmida': COLORS.blue,
  'Molhada': COLORS.cyan,
  'Intermediária': COLORS.yellow,
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function SectionCard({ title, icon, children }) {
  return (
    <View style={s.sectionCard}>
      <View style={s.sectionCardHeader}>
        <View style={s.sectionCardAccent} />
        <Text style={s.sectionCardTitle}>{icon ? `${icon}  ` : ''}{title}</Text>
      </View>
      <View style={s.sectionCardBody}>
        {children}
      </View>
    </View>
  );
}

export default function TemperatureScreen() {
  const { notifications } = useApp();
  const { cars: assignedProfiles, submitMeasurement, loadCars, getMeasurementStatus } = useCloud();
  // Recarrega os carros ao focar a tela → renomeações do chefe aparecem na hora.
  useFocusEffect(useCallback(() => { loadCars(); }, [loadCars]));
  const [selectedProfileIdx, setSelectedProfileIdx] = useState(0);

  const [date,            setDate]            = useState(todayISO());
  const [time,            setTime]            = useState(nowHHMM());
  const [trackTemp,       setTrackTemp]       = useState('');
  const [ambientTemp,     setAmbientTemp]     = useState('');
  const [humidity,        setHumidity]        = useState('');
  const [altitude,        setAltitude]        = useState('');
  const [baroPressure,    setBaroPressure]    = useState('');
  const [wind,            setWind]            = useState('');
  const [windDir,         setWindDir]         = useState('—');
  const [precipitation,   setPrecipitation]   = useState('—');
  const [trackCondition,  setTrackCondition]  = useState('Seca');
  const [notes,           setNotes]           = useState('');
  const [submittedId,     setSubmittedId]     = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [inputFocus,      setInputFocus]      = useState(null);

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

  function handleSubmit() {
    setLoading(true);
    const selectedProfile = assignedProfiles?.[selectedProfileIdx] || null;
    const id = submitMeasurement('temperaturas', 'Condições Ambientais', {
      date:            date            || todayISO(),
      time:            time            || nowHHMM(),
      tempPista:       parseFloat(trackTemp)    || null,
      tempAmbiente:    parseFloat(ambientTemp)  || null,
      umidade:         parseFloat(humidity)     || null,
      altitude:        parseFloat(altitude)     || null,
      pressaoAtm:      parseFloat(baroPressure) || null,
      vento:           parseFloat(wind)         || null,
      direcaoVento:    windDir !== '—' ? windDir : null,
      precipitacao:    precipitation !== '—' ? precipitation : null,
      condicaoPista:   trackCondition,
      observacoes:     notes.trim()             || null,
    }, selectedProfile?.id);
    setSubmittedId(id);
    setLoading(false);
  }

  function handleReset() {
    setDate(todayISO()); setTime(nowHHMM());
    setTrackTemp(''); setAmbientTemp(''); setHumidity('');
    setAltitude(''); setBaroPressure('');
    setWind(''); setWindDir('—'); setPrecipitation('—');
    setTrackCondition('Seca'); setNotes('');
    setSubmittedId(null);
  }

  const bannerColor =
    statusType === 'measurement:approved'  ? COLORS.green :
    statusType === 'measurement:dismissed' ? COLORS.textMuted : COLORS.yellow;

  const bannerBg =
    statusType === 'measurement:approved'  ? COLORS.green + '18' :
    statusType === 'measurement:dismissed' ? '#88888818' : COLORS.yellow + '18';

  const bannerText =
    statusType === 'measurement:approved'  ? '✅  Medição aprovada!' :
    statusType === 'measurement:dismissed' ? 'ℹ️  Medição dispensada.' :
    '⏳  Aguardando aprovação do engenheiro...';

  const inputStyle = (key) => [
    s.input, inputFocus === key && s.inputFocused,
  ];

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Screen title */}
          <View style={s.pageHeader}>
            <View style={s.pageHeaderAccent} />
            <View style={{ flex: 1 }}>
              <Text style={s.screenTitle}>CONDIÇÕES AMBIENTAIS</Text>
              <Text style={s.screenSub}>Temperatura · Pista · Clima</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
              <View style={{ width: 5, height: 8,  backgroundColor: '#5a5a70', borderRadius: 1 }} />
              <View style={{ width: 5, height: 14, backgroundColor: COLORS.blue,   borderRadius: 1 }} />
              <View style={{ width: 5, height: 20, backgroundColor: COLORS.orange, borderRadius: 1 }} />
            </View>
            <Text style={s.screenIcon}>🌡️</Text>
          </View>

          {/* Seletor de perfil */}
          {assignedProfiles && assignedProfiles.length > 1 ? (
            <View style={s.profileSelector}>
              <View style={s.profileSelectorAccent} />
              <View style={s.profileSelectorInner}>
                <Text style={s.profileSelectorLabel}>🏎️  ENVIAR PARA</Text>
                <View style={s.condRow}>
                  {assignedProfiles.map((p, i) => (
                    <TouchableOpacity key={p.id}
                      style={[s.condBtn, selectedProfileIdx === i && { backgroundColor: COLORS.green, borderColor: COLORS.green }]}
                      onPress={() => setSelectedProfileIdx(i)}
                      activeOpacity={0.75}>
                      <Text style={[s.condBtnText, selectedProfileIdx === i && { color: '#000', fontWeight: '800' }]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          ) : assignedProfiles && assignedProfiles.length === 1 ? (
            <View style={s.profileBanner}>
              <View style={s.profileBannerAccent} />
              <Text style={s.profileBannerIcon}>🏎️</Text>
              <Text style={s.profileBannerText}>
                Perfil: <Text style={{ color: COLORS.green, fontWeight: '900' }}>{assignedProfiles[0].name}</Text>
              </Text>
            </View>
          ) : (
            <View style={s.profileBanner}>
              <View style={[s.profileBannerAccent, { backgroundColor: '#f0a020' }]} />
              <Text style={s.profileBannerIcon}>⚠️</Text>
              <Text style={s.profileBannerText}>
                Nenhum perfil disponível. Peça ao chefe para sincronizar os perfis no desktop (Equipe → Visão Geral). A medição será enviada sem perfil.
              </Text>
            </View>
          )}

          {/* Status banner */}
          {submittedId && (
            <View style={[s.statusBanner, { backgroundColor: bannerBg, borderColor: bannerColor + '50' }]}>
              <Text style={[s.statusBannerText, { color: bannerColor }]}>{bannerText}</Text>
              {(statusType === 'measurement:approved' || statusType === 'measurement:dismissed') && (
                <TouchableOpacity onPress={handleReset} style={s.newMeasBtn} activeOpacity={0.75}>
                  <Text style={s.newMeasBtnText}>+ NOVA MEDIÇÃO</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Card: Data e Hora */}
          <SectionCard title="DATA E HORA" icon="📅">
            <View style={s.row}>
              <View style={s.halfField}>
                <Text style={s.label}>Data</Text>
                <TextInput style={inputStyle('date')} value={date} onChangeText={setDate}
                  placeholder="AAAA-MM-DD" placeholderTextColor={COLORS.textMuted}
                  onFocus={() => setInputFocus('date')} onBlur={() => setInputFocus(null)} />
              </View>
              <View style={s.halfField}>
                <Text style={s.label}>Horário</Text>
                <TextInput style={inputStyle('time')} value={time} onChangeText={setTime}
                  placeholder="HH:MM" placeholderTextColor={COLORS.textMuted}
                  onFocus={() => setInputFocus('time')} onBlur={() => setInputFocus(null)} />
              </View>
            </View>
          </SectionCard>

          {/* Card: Temperaturas */}
          <SectionCard title="TEMPERATURAS" icon="🔥">
            <View style={s.row}>
              <View style={s.halfField}>
                <Text style={s.label}>Pista (°C)</Text>
                <TextInput style={inputStyle('trackTemp')} value={trackTemp} onChangeText={setTrackTemp}
                  keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={COLORS.textMuted}
                  onFocus={() => setInputFocus('trackTemp')} onBlur={() => setInputFocus(null)} />
              </View>
              <View style={s.halfField}>
                <Text style={s.label}>Ambiente (°C)</Text>
                <TextInput style={inputStyle('ambientTemp')} value={ambientTemp} onChangeText={setAmbientTemp}
                  keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={COLORS.textMuted}
                  onFocus={() => setInputFocus('ambientTemp')} onBlur={() => setInputFocus(null)} />
              </View>
            </View>
          </SectionCard>

          {/* Card: Umidade e Altitude */}
          <SectionCard title="UMIDADE E ALTITUDE" icon="💧">
            <View style={s.row}>
              <View style={s.halfField}>
                <Text style={s.label}>Umidade (%)</Text>
                <TextInput style={inputStyle('humidity')} value={humidity} onChangeText={setHumidity}
                  keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.textMuted}
                  onFocus={() => setInputFocus('humidity')} onBlur={() => setInputFocus(null)} />
              </View>
              <View style={s.halfField}>
                <Text style={s.label}>Altitude (m)</Text>
                <TextInput style={inputStyle('altitude')} value={altitude} onChangeText={setAltitude}
                  keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.textMuted}
                  onFocus={() => setInputFocus('altitude')} onBlur={() => setInputFocus(null)} />
              </View>
            </View>
          </SectionCard>

          {/* Card: Pressão e Vento */}
          <SectionCard title="PRESSÃO E VENTO" icon="💨">
            <View style={s.row}>
              <View style={s.halfField}>
                <Text style={s.label}>Pressão Atm. (hPa)</Text>
                <TextInput style={inputStyle('baroPressure')} value={baroPressure} onChangeText={setBaroPressure}
                  keyboardType="decimal-pad" placeholder="1013" placeholderTextColor={COLORS.textMuted}
                  onFocus={() => setInputFocus('baroPressure')} onBlur={() => setInputFocus(null)} />
              </View>
              <View style={s.halfField}>
                <Text style={s.label}>Vento (km/h)</Text>
                <TextInput style={inputStyle('wind')} value={wind} onChangeText={setWind}
                  keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.textMuted}
                  onFocus={() => setInputFocus('wind')} onBlur={() => setInputFocus(null)} />
              </View>
            </View>

            <Text style={[s.label, { marginTop: 14 }]}>🧭 Direção do Vento</Text>
            <View style={s.condRow}>
              {WIND_DIRS.map((d) => (
                <TouchableOpacity key={d}
                  style={[s.condBtn, windDir === d && { backgroundColor: COLORS.blue, borderColor: COLORS.blue }]}
                  onPress={() => setWindDir(d)} activeOpacity={0.75}>
                  <Text style={[s.condBtnText, windDir === d && { color: '#fff', fontWeight: '800' }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SectionCard>

          {/* Card: Condição da Pista */}
          <SectionCard title="CONDIÇÃO DA PISTA" icon="🏁">
            <View style={s.condRow}>
              {TRACK_CONDITIONS.map((c) => {
                const active = trackCondition === c;
                const col = CONDITION_COLORS[c] || COLORS.orange;
                return (
                  <TouchableOpacity key={c}
                    style={[s.condPill, active && { backgroundColor: col + '20', borderColor: col }]}
                    onPress={() => setTrackCondition(c)} activeOpacity={0.75}>
                    <View style={[s.condPillDot, { backgroundColor: active ? col : COLORS.textMuted }]} />
                    <Text style={[s.condBtnText, active && { color: col, fontWeight: '800' }]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>

          {/* Card: Precipitação */}
          <SectionCard title="PRECIPITAÇÃO" icon="🌧️">
            <View style={s.condRow}>
              {PRECIP_OPTIONS.map((p) => (
                <TouchableOpacity key={p}
                  style={[s.condBtn, precipitation === p && { backgroundColor: COLORS.cyan, borderColor: COLORS.cyan }]}
                  onPress={() => setPrecipitation(p)} activeOpacity={0.75}>
                  <Text style={[s.condBtnText, precipitation === p && { color: '#000', fontWeight: '800' }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </SectionCard>

          {/* Card: Observações */}
          <SectionCard title="OBSERVAÇÕES" icon="📝">
            <TextInput
              style={[inputStyle('notes'), s.textArea]} value={notes} onChangeText={setNotes}
              placeholder="Ex: Neblina no setor 2" placeholderTextColor={COLORS.textMuted}
              multiline numberOfLines={3}
              onFocus={() => setInputFocus('notes')} onBlur={() => setInputFocus(null)}
            />
          </SectionCard>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, (loading || !!submittedId) && s.submitBtnDisabled]}
            onPress={handleSubmit} disabled={loading || !!submittedId}
            activeOpacity={0.82}>
            {loading
              ? <ActivityIndicator color="#fff" size="large" />
              : <Text style={s.submitBtnText}>📤  ENVIAR AO DESKTOP</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 64 },

  /* Page header */
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 16,
  },
  pageHeaderAccent: { width: 3, height: 32, backgroundColor: COLORS.accent, borderRadius: 2 },
  screenSub: { fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 1 },
  screenTitle: {
    fontSize: 13, fontWeight: '900', color: COLORS.textPrimary,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  screenIcon: { fontSize: 22 },

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

  /* Status banner */
  statusBanner: {
    borderRadius: 14, padding: 16, marginBottom: 14, alignItems: 'center',
    borderWidth: 1,
  },
  statusBannerText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  newMeasBtn: {
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
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
  sectionCardBody: { padding: 16 },

  /* Form fields */
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  label: {
    color: COLORS.textMuted, fontSize: 10, letterSpacing: 1.2,
    textTransform: 'uppercase', marginTop: 4, marginBottom: 6, fontWeight: '700',
  },
  input: {
    backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    color: COLORS.textPrimary, fontSize: 20, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  inputFocused: { borderColor: COLORS.accent, borderWidth: 1.5 },
  textArea: { fontSize: 15, fontWeight: '400', minHeight: 80, textAlignVertical: 'top' },

  /* Condition buttons */
  condRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  condBtn: {
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  condBtnText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  condPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  condPillDot: { width: 7, height: 7, borderRadius: 4 },

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
