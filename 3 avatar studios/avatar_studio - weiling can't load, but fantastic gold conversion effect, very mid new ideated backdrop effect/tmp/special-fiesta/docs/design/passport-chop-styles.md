# Passport chop styles: the die catalogue

Decided in **ADR-242**. Builds on ADR-239 (who is "done" with a station), ADR-240 (what is stored,
which is one number) and ADR-241 (how a chop is generated). The code is `src/lib/passport/` in the
web app; the component is `src/components/participant/PassportChop.tsx`.

Rendered evidence: `docs/design/passport-chop-dies.png` (nine rows, six impressions each) and
`docs/design/passport-chop-list.png` (the Passport tab at 390 px, so the size a phone really draws).
Both are renders of the shipped component with the shipped stylesheets, made by
`apps/web/scripts/render-chop-sheet.ts`. They supersede `docs/design/passport-chops.png`, which
showed the single die ADR-241 shipped; those twelve seeds still reproduce, but they now draw under a
die, so that older sheet no longer matches what the code draws.

## The premise, in one paragraph

A chop is pressed from a **die** — the piece of rubber an office holds — so the *shape* of a mark is
a fact about the office, and it is the same for everyone who walks through that counter today. The
wear — where the ink missed, how far it slid, how crooked it landed — is a fact about the press and
the paper, which for us is the device. Two designs that differ only in wobble are one design printed
twice; two designs that differ in geometry are two offices. That split is what this catalogue is
built on.

## What each half owns

| The die owns (`chopDies.ts`) | The impression owns (`chop.ts`) |
| --- | --- |
| the frame's shape and stroke weight | rotation, skew, scale, placement |
| which ornaments it carries and where | which of the die's two inks, at what opacity |
| the pair of inks it can be struck in | which of the pen's two inks, on the one die that has a pen |
| whether the name is knocked out of solid ink | which quarter of the outline did not take, and how far round it is |
| the size and length of each line of type | each letter's height, tilt and the wobble between them |
| its own wear ranges (`DieRanges`) | the numbers drawn from those ranges |
| whether a serial line exists at all | the four digits in it |

A die returns primitives (`chopArtwork.ts`: frame, panels, paths, lettering, knockouts, arcs) and
never markup. `PassportChop` knows nothing about immigration, post or rubber: it draws frames, paths,
straight lines, arcs and knockouts, and applies the wear. Adding a tenth style means adding an entry
to `CHOP_DIES` and nothing else, because no die returns markup and every shape goes through one
wear path.

## The nine designs

Numbers are user units of the 200 by 120 cell the die is drawn in. "At 120 px" is what that becomes
in the list row, which is the only size that matters on a phone — a 1.7-unit stroke is about one
pixel there.

| id | label | borrows from | the die | ink |
| --- | --- | --- | --- | --- |
| `ica-band` | Immigration band | the wide rounded rectangle of a Singapore or Malaysian counter | 176×92 frame at 5.6, an inner frame at 1.5, two rules above the word at 1.6, name at 12, word at 25–28, `NO` serial at 8.5 | `#c4342b` `#b8323e` |
| `union-circle` | Union circle | a Schengen round die | ring at radius 55, weight 5, inner ring at 47.5, twelve stars between them at radius 51, name on an arc of radius 37, word between two rules | `#1f4fa3` `#2b5aa6` |
| `thick-frame` | Thick frame | a north-east Asian landing permit | 150×100 frame at 9 — the heaviest line in the catalogue — one solid bar at y −28, the name knocked out of it at 11 | `#5a2d8c` `#4a2674` |
| `crown-oval` | Crown oval | a Commonwealth border office's oval | ellipse 66 by 47 at 4.5, inner ellipse, a crown filled above the word, a rule below it for a date to be entered, name on an arc of radius 33 | `#23262c` `#2f3a44` |
| `postmark` | Canceller | a postal canceller, which predates the designed chop | ring of radius 40 centred at x −40 at 4.4, inner ring, three waves at 2 running from x 4 to x 94, all three lines of type inside the ring | `#3a4b5c` `#46596b` |
| `hex-customs` | Hexagon customs | a counter where the number of sides means something | hexagon at radius 58 at 5.6, inner hexagon at 49, a short hatch above and below, name at 9.5 straight across the top | `#0f6b5c` `#12776a` |
| `oct-vignette` | Vignette octagon | an engine-turned visa vignette | octagon at radius 60 rotated 22.5° at 5, inner octagon at 52, 44 ticks between 53.4 and 57.4 at 1.3, name at 10 above the word | `#7a2f4f` `#6b2a58` |
| `slab-knockout` | Over-inked slab | a saturated pad and a hard press | one 172×74 solid panel, two blobs at the corners, the name, the word and the serial all knocked out of it; no frame at all, so no gap is possible | `#c4342b` `#a8281f` |
| `brackets-pen` | Brackets, dated in pen | a counter that prints the form and lets a person finish it | four corner brackets 150×84 with 20-unit arms at 4, a rule at y 33 at 1.2, a two-loop scrawl over it at 1.7 **in pen**, no serial, no frame | ink `#20407a` `#2b4a7d`, pen `#1b1b1b` `#b3271f` |

