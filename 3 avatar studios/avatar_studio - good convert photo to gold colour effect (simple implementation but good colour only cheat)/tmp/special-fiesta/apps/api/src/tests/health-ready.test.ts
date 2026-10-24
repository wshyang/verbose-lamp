import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHealthProbe, healthProbeFor, registerHealthSources, resetHealthSourcesForTests } from '../lib/health.js';
import { createTestContext, type TestContext } from './harness.js';

/**
 * ADR-324 — `GET /api/health/ready` proves the path a real request takes: the listener answered,
 * the app's own loop is not stalled, and the database pool can check out a connection and run a
 * read inside a transaction. `GET /api/health` stays what it was — liveness, no database — so a
 * database blip cannot get a healthy process restarted by a liveness probe.
 */
type Checks = { listener: string; app: string; db: string };

describe('GET /api/health/ready', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });

  it('is 200 with every check ok, containing "ok" for the pipeline grep', async () => {
    const response = await ctx.app.request('/api/health/ready');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await ctx.json<{ ok: boolean; checks: Checks }>(response);
    expect(body.ok).toBe(true);
    expect(body.checks).toMatchObject({ listener: 'ok', app: 'ok', db: 'ok' });
  });

  it('stays liveness-only on /api/health: no database involved', async () => {
    await ctx.handle.close();
    const response = await ctx.app.request('/api/health');
    expect(response.status).toBe(200);
    ctx = await createTestContext(); // so afterEach has something open to close
  });

  it('is 503 naming only the failed check when the database is closed', async () => {
    await ctx.handle.close();
    const response = await ctx.app.request('/api/health/ready');
    expect(response.status).toBe(503);
    const body = await ctx.json<{ ok: boolean; checks: Checks }>(response);
    expect(body.ok).toBe(false);
    expect(body.checks.db).toBe('fail');
    expect(body.checks.listener).toBe('ok');
    ctx = await createTestContext();
  });

  it('is 503 within the timeout while the database is hung, not after it', async () => {
    vi.spyOn(ctx.handle.db, 'transaction').mockImplementation(() => new Promise(() => undefined) as never);
    const started = Date.now();
    const response = await ctx.app.request('/api/health/ready');
    expect(response.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(4_000);
  }, 8_000);

  it('is 503 when the database answers but the schema is not there', async () => {
    // A connection that opens and a server that is up prove nothing about an app whose tables are
    // missing (a wrong database, a role that cannot read them): the probe has to actually read one.
    await ctx.handle.runSql('alter table superadmin_account rename to superadmin_account_gone');
    const response = await ctx.app.request('/api/health/ready');
    expect(response.status).toBe(503);
    expect((await ctx.json<{ checks: Checks }>(response)).checks.db).toBe('fail');
  });

  it('gives an anonymous caller names and ok/fail only — no error text, no pool numbers', async () => {
    vi.spyOn(ctx.handle.db, 'transaction').mockRejectedValue(new Error('connect ECONNREFUSED 10.0.3.7:5432'));
    const response = await ctx.app.request('/api/health/ready');
    const text = await response.text();
    expect(text).not.toContain('ECONNREFUSED');
    expect(text).not.toContain('10.0.3.7');
    expect(text).not.toContain('detail');
  });

  it('gives a superadmin the detail', async () => {
    const admin = await ctx.signInSuperadmin();
    const response = await ctx.app.request('/api/health/ready', { headers: admin.headers });
    const body = await ctx.json<{ detail?: { dbLatencyMs: number; unhandledRejections: number } }>(response);
    expect(body.detail).toBeDefined();
    expect(body.detail?.dbLatencyMs).toBeGreaterThanOrEqual(0);
    expect(body.detail?.unhandledRejections).toBe(0);
  });

  it('shares one probe between concurrent callers', async () => {
    const spy = vi.spyOn(ctx.handle.db, 'transaction');
    await Promise.all(Array.from({ length: 8 }, () => ctx.app.request('/api/health/ready')));
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('touches the database at most once a second however fast it is called', async () => {
    const spy = vi.spyOn(ctx.handle.db, 'transaction');
    for (let call = 0; call < 5; call += 1) await ctx.app.request('/api/health/ready');
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('answers without a session cookie or any other database read', async () => {
    const select = vi.spyOn(ctx.handle.db, 'select');
    await ctx.app.request('/api/health/ready');
    expect(select).not.toHaveBeenCalled();
  });
});

describe('createHealthProbe', () => {
  it('reports the listener as failed once draining has started', async () => {
    const probe = createHealthProbe({
      checkDatabase: async () => undefined,
      isListening: () => true,
      isDraining: () => true,
      loopDelayMs: () => 1,
      rejections: () => 0,
      now: () => 0,
      timeoutMs: 100,
      maxLoopDelayMs: 1_000,
    });
    const result = await probe.run();
    expect(result.ok).toBe(false);
    expect(result.checks.listener).toBe('fail');
  });

  it('fails the app check when the event loop is stalled', async () => {
    const probe = createHealthProbe({
      checkDatabase: async () => undefined,
      isListening: () => true,
      isDraining: () => false,
      loopDelayMs: () => 5_000,
      rejections: () => 0,
      now: () => 0,
      timeoutMs: 100,
      maxLoopDelayMs: 1_000,
    });
    expect((await probe.run()).checks.app).toBe('fail');
  });
});

describe('the measured event-loop delay (ADR-324)', () => {
  afterEach(() => resetHealthSourcesForTests());

  it('fails the app check while the loop is actually blocked, and recovers once it is not', async () => {
    const ctx = await createTestContext();
    try {
      registerHealthSources({ isListening: () => true, isDraining: () => false });
      // The sampler's first tick after enabling only records a baseline; let it pass before stalling.
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Block the real loop for well over the 1 s ceiling; the sampler fires on the first tick after.
      const until = Date.now() + 1_600;
      while (Date.now() < until) {
        /* a deliberate synchronous stall, standing in for a 12 MB hex-encode or a runaway pairing */
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
      const stalled = await healthProbeFor(ctx.handle.db).run();
      expect(stalled.checks.app).toBe('fail');

      await new Promise((resolve) => setTimeout(resolve, 1_100));
      const recovered = await healthProbeFor(ctx.handle.db).run();
      expect(recovered.checks.app).toBe('ok');
    } finally {
      await ctx.close();
    }
  }, 10_000);
});
