# The scale orchestrator — an adaptive browser crowd for the full-day run

Date: 2026-10-23 · Status: **planned, not yet built** (owner-directed design; recorded as ADR-348, amended the
same day by ADR-349 — the crowd climbs and never retreats) ·
Target host: the owner's MacBook (~32 GB class) · Build host: this sandbox, where browsers cannot
run (P16) — so every phase below is verified here by unit tests and static gates, and **the first
live run on the MacBook owns the calibration**.

## 1. The claim being added

fds.md §1 sizes the real event at **150–300 participants, 10–20 facilitators, 2 superadmins**. The
suite today proves two things about that day: that it is *correct* (ADR-290 plays a whole
15-match day through the real screens) and that it is *live* (ADR-347's cast proves four roles
acting in genuine simultaneity). Neither proves the event at its documented **scale** — nothing
in the repository has ever had 150 sessions holding 150 SSE streams while the day runs.

This plan adds that claim, as one more own-stack run:

> **The documented floor — 150 concurrent users — through a compressed full day, with the day's
> correctness assertions still passing while the load is real.**

## 2. The design, as the owner directed it

1. A **resource monitor** samples the local machine's RAM and CPU pressure.
2. An **admission controller** scales a browser crowd from those samples — **one way: up
   only** (ADR-349). Extras are admitted while headroom exists and are never pruned for
   resource reasons; once admitted, an extra stays for the rest of the run.
3. Every crowd member carries a **stable id**; the actions it performs and the checks it enables
   are gated on which ids are alive.
4. A **core cast is never pruned** — the day is played on it and every load-bearing assertion
   lives on it.
5. **Extras** generate activity and enable extra checks; their checks are id-gated.
6. **Scaling never reverses.** The controller may only grow the crowd — conservative about
   growing, permanent about having grown, which is what makes the whole design conservative.

## 3. Assessment — the design is sound, and it forces four disciplines

Admission-controlled load with a deterministic core is a proven shape (it is how load-test
orchestrators have worked for decades). On a single MacBook, four hazards are real, and each one
dictates a piece of the architecture:

**H1 — Over-eager growth (the one-way ratchet's own hazard).** Scaling never reverses
(ADR-349), so the classic spawn→prune→spawn thrash cannot exist — but the ratchet cuts the
other way: a batch admitted on a transiently good sample is a batch the run is stuck with, and
a crowd that outgrows the machine has no release valve. *Discipline:* grow only on **sustained**
headroom (consecutive good samples), never on one; **probe-then-commit** — the first batch is
small and its measured marginal cost sizes the batches that follow; a **cooldown** between
batches; swap growth or sustained CPU above the ceiling **stops growth for the rest of the
run** (the only brake a one-way controller has); and a **hard ceiling from config** no matter
what the monitor says. The invariant the design rests on: **the crowd curve is monotone
non-decreasing** — proven against a sawtooth availability stream by unit test. And if the
ratchet still overcommits, the run fails loudly (timeout, OOM) rather than silently weakening —
the honest failure mode.

**H2 — The stack competes for the same machine.** The app under test (Next dev server, Fastify,
PGlite) shares the MacBook's RAM and CPU with the crowd; saturating the CPU starves the server
and manufactures flakes that are the *machine's* fault, not the product's. *Discipline:* the
controller reserves the stack's budget before counting headroom, holds a CPU ceiling (stop
growing when sustained load exceeds ~70% of cores — the only lever a one-way controller has), and — the quiet superpower of this design — **writes its
telemetry into the run's artifact directory**, so every failure can be attributed after the
fact: *load flake* or *product bug*. A suite that can tell those apart is worth building; one
that cannot is a slot machine.

**H3 — Departures mid-flight.** With one-way scaling the resource controller never closes a
context — but two things still do: **scripted departures** (the choreographed
people-leave-the-beach beat) and **error cleanup** (a crashed renderer must not leak). Killing
a context mid-POST leaves half-finished actions either way. *Discipline:* every extra is a
small state machine — `admitting → idle → acting → retiring` — and retirement happens only at
**safe points** (idle, or between scripted actions); retire finishes or aborts the in-flight
action, closes the context, marks the id. Departure order is **highest id first**; the core
cast is not in the departing set at all, and a dead id is never reused — the next admission
takes a fresh id from the monotone counter.

**H4 — Nondeterministic assertions.** The one way this design ruins a suite: a check that
passes or fails depending on how many extras *happened* to be alive. *Discipline:* the gate rule
(§6) — core checks never reference extras; extra checks are self-relative; collective checks sit
behind a `guarantee(k)` barrier that either proves k extras are alive or **skips the check with a
logged reason**. A skipped-with-reason check is visible in the report; a silently-weakened one
is a lie.

## 4. Capacity math — planning bands, not truth

