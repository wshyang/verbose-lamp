# GREENFIELD.md — CLAUDE.md template for new projects

This file is a **standing-instructions template** meant to be copied to a new
repository's `CLAUDE.md` (and split into focused section files as the project
grows). It distills the conventions, disciplines, and tooling choices that —
if laid out up front — avoid the avoidable pain we hit when they were learned
the hard way mid-project. It is **deliberately project-agnostic**: no product
name, no feature references, no hardcoded service names. Adjust the concrete
stack placeholders (language, framework, ORM, test runner) to the actual
project.

---

## 0. How to use this template

- Copy the whole file as `CLAUDE.md`, then **replace every `<placeholder>`**
  with the real stack.
- As the project grows past a few hundred lines, split each `##` section into
  its own file (`CLAUDE-testing.md`, `CLAUDE-database.md`, …) with a
  top-level `CLAUDE.md` index, so agents `grep` a focused section instead of
  loading the whole corpus. A top-level index + sectioned files is a
  *documentation architecture*, decided on day one — retrofitting it later is
  churn you don't need.
- Keep the "record every decision" and "write tests first" rules in the very
  first sections: they are the two that prevent the most rework.

---

## 1. Record every decision, up front, in a living spec (addendum discipline)

**When you start, decide what the "source of truth" is and where decisions
get written.** The single biggest avoidable cost in a long-lived project is a
spec that silently drifts from the implemented system, forcing future readers
to reverse-engineer intent from commits and chat.

- Maintain a **living functional/design specification** (the product contract)
  plus a **sequentially-numbered addenda register** for every decision that
  isn't dictated by that base spec: filling a gap, adding a new
  object/field/tool, or deviating from the spec.
- Write up each addendum **proactively, in the same change that makes the
  decision** — never as a follow-up. Each covers: (1) what was decided,
  (2) why, (3) which spec section it relates to, (4) practical impact and what
  a future reader must know.
- Keep the addenda **independent of the base spec's own section numbering**, so
  the base spec stays stable and addenda append forever.
- `CLAUDE.md` must tell future agents to do this without being asked. It is the
  difference between a codebase you can reason about and a puzzle box.

### 1.1 The register is append-only: supersede, never edit

An addendum is a record of what was decided **on its date**, not a description of
the current system. The moment you start editing accepted entries to keep them
true, the register stops being evidence and becomes a second, worse copy of the
code.

- **Never edit an accepted entry's decision text.** Write a new one and mark the
  old `Superseded by <id>`. The old entry was right on its date; that is the
  whole value of it.
- **One decision per entry.** If the title needs an "and", it is two entries.
- **A rename is a register event.** Renaming or deleting something an earlier
  entry names by hand needs no new addendum, but it does need a row in a
  **supersession index** at the top of the register, appended in the same change.
  Without it, a future reader greps a name out of a decision and finds nothing —
  the register sends them somewhere that no longer exists. Keep two tables:
  *decisions superseded in part* (say which part) and *identifiers that moved*.
- **Cite the entry at the site of the surprise**, in a code comment
  (`// <id>: offline sync trusts the client's round reference`). A decision
  nobody can find from the code is a decision nobody will honour.

### 1.2 Never deviate silently

You will break your own rules occasionally — a spec gap, an external constraint, a
deadline. The rule is not "never deviate", it is **"never deviate silently"**, and
it has exactly three steps, all in the same change:

1. write the addendum, including the option you rejected and why;
2. reference it in a code comment where the deviation lives;
3. add the test that pins the behaviour you chose.

Step 3 is the one that gets skipped, and it is the one that makes the deviation
survivable: without it the next person "cleans up" the oddity and silently
reinstates the problem the deviation existed to avoid.

## 2. Write tests first, and keep them real (no mocks where it counts)

**Tests are the mechanism that actually catches bugs — decide the discipline
before any feature ships.** The pain avoided: shipping a wrong-field bug or an
authorization hole that a manual review missed, because "the happy path works."

- **Backend:** run automated integration tests against a **real database
  (a separate test DB, never the dev DB)** through the real app entrypoint
  (e.g. an app/router object that can be exercised without a listening
  socket) — **never mock the data-access layer**. A mocked-repository test
  hides exactly the class of bug you care about (bad SQL, wrong column names,
  FK violations, JSONB round-tripping).
- **Every route/endpoint needs BOTH a positive test AND a session-scoping
  negative test**: a real, valid, logged-in session that is the *wrong party*
  for THIS resource (IDOR-style id substitution) must be rejected. A generic
  "no token → 401" proves auth, not authorization scoping.
- **Add/update tests in the same change as the route** — never as a follow-up.
- Frontend unit tests may mock the API boundary; e2e tests drive the real UI
  against a real backend with **no mocks**.
- Adopt a security-test matrix (e.g. OWASP Top 10) for every endpoint, with an
  explicit applicability assessment per category — decide this on day one,
  not after an audit finds gaps.

