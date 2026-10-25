# C2 — the service worker: assessment and a concrete build plan

**Written 2026-10-04** against `arena/01a10097-special-fiesta` @ `744e8de`, with the queue
empty (ADR-126 … ADR-139 all landed). This supersedes §3 of
`docs/design/outstanding-tasks-implementation-plan.md`, which was costed on 2026-10-03 against
a tree where three of its prerequisites had not yet shipped. Companion documents:
`docs/outstanding-tasks.md` §5 (the standing recommendation) and `docs/decisions-outstanding.md`
C2 (the open question).

Everything in §1 was **measured in this workspace today**, not carried forward.

---

## 0. The verdict, before the detail

> **Superseded 2026-10-04 by ADR-147, which built option B** (§7) behind a superadmin switch
> that defaults to off. The costings and the eight decisions below stand as written; D-5 was
> inverted in the build — the *page* reads the policy and retires the worker, so the kill
> switch is ordinary testable code and the worker has no opinion about its own existence.

**Still do not ship it before the event — but the reason has changed, and that matters.**

On 2026-10-03 the argument was *"most of the win is available for two hours of header work"*.
That header work is now done (ADR-126), so the argument has to be made again on what is left.
What is left is **offline paint**: the app surviving a reload, a tab eviction or a cold start
with no network. That is a real capability and nothing else in the system provides it.

The reason to still hold is that **the audience that needs offline paint most cannot be served
by the cheap version of this feature, and the audience the cheap version serves does not need
it** (§2). Build it and you are buying the hard half, on the morning you cannot intervene, for
three hundred phones you do not control.

There is, however, a **third option** the previous plan did not name: a worker scoped to the
*station consoles only*, which is where offline is operationally load-bearing, and which is
~2 days rather than 4–5 because the facilitator surfaces use none of the art and have no
participant data to warm. §7 costs all three options so the decision can be made on numbers.

---

## 1. The measured baseline (2026-10-04)

### 1.1 What the build actually is

```
apps/web/dist                      226 files, 1.8 MB
  index.html                           745 B      no-cache + etag
  assets/index-*.js                 786.8 kB      immutable  (232.0 kB gzip)
  assets/index-*.css                 29.9 kB      immutable  (6.4 kB gzip)
  motifs/*.svg                  193 files, 168.9 kB   immutable, ?v=MOTIF_VERSION
  scene/*                        15 files,  23.7 kB   immutable
  scene-2x/*                     15 files,  49.8 kB   immutable
```

One JS chunk. Vite warns about the 500 kB threshold; it has not been split, which matters
below because *"no `skipWaiting`"* is cheap insurance today and essential the moment it is.

### 1.2 What a repeat load costs **today**, after ADR-126

`apps/api/src/webStatic.ts` now gives the four content-addressed directories
`public, max-age=31536000, immutable`, and gives **every** file a `size-mtime` etag. So a warm
repeat load is:

| | requests | bytes |
|---|---|---|
| `index.html` | 1 (304 if unchanged) | ~0 |
| `assets/*`, `motifs/*`, `scene*/*` | **0** — served from the HTTP cache without revalidation | 0 |

**A service worker's asset win over this is one 304 per load.** That is the whole of it. Any
plan that still justifies C2 with "fewer asset fetches" is costing a benefit that ADR-126
already banked.

### 1.3 What already survives being offline

| Capability | Mechanism | Status |
|---|---|---|
| A scan taken with no network | `lib/offline/scanQueue.ts` + `useSyncQueue` (ADR-009, ADR-093) | **works**, and is the critical write path |
| Undoing such a scan | ADR-138 — drops the queue entry, posts nothing | **works** |
| Warm data paint on navigation | `lib/storage/cacheStore.ts`, actor-namespaced, purged on sign-in/out (ADR-112/113) | **works** while the page is alive |
| Manual number entry offline | deliberately **refused** (ADR-088) — a number cannot be verified without the server | by design |
| Reload / cold start with no network | — | **fails: blank browser error page** |

That last row is the entire feature request. Note precisely what it is: not "the app works
offline" — it already does, for the one operation that cannot wait — but "the app **comes
back** offline".

### 1.4 The two prerequisites that are already met

