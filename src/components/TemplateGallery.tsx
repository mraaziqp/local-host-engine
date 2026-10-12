/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Code,
  Layers,
  Sparkles,
  Server,
  FileCode,
  Terminal,
  Globe,
  Check,
  Folder,
  ArrowRight,
  Cpu,
  Zap,
  Play,
  Box,
  Radio,
} from 'lucide-react';
import type { TemplatePreset, StackType, IngressMode } from '../core/types.ts';

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'nextjs-app',
    name: 'Next.js 15 App Router',
    description: 'Modern full-stack React framework with server-side rendering, streaming edge routes, and strict loopback bindings.',
    stackType: 'node',
    defaultPort: 3110,
    runCommand: 'node server.js',
    buildCommand: 'npm run build',
    defaultPath: '/samples/nextjs-app',
    envVars: {
      NODE_ENV: 'production',
      PORT: '3110',
      HOST: '127.0.0.1',
    },
    ingressMode: 'cloudflare_quick',
    iconName: 'nextjs',
    tags: ['React 19', 'SSR', 'App Router', 'TypeScript'],
  },
  {
    id: 'python-flask',
    name: 'Python Flask API',
    description: 'Lightweight REST microservice using Flask 3.0 and Gunicorn runner, ideal for machine learning inferences & edge workers.',
    stackType: 'python',
    defaultPort: 3125,
    runCommand: 'python3 app.py',
    buildCommand: 'pip install -r requirements.txt',
    defaultPath: '/samples/python-flask',
    envVars: {
      FLASK_ENV: 'production',
      PYTHONUNBUFFERED: '1',
      PORT: '3125',
      HOST: '127.0.0.1',
    },
    ingressMode: 'cloudflare_quick',
    iconName: 'flask',
    tags: ['Flask 3.0', 'Python 3', 'REST API', 'Microservice'],
  },
  {
    id: 'go-service',
    name: 'Go Binary High-Throughput',
    description: 'Native compiled Go 1.22 microservice with sub-millisecond request latencies and direct socket handling.',
    stackType: 'go',
    defaultPort: 3130,
    runCommand: 'go run main.go',
    buildCommand: 'go build -o server .',
    defaultPath: '/samples/go-service',
    envVars: {
      GIN_MODE: 'release',
      PORT: '3130',
      HOST: '127.0.0.1',
    },
    ingressMode: 'tailscale_funnel',
    iconName: 'go',
    tags: ['Golang 1.22', 'Native Binary', 'Ultra-Low Latency', 'P2P Mesh'],
  },
  {
    id: 'python-fastapi',
    name: 'Python FastAPI & Uvicorn',
    description: 'High performance ASGI framework with automatic OpenAPI documentation and native async loop event streaming.',
    stackType: 'python',
    defaultPort: 3120,
    runCommand: 'uvicorn main:app --host 127.0.0.1 --port 3120',
    buildCommand: 'pip install -r requirements.txt',
    defaultPath: '/samples/python-fastapi',
    envVars: {
      PYTHONUNBUFFERED: '1',
      PORT: '3120',
      HOST: '127.0.0.1',
    },
    ingressMode: 'cloudflare_quick',
    iconName: 'fastapi',
    tags: ['FastAPI', 'Uvicorn', 'Async ASGI', 'OpenAPI'],
  },
  {
    id: 'node-api',
    name: 'Node.js Express / Fastify API',
    description: 'Lightweight JavaScript edge service with JSON routing, live telemetry logging, and ring-buffer supervision.',
    stackType: 'node',
    defaultPort: 3100,
    runCommand: 'node index.js',
    buildCommand: 'npm install',
    defaultPath: '/samples/node-api',
    envVars: {
      NODE_ENV: 'production',
      PORT: '3100',
      HOST: '127.0.0.1',
    },
    ingressMode: 'cloudflare_quick',
    iconName: 'node',
    tags: ['Express', 'Node 22', 'Zero Config', 'Edge REST'],
  },
  {
    id: 'docker-service',
    name: 'Dockerized Edge Container',
    description: 'Containerized deployment with isolated Linux rootfs, port forwarding to loopback interface, and memory caps.',
    stackType: 'docker',
    defaultPort: 3150,
    runCommand: 'docker run -p 127.0.0.1:3150:8000 edge-container:latest',
    buildCommand: 'docker build -t edge-container:latest .',
    defaultPath: '/samples/docker-service',
    envVars: {
      PORT: '3150',
      CONTAINER_ENV: 'production',
    },
    ingressMode: 'cloudflare_named',
    iconName: 'docker',
    tags: ['Docker Compose', 'OCI Container', 'Rootless', 'Host Shielded'],
  },
  {
    id: 'static-site',
    name: 'Static Web Portal (SPA / HTML5)',
    description: 'Pure client-side HTML5/CSS3 application served via embedded local web server with instant global edge caching.',
    stackType: 'static',
    defaultPort: 3140,
    runCommand: 'npx serve -l 3140 -s .',
    defaultPath: '/samples/static-site',
    envVars: {
      PORT: '3140',
    },
    ingressMode: 'tailscale_serve',
    iconName: 'html',
    tags: ['Static SPA', 'HTML5', 'Zero Build', 'Tailnet Mesh'],
  },
  {
    id: 'jarvis-agent-core',
    name: 'Jarvis Agent Gateway Core',
    description: 'Autonomous AI Agent backend with bidirectional Server-Sent Events, token authorization, and Model Context Protocol (MCP).',
    stackType: 'node',
    defaultPort: 4848,
    runCommand: 'tsx server.ts',
    defaultPath: '/samples/node-api',
    envVars: {
      JARVIS_MODE: 'autonomous',
      PORT: '4848',
      MCP_ENABLED: 'true',
    },
    ingressMode: 'cloudflare_named',
    iconName: 'jarvis',
    tags: ['Model Context Protocol', 'SSE Bus', 'Autonomous Agent', 'Zero Trust'],
  },
];

