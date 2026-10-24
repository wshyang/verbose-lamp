# Batch retrieval and transfer: chat, team chat and gallery

Assessment and plan. No code changes proposed here are implemented yet.

Measured on 2026-10-02 against the dev stack with the demo seed, as participant `Ridhwan`.

---

## 1. The headline, stated up front

**The JSON payloads are not the problem, and batching them would buy almost nothing.**

Measured, gzipped, on the wire:

| Endpoint | On the wire | Uncompressed | Rows |
| --- | --- | --- | --- |
| `GET /api/chat/messages` | 3 881 B | 12 095 B | 42 messages |
| `GET /api/team-chat/messages` | 666 B | 2 094 B | 9 messages |
| `GET /api/gallery/photos` | 691 B | 1 704 B | 5 photos |
| `GET /api/me/alerts` | 427 B | 712 B | — |
| `GET /api/me` | 267 B | 355 B | — |

A participant opening the Social area cold spends **five requests and about 6 KB**. At the
page caps (chat tails at `CHAT_TAIL_LIMIT = 50`, gallery at `GALLERY_PAGE_LIMIT = 60`) that
grows to roughly 10 KB. Collapsing those five responses into one batch response saves four
round trips and essentially zero bytes.

The real cost is elsewhere, and it is two things:

1. **Image round trips.** `GET /api/gallery/photos/:photoId/:rendition` is one HTTP request
   per photo per rendition. A full grid is **60 requests** before a single byte of metadata
   matters.
2. **Unconditional re-sends.** None of the three JSON endpoints emits a validator, so every
   poll re-transfers a body that is usually identical to the last one.

So "batch retrieval and transfer" is worth doing, but the valuable version of it is
conditional transfer and image-cache strategy — not a `POST /api/batch` multiplexer.

### A measurement trap, recorded so nobody repeats it

My first pass measured thumbnails at **332 KB each**, and `thumb` and `full` came back
byte-identical. That is a **demo-seed artifact, not a production defect**:
`apps/api/src/db/seed-demo.sql:577-579` inserts the same 376 900-byte PNG under all three
renditions. Real uploads go through `apps/web/src/lib/photo/shrinkPhoto.ts`, which draws
`full` at 1280 px and `thumb` at 256 px — the file's own header puts a real thumb at ~20 KB.

Production model for a full grid, therefore: **60 requests, ~1.2 MB** of thumbs. That is the
number this plan is built on, not the 1.6 MB the seed reports.

---

## 2. What each surface does today

### Chat (`apps/api/src/routes-chat/index.ts`)

Already in good shape, and the best-designed of the three.

- `GET /messages` — tail of 50 by default; `after` returns a forward delta; `before` pages
  history with a `hasOlder` flag.
- `GET /stream` — SSE, the primary transport.
- `POST /messages`, `POST /messages/:id/hide`, `POST /read`.

The client (`useChatRoom.ts:263`) is SSE-first and only polls when the stream is down
(`room.isLive ? noop : room.catchUp`). Deltas already exist; the stream already means the
steady state costs nothing. **There is little to win here and I propose no change to chat's
retrieval shape.**

### Team chat (`apps/api/src/routes-team-chat/index.ts`)

Identical shape minus hide. Same conclusion.

### Gallery (`apps/api/src/routes-gallery/index.ts`)

This is where the gaps are.

- `GET /photos` returns the **whole page every time**. There is no `after`/`since` cursor and
  no ETag — unlike chat, which has both a delta and a stream.
- `GET /photos/:photoId/:rendition` — one request per photo per rendition. It is already well
  behaved per-image: `readRendition` (`apps/api/src/lib/galleryStore.ts:149`) honours
  `If-None-Match` and sends `public, max-age=31536000, immutable` with an ETag. Verified live.
- The grid already sets `loading="lazy"` and `decoding="async"`
  (`PhotosPanel.tsx:125-126`), so below-the-fold thumbs are not fetched on open.

Client-side, `useGallery.ts:39` already wraps the page in `useLocalCachedData` (localStorage)
and polls it on the standard 45–75 s jittered schedule.

### Server-side caching, and why it is weaker than it looks

`readGalleryPage` is `cachedRead`-wrapped, but keyed
`` `${sort}:${viewerId ?? 'anon'}` ``. Because `hasMyVote` is folded into the page, **every
viewer gets their own cache entry**, each one paying a full `tallyVotes`. Three hundred
phones on two sorts is up to 600 entries that share nothing. The cache is doing far less work
than its presence suggests.

---

## 3. Options, ranked by value against cost

### A. Conditional GET on the three list endpoints — *recommended, do this first*

Add an ETag (hash of the serialised body, or of `max(id) + count + a mutation counter`) and
honour `If-None-Match` on `/api/chat/messages`, `/api/team-chat/messages` and
`/api/gallery/photos`.

