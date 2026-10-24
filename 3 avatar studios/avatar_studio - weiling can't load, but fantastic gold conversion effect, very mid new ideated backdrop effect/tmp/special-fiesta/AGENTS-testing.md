# AGENTS-testing.md — tests first, and real

> Section file of [`AGENTS.md`](AGENTS.md). Adopted from `GREENFIELD.md` §2–3.

## 1. The rule

**Write the test in the same change as the route or hook it covers — never as a follow-up.**
A feature without its tests is not done, it is a liability with a green build.

### 1.1 What the assertion must look at

A test that runs the broken code and passes is worse than no test, because it certifies the defect.
Every rule below was paid for by a user reporting something a green suite had already "covered".

- **Assert the state that outlives the test, not the state on screen.** Read back through the API or
  the database what was actually persisted. A preview, a component's own state, or an unsaved draft
  can be correct while the stored value is wrong — and the stored value is what the user gets back
  tomorrow. *Paid for:* a tuning control whose preview was right and whose saved record ignored it;
  four e2e tests drove those controls and passed, because three read the preview and the fourth used
  a confirm button, so not one asked what the server held.
- **Exercise the path the user takes, not the path you built.** Where two routes reach the same
  outcome — a dedicated confirm button and a general Save, a keyboard shortcut and a menu — test the
  one a person will actually reach first. A spec that only walks the flow the author had in mind
  documents the implementation instead of interrogating it.
- **When the whole point of a behaviour is visual, assert the computed presentation.** `aria-pressed`,
  a class name or a `data-` attribute can be perfectly correct while the pixels never change. jsdom
  resolves no stylesheet, so this entire class of defect is structurally invisible below the
  real-browser layer — if an affordance exists to be *seen*, only a browser test can say it is.
  *Paid for:* a selected button that announced itself correctly to screen readers and looked
  identical to its unselected neighbour, through a suite that asserted the attribute many times.
- **Tests-first applies to the end-to-end layer too, and it is the layer where it slips.** An e2e
  spec written after the implementation gets shaped around what was built. Write it from the bug
  report or the requirement, **watch it fail for the right reason**, then fix. If it cannot be made
  to fail, it is not testing what you think.
- **Coverage percentage does not measure any of this.** Code that a passing test executed is
  "covered" no matter what the test asserted, so a coverage number rises while these defects ship.
  The useful question per feature is not "which lines ran" but **"what does the user end up holding,
  and does a test read that back?"**
- **A fixture that no longer resembles production data is a test that cannot fail.** ADR-057 says it
  in those words, and the register has now paid for the lesson three times: a 64×64 fixture hid a
  renderer reading one quadrant of a 128×128 sprite; later, an announcement fixture carrying
  `createdByUsername` — not a field on `AnnouncementView` — hid a console column rendering **blank**,
  in a test whose name says it lists what was announced. Build fixtures from the wire type, not from
  memory of it, and prefer a shared fixture that a contract change breaks loudly.
  Two mechanisms hide this, and both must be closed. **A green suite is not a typecheck:** Vitest
  transpiles without checking types, so `npm test` passes over files `tsc` rejects — which is how a
  fixture can invent a field and nothing complains. And **a missing field renders empty rather than
  throwing**, so the assertion has to name the value. `npm run verify` is the gate; `npm test` is one
  quarter of it, and running the quarters individually is how the missing one goes unnoticed.

## 2. Backend: real database, real app entrypoint, zero repository mocks

- Tests run against a **real PostgreSQL engine** — PGlite, the actual Postgres source compiled
  to WASM. Same SQL, same constraints, same JSONB round-tripping as the deployed `pg` database.
- Each test file gets its **own freshly migrated in-memory database** (`createTestContext()` in
  `apps/api/src/tests/harness.ts`). Never the dev data directory, never a shared instance.
- Exercise the app through **`app.request()`** (Hono) — the real router, real middleware, real
  session cookies, **no listening socket**.
- **Never mock the data-access layer.** A mocked repository hides exactly the bug class that
  matters here: wrong column, missing partial index, FK violation, snapshot field left null.

```ts
const ctx = await createTestContext();          // migrated DB + app
const alice = await ctx.signUpParticipant('alice');
const res = await ctx.app.request('/api/me/scans', { headers: alice.headers });
expect(res.status).toBe(200);
```

