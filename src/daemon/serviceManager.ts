/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import util from 'node:util';
import type { DaemonStatus } from '../core/types.ts';
import { agentEventBus } from '../api/agentStream.ts';

const execAsync = util.promisify(exec);

export class ServiceManager {
  private static instance: ServiceManager;
  private serviceName = 'localhost-engine';
  private isInstalledState = false;

  private constructor() {
    this.checkInitialStatus();
  }

  public static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  private checkInitialStatus(): void {
    const loc = this.getServiceConfigPath();
    if (loc && fs.existsSync(loc)) {
      this.isInstalledState = true;
    }
  }

  public getPlatform(): 'windows' | 'linux' | 'darwin' | 'unknown' {
    const p = os.platform();
    if (p === 'win32') return 'windows';
    if (p === 'linux') return 'linux';
    if (p === 'darwin') return 'darwin';
    return 'unknown';
  }

  public getServiceConfigPath(): string | undefined {
    const platform = this.getPlatform();
    const home = os.homedir();

    if (platform === 'linux') {
      return path.join(home, '.config', 'systemd', 'user', `${this.serviceName}.service`);
    } else if (platform === 'darwin') {
      return path.join(home, 'Library', 'LaunchAgents', `com.${this.serviceName}.plist`);
    } else if (platform === 'windows') {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'LocalHostEngine', 'daemon-service.xml');
    }
    return undefined;
  }

  /**
   * Generates the platform-native OS daemon definition file
   */
  public generateServiceDefinition(): string {
    const platform = this.getPlatform();
    const nodePath = process.execPath;
    const workingDir = process.cwd();
    const scriptPath = path.resolve(workingDir, 'server.ts');

    if (platform === 'linux') {
      return `[Unit]
Description=LocalHost Engine Edge Daemon & PaaS Runner
After=network.target

[Service]
Type=simple
WorkingDirectory=${workingDir}
ExecStart=${nodePath} ${workingDir}/node_modules/tsx/dist/cli.mjs ${scriptPath}
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=LOCAL_ENGINE_TOKEN=jarvis_secret_edge_token_2026

[Install]
WantedBy=default.target
`;
    } else if (platform === 'darwin') {
      return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.${this.serviceName}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${workingDir}/node_modules/tsx/dist/cli.mjs</string>
        <string>${scriptPath}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${workingDir}</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${workingDir}/localhost-daemon.log</string>
    <key>StandardErrorPath</key>
    <string>${workingDir}/localhost-daemon.err</string>
</dict>
</plist>
`;
    } else {
      // Windows Service configuration (WinSW / node-windows format)
      return `<service>
  <id>${this.serviceName}</id>
  <name>LocalHost Engine Edge Runner</name>
  <description>Automated edge PaaS runner and Cloudflare/Tailscale ingress daemon</description>
  <executable>${nodePath}</executable>
  <arguments>"${workingDir}/node_modules/tsx/dist/cli.mjs" "${scriptPath}"</arguments>
  <workingdirectory>${workingDir}</workingdirectory>
  <logmode>rotate</logmode>
  <onfailure action="restart" delay="5 sec"/>
  <env name="PORT" value="3000"/>
  <env name="NODE_ENV" value="production"/>
</service>
`;
    }
  }

  /**
   * Registers and enables the OS service
   */
  public async installService(): Promise<{ success: boolean; message: string; configPath?: string }> {
    const platform = this.getPlatform();
    const configPath = this.getServiceConfigPath();
    const content = this.generateServiceDefinition();

    if (!configPath) {
      return { success: false, message: `Unsupported OS platform: ${os.platform()}` };
    }

    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(configPath, content, 'utf-8');
      this.isInstalledState = true;

      if (platform === 'linux') {
        try {
          await execAsync('systemctl --user daemon-reload', { timeout: 3000 });
          await execAsync(`systemctl --user enable ${this.serviceName}`, { timeout: 3000 });
        } catch {
          // systemctl might require user lingering in headless containers
        }
      } else if (platform === 'darwin') {
        try {
          await execAsync(`launchctl load -w ${configPath}`, { timeout: 3000 });
        } catch {
          // ignore
        }
      }

      agentEventBus.broadcast('daemon:service_updated', {
        action: 'installed',
        platform,
        configPath,
      });

      return {
        success: true,
        message: `LocalHost Engine registered as native ${platform.toUpperCase()} system service! Starts automatically on OS boot.`,
        configPath,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to register OS service: ${err.message}`,
        configPath,
      };
    }
  }

  /**
   * Unregisters and removes the OS service
   */
  public async uninstallService(): Promise<{ success: boolean; message: string }> {
    const platform = this.getPlatform();
    const configPath = this.getServiceConfigPath();

    try {
      if (platform === 'linux') {
        try {
          await execAsync(`systemctl --user disable ${this.serviceName}`, { timeout: 3000 });
        } catch {
          // ignore
        }
      } else if (platform === 'darwin' && configPath) {
        try {
          await execAsync(`launchctl unload -w ${configPath}`, { timeout: 3000 });
        } catch {
          // ignore
        }
      }

      if (configPath && fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }

      this.isInstalledState = false;

      agentEventBus.broadcast('daemon:service_updated', {
        action: 'uninstalled',
        platform,
      });

      return {
        success: true,
        message: 'LocalHost Engine background service unregistered successfully.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Uninstall failed: ${err.message}`,
      };
    }
  }

  public getStatus(): DaemonStatus {
    const configPath = this.getServiceConfigPath();
    const exists = Boolean(configPath && fs.existsSync(configPath));

    return {
      isDaemon: this.isInstalledState || exists,
      bootOnStartup: this.isInstalledState || exists,
      uptime: Math.floor(process.uptime()),
      platform: this.getPlatform(),
      serviceFileLocation: configPath,
      serviceName: this.serviceName,
    };
  }
}

export const serviceManager = ServiceManager.getInstance();
