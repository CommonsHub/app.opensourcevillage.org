/**
 * Status API
 *
 * GET /api/status
 * Returns server status information including git info, uptime, and service status
 */

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { getPublicKey, nip19 } from 'nostr-tools';
import { privateKeyToAccount } from 'viem/accounts';
import { testRelayConnection } from '@/lib/nostr-server';

const execAsync = promisify(exec);

interface ServiceStatus {
  running: boolean;
  status: string;
  pid?: number;
  logs?: string[];
}

interface GitInfo {
  sha: string;
  shortSha: string;
  message: string;
  date: string;
}

interface ServerInfo {
  timestamp: string;
  uptime: string;
  uptimeSeconds: number;
  loadAverage: number[];
}

interface DataInfo {
  directorySize: string;
  directorySizeBytes: number;
  npubCount: number;
}

interface ServicesInfo {
  paymentProcessor: ServiceStatus;
  nostrListener: ServiceStatus;
  mainApp: ServiceStatus;
}

interface WalletInfo {
  address: string;
  backupAddress: string | null;
  chain: string;
  explorerUrl: string;
}

interface NostrInfo {
  npub: string;
  relays: string[];
  relayStatus: RelayStatus[];
}

interface RelayStatus {
  url: string;
  connected: boolean;
  error?: string;
}

interface StatusInfo {
  git: GitInfo;
  server: ServerInfo;
  data: DataInfo;
  services: ServicesInfo;
  wallet: WalletInfo;
  nostr: NostrInfo;
}

export interface StatusResponse {
  success: boolean;
  status?: StatusInfo;
  error?: string;
}

async function getGitInfo(): Promise<GitInfo> {
  try {
    const [shaResult, messageResult, dateResult] = await Promise.all([
      execAsync('git rev-parse HEAD'),
      execAsync('git log -1 --pretty=%B'),
      execAsync('git log -1 --pretty=%ci'),
    ]);

    const sha = shaResult.stdout.trim();
    return {
      sha,
      shortSha: sha.substring(0, 7),
      message: messageResult.stdout.trim().split('\n')[0], // First line only
      date: dateResult.stdout.trim(),
    };
  } catch {
    return {
      sha: 'unknown',
      shortSha: 'unknown',
      message: 'Unable to read git info',
      date: 'unknown',
    };
  }
}

async function getServerInfo(): Promise<ServerInfo> {
  let uptimeSeconds = 0;
  let uptime = 'unknown';
  let loadAverage: number[] = [0, 0, 0];

  try {
    // Get uptime
    const uptimeResult = await execAsync('cat /proc/uptime');
    uptimeSeconds = Math.floor(parseFloat(uptimeResult.stdout.split(' ')[0]));

    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    uptime = parts.join(' ') || '< 1m';
  } catch {
    // macOS fallback
    try {
      const uptimeResult = await execAsync('uptime');
      uptime = uptimeResult.stdout.trim();
    } catch {
      // Ignore
    }
  }

  try {
    // Get load average
    const loadResult = await execAsync('cat /proc/loadavg');
    const parts = loadResult.stdout.trim().split(' ');
    loadAverage = [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])];
  } catch {
    // macOS fallback
    try {
      const loadResult = await execAsync('sysctl -n vm.loadavg');
      const match = loadResult.stdout.match(/\{ ([\d.]+) ([\d.]+) ([\d.]+) \}/);
      if (match) {
        loadAverage = [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])];
      }
    } catch {
      // Ignore
    }
  }

  return {
    timestamp: new Date().toISOString(),
    uptime,
    uptimeSeconds,
    loadAverage,
  };
}

async function getDataInfo(): Promise<DataInfo> {
  const dataDir = process.env.DATA_DIR || './data';
  let directorySizeBytes = 0;
  let npubCount = 0;

  try {
    // Get directory size
    const duResult = await execAsync(`du -sb ${dataDir} 2>/dev/null || du -sk ${dataDir}`);
    const sizeStr = duResult.stdout.trim().split(/\s+/)[0];
    directorySizeBytes = parseInt(sizeStr, 10);

    // If du -sk was used (macOS), convert from KB to bytes
    if (directorySizeBytes < 1000000 && duResult.stdout.includes('k')) {
      directorySizeBytes *= 1024;
    }
  } catch {
    // Ignore
  }

  try {
    // Count npubs (profiles directory)
    const profilesDir = path.join(dataDir, 'profiles');
    const entries = await fs.readdir(profilesDir, { withFileTypes: true });
    npubCount = entries.filter(e => e.isDirectory() && e.name.startsWith('npub')).length;
  } catch {
    // Try badges directory as fallback
    try {
      const badgesDir = path.join(dataDir, 'badges');
      const entries = await fs.readdir(badgesDir, { withFileTypes: true });
      npubCount = entries.filter(e => e.isDirectory()).length;
    } catch {
      // Ignore
    }
  }

  // Format size
  let directorySize = '0 B';
  if (directorySizeBytes >= 1073741824) {
    directorySize = `${(directorySizeBytes / 1073741824).toFixed(2)} GB`;
  } else if (directorySizeBytes >= 1048576) {
    directorySize = `${(directorySizeBytes / 1048576).toFixed(2)} MB`;
  } else if (directorySizeBytes >= 1024) {
    directorySize = `${(directorySizeBytes / 1024).toFixed(2)} KB`;
  } else if (directorySizeBytes > 0) {
    directorySize = `${directorySizeBytes} B`;
  }

  return {
    directorySize,
    directorySizeBytes,
    npubCount,
  };
}

