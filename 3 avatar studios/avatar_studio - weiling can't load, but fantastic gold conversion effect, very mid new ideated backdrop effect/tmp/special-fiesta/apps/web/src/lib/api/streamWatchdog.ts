/**
 * ADR-119 — a stream that has gone quiet is not the same as a stream that is alive.
 *
 * `EventSource` reports `error` when the *browser* notices the connection drop. It does not
 * notice a half-open socket: beach Wi-Fi vanishing, a phone changing network, a proxy dropping
 * the far side without a FIN. TCP will hold such a connection open indefinitely with nothing
 * ever arriving on it, and the room goes on claiming to be live.
 *
 * That claim is load-bearing in both rooms: each spends it suppressing its fallback
 * (`usePolling(room.isLive ? noop : room.catchUp)` — the team room gained the same poll in
 * ADR-269), so a lying `isLive` means no stream AND no poll, in a room showing none of its
 * "live updates are off" hint.
 *
 * So the client times the frames instead of trusting the absence of an error. The server
 * already writes a heartbeat every 25 seconds for the tunnel's benefit; this is what makes the
 * phone a second consumer of it, at no extra cost on the wire.
 */

/**
 * Two and a bit heartbeats. One lost frame is a hiccup and must not tear a healthy stream down;
 * three missed in a row is not a hiccup. Sized against the server's `HEARTBEAT_MS` of 25_000 —
 * the two constants are a pair, and moving one without the other reintroduces the bug.
 */
export const STREAM_STALE_MS = 70_000;

export interface StreamWatchdog {
  /** Call on every frame of any kind — message, retraction or heartbeat. */
  touch: () => void;
  /** Call when the stream is closed, so a torn-down connection cannot fire later. */
  stop: () => void;
}

export function createStreamWatchdog(onStale: () => void): StreamWatchdog {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  return {
    touch: () => {
      if (stopped) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(onStale, STREAM_STALE_MS);
    },
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
