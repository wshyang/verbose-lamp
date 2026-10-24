# Migrating the Attest web front end to Svelte — screen by screen, both UIs live

Date: 2026-10-11. Branch state measured at `6ceb943`.

**What this is.** A plan and an assessment of cost, ordered so that a screen moves at a time and both
UIs stay reachable side by side, so that "look and likeness" (the CSS, the markup, the live
fetch/SSE behaviour) is provable rather than hoped for.

**What this is not.** A decision to adopt Svelte. `svelte-assessment.md` answered the narrower
question — *should the checking layer be written in Svelte* — and its answer was no (see its §1 and
§5). Framework adoption for the app is an owner call, and the repository already records the answer
for now: `AGENTS.md:59` is the stack table row `| Frontend | React 19 + Vite 7 + React Router 7 |`,
which an ADR must amend before any of this is scheduled. If the owner says "migrate", an ADR is written first and this document
becomes its implementation plan. Nothing here changes `apps/web` today; the tree is untouched and
the gate is green from turn 19 (`verify exit=0`, six stages).

Every claim below is labelled: **(observed)** measured on this checkout, **(read)** from a file or
config, **(measured, spike)** run in `/home/user/svelte-island-spike` (Appendix A), **(estimate)** a
judgement, stated with its basis.

---

## 1. What "progressive, both in parallel" has to mean, precisely

Three invariants make the rest of this document mechanical. They are not taste; each one is the
answer to a thing that broke while measuring.

1. **One renderer per DOM subtree.** React never re-renders over a Svelte island's nodes, and
   `svelte:component`/`mount()` owns its own host element. The bridge is a React component that
   mounts a Svelte component into a `useRef` div, once. **(measured, spike)** the island's host node
   is byte-identical and its typed input survives after the React host re-renders twice.
2. **Props flow down once; data flows through a framework-free store.** A React parent must not
   push a new prop into a live island. Svelte 5 removed `$set`, so the only way to "update" a
   manually mounted island is to destroy and rebuild it — and rebuilding is what loses focus and
   unsaved typing. **(measured, spike)** the remount-on-prop-change variant loses both, the
   store-driven variant loses neither. This is the single most consequential rule in the migration:
   it is why the shared-state work in §3.2 comes before any screen moves.
3. **A screen is migrated, not moved, only when its React twin is still reachable and the parity
   harness (§6) passes on both.** Otherwise "progressive" degrades into two permanently divergent
   UIs, which is the expensive failure mode of every incremental rewrite.

