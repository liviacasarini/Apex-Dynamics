import { useState, useEffect } from 'react';
import { COLORS } from '@/constants/colors';
import { theme } from '@/styles/theme';

const EMPTY_SETUP = {
  track: '',
  date: new Date().toISOString().split('T')[0],
  event: '',
  driver: '',
  car: '',
  // Suspensão
  frontSpringRate: '',
  rearSpringRate: '',
  frontBarRate: '',
  rearBarRate: '',
  frontRideHeight: '',
  rearRideHeight: '',
  frontCamber: '',
  rearCamber: '',
  frontToe: '',
  rearToe: '',
  frontCaster: '',
  // Freios
  brakeBias: '',
  brakePadFront: '',
  brakePadRear: '',
  // Pneus
  tirePressureFL: '',
  tirePressureFR: '',
  tirePressureRL: '',
  tirePressureRR: '',
  tireCompound: '',
  // Motor
  fuelMap: '',
  ignitionMap: '',
  boostPressure: '',
  // Aero
  frontWing: '',
  rearWing: '',
  // Transmissão
  finalDrive: '',
  diffSetting: '',
  // Notas
  notes: '',
};

const STORAGE_KEY = 'race_telemetry_setups';

function loadSetups() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSetups(setups) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(setups));
  } catch { /* noop */ }
}

function InputField({ label, value, onChange, unit, half }) {
  return (
    <div style={{ flex: half ? '1 1 48%' : '1 1 100%', minWidth: half ? 140 : 280 }}>
      <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            background: COLORS.bg,
            color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
            outline: 'none',
          }}
        />
        {unit && <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.accent, marginBottom: 12, marginTop: 8 }}>
      {children}
    </div>
  );
}

