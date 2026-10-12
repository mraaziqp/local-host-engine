/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Server,
  Cpu,
  HardDrive,
  Terminal,
  Globe,
  Play,
  Square,
  RotateCw,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  ShieldAlert,
  Layers,
  Activity,
  Folder,
  Code,
  RefreshCw,
  Plus,
  Clock,
  Zap,
  Radio,
  ArrowRight,
  TrendingUp,
  FileCode,
  Shield,
  Key,
  Bell,
  Sliders,
  CheckCircle2,
  GitBranch,
  Lock,
  Database,
  Bot,
  Sparkles,
  Search,
  X,
  Download,
} from 'lucide-react';
import type { 
  AppProject, 
  IngressMode, 
  ProcessLog, 
  SystemEngineStatus,
  AgentDeployRequest,
  JarvisEvent,
  CloudflareProvisionRequest,
  CloudflareProvisionResponse,
  TemplatePreset
} from './core/types.ts';
import { MetricsDashboard } from './components/MetricsDashboard.tsx';
import { ResourceAlertsPanel } from './components/ResourceAlertsPanel.tsx';
import { TemplateGallery } from './components/TemplateGallery.tsx';
import { ZeroTrustPanel } from './components/ZeroTrustPanel.tsx';
import { DatabaseStorePanel } from './components/DatabaseStorePanel.tsx';
import { McpPlayground } from './components/McpPlayground.tsx';

