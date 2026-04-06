import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS } from '../context/AppContext';

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
        {/* Brand */}
        <Text style={s.brand}>
          APEX<Text style={{ color: COLORS.accent }}>DYNAMICS</Text>
        </Text>
        {sessionName ? <Text style={s.session}>{sessionName}</Text> : null}

        {/* Card status */}
        <View style={s.card}>
          <View style={s.iconCircle}>
            <Text style={s.icon}>🏎️</Text>
          </View>

          <Text style={s.title}>Aguardando Atribuição</Text>
          <Text style={s.subtitle}>
            O engenheiro precisa atribuir um perfil (carro) a este dispositivo antes que você possa começar.
          </Text>

          <View style={s.divider} />

          <View style={s.infoRow}>
            <View style={[s.statusDot, { backgroundColor: connected ? COLORS.green : COLORS.accent }]} />
            <Text style={[s.infoText, { color: connected ? COLORS.green : COLORS.accent }]}>
              {connected ? 'Conectado ao desktop' : 'Sem conexão'}
            </Text>
          </View>

          {deviceName ? (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Dispositivo:</Text>
              <Text style={s.infoValue}>{deviceName}</Text>
            </View>
          ) : null}

          <View style={s.pulseContainer}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={s.pulseText}>Aguardando o desktop...</Text>
          </View>
        </View>

        {/* Steps */}
        <View style={s.stepsCard}>
          <Text style={s.stepsTitle}>O que fazer?</Text>
          <View style={s.step}>
            <Text style={s.stepNum}>1</Text>
            <Text style={s.stepText}>
              No desktop, acesse a aba <Text style={{ color: COLORS.blue, fontWeight: '700' }}>Equipe</Text>
            </Text>
          </View>
          <View style={s.step}>
            <Text style={s.stepNum}>2</Text>
            <Text style={s.stepText}>
              Clique em <Text style={{ color: COLORS.blue, fontWeight: '700' }}>Dispositivos</Text>
            </Text>
          </View>
          <View style={s.step}>
            <Text style={s.stepNum}>3</Text>
            <Text style={s.stepText}>
              Selecione o perfil para este celular no dropdown <Text style={{ color: COLORS.yellow, fontWeight: '700' }}>Perfil atribuído</Text>
            </Text>
          </View>
        </View>

        <TouchableOpacity style={s.disconnectBtn} onPress={handleDisconnect}>
          <Text style={s.disconnectText}>Desconectar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  brand: {
    fontSize: 22, fontWeight: '900', color: COLORS.textPrimary,
    letterSpacing: 5, marginBottom: 4, textAlign: 'center',
  },
  session: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 24, textAlign: 'center' },
  card: {
    width: '100%', backgroundColor: COLORS.bgCard, borderRadius: 20, padding: 28,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.accentDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 2, borderColor: COLORS.accent + '40',
  },
  icon: { fontSize: 32 },
  title: {
    fontSize: 20, fontWeight: '800', color: COLORS.textPrimary,
    textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: COLORS.textSecondary, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: 8,
  },
  divider: {
    width: '80%', height: 1, backgroundColor: COLORS.border,
    marginVertical: 18,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  infoText: { fontSize: 13, fontWeight: '600' },
  infoLabel: { fontSize: 12, color: COLORS.textMuted },
  infoValue: { fontSize: 12, color: COLORS.textPrimary, fontWeight: '600' },
  pulseContainer: { marginTop: 20, alignItems: 'center', gap: 10 },
  pulseText: {
    fontSize: 12, color: COLORS.textMuted, letterSpacing: 1, fontWeight: '600',
  },
  stepsCard: {
    width: '100%', backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
  },
  stepsTitle: {
    fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 14,
  },
  step: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10,
  },
  stepNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent,
    textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '800',
    color: '#fff', overflow: 'hidden',
  },
  stepText: {
    flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 20,
  },
  disconnectBtn: {
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  disconnectText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
});
