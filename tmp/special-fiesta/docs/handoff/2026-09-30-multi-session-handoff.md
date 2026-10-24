# Multi-session handoff — 2026-09-30

Five agent sessions worked this repository in parallel, in **one shared working tree with one
shared git index**. This document is the collated state: who owns what, what is finished, what is
not, where the accounts disagreed, and which decisions are still the user's to make.

Produced by asking every live session directly (`avatar-cutout-tuning-ui`,
`retire-staff-chat-seed`, `gameboy-sprite-shading`, `special-fiesta-2d`). Two further sessions
named in those replies — `special-fiesta-ba` and `chat-gallery-implementation` — had already
ended and could not be asked; their work is attributed from the register and the log only.

---

## 1. Session roster and ADR ownership

| Session | ADRs owned | Code state | Uncommitted at handoff |
|---|---|---|---|
| `gameboy-sprite-shading` | **067, 068, 069, 070** | register entries committed; **implementing code was not** | the whole motif corpus (see §3) |
| `retire-staff-chat-seed` | **071** | committed: `4da1f66`, `2fa58a7`, `7847319` | 8 e2e screenshots (disputed, §4.1) |
| `avatar-cutout-tuning-ui` | **072, 073** | committed: `674ab3f`, `1bd87ad` | nothing |
| `special-fiesta-2d` | **066** | committed: `4d34148` | 4 e2e screenshots (disputed, §4.1) |
| *ended* (announcements) | **074** | committed: `3215717`, `201a881`, `4357b90`, `62a1704` | none found |

Register is internally consistent: ADR-061…074 all present, **no duplicate numbers**.

Three attributions were asserted wrongly by one session and corrected by its owner. Recorded so
the same guesses are not repeated:

- ADR-067–073 were *not* `special-fiesta-2d`'s; it owns 066 alone and said so.
- ADR-074 is *not* `retire-staff-chat-seed`'s. Its commit `7847319` cites 074 in the subject
  because it implements against it; the entry belongs to the ended announcements session.
- `62a1704` ("renumber the announcement ADR to 074, and hand 067 back") was *not* authored by
  `retire-staff-chat-seed`. It found ADR-067 duplicated, deliberately left both copies alone, and
  took a free number, landing on 071 after finding 069 and 070 already claimed.

### Known register defect, deliberately unfixed

**ADR-069 and ADR-070 sit *after* ADR-073 in the file** (lines ~2381 and ~2411 versus 073 at
~2342), because 071–073 were appended between the motif session's two batches. Navigation
annoyance only. Left alone on purpose: reordering a committed file that three sessions were
editing would have caused more harm than the disorder does.

---

## 2. Correlation of uncommitted work to ADRs

Every uncommitted path was checked against the ADR it cites. The result:

| Uncommitted group | Cites | Register entry exists? |
|---|---|---|
| `apps/web/scripts/motif-art.mjs`, `motif-palette.mjs` | ADR-070 | yes, committed |
| `apps/web/scripts/render-motif-sheet.mjs` | ADR-069 | yes, committed |
| `apps/web/src/lib/motifs.ts` | ADR-068 | yes, committed |
| `apps/web/src/lib/motifVersion.ts`, `motifSprites.test.ts`, `generate-motif-sprites.mjs` | ADR-067 | yes, committed |
| `apps/web/public/motifs/*.svg` (165), `docs/design/motif-catalogue.md`, `docs/screenshot/motif-sheet.png` | ADR-067/068 | yes, committed |
| `apps/web/src/styles/gameboy.css` | ADR-070 (bunting), ADR-074 (comment) | yes, committed |
| `apps/web/package.json` | none — adds the `motifs:review` script | n/a, tooling |
| `AGENTS-frontend.md` | none — corrects a stale scenery claim | n/a, convention doc |
| `screenshots/ft-chat-*.png`, `ft-team-chat-*.png` | none — e2e artifacts | n/a, artifacts |
| `docs/.DS_Store` | none — **macOS junk** | n/a, should never have been tracked |

**The headline finding: the register was ahead of the code.** Four decisions (ADR-067/068/069/070)
were documented and committed while every line implementing them sat uncommitted in the shared
tree — the exact inverse of the `AGENTS.md` rule that a decision is recorded *in the same change*
that makes it. That is what this handoff's commits close.

---

## 3. Outstanding work, by session

### `gameboy-sprite-shading` — motif corpus (ADR-067/068/069/070)

Shipped: **165 sprites** (16 legacy re-toned to four tones, 149 new). Six categories declared
exhausted: sentosa, sports, captain's ball, activity day, royalty, emoji.

Not started — absent, not broken:

- beach remainder: `seahorse`, `hermitcrab`, `driftwood`, `seaweed`, `deckchair`, `towel`,
  `snorkel`, `surfboard`, `bottleletter`, `sunscreen`
- wide tiles: `boardwalk`, `railing`, `netmesh`, `footprints`, `skyline`, `courtline`,
  `finishtape`