- **`GET /sw.js` 404s.** `namesAFile()` in `webStatic.ts` stops the SPA fallback from answering
  a path with an extension. This is the escape hatch the whole risk analysis depends on — a
  browser retires a worker only when its script 404s on re-fetch — and ADR-126 unlocked it
  *before* anything needed it. Verified by its own test.
- **`sw.js` at the dist root would get `no-cache` + an etag**, because `cacheControlFor` grants
  `immutable` only to the four named directories. That is correct and must stay correct; it
  needs a pinning test, because one careless entry in `IMMUTABLE_DIRECTORIES` would make the
  worker itself un-updatable for a year.

### 1.5 Can this sandbox test a worker? — measured, and the answer is still no

A service worker cannot be unit-tested in jsdom: there is no `ServiceWorkerGlobalScope`, no
Cache API, no navigation. The only honest instrument is Playwright, and the standing claim is
that this sandbox cannot fetch its browsers. I retested that today rather than repeating it:

- `npm view @sparticuz/chromium` resolves — **the npm registry is reachable**, and the package
  (153.0.0) ships a Chromium binary, so `playwright.config.ts`'s documented
  `PSD_E2E_CHROMIUM` escape hatch is not theoretical.
- Installed it, extracted `chromium.br` (209 MB) and `al2023.tar.br` (the matching nss/nspr
  libraries), and launched it: `LD_LIBRARY_PATH=/tmp/al2023/lib /tmp/chromium --headless=new
  --no-sandbox --no-zygote --single-process --dump-dom about:blank` **hangs** — no DOM, no
  error, killed at 60 s.

So: a browser binary is obtainable here, and it does not run. The e2e deferral stands **as a
measured result rather than an assumption**, and Phase 4 of any plan below is work that can be
written here but must be *run* somewhere else. That is the single biggest reason this feature
is different in kind from everything in ADR-126…139: for the first time, the tests that matter
cannot be executed by the agent writing them.

---

## 2. Who actually needs this — the finding that reshapes the plan

> **Superseded and extended 2026-10-04 by `docs/design/service-worker-stakeholders.md`.**
> This section names three audiences; the hall screen (ADR-140…145) did not exist when it was
> written and is now a **named exclusion** — caching data behind a projected wall builds the
> artefact ADR-144 exists to prevent. That document also scores the full capability menu
> (background sync, push, installability) and surfaces one finding that is true today with or
> without a worker: the web fonts need the public internet.

The app has three audiences and the standards checker already enforces that they share almost
nothing (`checkThemeSeparation`: facilitator and superadmin surfaces are text-only, no
sprites). Measured: **zero** references to `PixelMotif` or `BeachScene` under
`routes-facilitator/` or `routes-superadmin/`; ten participant modules use them.

| Audience | Needs offline paint? | What they would precache | Device |
|---|---|---|---|
| **Facilitator at a station** | **Yes — operationally.** They stand in one spot for hours, on event wifi at the edge of a marquee, and a reload or an OS tab eviction currently ends their shift until the network returns. The scan queue protects the write; nothing protects the reload. | the JS/CSS bundle. **None of the 193 motifs** | a handful of known staff phones |
| **Participant** | Barely. They open the app in bursts; a failed reload is annoying, and the next attempt usually works. Nothing they do is blocked by it. | bundle **+ 243 art files** | ~300 unknown phones |
| **Superadmin** | No. They are at a laptop, on the same wifi as the server. | — | 1–2 |

This inverts the usual reasoning. **The cheap, safe version of a worker — precache the shell,
cache-first the content-addressed art — spends almost all of its payload on the audience with
the weakest need and the largest blast radius.** The audience with the real need wants 816 kB
of bundle and nothing else.

Two consequences, both load-bearing in §3 and §4:

1. **Do not precache the art.** Runtime cache-first on the immutable directories gets the same
   result for anyone who actually renders a motif, costs nothing for anyone who does not, and
   is exactly as safe — the URL carries the content hash (`?v=MOTIF_VERSION`), so a stale entry
   is unreachable by construction. Precaching 243 files would also push ~1 MB down a beach 4G
   link on first visit, for files most visits never request.
2. **Scope is a real option.** A worker registered only on the staff surfaces is a smaller,
   duller, more defensible feature than a worker registered for everybody (§7, option B).

---

## 3. The eight decisions a worker ADR would have to make

Stated as decisions with their rejected alternative, so the ADR can be written from this.

