import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView, Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera/next';
import { COLORS } from '../context/AppContext';
import { useCloud } from '../context/CloudContext';
import { APEX_LEGAL, LEGAL_VERSION } from '../legal/legalText';

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
  const [accepted, setAccepted]   = useState(false);
  const [legalDoc, setLegalDoc]   = useState(null); // null | 'termos' | 'privacidade'
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
    if (!accepted) return Alert.alert('Termos', 'É preciso ler e aceitar os Termos de Uso e a Política de Privacidade para criar a conta.');
    setLoading(true);
    try {
      const res = await registerAndJoin({ joinToken, username: username.trim(), phone: phone.trim(), password, acceptedLegalVersion: LEGAL_VERSION });
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

        {/* Aceite obrigatório dos Termos e Privacidade */}
        <View style={s.consentRow}>
          <TouchableOpacity style={[s.checkbox, accepted && s.checkboxOn]} onPress={() => setAccepted(v => !v)} activeOpacity={0.8}>
            {accepted ? <Text style={s.checkboxMark}>✓</Text> : null}
          </TouchableOpacity>
          <Text style={s.consentText}>
            Li e aceito os{' '}
            <Text style={s.consentLink} onPress={() => setLegalDoc('termos')}>Termos de Uso</Text>
            {' '}e a{' '}
            <Text style={s.consentLink} onPress={() => setLegalDoc('privacidade')}>Política de Privacidade</Text>,
            inclusive o tratamento de dados na nuvem ao usar a Equipe.
          </Text>
        </View>

        <TouchableOpacity style={[s.btn, (loading || !accepted) && { opacity: 0.5 }]} onPress={handleSubmit} disabled={loading || !accepted} activeOpacity={0.8}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>CRIAR CONTA E ENTRAR</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.linkBtn} onPress={() => { lockRef.current = false; setJoinToken(''); }}>
          <Text style={s.linkText}>← Escanear outro QR</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal de leitura dos documentos legais */}
      <Modal visible={!!legalDoc} animationType="slide" onRequestClose={() => setLegalDoc(null)}>
        <View style={s.modalWrap}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>
              {legalDoc === 'termos' ? 'TERMOS DE USO' : 'POLÍTICA DE PRIVACIDADE'}
            </Text>
            <TouchableOpacity onPress={() => setLegalDoc(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} contentContainerStyle={{ paddingBottom: 28 }}>
            <Text style={s.modalText}>
              {legalDoc === 'termos' ? APEX_LEGAL.termos : APEX_LEGAL.privacidade}
            </Text>
          </ScrollView>
          <TouchableOpacity style={s.modalAccept} onPress={() => { setAccepted(true); setLegalDoc(null); }} activeOpacity={0.85}>
            <Text style={s.modalAcceptText}>LI E ACEITO</Text>
          </TouchableOpacity>
        </View>
      </Modal>
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
  btn: { marginTop: 18, backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  linkBtn: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },

  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 20, paddingRight: 4 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  checkboxMark: { color: '#fff', fontSize: 15, fontWeight: '900', lineHeight: 18 },
  consentText: { flex: 1, color: COLORS.textSecondary, fontSize: 12.5, lineHeight: 18 },
  consentLink: { color: COLORS.accent, fontWeight: '800', textDecorationLine: 'underline' },

  modalWrap: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 50, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  modalClose: { color: COLORS.textSecondary, fontSize: 22, fontWeight: '700' },
  modalBody: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  modalText: { color: COLORS.textSecondary, fontSize: 12.5, lineHeight: 19 },
  modalAccept: { backgroundColor: COLORS.accent, paddingVertical: 16, alignItems: 'center', margin: 16, borderRadius: 10 },
  modalAcceptText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
});
