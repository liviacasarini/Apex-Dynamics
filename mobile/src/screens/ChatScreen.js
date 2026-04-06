import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, COLORS, ROLE_COLORS } from '../context/AppContext';

function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function MessageBubble({ item, isOwn }) {
  if (item.type === 'system' || item.from?.deviceId === 'system') {
    return (
      <View style={s.systemMsg}>
        <Text style={s.systemText}>{item.content?.text}</Text>
      </View>
    );
  }
  const roleColor = ROLE_COLORS[item.from?.role] || COLORS.textMuted;
  const name = item.from?.name || '?';

  return (
    <View style={[s.bubbleRow, isOwn && s.bubbleRowOwn]}>
      {!isOwn && (
        <View style={[s.avatar, { backgroundColor: roleColor + '20', borderColor: roleColor }]}>
          <Text style={[s.avatarLetter, { color: roleColor }]}>{name[0].toUpperCase()}</Text>
        </View>
      )}
      <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
        {!isOwn && <Text style={[s.senderName, { color: roleColor }]}>{name}</Text>}
        <Text style={s.msgText}>{item.content?.text}</Text>
        <Text style={s.msgTime}>{formatTime(item.timestamp)}</Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { messages, sendMessage, connected, clearUnread, deviceId } = useApp();
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => { clearUnread(); }, [clearUnread]);
  useEffect(() => { scroll(); }, [messages.length]);

  function scroll() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }

  function handleSend() {
    const t = text.trim();
    if (!t || !connected) return;
    sendMessage(t);
    setText('');
    scroll();
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>CHAT</Text>
          <Text style={s.headerSub}>Equipe</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: connected ? COLORS.greenDim : COLORS.accentDim, borderColor: connected ? COLORS.green : COLORS.accent }]}>
          <View style={[s.statusDot, { backgroundColor: connected ? COLORS.green : COLORS.accent }]} />
          <Text style={[s.statusLabel, { color: connected ? COLORS.green : COLORS.accent }]}>
            {connected ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      {!connected && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineText}>Reconectando ao desktop...</Text>
        </View>
      )}

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
      />

      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder={connected ? 'Mensagem...' : 'Sem conexão'}
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={500}
          editable={connected}
          onFocus={scroll}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!text.trim() || !connected) && s.sendBtnOff]}
          onPress={handleSend}
          disabled={!text.trim() || !connected}
        >
          <Text style={s.sendIcon}>▶</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 3 },
  headerSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  offlineBanner: {
    backgroundColor: COLORS.accentDim, paddingVertical: 6, alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: COLORS.accent + '40',
  },
  offlineText: { color: COLORS.accent, fontSize: 12, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 4 },
  systemMsg: { alignItems: 'center', marginVertical: 8 },
  systemText: { color: COLORS.textMuted, fontSize: 11, fontStyle: 'italic' },
  bubbleRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end' },
  bubbleRowOwn: { flexDirection: 'row-reverse' },
  avatar: {
    width: 30, height: 30, borderRadius: 15, marginRight: 8,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  avatarLetter: { fontSize: 13, fontWeight: '800' },
  bubble: { maxWidth: '75%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwn: {
    backgroundColor: COLORS.accent + '20', borderBottomRightRadius: 4,
    borderWidth: 1, borderColor: COLORS.accent + '30',
  },
  bubbleOther: {
    backgroundColor: COLORS.bgCard, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  senderName: { fontSize: 11, fontWeight: '700', marginBottom: 2, letterSpacing: 0.3 },
  msgText: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20 },
  msgTime: { color: COLORS.textMuted, fontSize: 9, marginTop: 4, alignSelf: 'flex-end' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
  },
  input: {
    flex: 1, backgroundColor: COLORS.bgCard, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    color: COLORS.textPrimary, fontSize: 15,
    borderWidth: 1, borderColor: COLORS.border,
    maxHeight: 100, minHeight: 42,
  },
  sendBtn: {
    marginLeft: 8, width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: COLORS.border },
  sendIcon: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
