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

/* Cópia AUTORITATIVA em memória, definida apenas a partir de um certificado
 * RS256 já verificado pelo processo principal (assinatura conferida com a chave
 * pública embutida). Uma vez definida nesta sessão, ela tem prioridade sobre o
 * localStorage — assim, editar `rt_entitlements` no localStorage (ex.: via
 * DevTools) NÃO concede acesso a abas não compradas. O LicenseGate chama
 * setEntitlements com o cert verificado ANTES de renderizar o app, então o
 * valor adulterado é sobrescrito em memória a cada abertura. */
let _runtimeEnt = null;

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

/** Salva os entitlements vigentes (chamado pelo LicenseGate ao validar sessão).
 *  Define a cópia autoritativa em memória e persiste no localStorage (a memória
 *  é a fonte de verdade durante a sessão; o localStorage é só persistência). */
export function setEntitlements(arr) {
  const safe = Array.isArray(arr) ? arr : [];
  _runtimeEnt = safe;
  try { localStorage.setItem(ENT_KEY, JSON.stringify(safe)); }
  catch { /* noop */ }
}

/** Lê os entitlements vigentes. Prioriza a cópia em memória (derivada do cert
 *  verificado nesta sessão); só recorre ao localStorage antes do LicenseGate
 *  ter validado o certificado (janela em que nenhuma aba paga é renderizada). */
export function getEntitlements() {
  if (_runtimeEnt !== null) return _runtimeEnt;
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

/* ── Workspace config ───────────────────────────────────────────────── */

const WSC_KEY = 'rt_workspace_config';
let _runtimeWsc = undefined; // undefined = ainda não inicializado

/** Extrai workspace config do certificado RS256. */
export function parseCertWorkspaceConfig(certificate) {
  if (!certificate) return null;
  try {
    const part = certificate.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.wsc ?? null;
  } catch { return null; }
}

/** Salva a workspace config (chamado pelo LicenseGate). */
export function setWorkspaceConfig(cfg) {
  _runtimeWsc = cfg ?? null;
  try { localStorage.setItem(WSC_KEY, JSON.stringify(_runtimeWsc)); } catch { /* noop */ }
}

/** Lê a workspace config vigente. null = sem restrição. */
export function getWorkspaceConfig() {
  if (_runtimeWsc !== undefined) return _runtimeWsc;
  try {
    const raw = localStorage.getItem(WSC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Máximo de workspaces permitidos. null = ilimitado. */
export function getMaxWorkspaces() {
  return getWorkspaceConfig()?.max ?? null;
}

/** Tipos de veículo permitidos. null = todos. */
export function getAllowedVehicleTypes() {
  const types = getWorkspaceConfig()?.types;
  return Array.isArray(types) && types.length > 0 ? types : null;
}

/** Máximo de perfis por workspace permitidos. null = ilimitado. */
export function getMaxProfiles() {
  return getWorkspaceConfig()?.mpc ?? null;
}
