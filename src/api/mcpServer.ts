/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { McpToolManifest, McpCallResponse } from '../core/types.ts';
import { sqliteStore } from '../db/store.ts';
import { litestreamManager } from '../db/litestream.ts';
import { accessGuard } from '../security/accessGuard.ts';

export const MCP_TOOLS_MANIFEST: McpToolManifest[] = [
  {
    name: 'deploy_service',
    description: 'Deploys a local repository onto LocalHost Engine edge runner with automatic stack detection and ingress tunnel creation.',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: {
          type: 'string',
          description: 'Absolute or workspace-relative path to the project directory.',
        },
        name: {
          type: 'string',
          description: 'Optional friendly name for the deployed service.',
        },
        ingress: {
          type: 'string',
          enum: ['none', 'cloudflare_quick', 'cloudflare_named', 'tailscale_serve', 'tailscale_funnel'],
          description: 'Ingress tunnel strategy to publish the service.',
        },
        envVars: {
          type: 'object',
          description: 'Key-value pairs of environment variables to inject.',
        },
      },
      required: ['repoPath'],
    },
  },
  {
    name: 'list_services',
    description: 'Lists all active and registered edge services with their status, loopback ports, and public ingress URLs.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'check_health',
    description: 'Queries real-time engine health, process supervisor state, CPU/RAM usage, and active tunnel statuses.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Optional project ID to inspect single service telemetry.',
        },
      },
    },
  },
  {
    name: 'restart_service',
    description: 'Triggers a rolling restart of a designated edge project supervisor process.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Unique ID of the project to restart.',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'stop_service',
    description: 'Stops a running edge service process and suspends its ingress tunnel.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Unique ID of the project to terminate.',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'kill_tunnel',
    description: 'Immediately disconnects and destroys an active Cloudflare or Tailscale tunnel for a specific service.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Unique ID of the project whose ingress tunnel should be killed.',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_service_logs',
    description: 'Fetches recent ring buffer standard output and standard error logs for a service.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Unique ID of the project.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of log lines to retrieve (default: 50).',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'backup_database',
    description: 'Executes an immediate ACID point-in-time SQLite snapshot and replicates it via Litestream to Cloudflare R2 / S3.',
    inputSchema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description: 'Force replication even if continuous WAL sync is in progress.',
        },
      },
    },
  },
  {
    name: 'configure_zero_trust',
    description: 'Updates Zero Trust edge security settings, Cloudflare Access headers validation, and Passkey rules.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Whether edge access guard is enabled.',
        },
        protectWithCloudflareAccess: {
          type: 'boolean',
          description: 'Verify CF-Access-Authenticated-User-Email and JWT assertions.',
        },
        ingressPasskeyRequired: {
          type: 'boolean',
          description: 'Require X-Edge-Passkey secret token for inbound requests.',
        },
        passkeySecret: {
          type: 'string',
          description: 'New passkey secret string.',
        },
      },
    },
  },
];

export class McpServerEngine {
  private static instance: McpServerEngine;

  private constructor() {}

  public static getInstance(): McpServerEngine {
    if (!McpServerEngine.instance) {
      McpServerEngine.instance = new McpServerEngine();
    }
    return McpServerEngine.instance;
  }

  public getTools(): McpToolManifest[] {
    return MCP_TOOLS_MANIFEST;
  }

  public async executeTool(
    name: string,
    args: Record<string, any> = {},
    context: {
      deployFn?: (params: any) => Promise<any>;
      projectsRegistry?: Map<string, any>;
      supervisor?: any;
      tunnels?: Map<string, any>;
    } = {}
  ): Promise<McpCallResponse> {
    try {
      switch (name) {
        case 'list_services': {
          const projects = context.projectsRegistry
            ? Array.from(context.projectsRegistry.values())
            : sqliteStore.getAllProjects();

          const summary = projects.map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            port: p.port,
            ingressMode: p.activeIngress.mode,
            publicUrl: p.activeIngress.publicUrl || null,
            localPath: p.localPath,
          }));

          return {
            content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
            result: summary,
          };
        }

