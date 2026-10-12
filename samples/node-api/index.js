import http from 'http';

const port = Number(process.env.PORT) || 3100;
const host = process.env.HOST || '127.0.0.1';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service: 'sample-node-edge-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    host,
    port,
    env: process.env.NODE_ENV || 'development'
  }, null, 2));
});

server.listen(port, host, () => {
  console.log(`[Sample Node API] Listening on http://${host}:${port}`);
});
