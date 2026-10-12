/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Shield, 
  Cpu, 
  HardDrive, 
  AlertTriangle, 
  CheckCircle2, 
  Sliders, 
  Volume2, 
  VolumeX, 
  Server, 
  Terminal, 
  RefreshCw, 
  Trash2, 
  Lock, 
  Activity, 
  Check, 
  Copy,
  Zap,
  Globe,
  GitBranch
} from 'lucide-react';
import type { 
  ResourceAlertConfig, 
  AlertEvent, 
  ShieldConfig, 
  DaemonStatus 
} from '../core/types.ts';

export function ResourceAlertsPanel() {
  const [alertConfig, setAlertConfig] = useState<ResourceAlertConfig>({
    enabled: true,
    cpuThresholdPercent: 80,
    memoryThresholdMb: 500,
    notifySound: true,
    autoThrottle: false,
  });

  const [shieldConfig, setShieldConfig] = useState<ShieldConfig>({
    maxMemoryMbPerProject: 1536,
    minFreeMemoryPercent: 10,
    rateLimitRequestsPerMin: 120,
    blockDirectoryTraversal: true,
  });

  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [alertHistory, setAlertHistory] = useState<AlertEvent[]>([]);
  const [isSavingAlerts, setIsSavingAlerts] = useState<boolean>(false);
  const [isSavingShield, setIsSavingShield] = useState<boolean>(false);
  const [isDaemonLoading, setIsDaemonLoading] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const fetchAlertsData = async () => {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const data = await res.json();
        if (data.config) setAlertConfig(data.config);
        if (data.history) setAlertHistory(data.history);
      }
    } catch {
      // ignore
    }
  };

  const fetchShieldData = async () => {
    try {
      const res = await fetch('/api/shield/config');
      if (res.ok) {
        const data = await res.json();
        setShieldConfig(data);
      }
    } catch {
      // ignore
    }
  };

  const fetchDaemonStatus = async () => {
    try {
      const res = await fetch('/api/daemon/status');
      if (res.ok) {
        const data = await res.json();
        setDaemonStatus(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchAlertsData();
    fetchShieldData();
    fetchDaemonStatus();
    const interval = setInterval(() => {
      fetchAlertsData();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAlerts(true);
    setSaveSuccessMsg(null);
    try {
      const res = await fetch('/api/alerts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertConfig),
      });
      if (res.ok) {
        setSaveSuccessMsg('Resource Alert thresholds updated successfully!');
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } finally {
      setIsSavingAlerts(false);
    }
  };

  const handleSaveShield = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingShield(true);
    try {
      await fetch('/api/shield/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shieldConfig),
      });
      setSaveSuccessMsg('Host reverse proxy & shielding parameters updated!');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } finally {
      setIsSavingShield(false);
    }
  };

  const handleClearAlertHistory = async () => {
    await fetch('/api/alerts/history', { method: 'DELETE' });
    setAlertHistory([]);
  };

  const handleToggleDaemon = async () => {
    setIsDaemonLoading(true);
    try {
      const endpoint = daemonStatus?.isDaemon ? '/api/daemon/uninstall' : '/api/daemon/install';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      setSaveSuccessMsg(data.message);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
      await fetchDaemonStatus();
    } finally {
      setIsDaemonLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const simulateTestAlert = () => {
    const testAlert: AlertEvent = {
      id: `alert-sim-${Date.now()}`,
      timestamp: Date.now(),
      projectId: 'proj-simulated',
      projectName: 'Simulated Load Spike',
      type: 'cpu',
      value: 92.4,
      threshold: alertConfig.cpuThresholdPercent,
      message: `Test Alert Trigger: Simulated service exceeded CPU ceiling (${92.4}% >= ${alertConfig.cpuThresholdPercent}%)`,
    };
    setAlertHistory((prev) => [testAlert, ...prev]);

    // Audio beep simulation via Web Audio API if audio enabled
    if (alertConfig.notifySound && typeof window !== 'undefined') {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } catch {
        // audio context blocked
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Machine Shielding, Resource Alerts & Background Persistence</span>
            <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
              Phase 4 Protected
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Real-time threshold alert monitoring, reverse proxy DDoS rate limiting, and native OS systemd/WinSW persistence.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={simulateTestAlert}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/70 hover:bg-amber-900 border border-amber-800/60 text-amber-300 text-xs font-mono transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Simulate Threshold Alert</span>
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Grid: 1. Resource Alerts & 2. OS Service Daemon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Resource Alerts Configuration */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800/40">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Resource Alerts Configuration</h3>
                <span className="text-[11px] text-slate-400">Trigger warnings and watchdog actions on spikes</span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
              <span className="text-slate-400">{alertConfig.enabled ? 'ALERTS ON' : 'MUTED'}</span>
              <input
                type="checkbox"
                checked={alertConfig.enabled}
                onChange={(e) => setAlertConfig({ ...alertConfig, enabled: e.target.checked })}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-950 border-slate-700 focus:ring-0"
              />
            </label>
          </div>

          <form onSubmit={handleSaveAlerts} className="space-y-4 pt-1">
            {/* CPU Threshold */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  CPU Spiking Ceiling
                </span>
                <span className="text-cyan-400 font-bold">{alertConfig.cpuThresholdPercent}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="95"
                step="5"
                value={alertConfig.cpuThresholdPercent}
                onChange={(e) => setAlertConfig({ ...alertConfig, cpuThresholdPercent: Number(e.target.value) })}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>10% (Sensitive)</span>
                <span>50%</span>
                <span>95% (High Stress)</span>
              </div>
            </div>

            {/* Memory Threshold */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                  Memory Allocation Threshold
                </span>
                <span className="text-emerald-400 font-bold">{alertConfig.memoryThresholdMb} MB</span>
              </div>
              <input
                type="range"
                min="100"
                max="2048"
                step="50"
                value={alertConfig.memoryThresholdMb}
                onChange={(e) => setAlertConfig({ ...alertConfig, memoryThresholdMb: Number(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>100 MB</span>
                <span>500 MB (Default)</span>
                <span>2048 MB (2 GB)</span>
              </div>
            </div>

            {/* Checkboxes: Audio & Auto-Throttle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertConfig.notifySound}
                  onChange={(e) => setAlertConfig({ ...alertConfig, notifySound: e.target.checked })}
                  className="rounded text-cyan-500 bg-slate-900 border-slate-700"
                />
                <span className="text-slate-300 flex items-center gap-1.5">
                  {alertConfig.notifySound ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
                  Audio Alert Chime
                </span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertConfig.autoThrottle}
                  onChange={(e) => setAlertConfig({ ...alertConfig, autoThrottle: e.target.checked })}
                  className="rounded text-amber-500 bg-slate-900 border-slate-700"
                />
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  Auto-Throttle / Roll
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSavingAlerts}
              className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              {isSavingAlerts ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sliders className="w-3.5 h-3.5" />}
              <span>Save Alert Configuration</span>
            </button>
          </form>
        </div>

        {/* Panel 2: OS Background Persistence (Daemon) */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-5 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-950 text-purple-400 border border-purple-800/40">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">OS Background Persistence (Daemon)</h3>
                  <span className="text-[11px] text-slate-400">Keeps edge microservices alive across logouts & reboots</span>
                </div>
              </div>

              <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border font-semibold ${
                daemonStatus?.isDaemon
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {daemonStatus?.isDaemon ? '● Service Active' : '○ Standalone'}
              </span>
            </div>

            {/* Platform Identification Card */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-mono">HOST ENVIRONMENT:</span>
                <span className="text-cyan-300 font-mono font-bold uppercase">
                  {daemonStatus?.platform === 'windows' ? 'Windows Service (WinSW)' : daemonStatus?.platform === 'darwin' ? 'macOS (Launchd)' : 'Linux (systemd user)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-mono">SERVICE UNIT FILE:</span>
                <span className="text-slate-300 font-mono text-[11px] truncate max-w-[240px]" title={daemonStatus?.serviceFileLocation}>
                  {daemonStatus?.serviceFileLocation || '~/.config/systemd/user/localhost-engine.service'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-mono">BOOT ON OS STARTUP:</span>
                <span className={daemonStatus?.bootOnStartup ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {daemonStatus?.bootOnStartup ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              When installed, the engine daemon runs in the background at system boot. Jarvis webhooks, Cloudflare tunnels, and local endpoints remain accessible 24/7 without needing the browser open.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={handleToggleDaemon}
              disabled={isDaemonLoading}
              className={`w-full py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                daemonStatus?.isDaemon
                  ? 'bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20'
              }`}
            >
              {isDaemonLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : daemonStatus?.isDaemon ? (
                <span>Uninstall OS Background Service</span>
              ) : (
                <span>Register & Start on OS Boot</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Grid: 3. Host Shielding & Reverse Proxy + 4. Unified CLI Quick Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 3: Ingress Reverse Proxy & Host Shield */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Host Shield & Ingress Rate Limiting</h3>
                <span className="text-[11px] text-slate-400">Protects local hardware from runaway requests & DDoS</span>
              </div>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
              Active Guard
            </span>
          </div>

          <form onSubmit={handleSaveShield} className="space-y-3.5 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 text-[10px] block">MAX RAM PER SERVICE</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={shieldConfig.maxMemoryMbPerProject}
                    onChange={(e) => setShieldConfig({ ...shieldConfig, maxMemoryMbPerProject: Number(e.target.value) })}
                    className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                  />
                  <span className="text-slate-400">MB (Cap)</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 text-[10px] block">SLIDING RATE LIMIT</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={shieldConfig.rateLimitRequestsPerMin}
                    onChange={(e) => setShieldConfig({ ...shieldConfig, rateLimitRequestsPerMin: Number(e.target.value) })}
                    className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                  />
                  <span className="text-slate-400">Req / Min / IP</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <div className="font-semibold text-white">Directory Traversal Sanitizer</div>
                <div className="text-[11px] text-slate-400">Blocks <code className="text-cyan-300">../</code>, <code className="text-cyan-300">.env</code>, <code className="text-cyan-300">.git</code> and root escape paths</div>
              </div>
              <span className="text-xs font-mono text-emerald-400 font-bold">ENFORCED</span>
            </div>

            <button
              type="submit"
              disabled={isSavingShield}
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              {isSavingShield ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
              <span>Update Shielding Controls</span>
            </button>
          </form>
        </div>

        {/* Panel 4: Unified CLI Dispatcher Reference */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-950 text-blue-400 border border-blue-800/40">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Unified Terminal CLI Dispatcher</h3>
                  <span className="text-[11px] text-slate-400">Deploy, inspect and monitor headlessly</span>
                </div>
              </div>
              <span className="text-xs font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                localhost / lh
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-2 text-slate-300">
              <div className="flex items-center justify-between">
                <span>$ localhost status</span>
                <span className="text-slate-500">Telemetry table</span>
              </div>
              <div className="flex items-center justify-between">
                <span>$ localhost run ./app --ingress=cloudflare_quick</span>
                <span className="text-slate-500">Auto-deploy repo</span>
              </div>
              <div className="flex items-center justify-between">
                <span>$ localhost logs &lt;projectId&gt;</span>
                <span className="text-slate-500">Stream logs</span>
              </div>
              <div className="flex items-center justify-between">
                <span>$ localhost daemon install</span>
                <span className="text-slate-500">Enable OS boot</span>
              </div>
              <div className="flex items-center justify-between text-red-400">
                <span>$ localhost kill-all</span>
                <span className="text-red-500">Panic killswitch</span>
              </div>
            </div>
          </div>

          <div className="pt-1">
            <button
              onClick={() => copyToClipboard('npm link', 'cli-link')}
              className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors flex items-center justify-center gap-2 border border-slate-700"
            >
              {copiedText === 'cli-link' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Copy Global CLI Link Command: npm link</span>
            </button>
          </div>
        </div>
      </div>

      {/* Historical Alert Events Log */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Triggered Resource Alert History</h3>
            <span className="text-xs font-mono text-slate-500">({alertHistory.length} events logged)</span>
          </div>

          {alertHistory.length > 0 && (
            <button
              onClick={handleClearAlertHistory}
              className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1 font-mono"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Log</span>
            </button>
          )}
        </div>

        {alertHistory.length === 0 ? (
          <div className="p-8 rounded-lg bg-slate-950/60 border border-slate-800 text-center text-slate-500 text-xs font-mono space-y-1">
            <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-500/60" />
            <p>All microservices operating well within configured resource thresholds.</p>
            <p className="text-[11px] text-slate-600">No CPU or Memory threshold violations recorded.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden text-xs font-mono">
            {alertHistory.map((alert) => (
              <div key={alert.id} className="p-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-900/60 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded ${alert.type === 'cpu' ? 'bg-cyan-950 text-cyan-400' : 'bg-emerald-950 text-emerald-400'}`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-sans">{alert.projectName}</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-slate-800 text-amber-400">
                        {alert.type.toUpperCase()} SPIKE
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{alert.message}</p>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500">
                  <div>{new Date(alert.timestamp).toLocaleTimeString()}</div>
                  <div className="text-[10px]">{new Date(alert.timestamp).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
