# Persistent connections for social and team chat status

Assessment of moving to WebSockets so chat and team-chat **status** updates fan out as they
happen. No code changes implemented.

Written 2026-10-02, against the code at `80d21a5`.

---

## 1. The headline

Three findings, in the order that matters.

**1. Fan-out already exists, and it is already push.** `lib/chatBus.ts` is an in-process
`EventEmitter` with one topic for the global room and one topic *per team*. A message reaches
every open stream without anybody asking for it — one INSERT, zero reads. WebSockets would not
make this faster, because the bus *is* the fan-out and SSE is only the pipe it empties into.

**2. The actual gap is not the transport — it is which surfaces have a live connection at
all.** The push path exists only *inside* a room. The always-on shell polls:

| Surface | Transport | Latency on a new message |
| --- | --- | --- |
| Chat room, open on screen | SSE (`/api/chat/stream`) | immediate |
| Team chat room, open on screen | SSE (`/api/team-chat/stream`) | immediate |
| **Chat/team-chat unread dots in the shell** | **poll, 45–75 s** | **up to 75 s** |
| Announcements, "team up soon" | same poll | up to 75 s |

`AlertsProvider` is mounted in `GameboyShell` — it is always on — and `useAlertsStore.ts:97`
drives it with `usePolling(refresh)` against `GET /api/me/alerts`. So a participant looking at
Photos, the Feed or the home screen learns about a new chat message **up to 75 seconds late**.
That is the user-visible complaint, and it is real.

**3. WebSockets were already assessed and rejected for this codebase, on repo-specific
grounds** — `docs/design/chat-room-assessment.md` §2 option C, ratified in ADR-046. Reopening
that is legitimate, because the requirement has changed, but the decision should be reopened
with its original reasoning in hand rather than around it.

**Conclusion up front: the gap is closable without WebSockets, and I recommend closing it with
the transport already in place.** Details in §4.

---

## 2. Re-examining ADR-046's reasons against WebSockets

Four arguments were made. In 2026 terms, three still hold and **one has expired** — stated
plainly, because it weakens the case for the status quo.

| Original argument | Still true? |
| --- | --- |
| An SSE route stays exercisable through `app.request()` with no listening socket, preserving the AGENTS-testing.md §2 doctrine | **Yes, and more so.** `chat.test.ts:15` says the streaming tests exist *because* this was the deciding factor. `@hono/node-ws` needs a real upgrade handshake, so WS handlers cannot be driven by `app.request()`. Every stream test would need a live socket harness. |
| `@hono/node-ws` needs an upgrade handler in `index.ts`, breaking "index.ts is the only file that opens a port" | **Yes**, and that invariant has since taken on a second job — ADR-082 put the presence flusher there and ADR-118 put the restart there, on the same "only this file owns the process" reasoning. |
| Bidirectionality buys nothing; sends are fine as POSTs | **Yes, for today's features.** See §3 — it stops being true the moment typing indicators or presence are wanted. |
| Short-polling is unaffordable: every authenticated request cost two writes (`touchSession`, `touchParticipantSeen`), so ~50 req/s became ~100 writes/s on PGlite's single serialized connection | **No — this has expired.** ADR-082 replaced per-request writes with two in-memory `Set`s and one flusher every 30 s (`lib/presence.ts`). Traffic no longer sets the write rate. |

That last row matters and cuts against changing anything: **the main cost argument for
abandoning polling no longer applies.** The alerts poll today is reads only, and
`hasUnreadChat` is `cachedRead`-wrapped. At 300 phones it is roughly 5 req/s of mostly-cached
reads.

So the case for a live status channel rests on **latency (up to 75 s), not on server load.**
That is a weaker but still legitimate reason — a chat dot that lights a minute late is a
visibly broken-feeling chat.

---

## 3. What WebSockets would genuinely buy

Being fair to the proposal rather than defending the incumbent:

- **Client-to-server frames without a request.** Today every client utterance is a POST
  carrying session auth and routing. Typing indicators ("Meera is typing…"), live presence
  ("12 here"), and read receipts are all high-frequency, low-value-per-message signals that
  are genuinely awkward as POSTs and natural as WS frames. **None of these are currently
  requested features.** If they are wanted, that materially strengthens the WS case — it is
  the one thing SSE structurally cannot do.