### 2.1 What the assertion must look at

Writing the test is half the discipline. **A test that runs the broken code and
passes is worse than none, because it certifies the defect** — and that is the
normal outcome when the assertion aims at the wrong layer. Decide these before
the first feature, because the failure mode is invisible: the suite is green.

- **Assert the state that outlives the test, not the state on screen.** Read
  back through the API or the database what was actually persisted. A preview, a
  component's own state, or an unsaved draft can be right while the stored value
  is wrong — and the stored value is what the user gets back tomorrow. Any
  feature with a preview needs one test that ignores the preview entirely.
- **Exercise the path the user takes, not the path you built.** Where two routes
  reach one outcome — a dedicated confirm button and a general Save, a shortcut
  and a menu — test the one a person reaches first. A spec that walks only the
  author's intended flow documents the implementation instead of interrogating
  it.
- **When a behaviour exists to be seen, assert the computed presentation.** An
  accessibility attribute, a class name or a test id can be perfectly correct
  while the pixels never change. A DOM-only test environment resolves no
  stylesheet, so this class of defect is *structurally* invisible below the
  real-browser layer. Decide which layer owns visual affordances on day one.
- **Tests-first applies to the end-to-end layer too, and that is where it
  slips.** An e2e spec written after the implementation gets shaped around what
  was built. Write it from the bug report or the requirement, **watch it fail for
  the right reason**, then fix. A spec you cannot make fail is not testing what
  you think it is.
- **Coverage percentage cannot see any of this.** Code a passing test executed
  is "covered" regardless of what was asserted, so the number rises while these
  defects ship. Per feature, ask not "which lines ran" but **"what does the user
  end up holding, and does a test read that back?"** Treat a demand for a
  coverage target as a request for that question to be answered, not merely for
  instrumentation.
- **A fixture that no longer resembles production data is a test that cannot
  fail.** This is the one that recurs, so decide it early: build fixtures from
  the wire type rather than from memory of it, and prefer a shared fixture that
  a contract change breaks loudly over a literal in each file. Two mechanisms
  hide a wrong fixture and both need closing — a test runner that transpiles
  without typechecking will pass over a file the compiler rejects, and a missing
  field usually renders *empty* rather than throwing, so the assertion has to
  name the value it expects. Whatever your full gate is (typecheck, lint,
  static checks, tests), run it as one command: running the parts individually
  is how the missing part goes unnoticed for weeks.

### 2.2 Sabotage every test and watch it fail — the bite check

**A test you have never seen fail is a hypothesis, not a test.** §2.1 is about
aiming the assertion at the right thing; this is about proving you did. It is the
single highest-yield discipline in this document and the cheapest to adopt: decide
it on day one, because retrofitting it means auditing every test you already
trust.

**The rule.** When a test goes green, break the code it exists to protect and
watch the test go red. One sabotage per promise, applied one at a time, reverted
immediately. If the suite stays green, you have learnt something far more useful
than a passing run: that behaviour is not actually covered, whatever the coverage
report says.

**Write down what you broke.** Every consequential change's addendum ends with a
line like *"Four sabotages were watched to fail: paying the losing roster, reading
the live config instead of the snapshot, dropping the operator's reason on the
wire, and ignoring the voided flag in the slot lookup."* That sentence is the
evidence the tests are load-bearing, it survives into the register, and writing it
forces you to name the promises — which is where you discover the one you cannot
break because no test holds it.

**Scale it up periodically: sweep a whole surface.** Pick an area (a module tree,
a transport, everything one kind of user touches), write 20–30 mutations that each
break one promise, run the suite against each, and record which survive. **The
survivors are the deliverable.** Two such sweeps in this project found a
transport layer at 11 caught out of 20 and a UI layer at 26 of 28 — and the
survivors were never the obvious code. They were the mount/staleness guard whose
absence is invisible on screen but leaks one user's data into another user's
cache, and the re-render shortcut whose only symptom is cost.

**The harness lessons, all paid for.** A sweep that lies to you is worse than no
sweep, because it issues a clean bill of health:

- **A mutation that does not compile reads as a survivor.** The runner reports a
  failed *file* and zero failed *tests*, so a classifier keyed on "how many tests
  failed" scores it as "nothing noticed". Treat a failed file with no failed tests
  as **invalid**, not as a survivor, and re-write the mutation. Related: mutate a
  single-line `if (…) a; else b;` as a unit, or you orphan the `else` and get
  exactly this false reading.
- **One run is not a verdict.** Deleting a lifecycle guard produces unrelated
  noise that can flake a neighbouring test, so the same mutation can come back
  "caught" once and "survived" the next time. Confirm a lone failure by re-running
  the owning suite in isolation several times before believing it.
- **A mutation that only degrades performance survives a behaviour suite by
  default.** Promises about cost, referential stability or "we do not re-render
  here" are invisible to a suite that asserts what the screen says. Pin them with
  an identity assertion across successive updates, not by counting renders — and
  beware that batching can make the counting version pass against both the intact
  and the sabotaged code.
