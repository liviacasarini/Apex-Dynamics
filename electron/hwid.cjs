/**
 * ApexIdentityManager — Hardware ID Generator
 *
 * Gera um identificador único e determinístico do hardware da máquina.
 *
 * Combina múltiplos identificadores do sistema:
 *  • Windows : Motherboard UUID + CPU ProcessorId + Disk Serial
 *  • macOS   : IOPlatformSerialNumber + IOPlatformUUID
 *  • Linux   : /etc/machine-id + product_uuid
 *
 * Fallback: hostname + CPU model + MAC address
 *
 * O resultado é um SHA-256 hex de todos os componentes concatenados.
 * O mesmo hardware sempre gera o mesmo HWID.
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');

const EXEC_OPTS = { encoding: 'utf8', timeout: 8000, windowsHide: true };

/**
 * Extrai a primeira linha "útil" (não-vazia, sem o header) de uma saída WMIC.
 */
function wmicValue(cmd) {
  try {
    const raw = execSync(cmd, EXEC_OPTS);
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    // Primeira linha é o header; segunda é o valor
    return lines.length > 1 ? lines[1] : null;
  } catch {
    return null;
  }
}

/**
 * Coleta identificadores no Windows.
 */
function collectWindows() {
  const parts = [];

  // 1. Motherboard UUID (mais confiável)
  const uuid = wmicValue('wmic csproduct get UUID');
  if (uuid && !uuid.toLowerCase().includes('uuid')) parts.push('MB:' + uuid);

  // 2. CPU Processor ID
  const cpuId = wmicValue('wmic cpu get ProcessorId');
  if (cpuId && !cpuId.toLowerCase().includes('processorid')) parts.push('CPU:' + cpuId);

  // 3. Disk Serial Number (primeiro disco)
  const disk = wmicValue('wmic diskdrive get SerialNumber');
  if (disk && !disk.toLowerCase().includes('serial')) parts.push('DISK:' + disk);

  // 4. BIOS Serial (redundância)
  const bios = wmicValue('wmic bios get SerialNumber');
  if (bios && !bios.toLowerCase().includes('serial') && bios !== 'To Be Filled By O.E.M.') {
    parts.push('BIOS:' + bios);
  }

  return parts;
}

/**
 * Coleta identificadores no macOS.
 */
function collectDarwin() {
  const parts = [];

  try {
    const serial = execSync(
      "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformSerialNumber/ { print $3 }'",
      EXEC_OPTS,
    ).replace(/"/g, '').trim();
    if (serial) parts.push('SERIAL:' + serial);
  } catch {}

  try {
    const uuid = execSync(
      "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { print $3 }'",
      EXEC_OPTS,
    ).replace(/"/g, '').trim();
    if (uuid) parts.push('UUID:' + uuid);
  } catch {}

  return parts;
}

/**
 * Coleta identificadores no Linux.
 */
function collectLinux() {
  const parts = [];
  const fs = require('fs');

  try {
    const mid = fs.readFileSync('/etc/machine-id', 'utf8').trim();
    if (mid) parts.push('MID:' + mid);
  } catch {}

  try {
    const uuid = execSync('cat /sys/class/dmi/id/product_uuid 2>/dev/null', EXEC_OPTS).trim();
    if (uuid) parts.push('UUID:' + uuid);
  } catch {}

  return parts;
}

/**
 * Fallback universal: hostname + CPU model + MAC address.
 */
function collectFallback() {
  const parts = [];

  parts.push('HOST:' + os.hostname());

  const cpus = os.cpus();
  if (cpus.length) parts.push('CPUMODEL:' + cpus[0].model);

  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
        parts.push('MAC:' + iface.mac);
        return parts; // um MAC basta
      }
    }
  }

  return parts;
}

/* ── Cache para evitar re-execução ─────────────────────────── */
let _cached = null;

/**
 * Retorna o HWID como string hex SHA-256 (64 chars).
 * O resultado é cacheado em memória durante a execução do processo.
 */
async function getHWID() {
  if (_cached) return _cached;

  let components;

  switch (process.platform) {
    case 'win32':  components = collectWindows(); break;
    case 'darwin': components = collectDarwin();  break;
    default:       components = collectLinux();   break;
  }

  /* Se os coletores específicos falharem, usa fallback */
  if (!components.length) components = collectFallback();

  /* Ordena para determinismo, concatena e gera hash */
  const raw = components.sort().join('|');
  _cached = crypto.createHash('sha256').update(raw).digest('hex');

  return _cached;
}

module.exports = { getHWID };
