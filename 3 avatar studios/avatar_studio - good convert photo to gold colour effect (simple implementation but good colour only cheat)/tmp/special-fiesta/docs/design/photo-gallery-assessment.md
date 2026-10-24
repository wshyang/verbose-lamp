# Shared photo gallery with voting — ideation & implementation assessment

> **Status (2026-10-01): BUILT.** This document is the pre-implementation assessment, kept as
> the record of the reasoning. The gallery shipped as ADR-047 with one deliberate departure
> from the baseline below: photo bytes live in the database (`gallery_blob`, ADR-048), not on
> disk — the mitigations section's own analysis won. Where this text and the code disagree,
> the code and its ADRs win.

**Status:** assessed, then built · **Scope:** participants upload photos of the event,
everyone browses and votes, reached from the participant app · **Constraints:** no external
infrastructure, database must not blow up, one laptop on beach Wi-Fi serves 300 phones.

Assessed against the code at ADR-043. Companion document:
[`chat-room-assessment.md`](chat-room-assessment.md) (shared findings: `compress()`
carve-outs, `touchParticipantSeen` write amplification, single-process architecture).

## 1. The one big architectural fact first

Today **this app stores zero image bytes anywhere**. Every "photo" in the system ends its
life as a ~2 kB run-length text sprite (`avatarSpriteSchema` in
`packages/contracts/src/sprites.ts`, length-capped by contract); the original photo never
leaves the phone. The gallery is therefore the app's **first binary-blob feature**, and the
design question is not "which table" but "where do bytes live". The baseline answer:

- **Bytes on disk, metadata in Postgres.** Files under the existing data root
  (`/data/gallery` in the ADR-043 container, `apps/api/.data/gallery` in dev — same volume,
  one backup story). DB rows carry only `id` (uuidv7), uploader FK, caption, sizes,
  `hidden_at`. (§7 assesses the alternative of putting the bytes *in* the database.)
- **Never serve bytes through the DB.** PGlite is one serialized connection (ADR-003);
  streaming photos through it would queue behind every score write. Serving is
  `fs.createReadStream` — the pattern `webStatic.ts` already uses, with the same
  `immutable` cache headers (photos never change after upload; uuidv7 URL = permanent
  cache key).
- **The client does the shrinking.** The web app already has serious canvas muscle (the
  avatar ladder, ADR-031/041). Reuse it: downscale + re-encode on the phone to ~1280 px
  WebP/JPEG (~200–300 kB) plus a ~256 px thumb (~20 kB), upload both renditions. The
  server stays dumb — no `sharp`, no native deps, alpine-friendly.

A happy side effect worth naming: **canvas re-encoding strips EXIF, including GPS**. The
same step that saves bandwidth is the privacy scrub.

## 2. Ideation — what this feature could be

**Core loop (v1):** grid of thumbs (newest / top toggle) → tap for full view + caption +
uploader's nickname & sprite avatar (resolved through the existing client sprite cache) →
vote.

**Voting mechanics — three flavours:**

| Mechanic | Feel | Notes |
|---|---|---|
| Simple like-toggle | Instagram-familiar, zero explanation | One row per (photo, participant), unique constraint, toggle = insert/delete |
| Vote budget (e.g. 5 per person) | Contest — scarcity makes votes meaningful | Same table + a `COUNT` check; budget configurable via the `point_config`-style admin config |
| Head-to-head pairs | Addictive "this or that" | Needs an Elo-ish ranker; overkill for one day |

The like-toggle is v1; the budget is the best *contest* upgrade.

**Event-day tie-ins:**

- **Big-screen photo wall** — a projection view cycling top-voted/newest photos. The repo
  already has the console-surface pattern (court consoles, board views); this is one more
  read-only route. This is the feature that makes people upload.
- **Points for the clusters** — the fringe system already awards cluster points with a
  `points_awarded_snapshot` (`schema/fringe.ts`). "Top 3 photos at 4 pm earn their
  uploader's cluster N points" plugs into existing scoring machinery.
- **Photo challenges** — themed mini-contests ("best team spirit", "best action shot") as
  a `category` column; each challenge is a filtered view of the same table.
- **Chat synergy** — if chat ships with its SSE bus, "Wei_Ling posted a photo" events ride
  the same bus for free. Without chat, the gallery is fine on ADR-024 jittered 45–75 s
  polling — a gallery is not a conversation; latency is not the product.

**Moderation & safety (a public-service agency event — treat as required):**

- Superadmin hide (`hidden_at` soft-delete) + a **report button** for participants
  (photographed-without-consent takedowns — the PDPA-shaped concern).
- Master switches (gallery on/off, uploads on/off) in admin config — the "something went
  wrong on the projector" kill switch.
- Optional **pre-moderation mode**: uploads land hidden until approved. Cheap once
  `hidden_at` exists; the right default is probably post-moderation with fast hide.
- Caption length capped by contract, plain text, React-escaped.

