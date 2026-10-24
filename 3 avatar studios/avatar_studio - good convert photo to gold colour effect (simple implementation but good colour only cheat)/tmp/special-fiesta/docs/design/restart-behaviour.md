# What actually happens when the server restarts

**Date:** 2026-10-03 · **Status:** assessment, no code changes · **Context:** ADR-118 (the
restart button), ADR-121 (the status stream), ADR-122 (the two reconnect-storm guards)

The restart button exists, three hundred phones hold a socket each, and the obvious question is
what the first ten seconds after a press look like. This traces it end to end with the real
constants, and measures the one number everything hinges on.

---

## 1. The constants in play

| Constant | Value | Where |
| --- | --- | --- |
| Exit delay after the 202 | 250 ms | `apps/api/src/index.ts` `RESTART_DELAY_MS` |
| Status-stream heartbeat | 25 s | `routes-status/stream.ts` `HEARTBEAT_MS` |
| Status-stream `retry:` (per connection) | 3–10 s, jittered | `routes-status/stream.ts` `reconnectDelayMs` |
| Client staleness watchdog | 70 s since the last frame | `lib/api/streamWatchdog.ts` `STREAM_STALE_MS` |
| Client revival delay after staleness | 1–5 s, jittered | `lib/hooks/useStatusStream.ts` `reviveDelayMs` |
| Fallback alerts poll | every 45–75 s, jittered | `lib/hooks/useAsyncData.ts` `nextPollDelay` |
| Up-soon watcher tick | 5 s | `lib/upSoonWatch.ts` `UPSOON_WATCH_MS` |
| supervisord restart | immediate; `startsecs=5` is a *reporting* threshold, not a delay | `docker/supervisord.conf` |

## 2. The measured number: how long is the server actually gone?

Measured in this workspace (pglite on disk, `tsx` entry, schema already provisioned):

```
COLD  (empty data dir: applies schema.sql, seeds)   2 932 ms
WARM  (existing data dir — i.e. every restart)      1 741 ms
WARM  (again)                                       1 590 ms
```

So a restart press costs roughly **250 ms + ~1.7 s ≈ 2 s of downtime**, plus whatever
cloudflared takes to notice the origin is listening again (it retries per request, so
effectively nothing).

**This is the load-bearing fact, and it is load-bearing in a specific way: 2 s is less than the
3 s floor of the status stream's `retry:`.** Nothing reconnects before the server is back.

## 3. The timeline of a press

1. **t = 0** — superadmin presses Restart. The route asks `requestShutdown`, answers `202`, and
   `index.ts` schedules `process.exit(0)` 250 ms later, which is enough for the 202 to land.
2. **t = 0.25 s** — the process dies. Every SSE connection dies with it: 300 status streams,
   plus one global-room socket and one team-room socket for everybody who has a room open. No
   goodbye frame; `stream.onAbort` never runs, which costs nothing because the whole bus went
   with it.
3. **t = 0.25 s → ~2 s** — downtime. cloudflared is a separate supervisord program and stays
   up, so requests in this window get a **502 from the tunnel**, not a dropped connection. The
   phones' fallback polls (`/api/me/alerts`) fail silently — `fetchAlerts` swallows it — and the
   dots simply hold their last value. Nothing blanks, because the participant surfaces read
   their last good answer from `localStorage`.
4. **t = 3–10 s — the reconnect wave.** Each phone's `EventSource` fires its own reconnect at
   the delay the *previous* connection handed it in `retry:`. Three hundred phones therefore
   arrive spread across seven seconds, which is ADR-122's whole purpose. They are all arriving
   at a server that has been up for at least a second.
5. **t ≈ 5 s** — the up-soon watcher's first tick with a subscriber. Its memory did not survive
   the restart, so it restates the window to every team currently in it. Those frames are
   *state*, not an instruction, so a phone that stayed open already shows that LED and does
   nothing. (See §6 for the one case that is not true.)

## 4. What a single reconnect costs the database

Per reconnecting phone, on `GET /api/status/stream`:

- the session lookup in auth — one indexed read, uncached;
- `findActiveMembership` — one indexed read, uncached, **called twice**: once in `stream.ts`
  to name the team topic, once inside `readAlertsFor`;
