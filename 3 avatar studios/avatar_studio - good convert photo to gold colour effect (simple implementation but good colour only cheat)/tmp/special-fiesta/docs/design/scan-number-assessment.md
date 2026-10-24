# Scan numbers — a 4-digit participant number for manual award entry

**Status:** assessed, not built · **Assessed at:** commit `6f2f9d7` ·
**Directive:** every participant gets a unique, random, non-sequential 4-digit number as a
string at sign-up; manual fringe entry looks it up via its own endpoint and shows the
nickname in a confirm dialog; QR keeps scanning nicknames via the existing path;
pure-numeric nicknames (any length) are banned; the entry field must summon the numeric
keyboard. · **Relates to:** facilitator friction report R-2/P6/D-5 (this is the designed
fix for the typed-nickname path), ADR-085 (a completed input is a submission), ADR-009
(offline queue idempotency), ADR-027 (the confirm dialog), ADR-049 (snapshot changed in
place).

---

## 1. What changes, in one paragraph

A participant signs up exactly as today and additionally receives a **scan number** — a
string like `"0742"`, unique across all participants, drawn at random from `0000`–`9999`
so it reveals nothing about sign-up order or headcount. It appears under their QR badge
("Can't scan? Give the facilitator your number: **0742**"). At a fringe station the
manual path stops asking for an error-prone 3–20-character nickname and asks for 4
digits on a numeric keypad; the app resolves the number to a person via a new staff-only
endpoint and shows **the nickname** in an ADR-027 dialog — "Award +5 to **Wei_Ling**?" —
so the facilitator verifies a human fact before any points move. The QR path (which
encodes the nickname) is untouched end to end.

**Why a string, not an integer** (concurring with the directive): leading zeros are
load-bearing — integer `42` and scan number `"0042"` are different things, and every
coercion boundary (JSON, URL param, DB driver) is a place `0042` becomes `42` silently.
A string column with a `^[0-9]{4}$` CHECK makes the zero-padded form the only
representable form. The precedent is already in the schema: `pin` is `text` with a
4-digit CHECK for the same reason.

**Name it `scanNumber` / `scan_number`, never "ID" or "code".** Two 4-digit numbers now
exist per participant and one of them is a secret: the **PIN** authenticates, the **scan
number** merely identifies and is spoken aloud across a crowd. Every label must keep
them apart — participant UI says "your number", never "your PIN"; the PIN stays
mask-rendered, the scan number is always visible.

## 2. Data model

One column on `participant`, changed in place in `snapshot.sql` (ADR-049) and mirrored
in `db/schema/identity.ts`:

```sql
-- ADR-0XX — spoken-aloud identifier for manual scan entry. Not the PIN: this one is
-- public. Random, not sequential: it must not leak sign-up order or headcount.
scan_number text NOT NULL CHECK (scan_number ~ '^[0-9]{4}$')
...
CREATE UNIQUE INDEX IF NOT EXISTS ux_participant_scan_number ON participant (scan_number);
```

Capacity: 10,000 values against a hard event ceiling of ~300 participants — **3 %
occupancy**. That number drives every design choice below; schemes that earn their keep
at 80 % occupancy are over-engineering at 3 %.

Contracts: `scanNumberSchema = z.string().regex(/^[0-9]{4}$/)`; `ParticipantView` (and
the session payload) gain `scanNumber` so the badge page and profile can show it.

## 3. The core question: assigning a unique random number atomically

### 3.1 The constraint environment

PGlite runs in-process on **one serialized connection** (ADR-003): individual SQL
statements are totally ordered, but a route handler is not — concurrent requests
interleave at every `await`. So "I checked and it was free" is worthless by the time the
insert runs. The repo knows this shape intimately: today's signup does
check-then-insert on the nickname and relies on `ux_participant_nickname_lower` as the
backstop (a losing racer 500s instead of 409ing — pre-existing, see §8). The scan number
must do better, not copy that.

`db.transaction` exists and is used (`matches.ts`, `activities.ts`), but a transaction
is not what makes this safe — and the cleanest design needs **no multi-statement
transaction at all**.

### 3.2 Options considered

