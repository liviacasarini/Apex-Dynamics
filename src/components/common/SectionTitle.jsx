/**
 * SectionTitle — Heading unificado de seção.
 * Usado em SetupSheet, Combustivel, Peso, Temperatura e outros tabs.
 */
import React from 'react';
import { FONTS } from '@/constants/colors';

export default function SectionTitle({ children, color }) {
  return (
    <div style={{
      fontFamily: FONTS.display,
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: '0.8px',
      textTransform: 'uppercase',
      color,
      marginBottom: 14,
      marginTop: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      {children}
    </div>
  );
}