- **Check the test's own budget before trusting a wait.** A five-second wait
  inside a test whose default timeout is also five seconds can never be spent; the
  test dies of its own ceiling while the wait is still waiting. This defect was
  "fixed" twice by raising the wait before anyone looked at the enclosing number.
- **Sabotage each half of a compound guard separately.** `if (!mounted ||
  key !== current) return;` deserves two mutations, not one: a test that catches
  the whole guard's removal routinely misses the removal of one clause.
- **Restore the source and verify it.** Diff against a backup and assert the
  restore, every time. A sweep that leaves a mutation behind has just committed a
  bug with a green suite over it.

**What this buys that nothing else does.** Coverage says a line ran. A bite check
says that if the line were wrong, somebody would be told. Those are different
claims, and only the second one is why you write tests.

### 2.3 Make the suite enforce its own rules

A convention nothing checks decays, and **a threshold nothing runs is a comment.**
Both were discovered the same way here: declared standards of "100 % coverage" and
"every route is in the authorization matrix" turned out to be true of neither the
config nor the code, because nothing evaluated them. Decide the enforcement
mechanism at the same time as the rule.

- **Write a repo-specific standards checker** for the invariants a general linter
  cannot express — layering rules ("no API import below this directory"), naming
  conventions, "every table the ORM maps exists in the schema snapshot", "no
  user-facing string is inlined outside the messages module". A few dozen lines of
  script per rule, run as part of the one gate command. Rules are cited by number
  from the register, so **append, never insert**.
- **Let matrices assert their own completeness.** Where a rule must hold for every
  member of a set the program can enumerate — every route, every event type, every
  role — do not hand-maintain a list in a test. Have the test enumerate the real
  set and fail when a member has no row. Adding a route without its negative test
  should break the build by construction, not by review.
- **Treat coverage as a ratchet, not a target.** Set the thresholds to today's
  *measured* numbers, allow them to rise only in the change that earns the rise,
  and require a written decision to lower one. Setting them to an aspirational 100
  means either nothing runs them or the build is red for weeks over a gap nobody
  in the room created. And remember what §2.2 says: these mechanisms police
  structure, never the quality of an assertion.

## 3. Test infrastructure defaults (video, isolation, determinism)

- **Record Playwright video by default**, with a single documented env-var
  off-switch. Retroactively discovering a whole e2e suite was "blind on
  failure" because video was off is avoidable.
- **Isolate environments hard**: a separate test DB, unique-per-run test
  identifiers (e.g. `{label}.{runId}@example.test`), and self-contained
  provisioning so suites are repeatable and runnable in parallel.
- Use **realistic, deterministic fixture data** (named people, not `user-123`),
  with pools that reflect the domain (e.g. different name pools per actor
  role/affiliation) so test output reads naturally while remaining unique.
- Decide the **test layout by type** on day one (`backend/`, `frontend/unit`,
  `frontend/e2e`, `fixtures/`) and keep it consistent.

### 3.1 A stand-in that always answers proves nothing

Every stub is a claim about the world, and an unexamined one quietly becomes the
thing under test.

- **Pin the absence as well as the presence.** For any capability the environment
  may or may not provide — a camera, a GPU, a server-push API, a face detector —
  the suite needs a case where it is *missing*, forced to `undefined` rather than
  assumed. Note that installing nothing is often the honest "this browser does not
  have it" case, and that a property present but set to `undefined` still answers
  `true` to an `in` check.
- **When two capabilities are stubbed, every test must state both.** A test that
  means *"nothing can find the face"* while leaving the second model unstubbed
  silently becomes a test of something else — and on a machine with internet it
  really fetched the model and really succeeded.
- **A stub that always answers cannot tell you whether the answer is any good.**
  The cautionary case here: a test asserted that one model did another model's
  job, passed across eighty inputs, and was *defending* the defect. Keep a
  flagged run against the genuine dependency and look at the output with your own
  eyes; a green stubbed suite is a statement about plumbing, not quality.
- **Stubbing the general transport is not stubbing the specific one.** Swapping
  the global fetch leaves a push/stream API untouched, so a test believing it
  exercises the live path quietly exercises the polling fallback instead.

### 3.2 Flake forensics: a flaky test is an unread defect report

Decide now that you will not "fix" flakes by retrying them. Every intermittent
failure in this project turned out to be either a real race or a test that was
lying, and each was cheap once somebody looked.

- **A wait that times out on a *stable* wrong value is not a slow test.** It is a
  delivery that never happens. Look for the thing that settles once, up front, and
  therefore misses the work started asynchronously afterwards — not for a bigger
  timeout.
- **Check the enclosing budget before raising an inner one** (§2.2). Raising a
  wait that could never be spent is the most popular non-fix there is.
- **A quiet N-run loop is not proof.** A sixteen-run instrumented loop here missed
  a flake that a six-run loop had already hit; instrumentation changes timing.
  Prefer reproducing under the real, loaded conditions — the full suite — over a
  clean isolated loop.