Every die carries `COMPLETED` as the shouted word (ADR-239: the tab answers one question) and the
station's own name as its second line. That is what makes six people on one day read as one day at
one event rather than a page of random clipart.

Three shapes of lettering, and which dies use which is the whole naming rule:

- `fitLabel` caps a straight line at 22 characters. The three wide band dies use it — `ica-band`,
  `thick-frame`, `slab-knockout` — because a rule across a rectangle has room for a name.
- `fitArcLabel` caps a rim line at 15 characters, and it is used for the two dies whose name really
  does curve (`union-circle`, `crown-oval`) **and** for the four whose line is straight but whose
  space is narrow (`postmark`, `hex-customs`, `oct-vignette`, `brackets-pen`). A name cut with `…`
  is a chop being read; a name spilling over a ring is a bug.
- `NO nnnn` is on every die but `brackets-pen`, whose business is that the number was written by
  hand instead. On `slab-knockout` the serial is knocked out of the ink with the rest of the type.

`brackets-pen` is the only die with a `pen`, and `drawInks` picks the pen colour independently of the
ink colour, which is why its scrawl reads as somebody else's ballpoint. `slab-knockout` and
`brackets-pen` set `gapChance: 0` — the first has no outline left to miss, the second has no frame.

## How a station gets its die

`dieForStation` folds the activity id with FNV-1a and takes the remainder against the nine dies
(`chopAssign.ts`). Measured over 16,000 UUIDv7 ids, the shape this repository mints
(`apps/api/src/db/ids.ts`), each die lands on 10.7 % to 11.5 % of them. Measured over 2,000
eight-station days, a day shows five or six distinct shapes in 74 % of cases, four in 13 %, seven in
11 %, and all eight in 1 %.

That is the honest limitation of nine dies over eight stations: a birthday problem, so a day will
usually repeat a shape somewhere. Three responses, none taken:

- **Assign by position in the sorted station list** (`index % 9`), so every station differs. Held
  back because ADR-240's promise is that the mark is a function of the *activity*; a position moves
  when an activity is archived or added mid-day, and the chop would change shape under somebody's
  feet.
- **More dies than stations.** Twelve designs would lift the all-different rate without guaranteeing
  it, and each die is about twenty lines of geometry plus a review pass.
- **Nothing.** Two stations sharing a shape reads as "two counters, same office", which is what a
  real NS day looks like. Accepted, and recorded here so the next reader knows it was noticed.

## What real chops do that we copy, and one thing we do not

The reference reading behind this catalogue: a Singapore ICA visit stamp codes the length of stay in
the *shape of the die* (hexagon, octagon, rounded and sharp rectangles for 90/60/30/14 days, an oval
for Permitted To Land), and a British postmark carries the town in an arc and kills the frank with
wavy lines. Both are worth stealing as principles:

- **Shape can carry information.** Nothing here encodes days. The one number our event has that a die
  could carry is the round count, and it is already the row's own number and a chip; an octagon for
  "eight rounds done" would be a lovely, unreadable lie on a day with eight stations. Recorded as a
  rejected idea, not an oversight.
- **Rim text is decoration at our size, and that is allowed.** A real chop is about 40 mm wide and
  read at arm's length; ours is 120 CSS px on a phone and read in half a second. The small print
  earns its place by texture — so the catalogue lets an 8-unit line (about five device pixels at the
  list size) go soft while the frames stay hard, and every die's own wear ranges are tuned against
  its own type size rather than against a global.
- **What we must not copy: any government's seal.** No die may draw a national emblem, a crest-like
  device, a government's name, or anything that could read as an official endorsement — not even as
  a joke on an event day. `ica-band` is named for a *proportion and an ink*, and its lettering is the
  activity's own name. The `NO 8238` line is deliberately a nonsense serial: real chops carry a die
  number that means something to the office that holds it, and ours means nothing. If a die design
  ever needs a state symbol to make its point, the design is wrong.

## Ideas not built, and what each would cost

Ordered by how cheap they look from here. These are notes for a later pass, not commitments.

1. **A hand-completed date.** The die prints the station and leaves the day to be written in pen —
   the `brackets-pen` scrawl is the placeholder for it. Costs: ADR-240 says the device stores one
   number, so the date has to come from the API's `stampedAt`, which the passport already returns;
   and a chop stamped last week must not visibly change when a phone's clock moves. Real cost: the
   mark becomes a form being filled in rather than a die being pressed.
