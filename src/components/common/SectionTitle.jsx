/**
 * SectionTitle — Heading unificado de seção.
 * Usado em SetupSheet, Combustivel, Peso, Temperatura e outros tabs.
 */
import React from 'react';

export default function SectionTitle({ children, color }) {
  return (
    <div style={{
      fontSize: 13,
      fontWeight: 700,
      color,
      marginBottom: 14,
      marginTop: 8,
    }}>
      {children}
    </div>
  );
}
