import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installProcessGuards, unhandledRejectionCount, resetProcessGuardsForTests } from '../lib/processGuards.js';
import { createShutdown } from '../lib/shutdown.js';

/**
 * ADR-324 — leaving on purpose. Three properties: the closers run in the order given and a
 * failing one does not stop the rest; a closer that never returns cannot hold the process past
 * the deadline (Docker's SIGKILL arrives at 10 s and a kill is exactly what graceful shutdown
 * exists to avoid); and asking twice is the same as asking once.
 */
describe('createShutdown', () => {
  it('runs closers in order, then exits with the requested code', async () => {
    const order: string[] = [];
    const exit = vi.fn();
    const shutdown = createShutdown({
      closers: [
        { name: 'a', close: async () => void order.push('a') },
        { name: 'b', close: async () => void order.push('b') },
      ],
      deadlineMs: 1_000,
      exit,
      log: () => undefined,
    });
    await shutdown.run('SIGTERM', 0);
    expect(order).toEqual(['a', 'b']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('keeps going when a closer throws', async () => {
    const order: string[] = [];
    const log = vi.fn();
    const shutdown = createShutdown({
      closers: [
        { name: 'bad', close: async () => Promise.reject(new Error('boom')) },
        { name: 'good', close: async () => void order.push('good') },
      ],
      deadlineMs: 1_000,
      exit: vi.fn(),
      log,
    });
    await shutdown.run('SIGTERM', 0);
    expect(order).toEqual(['good']);
    expect(String(log.mock.calls.flat())).toContain('bad');
  });

  it('exits at the deadline when a closer never returns', async () => {
    const exit = vi.fn();
    const shutdown = createShutdown({
      closers: [{ name: 'hung', close: () => new Promise(() => undefined) }],
      deadlineMs: 30,
      exit,
      log: () => undefined,
    });
    await shutdown.run('SIGTERM', 0);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('is idempotent: a second request neither re-runs closers nor exits twice', async () => {
    const close = vi.fn(async () => undefined);
    const exit = vi.fn();
    const shutdown = createShutdown({ closers: [{ name: 'a', close }], deadlineMs: 1_000, exit, log: () => undefined });
    await Promise.all([shutdown.run('SIGTERM', 0), shutdown.run('SIGINT', 0)]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('reports draining from the first request, so readiness can fail before the closers finish', async () => {
    let seen = false;
    const shutdown = createShutdown({
      closers: [{ name: 'a', close: async () => void (seen = shutdown.isDraining()) }],
      deadlineMs: 1_000,
      exit: vi.fn(),
      log: () => undefined,
    });
    expect(shutdown.isDraining()).toBe(false);
    await shutdown.run('SIGTERM', 0);
    expect(seen).toBe(true);
  });
});

describe('installProcessGuards', () => {
  afterEach(() => resetProcessGuardsForTests());

  function fakeProcess(): EventEmitter {
    return new EventEmitter();
  }

  it('counts an unhandled rejection and keeps the process running', () => {
    const target = fakeProcess();
    const onFatal = vi.fn();
    installProcessGuards({ target, onFatal, log: () => undefined });
    target.emit('unhandledRejection', new Error('a detached write failed'));
    expect(unhandledRejectionCount()).toBe(1);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('treats an uncaught exception as fatal: state may be corrupt', () => {
    const target = fakeProcess();
    const onFatal = vi.fn();
    installProcessGuards({ target, onFatal, log: () => undefined });
    target.emit('uncaughtException', new Error('socket callback threw'));
    expect(onFatal).toHaveBeenCalledWith('uncaughtException');
  });

  it('logs through the scrubbing reporter, so a failed query does not print its bound values', () => {
    const target = fakeProcess();
    const log = vi.fn();
    installProcessGuards({ target, onFatal: vi.fn(), log });
    const failure = Object.assign(new Error('Failed query: insert into t values ($1)\nparams: SECRET-PHOTO'), {
      query: 'insert into t values ($1)',
      params: ['SECRET-PHOTO'],
    });
    target.emit('unhandledRejection', failure);
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET-PHOTO');
  });

  it('removes its listeners on uninstall', () => {
    const target = fakeProcess();
    const uninstall = installProcessGuards({ target, onFatal: vi.fn(), log: () => undefined });
    uninstall();
    expect(target.listenerCount('unhandledRejection')).toBe(0);
    expect(target.listenerCount('uncaughtException')).toBe(0);
  });
});