**Navigation placement:** with chat, the bottom bar hits 7 tabs — too many at 320 px.
Recommendation: one **"Social" tab with two segments (Chat | Photos)**, keeping the bar at
6. Alternatively the gallery joins the Feed tab. Product call to make before build.

## 3. The budget math (300 phones, one laptop, beach Wi-Fi)

**Storage** — capped, therefore boring: 300 users × 10-photo cap × ~325 kB (full + thumb)
≈ **1 GB worst case** on the `/data` volume; DB grows by ~3,000 metadata rows + votes (a
few MB real-world). Caps (per-user, global, max bytes) belong in admin config, enforced
server-side.

**Bandwidth — the actual constraint, and it's downstream:**

- First gallery open: ~24 thumbs ≈ 500 kB; after that, `immutable` caching means only
  *new* thumbs cost anything. Lazy-load the grid (IntersectionObserver), full-size only on
  tap.
- The spike scenario: a great match ends, 100 people open the gallery within a minute →
  ~50 MB burst off one laptop's Wi-Fi. Survivable, but this is why thumbs-first, small
  pages and aggressive cache headers are design requirements rather than polish.
- Uploads are self-limiting (a few at a time, ~300 kB each — the client-side shrink is
  what makes this true; raw camera files are 3–12 MB each and *would* melt the uplink).

## 4. Integration hazards found in the code

1. **No `bodyLimit` anywhere in the API today** (verified) — all current payloads are
   contract-capped JSON. A file-upload route makes an explicit `bodyLimit` (~1.5 MB on the
   upload route, something sane globally) mandatory, plus magic-byte sniffing server-side.
2. **iOS HEIC**: iPhones shoot HEIC, which only Safari decodes — but the *uploading*
   iPhone decodes its own HEIC into canvas during the client-side shrink, and what leaves
   the phone is WebP/JPEG. The re-encode step is also the format normaliser. (e2e note:
   fixtures stay JPEG; the `images/` corpus is ready-made upload-fixture material.)
3. **`touchParticipantSeen` write-per-request**: fine at gallery polling cadence
   (45–75 s); another reason not to poll the gallery aggressively.
4. **Demo-seed lifecycle (ADR-040)** grows a second artefact: the seed is a pure DB dump
   today; a seeded gallery needs fixture *files* copied alongside (disk design) or seed-time
   API uploads (either design). Small, but must be designed, not discovered.
5. **Backup story changes**: with files on disk, the `/data` volume becomes the single
   backup unit — conveniently, ADR-043 already put PGlite there too. A read-only container
   filesystem policy is satisfied *because* bytes are anchored under `/data`.
6. **Vote-count reads** go through `cachedRead` with a `gallery` tag invalidated by
   vote/unvote/hide — identical shape to the leaderboard reads (ADR-038).

## 5. Rough build phases

| Phase | Work | Size |
|---|---|---|
| 1. Bytes | store module + upload route (`bodyLimit`, magic-byte sniff, caps) + serving route (stream, immutable headers) + migration (photos, votes) + contracts + integration tests | ~1 day |
| 2. Surface | client shrink-and-upload (reuse canvas ladder), gallery grid + full view + vote toggle, new/top sort, nav placement, hook unit tests | ~1 day |
| 3. Event-day | moderation (hide/report/kill switch, admin view), big-screen wall route, optional vote budget + points tie-in, e2e with corpus fixtures, stress-personas extension, ADR | ~1 day |

## 6. Open product questions

1. **Nav placement** — Social tab (Chat | Photos), or gallery inside Feed?
2. **Voting flavour** — simple likes, or the 5-vote budget contest?
3. **Moderation posture** — post-moderation with fast hide (recommended), or pre-approval?
4. **Points tie-in** — should top photos earn cluster points, or keep the gallery
   glory-only?
5. **Who can upload** — participants only, or facilitators/superadmins too (an
   official-photographer account)?

## 7. Alternative assessed: the database as the image backend

Storing photo bytes in the DB (instead of on disk) has four genuine attractions here:
**transactional integrity** (photo + votes + blob commit or vanish together, no orphan-file
cleanup), **one backup unit** (dump the DB, have everything — the ADR-040 seed story needs
no second artefact), **automatic read-only-rootfs compliance**, and **no second storage
abstraction** next to the drizzle entities.

### Risk register

