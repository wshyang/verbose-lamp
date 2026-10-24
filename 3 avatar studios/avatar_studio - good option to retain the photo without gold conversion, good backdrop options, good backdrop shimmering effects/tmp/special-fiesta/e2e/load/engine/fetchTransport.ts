import { TransportFailure, type Transport, type TransportResponse } from './syntheticUser.js';

/**
 * ADR-350 — the Phase 3 transport: the same `Transport` the in-process integration test
 * drove over `app.request()`, now over `fetch` against a URL. Streams carry the session
 * token in the query string (ADR-016), requests carry it as a bearer header, and a `fetch`
 * that never got a response becomes a typed `TransportFailure` — the fd wall is reported as
 * the knee cause it is (plan §4), not as an unexplained crash.
 */

const EMPTY_BODY = new ReadableStream<Uint8Array>();

export function fetchTransport(baseUrl: string): Transport {
  return {
    async request(spec) {
      const headers: Record<string, string> = {};
      if (spec.token !== undefined) headers['authorization'] = `Bearer ${spec.token}`;
      if (spec.body !== undefined) headers['content-type'] = 'application/json';
      const response = await guardedFetch(`${baseUrl}${spec.path}`, {
        method: spec.method,
        headers,
        ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      });
      return responseOf(response);
    },
    async openStream(spec) {
      const response = await guardedFetch(`${baseUrl}${spec.path}?session_token=${encodeURIComponent(spec.token)}`);
      if (response.body === null) return { status: response.status, body: EMPTY_BODY };
      return { status: response.status, body: response.body };
    },
  };
}

async function guardedFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw toTransportFailure(error);
  }
}

function responseOf(response: Response): TransportResponse {
  return {
    status: response.status,
    async json<T>(): Promise<T> {
      return (await response.json()) as T;
    },
    async text(): Promise<string> {
      return response.text();
    },
  };
}

/** EMFILE/ENFILE (directly, or inside fetch's AggregateError/cause chain) is the fd wall. */
function toTransportFailure(error: unknown): TransportFailure {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const candidate = current as Error & { code?: unknown; errors?: unknown[] };
    if (typeof candidate.code === 'string') codes.push(candidate.code);
    for (const inner of candidate.errors ?? []) {
      const code = (inner as { code?: unknown } | null)?.code;
      if (typeof code === 'string') codes.push(code);
    }
    current = candidate.cause;
  }
  const fd = codes.some((code) => code === 'EMFILE' || code === 'ENFILE');
  const detail = error instanceof Error ? error.message : String(error);
  return new TransportFailure(fd ? 'fd' : 'network', detail);
}