export default function App() {
  const [activeTab, setActiveTab] = useState<'fleet' | 'deploy' | 'metrics' | 'alerts' | 'security' | 'database' | 'mcp' | 'terminal' | 'ingress' | 'jarvis'>('fleet');
  const [systemStatus, setSystemStatus] = useState<SystemEngineStatus | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectLogs, setProjectLogs] = useState<ProcessLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'stdout' | 'stderr' | 'system'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latestEvent, setLatestEvent] = useState<JarvisEvent | null>(null);
  const [gitDeployingId, setGitDeployingId] = useState<string | null>(null);

  // Deploy form state & preset selection
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>('nextjs-app');
  const [deployPath, setDeployPath] = useState<string>('/samples/nextjs-app');
  const [deployName, setDeployName] = useState<string>('Next.js 15 App Router');
  const [deployPort, setDeployPort] = useState<number>(3110);
  const [deployRunCommand, setDeployRunCommand] = useState<string>('node server.js');
  const [deployBuildCommand, setDeployBuildCommand] = useState<string>('npm run build');
  const [deployIngressMode, setDeployIngressMode] = useState<IngressMode>('cloudflare_quick');
  const [tunnelToken, setTunnelToken] = useState<string>('');
  const [customDomain, setCustomDomain] = useState<string>('');
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>([
    { key: 'NODE_ENV', value: 'production' },
    { key: 'PORT', value: '3110' },
    { key: 'HOST', value: '127.0.0.1' },
  ]);

  const handleSelectPreset = (preset: TemplatePreset) => {
    setSelectedPresetId(preset.id);
    setDeployPath(preset.defaultPath);
    setDeployName(preset.name);
    setDeployPort(preset.defaultPort);
    setDeployRunCommand(preset.runCommand);
    setDeployBuildCommand(preset.buildCommand || '');
    setDeployIngressMode(preset.ingressMode);
    if (preset.envVars) {
      setEnvPairs(Object.entries(preset.envVars).map(([key, value]) => ({ key, value })));
    }
  };

  // Cloudflare Zero Trust Wizard State
  const [cfAccountId, setCfAccountId] = useState<string>('cf_acc_902481');
  const [cfApiToken, setCfApiToken] = useState<string>('');
  const [cfZoneId, setCfZoneId] = useState<string>('cf_zone_88120');
  const [cfSubdomain, setCfSubdomain] = useState<string>('api-edge');
  const [cfDomain, setCfDomain] = useState<string>('internaldev.net');
  const [cfTunnelName, setCfTunnelName] = useState<string>('edge-core-tunnel');
  const [cfPort, setCfPort] = useState<number>(3105);
  const [cfProvisionLoading, setCfProvisionLoading] = useState<boolean>(false);
  const [cfProvisionResult, setCfProvisionResult] = useState<CloudflareProvisionResponse | null>(null);

  // Jarvis RPC Playground state
  const [rpcEndpoint, setRpcEndpoint] = useState<'/api/status' | '/api/deploy' | '/api/kill-all' | '/api/jarvis/deploy'>('/api/jarvis/deploy');
  const [rpcPayload, setRpcPayload] = useState<string>(
    JSON.stringify(
      {
        repoPath: '/samples/node-api',
        name: 'jarvis-injected-service',
        ingress: 'cloudflare_quick',
      },
      null,
      2
    )
  );
  const [rpcResponse, setRpcResponse] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data: SystemEngineStatus = await res.json();
        setSystemStatus(data);
        if (!selectedProjectId && data.projects.length > 0) {
          setSelectedProjectId(data.projects[0].id);
        }
      }
    } catch {
      // In standalone frontend or initial load
    }
  };

  const fetchLogs = async (projId: string) => {
    try {
      const res = await fetch(`/api/projects/${projId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setProjectLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  };

  // Connect to SSE event bus
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed && parsed.type !== 'connected') {
            setLatestEvent(parsed);
          }
        } catch {
          // ignore
        }
      };

      const eventTypes = [
        'project:build_started',
        'project:healthy',
        'project:crashed',
        'project:restarted',
        'project:git_deployed',
        'ingress:url_assigned',
        'system:panic_kill',
        'watchdog:restart_attempt',
        'alert:threshold_exceeded',
        'shield:throttled',
        'daemon:service_updated',
      ];

      eventTypes.forEach((evt) => {
        eventSource?.addEventListener(evt, (e: any) => {
          try {
            const parsed = JSON.parse(e.data);
            setLatestEvent(parsed);
            fetchStatus();
          } catch {
            // ignore
          }
        });
      });
    } catch {
      // SSE not available
    }

    return () => {
      clearInterval(interval);
      if (eventSource) eventSource.close();
    };
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchLogs(selectedProjectId);
      const logInterval = setInterval(() => {
        fetchLogs(selectedProjectId);
      }, 1500);
      return () => clearInterval(logInterval);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [projectLogs, autoScroll]);

  const handleStartProject = async (id: string) => {
    setIsLoading(true);
    try {
      await fetch(`/api/projects/${id}/start`, { method: 'POST' });
      await fetchStatus();
      if (selectedProjectId === id) fetchLogs(id);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopProject = async (id: string) => {
    setIsLoading(true);
    try {
      await fetch(`/api/projects/${id}/stop`, { method: 'POST' });
      await fetchStatus();
      if (selectedProjectId === id) fetchLogs(id);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKillAll = async () => {
    if (!window.confirm('Emergency Killswitch: Terminate all child processes and ingress tunnels?')) {
      return;
    }
    setIsLoading(true);
    try {
      await fetch('/api/kill-all', { method: 'POST' });
      await fetchStatus();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeploySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    const envVarsObj: Record<string, string> = {};
    envPairs.forEach((p) => {
      if (p.key.trim()) envVarsObj[p.key.trim()] = p.value;
    });

    const payload: AgentDeployRequest = {
      path: deployPath,
      name: deployName || undefined,
      ingressMode: deployIngressMode,
      port: deployPort || undefined,
      runCommandOverride: deployRunCommand || undefined,
      buildCommandOverride: deployBuildCommand || undefined,
      tunnelToken: tunnelToken || undefined,
      domain: customDomain || undefined,
      envVars: envVarsObj,
    };

    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Deployment error');
      }
      await fetchStatus();
      if (data.projectId) {
        setSelectedProjectId(data.projectId);
        setActiveTab('fleet');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloudflareProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setCfProvisionLoading(true);
    setCfProvisionResult(null);

    const payload: CloudflareProvisionRequest = {
      accountId: cfAccountId,
      apiToken: cfApiToken || 'mock_cf_token_prod_sec',
      zoneId: cfZoneId,
      subdomain: cfSubdomain,
      domain: cfDomain,
      tunnelName: cfTunnelName,
      localPort: cfPort,
    };

    try {
      const res = await fetch('/api/cloudflare/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: CloudflareProvisionResponse = await res.json();
      setCfProvisionResult(data);
      await fetchStatus();
    } catch (err: any) {
      setCfProvisionResult({
        success: false,
        message: err.message,
        error: err.message,
      });
    } finally {
      setCfProvisionLoading(false);
    }
  };

  const handleTriggerGitDeploy = async (projectId: string) => {
    setGitDeployingId(projectId);
    try {
      const res = await fetch(`/api/webhooks/git/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'refs/heads/main', simulated: true }),
      });
      await res.json();
      await fetchStatus();
      if (selectedProjectId === projectId) fetchLogs(projectId);
    } catch {
      // ignore
    } finally {
      setGitDeployingId(null);
    }
  };

  const executeRpcTest = async () => {
    setRpcResponse('Executing request to Agent Gateway on 127.0.0.1:4848...');
    try {
      let res: globalThis.Response;
      if (rpcEndpoint === '/api/status') {
        res = await fetch('/api/status');
      } else {
        res = await fetch(rpcEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: rpcPayload,
        });
      }
      const data = await res.json();
      setRpcResponse(JSON.stringify(data, null, 2));
      await fetchStatus();
    } catch (err: any) {
      setRpcResponse(JSON.stringify({ error: err.message }, null, 2));
    }
  };

  const activeProjects = systemStatus?.projects || [];
  const selectedProject = activeProjects.find((p) => p.id === selectedProjectId);

  const filteredLogs = projectLogs.filter((log) => {
    if (logFilter !== 'all' && log.stream !== logFilter) {
      return false;
    }
    if (logSearchQuery.trim()) {
      const q = logSearchQuery.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchStream = log.stream.toLowerCase().includes(q);
      return matchMsg || matchStream;
    }
    return true;
  });

  const renderHighlightedText = (text: string, query: string) => {
    if (!query.trim()) return text;
    try {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
      if (parts.length <= 1) return text;
      return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-amber-400/30 text-amber-200 font-semibold px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      );
    } catch {
      return text;
    }
  };

  const handleDownloadFilteredLogs = () => {
    if (filteredLogs.length === 0) return;
    const currentProj = activeProjects.find((p) => p.id === selectedProjectId);
    const projName = (currentProj?.name || selectedProjectId || 'project')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${projName}-logs-${timestamp}.txt`;

    const logLines = filteredLogs.map((log) => {
      const timeStr = new Date(log.timestamp).toISOString();
      const streamStr = log.stream.toUpperCase().padEnd(6);
      return `[${timeStr}] [${streamStr}] ${log.message}`;
    });

    const fileHeader = [
      '========================================================================',
      'LocalHost Engine - Live Terminal Log Export',
      `Project: ${currentProj?.name || selectedProjectId || 'Unknown'} (ID: ${selectedProjectId || 'none'})`,
      `Export Timestamp: ${new Date().toISOString()}`,
      `Stream Filter: ${logFilter.toUpperCase()}`,
      `Keyword Query: ${logSearchQuery || '(none)'}`,
      `Exported Lines: ${filteredLogs.length} / ${projectLogs.length} total entries`,
      '========================================================================',
      '',
    ].join('\n');

    const fullContent = `${fileHeader}\n${logLines.join('\n')}\n`;
    const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Server className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-slate-900 rounded-full animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">LocalHost Engine</h1>
              <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                Phase 4 Shielded
              </span>
              <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                Daemon Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span>Binding: <code className="text-cyan-300 font-mono">127.0.0.1</code></span>
              <span>•</span>
              <span>Gateway: <code className="text-emerald-400 font-mono">:4848</code></span>
              <span>•</span>
              <span>Reverse Proxy Shield: <span className="text-emerald-400 font-mono">Active</span></span>
            </p>
          </div>
        </div>

        {/* System Stats Bar */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/60 border border-slate-700/50">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">CPU</span>
            <span className="text-slate-200 font-semibold">{systemStatus?.cpuLoadPercent ?? 1.2}%</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/60 border border-slate-700/50">
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">RAM</span>
            <span className="text-slate-200 font-semibold">
              {systemStatus?.memoryUsageMb?.heapUsed ?? 48} MB
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/60 border border-slate-700/50">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Ports</span>
            <span className="text-amber-300 font-semibold">
              {systemStatus?.assignedPorts?.length || 0} bound
            </span>
          </div>

          <button
            onClick={fetchStatus}
            title="Refresh Daemon Status"
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Emergency Killswitch */}
          <button
            onClick={handleKillAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-950/70 hover:bg-red-900 border border-red-700/60 text-red-300 hover:text-red-100 font-semibold transition-all shadow-sm"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>Kill All</span>
          </button>
        </div>
      </header>

      {/* Live Event Ticker Banner */}
      {latestEvent && (
        <div className={`border-b px-6 py-1.5 text-xs font-mono flex items-center justify-between gap-4 transition-colors ${
          latestEvent.type === 'alert:threshold_exceeded'
            ? 'bg-amber-950/80 border-amber-800 text-amber-200'
            : latestEvent.type === 'shield:throttled'
            ? 'bg-red-950/80 border-red-800 text-red-200'
            : 'bg-slate-900 border-cyan-900/60 text-slate-300'
        }`}>
          <div className="flex items-center gap-2 truncate">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              latestEvent.type === 'alert:threshold_exceeded' ? 'bg-amber-400 animate-ping' : 'bg-cyan-400 animate-ping'
            }`} />
            <span className="font-bold shrink-0">
              {latestEvent.type === 'alert:threshold_exceeded' ? 'RESOURCE ALERT:' : 'JARVIS EVENT:'}
            </span>
            <span className="font-semibold shrink-0">[{latestEvent.type}]</span>
            <span className="truncate opacity-90">
              {JSON.stringify(latestEvent.data)}
            </span>
          </div>
          <span className="text-[10px] opacity-70 shrink-0">
            {new Date(latestEvent.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-slate-800/80 bg-slate-900/40 px-6 flex items-center justify-between overflow-x-auto">
        <div className="flex items-center gap-1 py-1">
          <button
            onClick={() => setActiveTab('fleet')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              activeTab === 'fleet'
                ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Edge Fleet</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-700 text-[10px] text-slate-300">
              {activeProjects.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('deploy')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              activeTab === 'deploy'
                ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Deploy Project</span>
          </button>

          <button
            onClick={() => setActiveTab('metrics')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              activeTab === 'metrics'
                ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span>Metrics (D3.js)</span>
            <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-[10px] text-cyan-400 font-mono border border-cyan-800/50">
              30m
            </span>
          </button>

          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              activeTab === 'alerts'
                ? 'bg-slate-800 text-amber-300 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Bell className="w-4 h-4 text-amber-400" />
            <span>Resource Alerts & Shield</span>
            <span className="px-1.5 py-0.2 rounded bg-amber-950 text-[10px] text-amber-300 font-mono border border-amber-800/50">
              P4
            </span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              activeTab === 'security'
                ? 'bg-slate-800 text-indigo-300 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Shield className="w-4 h-4 text-indigo-400" />
            <span>Edge Zero-Trust</span>
            <span className="px-1.5 py-0.2 rounded bg-indigo-950 text-[10px] text-indigo-300 font-mono border border-indigo-800/50">
              P5
            </span>
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              activeTab === 'database'
                ? 'bg-slate-800 text-sky-300 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Database className="w-4 h-4 text-sky-400" />
            <span>SQLite & Litestream</span>
            <span className="px-1.5 py-0.2 rounded bg-sky-950 text-[10px] text-sky-300 font-mono border border-sky-800/50">
              WAL
            </span>
          </button>

          <button
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              activeTab === 'mcp'
                ? 'bg-slate-800 text-violet-300 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Bot className="w-4 h-4 text-violet-400" />
            <span>Jarvis MCP Protocol</span>
            <span className="px-1.5 py-0.2 rounded bg-violet-950 text-[10px] text-violet-300 font-mono border border-violet-800/50">
              JSON-RPC
            </span>
          </button>

          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              activeTab === 'terminal'
                ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Terminal className="w-4 h-4 text-amber-400" />
            <span>Live Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab('ingress')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              activeTab === 'ingress'
                ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Globe className="w-4 h-4 text-cyan-400" />
            <span>Ingress & Tunnels</span>
          </button>

          <button
            onClick={() => setActiveTab('jarvis')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-all ${
              activeTab === 'jarvis'
                ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>Jarvis Agent RPC</span>
            <span className="text-[10px] text-emerald-400 font-mono">127.0.0.1:4848</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-mono hidden md:block">
          Ingress Range: 3100-3999
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">✕</button>
          </div>
        )}

        {/* TAB 1: FLEET & PROJECTS */}
        {activeTab === 'fleet' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  Active Edge Instances
                  <span className="text-xs font-normal text-slate-400">
                    ({activeProjects.length} registered)
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Microservices running strictly on 127.0.0.1, reverse-proxy rate-limited, and continuous git-deployable.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('alerts')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-mono transition-colors"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  <span>Alerts & Shield</span>
                </button>
                <button
                  onClick={() => setActiveTab('metrics')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-mono transition-colors"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>D3 Metrics</span>
                </button>
                <button
                  onClick={() => setActiveTab('deploy')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs transition-colors shadow-lg shadow-cyan-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Launch New Service</span>
                </button>
              </div>
            </div>

            {/* Quick Demo Launchers */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Quick-Deploy Test Stacks (One-Click Auto-Detection & Tunneling)
                </span>
                <span className="text-[11px] text-slate-500">Self-contained repo samples</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => {
                    setDeployPath('/samples/node-api');
                    setDeployName('Edge Node API');
                    setDeployIngressMode('cloudflare_quick');
                    setActiveTab('deploy');
                  }}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                      <Code className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300">Node.js Express</div>
                      <div className="text-[10px] text-slate-400 font-mono">/samples/node-api</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-transform group-hover:translate-x-0.5" />
                </button>

                <button
                  onClick={() => {
                    setDeployPath('/samples/python-fastapi');
                    setDeployName('Python FastAPI Worker');
                    setDeployIngressMode('tailscale_funnel');
                    setActiveTab('deploy');
                  }}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/40">
                      <FileCode className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300">Python FastAPI</div>
                      <div className="text-[10px] text-slate-400 font-mono">/samples/python-fastapi</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-transform group-hover:translate-x-0.5" />
                </button>

                <button
                  onClick={() => {
                    setDeployPath('/samples/static-site');
                    setDeployName('Edge Static HTML');
                    setDeployIngressMode('cloudflare_quick');
                    setActiveTab('deploy');
                  }}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded bg-purple-950 text-purple-400 border border-purple-800/40">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-purple-300">Static HTML Edge</div>
                      <div className="text-[10px] text-slate-400 font-mono">/samples/static-site</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>

            {/* Projects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeProjects.map((project) => {
                const isHealthy = project.status === 'healthy';
                const isBuilding = project.status === 'building';
                const isCrashed = project.status === 'crashed';
                const webhookUrl = `http://127.0.0.1:4848/api/webhooks/git/${project.id}`;

                return (
                  <div
                    key={project.id}
                    className={`rounded-xl border transition-all ${
                      selectedProjectId === project.id
                        ? 'border-cyan-500/80 bg-slate-900 shadow-lg shadow-cyan-950/40'
                        : 'border-slate-800/90 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                    } flex flex-col justify-between overflow-hidden`}
                  >
                    <div className="p-4 space-y-3">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isHealthy
                                ? 'bg-emerald-400 ring-4 ring-emerald-950'
                                : isBuilding
                                ? 'bg-amber-400 animate-pulse ring-4 ring-amber-950'
                                : isCrashed
                                ? 'bg-red-400 ring-4 ring-red-950'
                                : 'bg-slate-500'
                            }`}
                          />
                          <div>
                            <h3 className="font-semibold text-sm text-white">{project.name}</h3>
                            <span className="text-[11px] font-mono text-slate-400 block truncate max-w-[200px]" title={project.localPath}>
                              {project.localPath}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-semibold border ${
                            isHealthy
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                              : isBuilding
                              ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                              : isCrashed
                              ? 'bg-red-950/60 text-red-300 border-red-800'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {project.status}
                        </span>
                      </div>

                      {/* Ports & Metadata */}
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                        <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                          <span className="text-slate-500 block text-[10px]">LOOPBACK PORT</span>
                          <span className="text-cyan-400 font-semibold">: {project.port}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                          <span className="text-slate-500 block text-[10px]">PROCESS PID</span>
                          <span className="text-slate-300 font-semibold">{project.processId || 'Isolated'}</span>
                        </div>
                      </div>

                      {/* Ingress URL Section */}
                      <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/90 text-xs">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-slate-400 flex items-center gap-1">
                            <Globe className="w-3 h-3 text-cyan-400" />
                            {project.activeIngress.mode.replace('_', ' ').toUpperCase()}
                          </span>
                          <span
                            className={`text-[10px] font-mono ${
                              project.activeIngress.status === 'active'
                                ? 'text-emerald-400'
                                : project.activeIngress.status === 'provisioning'
                                ? 'text-amber-400'
                                : 'text-slate-500'
                            }`}
                          >
                            ● {project.activeIngress.status}
                          </span>
                        </div>

                        {project.activeIngress.publicUrl ? (
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <a
                              href={project.activeIngress.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-300 hover:text-cyan-200 font-mono text-[11px] truncate underline underline-offset-2 flex items-center gap-1"
                            >
                              <span>{project.activeIngress.publicUrl}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                            <button
                              onClick={() => copyToClipboard(project.activeIngress.publicUrl!, project.id)}
                              className="p-1 text-slate-400 hover:text-white"
                              title="Copy Public URL"
                            >
                              {copiedText === project.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-500 italic">No external tunnel bound</div>
                        )}
                      </div>

                      {/* Git Webhook CD Trigger Field */}
                      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] font-mono space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 flex items-center gap-1">
                            <GitBranch className="w-3 h-3 text-emerald-400" />
                            Continuous Git Deploy Webhook
                          </span>
                          <button
                            onClick={() => handleTriggerGitDeploy(project.id)}
                            disabled={gitDeployingId === project.id}
                            className="text-cyan-400 hover:underline flex items-center gap-0.5"
                          >
                            {gitDeployingId === project.id ? (
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <span>Simulate Push</span>
                            )}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2 bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                          <span className="text-slate-400 truncate text-[10px]">{webhookUrl}</span>
                          <button
                            onClick={() => copyToClipboard(webhookUrl, `wh-${project.id}`)}
                            className="p-0.5 text-slate-400 hover:text-white shrink-0"
                            title="Copy Webhook URL"
                          >
                            {copiedText === `wh-${project.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="border-t border-slate-800/80 bg-slate-950/40 p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isHealthy ? (
                          <button
                            onClick={() => handleStopProject(project.id)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-red-950/60 hover:bg-red-900 border border-red-800/60 text-red-300 transition-colors"
                          >
                            <Square className="w-3 h-3" />
                            <span>Stop</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartProject(project.id)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 transition-colors"
                          >
                            <Play className="w-3 h-3" />
                            <span>Start</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setSelectedProjectId(project.id);
                            fetchLogs(project.id);
                            setActiveTab('terminal');
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          <Terminal className="w-3 h-3 text-amber-400" />
                          <span>Logs</span>
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          setActiveTab('ingress');
                        }}
                        className="text-xs text-cyan-400 hover:text-cyan-300 underline font-mono text-[11px]"
                      >
                        Ingress Setup →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: DEPLOY PROJECT FORM */}
        {activeTab === 'deploy' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Deploy Local Repo to Edge Server
              </h2>
              <p className="text-xs text-slate-400">
                Select a pre-configured stack preset below or specify custom directory coordinates with strict loopback bindings.
              </p>
            </div>

            {/* Template Gallery with Stack Presets */}
            <TemplateGallery
              onSelectPreset={handleSelectPreset}
              selectedPresetId={selectedPresetId}
            />

            <form onSubmit={handleDeploySubmit} className="space-y-5 p-6 rounded-xl bg-slate-900/70 border border-slate-800 shadow-xl">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Directory Path (Absolute or Workspace Relative)</span>
                  <span className="text-[11px] text-slate-500 font-mono">Strict 127.0.0.1 binding</span>
                </label>
                <div className="relative">
                  <Folder className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={deployPath}
                    onChange={(e) => setDeployPath(e.target.value)}
                    required
                    placeholder="/workspace/my-api"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Service Name
                </label>
                <input
                  type="text"
                  value={deployName}
                  onChange={(e) => setDeployName(e.target.value)}
                  placeholder="e.g. Telemetry Backend"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Localhost Port</span>
                    <span className="text-[10px] text-cyan-400 font-mono">127.0.0.1</span>
                  </label>
                  <input
                    type="number"
                    value={deployPort}
                    onChange={(e) => setDeployPort(Number(e.target.value))}
                    required
                    min={1024}
                    max={65535}
                    placeholder="3110"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-cyan-300 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Start / Run Command
                  </label>
                  <input
                    type="text"
                    value={deployRunCommand}
                    onChange={(e) => setDeployRunCommand(e.target.value)}
                    placeholder="node server.js"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Build Command (Optional)
                  </label>
                  <input
                    type="text"
                    value={deployBuildCommand}
                    onChange={(e) => setDeployBuildCommand(e.target.value)}
                    placeholder="npm run build"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  External Network Ingress Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      deployIngressMode === 'cloudflare_quick'
                        ? 'border-cyan-500 bg-cyan-950/30'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ingressMode"
                      value="cloudflare_quick"
                      checked={deployIngressMode === 'cloudflare_quick'}
                      onChange={() => setDeployIngressMode('cloudflare_quick')}
                      className="mt-0.5 text-cyan-500 focus:ring-0"
                    />
                    <div>
                      <div className="text-xs font-semibold text-white">Cloudflare Quick Tunnel</div>
                      <div className="text-[11px] text-slate-400">
                        Ephemeral HTTPS <code className="text-cyan-400 font-mono">*.trycloudflare.com</code> URL without account configuration.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      deployIngressMode === 'tailscale_funnel'
                        ? 'border-emerald-500 bg-emerald-950/30'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ingressMode"
                      value="tailscale_funnel"
                      checked={deployIngressMode === 'tailscale_funnel'}
                      onChange={() => setDeployIngressMode('tailscale_funnel')}
                      className="mt-0.5 text-emerald-500 focus:ring-0"
                    />
                    <div>
                      <div className="text-xs font-semibold text-white">Tailscale Funnel</div>
                      <div className="text-[11px] text-slate-400">
                        Public HTTPS ingress exposed via your Tailnet <code className="text-emerald-400 font-mono">*.ts.net</code> name.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      deployIngressMode === 'tailscale_serve'
                        ? 'border-emerald-500 bg-emerald-950/30'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ingressMode"
                      value="tailscale_serve"
                      checked={deployIngressMode === 'tailscale_serve'}
                      onChange={() => setDeployIngressMode('tailscale_serve')}
                      className="mt-0.5 text-emerald-500 focus:ring-0"
                    />
                    <div>
                      <div className="text-xs font-semibold text-white">Tailscale Serve (Mesh Only)</div>
                      <div className="text-[11px] text-slate-400">
                        Private peer-to-peer wireguard mesh access restricted to your tailnet devices.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      deployIngressMode === 'cloudflare_named'
                        ? 'border-cyan-500 bg-cyan-950/30'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ingressMode"
                      value="cloudflare_named"
                      checked={deployIngressMode === 'cloudflare_named'}
                      onChange={() => setDeployIngressMode('cloudflare_named')}
                      className="mt-0.5 text-cyan-500 focus:ring-0"
                    />
                    <div>
                      <div className="text-xs font-semibold text-white">Cloudflare Named Tunnel</div>
                      <div className="text-[11px] text-slate-400">
                        Persistent custom domain using Cloudflare Zero Trust tunnel token.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {deployIngressMode === 'cloudflare_named' && (
                <div className="space-y-3 p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Tunnel Token
                    </label>
                    <input
                      type="password"
                      value={tunnelToken}
                      onChange={(e) => setTunnelToken(e.target.value)}
                      placeholder="eyJhIjoiNj..."
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Custom Subdomain / Domain
                    </label>
                    <input
                      type="text"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="api.mydomain.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Environment Variables
                  </label>
                  <button
                    type="button"
                    onClick={() => setEnvPairs([...envPairs, { key: '', value: '' }])}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono"
                  >
                    <Plus className="w-3 h-3" /> Add Variable
                  </button>
                </div>
                <div className="space-y-2">
                  {envPairs.map((pair, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="KEY"
                        value={pair.key}
                        onChange={(e) => {
                          const updated = [...envPairs];
                          updated[idx].key = e.target.value;
                          setEnvPairs(updated);
                        }}
                        className="w-1/3 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-cyan-300"
                      />
                      <input
                        type="text"
                        placeholder="VALUE"
                        value={pair.value}
                        onChange={(e) => {
                          const updated = [...envPairs];
                          updated[idx].value = e.target.value;
                          setEnvPairs(updated);
                        }}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEnvPairs(envPairs.filter((_, i) => i !== idx));
                        }}
                        className="p-1 text-slate-500 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs tracking-wide uppercase transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Detecting Stack & Orchestrating Ingress...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Deploy to LocalHost Engine</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: D3 METRICS */}
        {activeTab === 'metrics' && (
          <MetricsDashboard />
        )}

        {/* TAB 4: RESOURCE ALERTS & SHIELD (PHASE 4) */}
        {activeTab === 'alerts' && (
          <ResourceAlertsPanel />
        )}

        {/* TAB: EDGE ZERO-TRUST ACCESS GUARD (PHASE 5) */}
        {activeTab === 'security' && (
          <ZeroTrustPanel />
        )}

        {/* TAB: SQLITE STATE & LITESTREAM REPLICATION (PHASE 5) */}
        {activeTab === 'database' && (
          <DatabaseStorePanel />
        )}

        {/* TAB: JARVIS MCP PROTOCOL INTERFACE (PHASE 5) */}
        {activeTab === 'mcp' && (
          <McpPlayground />
        )}

        {/* TAB 5: REAL-TIME TERMINAL */}
        {activeTab === 'terminal' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                </div>
                <span className="text-xs font-mono font-semibold text-slate-300">
                  Process Ring Buffer Terminal (Safe Stream Decoded)
                </span>
                {logSearchQuery ? (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 flex items-center gap-1">
                    <Search className="w-3 h-3 text-cyan-400" />
                    <span>{filteredLogs.length} / {projectLogs.length} matched</span>
                  </span>
                ) : projectLogs.length > 0 ? (
                  <span className="text-[11px] font-mono text-slate-500">
                    {filteredLogs.length} lines
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Search Bar for Log Output */}
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="Search logs by keyword..."
                    className="bg-slate-950 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 rounded pl-8 pr-7 py-1 font-mono focus:outline-none focus:border-cyan-500 w-44 sm:w-64 transition-all"
                  />
                  {logSearchQuery && (
                    <button
                      onClick={() => setLogSearchQuery('')}
                      className="absolute right-2 text-slate-400 hover:text-white p-0.5"
                      title="Clear keyword search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <span className="text-xs text-slate-400 font-mono">Stream:</span>
                <select
                  value={selectedProjectId || ''}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    fetchLogs(e.target.value);
                  }}
                  className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1 font-mono focus:outline-none"
                >
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (:{p.port})
                    </option>
                  ))}
                </select>

                <div className="flex rounded border border-slate-800 p-0.5 bg-slate-950 text-[11px] font-mono">
                  {(['all', 'stdout', 'stderr', 'system'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setLogFilter(filter)}
                      className={`px-2 py-0.5 rounded capitalize transition-colors ${
                        logFilter === filter ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors ${
                    autoScroll ? 'bg-cyan-950 text-cyan-400 border-cyan-800' : 'bg-slate-950 text-slate-500 border-slate-800'
                  }`}
                >
                  Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
                </button>

                <button
                  onClick={handleDownloadFilteredLogs}
                  disabled={filteredLogs.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded border transition-colors bg-slate-950 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Download visible filtered log entries as .txt file"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export .txt</span>
                </button>

                <button
                  onClick={() => setProjectLogs([])}
                  className="p-1 text-slate-400 hover:text-white"
                  title="Clear Local Terminal View"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs overflow-y-auto h-[550px] shadow-2xl relative">
              {filteredLogs.length === 0 ? (
                projectLogs.length > 0 && logSearchQuery.trim() ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                    <Search className="w-8 h-8 text-slate-600" />
                    <p className="text-slate-200 font-medium">No log entries matched "{logSearchQuery}"</p>
                    <p className="text-[11px] text-slate-500">Searched across {projectLogs.length} total event log lines for this project.</p>
                    <button
                      onClick={() => setLogSearchQuery('')}
                      className="mt-2 px-3 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700 transition-colors"
                    >
                      Clear search filter
                    </button>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                    <Terminal className="w-8 h-8 text-slate-700" />
                    <p>No log events captured yet for this process.</p>
                    <p className="text-[11px]">Deploy or start a project to observe real-time piped stdio.</p>
                  </div>
                )
              ) : (
                <div className="space-y-1">
                  {filteredLogs.map((log) => {
                    const time = new Date(log.timestamp).toLocaleTimeString();
                    const isErr = log.stream === 'stderr';
                    const isSys = log.stream === 'system';

                    return (
                      <div key={log.id} className="flex items-start gap-2 leading-relaxed hover:bg-slate-900/50 px-1 rounded">
                        <span className="text-slate-600 select-none shrink-0 text-[10px]">[{time}]</span>
                        <span
                          className={`text-[10px] uppercase font-bold shrink-0 px-1 rounded ${
                            isErr
                              ? 'bg-red-950/80 text-red-400'
                              : isSys
                              ? 'bg-cyan-950/80 text-cyan-400'
                              : 'bg-emerald-950/80 text-emerald-400'
                          }`}
                        >
                          {log.stream}
                        </span>
                        <span
                          className={`break-all ${
                            isErr ? 'text-red-300' : isSys ? 'text-cyan-200' : 'text-slate-200'
                          }`}
                        >
                          {renderHighlightedText(log.message, logSearchQuery)}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: INGRESS & ZERO TRUST WIZARD */}
        {activeTab === 'ingress' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                External Ingress & Wireguard Mesh Architecture
              </h2>
              <p className="text-xs text-slate-400">
                Automatic orchestrator for Cloudflare Quick/Named tunnels, Zero Trust REST API provisioning, and Tailscale Mesh.
              </p>
            </div>

            {/* Cloudflare Zero Trust Named Tunnel Automation Wizard */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-orange-950 border border-orange-700/60 flex items-center justify-center text-orange-400 font-bold">
                    CF
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-white">Cloudflare Zero Trust Custom Domain Orchestrator</h3>
                    <p className="text-xs text-slate-400">
                      Creates named tunnel, binds ingress to loopback port, and inserts DNS CNAME record via Cloudflare REST API.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                  Zero-Config CNAME
                </span>
              </div>

              <form onSubmit={handleCloudflareProvision} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Account ID
                  </label>
                  <input
                    type="text"
                    value={cfAccountId}
                    onChange={(e) => setCfAccountId(e.target.value)}
                    required
                    placeholder="cf_acc_xxxx"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    API Token (Bearer)
                  </label>
                  <input
                    type="password"
                    value={cfApiToken}
                    onChange={(e) => setCfApiToken(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Zone ID
                  </label>
                  <input
                    type="text"
                    value={cfZoneId}
                    onChange={(e) => setCfZoneId(e.target.value)}
                    required
                    placeholder="cf_zone_xxxx"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Subdomain
                  </label>
                  <input
                    type="text"
                    value={cfSubdomain}
                    onChange={(e) => setCfSubdomain(e.target.value)}
                    required
                    placeholder="api-edge"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-cyan-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Base Domain
                  </label>
                  <input
                    type="text"
                    value={cfDomain}
                    onChange={(e) => setCfDomain(e.target.value)}
                    required
                    placeholder="internaldev.net"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Local Loopback Port
                  </label>
                  <input
                    type="number"
                    value={cfPort}
                    onChange={(e) => setCfPort(Number(e.target.value))}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                <div className="sm:col-span-3 pt-2">
                  <button
                    type="submit"
                    disabled={cfProvisionLoading}
                    className="py-2 px-4 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20 disabled:opacity-50"
                  >
                    {cfProvisionLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Provisioning Zero Trust Tunnel & CNAME...</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-3.5 h-3.5" />
                        <span>Provision Custom Domain via Cloudflare API</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {cfProvisionResult && (
                <div className={`p-3.5 rounded-lg border text-xs font-mono mt-3 ${
                  cfProvisionResult.success
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                    : 'bg-red-950/40 border-red-800 text-red-200'
                }`}>
                  <div className="flex items-center gap-2 font-bold mb-1">
                    {cfProvisionResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                    <span>{cfProvisionResult.message}</span>
                  </div>
                  {cfProvisionResult.publicUrl && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-slate-400">Assigned Domain:</span>
                      <a href={cfProvisionResult.publicUrl} target="_blank" rel="noreferrer" className="text-cyan-300 underline font-bold">
                        {cfProvisionResult.publicUrl}
                      </a>
                    </div>
                  )}
                  {cfProvisionResult.cnameRecord && (
                    <div className="mt-0.5 text-slate-400">
                      DNS CNAME Target: <code className="text-slate-200">{cfProvisionResult.cnameRecord}</code>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Currently Active Ingress Mappings */}
            <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
              <h3 className="text-sm font-semibold text-white">Live Ingress Route Directory</h3>
              <div className="divide-y divide-slate-800 text-xs font-mono">
                {activeProjects.map((p) => (
                  <div key={p.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-sans font-medium">{p.name}</span>
                      <span className="text-slate-400">(:{p.port})</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-slate-800 text-cyan-400">
                        {p.activeIngress.mode}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {p.activeIngress.publicUrl ? (
                        <>
                          <a
                            href={p.activeIngress.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-300 hover:underline flex items-center gap-1"
                          >
                            <span>{p.activeIngress.publicUrl}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            onClick={() => copyToClipboard(p.activeIngress.publicUrl!, p.id)}
                            className="p-1 text-slate-400 hover:text-white"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-500">No active ingress</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: JARVIS AGENT WEBHOOK RPC */}
        {activeTab === 'jarvis' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  Jarvis Autonomous Agent SDK & Event Gateway
                  <span className="text-xs font-mono font-normal text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                    http://127.0.0.1:4848
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Headless REST RPC and Server-Sent Events bus for autonomous agents and ecosystem tools.
                </p>
              </div>
            </div>

            {/* Dedicated Ecosystem Status Card */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-slate-400 block flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  Active SSE Event Clients
                </span>
                <div className="text-lg font-bold font-mono text-cyan-300">
                  {systemStatus?.activeSseClients ?? 1} Connected
                </div>
                <div className="text-[11px] text-slate-500">
                  Subscribed to <code className="text-slate-400">/api/events</code> stream
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-400 block flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  Agent Bearer Auth Token
                </span>
                <div className="text-lg font-bold font-mono text-emerald-300">
                  {systemStatus?.authTokenPreview || 'jarvis_s...'}
                </div>
                <div className="text-[11px] text-slate-500">
                  Environment: <code className="text-slate-400">LOCAL_ENGINE_TOKEN</code>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-400 block flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Instant Agent Test Trigger
                </span>
                <button
                  onClick={() => {
                    setRpcEndpoint('/api/jarvis/deploy');
                    setRpcPayload(
                      JSON.stringify(
                        {
                          repoPath: '/samples/node-api',
                          name: 'quick-jarvis-agent-app',
                          ingress: 'cloudflare_quick',
                        },
                        null,
                        2
                      )
                    );
                    executeRpcTest();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center gap-1.5"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Test Jarvis Webhook Trigger</span>
                </button>
              </div>
            </div>

            {/* Jarvis Endpoint Catalog */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                onClick={() => {
                  setRpcEndpoint('/api/jarvis/deploy');
                  setRpcPayload(
                    JSON.stringify(
                      {
                        repoPath: '/samples/node-api',
                        name: 'jarvis-injected-service',
                        ingress: 'cloudflare_quick',
                      },
                      null,
                      2
                    )
                  );
                }}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  rpcEndpoint === '/api/jarvis/deploy'
                    ? 'border-cyan-500 bg-cyan-950/20'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-bold text-emerald-400">POST</span>
                  <span className="text-[10px] text-slate-400 font-mono">/api/jarvis/deploy</span>
                </div>
                <div className="text-xs font-semibold text-white">Deploy Repo & Tunnel</div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Triggers stack detection, loopback supervisor, and binds Cloudflare/Tailscale ingress.
                </p>
              </div>

              <div
                onClick={() => {
                  setRpcEndpoint('/api/status');
                  setRpcPayload('{}');
                }}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  rpcEndpoint === '/api/status'
                    ? 'border-cyan-500 bg-cyan-950/20'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-bold text-cyan-400">GET</span>
                  <span className="text-[10px] text-slate-400 font-mono">/api/status</span>
                </div>
                <div className="text-xs font-semibold text-white">Engine Telemetry</div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Returns all active projects, CPU/RAM stats, bound ports, and live public ingress URLs.
                </p>
              </div>

              <div
                onClick={() => {
                  setRpcEndpoint('/api/kill-all');
                  setRpcPayload('{}');
                }}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  rpcEndpoint === '/api/kill-all'
                    ? 'border-red-500 bg-red-950/20'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-bold text-red-400">POST</span>
                  <span className="text-[10px] text-slate-400 font-mono">/api/kill-all</span>
                </div>
                <div className="text-xs font-semibold text-white">Emergency Killswitch</div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Terminates all running child processes, background workers, and active ingress tunnels.
                </p>
              </div>
            </div>

            {/* Interactive Webhook Playground */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                    Jarvis Request Payload
                  </h3>
                  <span className="text-xs font-mono text-cyan-400">{rpcEndpoint}</span>
                </div>

                {rpcEndpoint !== '/api/status' && rpcEndpoint !== '/api/kill-all' ? (
                  <textarea
                    rows={8}
                    value={rpcPayload}
                    onChange={(e) => setRpcPayload(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500 leading-relaxed"
                  />
                ) : (
                  <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400">
                    No body parameters required for this endpoint.
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>Generated cURL Command</span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          rpcEndpoint === '/api/status'
                            ? `curl -X GET http://127.0.0.1:4848/api/status`
                            : `curl -X POST http://127.0.0.1:4848${rpcEndpoint} \\\n  -H "Content-Type: application/json" \\\n  -d '${rpcPayload.replace(/\n/g, ' ')}'`,
                          'curl-copy'
                        )
                      }
                      className="text-cyan-400 hover:underline flex items-center gap-1 font-mono"
                    >
                      {copiedText === 'curl-copy' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Copy cURL</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                    {rpcEndpoint === '/api/status'
                      ? `curl -X GET http://127.0.0.1:4848/api/status`
                      : `curl -X POST http://127.0.0.1:4848${rpcEndpoint} \\\n  -H "Content-Type: application/json" \\\n  -d '${rpcPayload.replace(/\n\s*/g, ' ')}'`}
                  </pre>
                </div>

                <button
                  onClick={executeRpcTest}
                  className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute Jarvis Webhook Call</span>
                </button>
              </div>

              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                    Gateway JSON Response
                  </h3>
                  {rpcResponse && (
                    <button
                      onClick={() => copyToClipboard(rpcResponse, 'resp-copy')}
                      className="text-[11px] font-mono text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      {copiedText === 'resp-copy' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Copy</span>
                    </button>
                  )}
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-300 overflow-y-auto h-[380px] leading-relaxed">
                  {rpcResponse ? (
                    <pre className="whitespace-pre-wrap">{rpcResponse}</pre>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500">
                      <Code className="w-6 h-6 mb-2 text-slate-700" />
                      <span>Ready to trigger. Click 'Execute Jarvis Webhook Call'.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
