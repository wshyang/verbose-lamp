**Phase | Progress:** Problem definition | No solution proposed

---

# Running a Tournament Day — Problem Specification

**Version:** 1.0 | **Status:** Problems only — abstracted | **FDS Builder v2.0**

> This document names **problems**, not a system. It contains no objects, no
> data, no screens, no technology and no design. Anything that sounds like a
> solution has been removed. If a sentence could be pasted into a build plan,
> it does not belong here.

---

## Metadata

| Field | Value |
|---|---|
| Domain | A single-session team tournament, run in person, at one venue, by a small operating team |
| Setting | Teams arrive on the day, play short matches against each other on a small number of shared playing areas, and a winner (or final order) is declared before everyone goes home |
| Scale (typical) | A handful to a few dozen teams; one to a handful of playing areas; a few hours of usable play |
| Who feels the problems | The organiser accountable for the day, the operators running play at the areas, the teams playing, and anyone watching who wants to know where things stand |
| Explicitly out of scope | How anything is built, stored, calculated or displayed (see §7) |

---

## Conventions

### Problem IDs

`P-NN` — one problem each. A problem is stated so it can be *recognised on a
real day* and *argued about* without knowing anything about software.

### Tags

| Tag | Meaning |
|---|---|
| `[ALWAYS]` | Present in every tournament day, whatever shape the day takes |
| `[SHAPE]` | Appears only when the day is given a structure (groups, elimination, placements) |
| `[DISRUPTION]` | Caused by the day going off-plan: lateness, absence, weather, time running out |

### How to read a problem

Each problem has four parts:

- **Problem** — what goes wrong, in the language of the day itself.
- **When it bites** — the moment on a real day when it stops being theoretical.
- **Forces** — the things pulling in opposite directions, which is why the
  problem is hard rather than merely unsolved.
- **Solved looks like** — what people on the day can do, say or point to when
  the problem is handled. Observable, checkable, and deliberately silent on
  *how*.

### Roles (people, not system parts)

| Role | Who they are |
|---|---|
| Organiser | Owns the day: decides its shape, answers for its fairness, calls its end |
| Operator | Stands at a playing area: gets matches on, keeps the score, deals with what actually happens |
| Team | A group that turned up to play, under a name the room knows them by |
| Watcher | Players between matches, supporters, anyone asking "who's winning?" |

---

## Table of Contents

1. Executive Summary
2. The Day as It Actually Happens (background)
3. Problem Catalogue
4. How the Problems Fight Each Other
5. What a Solved Day Feels Like
6. One Day, Several Shapes (variations as problem differences)
7. Problems We Are Deliberately Not Solving
8. Open Questions
9. Assumptions

---

## 1. Executive Summary `#sec-summary`

A tournament day is a promise made under uncertainty: *everyone who came will
get a fair share of play, the contests will mean something, and by the end
there will be an order the room accepts* — made before anyone knows exactly
who will turn up, on a small number of playing areas, inside a fixed amount of
daylight, run by a few people who also have to watch the games.

The day starts with intentions and immediately meets reality. Teams arrive
late or not at all. A match runs long. Rain takes an hour. Someone asks who
plays next, someone else asks why *they* have already played twice, and a
third person wants to know whether the game just finished counted. Every
answer has to be given on the spot, out loud, and stay true for the rest of
the day — because the final order will be read out in front of the people it
ranks, including the people it ranks last.

This document reduces that afternoon to the problems it actually consists of.
There are **sixteen**, in five families:

| Family | Problems | One line |
|---|---|---|
| A. Knowing who is here | P-01 – P-03 | The field is unknown until arrival, changes all day, and still has to be one agreed list |
| B. Deciding what happens next | P-04 – P-06 | Scarce areas, scarce teams, and a plan that reality keeps editing |
| C. Agreeing what happened | P-07 – P-09 | A result must be one fact, recorded once, correctable without becoming fiction |
| D. Saying who is ahead, and who goes through | P-10 – P-12 | Ranking the level, separating the tied, and cutting a field without guessing early |
| E. Finishing, and being believed afterwards | P-13 – P-16 | Ending on time, ending defensibly, and remembering yesterday without confusing it with today |

Two findings fall out of the list, and they are the reason for writing it:

