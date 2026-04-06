import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { useApp, COLORS } from '../context/AppContext';

const ROLES = [
  { value: 'mecanico',    label: 'Mecânico'     },
  { value: 'auxiliar',   label: 'Auxiliar'      },
  { value: 'engenheiro', label: 'Engenheiro'    },
  { value: 'piloto',     label: 'Piloto'        },
];

/**
 * Scanner isolado — React.memo garante que NUNCA re-renderiza
 * enquanto `onScan` (ref estável) não mudar.
 */
const StableScanner = memo(function StableScanner({ onScan }) {
  return (
    <BarCodeScanner
      onBarCodeScanned={onScan}
      barCodeTypes={[BarCodeScanner.Constants.BarCodeType.qr]}
      style={StyleSheet.absoluteFillObject}
    />
  );
});

export default function PairingScreen() {
  const { connect, saveProfile, deviceName: savedName, deviceRole: savedRole } = useApp();

  const [mode, setMode]                       = useState('qr');
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [serverUrl, setServerUrl]             = useState('');
  const [name, setName]                       = useState(savedName || '');
  const [role, setRole]                       = useState(savedRole || 'mecanico');
  const [loading, setLoading]                 = useState(false);
  const [statusMsg, setStatusMsg]             = useState('');
  const [sessionName, setSessionName]         = useState('');

  // Ref para bloquear scans repetidos SEM causar re-render
  const lockedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await BarCodeScanner.requestPermissionsAsync();
        setHasCameraPermission(status === 'granted');
      } catch (e) {
        console.warn('Erro ao solicitar permissão de câmera:', e);
        setHasCameraPermission(false);
      }
    })();
  }, []);

  // Callback 100% estável — deps vazias, usa refs/setters
  const handleScan = useCallback(({ data }) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    try {
      const parsed = JSON.parse(data);
      if (parsed.wsUrl) {
        setServerUrl(parsed.wsUrl);
        if (parsed.sessionName) setSessionName(parsed.sessionName);
        setMode('manual');
        setStatusMsg('QR lido! Preencha seu nome e conecte.');
      } else {
        Alert.alert('QR inválido', 'Este QR não contém dados de pareamento ApexDynamics.');
        lockedRef.current = false;
      }
    } catch {
      Alert.alert('QR inválido', 'Não foi possível interpretar o QR code.');
      lockedRef.current = false;
    }
  }, []);

  async function handleConnect() {
    if (!name.trim()) {
      Alert.alert('Nome obrigatório', 'Por favor, informe seu nome.');
      return;
    }
    const url = serverUrl.trim();
    if (!url) {
      Alert.alert('Endereço obrigatório', 'Informe o endereço do servidor.');
      return;
    }
    const finalUrl = url.startsWith('ws') ? url : `ws://${url}:8765`;
    setLoading(true);
    setStatusMsg('Conectando...');
    try {
      await saveProfile(name.trim(), role);
      await connect(finalUrl, name.trim(), role, sessionName || undefined);
      setStatusMsg('Conectado!');
    } catch (e) {
      setStatusMsg('');
      Alert.alert('Falha na conexão', e.message || 'Não foi possível conectar.');
    } finally {
      setLoading(false);
    }
  }

  /* ── Modo QR: layout fixo, câmera ocupa a tela, sem ScrollView ── */
  if (mode === 'qr') {
    return (
      <View style={styles.container}>
        <View style={styles.qrHeader}>
          <Text style={styles.logo}>APEX<Text style={styles.logoAccent}>DYNAMICS</Text></Text>
          <Text style={styles.subtitle}>Pareamento com Desktop</Text>
          <View style={styles.modeToggle}>
            <TouchableOpacity style={[styles.modeBtn, styles.modeBtnActive]} activeOpacity={1}>
              <Text style={[styles.modeBtnText, styles.modeBtnTextActive]}>Escanear QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modeBtn} onPress={() => setMode('manual')}>
              <Text style={styles.modeBtnText}>Manual</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.cameraFull}>
          {hasCameraPermission === null && (
            <View style={styles.cameraPlaceholder}>
              <ActivityIndicator color={COLORS.accent} size="large" />
              <Text style={styles.cameraMsg}>Solicitando permissão da câmera...</Text>
            </View>
          )}
          {hasCameraPermission === false && (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraMsg}>Permissão de câmera negada.</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMode('manual')}>
                <Text style={styles.secondaryBtnText}>Usar modo manual</Text>
              </TouchableOpacity>
            </View>
          )}
          {hasCameraPermission === true && (
            <>
              <StableScanner onScan={handleScan} />
              <View style={styles.scanOverlay} pointerEvents="none">
                <View style={styles.scanFrame} />
              </View>
              <View style={styles.scanHintWrap} pointerEvents="none">
                <Text style={styles.scanHint}>Aponte para o QR code exibido no desktop</Text>
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  /* ── Modo manual ── */
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>APEX<Text style={styles.logoAccent}>DYNAMICS</Text></Text>
        <Text style={styles.subtitle}>Pareamento com Desktop</Text>

        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={styles.modeBtn}
            onPress={() => { setMode('qr'); lockedRef.current = false; }}
          >
            <Text style={styles.modeBtnText}>Escanear QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, styles.modeBtnActive]} activeOpacity={1}>
            <Text style={[styles.modeBtnText, styles.modeBtnTextActive]}>Manual</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Endereço do servidor</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="192.168.1.10 ou ws://192.168.1.10:8765"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.inputHint}>Dica: veja o IP na aba Equipe do desktop</Text>

          <Text style={styles.label}>Seu nome</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ex: João Silva"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Função</Text>
          <View style={styles.roleGrid}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.roleBtn, role === r.value && styles.roleBtnActive]}
                onPress={() => setRole(r.value)}
              >
                <Text style={[styles.roleBtnText, role === r.value && styles.roleBtnTextActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {statusMsg ? (
            <Text style={[styles.statusText,
              statusMsg.includes('Conectado') || statusMsg.includes('QR lido')
                ? styles.statusOk : styles.statusNeutral
            ]}>
              {statusMsg}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.connectBtn, loading && styles.connectBtnDisabled]}
            onPress={handleConnect}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.connectBtnText}>CONECTAR</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 64 },
  logo: { fontSize: 30, fontWeight: '900', color: COLORS.textPrimary, textAlign: 'center', letterSpacing: 4 },
  logoAccent: { color: COLORS.accent },
  subtitle: {
    fontSize: 12, color: COLORS.textMuted, textAlign: 'center',
    marginTop: 4, marginBottom: 16, letterSpacing: 2, textTransform: 'uppercase',
  },
  qrHeader: { paddingTop: 52, paddingBottom: 12, paddingHorizontal: 24 },
  modeToggle: {
    flexDirection: 'row', borderRadius: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border,
  },
  modeBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', backgroundColor: COLORS.bgCard },
  modeBtnActive: { backgroundColor: COLORS.accent },
  modeBtnText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 14 },
  modeBtnTextActive: { color: '#fff' },
  cameraFull: { flex: 1, backgroundColor: '#000' },
  cameraPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  cameraMsg: { color: COLORS.textMuted, textAlign: 'center', marginTop: 12, fontSize: 15 },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
  },
  scanFrame: { width: 220, height: 220, borderWidth: 3, borderColor: COLORS.accent, borderRadius: 16 },
  scanHintWrap: {
    position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center',
  },
  scanHint: {
    color: '#fff', fontSize: 14, textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10,
  },
  form: {},
  label: {
    color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5,
    textTransform: 'uppercase', marginTop: 16, marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.textPrimary, fontSize: 15,
  },
  inputHint: { color: COLORS.textMuted, fontSize: 11, marginTop: 4, marginLeft: 2 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  roleBtn: {
    flex: 1, minWidth: '45%', paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard, alignItems: 'center',
  },
  roleBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  roleBtnText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 14 },
  roleBtnTextActive: { color: '#fff' },
  statusText: { marginTop: 12, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  statusOk: { color: COLORS.green },
  statusNeutral: { color: COLORS.textMuted },
  connectBtn: {
    marginTop: 24, backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 18, alignItems: 'center',
  },
  connectBtnDisabled: { opacity: 0.6 },
  connectBtnText: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 2 },
  secondaryBtn: { marginTop: 16, padding: 14 },
  secondaryBtnText: { color: COLORS.blue, fontSize: 15, fontWeight: '600' },
});
