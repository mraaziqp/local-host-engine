/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, type Request, type Response } from 'express';
import type { 
  AppProject, 
  IngressMode, 
  JarvisEvent, 
  ProcessLog 
} from '../core/types.ts';
import { detectStack } from '../core/detector.ts';
import { processSupervisor } from '../core/supervisor.ts';
import { CloudflareQuickTunnel, CloudflareNamedTunnel } from '../ingress/cloudflare.ts';
import { TailscaleAdapter } from '../ingress/tailscale.ts';
import { agentEventBus } from './agentStream.ts';
import { hostWatchdog } from '../core/watchdog.ts';
import path from 'node:path';
import fs from 'node:fs';

export interface JarvisDeployOptions {
  repoPath: string;
  autoDetect?: boolean;
  ingress?: IngressMode;
  customDomain?: string;
  tunnelToken?: string;
  envVars?: Record<string, string>;
  name?: string;
}

export interface JarvisDeployResult {
  appId: string;
  name: string;
  port: number;
  externalUrl: string;
  status: string;
  stack: string;
}

/**
 * Programmatic SDK that autonomous agents (Jarvis, LangChain, AutoGPT)
 * can import to orchestrate the LocalHost Engine daemon headlessly.
 */
export class JarvisClient {
  private baseUrl: string;
  private token?: string;

  constructor(options?: { baseUrl?: string; token?: string }) {
    this.baseUrl = (options?.baseUrl || 'http://127.0.0.1:4848').replace(/\/$/, '');
    this.token = options?.token;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) {
      h['Authorization'] = `Bearer ${this.token}`;
    }
    return h;
  }

  public async deploy(options: JarvisDeployOptions): Promise<JarvisDeployResult> {
    const res = await fetch(`${this.baseUrl}/api/jarvis/deploy`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(options),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Jarvis deploy error: HTTP ${res.status}`);
    }

    return res.json();
  }

  public async getLogs(appId: string): Promise<ProcessLog[]> {
    const res = await fetch(`${this.baseUrl}/api/jarvis/apps/${appId}/logs`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Failed to fetch logs: ${res.statusText}`);
    const data = await res.json();
    return data.logs || [];
  }

  public async restartApp(appId: string): Promise<{ success: boolean; status: string }> {
    const res = await fetch(`${this.baseUrl}/api/jarvis/apps/${appId}/restart`, {
      method: 'POST',
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Restart error: ${res.statusText}`);
    return res.json();
  }

  public async killAll(): Promise<{ success: boolean; count: number }> {
    const res = await fetch(`${this.baseUrl}/api/kill-all`, {
      method: 'POST',
      headers: this.headers,
    });
    return res.json();
  }
}

/**
 * Creates the Jarvis Ecosystem API router
 */
export function createJarvisRouter(
  projectsRegistry: Map<string, AppProject>,
  activeTunnels: Map<string, { stop: () => Promise<void> }>
): Router {
  const router = Router();

  // POST /api/jarvis/deploy
  router.post('/deploy', async (req: Request, res: Response) => {
    const {
      repoPath,
      ingress = 'cloudflare_quick',
      customDomain,
      tunnelToken,
      envVars = {},
      name,
    } = req.body || {};

    if (!repoPath) {
      return res.status(400).json({ error: 'Missing required field: repoPath' });
    }

    try {
      let resolvedLocalPath = path.resolve(repoPath);
      if (!fs.existsSync(resolvedLocalPath)) {
        const cwdRelative = path.resolve(process.cwd(), repoPath.replace(/^[/\\]/, ''));
        if (fs.existsSync(cwdRelative)) {
          resolvedLocalPath = cwdRelative;
        }
      }

      const existingPorts = new Set(Array.from(projectsRegistry.values()).map((p) => p.port));
      const detected = await detectStack(repoPath, existingPorts);

      const appId = `app-jarvis-${Date.now().toString(36)}`;
      const appName = name || path.basename(resolvedLocalPath) || `jarvis-${detected.assignedPort}`;

      agentEventBus.broadcast('project:build_started', {
        appId,
        name: appName,
        path: resolvedLocalPath,
        port: detected.assignedPort,
        stack: detected.stack,
      }, appId);

      const project: AppProject = {
        id: appId,
        name: appName,
        localPath: resolvedLocalPath,
        port: detected.assignedPort,
        runCommand: detected.runCommand,
        buildCommand: detected.buildCommand,
        envVars: {
          ...detected.suggestedEnv,
          ...envVars,
          JARVIS_DEPLOYED: '1',
        },
        status: 'building',
        stackType: detected.stack,
        packageManager: detected.packageManager,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        activeIngress: {
          mode: ingress,
          domain: customDomain,
          tunnelToken,
          status: 'provisioning',
          targetPort: detected.assignedPort,
          startedAt: Date.now(),
        },
      };

      projectsRegistry.set(appId, project);
      hostWatchdog.registerProject(project);

      // Start child process via supervisor
      await processSupervisor.start(project);

      // Ingress setup
      let publicUrl = `http://127.0.0.1:${project.port}`;

      if (ingress === 'cloudflare_quick') {
        const cf = new CloudflareQuickTunnel(project.port);
        activeTunnels.set(appId, cf);
        const tunRes = await cf.start();
        publicUrl = tunRes.publicUrl;
        project.activeIngress.publicUrl = publicUrl;
        project.activeIngress.status = 'active';
      } else if (ingress === 'cloudflare_named' && tunnelToken) {
        const cf = new CloudflareNamedTunnel(tunnelToken, customDomain);
        activeTunnels.set(appId, cf);
        const tunRes = await cf.start();
        publicUrl = tunRes.publicUrl;
        project.activeIngress.publicUrl = publicUrl;
        project.activeIngress.status = 'active';
      } else if (ingress === 'tailscale_funnel' || ingress === 'tailscale_serve') {
        const ts = new TailscaleAdapter();
        activeTunnels.set(appId, ts);
        const tunRes = await ts.start(project.port, ingress === 'tailscale_funnel' ? 'funnel' : 'serve');
        publicUrl = tunRes.publicUrl;
        project.activeIngress.publicUrl = publicUrl;
        project.activeIngress.status = 'active';
      }

      agentEventBus.broadcast('ingress:url_assigned', {
        appId,
        port: project.port,
        url: publicUrl,
        mode: ingress,
      }, appId);

      res.status(201).json({
        appId: project.id,
        name: project.name,
        port: project.port,
        externalUrl: publicUrl,
        status: project.status,
        stack: project.stackType,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/jarvis/apps/:id/logs
  router.get('/apps/:id/logs', (req: Request, res: Response) => {
    const { id } = req.params;
    const logs = processSupervisor.getLogs(id);
    res.json({ logs });
  });

  // POST /api/jarvis/apps/:id/restart
  router.post('/apps/:id/restart', async (req: Request, res: Response) => {
    const { id } = req.params;
    const project = projectsRegistry.get(id);
    if (!project) {
      return res.status(404).json({ error: 'App not found' });
    }

    try {
      await processSupervisor.stop(id);
      await processSupervisor.start(project);
      project.status = 'healthy';
      project.updatedAt = Date.now();

      agentEventBus.broadcast('project:restarted', {
        appId: id,
        port: project.port,
      }, id);

      res.json({ success: true, status: 'healthy', project });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
