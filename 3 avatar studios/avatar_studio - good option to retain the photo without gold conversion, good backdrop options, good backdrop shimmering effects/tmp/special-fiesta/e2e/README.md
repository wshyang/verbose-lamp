# The browser suite

Mirrors the jsdom suites, one directory per surface, and runs the files in parallel.

```
e2e/
  support/       fixtures, stubs, paths — no tests
  acceptance/    cross-cutting journeys (mirrors apps/web/src/acceptance)
  participant/   mirrors apps/web/src/routes-participant + components/participant
  facilitator/   mirrors apps/web/src/routes-facilitator
  superadmin/    mirrors apps/web/src/routes-superadmin
  exclusive/     anything that mutates a SINGLETON — runs alone, after the rest
  full-event/    the whole day, on a DATABASE OF ITS OWN — its own config, not in the default run
  dress-rehearsal/  the day-of rehearsal, on a DATABASE OF ITS OWN — same deal (ADR-335)
  tessensohn/    the other venue, on a STACK OF ITS OWN — same deal (ADR-299)
```

| Script | What it runs |
| --- | --- |
| `npm run test:e2e` | the parallel areas, then the exclusive ones |
| `npm run test:e2e:parallel` | every area except `exclusive/` |
| `npm run test:e2e:exclusive` | `exclusive/`, forced to one worker |
| `npm run test:e2e:acceptance` (also `:participant`, `:facilitator`, `:superadmin`) | one area |
| `npm run test:e2e:serial` | the default run, strictly one worker — the shared-safe fallback |
| `npm run test:e2e:full-event` | the whole event day, on its own scratch stack (ADR-174) |
| `npm run test:e2e:dress-rehearsal` | the day-of rehearsal, on its own scratch stack (ADR-335) |
| `npm run test:e2e:tessensohn` | the other venue, on its own scratch stack (ADR-299) |

Engines are a separate axis and compose with the above: `test:e2e:chromium`, `:webkit`, `:all`.

## The three suites on stacks of their own

`full-event/`, `dress-rehearsal/` and `tessensohn/` are the exceptions to everything above, and
for one of two reasons. **A singleton that no UI can undo:** the tournament is one row per
database and activation cannot be undone through any UI, so a spec that plays a whole day
(`full-event/`, ADR-290 — Simulator, Control, Timetable, fifteen matches on the court console)
or rehearses the day-of checklist (`dress-rehearsal/`, ADR-335) must activate it. **A
process-wide property:** the venue belongs to the whole API process (`PSD_VENUE`, ADR-295), not
to a browser session, so a spec that needs the app to BE Tessensohn (`tessensohn/`, ADR-299)
cannot run against the shared stack that is Sentosa.

Each gets a root config (`playwright.<name>.config.ts`) that boots the app on its own port pair
against its own PGlite directory and wipes that directory as part of starting up — never
reusing a surviving server. Those configs share their stanzas from `e2e/support/playwrightCommon.ts`
(ADR-344): the port registry (a pair is never shared — two wipe-on-start stacks sharing ports
cross-wire, the second health check passing against the first server), the external-Chromium
recipe, the video policy and the scratch `webServer` itself.

**The pairing is enforced, not remembered.** A directory joins `OWN_STACK_DIRS` in that module
*and* the default config ignores exactly that list (`testIgnore: ownStackIgnore()`), and the
standards rule `e2e-stack-coverage` fails the build if a root config exists whose `testDir` is
not on the list — so a bare `playwright test` keeps meaning "the suite that is safe against the
shared stack", and a new own-stack suite that forgets fails `npm run standards`, not the shared
database. Each own-stack suite runs only through its named script above; `test:e2e:serial` is
the shared-safe suite at one worker, and never includes them.

`exclusive/service-worker.spec.ts` needs a **built** bundle (`dist/sw.js` only exists after a build),
so it cannot pass against the Vite dev server that `webServer` starts. Run it against the API serving
the bundle (ADR-287):

```
npm run build:web
(cd apps/api && PORT=8799 WEB_DIST=../web/dist PGLITE_DATA_DIR=.data/sw-probe SUPERADMIN_INITIAL_PASSCODE=4242 npx tsx src/index.ts) &
PSD_E2E_NO_SERVER=1 PSD_E2E_BASE_URL=http://127.0.0.1:8799 npx playwright test e2e/exclusive/service-worker.spec.ts --workers=1
```

(8799 is deliberately outside the own-stack port registry — a probe port that collides with a
registered pair would silently test whichever API holds it, the cross-wire ADR-344 exists to kill.)

## Several browsers in ONE test — the cast

Parallelism above is about *files*. A single test can also be a **room**: several Chromium
contexts, one per role, alive at the same time, acting and being asserted on interleaved.
`e2e/support/cast.ts` (ADR-347) is the one definition of that shape — `Cast.open` signs a
whole cast in *concurrently* (each context owns its own session cookie, which is the only way
two roles can be signed in at once), records video for every context it opens (the config's
`video: 'on'` reaches only the fixture page), and offers the two choreography primitives:
`together(...)` for same-tick beats and `rendezvous(n)` for aligned starts.