- **One connection for many topics.** A single socket could carry chat, team chat, alerts,
  announcements and the board. But SSE does this too — one stream, many `event:` types — so
  this is not a WS advantage, just an argument against one-stream-per-feature.
- **Lower per-message framing overhead** and binary frames. Irrelevant at this volume.

What WebSockets would **cost**, beyond ADR-046's list:

- **Reconnection becomes ours to write.** `EventSource` reconnects automatically and replays
  `Last-Event-ID`; the resume cursor logic in `stream.ts` leans on that, and iOS Safari
  backgrounding (a hard requirement under ADR-041) is currently absorbed by it for free. A WS
  client needs hand-written reconnect, backoff and resume — and that is precisely the code
  where the subtle bugs live. `stream.ts` already solves one such bug (the subscribe-before-
  replay race, plus hides that must not wind the cursor backwards); all of it would need
  re-proving on a new transport.
- **ADR-118's social pause gets harder.** Pausing currently works because the next HTTP read
  returns 503 and the panel maps it to `isPaused`. A long-lived socket established *before*
  the pause has no such moment — the pause would have to become an explicit broadcast frame
  and a server-side close.
- **The compression carve-out and heartbeat tuning** (`UNCOMPRESSED_PATHS`, the 25 s heartbeat
  sized against the Cloudflare tunnel's ~100 s idle drop) are SSE-shaped and would need WS
  equivalents (ping/pong).

---

## 4. Options

### A. Give the shell a status stream over SSE — *recommended*

Add `GET /api/me/stream` (or extend the existing chat stream, see B) carrying `event:` frames
for `chatUnread`, `teamChatUnread`, `teamUpSoon` and announcements, published on the existing
bus when the underlying thing changes. `useAlertsStore` consumes it and keeps `usePolling` as
the fallback for `EventSource`-less clients — exactly the pattern chat already uses.

- **Closes the actual gap**: dots light immediately, everywhere in the shell.
- **Reuses everything**: the bus, the heartbeat, the resume semantics, `app.request()`
  testability, the ADR-118 pause (announcements and `teamUpSoon` must keep flowing while
  social is paused — so pausing has to be per-topic *within* the stream, which is the one new
  design problem this option introduces).
- **Cost**: one new route, one new bus topic, hook changes. Medium-small.
- **Note**: this adds a second always-on socket per phone (shell + open room). 600 idle
  sockets is unremarkable for Node, but see B for avoiding it.

### B. Multiplex: one shell-level SSE carrying every topic — *recommended if A is done*

Rather than a second stream, make the shell stream the *only* stream: the room panels
subscribe to frames on it instead of opening their own. One connection per phone regardless of
tab.

- Strictly better on connection count and on reconnect behaviour (one thing to resume).
- **Cost**: higher. It restructures `useChatRoom`/`useTeamChatRoom` around a shared client-side
  dispatcher, and team topics are per-team and membership-checked at write time — so the
  multiplexed stream must re-check membership per frame, which the current per-team
  subscription deliberately avoids.
- Worth doing **as a follow-up to A**, not instead of it.

### C. WebSockets — *not recommended now*

Everything in §3. The honest summary: WS costs a transport rewrite, a bespoke reconnect layer,
a new test harness outside the repo's integration doctrine, and a breach of the `index.ts`
port invariant — in exchange for **no improvement to fan-out latency**, because the bus
already pushes. Its one real advantage is client-to-server frames, for features nobody has
asked for.

**The condition that would flip this:** if typing indicators, live presence, or read receipts
become requirements, reopen immediately — at that point SSE needs a POST-per-keystroke
companion channel and the architecture stops being honest. Better to switch transport once,
deliberately, than to bolt a side-channel onto SSE.

### D. Do nothing

Defensible. The cost of the gap is a badge that lights up to 75 s late; the server cost is
~5 req/s of cached reads. If the latency has not actually been complained about by
participants, A is polish.

---

## 5. Recommendation

1. **Option A** — a shell-level SSE status stream. It closes the real gap at a fraction of
   WebSockets' cost and changes no architectural invariant.
2. **Option B** as a later consolidation, if two sockets per phone proves to matter.
3. **Not WebSockets**, unless and until a bidirectional feature is actually wanted — and then
   as a deliberate, ADR-level transport migration rather than an incremental slide.

If the shorter answer is wanted: *the fan-out you are asking for already exists; what is
missing is that the shell never opened a connection to receive it.*

---

## 6. Open questions

- **Are typing indicators or live presence ("who is here") wanted?** This is the single
  question that decides C against A. If yes, the calculus changes and I would reassess.
- Is the ≤75 s badge latency an observed complaint, or a theoretical one? It separates
  recommendation A from option D.
- If A proceeds: should the status stream carry *announcements* too, retiring the alerts poll
  entirely, or should the poll remain as the announcement path? Retiring it entirely means the
  ADR-118 pause must become per-topic, since announcements must survive a social pause.
- Should the board (`useBoard` ×3) and the court surfaces eventually move onto the same stream?
  That is the version of this where a persistent connection pays for itself broadly — and it
  is also the version where option B's dispatcher becomes mandatory rather than optional.

---

# Part II — How the SSE implementation would work, and liveness

Added after the assessment above, answering two follow-up questions. Every wire capture in
this part was taken live against the dev stack on 2026-10-02.

## 7. How SSE actually works here

### 7.1 On the wire, it is just an HTTP GET that never ends

No upgrade, no handshake, no new protocol. The response declares
`content-type: text/event-stream` and `Transfer-Encoding: chunked`, and then stays open.
The body is plain text frames; a **blank line terminates a frame**. Captured live from
`GET /api/chat/stream`:

```
event: message
data: {"id":"01a0fa29-a0a5-...","authorLabel":"Wei_Ling","body":"Morning everyone!!",...}
id: 01a0fa29-a0a5-7e5b-b582-673b75fa62a1
            <- blank line ends the frame

event: heartbeat
data:

```

Four fields are available: `event:` (the name the client listens for), `data:` (the payload,
JSON by our convention), `id:` (what the browser echoes back as `Last-Event-ID` on reconnect),
and `retry:` (reconnect delay hint, unused here).

That is the entire protocol. The reason it survives proxies, the Cloudflare tunnel and
corporate networks untouched is that nothing along the path can tell it from a slow download.

### 7.2 The server half

`streamSSE(c, async (stream) => { ... })` from `hono/streaming`. The existing chat
implementation (`routes-chat/stream.ts`) does five things, in an order that matters:

1. **Subscribe to the bus first**, buffering anything that arrives.
2. **Read the backlog** from the resume cursor and write it.
3. **Flush the buffer**, filtering ids already sent, then go live.
4. **Loop** on `await stream.sleep(25_000)`, writing a heartbeat each pass.
5. **`stream.onAbort`** unsubscribes.

Steps 1–3 exist to close a race: a message published *while* the backlog is being written must
be neither lost nor duplicated. Subscribing before reading guarantees it is caught; the
`lastSent` cursor guarantees it is not sent twice.

**The status stream would be substantially simpler, and this is the important design point:
chat is an event log, status is current state.**

A log needs cursors, resume, backlog replay and de-duplication, because every entry matters
and gaps are permanent. Status is a set of current values — `chatUnread: true` — where a
*missed frame is healed by the next one* and re-sending is harmless. So the status stream
needs no `Last-Event-ID` handling, no backlog query and no dedupe. It sends the current state
once on connect, then a fresh frame whenever something changes:

```ts
export function statusStreamResponse(c: AppContext): Response {
  const db = c.get('db');
  const actor = requireParticipant(c);

  return streamSSE(c, async (stream) => {
    let open = true;
    const send = (status: StatusView) =>
      stream.writeSSE({ event: 'status', data: JSON.stringify(status) });

    const unsubscribe = subscribeToStatus(actor.participant.id, (status) => void send(status));
    stream.onAbort(() => { open = false; unsubscribe(); });

    try {
      await send(await readStatus(db, actor.participant));   // current state, once
      while (open) {
        await stream.sleep(HEARTBEAT_MS);
        if (!open) break;
        await stream.writeSSE({ event: 'heartbeat', data: '' });
      }
    } finally {
      unsubscribe();
    }
  });
}
```

Roughly forty lines against chat's hundred and ten.

### 7.3 Where the frames come from — and the query that is not needed

The naive implementation recomputes each viewer's unread state on every event, which is one DB
query per connected phone per message. At 300 phones that is exactly the churn this
architecture avoids.

It is unnecessary. **The frame already carries enough to decide locally.** When a message is
posted, the existing global bus topic fires with the message view attached, and each open
status stream knows which participant it belongs to. So it can set `chatUnread = true` unless
the author is its own viewer — no query at all. Per topic:

| Field | Source | Cost per event |
| --- | --- | --- |
| `chatUnread` | existing global room topic; compare author to viewer | none |
| `teamChatUnread` | existing per-team topic, subscribed at connect using membership read once | none |
| `announcements` | a new global topic, same list for everybody | none |
| `teamUpSoon` | existing per-team topic, on schedule and court events | none |

> **Correction (2026-10-02).** This row originally read "nothing publishes it", and claimed
> `teamUpSoon` was a function of the clock requiring a server-side ticker. **That was wrong.**
> Reading `upSoonFromDb` (`schedule.ts:552`) shows "soon" is measured in **queue position, not
> wall-clock time**: `gamesAway` is the team's index among unresolved fixtures ordered by
> sequence, and the window is the enabled court count. There is no timestamp in the function.
> Every transition is therefore an ordinary event — a fixture resolving, a court being toggled,
> the schedule changing — and each already invalidates `TOURNAMENT_TAG` or `COURT_TAG`, which
> is exactly what the read's own `tags: [TOURNAMENT_TAG, COURT_TAG]` declares. No ticker is
> needed. See `docs/design/sse-announcements-feed.md` §9 for the design that follows from this.

### 7.4 Authentication

`EventSource` **cannot set request headers**, which is normally the hard part of
authenticating a stream. It is already solved: ADR-016 made the session token acceptable as a
query-string carrier, and `chatStreamUrl()` uses it unconditionally. A new stream reuses that
verbatim.

### 7.5 One carve-out to remember — and a latent inconsistency found while checking

gzip buffers in order to compress, which would turn a live stream into a stalled one, so
`app.ts` skips compression for `UNCOMPRESSED_EXACT = ['/api/chat/stream']`.

**`/api/team-chat/stream` is not in that list.** I checked whether this is a live bug: it is
not. Verified against the running API with `accept-encoding: gzip` — a JSON route comes back
`content-encoding: gzip` (so compression is certainly active), while *both* streams come back
uncompressed. Hono 4.9's `compress()` evidently declines `text/event-stream` on its own.

So nothing is broken today, but team chat's stream is protected by the library's internal
behaviour rather than by the repo's explicit carve-out — and the carve-out exists precisely
because the repo decided not to rely on that. If a Hono upgrade changes it, team chat stalls
and the global room does not. **A new `/api/me/stream` should be added to the list explicitly,
and `/api/team-chat/stream` should be added at the same time.** One line, and it restores the
invariant the list was written to hold.

### 7.6 The client half

```ts
const source = new EventSource(urlWithToken, { withCredentials: true });
source.addEventListener('status', (e) => setStatus(JSON.parse(e.data)));
source.addEventListener('open',  () => setLive(true));
source.addEventListener('error', () => setLive(false));
```

The browser handles reconnection itself, re-sending `Last-Event-ID`. Two existing pieces come
along for free: `openChatStream` returns `null` when `EventSource` is absent, which is the
caller's signal to fall back to polling rather than to show an error; and
`useForegroundGeneration()` re-opens on `visibilitychange`, because iOS Safari kills the socket
on backgrounding and a suspended page never runs the browser's own retry.

### 7.7 Why this stays testable

`app.request()` returns a `Response` whose body is a `ReadableStream`. A test reads however
many frames it expects and asserts on them, with no listening socket — which is the whole
reason SSE was chosen over WebSockets (`chat.test.ts:15`). A status stream inherits that
intact.

---

## 8. Liveness: yes, and most of it is already paid for

### 8.1 The heartbeat exists; the client throws it away

The server sends `event: heartbeat` every 25 s, sized against the Cloudflare tunnel's ~100 s
idle drop. Verified live — resuming from the tail so no backlog interfered, the stream sat
silent and produced exactly one heartbeat 25 seconds after connecting.

But `chatStream.ts` registers listeners for `message`, the hidden event, `open` and `error` —
**there is no heartbeat listener.** The signal arrives on every phone, every 25 seconds, and is
discarded. The client's entire notion of liveness is `EventSource`'s own `open`/`error` events.

### 8.2 Why that is a real problem, not a tidiness complaint

`EventSource` fires `error` when *the browser notices* the connection dropped. It does not fire
for a **half-open socket** — beach Wi-Fi vanishing, a phone switching networks, a proxy
dropping the far side silently. TCP can hold such a connection open indefinitely with nothing
ever arriving.

Now follow the consequence through `useChatRoom.ts:263`:

```ts
usePolling(room.isLive ? noop : room.catchUp);
```

The poll fallback is **disabled while `isLive` is true**. So a stream that has silently died
reports itself live, suppresses the fallback, and the room receives nothing — no messages, no
error, no recovery until the user navigates away. The design is sound; it just trusts a signal
that can lie.

This is the strongest argument in this whole document for doing something, and it is
independent of the status stream.

### 8.3 The fix: a watchdog on frames already being sent

Reset a timer on **every** frame of any kind — message, hidden, or heartbeat. If it ever
expires, the stream is dead regardless of what `EventSource` believes:

```ts
const DEAD_AFTER_MS = 70_000;   // ~2.5 heartbeats: tolerates one lost beat, not two

let watchdog: ReturnType<typeof setTimeout>;
const touch = () => {
  clearTimeout(watchdog);
  handlers.onLive();
  watchdog = setTimeout(() => {
    handlers.onError();   // isLive -> false, which re-enables the poll fallback
    source.close();
    reopen();
  }, DEAD_AFTER_MS);
};

source.addEventListener('heartbeat', touch);
```

Fifteen lines or so, in one file.

**Why this is better than a separate health ping**, which is the obvious alternative:

- **It costs nothing.** The heartbeat is already being sent, already paid for, already sized.
  A health poll would add 300 requests per interval to do a worse job.
- **It measures the path the data actually takes** — the same socket, the same proxy hop, the
  same auth. This is the part that matters: a separate `GET /api/health` opens a *fresh*
  connection, so it can succeed cheerfully while the stream's socket is dead. It would answer
  a question nobody asked.
- **It is passive.** No new endpoint, no new contract, no new failure mode.

### 8.4 What it proves, and what it does not

Be precise about this, because it is easy to over-trust. The heartbeat is written by a
`stream.sleep` loop that touches nothing — no database, no handler, no session. Its arrival
proves: **the Node process is alive, the event loop is turning, and the socket and tunnel are
intact.** That is genuinely most of what goes wrong.

It does **not** prove the database is responsive or that handlers still work. The API could be
heartbeating perfectly while every query times out.

If that deeper check is wanted, the thing *not* to do is make each connection verify health —
that is 300 queries per interval, the exact pattern the architecture avoids. Instead have
**one** server-side evaluator run on its own interval and cache a verdict; the heartbeat frame
then carries that cached value. Cost is O(1) in connections:

```
event: heartbeat
data: {"ok":true,"db":"ok","at":"2026-10-02T06:33:49Z"}
```

The client gets real backend health, and it costs one evaluation per interval no matter how
many phones are connected.

### 8.5 Liveness runs both ways, on one frame

SSE is server-to-client only, so strictly the frontend cannot *send* a liveness probe. It does
not need to. The same heartbeat does both jobs:

- **Client learns the server is alive** by the frame arriving (§8.3).
- **Server learns the client is gone** because writing to a dead socket fails and triggers
  `onAbort`, which unsubscribes it from the bus. `stream.ts` already says this is deliberate:
  the heartbeat "reveals sockets that beach Wi-Fi has already killed but not closed". Without
  periodic writes, a dead listener would sit on the emitter forever.

One frame, two directions, already implemented on the server.

### 8.6 Recommendation

**Do the watchdog regardless of what is decided about the status stream.** It is small, it is
confined to `chatStream.ts` and `teamChatStream.ts`, it needs no server change, and it closes
a failure mode that exists in production today — a room that has gone quiet forever while
telling the user it is live. The status stream is an enhancement; this is a fix.

Carrying structured health in the heartbeat payload (§8.4) is a separate, later question and
should only be answered if someone actually wants DB health on the phone.