## 3. Every route needs BOTH tests

| Test | What it proves |
|---|---|
| **Positive** | The happy path writes/reads exactly what `fds.md` specifies, including every snapshot field. |
| **Session-scoping negative** | A **real, valid, logged-in session that is the wrong party for this resource** is rejected (IDOR-style id substitution). |

A `401 because no cookie` test proves authentication, **not authorization** — it does not count
as the negative. Concretely, for this app the wrong party is:

- another participant's id substituted into a `/api/me/...` or team-captain route;
- a **participant** session on a facilitator route;
- a **facilitator** session on a superadmin route (facilitators may scan and run matches, they
  may **not** void, edit winners, or configure anything);
- a facilitator who did **not** start a match trying to cancel it (`fds.md` F24);
- a non-captain member calling a captain action (F11–F14).

`apps/api/src/tests/authorization-matrix.test.ts` enumerates every protected route with the
sessions that must be refused. **Adding a route without adding its row there fails the suite** —
the matrix asserts its own coverage against the router's registered paths.

## 4. Security matrix

Each route is assessed against the OWASP Top 10 with an explicit applicability note in
`apps/api/src/tests/security-matrix.test.ts`. Categories deliberately out of scope for this
event app (e.g. A02 cryptographic storage — PINs are plaintext by product directive, `fds.md`
§9.6) are recorded as **assessed and accepted**, with the reason, not silently skipped.

## 5. Frontend

- **Hooks** carry the logic, so hooks carry the unit tests: `use<Feature>.test.ts` beside
  `use<Feature>.ts`, driven with `renderHook`. Mocking the **API boundary** (`lib/api/*`) is
  allowed and expected here — nothing below it.
- Components get tests only for rendering/wiring concerns; if you find yourself wanting to test
  a computation in a component, the computation is in the wrong place (`AGENTS-frontend.md`).
- **E2E drives the real UI against a real backend with no mocks.**

## 6. Playwright defaults

- **Video is recorded by default.** The single documented off-switch is `PSD_E2E_VIDEO=off`.
  Trace on first retry, screenshot on failure. A suite that is blind on failure is worse than
  no suite.
- Base URL comes from `PSD_E2E_BASE_URL` (default `http://127.0.0.1:5173`).
- The e2e run provisions its own data through the app's own APIs — no direct DB writes, no
  fixtures smuggled in behind the UI. Against a shared backend this is also what makes the
  parallel run safe, so it is not merely a style rule.
- **Files run in parallel; tests within a file stay ordered** (`fullyParallel: false`,
  `workers` = half the cores, override `PSD_E2E_WORKERS`). Much of the suite is written as a
  journey — sign up in one test, act as that person in the next — and scattering those across
  workers would manufacture flakes. A file whose tests are genuinely independent opts in with
  `test.describe.configure({ mode: 'parallel' })`.
- **A spec that mutates a singleton belongs in `e2e/exclusive/`** — the open tournament, the
  point config, the station-offline switch. One instance exists for the
  whole system, so a parallel worker would read back another worker's answer. Exclusive specs
  run last, at one worker, and should restore what they changed so the suite can run twice.
- **`PSD_E2E_WORKERS=1` is the first diagnostic for a suspected cross-talk failure.** Green at
  one worker means the bug is shared state, not the feature.

## 7. Fixtures: realistic, deterministic, unique per run

- Named people, never `user-123`. Pools live in `apps/api/src/tests/fixtures/names.ts` and are
  **per cluster**, so output reads like a real event roster.
- Every identifier is unique per run: `{label}.{runId}` (`runId` = short UUIDv7 suffix). Suites
  are therefore parallel-safe and repeatable.
- Fixture builders are self-contained: `seedTeamsReady(ctx)` (ADR-270 replaced `seedTournamentReady`)
  creates a superadmin, a facilitator and two captained teams, and `seedFringeReady(ctx)` an open
  activity round, so a test states only what it actually cares about.

## 8. Layout

```
apps/api/src/tests/            integration, one file per domain + the two matrices
apps/web/src/lib/hooks/*.test.ts   hook unit tests, co-located
e2e/support/                   Playwright fixtures and stubs — no tests
e2e/{acceptance,participant,facilitator,superadmin}/   mirrors the jsdom areas, runs in parallel
e2e/exclusive/                 mutates a singleton — runs alone, after the rest
```