**D-1 · Hand-written, not `vite-plugin-pwa`.** A generated worker cannot be sabotaged
meaningfully, and `AGENTS-testing.md` §1.1 makes "sabotage the production line and watch a test
fail" the standard of proof. Rejected: the plugin, which would also hash the filename and fight
the root-scope requirement.

**D-2 · But built, not literally hand-placed.** `apps/web/public/sw.js` would be a file Vite
copies verbatim — which means the worker could not import anything, and its routing policy
could never be unit-tested. Instead: `apps/web/src/sw/policy.ts` (a pure module, zero browser
APIs) imported by both `apps/web/src/sw/worker.ts` and a vitest spec, with a second tiny Vite
build (`build.lib`, no hash, `sw.js`, dist root) wiring them together. This is the difference
between a worker that is 80 % testable in CI and one that is 0 % testable. It is the single
most important structural choice in this document.

```ts
// apps/web/src/sw/policy.ts — no caches, no fetch, no self: just the decision.
export type Route = 'immutable' | 'shell' | 'network-only';

const IMMUTABLE = ['/assets/', '/motifs/', '/scene/', '/scene-2x/'];

export function routeFor(url: URL, mode: 'navigate' | 'other'): Route {
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return 'network-only';
  if (url.origin !== self.location.origin) return 'network-only';     // fonts, CDNs
  if (IMMUTABLE.some((dir) => url.pathname.startsWith(dir))) return 'immutable';
  return mode === 'navigate' ? 'shell' : 'network-only';
}
```

Every branch above is a vitest assertion with no browser involved. The worker file is then
thin enough to read in one screen, which is the other half of being auditable.

**D-3 · Nothing under `/api` is ever cached. Enforced by a 14th standards rule.**
`scripts/check-standards.mjs` is a hand-written checker with thirteen rules; a fourteenth —
*no string containing `/api` may appear in `src/sw/`* — is ~15 lines and turns the most
dangerous possible regression into a build failure. The reason this is a rule and not a
comment: a worker-cached API response is the one cache the server cannot purge, and
`cacheStore.ts` already gives the same benefit under code you ship and can revoke.

**D-4 · No `skipWaiting`. An explicit "new version ready" banner, with copy in
`@psd/contracts`.** Swapping code under a running page yields a half-old app the moment
anything is lazily loaded; the build is one chunk *today*. The update therefore becomes a
product surface — `messages.updateReady`, a banner, a tap, then `SKIP_WAITING` +
`clients.claim()` + reload. This also answers "a station phone with the tab open all day never
takes the fix": it is told.

**D-5 · The kill switch is a public, uncached endpoint, and its limit is stated.** The worker
re-checks a flag before serving anything from cache. `GET /api/superadmin/service-state`
requires a superadmin, so it cannot be it; the right shape is a new, tiny, unauthenticated
`GET /api/app-shell-policy` → `{ "serveFromCache": true, "build": "<stamp>" }` with
`cache-control: no-store`, backed by a third column on the existing `service_state` row
(ADR-118) rather than a second switch nobody will remember exists. When it says false, the
worker deletes every cache, unregisters itself and passes through.
**The honest limit, which belongs in the ADR rather than in a postmortem:** a kill switch needs
the network, so it cannot rescue a phone that is offline. It covers the incident it exists for
— a bad deploy on event morning, when the network is fine and the *cache* is the problem — and
not the one people imagine it covers.

**D-6 · A build stamp from the same mechanism as `MOTIF_VERSION`.** Cache names are
`psd-shell-${BUILD}`; activation deletes every cache whose name is not current. One rule, no
migration logic, and a worker that cannot accumulate generations.

**D-7 · The fonts are the fidelity question nobody has asked.** `index.html` pulls Press Start
2P and VT323 from `fonts.googleapis.com`, cross-origin. Offline, the participant theme — a
pixel-art handheld — falls back to Courier New. The worker must not cache a cross-origin
opaque response (you cannot tell a 200 from a 404), so the only real fix is **self-hosting the
two woff2 files** (`.woff2` is already in `webStatic.ts`'s content-type map, which suggests
somebody intended this once). Half a day, independently useful, and it should be decided
*before* the worker rather than discovered in a screenshot. If it is declined, the ADR must say
that offline paint means offline paint *in the fallback font*.

