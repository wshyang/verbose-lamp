# Typing indicators for team chat — assessment and plan

Assessment of "Meera is typing…" in the team room, and of the transport question it raises:
**extend the existing SSE, or open a WebSocket?** No code changes implemented.

Written 2026-10-04, against the code at `3c038ce`.

---

## 1. The headline

**Build it on the SSE that already exists, plus one throttled POST. Not WebSockets.**

The recommendation needs stating carefully, because this repo has already written down the
condition under which it would change its mind, and this feature is that condition:

> **`docs/design/persistent-connection-assessment.md` §4C:** "The condition that would flip
> this: if typing indicators, live presence, or read receipts become requirements, reopen
> immediately — at that point SSE needs a POST-per-keystroke companion channel and the
> architecture stops being honest."

So: reopened, as promised. And the answer still comes out SSE — but for a reason the earlier
doc did not have, rather than by ignoring it. **The flip condition assumed a POST per
keystroke.** A typing indicator does not need one. Throttled to one ping every three seconds
while someone is actively typing, and expiring on a timer rather than on a "stopped" message,
the client-to-server channel is roughly **0.33 requests per second per person actually
typing**, carrying no database write at all. That is not a side-channel straining against its
transport; it is quieter than the alerts poll each phone already runs.

The honest summary of the trade:

| | SSE + throttled ping | WebSocket |
| --- | --- | --- |
| Server→client fan-out | **already built** (`chatBus` per-team topic, `/api/team-chat/stream`) | rewrite |
| Client→server | ~0.33 req/s per active typist, 0 writes | frames on the open socket |
| Reconnect / resume | `EventSource` + `Last-Event-ID`, already proven against iOS backgrounding (ADR-041) | **ours to write**, including backoff and replay |
| Tests | `app.request()`, no listening socket (AGENTS-testing.md §2) | needs a live-socket harness, outside the doctrine |
| Social pause (ADR-118) | **free** — the ping is a participant request under `/api/team-chat/*`, so it 503s like everything else | needs an explicit broadcast frame and a server-side close |
| `index.ts` is the only file that opens a port | unchanged | breached (`@hono/node-ws` upgrade handler) |
| Work | ~1 day | ~4–5 days plus a transport migration ADR |

The decisive point is not the table, it is the ordering: **a typing indicator is the least
important feature in this application.** Migrating the transport that carries match scores,
the hall screen and the chat room — and hand-writing a reconnect layer for it — in order to
show three dots next to a nickname would be the tail wagging a dog that is carrying a
tournament. If read receipts and live presence are wanted *too*, that changes the arithmetic,
and §6 says exactly when to come back.

---

## 2. What already exists, and what is actually missing

