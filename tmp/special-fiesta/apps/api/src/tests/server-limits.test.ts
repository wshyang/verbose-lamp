import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { HEADERS_TIMEOUT_MS, KEEP_ALIVE_TIMEOUT_MS, REQUEST_TIMEOUT_MS, applyServerLimits } from '../serverLimits.js';

/**
 * ADR-324 — a client that opens a socket and trickles bytes must not be able to hold it for Node's
 * default five minutes. The values are checked, and one is exercised for real: a request whose
 * headers never finish is cut off by the server, not left waiting.
 */
describe('applyServerLimits', () => {
  it('sets the three timeouts', () => {
    const server = { requestTimeout: 0, headersTimeout: 0, keepAliveTimeout: 0 };
    applyServerLimits(server);
    expect(server).toEqual({
      requestTimeout: REQUEST_TIMEOUT_MS,
      headersTimeout: HEADERS_TIMEOUT_MS,
      keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
    });
  });

  it('keeps the keep-alive timeout above a typical proxy idle timeout, so the proxy never reuses a closed socket', () => {
    expect(KEEP_ALIVE_TIMEOUT_MS).toBeGreaterThan(60_000);
  });

  it('keeps the request timeout long enough for the biggest legitimate upload on slow Wi-Fi', () => {
    // 12 MB in a minute is 200 kB/s: a poor connection, still sufficient.
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('really cuts off a client whose headers never finish', async () => {
    // A handler that reads its body, as every JSON route does: it cannot answer until the body ends.
    const server = createServer({ connectionsCheckingInterval: 100 }, (incoming, response) => {
      incoming.on('data', () => undefined);
      incoming.on('end', () => response.end('ok'));
      incoming.on('error', () => undefined);
    });
    applyServerLimits(server);
    // Node only sweeps for expired requests every 30 s by default; the limits are real, the sweep is slow.
    server.headersTimeout = 300;
    server.requestTimeout = 600;
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    try {
      const outcome = await new Promise<string>((resolve) => {
        const client = request({ port, host: '127.0.0.1', method: 'POST', path: '/' });
        client.on('response', (response) => resolve(`response ${response.statusCode}`));
        client.on('error', () => resolve('closed'));
        client.on('close', () => resolve('closed'));
        // Start the request and never finish it.
        client.write('x');
      });
      expect(outcome === 'closed' || outcome === 'response 408').toBe(true);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  }, 10_000);

  it('does NOT cut off a client that has no limits applied, in the same time', async () => {
    const server = createServer((incoming, response) => {
      incoming.on('data', () => undefined);
      incoming.on('end', () => response.end('ok'));
      incoming.on('error', () => undefined);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    try {
      const outcome = await Promise.race([
        new Promise<string>((resolve) => {
          const client = request({ port, host: '127.0.0.1', method: 'POST', path: '/' });
          client.on('response', () => resolve('responded'));
          client.on('error', () => resolve('closed'));
          client.on('close', () => resolve('closed'));
          client.write('x');
        }),
        new Promise<string>((resolve) => setTimeout(() => resolve('still waiting'), 1_500)),
      ]);
      expect(outcome).toBe('still waiting');
    } finally {
      server.closeAllConnections();
      server.close();
    }
  }, 10_000);
});
