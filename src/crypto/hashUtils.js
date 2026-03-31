/**
 * hashUtils.js
 *
 * Utilitários de hash SHA-256 para verificação de integridade de dados.
 * Usa a Web Crypto API nativa (crypto.subtle) — sem dependências externas.
 *
 * API:
 *   generateHash(text)               → Promise<string>   (hex SHA-256)
 *   verifyHash(text, expectedHash)   → Promise<boolean>
 */

/**
 * Gera um hash SHA-256 hexadecimal de uma string de texto.
 * @param {string} text — texto a ser hashado
 * @returns {Promise<string>} — hash hexadecimal de 64 caracteres
 */
export async function generateHash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifica se o hash SHA-256 de um texto corresponde ao hash esperado.
 * @param {string} text         — texto a verificar
 * @param {string} expectedHash — hash esperado (hex)
 * @returns {Promise<boolean>}  — true se corresponde
 */
export async function verifyHash(text, expectedHash) {
  if (!expectedHash) return true; // sem hash = dados antigos, assume ok
  const currentHash = await generateHash(text);
  return currentHash === expectedHash;
}
