import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../context/AppContext';

export default function ConnectionBadge({ connected }) {
  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: connected ? COLORS.green : COLORS.accent }]} />
      <Text style={[styles.text, { color: connected ? COLORS.green : COLORS.accent }]}>
        {connected ? 'Conectado' : 'Desconectado'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 13, fontWeight: '600' },
});
