import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../context/AppContext';
import { useCloud } from '../context/CloudContext';

/** Presença (check-in) + Minhas Tarefas. */
export default function TasksScreen() {
  const { markAttendance, getTasks, completeTask } = useCloud();
  const [present, setPresent] = useState(null); // null = ainda não marcou
  const [busy, setBusy]       = useState(false);
  const [tasks, setTasks]     = useState([]);
  const [myId, setMyId]       = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await getTasks();
      if (r?.success) { setTasks(r.tasks || []); setMyId(r.me || null); }
    } catch { /* offline */ }
  }, [getTasks]);

  useFocusEffect(useCallback(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]));

  const setAttendance = async (status) => {
    setBusy(true);
    try { const r = await markAttendance(status); if (r?.success) setPresent(status === 'presente'); }
    catch { /* offline */ } finally { setBusy(false); }
  };

  const onComplete = async (id) => {
    try { await completeTask(id, true); await load(); } catch { /* offline */ }
  };

  const mine = tasks.filter(t => t.assigned_to && t.assigned_to === myId);
  const open = mine.filter(t => t.status !== 'concluida');
  const done = mine.filter(t => t.status === 'concluida');

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={s.title}>PRESENÇA & TAREFAS</Text>

        {/* Check-in */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Estou no autódromo?</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity disabled={busy} onPress={() => setAttendance('presente')}
              style={[s.btn, { backgroundColor: present === true ? COLORS.green : COLORS.bg, borderColor: COLORS.green }]}>
              <Text style={[s.btnTxt, { color: present === true ? '#fff' : COLORS.green }]}>✓ Cheguei</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={() => setAttendance('ausente')}
              style={[s.btn, { backgroundColor: present === false ? COLORS.textMuted : COLORS.bg, borderColor: COLORS.textMuted }]}>
              <Text style={[s.btnTxt, { color: present === false ? '#fff' : COLORS.textMuted }]}>Sair</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Minhas tarefas */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Minhas tarefas {open.length > 0 ? `(${open.length})` : ''}</Text>
          {mine.length === 0 ? (
            <Text style={s.muted}>Nenhuma tarefa atribuída a você.</Text>
          ) : (
            <>
              {open.map(t => (
                <View key={t.id} style={s.task}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.taskTitle}>{t.title}</Text>
                    {t.description ? <Text style={s.taskDesc}>{t.description}</Text> : null}
                    {t.created_by_name ? <Text style={s.taskMeta}>por {t.created_by_name}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => onComplete(t.id)} style={s.doneBtn}>
                    <Text style={s.doneBtnTxt}>Concluir</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {done.map(t => (
                <View key={t.id} style={[s.task, { opacity: 0.5 }]}>
                  <Text style={[s.taskTitle, { textDecorationLine: 'line-through', flex: 1 }]}>{t.title}</Text>
                  <Text style={{ color: COLORS.green, fontSize: 18 }}>✓</Text>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  title:     { fontSize: 16, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 1.5 },
  card:      { backgroundColor: COLORS.bgCard, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.5 },
  muted:     { color: COLORS.textMuted, fontSize: 13, marginTop: 8 },
  btn:       { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  btnTxt:    { fontWeight: '800', fontSize: 14 },
  task:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 8 },
  taskTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  taskDesc:  { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  taskMeta:  { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  doneBtn:   { backgroundColor: COLORS.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  doneBtnTxt:{ color: '#fff', fontWeight: '800', fontSize: 12 },
});
