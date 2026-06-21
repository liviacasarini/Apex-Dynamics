import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, ROLE_COLORS } from '../context/AppContext';
import { useCloud } from '../context/CloudContext';

function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Barras de performance (elemento visual da marca)
function BrandBars({ height = 22, style }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }, style]}>
      <View style={{ width: 6, height: Math.round(height * 0.38), backgroundColor: '#5a5a70', borderRadius: 1 }} />
      <View style={{ width: 6, height: Math.round(height * 0.65), backgroundColor: COLORS.blue,   borderRadius: 1 }} />
      <View style={{ width: 6, height: height,                    backgroundColor: COLORS.accent, borderRadius: 1 }} />
    </View>
  );
}

function MessageBubble({ item, isOwn }) {
  if (item.type === 'system' || item.from?.deviceId === 'system') {
    return (
      <View style={s.systemMsg}>
        <View style={s.systemMsgInner}>
          <Text style={s.systemText}>{item.content?.text}</Text>
        </View>
      </View>
    );
  }
  const roleColor = ROLE_COLORS[item.from?.role] || COLORS.textMuted;
  const name = item.from?.name || '?';

  return (
    <View style={[s.bubbleRow, isOwn && s.bubbleRowOwn]}>
      {!isOwn && (
        <View style={[s.avatar, { backgroundColor: roleColor + '20', borderColor: roleColor + '60' }]}>
          <Text style={[s.avatarLetter, { color: roleColor }]}>{name[0].toUpperCase()}</Text>
        </View>
      )}
      <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
        {!isOwn && <Text style={[s.senderName, { color: roleColor }]}>{name}</Text>}
        <Text style={s.msgText}>{item.content?.text}</Text>
        <Text style={[s.msgTime, isOwn && s.msgTimeOwn]}>{formatTime(item.timestamp)}</Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  // Modelo 100% nuvem: mensagens e envio via CloudContext. Os bits que
  // eram exclusivos da LAN (typing, status de conexão LAN, fila offline)
  // viram shims inertes até a Etapa 6.
  const { chatMessages: messages, sendChat: sendMessage, deviceId } = useCloud();
  const sendTyping = useCallback(() => {}, []);
  const connected = false;
  const cloudActive = true;
  const clearUnread = useCallback(() => {}, []);
  const offlineMeasurements = [];
  const typingUsers = {};

  const [text, setText] = useState('');
  const typingThrottle = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { clearUnread(); }, [clearUnread]);
  useEffect(() => { scroll(); }, [messages.length]);

  function scroll() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }

  const handleTextChange = useCallback((val) => {
    setText(val);
    if (!connected || !val.trim()) return;
    if (typingThrottle.current) return;
    sendTyping();
    typingThrottle.current = setTimeout(() => { typingThrottle.current = null; }, 2000);
  }, [connected, sendTyping]);

  async function handleSend() {
    const t = text.trim();
    if (!t) return;
    setText('');
    scroll();
    await sendMessage(t);
  }

  const statusColor = connected ? COLORS.green : cloudActive ? COLORS.blue : COLORS.accent;
  const statusLabel = connected ? 'LAN · Online' : cloudActive ? 'Via Nuvem' : 'Reconectando';
  const bannerText  = cloudActive
    ? 'Mensagens via nuvem — conecte ao Wi-Fi da pista para funcionalidades completas'
    : 'Reconectando ao desktop...';

  const typingList = Object.entries(typingUsers || {})
    .filter(([did]) => did !== deviceId);
  const hasTyping = typingList.length > 0;

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* ── Header com identidade visual ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.logoRow}>
            <BrandBars height={26} style={{ marginRight: 10 }} />
            <View>
              <Text style={s.logoApex}>APEX<Text style={{ color: COLORS.accent }}>DYNAMICS</Text></Text>
              <Text style={s.logoSub}>Rádio da Equipe</Text>
            </View>
          </View>
          {offlineMeasurements.length > 0 && (
            <Text style={s.pendingBadge}>
              {offlineMeasurements.length} medição{offlineMeasurements.length > 1 ? 'ões' : ''} pendente{offlineMeasurements.length > 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <View style={[s.statusPill, { backgroundColor: statusColor + '18', borderColor: statusColor + '50' }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* ── Banner offline/nuvem ── */}
      {!connected && (
        <View style={[s.banner, cloudActive
          ? { backgroundColor: COLORS.blue + '14', borderBottomColor: COLORS.blue + '40' }
          : { backgroundColor: COLORS.accent + '12', borderBottomColor: COLORS.accent + '40' }
        ]}>
          <View style={[s.bannerAccent, { backgroundColor: cloudActive ? COLORS.blue : COLORS.accent }]} />
          <Text style={[s.bannerText, { color: cloudActive ? COLORS.blue : COLORS.accent }]}>
            {cloudActive ? '☁  ' : '⚡  '}{bannerText}
          </Text>
        </View>
      )}

      {/* ── Mensagens ── */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item, i) => item.id || `m${i}`}
        renderItem={({ item }) => (
          <MessageBubble item={item} isOwn={item.from?.deviceId === deviceId} />
        )}
        contentContainerStyle={s.list}
        onContentSizeChange={scroll}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={s.emptyWrap}>
            <BrandBars height={48} style={{ marginBottom: 16 }} />
            <Text style={s.emptyTitle}>NENHUMA MENSAGEM</Text>
            <Text style={s.emptySub}>Inicie a comunicação com a equipe</Text>
            <Text style={s.emptySlogan}>DADOS QUE VENCEM CORRIDAS</Text>
          </View>
        )}
      />

      {/* ── Typing indicator ── */}
      {hasTyping && (
        <View style={s.typingBar}>
          <View style={s.typingDot} />
          <Text style={s.typingText}>
            {typingList.map(([, name]) => name).join(', ')} {typingList.length === 1 ? 'está digitando' : 'estão digitando'}...
          </Text>
        </View>
      )}

      {/* ── Input bar ── */}
      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={handleTextChange}
          placeholder="Mensagem para a equipe..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={500}
          onFocus={scroll}
        />
        <TouchableOpacity
          style={[s.sendBtn, !text.trim() && s.sendBtnOff]}
          onPress={handleSend}
          disabled={!text.trim()}
          activeOpacity={0.82}
        >
          <Text style={[s.sendIcon, !text.trim() && { color: COLORS.textMuted }]}>▶</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  headerLeft: { flex: 1 },
  logoRow:    { flexDirection: 'row', alignItems: 'flex-end' },
  logoApex:   { fontSize: 16, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 2 },
  logoSub:    { fontSize: 10, color: COLORS.textSecondary, marginTop: 1, letterSpacing: 0.5 },
  pendingBadge: {
    fontSize: 9, color: COLORS.yellow, fontWeight: '700',
    letterSpacing: 0.5, marginTop: 3,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
    marginLeft: 12,
  },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 10, fontWeight: '700' },

  /* Banner */
  banner: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, overflow: 'hidden',
    paddingVertical: 8,
  },
  bannerAccent: { width: 3, alignSelf: 'stretch', marginRight: 12 },
  bannerText:   { flex: 1, fontSize: 11, fontWeight: '600', paddingRight: 16, paddingVertical: 2 },

  /* Messages */
  list: { paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 6 },

  /* Empty state */
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 6 },
  emptyTitle: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  emptySub:    { fontSize: 12, color: COLORS.textMuted },
  emptySlogan: {
    fontSize: 8, color: COLORS.textMuted + '80', letterSpacing: 2,
    fontWeight: '700', marginTop: 12, textTransform: 'uppercase',
  },

  /* System message */
  systemMsg: { alignItems: 'center', marginVertical: 10 },
  systemMsgInner: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10,
    backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border,
  },
  systemText: { color: COLORS.textMuted, fontSize: 11, fontStyle: 'italic' },

  /* Bubble */
  bubbleRow:    { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  bubbleRowOwn: { flexDirection: 'row-reverse' },
  avatar: {
    width: 32, height: 32, borderRadius: 16, marginRight: 8,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0,
  },
  avatarLetter: { fontSize: 13, fontWeight: '900' },
  bubble: { maxWidth: '76%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwn: {
    backgroundColor: COLORS.accent + '20', borderBottomRightRadius: 3,
    borderWidth: 1, borderColor: COLORS.accent + '40',
  },
  bubbleOther: {
    backgroundColor: COLORS.bgCard, borderBottomLeftRadius: 3,
    borderWidth: 1, borderColor: COLORS.border,
  },
  senderName: { fontSize: 10, fontWeight: '800', marginBottom: 3, letterSpacing: 0.5 },
  msgText:    { color: COLORS.textPrimary, fontSize: 14, lineHeight: 21 },
  msgTime:    { color: COLORS.textMuted, fontSize: 9, marginTop: 5, alignSelf: 'flex-start' },
  msgTimeOwn: { alignSelf: 'flex-end' },

  /* Typing */
  typingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  typingDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.textMuted,
  },
  typingText: { color: COLORS.textMuted, fontSize: 11, fontStyle: 'italic' },

  /* Input */
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.bgElevated, gap: 10,
  },
  input: {
    flex: 1, backgroundColor: COLORS.bgCard, borderRadius: 20,
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12,
    color: COLORS.textPrimary, fontSize: 15,
    borderWidth: 1, borderColor: COLORS.border,
    maxHeight: 110, minHeight: 46,
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6,
  },
  sendBtnOff: {
    backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border,
    elevation: 0, shadowOpacity: 0,
  },
  sendIcon: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
