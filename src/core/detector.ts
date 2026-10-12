/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import type { DetectedConfig, StackType } from './types.ts';

const PORT_RANGE_START = 3100;
const PORT_RANGE_END = 3999;
const STRICT_LOOPBACK_HOST = '127.0.0.1';

/**
 * Checks whether a given TCP port is available on strictly 127.0.0.1
 */
export async function isPortAvailable(port: number, host = STRICT_LOOPBACK_HOST): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, host);
  });
}

/**
 * Finds an available dynamic port within 3100-3999
 */
export async function allocateDynamicPort(usedPorts: Set<number> = new Set()): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (usedPorts.has(port)) {
      continue;
    }
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(`[PortManager] No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

/**
 * Enforces loopback address inside execution commands by stripping 0.0.0.0
 * and replacing with 127.0.0.1
 */
export function enforceLoopbackBinding(command: string, port: number): string {
  let sanitized = command;

  // Replace any explicit 0.0.0.0 binding with 127.0.0.1
  sanitized = sanitized.replace(/0\.0\.0\.0/g, STRICT_LOOPBACK_HOST);

  // If command includes Vite or Next dev flags like --host, enforce --host 127.0.0.1
  if (sanitized.includes('vite') && !sanitized.includes('--host')) {
    sanitized += ` --host ${STRICT_LOOPBACK_HOST}`;
  } else if (sanitized.includes('vite') && sanitized.includes('--host 0.0.0.0')) {
    sanitized = sanitized.replace(/--host\s+0\.0\.0\.0/g, `--host ${STRICT_LOOPBACK_HOST}`);
  }

  // Ensure port flag replacement if hardcoded or replace placeholder
  sanitized = sanitized.replace(/\$PORT/g, String(port)).replace(/%PORT%/g, String(port));

  return sanitized;
}

/**
 * Scans a project directory and detects its technology stack, dependencies,
 * package managers, build and runtime entry points.
 */
export async function detectStack(
  projectPath: string,
  existingUsedPorts: Set<number> = new Set()
): Promise<DetectedConfig> {
  let resolvedPath = path.resolve(projectPath);
  if (!fs.existsSync(resolvedPath)) {
    const cwdRelative = path.resolve(process.cwd(), projectPath.replace(/^[/\\]/, ''));
    if (fs.existsSync(cwdRelative)) {
      resolvedPath = cwdRelative;
    }
  }
  const warnings: string[] = [];

  const assignedPort = await allocateDynamicPort(existingUsedPorts);

  // Check if directory exists
  if (!fs.existsSync(resolvedPath)) {
    warnings.push(`Directory does not exist at '${resolvedPath}'. Using static fallback defaults.`);
    return {
      stack: 'static',
      assignedPort,
      enforcedHost: STRICT_LOOPBACK_HOST,
      runCommand: `npx serve -l ${assignedPort} --single`,
      suggestedEnv: {
        HOST: STRICT_LOOPBACK_HOST,
        PORT: String(assignedPort),
      },
      warnings,
    };
  }

  const fileExists = (relFile: string) => fs.existsSync(path.join(resolvedPath, relFile));
  const readFileSafe = (relFile: string) => {
    try {
      return fs.readFileSync(path.join(resolvedPath, relFile), 'utf-8');
    } catch {
      return null;
    }
  };

  // 1. Docker Detection
  if (fileExists('Dockerfile') || fileExists('docker-compose.yml') || fileExists('docker-compose.yaml')) {
    const isCompose = fileExists('docker-compose.yml') || fileExists('docker-compose.yaml');
    const runCmd = isCompose
      ? `docker compose up --build`
      : `docker build -t app-${assignedPort} . && docker run -p ${STRICT_LOOPBACK_HOST}:${assignedPort}:${assignedPort} app-${assignedPort}`;

    return {
      stack: 'docker',
      packageManager: 'docker',
      buildCommand: isCompose ? 'docker compose build' : `docker build -t app-${assignedPort} .`,
      runCommand: enforceLoopbackBinding(runCmd, assignedPort),
      assignedPort,
      entryFile: isCompose ? 'docker-compose.yml' : 'Dockerfile',
      suggestedEnv: {
        HOST: STRICT_LOOPBACK_HOST,
        PORT: String(assignedPort),
      },
      warnings,
      enforcedHost: STRICT_LOOPBACK_HOST,
    };
  }

  // 2. Node.js Detection
  if (fileExists('package.json')) {
    let pkgJson: Record<string, any> = {};
    try {
      const raw = readFileSafe('package.json');
      if (raw) {
        pkgJson = JSON.parse(raw);
      }
    } catch (e: any) {
      warnings.push(`Could not parse package.json: ${e?.message}`);
    }

    // Determine package manager
    let pm: 'pnpm' | 'yarn' | 'bun' | 'npm' = 'npm';
    if (fileExists('pnpm-lock.yaml')) {
      pm = 'pnpm';
    } else if (fileExists('yarn.lock')) {
      pm = 'yarn';
    } else if (fileExists('bun.lock') || fileExists('bun.lockb')) {
      pm = 'bun';
    }

    const scripts = pkgJson.scripts || {};
    let runScript = 'start';
    let buildScript: string | undefined = undefined;

    if (scripts.dev) {
      runScript = 'dev';
    } else if (scripts.start) {
      runScript = 'start';
    } else if (scripts.serve) {
      runScript = 'serve';
    }

    if (scripts.build) {
      buildScript = `${pm} run build`;
    }

    // Determine entry point
    const mainEntry = pkgJson.main || (fileExists('server.js') ? 'server.js' : fileExists('index.js') ? 'index.js' : undefined);

    let rawRunCommand = `${pm} run ${runScript}`;
    if (!scripts[runScript] && mainEntry) {
      rawRunCommand = `node ${mainEntry}`;
    }

    // Append port and host enforcement
    let finalRunCommand = enforceLoopbackBinding(rawRunCommand, assignedPort);
    if (finalRunCommand.includes('vite')) {
      finalRunCommand += ` --port ${assignedPort}`;
    }

    return {
      stack: 'node',
      packageManager: pm,
      buildCommand: buildScript,
      runCommand: finalRunCommand,
      assignedPort,
      entryFile: mainEntry || 'package.json',
      suggestedEnv: {
        HOST: STRICT_LOOPBACK_HOST,
        PORT: String(assignedPort),
        NODE_ENV: 'production',
      },
      warnings,
      enforcedHost: STRICT_LOOPBACK_HOST,
    };
  }

  // 3. Python Detection
  if (
    fileExists('requirements.txt') ||
    fileExists('pyproject.toml') ||
    fileExists('Pipfile') ||
    fileExists('main.py') ||
    fileExists('app.py')
  ) {
    let pm: 'pip' | 'poetry' | 'uv' = 'pip';
    if (fileExists('pyproject.toml') && readFileSafe('pyproject.toml')?.includes('[tool.poetry]')) {
      pm = 'poetry';
    } else if (fileExists('uv.lock')) {
      pm = 'uv';
    }

    const entry = fileExists('main.py') ? 'main.py' : fileExists('app.py') ? 'app.py' : 'main.py';
    const entryContent = readFileSafe(entry) || '';

    let runCmd = `python3 ${entry}`;
    if (entryContent.includes('FastAPI') || entryContent.includes('uvicorn')) {
      const moduleName = entry.replace(/\.py$/, '');
      runCmd = `uvicorn ${moduleName}:app --host ${STRICT_LOOPBACK_HOST} --port ${assignedPort}`;
    } else if (entryContent.includes('Flask')) {
      runCmd = `python3 -m flask run --host=${STRICT_LOOPBACK_HOST} --port=${assignedPort}`;
    }

    return {
      stack: 'python',
      packageManager: pm,
      buildCommand: pm === 'pip' && fileExists('requirements.txt') ? 'pip install -r requirements.txt' : undefined,
      runCommand: enforceLoopbackBinding(runCmd, assignedPort),
      assignedPort,
      entryFile: entry,
      suggestedEnv: {
        HOST: STRICT_LOOPBACK_HOST,
        PORT: String(assignedPort),
        PYTHONUNBUFFERED: '1',
      },
      warnings,
      enforcedHost: STRICT_LOOPBACK_HOST,
    };
  }

  // 4. Go Binary / Source Detection
  if (fileExists('go.mod') || fileExists('main.go')) {
    const runCmd = fileExists('server') 
      ? `./server` 
      : `go run main.go`;

    return {
      stack: 'go',
      packageManager: 'unknown',
      buildCommand: 'go build -o server .',
      runCommand: enforceLoopbackBinding(runCmd, assignedPort),
      assignedPort,
      entryFile: fileExists('main.go') ? 'main.go' : 'go.mod',
      suggestedEnv: {
        HOST: STRICT_LOOPBACK_HOST,
        PORT: String(assignedPort),
        GIN_MODE: 'release',
      },
      warnings,
      enforcedHost: STRICT_LOOPBACK_HOST,
    };
  }

  // 5. Static HTML / Web detection
  if (fileExists('index.html')) {
    return {
      stack: 'static',
      packageManager: 'npm',
      runCommand: `npx serve -l ${assignedPort} -s .`,
      assignedPort,
      entryFile: 'index.html',
      suggestedEnv: {
        HOST: STRICT_LOOPBACK_HOST,
        PORT: String(assignedPort),
      },
      warnings,
      enforcedHost: STRICT_LOOPBACK_HOST,
    };
  }

  // Unknown fallback
  warnings.push('Unrecognized stack format. Defaulting to general Node runner.');
  return {
    stack: 'unknown',
    assignedPort,
    runCommand: `node index.js`,
    suggestedEnv: {
      HOST: STRICT_LOOPBACK_HOST,
      PORT: String(assignedPort),
    },
    warnings,
    enforcedHost: STRICT_LOOPBACK_HOST,
  };
}