1. **Most of the day needs no structure at all.** Eleven of the sixteen
   problems `[ALWAYS]` exist on the simplest imaginable day — teams, areas,
   play, a final order. The structured shapes (groups, elimination) add only
   `[SHAPE]` problems. Any way of running the day that makes the simple day
   carry the structured day's burdens has the dependency backwards.
2. **The recurring tension is authority.** Again and again the choice is
   between what was decided in advance and what the people running the day
   can see in front of them (P-05, P-09, P-11). The problems do not resolve
   that tension. They insist it be faced in the open, with the reason spoken
   where the room can hear it, instead of being settled quietly by whichever
   rule happened to be written down first.

---

## 2. The Day as It Actually Happens (background) `#sec-background`

No problems yet — just the afternoon every problem below lives in.

**Before play.** An organiser has a venue, a date, and an idea of the day's
shape: perhaps everyone plays everyone; perhaps groups, then a final. They do
not have a field. They have *registrations, intentions and rumours*, which are
three different numbers. They also have a fixed amount of usable time —
daylight, venue hours, people's trains home — and match lengths that are
aspirations until the first one runs long.

**Arrival.** Teams turn up, mostly. Names get written down by whoever is
holding the list, in the order people arrive, with the spelling of the moment.
Two more teams are "five minutes away" for forty minutes. One team has three
players. One has nine and wants to know if that is allowed. The day has to be
able to *start* — first matches on, people playing — before any of this
settles, because a venue full of standing-around is the one outcome worse
than an imperfect draw.

**Play.** Matches happen on a small number of areas, so at any moment most
teams are waiting and most areas are precious. An operator per area (on a
good day) gets pairs on, keeps score, and ends matches. Scores are called
out, disputed cheerfully, occasionally disputed otherwise. A team that just
walked off should not walk straight back on while fresh teams sit; a team
that has waited an hour should not be sent home having played once. Everyone
can see everyone else's day, and they keep score socially even when nobody
asks them to.

**Drift.** This is the normal case, not the edge case: a team leaves early; a
team arrives at midday and wants in; the rain takes the middle hour; one area
becomes unusable; the final has to move earlier because the venue wants its
space back. Each event quietly invalidates whatever was announced in the
morning. The day's running order is therefore not a plan being executed but a
position being continuously re-taken.

**The end.** Play stops — on time, ideally; credibly, at minimum. An order is
declared: a winner, finalists, or a full ranking, depending on the shape.
Then prizes, photographs, and the particular silence that follows if the
order cannot be explained. Weeks later someone asks how a team finished.
Nobody remembers the same afternoon, and the only witness that does not argue
back is whatever was written down at the time — if anything was.

**What "good" means here** (the standard every problem in §3 is measured
against): games actually happen; share of play is visibly fair; the running
order survives drift without ceremony; every result is one agreed fact; the
standing can be read at any moment and explained in one sentence per line;
nobody goes through, or goes home, on the strength of unfinished business;
and the final order can be defended, line by line, to the team it put last.

---

## 3. Problem Catalogue `#sec-problems`

### Family A — Knowing who is here

#### P-01 — The field is not known until it arrives `[ALWAYS]`

- **Problem:** The day must be planned (areas booked, time budgeted, a shape
  chosen) before the one fact it all depends on — *who is actually playing* —
  exists. Registrations overstate the field (no-shows) and understate it
  (walk-ins, in the same breath).
- **When it bites:** The morning announcement. Any shape declared over the
  registered field is wrong by the first whistle, in one direction or both.
- **Forces:** Deciding early (the room wants to hear the shape) vs deciding
  truly (the shape is only real once people are standing there).
- **Solved looks like:** The day can begin — first matches played — with the
  field still settling, and the declared shape, whenever it is declared, is
  declared over the teams who are *here*, with latecomers handled by P-14
  rather than by nobody mentioning them.

#### P-02 — One agreed list of who is playing `[ALWAYS]`

- **Problem:** Names arrive at different doors, at different times, from
  different mouths. Without a single agreed list, two operators run two
  different days in their heads: a team plays twice under two spellings, or
  waits forever under one nobody calls.
- **When it bites:** "We already played them." / "Nobody told us we were on."
- **Forces:** Writing names down fast (a queue at the desk, games to start)
  vs writing them down *once, unambiguously* (the list everything else —
  fixtures, standings, prizes — will trust).
- **Solved looks like:** At any moment, anyone running the day can point to
  the same list and say *these are the teams, in this order*; a name is on it
  once or not at all; and the order teams were added is remembered, because
  several later fairness questions ("who was here first?") are answered from
  it and from nothing else.

