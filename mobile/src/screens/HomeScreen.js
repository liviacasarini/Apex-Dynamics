import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS, ROLE_LABELS, ROLE_COLORS } from '../context/AppContext';

// ── Elementos visuais da marca ─────────────────────────────────────────
function BrandBars({ height = 34, style }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }, style]}>
      <View style={{ width: 9, height: Math.round(height * 0.38), backgroundColor: '#5a5a70', borderRadius: 2 }} />
      <View style={{ width: 9, height: Math.round(height * 0.65), backgroundColor: COLORS.blue,   borderRadius: 2 }} />
      <View style={{ width: 9, height: height,                    backgroundColor: COLORS.accent, borderRadius: 2 }} />
    </View>
  );
}

function BrandStripes({ style }) {
  return (
    <View style={[{ width: 52, height: 40, overflow: 'hidden' }, style]} pointerEvents="none">
      <View style={{
        position: 'absolute', width: 90, height: 13,
        backgroundColor: COLORS.blue, opacity: 0.9,
        top: 3, left: -10, transform: [{ rotate: '-36deg' }],
      }} />
      <View style={{
        position: 'absolute', width: 90, height: 9,
        backgroundColor: COLORS.accent, opacity: 0.9,
        top: 24, left: -2, transform: [{ rotate: '-36deg' }],
      }} />
    </View>
  );
}

// ── Tiles de navegação ────────────────────────────────────────────────
const TILES = [
  {
    key: 'temperature', label: 'CONDIÇÕES', screen: 'Temperature', color: COLORS.orange,
    dataLabel: 'Temperatura · Pista · Chuva',
    abbr: 'TC',
  },
  {
    key: 'pressures',   label: 'PRESSÕES',   screen: 'Pressures',   color: COLORS.blue,
    dataLabel: 'Pneus Fria · Quente',
    abbr: 'PR',
  },
  {
    key: 'timer',       label: 'PIT STOP',   screen: 'Timer',       color: COLORS.yellow,
    dataLabel: 'Cronômetro · Splits',
    abbr: 'TM',
  },
  {
    key: 'chat',        label: 'RÁDIO',      screen: 'Chat',        color: COLORS.green,
    dataLabel: 'Mensagens da equipe',
    abbr: 'CH',
  },
];

