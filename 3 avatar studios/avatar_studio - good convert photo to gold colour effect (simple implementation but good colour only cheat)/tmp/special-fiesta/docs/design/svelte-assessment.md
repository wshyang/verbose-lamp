# Svelte in this app: relevance, and what incorporating it would cost

Assessment. Nothing proposed here is implemented, and nothing here asks for a code change.

Written 2026-10-11 against `30e51bd`, on a fresh `npm ci` (Vite 7.3.6, React 19.1.1, vitest 3.2.4,
jsdom 27). Every number below was measured in this sandbox; the spike lives outside the repo at
`~/svelte-spike` and §8 gives the recipe, so a reviewer can re-run it rather than trust this file.

Labels used throughout: **observed** = measured here; **read** = from the code in the repo;
**researched** = from a source named with its date; **hypothesis** = reasoned, not measured.

---

## 1. The headline, stated up front

**1. It works, today, with one config line.** The React and Svelte toolchains coexist on the app's
exact versions with no dependency conflict, and a React tree can mount and unmount a Svelte 5
component. The one thing every `.svelte` test needs is `resolve.conditions: ['browser']`, because
Vitest runs in Node and `svelte`'s server entry refuses to `mount` (observed).

**2. It buys this app nothing measurable.** For the app's most list-shaped interaction — five
keystrokes into a filter over a 40-row list — React made **81 DOM mutations** and Svelte made
**81**. The work is the list, not the diffing. Svelte's saving was in JS (its component body ran
once, React's ran five times) and this app already addresses that by hand: `useMemo` appears 83
times over 29 files and `useCallback` 265 times over 57 (read). And the compiler that removes that
bookkeeping already exists for React 19: `babel-plugin-react-compiler@1.0.0`, which
`@vitejs/plugin-react` 6 lists as a peer. If the itch is render cost or `useCallback` noise, that is
the two-line experiment, not a second runtime.

**3. The cost is not the runtime — it is the harness.** This app's trustworthiness is its gates, and
three of the four do not see `.svelte` files at all: `standards` reported **593 files checked, 0
violations** with a deliberately non-compliant `.svelte` component sitting in
`src/components/participant/` (the walker takes `/.(ts|tsx)$/`); `eslint` answered *"File ignored
because no matching configuration was supplied"* — a **warning**, so CI stays green; and
`coverage.include` is `src/**/*.{ts,tsx}`; and `svelte-check`, the one tool written to read `.svelte`
files, said nothing at all about an orphan `.svelte` file containing a deliberate type error
(§9). `npm run typecheck` *does* see the tree — and fails
on `*.svelte.ts` with `Cannot find name '$state'`, while accepting rune code the Svelte compiler
rejects.

**Recommendation: stay single-runtime.** Neither a migration nor islands. §5 prices the options, §7
answers the maintainability question by porting three real files and pointing the checkers at them,
and §6 lists what would have to change if the owner overrules this.

---

## 2. What this app is, as far as it is relevant (read)

| | |
| --- | --- |
| Stack, as written down | `AGENTS.md:59` — "Frontend \| React 19 + Vite 7 + React Router 7" |
| App code | 160 `.tsx` files, ~64 000 lines of `.ts`/`.tsx` in `apps/web/src`, tests included |
| Tests | 149 files / 1614 tests in jsdom, plus 822 API tests; component tests are 63 `.test.tsx`, logic tests 86 `.test.ts` |
| Shipped bundle | one chunk: 934.20 kB raw / **271.36 kB gzip**, CSS 40.41 kB / 8.47 kB gzip, `sw.js` 1.47 kB / 0.72 kB |
| Rendering shape | no SSR; a router; SSE-fed lists of tens of rows; canvas work in the avatar studio |

Two things about that table decide the question. The bundle is a one-time cost on an offline-first
app that precaches everything, so a framework swap cannot "make the app load faster" in any way a
participant on the beach would notice.

And the app does not do the thing Svelte is for. **`requestAnimationFrame` appears zero times in
`apps/web/src`** (read), and the only timer that ends in a state update is the selfie camera: every
`FACE_INTERVAL_MS = 300` a detection calls `setFaceBox`, and `SelfieCapture.tsx` positions one div
from it (read). That is 3.3 updates a second on one element's `style`, guarded by a `busyRef` so a
slow model cannot queue — the closest thing here to a fine-grained-reactivity workload, and small
enough that whichever runtime does it, nobody feels it. The hot paths are image decode, canvas
compositing and the SSE queue, none of which Svelte touches.

---

## 3. What Svelte is in October 2026 (researched)

