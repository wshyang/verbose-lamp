# Orphan cleanup — 2026-09-30

A mechanical inventory of every symbol removed in this change, written **before** the removals so the
record is a specification rather than a recollection. Companion decision: `ADR-081` in
[`../addenda/ADDENDA.md`](../addenda/ADDENDA.md).

Produced by reading all 80 addenda, asking the three live peer sessions (`retire-staff-chat-seed`,
`avatar-cutout-tuning-ui`, `special-fiesta-2d`) what they owned and what they had abandoned, and
sweeping the tree for exports with no consumer.

---

## 1. Method, so the list can be reproduced and disputed

An export counts as **dead** here only if it satisfies all three:

1. **Zero references outside its own file** — across `apps/api/src`, `apps/web/src`,
   `packages/contracts/src`, `e2e/`, `scripts/`, `apps/web/scripts/`, tests included.
2. **Zero references inside its own file**, excluding the export declaration itself. This is the
   filter that separates *dead code* from *over-export*: `CHAT_PAGE_LIMIT` has no external consumer
   but is used at `db/entities/chat.ts:87`, so it is over-exported, not dead, and it stays.
3. **Not a deliberate seam.** Test-only exports are kept. `forgetSegmenter`, `forgetFaceLocator`,
   `resetCachesForTests`, `componentSizesOf`, `archiveAttempts` and the rest exist so a test can reach
   behaviour the product reaches another way; ADR-033/045/072 say so explicitly. A seam with one caller
   is doing its job, not rotting.

Reproduce the sweep with the two-pass scan recorded in ADR-081, and each finding with a direct grep:

```
grep -rn '\.cursor' apps/web/src --include='*.ts' --include='*.tsx' | grep -v test
```

Everything below was re-verified by direct `grep` at the time of writing, not inferred from the scan.

**Rule applied throughout:** a symbol is removed only where nothing is lost but the symbol. Where a
zero-caller export carries knowledge — a race, a constraint, a seam a future author will need — it is
kept with a comment saying why, which is the outcome §3.1 and §4 record.

---

## 2. Removed — dead code

### 2.1 `cursor` on the chat page views — a wire field nothing consumes

| | |
|---|---|
| Contract | `packages/contracts/src/wire.ts:196` (`ChatPageView`), `:243` (`TeamChatPageView`) |
| Producers removed | `apps/api/src/routes-chat/index.ts:58`, `:65`; `apps/api/src/routes-team-chat/index.ts:55` |
| Test-local twins removed | `apps/api/src/tests/chat.test.ts:26`, `apps/api/src/tests/teamChat.test.ts:19` |
| Consumers | **none** in `apps/web/src` outside tests |

Residue of the pre-ADR-064 design, in which the client persisted the server's cursor across mounts.
**ADR-064** moved it into a per-mount ref, **ADR-065** replaced it with the `seen`/`oldest` pair, and
`useTeamChatRoom` uses the server-side read mark instead. Three code paths kept computing a value no
reader had left.

Found independently by `special-fiesta-2d` while auditing ADR-066 and by this sweep; both arrived at
the same three producer sites.

**What is *not* removed:** `readCursor`, `chatCursorSchema`, and the `after=` / `before=` query
parameters. Those are the request side and are load-bearing — ADR-065's forward delta, backwards page
and tail read are told apart by exactly which cursor arrives.

### 2.2 `editCourtRequestSchema` — a validator written for a route that never used it

| | |
|---|---|
| Path | `packages/contracts/src/schemas.ts:361` |
| Kind | `export const editCourtRequestSchema = createCourtRequestSchema;` |
| Route it was for | `PUT /courts/:courtId`, `apps/api/src/routes-superadmin/config.ts:118` |

That route validates with `createCourtRequestSchema` (`config.ts:120`). The alias mirrors
`editActivityRequestSchema`, which **is** wired to `PUT /activities/:activityId` (`config.ts:80`) and
is a genuinely different shape. For courts the two shapes are identical, so the alias added a second
name for one schema and nothing ever chose it.

Behaviourally inert: it *was* `createCourtRequestSchema` by definition, so validation does not change
by one field.

### 2.3 `findAnnouncementById` — residue of the dismissal design that was replaced

| | |
|---|---|
| Path | `apps/api/src/db/entities/announcements.ts:69-76` |
| Callers | **none** |

