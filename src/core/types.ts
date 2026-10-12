/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProjectStatus = 'idle' | 'building' | 'healthy' | 'crashed' | 'stopped';

export type IngressMode = 
  | 'none' 
  | 'cloudflare_quick' 
  | 'cloudflare_named' 
  | 'tailscale_serve' 
  | 'tailscale_funnel';

export type StackType = 'node' | 'python' | 'go' | 'static' | 'docker' | 'unknown';

export interface ProcessLog {
  id: string;
  timestamp: number;
  stream: 'stdout' | 'stderr' | 'system';
  message: string;
}

export interface IngressConfig {
  mode: IngressMode;
  domain?: string;
  tunnelToken?: string;
  publicUrl?: string;
  status: 'inactive' | 'provisioning' | 'active' | 'error';
  lastError?: string;
  targetPort?: number;
  startedAt?: number;
  tunnelId?: string;
}

export interface ProjectMetricPoint {
  timestamp: number;
  cpuPercent: number;
  memoryMb: number;
}

export interface GitWebhookConfig {
  secret: string;
  branch: string;
  autoDeploy: boolean;
  lastDeployedAt?: number;
  lastCommitHash?: string;
  lastCommitMessage?: string;
}

export interface AppProject {
  id: string;
  name: string;
  localPath: string;
  port: number;
  runCommand: string;
  buildCommand?: string;
  envVars: Record<string, string>;
  status: ProjectStatus;
  processId?: number;
  activeIngress: IngressConfig;
  stackType: StackType;
  packageManager?: string;
  createdAt: number;
  updatedAt: number;
  cpuPercent?: number;
  memoryMb?: number;
  uptimeSeconds?: number;
  healthcheckUrl?: string;
  lastHealthcheckStatus?: boolean;
  metricHistory?: ProjectMetricPoint[];
  restartCount?: number;
  maxRestarts?: number;
  lastRestartAt?: number;
  gitWebhook?: GitWebhookConfig;
}

export interface DetectedConfig {
  stack: StackType;
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'pip' | 'poetry' | 'uv' | 'docker' | 'unknown';
  buildCommand?: string;
  runCommand: string;
  assignedPort: number;
  entryFile?: string;
  suggestedEnv: Record<string, string>;
  warnings: string[];
  enforcedHost: string; // strictly '127.0.0.1'
}

export interface AgentDeployRequest {
  path: string;
  name?: string;
  ingressMode?: IngressMode;
  tunnelToken?: string;
  domain?: string;
  port?: number;
  runCommandOverride?: string;
  buildCommandOverride?: string;
  envVars?: Record<string, string>;
}

export interface AgentDeployResponse {
  success: boolean;
  message: string;
  projectId?: string;
  port?: number;
  publicUrl?: string;
  ingressMode?: IngressMode;
  status?: ProjectStatus;
  error?: string;
}

export interface SystemEngineStatus {
  engineVersion: string;
  status: 'running' | 'degraded' | 'maintenance';
  activeProjectsCount: number;
  totalProjectsCount: number;
  memoryUsageMb: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
  cpuLoadPercent: number;
  listeningInterface: string; // '127.0.0.1'
  gatewayPort: number; // 4848
  assignedPorts: number[];
  projects: AppProject[];
  uptimeSeconds: number;
  availableIngressDrivers: {
    cloudflared: boolean;
    tailscale: boolean;
  };
  activeSseClients?: number;
  authTokenPreview?: string;
  shieldActive?: boolean;
  isDaemon?: boolean;
}

export interface ProjectStatsSummary {
  projectId: string;
  name: string;
  port: number;
  status: ProjectStatus;
  currentCpuPercent: number;
  currentMemoryMb: number;
  avgCpuPercent: number;
  maxCpuPercent: number;
  avgMemoryMb: number;
  maxMemoryMb: number;
  history: ProjectMetricPoint[];
}

