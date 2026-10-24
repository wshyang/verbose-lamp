/**
 * One virtual user's HTTP client: a cookie jar of one, a stopwatch, and a label for every
 * call so the report reads like the API's route table rather than like 300 unique URLs.
 *
 * It drives the same public API a browser does — no direct database access — so whatever
 * the harness measures is what a phone on the beach would experience.
 */

export class Client {
  constructor(input) {
    this.base = input.base;
    this.collector = input.collector;
    this.record = input.record;
    this.cookie = null;
    this.actor = input.actor ?? 'anon';
  }

  /** `label` is the route template, e.g. `GET /api/teams/:id`. */
  async call(method, path, options = {}) {
    const started = performance.now();
    const at = Date.now();
    const label = options.label ?? `${method} ${path}`;
    try {
      const response = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(this.cookie === null ? {} : { cookie: this.cookie }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) this.cookie = setCookie.split(';')[0];
      /**
       * ADR-048 — not every response is JSON any more. A photo rendition is image bytes, and
       * `JSON.parse` on those throws, which would have recorded every thumb fetch as a failure
       * and quietly poisoned the very numbers this harness exists to produce. `raw` consumes the
       * body as bytes instead, so the transfer is still paid for and still timed.
       */
      let payload = null;
      if (options.raw) {
        await response.arrayBuffer();
      } else {
        const text = await response.text();
        payload = text ? JSON.parse(text) : null;
      }
      const ok = response.status < 400 || (options.tolerate ?? []).includes(response.status);
      this.record(this.collector, {
        label,
        at,
        ms: performance.now() - started,
        status: response.status,
        ok,
        detail: ok ? null : (payload?.error?.message ?? `status ${response.status}`),
      });
      return { status: response.status, payload, ok };
    } catch (caught) {
      // A refused connection, a socket hang-up or a JSON body that never arrived: the
      // server failing under load looks like this long before it starts returning 500s.
      this.record(this.collector, {
        label,
        at,
        ms: performance.now() - started,
        status: 0,
        ok: false,
        detail: caught instanceof Error ? caught.message : String(caught),
      });
      return { status: 0, payload: null, ok: false };
    }
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits, but never past the end of the run. Without this a virtual user asleep on a
 * 75-second poll keeps the process alive long after the load has stopped, and the tail of
 * silence drags the reported throughput down with it.
 */
export const sleepUntil = (ms, deadline) => sleep(Math.max(0, Math.min(ms, deadline - Date.now())));

/** The client's own poll window (ADR-024), or the aligned interval it replaced. */
export function pollDelay(config) {
  if (config.poll === 'fixed') {
    // Every client wakes on the same wall-clock boundary — the stampede ADR-024 removed.
    return config.fixedMs - (Date.now() % config.fixedMs);
  }
  return config.pollMinMs + Math.random() * (config.pollMaxMs - config.pollMinMs);
}

/** Think time between one screen and the next. */
export function thinkTime(minMs, maxMs) {
  return minMs + Math.random() * (maxMs - minMs);
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Weighted choice: `[[value, weight], …]`. */
export function pickWeighted(entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