**ADR-074** records that per-participant dismissal was built server-side first — an
`announcement_dismissal` table, a row per `(participant, announcement)`, and a dismiss route — and
"replaced before release" by a browser-side key. The table went in `201a881`; the by-id lookup that
served the dismiss route stayed.

`listAnnouncements`, `invalidateAnnouncement` and the `cachedRead` above them are live and stay.
`retire-staff-chat-seed` confirmed the table left no other references.

### 2.4 `findChatMessageById` — superseded by the path that re-reads the row

| | |
|---|---|
| Path | `apps/api/src/db/entities/chat.ts:140-145` |
| Callers | **none** |

**ADR-066** requires a hide to be published *after* the row comes back, so a hide that changed nothing
tells nobody anything — and `invalidateChatMessage` already returns the row it hid. A separate
read-then-hide pair would be two queries and a race; this lookup is the half never needed.

### 2.5 Wire types no side imports

| Path | Symbol | What it described | Why dead |
|---|---|---|---|
| `wire.ts:17-19` | `ErrorView` | the error envelope `{ error: { message, field? } }` | see below |
| `wire.ts:107-111` | `MatchRosterEntry` | ADR-005's roster snapshot element | the snapshot's shape is declared at `db/schema/tournament.ts`, which is what writes it |
| `wire.ts:174-177` | `ScanResultView` | `{ scan, duplicate }` | the scan route answers a shape it builds inline |
| `wire.ts:404-406` | `ListView<T>` | `{ items: T[] }` | no envelope of this shape is returned anywhere |

**`ErrorView` is the one worth naming in the commit.** The envelope is hand-built four times, at
`apps/api/src/app.ts:93`, `:103`, `:106` and `:109`, while the contract type describing it was imported
by nobody. That is the two-sources-of-truth trap `AGENTS.md` §3 exists to prevent, and it had already
resolved itself in the worse direction — the type was the copy that lost.

Removing the unused type is the honest half of the fix and all this change does. **Typing `app.ts`'s
four envelopes from the contract is the other half and is deliberately not done here** (§4.6): it is a
behaviour-adjacent refactor of the error path, it wants its own tests, and `app.onError` was last
touched by ADR-048 for `HTTPException` handling.

### 2.6 Drizzle row types nothing infers from

| Path | Symbols |
|---|---|
| `apps/api/src/db/schema/gallery.ts:105-107` | `GalleryBlobRow`, `GalleryVoteRow`, `GalleryReportRow` |
| `apps/api/src/db/schema/identity.ts:85` | `ClusterRow` |

Emitted for completeness beside siblings that **are** consumed (`GalleryPhotoRow`, `ParticipantRow`,
`FacilitatorRow`, `SuperadminRow`, `SessionRow`). The repositories for blobs, votes, reports and
clusters return narrower shapes or select named columns — **ADR-048** M6 requires exactly that of
`entities/galleryBlobs.ts` ("no bare `select()` in that file"), so a whole-row type there is a type for
a query the mitigation forbids.

Restoring one is a single line: `export type XRow = typeof xTable.$inferSelect;`.

### 2.7 Contract constants and derived types with no consumer

| Path | Symbol | What enforces the fact instead |
|---|---|---|
| `packages/contracts/src/clusters.ts:27` | `CLUSTER_COUNT` | `CLUSTER_CODES` is the live catalogue; its length is a `.length` away |
| `packages/contracts/src/schemas.ts:477-478` | `SHA1_HEX_LENGTH` | **the constraint is real and stays in SQL**: `snapshot.sql:348` `char(40) NOT NULL CHECK (sha1_raw ~ '^[0-9a-f]{40}$')`, plus `ux_gallery_photo_sha1` |
| `packages/contracts/src/messages.ts:138` | `MessageKey` | `keyof typeof messages`, never used to key anything |
| `packages/contracts/src/messages.ts:139` | `EmptyStateKey` | as above, for `emptyStates` |

`SHA1_HEX_LENGTH` is the interesting one: its comment asserted it was "the duplicate check's key", and
the SQL check is the only thing that has ever enforced that. A constant documenting a constraint it
cannot reach is a claim, not a mechanism — the objection **ADR-010** makes to any unchecked convention.
The SQL is untouched; only the unreachable duplicate goes.