The e2e directories mirror the web suite areas on purpose: a spec's location should be
guessable from the surface it drives, and the split is what makes the run parallel-safe.
`e2e/README.md` has the rules in full; the two that matter are below.

Keep it consistent; a test's location should be guessable from what it covers.

## 9. E2E environments — every knob, and why it exists

The suites are hermetic about *browser capability* (a test that needs a FaceDetector
injects one; a test that needs its absence forces `undefined` — never assume the host),
but the *host* still decides which browsers exist. These are the knobs:

| Env var | Default | What it does |
|---|---|---|
| `PSD_E2E_BASE_URL` | `http://127.0.0.1:5173` | Where the app under test lives |
| `PSD_E2E_VIDEO=off` | video on | The single documented video off-switch (§6) |
| `PSD_E2E_NO_SERVER=1` | unset | Skip the `webServer` block when an orchestrator owns the stack |
| `PSD_E2E_CHROMIUM=/path` | unset | Point at any Chromium binary when the Playwright browser CDN is unreachable |
| `PSD_E2E_ENGINES=…` | both | `chromium`, `webkit` or `all`. **Unset runs both engines** (ADR-044); it drops to Chromium with a warning only when WebKit is not on disk, and errors loudly if you *ask* for a WebKit that is not installed |
| `PSD_E2E_WEBKIT=1` | unset | Legacy alias for `PSD_E2E_ENGINES=all` (ADR-041) |
| `PSD_E2E_WORKERS=n` | half the cores | How many spec **files** run at once. `1` forces strictly serial — the first thing to try when a failure smells like cross-talk |
| `PSD_E2E_PHOTO_SAMPLE=n` | 1 (all) | Convert every n-th corpus photo while iterating on the photo suites |
| `PSD_E2E_ONBOARDING=1` | unset | Unlocks `e2e/acceptance/demo-onboarding.spec.ts`; set only by `npm run demo:record` |
| `PSD_E2E_REAL_MODEL=1` | unset | The genuine CDN + MODNET weights instead of the stand-ins: unlocks the real-library test in `e2e/participant/model-available.spec.ts`, and makes `npm run demo:record` record real silhouettes (needs internet) |

**On a host with internet** none of the workarounds apply:

```sh
npm run e2e:install                        # chromium + webkit
npm run test:e2e                           # all four projects: two engines × phone/desktop
npm run test:e2e:chromium                  # or :webkit, or :all
PSD_E2E_REAL_MODEL=1 npm run test:e2e      # + the real Transformers.js/MODNET test
```

The four projects are `mobile-chrome`, `desktop-chrome`, `mobile-safari`, `desktop-safari`;
`--project=<name>` narrows further. Both engines supply a camera without hardware — Chromium
from the two fake-media launch flags, WebKit from its own mock capture devices — so
`e2e/selfie.spec.ts` runs on all four (ADR-044).

**On a sandboxed host that cannot reach the Playwright CDN** (only registry.npmjs.org
works), the `@sparticuz/chromium` npm tarball carries a Chromium: install it anywhere,
ask it for `executablePath()` (it self-extracts to `/tmp/chromium`), brotli-decompress
its `bin/al2023.tar.br` for the shared libs, then:

```sh
PSD_E2E_CHROMIUM=/tmp/chromium LD_LIBRARY_PATH=/tmp/chromium-libs/lib npx playwright test
```

## 10. The photo corpus and the recorded demo seed

- **Corpus** = `images/ingest/social-NN-{female,male}.png` (pairs) + `images/ingest/social/NN-name.png`
  (adversarial set), auto-discovered by `corpus()` in `e2e/photo-stubs.ts`. Eighty photos;
  adding one means adding its persona to `scripts/demo-personas.json` too.
- **`e2e/photo-sprites.spec.ts`** (ADR-039/041) drives every photo through every availability:
  model, model-without-detector (the iOS shape), detector-only, manual square, plus the
  misbehaving-model cases. All network stand-ins live in `e2e/photo-stubs.ts`, together with
  `openStudio()`/`savedSprite()`, which every photo suite shares. The corpus is desktop-only
  and now runs once **per engine**.