#### P-03 — A team that stops playing is not a team that never played `[DISRUPTION]`

- **Problem:** Teams withdraw: injuries, trains, a lost third game and a lost
  mood. Their past matches happened — opponents earned those results — but
  their future matches cannot. Treating them as *gone* rewrites other teams'
  days; treating them as *present* schedules ghosts.
- **When it bites:** The next scheduled match involving the departed team, and
  every later reading of the standing, where their results still sit.
- **Forces:** Respecting what was played vs keeping what is still to play
  honest; sympathy for the departed vs fairness to everyone who beat or lost
  to them.
- **Solved looks like:** Played results stand and are visibly theirs; no new
  match is offered to a team that has left; and wherever their absence leaves
  a hole (an unplayed fixture, an incomplete group), the hole is *shown as a
  hole* with its reason, not silently papered over.

---

### Family B — Deciding what happens next

#### P-04 — Scarce areas, scarce teams, nobody idle, nobody doubled `[ALWAYS]`

- **Problem:** At any moment the day must answer: *what goes on each area
  next?* A team cannot be in two matches at once; an area cannot hold two
  matches at once; yet areas standing empty while teams wait is the day
  visibly failing, and a team summoned twice at once is the day visibly not
  knowing its own mind.
- **When it bites:** Every changeover, all day. It is the day's most frequent
  question and the one with the least time to answer it.
- **Forces:** Using every area now vs holding a pairing back so a better one
  (fairer rest, a match that matters more) can happen in ten minutes;
  deciding centrally vs letting each area's operator just get on with it.
- **Solved looks like:** Every free area has a next match that can start
  *now* — both teams present, rested enough, not already playing — and every
  operator, looking at the same moment, reaches the *same* answer, so no
  team is summoned twice and no startable match waits behind an empty area.

#### P-05 — The plan meets the afternoon `[ALWAYS]`

- **Problem:** Whatever running order was announced was written about a day
  that has since changed (see §2, Drift). Operators on the spot can see what
  the plan cannot: these two teams are ready *now*, that pair should play
  later, this match matters and that one can wait. If the announced order
  cannot bend, it breaks — usually by being quietly ignored, after which
  nobody knows which matches were real.
- **When it bites:** The first late arrival, the first long match, the first
  shower of rain — i.e., before midday, on every real day.
- **Forces:** The authority of the announced order (fairness as *keeping
  promises*) vs the authority of the desk (fairness as *responding to what is
  in front of you*); flexibility for operators vs consistency across areas.
- **Solved looks like:** Operators can reorder, re-pair and improvise *in the
  open*, and a match played by hand counts exactly as much as a match played
  as announced — there is no second-class "friendly" that everyone played in
  and nobody counts. The day's record follows what happened, not what was
  supposed to.

#### P-06 — A fair share of play, visibly `[ALWAYS]`

- **Problem:** Teams compare days. One team plays four matches before lunch
  while another plays one, and no final standing, however correct, repairs
  the feeling — or the fact — of an unfair afternoon. Rest matters too: a
  team sent straight back on against a rested opponent has been handicapped
  by the schedule, not beaten by the opposition.
- **When it bites:** In the waiting areas, continuously, and in the first
  complaint that begins "we haven't been on since…".
- **Forces:** Keeping areas busy (play whoever is free) vs spreading play
  evenly (hold a ready team back); finishing the scheduled matches vs giving
  everyone *enough* matches; equality of matches vs equality of *rest*.
- **Solved looks like:** At any moment the day can show that no waiting team
  has been starved while others feast — appearances are spread, nobody is
  asked to play back-to-back while an opponent rested, and a pairing that has
  been passed over keeps being offered rather than starving at the back of
  the queue. When every pairing has happened, further play (rematches) is
  offered honestly as such, not disguised as unfinished business.

---

### Family C — Agreeing what happened

#### P-07 — What counts as a result `[ALWAYS]`

- **Problem:** A match ends. What, exactly, has been established? A score,
  certainly. But is a level score a result (a draw), a non-result (play on),
  or a failure (someone must win)? Is a match one team never showed up for a
  result, a walkover, or a hole? Different moments of the day need different
  answers, and a room that has not settled the question settles it loudly, at
  the worst moment — beside the final table.
