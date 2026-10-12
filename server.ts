/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createAgentGatewayRouter, startDaemonListener } from './src/api/agentGateway.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const DAEMON_PORT = Number(process.env.DAEMON_PORT) || 4848;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Mount Agent Gateway and Engine API routes under /api
  app.use('/api', createAgentGatewayRouter());

  // Also boot the dedicated daemon RPC listener on 127.0.0.1:4848 for Jarvis
  if (process.env.SKIP_DAEMON_LISTENER !== 'true') {
    try {
      startDaemonListener(DAEMON_PORT, '127.0.0.1');
    } catch (err: any) {
      console.warn('[Daemon] Secondary listener error:', err.message);
    }
  }

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LocalHost Engine] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[LocalHost Engine] Fatal startup error:', err);
  process.exit(1);
});
