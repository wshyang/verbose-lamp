# The hall screen — a projected page that cycles the day

**Written 2026-10-04** against `arena/01a10097-special-fiesta` @ `88fcb40`. A design and build
plan for a single projected surface that rotates between the line-ups, the tournament scores,
the leaderboard, the newest photos and the best-liked photos — in the participant theme, as its
own page, pointed at a projector.

Everything in §1 was read out of the tree today.

---

## 1. What already exists, and what it means for this

| Thing | Where | What it gives the screen |
|---|---|---|
| **The photo wall** | `routes-superadmin/PhotoWallPage.tsx`, `/admin/wall` (ADR-047) | The *pattern*: no shell, no navigation, one thing at a time on a timer, `object-fit: contain`. It is console-styled and photo-only, so it is a precedent, not a starting point. |
| **Board data, already live** | `useBoard.ts` + `lib/live/boardLive.ts` | `fetchLeaderboard`, `fetchLineups`, `fetchMatchFeed` with an SSE merge. The screen's first three scenes are **a hook away**. |
| **Push on every scoring write** | ADR-131/132 + `PUSH_PAIRS` in `check-standards.mjs` | `completeMatch`, `editMatchWinner`, `setMatchVoided` must push **both** `feed.match` and the leaderboard, and a standards rule fails the build if one is forgotten. The screen can be genuinely live rather than polled, and the invariant that keeps it live is machine-checked. |
| **Gallery reads** | `GET /api/gallery/photos`, `requireAnyActor`; `GalleryPageView` | Latest and top-voted are the same endpoint with a sort. ADR-134 already removed the per-viewer field from the list, so the screen shares a cache with everybody. |
| **Line-ups** | `GET /api/tournament/lineups`, `requireAnyActor` | Unresolved fixtures in play order, with estimated starts and ADR-111's "Winner of #7" seats — already written for a reader who is not in the match. |
| **Theme tokens** | `styles/tokens.css`, `gameboy.css` | The Sentosa palette and the two pixel fonts are variables, so a big-type layout can share the look without sharing the 320 px components. |
| **Social pause** | ADR-118, `service_state` | A superadmin can already shed the social features; the screen should obey it (§3, D-7). |

Two things in the tree actively get in the way, and both are solvable:

1. **`check-standards.mjs` rule 7 (theme separation)** forbids avatars, motifs and `gb-*`
   classes under `routes-facilitator/` and `routes-superadmin/`. A participant-themed projector
   page cannot live in either directory. That is the rule working correctly — the screen is a
   **fourth audience**, not an admin console (D-1).
2. **`GET /api/status/stream` is `requireParticipant`** (`routes-status/index.ts`), so a screen
   signed in as staff gets no live frames today (D-4).

---

## 2. What the screen is for, stated before it is designed

Three sentences, because every decision below falls out of them.

- It is **watched from ten metres by people who are not holding it**. No tap target, no
  scrolling, no empty state, no error text, nothing smaller than about 24 px at 1080p.
- It exists to **make the hall react**: a finished match should change the screen within
  seconds, because the cheer comes from the people who just saw it.
- It is **the event's face at the closing ceremony**, which is when the leaderboard and the
  photos actually matter, and the one moment a stack trace on the wall is unforgivable.

---

## 3. The eight decisions

**D-1 · A fourth surface class: `apps/web/src/routes-screen/`, route `/screen`.**
Not participant (nobody is signed in as themselves), not console (it is pixel-art and
decorative on purpose). Giving it its own directory keeps rule 7 honest for the consoles and
lets the screen have **its own machine-checked rule** instead:

> **Rule 14 — a projected surface is watched, not used.** No `<button`, `<input`, `<a href`,
> `onClick` or `onKeyDown` under `routes-screen/`, and no import from
> `components/participant/` whose props include a handler.

That is ~15 lines in `check-standards.mjs` and it encodes the whole product idea: the day
somebody adds a "next" button for the operator, the build says no and the conversation happens
in a PR rather than on the projector. (The operator's controls, if they are ever wanted, belong
on a *different* surface that drives this one — see §7.)

**D-2 · Reuse the hooks and the tokens; fork the layout.** The participant pages are built for
a 320 px phone in sunlight; the screen is 1920×1080 at ten metres. Sharing components would
mean every participant layout change has to be re-checked against a projector nobody has in the
room. So: `useBoard`-derived hooks and `tokens.css` are shared; `routes-screen/` gets its own
~6 scene components and one stylesheet (`screen.css`) with a type scale in `vw` units.