**D-8 · Register late and conditionally, never in `main.tsx`'s first paint.** Registration
goes behind `load`, behind a `navigator.serviceWorker` check, and — under option B — behind the
audience check. A worker that fails to register must be invisible; the app has to be exactly as
correct with none installed, which is also what makes withdrawal safe.

---

## 4. The change surface, file by file

| File | Change | Size |
|---|---|---|
| `apps/web/src/sw/policy.ts` | **new** — `routeFor`, cache naming, the kill-switch read. Pure. | ~60 lines |
| `apps/web/src/sw/worker.ts` | **new** — `install` (precache shell), `activate` (drop stale caches, `clients.claim`), `fetch` (dispatch on `routeFor`), `message` (`SKIP_WAITING`). | ~90 lines |
| `apps/web/vite.sw.config.ts` | **new** — second build, `lib` mode, no hash, output `dist/sw.js`. | ~20 lines |
| `apps/web/src/lib/sw/register.ts` | **new** — registration, `waiting` detection, the update event the hook subscribes to. | ~50 lines |
| `apps/web/src/lib/hooks/useAppUpdate.ts` | **new** — hook returning `{ isUpdateReady, applyUpdate }`. | ~30 lines |
| `apps/web/src/components/shared/UpdateBanner.tsx` | **new** — one banner, `data-testid="app-update"`, copy from contracts. | ~25 lines |
| `apps/web/src/main.tsx` | register after `load`. | 3 lines |
| `packages/contracts/src/messages.ts` | `updateReady`, `updateApplying`. | 2 lines |
| `apps/api/src/routes-*/…` | `GET /api/app-shell-policy`, public, `no-store`. | ~20 lines |
| `apps/api/src/db/schema.sql` + `schema/…` | `service_state.serve_from_cache boolean not null default true`. | 2 lines |
| `apps/web/src/routes-superadmin/OperationsPage.tsx` | a third control on S61, with a confirm. | ~30 lines |
| `scripts/check-standards.mjs` | rule 14: no `/api` string under `src/sw/`. | ~15 lines |
| `apps/api/src/tests/web-static.test.ts` | pin: `sw.js` is `no-cache`, and a missing one 404s. | 2 tests |
| `apps/web/src/sw/policy.test.ts` | **new** — every `routeFor` branch, both modes. | ~10 tests |
| `e2e/service-worker.spec.ts` | **new** — the four journeys in §5. Writable here, **runnable elsewhere**. | ~150 lines |

Roughly 300 lines of production code, 250 of unit test, 150 of e2e — plus the ADR, which for a
decision with this much residual risk is a long one.

---

## 5. Test strategy, including what is untestable

**Unit (vitest, runs here, gates coverage):** every `routeFor` branch — `/api/*` is
network-only in both modes; a cross-origin URL is never cached; each immutable prefix is
cache-first; a navigation falls back to the shell; a non-navigation miss is network-only. Plus
the cache-name derivation and the activation sweep as a pure list-in/list-out function.
**Sabotage to watch fail:** make `routeFor` admit `/api/leaderboard` to the shell branch; the
standards rule should fail the build *and* a test should fail, because the two guards catch
different mistakes.

**API (vitest + PGlite, runs here):** `/api/app-shell-policy` answers unauthenticated, carries
`no-store`, flips with the superadmin control, and — the wrong-party negative this repo
requires — the *flip* needs a superadmin even though the *read* does not.

**E2E (Playwright, written here, run elsewhere), in the order they should be written:**

1. `context.setOffline(true)` → reload → **the shell paints**, the data is the `cacheStore`
   copy, and a scan still queues. *Write this first and watch it fail; it is the only
   justification the feature has.*
2. Second visit paints with **zero** network requests for assets, asserted by counting through
   `page.route`, not by eye.
3. A new build is deployed → the banner appears, the old page keeps working, the tap loads the
   new version — and the **old cache is gone** afterwards.
4. The kill switch is flipped → the next navigation unregisters, deletes the caches and serves
   from the network. Then `/sw.js` is deleted from dist → the worker is retired on re-fetch
   (this is the withdrawal rehearsal, and it is the one that must be done against a *real
   deploy*, not a dev server).

**What cannot be tested, and must be written into the ADR rather than discovered:** a worker
that has been installed on a phone for six hours with the tab never closed; a browser that
evicts the Cache API under storage pressure mid-event; iOS Safari's own worker lifecycle quirks
across app switches; and the interaction between a worker and a captive-portal wifi that
answers every request with a 200 login page. Each of those is browser state over time. None is
reproducible in CI. **That residual, not the implementation, is the feature's actual cost.**

