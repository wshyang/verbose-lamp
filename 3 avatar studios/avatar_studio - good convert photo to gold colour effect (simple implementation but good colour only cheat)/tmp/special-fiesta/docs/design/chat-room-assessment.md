# Real-time chat room — implementation assessment

> **Status (2026-10-01): BUILT.** This document is the pre-implementation assessment, kept as
> the record of the reasoning. The room shipped as assessed — Option B, SSE over the in-process
> bus with cached catch-up reads — as ADR-046, then grew backwards pagination (ADR-065), a
> persisted-cursor fix (ADR-064), live moderation retraction (ADR-066), per-team rooms
> (ADR-063) and an unread dot on the Social tab (ADR-083). The `touchParticipantSeen` write
> amplification flagged in §6 was later removed outright by ADR-082. Where this text and the
> code disagree, the code and its ADRs win.

**Status:** assessed, then built · **Scope:** one global room, every actor may chat, reached
from a bottom-bar tab like the QR badge · **Constraints set by the request:** no external
infrastructure (no Redis), and the database must not be the casualty.

Assessed against the code at ADR-043 (`webStatic`, single-container deployment). Target
scale, per the repo's own documents: **300 phones, one laptop, beach Wi-Fi** (ADR-024,
ADR-034, `scripts/stress-test.mjs`).

## 1. What the codebase already gives us

| Existing piece | Where | Relevance to chat |
|---|---|---|
| Bottom nav with 5 tabs (QR, Teams, Board, Feed, Me) | `GameboyShell.tsx` → `NAV_ITEMS` | Chat is one array entry + one route; the shell is already persistent chrome |
| Jittered polling doctrine (45–75 s, anti-stampede) | `useAsyncData.ts` → `usePolling`, ADR-024 | Explicitly designed to protect "the one laptop running the event" — chat must not violate its spirit |
| Read-cache decorators with tag invalidation | `apps/api/src/lib/cache.ts` (lru-cache + cachified, ADR-038) | A "recent messages" read wraps in `cachedRead` with a `chat` tag voided by each send — poll stampedes collapse to ~1 DB query per TTL |
| Single-process server, one port | `index.ts`, ADR-003 (PGlite in-process), ADR-043 (one container) | **Why Redis is unnecessary**: there is exactly one Node process, so an in-memory `EventEmitter` *is* the pub/sub bus |
| `uuidv7` dependency | already in `apps/api` deps | Time-ordered IDs = free chat cursor (pagination + resume point) |
| Session middleware, 3 actor types | `lib/session.ts` (ADR-004) | Chat identity (nickname + avatar) and authorization come free |
| Client sprite cache | `apps/web/src/lib/avatar/spriteCache.ts` | Chat payloads carry `participantId` only; avatars resolve via the existing fetch-once cache |
| gzip on everything | `app.ts` `compress()` (ADR-034) | Becomes a *hazard* for SSE — see §4 |
| Load harness | `scripts/stress-test.mjs` (300 users, real HTTP) | The no-blow-up claim can be *proved*, not asserted |

## 2. Transport options compared

### Option A — Short-polling (reuse `usePolling` with a faster window)

Chat needs ~3–8 s latency to feel live; at 300 phones that is **~50 HTTP requests/s**. The
cachified read makes the *DB reads* nearly free, but there is a hidden write amplifier:
**`sessionMiddleware` calls `touchParticipantSeen` on every authenticated request**
(`session.ts` → an `UPDATE participants SET last_seen_at ...`). Short-polling chat means
**~50 writes/s of pure `lastSeenAt` churn** through PGlite's single serialized connection.
This is the "blow up the database" scenario, and it comes from polling *frequency*, not
from chat data. Verdict: acceptable only as a fallback, wrong as the primary transport.

### Option B — SSE push (recommended)

- `GET /api/chat/stream` via Hono's `streamSSE`; each phone holds one idle socket
  (300 sockets is trivial for Node).
- Send = plain `POST /api/chat/messages` (rides existing session auth; no bidirectional
  channel needed).
- Insert the row, then broadcast it from an **in-process bus** (Node `EventEmitter`) to all
  open streams. **Steady-state DB cost: one INSERT per message, zero reads.**
- Reconnect/catch-up: `EventSource` auto-reconnects and sends `Last-Event-ID` (= last
  uuidv7 seen) → one delta query, wrapped in `cachedRead` so a mass-reconnect (Wi-Fi blip,
  300 phones at once) still costs ~1 DB query per TTL window.
- iOS Safari (hard requirement, ADR-041): `EventSource` is fully supported; backgrounding
  kills the socket, auto-reconnect + `visibilitychange` re-open covers it.
- Testability: unlike WebSockets, an SSE route is still exercisable through
  `app.request()` (read the streamed body) — it preserves the repo's "integration tests hit
  the real app object, no socket" doctrine (AGENTS-testing.md §2).