- **Isolate before you believe a verdict.** A single failing test inside a large
  parallel run may be collateral noise from somewhere else entirely.
- **Reset shared module state against a QUIET tree.** If a cleanup hook clears a
  module-level cache while the previous test's components are still mounted, their
  in-flight work lands in the cache *after* it was emptied and the next test
  inherits a poisoned entry. Unmount first, then clear.
- **An intermittent test is sometimes reporting a real fault.** One here looked
  exactly like slowness — a wait expiring on a value that never moved — and was
  "fixed" twice by raising the timeout before anyone asked why the value never
  moved. The cause was a shared cache holding a promise that could never settle;
  in production one hung image would have frozen a whole screen for the rest of
  the day. Chase a flake to a mechanism before quarantining it: the test may be
  the only thing that noticed.
- **When an assertion can fail for several correct reasons, assert the
  preconditions too.** A test whose final check is "the box has focus" reports
  only "it does not" — the one thing already known. If the behaviour under test
  legitimately declines in two cases (the control was disabled; a modal was up),
  name both as their own assertions just above. A flake that strikes once in
  twenty runs may not be reproducible on demand, and then the single thing that
  decides whether it costs an hour or a day is whether its failure named a cause.
  This is not weakening the test: the assertion that matters is unchanged.

### 3.3 Short timeouts, frequent polling

**A generous timeout does not make a run safer; it converts a fast failure into a
long stall.** An oversized timeout is also, usually, concealing something worth
fixing.

- Set the limit close to the **measured** cost of the work, not to the worst case
  you can imagine. If the real cost is unknown, measure one iteration and set it
  from that number.
- Poll frequently and print progress — every 15–30 s, reporting *work done* (rows
  written, files produced), not merely "still running".
- **Kill and fix rather than wait it out.** Waiting for a known-bad run to finish
  is the most expensive way to learn nothing.
- Two incidents behind this rule: a 300-second per-test ceiling where each action
  had been measured at ~2 s turned a wrong password into a five-minute stall; and
  a 180-second-per-item allowance that was not a measurement but cover for a
  defect — the loop re-initialised an expensive model once per item instead of
  once. Fixing the cause made the ceiling unnecessary. In both, the number was
  hiding the bug.

## 4. Database / ORM discipline (the two-source-of-truth trap)

**The single costliest architectural smell in this project was carrying the
same field in two spellings** (snake_case at the DB, camelCase in TypeScript)
and building hand-written mappers to translate between them. Lay out the
policy up front:

- **One casing, one mapper, by the ORM — never hand-written mappers.** If you
  use an ORM with a property→column mapping (e.g. Drizzle), the ORM is the
  *only* translation you write. Pick one casing for the TypeScript domain
  (camelCase) and let the ORM map to snake_case DB columns. **Do not add a
  second, redundant mapper layer** — it is a two-sources-of-truth trap that
  every field must keep in agreement by hand.
- **Every new table/data-access object uses the ORM** — no hand-written raw
  SQL for CRUD. Keep the schema definitions, the data-access layer, and the
  typed domain objects in sync in the same change.
- **Soft deletion, not hard `DELETE`.** Give every relationship/entity that
  can be "removed" a nullable `expires_at`/`deleted_at` from day one, a
  partial unique index (`WHERE expires_at IS NULL`), an `invalidate` (not
  `delete`) repo method, and active-row filtering on every read and every
  authorization check. Retroactively adding soft-delete + re-checking every
  "is it still active" gate is high-effort and bug-prone.
- **Timestamp-ordered IDs** (e.g. UUIDv7, not v4) for index locality on
  high-insert tables — decide the ID scheme on day one and mint IDs in exactly
  one place.
- **System/non-human actors are real rows**, never sentinel string constants —
  so every `actor_id` is a genuine FK. Decide this before any `'system'`/`'unknown'`
  literal leaks in.
- **Foreign-key validity at write time must consider soft-deleted rows**: a
  column that references another row must reject both nonexistent AND
  invalidated targets — a DB FK only proves the row once existed.
- **Snapshot referenced values at write time; never lazy-join history.** A record
  that documents something that *happened* — a transaction, a score, a completed
  job — must freeze the values it depended on (the name, the rate, the operator,
  the round) into its own columns. Joining them live means a later edit to a
  configuration row silently rewrites the past. Decide the convention once, name
  it in the spec, and list the snapshot fields per record type: retrofitting it
  requires inventing history you no longer have.
- **Client-submitted writes carry an idempotency key.** Any write a phone can
  retry — offline queue, flaky network, double tap — takes a client-generated id,
  has a unique index on it, and on conflict returns **the existing row** rather
  than an error or a duplicate. Decide the conflict rule explicitly too
  (first-write-wins is usually right for a field device) and write it down, because
  it is the kind of thing two engineers will each assume differently.