2. **A second strike for a revisit.** A station with two counted rounds gets the same chop, once.
   Stamping twice at the counter is exactly what a double strike looks like, and the ghost layer is
   already there to place it. Costs: a round count in the payload, and the row would have to say why.
3. **A `VOID` over an undone scan.** The API voids scans, so the fact exists. Costs: ADR-239's rule
   is "at least one counted scan", so a fully voided station has no chop to void — it only reads on a
   station with both, which is rare enough to be confusing.
4. **Blind / embossed seal.** No ink: a paper bulge, shadow only. Costs: `mix-blend-mode: multiply`
   (ADR-241) has nothing to multiply, so it becomes a lit-relief filter over whatever is behind it —
   including the ADR-238 avatar photo, where it would look like a smudge. Held back for that.
5. **Per-participant die instead of per-station.** One person, one shape all day; every passport reads
   as one office's work. Costs nothing technical, and it is a different answer to the same question:
   an owner call. Cheap to flip later because the stored seeds do not change.
6. **Arrival and departure halves.** Open brackets for a station's start, closed for its finish.
   Costs: a second state the day does not currently supply.
7. **A bilingual arc.** A second script on the rim. Costs: the app has one locale, and rim type is
   already at the edge of legibility in one language.
8. **Team colour.** Rejected by ADR-240 before this catalogue existed, and still rejected: the
   leaderboard owns colour, and eight teams across six inks would turn the tab into a fixture list.
9. **A barcode-ish die.** Rejected: the app already draws QR codes, and a fake scannable mark in the
   same tab reads as something a scanner will accept.
10. **Grime as a station-level fact** — an old station keeps a chipped, faded die. Costs: it must be
    stable per station, so a second hash of the same id, which is cheap; but "how old is this
    station" is not in the payload, and inventing it from the hash makes wear look like data.

## Reviewing and re-rendering

```sh
cd apps/web
npx tsx scripts/render-chop-sheet.ts --out=/tmp/dies.png           # the catalogue
npx tsx scripts/render-chop-sheet.ts --mode=list --zoom=2 \
  --out=/tmp/list.png                                              # the phone
npx tsx scripts/render-chop-sheet.ts --dies=postmark,slab-knockout --seeds=12
```

`--paper=#1c1c1c` puts the marks on a dark page, and `PSD_E2E_CHROMIUM` points the harness at a
browser. The script writes the markup beside the raster, so a reviewer can open it in their own
browser instead of trusting a PNG.

## What this turns on, and what is still soft

- `chopDies.test.ts` holds every die inside the cell, on its own ink, at a size the renderer accepts,
  and pins `NO \d{4}` on every die but `brackets-pen`, and a curved name on exactly `union-circle`
  and `crown-oval`. `chop.test.ts` pins that the pen colour comes only from a die that owns a pen, and
  that the nine dies do not share one pad.
- `chop.test.ts` runs its range table per die, so a die that stops wobbling fails even while the
  shared recipe is fine; and it holds the frame gap to a quarter of the outline for every die.
- The look is still judged by eye on the two sheets above. Tests cannot tell a crown from a smudge,
  and ADR-241's exception has never claimed otherwise.
- Observed in the review renders, at the app's own 120 px: all nine read as different stamps. The
  `crown-oval`'s crown still resolves into a smudge, which the first sheet made worse than the
  second because the dies were drawn smaller; the `postmark` waves read as texture rather than lines;
  the `brackets-pen` scrawl inks at about one device pixel and still reads as a hand-drawn line.
  Judged acceptable — a real oval chop's crown at arm's length is also a smudge — and recorded here
  rather than hidden.
- A die turned to its own limit puts a corner a few pixels outside the 120 px slot — `brackets-pen`
  turns ±13°, so a 150-unit bracket travels. `.gb-chop` sets `overflow: visible` for exactly this
  (ADR-241), and the list row lets it cross the panel's padding. Judged on the phone-size sheet: it
  reads as a chop that overran the box, which chops do, and not as a layout fault. A clip would fix
  the geometry and lose the character, so the overflow stays.
- Fonts: the lettering asks for a heavy grotesque with `Arial Black` first. On a Linux box that
  string falls through to DejaVu Sans Bold, which runs wider, so a rendered sheet's small print is a
  little more crowded than a phone's. Nothing about the geometry changes.
- Because a die's `draw` runs after the wear is drawn from the seed, redrawing the catalogue is a
  *cosmetic* change: stored seeds stay valid and every chop draws again with the same wobble on the
  new die. A change to the *recipe* is not cosmetic, and ADR-241 still requires a new storage key for
  that.