**`packages/contracts/src/titles.ts` is deliberately untouched — see §4.1.**

### 2.8 Inferred request types neither side imports

`packages/contracts/src/schemas.ts:489-499, 505-506, 508` — fourteen `z.infer` aliases:

```
ParticipantSignInRequest   StaffSignInRequest      CreateTeamRequest
JoinTeamByCodeRequest      AddMemberRequest        StartMatchRequest
CompleteMatchRequest       EditMatchWinnerRequest  VoidRequest
CreateScanRequest          PointConfigRequest      CreateSuperadminRequest
ResetPinRequest            SendChatMessageRequest
```

Every corresponding **schema** is live and imported by the API (37 of them are), and both sides get
their types by inference at the call site — `readBody(c, voidRequestSchema)` is already typed. These
aliases were the belt to that braces, and nothing wore them.

**Kept, because they *are* imported:** `SignUpRequest`, `CreateActivityRequest`, `EditActivityRequest`,
`CreateCourtRequest`, `CreateFacilitatorRequest`, `EditFacilitatorRequest`, `StationType`,
`GallerySort`. The surviving list is not tidier than the removed one; it is the one with consumers.

---

## 3. Removed — false statements in code comments

Not dead code: text that says something untrue about the code beside it. Reported by
`retire-staff-chat-seed`, each re-verified.

| Path | The claim | The fact |
|---|---|---|
| `apps/api/src/db/schema/chat.ts:60-64` | the announcement table "carries per-participant dismissal state, which a chat row cannot" | there is no such column. Dismissal is `localStorage` — `apps/web/src/lib/storage/announcementStore.ts` — and `useAlertsStore.dismiss` issues no request |
| `packages/contracts/src/wire.ts:272` | "Announcements this participant **has not dismissed**, oldest first" | the server sends an identical list to every participant. That identity is the point: it is what lets the read be one shared `cachedRead` instead of three hundred |
| `docs/addenda/ADDENDA.md`, ADR-074 Decision bullet | announcements are "dismissed **per participant, server-side**" | contradicted by a later bullet in the same entry, recording the move into the browser. One ADR, two answers |
| `apps/api/src/tests/authorization-matrix.test.ts:103` | cites "ADR-063/067" | stale after `62a1704` renumbered the announcement ADR to 074 and handed 067 back |

The ADR-074 correction is an **amendment in place, not a rewrite of history**: the Decision bullet is
brought into line with what shipped and points at the bullet holding the reasoning. ADDENDA entries are
append-only as a *register* (`AGENTS.md` numbering note); a sentence inside one that was already false
when committed is a defect. The alternative — leave it, and let ADR-081 contradict it — leaves the next
reader to discover the contradiction themselves, which is exactly how this one survived.

### 3.1 Not a removal: `signInStaff` and `seeded.facilitatorPasscode`

Reported in the audit as dead — **correctly**, it had zero callers after ADR-074 retired the seeded
staff chat line — and its owner, `retire-staff-chat-seed`, resolved it the other way in `ec6c119`:
kept, with a comment naming why and when to revisit.

Recorded here because the reasoning generalises and is better than deletion was. The cost of deleting
it is not the twelve lines: `signedInAt` just above carries a comment recording a race that only
appeared once the database moved off in-process PGlite onto a real Postgres server, because the sign-in
round trip grew by the milliseconds the old check had silently relied on. That knowledge lives in these
helpers and would have been re-derived wrong. `seeded.facilitatorPasscode` (`e2e/fixtures.ts:14`)
orphans with it and is kept for the same reason — it was a pair, not a single. The comment names an
expiry, since an unexplained zero-caller export is what generates the next audit.

---

## 4. NOT removed, and why — the part of the audit that is a decision, not a cleanup

Each of these is a change to behaviour, to another session's live work, or to the user's data.

### 4.1 Participant titles — kept, by instruction

`packages/contracts/src/titles.ts` is untouched, including its two zero-consumer exports
(`ParticipantTitle`, `PARTICIPANT_TITLE_MAX_LENGTH`). **The user's direction: the feature is wanted and
kept for aesthetics.** The audit never proposed touching the table, `PARTICIPANT_TITLES`, the column or
the assignment — only those two symbols — and they stay too, so nothing in the title area is disturbed
by a cleanup pass.