- **Destructive operator actions are reversible and audited, not deletions.** A
  "void"/"cancel"/"reverse" action sets a flag, is undoable, and writes an audit
  row carrying *actor, reason and timestamp* on every transition — including the
  reversal. Everything that computes totals filters the flag. This is far cheaper
  to design in than to add once there are real rows and real disputes.

## 5. Schema evolution (migrations + wholesale snapshot, same change)

- **Two always-in-sync halves, landed in the same commit:**
  (1) a wholesale, self-contained schema/seed snapshot that a brand-new DB
  applies from zero (every `CREATE TABLE` lists every current column — never
  `ALTER`s that turn it into "current shape + a changelog of patches");
  (2) a sequentially-numbered migration file (zero-padded, idempotent,
  `BEGIN`/`COMMIT`, records itself in a `schema_migrations` table) that an
  already-provisioned DB applies to catch up.
- **Every schema change = snapshot update + migration file, in the same commit.**
  Skipping either half causes the exact drift this discipline eliminates.
- Apply pending migrations automatically on app boot, and provide a standalone
  migration command.

## 6. Code conventions that prevent whole classes of bugs

- **`data-testid` on every interactive element** at authoring time, with a
  documented naming convention (`{component-kebab}__{element-role}`). Repeated
  rows share one testid; scope by anchor text first. This makes testids a
  stable contract the unit and e2e suites rely on — gaps defeat the point.
- **Stable, typed wire contracts** between backend and frontend — define the
  response shapes once and type both sides from them, so a field rename is a
  compile error, not a runtime `undefined` that silently breaks a test or a
  page. (We hit a demo-video outage purely from a wire-field rename that the
  test helper still read under the old name.)
- **Don't show internal design decisions to end users.** Keep rationale and
  "why this is done this way" notes in code comments and docs, never in
  user-facing labels or descriptions. Scrub internal slugs / design references
  from shipped copy.
- **Keep user-facing copy user-facing, internals internal** — and keep third-
  party/external contract keys exactly as the external system requires,
  even when they don't match your internal casing. Not everything is yours to
  rename (external payload keys, notification-template placeholders).
- **Normative copy lives in exactly one module, imported by both sides.** Error
  strings, empty-state text and validation bounds that the spec states are part
  of the contract, not decoration. Put them in the shared contracts package next
  to the wire types; **a message inlined in a component or a route is a defect**,
  and a cheap standards rule can say so. Otherwise the spec says one thing, two
  screens say two others, and the test asserts whichever it was written against.
- **A generated file is edited at its generator.** Anything produced by a script —
  sprite sheets, derived constants, API clients — needs a header saying so and a
  named command to regenerate it. Someone will otherwise hand-edit the output,
  and the next regeneration will silently revert them. The same applies in
  reverse: never commit the output of a tool nobody can re-run.

## 7. Function design and module structure (decide on day one)

Establish these rules before the first line of application code ships; retrofitting
them into an existing codebase is expensive.

### Function size and extraction
- **≤ 20 lines** target per function body; **50 lines hard limit**.
- If you need a comment to explain a block, extract the block as a named function.
- A function does one thing at one level of abstraction — no orchestration code
  mixed with implementation detail inside the same function.

### Guard clauses over nesting
- Exit early with guard clauses at the top; never nest `if/if` for the happy path.
- Maximum nesting depth: **3 levels**. Beyond 3, extract to a function.

### Parameter discipline
- **≤ 3 parameters**. Beyond 3, introduce a Parameter Object (typed interface).
- No boolean/flag parameters — split into two named functions.
- Preserve Whole Object: pass the domain object, not extracted fields.

### Naming
- Names reveal intent. Rename liberally as understanding evolves.
- Booleans: `is`, `has`, `should`, `can` prefix.
- Functions: verb + noun (`getUser`, `validateEmail`).
- No abbreviations in domain code.

### Encapsulation and mutation
- **Never mutate in place** — always produce a new object (`{ ...old, field: value }`).
- Separate Query from Modifier: a function either returns a value OR has a side
  effect, never both.
- Encapsulate Variable: mutable state lives behind a function boundary, not exposed
  as raw mutable fields.

### Frontend: a component renders, a hook decides

Decide this before the first component ships — retrofitting it across a
codebase costs weeks (we spent 22 extractions getting there).

- **Split along the server boundary, not the "looks like state" boundary.**
  The component owns layout/JSX, view-only state, event *wiring*, and DOM-only
  side effects. The hook owns anything calling the API layer, any computation
  over server data, any validation, and any fetching effect.
- **The hook returns a plain object; the component destructures it.** No JSX in
  the hook, and no API import in the component — that import is the checkable
  signal: `grep -c "lib/api" <Component>.tsx` must be `0`.
- **Hooks live beside their tests** (`lib/hooks/use<Feature>.ts` +
  `use<Feature>.test.ts` using `renderHook`) and must not import from
  `components/`.
