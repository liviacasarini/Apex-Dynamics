/**
 * cloud.js — Cliente REST da nuvem ApexDynamics para o app mobile (Etapa 5).
 *
 * Substitui a conexão LAN (WebSocket no desktop) pelo modelo 100% nuvem:
 *  - Login com APEX ID (username/senha) → JWT
 *  - Entrada no workspace via join_token (QR) → pendente → aprovação do chefe
 *  - Envio de medições para o Carro escolhido
 *  - Chat e status via REST (polling no contexto)
 *
 * O JWT é guardado em memória e no AsyncStorage ('cloudToken').
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CLOUD_BASE = 'https://api.apexdynamics.store';

let _token = null;

export async function loadToken() {
  if (_token) return _token;
  _token = await AsyncStorage.getItem('cloudToken');
  return _token;
}

export async function setToken(token) {
  _token = token || null;
  if (token) await AsyncStorage.setItem('cloudToken', token);
  else await AsyncStorage.removeItem('cloudToken');
}

export async function clearToken() {
  await setToken(null);
}

/** Request genérico autenticado. Lança Error em falha de rede/HTTP. */
async function request(method, path, body) {
  const token = await loadToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let resp;
  try {
    resp = await fetch(`${CLOUD_BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error('network');
    err.offline = true;
    throw err;
  }

  let data = null;
  try { data = await resp.json(); } catch { /* corpo vazio */ }

  if (resp.status === 401) {
    // Token inválido/expirado — limpa para forçar novo login.
    await clearToken();
    const err = new Error(data?.message || 'unauthorized');
    err.status = 401;
    throw err;
  }
  if (!resp.ok) {
    const err = new Error(data?.message || `HTTP ${resp.status}`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ── Autenticação ──────────────────────────────────────────────── */

/** Login com APEX ID. Persiste o JWT e retorna { token, apexHash, role, teamId }. */
export async function login(username, password, deviceId) {
  const data = await request('POST', '/api/team/mobile/login', { username, password, deviceId });
  if (data?.token) await setToken(data.token);
  return data;
}

/**
 * Cadastro + entrada num passo (Opção C): cria a conta e entra no workspace
 * via join_token. Conta nasce ativa; vínculo nasce 'pending'. Persiste o JWT.
 */
export async function registerAndJoin({ joinToken, username, phone, password, deviceId }) {
  const data = await request('POST', '/api/team/mobile/register-and-join', {
    joinToken, username, phone, password, deviceId,
  });
  if (data?.token) await setToken(data.token);
  return data;
}

/** Registra o Expo/FCM push token do dispositivo no servidor. */
export function registerPushToken(fcmToken) {
  return request('POST', '/api/team/fcm-token', { fcmToken }).catch(() => null);
}

/* ── Workspace / membership ────────────────────────────────────── */

/** Vínculos do usuário (status pending/active) — usado para saber se foi aprovado. */
export function getMe() {
  return request('GET', '/api/team/me');
}

/** Entra no workspace via join_token (QR). Resultado: status 'pending'. */
export function joinWorkspace(joinToken, deviceType = 'mobile', hwid) {
  return request('POST', '/api/team/join', { joinToken, deviceType, hwid });
}

/* ── Carros (Perfis) e medições ────────────────────────────────── */

/** Lista os carros (Perfis) da equipe. */
export function getCars() {
  return request('GET', '/api/team/cars');
}

/** Envia uma medição para o Carro alvo → fila de aprovação dos desktops. */
export function submitMeasurement({ teamId, targetCarId, category, payload }) {
  return request('POST', '/api/team/measurements', { teamId, targetCarId, category, payload });
}

/* ── Chat ──────────────────────────────────────────────────────── */

export function sendChat(content) {
  return request('POST', '/api/team/messages', { content });
}

/** Histórico/novas mensagens. since = ISO opcional para buscar só as novas. */
export function getMessages(since, limit = 50) {
  const q = since ? `?since=${encodeURIComponent(since)}&limit=${limit}` : `?limit=${limit}`;
  return request('GET', `/api/team/messages${q}`);
}

/* ── Emergência ────────────────────────────────────────────────── */

export function triggerEmergency(reason) {
  return request('POST', '/api/team/emergency', { reason });
}
