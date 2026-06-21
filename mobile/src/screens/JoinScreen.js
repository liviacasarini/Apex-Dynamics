import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput,
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

/** Extrai o join_token de um QR — aceita JSON {joinToken} ou string crua. */
function parseJoinToken(data) {
  if (!data) return null;
  try {
    const obj = JSON.parse(data);
    return obj.joinToken || obj.join_token || null;
  } catch {
    return /^[a-f0-9]{16,}$/i.test(data.trim()) ? data.trim() : null;
  }
}

export default function JoinScreen() {
  const { join, logout } = useCloud();
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [manual, setManual]   = useState('');
  const lockRef = useRef(false);

  useEffect(() => { requestPermission(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doJoin = useCallback(async (joinToken) => {
    if (!joinToken) { Alert.alert('QR inválido', 'Este QR não contém um token de pareamento.'); return; }
    setLoading(true);
    try {
      const res = await join(joinToken);
      if (!res?.success) {
        Alert.alert('Falha ao entrar', res?.message || 'Não foi possível entrar na equipe.');
        lockRef.current = false;
      }
      // sucesso → o CloudContext muda o stage (pending/active) e a navegação troca
    } catch (e) {
      Alert.alert('Falha ao entrar', e?.offline ? 'Sem conexão.' : (e?.message || 'Erro ao entrar.'));
      lockRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [join]);

  const handleScan = useCallback(({ data }) => {
    if (lockRef.current) return;
    lockRef.current = true;
    doJoin(parseJoinToken(data));
  }, [doJoin]);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>ENTRAR NA EQUIPE</Text>
        <Text style={s.subtitle}>Escaneie o QR exibido no desktop do chefe.</Text>
      </View>

      <View style={s.scannerWrap}>
        {permission?.granted ? (
          <>
            <StableScanner onScan={handleScan} />
            <View style={s.frame} pointerEvents="none" />
            {loading && (
              <View style={s.loadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={s.loadingText}>Entrando…</Text>
              </View>
            )}
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

      <View style={s.manualBox}>
        <Text style={s.manualLabel}>Ou digite o token manualmente</Text>
        <View style={s.manualRow}>
          <TextInput
            style={s.manualInput}
            value={manual}
            onChangeText={setManual}
            autoCapitalize="none"
            placeholder="token de pareamento"
            placeholderTextColor={COLORS.textMuted}
          />
          <TouchableOpacity
            style={[s.manualBtn, (!manual.trim() || loading) && { opacity: 0.5 }]}
            onPress={() => doJoin(manual.trim())}
            disabled={!manual.trim() || loading}
          >
            <Text style={s.manualBtnText}>Entrar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={s.logout} onPress={logout}>
        <Text style={s.logoutText}>SAIR DA CONTA</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, gap: 16 },
  header:    { alignItems: 'center', marginTop: 12 },
  title:     { fontSize: 18, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 2 },
  subtitle:  { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, textAlign: 'center' },

  scannerWrap: {
    flex: 1, borderRadius: 18, overflow: 'hidden',
    backgroundColor: '#000', borderWidth: 1, borderColor: COLORS.border, position: 'relative',
  },
  frame: {
    position: 'absolute', top: '18%', left: '14%', right: '14%', bottom: '18%',
    borderWidth: 3, borderColor: COLORS.accent, borderRadius: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,15,0.7)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: COLORS.textPrimary, fontWeight: '700', letterSpacing: 1 },

  noPerm:     { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  noPermText: { color: COLORS.textSecondary, textAlign: 'center', fontSize: 14 },
  permBtn:    { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  permBtnText:{ color: '#fff', fontWeight: '900', letterSpacing: 1 },

  manualBox:   { backgroundColor: COLORS.bgCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  manualLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  manualRow:   { flexDirection: 'row', gap: 8 },
  manualInput: {
    flex: 1, backgroundColor: COLORS.bg, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 10, color: COLORS.textPrimary, fontSize: 14,
  },
  manualBtn:    { backgroundColor: COLORS.blue, borderRadius: 8, paddingHorizontal: 18, justifyContent: 'center' },
  manualBtnText:{ color: '#fff', fontWeight: '800' },

  logout:     { alignItems: 'center', paddingVertical: 10 },
  logoutText: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
});
