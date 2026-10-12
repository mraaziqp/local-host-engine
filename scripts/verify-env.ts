#!/usr/bin/env tsx

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execSync } from 'node:child_process';

interface CheckResult {
  category: string;
  name: string;
  status: 'passed' | 'warning' | 'failed';
  details: string;
  fixRecommendation?: string;
}

const results: CheckResult[] = [];

function checkBinary(name: string, isRequired: boolean = false): CheckResult {
  try {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${name}` : `which ${name}`;
    const binaryPath = execSync(checkCmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split('\n')[0];
    
    // Attempt to get version
    let version = '';
    try {
      version = execSync(`${name} --version`, { stdio: ['pipe', 'pipe', 'ignore'], timeout: 2000 })
        .toString()
        .trim()
        .split('\n')[0];
    } catch {
      version = 'detected in PATH';
    }

    return {
      category: 'Binary Dependency',
      name,
      status: 'passed',
      details: `${binaryPath} (${version})`,
    };
  } catch {
    if (isRequired) {
      return {
        category: 'Binary Dependency',
        name,
        status: 'failed',
        details: 'Missing from system PATH (Required)',
        fixRecommendation: `Install ${name} on host system and ensure it is available in PATH.`,
      };
    }
    return {
      category: 'Binary Dependency',
      name,
      status: 'warning',
      details: 'Optional edge tunnel binary not found in PATH',
      fixRecommendation: `Install ${name} (optional: required only for native binary tunnels; engine can fallback to standalone runners or simulation).`,
    };
  }
}

async function checkPortAvailability(port: number, host: string = '127.0.0.1'): Promise<CheckResult> {
  return new Promise((resolve) => {
    const tester = net.createServer();

    tester.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve({
          category: 'Network & Ingress',
          name: `Port ${port} (${host})`,
          status: 'warning',
          details: `Port ${port} is currently bound by another process or existing daemon instance.`,
          fixRecommendation: `If LocalHost Engine is already running, this is expected. Otherwise run 'lsof -i :${port}' to identify the conflicting process.`,
        });
      } else {
        resolve({
          category: 'Network & Ingress',
          name: `Port ${port} (${host})`,
          status: 'warning',
          details: `Binding error: ${err.message}`,
          fixRecommendation: `Check firewall or loopback configuration.`,
        });
      }
    });

    tester.once('listening', () => {
      tester.close(() => {
        resolve({
          category: 'Network & Ingress',
          name: `Port ${port} (${host})`,
          status: 'passed',
          details: `Available for Jarvis Agent Gateway daemon binding.`,
        });
      });
    });

    tester.listen(port, host);
  });
}

function checkStorageDirectory(dataDir: string): CheckResult {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Test write and read permissions for SQLite WAL store
    const testFile = path.join(dataDir, `.preflight-write-test-${Date.now()}`);
    fs.writeFileSync(testFile, 'localhost-engine-preflight-test', 'utf-8');
    const readBack = fs.readFileSync(testFile, 'utf-8');
    fs.unlinkSync(testFile);

    if (readBack !== 'localhost-engine-preflight-test') {
      throw new Error('Data verification failed on readback');
    }

    return {
      category: 'Storage & State',
      name: 'SQLite Data Directory',
      status: 'passed',
      details: `${path.resolve(dataDir)} is writable (Read/Write OK)`,
    };
  } catch (err: any) {
    return {
      category: 'Storage & State',
      name: 'SQLite Data Directory',
      status: 'failed',
      details: `Write permission test failed: ${err.message}`,
      fixRecommendation: `Ensure the directory has write permissions: 'chmod 755 ${dataDir}'`,
    };
  }
}

function checkNodeEnvironment(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);

  if (major >= 20) {
    return {
      category: 'Runtime Environment',
      name: 'Node.js Engine',
      status: 'passed',
      details: `${version} (Supports native SQLite DatabaseSync & ES modules)`,
    };
  } else {
    return {
      category: 'Runtime Environment',
      name: 'Node.js Engine',
      status: 'warning',
      details: `${version} detected (Recommended: Node.js v20.0.0 or higher)`,
      fixRecommendation: 'Upgrade to Node.js v20+ or v22+ LTS for maximum performance and native SQLite.',
    };
  }
}

async function runPreflight() {
  console.log('\n===============================================================');
  console.log('       LocalHost Engine - Environment Preflight Diagnostic     ');
  console.log('===============================================================\n');

  // 1. Runtime checks
  results.push(checkNodeEnvironment());

  // 2. Binaries
  results.push(checkBinary('node', true));
  results.push(checkBinary('cloudflared', false));
  results.push(checkBinary('tailscale', false));

  // 3. Ports
  const port4848Result = await checkPortAvailability(4848, '127.0.0.1');
  results.push(port4848Result);

  // 4. Data storage
  const dataPath = path.resolve(process.cwd(), 'data');
  results.push(checkStorageDirectory(dataPath));

  // Format table output
  console.log('---------------------------------------------------------------------------------------------');
  console.log('| STATUS  | COMPONENT                 | DETAILS');
  console.log('---------------------------------------------------------------------------------------------');

  let hasFatal = false;

  for (const r of results) {
    let icon = '\x1b[32m[PASS]\x1b[0m ';
    if (r.status === 'warning') icon = '\x1b[33m[WARN]\x1b[0m ';
    if (r.status === 'failed') {
      icon = '\x1b[31m[FAIL]\x1b[0m ';
      hasFatal = true;
    }

    const name = r.name.padEnd(25).slice(0, 25);
    console.log(`| ${icon} | ${name} | ${r.details}`);
  }
  console.log('---------------------------------------------------------------------------------------------\n');

  const warnings = results.filter((r) => r.status === 'warning');
  const failures = results.filter((r) => r.status === 'failed');

  if (failures.length > 0) {
    console.error('\x1b[31m[!] Critical preflight failures detected:\x1b[0m');
    for (const f of failures) {
      console.error(`  - ${f.name}: ${f.fixRecommendation || f.details}`);
    }
    console.log('');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('\x1b[33m[i] Preflight notices & suggestions:\x1b[0m');
    for (const w of warnings) {
      if (w.fixRecommendation) {
        console.log(`  - ${w.name}: ${w.fixRecommendation}`);
      }
    }
    console.log('');
  }

  console.log('\x1b[32m✔ LocalHost Engine preflight checks passed successfully.\x1b[0m\n');
  process.exit(0);
}

runPreflight().catch((err) => {
  console.error('[Preflight Unexpected Error]', err);
  process.exit(1);
});
