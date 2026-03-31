/**
 * embed-icon.cjs — Hook afterPack do electron-builder
 * Embute icon.ico no ApexDynamics.exe ANTES de criar o instalador NSIS
 */
const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const CACHE = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign');

function findRcedit() {
  if (!fs.existsSync(CACHE)) return null;
  for (const dir of fs.readdirSync(CACHE).sort().reverse()) {
    const candidate = path.join(CACHE, dir, 'rcedit-x64.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Chamado como hook afterPack pelo electron-builder
async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exe = path.join(context.appOutDir, 'ApexDynamics.exe');
  const ico = path.join(context.packager.projectDir, 'public', 'icon.ico');

  if (!fs.existsSync(exe)) { console.warn('  ⚠ exe não encontrado:', exe); return; }
  if (!fs.existsSync(ico)) { console.warn('  ⚠ icon.ico não encontrado:', ico); return; }

  const rcedit = findRcedit();
  if (!rcedit) { console.warn('  ⚠ rcedit não encontrado no cache'); return; }

  console.log('  ▶ Embutindo ícone no exe...');
  execSync(`"${rcedit}" "${exe}" --set-icon "${ico}"`, { stdio: 'inherit' });
  console.log('  ✓ Ícone embutido!');
}

module.exports = afterPack;