Inert but worth knowing: **ten of the twelve batch-1 sprites are drawn and reachable but not
placed on any surface** — `chat`, `bellalert`, `crown`, `emptybox`, `raincloud`, `whistle`, `net`,
`medal`, `cone`, `waterbottle`. They are in `MOTIF_NAMES` and render; nothing references them.

### `retire-staff-chat-seed` — social seeder (ADR-071)

Code complete. One documented limitation, recorded as unfixed item (a) in ADR-071: **re-running
`e2e/seed-social.spec.ts` duplicates gallery photos** — measured 31 photos across 10 captions
after three runs. The random byte tail is what makes a corpus file reusable at all, so idempotence
there needs its own guard. A limitation, not a defect.

### `avatar-cutout-tuning-ui` — cut-out tuning (ADR-072/073)

Complete, including the real-model seed re-record. Remaining known imperfection, bounded by test
rather than fixed: the prune runs on the mask, before quantising, so `despeckle` and the ink pass
can strand a few cells afterwards. 11 of 75 recorded avatars carry a 3–11 cell speck.
`seedIslands.test.ts` bounds this at 16 cells so a regression to a foreign object fails loudly
while a quantisation freckle does not. Cleaning it at source would need a second prune pass over
the painted grid, and risks eating legitimate few-cell detail such as an eye highlight.

### `special-fiesta-2d` — chat defect audit (ADR-066)

Complete. Findings 1/2/4 of its audit were taken by the ended `chat-gallery-implementation`
session as ADR-064/065; finding 3 is ADR-066, commit `4d34148`.

---

## 4. Conflicts and ambiguities

### 4.1 Screenshot ownership — unresolved, and the user should decide

`retire-staff-chat-seed` claims **all eight** `ft-chat-*` / `ft-team-chat-*` PNGs.
`special-fiesta-2d` claims **four** of them (`ft-chat-push-*`, `ft-chat-guards-*`). Both say they
are safe to commit or to drop. **Neither session personally observed the runs that produced them**,
so neither can attest they came from passing tests.

Both sessions reasoned from the repository's history, and the history was misleading. 22
screenshots *were* tracked and `8013925` is a commit whose whole purpose was committing them, so
`special-fiesta-2d`'s claim that "this repo has never tracked e2e screenshots" was factually wrong
about the past — and nonetheless arrived at the right answer.

**Resolution — the user's ruling, which overrides all of it: e2e screenshots do not belong in this
repository.** They were briefly committed in `0dac93b` on the tracked-artifact precedent; the user
corrected that immediately. The whole of `screenshots/` is now untracked and `screenshots/` is in
`.gitignore`, so the 22 historical ones are gone from tracking too and no future run can re-add
them. They remain on disk and regenerate from the suites that made them.

The lesson for the next session: **precedent in this repository is not the same as policy.** Four
sessions independently followed the `ft-<slug>-YYMMDD-HHMMSS.png` convention and two argued from it
in good faith, and it was never what the user wanted. Ask, or leave artifacts untracked by default.

### 4.2 `apps/web/src/styles/gameboy.css` — reported as contested, was not

`gameboy-sprite-shading` believed this file carried uncommitted edits from **both** it and
`avatar-cutout-tuning-ui`, and proposed either a hunk-wise split or letting the latter's
"comment-only" edit ride along.

**Checked and false.** The uncommitted diff contains zero `gb-controls`/`gb-range` lines; all of
it is motif work (the `.gb-banner::before` bunting rule plus seven rewritten `?v=` stamps) plus one
rewording of an **ADR-074 announcement-toast** comment, which belongs to the ended announcements
session, not to the cut-out session. The cut-out session's stylesheet work was already committed —
swept into `62a1704`. No split was needed.

The motif session's *constraint* still held and was respected: `gameboy.css`, `public/motifs/` and
`motifVersion.ts` are a unit, because `motifSprites.test.ts` asserts every `?v=` stamp in the
stylesheet equals `MOTIF_VERSION`. Splitting them ships a stylesheet pointing at sprites that no
longer exist.

### 4.3 The shared git index — the live hazard, with a body count

Five sessions, one index. `git add <paths>` does **not** bound a commit: anything another session
has already staged is committed with it. Three incidents, all real:

- `3215717` swept three other sessions' ADR entries in.
- `62a1704` committed `docs/addenda/ADDENDA.md` and `gameboy.css` wholesale, sweeping the cut-out
  session's ADR-072/073 entries and its `gb-controls`/`gb-range` CSS into a motif/announcement
  commit. Those two decisions are therefore recorded under someone else's commit.
- `201a881` committed a stale index and **reverted all three files** of `4da1f66`;
  `retire-staff-chat-seed` had to restore them in `2fa58a7`. Later, HEAD moving under the shared
  index made its new files read as staged *deletions*, which would have deleted
  `e2e/announcements.spec.ts` and four screenshots had anyone committed the index as-is.

