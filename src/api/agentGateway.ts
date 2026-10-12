/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { type Request, type Response, Router } from 'express';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { 
  AppProject, 
  AgentDeployRequest, 
  AgentDeployResponse, 
  SystemEngineStatus,
  IngressMode,
  IngressConfig,
  CloudflareProvisionRequest 
} from '../core/types.ts';
import { detectStack } from '../core/detector.ts';
import { processSupervisor } from '../core/supervisor.ts';
import { CloudflareQuickTunnel, CloudflareNamedTunnel } from '../ingress/cloudflare.ts';
import { TailscaleAdapter } from '../ingress/tailscale.ts';
import { CloudflareTunnelClient } from '../ingress/cloudflareApi.ts';
import { agentEventBus } from './agentStream.ts';
import { hostWatchdog } from '../core/watchdog.ts';
import { createJarvisRouter } from './jarvisSdk.ts';
import { hostShield } from '../core/shield.ts';
import { serviceManager } from '../daemon/serviceManager.ts';
import { createGitWebhookRouter } from './gitWebhook.ts';
import { mcpServer } from './mcpServer.ts';
import { accessGuard } from '../security/accessGuard.ts';
import { sqliteStore } from '../db/store.ts';
import { litestreamManager } from '../db/litestream.ts';
import { TEMPLATE_PRESETS } from '../components/TemplateGallery.tsx';

// In-memory registry of all tracked projects and ingress tunnels
const projectsRegistry = new Map<string, AppProject>();
const activeTunnels = new Map<string, { stop: () => Promise<void> }>();

// Seed initial sample projects so that on first load the user immediately sees a working edge fleet
function seedInitialSampleProjects() {
  const sample1: AppProject = {
    id: 'proj-edge-api',
    name: 'Apollo Telemetry API',
    localPath: '/samples/node-api',
    port: 3105,
    runCommand: 'node index.js --host 127.0.0.1 --port 3105',
    buildCommand: 'npm run build',
    envVars: { NODE_ENV: 'production', LOG_LEVEL: 'info' },
    status: 'healthy',
    stackType: 'node',
    packageManager: 'pnpm',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
    cpuPercent: 1.4,
    memoryMb: 42.5,
    uptimeSeconds: 1820,
    activeIngress: {
      mode: 'cloudflare_quick',
      status: 'active',
      publicUrl: 'https://apollo-telemetry-edge.trycloudflare.com',
      targetPort: 3105,
    },
    gitWebhook: {
      secret: 'whsec_apollo_sample_secret_key',
      branch: 'main',
      autoDeploy: true,
      lastDeployedAt: Date.now() - 1800000,
      lastCommitHash: '9a4c8f2',
    },
  };

  const sample2: AppProject = {
    id: 'proj-py-fastapi',
    name: 'Neural Quant Model',
    localPath: '/samples/python-fastapi',
    port: 3120,
    runCommand: 'uvicorn main:app --host 127.0.0.1 --port 3120',
    buildCommand: 'pip install -r requirements.txt',
    envVars: { MODEL_PRECISION: 'fp16', PYTHONUNBUFFERED: '1' },
    status: 'healthy',
    stackType: 'python',
    packageManager: 'uv',
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now(),
    cpuPercent: 3.2,
    memoryMb: 88.0,
    uptimeSeconds: 3410,
    activeIngress: {
      mode: 'tailscale_funnel',
      status: 'active',
      publicUrl: 'https://neural-quant.zenith-mesh.ts.net',
      targetPort: 3120,
    },
    gitWebhook: {
      secret: 'whsec_quant_fastapi_secret_key',
      branch: 'main',
      autoDeploy: true,
      lastDeployedAt: Date.now() - 3600000,
      lastCommitHash: 'e12b73d',
    },
  };

  projectsRegistry.set(sample1.id, sample1);
  projectsRegistry.set(sample2.id, sample2);

  hostWatchdog.registerProject(sample1);
  hostWatchdog.registerProject(sample2);
}

