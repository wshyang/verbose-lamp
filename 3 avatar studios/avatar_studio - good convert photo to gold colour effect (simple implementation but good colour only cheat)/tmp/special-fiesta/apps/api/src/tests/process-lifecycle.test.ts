import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { startLifecycle, type LifecycleTargets } from '../processLifecycle.js';

function harness() {
  const order: string[] = [];
  const signals = new EventEmitter();
  const events = new EventEmitter();
  const exit = vi.fn();
  const server = {
    close: vi.fn(() => void order.push('close')),
    closeIdleConnections: vi.fn(() => void order.push('idle')),
    closeAllConnections: vi.fn(() => void order.push('all')),
  };
  const targets = {
    server,
    db: {} as never,
    closeDatabase: async () => void order.push('database'),
    exit,
    log: () => undefined,
    signals,
    events,
    graceMs: 1,
    deadlineMs: 500,
  } as unknown as LifecycleTargets;
  return { order, signals, events, exit, targets };
}

describe('ADR-324 — process lifecycle', () => {
  it('on SIGTERM stops accepting, ends the streams, then closes the database, and exits 0', async () => {
    const { order, signals, exit, targets } = harness();
    const { shutdown } = startLifecycle(targets);
    signals.emit('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(order).toEqual(['close', 'idle', 'all', 'database']);
    expect(exit).toHaveBeenCalledWith(0);
    expect(shutdown.isDraining()).toBe(true);
  });

  it('on SIGINT does the same', async () => {
    const { signals, exit, targets } = harness();
    startLifecycle(targets);
    signals.emit('SIGINT');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  it('on an uncaught exception shuts down gracefully and exits 1', async () => {
    const { events, order, exit, targets } = harness();
    startLifecycle(targets);
    events.emit('uncaughtException', new Error('thrown in a socket callback'));
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(order).toContain('database');
  });

  it('keeps running through an unhandled rejection', async () => {
    const { events, exit, targets } = harness();
    startLifecycle(targets);
    events.emit('unhandledRejection', new Error('a detached write failed'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(exit).not.toHaveBeenCalled();
  });

  it('two signals shut down once', async () => {
    const { signals, order, exit, targets } = harness();
    startLifecycle(targets);
    signals.emit('SIGTERM');
    signals.emit('SIGINT');
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(order.filter((step) => step === 'database')).toHaveLength(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('uninstall removes every listener', () => {
    const { signals, events, targets } = harness();
    const { uninstall } = startLifecycle(targets);
    uninstall();
    expect(signals.listenerCount('SIGTERM') + signals.listenerCount('SIGINT')).toBe(0);
    expect(events.listenerCount('unhandledRejection') + events.listenerCount('uncaughtException')).toBe(0);
  });
});