interface TemplateGalleryProps {
  onSelectPreset: (preset: TemplatePreset) => void;
  selectedPresetId?: string | null;
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  onSelectPreset,
  selectedPresetId,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'node' | 'python' | 'go' | 'docker' | 'static'>('all');
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const filteredPresets = TEMPLATE_PRESETS.filter((p) => {
    if (selectedFilter === 'all') return true;
    return p.stackType === selectedFilter;
  });

  const handleApply = (preset: TemplatePreset) => {
    onSelectPreset(preset);
    setAppliedId(preset.id);
    setTimeout(() => setAppliedId(null), 2500);
  };

  const getStackBadgeColor = (stack: StackType) => {
    switch (stack) {
      case 'node':
        return 'bg-emerald-950/70 text-emerald-400 border-emerald-800';
      case 'python':
        return 'bg-amber-950/70 text-amber-400 border-amber-800';
      case 'go':
        return 'bg-cyan-950/70 text-cyan-400 border-cyan-800';
      case 'docker':
        return 'bg-blue-950/70 text-blue-400 border-blue-800';
      case 'static':
        return 'bg-purple-950/70 text-purple-400 border-purple-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-4 rounded-xl bg-slate-900/60 border border-slate-800/90 p-5 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">
              Stack Preset Template Gallery
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/60 text-[10px] text-cyan-400 font-mono">
              Phase 5
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Select a verified production stack preset to auto-populate directory paths, loopback ports, commands, and ingress configurations.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'node', 'python', 'go', 'docker', 'static'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setSelectedFilter(filter)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md uppercase tracking-wider transition-colors ${
                selectedFilter === filter
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Preset Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
        {filteredPresets.map((preset) => {
          const isSelected = selectedPresetId === preset.id || appliedId === preset.id;

          return (
            <div
              key={preset.id}
              onClick={() => handleApply(preset)}
              className={`group relative flex flex-col justify-between p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'bg-cyan-950/30 border-cyan-500 shadow-md shadow-cyan-950/40'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 group-hover:border-cyan-500/40 transition-colors">
                      {preset.stackType === 'python' ? (
                        <FileCode className="w-4 h-4 text-amber-400" />
                      ) : preset.stackType === 'go' ? (
                        <Cpu className="w-4 h-4 text-cyan-400" />
                      ) : preset.stackType === 'docker' ? (
                        <Box className="w-4 h-4 text-blue-400" />
                      ) : preset.stackType === 'static' ? (
                        <Globe className="w-4 h-4 text-purple-400" />
                      ) : preset.id.includes('jarvis') ? (
                        <Radio className="w-4 h-4 text-rose-400" />
                      ) : (
                        <Layers className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                        {preset.name}
                      </h4>
                      <span className={`text-[10px] uppercase font-mono px-1.5 py-0.2 rounded border ${getStackBadgeColor(preset.stackType)}`}>
                        {preset.stackType}
                      </span>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono text-cyan-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                    :{preset.defaultPort}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {preset.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {preset.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 text-[10px] font-mono border border-slate-800/80"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom Metadata & Button */}
              <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]" title={preset.defaultPath}>
                  {preset.defaultPath}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApply(preset);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                    appliedId === preset.id
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  }`}
                >
                  {appliedId === preset.id ? (
                    <>
                      <Check className="w-3 h-3 text-slate-950" />
                      <span>Loaded</span>
                    </>
                  ) : (
                    <>
                      <span>Apply Preset</span>
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
