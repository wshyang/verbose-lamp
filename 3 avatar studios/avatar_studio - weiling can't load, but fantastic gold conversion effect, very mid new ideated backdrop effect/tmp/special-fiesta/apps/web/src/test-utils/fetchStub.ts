import { vi } from 'vitest';

/**
 * A route-table stub for `fetch`, used by hook and component tests.
 *
 * AGENTS-testing.md §3: we do not mock our own modules. This replaces the *browser* boundary
 * only — the hooks, the api layer and the components under test are the real ones, and the
 * JSON shapes below are the same `@psd/contracts` views the API returns.
 */

export interface StubResponse {
  status?: number;
  body?: unknown;
  /** Simulates a dead network (fetch rejects), which is how the offline queue is triggered. */
  offline?: boolean;
  /**
   * Simulates latency. A response that resolves in a microtask can hide ordering bugs that a
   * real 4G beach connection exposes immediately, so any test about what the UI does *while*
   * a request is in flight should set this.
   */
  delayMs?: number;
}

export type StubHandler =
  | StubResponse
  | ((input: { body: unknown; url: string; headers: Record<string, string> }) => StubResponse);

export type RouteTable = Record<string, StubHandler>;

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
  /** Lower-cased, so a test can assert the bearer credential without guessing the casing. */
  headers: Record<string, string>;
}

export interface FetchStub {
  calls: RecordedCall[];
  routes: RouteTable;
  restore: () => void;
  callsTo: (key: string) => RecordedCall[];
  /**
   * ADR-192 — requests the route table did not cover, kept rather than only thrown.
   *
   * The throw below becomes a *rejected promise*, and plenty of real callers start a request
   * without awaiting it — a refresh on mount, a drain on a timer. Nobody catches those, so the
   * rejection floats until the runner notices, and the runner blames whichever test happens to
   * be on screen at that moment. That is how a single unstubbed call becomes an intermittent
   * failure in a test that never made it, and why such a failure moves around the file when the
   * machine is loaded and stays hidden when the file runs alone.
   *
   * Recording the miss makes it attributable: a suite can assert in `afterEach` that its own
   * test made no unstubbed call, and the complaint then lands on the test that caused it.
   */
  unmatched: RecordedCall[];
}

/**
 * ADR-192 — the assertion that turns a wandering flake into a named one.
 *
 * Call it from a suite's `afterEach`, before `restore()`. Cheap, and silent until the day
 * something fires a request nobody listed.
 *
 * ADR-211 — you no longer have to. `assertNoUnstubbedCallsGlobally` runs this over every stub
 * installed during a test, from one `afterEach` in `test-setup.ts`. This export stays because
 * two suites call it explicitly and because an explicit call mid-test is occasionally what you
 * want, but it is now a belt over a brace.
 */
export function expectNoUnstubbedCalls(stub: FetchStub | undefined): void {
  const missed = stub?.unmatched ?? [];
  if (missed.length === 0) return;
  const summary = missed.map((call) => `${call.method} ${call.path}`).join(', ');
  throw new Error(`This test made ${missed.length} unstubbed request(s): ${summary}`);
}

/**
 * ADR-211 — every stub installed since the last check.
 *
 * ADR-192 diagnosed the failure mode and supplied the remedy as something each suite had to
 * remember to opt into. Sixty-five of sixty-seven did not, which is the expected outcome of any
 * safeguard that has to be remembered: the files that most need it are the ones nobody revisits.
 * Registering here and asserting from the global `afterEach` inverts that — the guarantee is on
 * by default, and a brand-new test file gets it without knowing it exists.
 */
const installed: FetchStub[] = [];

/**
 * Asserts no test made a request its route table did not cover, then clears the register.
 *
 * Called from `test-setup.ts`. It CLEARS even when it throws, so one offending test does not
 * cascade into a failure for every test after it in the file — the complaint must land on the
 * test that caused it, which is the entire point of ADR-192.
 */
export function assertNoUnstubbedCallsGlobally(): void {
  const stubs = installed.splice(0, installed.length);
  const missed = stubs.flatMap((stub) => stub.unmatched);
  if (missed.length === 0) return;
  const summary = [...new Set(missed.map((call) => `${call.method} ${call.path}`))].join(', ');
  throw new Error(
    `This test made ${missed.length} unstubbed request(s): ${summary}. ` +
      'Add them to the route table — an unstubbed call rejects into whichever test is on ' +
      'screen when it lands (ADR-192).',
  );
}

function headersOf(init?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

function matchRoute(routes: RouteTable, key: string): StubHandler | null {
  if (routes[key]) return routes[key];
  for (const [pattern, handler] of Object.entries(routes)) {
    if (!pattern.includes(':')) continue;
    const expression = new RegExp(`^${pattern.replace(/:[A-Za-z]+/g, '[^/]+')}$`);
    if (expression.test(key)) return handler;
  }
  return null;
}

export function installFetchStub(routes: RouteTable): FetchStub {
  const calls: RecordedCall[] = [];
  const unmatched: RecordedCall[] = [];
  const original = globalThis.fetch;

  const respond = async (result: StubResponse): Promise<Response> => {
    if (result.delayMs) await new Promise((resolve) => setTimeout(resolve, result.delayMs));
    if (result.offline) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const implementation = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const headers = headersOf(init);
    calls.push({ method, path, body, headers });

    const handler = matchRoute(routes, `${method} ${path.split('?')[0]}`) ?? matchRoute(routes, `${method} ${path}`);
    if (!handler) {
      unmatched.push({ method, path, body, headers });
      throw new Error(`No stub for ${method} ${path}. Add it to the route table.`);
    }
    return respond(typeof handler === 'function' ? handler({ body, url, headers }) : handler);
  };

  globalThis.fetch = vi.fn(implementation) as unknown as typeof fetch;

  const stub: FetchStub = {
    calls,
    unmatched,
    routes,
    restore: () => {
      globalThis.fetch = original;
    },
    callsTo: (key: string) => {
      const [method, path] = key.split(' ');
      return calls.filter((call) => call.method === method && call.path.split('?')[0] === path);
    },
  };
  installed.push(stub);
  return stub;
}
