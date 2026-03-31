/**
 * CornerGrid — Grade FL/FR/RL/RR unificada.
 * Usado em SetupSheet, PesoTab e outros que precisam de inputs por canto.
 *
 * Props:
 *   rows         — [{ field, label, unit }]
 *   current      — Objeto { [field]: { fl, fr, rl, rr } }
 *   onUpdate     — (field, corner, value) => void
 *   cornerInput  — Estilo do input de canto
 *   colors       — Objeto de cores do tema
 */
import React from 'react';

const CORNERS = [
  { key: 'fl', label: 'FL', sub: 'Di. Esq.' },
  { key: 'fr', label: 'FR', sub: 'Di. Dir.' },
  { key: 'rl', label: 'RL', sub: 'Tr. Esq.' },
  { key: 'rr', label: 'RR', sub: 'Tr. Dir.' },
];

export { CORNERS };

export default function CornerGrid({
  rows,
  current,
  onUpdate,
  cornerInput,
  colors,
}) {
  const C = colors;

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '110px repeat(4, 1fr)',
        gap: 6,
        marginBottom: 4,
        paddingBottom: 6,
        borderBottom: `1px solid ${C.border}33`,
      }}>
        <div />
        {CORNERS.map((c) => (
          <div key={c.key} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{c.label}</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Linhas de parâmetros */}
      {rows.map(({ field, label, unit }) => (
        <div
          key={field}
          style={{
            display: 'grid',
            gridTemplateColumns: '110px repeat(4, 1fr)',
            gap: 6,
            marginBottom: 6,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 11, color: C.textSecondary, fontWeight: 600 }}>
            {label}
            {unit && <span style={{ color: C.textMuted, fontWeight: 400, marginLeft: 3 }}>({unit})</span>}
          </div>

          {CORNERS.map((c) => (
            <input
              key={c.key}
              type="text"
              value={current[field]?.[c.key] ?? ''}
              onChange={(e) => onUpdate(field, c.key, e.target.value)}
              placeholder="—"
              style={cornerInput}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