For the record, since it was asked: `participant_title` **is** the hundred-word table. ADR-061's list
is 100 entries and **100 distinct** — the supplied list had only 87 distinct, with Adventurer three
times, and 13 replacements were made. It is seeded at bootstrap by `db/seed.ts:37-38` with
`onConflictDoNothing`, so adding a word and restarting suffices; `participant.title` is `NOT NULL` and a
FK to it; `lib/titles.ts:12` assigns one at random in the repository beside `newId()`, so no route can
create an untitled participant. Longest word today is `Trailblazer` (11) against
`CHECK (length(name) BETWEEN 1 AND 20)` at `snapshot.sql:29`.

### 4.2 `TEAM_CHAT_PAGE_LIMIT = 200` — ADR-065 reached one of the two rooms

`apps/api/src/db/entities/teamChat.ts:23`, used at `:87` (the `after` delta) **and** `:94` (the tail).
The global room splits these into `CHAT_PAGE_LIMIT` 200 / `CHAT_TAIL_LIMIT` 50 / `CHAT_OLDER_LIMIT` 50
and has a `before=` walk-back; the team room has no backwards pagination at all. No addendum says the
rooms should differ, so this is omission rather than decision — but closing it means a new route
parameter, a client sentinel and an `hasOlder` contract change. That is ADR-065 again, for the team
room, and wants its own entry.

### 4.3 Staff authorship of chat messages — two accepted ADRs disagree

`snapshot.sql:255` permits `author_type` `facilitator` and `superadmin`;
`routes-chat/authorFrom.ts:26-43` has live branches for both; `POST /messages` guards with
`requireAnyActor`; `tests/authorization-matrix.test.ts:73-77` pins all three as allowed, citing
ADR-046's "every signed-in actor may read it and post to it". Meanwhile **ADR-074** closed the UI path —
`/social/chat` is `RequireActor actorType="participant"` (`App.tsx:89`), and no staff surface mounts a
chat panel — and says the facilitator author type "is now deliberately unreachable from any UI; left in
place because removing it is another schema change, but it should not be mistaken for a capability."
`ChatPanel.tsx:78`'s `STAFF` badge is the client half of the same unreachable branch.

The capability is live, intended and test-pinned at the API, and closed at the UI. **Removing either end
breaks an accepted ADR or a passing test** — `retire-staff-chat-seed` confirms
`e2e/announcements.spec.ts` and the authorization matrix would go red from opposite directions. This
needs a ruling — is staff posting a supported API capability, or an artefact? — and it is not cleanup.

### 4.4 The backdrop swatch on a cut-out-off sprite (ADR-077's own open item)

A sprite made with background removal off still carries backdrop and ink palette entries, unreferenced,
so `recolourSpriteBackdrop` is a no-op on it — and the studio still offers the swatch. ADR-077 records
it: "Not addressed here; the studio still shows it." Left because `avatar-cutout-tuning-ui` is mid-sweep
across that exact surface, and a control that should disappear is a UI decision with its own test.

### 4.5 ADR-027's missing undo, and ADR-064's three stated leftovers

ADR-027 exempted the scan button from confirmation deliberately — "a queue of twenty cannot afford a
modal per person" — and named the remedy: "an undo, which is still open." ADR-064 leaves the backlog
read twice on mount (removing the HTTP read needs a "replay complete" frame, a protocol change), no
guard on how long the page was hidden before bumping the reconnect generation, and a client message
list that grows unbounded from live frames while reads cap at 50. Missing features, not orphans.

### 4.6 Typing `app.ts`'s error envelopes from the contract

See §2.5. The unused `ErrorView` goes; adopting it at the four `app.ts` sites is a refactor of the error
path with its own tests, and `app.onError` is ADR-048 territory.

### 4.7 `apps/api/.data/` — the user's data, and the user's call

`bootstrap.ts:28` decides whether to provision by probing one sentinel, `public.cluster`. Any data
directory predating a schema change therefore never receives the new tables, and `npm run db:setup` uses
the same sentinel so it cannot repair one. `.data/dev` (136 MB) dies at boot with
`relation "participant_title" does not exist`; `.data/e2e` (220 MB, full demo) is the only directory the
current code boots. Sixteen directories have accumulated from recording runs.