**Mitigations that work, in order of preference:** build each commit through a private
`GIT_INDEX_FILE` (what `retire-staff-chat-seed` did); or `git commit -- <explicit paths>`, which
is path-limited and ignores the index for everything unnamed. Never `git add -A`. Verify the
committed blobs afterwards with `git show --name-only`. Check `git status --porcelain` for
foreign staged entries immediately before every commit.

### 4.4 `docs/.DS_Store` is tracked

`.gitignore:21` ignores `.DS_Store`, but `docs/.DS_Store` was committed before that rule existed,
so it keeps reappearing as a modification. **Resolution applied:** removed from tracking
(`git rm --cached`); the ignore rule then holds.

---

## 5. Environment hazards

### 5.1 `npm run dev` is broken on this machine

`apps/api/.data/dev` (136 MB) predates a schema change. `bootstrap.ts` decides whether to
provision by probing a single sentinel — `const SENTINEL = 'public.cluster'` (`bootstrap.ts:28`) —
and that table exists, so `ensureSchema` skips provisioning and the API dies at boot with
`relation "participant_title" does not exist`. **`npm run db:setup` uses the same sentinel and does
not help.** This is precisely the ADR-049 "a fresh `PGLITE_DATA_DIR` is required" case.

Working today: `PGLITE_DATA_DIR=.data/e2e npm run dev`.

**Open decision for the user — three options, none taken:**

1. keep using a throwaway data directory (`.data/e2e`), leaving `.data/dev` untouched;
2. re-apply `snapshot.sql` additively to `.data/dev`;
3. wipe `.data/dev` and reseed.

No session mutated or deleted 136 MB of the user's data unasked. Note also that
`apps/api/.data/` has accumulated **16 directories** (`demo`…`demo9`, `t1verify`…`t5`, `dev`,
`e2e`) from repeated recording and verification runs; all are gitignored, none are cleaned up
automatically.

### 5.2 A dev stack may be running that is not yours

`retire-staff-chat-seed` **had** a stack on :5173 and :8787 with `PGLITE_DATA_DIR=.data/e2e`. It has
since been stopped — a background process that hit its time limit, not a choice — so both ports are
free and the recorder's refusal condition no longer applies. The database survived: `.data/e2e` is
still on disk at 220 MB with the full working demo (80 personas, teams, matches, scans, gallery, chat,
a live announcement), and it is the largest of the 16 directories flagged above, so it is the one worth
keeping if that cleanup happens. Restart with `PGLITE_DATA_DIR=.data/e2e npm run dev`. It is *not* the stack the
cut-out session stopped (PIDs 15256/15313/15314) for the seed re-record. `npm run demo:record`
refuses to start while :5173 answers, so a future recording must coordinate.

### 5.3 The seed recorder does not clean up after itself

Two consecutive `demo:record` runs fail. The first run's stack survives its own teardown
(`[tsx] Previous process hasn't exited yet. Force killing...`), so the second run's health poll
reaches the *stale* API and aborts with "the server already has participants". Confirm the previous
stack is dead — and both ports silent — before re-recording. Worth its own addendum if it recurs.

### 5.4 E2E is not usable as an unattended gate

Chromium cannot obtain its Mach port bootstrap under macOS Seatbelt here:
`FATAL:mach_port_rendezvous_mac.cc:159 ... Permission denied (1100)`. Every Playwright run in this
session lineage needed an explicit sandbox escape. **Any session claiming an e2e pass should state
whether the sandbox was disabled**, or the claim is unverifiable. `git push` over SSH is blocked
for the same class of reason — the egress proxy cannot carry it.

---

## 6. Verification at handoff

Run against all sessions' combined work, immediately before the handoff commits:

| Layer | Result |
|---|---|
| `npm run typecheck` (3 workspaces) | clean |
| `npx eslint .` | clean |
| `node scripts/check-standards.mjs` | 306 files, 12 rules, **0 violations** |
| `apps/web` unit + hook | **512 passed** (58 files) |
| `apps/api` integration | **271 passed**, 3 skipped |

E2E was **not** re-run for this handoff; see §5.4. The last observed e2e passes were
`e2e/cut-out-tuning.spec.ts` (3 passed, chromium, sandbox disabled) and `e2e/chat.spec.ts`
(4 passed, per `special-fiesta-2d`, as of `4d34148`).

A red result from a future `npm run verify` should be read against the files it names before being
treated as a regression in any one session's work.

---

## 7. What the next session should pick up first

1. **Decide the `.data/dev` question** (§5.1). It blocks the default `npm run dev` for everyone.
2. **Place or retire the ten unplaced motifs** (§3). They are dead weight in `MOTIF_NAMES` until
   one or the other happens.
3. **Guard `seed-social.spec.ts` idempotence** (ADR-071 unfixed item (a)).
4. **Stop sharing one working tree.** Every incident in §4.3 traces to it. Separate worktrees per
   session would have prevented all three.
