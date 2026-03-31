/**
 * FormField — Componente unificado de campo de formulário.
 * Substitui Label + Field + InputField encontrados em 8+ tabs.
 *
 * Props:
 *   label       — Texto do rótulo
 *   value       — Valor atual do campo
 *   onChange     — Callback (value) => void
 *   unit        — Unidade opcional (ex: "kg", "°C")
 *   placeholder — Placeholder do input
 *   half        — Se true, campo ocupa metade da largura
 *   readOnly    — Campo somente leitura
 *   highlight   — Cor de destaque na borda (ex: COLORS.green)
 *   multiline   — Se true, renderiza textarea
 *   children    — Se fornecido, renderiza children ao invés de input (para selects etc.)
 *   colors      — Objeto de cores do tema (COLORS)
 *   inputStyle  — Estilo base para o input (INPUT_BASE do theme.js)
 *   unitInline  — Se true, coloca a unidade ao lado do input (estilo SetupSheet)
 */
import React from 'react';

export function FormLabel({ children, colors }) {
  return (
    <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>
      {children}
    </label>
  );
}

export default function FormField({
  label,
  value,
  onChange,
  unit,
  placeholder,
  half,
  readOnly,
  highlight,
  multiline,
  children,
  colors,
  inputStyle = {},
  unitInline,
}) {
  const C = colors;

  const labelText = unit && !unitInline ? `${label} (${unit})` : label;

  /* Se children fornecido, renderiza children (ex: <select>) */
  if (children) {
    return (
      <div style={{ flex: half ? '1 1 140px' : '1 1 100%', minWidth: 120 }}>
        <FormLabel colors={C}>{labelText}</FormLabel>
        {children}
      </div>
    );
  }

  const baseInput = {
    ...inputStyle,
    width: '100%',
    background: readOnly ? C.bg : (inputStyle.background || C.bgCard),
    borderColor: highlight || inputStyle.borderColor || C.border,
  };

  const InputTag = multiline ? 'textarea' : 'input';

  const input = (
    <InputTag
      type={multiline ? undefined : 'text'}
      value={value || ''}
      onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
      readOnly={readOnly}
      placeholder={placeholder || ''}
      rows={multiline ? 3 : undefined}
      style={{
        ...baseInput,
        ...(multiline ? { resize: 'vertical', minHeight: 60 } : {}),
      }}
    />
  );

  /* Variante com unidade inline (ao lado do input) */
  if (unitInline && unit) {
    return (
      <div style={{ flex: half ? '1 1 48%' : '1 1 100%', minWidth: half ? 140 : 280 }}>
        <FormLabel colors={C}>{label}</FormLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {input}
          <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap' }}>{unit}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: half ? '1 1 140px' : '1 1 100%', minWidth: 120 }}>
      <FormLabel colors={C}>{labelText}</FormLabel>
      {input}
    </div>
  );
}