Three options — throwaway dir, additive re-apply, wipe and reseed — and **no session has mutated 136 MB
of anybody's data unasked.** Unchanged here. A multi-table sentinel would turn this from a silent skip
into a clean failure and is worth its own addendum.

### 4.8 Two items belonging to other sessions

`AnnouncementToast.test.tsx` names a module that is not a file — the component is declared inline in
`GameboyShell.tsx`. A rename, in a file `avatar-cutout-tuning-ui` has on its list.
`seed-sprite-compare.ts:111-112` hardcodes the *stubbed* face detector's crop geometry, so its
mean-colour-error statistic is fiction under a real-model recording; the sheet it draws is still the
useful artefact, and that session fixed a crash there and left the geometry deliberately.

### 4.9 Register order

ADR-069 and ADR-070 sit after ADR-073 in `ADDENDA.md`, from sessions appending in parallel. The handoff
document resolved to leave it: reordering a committed file several sessions are editing causes more harm
than the disorder. Read the register by heading, not by file order.

### 4.10 Announcement retrieval did not work the way it was described — **now closed by ADR-082**

> **Resolved after this cleanup shipped.** Everything below is the finding as recorded, kept because the
> reasoning is the specification the fix was built against. It is implemented: one stored id
> (`psd.announcements.floor.v1`), seeded to the second-newest live announcement on the first alerts poll
> of a session, advanced by each dismissal, forgotten at sign-out, filtered client-side as
> `announcement.id > floor`. All five design points below were settled as written, and the two that were
> open questions when this was drafted — whose clock, and what happens to the dismissed-id set — were
> answered by using a UUIDv7 **id** rather than a timestamp, and by retiring the set rather than joining
> it. See ADR-082.

Raised by the user while this cleanup was in flight, as a clarification of the intended client logic:

> clients remember when they log on, so announcements sent before session are not retrieved and
> ignored. The client also remembers the timestamp of the most recent announcement that was read and
> dismissed, hence we do not retrieve announcements before that also. All these timestamps we keep in
> local storage.

Then revised, and the revision is the operative spec:

> only the final announcement before the user login should stick, all the ones before that final
> announcement will be ignored.

**So the intended rule is:** on sign-in, keep **the newest announcement that already existed** and
ignore every announcement older than it; show everything announced after sign-in as it arrives; and
ignore anything at or before the last announcement this reader dismissed.

The revision is worth more than a softening. "Ignore everything from before I logged on" loses
*"finals start at 4pm"* for anyone who signs in at 15:55 — the announcement most worth arriving to.
Keeping exactly the last one means a latecomer gets the current state of the event without being handed
the whole morning's backlog, which is the thing the original rule was trying to avoid.

**Neither version is built.** What ships today, verified while writing this:

- One key, `psd.announcements.dismissed.v1`, holding **a list of dismissed ids** — not a timestamp —
  owned by `lib/storage/announcementStore.ts` and pruned against the server's live ids on every write.
- No sign-in timestamp is recorded anywhere. The storage keys in the whole app are
  `psd.announcements.dismissed.v1`, `psd.lastPath.v1`, `psd.sessionCarrier.v1`, `psd.sessionToken.v1`,
  plus the scan queue, sprite cache and backdrop keys — none of them a session start.
- `readLiveAnnouncements` (`db/entities/announcements.ts:57`) returns every non-retracted announcement
  with no time predicate, and `useAlertsStore` filters that list by the dismissed-id set alone.

**The observable difference:** a participant who signs in at 15:00 is shown **every** live announcement
made that morning, because each is still live and none is in their dismissed list. Under the intended
rule they would see exactly one — the last one said before they arrived. The id-set design cannot express
"everything before this point", which is what makes these genuinely different designs rather than two
spellings of one thing.

Deliberately not implemented *in the cleanup commit* — it changes what a participant sees, so it got its
own addendum and its own tests (ADR-082) rather than riding along here. Five things settled in advance,
because the revised rule resolves most of them:

1. **One watermark, not two timestamps — and not a timestamp at all.** Both floors are the same
   statement, *"ignore everything at or before this point"*, so they collapse into one stored value with
   one comparison. Store it as **an announcement id**, not a time: ids are UUIDv7, so ordering by id is
   the server's ordering, and a beach phone whose clock is hours out cannot mis-hide a notice. Comparing
   a locally-recorded "when I logged on" against the server's `createdAt` mixes two clocks for no gain.
   This is the trick ADR-046 already relies on for chat cursors.