---

## 6. The withdrawal procedure, written before the feature exists

If it misbehaves on the day, in order, fastest first:

1. **Flip the kill switch** (superadmin, S61). Every phone that makes one successful network
   request drops its caches and unregisters. Seconds, needs the network.
2. **Delete `dist/sw.js` and redeploy.** `/sw.js` now 404s (ADR-126), so each browser retires
   the worker on its next update check. Minutes to hours, per phone, needs the network.
3. **Ship a tombstone worker** — a two-line `sw.js` that unregisters itself and deletes all
   caches — if a browser is sitting on a cached copy of the old script. This is the belt to
   step 2's braces and costs ten lines; write it in Phase 3, not during the incident.
4. There is no step 4 for a phone that is offline. Say so out loud now.

---

## 7. Three options, costed

| | **A · Do not build** | **B · Stations only** | **C · Everyone** |
|---|---|---|---|
| Scope | — | worker registered on `/staff/*` only; shell precache, **no art**, no participant data | all surfaces, art runtime-cached |
| Buys | nothing new | a marshal survives a reload, a tab eviction and a dead marquee wifi for their whole shift | the above, plus participants' reloads |
| Blast radius | none | ~20 known staff phones, reachable by radio and by hand | ~300 phones you do not control |
| Build | 0 | **2–2½ d** (no art logic, no font question, one audience to e2e) | **4–5 d** |
| Residual risk | none | small and *physically recoverable* — you can walk to every affected phone | the real one |
| Fonts (D-7) | — | not required (staff surfaces are text-only, system fonts) | ½ d, or accept Courier New offline |

**Option B is the one I would actually build**, and it is the option the previous plan did not
consider. It takes the half of the feature that is operationally load-bearing, hands it to the
audience that can be supported in person, and leaves the three hundred unknown phones on the
path that is already proven — HTTP caching that the server can change at any moment. It also
rehearses the update ritual and the kill switch on a population you can physically inspect,
which is exactly the staging environment this repository does not have.

**Option C only after** option B has survived one real event, there is a staging environment to
rehearse a deploy against, and there are **two clear weeks** before the next event. Never in
the week of one.

---

## 8. If it is approved: the phase plan

Costs are for option B; option C's deltas are in brackets.

| Phase | Work | Exit criterion |
|---|---|---|
| **0 · ½ d** | `src/sw/` skeleton, `vite.sw.config.ts`, the build stamp, the two pinning tests on `webStatic.ts`, standards rule 14. **No registration anywhere.** | `dist/sw.js` exists, is `no-cache`, 404s when deleted, and nothing registers it |
| **1 · ½ d** [+½ d] | `policy.ts` + its unit tests, then `worker.ts`: precache the shell, cache-first the immutable dirs [C: + decide fonts], network-only everything else | every `routeFor` branch tested; sabotage of the `/api` branch fails both the rule and a test |
| **2 · ½ d** | Registration behind `load` and the audience check; `useAppUpdate`, the banner, the contracts copy; no `skipWaiting` | a second build shows the banner and does not swap until the tap |
| **3 · ½ d** | `service_state.serve_from_cache`, the public policy endpoint, the S61 control, the tombstone worker | API tests green, including the wrong-party negative on the flip |
| **4 · ½ d** [+1–1½ d] | `e2e/service-worker.spec.ts`, the four journeys, written here and **run on a machine with browsers**; the ADR, including §5's untestable list and §6's procedure verbatim | journey 1 observed failing before the worker, passing after — **on a real browser**, or the feature does not ship |

Phase 4's exit criterion is the one that cannot be waived in this sandbox (§1.5). A worker
whose only offline test has never executed is precisely the artefact this repository's
testing discipline exists to refuse.

---

## 9. What I would ask you to decide

1. **A, B or C** (§7). My recommendation: **B**, and not before the event.
2. **The fonts (D-7)** — self-host, or accept that offline paint is in Courier New. This is
   independently worth doing for option C and irrelevant for option B.
3. **Where Phase 4 runs.** If there is no machine with Playwright browsers, the honest answer
   is that C2 cannot be completed to this repository's standard, and that is a cleaner reason
   to defer than any of the ones above.
