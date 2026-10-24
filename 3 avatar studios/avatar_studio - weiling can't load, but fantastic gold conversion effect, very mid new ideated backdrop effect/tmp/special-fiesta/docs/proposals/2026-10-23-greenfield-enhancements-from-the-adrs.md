# What the ADR register taught that GREENFIELD.md should grow into

- **Date:** 2026-10-23
- **Sources read:** all 342 register entries in `docs/addenda/ADDENDA.md` (titles and supersession
  index in full; the entries cited below in full), `GREENFIELD.md` §0–§10 in full.
- **Rule obeyed:** this file proposes; it does not touch `GREENFIELD.md`. Each proposal is
  **assessed** — value, cost, risk, verdict — so the owner can accept, adapt, or reject each one
  on its own. Nothing here is applied yet.
- **Verdict vocabulary:** **adopt** (write it in, essentially as drafted) · **adapt** (the lesson
  is real but the clause needs the owner's own wording) · **defer** (right, but not for a
  greenfield template) · **reject** (app-specific; recorded so nobody re-files it).

| # | Proposal | Verdict |
|---|---|---|
| P1 | A standards gate that encodes the local rules, not just lint | **adopt** |
| P2 | Coverage as a ratchet; deletion, never suppression | **adopt** |
| P3 | Replace §5's twin-file rule with idempotent boot application + a version stamp | **adapt** |
| P4 | Client-minted idempotency keys on every retryable write | **adopt** |
| P5 | Polling reads must be cheap by design (write-voided caches, conditional requests) | **adapt** |
| P6 | Realtime transport rules (timed quiet streams, cursored reconnect, bounded streams) | **adapt** |
| P7 | One fault, one request — process survival, readiness, and boundedness | **adapt** |
| P8 | Observability: draw the absence; record the misses | **adopt** |
| P9 | Tests must be proven able to fail (bite checks) | **adopt** |
| P10 | Narrated actor-trace suites and size loops for the flagship journey | **adapt** |
| P11 | Recorded demo seed; three data tiers; provisioning as a critical section | **adapt** |
| P12 | Register machinery: supersession index, identifiers-that-moved, amendments | **adopt** |
| P13 | Evidence honesty in prose: claim only what was run | **adopt** |
| P14 | API state discipline: two events are two events; a write answers for itself; the log, not inference | **adopt** |
| P15 | A second consumer early (the four gaps one venue found in another) | **defer** |
| P16 | The e2e engine story: how Chromium was gotten working in a locked-down sandbox | **adopt** |

---

## P1 — A standards gate that encodes the local rules, not just lint

**What GREENFIELD says today.** §6 and §7 name conventions (one casing, no API calls in
components, function caps) but the only enforcement named is ESLint and review.

