/**
 * PistasMotoTab — Catálogo de pistas com características relevantes para moto:
 * comprimento, n° de curvas total, esquerdas, direitas, banking, recta principal,
 * elevação, kerbs (severidade), grip, asfalto, recordes WSBK/MotoGP/SBK BR.
 */

import { useState } from 'react';
import { useColors } from '@/context/ThemeContext';
import { MotoField, MotoCard, MotoHeader, motoFieldRow } from './_motoUI';
import { useMotoState } from './_motoStore';

const EMPTY_TRACK = () => ({
  id: crypto.randomUUID(),
  name: '', country: '', length: '',
  cornersTotal: '', cornersLeft: '', cornersRight: '',
  longestStraight: '', maxBanking: '',
  elevationChange: '', kerbSeverity: '', surface: '', grip: '',
  lapRecord: '', recordHolder: '', recordYear: '',
  topSpeed: '', notes: '',
});

export default function PistasMotoTab({ workspaceId }) {
  const COLORS = useColors();
  const [tracks, setTracks] = useMotoState(workspaceId, 'pistas', []);
  const [selId, setSelId] = useState(null);
  const sel = (tracks || []).find((t) => t.id === selId);

  const add = () => {
    const t = EMPTY_TRACK();
    t.name = 'Nova Pista';
    setTracks([...(tracks || []), t]);
    setSelId(t.id);
  };

  const update = (k) => (v) => setTracks(tracks.map((t) => t.id === selId ? { ...t, [k]: v } : t));
  const remove = (id) => {
    if (!confirm('Remover pista?')) return;
    setTracks(tracks.filter((t) => t.id !== id));
    if (selId === id) setSelId(null);
  };

  return (
    <div style={{ padding: '20px 12px', maxWidth: 1280, margin: '0 auto' }}>
      <MotoHeader icon="🏁" title="Pistas — Moto" right={
        <button onClick={add} style={{
          background: COLORS.accent, color: '#fff', border: 'none',
          borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>+ Nova Pista</button>
      } />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 220, maxWidth: 320 }}>
          <MotoCard title={`📋 Catálogo (${(tracks || []).length})`}>
            {(tracks || []).length === 0 && (
              <div style={{ fontSize: 12, color: COLORS.textMuted }}>Nenhuma pista cadastrada.</div>
            )}
            {(tracks || []).map((t) => (
              <div key={t.id} onClick={() => setSelId(t.id)} style={{
                padding: '10px 12px', borderRadius: 6, marginBottom: 4,
                background: selId === t.id ? `${COLORS.accent}18` : 'transparent',
                border: `1px solid ${selId === t.id ? COLORS.accent + '55' : COLORS.border + '44'}`,
                cursor: 'pointer',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{t.name}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                  {t.country} {t.length && `· ${t.length} m`}
                </div>
              </div>
            ))}
          </MotoCard>
        </div>

        <div style={{ flex: '3 1 480px', minWidth: 320 }}>
          {sel ? (
            <>
              <MotoCard title="📍 Identificação">
                <div style={motoFieldRow}>
                  <MotoField label="Nome" value={sel.name} onChange={update('name')} half />
                  <MotoField label="País" value={sel.country} onChange={update('country')} half />
                  <MotoField label="Comprimento" unit="m" value={sel.length} onChange={update('length')} third />
                  <MotoField label="Recta principal" unit="m" value={sel.longestStraight} onChange={update('longestStraight')} third />
                  <MotoField label="Velocidade máx. esperada" unit="km/h" value={sel.topSpeed} onChange={update('topSpeed')} third />
                </div>
              </MotoCard>

              <MotoCard title="↪️ Curvas">
                <div style={motoFieldRow}>
                  <MotoField label="Total" value={sel.cornersTotal} onChange={update('cornersTotal')} third />
                  <MotoField label="Esquerdas" value={sel.cornersLeft} onChange={update('cornersLeft')} third />
                  <MotoField label="Direitas" value={sel.cornersRight} onChange={update('cornersRight')} third />
                  <MotoField label="Banking máximo" unit="°" value={sel.maxBanking} onChange={update('maxBanking')} third />
                  <MotoField label="Elevação total" unit="m" value={sel.elevationChange} onChange={update('elevationChange')} third />
                  <MotoField label="Severidade kerbs" value={sel.kerbSeverity} onChange={update('kerbSeverity')} third options={['Baixa', 'Média', 'Alta']} />
                </div>
              </MotoCard>

              <MotoCard title="🛣️ Asfalto">
                <div style={motoFieldRow}>
                  <MotoField label="Tipo de superfície" value={sel.surface} onChange={update('surface')} half />
                  <MotoField label="Grip estimado" value={sel.grip} onChange={update('grip')} half options={['Baixo', 'Médio', 'Alto', 'Variável']} />
                </div>
              </MotoCard>

              <MotoCard title="🏆 Recorde da volta">
                <div style={motoFieldRow}>
                  <MotoField label="Tempo" value={sel.lapRecord} onChange={update('lapRecord')} third placeholder="1:32.456" />
                  <MotoField label="Piloto" value={sel.recordHolder} onChange={update('recordHolder')} third />
                  <MotoField label="Ano" value={sel.recordYear} onChange={update('recordYear')} third />
                </div>
              </MotoCard>

              <MotoCard title="📝 Notas">
                <textarea
                  value={sel.notes || ''} onChange={(e) => update('notes')(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%', background: COLORS.bg, color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.border}`, borderRadius: 6,
                    padding: '10px 12px', fontSize: 13, outline: 'none',
                    boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => remove(sel.id)} style={{
                    background: `${COLORS.accent}18`, border: `1px solid ${COLORS.accent}55`,
                    color: COLORS.accent, borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                  }}>🗑️ Remover pista</button>
                </div>
              </MotoCard>
            </>
          ) : (
            <MotoCard title="Nenhuma pista selecionada">
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>Adicione uma pista e selecione na lista.</div>
            </MotoCard>
          )}
        </div>
      </div>
    </div>
  );
}
