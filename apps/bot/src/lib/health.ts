import http from 'node:http';

export interface HealthResult {
  code: number;
  body: string;
}

/** 200 when healthy, 503 otherwise — the contract a platform healthcheck reads. */
export function healthResult(healthy: boolean): HealthResult {
  return {
    code: healthy ? 200 : 503,
    body: JSON.stringify({ ok: healthy, uptime: Math.round(process.uptime()) }),
  };
}

/**
 * Tiny HTTP health endpoint so a platform healthcheck (e.g. Railway) can detect
 * a stuck/dead bot and auto-restart it. Returns 200 only when `isHealthy()` is
 * true (the Discord client is ready), 503 otherwise.
 */
export function startHealthServer(isHealthy: () => boolean, port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      const { code, body } = healthResult(isHealthy());
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.on('error', (err) => console.error('[Health] server error:', (err as Error).message));
  server.listen(port, () => console.log(`[Health] endpoint on :${port} (GET /health → 200 when ready)`));
  return server;
}