        case 'check_health': {
          const memory = process.memoryUsage();
          const projects = context.projectsRegistry
            ? Array.from(context.projectsRegistry.values())
            : sqliteStore.getAllProjects();

          if (args.projectId) {
            const project = projects.find((p) => p.id === args.projectId);
            if (!project) {
              return {
                isError: true,
                error: `Project ${args.projectId} not found`,
                content: [{ type: 'text', text: `Error: Project ${args.projectId} not found` }],
              };
            }
            return {
              content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
              result: project,
            };
          }

          const health = {
            status: 'healthy',
            uptimeSeconds: Math.floor(process.uptime()),
            totalServices: projects.length,
            healthyServices: projects.filter((p) => p.status === 'healthy').length,
            memoryMb: {
              rss: Math.round(memory.rss / (1024 * 1024)),
              heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
            },
            sqliteSnapshot: sqliteStore.getSnapshotStatus(),
            litestream: litestreamManager.getStatus().state,
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(health, null, 2) }],
            result: health,
          };
        }

        case 'deploy_service': {
          if (!context.deployFn) {
            return {
              isError: true,
              error: 'Deployment runner handler not bound to MCP context',
              content: [{ type: 'text', text: 'Deployment engine not ready' }],
            };
          }

          const deployResult = await context.deployFn({
            path: args.repoPath,
            name: args.name,
            ingressMode: args.ingress || 'cloudflare_quick',
            envVars: args.envVars || {},
          });

          return {
            content: [
              {
                type: 'text',
                text: `Successfully deployed service '${deployResult.project?.name || args.name}'. Loopback port: ${deployResult.project?.port}, Public URL: ${deployResult.project?.activeIngress?.publicUrl || 'Pending'}`,
              },
            ],
            result: deployResult,
          };
        }

        case 'restart_service': {
          const { projectId } = args;
          if (!projectId) throw new Error('Missing required parameter: projectId');

          const project = context.projectsRegistry?.get(projectId);
          if (!project) throw new Error(`Project ${projectId} not found`);

          if (context.supervisor) {
            await context.supervisor.restart(projectId);
          }
          project.status = 'healthy';
          project.updatedAt = Date.now();
          sqliteStore.upsertProject(project);

          return {
            content: [{ type: 'text', text: `Service ${project.name} (${projectId}) restarted successfully.` }],
            result: { success: true, project },
          };
        }

        case 'stop_service': {
          const { projectId } = args;
          if (!projectId) throw new Error('Missing required parameter: projectId');

          const project = context.projectsRegistry?.get(projectId);
          if (!project) throw new Error(`Project ${projectId} not found`);

          if (context.supervisor) {
            await context.supervisor.stop(projectId);
          }
          const tunnel = context.tunnels?.get(projectId);
          if (tunnel) {
            await tunnel.stop();
            context.tunnels?.delete(projectId);
          }

          project.status = 'stopped';
          project.activeIngress.status = 'inactive';
          sqliteStore.upsertProject(project);

          return {
            content: [{ type: 'text', text: `Service ${project.name} (${projectId}) stopped.` }],
            result: { success: true, project },
          };
        }

        case 'kill_tunnel': {
          const { projectId } = args;
          if (!projectId) throw new Error('Missing required parameter: projectId');

          const project = context.projectsRegistry?.get(projectId);
          if (!project) throw new Error(`Project ${projectId} not found`);

          const tunnel = context.tunnels?.get(projectId);
          if (tunnel) {
            await tunnel.stop();
            context.tunnels?.delete(projectId);
          }

          project.activeIngress.status = 'inactive';
          project.activeIngress.publicUrl = undefined;
          sqliteStore.upsertProject(project);

          return {
            content: [{ type: 'text', text: `Ingress tunnel for service ${project.name} killed.` }],
            result: { success: true, activeIngress: project.activeIngress },
          };
        }

        case 'get_service_logs': {
          const { projectId, limit = 50 } = args;
          if (!projectId) throw new Error('Missing required parameter: projectId');

          const supervisor = context.supervisor;
          const logs = supervisor ? supervisor.getLogs(projectId, Number(limit)) : [];

          return {
            content: [
              {
                type: 'text',
                text: logs.map((l: any) => `[${l.stream.toUpperCase()}] ${new Date(l.timestamp).toLocaleTimeString()}: ${l.message}`).join('\n') || 'No logs recorded.',
              },
            ],
            result: { logs },
          };
        }

        case 'backup_database': {
          const backupEntry = await litestreamManager.triggerManualBackup();
          return {
            content: [
              {
                type: 'text',
                text: `SQLite snapshot completed and replicated to ${backupEntry.replicaTarget}. Size: ${backupEntry.sizeBytes} bytes, Checksum: ${backupEntry.checksum}`,
              },
            ],
            result: backupEntry,
          };
        }

        case 'configure_zero_trust': {
          const updated = accessGuard.updateConfig(args);
          return {
            content: [
              {
                type: 'text',
                text: `Zero Trust Edge Access Guard configuration updated: ${JSON.stringify(updated)}`,
              },
            ],
            result: updated,
          };
        }

        default:
          return {
            isError: true,
            error: `Unrecognized MCP tool: ${name}`,
            content: [{ type: 'text', text: `Tool '${name}' is not registered on this MCP server.` }],
          };
      }
    } catch (err: any) {
      return {
        isError: true,
        error: err.message,
        content: [{ type: 'text', text: `Execution failed: ${err.message}` }],
      };
    }
  }

  /**
   * Standard JSON-RPC 2.0 processor for Model Context Protocol
   */
  public async handleJsonRpc(
    body: any,
    context: any
  ): Promise<{ jsonrpc: '2.0'; id?: any; result?: any; error?: any }> {
    const id = body?.id ?? null;
    const method = body?.method;

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: this.getTools(),
        },
      };
    }

    if (method === 'tools/call') {
      const toolName = body.params?.name;
      const toolArgs = body.params?.arguments || {};
      const res = await this.executeTool(toolName, toolArgs, context);

      if (res.isError) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32000,
            message: res.error || 'Tool execution error',
            data: res,
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        result: res,
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  }
}

export const mcpServer = McpServerEngine.getInstance();