- **Why:** the gallery poll fires every 45–75 s per phone whether or not anything changed, and
  at an event most 60-second windows add no photos. A 304 is ~150 B against ~5 KB.
- **Cost:** small and local. One helper, three call sites. No contract change — `If-None-Match`
  is transparent to clients that ignore it.
- **Caveat worth deciding:** the gallery body is per-viewer (`hasMyVote`), so the ETag must
  include the viewer, or option C must land first to make the body shared.

### B. Persist thumbs across sessions — *recommended, the real transfer win*

The renditions are already `immutable` with ETags, so a warm HTTP cache costs nothing. What
is missing is durability: a phone that backgrounds the browser, or a tab reopened the next
morning, re-downloads ~1.2 MB.

Put thumbs in the **Cache API behind a service worker** (not IndexedDB-plus-blob-URLs, and
not localStorage — thumbs are binary and far past localStorage's ~5 MB budget).

- **Why:** composes with what already exists rather than replacing it. URLs stay per-image, so
  the immutable/ETag path keeps working for anyone without a service worker.
- **Cost:** medium. A service worker is a real operational surface — versioning, update
  choreography, and a new way to serve stale bytes. Needs its own ADR.
- **Note:** the repo has no service worker today (no `indexedDB` or SW references in
  `apps/web/src`), so this is a genuinely new capability, not an extension.

### C. Split the gallery page into a shared body plus a per-viewer overlay — *recommended*

Return the photo page without `hasMyVote`, cached once per sort for everyone, and ship the
viewer's own votes as a small id list (either a second field in the same response or a tiny
sibling endpoint).

- **Why:** turns 600 near-duplicate cache entries into 2, and makes the body in option A
  cacheable with a viewer-independent ETag. This is a server-load win, which is the one the
  stress-test work cares about.
- **Cost:** small-to-medium, but it **is** a wire-contract change to `GalleryPhotoView`, so it
  touches `packages/contracts`, the hook, and the panel.

### D. A social bootstrap endpoint — *possible, low value*

`GET /api/social/bootstrap` returning chat tail + team-chat tail + gallery page + unread
counts in one response.

- **Why:** saves four round trips on a cold open.
- **Why I am lukewarm:** it saves round trips *once per session*, not per poll; it couples
  three independent domains into one route and one invalidation surface; and it fights
  ADR-118, since a composite response has to express "chat is paused but the gallery is not"
  in its body rather than as a clean 503 per resource. The gain is a few hundred milliseconds
  on boot.

### E. A thumbnail batch endpoint — *assessed and rejected*

`GET /api/gallery/thumbs?ids=…` returning a JSON map of base64 data URIs.

It does collapse 60 requests into one, and that is genuinely tempting. But:

- base64 inflates the bytes by **~33 %**, so a cold grid gets *larger*, ~1.6 MB;
- it **destroys the per-image HTTP cache**. Today a repeat visitor pays 60 × ~150 B of 304s,
  or nothing at all from cache. With one batched body, a single new photo invalidates the
  whole blob and the visitor re-downloads every thumb;
- it serialises the transfer: the grid can render nothing until the last thumb arrives,
  whereas 60 parallel images paint progressively and `loading="lazy"` means most are never
  fetched.

**Net negative on every visit after the first.** Recorded here so the idea is not revived.

One thing to verify before dismissing the round-trip count entirely: the deployment is behind
a Cloudflare tunnel, which should give browsers HTTP/2, making 60 multiplexed streams on one
connection cheap rather than the HTTP/1.1 six-connection stall that makes batching attractive.
**I have not confirmed the negotiated protocol** — that check should precede any further work
on request-count reduction, because if HTTP/2 is active, option B is the only image work worth
doing.

---

## 4. Proposed order

1. **Verify HTTP/2** on the tunnel. Cheap, and it decides whether request count is a problem.
2. **Option C** — split the gallery body. Unlocks a clean ETag and fixes the cache-key fan-out.
3. **Option A** — conditional GET on all three list endpoints.
4. **Option B** — service worker thumb persistence, as its own ADR.

Options D and E are not proposed.

Chat and team chat need no retrieval changes; they would only inherit the option A validator.

---

## 5. Open questions

- Is a wire-contract change to `GalleryPhotoView` (option C) acceptable, or should the
  per-viewer overlay be a separate endpoint to keep the existing shape?
- Is a service worker acceptable operationally? It is the largest new surface here.
- Should the ETag work extend to the other polled surfaces (`useBoard` ×3, `useCourtConsole`
  ×2, `useFringeStation`, `useAlertsStore`), which have the same unconditional-re-send shape?
  That is a bigger win than the social endpoints alone, and argues for a shared helper rather
  than three one-off implementations.
