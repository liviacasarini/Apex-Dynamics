import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera/next';
import { useApp, COLORS } from '../context/AppContext';

const ROLES = [
  { value: 'mecanico',    label: 'Mecânico'     },
  { value: 'auxiliar',   label: 'Auxiliar'      },
  { value: 'engenheiro', label: 'Engenheiro'    },
  { value: 'piloto',     label: 'Piloto'        },
];

function BrandBars({ height = 26, style }) {
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

/**
 * Scanner isolado — React.memo garante que NUNCA re-renderiza
 * enquanto `onScan` (ref estável) não mudar.
 */
const StableScanner = memo(function StableScanner({ onScan }) {
  return (
    <CameraView
      onBarcodeScanned={onScan}
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      style={StyleSheet.absoluteFillObject}
    />
  );
});

export default function PairingScreen() {
  const { connect, saveProfile, deviceName: savedName, deviceRole: savedRole } = useApp();

  const [mode, setMode]                 = useState('qr');
  const [permission, requestPermission] = useCameraPermissions();
  const [serverUrl, setServerUrl]       = useState('');
  const [name, setName]                 = useState(savedName || '');
  const [role, setRole]                 = useState(savedRole || 'mecanico');
  const [loading, setLoading]           = useState(false);
  const [statusMsg, setStatusMsg]       = useState('');
  const [sessionName, setSessionName]   = useState('');
  const [pairingToken, setPairingToken] = useState('');
  const [inputFocus, setInputFocus]     = useState(null);

  // Ref para bloquear scans repetidos SEM causar re-render
  const lockedRef = useRef(false);

  useEffect(() => {
    requestPermission();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Callback 100% estável — deps vazias, usa refs/setters
  const handleScan = useCallback(({ data }) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    try {
      const parsed = JSON.parse(data);
      if (parsed.wsUrl) {
        setServerUrl(parsed.wsUrl);
        if (parsed.sessionName)  setSessionName(parsed.sessionName);
        if (parsed.pairingToken) setPairingToken(parsed.pairingToken);
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
      await connect(finalUrl, name.trim(), role, sessionName || undefined, pairingToken || undefined);
      setStatusMsg('Conectado!');
    } catch (e) {
      setStatusMsg('');
      Alert.alert('Falha na conexão', e.message || 'Não foi possível conectar.');
    } finally {
      setLoading(false);
    }
  }

  const cameraGranted = permission?.granted === true;
  const cameraLoading = permission === null;
  const cameraDenied  = permission !== null && !permission.granted;

  /* ── Modo QR ── */
  if (mode === 'qr') {
    return (
      <View style={styles.container}>
        {/* Header QR premium com identidade visual */}
        <View style={styles.qrHeader}>
          <View style={styles.qrBrandRow}>
            <BrandBars height={28} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.logo}>
                APEX<Text style={styles.logoAccent}>DYNAMICS</Text>
              </Text>
              <Text style={styles.slogan}>DADOS QUE VENCEM CORRIDAS</Text>
            </View>
            <BrandStripes />
          </View>
          <View style={styles.logoStripe} />
          <Text style={styles.subtitle}>PAREAMENTO COM DESKTOP</Text>

          {/* Toggle QR/Manual */}
          <View style={styles.modeToggle}>
            <TouchableOpacity style={[styles.modeBtn, styles.modeBtnActive]} activeOpacity={1}>
              <Text style={[styles.modeBtnText, styles.modeBtnTextActive]}>📷  QR CODE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modeBtn} onPress={() => setMode('manual')} activeOpacity={0.75}>
              <Text style={styles.modeBtnText}>✏️  MANUAL</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Câmera */}
        <View style={styles.cameraFull}>
          {cameraLoading && (
            <View style={styles.cameraPlaceholder}>
              <ActivityIndicator color={COLORS.accent} size="large" />
              <Text style={styles.cameraMsg}>Solicitando permissão da câmera...</Text>
            </View>
          )}
          {cameraDenied && (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraDeniedIcon}>🔒</Text>
              <Text style={styles.cameraMsg}>Permissão de câmera negada.</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMode('manual')} activeOpacity={0.75}>
                <Text style={styles.secondaryBtnText}>Usar modo manual</Text>
              </TouchableOpacity>
            </View>
          )}
          {cameraGranted && (
            <>
              <StableScanner onScan={handleScan} />
              {/* Overlay com cantos L-shaped em vez de frame completo */}
              <View style={styles.scanOverlay} pointerEvents="none">
                <View style={styles.scanCornerTL} />
                <View style={styles.scanCornerTR} />
                <View style={styles.scanCornerBL} />
                <View style={styles.scanCornerBR} />
                {/* Linha de scan decorativa */}
                <View style={styles.scanLine} />
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
        {/* Brand */}
        <View style={styles.manualBrandWrap}>
          <View style={styles.qrBrandRow}>
            <BrandBars height={28} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.logo}>
                APEX<Text style={styles.logoAccent}>DYNAMICS</Text>
              </Text>
              <Text style={styles.slogan}>DADOS QUE VENCEM CORRIDAS</Text>
            </View>
            <BrandStripes />
          </View>
          <View style={styles.logoStripe} />
          <Text style={styles.subtitle}>PAREAMENTO COM DESKTOP</Text>
        </View>

        {/* Toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={styles.modeBtn}
            onPress={() => { setMode('qr'); lockedRef.current = false; }}
            activeOpacity={0.75}
          >
            <Text style={styles.modeBtnText}>📷  QR CODE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, styles.modeBtnActive]} activeOpacity={1}>
            <Text style={[styles.modeBtnText, styles.modeBtnTextActive]}>✏️  MANUAL</Text>
          </TouchableOpacity>
        </View>

        {/* Card servidor */}
        <View style={styles.formCard}>
          <View style={styles.formCardHeader}>
            <View style={styles.formCardAccent} />
            <Text style={styles.formCardTitle}>SERVIDOR</Text>
          </View>
          <Text style={styles.label}>Endereço IP</Text>
          <TextInput
            style={[styles.input, inputFocus === 'url' && styles.inputFocused]}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="192.168.1.10 ou ws://192.168.1.10:8765"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onFocus={() => setInputFocus('url')}
            onBlur={() => setInputFocus(null)}
          />
          <Text style={styles.inputHint}>Veja o IP na aba Equipe do desktop</Text>
        </View>

        {/* Card identidade */}
        <View style={styles.formCard}>
          <View style={styles.formCardHeader}>
            <View style={styles.formCardAccent} />
            <Text style={styles.formCardTitle}>IDENTIFICAÇÃO</Text>
          </View>
          <Text style={styles.label}>Seu nome</Text>
          <TextInput
            style={[styles.input, inputFocus === 'name' && styles.inputFocused]}
            value={name}
            onChangeText={setName}
            placeholder="Ex: João Silva"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="words"
            onFocus={() => setInputFocus('name')}
            onBlur={() => setInputFocus(null)}
          />

          <Text style={styles.label}>Função</Text>
          <View style={styles.roleGrid}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.roleBtn, role === r.value && styles.roleBtnActive]}
                onPress={() => setRole(r.value)}
                activeOpacity={0.75}
              >
                <Text style={[styles.roleBtnText, role === r.value && styles.roleBtnTextActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Status */}
        {statusMsg ? (
          <View style={[styles.statusBanner,
            statusMsg.includes('Conectado') || statusMsg.includes('QR lido')
              ? styles.statusBannerOk : styles.statusBannerNeutral
          ]}>
            <Text style={[styles.statusText,
              statusMsg.includes('Conectado') || statusMsg.includes('QR lido')
                ? styles.statusOk : styles.statusNeutral
            ]}>
              {statusMsg}
            </Text>
          </View>
        ) : null}

        {/* Botão CONECTAR */}
        <TouchableOpacity
          style={[styles.connectBtn, loading && styles.connectBtnDisabled]}
          onPress={handleConnect}
          disabled={loading}
          activeOpacity={0.82}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="large" />
            : <Text style={styles.connectBtnText}>CONECTAR</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const CORNER_SIZE = 28;
const CORNER_THICKNESS = 4;
const FRAME_SIZE = 240;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 56 },

  /* Brand */
  manualBrandWrap: { alignItems: 'stretch', marginBottom: 24 },
  qrBrandRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  logo: { fontSize: 26, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 4 },
  logoAccent: { color: COLORS.accent },
  slogan: { fontSize: 7.5, color: COLORS.textMuted, letterSpacing: 2, fontWeight: '700', textTransform: 'uppercase' },
  logoStripe: {
    height: 2, backgroundColor: COLORS.accent, borderRadius: 1,
    marginTop: 8, marginBottom: 8,
  },
  subtitle: {
    fontSize: 10, color: COLORS.textMuted,
    letterSpacing: 3.5, textTransform: 'uppercase', fontWeight: '800', textAlign: 'center',
  },

  /* QR Header */
  qrHeader: {
    paddingTop: 52, paddingBottom: 16, paddingHorizontal: 24,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },

  /* Toggle */
  modeToggle: {
    flexDirection: 'row', borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, marginTop: 20,
    width: '100%',
  },
  modeBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    backgroundColor: COLORS.bgCard,
  },
  modeBtnActive: { backgroundColor: COLORS.accent },
  modeBtnText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  modeBtnTextActive: { color: '#fff', letterSpacing: 0.5 },

  /* Camera */
  cameraFull: { flex: 1, backgroundColor: '#000' },
  cameraPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  cameraDeniedIcon: { fontSize: 48 },
  cameraMsg: { color: COLORS.textSecondary, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  secondaryBtn: { marginTop: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.blue + '60' },
  secondaryBtnText: { color: COLORS.blue, fontSize: 15, fontWeight: '700' },

  /* Scan overlay com cantos L-shaped */
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
  },
  scanCornerTL: {
    position: 'absolute',
    top: '50%', left: '50%',
    marginTop: -(FRAME_SIZE / 2),
    marginLeft: -(FRAME_SIZE / 2),
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS,
    borderColor: COLORS.accent, borderTopLeftRadius: 4,
  },
  scanCornerTR: {
    position: 'absolute',
    top: '50%', right: '50%',
    marginTop: -(FRAME_SIZE / 2),
    marginRight: -(FRAME_SIZE / 2),
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS,
    borderColor: COLORS.accent, borderTopRightRadius: 4,
  },
  scanCornerBL: {
    position: 'absolute',
    bottom: '50%', left: '50%',
    marginBottom: -(FRAME_SIZE / 2),
    marginLeft: -(FRAME_SIZE / 2),
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS,
    borderColor: COLORS.accent, borderBottomLeftRadius: 4,
  },
  scanCornerBR: {
    position: 'absolute',
    bottom: '50%', right: '50%',
    marginBottom: -(FRAME_SIZE / 2),
    marginRight: -(FRAME_SIZE / 2),
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS,
    borderColor: COLORS.accent, borderBottomRightRadius: 4,
  },
  scanLine: {
    position: 'absolute',
    width: FRAME_SIZE - CORNER_SIZE * 2,
    height: 2,
    backgroundColor: COLORS.accent + '60',
  },
  scanHintWrap: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  scanHint: {
    color: '#fff', fontSize: 14, textAlign: 'center', fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.accent + '40',
  },

  /* Form cards */
  formCard: {
    backgroundColor: COLORS.bgCard, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, marginTop: 16,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22, shadowRadius: 6,
  },
  formCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
  },
  formCardAccent: {
    width: 3, height: 16, backgroundColor: COLORS.accent, borderRadius: 2,
  },
  formCardTitle: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  label: {
    color: COLORS.textMuted, fontSize: 10, letterSpacing: 1.5,
    textTransform: 'uppercase', marginTop: 14, marginBottom: 6,
    paddingHorizontal: 16, fontWeight: '700',
  },
  input: {
    backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.textPrimary, fontSize: 15,
  },
  inputFocused: { borderColor: COLORS.accent, borderWidth: 1.5 },
  inputHint: { color: COLORS.textMuted, fontSize: 11, marginTop: 5, marginBottom: 16, paddingHorizontal: 18 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 16, marginTop: 4 },
  roleBtn: {
    flex: 1, minWidth: '45%', paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg, alignItems: 'center',
  },
  roleBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  roleBtnText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 14 },
  roleBtnTextActive: { color: '#fff', fontWeight: '900' },

  /* Status */
  statusBanner: {
    borderRadius: 12, padding: 14, marginTop: 16,
    borderWidth: 1, alignItems: 'center',
  },
  statusBannerOk: { backgroundColor: COLORS.green + '12', borderColor: COLORS.green + '40' },
  statusBannerNeutral: { backgroundColor: COLORS.bgCard, borderColor: COLORS.border },
  statusText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  statusOk: { color: COLORS.green },
  statusNeutral: { color: COLORS.textMuted },

  /* Connect btn */
  connectBtn: {
    marginTop: 24, backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 20, alignItems: 'center',
    elevation: 6, shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10,
  },
  connectBtnDisabled: { opacity: 0.6 },
  connectBtnText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 3 },
});
