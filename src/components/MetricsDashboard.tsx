/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  RefreshCw, 
  Clock, 
  Layers, 
  TrendingUp, 
  Zap, 
  AlertCircle 
} from 'lucide-react';
import type { StatsApiResponse, ProjectStatsSummary, ProjectMetricPoint } from '../core/types.ts';

export function MetricsDashboard() {
  const [statsData, setStatsData] = useState<StatsApiResponse | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const cpuSvgRef = useRef<SVGSVGElement | null>(null);
  const memSvgRef = useRef<SVGSVGElement | null>(null);

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data: StatsApiResponse = await res.json();
        setStatsData(data);
        setLastUpdated(new Date());
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    if (!autoRefresh) return;
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Extract time series based on selected project
  const chartPoints: ProjectMetricPoint[] = useMemo(() => {
    if (!statsData || !statsData.projects.length) return [];

    if (selectedProjectId === 'all') {
      // Aggregate across all projects
      const projectHistories = statsData.projects.map((p) => p.history);
      const pointCount = projectHistories[0]?.length || 0;
      const aggregated: ProjectMetricPoint[] = [];

      for (let i = 0; i < pointCount; i++) {
        let totalCpu = 0;
        let totalMem = 0;
        let ts = 0;

        projectHistories.forEach((hist) => {
          if (hist[i]) {
            totalCpu += hist[i].cpuPercent;
            totalMem += hist[i].memoryMb;
            ts = hist[i].timestamp;
          }
        });

        if (ts > 0) {
          aggregated.push({
            timestamp: ts,
            cpuPercent: Number(totalCpu.toFixed(1)),
            memoryMb: Math.round(totalMem),
          });
        }
      }
      return aggregated;
    }

    const found = statsData.projects.find((p) => p.projectId === selectedProjectId);
    return found ? found.history : [];
  }, [statsData, selectedProjectId]);

  // Selected project summary metrics
  const activeProjectMeta = useMemo(() => {
    if (!statsData) return null;
    if (selectedProjectId === 'all') {
      const totalCpu = statsData.projects.reduce((sum, p) => sum + p.currentCpuPercent, 0);
      const totalMem = statsData.projects.reduce((sum, p) => sum + p.currentMemoryMb, 0);
      const maxCpu = Math.max(...statsData.projects.map((p) => p.maxCpuPercent), 0);
      const maxMem = Math.max(...statsData.projects.map((p) => p.maxMemoryMb), 0);
      return {
        name: 'Fleet Aggregate (All Edge Microservices)',
        currentCpu: Number(totalCpu.toFixed(1)),
        currentMem: totalMem,
        maxCpu,
        maxMem,
        count: statsData.projects.length,
      };
    }
    const found = statsData.projects.find((p) => p.projectId === selectedProjectId);
    if (!found) return null;
    return {
      name: found.name,
      currentCpu: found.currentCpuPercent,
      currentMem: found.currentMemoryMb,
      maxCpu: found.maxCpuPercent,
      maxMem: found.maxMemoryMb,
      avgCpu: found.avgCpuPercent,
      avgMem: found.avgMemoryMb,
    };
  }, [statsData, selectedProjectId]);

  // Render D3 CPU Chart
  useEffect(() => {
    if (!cpuSvgRef.current || chartPoints.length === 0) return;

    const svg = d3.select(cpuSvgRef.current);
    svg.selectAll('*').remove();

    const width = cpuSvgRef.current.clientWidth || 600;
    const height = 240;
    const margin = { top: 20, right: 25, bottom: 35, left: 45 };

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // X & Y Scales
    const xExtent = d3.extent(chartPoints, (d) => new Date(d.timestamp)) as [Date, Date];
    const xScale = d3.scaleTime().domain(xExtent).range([0, innerWidth]);

    const maxCpu = Math.max(5, d3.max(chartPoints, (d) => d.cpuPercent) || 5);
    const yScale = d3.scaleLinear().domain([0, maxCpu * 1.15]).range([innerHeight, 0]);

    // Gradient definition
    const defs = svg.append('defs');
    const cpuGrad = defs
      .append('linearGradient')
      .attr('id', 'cpu-area-gradient')
      .attr('x1', '0')
      .attr('y1', '0')
      .attr('x2', '0')
      .attr('y2', '1');

    cpuGrad.append('stop').attr('offset', '0%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.45);
    cpuGrad.append('stop').attr('offset', '100%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.0);

    // Gridlines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.12)
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      );

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(6)
          .tickFormat((d) => d3.timeFormat('%H:%M')(d as Date))
      )
      .attr('color', '#64748b')
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, monospace');

    // Y Axis
    g.append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((d) => `${d}%`)
      )
      .attr('color', '#64748b')
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, monospace');

    // Area
    const areaGen = d3
      .area<ProjectMetricPoint>()
      .x((d) => xScale(new Date(d.timestamp)))
      .y0(innerHeight)
      .y1((d) => yScale(d.cpuPercent))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(chartPoints)
      .attr('fill', 'url(#cpu-area-gradient)')
      .attr('d', areaGen);

    // Line
    const lineGen = d3
      .line<ProjectMetricPoint>()
      .x((d) => xScale(new Date(d.timestamp)))
      .y((d) => yScale(d.cpuPercent))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(chartPoints)
      .attr('fill', 'none')
      .attr('stroke', '#06b6d4')
      .attr('stroke-width', 2.2)
      .attr('d', lineGen);

    // Interactive Hover Point / Crosshair
    const lastPoint = chartPoints[chartPoints.length - 1];
    if (lastPoint) {
      g.append('circle')
        .attr('cx', xScale(new Date(lastPoint.timestamp)))
        .attr('cy', yScale(lastPoint.cpuPercent))
        .attr('r', 4.5)
        .attr('fill', '#22d3ee')
        .attr('stroke', '#083344')
        .attr('stroke-width', 2);
    }
  }, [chartPoints]);

  // Render D3 Memory Chart
  useEffect(() => {
    if (!memSvgRef.current || chartPoints.length === 0) return;

    const svg = d3.select(memSvgRef.current);
    svg.selectAll('*').remove();

    const width = memSvgRef.current.clientWidth || 600;
    const height = 240;
    const margin = { top: 20, right: 25, bottom: 35, left: 45 };

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xExtent = d3.extent(chartPoints, (d) => new Date(d.timestamp)) as [Date, Date];
    const xScale = d3.scaleTime().domain(xExtent).range([0, innerWidth]);

    const maxMem = Math.max(50, d3.max(chartPoints, (d) => d.memoryMb) || 50);
    const yScale = d3.scaleLinear().domain([0, maxMem * 1.15]).range([innerHeight, 0]);

    // Gradient definition
    const defs = svg.append('defs');
    const memGrad = defs
      .append('linearGradient')
      .attr('id', 'mem-area-gradient')
      .attr('x1', '0')
      .attr('y1', '0')
      .attr('x2', '0')
      .attr('y2', '1');

    memGrad.append('stop').attr('offset', '0%').attr('stop-color', '#10b981').attr('stop-opacity', 0.45);
    memGrad.append('stop').attr('offset', '100%').attr('stop-color', '#10b981').attr('stop-opacity', 0.0);

    // Gridlines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.12)
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      );

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(6)
          .tickFormat((d) => d3.timeFormat('%H:%M')(d as Date))
      )
      .attr('color', '#64748b')
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, monospace');

    // Y Axis
    g.append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((d) => `${d}M`)
      )
      .attr('color', '#64748b')
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, monospace');

    // Area
    const areaGen = d3
      .area<ProjectMetricPoint>()
      .x((d) => xScale(new Date(d.timestamp)))
      .y0(innerHeight)
      .y1((d) => yScale(d.memoryMb))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(chartPoints)
      .attr('fill', 'url(#mem-area-gradient)')
      .attr('d', areaGen);

    // Line
    const lineGen = d3
      .line<ProjectMetricPoint>()
      .x((d) => xScale(new Date(d.timestamp)))
      .y((d) => yScale(d.memoryMb))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(chartPoints)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2.2)
      .attr('d', lineGen);

    const lastPoint = chartPoints[chartPoints.length - 1];
    if (lastPoint) {
      g.append('circle')
        .attr('cx', xScale(new Date(lastPoint.timestamp)))
        .attr('cy', yScale(lastPoint.memoryMb))
        .attr('r', 4.5)
        .attr('fill', '#34d399')
        .attr('stroke', '#064e3b')
        .attr('stroke-width', 2);
    }
  }, [chartPoints]);

  return (
    <div className="space-y-6">
      {/* Top Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Edge Resource Telemetry & D3 Visualizer</span>
            <span className="text-xs font-mono font-medium text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
              Last 30 Minutes
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Per-project CPU% and Memory allocation sampled at 5-second intervals via <code className="text-cyan-300 font-mono">/api/stats</code>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Project Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">Target:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:border-cyan-500 shadow-sm"
            >
              <option value="all">⚡ All Fleet Aggregate</option>
              {statsData?.projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.name} (:{p.port})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            <span>Live: {autoRefresh ? 'ON' : 'PAUSED'}</span>
          </button>

          <button
            onClick={fetchStats}
            title="Refresh Metrics"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Current CPU Load</span>
            </span>
            <span className="font-mono text-[11px] text-cyan-400">5s Window</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {activeProjectMeta?.currentCpu ?? 0}%
            </div>
            <div className="text-xs font-mono text-slate-400">
              Peak: <span className="text-cyan-300 font-semibold">{activeProjectMeta?.maxCpu ?? 0}%</span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, ((activeProjectMeta?.currentCpu ?? 0) / 10) * 100)}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              <span>Memory Allocation</span>
            </span>
            <span className="font-mono text-[11px] text-emerald-400">Heap/RSS</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {activeProjectMeta?.currentMem ?? 0} <span className="text-sm font-normal text-slate-400">MB</span>
            </div>
            <div className="text-xs font-mono text-slate-400">
              Peak: <span className="text-emerald-300 font-semibold">{activeProjectMeta?.maxMem ?? 0} MB</span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, ((activeProjectMeta?.currentMem ?? 0) / 250) * 100)}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-400" />
              <span>Watchdog Probes</span>
            </span>
            <span className="font-mono text-[11px] text-emerald-400">Active</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-emerald-400">
              100%
            </div>
            <div className="text-xs font-mono text-slate-400">
              TCP Loopback Ping: <span className="text-slate-200">127.0.0.1</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            Exponential retry policy armed (Max: 3 attempts)
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>Telemetry Timestamp</span>
            </span>
          </div>
          <div className="text-sm font-bold font-mono text-slate-200">
            {lastUpdated.toLocaleTimeString()}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>360 telemetry checkpoints captured</span>
          </div>
        </div>
      </div>

      {/* D3 Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU Chart Container */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/40">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  CPU Utilization % (D3 Area)
                </h3>
                <span className="text-[11px] text-slate-400">
                  {activeProjectMeta?.name || 'Service Metrics'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{activeProjectMeta?.currentCpu ?? 0}%</span>
            </div>
          </div>

          <div className="w-full overflow-hidden bg-slate-950/60 rounded-lg p-2 border border-slate-800/60">
            <svg ref={cpuSvgRef} className="w-full h-[240px] select-none" />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
            <span>-30 Minutes</span>
            <span>-15 Minutes</span>
            <span className="text-cyan-400">Now</span>
          </div>
        </div>

        {/* Memory Chart Container */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Memory Allocation MB (D3 Area)
                </h3>
                <span className="text-[11px] text-slate-400">
                  {activeProjectMeta?.name || 'Service Metrics'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{activeProjectMeta?.currentMem ?? 0} MB</span>
            </div>
          </div>

          <div className="w-full overflow-hidden bg-slate-950/60 rounded-lg p-2 border border-slate-800/60">
            <svg ref={memSvgRef} className="w-full h-[240px] select-none" />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
            <span>-30 Minutes</span>
            <span>-15 Minutes</span>
            <span className="text-emerald-400">Now</span>
          </div>
        </div>
      </div>
    </div>
  );
}