2. **Which id, exactly.** On first sign-in the client has just fetched the list; the watermark is the id
   of the **second-newest** announcement in it — that is what makes the newest one "stick" while
   everything older is ignored, in one value with no special case. With zero or one announcement live
   there is nothing to ignore and the watermark stays null. On each dismissal it advances to the id of
   the announcement just dismissed. It may only ever **move forward**, which is safe because ADR-074
   already shows announcements one at a time, oldest first, so dismissals arrive in order.
3. **It replaces the dismissed-id set rather than joining it.** A high-water mark is bounded by
   construction, so `rememberDismissed`'s pruning-against-the-live-list stops being necessary — the
   thing that exists today only to stop a list growing all day. One key, one id, no pruning.
4. **The server does not change, and must not.** Both floors are applied client-side, so it keeps
   returning one identical list and ADR-074's shared `cachedRead` survives. Pushing the watermark into a
   query parameter would give three hundred phones three hundred cache keys — the exact regression
   ADR-064 found and removed from the chat room.
3. **The dismissal floor subsumes the id set**, so that key is replaced rather than joined by a second
   one, and `rememberDismissed`'s pruning stops being needed — a high-water mark is bounded by
   construction, which is strictly better than a list that needs pruning to stay bounded.
5. **A retraction must still win.** Today a hidden announcement leaves the live list and therefore every
   toast. The watermark must not change that: it decides what is *too old* to show, never what stays
   shown, so a retracted announcement is still gone the moment the server drops it. The one case to test
   is a retraction of the announcement the watermark names — the id must stay usable as a comparison
   point after the row it refers to has left every read, which it does, because the comparison is
   `id <= watermark` and never a lookup (the same reason ADR-066's `oldest` may name a removed id).
6. **The existing tests are now a constraint, not an absence.** As of `1558abc` (ADR-080's batches),
   `useAnnouncing` and `AnnouncePage` are at or near 100 %, and those tests **pin today's behaviour** —
   including that every live announcement reaches every reader, and that a retracted row stays listed in
   the console. So `AnnouncePage.test.tsx`, `useAnnouncing.test.ts` and almost certainly
   `AnnouncementToast.test.tsx` change **in the same commit** as the watermark. Reported by
   `avatar-cutout-tuning-ui`, who wrote them; recorded here so whoever implements this expects to edit
   green tests rather than to add missing ones, and reads a red suite as the spec changing rather than as
   a mistake.

### 4.11 The motif corpus

Excluded **by the user's instruction**: 169 of 191 entries in `MOTIF_NAMES` have no call site, and they
are to be placed later rather than retired. Recorded so a future sweep does not read the silence as
agreement — and note that ADR-068's drift test asserts committed sprites ⊆ `MOTIF_NAMES` ∪ CSS
references, so an *unlisted* orphan still fails the suite while a *listed* unplaced sprite correctly
does not.

---

## 5. Verification

Stated per layer, per `AGENTS-workflow.md` §4 — "say which validation layer you actually ran." Results
are recorded in ADR-081 and repeated in the commit message.

| Layer | Command |
|---|---|
| Typecheck, 3 workspaces | `npm run typecheck` |
| Lint | `npx eslint .` |
| Standards, 12 rules | `node scripts/check-standards.mjs` |
| API integration, real PGlite | `npm test --workspace @psd/api` |
| Web unit + hook | `npm test --workspace @psd/web` |
| E2E | **not run** — Chromium cannot obtain its Mach port bootstrap under this sandbox (`mach_port_rendezvous_mac.cc:159 … Permission denied (1100)`), so an e2e claim from this session would be unverifiable |

On the coverage ratchet (**ADR-080**): deleting code with no tests raises the measured percentage, so the
floors hold without being touched. If a floor trips, that is the ratchet working, and the fix is to
adjust it in the same change with a note — not to restore the code.

## 6. Recovery

Every symbol above is one `git show` away:

```
git show <this commit>^:packages/contracts/src/wire.ts
git show <this commit>^:apps/api/src/db/entities/chat.ts
```

ADR-068's rule applies to all of it: if one of these comes back, it comes back **with its call site**,
and with a line saying what changed its mind.