One refactor falls out, and it has a precedent: `useBoard` currently also calls `fetchMyTeam`
to mark the viewer's own cluster. Split it the way **ADR-134** split the gallery — the shared
board data in one hook, the viewer overlay in another. The screen takes the shared half; the
participant page composes both. Same reasoning, already accepted once.

**D-3 · A deck of scenes with per-scene dwell, deterministic order, and empty scenes skipped.**
"Shuffle" is the wrong word for what a projector should do: random order repeats, and a screen
that shows the leaderboard twice in a row looks broken. A fixed cycle is predictable enough
that people learn "the photos come after the scores" and look up at the right time.

| # | Scene | Source | Dwell | Dropped from the cycle when |
|---|---|---|---|---|
| 1 | **Cluster leaderboard** — four bars, big ranks, tie note (ADR-029) | `fetchLeaderboard` | 15 s | never (it is the spine of the day) |
| 2 | **Top individuals** — the top 8 | same payload | 12 s | no individual has points yet |
| 3 | **On court now** — live matches with running scores | `fetchMatchFeed` | 12 s | nothing is in progress |
| 4 | **Just finished** — the last 4 results | `fetchMatchFeed` | 10 s | no completed match yet |
| 5 | **Up next** — the next 5 fixtures with estimated starts and "Winner of #7" seats | `fetchLineups` | 12 s | the bracket is done |
| 6 | **Best liked** — top-voted photos, one at a time | `/api/gallery/photos?sort=top` | 8 s each, 3 per visit | gallery empty, or social paused |
| 7 | **Just shared** — newest photos, one at a time | `?sort=latest`, **delayed** (D-6) | 8 s each, 3 per visit | same |

**Never project an empty state.** `emptyStates.photoWall` is right for the photo wall, where the
whole surface is photos; here, "No photos yet" on a ten-foot screen is just a sad slide. An
empty scene leaves the cycle and rejoins silently when it has content.

**D-4 · Live, not polled — which needs one bounded server change.** The leaderboard and the
feed already push. The stream is participant-only, and the fix is narrow: let
`GET /api/status/stream` accept **any actor**, and for a non-participant subscribe to the
**global topic only** — no team topic, so `teamGate` never attaches and no team frame can be
delivered. That is the correct reading of the existing comment in `routes-status/index.ts`
("staff surfaces have no nav dots to light and no team to be due on a court"): still true of a
*facilitator's console*, no longer true of a screen whose entire job is to show the global
state. Polling at 15 s is the fallback if this is judged too invasive, and it is visibly worse —
a hall that has already cheered is looking at a stale board.

**D-5 · The hall interrupts the cycle, with a floor.** A `feed.match` frame for a *completed*
match jumps the deck to "Just finished", then "Cluster leaderboard", then resumes the cycle
where it left off. This is the feature that makes the screen feel alive, and it is nearly free
because the frames already arrive. It needs exactly one guard, and the repo already has the
shape of it: **ADR-133's floor** — at most one interrupt per 20 s, so four courts finishing
together produce one jump rather than four. Without the floor, the busiest minute of the day is
the minute the screen becomes unreadable.

**D-6 · ~~The "just shared" scene is delayed by ten minutes~~ — DECIDED 2026-10-04: project it
live.** The case for a delay was that ADR-047's post-moderation is sized for a phone (small,
one viewer, a report one tap away) and a projector is three metres of agency-wide exposure.
The call is to run it live anyway: the pull of "upload it and watch it appear" is the reason
the gallery exists, and a ten-minute lag quietly removes it. What that buys has to be paid for
somewhere, so the mitigations are not optional:

- the **social pause** (ADR-118) must drop both photo scenes within one scene change — it is
  now the only fast lever, so it has to be fast, and it needs its own test;
- the moderation queue (`/admin/photos`) is the operator's standing job during the event, not
  a thing checked afterwards; a hide already takes effect on the next read;
- the deck must re-read the listing between photo scenes rather than caching a batch, or a
  hidden photo can still be sitting in the screen's hand when it comes round again. **This is
  a real implementation constraint created by the decision** and belongs in the ADR.

**Top-voted needs no such care**: a photo cannot collect votes without having been seen by
people who could have reported it.

