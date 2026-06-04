/**
 * entitlements.js — Controle de abas compradas (venda modular).
 *
 * A fonte da verdade é o campo `ent` dentro do certificado RS256 (assinado
 * pelo servidor). O usuário não consegue forjar porque a assinatura quebraria.
 *
 * Regra de acesso (marcador explícito — sem ambiguidade):
 *   - entitlements = ['*']        → ACESSO TOTAL (admin / plano Elite)
 *   - entitlements = ['id1','id2']→ apenas essas abas vendáveis
 *   - entitlements = []  (vazio)  → NENHUMA aba vendável (sem plano ativo)
 *
 * O token '__dev__' dentro da lista libera também as abas "futuras"
 * (Modo Desenvolvedor). As abas estruturais são sempre liberadas.
 */

const ENT_KEY = 'rt_entitlements';

/* Coringa de acesso total e flag de modo desenvolvedor. */
export const ALL_ACCESS = '*';
export const DEV_FLAG   = '__dev__';

/* Abas gratuitas (inclusas no plano base). Agora são controláveis pelo admin
   como qualquer outra: aparecem como checkbox e podem ter o acesso removido.
   Não são mais "sempre liberadas". */
export const FREE_TABS = new Set([
  'overview', 'profiles', 'pilotos', 'pistas', 'calendario',
]);

/* Abas anunciadas como "atualização futura" — visíveis para o cliente
   saber o que vem por aí, porém ainda NÃO disponíveis (bloqueadas, não
   vendidas). O Modo Desenvolvedor (DEV_FLAG) as libera. */
export const COMING_SOON_TABS = new Set([
  'equipe', 'performance', 'estrategia', 'laptime', 'telemetria',
]);

/** true se a aba é uma funcionalidade futura ainda não disponível. */
export function isComingSoon(tabId) {
  return COMING_SOON_TABS.has(tabId);
}

/** Decodifica o payload de um JWT/certificado sem verificar assinatura (só leitura). */
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch { return null; }
}

/** Extrai o array de entitlements de um certificado. Retorna [] se ausente. */
export function parseCertEntitlements(certificate) {
  if (!certificate) return [];
  const payload = decodeJwtPayload(certificate);
  const ent = payload?.ent;
  return Array.isArray(ent) ? ent : [];
}

/** Salva os entitlements vigentes (chamado pelo LicenseGate ao validar sessão). */
export function setEntitlements(arr) {
  try { localStorage.setItem(ENT_KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); }
  catch { /* noop */ }
}

/** Lê os entitlements vigentes. */
export function getEntitlements() {
  try {
    const raw = localStorage.getItem(ENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/** true se a conta tem acesso total (coringa '*'). */
export function hasAllAccess() {
  return getEntitlements().includes(ALL_ACCESS);
}

/** true se o Modo Desenvolvedor está ativo (libera abas futuras). */
export function isDevMode() {
  const ent = getEntitlements();
  return ent.includes(DEV_FLAG) || ent.includes(ALL_ACCESS);
}

/** true se a aba é editável para o usuário atual. */
export function isTabEditable(tabId) {
  const ent = getEntitlements();

  // Modo Desenvolvedor: app 100% acessível, INCLUSIVE as abas futuras.
  // É o único que libera as futuras.
  if (ent.includes(DEV_FLAG)) return true;

  // Abas futuras: bloqueadas para todos os demais — nem o acesso total libera.
  if (COMING_SOON_TABS.has(tabId)) return false;

  // Acesso total (admin / Elite): todas as abas atuais, mas NÃO as futuras.
  if (ent.includes(ALL_ACCESS)) return true;

  // Todas as demais abas (gratuitas e vendáveis) precisam estar
  // explicitamente na lista. Lista vazia = nenhuma aba acessível.
  return ent.includes(tabId);
}

/** true se há restrição de abas ativa (não tem acesso total). */
export function hasTabRestriction() {
  return !hasAllAccess();
}
