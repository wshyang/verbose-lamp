/**
 * ADR-324 — a promise nobody awaits still has to end somewhere.
 *
 * `void work()` discards the promise, so a rejection inside it is an unhandled rejection and
 * Node 22 ends the process for it. That is how one failed membership read, inside a frame
 * fanned out to one phone's stream, used to take every phone's stream down with it.
 *
 * `runDetached` is the named idiom for "this runs on its own": the rejection goes to a handler
 * that decides what that one socket should do (drop the frame, close), and a handler that
 * itself throws is logged rather than re-raised, so there is no second unhandled rejection.
 */
export function runDetached(work: Promise<unknown>, onError: (error: unknown) => void): void {
  work.catch((error: unknown) => {
    try {
      onError(error);
    } catch (handlerError) {
      console.error('[api] a detached-promise handler threw', handlerError instanceof Error ? handlerError.message : String(handlerError));
    }
  });
}