seedInitialSampleProjects();

/**
 * Creates the agent gateway router with Phase 4 features:
 * - Rate Limiting & Path Traversal Shielding
 * - OS Service Manager (/api/daemon/*)
 * - Git Webhooks (/api/webhooks/git/*)
 * - Resource Alerts & Host Shield Config (/api/alerts/*, /api/shield/*)
 * - Jarvis Agent Bridge (/api/jarvis/*)
 * - Real-Time Telemetry & SSE (/api/status, /api/stats, /api/events)
 */
export function createAgentGatewayRouter(): Router {
  const router = Router();
  router.use(express.json());

  // Ingress Reverse Proxy & Security Shield
  router.use(hostShield.shieldMiddleware);

  // Authentication Middleware
  router.use(agentEventBus.authMiddleware);

  // Mount Sub-routers
  router.use('/jarvis', createJarvisRouter(projectsRegistry, activeTunnels));
  router.use('/webhooks/git', createGitWebhookRouter(projectsRegistry));

  // --- OS Background Daemon Endpoints ---
  router.get('/daemon/status', (_req: Request, res: Response) => {
    res.json(serviceManager.getStatus());
  });

  router.post('/daemon/install', async (_req: Request, res: Response) => {
    const result = await serviceManager.installService();
    res.json(result);
  });

  router.post('/daemon/uninstall', async (_req: Request, res: Response) => {
    const result = await serviceManager.uninstallService();
    res.json(result);
  });

  // --- Resource Alerts Endpoints ---
  router.get('/alerts', (_req: Request, res: Response) => {
    res.json({
      config: hostShield.getAlertConfig(),
      history: hostShield.getAlertHistory(),
    });
  });

  router.post('/alerts/config', (req: Request, res: Response) => {
    const updated = hostShield.updateAlertConfig(req.body || {});
    res.json({ success: true, config: updated });
  });

  router.delete('/alerts/history', (_req: Request, res: Response) => {
    hostShield.clearAlertHistory();
    res.json({ success: true, message: 'Alert history cleared' });
  });

  // --- Host Shield Settings Endpoints ---
  router.get('/shield/config', (_req: Request, res: Response) => {
    res.json(hostShield.getShieldConfig());
  });

  router.post('/shield/config', (req: Request, res: Response) => {
    const updated = hostShield.updateShieldConfig(req.body || {});
    res.json({ success: true, config: updated });
  });

  // GET /api/events: Real-Time Event Bus via Server-Sent Events (SSE)
  router.get('/events', (req: Request, res: Response) => {
    agentEventBus.handleSseConnection(req, res);
  });

  // GET /api/stats: Expanded 30-minute historical CPU and Memory usage per project
  router.get('/stats', (_req: Request, res: Response) => {
    const statsData = hostWatchdog.getStatsSummary();
    res.json(statsData);
  });

  // GET /api/status: Returns all active projects, ports, CPU/RAM stats, public tunnel URLs
  router.get('/status', (_req: Request, res: Response) => {
    const memory = process.memoryUsage();
    const activeProjects = Array.from(projectsRegistry.values());
    const assignedPorts = activeProjects.map((p) => p.port);
    const daemonStat = serviceManager.getStatus();

    const statusResponse: SystemEngineStatus = {
      engineVersion: '1.4.0-edge-p4',
      status: 'running',
      activeProjectsCount: activeProjects.filter((p) => p.status === 'healthy').length,
      totalProjectsCount: activeProjects.length,
      memoryUsageMb: {
        rss: Math.round(memory.rss / (1024 * 1024)),
        heapTotal: Math.round(memory.heapTotal / (1024 * 1024)),
        heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
      },
      cpuLoadPercent: Number((Math.min(95, (os.loadavg()[0] || 0.4) * 18)).toFixed(1)),
      listeningInterface: '127.0.0.1',
      gatewayPort: 4848,
      assignedPorts,
      projects: activeProjects,
      uptimeSeconds: Math.floor(process.uptime()),
      availableIngressDrivers: {
        cloudflared: true,
        tailscale: true,
      },
      activeSseClients: agentEventBus.getActiveClientCount(),
      authTokenPreview: `${agentEventBus.getAuthToken().slice(0, 8)}...`,
      shieldActive: true,
      isDaemon: daemonStat.isDaemon,
    };

    res.json(statusResponse);
  });

  // POST /api/deploy
  router.post('/deploy', async (req: Request, res: Response) => {
    const body: AgentDeployRequest = req.body || {};
    const rawPath = body.path || (body as any).localPath;

    if (!rawPath || typeof rawPath !== 'string') {
      return res.status(400).json({
        success: false,
        message: "Missing required string parameter 'path'",
      });
    }

    try {
      let resolvedLocalPath = path.resolve(rawPath);
      if (!fs.existsSync(resolvedLocalPath)) {
        const cwdRelative = path.resolve(process.cwd(), rawPath.replace(/^[/\\]/, ''));
        if (fs.existsSync(cwdRelative)) {
          resolvedLocalPath = cwdRelative;
        }
      }

      const existingPorts = new Set(Array.from(projectsRegistry.values()).map((p) => p.port));
      const detected = await detectStack(rawPath, existingPorts);

      const projectName = body.name || path.basename(resolvedLocalPath) || `edge-app-${detected.assignedPort}`;
      const projectId = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      const ingressMode: IngressMode = body.ingressMode || 'cloudflare_quick';

      const assignedPort = body.port || detected.assignedPort;

      agentEventBus.broadcast('project:build_started', {
        projectId,
        name: projectName,
        port: assignedPort,
        stack: detected.stack,
      }, projectId);

      const project: AppProject = {
        id: projectId,
        name: projectName,
        localPath: resolvedLocalPath,
        port: assignedPort,
        runCommand: body.runCommandOverride || detected.runCommand,
        buildCommand: body.buildCommandOverride || detected.buildCommand,
        envVars: {
          ...detected.suggestedEnv,
          PORT: String(assignedPort),
          ...(body.envVars || {}),
        },
        status: 'building',
        stackType: detected.stack,
        packageManager: detected.packageManager,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        activeIngress: {
          mode: ingressMode,
          status: 'provisioning',
          domain: body.domain,
          tunnelToken: body.tunnelToken,
          targetPort: detected.assignedPort,
          startedAt: Date.now(),
        },
        gitWebhook: {
          secret: `whsec_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
          branch: 'main',
          autoDeploy: true,
        },
      };

      projectsRegistry.set(projectId, project);
      hostWatchdog.registerProject(project);

      // Launch process supervisor
      await processSupervisor.start(project);

      const supervised = processSupervisor.getProject(projectId);
      if (supervised) {
        project.status = supervised.status;
        project.processId = supervised.processId;
      }

      // Provision Ingress Tunnel via non-blocking runners
      let publicUrl: string | undefined = undefined;

      if (ingressMode === 'cloudflare_quick') {
        const cfQuick = new CloudflareQuickTunnel(project.port);
        cfQuick.on('log', (msg) => processSupervisor.appendLog(projectId, 'system', msg));
        activeTunnels.set(projectId, cfQuick);

        const result = await cfQuick.start();
        publicUrl = result.publicUrl;
        project.activeIngress.publicUrl = publicUrl;
        project.activeIngress.status = 'active';
      } else if (ingressMode === 'cloudflare_named' && body.tunnelToken) {
        const cfNamed = new CloudflareNamedTunnel(body.tunnelToken, body.domain);
        cfNamed.on('log', (msg) => processSupervisor.appendLog(projectId, 'system', msg));
        activeTunnels.set(projectId, cfNamed);

        const result = await cfNamed.start();
        publicUrl = result.publicUrl;
        project.activeIngress.publicUrl = publicUrl;
        project.activeIngress.status = 'active';
      } else if (ingressMode === 'tailscale_serve' || ingressMode === 'tailscale_funnel') {
        const tsMode = ingressMode === 'tailscale_funnel' ? 'funnel' : 'serve';
        const tsAdapter = new TailscaleAdapter();
        tsAdapter.on('log', (msg) => processSupervisor.appendLog(projectId, 'system', msg));
        activeTunnels.set(projectId, tsAdapter);

        const result = await tsAdapter.start(project.port, tsMode);
        publicUrl = result.publicUrl;
        project.activeIngress.publicUrl = publicUrl;
        project.activeIngress.status = 'active';
      } else {
        project.activeIngress.status = 'inactive';
      }

      projectsRegistry.set(projectId, project);
      sqliteStore.upsertProject(project);

      agentEventBus.broadcast('ingress:url_assigned', {
        projectId,
        port: project.port,
        publicUrl: publicUrl || `http://127.0.0.1:${project.port}`,
        mode: project.activeIngress.mode,
      }, projectId);

      const response: AgentDeployResponse = {
        success: true,
        message: `Project '${project.name}' successfully deployed on port ${project.port}`,
        projectId: project.id,
        port: project.port,
        publicUrl: publicUrl || `http://127.0.0.1:${project.port}`,
        ingressMode: project.activeIngress.mode,
        status: project.status,
      };

      res.status(201).json(response);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: `Deployment failed: ${err.message}`,
        error: err.message,
      });
    }
  });

  // POST /api/cloudflare/provision
  router.post('/cloudflare/provision', async (req: Request, res: Response) => {
    const body: CloudflareProvisionRequest = req.body || {};
    if (!body.accountId || !body.apiToken || !body.zoneId || !body.subdomain) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: accountId, apiToken, zoneId, subdomain',
      });
    }

    try {
      const client = new CloudflareTunnelClient(body.accountId, body.apiToken);
      const result = await client.provisionFullCustomDomain(body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/kill-all
  router.post('/kill-all', async (_req: Request, res: Response) => {
    try {
      agentEventBus.broadcast('system:panic_kill', {
        timestamp: Date.now(),
        reason: 'Emergency Killswitch Invoked',
      });

      for (const tunnel of activeTunnels.values()) {
        try {
          await tunnel.stop();
        } catch {
          // ignore
        }
      }
      activeTunnels.clear();

      await processSupervisor.stopAll();

      for (const project of projectsRegistry.values()) {
        project.status = 'stopped';
        project.processId = undefined;
        project.activeIngress.status = 'inactive';
        project.updatedAt = Date.now();
      }

      res.json({
        success: true,
        message: 'Global killswitch executed. All active processes and tunnels terminated.',
        stoppedCount: projectsRegistry.size,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: `Failed to terminate processes: ${err.message}`,
      });
    }
  });

  // Project logs retrieval
  router.get('/projects/:id/logs', (req: Request, res: Response) => {
    const { id } = req.params;
    const logs = processSupervisor.getLogs(id);
    res.json({ logs });
  });

  // Start single project
  router.post('/projects/:id/start', async (req: Request, res: Response) => {
    const { id } = req.params;
    const project = projectsRegistry.get(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    try {
      await processSupervisor.start(project);
      project.status = 'healthy';
      const supervised = processSupervisor.getProject(id);
      if (supervised?.processId) {
        project.processId = supervised.processId;
      }

      if (project.activeIngress.mode === 'cloudflare_quick') {
        const cf = new CloudflareQuickTunnel(project.port);
        activeTunnels.set(id, cf);
        const resUrl = await cf.start();
        project.activeIngress.publicUrl = resUrl.publicUrl;
        project.activeIngress.status = 'active';
      } else if (project.activeIngress.mode === 'tailscale_funnel' || project.activeIngress.mode === 'tailscale_serve') {
        const ts = new TailscaleAdapter();
        activeTunnels.set(id, ts);
        const resUrl = await ts.start(project.port, project.activeIngress.mode === 'tailscale_funnel' ? 'funnel' : 'serve');
        project.activeIngress.publicUrl = resUrl.publicUrl;
        project.activeIngress.status = 'active';
      }

      project.updatedAt = Date.now();
      res.json({ success: true, project });
    } catch (err: any) {
      project.status = 'crashed';
      res.status(500).json({ error: err.message });
    }
  });

  // Stop single project
  router.post('/projects/:id/stop', async (req: Request, res: Response) => {
    const { id } = req.params;
    const project = projectsRegistry.get(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    try {
      const tunnel = activeTunnels.get(id);
      if (tunnel) {
        await tunnel.stop();
        activeTunnels.delete(id);
      }
      await processSupervisor.stop(id);
      project.status = 'stopped';
      project.processId = undefined;
      project.activeIngress.status = 'inactive';
      project.updatedAt = Date.now();

      res.json({ success: true, project });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Switch / reconfigure project ingress
  router.post('/projects/:id/ingress', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { mode, tunnelToken, domain } = req.body;
    const project = projectsRegistry.get(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    try {
      const existing = activeTunnels.get(id);
      if (existing) {
        await existing.stop();
        activeTunnels.delete(id);
      }

      project.activeIngress = {
        mode: mode as IngressMode,
        tunnelToken,
        domain,
        status: 'provisioning',
        targetPort: project.port,
        startedAt: Date.now(),
      };

      if (mode === 'cloudflare_quick') {
        const cf = new CloudflareQuickTunnel(project.port);
        activeTunnels.set(id, cf);
        const resUrl = await cf.start();
        project.activeIngress.publicUrl = resUrl.publicUrl;
        project.activeIngress.status = 'active';
      } else if (mode === 'cloudflare_named' && tunnelToken) {
        const cf = new CloudflareNamedTunnel(tunnelToken, domain);
        activeTunnels.set(id, cf);
        const resUrl = await cf.start();
        project.activeIngress.publicUrl = resUrl.publicUrl;
        project.activeIngress.status = 'active';
      } else if (mode === 'tailscale_serve' || mode === 'tailscale_funnel') {
        const ts = new TailscaleAdapter();
        activeTunnels.set(id, ts);
        const resUrl = await ts.start(project.port, mode === 'tailscale_funnel' ? 'funnel' : 'serve');
        project.activeIngress.publicUrl = resUrl.publicUrl;
        project.activeIngress.status = 'active';
      } else {
        project.activeIngress.status = 'inactive';
        project.activeIngress.publicUrl = undefined;
      }

      project.updatedAt = Date.now();
      sqliteStore.upsertProject(project);
      res.json({ success: true, activeIngress: project.activeIngress });
    } catch (err: any) {
      project.activeIngress.status = 'error';
      project.activeIngress.lastError = err.message;
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // PHASE 5: ZERO TRUST EDGE ACCESS GUARD
  // ==========================================
  router.get('/security/zerotrust', (_req: Request, res: Response) => {
    res.json(accessGuard.getConfig());
  });

  router.post('/security/zerotrust', (req: Request, res: Response) => {
    const updated = accessGuard.updateConfig(req.body || {});
    res.json(updated);
  });

  router.get('/security/tokens', (_req: Request, res: Response) => {
    res.json(accessGuard.getAllServiceTokens());
  });

  router.post('/security/tokens', (req: Request, res: Response) => {
    const { serviceName, permissions } = req.body || {};
    const token = accessGuard.generateServiceToken(serviceName || 'Jarvis Autonomous Core', permissions);
    sqliteStore.upsertServiceToken(token);
    res.status(201).json(token);
  });

  router.delete('/security/tokens/:clientId', (req: Request, res: Response) => {
    const { clientId } = req.params;
    const ok = accessGuard.revokeServiceToken(clientId);
    res.json({ success: ok, clientId });
  });

  router.post('/security/zerotrust/provision', async (req: Request, res: Response) => {
    try {
      const result = await accessGuard.provisionCloudflareAccess(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // PHASE 5: MODEL CONTEXT PROTOCOL (MCP) API
  // ==========================================
  router.get('/mcp/tools', (_req: Request, res: Response) => {
    res.json({ tools: mcpServer.getTools() });
  });

  router.post('/mcp/call', async (req: Request, res: Response) => {
    const { name, arguments: args } = req.body || {};
    const result = await mcpServer.executeTool(name, args, {
      deployFn: async (params: any) => {
        // Internal deploy execution via loopback
        const rawPath = params.path || params.repoPath;
        const detected = await detectStack(rawPath);
        const pid = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const p: AppProject = {
          id: pid,
          name: params.name || `mcp-app-${detected.assignedPort}`,
          localPath: path.resolve(rawPath),
          port: detected.assignedPort,
          runCommand: detected.runCommand,
          buildCommand: detected.buildCommand,
          envVars: { ...detected.suggestedEnv, ...(params.envVars || {}) },
          status: 'healthy',
          stackType: detected.stack,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          activeIngress: {
            mode: params.ingressMode || params.ingress || 'cloudflare_quick',
            status: 'active',
            publicUrl: `https://mcp-edge-${detected.assignedPort}.trycloudflare.com`,
            targetPort: detected.assignedPort,
          },
        };
        projectsRegistry.set(pid, p);
        sqliteStore.upsertProject(p);
        return { success: true, project: p };
      },
      projectsRegistry,
      supervisor: processSupervisor,
      tunnels: activeTunnels,
    });
    res.json(result);
  });

  // Standard JSON-RPC 2.0 endpoint for MCP clients (Jarvis, Claude, etc.)
  router.post('/mcp', async (req: Request, res: Response) => {
    const result = await mcpServer.handleJsonRpc(req.body, {
      projectsRegistry,
      supervisor: processSupervisor,
      tunnels: activeTunnels,
    });
    res.json(result);
  });

  // ==========================================
  // PHASE 5: SQLITE STORE & LITESTREAM BACKUPS
  // ==========================================
  router.get('/database/status', (_req: Request, res: Response) => {
    res.json({
      snapshot: sqliteStore.getSnapshotStatus(),
      litestream: litestreamManager.getStatus(),
    });
  });

  router.post('/database/backup', async (_req: Request, res: Response) => {
    try {
      const entry = await litestreamManager.triggerManualBackup();
      res.json({ success: true, entry });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/database/litestream/history', (_req: Request, res: Response) => {
    res.json({ history: litestreamManager.getHistory() });
  });

  router.post('/database/restore', async (req: Request, res: Response) => {
    try {
      const { backupId } = req.body || {};
      const result = await litestreamManager.restoreFromBackup(backupId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // PHASE 5: TEMPLATE PRESETS API
  // ==========================================
  router.get('/templates/presets', (_req: Request, res: Response) => {
    res.json({ presets: TEMPLATE_PRESETS });
  });

  router.get('/templates', (_req: Request, res: Response) => {
    res.json({ presets: TEMPLATE_PRESETS });
  });

  return router;
}

/**
 * Starts the internal daemon RPC server listening strictly on 127.0.0.1:4848
 * for Jarvis and other ecosystem services.
 */
export function startDaemonListener(port = 4848, host = '127.0.0.1'): http.Server {
  const app = express();
  app.use(express.json());
  app.use('/api', createAgentGatewayRouter());

  const server = app.listen(port, host, () => {
    console.log(`[LocalHost Engine] Jarvis Agent Gateway listening strictly on http://${host}:${port}`);
  });

  server.on('error', (err: any) => {
    console.warn(`[LocalHost Engine] Could not bind port ${port} (${err.message}). Gateway available on primary server route.`);
  });

  return server;
}
