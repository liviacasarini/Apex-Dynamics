import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { COLORS } from '../context/AppContext';
import { useCloud } from '../context/CloudContext';

/** Barras da identidade visual. */
function BrandBars({ height = 40 }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
      <View style={{ width: 9, height: Math.round(height * 0.38), backgroundColor: '#5a5a70', borderRadius: 2 }} />
      <View style={{ width: 9, height: Math.round(height * 0.65), backgroundColor: COLORS.blue,   borderRadius: 2 }} />
      <View style={{ width: 9, height,                            backgroundColor: COLORS.accent, borderRadius: 2 }} />
    </View>
  );
}

/**
 * WaitingApprovalScreen — estágio 'pending' do modelo cloud.
 * O CloudContext já faz polling de getMe a cada 15s; ao ser aprovado,
 * a navegação troca sozinha para MainTabs.
 */
export default function WaitingApprovalScreen() {
  const { membership, refresh, logout } = useCloud();

  return (
    <View style={s.container}>
      <View style={s.iconBlock}><BrandBars height={44} /></View>

      <Text style={s.title}>AGUARDANDO APROVAÇÃO</Text>
      <Text style={s.subtitle}>
        Você entrou na equipe{membership?.team_name ? ` ${membership.team_name}` : ''}. Um chefe precisa aprovar
        seu dispositivo no desktop antes de você acessar.
      </Text>

      <View style={s.pulse}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={s.pulseText}>VERIFICANDO STATUS…</Text>
      </View>

      <TouchableOpacity style={s.refreshBtn} onPress={refresh} activeOpacity={0.8}>
        <Text style={s.refreshText}>VERIFICAR AGORA</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.logout} onPress={logout}>
        <Text style={s.logoutText}>SAIR DA CONTA</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  iconBlock: { marginBottom: 8 },
  title:     { fontSize: 18, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 2, textAlign: 'center' },
  subtitle:  { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  pulse:     { alignItems: 'center', gap: 12, marginTop: 16 },
  pulseText: { fontSize: 9, color: COLORS.accent, letterSpacing: 2, fontWeight: '800' },
  refreshBtn:{ marginTop: 18, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 28, paddingVertical: 13 },
  refreshText:{ color: COLORS.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  logout:    { paddingVertical: 8 },
  logoutText:{ color: COLORS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
});