**What the register taught.** A convention nothing checks decays (ADR-010's own words). The repo's
answer is `scripts/check-standards.mjs` — a bespoke gate that runs in the same `npm run standards`
step as eslint, enforcing rules no linter plugin expresses:

- `max-lines-per-function` on `.ts` only, never `.tsx` — a page component is one declarative tree,
  and the rule's real target (branching logic) is already banned from JSX (ADR-012).
- No `components/participant/` import or `gb-*` class on a staff surface, so the spartan console
  stays spartan (ADR-014).
- `detached-promise`: no bare `void call()` in stream code — the named idiom `runDetached(promise,
  onError)` or nothing (ADR-324, defect C3/C4).
- Docker twins: the two `Dockerfile`s and their scripts must stay identical in the ways that
  matter; SHIP-HATS pipeline files live in the repo **inert**, and their consistency is itself a
  standards rule (ADR-243).
- Dead exports are removed only on a two-part test (zero references outside **and** inside its own
  file, minus deliberate test seams) — a one-part sweep flags 244 symbols that are fine (ADR-081).

**Proposal (new clause for §6).** *"Every convention in this file that a machine can check, a
machine checks — in the same `npm run standards` command a contributor already runs. Rules no
plugin expresses live in one `check-standards` script, each rule citing the ADR or section that
motivates it, each with its own test that removing the rule turns the gate red."*

**Assessment.** Value: high — every one of these rules was load-bearing at least once (the
detached-promise rule exists because a `void` ended the process). Cost: a day to stand up the
script; each rule is ~10 lines. Risk: bespoke gates rot if rules don't fail when broken — hence
the rule-cites-its-ADR and gate-has-its-own-tests requirements. **Verdict: adopt.**

## P2 — Coverage as a ratchet; deletion, never suppression

**What GREENFIELD says today.** Nothing. §2 demands tests-first but never says how much coverage
is enough or how to keep it.

**What the register taught.** The repo walked the whole road so a template doesn't have to:
ADR-013 demanded 100 % on all four metrics and deleted unreachable arms with the guaranteeing
constraint cited in a comment — never `/* v8 ignore */` — which "forced the question *what
guarantees this arm is unreachable?* and removed real dead code". ADR-080 replaced the 100 % gate
with **measured floors ratcheted upward only**, and the ADR-094 amendment records the process
defect: floors pinned to a lucky run failed the next unchanged tree. Two statements and one
function flicker between identical runs — *"a gate that fails half the time on an unchanged tree
measures the machine, not the tests."*

**Proposal (new clause for §2).** *"Coverage floors are set from the observed minimum of several
full runs and may only move up. Unreachable defensive arms are deleted, with the guaranteeing
constraint cited where the arm was — suppression comments are forbidden. Entrypoints (a `main`,
a CLI) are the only exclusions, listed in the config, not inline."*

**Assessment.** Value: high; it is the difference between tests as ritual and tests as debt
control. Cost: low (two vitest config blocks). Risk: the ratchet tempts a lucky high floor — the
observed-minimum sentence is the guard, and it must survive into the template verbatim.
**Verdict: adopt.**

## P3 — Replace §5's twin-file rule with idempotent boot application + a version stamp

**What GREENFIELD says today.** §5 ("Schema evolution") prescribes numbered migrations **and** a
wholesale snapshot, edited in the same change, forever.

**What the register taught.** The repo started exactly there, then ADR-049 deleted the nine
migrations: pre-production, nothing to migrate *from*, and the twin rule existed to police the
drift that having two homes **created**. The verification is the model: two databases built both
ways, `information_schema` compared — 148 columns, 225 constraints, 50 indexes matched — *"the
verification is what made deleting the originals a safe act rather than a hopeful one."* The
successors fixed what the squash could not: apply the snapshot on **every boot**, idempotently,
not only to an empty database (ADR-165); additive `ADD COLUMN IF NOT EXISTS` statements must be
**repeated, never edited**, because a database that already has the table never sees the earlier
line again (ADR-168); the snapshot stamps a schema version (ADR-264), and a database stamped
older than the build is **refused at boot, never re-stamped** (ADR-271). ADR-049 keeps the
escape clause in those words: the first deployment holding data anybody cares about is when a
numbered chain earns its keep again.

**Proposal (rewrite of §5).** *"One schema file, applied idempotently on every boot. Schema
changes append; a line once shipped is never edited — additive statements repeat. The snapshot
carries a version stamp; a database stamped older than the build is refused with where-it-stopped
diagnostics, never silently upgraded. This holds until the first database with data anybody cares
about; at that moment a numbered migration chain returns, and this section says so in advance."*

**Assessment.** Value: high — §5 as written mandates the two-home drift the register spent four
ADRs escaping. Cost: the boot path must be idempotent from day one (cheap if decided day one;
ADR-049 shows the retrofit cost of deciding later). Risk: teams that ship early forget the
reversion trigger — the clause names it explicitly, as ADR-049 does. **Verdict: adapt** — the
owner may prefer keeping a migration chain if the project expects production data in its first
month; both models are defensible, but the template must pick one, and the register's evidence
picks the boot-stamp model.

## P4 — Client-minted idempotency keys on every retryable write

**What GREENFIELD says today.** §6 covers wire contracts and testids; nothing on retry safety.

**What the register taught.** ADR-009: an offline scan queue mints a client UUID, the server is
first-write-wins on it, and the round is trusted. The pattern recurs throughout the register —
award batches, the mode switch, undo — because the event-day reality is spotty Wi-Fi and
participants tapping twice. Every write that can be retried carries a client-minted key; a replay
answers the original result (200, no duplicate), and the register records the replay test as a
standard part of verifying such a route ("clientAwardUuid replay 200 no-dup" in the ADR-337/342
era suites).

**Proposal (new clause for §6).** *"Any write a client might retry (offline queue, double-tap,
reconnect) carries a client-minted UUID; the server treats first-write as the truth and replays
answer the original outcome without duplicating. The replay case has its own test."*

