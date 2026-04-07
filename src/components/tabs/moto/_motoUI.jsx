/**
 * _motoUI.jsx — Pequenos componentes visuais reusados pelos tabs Moto.
 * Alinhados ao tema/identidade do app (theme.card, useColors).
 */

import { useColors } from '@/context/ThemeContext';
import { makeTheme } from '@/styles/theme';

export function MotoField({ label, value, onChange, unit, half, third, options, type = 'text', placeholder }) {
  const COLORS = useColors();
  const flexBasis = third ? '1 1 30%' : half ? '1 1 47%' : '1 1 100%';
  const minW = third ? 110 : half ? 150 : 240;
  const inputStyle = {
    width: '100%',
    background: COLORS.bg,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };
  return (
    <div style={{ flex: flexBasis, minWidth: minW }}>
      <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {options ? (
          <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">—</option>
            {options.map((o) => (
              typeof o === 'string'
                ? <option key={o} value={o}>{o}</option>
                : <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={inputStyle}
          />
        )}
        {unit && <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
    </div>
  );
}

export function MotoCard({ title, children }) {
  const COLORS = useColors();
  const theme = makeTheme(COLORS);
  return (
    <div style={theme.card}>
      <div style={theme.cardTitle}>{title}</div>
      {children}
    </div>
  );
}

export function MotoHeader({ icon, title, right }) {
  const COLORS = useColors();
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 16, flexWrap: 'wrap', gap: 12,
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: 0 }}>
        {icon} {title}
      </h1>
      {right}
    </div>
  );
}

export const motoFieldRow = { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 };
