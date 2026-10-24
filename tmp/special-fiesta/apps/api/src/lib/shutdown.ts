/**
 * ADR-324 — leaving on purpose.
 *
 * Before this, every exit was a kill: a redeploy, `docker stop`, and the console's Restart button
 * all ended the process with the embedded database mid-write, so the next boot spent its time in
 * crash recovery. This runs the closers in the order given — stop accepting, say "draining" so
 * readiness fails, end the streams, flush presence, close the database — and then exits.
 *
 * Two guarantees matter more than the order. A closer that throws does not stop the others, and a
 * closer that never returns cannot hold the process past the deadline: Docker's SIGKILL arrives
 * at ten seconds, so the deadline is set below that and the process leaves on its own terms.
 * Asking twice is the same as asking once, because SIGTERM and an uncaught exception can arrive
 * together.
 */

export interface Closer {
  name: string;
  close: () => Promise<unknown>;
}

export interface ShutdownOptions {
  closers: readonly Closer[];
  deadlineMs: number;
  exit: (code: number) => void;
  log: (line: string) => void;
}

export interface Shutdown {
  run: (reason: string, code: number) => Promise<void>;
  isDraining: () => boolean;
}

/** Docker's default grace period is ten seconds; leave room for the exit itself. */
export const SHUTDOWN_DEADLINE_MS = 8_000;

async function closeOne(closer: Closer, log: (line: string) => void): Promise<void> {
  try {
    await closer.close();
  } catch (error) {
    log(`[shutdown] ${closer.name} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function closeAll(options: ShutdownOptions): Promise<void> {
  for (const closer of options.closers) await closeOne(closer, options.log);
}

function deadline(ms: number): { promise: Promise<'deadline'>; cancel: () => void } {
  let timer: NodeJS.Timeout | undefined;
  const promise = new Promise<'deadline'>((resolve) => {
    timer = setTimeout(() => resolve('deadline'), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

export function createShutdown(options: ShutdownOptions): Shutdown {
  let started: Promise<void> | null = null;
  // Set before the first closer runs: `started` is only assigned once the async body has yielded,
  // and a closer asking "am I draining?" runs before that.
  let draining = false;
  const run = (reason: string, code: number): Promise<void> => {
    if (started !== null) return started;
    draining = true;
    options.log(`[shutdown] ${reason}: draining`);
    started = (async () => {
      const limit = deadline(options.deadlineMs);
      const outcome = await Promise.race([closeAll(options).then(() => 'closed' as const), limit.promise]);
      limit.cancel();
      if (outcome === 'deadline') options.log(`[shutdown] closers did not finish in ${options.deadlineMs} ms; exiting anyway`);
      options.exit(code);
    })();
    return started;
  };
  return { run, isDraining: () => draining };
}