- **When it bites:** The first drawn match; the first no-show; the first
  elimination match that ends level with the light going.
- **Forces:** The score as the whole truth (simple, hard to dispute) vs the
  realities it cannot express (forfeits, abandonments, a winner needed where
  the scores are level); finishing matches quickly vs finishing them
  *decisively*.
- **Solved looks like:** For every match that ends, everyone — operators,
  teams, watchers, the final reading — can say what was established, in the
  same words; a level score has a settled meaning *for that kind of match*;
  and the cases the score cannot speak for (a team that never appeared, a
  match abandoned) are recognised as a genuine gap to be decided about, not
  faked with an invented score.

#### P-08 — One fact, recorded once, the same everywhere `[ALWAYS]`

- **Problem:** A result is witnessed by two operators, three players and a
  watcher with a phone. If it is written down twice, differently, the day now
  holds two truths and every later answer (standing, next match, final
  order) depends on which one you happened to read. Even written once, a
  result captured wrong — fat fingers, wrong pair, score transposed — is a
  wrong fact everyone will trust.
- **When it bites:** "That's not what the board said ten minutes ago." Also:
  silently, when two parts of the day drift apart and nobody notices until
  the prizes.
- **Forces:** Speed of recording (next match waiting, hands full) vs care;
  many hands helping vs one version of the truth; correcting an error vs
  preserving what was, at the time, agreed.
- **Solved looks like:** Each match has exactly one result, held in exactly
  one place in everyone's mind; two people recording the same match at the
  same moment cannot create a contradiction without one of them being told,
  there and then, that the fact has moved; and every reading of the day —
  desk, wall, final sheet — is the same reading.

#### P-09 — Putting a result right without making it up `[ALWAYS]`

- **Problem:** Some recorded results are wrong, and some right results
  produce outcomes the room considers wrong (the wrong team was sent through
  on a misread table). Corrections are necessary and dangerous: a day where
  results can be quietly rewritten is a day whose final order nobody has to
  believe.
- **When it bites:** The misrecorded score discovered two rounds later; the
  advancement the desk announces and the room disputes.
- **Forces:** Accuracy (the truth should win) vs finality (at some point the
  day must be *settled*, or nothing is); the desk's judgement (P-05's
  authority, again) vs the recorded fact.
- **Solved looks like:** A wrong score can be corrected and everything that
  followed from it visibly follows the correction; a result that has already
  *sent people somewhere* (onto a pitch, into a final, home) is treated as
  history and handled by an attributable decision with its reason spoken —
  not by quietly editing the past until the present looks inevitable. (How
  far back corrections reach, and who may make them, is left open in §8 for
  a reason: it is a values question wearing an administrative coat.)

---

### Family D — Saying who is ahead, and who goes through

#### P-10 — Who is ahead, at any moment, in words a room accepts `[ALWAYS]`

- **Problem:** Between matches, everyone asks for the standing. Producing it
  is not arithmetic alone: teams level on the obvious measure must be
  separated by *something*, and the something decides afternoons. A ranking
  rule the room has never heard of, applied for the first time at the moment
  it eliminates somebody, is experienced as rigging even when it is merely
  obscure.
- **When it bites:** Every glance at the board; decisively, at any tie that
  straddles a meaningful line (top, qualification, last).
- **Forces:** Richness of the rule (reward wins, then draws, then margin,
  then the match between the tied teams, then…) vs legibility ("they're
  ahead because they beat you" fits in one sentence; a five-step rule with
  exceptions does not); rewarding dominance (big wins) vs rewarding results
  (winning at all); separating everybody vs admitting that some ties are
  honestly arbitrary and should be owned as such.
- **Solved looks like:** The standing can be produced at any moment from the
  results so far, in one agreed order; every line of it can be explained in a
  sentence a losing captain accepts as a *reason*; ties are separated by a
  rule stated before it matters, and where separation is genuinely arbitrary,
  it is visibly arbitrary (earlier arrival outranks later, say) rather than
  dressed up as merit.

#### P-11 — Cutting a field without guessing `[SHAPE]`

- **Problem:** Structured days send some teams on and others home (or into
  lesser matches). The cut must be made from standings that are, at the
  moment of cutting, possibly incomplete — matches still owed, a table that
  one corrected result would overturn. Sending a team through on a forecast,
  then watching the forecast change, is the day's least forgivable act:
  someone was promised, or denied, a place that was never theirs.