export interface StatsApiResponse {
  system: {
    timestamp: number;
    totalCpuPercent: number;
    totalMemoryMb: number;
    freeMemoryMb: number;
    totalSystemMemoryMb: number;
    uptimeSeconds: number;
    windowMinutes: number; // 30
  };
  projects: ProjectStatsSummary[];
}

export type JarvisEventType = 
  | 'project:build_started'
  | 'project:healthy'
  | 'project:crashed'
  | 'project:restarted'
  | 'project:git_deployed'
  | 'ingress:url_assigned'
  | 'system:panic_kill'
  | 'watchdog:restart_attempt'
  | 'alert:threshold_exceeded'
  | 'shield:throttled'
  | 'daemon:service_updated';

export interface JarvisEvent {
  id: string;
  type: JarvisEventType;
  timestamp: number;
  projectId?: string;
  data: Record<string, any>;
}

export interface CloudflareProvisionRequest {
  accountId: string;
  apiToken: string;
  zoneId: string;
  subdomain: string;
  domain: string;
  tunnelName: string;
  localPort: number;
}

export interface CloudflareProvisionResponse {
  success: boolean;
  tunnelId?: string;
  tunnelToken?: string;
  cnameRecord?: string;
  publicUrl?: string;
  message: string;
  error?: string;
}

// Phase 4 Types: Resource Alerts, Shielding, Daemon & Webhooks

export interface ResourceAlertConfig {
  enabled: boolean;
  cpuThresholdPercent: number; // default: 80%
  memoryThresholdMb: number; // default: 500 MB
  notifySound: boolean;
  autoThrottle: boolean;
}

export interface AlertEvent {
  id: string;
  timestamp: number;
  projectId: string;
  projectName: string;
  type: 'cpu' | 'memory';
  value: number;
  threshold: number;
  message: string;
}

export interface ShieldConfig {
  maxMemoryMbPerProject: number; // default: 1536 MB (1.5GB)
  minFreeMemoryPercent: number; // default: 10%
  rateLimitRequestsPerMin: number; // default: 120 req/min
  blockDirectoryTraversal: boolean;
}

export interface DaemonStatus {
  isDaemon: boolean;
  uptime: number;
  bootOnStartup: boolean;
  platform: 'windows' | 'linux' | 'darwin' | 'unknown';
  serviceFileLocation?: string;
  serviceName: string;
}

export interface GitDeployResult {
  success: boolean;
  message: string;
  commitHash?: string;
  branch: string;
  pulledAt: number;
  logs: string[];
}

// Phase 5 Types: Zero-Trust Access, Embedded SQLite, MCP & Template Presets

export interface ZeroTrustAccessConfig {
  enabled: boolean;
  protectWithCloudflareAccess: boolean;
  ingressPasskeyRequired: boolean;
  passkeySecret?: string;
  allowedEmails?: string[];
  serviceTokensCount: number;
}

export interface ServiceToken {
  id: string;
  serviceName: string;
  clientId: string;
  clientSecret: string;
  tokenHash: string;
  permissions: string[];
  createdAt: number;
  lastUsedAt?: number;
}

export interface McpToolManifest {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpCallRequest {
  method?: string;
  params?: {
    name: string;
    arguments?: Record<string, any>;
  };
  name?: string;
  arguments?: Record<string, any>;
}

export interface McpCallResponse {
  content?: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  result?: any;
  error?: string;
}

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  stackType: StackType;
  defaultPort: number;
  runCommand: string;
  buildCommand?: string;
  defaultPath: string;
  envVars: Record<string, string>;
  ingressMode: IngressMode;
  iconName: string;
  tags: string[];
}

export interface LitestreamConfig {
  enabled: boolean;
  replicaBucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  syncIntervalSeconds: number;
  lastReplicatedAt?: number;
}

export interface DatabaseSnapshotStatus {
  dbPath: string;
  sizeBytes: number;
  tablesCount: number;
  recordsCount: {
    projects: number;
    serviceTokens: number;
    incidentLogs: number;
    tunnelConfigs: number;
  };
  litestreamReplication: 'synced' | 'pending' | 'disabled';
  lastSnapshotTime: number;
}
