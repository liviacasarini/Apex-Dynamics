/**
 * sessionStore.js
 *
 * Helpers para armazenar e recuperar o texto bruto de arquivos CSV
 * usando IndexedDB — evita o limite de ~5 MB do localStorage.
 *
 * Inclui verificação de integridade via SHA-256 (hashUtils.js).
 *
 * API:
 *   saveCSV(id, csvText)  → Promise<{ hash: string }>
 *   loadCSV(id)           → Promise<{ csvText, hash, verified } | null>
 *   deleteCSV(id)         → Promise<void>
 *   verifyCSV(id)         → Promise<{ verified, hash, currentHash } | null>
 */

import { generateHash, verifyHash } from '@/crypto/hashUtils';

const DB_NAME    = 'rt_sessions_db';
const DB_VERSION = 1;
const STORE      = 'csv_files';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Salva (ou substitui) o texto CSV com a chave `id`.
 * Gera um hash SHA-256 do conteúdo para verificação de integridade.
 * @returns {Promise<{ hash: string }>} — o hash gerado
 */
export async function saveCSV(id, csvText) {
  const hash = await generateHash(csvText);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put({
      id,
      csvText,
      hash,
      savedAt: new Date().toISOString(),
    });
    req.onsuccess = () => resolve({ hash });
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Carrega o texto CSV pela chave `id`.
 * Verifica integridade comparando o hash armazenado com o recalculado.
 * @returns {Promise<{ csvText: string, hash: string|null, verified: boolean } | null>}
 *   - `verified`: true se hash confere ou se não existe hash (dados antigos)
 *   - `null` se o registro não foi encontrado
 */
export async function loadCSV(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = async (e) => {
      const record = e.target.result;
      if (!record) { resolve(null); return; }

      // Compatibilidade: registros antigos têm apenas { id, csvText }
      const csvText = record.csvText ?? null;
      if (!csvText) { resolve(null); return; }

      const storedHash = record.hash ?? null;
      const verified = await verifyHash(csvText, storedHash);

      if (!verified) {
        console.warn(`[sessionStore] Hash mismatch for record "${id}" — dados possivelmente corrompidos.`);
      }

      resolve({ csvText, hash: storedHash, verified });
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Verifica a integridade de um registro sem retornar todo o conteúdo.
 * @returns {Promise<{ verified: boolean, hash: string|null, currentHash: string } | null>}
 */
export async function verifyCSV(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = async (e) => {
      const record = e.target.result;
      if (!record?.csvText) { resolve(null); return; }

      const storedHash = record.hash ?? null;
      const currentHash = await generateHash(record.csvText);
      const verified = storedHash ? currentHash === storedHash : true;

      resolve({ verified, hash: storedHash, currentHash });
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/** Remove o texto CSV pela chave `id`. */
export async function deleteCSV(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}
