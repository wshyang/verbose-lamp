/**
 * ADR-118 — asking the process to stop, without the route knowing how.
 *
 * The restart button cannot call `process.exit()` from a route handler: `app.request()` is
 * how the whole integration suite runs, so a route that exits the process would take the
 * test runner with it. The handler is therefore registered by `index.ts` — the only file
 * that owns the process — and the route merely asks.
 *
 * A test registers its own handler and asserts it was asked. That is also the honest shape
 * for production: the HTTP layer has no business deciding what "stop" means, and under
 * supervisord (ADR-043) stopping means exiting so `autorestart` starts us again.
 */

type ShutdownHandler = (reason: string) => void;

let handler: ShutdownHandler | null = null;

/** Called once, by the process owner. */
export function onShutdownRequest(next: ShutdownHandler): void {
  handler = next;
}

/**
 * Returns whether anybody was listening. `false` means no process owner registered one —
 * which is the case under `app.request()`, and must read as "not supported here" rather
 * than as a successful restart that silently did nothing.
 */
export function requestShutdown(reason: string): boolean {
  if (!handler) return false;
  handler(reason);
  return true;
}

/**
 * Whether this process can honour a restart at all — i.e. whether a supervisor registered one.
 *
 * Asked by `GET /service-state` so the console can render a disabled button with a reason
 * instead of an enabled button that answers 503 when pressed. It describes the *process*, not
 * the event, which is why it travels as a sibling of `state` rather than inside it.
 */
export function isShutdownSupported(): boolean {
  return handler !== null;
}

/** The suite shares a module registry, so a handler from one test must not outlive it. */
export function resetShutdownHandlerForTests(): void {
  handler = null;
}
