# LocalHost Engine

> **Zero-Config Self-Hosting Edge Daemon, Ingress Runner & Jarvis Agent Gateway.**  
> Transform any local directory into a production-grade, isolated edge microservice with automated Cloudflare/Tailscale ingress and Model Context Protocol (MCP) tool interfaces for autonomous AI agents.

---

## 1. High-Level Architecture

LocalHost Engine operates as an operating-system daemon and process orchestrator. It bridges local applications running on loopback (`127.0.0.1`) with secure cloud tunnels (Cloudflare Zero Trust, Tailscale Funnel) and autonomous AI workflows (Jarvis Agent Gateway, Claude Desktop, Anthropic/OpenAI MCP clients).

```
                      +---------------------------------------+
                      |       Web Dashboard / CLI Client      |
                      |   (Vite + React 19 + Tailwind CSS)    |
                      +-------------------+-------------------+
                                          |
                      +-------------------v-------------------+
                      |      Core Daemon (server.ts)          |
                      |  127.0.0.1:3000 (UI) & 127.0.0.1:4848 |
                      +-------------------+-------------------+
                                          |
        +---------------------------------+---------------------------------+
        |                                 |                                 |
+-------v-------+                 +-------v-------+                 +-------v-------+
|  Host Shield  |                 |  Subprocess   |                 | SQLite Engine |
| & Zero Trust  |                 |  Supervisor   |                 | & Litestream  |
| (AccessGuard) |                 | (Ring Buffer) |                 | Replication   |
+-------+-------+                 +-------+-------+                 +-------+-------+
        |                                 |                                 |
        v                                 v                                 v
+---------------+                 +---------------+                 +---------------+
| Ingress Layer |                 | Local Runtime |                 | Cloudflare R2 |
| - Cloudflare  |                 | - Node.js     |                 | State Backup  |
| - Tailscale   |                 | - Python/Go   |                 | (WAL Log Sync)|
+---------------+                 +---------------+                 +---------------+
        |                                 |
        +---------------------------------+
                        |
            +-----------v-----------+
            |  Jarvis MCP Protocol  |
            |   (/api/mcp/tools)    |
            |   (/api/mcp/call)     |
            +-----------------------+
```

### Core Architecture Components:
- **Core Daemon (`server.ts` & `src/api/agentGateway.ts`)**: Hosts REST and SSE APIs, secondary dedicated RPC listener on `127.0.0.1:4848`, and mounts the front-end interface.
- **Process Supervisor (`src/core/supervisor.ts`)**: Manages isolated process trees, captures standard input/output into circular memory buffers, streams logs, and enforces graceful shutdown.
- **Auto-Stack Detector (`src/core/detector.ts`)**: Inspects repository root files (e.g., `package.json`, `go.mod`, `requirements.txt`, `Dockerfile`) to auto-assign ports, determine package managers, and format commands.
- **Host Shield & Access Guard (`src/core/shield.ts`, `src/security/accessGuard.ts`)**: Enforces path-traversal prevention, strict 127.0.0.1 binding, rate limiting, and Cloudflare Service Token validation.
- **Embedded ACID State Store (`src/db/store.ts`, `src/db/litestream.ts`)**: Embedded SQLite engine with WAL journaling, schema auto-migrations, and optional Litestream backup to Cloudflare R2 or S3.
- **Jarvis MCP Gateway (`src/api/mcpServer.ts`)**: Exposes Model Context Protocol tool endpoints so LLMs can autonomously inspect, deploy, manage, and query edge services.

---

## 2. Prerequisites

| Component | Minimum Version | Required? | Purpose |
|---|---|---|---|
| **Node.js** | `v20.0.0+` (v22 LTS recommended) | **Yes** | Engine daemon runtime and native `node:sqlite` DatabaseSync |
| **npm / pnpm / bun** | Modern | **Yes** | Dependency installation and stack running |
| **cloudflared** | `2024.1.0+` | *Optional* | Native Cloudflare Quick Tunnels and Zero Trust Named Tunnels |
| **tailscale** | `1.50.0+` | *Optional* | Tailscale Serve (mesh) and Tailscale Funnel (public SSL) |
| **Docker Engine** | `24.0.0+` | *Optional* | Containerized stack auto-detection and execution |

---

## 3. Quickstart Guide

### Option A: Clone & Setup
```bash
# 1. Clone repository
git clone https://github.com/your-org/localhost-engine.git
cd localhost-engine

# 2. Install dependencies
npm install

# 3. Run Preflight Environment Verification
npm run preflight

# 4. Run Smoke Test Suite
npm run test:smoke

# 5. Start Development Server
npm run dev
```

The unified dashboard will be accessible at `http://127.0.0.1:3000`, while the Jarvis Agent Gateway listens on `http://127.0.0.1:4848`.

### Option B: System Daemon Installation (Background Mode)
LocalHost Engine includes an OS daemon manager (`src/daemon/serviceManager.ts` and CLI):

