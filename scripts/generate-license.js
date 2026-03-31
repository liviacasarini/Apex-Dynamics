#!/usr/bin/env node
/**
 * generate-license.js
 *
 * CLI para gerar chaves de licença HMAC-SHA256.
 *
 * Uso:
 *   node scripts/generate-license.js --days 365
 *   node scripts/generate-license.js --days 30 --customer "João Silva"
 *
 * Requer:
 *   - Node.js 18+ (Web Crypto API nativa)
 *   - Variável HMAC_SECRET no .env ou como variável de ambiente
 *
 * IMPORTANTE: Este script NÃO é incluído no bundle de produção.
 *             Guarde-o em local seguro — é a ferramenta do admin.
 */

import { webcrypto } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ─── Carregar .env ───────────────────────────────────────────────────── */

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env');
  if (!existsSync(envPath)) return {};

  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const envVars = loadEnv();
const HMAC_SECRET = process.env.HMAC_SECRET || envVars.HMAC_SECRET || 'apex-rt-2025-hmac-verify-key';

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function strToBuffer(str) {
  return new TextEncoder().encode(str);
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSign(message) {
  const key = await webcrypto.subtle.importKey(
    'raw',
    strToBuffer(HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await webcrypto.subtle.sign('HMAC', key, strToBuffer(message));
  return bufToHex(sig);
}

/* ─── Gerador de Chave ────────────────────────────────────────────────── */

async function generateLicenseKey(daysValid) {
  const now = Date.now();
  const expiresAt = new Date(now + daysValid * 24 * 60 * 60 * 1000);

  // Payload: timestamp de expiração em base36, padded para 10 chars
  const payload = expiresAt.getTime().toString(36).toUpperCase().padStart(10, '0');
  const seg1 = payload.slice(0, 5);
  const seg2 = payload.slice(5, 10);

  // Assinatura HMAC-SHA256 sobre "APEX-{payload}"
  const message = `APEX-${payload}`;
  const fullSig = await hmacSign(message);

  // Primeiros 10 chars hex da assinatura → base36 → 10 chars
  const sigPrefix = fullSig.slice(0, 10);
  const sigNum = parseInt(sigPrefix, 16);
  const sigEncoded = sigNum.toString(36).toUpperCase().padStart(10, '0').slice(0, 10);
  const seg3 = sigEncoded.slice(0, 5);
  const seg4 = sigEncoded.slice(5, 10);

  const key = `APEX-${seg1}-${seg2}-${seg3}-${seg4}`;

  return {
    key,
    expiresAt: expiresAt.toISOString(),
    daysValid,
    generatedAt: new Date(now).toISOString(),
  };
}

/* ─── CLI ─────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);

  // Parse --days
  let days = 365;
  const daysIdx = args.indexOf('--days');
  if (daysIdx !== -1 && args[daysIdx + 1]) {
    days = parseInt(args[daysIdx + 1], 10);
    if (isNaN(days) || days <= 0) {
      console.error('Erro: --days deve ser um número positivo');
      process.exit(1);
    }
  }

  // Parse --customer
  let customer = null;
  const custIdx = args.indexOf('--customer');
  if (custIdx !== -1 && args[custIdx + 1]) {
    customer = args[custIdx + 1];
  }

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║       APEX RACE TELEMETRY — LICENSE GENERATOR   ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const result = await generateLicenseKey(days);

  console.log(`  Chave:      ${result.key}`);
  console.log(`  Expira em:  ${result.expiresAt}`);
  console.log(`  Válida por: ${result.daysValid} dias`);
  console.log(`  Gerada em:  ${result.generatedAt}`);
  if (customer) {
    console.log(`  Cliente:    ${customer}`);
  }
  console.log(`  Secret:     ${HMAC_SECRET.slice(0, 8)}...`);
  console.log('');
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
