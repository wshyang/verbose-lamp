# An Agenda tab — assessment and plan

Asked 6 Oct 2026: a seventh tab in the participant bottom nav showing the day's programme, with
its own icon motif, the content configurable by a superadmin and seeded into the demo.

**Status: BUILT, end to end (ADR-177).** Table, contracts, routes, participant surface,
superadmin screen and demo seed are all in. The question the document opened with — seventh tab
or not — was answered **not a tab**: a later ruling (6 Oct, after the programme arrived) put the
agenda in as a **third segment of the Ball tab**, `/feed/agenda`, alongside Results and Line-ups.
That is option C below, and it supersedes the earlier "on hold" ruling that this document carried
for a few hours. §1 is kept as the record of why six tabs was a decision rather than a default —
the next person who wants a seventh should have to read it.

---

## 1. The blocker: the nav is full, and that was a decision, not an accident

The bottom nav is a six-column grid. It is six because **ADR-046 declined a seventh tab**, and
**ADR-125 declined it again** — that is why chat and the photo gallery share one "Social" tab
instead of taking two. The reason is recorded in `gameboy.css:801`:

> six tabs since the Social tab arrived. At 320 px that is ~53 px each, which the 26 px icon and
> 8 px label still fit; a seventh would not

320 px is the repo's design floor, cited in six separate CSS comments. So the question is not
"can a tab be added" — trivially yes — but whether ADR-046's arithmetic still holds. It does:

| | 6 tabs | 7 tabs |
|---|---|---|
| Column width at 320 px | 53.3 px | **45.7 px** |
| 26 px icon | fits | fits |
| Touch target (WCAG 2.5.5 wants ≥ 44 px) | comfortable | **45.7 px — passes, barely** |
| Label budget at 8 px Press Start 2P (advance = 1 em, so 8 px per character) | 6 chars (48 px) | **5 chars (40 px)** |

So a seventh tab imposes a **five-character cap on every label**. Current labels: `QR` (2),
`Teams` (5), `Board` (5), `Feed` (4), `Social` (6), `Me` (2).

**Exactly one label breaks: `Social`.** And it is six characters on purpose — ADR-125 widened it
from "Chat" precisely so it would name both feeds behind it, because *"a dot that lies about what
is behind it is worse than no dot"*. Shortening it back to five is undoing a deliberate fix.

`Agenda` is also six, but that one is free to choose: `Plan`, `Today`, `Day` all fit.

> One caveat on the numbers. There is no headless browser in this workspace (ADR-013), so the
> 8 px-per-character figure is Press Start 2P's documented 1-em advance, not something measured
> here. The font is loaded from Google Fonts with `Courier New` as the fallback
> (`tokens.css:43`), and Courier New's 0.6-em advance would fit 6 characters even at 7 tabs — so
> **the constraint only bites when the webfont actually loads**, which is the normal case. Worth
> sixty seconds in a real browser at 320 px before anyone acts on this table.

### 1.1 The four ways out

| | Approach | Cost | What it breaks |
|---|---|---|---|
| **A** | **Seventh tab, labels capped at 5.** Agenda → `Plan`; Social → 5 chars | Low | Reverses ADR-125's naming fix. No 5-char word names chat *and* photos |
| **B** | **Seventh tab, raise the floor to 360 px.** 360/7 = 51.4 px → 6 chars fit, nothing renamed | Low | 320 px phones get a clipped label — degraded, not broken. Needs a product call on the floor |
| **C** | **No seventh tab — segment an existing one.** Agenda joins `Board` as "Standings \| Agenda" | Low | Nothing. This is what ADR-046 and ADR-125 both did |
| **D** | Shrink the nav font below 8 px | Low | Legibility, at the size where it is already marginal |

**RULED 6 Oct 2026: C — and not under Board, under the Ball tab.** The agenda is now the third
segment of `/feed`: Results | Line-ups | Agenda. Three segments at a 320 px floor is ~96 px each
against a widest label ("Line-ups") of 72 px, so it fits with room to spare and nothing was
renamed. The nav is untouched and still six tabs.

The recommendation below was written before the ruling and read B, then C, then A. The ruling
took C, and the reason it did is in the paragraph on C: the agenda is checked a handful of times
a day, which is segment traffic, not tab traffic. B is still the right answer the day somebody
genuinely needs a seventh tab.

**Original recommendation: B, then C, then A — and D not at all.**

B is the honest one. The real constraint is not "seven tabs is too many", it is "320 px is the
floor". A 320 px viewport today means an iPhone SE 1st generation (2016) or a phone in a split
screen; the common small phone is 360 px, and the current small iPhone SE is 375 px. If the floor
moves to 360, the seventh tab costs nothing at all and no label changes.

C is what the codebase has already decided twice, and is the right answer if the floor stays at
320. It also has a non-obvious merit: the agenda is something a participant checks a handful of
times a day, not a destination they live in — a segment inside Board is arguably the more honest
information architecture for it. The counter-argument, and it is a fair one, is that an agenda
read in a hurry in the rain wants to be one tap from anywhere, which is the same argument that
put the QR badge in the nav (F25 / DC-006).

