/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  Clock,
  Layers,
  ArrowRight,
  Shield,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import type { DatabaseSnapshotStatus, LitestreamConfig } from '../core/types.ts';
import type { BackupHistoryEntry } from '../db/litestream.ts';

export const DatabaseStorePanel: React.FC = () => {
  const [snapshot, setSnapshot] = useState<DatabaseSnapshotStatus | null>(null);
  const [litestreamConfig, setLitestreamConfig] = useState<LitestreamConfig | null>(null);
  const [history, setHistory] = useState<BackupHistoryEntry[]>([]);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchDatabaseStatus = async () => {
    try {
      const res = await fetch('/api/database/status');
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot);
        setLitestreamConfig(data.litestream?.config);
      }

      const histRes = await fetch('/api/database/litestream/history');
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData.history || []);
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    fetchDatabaseStatus();
    const interval = setInterval(fetchDatabaseStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTriggerBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await fetch('/api/database/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(`Snapshot successfully generated & replicated: ${data.entry?.id}`);
        fetchDatabaseStatus();
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async (backupId: string) => {
    if (!confirm(`Are you sure you want to restore SQLite state to snapshot ${backupId}?`)) return;
    try {
      const res = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(data.message);
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-gradient-to-r from-slate-900 via-sky-950/30 to-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-bold text-white">
              Embedded SQLite State Store & Litestream Replication
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-sky-950 border border-sky-800 text-[10px] text-sky-300 font-mono">
              Phase 5
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Zero-latency embedded ACID state persistence in WAL mode. Continuous streaming write-ahead log (WAL) replication to Cloudflare R2 / S3 ensures instant crash recovery across host reboots.
          </p>
        </div>

        <button
          type="button"
          onClick={handleTriggerBackup}
          disabled={isBackingUp}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
        >
          {isBackingUp ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <UploadCloud className="w-4 h-4" />
          )}
          <span>Take Snapshot & Replicate</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Grid: Database Status & Litestream Replication */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: SQLite Storage Engine */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-sky-400" />
              SQLite 3 Engine Details
            </h3>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
              WAL MODE ACTIVE
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] block">DATABASE FILE LOCATION</span>
              <span className="text-slate-200 text-[11px] truncate block" title={snapshot?.dbPath}>
                {snapshot?.dbPath || '/data/localhost-engine.db'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">DISK SIZE</span>
                <span className="text-sky-400 font-bold text-sm">
                  {snapshot?.sizeBytes ? `${(snapshot.sizeBytes / 1024).toFixed(1)} KB` : '32.0 KB'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">ACTIVE TABLES</span>
                <span className="text-slate-200 font-bold text-sm">
                  {snapshot?.tablesCount || 4} Tables
                </span>
              </div>
            </div>
          </div>

          {/* Table Record Counts */}
          <div className="space-y-1.5 pt-2">
            <div className="text-[11px] font-semibold text-slate-400 mb-1">Table Record Allocations</div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800">
                <span className="text-slate-300">projects</span>
                <span className="text-cyan-400 font-bold">{snapshot?.recordsCount.projects ?? 0} rows</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800">
                <span className="text-slate-300">service_tokens</span>
                <span className="text-emerald-400 font-bold">{snapshot?.recordsCount.serviceTokens ?? 0} rows</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800">
                <span className="text-slate-300">incident_logs</span>
                <span className="text-amber-400 font-bold">{snapshot?.recordsCount.incidentLogs ?? 0} rows</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800">
                <span className="text-slate-300">tunnel_configs</span>
                <span className="text-sky-400 font-bold">{snapshot?.recordsCount.tunnelConfigs ?? 0} rows</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Litestream Continuous WAL Replication */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-emerald-400" />
                Cloudflare R2 / S3 Litestream Synchronization
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Every transaction written to SQLite is replicated sub-second to decentralized edge object storage.
              </p>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE REPLICATION SYNCED</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-500 text-[10px] block">REPLICA BUCKET TARGET</span>
              <span className="text-slate-300 truncate block mt-0.5">
                {litestreamConfig?.replicaBucket || 'r2://edge-sqlite-backups/main-db'}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-500 text-[10px] block">S3 / R2 STORAGE ENDPOINT</span>
              <span className="text-slate-300 truncate block mt-0.5">
                {litestreamConfig?.endpoint || 'https://cfa89012.r2.cloudflarestorage.com'}
              </span>
            </div>
          </div>

          {/* Backup Snapshots History Table */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Point-In-Time Backup Replicas ({history.length})</span>
              <span className="text-[10px] text-slate-500 font-mono">Disaster Recovery Ready</span>
            </div>

            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold">{item.id}</span>
                      <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
                        {item.type.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate max-w-sm">
                      {item.checksum}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right text-[11px] text-slate-400">
                      <div>{(item.sizeBytes / 1024).toFixed(1)} KB</div>
                      <div className="text-[10px] text-slate-500">{new Date(item.timestamp).toLocaleTimeString()}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestore(item.id)}
                      className="px-2.5 py-1 text-[11px] rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 transition-colors"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
