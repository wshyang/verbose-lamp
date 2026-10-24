# Event-day load simulation

**Status:** shipped (ADR-025) · **Harness:** `scripts/stress-test.mjs` +
`scripts/stress/` · **Run it:** `npm run stress`

The event is one day long, in one place, with everybody arriving at once: 300 participants
on their phones, 10–20 facilitators running courts and fringe stations, 2 superadmins
watching the console (fds.md §1). There is no second chance and no autoscaling — one API
process on one laptop behind a beach Wi-Fi. This harness is how we find out what that
actually costs before the day.

## 1. Running it

```bash
npm run dev                     # terminal 1: API :8787 + web :5173
npm run seed:demo               # once: point config, courts, activities, facilitators
npm run stress                  # 300 participants, 12 marshals, 2 superadmins, 120s
```

| Flag | Default | What it changes |
| --- | --- | --- |
| `--users` | `300` | Participants (the FDS ceiling) |
| `--facilitators` | `12` | Marshals: one in three works a court, the rest scan |
| `--duration` | `120` | Seconds at full load, after the ramp |
| `--ramp` | `30` | Seconds over which the crowd arrives |
| `--workers` | `min(6, cores−1)` | Worker threads generating the load |
| `--poll` | `jitter` | `fixed` reproduces the pre-ADR-024 aligned 30 s interval |
| `--poll-min` / `--poll-max` | `45` / `75` | The client's poll window, in seconds |
| `--scan-rate` | `2` | Fringe scans per second **per station** |
| `--team-size` | `6` | Squad size; `0` skips team building |
| `--base` | `http://127.0.0.1:8787` | Target; non-local needs `--force` |
| `--json` | — | Write the full summary for later comparison |
| `--dry-run` | — | Provision everything, generate no load |

It drives the **public HTTP API with real sessions** — no direct database writes — so every
number is one a phone on the beach could have produced. Accounts it creates are prefixed
(`stress_0001`, marshal `stressm01`, teams `stress squad 01`), and re-running is safe:
sign-ups, team creation and joins all tolerate the "already exists" answers.

## 2. What the virtual users do

| Persona | Count | Behaviour |
| --- | --- | --- |
| Participant | `--users` | Signs in, then walks the surfaces: board 40 %, feed 18 %, home 16 %, scans 10 %, my team 10 %, team browser 6 %. Stays on a polling surface for 1–3 polls, thinks for 4–20 s, moves on. |
| Court marshal | ⅓ of `--facilitators` | Polls courts + current match + team list; starts a match when the court is free, declares a winner when it is not. |
| Fringe marshal | ⅔ of `--facilitators` | Scans a random participant every `1/--scan-rate` seconds and reloads its scan log every 10 scans. |
| Superadmin | `--superadmins` | Dashboard + participant directory + match list, on a poll. |

Participants and marshals wait exactly as the app waits: a fresh random delay in the
45–75 s window before every poll (ADR-024). `--poll=fixed` switches the whole fleet to the
aligned 30-second interval the app used before, which is the comparison below.

## 3. What it measured

Two 300-user runs against one dev API (PGlite, 2 vCPU sandbox), 20 s ramp + 90 s at load,
2 worker threads. Identical in every respect except the poll schedule:

| | `--poll=jitter` (shipped) | `--poll=fixed` (pre-ADR-024) |
| --- | --- | --- |
| requests | 3 991, **0 failed** | 4 972, 2 failed |
| mean at load | 25.0 req/s | 34.7 req/s |
| **peak second** | **42 req/s** | **294 req/s** |
| herd factor (peak ÷ mean) | **1.68×** | **8.47×** |
| leaderboard poll p50 | **12 ms** | **1 269 ms** |
| leaderboard poll p99 | **28 ms** | **3 213 ms** |
| fringe scan p99 / max | 28 ms / 46 ms | 33 ms / **2 366 ms** |

```
jitter  requests/s  ▇▇▇▇▇▇████▄▃▅▄▄▄▃▅▃▄▃▃▄▃▃▄▃▃▃▄▄▄▅▄▄▆▅▆▄▄▅▆▅▄▆▅▄▄▄▄▄▄▄▅▄
fixed   requests/s  ▂▂▂▂▂▄▂▂▂▂▂▁▁▁▁▁▁▁▁▁█▁▁▁▁▁▂▁▁▁▁▁▁▁▁█▁▁▁▁▁▁▁▂▁▁▁▁▁▁█▁▁▁▁▁
```

Three things fall out of that:

1. **The jitter is not cosmetic.** Same crowd, same work: aligned clients produce a 294
   req/s spike every 30 seconds and a leaderboard that takes **over a second at the
   median**; independent clients never exceed 42 req/s and answer in 12 ms. The spikes are
   visible in the sparkline as single bars against a floor of near-silence.
2. **Writes get caught in the spike.** Fringe scans are unaffected on average, but the
   worst scan in the synchronised run took 2.4 s — a facilitator standing in front of a
   queue, watching a spinner, because 300 phones asked for the board at the same instant.
3. **300 participants are not, by themselves, a lot of load.** At a sane poll schedule the
   whole event is ~25 req/s and the API answers everything inside 30 ms with a single
   PGlite process. The risk on the day was never volume; it was synchronisation.

The two failures in the synchronised run are worth keeping: two court marshals woke on the
same clock tick and both tried to complete the same match. The state machine rejected the
loser with `400 Invalid status transition` (fds.md §3.2) — which is exactly right, and is
the kind of thing only a concurrent test finds.

## 4. Reading the report

- **p50/p90/p99/max per endpoint** — the slow tail is what a participant notices, not the
  mean. `max` on a write endpoint is the number to watch.
- **herd factor** — peak second ÷ mean second, after the ramp. Anything above ~2× means
  clients are arriving together; the fix is scheduling, not capacity.
- **first failures** — status, endpoint and the server's own message, so a red run
  explains itself without a second run.
- The harness **exits 1 if more than 1 % of requests failed**, so it can gate a release.

## 5. Extending it

A new surface belongs in `scripts/stress/personas.mjs`: add its requests to
`openSurface`, and give it a weight in `PARTICIPANT_SURFACES` that reflects how often
someone would really open it. Keep every call labelled with its **route template**
(`GET /api/teams/:id`), never the concrete URL, or the report grows a row per team.

The stream-era sibling: `e2e/load/` (ADR-350) is the tier that holds one **SSE socket**
per synthetic user and measures per-user, per-frame delivery — this harness remains the
REST-poll tier. Its route-template labels and its nearest-rank percentile method are the
ones the load engine mirrors, so the two reports can be set side by side
(`docs/design/2026-10-23-protocol-load-tier-plan.md` §2b).

The harness deliberately has no dependencies and no framework: it is ~600 lines of Node
against `fetch`, which is less than the configuration a load-testing tool would need and
runs anywhere the repo runs, including offline.
