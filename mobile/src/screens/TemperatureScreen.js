import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS, ROLE_LABELS } from '../context/AppContext';

const TRACK_CONDITIONS = ['Seca', 'Úmida', 'Molhada', 'Intermediária'];
const WIND_DIRS = ['—', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const PRECIP_OPTIONS = ['—', 'Nenhuma', 'Garoa', 'Chuva leve', 'Chuva moderada', 'Chuva forte'];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function TemperatureScreen() {
  const { submitMeasurement, notifications, assignedProfiles } = useApp();
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

  const submitted  = submittedId ? notifications.find((n) => n.measurementId === submittedId) : null;
  const statusType = submitted?.type;

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
    statusType === 'measurement:approved'  ? '#06d6a022' :
    statusType === 'measurement:dismissed' ? '#88888822' : '#ffd16622';

  const bannerText =
    statusType === 'measurement:approved'  ? '✅ Medição aprovada!' :
    statusType === 'measurement:dismissed' ? 'ℹ️ Medição dispensada.' :
    '⏳ Aguardando aprovação do engenheiro...';

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.screenTitle}>🌡️ Condições Ambientais</Text>

          {/* Seletor de perfil */}
          {assignedProfiles && assignedProfiles.length > 1 ? (
            <View style={s.profileSelector}>
              <Text style={s.profileSelectorLabel}>🏎️ Enviar para:</Text>
              <View style={s.condRow}>
                {assignedProfiles.map((p, i) => (
                  <TouchableOpacity key={p.id}
                    style={[s.condBtn, selectedProfileIdx === i && { backgroundColor: COLORS.green, borderColor: COLORS.green }]}
                    onPress={() => setSelectedProfileIdx(i)}>
                    <Text style={[s.condBtnText, selectedProfileIdx === i && { color: '#000', fontWeight: '800' }]}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : assignedProfiles && assignedProfiles.length === 1 ? (
            <View style={s.profileBanner}>
              <Text style={s.profileBannerText}>🏎️ Perfil: <Text style={{ color: COLORS.green, fontWeight: '800' }}>{assignedProfiles[0].name}</Text></Text>
            </View>
          ) : null}

          {submittedId && (
            <View style={[s.statusBanner, { backgroundColor: bannerColor }]}>
              <Text style={s.statusBannerText}>{bannerText}</Text>
              {(statusType === 'measurement:approved' || statusType === 'measurement:dismissed') && (
                <TouchableOpacity onPress={handleReset} style={s.newMeasBtn}>
                  <Text style={s.newMeasBtnText}>Nova medição</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Data e Hora ─── */}
          <View style={s.row}>
            <View style={s.halfField}>
              <Text style={s.label}>📅 Data</Text>
              <TextInput style={s.input} value={date} onChangeText={setDate}
                placeholder="AAAA-MM-DD" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={s.halfField}>
              <Text style={s.label}>🕐 Horário</Text>
              <TextInput style={s.input} value={time} onChangeText={setTime}
                placeholder="HH:MM" placeholderTextColor={COLORS.textMuted} />
            </View>
          </View>

          {/* ── Temperaturas ─── */}
          <View style={s.row}>
            <View style={s.halfField}>
              <Text style={s.label}>🔥 Temp. Pista (°C)</Text>
              <TextInput style={s.input} value={trackTemp} onChangeText={setTrackTemp}
                keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={s.halfField}>
              <Text style={s.label}>🌤️ Temp. Ambiente (°C)</Text>
              <TextInput style={s.input} value={ambientTemp} onChangeText={setAmbientTemp}
                keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={COLORS.textMuted} />
            </View>
          </View>

          {/* ── Umidade & Altitude ─── */}
          <View style={s.row}>
            <View style={s.halfField}>
              <Text style={s.label}>💧 Umidade (%)</Text>
              <TextInput style={s.input} value={humidity} onChangeText={setHumidity}
                keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={s.halfField}>
              <Text style={s.label}>⛰️ Altitude (m)</Text>
              <TextInput style={s.input} value={altitude} onChangeText={setAltitude}
                keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} />
            </View>
          </View>

          {/* ── Pressão Atm & Vento ─── */}
          <View style={s.row}>
            <View style={s.halfField}>
              <Text style={s.label}>📊 Pressão Atm. (hPa)</Text>
              <TextInput style={s.input} value={baroPressure} onChangeText={setBaroPressure}
                keyboardType="decimal-pad" placeholder="1013" placeholderTextColor={COLORS.textMuted} />
            </View>
            <View style={s.halfField}>
              <Text style={s.label}>💨 Vento (km/h)</Text>
              <TextInput style={s.input} value={wind} onChangeText={setWind}
                keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} />
            </View>
          </View>

          {/* ── Direção do Vento ─── */}
          <Text style={s.label}>🧭 Direção do Vento</Text>
          <View style={s.condRow}>
            {WIND_DIRS.map((d) => (
              <TouchableOpacity key={d}
                style={[s.condBtn, windDir === d && { backgroundColor: COLORS.blue, borderColor: COLORS.blue }]}
                onPress={() => setWindDir(d)}>
                <Text style={[s.condBtnText, windDir === d && { color: '#fff' }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Condição da Pista ─── */}
          <Text style={s.label}>🏁 Condição da Pista</Text>
          <View style={s.condRow}>
            {TRACK_CONDITIONS.map((c) => (
              <TouchableOpacity key={c}
                style={[s.condBtn, trackCondition === c && s.condBtnActive]}
                onPress={() => setTrackCondition(c)}>
                <Text style={[s.condBtnText, trackCondition === c && s.condBtnTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Precipitação ─── */}
          <Text style={s.label}>🌧️ Precipitação</Text>
          <View style={s.condRow}>
            {PRECIP_OPTIONS.map((p) => (
              <TouchableOpacity key={p}
                style={[s.condBtn, precipitation === p && { backgroundColor: COLORS.cyan, borderColor: COLORS.cyan }]}
                onPress={() => setPrecipitation(p)}>
                <Text style={[s.condBtnText, precipitation === p && { color: '#000' }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Observações ─── */}
          <Text style={s.label}>📝 Observações (opcional)</Text>
          <TextInput
            style={[s.input, s.textArea]} value={notes} onChangeText={setNotes}
            placeholder="Ex: Neblina no setor 2" placeholderTextColor={COLORS.textMuted}
            multiline numberOfLines={3}
          />

          <TouchableOpacity
            style={[s.submitBtn, (loading || !!submittedId) && s.submitBtnDisabled]}
            onPress={handleSubmit} disabled={loading || !!submittedId}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitBtnText}>📤 ENVIAR AO DESKTOP</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 60 },
  screenTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 16 },
  profileBanner: {
    backgroundColor: '#06d6a012', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#06d6a025', marginBottom: 12,
  },
  profileBannerText: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center' },
  profileSelector: {
    backgroundColor: '#06d6a008', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#06d6a020', marginBottom: 12,
  },
  profileSelectorLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  label: {
    color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.2,
    textTransform: 'uppercase', marginTop: 14, marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.textPrimary, fontSize: 18, fontWeight: '600',
  },
  textArea: { fontSize: 15, fontWeight: '400', height: 80, textAlignVertical: 'top' },
  condRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  condBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard,
  },
  condBtnActive: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  condBtnText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  condBtnTextActive: { color: '#fff' },
  submitBtn: {
    marginTop: 28, backgroundColor: COLORS.accent,
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
});