The screen must also honour the social pause (ADR-118): paused ⇒ scenes 6 and 7 leave the deck.
That makes the existing switch the "get the photos off the wall now" control, which is what an
operator will reach for anyway.

**D-7 · Never show an error, never show a spinner, never go blank.** The screen's failure mode
is *hold the last good frame*. A scene whose fetch fails is skipped for this pass; if everything
fails, the current scene stays up and a small corner dot goes amber. One exception, because
silent wrongness is worse than visible staleness: after ~2 minutes with no successful read, the
screen adds a quiet "reconnecting" line in the corner — small enough not to dominate, honest
enough that nobody reads a frozen leaderboard as the final result.

**D-8 · ~~Superadmin session~~ — DECIDED 2026-10-04: a dedicated screen key. SHIPPED as
ADR-140 (`5b9540c`).** A superadmin session would have meant the projector showing a sign-in
page the moment a TTL expired, which on this surface means at the closing ceremony. The key
instead: minted and revoked by a superadmin from S61, **no expiry**, carried in a header or
the query string (`EventSource` cannot set a header, and the stream is the point), and
resolving to a `ScreenViewer` that is deliberately **not** an `Actor` — so `requireAnyActor`
routes such as the chat room remain unreachable with it. What it may read is an allowlist of
six, enforced by `requireViewer` and asserted in both directions by 19 tests.

---

## 4. The change surface