- **When it bites:** At every group-to-knockout boundary, especially when one
  group finishes an hour before another, or finishes short (P-03's hole).
- **Forces:** Momentum (start the elimination matches, the light is going)
  vs completeness (nothing decided until everything it depends on is
  finished); the table's answer vs the desk's knowledge (form, a walkover's
  distortion, a result everyone saw and nobody trusts).
- **Solved looks like:** Nobody plays an elimination match on the strength of
  an unfinished table: progression fixtures exist as *forecasts* ("winner of
  this group plays…") that everyone can read, and become real only when every
  result they depend on is in and the decision to advance has actually been
  taken — by a named person, who may, with a stated reason, advance a team
  the table did not choose (P-09's authority, exercised at exactly the moment
  it matters), after which later corrections move tables but no longer move
  people.

#### P-12 — The arithmetic of awkward numbers `[SHAPE]`

- **Problem:** Fields refuse to be tidy. Split into groups, they leave a
  group of one (nobody to play) or groups of lopsided size; sent into a
  single-elimination bracket, they rarely number a power of two, so some
  teams must sit out a round (byes) and *which* teams sit out is an advantage
  someone must be given on purpose; and beaten semi-finalists may or may not
  have a third-place match to play, depending on whether the bracket's shape
  even produced two of them.
- **When it bites:** At the draw (a group of one is a team sent home by
  arithmetic); at the bracket (a bye given carelessly is a free round given
  to the wrong team — or a first round with an empty match nobody plays).
- **Forces:** Mathematical tidiness vs the room's sense of desert (a bye is
  earned by finishing top, or spread so bye-teams meet match-winners, never
  each other while others fight); completeness (everyone plays every round)
  vs honesty (offering no match at all beats inventing one for a place
  nobody can occupy).
- **Solved looks like:** No team is drawn into a group where it has nobody to
  play; byes go where a stated principle says they go, are visible as byes
  (a team advanced, not a phantom match), and are spread so rested teams meet
  tested ones where numbers allow; a placement match exists exactly when the
  bracket genuinely produced two teams to contest it.

---

### Family E — Finishing, and being believed afterwards

#### P-13 — Will it fit? Is it still fitting? `[ALWAYS]`

- **Problem:** The day owns a fixed amount of time and an amount of play that
  grows with the field (everyone-plays-everyone grows quadratically; groups
  grow by group; elimination adds rounds nobody counted at breakfast). A day
  discovered not to fit at four o'clock has no good moves left — only shorter
  matches, dropped fixtures, or an unfinished final.
- **When it bites:** At setup (a shape chosen that the field makes
  impossible), and again at every drift event, when yesterday's arithmetic
  is quoted at today's rain.
- **Forces:** Ambition (more play, fairer shapes) vs the clock; announcing a
  confident schedule vs keeping the promise modest and the day adaptable.
- **Solved looks like:** Before play, and after every change, someone can say
  in one sentence what the remaining play costs in time on the available
  areas ("this is 28 matches, five and a half hours of court time") and
  whether it fits — as an honest estimate that informs choices, never as a
  gate that refuses to start a day the room wants to run anyway.

#### P-14 — Latecomers, early leavers, and the moving finish line `[DISRUPTION]`

- **Problem:** The day's population and deadline both move. A team arriving
  at midday wants matches; a group that gains a team is a different group.
  The organisers may need to end early, or may gain an hour. Every such
  change asks: what happens to play already shaped around the old facts —
  and the answer "start again" is available only before the first whistle.
- **When it bites:** At the arrival (the day's shape quietly re-deals itself
  around people already playing); at the early finish (a final unplayed, a
  standing unready to be declared final).
- **Forces:** Hospitality (let them play — they came all this way) vs
  integrity (the teams who arrived on time played the day they were told);
  ending cleanly vs ending completely (every fixture played, or a defensible
  order from what was?).
- **Solved looks like:** Before anything is played, change is cheap and is
  offered freely. After play has begun from an announced shape, change is
  *possible but priced*: what it disturbs is said out loud before it is
  done, a late team is fitted in where it can actually get games rather than
  where arithmetic finds a gap, and ending early produces a declared order
  from what was played — with what was *not* played recorded as such — rather
  than a day that simply stops being answerable.

#### P-15 — Ending the day, and saying so `[ALWAYS]`

- **Problem:** A day must end as an act, not a fade: a moment after which
  results stand, the order is declared, and further play is next time's
  business. But ending while a match is still being played strands that
  match between worlds, and ending *at* people (rain, venue, darkness) means
  the act is sometimes forced before the day is complete.
- **When it bites:** The last hour: one long match between the room and the
  announcement; or the sudden end, where the question is whether what exists
  is a result or a ruins.
- **Forces:** Completeness vs the deadline; the organiser's authority to call
  time vs the operators' knowledge that one match is two minutes from done.
- **Solved looks like:** The day is closed by a named person as a deliberate
  act; it cannot be closed *over* a match in progress without that match
  being ended or called off first; if it is closed incomplete, the reason is
  stated and kept with the day (P-14), and afterwards the day is read, not
  played.

#### P-16 — Remembering yesterday without confusing it with today `[ALWAYS]`

- **Problem:** Days repeat: weekly leagues, annual tournaments, "same time
  next year, but…". Yesterday's field, results and grievances are evidence
  and context — and a trap, if today's day silently inherits yesterday's
  teams, prices or half-finished business.
- **When it bites:** At next week's setup ("are the Reds still…?") and in
  the argument, months later, about how a team finished.
- **Forces:** Continuity (regulars expect to be known) vs a clean sheet
  (today's day decided by today's arrivals — P-01 again, across a longer gap).
- **Solved looks like:** Every finished day remains readable as itself —
  who played, what happened, what order was declared, why it ended early if
  it did — and a new day starts answerable only to the people who turn up
  for it. History is available to read and impossible to accidentally play.

---

## 4. How the Problems Fight Each Other `#sec-tensions`

The catalogue is a list; the day is a knot. The standing tensions, named so
they can be decided deliberately rather than discovered mid-afternoon:

| Tension | Between | The decision nobody can dodge |
|---|---|---|
| Advance promise vs present truth | P-05 ↔ P-11 | How far ahead may the day commit (fixtures announced, places promised) before its commitments start lying about the afternoon? |
| Desk authority vs recorded fact | P-05, P-09, P-11 ↔ P-08 | The desk can see things the record cannot. Every exercise of that sight must leave a reason behind, or the record stops being believable — including by the desk, next week. |
| Fairness of share vs fullness of play | P-06 ↔ P-04, P-13 | Playing whoever is free fills areas and starves the rested; rationing for fairness idles areas and shortens the day. |
| Simplicity of the standing vs justice of the standing | P-10 ↔ P-11 | Every extra separating rule is fairer in the case it was invented for and less explainable in all the others — at the exact moment (the cut) where explainability matters most. |
| Decisiveness vs the drawn game | P-07 ↔ P-10 | Group play needs draws to mean something; elimination needs them to mean nothing. One afternoon contains both, sometimes one match apart. |
| Hospitality vs integrity | P-14 ↔ P-01, P-02 | Every late team welcomed is the on-time teams' day rewritten. There is a point after which welcome becomes a cost imposed on others; the day must know where its point is before it is reached. |
| Memory vs the clean sheet | P-16 ↔ P-01 | What carries over between days (names? prices? grudges?) is a decision, and "everything, silently" and "nothing, ever" are both available failure modes. |

A running theme is worth stating once: **several problems are the same problem
at different hours.** The single agreed list (P-02) is the standing (P-10) is
the final order (P-15) is yesterday's record (P-16) — one thread of *agreed
truth about the day*, asked at increasing stakes. Likewise P-04, P-06 and P-13
are one question — *what should happen next, fairly, in the time left?* —
asked at the scales of minutes, matches and hours. Solutions may differ; the
problems should not be mistaken for sixteen separate ones merely because they
have sixteen numbers.

---

## 5. What a Solved Day Feels Like `#sec-solved-day`

Three short days, told as acceptance. If a proposed way of running things
cannot tell all three without embarrassment, it has not solved the catalogue.

**The plain day.** Eight teams, one area, everyone plays everyone, no
elimination. Setup is one conversation and a sentence about whether it fits
(P-13). Play starts before the field has finished arguing about sandwiches
(P-01). The operator never thinks about fixtures; the answer to "who's next"
is always available and always the same on every tongue (P-04, P-05). A drawn
match is a draw (P-07). The standing is read out at lunch and defended line
by line (P-10). Two teams arrive late and are absorbed without re-announcing
the day (P-14, cheaply, because nothing structural was ever promised). At the
end, one press of the organiser's will (P-15): the order is the order, and
next month it can still be read (P-16). *Note what this day never needed:
groups, draws, advancement, byes. It must not be made to carry them.*

**The structured day.** Sixteen teams, groups, then semi-finals and a final,
with a third-place match. The draw is made over the teams present (P-01),
can be re-made freely until the first match is played from it, and cannot
thereafter be re-made under results already earned (P-14). Groups play;
their standings use the *same* ranking rule as the plain day's (P-10 — one
afternoon, one meaning of "ahead"). Elimination places are forecast on the
wall all day ("winner of this group plays…") and become real only when every
group is decided and a named organiser confirms who goes through — including,
once, a team the table placed third, advanced for a stated reason the room
heard (P-11, P-09). A level semi-final cannot simply be declared finished
(P-07); the final is not offered until both semi-finals have produced
finalists (P-12). Rain takes an hour; the day is re-priced in one sentence
and closed early with the reason kept (P-13, P-15).