- **Move bodies, don't rewrite them.** A separation refactor has to be
  verifiable by diffing the extracted function against the original with
  whitespace normalised. Anything not byte-identical is a behaviour change
  wearing a refactor's clothes.

**And keep the JSX interior presentation-only.** This is the half that gets
missed, because a component can satisfy every rule above and still compute
domain rules per render — and most static gates never look inside the `return`.

- Between `return (` and its closing `)`: only markup, bindings already computed
  above the return, and wiring.
- No `.filter()` / `.reduce()` / `.sort()` / `.find()` / `.some()` / `.every()`
  in JSX. A bare `.map()` that renders a list is fine.
- **Compute a derivation once.** `{xs.filter(p).length === 0 ? <Empty/> :
  xs.filter(p).map(…)}` runs the predicate twice and reads as two rules that
  happen to agree.
- Inline handlers are wiring only — a setter, a navigation, a `.focus()`. The
  moment one needs a branch or a computation, name it above the return.
- No inline `new Date()` / `.toFixed()` / `JSON.parse` — use a formatter helper.

A derivation inside JSX cannot be unit-tested without rendering; computed twice
it can drift; and a cascade rule buried in an `onChange` is domain logic no test
can reach.

### Module and directory structure
- **Group by domain feature, not by type** (`routes-requests/`, `db/entities/`,
  not `controllers/`, `models/`, `services/`).
- Files ≤ 400 LOC typical; **800 LOC hard limit**. Files above 800 must be split
  before merge.
- When a file must be split, use the **barrel pattern**: extract per-domain files,
  replace the original with `export * from './sub/index.tsx'` — zero call-site churn.
- No circular dependencies between peer-domain files.
- One concern per file; file names are the contract.

### Code smell → remedy (quick reference)

| Smell | Remedy |
|---|---|
| Long Function (> 50 lines) | Extract Function |
| Deep Nesting (> 3 levels) | Guard Clauses |
| Long Parameter List (> 3) | Introduce Parameter Object |
| Boolean parameter | Remove Flag Argument |
| Feature Envy | Move Function |
| Message Chain | Hide Delegate |
| God Module (> 800 lines) | Per-domain split + barrel |
| Mutable Data | Encapsulate Variable, Separate Query from Modifier |
| Duplicated Code | Extract Function |
| Logic inside JSX (`filter`/`reduce` in the `return`) | Extract to a named binding above the return, or into the hook |
| Same derivation computed twice in one expression | Introduce Explaining Variable |
| Fat inline `onChange`/`onClick` carrying a branch or a computation | Extract Function (or move to the hook if it touches server data) |
| Speculative Generality | Remove (YAGNI) |