export default function SetupSheetTab() {
  const [setups, setSetups] = useState([]);
  const [current, setCurrent] = useState({ ...EMPTY_SETUP });
  const [saved, setSaved] = useState(false);
  const [viewList, setViewList] = useState(false);

  useEffect(() => {
    setSetups(loadSetups());
  }, []);

  const updateField = (field) => (val) => {
    setCurrent((prev) => ({ ...prev, [field]: val }));
    setSaved(false);
  };

  const handleSave = () => {
    if (!current.track || !current.date) {
      alert('Preencha ao menos Autódromo e Data.');
      return;
    }
    const updated = [...setups, { ...current, id: Date.now() }];
    setSetups(updated);
    saveSetups(updated);
    setSaved(true);
  };

  const handleLoad = (setup) => {
    setCurrent({ ...setup });
    setViewList(false);
  };

  const handleDelete = (id) => {
    const updated = setups.filter((s) => s.id !== id);
    setSetups(updated);
    saveSetups(updated);
  };

  const handleNew = () => {
    setCurrent({ ...EMPTY_SETUP });
    setSaved(false);
  };

  const fieldRow = { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>⚙️</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Setup Sheet</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>Salve e recupere setups por autódromo e data</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setViewList(!viewList)} style={{ ...theme.pillButton(!viewList), padding: '8px 16px' }}>
            📂 Setups Salvos ({setups.length})
          </button>
          <button onClick={handleNew} style={{ ...theme.pillButton(false), padding: '8px 16px' }}>
            ➕ Novo
          </button>
        </div>
      </div>

      {/* Saved setups list */}
      {viewList && (
        <div style={{ ...theme.card, marginBottom: 20 }}>
          <div style={theme.cardTitle}>Setups Salvos</div>
          {setups.length === 0 && (
            <div style={{ color: COLORS.textMuted, fontSize: 13, padding: 20, textAlign: 'center' }}>
              Nenhum setup salvo ainda.
            </div>
          )}
          {setups.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                borderBottom: `1px solid ${COLORS.border}11`,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.track || 'Sem nome'}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                  {s.date} • {s.event} • {s.driver} • {s.car}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleLoad(s)} style={{ ...theme.pillButton(false), fontSize: 11 }}>
                  Carregar
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  style={{ ...theme.pillButton(false), fontSize: 11, borderColor: COLORS.accent, color: COLORS.accent }}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Setup form */}
      <div style={theme.card}>
        <SectionTitle>📍 Evento</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Autódromo" value={current.track} onChange={updateField('track')} />
          <InputField label="Data da Etapa" value={current.date} onChange={updateField('date')} half />
          <InputField label="Etapa / Evento" value={current.event} onChange={updateField('event')} half />
        </div>
        <div style={fieldRow}>
          <InputField label="Piloto" value={current.driver} onChange={updateField('driver')} half />
          <InputField label="Carro" value={current.car} onChange={updateField('car')} half />
        </div>
      </div>

      <div style={theme.card}>
        <SectionTitle>🔩 Suspensão</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Mola Dianteira" value={current.frontSpringRate} onChange={updateField('frontSpringRate')} unit="N/mm" half />
          <InputField label="Mola Traseira" value={current.rearSpringRate} onChange={updateField('rearSpringRate')} unit="N/mm" half />
        </div>
        <div style={fieldRow}>
          <InputField label="Barra Dianteira" value={current.frontBarRate} onChange={updateField('frontBarRate')} half />
          <InputField label="Barra Traseira" value={current.rearBarRate} onChange={updateField('rearBarRate')} half />
        </div>
        <div style={fieldRow}>
          <InputField label="Altura Diant." value={current.frontRideHeight} onChange={updateField('frontRideHeight')} unit="mm" half />
          <InputField label="Altura Tras." value={current.rearRideHeight} onChange={updateField('rearRideHeight')} unit="mm" half />
        </div>
        <div style={fieldRow}>
          <InputField label="Camber Diant." value={current.frontCamber} onChange={updateField('frontCamber')} unit="°" half />
          <InputField label="Camber Tras." value={current.rearCamber} onChange={updateField('rearCamber')} unit="°" half />
        </div>
        <div style={fieldRow}>
          <InputField label="Toe Diant." value={current.frontToe} onChange={updateField('frontToe')} unit="mm" half />
          <InputField label="Toe Tras." value={current.rearToe} onChange={updateField('rearToe')} unit="mm" half />
        </div>
        <div style={fieldRow}>
          <InputField label="Caster" value={current.frontCaster} onChange={updateField('frontCaster')} unit="°" half />
        </div>
      </div>

      <div style={theme.card}>
        <SectionTitle>🛞 Pneus</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Pressão DE" value={current.tirePressureFL} onChange={updateField('tirePressureFL')} unit="psi" half />
          <InputField label="Pressão DD" value={current.tirePressureFR} onChange={updateField('tirePressureFR')} unit="psi" half />
        </div>
        <div style={fieldRow}>
          <InputField label="Pressão TE" value={current.tirePressureRL} onChange={updateField('tirePressureRL')} unit="psi" half />
          <InputField label="Pressão TD" value={current.tirePressureRR} onChange={updateField('tirePressureRR')} unit="psi" half />
        </div>
        <div style={fieldRow}>
          <InputField label="Composto" value={current.tireCompound} onChange={updateField('tireCompound')} half />
        </div>
      </div>

      <div style={theme.card}>
        <SectionTitle>🏎️ Freios / Transmissão</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Bias de Freio" value={current.brakeBias} onChange={updateField('brakeBias')} unit="% frente" half />
          <InputField label="Pastilha Diant." value={current.brakePadFront} onChange={updateField('brakePadFront')} half />
        </div>
        <div style={fieldRow}>
          <InputField label="Pastilha Tras." value={current.brakePadRear} onChange={updateField('brakePadRear')} half />
          <InputField label="Final Drive" value={current.finalDrive} onChange={updateField('finalDrive')} half />
        </div>
        <div style={fieldRow}>
          <InputField label="Diferencial" value={current.diffSetting} onChange={updateField('diffSetting')} half />
        </div>
      </div>

      <div style={theme.card}>
        <SectionTitle>🔥 Motor / Aero</SectionTitle>
        <div style={fieldRow}>
          <InputField label="Mapa Combustível" value={current.fuelMap} onChange={updateField('fuelMap')} half />
          <InputField label="Mapa Ignição" value={current.ignitionMap} onChange={updateField('ignitionMap')} half />
        </div>
        <div style={fieldRow}>
          <InputField label="Boost" value={current.boostPressure} onChange={updateField('boostPressure')} unit="bar" half />
          <InputField label="Asa Dianteira" value={current.frontWing} onChange={updateField('frontWing')} half />
        </div>
        <div style={fieldRow}>
          <InputField label="Asa Traseira" value={current.rearWing} onChange={updateField('rearWing')} half />
        </div>
      </div>

      <div style={theme.card}>
        <SectionTitle>📝 Notas</SectionTitle>
        <textarea
          value={current.notes}
          onChange={(e) => updateField('notes')(e.target.value)}
          rows={4}
          style={{
            width: '100%',
            background: COLORS.bg,
            color: COLORS.textPrimary,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 13,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
          placeholder="Comportamento do carro, mudanças, observações..."
        />
      </div>

      {/* Save button */}
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button
          onClick={handleSave}
          style={{
            padding: '12px 40px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            background: saved ? COLORS.green : COLORS.accent,
            color: '#fff',
            border: 'none',
            transition: 'all 0.3s',
          }}
        >
          {saved ? '✅ Salvo!' : '💾 Salvar Setup'}
        </button>
      </div>
    </div>
  );
}
