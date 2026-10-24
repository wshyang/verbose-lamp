# AGENTS-database.md — ORM discipline and schema evolution

> Section file of [`AGENTS.md`](AGENTS.md). Adopted from `GREENFIELD.md` §4–5.

## 1. One casing, one mapper

- TypeScript domain objects are **camelCase**. Postgres columns are **snake_case**. **Drizzle is
  the only translator.** It is declared once per column:
  `activityName: text('activity_name').notNull()`.
- **Hand-written mappers are forbidden.** No `toDomain()`, no `rowToScan()`, no
  `camelize()/snakeize()` helper. A second mapper is a second source of truth that every field
  must be kept in agreement with by hand — the costliest smell this project is designed to
  avoid.
- Every new table and every CRUD path goes through Drizzle. **No raw SQL for CRUD.** Raw SQL is
  allowed only in (a) migration/snapshot files and (b) a genuinely set-based analytical read
  (the leaderboard aggregate), where it is wrapped in one repository function and commented.
- Schema definition, repository, and the typed wire contract change **in the same commit**.

## 2. Identifiers

- **UUIDv7**, minted in exactly one place: `apps/api/src/db/ids.ts` (`newId()`). Timestamp
  ordering gives index locality on the high-insert tables (`fringe_scan`, `session`).
- Never call a UUID library anywhere else. Never `gen_random_uuid()` as a column default — the
  application mints ids so the value is known before the write.
- **System / non-human actors are real rows.** The bootstrap seeds a `facilitator_account` row
  with username `system`; any automated write references its real id. Sentinel strings like
  `'system'` or `'unknown'` in an actor column are a defect.

## 3. Soft deletion, never hard `DELETE`

Everything that can be "removed" carries a nullable `expires_at`:

| Table | Removal means |
|---|---|
| `team_membership` | member left / was kicked / captaincy row replaced |
| `session` | signed out or expired |

Rules:

1. Repositories expose **`invalidate…()`**, never `delete…()`. `DELETE` appears nowhere in
   application code.
2. **Partial unique indexes** carry the `WHERE expires_at IS NULL` predicate, so a participant
   can rejoin a team they once left:
   - `ux_team_membership_active_participant ON (participant_id) WHERE expires_at IS NULL`
   - `ux_team_membership_active_captain ON (team_id) WHERE is_captain AND expires_at IS NULL`
   - `ux_team_membership_pair ON (participant_id, team_id) WHERE expires_at IS NULL`
3. **Every read and every authorization check filters active rows.** "Is this user the captain"
   must not be answered by an expired membership row. Use the shared predicate helper
   `isActive(table)` — never re-spell the condition inline.
4. **FK validity at write time considers soft-deleted rows.** A database FK only proves the row
   once existed; a reference to an invalidated row must be rejected by the repository guard.
   Applies to captain transfer, kick, add-member, and match team refs.

Rows the FDS declares **immutable** (`fringe_scan`, `void_audit_entry`) get no `expires_at` at
all: a scan is corrected by `is_voided` + a new audit row, never by removal.

## 4. Snapshots beat joins (product rule, enforced here)

`fringe_scan` and `tournament_match` **copy** the values they report at write time —
`activity_name_snapshot`, `round_number_snapshot`, `points_awarded_snapshot`,
`facilitator_username_snapshot`. Renaming an activity or changing a point value must **never**
rewrite history. If you add a reporting field, add a snapshot column, not a join.

## 5. Schema evolution: one file, changed in place (ADR-049)

There is **one** schema definition: `apps/api/src/db/schema.sql`. There is no migrations
directory, and adding one back is a standards violation.

- Every `CREATE TABLE` lists **every current column**. Change a column **in place**. The file must
  never degrade into "original shape + a changelog of `ALTER`s".
- `apps/api/src/db/bootstrap.ts` applies it to any database that does not already have the schema,
  automatically on boot and standalone via `npm run db:setup`. It is idempotent: it asks Postgres
  whether the tables exist rather than keeping a version registry, because with one definition
  there is no version to track.
- `npm run standards` cross-checks that every table Drizzle maps in `db/schema/` is actually
  created in the snapshot. That drift — the code querying a table the database was never told to
  build — is the failure the old twin-file rule never actually caught.

**Why this replaced numbered migrations:** the app is pre-production. Nothing is deployed, so there
was nothing to migrate *from*, and nine numbered files describing steps nobody would take again
were a second home for the schema and a second chance for it to drift. The nine were verified
equivalent to the snapshot before deletion — two databases built, `information_schema` compared,
148 columns / 225 constraints / 50 indexes identical.

**When this has to change back:** the first real deployment holding data somebody cares about. At
that point a numbered chain earns its keep again, because a live database cannot simply be handed a
fresh snapshot. Until then, editing one file is both simpler and safer.

## 6. Seeding

Seeds are idempotent and live in `apps/api/src/db/seed.ts`, invoked after migration on boot:

- the **16 clusters** (`fds.md` §2.2) — fixed catalogue, not runtime-editable;
- the **`system` facilitator account** (see §2);
- **one superadmin** with `passcode = $SUPERADMIN_INITIAL_PASSCODE`. The variable is mandatory:
  a missing value **fails loudly** with the exact message from `fds.md` §8.3 —
  `SUPERADMIN_INITIAL_PASSCODE environment variable required for initial superadmin seeding.`

`PointConfig` is **not** seeded. `fds.md` §2.12 requires the superadmin to set it explicitly.
ADR-270 — it now holds the fringe settings only; the tournament's rates live on the tournament.

## 6a. Binary data (ADR-048)

Photo bytes live in Postgres, in `gallery_blob`, and four rules keep that safe. Breaking any of
them re-opens a risk the assessment measured, so none of them are stylistic:

1. **Bytes live in their own table.** `gallery_photo` is metadata, `gallery_blob` is payload. Never
   add a payload column to a table a listing reads — the split is what makes "show me the grid"
   physically unable to become a gigabyte scan through PGlite's one serialized connection.
2. **One payload read, by key, columns named.** `entities/galleryBlobs.ts` exposes exactly that.
   No `list`, no bare `select()`. For corpus size use `sum(byte_size)`, never `length(payload)`.
3. **Blobs never go in `lib/cache.ts`.** That store counts *entries* and would reach 1.5 GB at
   5,000 photos. Binary gets `lib/blobCache.ts`, which budgets in **bytes** via `sizeCalculation`.
4. **`bytea` goes through the `customType` in `schema/gallery.ts`**, which normalises the drivers
   (`pg` returns a `Buffer`, PGlite a `Uint8Array`). Tests assert a **byte-for-byte** round trip,
   including NUL, `\`, `'` and high bytes — a text-encoding slip here corrupts every photo while
   every other test still passes.

The cost is a measured tail, not a free lunch: a cold blob burst can put one write ~1.1 s behind
the queue (the caches cut that to ~150 ms). `node scripts/gallery-blob-spike.mjs` reproduces it —
re-run it whenever the caps, the cache budget or the page size change.

## 7. Transactions

Anything that must be atomic gets `db.transaction()` in the repository, not orchestrated from a
route: advance-round (close N + open N+1), complete-match (status + snapshot), team create
(team + captain membership), captain leave (transfer or disband), activity deactivate
(auto-close its open/ended round).