Source: Martin Fowler's *Refactoring* (2nd ed.) via
[5-minutes-or-less-refactoring](https://github.com/mikaelvesavuori/5-minutes-or-less-refactoring).
For full details, see `CLAUDE-function-design.md` in project repos that carry this template.

## 8. Validate early and honestly

- **Static checking layer is not a substitute for real tests.** When the real
  toolchain (compiler, test runner, DB) is unavailable in a sandbox, run
  per-file syntax checks, execute pure modules, and grep structural invariants —
  but **say exactly which layer you ran** and never claim "tests pass."
- The real gate, before merge, is always: full type-check, full lint, and the
  full test suites against a real DB/browser.
- Append the validation caveat to commits made under constrained tooling so a
  reviewer knows what still must run.

### 8.1 Measure the claim; do not assert it

Any statement of the form "this will scale", "this is fast enough" or "that
feature does not starve the rest" is a measurement waiting to be taken, and it is
cheap to take once and expensive to argue about forever.

- Write the load simulation or the micro-benchmark **as a committed script**, so
  the claim can be re-run when the cost model changes. Weight new work *into* the
  existing traffic mix rather than adding it on top, or you have measured a
  system nobody will ever run.
- **Report the tail, not only the median or p95.** Head-of-line blocking does not
  move a median; it puts one unlucky write behind a long queue, and the user
  experiences the request they are waiting on rather than a percentile.
- Make the measurement **cold** when the thing you are measuring has a cache, and
  say in the script's own comments what invalidates the result.

### 8.2 Close the class, not the instance

When a defect is found, the fix is not done when that call site is correct. Grep
for the same shape everywhere else, in the same change. A missing guard in one
room is nearly always missing in the three rooms built by copying it; a sweep
(§2.2) is the systematic version of the same instinct. Record in the addendum
*which* sites you checked, so the next person knows whether the class was closed
or just the instance.

A corollary worth stating because it keeps catching people: **an audit list can
contradict an earlier decision.** Before deleting anything an inventory calls
dead, grep the register and the cleanup notes for a standing ruling that it
stays. "Mechanically unreferenced" and "not wanted" are different findings.

## 9. Reproducible local dev + environment story

- Provide a one-command way to stand up the entire local environment
  (database, backend, frontend, and any test doubles) so a new contributor or
  agent can go from clone to running tests without tribal knowledge.
- Separate secrets from config: committed `.env.example`-style templates,
  uncommitted real `.env` files, and a distinct `.env.test` pointing at the
  test DB — never a shared DB between dev and test.
- Decide and document the toolchain choices up front (package manager, runtime,
  ORM, test runners, CI) and make them **consistent across backend, frontend,
  and tooling** — mixed/retrofit choices are where the friction lives.

### 9.1 Make the one command an executable, not a paragraph in the README

"One command stands up everything" is usually three commands and some tribal
knowledge: the runtime version, the `.env` nobody mentions, the install you only
need after a lockfile change, the port something else is already holding. Put
that preflight in a committed script (`./dev.sh` and friends) so the knowledge is
executable rather than remembered.

- Keep the script a **thin wrapper over the real commands**, and say so in its
  header: if the wrapper and the underlying command ever disagree, the underlying
  command is right and the wrapper is the bug. A wrapper that becomes a second
  source of truth is worse than no wrapper.
- Ship the obvious companions — stop, restart, status, logs, reset-the-database —
  and a **gate script** that runs the whole verification in one go and reports
  each stage. Running the quarters individually is how the missing quarter goes
  unnoticed for weeks.
- Have the start script **wait until the stack actually answers** and fail fast
  with the last lines of the log if it does not (§3.3). "It printed a URL" is not
  the same as "it is up".
- The reset script should be the place the dangerous path is written down once —
  the exact data directory, and why the obvious-looking neighbour is the wrong
  one.
- **Test these scripts by running them, including the unhappy paths.** Ours
  looked correct and were not: signalling the package-manager process did not
  reach its grandchild, so the servers re-parented to init and kept the ports;
  and the "who holds this port" helper depended on tools a slim container did not
  have, so it silently answered nothing. Both are the sort of bug that only
  appears the day someone else uses the script.

### 9.2 Write the first-hour checklist for a new host

Separate from "how to run it": an ordered list of what a person or agent does on
a machine that has never seen this repo, with the expensive and easily-skipped
steps called out — install the browsers, run the full gate once, run the suite
that needs network and real model weights, re-record any generated fixtures.
End it with the step no automation can do: **a few minutes on a real device**.
Camera permissions, pickers, and downloads over cellular are answered honestly by
nothing else.

### 9.3 Adopt a platform's CI/CD template as inert files, with a script that turns them on

Some projects inherit a pipeline rather than choosing one: a government or group platform
prescribes a file set — a root CI config that `include:`s their template plus project-local
build/test/deploy files — and layers mandatory security jobs on top. Worked example: SHIP-HATS
(GitLab on `sgts.gitlab-dedicated.com`), whose webapp E2E template wants `.gitlab-ci.yml` +
`BUILD.gitlab-ci.yml` + `TEST.gitlab-ci.yml` + `DEPLOY.gitlab-ci.yml` and a compliance framework
applied in project settings. Adopting such a platform cannot be finished in one sitting: the
templates are behind a login, the registry and the deploy hosts do not exist yet, and a live
config that is 60 % right is worse than none, because every red pipeline afterwards reads as the
project's fault. So write the files into the repo **with an inert marker in the name** (`.shiphats`
in that project; any suffix the tool ignores) and a committed script that fills them in and renames
them. The set is then reviewable, versioned and executable — and costs nothing until adopted.

- **Read the contract before choosing the tooling.** The mandated file names, the artefact the
  pipeline signs and publishes, the job names and stage names the compliance layer keys off, and
  where the platform puts secrets — those are constraints, not style. Quote the doc page that says
  each one, in a comment, at the top of the file. A reader must be able to tell *required* from
  *chosen*.
