import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS } from '../context/AppContext';

function BrandBars({ height = 28, style }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }, style]}>
      <View style={{ width: 7, height: Math.round(height * 0.38), backgroundColor: '#5a5a70', borderRadius: 2 }} />
      <View style={{ width: 7, height: Math.round(height * 0.65), backgroundColor: COLORS.blue,   borderRadius: 2 }} />
      <View style={{ width: 7, height: height,                    backgroundColor: COLORS.accent, borderRadius: 2 }} />
    </View>
  );
}

function BrandStripes({ style }) {
  return (
    <View style={[{ width: 44, height: 34, overflow: 'hidden' }, style]} pointerEvents="none">
      <View style={{
        position: 'absolute', width: 76, height: 11,
        backgroundColor: COLORS.blue, opacity: 0.85,
        top: 2, left: -8, transform: [{ rotate: '-36deg' }],
      }} />
      <View style={{
        position: 'absolute', width: 76, height: 7,
        backgroundColor: COLORS.accent, opacity: 0.85,
        top: 20, left: -2, transform: [{ rotate: '-36deg' }],
      }} />
    </View>
  );
}

export default function WaitingAssignmentScreen() {
  const { connected, sessionName, deviceName, deviceRole, disconnect } = useApp();

  const handleDisconnect = () => {
    Alert.alert('Desconectar', 'Sair da sessão atual?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => disconnect() },
    ]);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>

        {/* ── Logo com identidade visual ── */}
        <View style={s.brandWrap}>
          <View style={s.brandRow}>
            <BrandBars height={30} style={{ marginRight: 10 }} />
            <View>
              <Text style={s.brandApex}>APEX</Text>
              <Text style={s.brandDyn}>DYNAMICS</Text>
            </View>
            <BrandStripes style={{ marginLeft: 8 }} />
          </View>
          <View style={s.brandLine} />
          <Text style={s.brandSlogan}>DADOS QUE VENCEM CORRIDAS</Text>
          {sessionName ? (
            <View style={s.sessionPill}>
              <Text style={s.sessionText}>{sessionName}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Card principal ── */}
        <View style={s.card}>
          <View style={s.cardAccentBar} />
          <View style={s.cardBody}>
            {/* Ícone técnico em vez de emoji */}
            <View style={s.iconBlock}>
              <BrandBars height={40} />
            </View>

            <Text style={s.cardTitle}>AGUARDANDO ATRIBUIÇÃO</Text>
            <Text style={s.cardSubtitle}>
              O engenheiro precisa atribuir um perfil a este dispositivo no desktop antes de prosseguir.
            </Text>

            <View style={s.divider} />

            {/* Status de conexão */}
            <View style={[s.connStatus, {
              backgroundColor: (connected ? COLORS.green : COLORS.accent) + '12',
              borderColor:     (connected ? COLORS.green : COLORS.accent) + '40',
            }]}>
              <View style={[s.connDot, { backgroundColor: connected ? COLORS.green : COLORS.accent }]} />
              <Text style={[s.connText, { color: connected ? COLORS.green : COLORS.accent }]}>
                {connected ? 'Conectado ao desktop' : 'Sem conexão com o desktop'}
              </Text>
            </View>

            {deviceName ? (
              <View style={s.deviceRow}>
                <Text style={s.deviceLabel}>DISPOSITIVO</Text>
                <Text style={s.deviceValue}>{deviceName}</Text>
              </View>
            ) : null}

            <View style={s.pulseContainer}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={s.pulseText}>AGUARDANDO O DESKTOP...</Text>
            </View>
          </View>
        </View>

        {/* ── Instruções ── */}
        <View style={s.stepsCard}>
          <View style={s.stepsHeader}>
            <View style={s.stepsAccent} />
            <Text style={s.stepsTitle}>PRÓXIMOS PASSOS</Text>
          </View>
          <View style={s.timeline}>
            <View style={s.timelineLine} />
            {[
              { num: '1', text: 'No desktop, acesse a aba ', hl: 'Equipe',        color: COLORS.blue   },
              { num: '2', text: 'Clique em ',                hl: 'Dispositivos',  color: COLORS.blue   },
              { num: '3', text: 'Atribua um perfil via ',    hl: 'Perfil atribuído', color: COLORS.yellow },
            ].map((step) => (
              <View key={step.num} style={s.step}>
                <View style={s.stepNumCircle}>
                  <Text style={s.stepNum}>{step.num}</Text>
                </View>
                <Text style={s.stepText}>
                  {step.text}
                  <Text style={{ color: step.color, fontWeight: '800' }}>{step.hl}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity style={s.disconnectBtn} onPress={handleDisconnect} activeOpacity={0.75}>
          <Text style={s.disconnectText}>DESCONECTAR</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 16 },

  /* Brand */
  brandWrap:   { alignItems: 'center', marginBottom: 4 },
  brandRow:    { flexDirection: 'row', alignItems: 'flex-end' },
  brandApex:   { fontSize: 22, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 4, lineHeight: 24 },
  brandDyn:    { fontSize: 9, color: COLORS.textSecondary, letterSpacing: 5, fontWeight: '500' },
  brandLine:   { width: 40, height: 2, backgroundColor: COLORS.accent, borderRadius: 1, marginTop: 7, marginBottom: 5 },
  brandSlogan: { fontSize: 7.5, color: COLORS.textMuted, letterSpacing: 2, fontWeight: '700', textTransform: 'uppercase' },
  sessionPill: {
    marginTop: 10, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border,
  },
  sessionText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },

  /* Card */
  card: {
    width: '100%', backgroundColor: COLORS.bgCard, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    elevation: 8, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10,
  },
  cardAccentBar: { height: 4, backgroundColor: COLORS.accent },
  cardBody:      { padding: 28, alignItems: 'center' },
  iconBlock:     { marginBottom: 20 },
  cardTitle: {
    fontSize: 15, fontWeight: '900', color: COLORS.textPrimary,
    letterSpacing: 2, textAlign: 'center', marginBottom: 10, textTransform: 'uppercase',
  },
  cardSubtitle: {
    fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8,
  },
  divider: { width: '80%', height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  connStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12,
  },
  connDot:  { width: 8, height: 8, borderRadius: 4 },
  connText: { fontSize: 13, fontWeight: '700' },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  deviceLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  deviceValue: { fontSize: 13, color: COLORS.textPrimary, fontWeight: '700' },
  pulseContainer: { marginTop: 20, alignItems: 'center', gap: 12 },
  pulseText: { fontSize: 9, color: COLORS.accent, letterSpacing: 2, fontWeight: '800', textTransform: 'uppercase' },

  /* Steps */
  stepsCard: {
    width: '100%', backgroundColor: COLORS.bgCard, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6,
  },
  stepsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
  },
  stepsAccent: { width: 3, height: 14, backgroundColor: COLORS.accent, borderRadius: 2 },
  stepsTitle: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 2, textTransform: 'uppercase' },
  timeline:     { padding: 20, gap: 0, position: 'relative' },
  timelineLine: { position: 'absolute', left: 32, top: 36, bottom: 36, width: 2, backgroundColor: COLORS.border },
  step:         { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  stepNumCircle: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    elevation: 2, shadowColor: COLORS.accent, shadowOpacity: 0.4, shadowRadius: 4,
  },
  stepNum:  { fontSize: 12, fontWeight: '900', color: '#fff' },
  stepText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },

  /* Disconnect */
  disconnectBtn: {
    paddingHorizontal: 28, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard,
  },
  disconnectText: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
});
