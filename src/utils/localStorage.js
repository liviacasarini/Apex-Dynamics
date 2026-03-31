/**
 * localStorage.js — Wrappers seguros para leitura/escrita em localStorage.
 *
 * Encapsulam JSON.parse/stringify com try/catch para evitar crashes
 * quando o localStorage contém dados corrompidos ou está indisponível.
 */

/**
 * Lê e parseia JSON do localStorage.
 * @param {string} key — chave do localStorage
 * @param {*} fallback — valor retornado em caso de erro ou chave inexistente
 * @returns {*} — o valor parseado ou o fallback
 */
export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Serializa e salva um valor como JSON no localStorage.
 * @param {string} key — chave do localStorage
 * @param {*} value — valor a ser serializado e salvo
 */
export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently fail (e.g., quota exceeded)
  }
}