`acceptance/live-room.spec.ts` is the worked example — four roles (two participants, a
facilitator at a station, the superadmin), five beats: concurrent sign-ins, a typing
indicator asserted **while the keystrokes are still falling**, a burst sent from one
rendezvous, a station stamp that crosses three roles, and an announcement over the room.
Every earlier multi-context spec proved a *relay* (A acts, then B is checked); the cast is
for when the claim is about *simultaneity* — and its cost is honest: each context is a live
browser, so cast specs stay Chromium-only, few, and in one file.

## The scale suite — an adaptive crowd, one way up (ADR-348/349)

The cast proves simultaneity with four browsers; the scale suite asks the next question —
fds.md §1's documented floor of 150 participants — with as many browsers as the machine can
honestly hold. `e2e/support/crowd/` is the machinery: a **resource monitor** (macOS `vm_stat`,
swap growth, load average; one JSONL telemetry file beside the artifacts, because a failure
under load must be attributable as *load flake* or *product bug*), an **admission controller**
that grows the crowd **one way — never prunes for resource reasons** — through sustained
headroom, probe-then-commit batches, a cooldown and a hard ceiling, and a **crowd** of browser
extras sharded across launched browsers with no video, API sign-up with the session token
seeded into the context, and id-stable scripts (extra #k always runs script k). The
unprunable core cast (ADR-347) carries every load-bearing assertion; extras' checks are
self-relative, and collective checks sit behind `guarantee(k)` — or skip with a reason,
never green by omission.

    npm run test:e2e:scale          # own stack (5178/8792), Chromium only, one worker
    PSD_E2E_SCALE_CEILING=60 …      # cap the crowd (the skeleton defaults to 25)

Browsers cannot run in every sandbox, so the machinery's pure logic is unit-tested without
them (`npm run test:e2e:unit` — parsers and the controller's scripted-pressure behaviour,
including the monotone-climb test). The first live run on a real machine owns the
calibration: `docs/design/2026-10-23-scale-orchestrator-plan.md` §4's bands are hints, and
the telemetry from that run rewrites them.

## What "parallel" means here, exactly

**Files run in parallel. Tests inside a file stay in order.**

That is `fullyParallel: false` with `workers > 1`, and the distinction is deliberate. Much of
this suite is written as a journey — sign up in the first test, act as that person in the
second — and `fullyParallel: true` would scatter those across workers and break them as flakes.
A file whose tests really are independent opts in for itself:

```ts
test.describe.configure({ mode: 'parallel' });
```

…which is a local claim the author of that file can actually check.

`PSD_E2E_WORKERS` sets the count; the default is half the cores. **If a failure looks like two
specs talking to each other, `PSD_E2E_WORKERS=1` is the first thing to try** — if it goes green
at one worker, the bug is shared state, not the feature.

## The two rules that keep parallel files honest

The backend is **one shared stack** and is **not reset between files**. Two rules follow.

**1. Provision through the app's own APIs, under the worker-unique `runId`.** Never write to the
database behind the UI's back (AGENTS-testing.md §6). `unique('Amira')` appends a run id that
includes `TEST_WORKER_INDEX`, so two workers starting in the same millisecond cannot sign up the
same nickname. A clock-only id collides exactly when the machine is fast enough to start its
workers together — the worst kind of failure to own.

**2. Anything that mutates a singleton goes in `exclusive/`.** Those rows have one instance for
the whole system, so a parallel worker would read back another worker's answer:

- the tournament (at most one is open at a time; ADR-270 rebuilt it)
- `point_config`
- the station-offline switch (`/api/admin/service-state/*`)

A spec in `exclusive/` should also **leave the state as it found it** where it can, so the suite
can run twice against the same event database. Starting a tournament is the case that cannot be
undone through any UI, so a spec that needs a running one — or that needs a venue the shared
stack is not — gets a **stack of its own**: a root config, a directory in `OWN_STACK_DIRS`, and
the `e2e-stack-coverage` pairing above.

## Why a spec exists at all

A browser spec earns its place by proving something jsdom **cannot**, not by repeating it.
jsdom resolves no stylesheet, has no real focus or key defaults, no cookie jar worth the name,
no service worker and no second engine. So:

- `facilitator/type-anywhere.spec.ts` — a synthetic `keydown` has no default action, so jsdom
  can assert the box took focus but never that the keystroke which caused it arrived.
- `acceptance/signout.spec.ts` — the session cookie is `httpOnly`; only a real browser holds it.
- `participant/participant-signup.spec.ts` — asserts *computed* style, where a pressed state
  that announced itself correctly and rendered identically was invisible to every DOM assertion.