A is listed for completeness. It trades a documented accessibility fix for a layout convenience,
which is the wrong direction.

**This needs a ruling before the tab is built.** Everything below (§2–§5) is independent of which
way it goes — the data model, the routes, the superadmin screen and the seed are identical
whether the agenda lands in a tab or a segment. Only ~20 lines of `GameboyShell.tsx` and one
`gameboy.css` rule differ.

---

## 2. The icon — BUILT

`agenda` is drawn, generated and registered: `motif-art.mjs`, `public/motifs/agenda.svg`,
`MOTIF_NAMES`, `SHIPPED_SIZES` at `[20, 26]`. Contact sheet at
`docs/screenshot/motif-agenda.png`; it passes `assertGrid` and the sprite-drift test.

**A clipboard run sheet with four rows, the third one gold.** The motif choices are deliberate:

- **Not a clock** — a clock answers "what time is it", which the phone's own status bar already
  answers. **Not a calendar page** — that answers "which day", which never changes during an
  event. What the tab holds is an *ordered list of things*, so the sprite is a list.
- **The gold row is "now"** — the one line a participant opens this tab to find. Gold because
  that is already the nav's current-tab colour, so the icon and the bar agree. It sits third of
  four so the sprite reads as mid-afternoon rather than "not started".
- **Distinct at 26 px** from the three sprites it could be confused with: `scoreboard` is a dark
  board with gold digits, `signpost` is wooden and arrow-shaped, `map` is folded and green. This
  is the only white rectangle with a steel clip.

Drawn to the ADR-070 four-tone standard: paper, ink, gold and steel ramps, key light upper-left,
highlight band on the top paper row, shadow band on the bottom.

---

## 3. Data model

One table, following ADR-168 for the column additions (`CREATE TABLE` plus an idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in the additive tail — never a `migrations/` folder).

```
agenda_item
  id              uuid primary key
  starts_at       timestamptz null            -- null = no fixed time; sorts first, never now/next
  ends_at         timestamptz null            -- null = a moment, not a block
  title           text not null               -- "Captain's Ball — group stage"
  location        text null                   -- "Courts 1–3" / "Pavilion"
  detail          text null                   -- one line of amplifying text
  is_active       boolean not null default true
  created_at      timestamptz not null default now()
```

Plus two CHECKs — an end requires a start, and an end must be after its start — and an
`ix_agenda_item_order (starts_at, created_at)`.

**Four** decisions worth stating, because each one has a cheaper-looking wrong answer:

0. **`starts_at` is NULLABLE.** The real run sheet opens with "before departure, have an early
   lunch", which has no clock on it at all. The two cheap answers were a nominal midday start —
   which the UI would then render as a time the item does not have, i.e. a lie — and an
   `is_preamble` flag, which says the same thing twice and lets the two halves disagree. A null
   start *is* "no fixed time". Null sorts first, and a timeless item is never now and never next.
1. **No `display_order` column.** The order is `starts_at`. A manual order that can disagree with
   the clock is a second source of truth, and the one it will disagree with is the one the
   participant is standing in.
2. **"Now" and "next" are DERIVED on read, never stored** — the same rule as the champion bonus
   (ADR-006) and the passport (ADR-176). `now` is the item whose window contains the request
   time; `next` is the earliest `starts_at` after it. Storing a `is_current` flag would need a
   cron to be true, and would be wrong between ticks.
3. **`is_active`, not `is_deleted`.** This is the (47) ruling applied here: when the rain moves
   the programme, a superadmin deactivates "Beach games" and activates "Pavilion games" rather
   than editing history. Cancelled items stay visible, struck through — a participant who
   memorised a 3 pm item needs to see that it is *cancelled*, not find it silently missing.

### Routes

| Route | Actor | Notes |
|---|---|---|
| `GET /api/agenda` | participant | Published items plus derived `now` / `next` |
| `GET /api/admin/agenda` | superadmin | Includes inactive |
| `POST /api/admin/agenda` | superadmin | |
| `PATCH /api/admin/agenda/:id` | superadmin | |
| `PATCH /api/admin/agenda/:id/active` | superadmin | Mirrors the court and activity toggles exactly |

**There is no DELETE, and the first build was wrong about that.** A `DELETE` route was written on
the argument that "cancelled" and "never happened" are different acts and an item typed in by
mistake deserves to vanish. `npm run standards` rejected it: the `no-hard-delete` rule is absolute
in this repository — rows are invalidated, never removed. The rule was honoured rather than
suppressed, and on reflection it is right: an item added in error can be edited into the item it
should have been, or left cancelled, and neither case is worth a second way for a row to leave the
database. `GET /api/agenda` is additionally a **guest** read — the run sheet is on a poster by the
registration tent, and somebody checking what time to turn up may not have signed in yet.

One behaviour the form depends on: **an omitted optional field clears it.** An edit form that can
empty a box has to mean what it shows.