- **Two separate models are now stubbed, and a test must state BOTH** (ADR-054). MODNET does the
  cut-out; MediaPipe BlazeFace finds the face. `mediapipe(page, 'found' | 'blind' | 'offline')`
  routes the second one, and leaving it out is the same bug `NO_FACE_DETECTOR` exists to prevent,
  one layer out: on an online host the app really fetches 2.7 MB, really finds a face, and a test
  that means *"nothing can find the face"* silently becomes a test of something else.
  **Test 1b is the cautionary tale worth reading before you trust a green photo suite**: it asserted
  that the mask did the head-finding, passed over all eighty photos, and was *defending the defect*
  that put a plate of chicken rice and somebody's hand on the seeded crowd. A stand-in that always
  answers cannot tell you whether the answer is any good — for that, re-record with
  `PSD_E2E_REAL_MODEL=1` and look at `scripts/avatar-align-check.ts`.
- **`e2e/participant/model-available.spec.ts`** (ADR-044/045) is the other half: the model **working**.
  It asserts the contract with the library — `background-removal` on `Xenova/modnet`, the
  device ladder rung by rung (no WebGPU; WebGPU with an adapter; WebGPU advertised without
  one; an adapter the runtime then refuses), the weights fetched once per session, and that
  the mask genuinely changes the sprite. Its last test is the **real** Transformers.js and
  the real weights, gated on `PSD_E2E_REAL_MODEL=1`; run it whenever the model path changes,
  because a stand-in cannot catch what ADR-045 caught.
- **`e2e/selfie.spec.ts`** (ADR-042/043) covers the viewfinder on all four projects across
  the same availability matrix, plus a refused camera and a device with none.
- **`e2e/chat.spec.ts`** (ADR-046) is the only test that can prove the push actually pushes:
  **two browser contexts**, one typing and one only watching, with nothing polling in between.
  Chromium-only on purpose — what would differ between engines is `EventSource`, which is
  uniformly supported, and the hook's own decisions are unit-tested against both a present and
  an absent one. **Stubbing `fetch` is not enough for chat**: `test-utils/fetchStub.ts` swaps
  `globalThis.fetch` only, so a test that stubbed it alone would silently exercise the polling
  fallback while believing it tested the stream. Use `test-utils/eventSourceStub.ts` for the
  live path — and note that jsdom has no `EventSource` at all, so **installing nothing is the
  no-EventSource browser**, which is how the degrade path is covered.
- **`e2e/gallery.spec.ts`** (ADR-047) runs the whole byte chain as a participant meets it: a real
  file in a real file input, shrunk by a real canvas, uploaded as real multipart, written to a real
  directory, streamed back and displayed. The thumb assertion polls `naturalWidth`, because a
  broken image is still a *visible* `<img>` — only `naturalWidth > 0` proves the bytes arrived.
  It reuses `images/ingest/` (PNG) via `busyPhoto()`, which is the case worth covering since the
  shrink step is also the format normaliser.
  Two scoping rules there are product facts, not conveniences. **Staff surfaces get their own
  browser context**: signing a superadmin in over a live participant session leaves the app
  holding the participant's token and `RequireActor` bounces the admin route to the participant's
  home. And the moderation test skips on **`isMobile`, not `browserName`** — a Pixel 7 project is
  still Chromium, and the superadmin console is a dense laptop surface whose sticky header
  overlaps its own table at 412 px.
- **`scripts/gallery-blob-spike.mjs`** (ADR-048) is the one measurement the gallery's storage design
  rests on: a concurrent burst of **distinct** thumb reads — distinct so the blob cache cannot
  absorb them — while writes are timed against a quiet baseline. Restart the API first or the run is
  not cold, because the cache lives in the process. It reports the **tail as well as p95**
  deliberately: head-of-line blocking does not shift a median, it puts one unlucky write behind the
  whole blob queue, and a facilitator experiences the scan they are waiting on rather than a
  percentile. Re-run it whenever the caps, the cache budget or the page size change.
