import type { Server } from 'node:http';
import { flushPresence } from './lib/presence.js';
import { installProcessGuards, type SignalTarget } from './lib/processGuards.js';
import { SHUTDOWN_DEADLINE_MS, createShutdown, type Closer, type Shutdown } from './lib/shutdown.js';
import type { AppDatabase } from './db/client.js';

/**
 * ADR-324 — what the process does when it is asked to stop, or told it cannot continue.
 *
 * Kept out of `index.ts` so it can be driven without opening a port: everything it touches
 * arrives as an argument. `index.ts` stays the only file that owns the process and the port; this
 * file only decides the order in which they are given back.
 */

/** Plain requests get this long to finish after the listener stops accepting. SSE never finishes by itself. */
export const REQUEST_GRACE_MS = 1_000;

export interface LifecycleTargets {
  server: Pick<Server, 'close' | 'closeIdleConnections' | 'closeAllConnections'>;
  db: AppDatabase;
  closeDatabase: () => Promise<void>;
  exit: (code: number) => void;
  log: (line: string) => void;
  signals: {
    on(event: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
    off(event: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  };
  /** The process-level emitter for `unhandledRejection` / `uncaughtException`. */
  events: SignalTarget;
  graceMs?: number;
  deadlineMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function closersFor(targets: LifecycleTargets): Closer[] {
  const grace = targets.graceMs ?? REQUEST_GRACE_MS;
  return [
    {
      name: 'stop accepting',
      close: async () => {
        // Not awaited: `close` only calls back once every connection is gone, and a phone's open
        // event stream is a connection that never goes by itself.
        targets.server.close();
        targets.server.closeIdleConnections();
        await sleep(grace);
      },
    },
    // The streams are ended by closing their sockets; each client reconnects (ADR-122) to the
    // process that replaces this one, spread over the reconnect window.
    { name: 'end streams', close: async () => targets.server.closeAllConnections() },
    { name: 'flush presence', close: () => flushPresence(targets.db) },
    { name: 'close database', close: targets.closeDatabase },
  ];
}

export interface Lifecycle {
  shutdown: Shutdown;
  uninstall: () => void;
}

/** Wires SIGTERM, SIGINT and the process guards to one shutdown. */
export function startLifecycle(targets: LifecycleTargets): Lifecycle {
  const shutdown = createShutdown({
    closers: closersFor(targets),
    deadlineMs: targets.deadlineMs ?? SHUTDOWN_DEADLINE_MS,
    exit: targets.exit,
    log: targets.log,
  });
  const onSigterm = (): void => void shutdown.run('SIGTERM', 0);
  const onSigint = (): void => void shutdown.run('SIGINT', 0);
  targets.signals.on('SIGTERM', onSigterm);
  targets.signals.on('SIGINT', onSigint);
  const removeGuards = installProcessGuards({
    target: targets.events,
    log: (line) => targets.log(line),
    onFatal: (reason) => void shutdown.run(reason, 1),
  });
  return {
    shutdown,
    uninstall: () => {
      targets.signals.off('SIGTERM', onSigterm);
      targets.signals.off('SIGINT', onSigint);
      removeGuards();
    },
  };
}