- **The artefact contract decides the packaging, and usually the build tool.** If the pipeline signs,
  scans, checksums and publishes one file, pick the one file that also deploys: for a container app
  that is the image tarball (Kaniko's `--no-push --tarPath` output), which is simultaneously the
  signed artefact and what `docker load` on the host runs. Do not invent a zip of a build directory
  just because a tutorial did.
- **Runner capability is an input, not a surprise.** No Docker-in-Docker and no privileged runner
  means no `docker build` anywhere: use the kaniko/buildah/crane/skopeo class and record which
  runner tag each needs. No general egress means every tool image must be prebuilt and mirrored — a
  job that `apk add`s or downloads browsers at run time is a bug, not a first-run wrinkle.
- **Pin the platform template to a version tag, never a branch**, and if the docs say a template set
  is no longer maintained, write that in the file too: pinning is what keeps an unmaintained template
  from moving under you.
- **Nothing secret goes in a file, including the inert copies.** The config references credentials by
  name; the values live in the platform's masked and protected CI variables. The activation script
  therefore has **no prompt for a secret** — it prints the list to create, plus the settings step
  (attach the compliance framework), plus the checks that catch the likely first-run failure.
- **Mark every claim you could not verify.** Where the `include:`d templates are unreadable from your
  environment, prefix each assumption `CONFIRM:` and name what will break if it is wrong. Then write
  the short design doc that separates what was **measured** from what was only **read from docs**: the
  person debugging the first red pipeline needs to know which of the two they are looking at.
- **CI runs the commands the local gate runs** — same script names, same checks — so a red pipeline
  and a red local run have one cause. When CI needs extra reporters (junit for the test tab, lcov or
  cobertura for the scanner), pass them as flags on the CI command line rather than forking the local
  config, weakening a coverage ratchet, or changing what a developer's `npm test` prints.
- **Put one cheap job at the front to check that switches and credentials agree.** "The flag is on
  but the token was never added" should fail in seconds with a sentence, not after a full build at
  deploy time. Read every optional variable as `${VAR:-}` so that check survives `set -u`, and never
  print a value it read.
- **Verify a generated pipeline by executing it, not by reading it.** Parse every file before and
  after substitution; assert no placeholder survived; extract every multi-line shell snippet from the
  *parsed* YAML and syntax-check it under each shell a runner may use (bash, dash, busybox ash). That
  pass is what catches the `set -u` trap and the heredoc terminator a YAML block scalar silently eats —
  cheap here, invisible in review, and a failed pipeline in the field.
- **Prompt for what only a human knows, and default from the repo.** Where the codebase already holds
  the answer (a port, a health path, a version, which build file is the production one), derive the
  default from that file instead of asking the operator to remember it. Validate each answer against
  the platform's own rules (an id that may not contain whitespace, a URL, a boolean, a path), accept a
  blank only where a blank leaves a job inert, and list every blank at the end so nothing is quietly
  missing. Ship `--defaults`, an answers-file mode, `--dry-run` and a `--revert`, and make the script
  refuse to overwrite an existing live config and refuse to write a file with an unanswered
  placeholder in it. Keep it dependency-free (one wrapper over `node`, no install) so it runs on a
  remote host with no network.
- **Make the set's consistency a machine-checked rule**, not a memory: the files come as a set, so a
  partial set is not a smaller pipeline but a broken one; every placeholder in the templates must have
  a prompt in the script's schema, and a live file must carry neither a placeholder nor a dropped
  include (§2.3). A rule that fails on `mv one-file-away` is the difference between a discipline and a
  paragraph.

## 10. What to decide before writing the first feature (checklist)

1. Source-of-truth spec location + addenda numbering.
2. Test DB isolation + "tests-first, real DB, no repo mocks" rule, **and which layer asserts what**
   (persisted state over screen state; computed presentation for visual affordances; e2e written
   before the fix) — §2.1.
3. ORM + one-casing policy (no hand-written mappers).
4. Soft-delete + UUIDv7 + real-actor-rows object model.
5. Schema snapshot + migration twin-file workflow.
6. `data-testid` convention + typed wire contracts.
7. Test layout by type + Playwright video-on default.
8. Realistic fixture-name pools + unique-per-run identifiers.
9. Static-check fallback discipline + validation caveat.
10. One-command local env setup + `.env`/.env.test separation.
11. Function design rules: ≤ 50-line functions, guard clauses, ≤ 3 params, no flag args,
    no mutation, Separate Query from Modifier, domain-based module grouping, 800-LOC
    file hard limit, barrel-split pattern for god modules.

Items 1–11 are cited by number elsewhere; **append below, never renumber.** The
rest were learned after the project was running, which is exactly why they belong
in a greenfield list:

12. **Bite checks are part of writing a test** — sabotage the code, watch the test
    fail, and record the sabotages in the addendum. Plus the sweep cadence, and a
    harness that can tell "nothing caught this" from "this did not compile" (§2.2).
13. **Enforcement for every rule**: a repo-specific standards script, matrices that
    assert their own completeness, and coverage as a ratchet that something
    actually runs (§2.3).
14. **Stub policy**: absence pinned as well as presence, every stubbed capability
    named by every test that depends on it, and a flagged run against the real
    dependency (§3.1).
15. **Flake policy and timeout policy**: no retries-as-fixes, timeouts set from
    measurements, progress polled rather than waited out (§3.2–3.3).
16. **Record-keeping conventions in the data model**: snapshot-at-write-time,
    idempotency keys on client-submitted writes, reversible+audited destructive
    actions (§4).
17. **One place for normative copy**, and a regeneration command for every
    generated file (§6).
18. **Executable environment scripts and a first-hour checklist** — tested by
    running them, unhappy paths included (§9.1–9.2).
19. **Platform CI/CD as an inert file set plus a script that activates it**:
    the artefact contract before the tooling, runner capability as an input,
    `CONFIRM:` on whatever you cannot read, secrets only as CI variables,
    generated files verified by parsing and `sh -n`, and a standards rule that
    keeps the set, its prompts and any live file in step (§9.3).

Answer these nineteen up front and a greenfield project avoids most of the rework,
silent drift, and "we should have written that down" moments this template
exists to prevent.
