/**
 * deploy.cjs — Atualiza o ApexDynamics instalado sem reinstalar.
 * Uso: node scripts/deploy.cjs  (ou npm run deploy)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const ROOT        = path.resolve(__dirname, '..');
const INSTALL_DIR = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'ApexDynamics');
const ASAR_DEST   = path.join(INSTALL_DIR, 'resources', 'app.asar');
const DIST_SRC    = path.join(ROOT, 'dist');
const ELECTRON_SRC= path.join(ROOT, 'electron');
const ASAR_BIN    = path.join(ROOT, 'node_modules', '.bin', 'asar.cmd');
const TEMP_DIR    = path.join(os.tmpdir(), 'apexdynamics-deploy');
const NEW_ASAR    = path.join(os.tmpdir(), 'app-new.asar');

function step(msg) { console.log(`\n▶ ${msg}`); }
function ok(msg)   { console.log(`  ✓ ${msg}`); }

function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// ── 1. Build vite ────────────────────────────────────────────────────────────
step('Buildando frontend (vite)...');
execSync('npm run build:vite', { cwd: ROOT, stdio: 'inherit' });
ok('Build concluído.');

// ── 2. Montar pasta temp ─────────────────────────────────────────────────────
step('Preparando pasta temporária...');
if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

copyDirSync(ELECTRON_SRC, path.join(TEMP_DIR, 'electron'));
ok('electron/ copiado.');
copyDirSync(DIST_SRC, path.join(TEMP_DIR, 'dist'));
ok('dist/ copiado.');
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(TEMP_DIR, 'package.json'));
ok('package.json copiado.');

// ── 3. Empacotar ASAR ───────────────────────────────────────────────────────
step('Empacotando novo app.asar...');
if (fs.existsSync(NEW_ASAR)) fs.unlinkSync(NEW_ASAR);
execSync(`"${ASAR_BIN}" pack "${TEMP_DIR}" "${NEW_ASAR}"`, { stdio: 'inherit' });
ok(`ASAR criado.`);

// ── 4. Substituir no app instalado ──────────────────────────────────────────
step('Substituindo app.asar no app instalado...');
if (!fs.existsSync(path.dirname(ASAR_DEST))) {
  console.error('  ✗ App não encontrado em:', INSTALL_DIR);
  console.error('    Rode npm run build:win primeiro para instalar o app.');
  process.exit(1);
}
fs.copyFileSync(NEW_ASAR, ASAR_DEST);
ok('app.asar atualizado!');

// ── 4b. Copiar icon.ico para resources/ (fora do ASAR, path nativo) ──────────
const ICON_SRC  = path.join(ROOT, 'public', 'icon.ico');
const ICON_DEST = path.join(path.dirname(ASAR_DEST), 'icon.ico');
if (fs.existsSync(ICON_SRC)) {
  fs.copyFileSync(ICON_SRC, ICON_DEST);
  ok('icon.ico copiado para resources/');
}

// ── Limpar ────────────────────────────────────────────────────────────────────
fs.rmSync(TEMP_DIR, { recursive: true });
fs.unlinkSync(NEW_ASAR);

console.log('\n✅ Pronto! Abra o ApexDynamics pelo atalho normalmente.\n');
