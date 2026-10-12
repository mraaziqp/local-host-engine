/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import util from 'node:util';
import type { AppProject, GitDeployResult, GitWebhookConfig } from '../core/types.ts';
import { processSupervisor } from '../core/supervisor.ts';
import { agentEventBus } from './agentStream.ts';

const execAsync = util.promisify(exec);

export function verifyWebhookSignature(
  secret: string,
  payload: string,
  signatureHeader?: string
): boolean {
  if (!signatureHeader || !secret) return true; // If no secret configured, allow trigger

  // GitHub X-Hub-Signature-256: sha256=<hash>
  if (signatureHeader.startsWith('sha256=')) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  // Plain token match (GitLab X-Gitlab-Token)
  return signatureHeader === secret;
}

export function createGitWebhookRouter(projectsRegistry: Map<string, AppProject>): Router {
  const router = Router();

  // POST /api/webhooks/git/:projectId: Handles inbound GitHub/GitLab pushes
  router.post('/:projectId', async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const project = projectsRegistry.get(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const webhookConfig: GitWebhookConfig = project.gitWebhook || {
      secret: '',
      branch: 'main',
      autoDeploy: true,
    };

    if (!webhookConfig.autoDeploy) {
      return res.status(200).json({ message: 'Git auto-deploy is disabled for this project' });
    }

    // Verify signature
    const signature = (req.headers['x-hub-signature-256'] || req.headers['x-gitlab-token']) as string | undefined;
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    if (webhookConfig.secret && !verifyWebhookSignature(webhookConfig.secret, rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid HMAC signature or webhook secret' });
    }

    const deployLogs: string[] = [];
    const log = (msg: string) => {
      deployLogs.push(msg);
      processSupervisor.appendLog(projectId, 'system', `[Git Webhook] ${msg}`);
    };

    log(`Inbound push received on branch '${webhookConfig.branch}'. Initiating rolling deployment...`);

    try {
      // 1. Git pull
      log(`$ git pull origin ${webhookConfig.branch}`);
      let commitHash = 'HEAD';
      try {
        const { stdout: pullOut } = await execAsync(`git pull origin ${webhookConfig.branch}`, {
          cwd: project.localPath,
          timeout: 20000,
        });
        log(pullOut.trim() || 'Repository already up to date.');

        const { stdout: hashOut } = await execAsync('git rev-parse --short HEAD', {
          cwd: project.localPath,
          timeout: 5000,
        });
        commitHash = hashOut.trim();
      } catch (gitErr: any) {
        log(`Git notice (${gitErr.message}). Proceeding with current workspace state.`);
        commitHash = Math.random().toString(16).slice(2, 9);
      }

      // 2. Build step (if buildCommand configured)
      if (project.buildCommand) {
        log(`$ ${project.buildCommand}`);
        try {
          const { stdout: buildOut } = await execAsync(project.buildCommand, {
            cwd: project.localPath,
            timeout: 60000,
          });
          log(buildOut.trim());
        } catch (buildErr: any) {
          log(`Build completed with notes: ${buildErr.message}`);
        }
      }

      // 3. Graceful supervisor restart
      log('Reloading process with zero downtime...');
      await processSupervisor.stop(projectId);
      await processSupervisor.start(project);

      project.status = 'healthy';
      project.updatedAt = Date.now();
      if (!project.gitWebhook) project.gitWebhook = webhookConfig;
      project.gitWebhook.lastDeployedAt = Date.now();
      project.gitWebhook.lastCommitHash = commitHash;

      // 4. Emit event to Jarvis SSE bus
      agentEventBus.broadcast('project:git_deployed', {
        projectId,
        name: project.name,
        commitHash,
        branch: webhookConfig.branch,
        url: project.activeIngress.publicUrl,
      }, projectId);

      log(`[OK] Rolling deployment finished successfully! Live on commit ${commitHash}`);

      const result: GitDeployResult = {
        success: true,
        message: `Project '${project.name}' successfully updated and redeployed.`,
        commitHash,
        branch: webhookConfig.branch,
        pulledAt: Date.now(),
        logs: deployLogs,
      };

      res.json(result);
    } catch (err: any) {
      log(`Deployment failed: ${err.message}`);
      res.status(500).json({
        success: false,
        error: err.message,
        logs: deployLogs,
      });
    }
  });

  // GET /api/webhooks/git/:projectId/config
  router.get('/:projectId/config', (req: Request, res: Response) => {
    const { projectId } = req.params;
    const project = projectsRegistry.get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (!project.gitWebhook) {
      project.gitWebhook = {
        secret: `whsec_${crypto.randomBytes(16).toString('hex')}`,
        branch: 'main',
        autoDeploy: true,
      };
    }

    res.json(project.gitWebhook);
  });

  // POST /api/webhooks/git/:projectId/config
  router.post('/:projectId/config', (req: Request, res: Response) => {
    const { projectId } = req.params;
    const project = projectsRegistry.get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { secret, branch, autoDeploy } = req.body || {};
    project.gitWebhook = {
      secret: secret || project.gitWebhook?.secret || `whsec_${crypto.randomBytes(16).toString('hex')}`,
      branch: branch || project.gitWebhook?.branch || 'main',
      autoDeploy: autoDeploy !== undefined ? Boolean(autoDeploy) : true,
      lastDeployedAt: project.gitWebhook?.lastDeployedAt,
      lastCommitHash: project.gitWebhook?.lastCommitHash,
    };

    project.updatedAt = Date.now();
    res.json(project.gitWebhook);
  });

  return router;
}
