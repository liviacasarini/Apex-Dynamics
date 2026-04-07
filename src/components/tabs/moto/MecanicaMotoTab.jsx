/**
 * MecanicaMotoTab — Inventário/controle de quilometragem para componentes moto.
 * Categorias: Forquilha, Mono, Corrente, Coroa/Pinhão, Pastilhas, Discos,
 * Pneus (set count), Embreagem, Filtros, Velas, Motor, Caixa.
 */

import { useState } from 'react';
import { useColors } from '@/context/ThemeContext';
import { MotoCard, MotoHeader } from './_motoUI';
import { useMotoState } from './_motoStore';

const CATEGORIES = [
  'Forquilha', 'Mono (Amortecedor)', 'Corrente', 'Pinhão', 'Coroa',
  'Pastilhas Diant.', 'Pastilhas Tras.', 'Discos Diant.', 'Discos Tras.',
  'Embreagem', 'Filtro Óleo', 'Filtro Ar', 'Velas',
  'Motor (revisão)', 'Caixa de Câmbio', 'Rolamentos Direção',
  'Rolamentos Roda', 'Outro',
];

const ALARM = 0.96;

export default function MecanicaMotoTab({ workspaceId }) {
  const COLORS = useColors();
  const [parts, setParts] = useMotoState(workspaceId, 'mecanica', []);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [kmLimit, setKmLimit] = useState('');
  const [kmUsed, setKmUsed] = useState('');

  const add = () => {
    if (!name.trim() || !kmLimit) return;
    setParts([...(parts || []), {
      id: crypto.randomUUID(),
      name: name.trim(), category,
      kmLimit: parseFloat(kmLimit) || 0,
      kmUsed: parseFloat(kmUsed) || 0,
      addedAt: new Date().toISOString(),
    }]);
    setName(''); setKmLimit(''); setKmUsed('');
  };

  const addKm = (id, delta) => {
    const v = parseFloat(prompt('Quilômetros a adicionar (ou negativo para reverter):', '0'));
    if (isNaN(v)) return;
    setParts(parts.map((p) => p.id === id ? { ...p, kmUsed: Math.max(0, (p.kmUsed || 0) + v) } : p));
  };

  const reset = (id) => {
    if (!confirm('Zerar quilometragem desta peça?')) return;
    setParts(parts.map((p) => p.id === id ? { ...p, kmUsed: 0 } : p));
  };

  const remove = (id) => {
    if (!confirm('Remover esta peça do inventário?')) return;
    setParts(parts.filter((p) => p.id !== id));
  };

  const inputBase = {
    background: COLORS.bg, color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`, borderRadius: 6,
    padding: '8px 12px', fontSize: 13, outline: 'none',
  };

  return (
    <div style={{ padding: '20px 12px', maxWidth: 1200, margin: '0 auto' }}>
      <MotoHeader icon="⚙️" title="Inventário — Moto" />

      <MotoCard title="➕ Adicionar Componente">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputBase, cursor: 'pointer', flex: '1 1 180px' }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome / referência" style={{ ...inputBase, flex: '2 1 200px' }} />
          <input type="number" value={kmLimit} onChange={(e) => setKmLimit(e.target.value)} placeholder="Limite km" style={{ ...inputBase, flex: '1 1 100px', maxWidth: 120 }} />
          <input type="number" value={kmUsed} onChange={(e) => setKmUsed(e.target.value)} placeholder="km já usados" style={{ ...inputBase, flex: '1 1 100px', maxWidth: 120 }} />
          <button onClick={add} style={{
            background: COLORS.accent, color: '#fff', border: 'none',
            borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>+ Adicionar</button>
        </div>
      </MotoCard>

      <MotoCard title={`📋 Componentes (${(parts || []).length})`}>
        {(parts || []).length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.textMuted, padding: '8px 0' }}>Nenhum componente cadastrado.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {parts.map((p) => {
              const pct = p.kmLimit > 0 ? (p.kmUsed / p.kmLimit) : 0;
              const danger = pct >= ALARM;
              const warn = pct >= 0.75 && !danger;
              const color = danger ? COLORS.accent : warn ? COLORS.yellow || '#e2a52b' : COLORS.green;
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  padding: '10px 14px',
                  background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
                }}>
                  <div style={{ flex: '2 1 200px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>{p.category}</div>
                  </div>
                  <div style={{ flex: '2 1 220px', minWidth: 200 }}>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 3 }}>
                      {p.kmUsed.toFixed(1)} / {p.kmLimit} km · {(pct * 100).toFixed(0)}%
                    </div>
                    <div style={{ height: 6, background: `${COLORS.border}55`, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, pct * 100)}%`, height: '100%', background: color, transition: 'width 0.2s' }} />
                    </div>
                  </div>
                  <button onClick={() => addKm(p.id)} style={btn(COLORS, false)}>+ km</button>
                  <button onClick={() => reset(p.id)} style={btn(COLORS, false)}>↺</button>
                  <button onClick={() => remove(p.id)} style={btn(COLORS, true)}>✕</button>
                </div>
              );
            })}
          </div>
        )}
      </MotoCard>
    </div>
  );
}

function btn(COLORS, danger) {
  return {
    background: danger ? `${COLORS.accent}18` : 'transparent',
    border: `1px solid ${danger ? COLORS.accent + '55' : COLORS.border}`,
    color: danger ? COLORS.accent : COLORS.textSecondary,
    borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', flexShrink: 0,
  };
}
