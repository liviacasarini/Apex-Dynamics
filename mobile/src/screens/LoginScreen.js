import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { COLORS } from '../context/AppContext';
import * as cloud from '../api/cloud';

/** Barras da identidade visual (gradiente cinza/azul/vermelho). */
function BrandBars({ height = 30, style }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }, style]}>
      <View style={{ width: 7, height: Math.round(height * 0.38), backgroundColor: '#5a5a70', borderRadius: 2 }} />
      <View style={{ width: 7, height: Math.round(height * 0.65), backgroundColor: COLORS.blue,   borderRadius: 2 }} />
      <View style={{ width: 7, height,                            backgroundColor: COLORS.accent, borderRadius: 2 }} />
    </View>
  );
}

/**
 * LoginScreen — login com APEX ID (modelo 100% nuvem, Etapa 5).
 * Props:
 *   deviceId  — UUID estável do dispositivo (do AppContext).
 *   onSuccess — callback(loginData) após autenticar.
 */
export default function LoginScreen({ deviceId, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [focus, setFocus]       = useState(null);

  async function handleLogin() {
    if (!username.trim() || !password) {
      Alert.alert('Campos obrigatórios', 'Informe seu APEX ID e a senha.');
      return;
    }
    setLoading(true);
    try {
      const data = await cloud.login(username.trim(), password, deviceId);
      if (data?.success && data?.token) {
        onSuccess?.(data);
      } else {
        Alert.alert('Falha no login', data?.message || 'Credenciais inválidas.');
      }
    } catch (e) {
      Alert.alert(
        'Falha no login',
        e?.offline ? 'Sem conexão com a internet.' : (e?.message || 'Não foi possível entrar.')
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Marca */}
        <View style={s.brandWrap}>
          <View style={s.brandRow}>
            <BrandBars height={34} style={{ marginRight: 12 }} />
            <View>
              <Text style={s.brandApex}>APEX</Text>
              <Text style={s.brandDyn}>DYNAMICS</Text>
            </View>
          </View>
          <View style={s.brandLine} />
          <Text style={s.slogan}>DADOS QUE VENCEM CORRIDAS</Text>
        </View>

        <View style={s.card}>
          <Text style={s.title}>ENTRAR</Text>
          <Text style={s.subtitle}>Use seu APEX ID para acessar a equipe.</Text>

          <Text style={s.label}>APEX ID / Usuário</Text>
          <TextInput
            style={[s.input, focus === 'u' && s.inputFocus]}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="seu usuário"
            placeholderTextColor={COLORS.textMuted}
            onFocus={() => setFocus('u')}
            onBlur={() => setFocus(null)}
          />

          <Text style={s.label}>Senha</Text>
          <TextInput
            style={[s.input, focus === 'p' && s.inputFocus]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={COLORS.textMuted}
            onFocus={() => setFocus('p')}
            onBlur={() => setFocus(null)}
          />

          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>ENTRAR</Text>}
          </TouchableOpacity>
        </View>

        <Text style={s.footer}>
          Não tem APEX ID? Peça ao responsável pela sua conta ApexDynamics.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll:    { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 22 },

  brandWrap: { alignItems: 'center' },
  brandRow:  { flexDirection: 'row', alignItems: 'flex-end' },
  brandApex: { fontSize: 26, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 4, lineHeight: 28 },
  brandDyn:  { fontSize: 10, color: COLORS.textSecondary, letterSpacing: 6, fontWeight: '500' },
  brandLine: { width: 44, height: 2, backgroundColor: COLORS.accent, borderRadius: 1, marginTop: 8, marginBottom: 6 },
  slogan:    { fontSize: 8, color: COLORS.textMuted, letterSpacing: 2.5, fontWeight: '700' },

  card: {
    backgroundColor: COLORS.bgCard, borderRadius: 18, padding: 24,
    borderWidth: 1, borderColor: COLORS.border,
  },
  title:    { fontSize: 16, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 2, marginBottom: 4 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 18, lineHeight: 18 },
  label:    { fontSize: 10, color: COLORS.textMuted, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: COLORS.bg, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, color: COLORS.textPrimary, fontSize: 15,
  },
  inputFocus: { borderColor: COLORS.accent },
  btn: {
    marginTop: 22, backgroundColor: COLORS.accent, borderRadius: 10,
    paddingVertical: 15, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 2 },

  footer: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', lineHeight: 16 },
});