| # | Risk | Mechanism | Severity |
|---|---|---|---|
| R1 | **Head-of-line blocking on PGlite's single connection** | Every blob read serializes through the one in-process connection; a gallery-open burst queues hundreds of 20–300 kB reads *ahead of match-score writes* | High — the big one |
| R2 | **Event-loop occupancy** | PGlite executes inside WASM on the Node main thread; a 300 kB bytea read is real CPU. Under burst, *all* requests feel it | High |
| R3 | **Memory amplification** | Each read materialises the blob several times (WASM heap → JS copy → HTTP buffer); WASM heaps grow and don't shrink | Medium |
| R4 | **Cache-layer poisoning** | `cache.ts`'s LRU is `max: 5000` *entries*, sized for "a few kilobytes" aggregates. 5,000 × 300 kB = **1.5 GB** if blobs are casually wrapped in `cachedRead` | High if missed, trivial to avoid |
| R5 | **Accidental full-corpus reads** | One `select()` (all columns) on a blob-carrying table turns a gallery *listing* into a gigabyte scan | Medium |
| R6 | **Wire/format overhead** | Through the JSON-contract idiom, bytes become base64 (+33 %) and then hit `compress()`, which burns CPU failing to compress JPEG | Medium |
| R7 | **Bloat without reclaim** | Hidden/deleted photos leave dead tuples; space returns only via VACUUM (FULL rewrites the table) | Low-medium |
| R8 | **Seed/dump blow-up** | The demo dump is ~1 MB of JSON today; naively including photos makes it ~1.3 GB of base64 | Low-medium |
| R9 | **External-Postgres mode** | Every photo read transits the network twice and occupies a pool slot for its duration; 50 concurrent full-size taps exhaust a default pool | Low (deployment hypothetical today) |
| R10 | **Tooling gap** | drizzle pg-core has no first-class `bytea` — needs a `customType`; hex/binary encode mistakes are classic | Low |

**Burst math for R1/R2 (the decision-driver):** 100 phones opening a 24-thumb gallery cold
≈ 2,400 blob reads. At even 1–3 ms of serialized PGlite time each, that is **2.5–7 s of
solid queue** during which nothing else — including a facilitator submitting a match
score — gets a query in. The same burst against disk files is ~zero DB queries and
kernel-buffered file streams.

### Mitigations, mapped

- **M1 — Two-table split** (R1, R2, R5): `gallery_photos` (metadata) and `gallery_blobs`
  (id, rendition, bytes) — listings *physically cannot* touch bytes. Blob column storage
  `EXTERNAL` (TOAST without compression — JPEG/WebP is already compressed).
- **M2 — Raw-bytes route outside the JSON idiom** (R6): `GET /api/gallery/blob/:id/:rendition`
  returns image bytes with a `compress()` carve-out. No base64, no gzip.
- **M3 — Browser cache as tier 1** (R1–R3, the cheapest 90 %): photos are immutable →
  `Cache-Control: immutable` + ETag/304, exactly like `webStatic.ts` treats hashed assets.
  Every phone reads each photo from the DB **at most once per day**.
- **M4 — Byte-budgeted blob LRU as tier 2** (kills the remaining burst): a *separate*
  `lru-cache` with `maxSize` ≈ 64 MB and `sizeCalculation` — never the shared `cache.ts`
  store (that is R4's trap; worth an explicit "no blobs" comment there). Immutable blobs →
  no invalidation problem. The 2,400-read burst becomes ~24 unique DB reads. All thumbs
  (~3,000 × 20 kB = 60 MB) fit in the budget.
- **M5 — Caps stay the load-bearing wall** (R3, R7, R8): server-enforced 300 kB/rendition,
  10/user, global cap → the corpus is bounded at ~1 GB *by arithmetic*.
- **M6 — Selection discipline made structural** (R5): the blob entity exposes exactly one
  read — by id, single row, explicit columns. No column-list-free `select()` on either
  gallery table; enforceable by the standards checker.
- **M7 — Lifecycle hygiene** (R7, R8): exclude `gallery_blobs` from the demo-seed dump
  (seed a handful of corpus photos via the API instead — the seed already replays HTTP).
  Post-event: export winners, `TRUNCATE gallery_blobs` — instant reclaim, no VACUUM FULL.
- **M8 — Spike before committing** (R2): insert 3,000 fixture blobs from the `images/`
  corpus, replay the 100-phone burst with `scripts/stress`, watch event-loop delay and
  score-write latency with and without M3/M4.

### Verdict on the DB-backed variant

- **Un-mitigated: no.** R1+R2 put photo traffic and match scoring in the same single-file
  queue — the gallery could stall the actual sports day.
- **Mitigated (M1–M7): defensible at this scale.** The two cache tiers change the DB's
  role from "image server" to "cold origin read ~once per image per day".
- **Decision rule:** if the M8 spike shows score-write p95 unaffected during a cold-cache
  gallery burst, DB-backed is fine and operationally *simpler*; if not, use the disk +
  metadata design (§1), which needs none of M1–M4 because the kernel page cache and file
  streaming do those jobs for free. Either way the public surface (routes, contracts, UI)
  is identical — the choice is swappable behind the entity layer, so it is a low-regret
  decision to defer until the spike.

**Default recommendation: disk + metadata**; the mitigated DB design is a legitimate
second place if operational simplicity (single dump, no file lifecycle) is valued over the
spike effort.

## 8. Overall verdict

**Feasible with zero new infrastructure** — same conclusion as chat, for the same
structural reason (single process, one data volume), plus one new discipline: *the client
shrinks, the disk stores, the DB only indexes*. The database cannot blow up because no
image byte enters it (or, in the DB-backed variant, because M1–M7 bound and cache-shield
every byte that does); the volume cannot blow up because caps are enforced server-side;
the Wi-Fi is the real budget and thumbs-first + immutable caching is how it is paid.
