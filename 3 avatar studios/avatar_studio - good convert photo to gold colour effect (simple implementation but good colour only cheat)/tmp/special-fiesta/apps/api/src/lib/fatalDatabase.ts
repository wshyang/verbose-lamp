/**
 * ADR-324 — a database that cannot come back.
 *
 * PGlite is PostgreSQL compiled to WebAssembly and run in this process. If its runtime aborts
 * (the wasm heap reaches its 2 GB ceiling, or Postgres panics because the volume is full) the
 * process stays up and every later query fails — and `/api/health` used to say OK throughout,
 * so nothing restarted it. This is the test for "that failure, not an ordinary one": a
 * constraint violation or a bad id is the caller's problem, but a `WebAssembly.RuntimeError`
 * anywhere in the cause chain is the database being gone.
 *
 * The chain is walked because drizzle wraps the driver's error in its own.
 */
const MAX_DEPTH = 6;
const CLOSED = /pglite is closed|database is closed|runtime has aborted/i;

/**
 * By constructor name, not `instanceof WebAssembly.RuntimeError`: this package's tsconfig carries no
 * WebAssembly lib types, and the name is what the engine gives the error wherever it was raised.
 */
function isWasmRuntimeError(value: unknown): boolean {
  return value instanceof Error && value.constructor.name === 'RuntimeError';
}

export function isFatalDatabaseError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_DEPTH && current !== null && typeof current === 'object'; depth += 1) {
    if (isWasmRuntimeError(current)) return true;
    const candidate = current as { message?: unknown; cause?: unknown };
    if (typeof candidate.message === 'string' && CLOSED.test(candidate.message)) return true;
    current = candidate.cause;
  }
  return false;
}

type FatalHandler = (error: unknown) => void;

let handler: FatalHandler | null = null;

/** Called once by the process owner (`index.ts`); the HTTP layer only reports, it never decides to exit. */
export function onFatalDatabaseError(next: FatalHandler): void {
  handler = next;
}

/** Called from `app.onError`. A no-op for an ordinary error, and under `app.request()` where nobody registered. */
export function noteDatabaseError(error: unknown): void {
  if (handler !== null && isFatalDatabaseError(error)) handler(error);
}

/** The suite shares a module registry, so a handler from one test must not outlive it. */
export function resetFatalDatabaseHandlerForTests(): void {
  handler = null;
}