For a ~32 GB-class MacBook, at this app's per-page weight (a hydrated Next.js page holding an
SSE stream; measured context costs elsewhere run 100–200 MB for real pages, 30–50 MB for blank
ones):

| Line item | Planning band |
|---|---|
| macOS + baseline (untouchable) | 4–6 GB |
| The stack (Next dev + Fastify + PGlite), reserved | 3 GB |
| Controller's own safety reserve | 2 GB |
| Playwright Node driver (~20 MB/context + base) | 0.3–0.5 GB |
| Browser parents (one `chromium.launch()` per ~25 extras) | 0.2 GB per shard |
| **Crowd budget** | **≈ 20–22 GB** |
| Browser extras at 150–200 MB each | **≈ 100–140 sustained** |

So the honest planning answer: **~100–140 browser extras sustained** on a 32 GB machine, with
the fds.md floor of **150 total users** reachable either on a quiet machine near the band's
optimistic end, or with the optional phantom top-up (§9). The controller treats this table as
*initial hints only* — from its first minutes of telemetry it computes the measured per-context
RSS and uses that number instead, and §4 gets rewritten with the measured truth after the first
live run.

macOS specifics the monitor must respect: `os.freemem()` under-reports available memory
(excludes purgeable cache) — the sampler parses `vm_stat` (free + speculative + purgeable pages)
instead; real pressure shows as **swap growth**, which stops growth in its own right; fd
limits (macOS default soft limit is often 2560, and ~150 contexts is ~2000+ fds) get a preflight
check that warns and caps. Thermal throttling from a hundred renderers is handled indirectly by
the CPU ceiling.

## 5. Architecture

```
e2e/support/crowd/
  resourceMonitor.ts   # vm_stat + swap + loadavg sampler; JSONL telemetry into the output dir
  admission.ts         # the controller: sustained-headroom gate, probe-then-commit batches,
                       #   cooldown, ceiling, decide(sample) → spawn | hold (one way, ADR-349),
                       #   and the guarantee(k) barrier
  crowd.ts             # Crowd: browser shards, per-extra state machines, id-stable scripts,
                       #   think-time jitter, API sign-in + cookie transfer, safe retire
e2e/scale/             # the spec(s) — own-stack, per ADR-344's registry
playwright.scale.config.ts
```

**The crowd is not the cast.** The core cast keeps ADR-347's shape untouched: the test's fixture
browser, camera flags for the selfie canaries, `recordVideo`, sign-in driven through the real
UI — because its job is *correctness*. The crowd's job is *load*, so it takes the cheaper path
everywhere: its own `chromium.launch()` shards (one per ~25 extras, no camera flags, **no
video**), sign-up and sign-in through the app's own APIs with the session cookie transferred
into the context (AGENTS-testing.md §6's provisioning spirit — a hundred UI sign-ins would
measure Playwright, not the app), and think-time jitter between actions so a hundred extras do
not behave like one thundering herd.

**Id stability is the reproducibility contract:** extra #k's script is a pure function of k (and
the run id). A run that reached 47 extras is an exact prefix of a run that reached 140 — same
actions in the same order, comparable telemetry, and a departure wave that retires ids 130–140
means something definite.

**The stack:** a new entry in `PORTS` (`scale: { web: 5178, api: 8792 }` — 5177/8791 is spoken
for by the sibling branch's mode-switch, and the registry's rule is the next free pair),
`OWN_STACK_DIRS` gains `'scale'`, `scratchWebServer` gets its own PGlite directory wiped on start, one worker,
Chromium only, `npm run test:e2e:scale`. PGlite's single embedded connection serializes the
crowd's writes — deliberately kept for the scale run: **if the day survives 150 users on
PGlite, it survives on Postgres**, which makes the run a conservative bound rather than an
unrealistic one. (If realistic contention is ever wanted, the scratch stack can point at the
docker Postgres — a config flag, not a design change.)

## 6. The gates — how assertions stay honest at variable N

| Tier | Who | Rule | Example |
|---|---|---|---|
| **A — core** | The cast, always | Never references an extra; the day's load-bearing checks | The ADR-290 beats; ADR-347 interleave assertions |
| **B — self-relative** | Each extra, while alive | Asserts only **its own observable world** and its visibility **to one named core member** | Its chat message renders for itself and for the core captain; its typing line is seen by core |
| **C — collective** | The crowd | Only behind `guarantee(k)`, else **skip with a logged reason** — never a silent pass | The announcement's toast reaches all k guaranteed extras within T; a line-up change is seen by all k |

`guarantee(k)` blocks until k extras are admitted (spawning if the budget allows) or admits
defeat and returns false — and a defeated collective check is reported as skipped, so a
resource-starved run reads as *honest but reduced*, never as *green by omission*.

