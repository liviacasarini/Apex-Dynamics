import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Vibration,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../context/AppContext';
import { useCloud } from '../context/CloudContext';

/**
 * ChecklistScreen — o membro escolhe o carro e marca os itens do checklist
 * (universais + específicos daquele carro). Cada marcação sobe para a nuvem
 * e atualiza os desktops. Ao concluir todos os itens, mostra a tela de
 * finalização. Somente o chefe edita os itens (no desktop); aqui só marca.
 */
export default function ChecklistScreen() {
  const { cars, getChecklist, checkChecklistItem, loadCars } = useCloud();

  const [selectedCarId, setSelectedCarId] = useState(null);
  const [items, setItems]   = useState([]);
  const [done, setDone]     = useState(0);
  const [total, setTotal]   = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [busyId, setBusyId]     = useState(null);
  const wasFinished = useRef(false);

  const carId = selectedCarId || cars?.[0]?.id || null;
  const selectedCar = cars?.find(c => c.id === carId) || null;

  const load = useCallback(async (cid) => {
    if (!cid) { setItems([]); setTotal(0); setDone(0); setFinished(false); return; }
    try {
      const res = await getChecklist(cid);
      if (res?.success) {
        setItems(res.items || []);
        setTotal(res.total || 0);
        setDone(res.done || 0);
        setFinished(!!res.finished);
      }
    } catch { /* offline — mantém estado */ }
  }, [getChecklist]);

  // Ao focar: atualiza carros e carrega o checklist; faz polling a cada 6s.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    loadCars?.();
    const cid = selectedCarId || cars?.[0]?.id || null;
    setLoading(true);
    load(cid).finally(() => { if (!cancelled) setLoading(false); });
    const iv = setInterval(() => load(selectedCarId || cars?.[0]?.id || null), 6000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [selectedCarId, cars, load, loadCars]));

  async function toggle(item) {
    if (!carId) return;
    const next = !item.checked;
    setBusyId(item.id);
    // Otimista
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: next } : i));
    try {
      const r = await checkChecklistItem(carId, item.id, next);
      if (r?.success) {
        setDone(r.done); setTotal(r.total);
        const nowFin = !!r.finished;
        if (nowFin && !wasFinished.current) Vibration.vibrate([0, 80, 40, 120]);
        wasFinished.current = nowFin;
        setFinished(nowFin);
      } else {
        await load(carId); // reverte para o estado real
      }
    } catch {
      await load(carId);
    } finally {
      setBusyId(null);
    }
  }

  function selectCar(id) {
    wasFinished.current = false;
    setSelectedCarId(id);
    setLoading(true);
    load(id).finally(() => setLoading(false));
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>CHECKLIST</Text>
        <Text style={s.subtitle}>Selecione o carro e marque os itens conforme conferir.</Text>
      </View>

      {/* Seletor de carro */}
      {(!cars || cars.length === 0) ? (
        <View style={s.emptyBanner}>
          <View style={[s.emptyAccent, { backgroundColor: '#f0a020' }]} />
          <Text style={s.emptyText}>
            ⚠️ Nenhum carro disponível. Peça ao chefe para sincronizar os perfis no desktop (Equipe → Visão Geral).
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.carRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {cars.map(c => {
            const sel = c.id === carId;
            return (
              <TouchableOpacity key={c.id} onPress={() => selectCar(c.id)} activeOpacity={0.8}
                style={[s.carChip, sel && { borderColor: COLORS.green, backgroundColor: COLORS.green + '18' }]}>
                <View style={[s.carDot, { backgroundColor: c.color || COLORS.green }]} />
                <Text style={[s.carChipText, sel && { color: COLORS.green, fontWeight: '900' }]}>
                  {c.number != null ? `#${c.number} ` : ''}{c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {carId && (
        <>
          {/* Progresso */}
          <View style={s.progressWrap}>
            <View style={s.progressBarBg}>
              <View style={[s.progressBarFill, { width: `${pct}%`, backgroundColor: finished ? COLORS.green : COLORS.accent }]} />
            </View>
            <Text style={s.progressText}>{done}/{total} itens · {pct}%</Text>
          </View>

          {/* Banner de finalização */}
          {finished && total > 0 && (
            <View style={s.finishedBanner}>
              <Text style={s.finishedEmoji}>✅</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.finishedTitle}>Checklist finalizado!</Text>
                <Text style={s.finishedSub}>
                  Todos os itens de {selectedCar?.name || 'este carro'} foram conferidos. O engenheiro já consegue ver no desktop.
                </Text>
              </View>
            </View>
          )}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 6, gap: 8 }}>
            {loading && items.length === 0 ? (
              <ActivityIndicator color={COLORS.accent} style={{ marginTop: 30 }} />
            ) : items.length === 0 ? (
              <Text style={s.noItems}>Nenhum item de checklist para este carro ainda. O chefe define os itens no desktop.</Text>
            ) : (
              items.map(it => (
                <TouchableOpacity key={it.id} onPress={() => toggle(it)} disabled={busyId === it.id} activeOpacity={0.7}
                  style={[s.item, it.checked && s.itemChecked]}>
                  <Text style={s.itemBox}>{it.checked ? '✅' : '⬜'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.itemLabel, it.checked && s.itemLabelChecked]}>{it.label}</Text>
                    {it.scope === 'car'
                      ? <Text style={s.tagCar}>🎯 só este carro</Text>
                      : <Text style={s.tagUniv}>🌐 universal</Text>}
                    {it.checked && it.checkedByName && (
                      <Text style={s.itemBy}>marcado por {it.checkedByName}</Text>
                    )}
                  </View>
                  {busyId === it.id && <ActivityIndicator color={COLORS.textMuted} size="small" />}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: 2 },
  subtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },

  carRow: { maxHeight: 56, marginBottom: 4 },
  carChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 40, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard },
  carDot: { width: 12, height: 12, borderRadius: 6 },
  carChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },

  progressWrap: { paddingHorizontal: 16, paddingTop: 8 },
  progressBarBg: { height: 8, borderRadius: 5, backgroundColor: COLORS.border, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  progressText: { fontSize: 11, color: COLORS.textMuted, marginTop: 5, fontWeight: '600' },

  finishedBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, marginBottom: 0, padding: 14, borderRadius: 12, backgroundColor: COLORS.green + '1A', borderWidth: 1, borderColor: COLORS.green + '55' },
  finishedEmoji: { fontSize: 26 },
  finishedTitle: { color: COLORS.green, fontSize: 15, fontWeight: '900' },
  finishedSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },

  noItems: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30, paddingHorizontal: 20, lineHeight: 19 },

  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border },
  itemChecked: { borderColor: COLORS.green + '55', backgroundColor: COLORS.green + '10' },
  itemBox: { fontSize: 22 },
  itemLabel: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  itemLabelChecked: { textDecorationLine: 'line-through', color: COLORS.textSecondary },
  tagUniv: { color: COLORS.textMuted, fontSize: 10, marginTop: 3 },
  tagCar: { color: '#b07cff', fontSize: 10, marginTop: 3 },
  itemBy: { color: COLORS.textMuted, fontSize: 10, marginTop: 2, fontStyle: 'italic' },

  emptyBanner: { flexDirection: 'row', alignItems: 'center', margin: 16, borderRadius: 12, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  emptyAccent: { width: 3, alignSelf: 'stretch' },
  emptyText: { flex: 1, color: COLORS.textSecondary, fontSize: 13, padding: 14, lineHeight: 19 },
});