| # | Scheme | Verdict |
|---|---|---|
| O1 | **Check-then-insert**: `SELECT` until a free number is found, then `INSERT` | ❌ TOCTOU — two signups can both see `0742` free and both proceed. With the unique index it degenerates into O2 with an extra wasted read; without the index it is simply broken. |
| O2 | **Optimistic insert + unique index + bounded retry**: mint a candidate, put it in the participant `INSERT` itself; if the scan-number unique index rejects, mint again | ✅ **Recommended.** The `INSERT` is the atom. See §3.3. |
| O3 | **Pre-seeded shuffled pool**: a `scan_number_pool` table of 10,000 shuffled rows; signup claims one with `DELETE … RETURNING` | Correct and collision-free, but adds a table, a seeding step, and repair tooling for a problem O2 solves in six lines. Right answer above ~50 % occupancy; wrong at 3 %. |
| O4 | **Feistel permutation over a sequence**: encrypt a counter so output looks random but never collides | No retries, provably unique — and a hand-rolled 4-digit block cipher nobody can audit at a glance, plus hidden sequence state. "Boring beats clever" loses. |

### 3.3 The recommended shape (O2), precisely

```
mint():  n = crypto.randomInt(0, 10_000)      // node:crypto — rejection-sampled, no modulo bias
         return String(n).padStart(4, '0')

createParticipant(db, input):
  for attempt in 1..5:
    try:
      return INSERT INTO participant (…, scan_number = mint()) RETURNING *   // ONE statement
    catch (e) when isUniqueViolation(e, 'ux_participant_scan_number'):
      continue                                  // somebody won that number between mints — mint again
  throw new Error('scan number space exhausted?')  // unreachable below ~9,900 participants; fail loud
```

Why this is race-free with zero ceremony:

- **The whole invariant set rides one statement.** `createParticipant` is already a
  single `INSERT … RETURNING` (participants.ts); the number becomes one more column in
  that row. There is no window between "number reserved" and "participant exists" —
  they are the same write. Nothing to roll back, no transaction to orchestrate, no
  advisory lock, and the serialized connection executes competing INSERTs in *some*
  total order where exactly one wins any contested number.
- **The retry must discriminate constraints.** The same INSERT can also violate
  `ux_participant_nickname_lower` (the pre-existing race). A violation there must
  surface as the 409 nickname-conflict, **not** burn a scan-number retry — otherwise a
  nickname race gets retried five times with five fresh numbers and still fails, with a
  misleading error. Postgres reports the violated constraint by name; branch on it.