- **An oversized upload has a generated fixture, and the reason is worth knowing** (ADR-052).
  `e2e/oversized-png.ts` builds a >12 MB PNG rather than padding a corpus photo, because bytes after
  a PNG's `IEND` are ignored by decoders: a padded file decodes — and so re-encodes — identically
  every run, and the archive's global SHA-1 check correctly refuses the duplicate. Its content is a
  gradient plus low-amplitude dither, not noise: noise survives downscaling and would blow the 400 kB
  *rendition* cap, failing the upload for a reason unrelated to the archive ladder. Both mistakes
  were made first and are recorded here so the next person does not repeat them.
- **The load claim is measured, not asserted.** `scripts/stress/personas.mjs` gives participants a
  `chat` and a `gallery` surface, weighted *into* the existing mix rather than added on top.
  Measured at 300 users over 90 s (`node scripts/stress-test.mjs --users=300 --duration=90` —
  note the `=`, since the flag parser splits on it): 4,252 requests, **zero failures**, chat sends
  p90 9 ms, gallery listing p90 10 ms, and the number that actually matters —
  `POST /api/tournament/matches/:id/complete`, a facilitator's score write — at p50 10 ms /
  p90 14 ms. That is the evidence for "chat and photos do not starve the event"; re-run it
  whenever either feature's cost model changes.
- **The SSE route is exercised through `app.request()`** in `apps/api/src/tests/chat.test.ts`,
  reading the response body as a stream. That is not incidental: SSE was chosen over WebSockets
  *because* it keeps working with no listening socket (§2), so the streaming test is what makes
  the transport decision honest rather than asserted.
- **The demo seed is recorded, not written** (ADR-040): `npm run demo:record` wipes its own
  data directory, boots the stack, walks all personas through the real sign-up screen and
  photo studio, and dumps what the server holds into `scripts/demo-participants.dump.json`.
  `npm run seed:demo` replays that dump verbatim. **Re-record whenever the corpus, the studio,
  or the sprite format changes.** With internet, prefer `PSD_E2E_REAL_MODEL=1 npm run demo:record`
  — real silhouettes instead of the stand-in ellipse. To regenerate `seed-demo.sql` from the dump
  in one command, run `./refresh-demo-seed.sh` (ADR-237). Do not run `npm run db:export-demo` on
  its own: it exports whatever the database holds, and a schema-only database gives an empty seed
  with exit 0.
- **Judging conversion by eye**, the only honest way: `apps/web/scripts/photo-sprite-review.ts`
  (the colour pipeline over any photos) and `apps/web/scripts/seed-sprite-compare.ts` (the
  recorded dump against its source photographs — the likeness audit). Both write to
  `docs/screenshot/`.

## 11. Gotchas that already cost an afternoon

- **`PGLITE_DATA_DIR` is resolved against the API's cwd**, so the dev database lives at
  `apps/api/.data/dev` — not the repo-root `.data/dev`. Wiping the wrong one reseeds on
  top of old data.
- **PGlite is single-process.** Never open a live data directory from a second process;
  anything that wants the server's state asks the HTTP API (that is why the demo recording
  dumps through the superadmin directory and `/api/avatars`, not the database).
- **`workers: 1` is load-bearing** — one embedded database, one dev stack.
- Photos for the review scripts must be 8-bit non-interlaced RGB/RGBA PNGs (the scripts
  decode PNG themselves); re-encode generated images before committing.
- Playwright's `test.use({ video })` is file-top-level only; inside a `describe` it throws.
- **Never `.fill()` a controlled React input in e2e — use `typeInto()` from `e2e/fixtures.ts`.**
  `fill()` dispatches one input event, and WebKit can land it before React has attached its
  listener: the DOM shows the text, the component's state is empty, and the form rejects what
  the screenshot plainly shows. `typeInto` types per keystroke, checks, and retries (ADR-044).
- **Chromium's `--use-fake-ui-for-media-stream` grants camera permission unconditionally**, so
  withholding Playwright's `camera` permission cannot test a refusal. Inject the refusal at
  `getUserMedia` instead (`CAMERA_REFUSED` / `NO_CAMERA` in `e2e/photo-stubs.ts`).
- **`'gpu' in navigator` is true for a property set to `undefined`.** Pinning "no WebGPU" means
  deleting it from `Navigator.prototype` as well (`NO_WEBGPU`), and pinning "WebGPU present"
  means supplying a `requestAdapter` that answers, because the app asks for an adapter before
  it asks the runtime for a device (ADR-045).