**The day it rains.** Nine teams, three areas, one area lost at midday, a
team gone home by two, a final that must start by four. Nothing about the
morning's intentions survives intact, and the day still works: the departed
team's results stand and its holes show (P-03); the running order is
re-taken continuously without any match becoming unofficial (P-05); the
standing at the forced close is declared from what was played, with the
unplayed remainder named rather than hidden (P-14, P-15); and the argument
in the car park is about a decision someone made and stated, not about what
the record says — because the record, read anywhere, says one thing (P-08).

---

## 6. One Day, Several Shapes (variations as problem differences) `#sec-shapes`

Different gatherings are not different sports; they are different *selections
from the catalogue*. Stating them as problem selections is what keeps the
plain day plain.

| Shape of day | Catalogue selection | Problems that define it (beyond `[ALWAYS]`) |
|---|---|---|
| **Open day** — call matches as they come; final standing is the day | P-01 – P-10, P-13 – P-16 | None. This is the catalogue with nothing added, and it is the baseline every other shape must reduce to when its extras are removed |
| **Everyone plays everyone, one table** | Open day, with P-06 promoted to the organising principle | The owed-pairing question (who has not met whom) *is* the day; fairness of share (P-06) and the fitting question (P-13, quadratic growth) dominate |
| **Groups, no progression** | + P-12 (group arithmetic) | The draw: fairness of the deal, a group of one, groups finishing unevenly — with no cut (P-11) to make the draw's fairness matter beyond pride |
| **Groups, then elimination** | + P-11, P-12 in full | The cut, the bracket, byes, the level elimination match, the third-place question — the entire structured burden, arriving exactly here and nowhere earlier |
| **Straight elimination** | P-11, P-12 without group play | The ranking problem (P-10) is replaced by a *seeding* problem the catalogue otherwise refuses to invent: on what grounds is the first-round order set before anyone has played? (§8, Q4) |
| **Repeated rounds (Swiss-like)** | P-10, P-11 re-asked after every round | Each round's pairings depend on the standing so far, so "what happens next" cannot be known a round ahead — the only shape where P-04's answer is genuinely round-by-round |

