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
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 700,
    border: 'none',
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
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
            padding: '4px 8px',
            fontSize: 12,
            background: C.bg,
            color: C.textPrimary,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
          }}
        />
        <button
          onClick={handleSave}
          disabled={disabled}
          style={{ ...btnStyle, background: C.accent, color: '#fff' }}
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
              padding: '4px 8px',
              background: C.bg,
              borderRadius: 4,
              border: `1px solid ${C.border}`,
            }}>
              <span style={{ flex: 1, fontSize: 12, color: C.textPrimary }}>{item.name}</span>
              {item.date && (
                <span style={{ fontSize: 10, color: C.textMuted }}>
                  {new Date(item.date).toLocaleDateString('pt-BR')}
                </span>
              )}
              <button
                onClick={() => onLoad(item.id)}
                style={{ ...btnStyle, background: C.green, color: '#000' }}
              >
                Carregar
              </button>
              <button
                onClick={() => onDelete(item.id)}
                style={{ ...btnStyle, background: 'transparent', color: C.accent, border: `1px solid ${C.accent}` }}
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
