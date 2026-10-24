# C2 — what a service worker would actually do, stakeholder by stakeholder

> **BUILT 2026-10-04 as ADR-147**, as option B with one addition this document did not
> propose: an operator-facing on/off switch on the Operations page, defaulting to **off**.
> The switch is what made it safe to build before an event rather than after one — the
> feature does not exist until a superadmin turns it on, and stops existing when they turn it
> off. The hall-screen exclusion in §2.4 and the participant exclusion in §2.2 are both
> enforced in code. The font finding in §3.1 remains open and is still worth doing on its own
> merits.

**Written 2026-10-04** against `arena/01a10097-special-fiesta` @ `993f7ca`. Companion to
`docs/design/service-worker-plan.md`, which costs the build. That document answers *how much*
and *how*; this one answers **who it is for**, which is the question that should be settled
first and was only partly settled there — its §2 named three audiences, and **the hall screen
(ADR-140…145) did not exist yet**. There are five parties now, plus two that are not people.

Everything asserted about this codebase was read out of the tree today.

---

## 0. The short answer

A service worker buys exactly one capability this app does not already have: **the app comes
back after a reload with no network.** Everything else on the service-worker menu is either
already banked (ADR-126), already solved better elsewhere (`scanQueue`, `cacheStore`,
`useScreenHealth`), or inapplicable here.

That one capability is worth a lot to **one** of the five parties — the facilitator standing at
a station for six hours — and very little to the other four, while the *risk* it creates lands
almost entirely on the parties who do not benefit.

**The party it looks most valuable for is the hall screen, and that is an illusion** — §2.4 is
the part of this document I would most want you to read.

---

## 1. The capability menu, each item scored against this app

A worker is not one feature; it is a scriptable proxy sitting between every page and the
network. Here is everything it can do, and what each is worth *here*.

| Capability | What it would mean for us | Verdict |
|---|---|---|
| **Offline / cold-start paint** | Reload, tab eviction or browser restart with no network still paints the app instead of the browser's dinosaur. | **The only real gain.** Nothing else in the system provides it. |
| **Zero-request repeat loads** | No HTTP round-trips for JS/CSS/art on a warm load. | **Already banked.** ADR-126 made the four content-addressed directories `immutable`; a warm load is already **0 asset requests**. A worker's margin over today is *one 304 for `index.html`*. |
| **Background Sync** (flush queued writes with the tab closed) | A marshal's queued scans could upload after they pocket the phone. | **Marginal and not portable.** `scanQueue` already flushes whenever the tab is open and online, and a marshal's tab *is* open — it is their job for the next six hours. Not supported on iOS Safari, so it would cover some staff phones and not others: worse than a rule everyone understands. |
| **Push notifications** | "Your match is on court 3." | **Out of scope twice over.** Web push rides the browser vendor's push service over the *public internet* — it is not a LAN capability — and the product has repeatedly refused notification-shaped behaviour (most recently ADR-146: typing indicators reach only people with the room open). |
| **Update control** | A "new version ready" banner instead of silent swaps. | **A cost wearing a feature's clothes.** This only exists *because* a worker pins old code onto a device. We do not need it today: a reload gets the new build. |
| **Installability (app icon, no browser chrome)** | Participants "install" PSD Active Day. | **Not currently possible and not requested.** There is no `manifest.webmanifest` in `apps/web/index.html`; installability needs one *plus* a worker with a fetch handler. A separate, bigger product conversation. |
| **Navigation preload, periodic sync, content indexing** | — | Chrome-only, or irrelevant at this scale. |

So the honest framing for every stakeholder below is: *what is this person's experience of a
reload with no network, and what does fixing it cost them and everyone else?*

---

## 2. The five parties

### 2.1 The facilitator at a station — **the one genuine beneficiary**

**What they do:** stand in one physical spot for hours — fringe station, swag station, court
console — on event wifi at the edge of a marquee, scanning participant QR codes.

**What already protects them.** The write path is solid and was designed for exactly this:
`lib/offline/scanQueue.ts` + `useSyncQueue` (ADR-009, ADR-093) queue a scan taken with no
network, ADR-138 lets them undo one that never left, and ADR-088 *deliberately refuses* manual
number entry offline because a number cannot be verified without the server. A dropped network
does not cost them a scan.

**What does not.** A reload does. Pull-to-refresh by accident, an OS tab eviction when they
open the camera, a phone that sleeps too long — and the next paint is a browser error page.
Their queued scans are still in storage, but they cannot reach the screen that flushes them.
**Today that ends their shift until the network returns.** This is the single failure the
whole of C2 exists for.

**What a worker gives them:** the shell paints, their queue is visible, they keep scanning.

