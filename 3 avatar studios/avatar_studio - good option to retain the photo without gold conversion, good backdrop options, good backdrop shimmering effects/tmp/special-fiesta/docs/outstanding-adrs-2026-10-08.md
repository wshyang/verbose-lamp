# Outstanding ADRs — assessment, 2026-10-08

> **Status note (ADR-222).** This file is a snapshot of 2026-10-08. The register has moved on since: ADR-216 onward are recorded in `docs/addenda/ADDENDA.md`, and the next free number is the one after its last entry. The figures and the numbers in the body are as of the snapshot and are not updated.

**Branch:** `arena/1952d326-special-fiesta` at `5d4e7ec` (the head of PR #5, fast-forwarded from `main` at `4c5a3bd`).
**Register:** ADR-001 to ADR-215, no gaps. `094` and `113` are each used twice, as signed amendments. The next free number is **ADR-216**.

This document records findings. It does not edit the register, close or supersede any ADR, or change code. Each claim cites its source: an ADR number, a file and line, or a command in §6.

## 0. What "outstanding" means here

An ADR is listed when at least one of these holds:

- **A. A human or physical step is still needed** before the work is complete.
- **B. Built, but a check the ADR names has never run** here: browser e2e, a Docker build, or a real-database check.
- **C. Accepted or deferred scope** that the ADR itself records as not done.
- **D. A record that is stale or contradicted** by the code or by git.

ADRs that a later ADR closed are listed in §7 so that nobody re-opens them.

## 1. Headline

- **The repo gate passes at this commit.** `npm run verify` exits 0 (§6.1). It does not run Playwright, and the Postgres driver suite is skipped inside it. Neither has run on this branch.
- **Most open items are unrun verification, not missing code.** About twenty ADR bodies say a browser or environment check did not run. The PR body extends the same statement to ADR-177 to ADR-192. Together they cover ADR-085 and ADR-132 through ADR-215 (§3).
- **Three things are genuinely undecided or blocked on a person.** The C2 service-worker switch (ADR-147). The cut-out chooser's gate and step 3 (ADR-212, ADR-215). Whether the photoreal backdrop is adopted (ADR-193, ADR-200, ADR-201).
- **A problem no document recorded.** The Postgres driver suite (`apps/api/src/tests/postgres-driver.test.ts`) is skipped unless `PSD_TEST_DATABASE_URL` is set, so the default gate never runs it. When run against PostgreSQL 17.10 it fails 2 of 3 tests because four assumptions in the test are stale. The driver itself works (§6.3).
- **The register has drifted.** The supersession index has no rows after ADR-139, although ADR-139 requires one for every rename. ADR-213 and ADR-214 make a claim that git contradicts (§5).

## 2. ADRs with an open decision or a physical or external step (A)

| ADR | What is built | What remains | Needs |
|---|---|---|---|
| **ADR-147** C2, service worker | Built and shipped **off**. `service_state.is_station_offline_enabled` defaults to `false` (`apps/api/src/db/schema.sql:357`). | (1) Run `e2e/exclusive/service-worker.spec.ts` in a real browser. Its five journeys were written and never run (ADR-147). (2) Self-host the two Google fonts. `apps/web/index.html` lines 8 to 11 still load `fonts.googleapis.com`. (3) Rehearse the withdrawal by hand. `service-worker.spec.ts:144` is an empty `test.skip`. (4) Decide when to switch it on. | A machine with a browser, and the organiser's decision |
| **ADR-212, ADR-215** cut-out chooser | `chooseTuning` is built and tested, and it is wired to nothing. Its only callers are in `apps/web/tools/` and `apps/web/scripts/`. The report page `/cutout-report.html` exists. | The step-2 gate has never produced a number. Run it with `/cutout-report.html` in a browser with network access, or `e2e/participant/cutout-chooser.spec.ts` with `PSD_E2E_REAL_MODEL=1`, or the screening script (no browser, weaker). Apply the criteria written in advance (`docs/design/cutout-chooser-validation.md` §5 to §6). Record the numbers in `cutout-auto-tuning-assessment.md` §7. Step 3 is not started: using the result as the opening position. The chosen tuning is not in `@psd/contracts`, so it does not survive a save (PR #5 body). | Network access and a browser. The verdict decides step 3. |
| **ADR-193, ADR-200, ADR-201** photoreal backdrop | Built. Opt-in through `?backdrop=real` only (`apps/web/src/lib/scene/backdropChoice.ts:27,33`). The default is unchanged and there is no UI control, by design (ADR-200). | (1) Adoption is a judgement that ADR-193 reserves for a person looking at the result. (2) Frame B of the eight photoreal players is a bob of about 3 %, not a second pose (PR #5 body). (3) ADR-201 names three alignments still checked by eye: the Merlion against the waterline, and the umbrella and deck chair against the sand. (4) Payload: 35 PNG files and 1 JPG, about 16 MB, in `apps/web/public/scene-real/`. There are no WebP or responsive sizes, which ADR-193 calls a second piece of work. | A decision, and an art pass |
| **ADR-175** demo and production image | The build-context defect is fixed: the builder stage never copied `tsconfig.base.json`. | No image has been built. The `FROM`, `HEALTHCHECK`, `VOLUME` and supervisord layers are reviewed only (ADR-175, "What is not covered"). | A host with Docker |
| **ADR-178, ADR-180** boot without DDL rights | Boot works on a database whose role has no DDL rights. | ADR-180 lists what is not proved: which privileges are granted (SELECT alone versus full), column completeness (the check counts tables only), and sequences. Establishing these needs `--grant-to` against the real managed database. | The managed database |
| **ADR-140 to ADR-145, ADR-150** hall screen | Code complete. `outstanding-tasks.md` §4b says "the hall screen is done". | A physical rehearsal on projector hardware: throw, contrast at 10 m, six hours of burn-in. Not code. | A projector and a room |
| **ADR-177** programme | Agenda data and the participant Agenda segment are built (`apps/web/src/routes-participant/AgendaPage.tsx`). | The hall screen has no programme scene. This is gap G4 in `active-day-2026-feature-assessment.md` §0, rated low cost and optional, not ruled on. | A ruling |

Still open in the team's own docs, but not ADRs: G3 finalist bonus, G6 photo scavenger prompts and G7 incident alert are "candidates, not commitments" (`active-day-2026-feature-assessment.md` §0). D4 consolation friendlies is "KIV" (`decisions-outstanding.md`).

## 3. Built, but a check it names has never run (B)

**Sandbox limit, measured.** A Chromium binary can be fetched from npm, but it hangs on `--dump-dom` (`docs/design/service-worker-plan.md` §1.5). Nothing in Playwright has run on this branch. `npm run verify` does not include e2e (the `verify` script in `package.json`). AGENTS-workflow names the Playwright suite as part of the real gate before merge.

| ADR | Check that has not run (source) |
|---|---|
| ADR-085 | "E2E not run" (ADR body, older; it may have run elsewhere, which this sandbox cannot show) |
| ADR-132 | The board's live-update e2e, recorded as outstanding (ADR-132 body; `outstanding-tasks.md` §4 item 1) |
| ADR-146 | `e2e/participant/team-chat-typing.spec.ts`, 4 tests. Committed; listed as unexecuted (`outstanding-tasks.md:12`) |
| ADR-147 | `e2e/exclusive/service-worker.spec.ts`, 6 tests including one empty skip. "Written and unrun" (ADR-147 body) |
| ADR-167 | The browser check for sign-out. "Unrun" (ADR-167 body) |
| ADR-170 | "The two new specs have never run." Cross-talk between parallel specs is unmeasured (ADR-170 body) |
| ADR-172, ADR-173, ADR-176 | "Playwright was not run" (ADR bodies) |
| ADR-174 | `e2e/full-event/full-event.spec.ts`, 10 tests with its own config. "Cannot execute in this sandbox" (ADR-174 body) |
| ADR-175 | No Docker image built (ADR-175 body) |
| ADR-177, ADR-178, ADR-180, ADR-181, ADR-182, ADR-185 to ADR-191, ADR-192 | "Playwright not run", in the PR #5 body. The ADR bodies are silent on this. |
| ADR-201 to ADR-206 | "Playwright was not run" (ADR bodies) |
| ADR-212, ADR-215 | The three cut-out runners. "Never been run" (`docs/design/cutout-chooser-validation.md`, status line) |

**Coverage gap, ADR-080.** Playwright coverage was never measured. Today there are 18 spec files: acceptance 3, exclusive 2, facilitator 1, full-event 1, participant 11. There is no `e2e/superadmin/` directory, although the `test:e2e:superadmin` script in `package.json` points at it. The superadmin console has no browser coverage.

**Also in this group:** the Postgres driver suite (§6.3). It is skipped by default and fails when it is run.

## 4. Accepted or deferred scope the ADR records as not done (C)

- **ADR-064.** A "replay complete" frame from the server would remove a fragile read. It was not built, and the ADR calls it "a protocol change and not this one". The code has no such frame, and no defect is recorded.
- **ADR-066.** Browsers without `EventSource` do not receive a retraction until the panel remounts. Recorded as a known asymmetry.
- **ADR-129.** Existing databases keep the two dropped read-marker columns until they are re-provisioned. There are no migrations, by policy (ADR-049).
- **ADR-168.** The self-repair adds columns and tables, and never alters or drops. A column whose type changes needs `./dev-reset.sh`.
- **ADR-149.** Withdrawal of a late team: "not built, deliberately".
- **ADR-151.** No SSE for the operations panel, which polls instead. Deliberate.
- **ADR-110.** Swag: no offline claims, no voiding, no participant claim history. Deliberate.
- **ADR-155.** No unhide for a moderated team-chat line. Deliberate.
- **ADR-173, ADR-204.** The name `sunburst` is kept although it no longer fits the pattern family. The rename was declined in `docs/design/backdrop-pattern-assessment.md`, and the cost is recorded as knowingly accepted.
- **ADR-170.** `PSD_E2E_WORKERS=1` is the escape hatch if parallel specs interfere. The interference is unmeasured.
- **T2** (not an ADR). A former member keeps an open socket. It remains open by choice and is documented as an accepted residual (`outstanding-tasks.md:656` and `:684`).

## 5. Stale or contradicted records (D)

The register is append-only, so these need a new ADR or a register-housekeeping change. They must not be fixed by editing accepted decisions.

| Where | What it says | What is true | Route |
|---|---|---|---|
| ADR-213 and ADR-214 | "`.scene-src/` has never been committed", and "the generator cannot be run" | 39 files are tracked (`git ls-files .scene-src`), about 59 MB, first added in `a0ab8df` with the ADR-193 assets. The `.gitignore` entry at line 30 was added in `b9420c0`, but it does not untrack files. `apps/web/scripts/generate-real-scene.mjs:50` reads `.scene-src`. | ADR-216 to correct the claim. Decide whether generated renders belong in Git (AGENTS-workflow: never commit generated artefacts). |
| `docs/addenda/ADDENDA.md`, supersession index | Rows only up to ADR-139 | Missing rows: ADR-153 (supersedes the closing paragraph of ADR-131); ADR-157 (supersedes the F43 winner edit and adds `POST /api/admin/matches/:matchId/result`; no `/winner` reference remains in code); ADR-196 (`ferryJetty`, consistent in code); ADR-201 (supersedes ADR-198 and ADR-200 in part; `?backdrop=life` becomes `real`); ADR-213 (`skyTower` becomes `skyHelix`, consistent in code) | Append rows, per the ADR-139 rule |
| ADR-200 | The switch is `?backdrop=life` | The live value is `real` (`backdropChoice.ts`). ADR-201 supersedes ADR-200 in part. | The index row above |
| `docs/decisions-outstanding.md` lines 10 and 42 | C2 is "OPEN" | Built as ADR-147 and shipped off | Update the document |
| `docs/task-queue.md` line 283 | C2 is "not being built" | Built as ADR-147 | Update |
| `docs/outstanding-tasks.md` lines 17 and 517 | "Next ADR number: ADR-170" | The next free number is ADR-216 | Update |
| `docs/outstanding-tasks.md` §15 | The station-pages flake is "open, not reproduced" | ADR-192 names the mechanism: unstubbed fetches rejected, and the rejection was blamed on the wrong test. ADR-211 adds a global guard. Nothing has re-measured the flake since. | Mark as "mechanism fixed, re-measure" |
| `docs/design/ux-friction.md` line 167 | P2 "no undo… still open, deliberately" | Undo shipped as ADR-138 | Annotate |
| ADR-147 | Spec at `e2e/service-worker.spec.ts` | The file is at `e2e/exclusive/service-worker.spec.ts` | Note |
| PR #5 title | "fourteen decisions … (ADR-126…139)" | The PR covers ADR-001 to ADR-215, and its body is current to ADR-215 | Retitle |
| `package.json` | Script `test:e2e:superadmin` runs `playwright test e2e/superadmin` | The directory does not exist | Remove the script, or add the specs |
| `apps/api/src/tests/postgres-driver.test.ts` | Driver coverage (ADR-051) | Stale, and it fails when run (§6.3) | Repair |

## 6. Verification performed

### 6.1 Repo gate at `5d4e7ec`

`npm ci` installed 373 packages in 7 s. Then `npm run verify` exited 0 in 8 min 54 s.

| Layer | Result |
|---|---|
| Typecheck (contracts, api, web) | Clean |
| ESLint | Clean |
| Standards (`scripts/check-standards.mjs`) | 555 files, 17 rules, 0 violations |
| Web build (two bundles) | Built |
| API vitest | 57 files pass and 1 is skipped (the Postgres driver file). 800 tests pass and 3 are skipped. |
| API coverage thresholds (lines 98, functions 98.9, branches 94.6, statements 98) | Met |
| Web vitest | 136 files pass. 1450 tests pass. |
| Web coverage thresholds (lines 98.99, functions 98.55, branches 98.4, statements 98.99) | Met |

**Not in this gate:** any Playwright spec, the Postgres driver tests, Docker, and the cut-out real-model gate.

### 6.2 Playwright

Not run. No browser is available in this sandbox (§3).

### 6.3 Postgres driver suite against real PostgreSQL 17.10

- **Server.** `@embedded-postgres/linux-x64@17.10.0-beta.17`, installed from npm into `/tmp/pgtest` (outside the repository). It listened on `127.0.0.1:5432`, and it was stopped at the end of this session. The database `psd_active_day` and role `psd` were created for the run.
- **As committed.** `postgres-driver.test.ts` gives **1 pass, 2 fail**.
- **Temporary copy with four test-only corrections.** **3 of 3 pass.** The copy was deleted afterwards, and the tree is clean.

The four stale assumptions are:

1. `ensureSchema` returns a `SchemaOutcome` string, not a boolean. ADR-178 (`9a0a8c9`) made the change, and the test still asserts `toBe(false)`.
2. The test never calls `seedDatabase`, which seeds the clusters (`apps/api/src/db/seed.ts:77`). Without clusters, `(select code from cluster limit 1)` is null, and `cluster_code` is NOT NULL.
3. `participant.scan_number` is NOT NULL and must be four digits (ADR-088, `schema.sql:80`). The test's raw insert omits it.
4. `participant.title` is NOT NULL and a foreign key to `participant_title` (ADR-061, `schema.sql:95`). The raw insert omits it.

**Conclusion.** The failures are in the test, not in the driver. The bytea round-trip is the reason the file exists, and it passes once the insert is complete. Because the suite is opt-in, `npm run verify` has never exercised the production driver on this branch.

## 7. ADRs closed by later ADRs (do not re-open)

- ADR-027, the undo on a mis-scan: closed by ADR-138.
- ADR-047, the seeded gallery: `scripts/seed-demo.mjs` now uploads photos (around line 634).
- ADR-081, `TEAM_CHAT_PAGE_LIMIT` on open: closed by ADR-087, which uses fifty on open.
- ADR-123, the `onDead` branch: closed by ADR-124.
- ADR-130, the publish and invalidate pairing that was "a convention": closed by the `push-pairing` standards rule (ADR-131).
- ADR-152 and ADR-156, the draw correction follow-ups: closed by ADR-157.
- ADR-153, team-chat hide: closed by ADR-155.
- ADR-192, the unstubbed-request sweep: closed by ADR-211. The true count was 117 tests across 17 files, not 157.
- ADR-197, the landmark sweep: closed, with ADR-213 and ADR-214 (PR #5 "Still outstanding").
- ADR-210, the "unstable standings tie-break": does not exist, and was struck.
- ADR-164, duplicate sign-up: prevented.
- B-3, three untested live pushes: fixed in `104542f`, and each site was re-sabotaged and caught (`outstanding-tasks.md:654`).
- G1, passport bonus: ADR-176. G2, wet-weather preset: withdrawn by ruling. G5, roster composition: closed by ruling. G8, swag: no points.
- Participation-points gap G1, mandatory tier per station: answered by the day-level floor in ADR-116.

## 8. Recommended next steps, in order

1. **Repair `postgres-driver.test.ts`** with the four changes in §6.3, and run it in a gate that has a Postgres server. This is the cheapest real improvement, because it turns a skipped suite into evidence for the production driver. Record it in an ADR if the gate changes.
2. **Land ADR-216** to correct the `.scene-src` claims, and **append the missing supersession rows** (§5). Decide whether the 59 MB of renders should stay in Git.
3. **Run the Playwright suite once on a machine with a browser** (`npm run test:e2e`). This covers every spec in §3, including the service worker, typing, full-event and cut-out specs. Fix what it finds before any event.
4. **C2.** After step 3, self-host the two fonts, then decide when to switch the worker on. It ships off until then.
5. **Cut-out gate.** Run `/cutout-report.html` once, with network access and a browser. Apply the criteria written in advance, and record the numbers. Only then decide on step 3.
6. **Docker.** Build and run `Dockerfile-prd` on a host with Docker (ADR-175).
7. **Managed database.** Run `db-provision.sh --grant-to` against the real role, and close the three gaps ADR-180 lists.
8. **Hall screen.** Schedule the projector rehearsal: throw, contrast and burn-in.
9. **Refresh the stale documents** in §5, and retitle PR #5.

**Decisions needed from the organiser:** whether steps 1 and 2 should be done now; whether generated scene renders should leave Git; who will run the browser steps (3 to 5), and on what host; and whether the photoreal backdrop is wanted at all.

## 9. Caveats

- The "not run" statements are the ADRs' and the PR body's own. I did not re-run every Playwright spec. I also did not establish whether the older claims (ADR-085) were ever run on a developer's machine.
- The PostgreSQL used was an embedded 17.10 build, not the managed 17.11 that ADR-180 names.
- The driver probe used a temporary copy that was not committed.
- Nothing here edits an accepted ADR. Corrections are proposed as new entries only.