async function getServiceStatus(serviceName: string): Promise<ServiceStatus> {
  try {
    const result = await execAsync(`systemctl is-active ${serviceName} 2>/dev/null`);
    const status = result.stdout.trim();

    let pid: number | undefined;
    try {
      const pidResult = await execAsync(`systemctl show ${serviceName} --property=MainPID --value`);
      pid = parseInt(pidResult.stdout.trim(), 10);
      if (pid === 0) pid = undefined;
    } catch {
      // Ignore
    }

    // Fetch latest logs (last 20 lines)
    // Note: journalctl may require sudo permissions when running as a service user
    let logs: string[] = [];
    try {
      // Try with sudo first (service user should have NOPASSWD access)
      const logsResult = await execAsync(`sudo journalctl -u ${serviceName} -n 20 --no-pager --output=short 2>/dev/null`);
      logs = logsResult.stdout
        .trim()
        .split('\n')
        .filter(line => line.length > 0);
    } catch {
      // Fallback: try without sudo (might work if user is in systemd-journal group)
      try {
        const logsResult = await execAsync(`journalctl -u ${serviceName} -n 20 --no-pager --output=short 2>/dev/null`);
        logs = logsResult.stdout
          .trim()
          .split('\n')
          .filter(line => line.length > 0);
      } catch {
        // Ignore - logs might not be available
      }
    }

    return {
      running: status === 'active',
      status,
      pid,
      logs,
    };
  } catch {
    return {
      running: false,
      status: 'not installed',
      logs: [],
    };
  }
}

async function getServicesStatus(): Promise<ServicesInfo> {
  const [paymentProcessor, nostrListener, mainApp] = await Promise.all([
    getServiceStatus('osv-payment-processor'),
    getServiceStatus('osv-nostr-listener'),
    getServiceStatus('osv'),
  ]);

  return {
    paymentProcessor,
    nostrListener,
    mainApp,
  };
}

const CHAIN_EXPLORERS: Record<string, string> = {
  gnosis: 'https://gnosisscan.io/address/',
  gnosis_chiado: 'https://gnosis-chiado.blockscout.com/address/',
  base: 'https://basescan.org/address/',
  base_sepolia: 'https://sepolia.basescan.org/address/',
  localhost: 'http://localhost:8545/',
};

function getWalletInfo(): WalletInfo {
  const privateKey = process.env.PRIVATE_KEY;
  const backupPrivateKey = process.env.BACKUP_PRIVATE_KEY;
  const chain = process.env.CHAIN || 'gnosis_chiado';

  let address = '';
  let backupAddress: string | null = null;

  if (privateKey) {
    try {
      const pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      const account = privateKeyToAccount(pk as `0x${string}`);
      address = account.address;
    } catch {
      address = 'invalid private key';
    }
  } else {
    address = 'not configured';
  }

  if (backupPrivateKey) {
    try {
      const pk = backupPrivateKey.startsWith('0x') ? backupPrivateKey : `0x${backupPrivateKey}`;
      const account = privateKeyToAccount(pk as `0x${string}`);
      backupAddress = account.address;
    } catch {
      backupAddress = 'invalid private key';
    }
  }

  const explorerUrl = CHAIN_EXPLORERS[chain] || CHAIN_EXPLORERS.gnosis_chiado;

  return {
    address,
    backupAddress,
    chain,
    explorerUrl,
  };
}

async function checkRelayConnection(url: string): Promise<RelayStatus> {
  const result = await testRelayConnection(url, 5000);
  return {
    url,
    connected: result.success,
    error: result.error,
  };
}

async function getNostrInfo(): Promise<NostrInfo> {
  const nsec = process.env.NOSTR_NSEC;
  const relaysEnv = process.env.NOSTR_RELAYS || '';

  let npub = 'not configured';

  if (nsec) {
    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type === 'nsec') {
        const pubkey = getPublicKey(decoded.data);
        npub = nip19.npubEncode(pubkey);
      }
    } catch {
      npub = 'invalid nsec';
    }
  }

  const relays = relaysEnv
    .split(',')
    .map(r => r.trim())
    .filter(r => r.length > 0);

  // Check relay connections in parallel
  const relayStatus = await Promise.all(relays.map(checkRelayConnection));

  return {
    npub,
    relays,
    relayStatus,
  };
}

export async function GET(): Promise<NextResponse<StatusResponse>> {
  try {
    const [git, server, data, services, nostr] = await Promise.all([
      getGitInfo(),
      getServerInfo(),
      getDataInfo(),
      getServicesStatus(),
      getNostrInfo(),
    ]);

    const wallet = getWalletInfo();

    return NextResponse.json({
      success: true,
      status: {
        git,
        server,
        data,
        services,
        wallet,
        nostr,
      },
    });
  } catch (error) {
    console.error('[API] Status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get status',
      },
      { status: 500 }
    );
  }
}
