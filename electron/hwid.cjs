/**
 * ApexDynamics — Hardware ID Generator
 *
 * Gera um identificador único e determinístico do hardware da máquina.
 *
 * Combina identificadores ESTÁVEIS do sistema:
 *  • Windows : MachineGuid (registro) — único por instalação do Windows,
 *              sempre disponível, muda só ao reinstalar o SO. Fallback:
 *              UUID da placa-mãe via CIM (substituto moderno do wmic).
 *  • macOS   : IOPlatformSerialNumber + IOPlatformUUID
 *  • Linux   : /etc/machine-id + product_uuid
 *
 * Fallback universal: hostname + modelo de CPU (NÃO usa MAC — endereço de
 * rede muda com Wi-Fi/cabo/VPN e causaria HWID instável → lockout indevido).
 *
 * O resultado é um SHA-256 hex de todos os componentes concatenados.
 * O mesmo hardware sempre gera o mesmo HWID.
 *
 * NOTA: o Windows 11 removeu o `wmic`; por isso o coletor Windows usa
 * `reg query` (MachineGuid) e `Get-CimInstance` em vez de `wmic`.
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');

const EXEC_OPTS = { encoding: 'utf8', timeout: 8000, windowsHide: true };

/**
 * Lê um valor do registro do Windows via reg.exe (sempre presente, instantâneo).
 * Retorna o valor (string) ou null.
 */
function regQuery(key, value) {
  try {
    const raw = execSync(`reg query "${key}" /v ${value}`, EXEC_OPTS);
    // Linha: "    MachineGuid    REG_SZ    a1b2c3d4-...."
    const m = raw.match(new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`, 'i'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Executa uma expressão PowerShell e retorna a saída (trim) ou null.
 */
function psQuery(expr) {
  try {
    const raw = execSync(
      `powershell -NoProfile -NonInteractive -Command "${expr}"`,
      EXEC_OPTS,
    );
    const v = raw.trim();
    return v || null;
  } catch {
    return null;
  }
}

/** UUID inválido reportado por alguns BIOS (tudo zero ou tudo F). */
function isBogusUuid(u) {
  const h = (u || '').replace(/[-\s]/g, '').toLowerCase();
  return !h || /^0+$/.test(h) || /^f+$/.test(h);
}

/**
 * Coleta identificadores no Windows (Win11-compatível, sem wmic).
 * Prioriza o MachineGuid — estabilíssimo e sempre disponível.
 */
function collectWindows() {
  // 1. MachineGuid do registro — identificador estável por instalação do SO.
  const guid = regQuery('HKLM\\SOFTWARE\\Microsoft\\Cryptography', 'MachineGuid');
  if (guid) return ['MGUID:' + guid];

  // 2. Fallback: UUID da placa-mãe via CIM (substituto do wmic).
  const uuid = psQuery('(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID');
  if (uuid && !isBogusUuid(uuid)) return ['MB:' + uuid];

  // 3. Sem identificadores estáveis → cai no fallback universal.
  return [];
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
 * Fallback universal: hostname + modelo de CPU.
 * NÃO usa MAC — endereço de rede muda (Wi-Fi/cabo/VPN/adaptador USB) e
 * tornaria o HWID instável, trancando usuários legítimos para fora.
 */
function collectFallback() {
  const parts = [];

  parts.push('HOST:' + os.hostname());

  const cpus = os.cpus();
  if (cpus.length) parts.push('CPUMODEL:' + cpus[0].model);

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