function NotifItem({ item }) {
  const isApproved  = item.type === 'measurement:approved';
  const isDismissed = item.type === 'measurement:dismissed';
  const isTimer     = item.type === 'timer:approved';
  const color = isApproved || isTimer ? COLORS.green : isDismissed ? COLORS.textMuted : COLORS.yellow;
  const icon  = isApproved || isTimer ? '✓' : isDismissed ? '—' : '·';
  const label = isTimer ? 'Cronômetro' : (item.label || 'Medição');
  const status = isApproved || isTimer ? 'APROVADO' : isDismissed ? 'DISPENSADO' : 'AGUARDANDO';

  return (
    <View style={[s.notifCard, { borderLeftColor: color }]}>
      <View style={[s.notifBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
        <Text style={[s.notifBadgeText, { color }]}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.notifLabel}>{label}</Text>
        <Text style={[s.notifStatus, { color }]}>{status}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const {
    connected, connecting, sessionName, notifications,
    unreadCount, disconnect, deviceName, deviceRole, assignedProfiles,
  } = useApp();

  function handleDisconnect() {
    Alert.alert('Desconectar', 'Sair da sessão atual?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => disconnect() },
    ]);
  }

  const roleColor   = ROLE_COLORS[deviceRole] || COLORS.textMuted;
  const statusColor = connected ? COLORS.green : connecting ? COLORS.yellow : COLORS.accent;
  const statusText  = connected ? 'Online' : connecting ? 'Conectando...' : 'Offline';

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* ── Header premium com identidade visual ── */}
      <View style={s.header}>
        {/* Decoração de listras no canto superior direito */}
        <View style={s.headerStripeArea} pointerEvents="none">
          <BrandStripes />
        </View>

        <View style={s.headerContent}>
          {/* Logo: barras + tipografia */}
          <View style={s.logoRow}>
            <BrandBars height={34} style={{ marginRight: 12 }} />
            <View style={s.logoText}>
              <Text style={s.logoApex}>APEX</Text>
              <Text style={s.logoDynamics}>DYNAMICS</Text>
            </View>
          </View>

          {/* Slogan */}
          <Text style={s.slogan}>DADOS QUE VENCEM CORRIDAS</Text>

          {/* Linha vermelha sob o logo */}
          <View style={s.logoLine} />
        </View>

        {/* Status pill */}
        <View style={[s.statusPill, { backgroundColor: statusColor + '18', borderColor: statusColor + '50' }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusText, { color: statusColor }]}>{statusText}</Text>
        </View>
      </View>

      {/* ── Identity bar ── */}
      {deviceName ? (
        <View style={s.identityBar}>
          <View style={[s.roleTag, { backgroundColor: roleColor + '18', borderColor: roleColor + '40' }]}>
            <Text style={[s.roleTagText, { color: roleColor }]}>
              {ROLE_LABELS[deviceRole] || deviceRole}
            </Text>
          </View>
          <Text style={s.identityName}>{deviceName}</Text>
          {sessionName ? <Text style={s.sessionLabel}>{sessionName}</Text> : null}
          <TouchableOpacity onPress={handleDisconnect} style={s.exitBtn} activeOpacity={0.7}>
            <Text style={s.exitBtnText}>SAIR</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Perfil atribuído ── */}
      {assignedProfiles && assignedProfiles.length > 0 ? (
        <View style={s.profileBar}>
          <View style={s.profileBarAccent} />
          <View style={{ flex: 1 }}>
            <Text style={s.profileBarSub}>
              {assignedProfiles.length > 1 ? 'PERFIS ATRIBUÍDOS' : 'PERFIL ATRIBUÍDO'}
            </Text>
            <Text style={s.profileBarName}>{assignedProfiles.map(p => p.name).join('  ·  ')}</Text>
          </View>
          {/* Mini bar chart decorativo */}
          <BrandBars height={22} style={{ marginRight: 4 }} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Grid de módulos ── */}
        <View style={s.grid}>
          {TILES.map((tile) => (
            <TouchableOpacity
              key={tile.key}
              style={[s.tile, { borderTopColor: tile.color }]}
              onPress={() => navigation.navigate(tile.screen)}
              activeOpacity={0.78}
            >
              {/* Barra de cor no topo */}
              <View style={[s.tileTopBar, { backgroundColor: tile.color }]} />

              {/* Badge de não-lidas */}
              {tile.key === 'chat' && unreadCount > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}

              <View style={s.tileBody}>
                {/* Abreviação técnica como ícone */}
                <View style={[s.tileAbbrWrap, { backgroundColor: tile.color + '18', borderColor: tile.color + '40' }]}>
                  <Text style={[s.tileAbbr, { color: tile.color }]}>{tile.abbr}</Text>
                </View>
                <Text style={s.tileLabel}>{tile.label}</Text>
                <Text style={s.tileSub}>{tile.dataLabel}</Text>
              </View>

              <View style={[s.tileFooter, { borderTopColor: tile.color + '28' }]}>
                <View style={[s.tileDot, { backgroundColor: tile.color }]} />
                <Text style={[s.tileFooterText, { color: tile.color }]}>ACESSAR MÓDULO</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Notificações ── */}
        {notifications.length > 0 && (
          <View style={s.notifSection}>
            <View style={s.sectionHdr}>
              <View style={s.sectionHdrAccent} />
              <Text style={s.sectionHdrTitle}>RETORNO DO DESKTOP</Text>
            </View>
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

  /* ── Header ── */
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    overflow: 'hidden',
    position: 'relative',
  },
  headerStripeArea: {
    position: 'absolute', right: 90, top: 8,
    zIndex: 0,
  },
  headerContent: { flex: 1, zIndex: 1 },
  logoRow: { flexDirection: 'row', alignItems: 'flex-end' },
  logoText: { gap: 0 },
  logoApex: {
    fontSize: 24, fontWeight: '900', color: COLORS.textPrimary,
    letterSpacing: 4, lineHeight: 26,
  },
  logoDynamics: {
    fontSize: 10, color: COLORS.textSecondary, letterSpacing: 5,
    fontWeight: '500', marginTop: 1,
  },
  slogan: {
    fontSize: 8, color: COLORS.textMuted, letterSpacing: 2,
    fontWeight: '700', marginTop: 5, textTransform: 'uppercase',
  },
  logoLine: {
    width: 44, height: 2, backgroundColor: COLORS.accent,
    borderRadius: 1, marginTop: 6,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, zIndex: 1,
  },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },

  /* ── Identity bar ── */
  identityBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 9, gap: 8,
    backgroundColor: COLORS.bgElevated,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  roleTag: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  roleTagText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  identityName: { flex: 1, color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  sessionLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  exitBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  exitBtnText: { color: COLORS.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  /* ── Profile bar ── */
  profileBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 9, gap: 10,
    backgroundColor: COLORS.green + '0e',
    borderBottomWidth: 1, borderBottomColor: COLORS.green + '28',
    position: 'relative', overflow: 'hidden',
  },
  profileBarAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 3, backgroundColor: COLORS.green,
  },
  profileBarSub: {
    fontSize: 8, color: COLORS.green, fontWeight: '800',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 1,
  },
  profileBarName: { fontSize: 13, color: COLORS.green, fontWeight: '800' },

  /* ── Scroll + grid ── */
  scroll: { padding: 16, paddingBottom: 56 },
  grid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  /* ── Tiles ── */
  tile: {
    width: '47%', backgroundColor: COLORS.bgCard, borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border,
    elevation: 6, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    position: 'relative',
  },
  tileTopBar:  { height: 3 },
  tileBody:    { padding: 16, paddingBottom: 12 },
  tileAbbrWrap: {
    width: 44, height: 44, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: 12,
  },
  tileAbbr:  { fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  tileLabel: {
    fontSize: 12, fontWeight: '900', color: COLORS.textPrimary,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  tileSub:   { fontSize: 10, color: COLORS.textSecondary, marginTop: 3, lineHeight: 14 },
  tileFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1,
  },
  tileDot:       { width: 4, height: 4, borderRadius: 2 },
  tileFooterText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  badge: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: COLORS.accent, borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5, zIndex: 10,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },

  /* ── Notificações ── */
  notifSection: { marginTop: 28 },
  sectionHdr: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  sectionHdrAccent: { width: 3, height: 14, backgroundColor: COLORS.accent, borderRadius: 2 },
  sectionHdrTitle: {
    color: COLORS.textMuted, fontSize: 10, letterSpacing: 2,
    fontWeight: '800', textTransform: 'uppercase',
  },
  notifCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bgCard, borderRadius: 10,
    padding: 13, marginBottom: 8, borderLeftWidth: 3, gap: 12,
    borderWidth: 1, borderColor: COLORS.border,
    elevation: 2, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.14, shadowRadius: 3,
  },
  notifBadge: {
    width: 34, height: 34, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  notifBadgeText: { fontSize: 14, fontWeight: '900' },
  notifLabel: {
    color: COLORS.textPrimary, fontWeight: '700', fontSize: 13, letterSpacing: 0.3,
  },
  notifStatus: { fontSize: 10, marginTop: 2, fontWeight: '800', letterSpacing: 1 },
});
