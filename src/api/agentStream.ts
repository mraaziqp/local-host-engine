/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Request, type Response, type NextFunction } from 'express';
import EventEmitter from 'node:events';
import type { JarvisEvent, JarvisEventType } from '../core/types.ts';

class AgentEventBus extends EventEmitter {
  private static instance: AgentEventBus;
  private sseClients: Set<Response> = new Set();
  private defaultAuthToken = process.env.LOCAL_ENGINE_TOKEN || 'jarvis_secret_edge_token_2026';

  private constructor() {
    super();
  }

  public static getInstance(): AgentEventBus {
    if (!AgentEventBus.instance) {
      AgentEventBus.instance = new AgentEventBus();
    }
    return AgentEventBus.instance;
  }

  public getAuthToken(): string {
    return this.defaultAuthToken;
  }

  public getActiveClientCount(): number {
    return this.sseClients.size;
  }

  /**
   * Express middleware to validate optional Bearer token
   */
  public authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // If request has Authorization header, validate it
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      const token = parts.length === 2 ? parts[1] : parts[0];
      if (token && token !== this.defaultAuthToken && process.env.ENFORCE_AUTH === 'true') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid LocalHost Engine Agent Bearer Token',
        });
      }
    }
    next();
  };

  /**
   * Handles GET /api/events SSE stream connection
   */
  public handleSseConnection = (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
    this.sseClients.add(res);

    // Keep-alive heartbeat every 15s
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      this.sseClients.delete(res);
    });
  };

  /**
   * Broadcasts structured event to all active SSE subscribers
   */
  public broadcast(type: JarvisEventType, data: Record<string, any>, projectId?: string): JarvisEvent {
    const event: JarvisEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      timestamp: Date.now(),
      projectId,
      data,
    };

    const payload = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }

    this.emit('event', event);
    return event;
  }
}

export const agentEventBus = AgentEventBus.getInstance();
