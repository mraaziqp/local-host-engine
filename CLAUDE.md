# CLAUDE.md - LocalHost Engine Operational Playbook

> **Instructions for Autonomous Agents & Engineers Resuming Work on LocalHost Engine**

Welcome, Claude. This document provides precise technical context, architecture boundaries, verification commands, and known operational edge cases for the LocalHost Engine codebase.

---

## 1. Codebase Architecture & Directory Map

```
localhost-engine/
├── server.ts                  # Daemon & Vite HTTP Entrypoint (Ports 3000 & 4848)
├── bin/
│   └── localhost.js           # CLI Executable entrypoint (lh / localhost)
├── scripts/
│   └── verify-env.ts          # Preflight environment diagnostic runner
├── tests/
│   └── smokeTest.ts           # End-to-end integration test suite
├── samples/                   # Reference project stacks for testing & demos
│   ├── node-api/              # Standard Node.js HTTP microservice
│   ├── nextjs-app/            # Next.js standalone runner
│   ├── python-fastapi/        # Python FastAPI + Uvicorn
│   ├── python-flask/          # Python Flask microservice
│   ├── go-service/            # Go HTTP binary
│   └── static-site/           # Pure HTML5/CSS single-page application
└── src/
    ├── main.tsx & App.tsx     # React 19 Frontend Dashboard & Tab views
    ├── components/            # Specialized UI panels
    │   ├── TemplateGallery.tsx    # Stack presets selector (Next.js, FastAPI, Go, etc.)
    │   ├── ZeroTrustPanel.tsx     # Cloudflare Access & Service Token management
    │   ├── DatabaseStorePanel.tsx # SQLite metrics & Litestream backup controls
    │   ├── McpPlayground.tsx      # Model Context Protocol interactive test harness
    │   ├── MetricsDashboard.tsx   # Real-time resource usage & latency charts
    │   └── ResourceAlertsPanel.tsx# Hardware threshold alarms & notification settings
    ├── core/                  # Engine Core Subsystems
    │   ├── supervisor.ts      # Process lifecycle, stdio ring buffers, and tree termination
    │   ├── detector.ts        # Heuristic runtime detector & loopback command sanitizer
    │   ├── shield.ts          # Host protection, rate limiter, and path-traversal barrier
    │   ├── watchdog.ts        # Background health probes, ping latencies, CPU/RAM telemetry
    │   └── types.ts           # Canonical TypeScript interfaces & contracts
    ├── ingress/               # Edge Tunnel Drivers
    │   ├── cloudflare.ts      # Cloudflare Quick Tunnel & Named Tunnel adapters
    │   ├── cloudflareApi.ts   # Cloudflare v4 REST API client for domain DNS/routing
    │   ├── tailscale.ts       # Tailscale Serve & Funnel driver
    │   └── binaryRunner.ts    # Streaming line-by-line binary runner with tree-kill
    ├── security/              # Edge Security Walls
    │   └── accessGuard.ts     # Cloudflare Service Token validation & loopback passkeys
    ├── db/                    # Persistent State Store
    │   ├── store.ts           # Embedded SQLite engine with WAL mode and migrations
    │   └── litestream.ts      # Cloudflare R2 / S3 replication manager
    ├── api/                   # REST, SSE, and MCP Interfaces
    │   ├── agentGateway.ts    # Central router for /api endpoints and daemon socket
    │   ├── mcpServer.ts       # Model Context Protocol tools for autonomous agents
    │   ├── agentStream.ts     # Real-time Server-Sent Events (SSE) bus
    │   ├── jarvisSdk.ts       # High-level Jarvis programmatic integration helper
    │   └── gitWebhook.ts      # HMAC-authenticated Git auto-deployment router
    └── daemon/                # OS System Service Management
        └── serviceManager.ts  # systemd and launchd service installation/removal
```

---

## 2. Verification & Build Commands

Before modifying or committing code, run these verification steps in order:

### 1. Static Typecheck & Linting
```bash
npm run lint
# Or direct TypeScript invocation:
npx tsc --noEmit
```

### 2. Preflight Environment Diagnostics
Verifies Node.js runtime, PATH binaries, port availability, and SQLite storage write permissions:
```bash
npm run preflight
# Or: npx tsx scripts/verify-env.ts
```

### 3. End-to-End Integration Smoke Test
Spawns an ephemeral test daemon on port `4849`, deploys `samples/node-api`, probes loopback HTTP health, asserts SQLite state persistence, invokes panic killswitch, and verifies clean socket release:
```bash
npm run test:smoke
# Or: npx tsx tests/smokeTest.ts
```

