import type { Server } from 'node:http';

/**
 * ADR-324 — how long a client may take to send us a request.
 *
 * Node's defaults are 300 s to deliver a whole request and 60 s to deliver its headers: a client
 * that opens a socket and trickles bytes holds that socket, and the memory behind it, for five
 * minutes. The largest legitimate request is a 12 MB photo over venue Wi-Fi, which a minute
 * covers; everything else is a few hundred bytes. Both limits are about RECEIVING the request, so
 * they do not touch an event stream, which is a long-lived RESPONSE.
 *
 * `keepAliveTimeout` stays above the platform proxy's idle timeout (typically 60 s), because the
 * well-known failure is the reverse: the proxy reusing a connection this process has just closed.
 */
export const REQUEST_TIMEOUT_MS = 60_000;
export const HEADERS_TIMEOUT_MS = 15_000;
export const KEEP_ALIVE_TIMEOUT_MS = 65_000;

export function applyServerLimits(server: Pick<Server, 'requestTimeout' | 'headersTimeout' | 'keepAliveTimeout'>): void {
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
}