- **Collision arithmetic.** At worst-case 300 occupants, a fresh mint collides with
  probability ≤ 3 %. Five independent attempts fail together with probability
  ≤ 0.03⁵ ≈ **2.4 × 10⁻⁸** — not a code path, an assertion. The cap exists so that a
  *logic* bug (e.g. the index name typo'd, every insert "colliding") dies loudly after
  five tries instead of looping forever.
- **Mint inside the loop, not outside the function.** Each attempt gets a fresh
  `crypto.randomInt`; never increment-from-collision (that would re-introduce
  sequential order exactly where the directive forbids it).

What this deliberately does **not** do: reserve numbers ahead of time, hold any state
between requests, or special-case the demo seed (the seed goes through the same
function; see §8).

## 4. Banning pure-numeric nicknames — all lengths, not just 4

The reason the ban must cover *any* all-digit nickname, not merely 4-digit ones: the
scan number is a **spoken** protocol. "I'm 73456" shouted across a court must have
exactly one possible meaning — a mistake — rather than "that's a nickname, type it in
the other box". The two namespaces must be disjoint *as humans use them*, and humans do
not count digits under stress. (It also future-proofs a later widening to 5 digits.)

Mechanics, three layers deep like every other validation in the repo:

- **Contracts:** `nicknameSchema` gains `.refine((v) => !/^[0-9]+$/.test(v), messages.nicknameAllDigits)`
  with copy along the lines of *"Nicknames can't be numbers only — add a letter or
  underscore."* (new `messages` entry; both signup forms surface it for free).
- **Snapshot CHECK**, changed in place: `nickname ~ '^[A-Za-z0-9_]{3,20}$' AND nickname !~ '^[0-9]+$'`.
- **Existing data:** audit the demo-seed dump for all-digit nicknames before tightening
  the CHECK (none expected — the recorded personas are word-like); the seed is
  regenerated anyway (§8).

Sign-**in** stays permissive: a hypothetical legacy all-digit nickname could still sign
in (lookup does not run the signup schema); only *creation* is blocked.

## 5. Endpoints

| Path | Change |
|---|---|
| `POST /api/participants/signup` | response's `participant` now carries `scanNumber`; assignment per §3.3; nickname rule per §4 |
| `POST /api/fringe/scans` | **unchanged for the QR path** — payload stays `{ nickname, roundId, clientScanUuid, clientTimestamp }`; §6.3 proposes an additive variant for offline manual entries |
| `GET /api/staff/participants/by-nickname/:nickname` | unchanged (PIN-reset lookup uses it today) |
| **`GET /api/staff/participants/by-number/:number`** | **new**, mirroring its by-nickname sibling: facilitator + superadmin only, validates `^[0-9]{4}$` (400 otherwise), returns `{ participant }` or the existing participant-not-found 404. One rule added to the authorization-matrix RULES table — the suite fails until it is classified, by design |

Enumeration note: the number space is only 10,000 wide, so an unauthenticated or
participant-accessible lookup would let anyone walk the roster. Staff-only
authorization is the control (same posture as by-nickname); no extra rate limit needed
beyond what staff sessions already imply.

## 6. The facilitator flow, step by step (delta to journey J8)

### 6.1 The input — numeric keyboard, guaranteed

The nickname field becomes a scan-number field using the repo's existing
digit-field idiom (sign-in passcode, PIN reset — Part 1 J1/J11):

```tsx
<input inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="off"
       onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 4))} />
```

- `inputMode="numeric"` is the modern signal both iOS Safari and Android Chrome obey;
  `pattern="[0-9]*"` is what legacy iOS keyed the digit pad on and costs nothing to
  carry — **both**, per the directive that the numeric keyboard must appear.
- The per-keystroke filter means a stray letter is physically unrepresentable, which
  retires the entire typo-retype misery documented as friction R-2.
- It stays `type="text"` (like the PIN fields), not `type="number"` — number inputs
  strip leading zeros, scroll-to-increment, and allow `e`/`-`.

### 6.2 Lookup → verify → award

1. **Fourth digit completes the input** → per ADR-085, completion *is* submission: the
   lookup fires without hunting for a button (the button stays, for discoverability and
   hardware keyboards).
2. Found → **ADR-027 dialog**: title **"Award +5 to Wei_Ling?"**, body
   "Number 0742 · Cluster CS · Round 2 of Sandcastle Relay.", confirm **"Award points"**,
   cancel **"Not yet"** (keeps focus, so Enter stays safe). The nickname in the title is
   the point of the whole dialog — the facilitator confirms a *person*, not an input.
3. Confirm → the **existing** award path: same `postScan`, same idempotency key, same
   four outcomes, same auto-refocus of the (now numeric) field for the next person.
4. Not found → red outcome line "No participant has number 0742." — field keeps its
   value (friction P6: the evidence stays on screen next to the message).

Interaction accounting against the friction report: today's manual path is 8–20
keystrokes on a full keyboard plus blind full retypes on typo; after, it is **4
keypad taps + 1 confirm tap**, with wrong-person awards additionally gated by a read of
the nickname. The QR path's zero-tap loop is untouched. The one added tap (confirm) is
deliberate and cheap — the manual path is the exception path, and it is precisely the
one where today a mistyped-but-valid nickname silently awards the wrong person.

### 6.3 The offline wrinkle — the one real design tension

Resolving a number to a nickname **requires the network**; the queue exists because the
network goes away (DC-004). Three options:

| Option | Behaviour offline | Verdict |
|---|---|---|
| A. Block manual entry offline | "Offline — manual entry needs the connection. Use the camera scan." | ✅ **chosen** (product call) — the QR path still queues, so DC-004's offline story holds; see below |
| B. Queue the number unverified | dialog says "Offline — can't show the name. Queue +5 for number 0742?"; sync resolves it later | ❌ not taken — queueing an *unverified* award defeats the verification the number exists for |
| C. Pre-cache a number→nickname roster on the device | full verification offline | ❌ ships the roster to every staff device and adds a staleness problem, to improve a rare path |

**Decided: Option A** — this assessment originally leaned B, and the product call went
the other way: manual entry is online-only, with the form disabled and one line of copy
pointing at the camera. The reasoning: the QR path (which still queues exactly as today)
is the offline story, and it is the *more* reliable path in precisely the conditions that
take the network down — no lookup, no typing, no dialog. DC-004 is not regressed, because
the fallback that exists for "the badge won't scan" is rare and the network being down at
the same moment is rarer; honesty beats availability for that intersection. `ScanPayload`
therefore stays nickname-only and the drain path is untouched. One nuance survives from
B's spirit: an award whose name was **already confirmed** when the POST fails mid-flight
does still queue — the verification happened; only *unverified* awards are refused.

## 7. Participant-facing surfaces

- **QR badge page (S3):** fallback copy becomes "Can't scan? Give the facilitator your
  number: **0742**" — replacing the nickname-typing instruction, large type, under the QR.
- **Profile (S6 `/me`):** one line, "Scan number · 0742", labelled distinctly from
  anything PIN-shaped.
- **Wire:** `scanNumber` on `ParticipantView` + session participant payload. It is not a
  secret; no masking anywhere.

## 8. Rollout, seeds, and adjacent debts

- **Schema:** snapshot changed in place (ADR-049) — `NOT NULL` from day one; there is no
  deployed data to migrate.
- **Demo seed:** *(corrected at implementation)* `scripts/seed-demo.mjs` drives the real
  signup API over HTTP — there is no recorded dump to transform. Demo participants mint
  real scan numbers with zero seed work, and the persona nicknames are word-like, so the
  all-digit refine never trips.
- **Docs:** *(adjusted at implementation)* no README scan-number column — numbers are
  minted randomly per seeding run, so there is no stable value to print; the demo flow is
  to read it off `Wei_Ling`'s badge page. The facilitator journey report's R-2/P6
  findings carry their "superseded by ADR-088" notes.
- **Adjacent pre-existing debt (flag, don't fix here):** signup's nickname
  check-then-insert race (§3.1) — while touching `createParticipant`, catching the
  nickname-constraint violation and mapping it to the same 409 closes it for one line of
  the branch logic §3.3 already requires.
- **PIN reset (friction F5):** the same by-number lookup slots into that page's search —
  natural follow-up, out of scope here.

## 9. Test plan

| Layer | Proof |
|---|---|
| API | 50 parallel signups (`Promise.all`) → 50 distinct, `^[0-9]{4}$`-shaped numbers; no 500s |
| API | collision retry: seed a participant, stub `randomInt` to return their number then a fresh one → signup succeeds, second value used |
| API | exhaustion guard: stub mint constant → fails after 5 attempts with the loud error, not a hang |
| API | nickname race during retry maps to 409 nickname message, not a scan-number error |
| API | signup rejects `000`, `1234`, `12345678901234567890` (all-digit at min/4/max lengths); accepts `b0b42` |
| API | by-number lookup: 200 for staff, 403 participant, 404 unknown, 400 malformed; authorization-matrix rule present |
| API | scans accept `{ scanNumber }` payload and award the right participant; unknown number rejects with the FDS-style copy |
| Web | field renders `inputMode="numeric"` + `pattern="[0-9]*"`; 5th digit and letters unrepresentable |
| Web | 4th digit fires lookup (ADR-085); dialog shows the nickname; **Not yet** awards nothing; confirm posts the same idempotent payload shape |
| Web | offline: dialog shows the unverified-number copy; entry queues; drain awards by number |
| e2e | demo-onboarding asserts the badge page shows the number; fringe spec drives one manual award through number + confirm |

## 10. Effort

Roughly one ADR plus: contracts (schemas/messages/wire) ~½ h; schema + entity + signup
retry ~1 h; lookup endpoint + matrix rule ~½ h; scan payload one-of + drain ~1 h; web
field/dialog/flow ~1½ h; participant surfaces ~½ h; tests ~2 h; seed regeneration +
docs ~1 h. **≈ one focused day**, sequenced exactly in that order so each commit stands
alone.