**The draw itself is a problem, not a ceremony (P-12, P-14).** Teams must be
divided so that no division is visibly rigged, the division can be shown to
have been arrived at fairly (and, if challenged, arrived at *again* with the
same result while nothing has been played), and a room that dislikes the
division can have it re-done cheaply — three wants that pull apart: a draw
nobody can reproduce looks arbitrary; a draw anybody can re-run invites
shopping for a kind one; a draw fixed the moment it is made cannot absorb
the team that arrives during it. Who is allowed to re-draw, and until when,
is part of the problem, not an implementation detail.

---

## 7. Problems We Are Deliberately Not Solving `#sec-nongoals`

Listing these is part of the specification: each is a real problem, adjacent
to the day, that would swallow it if admitted.

- **Who the players are.** Sign-up, identity, eligibility, team formation,
  rosters, who may play for whom. The day needs *names it can call out*
  (P-02); the lives behind the names are another, larger problem set.
- **Money, prizes, and points that outlive the day.** What a win is worth
  *within* the day's standing is P-10's business. Leagues of days, prize
  economies and season points import P-16 at full strength and deserve their
  own specification.
- **Officiating.** Whether the ball was in. The day records what the room
  settled on (P-08); it does not settle it.
- **Communication at scale.** Announcements, notifications, spectators at a
  distance, broadcasts. Watchers in §2 are *in the room*; reaching beyond
  the room is a distribution problem, not a tournament problem.
