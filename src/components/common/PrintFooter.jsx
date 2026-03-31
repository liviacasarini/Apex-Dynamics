import { useEffect } from 'react';
import { useColors } from '@/context/ThemeContext';

/**
 * PrintFooter — Botão de imprimir reutilizável.
 * Renderiza um botão + dica Ctrl+P no rodapé de cada aba.
 * Também registra o atalho Ctrl+P para window.print().
 */
export default function PrintFooter() {
  const COLORS = useColors();

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="no-print" style={{ textAlign: 'center', marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => window.print()}
        style={{
          padding: '8px 28px',
          background: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          color: COLORS.textSecondary,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Imprimir relatório
      </button>
      <span style={{ fontSize: 11, color: COLORS.textMuted }}>ou Ctrl+P</span>
    </div>
  );
}
