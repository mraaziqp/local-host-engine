/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Lock,
  Unlock,
  Check,
  Copy,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import type { ZeroTrustAccessConfig, ServiceToken } from '../core/types.ts';

export const ZeroTrustPanel: React.FC = () => {
  const [config, setConfig] = useState<ZeroTrustAccessConfig>({
    enabled: true,
    protectWithCloudflareAccess: false,
    ingressPasskeyRequired: false,
    passkeySecret: 'edge_pass_2026',
    allowedEmails: ['developer@local.internal', 'admin@local.internal'],
    serviceTokensCount: 1,
  });

  const [tokens, setTokens] = useState<ServiceToken[]>([]);
  const [newTokenName, setNewTokenName] = useState<string>('');
  const [newTokenPermissions, setNewTokenPermissions] = useState<string>('deploy,restart,status,logs');
  const [passkeyInput, setPasskeyInput] = useState<string>('edge_pass_2026');
  const [newEmail, setNewEmail] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchSecurityData = async () => {
    try {
      const [cfgRes, tokRes] = await Promise.all([
        fetch('/api/security/zerotrust'),
        fetch('/api/security/tokens'),
      ]);

      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setConfig(cfg);
        if (cfg.passkeySecret) setPasskeyInput(cfg.passkeySecret);
      }
      if (tokRes.ok) {
        const toks = await tokRes.json();
        setTokens(toks);
      }
    } catch {
      // Standalone mode fallback
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUpdateConfig = async (patch: Partial<ZeroTrustAccessConfig>) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/security/zerotrust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json();
        setConfig(updated);
        setSuccessMsg('Security policy saved & enforced across ingress tunnels');
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;

    try {
      const perms = newTokenPermissions.split(',').map((p) => p.trim()).filter(Boolean);
      const res = await fetch('/api/security/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceName: newTokenName,
          permissions: perms,
        }),
      });

      if (res.ok) {
        const token = await res.json();
        setTokens((prev) => [token, ...prev]);
        setNewTokenName('');
        setSuccessMsg(`Generated service token for '${token.serviceName}'`);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleRevokeToken = async (clientId: string) => {
    try {
      const res = await fetch(`/api/security/tokens/${clientId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setTokens((prev) => prev.filter((t) => t.clientId !== clientId));
        setSuccessMsg('Service token revoked');
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    const current = config.allowedEmails || [];
    if (!current.includes(newEmail.trim())) {
      const updated = [...current, newEmail.trim()];
      handleUpdateConfig({ allowedEmails: updated });
    }
    setNewEmail('');
  };

  const handleRemoveEmail = (email: string) => {
    const updated = (config.allowedEmails || []).filter((e) => e !== email);
    handleUpdateConfig({ allowedEmails: updated });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">
              Zero Trust Edge Access Guard
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-800 text-[10px] text-indigo-300 font-mono">
              Phase 5
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Shield public Cloudflare and Tailscale URLs with edge authentication barriers, Cloudflare Access JWT validation, and cryptographically verified Jarvis machine tokens.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer text-xs font-medium text-slate-300">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleUpdateConfig({ enabled: e.target.checked })}
              className="rounded text-indigo-500 focus:ring-0"
            />
            <span>Edge Guard {config.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Two Column Layout: Access Policies & Ingress Gateways */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Passkey & Cloudflare Access Rules */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              Ingress Passkey Barrier
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              HTTP Basic / Bearer Auth
            </span>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/60 cursor-pointer">
              <input
                type="checkbox"
                checked={config.ingressPasskeyRequired}
                onChange={(e) => handleUpdateConfig({ ingressPasskeyRequired: e.target.checked })}
                className="mt-0.5 rounded text-amber-500 focus:ring-0"
              />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-white">
                  Enforce Ingress Passkey on External URLs
                </div>
                <div className="text-[11px] text-slate-400">
                  When enabled, all inbound HTTP requests via Cloudflare tunnels or Tailscale Funnel must supply the secret passkey or Bearer token.
                </div>
              </div>
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Passkey Secret Token
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={passkeyInput}
                  onChange={(e) => setPasskeyInput(e.target.value)}
                  placeholder="edge_pass_2026"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => handleUpdateConfig({ passkeySecret: passkeyInput })}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  Save Passkey
                </button>
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                Header format: <code className="text-cyan-400">Authorization: Bearer {passkeyInput}</code> or <code className="text-cyan-400">X-Edge-Passkey: {passkeyInput}</code>
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                Cloudflare Zero Trust Access Integration
              </h3>
              <span className="text-[10px] font-mono text-cyan-400">Identity-Aware Proxy</span>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/60 cursor-pointer">
              <input
                type="checkbox"
                checked={config.protectWithCloudflareAccess}
                onChange={(e) => handleUpdateConfig({ protectWithCloudflareAccess: e.target.checked })}
                className="mt-0.5 rounded text-cyan-500 focus:ring-0"
              />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-white">
                  Validate Cloudflare Access Headers & JWT
                </div>
                <div className="text-[11px] text-slate-400">
                  Inspects inbound <code className="text-cyan-300 font-mono">Cf-Access-Authenticated-User-Email</code> and enforces whitelist of approved organization engineers.
                </div>
              </div>
            </label>

            {/* Allowed emails whitelist */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Allowed Organization User Whitelist
              </label>
              <form onSubmit={handleAddEmail} className="flex items-center gap-2 mb-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="engineer@company.com"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>

              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {(config.allowedEmails || []).map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(email)}
                      className="text-slate-500 hover:text-red-400 ml-1"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Generate Jarvis & Machine Service Tokens */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                Autonomous Agent Service Tokens
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Cryptographic client ID & secret pairs for Jarvis, GitHub Actions, and external ecosystem automation.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateToken} className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-300">Issue New Service Token</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">Service / Bot Name</label>
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="e.g. Jarvis Secondary Bot"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 mb-1">Permissions (comma separated)</label>
                <input
                  type="text"
                  value={newTokenPermissions}
                  onChange={(e) => setNewTokenPermissions(e.target.value)}
                  placeholder="deploy,restart,status"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Issue Token Pair</span>
              </button>
            </div>
          </form>

          {/* Active Tokens List */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Active Service Tokens ({tokens.length})</span>
              <span className="text-[10px] text-slate-500 font-mono">Persisted in SQLite</span>
            </div>

            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {tokens.length === 0 ? (
                <div className="p-4 rounded-lg bg-slate-950/40 border border-slate-800 text-center text-xs text-slate-500">
                  No service tokens issued yet.
                </div>
              ) : (
                tokens.map((token) => (
                  <div
                    key={token.clientId}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800/90 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="font-bold text-white text-xs">{token.serviceName}</span>
                      </div>
                      <button
                        onClick={() => handleRevokeToken(token.clientId)}
                        className="text-slate-500 hover:text-red-400 p-1"
                        title="Revoke Token"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1 font-mono text-[11px]">
                      <div className="flex items-center justify-between bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-400 truncate">Client ID: {token.clientId}</span>
                        <button
                          onClick={() => copyToClipboard(token.clientId, `cid-${token.id}`)}
                          className="text-slate-500 hover:text-white shrink-0 ml-1"
                        >
                          {copiedId === `cid-${token.id}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-amber-400 truncate">Secret: {token.clientSecret || '••••••••••••••••'}</span>
                        {token.clientSecret && (
                          <button
                            onClick={() => copyToClipboard(token.clientSecret, `sec-${token.id}`)}
                            className="text-slate-500 hover:text-white shrink-0 ml-1"
                          >
                            {copiedId === `sec-${token.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Permissions: {token.permissions.join(', ')}</span>
                      <span>Issued: {new Date(token.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