**Assessment.** Value: high; event-day duplicates are otherwise unfixable after the fact.
Cost: one column + one unique index per such table, one replay test per route. Risk: none
identified. **Verdict: adopt.**

## P5 — Polling reads must be cheap by design

**What GREENFIELD says today.** Nothing about read load. §2/§3 test correctness, not cost.

**What the register taught.** At 300 participants a 45–75 s-jittered alerts poll is ~5 req/s
before any other surface (ADR-094). The discipline that emerged: every poll-fed read goes through
a `cachedRead` decorator **owned by the entity that owns the writes**, voided by tag at every
write site — so the pairing is auditable in one file (ADR-038); tags computed **per call** so one
busy team room doesn't empty the other fifty-nine (ADR-094); deliberately-uncached reads are
**named and argued** (single indexed PK reads cost less than their invalidation web); open filter
surfaces are rejected as cache keys (combinatorial key space — the feed got its own named read);
and a conditional request can still cost no body (ADR-135). The ADR-094 amendment also records
the honest-title lesson: the code was right and the title claimed too much.

**Proposal (new clause for §6 or §7).** *"A read that will be polled is a named read behind a
cache decorator the entity owns, voided by write sites in the same file. Deliberately uncached
reads are listed with their argument. Cache keys never span an open filter surface."*

**Assessment.** Value: medium-high — a greenfield app without polling learns this late and
painfully. Cost: the decorator (~100 lines) plus discipline. Risk: caching added *after* launch
creates staleness bugs; the clause must say "from the first polled surface", not "when load
demands". **Verdict: adapt** — worth including only if the template assumes a phone-audience app,
which the register's context did.

## P6 — Realtime transport rules

**What GREENFIELD says today.** Nothing; §3's Playwright defaults implicitly assume request/response.

**What the register taught.** A compressed arc: a quiet stream is **timed, not trusted**
(ADR-119); one status stream for the shell with the poll demoted to fallback (ADR-121); the
reconnect storm fixed by not computing for an empty room and by one membership read per
connection (ADR-122/123); a dropped connection told apart from a browser that gave up (ADR-124);
membership **re-checked on team frames** so a socket never outlives its authorisation (ADR-128);
and the flake that outlived several rounds was **never timing** — the discipline is "mitigating
an undiagnosed flake buys a slower red build" (ADR-127).

**Proposal (new clause for §3).** *"If the app streams: a stream that goes quiet is timed out,
never trusted; reconnects resume from a cursor; authorisation is re-checked on frames, not only
at connect; and a flake in stream tests is diagnosed, never timeout-mitigated."*

**Assessment.** Value: high **if** the app streams; noise otherwise. Cost: none to write, large
to skip. Risk: a template that presumes streams pushes a CRUD app toward complexity — hence
"if". **Verdict: adapt** (conditional inclusion).

## P7 — One fault, one request: process survival, readiness, boundedness

**What GREENFIELD says today.** §9 covers reproducible dev; nothing on process fault isolation.