One-way scaling makes a guarantee **monotone-stable**: no controller prune can take an admitted
extra away, so a guarantee that held at one beat still holds at the next — checked cheaply at
assert time (alive count, not a cached promise), because a crashed renderer is not a prune. The
departures beat is scheduled after every collective beat, so nothing needs to re-guarantee.

## 7. The scale day — the beats

1. **Assemble.** The scratch stack boots; the core cast opens (ADR-347 path, UI sign-in).
2. **The climb.** The controller admits extras in batches — probe first, then sized from the
   probe's measured marginal cost; each extra signs up through the API, enters the venue, some
   form or join teams through the API; think-time chatter begins. The climb is a **ladder of
   plateaus**: each level is held for an assertion window (a beat of the day asserted at that
   crowd level) before the next batch, and the run never descends — the crowd curve is the
   experiment.
3. **The compressed day.** The core superadmin drafts and starts the day (ADR-290 flow), the
   core marshal plays the matches on the court console, and extras **react to their status
   streams** — a line-up tick sends them to the line-ups view, a leaderboard push to the
   leaderboard. The day takes minutes, not hours: nothing in the tournament is wall-clock-paced
   (asks never expire; matches are rallies the marshal clicks).
4. **Fan-out moments.** `clearAnnouncements`, one announcement from the desk, and a
   `guarantee(k)` toast check across the crowd; final standings and sectioned results visible to
   the core and to every guaranteed extra.
5. **Scripted departures.** Waves of extras leave (people leave the beach) — **choreography,
   never resource-triggered** (ADR-349's line: the controller only grows). After each wave the
   suite asserts the room and the day survived — core checks, unaffected. Departures end the
   climb for good; no regrowth, and dead ids are never reused.
6. **Land.** The day ends on the core cast; the telemetry JSONL is complete and beside the
   artifacts; §4 of this doc gets its measured rewrite.

## 8. Verification — split by what each host can do

**In this sandbox (no browsers):** unit tests for the pure logic — the `vm_stat` parser against
fixture texts (including page-size and locale variants), the controller's `decide()` against
scripted pressure sequences (the monotone-climb test — a sawtooth availability stream must
yield a non-decreasing crowd that stops at the ceiling and never retreats, and a declining
stream must stop growth at once — is the one that proves H1), and
`guarantee(k)` semantics — plus the standing static gates: `typecheck:e2e`, eslint, standards,
and `--list` for the new config. One small new convention this needs: vitest currently lives
per-app (`apps/api` only), so Phase 1 adds an `e2e/vitest.config.ts` (node environment,
`support/crowd/**/*.test.ts`) and a `test:e2e:unit` script — recorded in ADR-348 so it is a
decision, not an accident.

**On the MacBook (first live run owns the calibration):** the measured per-context RSS replaces
§4's band; the growth gate gets tuned; the run's duration and flake report are written back here.
Until that run happens, every number in §4 is labeled what it is — a planning band.

## 9. Optional knob (Phase 5): phantom users

If the measured browser ceiling lands below the 150 total the claim wants, a **phantom top-up**
adds API+SSE-only extras (~2–5 MB each — a fetch-held event stream needs no renderer) to carry
the connection count past 150 while the browser crowd keeps proving the UI at scale. Off by
default, out of scope until the browser crowd's real ceiling is measured; the owner-directed
design — real browsers, adaptively scaled — stays the core of it.

## 10. Phases

| Phase | Builds | Verified here by |
|---|---|---|
| **1** | `resourceMonitor.ts` + `vm_stat` parser + `e2e/vitest.config.ts` convention | unit tests |
| **2** | `admission.ts` — sustained-headroom gate, probe-then-commit, ceiling, `guarantee(k)` | unit tests (incl. the monotone-climb test) |
| **3** | `crowd.ts` + shards + `playwright.scale.config.ts` + `OWN_STACK_DIRS`/`PORTS` + a skeleton spec (assembles core + N extras, no day yet) | static gates + `--list` |
| **4** | the scale-day beats and gates (§7), telemetry artifact | static gates + `--list`; live on the MacBook |
| **5** (optional) | phantom top-up (§9) | as Phase 4 |

## 11. Open decisions — defaults chosen, flagged for the owner

- **Hard ceiling default: 120 browser extras** (below the band's top; raise after calibration —
  the ceiling is the kill switch that keeps a monitor bug from OOMing the laptop).
- **Growth gate (one way — no prune watermark exists):** spawn a batch only after 3
  consecutive samples with available RAM (minus reserves) > 25%; the first batch is a probe of
  5 whose measured marginal cost sizes the batches that follow; cooldown 15 s between batches;
  swap growth or sustained CPU > 70% stops growth for the rest of the run. All tunable by
  config; all expected to move after the first live run.
- **Phantoms:** out of scope until measured (§9).
- **Telemetry:** JSONL, one line per sample, in the run's `outputDir` (`test-results-scale/`),
  kept even on green runs — it is the calibration data for §4's rewrite.
