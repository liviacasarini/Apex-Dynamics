import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS, ROLE_LABELS, ROLE_COLORS } from '../context/AppContext';

const TILES = [
  { key: 'temperature', icon: '◉', label: 'Condições',  sub: 'Temperatura e pista', screen: 'Temperature', color: COLORS.orange },
  { key: 'pressures',   icon: '◎', label: 'Pressões',   sub: 'Pneus fria/quente',   screen: 'Pressures',   color: COLORS.blue },
  { key: 'timer',       icon: '◷', label: 'Cronômetro', sub: 'Pit stop e splits',    screen: 'Timer',       color: COLORS.yellow },
  { key: 'chat',        icon: '◈', label: 'Chat',       sub: 'Mensagens da equipe', screen: 'Chat',        color: COLORS.green },
];

function NotifItem({ item }) {
  const isApproved  = item.type === 'measurement:approved';
  const isDismissed = item.type === 'measurement:dismissed';
  const isTimer     = item.type === 'timer:approved';
  const color = isApproved || isTimer ? COLORS.green : isDismissed ? COLORS.textMuted : COLORS.yellow;
  const icon  = isApproved || isTimer ? '✓' : isDismissed ? '–' : '…';
  const label = isTimer ? 'Cronômetro' : (item.label || 'Medição');
  const status = isApproved || isTimer ? 'Aprovado' : isDismissed ? 'Dispensado' : 'Aguardando...';

  return (
    <View style={[s.notifCard, { borderLeftColor: color }]}>
      <View style={[s.notifIcon, { backgroundColor: color + '20' }]}>
        <Text style={[s.notifIconText, { color }]}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.notifLabel}>{label}</Text>
        <Text style={[s.notifStatus, { color }]}>{status}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const { connected, connecting, sessionName, notifications, unreadCount, disconnect, deviceName, deviceRole, assignedProfiles } = useApp();

  function handleDisconnect() {
    Alert.alert('Desconectar', 'Sair da sessão atual?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => disconnect() },
    ]);
  }

  const roleColor = ROLE_COLORS[deviceRole] || COLORS.textMuted;
  const statusColor = connected ? COLORS.green : connecting ? COLORS.yellow : COLORS.accent;
  const statusText = connected ? 'Online' : connecting ? 'Conectando...' : 'Offline';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.brand}>
            APEX<Text style={{ color: COLORS.accent }}>DYNAMICS</Text>
          </Text>
          {sessionName ? <Text style={s.session}>{sessionName}</Text> : null}
        </View>
        <View style={s.headerRight}>
          <View style={[s.statusPill, { backgroundColor: statusColor + '18', borderColor: statusColor + '50' }]}>
            <View style={[s.dot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusTxt, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>
      </View>

      {/* Identity bar */}
      {deviceName ? (
        <View style={s.identityBar}>
          <View style={[s.roleTag, { backgroundColor: roleColor + '18', borderColor: roleColor + '40' }]}>
            <Text style={[s.roleTagText, { color: roleColor }]}>
              {ROLE_LABELS[deviceRole] || deviceRole}
            </Text>
          </View>
          <Text style={s.identityName}>{deviceName}</Text>
          <TouchableOpacity onPress={handleDisconnect} style={s.exitBtn}>
            <Text style={s.exitBtnText}>Sair</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Perfis atribuídos */}
      {assignedProfiles && assignedProfiles.length > 0 ? (
        <View style={s.profileBar}>
          <Text style={s.profileIcon}>🏎️</Text>
          <Text style={s.profileLabel}>{assignedProfiles.length > 1 ? 'Perfis:' : 'Perfil:'}</Text>
          <Text style={s.profileName}>{assignedProfiles.map(p => p.name).join(', ')}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Tiles */}
        <View style={s.grid}>
          {TILES.map((tile) => (
            <TouchableOpacity
              key={tile.key}
              style={s.tile}
              onPress={() => navigation.navigate(tile.screen)}
              activeOpacity={0.7}
            >
              <View style={[s.tileAccent, { backgroundColor: tile.color }]} />
              <Text style={[s.tileIcon, { color: tile.color }]}>{tile.icon}</Text>
              <Text style={s.tileLabel}>{tile.label}</Text>
              <Text style={s.tileSub}>{tile.sub}</Text>
              {tile.key === 'chat' && unreadCount > 0 && (
                <View style={s.tileBadge}>
                  <Text style={s.tileBadgeTxt}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Notifications */}
        {notifications.length > 0 && (
          <View style={s.notifSection}>
            <Text style={s.sectionTitle}>NOTIFICAÇÕES</Text>
            {notifications.slice().reverse().slice(0, 10).map((n, i) => (
              <NotifItem key={`${n.measurementId || n.id}_${i}`} item={n} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  brand: { fontSize: 20, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 4 },
  session: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  identityBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, gap: 10,
    backgroundColor: COLORS.bgCard, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  roleTag: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1,
  },
  roleTagText: { fontSize: 11, fontWeight: '700' },
  identityName: { flex: 1, color: COLORS.textSecondary, fontSize: 13, fontWeight: '500' },
  exitBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  exitBtnText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  profileBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 8, gap: 8,
    backgroundColor: '#06d6a012', borderBottomWidth: 1, borderBottomColor: '#06d6a025',
  },
  profileIcon: { fontSize: 16 },
  profileLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  profileName: { fontSize: 13, color: COLORS.green, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%', backgroundColor: COLORS.bgCard, borderRadius: 16, padding: 18,
    position: 'relative', overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  tileAccent: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  tileIcon: { fontSize: 28, marginBottom: 8, marginTop: 4 },
  tileLabel: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  tileSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 3 },
  tileBadge: {
    position: 'absolute', top: 12, right: 12, backgroundColor: COLORS.accent,
    borderRadius: 10, minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  tileBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  notifSection: { marginTop: 24 },
  sectionTitle: {
    color: COLORS.textMuted, fontSize: 11, letterSpacing: 2,
    marginBottom: 10, fontWeight: '700',
  },
  notifCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgCard,
    borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 3, gap: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  notifIcon: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  notifIconText: { fontSize: 16, fontWeight: '800' },
  notifLabel: { color: COLORS.textPrimary, fontWeight: '600', fontSize: 13 },
  notifStatus: { fontSize: 11, marginTop: 2, fontWeight: '600' },
});
