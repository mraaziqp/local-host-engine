/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Radio,
  Cpu,
  Terminal,
  Play,
  Check,
  Copy,
  RefreshCw,
  Zap,
  Box,
  Layers,
  Code,
  Sparkles,
  Server,
  ArrowRight,
} from 'lucide-react';
import type { McpToolManifest, McpCallResponse } from '../core/types.ts';

export const McpPlayground: React.FC = () => {
  const [tools, setTools] = useState<McpToolManifest[]>([]);
  const [selectedToolName, setSelectedToolName] = useState<string>('deploy_service');
  const [argsJson, setArgsJson] = useState<string>(
    JSON.stringify(
      {
        repoPath: '/samples/node-api',
        name: 'jarvis-mcp-service',
        ingress: 'cloudflare_quick',
      },
      null,
      2
    )
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<McpCallResponse | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);

  const fetchTools = async () => {
    try {
      const res = await fetch('/api/mcp/tools');
      if (res.ok) {
        const data = await res.json();
        setTools(data.tools || []);
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const handleSelectTool = (tool: McpToolManifest) => {
    setSelectedToolName(tool.name);

    // Provide helpful preset args based on tool
    let defaultArgs: Record<string, any> = {};
    switch (tool.name) {
      case 'deploy_service':
        defaultArgs = {
          repoPath: '/samples/node-api',
          name: 'mcp-edge-service',
          ingress: 'cloudflare_quick',
        };
        break;
      case 'check_health':
        defaultArgs = {};
        break;
      case 'list_services':
        defaultArgs = {};
        break;
      case 'restart_service':
      case 'stop_service':
      case 'kill_tunnel':
      case 'get_service_logs':
        defaultArgs = { projectId: 'proj-sample-01' };
        break;
      case 'backup_database':
        defaultArgs = { force: true };
        break;
      case 'configure_zero_trust':
        defaultArgs = {
          enabled: true,
          ingressPasskeyRequired: true,
          passkeySecret: 'edge_pass_2026',
        };
        break;
      default:
        defaultArgs = {};
    }
    setArgsJson(JSON.stringify(defaultArgs, null, 2));
  };

  const handleExecuteTool = async () => {
    setIsLoading(true);
    setResponse(null);
    const start = performance.now();

    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(argsJson);
      } catch (err: any) {
        setResponse({
          isError: true,
          error: `JSON syntax error: ${err.message}`,
        });
        setIsLoading(false);
        return;
      }

      const res = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedToolName,
          arguments: parsedArgs,
        }),
      });

      const data = await res.json();
      setResponse(data);
      setExecutionTimeMs(Math.round(performance.now() - start));
    } catch (err: any) {
      setResponse({
        isError: true,
        error: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const selectedTool = tools.find((t) => t.name === selectedToolName);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-gradient-to-r from-slate-900 via-rose-950/30 to-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-rose-400" />
            <h2 className="text-lg font-bold text-white">
              Jarvis MCP (Model Context Protocol) Tools API
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-rose-950 border border-rose-800 text-[10px] text-rose-300 font-mono">
              Phase 5
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Standardized Model Context Protocol server exposing tool definitions for Jarvis, Claude, and autonomous agents to deploy apps, inspect ring buffers, kill tunnels, and manage edge hardware.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            <span className="text-slate-500 mr-2">JSON-RPC Endpoint:</span>
            <span className="text-rose-400 font-bold">127.0.0.1:4848/api/mcp</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Tools Manifest */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              Exposed MCP Tools
            </h3>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {tools.length} Tools
            </span>
          </div>

          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {tools.map((tool) => {
              const isCurrent = tool.name === selectedToolName;
              return (
                <div
                  key={tool.name}
                  onClick={() => handleSelectTool(tool)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-rose-950/40 border-rose-500 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800/90 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-white">
                      {tool.name}
                    </span>
                    {isCurrent && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Columns: Tool Inspector & Live Caller */}
        <div className="lg:col-span-2 space-y-5">
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  Tool Execution Workbench
                </h3>
                <span className="text-xs text-rose-400 font-mono">
                  {selectedToolName}
                </span>
              </div>

              <button
                type="button"
                onClick={handleExecuteTool}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Invoke Tool (MCP)</span>
              </button>
            </div>

            {selectedTool && (
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs space-y-1.5">
                <div className="text-slate-400 text-[11px]">
                  {selectedTool.description}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Required parameters: {selectedTool.inputSchema.required?.join(', ') || 'none'}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Arguments (JSON)</span>
                <span className="text-[10px] font-mono text-slate-500">MCP tool call payload</span>
              </label>
              <textarea
                value={argsJson}
                onChange={(e) => setArgsJson(e.target.value)}
                rows={6}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Response Inspector */}
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Code className="w-4 h-4 text-emerald-400" />
                MCP Response Result
              </h3>

              {executionTimeMs !== null && (
                <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  Latency: {executionTimeMs}ms
                </span>
              )}
            </div>

            <div className="relative">
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-[300px]">
                {response
                  ? JSON.stringify(response, null, 2)
                  : '// Press "Invoke Tool (MCP)" above to test tool execution.'}
              </pre>

              {response && (
                <button
                  onClick={() => copyToClipboard(JSON.stringify(response, null, 2), 'mcp-resp')}
                  className="absolute top-3 right-3 p-1.5 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-white"
                  title="Copy Response"
                >
                  {copiedId === 'mcp-resp' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