**Fan-out: built.** `lib/chatBus.ts` has a topic per team (`team.chat.${teamId}`). Publishing
to it reaches exactly the phones with that room open — about five listeners, never a stranger,
because a non-member never subscribed to that topic. The team room's `EventSource` is open the
whole time the panel is on screen (`routes-team-chat/stream.ts`, 25 s heartbeat sized against
the Cloudflare tunnel's ~100 s idle drop).

**So the only genuinely new thing is a way for a phone to say "I am typing".** One route.

Three details in the existing stream that a typing frame must respect, each of which is a bug
if missed:

1. **A typing frame must carry no SSE `id`.** The team stream writes `id: message.id` on every
   message and the browser echoes the last one back as `Last-Event-ID` on reconnect. Give a
   typing frame an id and a reconnect resumes from a thing that is not in the table — the
   backlog query returns nothing after it and the room silently loses messages.
2. **The team topic currently carries a bare `TeamChatMessageView`.** Adding a second kind
   means making it a tagged union, exactly as the global room did in ADR-066 (`ChatFrame`),
   and for the same reason: one topic so a message and the typing-stopped that follows it
   cannot overtake each other.
3. **`stillAMember()` is a database read per frame written.** That is affordable at one read
   per message; at one per typing ping per listener it is not. A typing frame must not trigger
   a fresh membership read — see §3.

---

## 2b. There are two SSE channels, and that is the answer to "don't spam everyone"

Worth being explicit, because the two get spoken about as one thing and only one of them is
the always-on one.

| | `/api/status/stream` (ADR-121) | `/api/team-chat/stream` (ADR-063) |
| --- | --- | --- |
| Opened by | `useAlertsStore` inside `GameboyShell` — **mounted for the whole session** | an effect inside `TeamChatPanel`, which only `MyTeamPage` renders |
| Closed when | the phone signs out or sleeps | **the participant navigates away** (`handle.close()` → `stream.onAbort` → `unsubscribe()`) |
| Audience of one frame | every signed-in phone, or every member of one team **whether or not they are looking** | only the sockets currently open on that team's room |
| Bus | `lib/statusBus.ts` | `lib/chatBus.ts`, topic `team.chat.${teamId}` |
| Carries | announcements, retractions, the chat and gallery dots, team-up-soon, match and leaderboard frames | the room's messages |
| Resume | none, by design — opens with a snapshot | `Last-Event-ID` cursor, because a room is a log |

**The first channel is the one that reaches a team-mate who is looking at the Feed. Typing
must never be published to it.** Not as a rule anyone has to remember — as a consequence of
which `publish*` function the route calls. `publishTeamChatTyping` goes on `chatBus`'s team
topic, and the set of listeners on that topic *is*, exactly, "the team-mates with the room on
screen right now". The status stream's handler has no case for it, the shell never learns it
happened, and `useAlertsStore` is not touched.

Note the shape of the existing send path, which already does both halves deliberately:
`POST /api/team-chat/messages` publishes **twice** — `publishTeamChatMessage` to the room
(the message itself, to people looking) and `publishTeamChatActivity` to the status bus (the
dot, for the team-mates who are not). A typing ping publishes **only the first**. That is the
entire mechanism, and it is one line of difference.

Two honest qualifications:

- **"On the team chat screen" really means "on the My Team page".** The panel sits below the
  roster and is always rendered there, so someone reading the roster with the chat scrolled
  off-screen still holds the socket and still receives typing frames. They are one flick away
  from the conversation, so I would accept that rather than add an `IntersectionObserver` —
  but it is a choice, not an accident.
- **Volume, for the record.** A five-person team with two people typing publishes about
  0.67 frames/s to at most four listeners. The status stream, by contrast, has three hundred.
  Nothing here approaches the cost of a single announcement.

## 3. The design

### Server

**`POST /api/team-chat/typing` → 204.** No body. Resolves membership exactly like every other
route in that file (no team id in the URL, so a participant can only ever address their own
room), then publishes and returns. **No database write, ever.**

```
routes.post('/typing', async (c) => {
  const { membership, participant, sessionId } = await requireTeamMember(c);
  if (!typingLimiter.take(sessionId)) return c.body(null, 204);   // silently, see below
  publishTeamChatTyping(membership.teamId, {
    participantId: participant.id,
    label: participant.nickname,
  });
  return c.body(null, 204);
});
```

- **A throttled-out ping returns 204, not 429.** The client has nothing useful to do with a
  refusal, and a visible error for a cosmetic signal is worse than the signal being absent.
  Bucket: capacity 4, refill 2 s — well above the client's own 3 s throttle, so it only ever
  catches a client that is misbehaving or forged.
- **The state lives in the client, not the server.** The server does not hold a "who is
  typing" map at all: it forwards an event and forgets. Anything else is a second source of
  truth with its own expiry clock, in a process that may restart.
- **Membership:** the publish side is already narrowed by topic. On the *stream* side, a
  typing frame is written using the membership answer the stream already has, with no fresh
  read. The exposure that buys: for up to one message's worth of time, someone removed from a
  team could see a team-mate's nickname with "typing" next to it — a nickname that is already
  on every message above it in the backlog they were legitimately sent. That is the right
  trade against a database read per keystroke-window per listener.
- **Social pause (ADR-118) needs nothing.** The guard is mounted over `/api/team-chat/*` and
  sheds by actor: a participant gets 503. The ping 503s, the stream is already shed, the
  indicator disappears. Worth one test, not one line of code.

### Client

- **Fires on draft change**, at most once per 3 s, and only when the draft is non-empty. No
  ping on an empty box (a backspace to nothing is "never mind", not typing).
- **No "stopped typing" message.** Each received frame sets a 6 s expiry for that
  `participantId`; silence clears it. This is the single most important decision in the
  feature: a phone that is locked, backgrounded by iOS, or taken out of Wi-Fi range cannot
  send a farewell, and any design that depends on one leaves "Meera is typing…" on screen
  forever. 6 s against a 3 s ping means one lost ping is survivable and two is not, which is
  the correct bias for a cosmetic signal.
- **A message clears its author's typing state immediately** — the proof that they stopped is
  the thing they sent. So no extra POST on submit.
- **Your own frame is ignored**, matched on `participantId` from the session.
- **Rendering**, in `TeamChatPanel`, in a line that is *always* present and merely empty when
  nobody is typing — a line that appears and disappears shoves the message list up and down
  while someone is reading it. One name: "Meera is typing…". Two: both names. Three or more:
  "3 people are typing…", because a team is about five people and the list is the point at
  which it stops being information.
- **No sound, no blip, no dot.** `playChatBlip` is for a message. Typing never reaches the
  shell, never lights the nav dot, never touches `useAlertsStore`: it is only meaningful to
  someone already looking at the room.

### Scope: team chat only

The global room is explicitly **out**. In a room of three hundred people "someone is typing"
is permanently true and therefore says nothing, and it would be three hundred listeners woken
per ping instead of five. If it is ever wanted there it needs a different design (a count, not
names, and aggressive server-side coalescing), and it should be its own decision.

---

## 4. Implementation plan

Four phases, each independently green. Estimate **~1 day**, of which about a third is tests.

**Built 2026-10-04 as ADR-146**, with `e2e/team-chat-typing.spec.ts` added the same day —
two concurrent browser contexts over a real SSE connection, covering the four claims the
unit tests can only assert against fake timers. Written, typechecked, **not run**: Playwright
cannot download a browser in this sandbox. All four phases and all five sabotages are done; the one
thing the plan did not foresee is recorded in the ADR (a per-render sink object in the SSE
effect's dependency array rebuilt the `EventSource` on every keystroke).

- [x] **Phase 1 — contracts and bus (~1 h).** `TeamChatTypingView { participantId, label }` in
  `packages/contracts`; turn the team topic into a tagged `TeamChatFrame` union
  (`{kind:'message'} | {kind:'typing'}`) in `lib/chatBus.ts`; `publishTeamChatTyping`. Update
  the one existing subscriber. Message copy: `messages`/`emptyStates` entry for the one-name,
  two-name and many forms.
- [x] **Phase 2 — the route and the stream frame (~2 h).** `POST /api/team-chat/typing` with
  its own limiter; the stream writes `event: 'typing'` **with no `id`** and without a fresh
  membership read. Tests: a ping reaches a team-mate's stream; it does **not** reach another
  team's; a reconnect after a typing frame resumes from the last *message* id; the limiter
  refuses silently with 204; a paused event 503s the ping.
- [x] **Phase 3 — the client channel (~3 h).** `lib/api/teamChat.ts`: `sendTypingPing()`,
  failures swallowed. `useTeamChatTyping` hook: a 3 s outbound throttle, an inbound map of
  `participantId → expiry`, a single timer that prunes, own-id filtered, cleared by an arriving
  message from that author. Wire into `useTeamChatRoom`'s existing stream handler.
- [x] **Phase 4 — the panel and the copy (~2 h).** Reserved line above the composer; the
  one/two/many forms; no layout shift; `prefers-reduced-motion` honoured if the dots animate.
- [x] **Sabotages to watch fail** (the repo's standard, and two of these are the bugs most
  likely to ship): remove the expiry prune ⇒ the indicator must stick and a test must catch it;
  give the typing frame an SSE `id` ⇒ the resume test must fail; drop the own-id filter ⇒ you
  must see yourself typing; publish to the global topic instead of the team topic ⇒ the
  cross-team test must fail; remove the throttle ⇒ a ping-count test must fail.
- [x] **ADR-146** (the number ADR-144 was reserved for here; 144 and 145 went to the hall
  screen first) recording the transport decision, the no-"stopped"-message rule, and the
  membership-read trade.

What this does **not** need: a migration, a new dependency, a change to `index.ts`, a change to
the compression carve-out, or a change to any coverage floor.

---

## 5. The case against building it at all

Stated plainly, because it is not a weak case. Two outstanding items are closer to the event
than this one: **hall-screen phase 5** (projector polish) and the **superadmin screen-key
page**, without which the hall screen cannot be turned on by anyone but a developer. A typing
indicator in a five-person room where everyone is standing in the same hall is the most
decorative thing on the list. It is also genuinely nice, genuinely cheap, and the only feature
request so far that touches the transport question — so the sensible sequencing is **after**
the screen is operable, not instead of it.

---

## 6. When to come back to WebSockets

Not on this feature. Reopen if **two or more** of the following land, because at that point the
ping channel stops being one route and starts being an unacknowledged protocol:

- read receipts (per-message, per-reader — the volume this feature does not have);
- live presence in the global room ("12 here"), which is fan-out to everyone, continuously;
- typing in the global room;
- the app ever running more than one process (then it is `LISTEN`/`NOTIFY` first, not Redis and
  not WebSockets — see the note in `chatBus.ts`).

Until then the recorded reasoning stands: the fan-out already exists and already pushes; what
this feature adds is one small, self-expiring, write-free utterance in the other direction.

---

## 7. Open questions

1. **Team room only, or the global room too?** The plan above says team only, and §3 says why.
2. **Names or a count?** The plan shows names up to two, then a count. A count-only version
   ("someone is typing…") is cheaper to get right and reveals less, if that is preferred.
3. **Is this ahead of or behind hall-screen phase 5 and the screen-key page?** My
   recommendation is behind both. Say the word and it moves.
