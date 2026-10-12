/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DEFAULT_DAEMON_URL = process.env.LOCALHOST_ENGINE_URL || 'http://127.0.0.1:4848';

export async function runCli(args: string[]): Promise<void> {
  const command = args[0] || 'help';

  switch (command) {
    case 'status':
      await handleStatus();
      break;
    case 'run':
    case 'deploy':
      await handleDeploy(args.slice(1));
      break;
    case 'logs':
      await handleLogs(args.slice(1));
      break;
    case 'kill-all':
    case 'stop-all':
      await handleKillAll();
      break;
    case 'service':
    case 'daemon':
      await handleDaemon(args.slice(1));
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      break;
  }
}

async function handleStatus(): Promise<void> {
  try {
    const res = await fetch(`${DEFAULT_DAEMON_URL}/api/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    console.log('\n===============================================================');
    console.log(`  LocalHost Engine Daemon  v${data.engineVersion}  [${data.status.toUpperCase()}]`);
    console.log('===============================================================');
    console.log(`Interface: ${data.listeningInterface}:${data.gatewayPort} | RAM: ${data.memoryUsageMb.heapUsed}MB | CPU: ${data.cpuLoadPercent}%`);
    console.log(`Active Projects: ${data.activeProjectsCount} / ${data.totalProjectsCount} | Uptime: ${data.uptimeSeconds}s\n`);

    if (data.projects.length === 0) {
      console.log('No active projects registered.');
      return;
    }

    console.log('---------------------------------------------------------------------------------------------------------');
    console.log('| ID               | NAME                 | PORT  | STATUS   | INGRESS          | PUBLIC URL');
    console.log('---------------------------------------------------------------------------------------------------------');
    for (const p of data.projects) {
      const id = p.id.padEnd(16).slice(0, 16);
      const name = p.name.padEnd(20).slice(0, 20);
      const port = String(p.port).padEnd(5);
      const status = p.status.toUpperCase().padEnd(8);
      const mode = p.activeIngress.mode.padEnd(16).slice(0, 16);
      const url = p.activeIngress.publicUrl || 'none';
      console.log(`| ${id} | ${name} | ${port} | ${status} | ${mode} | ${url}`);
    }
    console.log('---------------------------------------------------------------------------------------------------------\n');
  } catch (err: any) {
    console.error(`\x1b[31m[Error] Could not connect to LocalHost Engine daemon at ${DEFAULT_DAEMON_URL}: ${err.message}\x1b[0m`);
    console.log('Tip: Ensure the engine is running (`npm run dev` or `localhost daemon start`).');
  }
}

async function handleDeploy(subArgs: string[]): Promise<void> {
  const path = subArgs[0];
  if (!path) {
    console.error('\x1b[31mError: Path required. Usage: localhost run <path> [--ingress=mode]\x1b[0m');
    return;
  }

  let ingress = 'cloudflare_quick';
  let name: string | undefined;

  for (const arg of subArgs.slice(1)) {
    if (arg.startsWith('--ingress=')) {
      ingress = arg.split('=')[1];
    } else if (arg.startsWith('--name=')) {
      name = arg.split('=')[1];
    }
  }

  console.log(`\x1b[36m[LocalHost Engine CLI] Deploying repository: ${path} (Ingress: ${ingress})...\x1b[0m`);

  try {
    const res = await fetch(`${DEFAULT_DAEMON_URL}/api/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, ingressMode: ingress, name }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Deployment error');

    console.log('\n\x1b[32m[Success] Microservice launched!\x1b[0m');
    console.log(`  Project ID : ${data.projectId}`);
    console.log(`  Local Port : 127.0.0.1:${data.port}`);
    console.log(`  Public URL : \x1b[1m\x1b[34m${data.publicUrl}\x1b[0m`);
    console.log(`  Ingress    : ${data.ingressMode}\n`);
  } catch (err: any) {
    console.error(`\x1b[31m[Deploy Failed] ${err.message}\x1b[0m`);
  }
}

async function handleLogs(subArgs: string[]): Promise<void> {
  const id = subArgs[0];
  if (!id) {
    console.error('\x1b[31mError: Project ID required. Usage: localhost logs <projectId>\x1b[0m');
    return;
  }

  try {
    const res = await fetch(`${DEFAULT_DAEMON_URL}/api/projects/${id}/logs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    console.log(`\n--- Logs for ${id} (${data.logs.length} entries) ---`);
    for (const log of data.logs) {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const color = log.stream === 'stderr' ? '\x1b[31m' : log.stream === 'system' ? '\x1b[36m' : '\x1b[32m';
      console.log(`\x1b[90m[${time}]\x1b[0m ${color}[${log.stream.toUpperCase()}]\x1b[0m ${log.message}`);
    }
    console.log('--- End of logs ---\n');
  } catch (err: any) {
    console.error(`\x1b[31m[Logs Error] ${err.message}\x1b[0m`);
  }
}

async function handleKillAll(): Promise<void> {
  try {
    const res = await fetch(`${DEFAULT_DAEMON_URL}/api/kill-all`, { method: 'POST' });
    const data = await res.json();
    console.log(`\x1b[33m[Emergency Killswitch] ${data.message}\x1b[0m`);
  } catch (err: any) {
    console.error(`\x1b[31m[Kill-All Error] ${err.message}\x1b[0m`);
  }
}

async function handleDaemon(subArgs: string[]): Promise<void> {
  const action = subArgs[0] || 'status';

  if (action === 'install') {
    const res = await fetch(`${DEFAULT_DAEMON_URL}/api/daemon/install`, { method: 'POST' });
    const data = await res.json();
    console.log(data.message);
  } else if (action === 'uninstall') {
    const res = await fetch(`${DEFAULT_DAEMON_URL}/api/daemon/uninstall`, { method: 'POST' });
    const data = await res.json();
    console.log(data.message);
  } else {
    const res = await fetch(`${DEFAULT_DAEMON_URL}/api/daemon/status`);
    const data = await res.json();
    console.log('Daemon Status:', JSON.stringify(data, null, 2));
  }
}

function printHelp(): void {
  console.log(`
LocalHost Engine — Unified Edge PaaS & Tunnel CLI

USAGE:
  localhost <command> [options]
  lh <command> [options]

COMMANDS:
  status                Display running projects, ports, RAM/CPU, and ingress URLs
  run <path> [flags]    Detect and deploy project repo with automated tunnel
                        Flags:
                          --ingress=cloudflare_quick | tailscale_funnel | cloudflare_named
                          --name=<custom-name>
  logs <projectId>      Inspect recent stdout/stderr ring buffer logs
  kill-all              Emergency killswitch terminating all processes & tunnels
  daemon status         Check OS background service persistence status
  daemon install        Register LocalHost Engine as native OS boot service
  daemon uninstall      Unregister native OS background service

EXAMPLES:
  localhost status
  localhost run ./my-node-app --ingress=cloudflare_quick
  localhost logs proj-edge-api
  localhost kill-all
`);
}

// Direct execution entry
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2));
}
