#!/usr/bin/env node
/**
 * build-secure.cjs — Build de produção com proteção de código.
 *
 * Fluxo:
 *   1. Builda o frontend (vite).
 *   2. Faz BACKUP dos arquivos electron/*.cjs.
 *   3. Ofusca cada .cjs in-place com javascript-obfuscator.
 *   4. Roda electron-builder (--win) → os .cjs empacotados ficam ofuscados.
 *   5. SEMPRE restaura os originais (finally), mesmo em caso de erro.
 *
 * Por que ofuscar SÓ os electron/*.cjs?
 *   - O renderer (dist/) já é minificado pelo Vite/terser.
 *   - Os .cjs (main, preload, hwid) é que continham lógica de licença/HWID
 *     legível dentro do app.asar. Ofuscar eleva muito a barreira de bypass.
 *
 * Uso:  npm run build:win:secure              (gera instalador local)
 *       npm run release:win:secure            (ofusca + publica no GitHub)
 *
 * A flag --publish faz o electron-builder subir a release (--publish always),
 * exigindo a env GH_TOKEN. Sem a flag, só gera o instalador em release/.
 *
 * IMPORTANTE: NÃO é proteção absoluta (Electron sempre é JS na máquina do
 * cliente), mas transforma "copiar e colar" em horas de engenharia reversa.
 * A proteção real do negócio vem das verificações server-side.
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const ELECTRON_DIR = path.join(ROOT, 'electron');
const BACKUP_DIR   = path.join(ROOT, '.electron-src-backup');

// Arquivos a ofuscar (apenas o que vai dentro do asar e roda em Node/Electron)
const TARGETS = ['main.cjs', 'preload.cjs', 'hwid.cjs'];

function step(msg) { console.log(`\n▶ ${msg}`); }
function ok(msg)   { console.log(`  ✓ ${msg}`); }

/* Opções de ofuscação CONSERVADORAS — fortes o bastante para dificultar,
 * leves o bastante para não quebrar o runtime do Electron/Node.
 * (controlFlowFlattening e selfDefending desligados por estabilidade.) */
const OBFUSCATOR_OPTIONS = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,            // NÃO renomear globais (require, module, etc.)
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  splitStrings: true,
  splitStringsChunkLength: 8,
  numbersToExpressions: true,
  simplify: true,
  deadCodeInjection: false,
  controlFlowFlattening: false,    // pode degradar performance/estabilidade
  selfDefending: false,            // incompatível com alguns empacotadores
  disableConsoleOutput: false,     // manter logs p/ diagnóstico em produção
  target: 'node',
};

function loadObfuscator() {
  try {
    return require('javascript-obfuscator');
  } catch {
    console.error('\n✗ Dependência ausente: javascript-obfuscator');
    console.error('  Rode:  npm install --save-dev javascript-obfuscator\n');
    process.exit(1);
  }
}

function backupOriginals() {
  if (fs.existsSync(BACKUP_DIR)) fs.rmSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  for (const file of TARGETS) {
    const src = path.join(ELECTRON_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(BACKUP_DIR, file));
    }
  }
}

function restoreOriginals() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  for (const file of TARGETS) {
    const bak = path.join(BACKUP_DIR, file);
    if (fs.existsSync(bak)) {
      fs.copyFileSync(bak, path.join(ELECTRON_DIR, file));
    }
  }
  fs.rmSync(BACKUP_DIR, { recursive: true });
}

function obfuscateInPlace(obfuscator) {
  for (const file of TARGETS) {
    const target = path.join(ELECTRON_DIR, file);
    if (!fs.existsSync(target)) { console.warn(`  ⚠ ${file} não encontrado, pulando`); continue; }
    const source = fs.readFileSync(target, 'utf8');
    const result = obfuscator.obfuscate(source, OBFUSCATOR_OPTIONS).getObfuscatedCode();
    fs.writeFileSync(target, result, 'utf8');
    ok(`${file} ofuscado (${source.length} → ${result.length} bytes)`);
  }
}

function main() {
  const obfuscator = loadObfuscator();
  const publish = process.argv.includes('--publish');

  step('Buildando frontend (vite)...');
  execSync('npm run build:vite', { cwd: ROOT, stdio: 'inherit' });
  ok('Frontend pronto.');

  step('Backup dos electron/*.cjs originais...');
  backupOriginals();
  ok(`Backup em ${path.relative(ROOT, BACKUP_DIR)}`);

  try {
    step('Ofuscando electron/*.cjs...');
    obfuscateInPlace(obfuscator);

    const builderCmd = publish
      ? 'electron-builder --win --publish always'
      : 'electron-builder --win';
    step(`Empacotando instalador (${builderCmd})...`);
    execSync(builderCmd, { cwd: ROOT, stdio: 'inherit' });
    ok(publish ? 'Instalador gerado e publicado no GitHub.' : 'Instalador gerado em release/');
  } finally {
    step('Restaurando electron/*.cjs originais...');
    restoreOriginals();
    ok('Fontes originais restaurados.');
  }

  console.log('\n✅ Build seguro concluído. Os .cjs dentro do app.asar estão ofuscados.\n');
}

try {
  main();
} catch (err) {
  console.error('\n✗ Falha no build seguro:', err.message);
  // Garante restauração mesmo se algo explodir fora do try interno
  try { restoreOriginals(); } catch {}
  process.exit(1);
}