### Option C — WebSockets

Needs `@hono/node-ws` and an upgrade handler wired in `index.ts`, breaking "index.ts is the
only file that opens a port" *and* the `app.request()` test story. Bidirectionality buys
nothing here (sends are fine as POSTs). Not worth it.

**Recommendation: B, with A's delta endpoint doubling as the catch-up/fallback path** (same
query, same contract — an EventSource-less client degrades to polling that endpoint).

## 3. Keeping the database small — storage model

Message row: `id` (uuidv7 PK — sortable, doubles as cursor), one nullable actor FK per type
with a `ck_one_actor`-style check (mirroring `sessions`), `body text` (**hard cap ~500
chars in the zod contract — the real anti-blow-up lever**), `created_at`, `hidden_at`
(moderation soft-delete). Migration `0007_chat.sql`.

Volume math: an extremely chatty 300-person event day might produce 10–20k messages ≈
**3–5 MB**. The table *cannot* blow up if two things are enforced:

1. **Body length cap** in `packages/contracts` (validated server-side, like every contract).
2. **Per-session rate limit** — an in-memory token bucket (single process, so no Redis
   needed), e.g. 1 msg / 2 s, 429 on excess. Protects the DB *and* the room's readability.

Retention: serve only the last N (say 200) messages on catch-up; optional boot-time prune.
**No per-request deletes.** A pure in-memory ring buffer (zero DB writes) was considered
and rejected: history dies on every supervisord `autorestart` (ADR-043) and it forecloses
the external-Postgres path.

Future multi-process note: if the app ever runs >1 process against external Postgres, the
in-memory bus swaps for **Postgres `LISTEN/NOTIFY`** — still no Redis, and the
route/contract surface doesn't change. A read-only container filesystem (hosting policy)
does not affect chat at all: messages are DB rows on the `/data` volume, the bus is memory.

## 4. Integration hazards found (each cheap, but real)

1. **`compress()` is applied `'*'`** (`app.ts`) — gzip middleware buffers/breaks
   `text/event-stream`; the SSE route needs an explicit carve-out.
2. **Cloudflare tunnel idle timeout** (ADR-043): proxied connections idle out around
   ~100 s — the stream must emit a heartbeat comment every ~25 s. The same heartbeat
   handles half-dead sockets on beach Wi-Fi.
3. **`touchParticipantSeen` on the SSE handshake** is fine (once per connect), but any
   polling fallback must be interval-capped for the write-amplification reason in §2.
4. **Vite dev proxy** must pass SSE through (verify buffering off for `/api/chat/stream`).
5. **6th nav tab** at 320 px width — `gb-nav` CSS check + a new `PixelMotif` sprite
   (ADR-014 says icons are decoration, so a text label suffices meanwhile).
6. **PGlite serializes all queries** — keep the catch-up query
   `WHERE id > $cursor ORDER BY id LIMIT n` (PK-only) and cached.
7. **XSS**: plain-text messages only; React escapes by default — no rich text in v1.

## 5. Feature surface & moderation (scope decisions to make)

- One global room, all three actor types post under nickname/role.
- Recommended minimum moderation for a 300-person public room: superadmin hide-message
  (`hidden_at`), a room on/off switch in the existing admin config, and the rate limit.
- Nice-to-haves deliberately out of v1: unread badge on the tab, @mentions, images
  (images would be the actual DB-blow-up vector — keep them out of chat).

## 6. Effort estimate (repo-standard quality: contracts + tests + ADR)

| Phase | Work | Size |
|---|---|---|
| 1. API | migration 0007, schema + entity, contracts, bus module, `POST /messages`, `GET /messages?after=`, `GET /stream` (heartbeat, compress carve-out), rate limit, integration tests incl. streamed-body test | ~½–1 day |
| 2. Web | `/chat` route + nav entry + motif, `useChatRoom` hook (EventSource + Last-Event-ID resume + visibility reconnect + optimistic send), ChatPage UI + CSS, hook unit tests | ~½–1 day |
| 3. Proof & hardening | Chromium-only e2e (two browser contexts conversing), extend `scripts/stress` personas with a chat behaviour and re-run at 300 users, moderation switches, ADR | ~½ day |

## 7. Verdict

**Feasible with zero new infrastructure.** The app's single-process architecture makes
Redis genuinely redundant (in-process bus now, `LISTEN/NOTIFY` later), and the DB cost
model under SSE is *one insert per message* — reads only on reconnect, and those are
cache-collapsed. The two non-obvious findings to respect: the per-request `lastSeenAt`
write makes aggressive short-polling the real database threat, and `compress()` / tunnel
idle timeouts will silently kill a naïve SSE implementation. Both have one-line-order
fixes once known.