### 4. Build Production Bundle
Compiles frontend assets via Vite:
```bash
npm run build
```

### 5. Run Development Server
```bash
npm run dev
# Starts unified UI on http://127.0.0.1:3000 and Daemon RPC on http://127.0.0.1:4848
```

---

## 3. How to Run Headless Simulations & Agent Workflows

You can interact with LocalHost Engine headlessly using `curl` or any MCP-compatible agent client:

### Query Engine Status
```bash
curl -s http://127.0.0.1:4848/api/status | jq .
```

### Deploy a Microservice via MCP
```bash
curl -s -X POST http://127.0.0.1:4848/api/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "deploy_workspace",
    "arguments": {
      "path": "./samples/node-api",
      "ingressMode": "none"
    }
  }' | jq .
```

### Inspect SQLite State
```bash
curl -s http://127.0.0.1:4848/api/database/status | jq .
```

### Emergency Panic Killswitch
```bash
curl -s -X POST http://127.0.0.1:4848/api/kill-all | jq .
```

---

## 4. Edge Cases & Known Traps

### Trap 1: Zombie PIDs & Process Tree Termination
- **The Issue**: Spawning commands via package managers (e.g. `npm run start`) spawns an intermediate shell (`/bin/sh`) which in turn spawns the actual Node/Python runtime. Calling `process.kill(child.pid)` merely kills the parent, leaving the runtime orphaned and holding the loopback port.
- **The Fix**: 
  - `src/core/supervisor.ts` sets `detached: process.platform !== 'win32'` when spawning. This establishes the child as a process group leader (`PGID`).
  - `killProcessTree` in `src/ingress/binaryRunner.ts` first issues `process.kill(-pid, 'SIGKILL')` to terminate the entire process group at once, followed by `pkill -P ${pid} -9` as a secondary fallback.
  - On Windows, `taskkill /F /T /PID ${pid}` is executed to terminate the whole process tree.

### Trap 2: Reading Raw `cloudflared` Streams without `SIGPIPE`
- **The Issue**: Spawning `cloudflared` through standard shell pipelines can close standard input unexpectedly and cause `cloudflared` to throw `SIGPIPE` (Exit Code 141) or unhandled `EPIPE`.
- **The Fix**:
  - `spawnManagedBinary` in `src/ingress/binaryRunner.ts` launches binaries with `shell: false` and `stdio: ['ignore', 'pipe', 'pipe']`.
  - Attaches synchronous `'error'` event handlers immediately upon spawn to absorb transient stream aborts.
  - Decodes output using `readline.createInterface()` line-by-line to extract the `trycloudflare.com` URL via regex without buffer overflow.

### Trap 3: Preserving SQLite Write-Ahead Logs (`WAL`) & Litestream
- **The Issue**: SQLite in `WAL` mode creates `localhost-engine.db-wal` and `localhost-engine.db-shm` sidecars. If Litestream replicates the `.db` file while a checkpoint is pending, state corruption can occur.
- **The Fix**:
  - `SQLiteEngineStore` in `src/db/store.ts` executes `PRAGMA synchronous = NORMAL;` and `PRAGMA journal_mode = WAL;`.
  - The store provides an atomic backup mechanism using `VACUUM INTO 'data/backup-....db'` before dispatching snapshots to Litestream or Cloudflare R2.
  - All database files (`*.db*`) are strictly excluded in `.gitignore` to prevent committing binary locks to Git.

### Trap 4: Strict Loopback Enforcement
- **The Issue**: Developers or agents might attempt to pass `--host 0.0.0.0` or `HOST=0.0.0.0`.
- **The Fix**:
  - `enforceLoopbackBinding()` in `src/core/detector.ts` aggressively replaces any `0.0.0.0` occurrences with `127.0.0.1` and forces `HOST=127.0.0.1` in the spawned process environment. Public access must exclusively flow through authenticated Ingress adapters (Cloudflare/Tailscale).

---

## 5. Next Steps for Claude Upon Opening the Project

1. Run `npm run preflight` to confirm local environment prerequisites.
2. Run `npm run test:smoke` to ensure the end-to-end deployment, persistence, and killswitch loops succeed.
3. Review `src/api/mcpServer.ts` if adding new agent tools to expand Jarvis capabilities.
4. Launch the daemon with `npm run dev` and navigate to `http://127.0.0.1:3000` to inspect UI state, Live Terminal logs, and MCP playground.