**What the register taught.** ADR-324 is the register's hardest-won entry, in three parts:
(1) every way a single connection, stream or tick could end the process was found, each
**reproduced or traced to a line rather than assumed** (a pool `'error'` on an idle connection, a
`void deliver(frame)`, an 8-second graceful shutdown under Docker's 10, a measured **44 s** of
synchronous Swiss pairing inside a transaction); (2) readiness is separate from liveness —
`/api/health` stays up through a database blip; `/api/health/ready` walks the path a real request
takes (checkout + a read-only transaction + a real seeded table), single-flighted so a public
probe cannot hammer the database; (3) nothing a stranger or a stall can make the app buffer, hold
or wait on without bound — body limits computed from the largest legitimate body, throttles keyed
on the account not the address (behind the platform's proxy every phone shares one), stream
ceilings, pool timeouts.

**Proposal (new clause for §9).** *"A fault fails the request or socket that met it, never the
process — pool error listeners, a named idiom for fire-and-forget promises, ordered graceful
shutdown. Liveness and readiness are separate endpoints, and the readiness probe does what a real
request does. Every buffer has a bound, every wait a deadline, and each bound names the
legitimate maximum it was derived from."*

**Assessment.** Value: high for any long-running deployment; the "reproduced or traced to a line,
rather than assumed" audit method generalises beyond servers. Cost: real — this is days of work
done properly. Risk: front-loading it into greenfield delays first value; the clause is cheap,
the work can be scheduled. **Verdict: adapt** — write the standard now, schedule the audit
against it.

## P8 — Observability: draw the absence; record the misses

**What GREENFIELD says today.** Nothing on runtime observability or test-harness observability.

**What the register taught.** ADR-192: a late announcement and a late *delivery* produce the same
complaint from the same person — the only thing that separates them is whether the socket was
carrying, the client knew it all along, "it simply never told anybody." The fix renders an
**absence** (healthy = no element, so the indicator cannot decay into wallpaper), with wording
chosen so it doesn't read as *broken* ("updates may be up to a minute behind"). The other half:
`installFetchStub` threw on unknown routes but a floating rejection is **attributed to whichever
test is on screen** — so the stub now *records* every miss and `expectNoUnstubbedCalls` asserts
none, and a one-off probe counted **157 unstubbed requests across 16 routes** in the suite. Every
one a floating rejection able to fail an unrelated test.

**Proposal (two clauses).** For §9: *"Symptoms get an indicator, drawn as an absence, worded so
the fallback isn't mistaken for an outage."* For §3: *"A test double that rejects a call it
doesn't recognise also records the miss, and every test asserts it made none — a floating
rejection fails whichever test is on screen, which is a lie."*

**Assessment.** Value: the miss-recording stub alone kills a whole class of wandering flakes.
Cost: one helper + one `afterEach`. Risk: none. **Verdict: adopt.**

## P9 — Tests must be proven able to fail (bite checks)

**What GREENFIELD says today.** §2 says write tests first, keep them real, cover the negatives
(authz matrix). It never says *prove the test can fail*.

**What the register taught.** The register's recurring verification formula — "**Verified:
sabotages watched to fail**" (ADR-324, all three parts; the readiness suite "passed all 11
tests" against a no-op probe **which showed the suite could not tell a real probe from a fake
one**, and was then fixed to bite); the full-body regime built for ADR-334-onwards where each
behaviour layer was verified by removing a guard and watching a named test go red; and
"found by testing, not reading" (a first version of the pause-switch void was placed in the wrong
one of two writers — two tests caught it). The method is cheap: before trusting a suite, delete
the guard, watch it fail, restore.

