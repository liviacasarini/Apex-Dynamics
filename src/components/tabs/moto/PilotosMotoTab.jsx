/**
 * PilotosMotoTab — Roster de pilotos com equipamento (macacão, capacete, airbag, botas).
 */

import { useState } from 'react';
import { useColors } from '@/context/ThemeContext';
import { MotoField, MotoCard, MotoHeader, motoFieldRow } from './_motoUI';
import { useMotoState } from './_motoStore';

const EMPTY_RIDER = () => ({
  id: crypto.randomUUID(),
  name: '', nationality: '', dateOfBirth: '', license: '',
  height: '', weight: '',
  // Equipamento
  suitBrand: '', suitModel: '', suitSize: '', suitHomologation: '',  // FIM
  helmetBrand: '', helmetModel: '', helmetSize: '', helmetHomologation: '',
  airbagBrand: '', airbagModel: '', airbagBatteryDate: '',
  bootsBrand: '', bootsSize: '',
  glovesBrand: '', glovesSize: '',
  backProtector: '',
  notes: '',
});

export default function PilotosMotoTab({ workspaceId }) {
  const COLORS = useColors();
  const [riders, setRiders] = useMotoState(workspaceId, 'pilotos', []);
  const [selId, setSelId] = useState(null);

  const sel = (riders || []).find((r) => r.id === selId);

  const add = () => {
    const r = EMPTY_RIDER();
    r.name = 'Novo Piloto';
    setRiders([...(riders || []), r]);
    setSelId(r.id);
  };

  const update = (k) => (v) => {
    setRiders(riders.map((r) => r.id === selId ? { ...r, [k]: v } : r));
  };

  const remove = (id) => {
    if (!confirm('Remover piloto?')) return;
    setRiders(riders.filter((r) => r.id !== id));
    if (selId === id) setSelId(null);
  };

  return (
    <div style={{ padding: '20px 12px', maxWidth: 1280, margin: '0 auto' }}>
      <MotoHeader icon="👤" title="Pilotos — Moto" right={
        <button onClick={add} style={{
          background: COLORS.accent, color: '#fff', border: 'none',
          borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>+ Novo Piloto</button>
      } />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {/* Lista */}
        <div style={{ flex: '1 1 240px', minWidth: 220, maxWidth: 320 }}>
          <MotoCard title={`📋 Roster (${(riders || []).length})`}>
            {(riders || []).length === 0 && (
              <div style={{ fontSize: 12, color: COLORS.textMuted }}>Nenhum piloto cadastrado.</div>
            )}
            {(riders || []).map((r) => (
              <div key={r.id} onClick={() => setSelId(r.id)} style={{
                padding: '10px 12px', borderRadius: 6, marginBottom: 4,
                background: selId === r.id ? `${COLORS.accent}18` : 'transparent',
                border: `1px solid ${selId === r.id ? COLORS.accent + '55' : COLORS.border + '44'}`,
                cursor: 'pointer',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>{r.name || '—'}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{r.nationality} · {r.license}</div>
              </div>
            ))}
          </MotoCard>
        </div>

        {/* Detalhe */}
        <div style={{ flex: '3 1 480px', minWidth: 320 }}>
          {sel ? (
            <>
              <MotoCard title="🪪 Identificação">
                <div style={motoFieldRow}>
                  <MotoField label="Nome" value={sel.name} onChange={update('name')} half />
                  <MotoField label="Nacionalidade" value={sel.nationality} onChange={update('nationality')} half />
                  <MotoField label="Data de nascimento" value={sel.dateOfBirth} onChange={update('dateOfBirth')} third />
                  <MotoField label="Licença (FIM/CBM)" value={sel.license} onChange={update('license')} third />
                  <MotoField label="Altura" unit="cm" value={sel.height} onChange={update('height')} third />
                  <MotoField label="Peso (sem equip.)" unit="kg" value={sel.weight} onChange={update('weight')} third />
                </div>
              </MotoCard>

              <MotoCard title="🧥 Macacão">
                <div style={motoFieldRow}>
                  <MotoField label="Marca" value={sel.suitBrand} onChange={update('suitBrand')} third />
                  <MotoField label="Modelo" value={sel.suitModel} onChange={update('suitModel')} third />
                  <MotoField label="Tamanho" value={sel.suitSize} onChange={update('suitSize')} third />
                  <MotoField label="Homologação" value={sel.suitHomologation} onChange={update('suitHomologation')} placeholder="FIM Level 2" />
                </div>
              </MotoCard>

              <MotoCard title="🪖 Capacete">
                <div style={motoFieldRow}>
                  <MotoField label="Marca" value={sel.helmetBrand} onChange={update('helmetBrand')} third />
                  <MotoField label="Modelo" value={sel.helmetModel} onChange={update('helmetModel')} third />
                  <MotoField label="Tamanho" value={sel.helmetSize} onChange={update('helmetSize')} third />
                  <MotoField label="Homologação" value={sel.helmetHomologation} onChange={update('helmetHomologation')} placeholder="FIM FRHPhe-01" />
                </div>
              </MotoCard>

              <MotoCard title="💨 Airbag">
                <div style={motoFieldRow}>
                  <MotoField label="Marca" value={sel.airbagBrand} onChange={update('airbagBrand')} third />
                  <MotoField label="Modelo" value={sel.airbagModel} onChange={update('airbagModel')} third />
                  <MotoField label="Validade Bateria" value={sel.airbagBatteryDate} onChange={update('airbagBatteryDate')} third />
                </div>
              </MotoCard>

              <MotoCard title="🥾 Botas / Luvas / Outros">
                <div style={motoFieldRow}>
                  <MotoField label="Botas Marca" value={sel.bootsBrand} onChange={update('bootsBrand')} half />
                  <MotoField label="Botas Tam." value={sel.bootsSize} onChange={update('bootsSize')} half />
                  <MotoField label="Luvas Marca" value={sel.glovesBrand} onChange={update('glovesBrand')} half />
                  <MotoField label="Luvas Tam." value={sel.glovesSize} onChange={update('glovesSize')} half />
                  <MotoField label="Protetor de coluna" value={sel.backProtector} onChange={update('backProtector')} />
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
                  }}>🗑️ Remover piloto</button>
                </div>
              </MotoCard>
            </>
          ) : (
            <MotoCard title="Nenhum piloto selecionado">
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                Adicione um piloto e selecione na lista para editar.
              </div>
            </MotoCard>
          )}
        </div>
      </div>
    </div>
  );
}
