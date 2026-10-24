import { describeUnhandledError } from './errorReport.js';

/**
 * ADR-324 — the backstop for whatever a call site missed.
 *
 * Node 22 ends the process on an unhandled rejection, and one stray rejection used to disconnect
 * every phone. The route-level fixes (runDetached, the pool listeners) remove the known sources;
 * this is for the ones nobody has found yet. A rejection is logged, counted — the readiness check
 * reports the count — and the process keeps serving, because a rejected promise says a task
 * failed, not that the process's state is damaged.
 *
 * An uncaught exception is the opposite: it was thrown somewhere nothing was prepared to catch
 * it, so the state it interrupted is unknown. That path asks for a graceful exit with a failing
 * code and lets the platform start a clean process.
 */

/**
 * The two methods used, typed loosely enough that both `process` (whose overloads name each event)
 * and a plain `EventEmitter` (what the tests pass) satisfy it.
 */
export interface SignalTarget {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  off(event: 'uncaughtException', listener: (error: Error) => void): unknown;
}

export interface ProcessGuardOptions {
  target: SignalTarget;
  onFatal: (reason: 'uncaughtException') => void;
  log: (line: string) => void;
}

let rejections = 0;

export function unhandledRejectionCount(): number {
  return rejections;
}

export function resetProcessGuardsForTests(): void {
  rejections = 0;
}

/** Installs both listeners and returns the function that removes them. */
export function installProcessGuards(options: ProcessGuardOptions): () => void {
  const onRejection = (reason: unknown): void => {
    rejections += 1;
    options.log(`[process] unhandled rejection #${rejections}: ${JSON.stringify(describeUnhandledError(reason))}`);
  };
  const onException = (error: unknown): void => {
    options.log(`[process] uncaught exception: ${JSON.stringify(describeUnhandledError(error))}`);
    options.onFatal('uncaughtException');
  };
  options.target.on('unhandledRejection', onRejection);
  options.target.on('uncaughtException', onException);
  return () => {
    options.target.off('unhandledRejection', onRejection);
    options.target.off('uncaughtException', onException);
  };
}
