/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import type { Request, Response, NextFunction } from 'express';
import type { 
  AppProject, 
  ShieldConfig, 
  ResourceAlertConfig, 
  AlertEvent 
} from './types.ts';
import { agentEventBus } from '../api/agentStream.ts';
import { processSupervisor } from './supervisor.ts';

const MAX_ALERT_HISTORY = 100;

export class HostShieldManager {
  private static instance: HostShieldManager;

  private shieldConfig: ShieldConfig = {
    maxMemoryMbPerProject: 1536, // 1.5 GB
    minFreeMemoryPercent: 10,
    rateLimitRequestsPerMin: 120,
    blockDirectoryTraversal: true,
  };

  private alertConfig: ResourceAlertConfig = {
    enabled: true,
    cpuThresholdPercent: 80, // 80% CPU
    memoryThresholdMb: 500, // 500 MB RAM
    notifySound: true,
    autoThrottle: false,
  };

  private alertHistory: AlertEvent[] = [];
  private rateLimitWindow: Map<string, number[]> = new Map(); // IP -> timestamps
  private isThrottlingActive = false;

  private constructor() {
    // Seed initial informational alert event for demonstration
    this.alertHistory.push({
      id: `alert-init-${Date.now()}`,
      timestamp: Date.now() - 300000,
      projectId: 'proj-edge-api',
      projectName: 'Apollo Telemetry API',
      type: 'cpu',
      value: 84.5,
      threshold: 80,
      message: 'Apollo Telemetry API CPU usage (84.5%) momentarily exceeded threshold (80%). Watchdog normalized execution.',
    });
  }

  public static getInstance(): HostShieldManager {
    if (!HostShieldManager.instance) {
      HostShieldManager.instance = new HostShieldManager();
    }
    return HostShieldManager.instance;
  }

  public getShieldConfig(): ShieldConfig {
    return { ...this.shieldConfig };
  }

  public updateShieldConfig(patch: Partial<ShieldConfig>): ShieldConfig {
    this.shieldConfig = { ...this.shieldConfig, ...patch };
    return this.getShieldConfig();
  }

  public getAlertConfig(): ResourceAlertConfig {
    return { ...this.alertConfig };
  }

  public updateAlertConfig(patch: Partial<ResourceAlertConfig>): ResourceAlertConfig {
    this.alertConfig = { ...this.alertConfig, ...patch };
    return this.getAlertConfig();
  }

  public getAlertHistory(): AlertEvent[] {
    return [...this.alertHistory];
  }

  public clearAlertHistory(): void {
    this.alertHistory = [];
  }

  /**
   * Evaluates project metrics against Resource Alerts thresholds and Host Memory limits
   */
  public evaluateProjectMetrics(project: AppProject, cpuPercent: number, memoryMb: number): void {
    // 1. Resource Alerts Check
    if (this.alertConfig.enabled) {
      if (cpuPercent >= this.alertConfig.cpuThresholdPercent) {
        this.triggerAlert(
          project,
          'cpu',
          cpuPercent,
          this.alertConfig.cpuThresholdPercent,
          `High CPU load detected: ${project.name} is running at ${cpuPercent}% (Threshold: ${this.alertConfig.cpuThresholdPercent}%)`
        );
      }

      if (memoryMb >= this.alertConfig.memoryThresholdMb) {
        this.triggerAlert(
          project,
          'memory',
          memoryMb,
          this.alertConfig.memoryThresholdMb,
          `High Memory consumption: ${project.name} is allocating ${memoryMb}MB (Threshold: ${this.alertConfig.memoryThresholdMb}MB)`
        );
      }
    }

    // 2. Host Shielding: Memory ceiling check
    if (memoryMb > this.shieldConfig.maxMemoryMbPerProject) {
      processSupervisor.appendLog(
        project.id,
        'stderr',
        `[HostShield] Memory cap exceeded (${memoryMb}MB > ${this.shieldConfig.maxMemoryMbPerProject}MB). Rolling process to prevent OS freezing.`
      );
      agentEventBus.broadcast('shield:throttled', {
        projectId: project.id,
        reason: 'Memory ceiling exceeded',
        memoryMb,
        limitMb: this.shieldConfig.maxMemoryMbPerProject,
      }, project.id);

      // Throttling or rolling process
      if (this.alertConfig.autoThrottle) {
        processSupervisor.stop(project.id).then(() => {
          setTimeout(() => processSupervisor.start(project), 1000);
        });
      }
    }

    // 3. System-wide free memory check
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const freePercent = (freeMem / totalMem) * 100;

    if (freePercent < this.shieldConfig.minFreeMemoryPercent && !this.isThrottlingActive) {
      this.isThrottlingActive = true;
      agentEventBus.broadcast('shield:throttled', {
        reason: 'Host free memory below critical threshold',
        freePercent: Number(freePercent.toFixed(1)),
        minRequiredPercent: this.shieldConfig.minFreeMemoryPercent,
      });
      setTimeout(() => {
        this.isThrottlingActive = false;
      }, 30000);
    }
  }

  private triggerAlert(
    project: AppProject,
    type: 'cpu' | 'memory',
    value: number,
    threshold: number,
    message: string
  ): void {
    // Throttle duplicate alerts within 30 seconds for the same project/type
    const lastAlert = this.alertHistory[0];
    if (
      lastAlert &&
      lastAlert.projectId === project.id &&
      lastAlert.type === type &&
      Date.now() - lastAlert.timestamp < 30000
    ) {
      return;
    }

    const alert: AlertEvent = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      projectId: project.id,
      projectName: project.name,
      type,
      value,
      threshold,
      message,
    };

    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > MAX_ALERT_HISTORY) {
      this.alertHistory.pop();
    }

    processSupervisor.appendLog(project.id, 'stderr', `[RESOURCE ALERT] ${message}`);

    agentEventBus.broadcast('alert:threshold_exceeded', {
      alertId: alert.id,
      projectId: project.id,
      projectName: project.name,
      type,
      value,
      threshold,
      message,
    }, project.id);
  }

  /**
   * Express middleware for Loopback Reverse Proxy & Ingress Rate Limiting
   * and Path Traversal Sanitization.
   */
  public shieldMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // 1. Directory Traversal and Path Sanitizer
    if (this.shieldConfig.blockDirectoryTraversal) {
      const decodedUrl = decodeURIComponent(req.originalUrl || req.url);
      const isDangerous = 
        decodedUrl.includes('..') ||
        decodedUrl.includes('/etc/') ||
        /^[a-zA-Z]:[/\\]/.test(decodedUrl) ||
        decodedUrl.includes('.env') ||
        decodedUrl.includes('.git');

      if (isDangerous) {
        return res.status(403).json({
          error: 'Forbidden by LocalHost Engine Shield',
          message: 'Directory traversal and sensitive path exposure are strictly blocked.',
        });
      }
    }

    // 2. Sliding Window Rate Limiter (by Client IP)
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    let timestamps = this.rateLimitWindow.get(clientIp) || [];
    // Discard old timestamps
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= this.shieldConfig.rateLimitRequestsPerMin) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit of ${this.shieldConfig.rateLimitRequestsPerMin} req/min exceeded.`,
        retryAfterSeconds: 60 - Math.floor((now - timestamps[0]) / 1000),
      });
    }

    timestamps.push(now);
    this.rateLimitWindow.set(clientIp, timestamps);

    next();
  };
}

export const hostShield = HostShieldManager.getInstance();