- **Svelte 5.57.2** is current (npm registry, queried here). Runes have been stable since 2024-10-19:
  `$state`, `$derived`, `$effect`, `$props`, `$bindable`, `$inspect`, `$host`. Components are
  functions; `mount()` / `unmount()` replaced `new Component()`; `$set()` on an instance was removed —
  in the spike it threw `component_api_changed: Calling $set(...) on a component instance … is no
  longer valid in Svelte 5`.
- **SvelteKit 2** is the app framework (router + server). This app has an Express API behind a
  same-origin `/api` proxy and a service worker; SvelteKit would replace the parts that already work.
- **The plugin line has moved on without the app.** `@sveltejs/vite-plugin-svelte` is at 7.3.1 and
  peers `vite ^8.0.0-beta.7 || ^8` (Vite is at 8.3.4); the last release that accepts the app's Vite 7
  is **6.2.4** (Jan 2026), whose peer is `svelte ^5.0.0`. Adopting today means choosing the
  *previous* plugin major and tracking a line that no longer gets feature releases — and the app is
  already a major behind on `@vitejs/plugin-react` (5.0.4 against 6.1.2).
- **Relevance in the wider pool** (secondary sources, dated): State of JS 2025 (published Feb 2026)
  has 85% of respondents having used React against 27% for Svelte; the Stack Overflow 2025 survey has
  React at 46.9% and Svelte at 6.9–7.2% of professional developers; W3Techs (Aug 2026) counts Svelte
  on 0.2% of sites whose JS library is known. Svelte leads on "would use again"/admiration in those
  same write-ups (86% vs 72%, and 62.4% vs 52.1%) — treat that pair as a blog's reading of the survey,
  not as a number I verified. Direction is what matters: a much smaller pool of engineers, and a
  codebase like this one is maintained by whoever is next, human or agent, against `AGENTS.md`.

---

## 4. The spike, and what each measurement says (observed)