---

## 4. What this unlocks for free

**G4, the run-sheet hall-screen scene, stops being a feature and becomes a view.** G4 is currently
"low–moderate" cost mostly because there is no programme data to render. Once `agenda_item`
exists, the tenth hall scene is a query and a layout — and §0's note that *"in a shortened
wet-weather run, when every memorised timing has moved, 'now: Captain's Ball · 4.30pm return to
the pavilion' helps the room more than another leaderboard refresh"* becomes cheap to satisfy.

Worth sequencing deliberately: build the table and the superadmin screen first, then the
participant surface and the hall scene both read it.

---

## 5. The programme — SUPPLIED 6 Oct 2026

The run sheet, as given. This is the authoritative copy: the slides were summarised once before
and the summary kept the points system and the activity list but dropped the timings, which is
why they had to be asked for twice. **Do not let this table be summarised away again.**

Per the standing instruction, personnel names and titles are omitted — one item carried a note
about who was scheduled to speak and who might replace them, and that note is deliberately not
recorded here. It is a programme, not a cast list.

| From | To | Item |
|---|---|---|
| — | — | Before departure: participants are advised to have an early lunch; **no food is provided** |
| 12.50 pm | 1.15 pm | Staggered departure from The Treasury and LTA Building |
| 1.45 pm | — | Meet at Emerald Pavilion |
| 1.50 pm | 2.00 pm | Opening speech |
| 2.00 pm | 2.15 pm | Mass warm-up (yoga stretch) |
| 2.15 pm | 2.30 pm | Emcee briefing; participants move to their first activity |
| 2.30 pm | 4.30 pm | **Captain's Ball (anchor), running alongside the fringe activities** |
| 4.30 pm | 4.40 pm | Activities close; everyone returns to the pavilion |
| 4.40 pm | 4.55 pm | Exhibition match: senior management team vs Captain's Ball winners |
| 5.00 pm | 5.10 pm | Closing speech |
| 5.10 pm | 5.20 pm | Prize presentation to the cluster with the most points |
| 5.20 pm | 5.30 pm | Group photo and end |

### 5.1 Four things the real run sheet changes

Reading the actual timings against the assessment turns up more than it was asked to.

1. **The knockout must be DECIDED by 4.30 pm, not merely finished.** The exhibition match at
   4.40 is against *the Captain's Ball winners*, so the final has to have produced a winner, been
   recorded, and had any correction applied inside the 4.30–4.40 changeover. The assessment
   treated 2.30–4.30 as a pacing window; it is actually a hard deadline with a dependency hanging
   off it. At 12-minute matches plus 3-minute gaps, a group stage and a knockout for 8–12 teams
   is tight — and §4's open question about whether the exhibition match scores now matters more,
   because it is played *after* the window the standings are computed from.

2. **The prize-giving is 40 minutes after the fringe closes, and the gap is full.** 4.30 close →
   5.10 prizes, with the return to the pavilion, the exhibition match and the closing speech
   inside it. There is no quiet half-hour in which to reconcile anything by hand. This is exactly
   the case T1/G1 was argued on, and the run sheet confirms the argument: the passport bonus had
   to be computable, because nobody is reconciling 250 passports between 4.55 and 5.10.

3. **The event does not start at 1 pm.** The assessment's header says 1 pm–5.30 pm. The real shape
   is a staggered departure from 12.50, a 1.45 muster, and the first activity at 2.30. Corrected
   in the assessment doc.

4. **There is a 4.55–5.00 pm hole**, unlabelled. Harmless, but if the exhibition match runs long
   it is the only slack in the afternoon — worth knowing that it is five minutes.

### 5.2 Seeding it

**DONE.** `ensureAgenda()` in `scripts/seed-demo.mjs` posts all twelve rows through the real
superadmin route, and `seed-demo.sql` is re-exported: 628 rows across 24 tables.

Two details. The times are anchored to the demo's **own today** rather than to a fixed date, so a
walkthrough on any day sees a programme with a plausible now and next instead of one that finished
months ago — the shape of the afternoon is what is being demonstrated, not the date. And the first
row is seeded with a null `starts_at`, which is the §3 decision paying for itself: the preamble
needed no nominal time, no `is_preamble` flag and no day-level notes field.

---

## 6. Cost

| Piece | Cost | State |
|---|---|---|
| Icon motif | — | **Done** |
| Table + repository + contracts | Low | **Done** |
| Routes (five, not six — no DELETE) | Low | **Done**, 8 API tests |
| Superadmin CRUD screen | Moderate — the largest single piece | **Done** |
| Participant surface | Low | **Done** — `/feed/agenda`, 6 web tests |
| Demo seed | Low | **Done** — twelve rows, re-exported |
| G4 hall scene, afterwards | Low once the table exists | Out of scope here |

The estimate held: the superadmin screen was the largest single piece, and nothing was hard. Both
of the "blockers" were decisions, and both were decided — the tab question by ruling, the preamble
question by making `starts_at` nullable.