| File | Change | Size |
|---|---|---|
| `apps/web/src/routes-screen/HallScreenPage.tsx` | the deck host: current scene, transition, corner status dot | ~80 lines |
| `apps/web/src/routes-screen/scenes/*.tsx` | seven scenes, each a pure render of one payload | ~60 lines each |
| `apps/web/src/lib/hooks/useScreenDeck.ts` | the cycle: dwell timers, skip-empty, interrupt + floor, resume | ~90 lines |
| `apps/web/src/lib/hooks/useBoard.ts` | split the viewer overlay out (ADR-134's shape) | ~30 lines moved |
| `apps/web/src/styles/screen.css` | the big-type scale, dark backdrop, transitions | ~150 lines |
| `apps/web/src/App.tsx` | `/screen` behind `<Superadmin>` | 2 lines |
| ~~`routes-status/`, the screen key, the six widened reads~~ | ✅ **SHIPPED, ADR-140** (`5b9540c`) | done |
| `scripts/check-standards.mjs` | rule 14: a projected surface has no controls | ~15 lines |
| `packages/contracts/src/messages.ts` | `screenReconnecting`, `screenSignedOut` | 2 lines |

~500 lines of production code. No schema change, no new endpoint, no new write path — which is
why this is a far smaller piece of work than it sounds.

---

## 5. Tests

**Unit (vitest, runs here).** The deck is a pure state machine and should be tested as one,
because every interesting behaviour lives in it:

- the cycle advances on dwell and wraps;
- an empty scene is skipped **and** rejoins when its payload arrives;
- a completed-match frame interrupts, and a second frame 3 s later **does not** (the floor);
- after an interrupt the cycle resumes at the scene it was going to show, not at scene 1;
- social paused removes both photo scenes; resumed restores them;
- a scene whose fetch failed is skipped while the previous content stays rendered;
- the 10-minute delay excludes a just-uploaded photo and includes an older one.

Each of those has an obvious sabotage: remove the floor and the interrupt test should fail;
make `skipEmpty` always true and the rejoin test should fail. **Write the floor test first** —
it is the one whose absence is invisible until the busiest minute of the event.

**API (vitest + PGlite).** The widened stream: a superadmin receives a global frame; a
superadmin receives **no** team frame (the wrong-party negative this repo requires); a
participant's behaviour is unchanged, including the ADR-128 membership re-check.

**Standards.** A fixture component with an `onClick` under `routes-screen/` must fail rule 14.

**What cannot be tested here:** that 24 px is readable at ten metres, that the palette survives
a dim projector, and that the transition does not induce burn-in. Those need a projector and
twenty minutes in the actual room — which is an acceptance *rehearsal*, and it should be in the
ADR as a required step rather than assumed away. The practical ops notes belong with it:
fullscreen, cursor hidden, OS sleep disabled, and the tab reloaded once before doors open.

---

## 6. Cost

| Phase | Work | Days |
|---|---|---|
| 0 | ✅ **done (ADR-141)** — `routes-screen/` + rule 14 + the `useLineups` split + `/screen` | ½ |
| 1 | ✅ **done (ADR-141)** — `useScreenDeck` and its tests, written test-first | ¾ |
| 2 | ✅ **done (ADR-142)** — scenes 1–5: board, individuals, on court, just finished, up next | 1 |
| 3 | ✅ **done (ADR-140/142)** — the stream widening + the interrupt, with its floor | ½ |
| 4 | ✅ **done (ADR-143)** — scenes 6–7: the photo scenes, preloaded, with the pause interaction | ½ |
| 5 | ✅ **done (ADR-144)** — `screen.css` at projector scale, the staleness mark, the no-error rule | ½ |
| 6 | ✅ **done (ADR-145)** — the superadmin key panel and the copy; **rehearsal outstanding** | ½ |

**Phases 0–1 and three of the five scenes in phase 2 are shipped** (ADR-141), together with
the filmstrip motion model decided after this plan was written: scenes sit side by side on one
track, a change is a sideways scroll, and an alert dashes to a frame, dwells, returns and
resumes from where the cycle was. **Phases 2–3 followed in ADR-142**: the last two scenes and the live interrupt, including the
held alert for a result whose scene does not exist yet. **Phase 4 followed in ADR-143**: both photo scenes, each held off the strip until its images
have decoded, re-reading the listing as the scene leaves, and dropped by the social pause.
**Phase 5 followed in ADR-144**, which found that the stylesheet had been reading four tokens
this codebase has never defined: the body text was being projected at **1.33:1**, black on
black, with only the titles visible. It also replaced the planned connection dot with a mark
driven by failing *reads* (the socket going quiet costs this screen nothing, because every
scene is polled too), and fixed the no-error rule in place: nobody is holding this surface, so
it never shows a failure message. **ADR-145 finished the build**: the superadmin panel that mints a
screen, shows its `/screen?key=…` URL once and revokes it — and, before displaying it, made
`last_seen_at` true, a column that had been stamped at creation and never written again.
**All six phases are shipped.** The only thing left is a rehearsal on real projector hardware:
throw, contrast at ten metres, and whether six hours of the strip leaves any burn-in.

**≈ 4¼ days**, one ADR, no schema change. Phase 3 is the only part that touches shared
server code; everything else is additive, which also means it can be cut in half (scenes 1–5
only, polled at 15 s) for **≈ 2½ days** if the event is close.

---

## 7. Deliberately not in v1

- **An operator remote** (pause, skip, pin a scene). It is the obvious next ask and it is a
  *different surface* — a console page that writes a "screen command" the screen subscribes to.
  Rule 14 is what keeps that honest instead of bolting a keyboard handler onto the projector.
- **The bracket as a picture.** A drawn knockout tree is the most-requested projector thing and
  the most layout-expensive; "Up next" + "Just finished" carries the same information in list
  form. Revisit after one event.
- **Multiple screens with different decks** (`/screen?deck=photos`). Trivial to add later,
  pointless before anyone has asked for a second projector.
- **A QR code on screen** inviting people to join. Worth considering for the morning, but it is
  a product decision about sign-up flow, not a screen feature.

---

## 8. Decided 2026-10-04

1. **Build it — full scope** (~4¼ d), including the live stream and the match-completion
   interrupt.
2. **Auth:** a dedicated screen key. ✅ shipped as **ADR-140**.
3. **Photos:** project them live — with the three mitigations in D-6, which are now
   requirements rather than options.
4. **The stream widening:** approved, and shipped with the key (one null, no second endpoint).

Remaining: phases 0–2 and 4–6 of §6 — the `routes-screen/` surface, rule 14, the deck state
machine, the seven scenes, the projector stylesheet and ADR-141. The service worker (C2) is
**parked until after the event** by the same decision.

### Build order from here

1. `routes-screen/` + standards rule 14 + the `useBoard` viewer-overlay split + `/screen`
   rendering one real scene from a real key.
2. `useScreenDeck` test-first: cycle, skip-empty, **the interrupt floor first**, resume,
   pause-drops-photo-scenes, re-read between photo scenes (D-6's constraint).
3. Scenes 1–5, then 6–7, then `screen.css` at projector scale and the no-error behaviour.
4. ADR-141 and the projector rehearsal.
