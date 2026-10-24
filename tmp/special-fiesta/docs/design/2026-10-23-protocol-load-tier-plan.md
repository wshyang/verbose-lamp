# The protocol load tier — synthetic users past the browser ceiling

Date: 2026-10-23 · Status: **planned, not yet built** (owner-directed through a grilling session;
to be recorded as **ADR-350**, a sibling to ADR-348/349 — it does **not** amend or replace them,
and it **sits beside** ADR-025's `npm run stress` harness rather than competing with it, §2b) ·
Target host: the owner's MacBook, local own-stack by default, an optional remote target ·
Build host: this sandbox (no browsers, P16) — every phase that does not need a browser is verified
here.

## 1. The claim being added

ADR-347's cast proves the room is **live**: four browsers acting in true simultaneity. ADR-348's
crowd proves the day at fds.md §1's **floor**: about 100–140 Chromium extras plus the cast, capped
by the MacBook's RAM at 150–200 MB per context. Neither reaches fds.md's **ceiling** of 300
participants, and neither can say where the system breaks.

This tier adds two claims, from one engine:

> **A — delivery under load.** With **300 concurrent** synthetic participants, each holding its
> real event streams, every broadcast frame (announcement, leaderboard, up-soon, feed watermark)
> reaches every live user. Delivery and latency are measured per user, per frame, while the cast's
> correctness assertions still pass.
>
> **B — capacity.** In ramp mode the engine climbs past 300 until an error, latency or stream-cap
> signal breaks. It reports the knee instead of a pass or fail.

A synthetic user costs about 2–5 MB (an HTTP client plus a stream reader, no renderer). That is the
**"scale up even further"**: ADR-348 tops out near 140 extras, this tier reaches 300 cheaply, and
ramp mode goes beyond.

## 2. How it relates to what exists

| Layer | Proves | Count | Lives in |
|---|---|---|---|
| Event-day harness (ADR-025) | request latency and herd shape, **by polling** | 300 HTTP personas | `scripts/stress-test.mjs` |
| Cast (ADR-347) | correctness, true UI | 4 browsers | `e2e/support/cast.ts` |
| Crowd (ADR-348/349) | UI at the floor | ~100–140 browsers | `e2e/support/crowd/` |
| **Hook tier (this, §6)** | **our client code** (watchdog, reconnect, dedupe) under load | 20–50 jsdom users | `e2e/load/hooks/` |
| **Protocol tier (this)** | **server delivery over SSE, and capacity** | 300 fixed; the ramp climbs past it | `e2e/load/` |

It is separate from the crowd: it has its own runner and needs no admission controller. It reuses
two crowd pieces as they are. `resourceMonitor.ts` provides the telemetry JSONL, the record that
tells a load flake from a product bug (ADR-348 H2). The id-stable script idea is the other: user #k
runs script k, seeded from `(runId, k)`, so a smaller run is an exact prefix of a bigger one.

## 2b. The existing harness (ADR-025) — what it covers, what it cannot see

`npm run stress` already drives 300 participants, 12 marshals and 2 superadmins against the real
HTTP API, in worker threads, with per-route-template labels, p50/p90/p99/max, a **herd factor**
(peak second ÷ mean second) and a 1 % failure gate. Its design doc is `docs/design/stress-test.md`.
This plan keeps all of that and does not re-derive it.

**The gap.** It is a *polling* simulator. Participants refresh surfaces on the ADR-024 45–75 s
jitter. The product has since moved to **one SSE socket per phone** (ADR-121), and the harness
holds none — the word does not appear in `scripts/stress-test.mjs` at all. So today nothing
in the repo measures:
- what 300 held sockets cost the process (the bus walks every listener on every published frame);
- whether a published frame reaches every subscriber, and how late;
- reconnect behaviour when sockets drop or the 2,000-stream cap (ADR-324) bites;
- a broadcast **fan-out burst** (one announcement, 300 writes) as opposed to a poll herd.

ADR-025 also records its own finding: *"300 participants are not, by themselves, a lot of load. The
risk on the day was never volume; it was synchronisation."* Fan-out is the SSE-era form of exactly
that risk — every subscriber is written to in the same tick — which is why the delivery claim is
worth a tier of its own.

**What is reused, and what is new.**

| Reuse from ADR-025 | New in this tier |
|---|---|
| Route-template labelling (`GET /api/teams/:id`, never the concrete URL) | A stream persona: signs up, holds `/api/status/stream` (+ chat, team chat) |
| Per-endpoint percentile report, herd factor, 1 % exit gate | Per-user, per-frame **delivery** records joined to beat nonces |
| Worker-thread sharding; the "generator must not be the bottleneck" rule | Event-loop-lag flag so generator stalls are not blamed on the server |
| `--force` for a non-local `--base` (a precedent, not enough on its own — §7) | Remote guard that refuses while a real event is live, run-id tagging, read-back |
| Idempotent re-run via prefixed accounts | Ramp-to-break mode; the knee report |
| No-framework stance (ADR-025's *Why*) — the argument holds, and is what §3 concludes again | Typed against `@psd/contracts` (TypeScript, so under `e2e/`, not `scripts/*.mjs`) |

**Integration, decided here:** `scripts/stress` stays as it is — it is the *poll-load* harness and
remains useful for the REST surface. The new engine lives under `e2e/load/` because it needs the
contracts types and the e2e unit-test convention, and `npm run stress` gains a pointer to it rather
than a copy of its code. If the polling personas should also run beside the held streams (the
realistic mix: a phone polls the REST surfaces *and* holds the stream), that is Phase 3's
`--with-polling` option, which imports the persona weights instead of redefining them — an open
choice flagged in §12.

## 3. Tooling assessment — the recommendation is a custom Node engine

| Option | SSE | Per-user, per-frame identity | Typed by `@psd/contracts` | Verdict |
|---|---|---|---|---|
| **Artillery** | No first-class SSE engine; needs a custom JS function or a community plugin | Aggregated metrics; per-VU frame tracking is hand-rolled | Partly (JS hooks) | The SSE half would be our own code inside its YAML. It adds a wrapper and keeps none of the hard part |
| **Gatling** | Native SSE in the JVM DSL; JS/TS SDK SSE coverage **to verify at build** | Good reports, aggregate-first | No (JVM/GraalVM, cannot import our TS contracts) | Strong for a pure ramp; weak for claim A; adds a JVM toolchain |
| **k6** | SSE only through the `xk6-sse` extension (custom binary) | Aggregate | No (goja, not Node) | Rejected: custom build plus a second runtime |
| **autocannon** | No | No | — | Requests only; useful at most for a single-route spike |
| **Custom Node engine** | `fetch` streaming plus a small SSE parser (`eventsource-parser`, or the spec's ~40 lines) | **Native**: every receipt is `(userId, frameKind, frameKey, tReceived)` | **Yes**: frame names and views come from `@psd/contracts`, so a contract rename fails the compile | **Chosen** |

Why: claim A is *per-user delivery of named frames*, which load tools treat as an afterthought.
Claim B is only a schedule (how many users, when) over the same engine. One engine gives one set of
numbers, and both claims compare like with like. ADR-025 reached the same conclusion for the polling
harness (*"a generic tool cannot post a `client_scan_uuid`"*), and the same holds for a stream that
must identify which nonce each frame carried. The tool claims above come from prior knowledge, not
from a check made in this session; re-check them before the ADR is accepted. A Gatling ramp profile
stays a possible later add-on if a JVM-grade HTML report is ever wanted. It is not in scope.

## 4. The engine

```
e2e/load/
  cli.ts              # npm run load -- --mode standalone|cast --users 300 [--ramp] [--target URL] [--db URL] [--hooks N] [--run-id]
  config.ts           # Zod-validated options + env equivalents (PSD_LOAD_*)
  engine/
    sseReader.ts      # fetch body → frames; heartbeat-aware; reconnect on the server's retry:
    syntheticUser.ts  # state machine: signingUp → streaming → acting ⇄ idle → leaving
    scripts.ts        # pure: (runId, k) → seeded action plan (chat, scan, join team, typing, idle)
    schedule.ts       # pure: fixed-N admission (all 300 within a configurable window) | ramp steps
    recorder.ts       # append-only JSONL writers; event-loop-lag sampler (perf_hooks)
    summary.ts        # pure: JSONL → percentiles, delivery ratios, knee detection
  staff/              # synthetic superadmin + facilitator (standalone mode, §5)
  target/             # local own-stack launcher | remote preflight, seed, read-back, cleanup, db metrics (§7)
  hooks/              # the jsdom tier (§6)
e2e/load/*.spec.ts    # cast-mode spec(s), own-stack per ADR-344
```

The CLI runs on `tsx` (`^4.20.6`, already a devDependency): `npm run load` →
`tsx e2e/load/cli.ts`. The engine is TypeScript for the contracts types, and tsx already
resolves the repo's `.js`-suffix imports, which Node's own type stripping does not.

**Synthetic user.** It signs up through `POST /api/auth/participants/signup` with a nickname of
`ld_{runId6}_{k}` (the nickname limit is 20 characters, `[A-Za-z0-9_]`, and must not be all
digits) and keeps the returned `sessionToken` as a **bearer** token. There is no cookie jar: the
server already accepts `Authorization`, and the stream accepts the token in the query (ADR-016).
(ADR-025's harness uses a one-entry cookie jar; either works, and bearer avoids per-client cookie
parsing.) It opens `/api/status/stream`. The script decides whether it also opens `/api/chat/stream`
and, once on a team, `/api/team-chat/stream`. That is at most 3 streams, under
`STREAMS_PER_SESSION = 4`.

**Sharding.** 300 users across **4 worker threads** (75 each). The event-loop lag in each worker is
recorded beside every receipt. A receipt taken while the loop lagged more than 50 ms is flagged as
generator-skewed, not as server latency. Without that flag the generator's own stalls would be
measured as the product's latency.

**Clock.** The generator, the cast and the synthetic staff all run on the MacBook, so `t0` (an
action issued) and `tReceived` (a frame seen) use one clock. This holds for a remote target too,
because only the *server* is remote.

**Frame correlation.** Each beat carries a run-tagged nonce: the announcement body includes
`[{runId}:{beatId}]`, the leaderboard beat is a scan by a known synthetic participant, and so on.
Actors append `beats.jsonl` lines `{beatId, kind, nonce, t0}`. Users append `frames.jsonl` lines
`{userId, event, nonce?, tReceived, lagged}`. `summary.ts` joins the two files. Only announcement
bodies can carry a nonce today; the leaderboard frames carry no version (folded in at
assessment), so the leaderboard beat joins by *first frame after `t0` touching the scanned
user's cluster* until a versioned frame exists — the join strategy is frozen here so
`summary.ts` cannot silently pick another.

**Budgets the engine must respect.**
- `SSE_MAX_STREAMS` defaults to 2,000. 300 users × 3 streams is 900, so fixed-N is safe.
- Ramp mode **will** hit the cap near 660 users at 3 streams each. A 429 there is the cap working,
  and it is reported as `knee: stream-cap`, not as a crash.
- Locally, ramp mode may raise the cap through env. Against a remote target it cannot, and the
  report says so.
- **File descriptors are a budget too** (folded in at assessment): macOS's default soft limit
  is 2,560, and ramp mode at a raised 5,000 streams holds 5,000+ sockets in one process —
  EMFILE arrives before the knee. The engine preflights `ulimit -n`, raises it where the shell
  allows, and reports `knee: fd-limit` when the wall is the generator's own process, not the
  server.
- Chat and typing limiters are keyed per session, so think-time jitter keeps users under them.
- The sign-in throttle spends only on failed attempts, which never occur in this tier.

## 5. The two modes

**Standalone** (capacity, and runnable without browsers). Synthetic staff generate the events:
- The superadmin signs in through the API and posts announcements.
- A facilitator scans users at a seeded fringe activity's open round (`POST /api/fringe/scans` with
  a fresh `client_scan_uuid`), which drives leaderboard frames.
- Some scans are deliberately re-POSTed with the *same* `client_scan_uuid`, which exercises the
  §4.2.11 idempotency path under load.
- Tournament driving (match start and result, which produce up-soon frames) is a later increment in
  standalone mode. Until it lands, up-soon is covered only in cast mode.

**Cast-driven** (correctness). An own-stack spec (`e2e/load/live-room-at-300.spec.ts`) opens
ADR-347's cast through `Cast.open`, unchanged. It spawns the engine as a child process (`tsx
e2e/load/cli.ts`) against the same stack and waits for `ready` — one JSON line on stdout,
`{"ready":true,…}` with N users streaming — so an engine that dies before ready fails the
spec loudly instead of hanging it. Then it plays beats:
1. a desk announcement;
2. a station scan that moves the leaderboard;
3. a court match that sends up-soon to synthetic team members;
4. a chat burst.

Every beat is written through a small `beat()` helper. The cast's ADR-347 assertions stay Tier A
and **never reference a synthetic user** (ADR-348 §6's gate rule, carried over). The delivery
numbers are a report, not an assertion, until §9's calibration sets thresholds. The spec does fail
hard on what is always wrong at any load:
- a 5xx on sign-up;
- a stream that never delivers its snapshot;
- the engine crashing;
- a read-back mismatch (§7).

## 6. The hook tier (jsdom) — proving our client code, not the server

Protocol users prove the server sends. They do not prove *our* client logic survives load: the
`streamWatchdog`, the `CLOSED`-versus-reconnect handling in `statusStream.ts`, and the store dedupe
of a "told twice, never zero times" frame. The hook tier runs the **real hooks**
(`useStatusStream`, `useChatRoom`, `useTeamChatTyping`) under `renderHook` in jsdom against the
live target.

- **One child process per hook user.** `lib/session/tokenStore` and `lib/storage/*` are module
  globals, so users sharing a process would share a session. The cap is **50**, at about 40–80 MB
  each, and the cost is measured.
- **`EventSource` polyfill.** It comes from the `eventsource` npm package. A `fetch` shim resolves
  the web code's relative `/api/...` paths against `--target`.
- **Assertion.** Self-relative only (ADR-348 Tier B): the hook's own returned state reflects each
  beat (the announcement in the store; the leaderboard version advanced). This is the
  "a hook test reads the returned value" layer of AGENTS-testing.md §1.1. It is never a stand-in
  for what Playwright must *see*.
- **Risk.** Hooks may pull in `import.meta.env` or Vite-only modules. Phase 5 begins with a spike
  that mounts `useStatusStream` alone; if the spike needs a build step, the tier shrinks to the
  hooks that run unbuilt, and the report says which hooks those are.

## 7. Targets — local by default, remote optional

**Local (default).** A scratch own-stack: a new `PORTS.load` pair — **5179/8793**, the next
free pair (folded in at assessment: the draft said 5177/8791, but that pair is reserved for
the sibling branch's mode-switch and the scale suite took 5178/8792 at build time) — added to
`OWN_STACK_DIRS`, with PGlite wiped on start. PGlite is embedded, so the API process holds the only connection. Seeding goes
through the API instead. **Read-back** happens after the run: the stack stops, and `summary.ts`
opens the PGlite directory through `openDatabase()` and the Drizzle repositories. This keeps one
mapper (non-negotiable #3) and adds no raw SQL. An optional `--db` against docker Postgres uses the
same code with `DATABASE_DRIVER=postgres`, which brings realistic write contention.

**Remote** (`--target https://…`, optionally `--db postgres://…`):
- **Preflight guard: refuse when an event is live.** Read the tournament state and today's
  activity rounds. If a tournament is open or a real round is open that the run did not seed, the
  run aborts with that reason. (Owner-chosen guard. ADR-025's `--force` for a non-local base is the
  precedent, but a flag only proves the operator typed it; this guard checks the target.)
- **Run-id tagging.** Everything the run creates carries the run id: participant nicknames, team
  names, announcement nonces, seeded activities. Cleanup and read-back select by that tag and
  nothing else.
- **Seed fixtures** (with `--db`): through the repositories in `apps/api/src/db/entities/`, with
  `openDatabaseAt(url)` and ids from `db/ids.ts`. This creates the activity, its open round, and
  the cluster check. With no `--db`, seeding goes through the superadmin API.
- **Read-back asserts** (with `--db`, or through API reads):
  - persisted scans equal the scans the server acknowledged;
  - each duplicated `client_scan_uuid` left exactly one row;
  - persisted chat messages equal the sends that were acknowledged;
  - each team has one captain (§4.2.2 under concurrency).
- **Cleanup**, soft only (non-negotiable #4):
  - `invalidate*()` the run's team memberships, teams and seeded rounds;
  - retract or close its announcements.

  **Participant rows have no `expires_at`**, so cleanup cannot remove the run's synthetic
  participants. They stay, identifiable by the `ld_` prefix (open decision §12).
- **Server metrics** (`--db` only): `pg_stat_activity` counts by state, waiting locks, and
  `pg_stat_statements` top-N if the extension exists. Sampled every 5 s into `db.jsonl`.

## 8. Output

`test-results-load/{runId}/` holds:
- `requests.jsonl` — per request: route template, status, ms, user;
- `frames.jsonl`;
- `beats.jsonl`;
- `streams.jsonl` — per stream: connect ms, time to snapshot, reconnects, 429s;
- `telemetry.jsonl` — `resourceMonitor`, plus the generator's own RSS, CPU and event-loop lag;
- `db.jsonl`;
- `summary.json` — per beat: delivered/expected and p50/p95/p99/max latency; per route: p95 and
  error rate; for the ramp: the knee and its cause (`stream-cap | fd-limit | error-rate |
  latency | generator-skew`). The per-route block uses the same shape as `npm run stress`'s report so the two
  can be compared side by side.

All of it is kept on green runs too, because it is the calibration data.

## 9. Calibration — measure first, set later (owner decision)

No delivery SLO is asserted until the first live runs on the MacBook. Those runs produce the
`summary.json` baseline, and a follow-up ADR sets the thresholds. The likely shape is p95 and p99
delivery latency plus a delivered ratio, with the status stream's no-`Last-Event-ID` design
accounted for: a frame missed during a reconnect is re-synced through the snapshot. Until then, CI
gates are the hard-fail list in §5 and the read-backs in §7.

## 10. Phases

| Phase | Builds | Verified in this sandbox by |
|---|---|---|
| **1** | `sseReader`, `scripts`, `schedule`, `summary` (pure) + `e2e/vitest.config.ts` include widened to `e2e/load/**/*.test.ts` + `ownStackIgnore()`'s unit-test pattern generalized to `**/*.test.ts` (Playwright must never load a vitest file — the crowd build hit exactly this) + the shared seeded PRNG moved to `e2e/support/seeded.ts` on its second copy (ADR-073's rule) + ADR-350 + a pointer line in `docs/design/stress-test.md` §5 | unit tests (frame parsing with split chunks, seeded-prefix property, percentile and knee maths) |
| **2** | `syntheticUser` + `recorder` + worker sharding | integration: users against `createApp()` on an in-memory PGlite through `app.request()` (streaming `Response`, no socket), real DB |
| **3** | standalone mode: synthetic staff, fixed-N 300, ramp, local own-stack launcher, `npm run load`, optional `--with-polling` (§2b) | Phase 2 harness at small N + static gates; the 300 run happens live on the MacBook |
| **4** | cast mode: `beat()`, the `live-room-at-300` spec, `PORTS.load`, `OWN_STACK_DIRS` | typecheck, eslint, standards, `--list`; live on the MacBook |
| **5** | hook tier (spike first, §6) | the spike's `renderHook` against `createApp()` in a jsdom child |
| **6** | remote target: preflight guard, run-id tagging, Drizzle seed, read-back, soft cleanup, db metrics | integration against PGlite through `openDatabaseAt`-equivalent; the remote dry run is owner-run |
| **7** | calibration run(s) + threshold ADR + this doc's §4 and §9 rewritten with the measured numbers | — (MacBook) |

## 11. Verification

- **Here:**
  - `npm run test:e2e:unit` (pure engine);
  - Phase 2's in-process integration test (N = 25 users, one announcement, every user's
    `frames.jsonl` has it, and a duplicated scan reads back as one row);
  - `npm run verify`, `typecheck:e2e`, `npm run standards`, and `--list` for the load spec.
- **MacBook:**
  - `npm run load -- --mode standalone --users 300`, then
    `npm run load -- --mode standalone --ramp`;
  - `npm run test:e2e:load` (cast mode).
- **Sabotage checks** (written into the ADR's closing list):
  - drop a frame for every 50th subscriber in `statusBus`: the summary shows a delivered ratio
    below 1;
  - break scan idempotency: the read-back fails;
  - stall the generator's loop: receipts are flagged `lagged`, not counted as server latency.

## 12. Open decisions — defaults chosen, flagged for the owner

- **ADR-350 timing.** The addendum is written with Phase 1, not with this doc. Non-negotiable #1
  wants the ADR in the change that *makes* the decision, and writing a plan does not make it.
- **Relationship to `npm run stress`.** Default: leave it untouched and build the stream tier
  beside it (§2b). The alternative is a single harness with a `--streams` persona added to
  `scripts/stress`; it avoids two tools, but it would give up the TypeScript contract types and the
  e2e unit-test convention, and it would put the delivery logic outside `npm run verify`.
- **`--with-polling`** (Phase 3): run ADR-025's polling personas alongside the held streams so the
  mix matches a real phone. Default off in the first build; import the persona weights rather than
  copy them.
- **Synthetic participants persist on remote targets.** `participant` has no `expires_at`, so
  cleanup leaves the `ld_`-prefixed rows. Options:
  - accept it (recommended for staging targets);
  - add `participant.expires_at` (a schema change that touches every read); or
  - remote runs only against disposable databases.
- **Account prefix.** This tier uses `ld_`; ADR-025 uses `stress_`. They can coexist; one shared
  prefix would make a single cleanup query cover both. Left separate until cleanup is built.
- **Port pair** — 5179/8793 (assessment correction): 5177/8791 is reserved for the sibling
  branch's mode-switch, and the scale suite took 5178/8792 at build time.
- **Up-soon in standalone mode** waits for synthetic tournament driving, a later increment.
- **Ramp ceiling locally.** The default raises `SSE_MAX_STREAMS` to 5,000 for ramp runs so the
  knee measures the server, not the cap. Run once more at the shipped 2,000 so the cap's own
  behaviour is in the report.
- **Hook tier cap** is 50 processes, revised after the Phase 5 spike measures per-process cost.
