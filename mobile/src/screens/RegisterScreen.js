import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera/next';
import { COLORS } from '../context/AppContext';
import { useCloud } from '../context/CloudContext';

const StableScanner = memo(function StableScanner({ onScan }) {
  return (
    <CameraView
      onBarcodeScanned={onScan}
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      style={StyleSheet.absoluteFillObject}
    />
  );
});

function parseJoinToken(data) {
  if (!data) return null;
  try {
    const obj = JSON.parse(data);
    return obj.joinToken || obj.join_token || null;
  } catch {
    return /^[a-f0-9]{16,}$/i.test(data.trim()) ? data.trim() : null;
  }
}

/**
 * RegisterScreen — Opção C: escaneia o QR da equipe e cria a conta
 * (username + telefone + senha) num passo só. Entra como pendente.
 * Props: navigation (volta p/ Login), deviceId.
 */
export default function RegisterScreen({ navigation }) {
  const { registerAndJoin } = useCloud();
  const [permission, requestPermission] = useCameraPermissions();

  const [joinToken, setJoinToken] = useState('');
  const [username, setUsername]   = useState('');
  const [phone, setPhone]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [focus, setFocus]         = useState(null);
  const lockRef = useRef(false);

  useEffect(() => { requestPermission(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScan = useCallback(({ data }) => {
    if (lockRef.current) return;
    const tok = parseJoinToken(data);
    if (!tok) { Alert.alert('QR inválido', 'Este QR não contém um token de pareamento.'); return; }
    lockRef.current = true;
    setJoinToken(tok);
  }, []);

  async function handleSubmit() {
    if (!username.trim() || username.trim().length < 3) return Alert.alert('Usuário', 'Informe um nome de usuário (mín. 3 caracteres).');
    if (!password || password.length < 6) return Alert.alert('Senha', 'A senha precisa ter ao menos 6 caracteres.');
    if (password !== confirm) return Alert.alert('Senha', 'As senhas não conferem.');
    setLoading(true);
    try {
      const res = await registerAndJoin({ joinToken, username: username.trim(), phone: phone.trim(), password });
      if (!res?.success) {
        Alert.alert('Falha no cadastro', res?.message || 'Não foi possível criar a conta.');
      }
      // sucesso → CloudContext muda o stage p/ 'pending' e a navegação troca
    } catch (e) {
      Alert.alert('Falha no cadastro', e?.offline ? 'Sem conexão.' : (e?.message || 'Erro ao cadastrar.'));
    } finally {
      setLoading(false);
    }
  }

  // FASE 1 — escanear o QR.
  if (!joinToken) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>CRIAR CONTA</Text>
          <Text style={s.subtitle}>Primeiro, escaneie o QR da sua equipe (no desktop do chefe).</Text>
        </View>
        <View style={s.scannerWrap}>
          {permission?.granted ? (
            <>
              <StableScanner onScan={handleScan} />
              <View style={s.frame} pointerEvents="none" />
            </>
          ) : (
            <View style={s.noPerm}>
              <Text style={s.noPermText}>Precisamos da câmera para ler o QR.</Text>
              <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
                <Text style={s.permBtnText}>PERMITIR CÂMERA</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <TouchableOpacity style={s.linkBtn} onPress={() => navigation?.goBack?.()}>
          <Text style={s.linkText}>Já tenho conta — entrar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // FASE 2 — formulário de cadastro.
  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>CRIAR CONTA</Text>
        <Text style={s.subtitle}>QR lido ✓ Preencha seus dados.</Text>

        <Text style={s.label}>Nome de usuário</Text>
        <TextInput style={[s.input, focus === 'u' && s.inputFocus]} value={username} onChangeText={setUsername}
          autoCapitalize="none" autoCorrect={false} placeholder="ex: pedro.mecanico" placeholderTextColor={COLORS.textMuted}
          onFocus={() => setFocus('u')} onBlur={() => setFocus(null)} />

        <Text style={s.label}>Telefone (WhatsApp)</Text>
        <TextInput style={[s.input, focus === 'f' && s.inputFocus]} value={phone} onChangeText={setPhone}
          keyboardType="phone-pad" placeholder="(00) 00000-0000" placeholderTextColor={COLORS.textMuted}
          onFocus={() => setFocus('f')} onBlur={() => setFocus(null)} />

        <Text style={s.label}>Senha</Text>
        <TextInput style={[s.input, focus === 'p' && s.inputFocus]} value={password} onChangeText={setPassword}
          secureTextEntry placeholder="mín. 6 caracteres" placeholderTextColor={COLORS.textMuted}
          onFocus={() => setFocus('p')} onBlur={() => setFocus(null)} />

        <Text style={s.label}>Confirmar senha</Text>
        <TextInput style={[s.input, focus === 'c' && s.inputFocus]} value={confirm} onChangeText={setConfirm}
          secureTextEntry placeholder="repita a senha" placeholderTextColor={COLORS.textMuted}
          onFocus={() => setFocus('c')} onBlur={() => setFocus(null)} />

        <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.8}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>CRIAR CONTA E ENTRAR</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.linkBtn} onPress={() => { lockRef.current = false; setJoinToken(''); }}>
          <Text style={s.linkText}>← Escanear outro QR</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, gap: 14 },
  header:    { alignItems: 'center', marginTop: 12 },
  formScroll:{ flexGrow: 1, justifyContent: 'center', paddingVertical: 24, gap: 4 },
  title:     { fontSize: 18, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 2, textAlign: 'center' },
  subtitle:  { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, marginBottom: 8, textAlign: 'center' },

  scannerWrap: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: COLORS.border, position: 'relative' },
  frame: { position: 'absolute', top: '18%', left: '14%', right: '14%', bottom: '18%', borderWidth: 3, borderColor: COLORS.accent, borderRadius: 16 },
  noPerm: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  noPermText: { color: COLORS.textSecondary, textAlign: 'center', fontSize: 14 },
  permBtn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  permBtnText: { color: '#fff', fontWeight: '900', letterSpacing: 1 },

  label: { fontSize: 10, color: COLORS.textMuted, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: COLORS.bgCard, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.textPrimary, fontSize: 15 },
  inputFocus: { borderColor: COLORS.accent },
  btn: { marginTop: 22, backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  linkBtn: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
});