```bash
# Link CLI globally
npm run cli -- help

# Install system background daemon (systemd on Linux, launchd on macOS)
npx tsx bin/localhost.js daemon install

# Check status of running daemon
npx tsx bin/localhost.js status

# Uninstall background daemon
npx tsx bin/localhost.js daemon uninstall
```

---

## 4. Network & Ingress Reference

LocalHost Engine supports four distinct ingress topologies:

### 1. Cloudflare Quick Tunnel (`cloudflare_quick`)
- **Domain**: `*.trycloudflare.com`
- **Setup**: Zero configuration. Generates an ephemeral SSL certificate and public URL instantly via the Cloudflare Edge.
- **Use Case**: Rapid sharing, client demos, ephemeral webhooks.

### 2. Cloudflare Zero Trust Named Tunnel (`cloudflare_named`)
- **Domain**: Custom domain or subdomain (e.g., `api.yourdomain.com`).
- **Setup**: Configured via Cloudflare Account ID and API Token or Tunnel Secret.
- **Features**: Persistent hostnames, DDoS protection, edge caching, and Cloudflare Access Zero Trust gates.

### 3. Tailscale Serve (`tailscale_serve`)
- **Domain**: `*.ts.net` (internal to your Tailnet)
- **Setup**: Uses the host's authenticated Tailscale node.
- **Features**: End-to-end encrypted wireguard mesh connectivity accessible only to authorized devices in your Tailnet.

### 4. Tailscale Funnel (`tailscale_funnel`)
- **Domain**: Public `*.ts.net` URL with automated Let's Encrypt certificates.
- **Features**: Public internet access routed through Tailscale's global DERP and edge relays without exposing local ports.

---

## 5. Ecosystem & Jarvis Gateway Reference

Autonomous agents (Jarvis, Claude Desktop, CrewAI, AutoGen) can control LocalHost Engine through native Model Context Protocol (MCP) endpoints or REST.

### Model Context Protocol (MCP)

#### `GET /api/mcp/tools`
Returns the standardized MCP tool catalog:

```json
{
  "tools": [
    {
      "name": "deploy_workspace",
      "description": "Auto-detects project runtime, allocates loopback port, starts process, and attaches edge tunnel.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "ingressMode": { "type": "string", "enum": ["none", "cloudflare_quick", "cloudflare_named", "tailscale_serve", "tailscale_funnel"] },
          "port": { "type": "number" },
          "envVars": { "type": "object" }
        },
        "required": ["path"]
      }
    },
    { "name": "list_edge_fleet", "description": "Returns status, uptime, CPU/RAM, and ingress URLs for all active services." },
    { "name": "restart_service", "description": "Gracefully restarts a running microservice process." },
    { "name": "panic_kill_service", "description": "Instantly terminates a specific process or triggers global killswitch." },
    { "name": "query_service_logs", "description": "Retrieves recent structured stdout/stderr ring buffer logs." }
  ]
}
```

#### `POST /api/mcp/call`
Executes an MCP tool call:

```bash
curl -X POST http://127.0.0.1:4848/api/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "deploy_workspace",
    "arguments": {
      "path": "./samples/node-api",
      "ingressMode": "cloudflare_quick"
    }
  }'
```

### Real-Time SSE Event Bus (`GET /api/events`)
Subscribes to server-sent events for process state updates:
- `process:started`, `process:stopped`, `process:log`
- `ingress:url_assigned`, `ingress:failed`
- `shield:blocked_request`, `system:panic_kill`

### Continuous Deployment Git Webhook
Every deployed workspace generates a dedicated HMAC webhook secret (`whsec_...`):
- Endpoint: `POST /api/webhooks/git/:projectId`
- Header: `X-Hub-Signature-256: sha256=<hmac>`
- Automatically pulls latest branch changes, re-runs build steps, and cycles the process without downtime.

---

## 6. Security & Guardrail Specifications

LocalHost Engine is engineered with zero-trust defensive defaults:

1. **Strict Loopback Lockdown**: Subprocesses are launched with environment variables `HOST=127.0.0.1` and commands rewritten to prevent binding to public interfaces (`0.0.0.0`).
2. **Path Traversal Sanitization**: All incoming file and path arguments are resolved against canonical working roots to block `../../etc` escape attacks.
3. **Hardware Shield & RAM Caps**: Processes exceeding configurable RSS thresholds (default: 512MB) trigger automatic warnings or killswitches.
4. **Cloudflare Zero Trust Access & Service Tokens**: Integrates edge validation of `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers to authorize agent bots while enforcing MFA for human users.
5. **Panic Killswitch (`POST /api/kill-all`)**: Instantly sends tree-wide signals (`SIGKILL`) to terminate rogue processes and close tunnel descriptors in under 1 second.

---

## 7. License

Apache-2.0 © LocalHost Engine Contributors.