A toy tree with the app's exact versions: `vite 7.3.6 + @vitejs/plugin-react 5.0.4 +
@sveltejs/vite-plugin-svelte 6.2.4 + svelte 5.57.2 + vitest 3.2.4 + @testing-library/svelte 5.4.2`,
a React `App` that filters a 40-row list, a `SvelteIsland` bridge, `Counter.svelte`, and
`Mark.svelte` — a sketch of the chop mark (45 lines against the shipped `PassportChop.tsx`'s 173, and
not a faithful port: it omits the knockout mask and the `useId` discipline).

| # | Measurement | Result | What it means here |
| --- | --- | --- | --- |
| 1 | `npm install` | 182 packages, 22 s, no `ERESOLVE`, one deduped `vite`, one `svelte` | the toolchains do not fight |
| 2 | `vite build` (react + island) | built, 1.9 s | the plugin and `react()` coexist in one config |
| 3 | `vitest run`, no extra config | `mount(...) is not available on the server` in **every** `.svelte` test | jsdom is not enough: Vitest resolves `svelte` to its server entry |
| 4 | same, with `resolve.conditions: ['browser']` | 5 of 5 pass; the island's own button worked inside the React tree | one line, in the config shared by build and test |
| 5 | updating an island's props | `instance.$set(...)` throws; the fix is a module-level `$state` object in a `*.svelte.ts` bridge (`return $state({...})` is a `CompileError`) | React re-renders with new props constantly; a Svelte child needs either a bridge per surface or a remount. My wrapper remounted — 30 lines, and every prop change tears down the island |
| 6 | DOM edits, 5 keystrokes over 40 rows | React **81**, Svelte **81** | fine-grained reactivity is not the win for a list whose contents change |
| 7 | JS work for the same | React body ×5 (each rebuilding the 40-row array), Svelte script ×1 with the derived evaluated ×5 | the real saving is allocations — which `useMemo`/the React compiler already buy |
| 8 | bundle | react-only 186.50 kB / **58.98 kB gz**; +1 island 224.35 kB / 73.21 kB gz; +2 more components 235.49 kB / 77.56 kB gz | **~+14 kB gzip to let the app speak Svelte at all**, then ~+2 kB gz per component |
| 9 | `tsc -p` on the mixed tree | needs an ambient `declare module '*.svelte'` shim, whose type is `Component<Record<string, unknown>>` — props unchecked across the boundary; and `tsc` **accepted** the rune misuse that the compiler rejected | `npm run typecheck` is not a check on Svelte code; `svelte-check` 4.7.6 would have to join the gate |
| 10 | the app's own gates with a stray `.svelte` file | `standards`: 593 files, 0 violations; `eslint`: "File ignored because no matching configuration was supplied" (a warning); `vitest list`: the `.svelte.test.ts` **was** collected, then failed with "content contains invalid JS syntax. If you are using JSX, name the file .jsx or .tsx"; `vite build`: **succeeded**, because nothing imported the file | the failure modes are silent or misleading, and one of them (a build that passes until an import is added) is the kind that reaches a branch rather than CI |

Finding 10 is the one to weigh against findings 1–4. Nothing in the toolchain breaks; what breaks is
the property that made this codebase safe to change at speed — that a rule written in
`AGENTS-frontend.md` has a checker behind it. `no-api-in-component`, `jsx-purity`,
`missing-testid`, `duplicated-copy` and `id-minting` all key off `.tsx` or the `.ts`/`.tsx` walker,
and `apps/web/src/components/participant/SpikeIsland.svelte` containing a bare `<form>` with no test
id and a hand-minted `id={...}` passed every gate in the repo.

---

## 5. Three ways to "incorporate it", priced

**(a) Migrate the app.** 160 `.tsx` files, 63 component-test files, the router, the service worker's
precache list, `AGENTS.md`'s stack line, and every ADR written in React idioms (the `.ts`-hook rule of
`AGENTS-frontend.md` §1 has a genuine Svelte analogue in `.svelte.ts` — the only place where Svelte's
convention and this repo's agree). Expect the bundle to shrink by roughly React's share of 271 kB gz
and the test suite to be rewritten to prove nothing new. Verdict: **no**. The app has no performance
problem of the kind Svelte fixes (§2, §4/6), and a rewrite would spend the harness this repo has spent 240-odd ADRs building.

**(b) Islands — Svelte for a few new surfaces.** Cheap to start (findings 1–4), and the cost is the
one the repo will feel: a props bridge per surface (finding 5), no lint and no standards on exactly the newest
code, and no coverage unless §6/5's glob is changed, and a second idiom for the next maintainer. If the owner
overrules, the honest boundary is a **compiled custom element** (`<svelte:options customElement="…">`,
props as DOM properties, `$host`) rather than a `mount()` wrapper, because Svelte 5 removed the
instance API React would otherwise poke — and per the Svelte docs (fetched today) a custom element
creates its component and reflects updates **on the next tick**, which is at odds with this repo's
`render().container.querySelector` assertions: every island test would have to await a tick.
Verdict: **no**, for a UI this size, with those caveats priced rather than discovered later.

**(c) Svelte outside the shipped tree.** The review harness (`apps/web/scripts/`) is deliberately
outside the typecheck and the coverage floor; a `.svelte` page there — a chop-die sheet, a motif
sheet, a cut-out report — gets Svelte's templating where no gate is weakened and no user code is at
risk. That is where a second framework is free. Verdict: **the only version worth doing**, and worth
doing only if a harness page outgrows `renderToStaticMarkup`.

**The alternative that answers the same itch (researched, not measured here):** React's own compiler,
`babel-plugin-react-compiler@1.0.0`, is a peer of the newer `@vitejs/plugin-react`. Enabling it in
`apps/web/vite.config.ts` would let the app delete `useCallback` noise (265 occurrences) instead of
adding a runtime. It is a config change plus a full `npm run verify`, and unlike a framework swap it
keeps every gate pointed at the code. **Hypothesis**, flagged as such: it may fight the repo's
`jsx-purity` standard, which reads `return ( … )` bodies textually.

---

## 6. If the owner says yes anyway, in this order

1. `apps/web/package.json`: `svelte`, `@sveltejs/vite-plugin-svelte@^6` (7 needs Vite 8),
   `@testing-library/svelte`, `svelte-check`, and `eslint-plugin-svelte`.
2. `apps/web/vite.config.ts`: `plugins: [react(), svelte()]`, and `resolve.conditions` with
   `browser` for the test run (finding 4). The same config builds the app and runs the tests, so this
   is one change, not two.
3. `svelte.config.js`, `svelte`, `vite.config.ts` and the `.svelte` files' ambient types — either
   `svelte-check` in `npm run typecheck`, or a `declare module '*.svelte'` shim and the accepted
   fact that props are unchecked across the bridge (finding 9).
4. `apps/web/tsconfig.json`: rune files (`*.svelte.ts`) must be **excluded from `tsc`** and handed to
   `svelte-check`, or the typecheck fails on `$state` (observed).
5. `vite.config.ts` `test.coverage.include`: add `src/**/*.svelte`, then **recompute the ratchet** —
   new uncovered sources lower the percentage, and ADR-080's rule is that the floor moves only up, so
   the honest move is to write the tests until the old floors still hold. The plumbing itself is fine:
   with that glob set, v8 reported `Counter.svelte 100 %` lines and `Mark.svelte 100 %`, with branch
   figures of 75 % and 60 % and uncovered-line numbers mapped back to real `.svelte` lines (observed)
   — so Svelte code can be held to the floor, and adding it means the floor bites on the first day
   rather than never.
6. `scripts/check-standards.mjs`: extend `walk()` to `.svelte`, and teach `jsx-purity`,
   `missing-testid`, `no-api-in-component` and `id-minting` Svelte's syntax — otherwise the first new
   surface ships unlinted and unmeasured (finding 10). Rules keyed on `.tsx` (`hook-must-not-be-tsx`)
   need an explicit decision about `.svelte.ts`.
7. `eslint.config.js`: `files: ['**/*.{ts,tsx,svelte}']` plus the Svelte plugin's recommended config.
8. An ADR amending `AGENTS.md:59`'s stack row, and — because `AGENTS-frontend.md` §4 was bent once
   already for generated SVG (ADR-241) — the same courtesy: a runtime-drawn or second-framework
   surface is a documented exception, not a preference.

---

## 7. Maintainability, measured by porting three real files

The question worth asking is not "is Svelte nicer" but "what does the next person — or the next
agent — have to hold in their head, and what catches them when they get it wrong". So three real
files were ported by hand in the spike, and the tooling was then pointed at the result. Numbers
first, reading after.

### 7.1 The port

| Original (read) | Port (observed) | What the port left out |
| --- | --- | --- |
| `routes-participant/ScanHistoryTabs.tsx` — 25 lines | 21 lines | nothing; it gained a `current` prop, because `NavLink`'s active class is a router feature and a `.svelte` file in a React app has no router |
| `routes-participant/PassportPage.tsx` — 46 lines | 50 lines, plus 23 for a re-implementation of the shared `StateMessage` (34 lines in the app) | it had to inline `GameboyShell`'s header markup, so the page itself is not bigger than the original |
| `components/participant/SelfieCapture.tsx` — 102 lines | 77 lines | `CameraSwitchButton`, a shared child — so the 25-line saving is flattered by an omission, not by a shorter idiom |

**Roughly parity in size.** Where it moved: `useEffect(() => start(), [start])` plus the `useCallback`
that keeps `start` stable became one `$effect` that returns its own teardown and has no array to
forget. Svelte's `class:active={isActive(tab)}` beats `className={...}` for a segmented control, and
`bind:this` is a shorter way to say "this ref" than `useRef` + a callback.

### 7.2 What that saves this app, in its own numbers

| Habit Svelte removes | Count in `apps/web/src` | Would it help here? |
| --- | --- | --- |
| Dependency arrays | 106 `useEffect` calls (81 in `.ts` hooks, 25 in `.tsx` components), under `react-hooks/exhaustive-deps` set to `warn` in `eslint.config.js:85` | **No.** `npx eslint apps/web/src` reports **0 warnings and 0 errors** for the whole tree, and there are no `eslint-disable` comments in `apps/web/src` — the app already satisfies the rule the `$effect` rune makes unnecessary. What Svelte removes is not the bug but the discipline that buys the zero, which is a real onboarding cost (observed; read) |
| React's identity model, priced | the same clean lint run, bought with 265 `useCallback` and 83 `useMemo` occurrences | **Yes, and this is the largest single maintainability number in the file.** Svelte has no identity to stabilise, so those 348 call sites mostly vanish. `babel-plugin-react-compiler` is the same relief inside React (§7.4) |
| `children` prop types, and one `className` string per element | 160 `.tsx` files | Cosmetic. `jsx-purity` (the standard that reads a component's `return ( … )` body) would have to be rewritten for a template that has no `return`, so the saving is charged to the harness, not paid by it |

### 7.3 What catches a mistake — the part that decided the answer

- `tsc`, as `npm run typecheck` runs it today, **is** stronger on markup than it looks: an invented
  attribute (`<p box={{ a: 1 }}>`) is a type error (`Property 'box' does not exist on type…`),
  observed. And it cannot read `.svelte` at all, so a port silently loses that check on the ported
  files.
- `svelte-check` 4.7.6 found the one genuine error in the ported set — `frequency="0.16"` on
  `<feTurbulence>` is not an SVG attribute, and `svelte2tsx` says so. That is a real, useful check.
- **It also reported "0 errors" for a `.svelte` file containing `const wrongType: number =
  'a string'`.** The file was simply not in the program: only `.svelte` files reachable from an
  included `.ts` were surfaced. A checker whose coverage depends on import reachability, in a repo
  where the standard is *the gates see everything*, is the wrong shape of tool — and this is exactly
  how `standards` and `eslint` behave for a stray `.svelte` file today (§4/10).
- Rune misuse is not caught by `tsc` (it is legal-looking code) and — in this configuration — not by
  `svelte-check` either; `return $state({...})` in a module was rejected **only by the compiler**.
  So the app's single strongest guarantee, "`npm run verify` is the contract", would become "the
  bundler may or may not notice".

### 7.4 The one benefit that is real, and the version of it that is cheaper

Svelte's compiler ships accessibility checks: on a four-line probe it emitted
`a11y_missing_attribute`, `a11y_click_events_have_key_events`,
`a11y_no_static_element_interactions` and `a11y_label_has_associated_control` (observed, `dev:
true`), and `vite build` surfaced the `state_referenced_locally` warning without being asked. The
app has **no a11y plugin at all** (`eslint.config.js`, both `package.json` files: no hit for
`a11y`), and it leans on React's `useId()` to keep the chop mark's filter and mask ids unique per
instance. Svelte ships no equivalent (checked against the installed package's exports), so a ported
chop would hand-mint ids — in a file type the `id-minting` standard cannot read, since its walker
takes `.ts` and `.tsx` only, and that rule exists precisely so minting cannot be bypassed.

So the honest summary of §7 is: **Svelte would make these files a little shorter to write and a lot
harder to check.** The markup win is genuine; `eslint-plugin-jsx-a11y` buys most of it inside the
existing config, and `babel-plugin-react-compiler@1.0.0` (a peer of the newer `@vitejs/plugin-react`)
buys the memoisation half, which is the larger of the two numbers above — 348 occurrences against
106 effects. Both are dependency-and-config changes that leave every gate pointed at the whole tree.

---

## 8. How to re-run the spike

It is outside the repo (no dependency, no lockfile, nothing to clean up):

```sh
mkdir -p ~/svelte-spike && cd ~/svelte-spike
# package.json with: vite@7.3.6 @vitejs/plugin-react@5.0.4 @sveltejs/vite-plugin-svelte@6.2.4
# svelte@5.57.2 vitest@3.2.4 jsdom@27 @testing-library/{react@16.3.0,svelte@5.4.2} typescript@5.9.2
npm install --no-audit --no-fund
npx vite build --config vite.react.config.ts && npx vite build && npx vitest run
```

`src/ports/` holds the three ported app files (`ScanHistoryTabs`, `PassportPage` + `StateMessage`,
`SelfieCapture`), and `npx svelte-check --threshold warning` is what produced §7.3 — including the
orphan-file blindness, which needs a `.svelte` file that nothing imports to reproduce. The coverage
line in §6/5 comes from `npx vitest run src/counter.svelte.test.ts --coverage
"--coverage.include=src/**/*.svelte"`.

The measurements that matter are the pair of builds in `dist-react` / `dist-both` (sizes) and the
`SPIKE edits for five keystrokes` line that `src/compare.test.tsx` prints (81 vs 81). Both
`MutationObserver` numbers needed a `takeRecords()` flush; a first attempt printed 0 for both halves
and would have "proved" the opposite of the truth, which is worth remembering about this class of
measurement.

---

## 9. What would change this answer

- A surface that updates continuously on a weak device: the hall screen of
  `docs/design/hall-screen-plan.md` (a plan, not code) with hundreds of rows and animation between
  scenes, or a live face-box overlay that moves from `style` on one div to a tracked canvas-free
  tree at 30 Hz. Then §6's list is worth paying for, once, for one surface.
- Evidence that `babel-plugin-react-compiler` does *not* relieve the `useCallback`/`useMemo` burden
  here — i.e. the reason for wanting Svelte survives the cheaper experiment.
- The owner's own preference as the person who maintains it. That is a legitimate reason and it is
  not one this document can outweigh; it does mean an ADR amending `AGENTS.md:59` rather than a quiet
  dependency addition.

**And if the trigger does arrive.** The first bullet above is now priced screen by screen, with the
island bridge measured rather than argued, in `svelte-migration-plan.md` — including what the wave-0
seams cost, the order to move surfaces in, and the harness that keeps both UIs provably equal. That
document is a plan and changes no answer here; the answer is still "not the checking layer, and not
the app until someone signs an ADR".
