/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, exec, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import EventEmitter from 'node:events';
import os from 'node:os';

export interface ManagedBinaryProcess {
  pid?: number;
  child?: ChildProcess;
  kill: () => Promise<void>;
  onUrlReady: (handler: (url: string) => void) => ManagedBinaryProcess;
  onError: (handler: (err: Error) => void) => ManagedBinaryProcess;
  onExit: (handler: (code: number | null, signal: NodeJS.Signals | null) => void) => ManagedBinaryProcess;
  onLine: (handler: (stream: 'stdout' | 'stderr', line: string) => void) => ManagedBinaryProcess;
}

/**
 * Tree-kills a process hierarchy safely across Unix and Windows
 * to prevent zombie child sidecars or orphaned tunnel daemons.
 */
export async function killProcessTree(pid?: number): Promise<void> {
  if (!pid || pid <= 0) return;

  const isWin = os.platform() === 'win32';

  return new Promise<void>((resolve) => {
    if (isWin) {
      exec(`taskkill /F /T /PID ${pid}`, () => resolve());
    } else {
      // 1. Try process group kill first (if spawned detached)
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // not a process group leader
      }

      // 2. Also recursively kill all child descendants via pkill and kill pid directly
      exec(`pkill -P ${pid} -9 2>/dev/null; kill -9 ${pid} 2>/dev/null`, () => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // process may have already exited
        }
        resolve();
      });
    }
  });
}

/**
 * Spawns a binary directly without invoking /bin/sh or cmd.exe.
 * Prevents broken pipe errors (SIGPIPE / EPIPE) and enables robust line-by-line decoding.
 */
export function spawnManagedBinary(
  cmd: string,
  args: string[] = [],
  env?: Record<string, string>,
  options?: {
    cwd?: string;
    urlPattern?: RegExp;
  }
): ManagedBinaryProcess {
  const emitter = new EventEmitter();
  let child: ChildProcess | undefined;
  let isKilled = false;

  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...(env || {}),
  };

  try {
    child = spawn(cmd, args, {
      cwd: options?.cwd,
      env: mergedEnv,
      shell: false, // Strictly false: bypass shell wrapper and shell pipe crashes
      detached: os.platform() !== 'win32', // Detach on Unix so we can kill process group cleanly
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const urlRegex = options?.urlPattern || /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
    let detectedUrlEmitted = false;

    if (child.stdout) {
      const rlOut = readline.createInterface({ input: child.stdout, terminal: false });
      rlOut.on('line', (line) => {
        emitter.emit('line', 'stdout', line);
        if (!detectedUrlEmitted) {
          const match = line.match(urlRegex);
          if (match) {
            detectedUrlEmitted = true;
            emitter.emit('urlReady', match[0]);
          }
        }
      });
    }

    if (child.stderr) {
      const rlErr = readline.createInterface({ input: child.stderr, terminal: false });
      rlErr.on('line', (line) => {
        emitter.emit('line', 'stderr', line);
        if (!detectedUrlEmitted) {
          const match = line.match(urlRegex);
          if (match) {
            detectedUrlEmitted = true;
            emitter.emit('urlReady', match[0]);
          }
        }
      });
    }

    child.on('error', (err) => {
      emitter.emit('error', err);
    });

    child.on('close', (code, signal) => {
      emitter.emit('exit', code, signal);
    });
  } catch (err: any) {
    process.nextTick(() => {
      emitter.emit('error', err instanceof Error ? err : new Error(String(err)));
    });
  }

  const managed: ManagedBinaryProcess = {
    pid: child?.pid,
    child,
    kill: async () => {
      if (isKilled) return;
      isKilled = true;
      if (child && child.pid) {
        await killProcessTree(child.pid);
      }
    },
    onUrlReady: (handler) => {
      emitter.on('urlReady', handler);
      return managed;
    },
    onError: (handler) => {
      emitter.on('error', handler);
      return managed;
    },
    onExit: (handler) => {
      emitter.on('exit', handler);
      return managed;
    },
    onLine: (handler) => {
      emitter.on('line', handler);
      return managed;
    },
  };

  return managed;
}