The price of invariants 1–3 is paid up front and once: the Svelte runtime in the bundle.
**19.5 kB of the 58.98 kB gzip budget, +14.2 kB gz for the first island and roughly +1 kB gz for
each one after** (from `svelte-assessment.md` §4, measured on this app's production build). That
tax is paid for the whole parallel period, and it is refunded at cutover when the last React screen
goes. Everything else in this plan is scheduling.

---

## 2. The coupling map, measured

The framework boundary is smaller than the app. This is what a migration actually touches.

| Surface | Files | Lines | Bound to React? | What happens in the migration |
| --- | --- | --- | --- | --- |
| `src/routes-*` (4 role areas) | 86 | 19,457 | 18 files import React | ported, screen by screen |
| `src/components/*` (participant 38, shared 9, console 3) | 50 | 7,146 | 24 import React | ported with their screens |
| `src/lib/hooks` | 109 | — | **76 import React**, 1 does not | stay; get a runes binding per wave (§3.2) |
| `src/lib/api` (fetch + SSE) | 21 | — | **0 import React** | untouched |
| `src/lib/{avatar,passport,storage,photo,camera,live,offline,repair,scene,sw,audio}` | 40 (non-test) | — | **0 of 40 import React** | untouched |
| React contexts (`createContext`) | 5 sites | — | session, sync, alerts, people, sprites | become module stores (§3.2) |
| `src/App.tsx` (router, 51 `<Route>`), `main.tsx` | 2 | 186 | entirely | last thing to change, if ever |
| `src/styles/*.css` (6 sheets) | 6 | 3,329 | not at all | **shared by both UIs** |

**(observed)** 47 files named `*Page.tsx` — participant 15, facilitator 7, superadmin 24, screen 1 —
living in those 86 files; the views reach 51 distinct hooks, and 25 colocated screen tests plus 16 in
`src/components` already pin their behaviour.
**(observed)** `src/lib` holds 232 files of which **153 import no React at all**.

Three things follow from that table, and they set the whole shape of the plan:

- **The "dynamic ajax" part is already framework-free.** `client.ts`, `statusStream.ts`,
  `chatStream.ts`, `teamChatStream.ts`, `streamWatchdog.ts`, `gallery.ts`, plus `useAsyncData`'s
  `AsyncData{data,error,isLoading,reload}` contract (ADR-024: *"isLoading means nothing to show
  yet"*) and the `mergeById` de-dup are plain modules. **(read)** A migrated screen does not rewrite
  the data path; it re-expresses the *view* over an existing async contract, so the semantics that
  took years of ADRs to settle cannot drift in the middle of a UI change.
- **Look and likeness lives in the CSS and the class names, and it is shared.** Both UIs import the
  same six sheets; there is no Tailwind in this repo to re-point (**(observed)** `tailwind` appears
  in no package.json, CSS file or TS file), and no CSS-module hashing to lose. Two of those sheets
  are already asserted from the test suite (`print.css.test.ts`, `screen.css.test.ts`), so the
  riskiest 3.3 k lines of "likeness" have a test whether or not the markup changes. **(read)** The
  port's contract is therefore: *same class names, same element nesting, same `data-testid`s* — and
  §6 makes that checkable rather than aspirational.
- **Only 5 React-provider sites and 18 route files import React for the chrome.** The island
  boundary needs to touch those and nothing else.

---

## 3. Wave 0: four seams, none of them a screen

Wave 0 is the only wave with React-side work in it. It is deliberately reviewable on its own, and
**all four items are worth landing even if no screen ever migrates**, because they are decoupling,
not Svelte-ification.

### 3.1 The island boundary — one file, ~30 lines

`src/components/shared/SvelteIsland.tsx`, the exact shape proven in the spike **(measured, spike)**:

```tsx
import { useEffect, useRef } from 'react';
import { flushSync, mount, unmount } from 'svelte';

/** Mounts a Svelte 5 component into a div React then forgets about. Props flow down once. */
export function SvelteIsland({ component: Component, ...props }: { component: any; props?: never }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let comp: ReturnType<typeof mount> | undefined;
    // Svelte's $effect runs on its own queue; React's act() does not flush it. Without this
    // flush the island paints but never subscribes — this exact bug failed the first spike run.
    flushSync(() => {
      comp = mount(Component, { target: host.current!, props });
    });
    return () => void unmount(comp);
  }, []);
  return <div ref={host} data-island />;
}
```

Notes the measurement forced out, all of them **(measured, spike)**:

- The `flushSync` import is from **`svelte`**, not `react-dom`. Without it the component renders and
  never subscribes — the first run of the spike failed four tests for exactly this reason, and it is
  the same trap a migrated screen's tests will fall into (see §6.2).
- Under `<StrictMode>`, whose double-invoked effects destroy a naive bridge, the boundary above ends
  with **exactly one** island in the DOM and **exactly one** store subscriber, and unmounting leaves
  **zero** subscribers and no running timer. The leak-safety of the whole migration rests on that
  `unmount` in the cleanup.
- The island drove its own `setInterval` loop and its `{#each rows as row (row.id)}` list updated
  from the store **while React re-rendered zero times**, and the DOM node of a surviving row was
  reused (not rebuilt) when the list changed. That is the "dynamic ajax DOM elements" requirement
  met at the bridge, which is where it either works or doesn't.

### 3.2 The store seam — the five contexts become five module stores

Today `SessionContext`, `SyncContext`, `AlertsProvider`, `PeopleProvider`, `SpriteProvider` are React
contexts fed by hooks **(read)**. A Svelte island cannot read them without being wrapped in the
provider tree, and wrapping the whole app in React providers to host islands defeats the point.

The repo has already done half of this to itself: `AlertsProvider.tsx` is 20 lines whose own comment
says *"The decisions live in `useAlertsStore`; this file only passes them down"* **(read)** — the
provider is a pass-through around a store-shaped hook. So wave 0's job per provider is to hoist the
`useXxxStore()` result into a module singleton and keep the provider as a thin reader of it, not to
redesign anything. What must be preserved is the coupling the provider exists for: ADR-063's alert dot
is drawn on the Teams tab in `GameboyShell` and cleared by the team room several routes inside
`children`, so both trees have to read *one* copy — which is exactly the property the island boundary
depends on, and the reason a Svelte island never gets its own socket.

So: each of the five moves to a module store with a `subscribe/get/set` contract — precisely the
shape proven in the spike, ~20 lines each — and React keeps reading it through
`useSyncExternalStore(store.subscribe, store.get)`, while Svelte reads it natively
(`$derived`/`$effect` over the same `subscribe`, or `get(store)` from `svelte/store`, whose
contract the shape above already satisfies). No fetch, no socket, no cache is duplicated; there is
still exactly one `SyncProvider` feeding exactly one queue.

This is the biggest *real* refactor in the migration and it is UI-agnostic: do it as its own wave,
with the full suite green, before `.svelte` exists in the tree. Exit test: the 149 web test files
pass unchanged against the stores, and `subscriberCount`-style assertions prove nothing is
subscribed twice.

### 3.3 The toolchain seams — seven edits, each a hole I can already see

| Seam | Today **(read)** | Change | Why, or what silently fails |
| --- | --- | --- | --- |
| Vite | `plugins: [react()]` | add `svelte()` from `@sveltejs/vite-plugin-svelte` | both loaders coexist; verified working in the spike |
| Version | Vite 7.3.6 | pin `@sveltejs/vite-plugin-svelte@6.2.4` | 7.x requires Vite 8; 6.2.4 is the last Vite-7-compatible release **(read)** |
| Vitest | `include: ['src/**/*.test.ts', 'src/**/*.test.tsx']` | add `'src/**/*.test.svelte.ts'` or the `*.svelte` twin convention | island tests are otherwise not collected at all |
| Coverage | `include: ['src/**/*.{ts,tsx}']`, thresholds 98.99/98.55/98.4/98.99 | either widen the glob **or** add the islands to `exclude` with a comment | as written, a `.svelte` file is **outside the denominator**: islands could be entirely untested and coverage would still read green. Whether v8 attributes coverage to `.svelte` through Svelte's sourcemaps was **not measured**; decide by measurement, not by hope |
| ESLint | root `eslint.config.js`, `files: ['**/*.{ts,tsx}']` | add a `svelte-eslint-parser` block for `**/*.svelte`, and `files` widened for the ts block | `.svelte` files are not linted by anything today; `svelte`/`svelte-action` plugin config is the usual route. React-rules (`react-hooks`) must *not* be applied to them |
| Typecheck | `tsc -p apps/web` | run `svelte-check --tsconfig ./tsconfig.json` as a new standards-stage step | `tsc` never opens `.svelte`; note the known blind spot recorded in `svelte-assessment.md` §7.3 — `svelte-check` does not fail on an unreachable import, so it is a floor, not a wall |
| `scripts/check-standards.mjs` | 869 lines, 18 rules, walker accepts only `.ts`/`.tsx` (line 32) | add `svelte` to the walker; teach rule 7 (`className=`) and rule 14 (`onClick=`) the Svelte forms; then rule 19 `island-boundary`: a `*.svelte` file must not import `react`, `react-dom` or `react-router`; a `*.tsx` file may import a Svelte component only through `components/shared/SvelteIsland` | this is the repo's own idiom, not an invention: `AGENTS-frontend.md` §4 already bans cross-boundary imports of participant art, enforced by a standards rule. Without rule 19, someone will import `useState` into a `.svelte` file on day 9 and the two runtimes will fight over one subtree |

**(read)** The standards script and `tsc` both ignore `.svelte`, and it is worth being exact about
how, because this is the finding that decides the order of everything below.

`scripts/check-standards.mjs:32` — the file walker:

```js
if (/\.(ts|tsx)$/.test(entry)) out.push(full);
```

One regex, and all **18 rules across 869 lines** are structurally blind to `.svelte`: not
"configured narrowly", but unable to see the files at all. Rules 4, 5 and 6 (`jsx-purity`, the
interactive-thing-needs-a-`data-testid` rule) each additionally re-test `file.path.endsWith('.tsx')`
themselves, so widening the walker alone leaves them off.

And there is a sharper case. Rule 14, `screen-has-no-controls`, is what keeps the hall screen free of
buttons and handlers (ADR-141). It guards by **directory** — `file.path.startsWith('apps/web/src/routes-screen/')`
**(read)** — so a migrated `ScreenPage.svelte` sitting in that directory *should* stay protected. It would not:

```js
/on(?:Click|Change|Submit|KeyDown|KeyUp|Input|Focus|Blur)=/g   // rule 14's handler pattern
```

Those are React's capitalised JSX handler names. Svelte's `onclick={…}` and `on:click={…}` match
nothing, so a Svelte hall screen could grow a control and the rule that exists specifically to forbid
it would report the file as clean. **(read from the rule's source)**

Rule 7 has the same shape and a wider consequence. `avatar-on-admin-surface` is what enforces
`AGENTS-frontend.md` §4 — avatars, sprites and `gb-*` participant styling never on a facilitator or
superadmin surface — and its markup half is:

```js
/className="[^"]*gb-/g   // rule 7, pattern 2
```

A ported screen writing `class="gb-tabs gb-tabs--on"` — the correct way to keep the look — matches
nothing. So during a migration the *look* rule that protects the two themes from each other goes quiet
on exactly the files being written. Two pattern sites (rules 7 and 14) plus the walker line are the
minimum; the import half of rule 7 needs nothing, because `from '../components/participant/…'` reads
the same in either language.

So wave 0's standards work is two lines, not one: add `svelte` to the walker *and* teach the handler
pattern the Svelte forms — and, because the repo's own convention is that a rule that has never failed
is not trusted, six sabotage cases (one per affected rule) written to fail before the first screen
moves. This is the same discipline `shiphats-pipeline-set` (rule 18) was held to last turn.

### 3.4 The flag — so both UIs are reachable at once

**(observed)** `src/` contains no `import.meta.env` reads today, so this plumbing is new. Keep it to
one file, `src/lib/ui/which.ts`:

```ts
/** 'react' (default) | 'svelte' | 'both'; ?ui= overrides, then the cookie, so e2e can pin it. */
export const uiChoice: 'react' | 'svelte' = pickUi(import.meta.env.VITE_UI, searchParams, document.cookie);
```

and use it in exactly one place: `App.tsx`'s route table, per route, `element={forSvelte(path) ? <BoardSvelte/> : <BoardPage/>}` — never inside a component. `VITE_UI=svelte` in `dev.sh` for a demo, `both` for the parity harness. Nothing about the flag reaches production unless the build says so, and the moment a wave is retired the flag branch for those routes is deleted, so the count of flagged routes is the migration's progress bar **(read: 51 `<Route>` entries in `App.tsx` to switch)**.

**Wave 0 exit test:** `./verify.sh` green with both toolchains wired, `check-standards` firing on each of its sabotage cases, and a `/` route rendering a 10-line Svelte island that increments from the sync store — no screen migrated. Budget: **8–12 dev-days (estimate)**, basis: the five store extractions plus their tests dominate, and the config table above is small but each row needs its own verification.

---

## 4. The screen order

Two rules decide the order: **least shared chrome first** (so the bridge is proven on a surface that
cannot corrupt anything else), and **most boring first** (a screen whose failure is invisible to an
event is the right place to learn Svelte).

| Wave | Screens | Files / lines **(observed)** | Hooks in play | Existing tests | Why here | Effort (dev-days, **estimate**) |
| --- | --- | --- | --- | --- | --- | --- |
| **1** | `src/routes-screen` — `ScreenPage.tsx` + `ScreenFrame.tsx` (the hall screen, `/screen`) | 3 / 1,292 | 1 distinct | 1 colocated | the least coupled route in the app: one page, 1,292 lines, one hook, and **no actor guard** — ADR-140/141 give it a revocable screen key instead of a session, so it needs none of the chrome (no session, no alerts, no sync queue). A bridge proven here cannot corrupt anything a participant touches. | **4–6** |
| **2** | `src/components/console` — `ConsoleShell`, `LoadingPanel`, `ReasonDialog`; plus the two CSS contracts they sit on | 3 / 165 | 0 | `print.css.test.ts`, `screen.css.test.ts` | the smallest self-contained components in the tree, and the only sheets whose *look* is asserted by a test rather than by eye — so a port here is verified by `npm run test:web -- src/styles` instead of a screenshot. No user state crosses into them. | **3–5** |
| **3** | `src/routes-facilitator` — 7 pages | 12 / 3,386 | 11 distinct | 3 colocated, 1 e2e spec | mid-size, read-mostly, one actor. First wave inside the router, so it is where the flag and the parity harness get real use. | **8–12** |
| **4** | `src/routes-participant` — 15 pages | 26 / 5,377 | 17 distinct | 6 colocated, 15 e2e specs | the live-data screens: `statusStream`/`chatStream` + watchdog + `mergeById` + `applyLiveLeaderboard`/`applyLiveMatch`. Highest test leverage (15 of 22 specs), so first wave where e2e parity actually proves something. The camera/photo screens come **last** in this wave. | **12–18** |
| **5** | `src/routes-superadmin` — 24 pages, in three sub-waves | 45 / 9,402 | 22 distinct | 15 colocated | biggest and most form-heavy; the corpus screens carry the seeded persona tables and the 120-entry census work, so it moves last and in slices: (5a) read-only panels, (5b) sessions/config/corpus tables, (5c) forms with `ConfirmDialog` semantics + the cut-out report. | **18–26** |
| **6** | `AlertsProvider`/`PeopleProvider`/`SpriteProvider` chrome, then `App.tsx` + `main.tsx` | 5 providers + 186-line router | — | — | only after every screen is migrated: the providers are already stores from wave 0, so this is deleting the React wrappers and the router swap. | **4–6** |

**Per-wave exit test** — one command each, so a wave cannot be "nearly done":

| Wave | The wave is done when |
| --- | --- |
| 0 | `./verify.sh` green with both toolchains; `node scripts/check-standards.mjs` fires on all six sabotage cases from §3.3; `/screen` renders a trivial island reading the sync store, with 0 leaked subscribers after navigating away twice |
| 1 | `npm run test:web -- src/routes-screen` green on **both** UIs; rule 14 fails a sabotage `ScreenPage.svelte` that adds `onclick`; assertion 1 of §6.2 shows the two DOMs equal at the same fixture; `/screen?key=…` slides its track on the deck clock with no new fetch and no second socket (assertion 3) |
| 2 | `npm run test:web -- src/styles` green (the print/screen CSS contracts) with the Svelte console markup, and the console's own tests doubled and passing |
| 3 | `npm run test:web -- src/routes-facilitator` green twice, and rule 7 fires on a sabotage `class="gb-tab"` in that area; `npx playwright test e2e/facilitator --project=desktop-chrome--svelte` green (the built twin of the existing desktop project); every `data-testid` the spec touches present in the parity diff |
| 4 | the 15 participant specs green under **both** projects, including `e2e/exclusive/service-worker.spec.ts` — the offline queue is the part of this app most likely to behave differently when its provider is a store — and the chat/leaderboard screens pass assertion 3 under one shared `eventSourceStub` sequence |
| 5 | `npm run test:web -- src/routes-superadmin` green twice; the corpus tables' census and persona-column checks still hold **(that work is data, not UI: nothing here may change the 120-entry seed or its numbering)**; each sub-wave lands alone |
| 6 | no `.tsx` under `src/routes-*`, rule 19 flipped to forbid React imports in migrated areas, `flagged routes: 0` in `App.tsx`, and the bundle back to its pre-island 58.98 kB gz |

**Total: 39–53 dev-days for the screens + 8–12 for wave 0, so ~2.5–3 dev-months of one person
(estimate).** Basis for the rate, not vibes: the assessment's own data point — a 78-line component
ported plus its gate fixes and doc note in about half a day — and this repo's mix of pages (the
1,292-line hall screen is one page; the 26-file participant area is 15 pages), giving roughly one
page per day for a developer fluent in Svelte and one per 1.5 days for a
developer learning it, with the colocated test doubling included. Form-heavy superadmin screens with
`ConfirmDialog` and per-row optimistic updates are the 2× outliers; that is why they are wave 5.

Two things about wave 1 are worth flagging, both read from the source:

- `ScreenPage.tsx` keeps its deck in a separate component for a reason that exists only in React:
  *"hooks cannot be skipped, and a hall screen that polls six endpoints forever with no credential is
  a 401 every forty seconds until somebody notices the wall."* In Svelte the subscription lives in an
  `$effect` inside `{#if}`, so the constraint disappears along with the workaround. That is a real,
  if small, win — and it is the kind of thing the assessment could only hypothesise about, since the
  surface it named as its own trigger has since shipped (`hall-screen-plan.md` closes with *"All six
  phases are shipped"* and asks only for a rehearsal on projector hardware).
- The same file is the one place a migrated screen loses protection for free unless §3.3's rule-14 fix
  lands first. Hence the wave-1 exit test below the table.

The reason wave 1 is the hall screen is not that it is easy — it is that `svelte-assessment.md` §9
named exactly this case as the thing that would change its answer: *a surface that updates
continuously on a weak device*, with rows arriving over SSE while a Raspberry Pi drives a wall. Wave 1
is that surface, so wave 1 is also the experiment the assessment asked for: if Svelte's keyed `{#each}`
does not measurably help `/screen` (measured with the same `useSyncExternalStore`-free store the
island already reads), the migration stops after wave 2 and the tree is clean.

If only waves 1–2 happen, the app has proven the bridge for **zero user-visible risk** and can stop
there with a clean tree (delete the flag, delete the boundary, nothing else was touched). That is the
value of the ordering: it is a real options contract, not a slippery slope.

---

## 5. What a migrated screen actually consists of

Per screen, in this order — and this is the unit of work every estimate above is built from:

1. **Read the React screen's colocated test first.** In this repo it is a specification, not an
   afterthought (25 colocated screen tests, e.g. `LineupsPage.test.tsx` with 14 cases). The ADR
   citations in its names are the acceptance criteria.
2. **Write `X.svelte` emitting the same class names and the same element nesting**, and copy every
   `data-testid` verbatim — the CSS sheets and both CSS-asserting tests address markup, not
   components, and the e2e specs query `data-testid`. Do not "improve" markup on the way past:
   `App.tsx` carries ordering decisions in comments (the `UpdateBanner` and the memory hook above the
   router, the hall screen's missing guard being deliberate **(read)**), and a "cleanup" that reorders
   a `div` can move a whole sheet's layout.
3. **Replace hook calls with store reads** (`useSession` → `session.get()` in a `$derived`;
   `useAsyncData(url, opts)` → `onRead(url, opts)` in the same file plus `{#if}`/`{:then}` markup).
   Keep ADR-024's `isLoading` semantics literally: the same three fields, the same
   `describeError` on failure. A screen that "reads better" in Svelte but reloads on a 304
   revalidation has changed behaviour.
4. **Double the test**: `describe.each(['react','svelte'])` over the existing screen test, or a new
   `X.svelte.test.ts` that renders the island inside `SvelteIsland` and reuses the React test's
   assertions. `@testing-library/svelte`'s `render` returns an `unmount`, and its `rerender` does not
   update props for a component mounted this way — pass data through the store instead **(read)**.
5. **Run the parity harness** (§6) for that screen, both UIs, same fixtures.
6. **Land it with the React screen still in the tree** behind the flag, in one commit per screen, so
   `git revert` of a wave is one command.

---

## 6. The parity harness — making "keep both in parallel" checkable

Without this section the plan is a vibe. Four assertions per migrated screen, all runnable as one
command.

### 6.1 Reaching both UIs
`?ui=svelte` (or the cookie) at the same URL, same routes, same API, same `fetchStub`/`eventSourceStub`
fixtures, same seed data. Two windows open side by side is a legitimate demo of a migration and it is
also the cheapest smoke test there is.

### 6.2 The four assertions, with commands

| # | Assertion | Mechanism | Command |
| --- | --- | --- | --- |
| 1 | **DOM parity** | `normaliseDom(html)` — strip React's comment anchors (`<!--$-->`, `<!--/$-->`), Svelte's `<!---->` markers and `data-svelte-*`, sort attributes, collapse whitespace — then deep-compare the two `innerHTML` values for the same fixture and store state. New file `src/test-utils/parity.ts`. | `npm run test:web -- src/parity` |
| 2 | **Behaviour parity** | the screen's existing colocated test run twice, once per host, via `describe.each(['react','svelte'])`. Both must pass, including the `ConfirmDialog` press-through (`confirmDialog(user)`). | `npm run test:web -- src/routes-<area>` |
| 3 | **Live-data parity** | both UIs driven by the *same* stubbed `EventSource` sequence (`eventSourceStub.ts`) and the same `fetchStub` bodies, asserting the same rendered leaderboard/chat state after each push. This is the assertion that covers the "dynamic ajax DOM" requirement per screen. | `npm run test:web -- src/parity --grep live` |
| 4 | **e2e parity** | the project matrix is already two-dimensional: `playwright.config.ts:161` builds `projects: enginesToRun().flatMap((engine) => PROJECTS[engine])` over four device projects (mobile/desktop × chrome/safari, **(read)**), so the UI axis is a third `flatMap` — `{ name: 'mobile-chrome--svelte', use: { ...devices['Pixel 7'], ui: 'svelte' } }` — with a fixture turning `use.ui` into the `ui=svelte` cookie (§3.4) rather than a query string, so the 22 specs keep their URLs and their `data-testid` selectors untouched. Both UIs then run against one real stack. | `npm run test:e2e` |

Two things the harness **cannot** prove, and I would rather say them here than have them discovered:

- **(observed)** 22 Playwright specs cover 15 participant, 3 acceptance, 2 exclusive, 1 facilitator,
  1 full-event. 47 pages exist. For the superadmin corpus and config screens in particular, *green
  e2e is not screen parity* — assertions 1–3 are the real gate there, and if a wave's owner-facing
  behaviour has no spec, writing that spec is part of that wave's cost, not a later task.
- The parity check compares DOM, not pixels. For look, the shared six CSS sheets plus
  `print.css.test.ts`/`screen.css.test.ts` are what carry likeness; a `toHaveScreenshot` pixel diff
  per screen is the right upgrade but needs the real Chromium run, which is a standing environment
  gap for this project, not something this document can verify.

**One measured gotcha for assertions 1–3:** React's `act()` does not flush Svelte's effect queue
**(measured, spike)** — an island under `@testing-library/react` renders and then sits unsubscribed
until Svelte's `flushSync()` runs. `parity.ts` must therefore expose `settle()` (act, then Svelte
flush) and every island test must use it. Missing this is how you get a test that passes by accident
because the island never updated in either direction.

### 6.3 Doubling cost, stated
While a screen is dual, its colocated test is doubled (25 screen tests + 16 component tests are the
ones that can double; the suite is **149 web test files** today), and its bundle is counted twice. **(measured)** `npm run test:web` on this checkout: **149 files, 1,614 tests, Duration 357.28 s**, of
which the tests themselves are **158.58 s** — the rest is jsdom environment (100.35 s), collect
(27.45 s), setup (12.14 s) and prepare (15.92 s). That split is what makes the parallel period
survivable: doubling the view tests doubles the 158 s component, not the 199 s of overhead, so the
web stage grows toward roughly **6½–7 minutes** at full parallel (estimate from the measured split) and
falls back below 6 as each React twin is retired. If that is too slow, the fix is the parity harness
running against one shared jsdom project rather than two renders of the same tree, not skipping parity. That is the honest price of "we keep both in parallel first", and it
is why §7 puts an expiry on the React copy.

---

## 7. Retirement, rollback, and the expiry date

- **Rollback within a wave:** `git revert` the wave's commits. Screens are one commit each, the React
  copy is still in the tree, so rollback is deletion of the flag branch, not surgery.
- **Rollback of wave 0:** the store seam (§3.2) is **not** reverted — it is a decoupling the repo
  keeps whatever happens, and it is the item that pays for itself even in a React-only future
  (5 providers → 5 stores removes a class of "context re-renders the page" bugs).
- **The expiry rule, which is the one I would argue hardest for:** once a screen has been default-Svelte
  for **two completed event cycles** of the demo tenant, its React twin is deleted in a separate
  commit — and the standards rule 19 flips from "an island may not import React" to "a migrated area
  may not import React". A parallel period with no deletion policy is how a codebase ends up with two
  view layers permanently, which is strictly worse than either big-bang or no migration. Under this
  rule the last React screen dies in wave 6 and the flag dies with it.

---

## 8. Risk register — the seven ways this goes wrong

| Risk | Likelihood | First symptom | Mitigation, and whether it is measured |
| --- | --- | --- | --- |
| Islands refetched/refocused on every React render (users lose typing and focus mid-form) | high if ignored | "the field empties when the queue badge updates" | Invariant 2 + **measured, spike** (remount loses focus, store path does not). Enforced by rule 19 |
| A `.svelte` file invisible to gates, so its bugs ship | **certain** without wave 0 — measured: the walker's extension regex at `check-standards.mjs:32` hides `.svelte` from all 18 rules, and rule 14's capitalised handler pattern cannot see a Svelte handler even in the guarded directory | green `verify.sh`, broken screen | §3.3, with sabotage cases per rule as the repo requires; plus `svelte-check` in the standards stage, eslint `files` widening, and the coverage-glob decision. The pre-existing measurements are in `svelte-assessment.md` §4 |
| The theme separation goes quiet on ports | high until §3.3 lands | a facilitator screen grows a motif sprite and looks "fine" | rule 7's `className=` pattern widened to `class=`; its import half already works. `AGENTS-frontend.md` §4 is the rule, `fds.md` §5.5 the hard one |
| Coverage denominator lies while islands exist | medium | islands at 0 %, thresholds pass | §3.3 row 4: widen or explicitly exclude, decided by measurement, with the reason in a comment as the config already does for `lib/avatar/types.ts` |
| Behaviour drift in the live/SSE path (ADR-024 semantics, watchdog, `mergeById`) | medium | leaderboard double-counts, or the "stale" badge never clears | Data layer untouched by design; assertion 3 drives both UIs from one stubbed stream; the hooks stay where they are with their own 109 files of tests |
| Double maintenance never ends | medium-high | "we'll keep the React version just in case" in month 4 | §7 expiry rule, and the flagged-route count as the visible progress bar (§3.4) |
| The camera/photo screens destabilise a wave | medium, unknown | cut-out/preview regressions | `lib/avatar` (14 non-test files), `lib/photo` (3) and `lib/camera` (1) import no React **(observed)**, so they are called, never ported; they are last in wave 4 and the real-model recording stays as it is |

---

## 9. What this plan does **not** propose

- **SvelteKit.** The app is a static SPA behind a service worker with its own build
  (`vite build && vite build --config vite.sw.config.ts`), and the deployment is an unzipped
  directory behind `nginx.conf` — no server render, no `entry.server`. Kit would buy a router this
  app does not need and cost the SW build, the PWA updates (`ADR-182`'s `UpdateBanner`) and the
  `--host`/`0.0.0.0` dev plumbing. Revisit only if a server-rendered public page is ever wanted.
  **(read)**
- **Custom Elements for the islands.** `svelte@custom-element` exists, but it drags a second
  component registration mechanism into an app that already has a service-worker and a PWA manifest,
  and the `mount()` boundary above is ~30 lines and provably StrictMode-safe. **(estimate)**
- **Any change to `src/lib/api`, `src/lib/hooks`, `src/lib/avatar`, `src/lib/passport`, `src/styles`.**
  Hooks get a thin runes binding at their edge; the logic never moves.
- **The three visual rewrites deliberately left React by `svelte-assessment.md` §6** (the sprite
  layer, the deck, the cut-out tooling): they stay React, and wave 6's provider deletion must not
  sweep them up.
- **A second SSE connection or a second fetch per screen.** That is what §3.2 exists to prevent.

---

## 10. Open items for the owner — each with a default, so a silence is a yes

1. **Adopt Svelte progressively, or not?** Default: **not**; the assessment's answer stands until an
   ADR changes it. Everything above is contingent.
2. **Bundle tax accepted** — +14.2 kB gz while any island is live, refunded at cutover? Default:
   yes if waves 1–2 only, since those two waves are the whole demo.
3. **Wave 0's store seam, done as a React-only change regardless of (1)?** Default: **yes** — it is
   decoupling and it is the cheapest real improvement in the front end. If the answer is yes, it
   deserves its own ADR *before* it is written, because it changes how every screen reads session and
   sync state.
4. **Who learns Svelte on this repo** — the plan's rate estimate assumes one developer who will own
   both idioms afterwards. Two people with zero Svelte history should add ~50 % to waves 3–5.
5. **The pixel-parity question** — is a `toHaveScreenshot` harness per migrated screen wanted as part
   of "keep both in parallel", given it needs the real Chromium run? Default: yes for waves 4–5
   (participant and superadmin forms), no for waves 1–3 where the CSS tests already pin the look.
6. **The e2e coverage gap** — 47 pages, 22 specs. For screens without a spec, do we write the spec
   as part of their wave (default: yes) or accept unit-only parity?

---

## Appendix A — re-running the spike behind §1 and §3.1

Outside the repo, by convention, like the assessment's spike:

```bash
cd /home/user/svelte-island-spike && npm install --no-audit --no-fund && npx vitest run
```

Deps pinned to this checkout's toolchain: `vite@7.3.6`, `@vitejs/plugin-react@5.0.4`,
`@sveltejs/vite-plugin-svelte@6.2.4`, `svelte@5.57.2`, `vitest@3.2.4`, `jsdom@27.4.0`,
`react@19.3.0`. Config needs `resolve.conditions: ['browser']` and
`test.server.deps.inline: [/svelte/]`; the `flushSync` at mount is required (§3.1).

The 7 assertions, all passing at the time of writing:

| # | Assertion | Result |
| --- | --- | --- |
| 1 | island updates from the shared store with the React host re-rendering **zero** times | pass |
| 2 | host re-render keeps the island's DOM node, its typed input **and its focus** | pass |
| 3 | keyed `{#each}` reuses the surviving row's node and drops the removed one | pass |
| 4 | the island's own `setInterval` loop advances while React is idle | pass |
| 5 | unmount: 1 subscriber → 0, timer stopped, node gone | pass |
| 6 | `StrictMode` double-invoke leaves exactly 1 island and 1 subscriber | pass |
| 7 | remount-on-prop-change (the alternative) loses the typed value and the focus | pass — deliberately, as the counter-example |
