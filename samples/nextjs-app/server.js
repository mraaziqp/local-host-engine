/**
 * Next.js Edge SSR Emulation Server
 */
import http from 'node:http';

const port = Number(process.env.PORT) || 3110;
const host = process.env.HOST || '127.0.0.1';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    framework: 'Next.js 15 (App Router & SSR Edge)',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    port,
    host,
    edgeRoute: req.url,
  }));
});

server.listen(port, host, () => {
  console.log(`[Next.js App Router] SSR server listening strictly on http://${host}:${port}`);
});
