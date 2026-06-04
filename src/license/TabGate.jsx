/**
 * TabGate — controla o acesso por aba (venda modular).
 *
 *  • Aba liberada            → renderiza o conteúdo normal.
 *  • Aba não comprada        → mostra um descritivo de vendas (pitch) e, abaixo,
 *                              o conteúdo em somente-leitura (<fieldset disabled>).
 *  • Aba "futura" (em breve) → mostra o descritivo do que está por vir.
 */
import { isTabEditable, isComingSoon } from '@/license/entitlements';
import { getTabCatalog } from '@/license/tabCatalog';
import { useColors } from '@/context/ThemeContext';

const SUPPORT_PHONE    = '(11) 99301-9308';
const SUPPORT_WHATSAPP = 'https://wa.me/5511993019308';

function WhatsAppButton({ label }) {
  return (
    <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer"
       style={{
         display: 'inline-flex', alignItems: 'center', gap: 8,
         padding: '10px 18px', background: '#25D366', borderRadius: 8,
         color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none',
         whiteSpace: 'nowrap',
       }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.519 5.276l-.999 3.648 3.469-.823z"/>
      </svg>
      {label}
    </a>
  );
}

/** Cartão de descritivo/pitch da aba. `variant`: 'locked' | 'soon'. */
function PitchCard({ tabId, variant, COLORS }) {
  const cat = getTabCatalog(tabId);
  const isSoon = variant === 'soon';
  const accent = isSoon ? COLORS.accent : '#e63946';

  return (
    <div style={{
      margin: '14px auto', maxWidth: 760, padding: '26px 28px', borderRadius: 16,
      background: COLORS.bgCard,
      border: `1px solid ${isSoon ? `${COLORS.accent}55` : 'rgba(230,57,70,0.35)'}`,
      boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
    }}>
      {/* Selo de status */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '5px 12px', borderRadius: 20, marginBottom: 14,
        background: `${accent}1a`, border: `1px solid ${accent}55`,
        color: accent, fontSize: 12, fontWeight: 800, letterSpacing: '0.3px',
      }}>
        {isSoon ? '🔜 Em breve — Atualização Futura' : '🔒 Não incluído no seu plano'}
      </div>

      {/* Tagline */}
      {cat?.tagline && (
        <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, lineHeight: 1.3, marginBottom: 12 }}>
          {cat.tagline}
        </div>
      )}

      {/* O que faz */}
      {cat?.what && (
        <p style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.65, marginBottom: 16 }}>
          {cat.what}
        </p>
      )}

      {/* Benefícios */}
      {cat?.benefits?.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: COLORS.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8,
          }}>
            O que sua equipe ganha
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cat.benefits.map((b, i) => (
              <li key={i} style={{ display: 'flex', gap: 9, fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.5 }}>
                <span style={{ color: isSoon ? COLORS.accent : '#25D366', fontWeight: 800, flexShrink: 0 }}>
                  {isSoon ? '★' : '✓'}
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rodapé: preço + ação */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 14, flexWrap: 'wrap', paddingTop: 16, borderTop: `1px solid ${COLORS.border}`,
      }}>
        <div>
          {isSoon ? (
            <div style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>
              Funcionalidade em desenvolvimento. Estará disponível para aquisição
              em uma próxima atualização do ApexDynamics.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Investimento
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
                {cat?.price || 'Sob consulta'}
              </div>
            </>
          )}
        </div>
        {!isSoon && <WhatsAppButton label={`Liberar — ${SUPPORT_PHONE}`} />}
      </div>
    </div>
  );
}

export default function TabGate({ activeTab, children }) {
  const COLORS = useColors();

  if (isTabEditable(activeTab)) return children;

  /* ── Funcionalidade futura (em breve) ────────────────────────────── */
  if (isComingSoon(activeTab)) {
    return <PitchCard tabId={activeTab} variant="soon" COLORS={COLORS} />;
  }

  /* ── Aba não comprada: pitch + conteúdo em somente-leitura ───────── */
  return (
    <div>
      <PitchCard tabId={activeTab} variant="locked" COLORS={COLORS} />
      {/* fieldset disabled desabilita nativamente todos os campos filhos */}
      <fieldset disabled style={{ border: 'none', margin: 0, padding: 0, minWidth: 0, opacity: 0.6 }}>
        {children}
      </fieldset>
    </div>
  );
}