**What it costs them:** nothing visible. Their surfaces are text-only — `checkThemeSeparation`
in `scripts/check-standards.mjs` enforces that facilitator and superadmin pages carry no
sprites, and there are **zero** `PixelMotif`/`BeachScene` references under `routes-facilitator/`.
No art to precache, no web fonts to worry about, system typefaces throughout.

**Blast radius if it misbehaves:** ~20 known staff phones, held by people you can reach by
radio and, if it comes to it, by hand.

**Verdict: yes.** This is option B in the plan's §7, and it is the only part of C2 I would
build.

---

### 2.2 The participant — **the party the cheap version serves and the one it endangers**

**What they do:** open the app in bursts — scan at a station, check the board, look at the
photos, chat with their team — on ~300 phones nobody controls, running every iOS and Android
version in the building.

**What already protects them.** `lib/storage/cacheStore.ts` (ADR-112/113) keeps the last good
answer per actor and purges on sign-in and sign-out, so navigating around a flaky network
paints instantly from warm data. The live surfaces fall back to polling (ADR-131/132).

**What a worker gives them:** a reload that works in a dead spot. Pleasant. **Nothing they do
is blocked without it** — the one operation that cannot wait, the scan, belongs to the
facilitator, and their own failed reload is usually fixed by trying again ten seconds later.

**What it costs them:**

- **The largest payload for the weakest need.** Precaching the participant experience means
  the bundle **plus 243 art files** (193 motifs + two scene sets). The plan's §2 already
  concluded: do not precache the art — runtime cache-first on content-hashed URLs gets the
  same result for whoever actually renders a motif and costs nothing for whoever does not.
- **A cache the server cannot reach.** Today every byte on a participant phone is governed by
  headers you can change and purge. A worker introduces the one store you cannot revoke
  remotely. This is why the plan makes "nothing under `/api` is ever cached" a *standards
  rule* and not a comment: a cached API response here would mean a phone confidently showing a
  leaderboard that no longer exists, in front of the people whose points are missing from it.
- **The font cliff, which is already real.** `index.html` pulls Press Start 2P and VT323 from
  `fonts.googleapis.com`. A worker must not cache a cross-origin opaque response, so offline
  paint for the participant theme is **offline paint in Courier New** unless the two woff2
  files are self-hosted first. Note this is *already* true for any venue whose wifi reaches
  the server but not the public internet — see §3.

**Blast radius:** ~300 phones you cannot touch, on the morning you cannot intervene.

**Verdict: not before the event.** Unchanged from the plan.

---

### 2.3 The superadmin / organiser — **no benefit, and a new duty**

**What they do:** run the day from a laptop, on the same wifi as the server, usually in the
same room as it.

**What a worker gives them:** nothing. Their reload works because their network works.

**What it costs them — and this is the part that is easy to miss:** a worker converts
*deploying* from a non-event into a ritual they own.

- They acquire a **kill switch** (`service_state.serve_from_cache`, a public `no-store`
  policy endpoint, a third control on the Operations page) and must know, under pressure, what
  it does — and its honest limit, which the plan states plainly: **a kill switch needs the
  network, so it cannot rescue a phone that is offline.** It covers a bad deploy on event
  morning. It does not cover the scenario people imagine when they hear the words.
- They acquire a **withdrawal procedure** with three steps and a known dead end (plan §6).
- Every future bug report arrives with a new first question: *is this the cache?* Today that
  question has one cheap answer — hard-reload — and tomorrow it has four.

**Verdict:** a worker is a net *cost* to this stakeholder, which is why scoping it to stations
(~20 phones they can physically inspect) matters so much. It makes the ritual rehearsable on a
population that can be walked to.

---

### 2.4 The hall screen and the room — **the strongest-looking case, and the one to refuse**

This party postdates `service-worker-plan.md`, so it has never been assessed. It is the most
tempting target in the app: one machine, one URL, eight hours, and the most visible failure in
the building — a dark wall in front of three hundred people.

Assess it and the case inverts. Five reasons, in ascending order of how much they matter:

1. **It is one machine you own.** Unlike the 300 phones, the projector laptop can be given
   ethernet, a kiosk profile and an auto-reload. Every problem a worker would solve here has a
   cheaper physical fix, and a person is standing next to the machine when it reboots.
2. **It already survives the network, by design.** `useLocalCachedData` keeps serving the last
   good answer, and `useScreenHealth` (ADR-144) marks the board stale only after reads have
   failed continuously for `STALE_AFTER_MS = 90_000` — two poll cycles plus a margin, so one
   lost request on beach wifi passes unremarked. ADR-144 also decided the wall shows **no error
   state at all**. The hall screen's network resilience is a solved, deliberate, documented
   problem. What a worker adds is survival of a *reload* — and on this machine, a reload means
   a human or a reboot, i.e. someone is already there.