- `hasUnreadTeamChat` and `hasUnreadChat` — cached, but keyed by the reader's own read marker,
  so phones only share a key when they have read to the same point. Everyone who has never
  opened a room shares `'start'`;
- `readLiveAnnouncements` — one memo for the whole event (ADR-074);
- `upSoonFixtureForTeam` — one picture for the whole event (ADR-120).

The last two are the ones 300 phones ask simultaneously, and they are safe twice over: the memo
is shared, and `@epic-web/cachified` deduplicates *concurrent misses* on the same key
(`pendingValuesByCache`), so the cold cache after a restart collapses 300 arrivals into one
query each rather than 300. That is why the jitter and the caching are a pair: the jitter is
there for the per-phone reads, which do not share.

Order of magnitude for the wave: ~4–5 indexed reads × 300 phones ≈ 1 300 queries spread over
seven seconds, i.e. ~200/s of index lookups at the peak, against today's steady ~5 req/s.

## 5. The cliff: when the storm does *not* resolve in one wave

The browser does not treat all failures alike. Per the HTML specification, a reconnect attempt
that gets a response which is **not 200 with `text/event-stream`** does not retry: the browser
*fails the connection permanently*, fires `error`, and sets `readyState` to `CLOSED`. A dropped
TCP connection reconnects; a **502 from the tunnel does not**.

So if the boot ever outlasts the 3 s floor, every phone whose reconnect lands in the gap is
dropped out of the native retry path entirely. Today those phones recover only via the staleness
watchdog, which fires 70 s after their *last frame* — and the last frame was a heartbeat up to
25 s before the restart. That is a second wave at **t ≈ 45–75 s**, plus 1–5 s of revive jitter.

The fraction affected is `(boot − 3 s) / 7 s`: at a 2 s boot, nobody; at 5 s, about 29% of
phones; at 10 s or beyond, all of them. In the meantime those phones are not blind — `isLive`
went false, so their 45–75 s fallback poll is carrying the dots again — but they are back on the
traffic the stream was built to remove, for up to a minute and a quarter.

**Status: fixed (ADR-124).** Shipped with the stopping rule below — three quick revivals, reset
by any connection that opens, after which the poll carries and the watchdog is the long-stop.

**What was recommended, and built.** In `statusStream.ts`, distinguish the two errors:

```ts
source.addEventListener('error', () => {
  handlers.onError();
  if (source.readyState === EventSource.CLOSED) handlers.onDead();   // browser gave up
});
```

and have `useStatusStream` treat `onDead` like staleness — a jittered revival in a couple of
seconds rather than a seventy-second wait. It costs one branch and turns the only sharp edge in
the restart story into a rounded one. It also covers the other producer of a hard close: a
session that expired while the phone was asleep, which answers 401 and is, to the browser, the
same permanent failure.

## 6. Three smaller findings

- ~~**`findActiveMembership` runs twice per connection**~~ (§4) — **fixed (ADR-123).**
  `readAlertsFor` now takes the membership the caller is already holding, so the wave costs one
  indexed read per phone rather than two.
- ~~**The chat and team-chat sockets still reconnect in lockstep**~~ — **fixed (ADR-123).** Both
  now write a jittered `retry:` on a heartbeat frame ahead of the backlog, from the shared
  `lib/reconnect.ts`. This mattered more than the count of those sockets suggests: the team
  room's catch-up read is deliberately *uncached* (ADR-094), so its reconnects never collapsed
  into one query the way the shell's do.
- **A phone that *reloads* during the gap can be buzzed twice about the same up-soon window.**
  `notify.ts` dedupes per module, which survives navigation but not a reload; the watcher's
  post-restart restate then looks new. This is exactly the `localStorage` floor on the last
  toasted `fixtureId` that step ⑤ of the SSE build order still owes.

## 7. The short answer

The storm happens **once, 3 to 10 seconds after the press**, and the measured ~2 s boot means it
lands on a server that is already up. It is spread by design, its expensive reads are shared and
deduplicated, and nothing a participant can see goes blank in the meantime. The one way it turns
into a second, much later wave is if the boot time ever climbs past the 3 s retry floor — which
makes "how long does this thing take to start" a number worth watching, and the `onDead` branch
in §5 the cheapest insurance against it.
