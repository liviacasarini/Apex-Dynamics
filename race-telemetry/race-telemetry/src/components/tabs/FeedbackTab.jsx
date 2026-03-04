import { COLORS, SEVERITY_COLORS } from '@/constants/colors';
import { DRIVING_TIPS } from '@/utils/feedbackGenerator';
import { theme } from '@/styles/theme';

export default function FeedbackTab({ feedback, bestLapNum, lapsAnalysis }) {
  if (!feedback?.length) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ ...theme.card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
          <div style={{ fontSize: 16, color: COLORS.textSecondary }}>
            Sem dados suficientes para gerar feedback (mínimo 2 voltas válidas)
          </div>
        </div>
      </div>
    );
  }

  const sevIcon = { high: '🔴', medium: '🟡', low: '🔵' };

  return (
    <div style={{ padding: 24 }}>
      {/* Summary header */}
      <div
        style={{
          ...theme.card,
          background: 'linear-gradient(135deg, #12121a, #0f1a15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>🏁</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Feedback do Piloto</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>
              Referência: Volta {bestLapNum} (
              {lapsAnalysis[bestLapNum]?.lapTime.toFixed(3)}s) — melhor tempo da sessão
            </div>
          </div>
        </div>
        <div
          style={{
            padding: '12px 16px',
            background: `${COLORS.green}10`,
            borderRadius: 8,
            border: `1px solid ${COLORS.green}30`,
          }}
        >
          <div style={{ fontSize: 13, color: COLORS.green, fontWeight: 600, marginBottom: 4 }}>
            📊 Análise Completa
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
            {feedback.length} volta(s) analisada(s) com oportunidades de melhoria.
            Os pontos abaixo mostram onde tempo foi perdido e possíveis causas.
          </div>
        </div>
      </div>

      {/* Per-lap feedback cards */}
      {feedback.map((fb) => (
        <div
          key={fb.lapNum}
          style={{
            ...theme.card,
            borderLeft: `3px solid ${COLORS.accent}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              Volta {fb.lapNum}
              <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 8 }}>
                ({lapsAnalysis[fb.lapNum]?.lapTime.toFixed(3)}s)
              </span>
            </div>
            <span style={theme.badge(COLORS.accent)}>+{fb.timeDiff}s vs melhor</span>
          </div>

          {fb.items.map((item, i) => (
            <div
              key={i}
              style={{
                padding: '12px 16px',
                marginBottom: 8,
                borderRadius: 8,
                background: `${SEVERITY_COLORS[item.severity]}08`,
                border: `1px solid ${SEVERITY_COLORS[item.severity]}20`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: SEVERITY_COLORS[item.severity],
                  }}
                >
                  {sevIcon[item.severity]} {item.area}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent }}>
                  {item.estimatedLoss}
                </div>
              </div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>
                {item.detail}
              </div>
              <div style={{ fontSize: 12, color: COLORS.green, fontStyle: 'italic' }}>
                💡 {item.suggestion}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* General driving tips */}
      <div
        style={{
          ...theme.card,
          background: `${COLORS.purple}08`,
          border: `1px solid ${COLORS.purple}30`,
        }}
      >
        <div style={theme.cardTitle}>🎓 Dicas Gerais de Pilotagem</div>
        {DRIVING_TIPS.map((t, i) => (
          <div
            key={i}
            style={{
              marginBottom: 10,
              padding: '8px 12px',
              background: `${COLORS.purple}05`,
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.purple, marginBottom: 2 }}>
              {t.title}
            </div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{t.tip}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