3. **The thing a wall must have is the thing a worker must not cache.** What the room reads is
   *data*: scores, who is on court, what is next. Rule D-3 forbids caching anything under
   `/api`, and it is right to. So an offline hall screen is a beautifully painted frame with no
   rows in it. Break D-3 to fill them in and you have built the exact artefact ADR-144 wrote a
   paragraph to prevent: *a scoreboard showing an hour-old score with total confidence, in
   front of the people who played the matches missing from it.* **A wall that is dark is
   understood by the room. A wall that is wrong is believed by it.**
4. **Its images carry credentials in the URL.** `galleryImageUrl()` builds
   `/api/gallery/photos/:id/:rendition?screen_key=…` (or `?session_token=…`). Those are under
   `/api` and therefore uncacheable by rule — and if anyone ever "fixed" that, the cache keys
   in a shared Cache Storage on a possibly-borrowed projector laptop would be *credentials*.
   This is a second, independent reason not to go near it.
5. **It is the worst possible test environment for the untestable part.** The residual risk the
   plan cannot discharge is "a worker installed on a device for six hours with the tab never
   closed, under storage pressure". The hall screen is *literally that*, running in front of
   the largest possible audience, on the one day you cannot intervene.

**Verdict: explicitly no.** Not "later" — no. Record it so nobody re-proposes it on the grounds
that the wall is the most visible screen. The right robustness work for the hall screen is
ethernet, a kiosk-mode auto-reload, and the projector rehearsal that is already outstanding.

---

### 2.5 The maintainer — **the party who pays after the event**

Not a user, but the one who lives with it longest.

- **`/sw.js` must 404 forever.** ADR-126 made it 404 (the SPA fallback no longer answers paths
  with an extension) and that is the escape hatch the entire risk analysis rests on: a browser
  retires a worker only when its script 404s. It is currently an incidental property of
  `namesAFile()`. The day it ships a worker, it becomes load-bearing and needs a pinning test.
- **`sw.js` must never become `immutable`.** It is `no-cache` today only because
  `cacheControlFor` grants `immutable` to four named directories. One careless entry in
  `IMMUTABLE_DIRECTORIES` and the worker is un-updatable for a year. Also a pinning test.
- **The tests that matter cannot run here.** Measured in the plan's §1.5: a Chromium binary is
  obtainable in this sandbox and **does not run**. The one journey that justifies the feature —
  offline, reload, the shell paints — can be *written* here and must be *executed* elsewhere. A
  worker whose only offline test has never been run is precisely the artefact this repo's
  testing discipline exists to refuse.

---

## 3. Two things that are true today, with or without a worker

Surfaced by this analysis and worth deciding on their own merits:

1. **The web fonts need the public internet.** `index.html` fetches Press Start 2P and VT323
   from Google. If the venue gives you a LAN with the app server on it but no internet — or a
   captive portal — **the participant theme falls back to Courier New today**, and nobody has
   seen that screenshot. Self-hosting two woff2 files is about half a day (`.woff2` is already
   in `webStatic.ts`'s content-type map, which suggests somebody intended this once). This is
   worth doing whether or not C2 ever happens, and it should be settled *before* a worker, not
   discovered in a photograph of the marquee.
2. **A captive portal answers every request with a 200 login page.** That is a hazard for the
   HTTP cache and a much worse one for a worker, which would happily store the portal's HTML
   as your app shell. Another reason the kill switch is less of a comfort than it sounds.

---

## 4. The crossing point — when would this change?

C2 becomes the right call when any of these becomes true, and not before:

- **A marshal loses a shift to a reload at a real event.** One observed incident moves
  option B from "defensible" to "obvious". It is the cheapest possible trigger and it costs
  nothing to wait for.
- **The app is asked to be installable** (home-screen icon, no browser chrome). A manifest plus
  a worker is then the price of entry, and the conversation is a product one, not this one.
- **Staff surfaces grow a workflow that must survive a cold start** — a scan-heavy station that
  cannot tolerate a restart, say. Today the queue covers the write and only the paint is at
  risk.
- **There is a staging environment and two clear weeks** before an event. Option C is gated on
  this in the plan's §7 and that gate should stay shut.

---

## 5. Recommendation, unchanged in substance and sharper in shape

| Party | Needs offline paint? | Carries the risk? | Verdict |
|---|---|---|---|
| Facilitator at a station | **Yes, operationally** | ~20 reachable phones | **Build it for them — option B, after the event** |
| Participant | Barely | ~300 unknown phones | No |
| Superadmin | No | gains a duty, not a benefit | No |
| **Hall screen** | **No — and caching data there is actively harmful** | the whole room | **Explicitly no** |
| Maintainer | — | two pinning tests and a permanent question | the standing cost of any yes |

**Recommendation: option B, not before the event, and the hall screen is now a named
exclusion rather than an unexamined possibility.** Before any of it, decide the fonts (§3.1) —
it is cheap, independently useful, and it is the one item here that affects the participant
experience *today*.
