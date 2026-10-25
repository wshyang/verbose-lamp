/**
 * ADR-122 — a per-connection reconnect delay, so a mass drop does not come back in lockstep.
 *
 * `EventSource` reconnects on a *fixed* interval: whatever the browser's default is, or whatever
 * the last `retry:` field said. That is the metronome ADR-024 removed from polling, quietly put
 * back by the transport — a tunnel blip or the restart button (ADR-118) drops every phone in the
 * same instant and brings them all back in the same second. The `retry:` field is per connection,
 * so the spread can be decided here, which is the same trick `nextPollDelay()` plays one layer up.
 *
 * Floor and ceiling rather than pure randomness: under three seconds is harsh on a server that
 * has just restarted — and the floor must stay above the boot time, or an early reconnect gets
 * the tunnel's 502 and the browser gives up on the stream altogether
 * (`docs/design/restart-behaviour.md` §5) — while over ten seconds the dots feel broken to
 * whoever drew the long straw.
 */
const RECONNECT_FLOOR_MS = 3_000;
const RECONNECT_SPREAD_MS = 7_000;

/** Exported for the tests, which assert the spread rather than any one draw. */
export function reconnectDelayMs(): number {
  return RECONNECT_FLOOR_MS + Math.floor(Math.random() * RECONNECT_SPREAD_MS);
}