- **Many days at once, many venues at once.** A3 in §9: composition of days
  is contemplated (P-16); simultaneity is not.
- **Safety, welfare, weather judgement.** The day *responds* to rain (P-14);
  deciding whether play is safe is a human duty the problems assume is being
  discharged elsewhere.
- **Remembering people between days** — regulars, histories, handicaps.
  P-16 asks only that days be readable and not confused; turning memory into
  advantage (seeding from last year) is Q4's open question, not a premise.

---

## 8. Open Questions `#sec-questions`

Left open deliberately. Each is stated with the day that would answer it.

- **Q1 — How far back may a correction reach?** (P-09) Correcting a score is
  uncontroversial; correcting it after it seated a semi-final is a decision
  about what a day *is*. The first afternoon lost to a late-discovered error
  will propose an answer. Until then, any specification that silently picks
  one (always / never / organiser's whim) is hiding the question, not answering it.
- **Q2 — Can a result exist without a score?** (P-07) The no-show, the
  forfeit, the abandoned match. Every day meets one; most muddle through by
  inventing a score everyone present knows is fictional. Whether the fiction
  is harmless bookkeeping or the thin end of P-08's wedge is genuinely unclear.
- **Q3 — Why was that match called off?** A match stopped before its end
  currently leaves no reason and no one answerable beyond the operator.
  Proportionate — until the first called-off match that moves a cut line.
- **Q4 — Where would seedings honestly come from?** ( §6, straight
  elimination) The catalogue ranks only from play. A shape that must order
  teams *before* play needs a ground — past results, reputation, the order
  they arrived — each with its own fairness argument. Refusing to invent one
  is a position; this specification holds it until a shape forces the question.
- **Q5 — What exactly is owed to a late team?** (P-14) Matches, certainly —
  they came to play. A place in an announced shape? A re-deal? The priced
  answer ("change is possible, and here is what it disturbs") needs the price
  list, and the price list needs a day that has paid it.
- **Q6 — When does the ranking rule earn another rung?** (P-10) Head-to-head,
  results-among-the-tied, margin caps, fair-play records: each exists because
  some afternoon ended in a tie the simpler rule separated insultingly. The
  catalogue's position is that the rung belongs to the shape that needed it
  (the cut, P-11) and is earned by a witnessed afternoon — not imported in
  advance because a richer rule feels safer.

---

## 9. Assumptions `#sec-assumptions`

Stated so they can be challenged, not so they can be leaned on silently.

- **H1 — The desk is trusted and present.** Organisers and operators are in
  the room, acting in good faith, able to see the areas they run. Problems of
  remote, adversarial or anonymous operation are a different catalogue.
- **H2 — Scale is human.** Fields are dozens, not hundreds; the day can be
  held in a few heads augmented by notes. Several problems (P-04, P-10) change
  character entirely at ten times this scale, and this specification does not
  pretend otherwise.
- **H3 — One venue, one sitting.** Areas are co-located; time is one shared
  clock; "today" is a meaningful unit. (See §7, simultaneity.)
- **H4 — Losing well is possible.** The room will accept an order it can
  *explain to itself*, including arbitrary tie-breaks honestly labelled
  (P-10). A room that requires every line to be merit all the way down makes
  P-10 unsolvable at any richness of rule, and no specification can fix that.
- **H5 — The written record, where one exists, is the witness of last resort**
  (§2, The end). The problems assume the room prefers one agreed record to
  five confident memories; a room that does not will experience P-08/P-09 as
  bureaucracy, and will be, from its own premises, right.

---

**End of Problem Specification v1.0.**

**Notes for whoever picks this up next:**

- Solve the families in order if solving incrementally: a day that knows its
  field (A), decides its next match (B) and agrees its results (C) is already
  a good day; standing and progression (D) refine it; finishing and memory
  (E) make it trustworthy. The plain day of §5 is the acceptance test for
  A–C and most of E.
- Any proposed solution should be checkable problem by problem against
  "Solved looks like" — and should be expected to say, for each tension in
  §4, which side it landed on and what it paid.
- New problems found on real days belong in §3 with the next number, stated
  in the language of the afternoon, with their forces — not retrofitted into
  an existing problem's fine print.