**Proposal (new clause for §2).** *"A suite is not done when it passes; it is done when its
author has — for each behaviour it claims — removed the behaviour and watched the suite name it.
If no test fails, the behaviour was never tested, however green the run. Deletion, not
suppression, is the sabotage of choice (P2's method, applied to tests)."*

**Assessment.** Value: the single highest-value proposal in this file; the readiness no-op and
the two tests-that-couldn't-fail in ADR-324 part 3 were both green on their first run. Cost:
minutes per suite, once, at authoring time. Risk: none — it is pure method, no infrastructure.
**Verdict: adopt.**

## P10 — Narrated actor-trace suites and size loops for the flagship journey

**What GREENFIELD says today.** §2/§3 cover test realism and infrastructure; nothing says the
*output* of a journey suite should be readable.

**What the register taught.** ADR-326: one suite plays the demo day at **seven to twelve teams**
(parameterised over the real range, not one golden size), seeded from the same `demo-team-plan.json`
the generator reads ("a copy inside a test would drift from the day it claims to rehearse"), with
an `ActorTrace` that **prints on pass and fail** — "the day can be read, not only asserted" — and
a bug fell out of building it (the desk's close 404'd on dumb tournaments because `POST /close`
always ran against the captain's-ball slot; the suite became its regression at every size).
The dress-rehearsal spec (ADR-341/342 era) applied the same shape to the switch-day: real
Chromium, video on, actor by actor. ADR-290's full-event spec is the third instance: the whole
day, on a database of its own.

**Proposal (new clause for §2).** *"The one journey that *is* the product gets a suite that
(a) runs it at every size the field can land on, (b) seeds from the same source the demo
generator reads, and (c) narrates — every actor's action in order, printed on pass and fail.
A journey whose trace can't be read can't be reviewed; a suite that runs one size has rehearsed
one day."*

**Assessment.** Value: high for an event-day app (the close-bug is the proof); medium as generic
template text. Cost: the trace helper is small; the suites are the real cost, and they substitute
for manual rehearsal rather than adding to it. Risk: over-applying narration to every suite —
it belongs to the flagship journey only. **Verdict: adapt** (worth including as an optional
clause keyed to "if the product is a day/journey").

## P11 — Recorded demo seed; three data tiers; provisioning as a critical section

**What GREENFIELD says today.** §9 covers one-command env and reproducibility; it does not say
where demo data comes from or how a boot may race another boot.

**What the register taught.** ADR-040: demo data that was *typed in* cannot drift-check the
pipeline; demo data that was **recorded** — eighty real onboardings through the real screens,
dumped through the HTTP API ("only reachable state is captured"), replayed verbatim by the seeder
— is a standing end-to-end proof that rides along with every demo. ADR-102: three SQL tiers —
schema, default seed, demo seed — each one file. ADR-249–255: provisioning is a **critical
section across instances** (one Postgres advisory lock, taken by the boot, the script and
`DB_INIT`); a lock holder with no heartbeat is dead and a waiting boot ends it; a role that can
create but does not own the tables **verifies** the schema instead of altering it; a failed boot
says where it stopped, why, and what to check.

**Proposal (extends §9).** *"Demo data is recorded through the real screens and the real API,
never invented in a seed script; the recording is re-made whenever the screens change. Data lives
in tiers — schema, default seed, demo seed — one file each. Provisioning takes a lock, and a boot
that cannot take it reports who holds it and why it waits."*

**Assessment.** Value: high — the recorded seed caught pipeline drift that no unit test could.
Cost: a recording pass per breaking change (~3 min in this repo). Risk: recordings go stale
silently; the clause's re-record trigger is the mitigation. **Verdict: adapt** (recording clause
is general; the advisory-lock detail belongs in P7's standard).

## P12 — Register machinery: supersession index, identifiers-that-moved, amendments

**What GREENFIELD says today.** §1 prescribes addenda: append-only, dated, one decision per
entry. It stops there.

**What the register taught.** An append-only register develops three predictable diseases, and the
register built the cure for each — all recorded as rules that live at the top of the file:
(1) **supersession**: an entry is never edited to keep up with the code; a supersession table
records what no longer holds and which decision is live — "the old ADR was right on its date"
(ADR-139's own framing); (2) **identifiers that moved**: a name an ADR hand-named gets renamed
later, and a reader who greps it finds nothing — "a name that moved is a dangling pointer," so a
row is appended **in the same change that renames it**; (3) **amendments**: when the title of an
entry claims a universal the code deliberately does not meet, the correction is a new dated
amendment, not an edit (ADR-094 amendment) — and the amendment itself is honest about the defect
that prompted it. Plus the "correctly historical" list — names that are *supposed* to be gone, so
nobody re-files them as missing.

**Proposal (extends §1).** *"The register is append-only in its entries and living in its index:
a supersession table (what no longer holds, which decision is live), a moved-identifiers table
(append a row in the same change that renames something an entry named), amendments rather than
edits when an entry's claim overstates the code, and a correctly-historical list of names that
are gone on purpose."*

**Assessment.** Value: high — without this machinery a 342-entry register is unnavigable; with
it, the top of one file answers "is this still true, and where did that name go?" Cost: one row
at decision time; ADR-139's rule is the whole discipline. Risk: tables maintained from memory
rather than "in the same change" rot — hence the same-change rule. **Verdict: adopt.**

## P13 — Evidence honesty in prose: claim only what was run

**What GREENFIELD says today.** §8's "validate early and honestly" is about *input* validation
(schemas, error envelopes). The word "honestly" is doing less work than the register made it.

**What the register taught.** ADR-170 ends with an **Honesty** section: "**None of this has been
executed.** No browser binary exists in the environment that wrote it" — followed by exactly what
the evidence *was* (`--list` collection counts, typecheck, a deliberate bad env var). ADR-326
states which verification layers the sandbox could not finish "stated plainly rather than
implied." The ADR-094 amendment corrects a title that claimed a universal the code deliberately
does not meet. The pattern: a document that says what was **run**, what was **not**, and what the
unrun thing's evidence is instead — every time.

**Proposal (extends §8).** *"Every verification claim names what was executed and what was not.
'Verified' means watched to fail and pass (P9); 'checked' means a cheaper proxy (typecheck,
collection) — and the proxy is named. A title that claims a universal the code deliberately does
not meet is corrected by amendment, not left for a reader to discover."*

**Assessment.** Value: high — this is the clause that keeps all the others honest. Cost: a
sentence of discipline per document. Risk: none. **Verdict: adopt.**

## P14 — API state discipline: two events are two events; a write answers for itself; the log, not inference

**What GREENFIELD says today.** §6's conventions are structural (casing, testids, contracts);
nothing about event and state modelling discipline.

**What the register taught.** Three rules recur, each first written as a fix:
1. **"A new photograph arrived" and "the same photograph, re-rendered" are different events**
   (ADR-079) — surfaces that must react differently (a new unread marker vs a quiet refresh)
   cannot share an event.
2. **A write answers for the write it made.** The switch-era rule: completing a match triggers
   follow-on state changes, and the route's answer must still speak for the completion — it may
   not 404 because a *view* the response happens to read was computed from a different day-state
   (ADR-342's completion-answer rule). Corollary: ADR-167 — "a sign-out the server did not
   confirm has not happened"; navigation commits with the state change (ADR-287).
3. **Read from the log, not from inference.** "Which day was this award paid under?" is answered
   by the mode-change **record**, never by "the last closed bracket" — an inference that breaks
   the first time a second closed day exists (ADR-336 §7, ADR-341's predecessor rule). In the
   same family: an append-only register needs an index because "a name that moved is a dangling
   pointer" (ADR-139), and a staged scan-number collision "asks the database what is free, not
   arithmetic" (ADR-244).

**Proposal (new clause for §6).** *"Events that surfaces treat differently are different events.
A route that both writes and triggers follow-on state answers for the write it made — its
response may not fail because of what the follow-on changed. A question about *which* of several
past states produced a row is answered by an explicit record of the transition, never by inferring
from current state; and the inverse of a claim is 'unconfirmed', not 'done' (a sign-out the server
did not confirm has not happened)."*

**Assessment.** Value: high — each rule exists because its absence shipped a real defect.
Cost: none at write time; expensive to retrofit. Risk: none. **Verdict: adopt.**

## P15 — A second consumer early

**What the register taught.** ADR-298: "the four gaps a second venue exposed in the first (scene
scripts, role typing, first paint, scene box)." The second venue (ADR-299) was added as a peer,
not a variant, and four abstractions that had silently hard-coded one venue's assumptions broke —
each fixed by the generalisation the first venue had never needed to make. The general lesson:
an abstraction with one consumer is untested at being an abstraction.

**Assessment.** Value: real but situational — most greenfield projects do not have a second
venue, and manufacturing one (a second "theme") can be waste. Cost: high. **Verdict: defer** —
not template material, but worth a line in the owner's head: *when a second consumer arrives,
expect the first consumer's assumptions to surface as defects, and budget a round for them.*

## P16 — The e2e engine story: how Chromium was gotten working in a locked-down sandbox

**Why this section exists.** GREENFIELD §3 assumes `npx playwright install` works. Several
register entries were written in environments where it cannot (no browser CDN; ADR-170's closing
honesty: "no browser binary exists in the environment that wrote it"). The dress-rehearsal era
(ADR-341/342) finally got a real Chromium running in such a sandbox; this is the recipe and what
it caught, so the next project does not rediscover it.

### The recipe (what worked, in order)

1. **Do not apt-install the distro Chromium and expect it to run.** The sandbox's
   `apt install chromium` binary was present but could not launch: it dies on missing NSS/NSPR
   libraries (`libnss3.so` / `libnspr4.so` and their `nss/` module directory), which the
   minimal container image does not carry and apt could not complete.
2. **The npm tarball is the source of a self-contained binary.** `@sparticuz/chromium` (a
   serverless-oriented Chromium distribution) unpacks a Chromium binary plus its own library
   tree; no browser CDN is involved, and registry.npmjs.org was reachable where the Playwright
   CDN was not. The binary was extracted to `/tmp/chromium`.
3. **Its bundled NSS was incomplete for this image; build NSPR + NSS from source.** NSS was
   built from the upstream source tarball with the `gyp-next` + `ninja` build tools, installed
   **via PyPI** (`pip install gyp-next ninja` — both reachable where apt was not), producing the
   `libnss3.so`/`libnspr4.so` pair and the `nss/` modules directory. Pointing `LD_LIBRARY_PATH`
   at that build is what finally made the binary launch.
4. **Drive it with `playwright-core`, not `@playwright/test`'s bundled browser.** The repo's
   `playwright.config.ts` already had the hook: `PSD_E2E_CHROMIUM` names any Chromium executable,
   and the launch options add `--no-sandbox --disable-gpu --disable-dev-shm-usage` when it is
   set. With `LD_LIBRARY_PATH` exported and `PSD_E2E_CHROMIUM=/tmp/chromium`, the whole existing
   suite ran unmodified against the real browser — 11/11 on the dress rehearsal, video on.
5. **Keep the hook, not the binary.** The binary and the NSS build lived in `/tmp` and are gone
   with the sandbox; what persists is the config hook (already in `playwright.config.ts`), this
   section, and the suite that only passed its first real run because of it.

### What the first real-browser run caught (that green runs had not)

- **A locator that matched the wrong row.** `deskRow` filtered with `hasText: 'KO1-1'`, which
  the KO2-1 row also contains ("**Winner of KO1-1**"). Text containment without an anchor is a
  test that passes against the wrong element; the fix anchors the code at the row's start. A
  real browser with video made the wrong-row click visible; a head-logic jsdom test had no
  opinion.
- **The wrong assertion target for refusals.** An award refused in dumb mode renders its reason
  in the `dumb-court__outcome` element, not `__error` — asserting on `__error` produced a
  passing test of the absence of a thing that was never there. (Bite-check discipline, P9,
  applied to locators.)
- **The general shape:** the browser catches *placement and visibility* defects that no amount
  of green unit output can — which is §3's argument for video-on, now with receipts from an
  environment that supposedly could not run a browser at all.

**Proposal (extends §3).** *"The browser suite must degrade loudly, not silently, where the
Playwright CDN is unreachable: an env knob (`PSD_E2E_CHROMIUM`-style) names an external
executable, the launch flags for a constrained container are part of the config, and the recipe
(npm-distributed Chromium + source-built NSS via `gyp-next`/`ninja` from PyPI + `LD_LIBRARY_PATH`
+ playwright-core) is written down where the next sandbox can find it."*

**Assessment.** Value: proven — the dress rehearsal and the size-loop verifications exist because
of it. Cost: already paid; the hook is ~10 lines of config. Risk: none. **Verdict: adopt.**

---

## What was deliberately *not* proposed

Recorded so nobody re-files them as gaps (the register's own correctly-historical discipline):

- **Art pipeline rules** (sprite formats, palettes, themes, scene composition — ADR-008 through
  ADR-037, ADR-193–236, ADR-294–309): app-specific art direction, not template material.
- **Venue theming** (ADR-294–301): see P15.
- **The tournament engine's architecture** (ADR-270–329): a domain design, however instructive;
  its *methods* (P9, P10, P14) are the transferable part and are proposed above.
- **Specific UX copy rules** (ADR-090 toast voice, ADR-318 fold placement, ADR-319/322 field
  help): the general state-discipline rules behind them (ADR-085 completed-input, ADR-099
  loading-is-a-third-state, ADR-105 type-anywhere, ADR-076 pressed-looks-pressed) were folded
  into P14's family rather than listed individually — a template that lists every interaction
  rule becomes a style guide, and stops being read.
