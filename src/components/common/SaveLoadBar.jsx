/**
 * SaveLoadBar — Controles reutilizáveis de salvar/carregar/excluir para profile items.
 * Usado em SetupSheet, Pneus, Combustivel, Peso tabs para salvar/carregar de profiles.
 *
 * Props:
 *   items       — Array de itens salvos [{ id, name, date, ... }]
 *   onSave      — (name) => void
 *   onLoad      — (id) => void
 *   onDelete    — (id) => void
 *   label       — Label do tipo (ex: "Setup", "Tire Set")
 *   colors      — Objeto de cores do tema
 *   disabled    — Se true, desabilita controles
 */
import React, { useState } from 'react';

export default function SaveLoadBar({
  items = [],
  onSave,
  onLoad,
  onDelete,
  label = 'Item',
  colors,
  disabled,
}) {
  const C = colors;
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(`Nome do ${label} é obrigatório`);
      return;
    }
    onSave(trimmed);
    setName('');
    setError('');
  };

  const btnStyle = {
    padding: '5px 11px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.3px',
    border: 'none',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 0.15s, box-shadow 0.15s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Salvar */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          placeholder={`Nome do ${label}...`}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '5px 10px',
            fontSize: 12,
            background: C.bg,
            color: C.textPrimary,
            border: `1px solid ${C.border}`,
            borderRadius: 7,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSave}
          disabled={disabled}
          style={{
            ...btnStyle,
            background: C.accent,
            color: '#fff',
            boxShadow: disabled ? 'none' : `0 4px 12px -6px ${C.accentGlow || C.accent + '66'}`,
          }}
        >
          Salvar
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: C.accent }}>{error}</div>}

      {/* Lista de itens salvos */}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              background: C.bg,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
            }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: C.textPrimary }}>{item.name}</span>
              {item.date && (
                <span style={{
                  fontSize: 10, color: C.textMuted,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {new Date(item.date).toLocaleDateString('pt-BR')}
                </span>
              )}
              <button
                onClick={() => onLoad(item.id)}
                style={{ ...btnStyle, background: `${C.green}1e`, color: C.green, border: `1px solid ${C.green}55` }}
              >
                Carregar
              </button>
              <button
                onClick={() => onDelete(item.id)}
                title={`Excluir ${label}`}
                style={{ ...btnStyle, background: 'transparent', color: C.accent, border: `1px solid ${C.accent}55` }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
