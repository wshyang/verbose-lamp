**Phase | Progress:** Finalize Phase | Full single-batch delivery

---

# PSD Active Day App — Functional Design Specification (Core)

**Version:** 1.0 | **Status:** Core FDS — MVP | **FDS Builder v2.0**

---

## Metadata

| Field | Value |
|---|---|
| Project | PSD Active Day App |
| Purpose | On-the-day event operations for PSD Active Day agency sports event |
| Venue | Sentosa beach |
| Duration | Single day |
| Participants (expected) | 150–300 |
| Facilitators (expected) | 10–20 |
| Superadmins | 2 (primary + backup) |
| Phasing | Single-phase MVP |
| Deferred scope | Prize ceremony workflow, post-event analytics, media, notifications, social features, broadcast displays |

---

## Conventions

### Tag Conventions

| Tag | Meaning |
|---|---|
| `[MVP]` | In scope for MVP |
| `[SEED]` | Bootstrap seed with defined mechanism |
| `DC-NNN` | Decision Context ID for atomic rollback |

### Anchor Prefixes

`#sec-` sections · `#obj-` objects · `#feat-` features · `#flow-` flows · `#surf-` surfaces · `#state-` state machines

### Actor Notation

| Actor | Auth |
|---|---|
| Participant (P) | nickname + 4-digit PIN + long-lived cookie |
| Facilitator (F) | username + 4-digit passcode + long-lived cookie |
| Superadmin (SA) | username + 4-digit passcode + long-lived cookie |
| Guest (G) | pre-auth surfaces only |

### Snapshot Convention

Data-carrying junction records (FringeScan; TournamentMatch on completion) **snapshot** referenced values at write time (activity name, point value, round number, facilitator username) rather than joining live. Preserves historical truth against mid-event config changes.

### Void/Audit Convention

Void actions on FringeScan and TournamentMatch are: reversible (unvoid supported); logged fully via VoidAuditEntry (every transition writes new audit row with reason + actor + timestamp); excluded from scoring while `is_voided=true`.

---

## Table of Contents

1. Executive Summary
2. Core Objects
3. State Machines
4. Relationships + Cross-Object Constraints
5. Surface Inventory
6. Features
7. User Flows
8. Day-Zero Bootstrap + Empty States
9. Changelog + Assumptions

---

## 1. Executive Summary `#sec-summary`

**What it is:** A beach-optimized web application to run PSD Active Day, a single-day agency sports event at Sentosa featuring a captain's ball tournament and a set of fringe activities, with all points aggregated to agency-cluster leaderboards for a closing ceremony.

**Who uses it:**

- **Participants** (150–300): agency staff signing up with pseudonymous nickname + 4-digit PIN + self-declared cluster + gender + Gameboy-style avatar selection. They form/join teams for the tournament and individually collect QR-scanned points at fringe stations. UI is Gameboy-Pokémon styled with Sentosa motifs.
- **Facilitators** (10–20): event staff operating a spartan large-button admin console via shared generic credentials (e.g., `psdadmin1` / 4-digit passcode). They start/complete tournament matches at courts and scan participant QRs at fringe stations.
- **Superadmins** (2): event organizers configuring point values, defining fringe activities and courts, managing facilitator accounts, and performing corrections (void/edit matches and scans) with full audit trail.

**Core capabilities:**

- Pseudonymous participant signup with long-lived cookie sessions and nickname+PIN recovery.
- Team formation (participant-created, captain-led, join by code or browse, captain add/kick/lock/transfer).
- Ad-hoc captain's ball tournament (facilitator picks 2 teams → declares winner; configurable win/loss points).
- Fringe activities with time-based rounds (facilitator opens/advances/ends rounds; scans participant QR to award activity-configured points).
- Real-time cluster leaderboard + top-10 individual scorers + global match feed.
- Offline scan resilience via browser localStorage queue with idempotent server-side deduplication.
- Superadmin void/edit with full VoidAuditEntry log; superadmin can reset participant PINs (facilitators can too).

**Key design principles:**

- **Speed over security:** shared/pseudonymous credentials; PIN stored plaintext (deliberate); long-lived cookies; ≤1-tap QR access.
- **Historical fidelity:** all scoring events snapshot referenced values at write time.
- **Beach resilience:** offline scan queue with idempotent sync; client-recorded round trusted at sync time.
- **Spartan admin, playful participant:** two distinct UI languages.

**Surface count:** 60. **Object count:** 13. **Feature count:** 50 (F1–F51 with F41 removed).

**Bootstrap sequence:** 17 steps from empty DB to first cluster-scoring event. Environment variable seeds initial superadmin passcode; DB migration seeds cluster catalog + superadmin account.

**Decision Contexts logged:** DC-001 (scan traceability), DC-002 (superadmin match edit), DC-003 (activity end-of-day reversibility), DC-004 (offline scan queue), DC-005 (single facilitator per station operational assumption), DC-006 (gender + avatar).

---

## 2. Core Objects `#sec-objects`

### 2.1 Participant `#obj-participant`

Person attending Active Day. Self-registered, pseudonymous, no real-name auth.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `nickname` | string(3–20) | required; globally unique (case-insensitive); alphanumeric + underscore | length 3–20; matches `^[A-Za-z0-9_]+$`; lowercased form unique | "Nickname must be 3–20 characters, letters/numbers/underscore only, and not already taken." |
| `pin` | string(4) | required; exactly 4 digits; stored plaintext | matches `^[0-9]{4}$` | "PIN must be exactly 4 digits." |
| `cluster_ref` | reference(#obj-cluster) | required; immutable post-signup **except by superadmin correction (ADR-172), frozen once scoring starts** | value ∈ cluster catalogue (**ADR-172: a table, no longer a fixed enum**) | "Please select your cluster." |
| `gender` | enum(male, female) | required at signup; immutable | value ∈ enum | "Please select gender." |
| `avatar_variant` | integer(1–5) | required at signup, Skipper (1) by default (ADR-231); the participant may redraw it on the profile (ADR-021); N=5 sprites per gender | 1 ≤ value ≤ 5 | "Please select an avatar." |
| `created_at` | timestamp | server-set | auto | — |
| `last_seen_at` | timestamp | updated on any authenticated request | auto | — |

**QR code:** encodes `nickname` directly (per DC — fallback to typed nickname on scan failure).

### 2.2 Cluster `#obj-cluster`

Catalogue of agency clusters, seeded at bootstrap with 16. **Superseded by ADR-172: editable by a
superadmin** (S44) — add, rename the display name, retire. The `code` is immutable once created,
and clusters are **retired, never deleted**, because chat messages and gallery photos snapshot the
code permanently. Retiring is refused while the cluster still has members, and both retiring and
reassignment are frozen once scoring starts.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `code` | string(enum) | required; unique; one of: BP, CHROO, Comms, CS, Cumulus, HRP, HRPS, ITC, LDS, OLI, PCG, PSC Sect, PST, ServiceSG, SPR, WD | value ∈ enum | (system error only) |
| `display_name` | string(1–30) | required | non-empty | — |

### 2.3 Team `#obj-team`

Tournament competing unit; participant-formed; can span clusters.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `team_name` | string(3–30) | required; globally unique (case-insensitive) | length 3–30; printable; lowercased form unique | "Team name must be 3–30 characters and not already taken." |
| `join_code` | string(6) | required; unique; auto-generated; uppercase alphanumeric excluding `0/O/1/I/L` | server-generated | — |
| `captain_ref` | reference(#obj-participant) | required; captain must be a member | captain appears in TeamMembership | "Captain must be a team member." |
| `is_locked` | boolean | default false | captain-controlled | (on join attempt) "This team is locked and not accepting new members." |
| `created_at` | timestamp | server-set | auto | — |

### 2.4 TeamMembership `#obj-teammembership`

Data-carrying junction: Participant ↔ Team.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `participant_ref` | reference(#obj-participant) | required | must exist | "Participant not found." |
| `team_ref` | reference(#obj-team) | required | team must exist; not locked (unless captain-add) | "Team not found." OR "Team is locked." |
| `is_captain` | boolean | default false; exactly one captain per team | uniqueness enforced | "A team must have exactly one captain." |
| `joined_at` | timestamp | server-set | auto | — |

**Composite uniqueness:** `(participant_ref, team_ref)` unique. **Global rule:** participant is on at most one team at a time.

### 2.5 Court `#obj-court`

Physical captain's ball court; first-class object with lifecycle.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `court_number` | integer(1–5) | required; unique | 1 ≤ value ≤ 5 | "Court number must be between 1 and 5." |
| `display_label` | string(1–20) | required | non-empty | "Court label required." |
| `is_enabled` | boolean | default true | soft disable (see §3.4) | "Court is currently disabled." |
| `assigned_facilitator_ref` | reference(#obj-facilitatoraccount) | optional | must exist if set | "Facilitator not found." |

### 2.6 TournamentMatch `#obj-tournamentmatch`

One captain's ball match; ad-hoc facilitator-driven. (ADR-089 adds an optional schedule
*around* matches: a superadmin-activated tournament suggests pairings as fixtures, which a
real match claims and settles. The match object itself is unchanged — fixtures live beside
it, never inside it.)

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `court_ref` | reference(#obj-court) | required; court enabled at match start | `court.is_enabled=true` | "Cannot start match on a disabled court." |
| `team_a_ref` | reference(#obj-team) | required; ≠ team_b_ref | teams differ | "A team cannot play itself." |
| `team_b_ref` | reference(#obj-team) | required; ≠ team_a_ref | teams differ | (same) |
| `status` | enum(in_progress, completed, cancelled) | required; starts in_progress | see §3.2 | "Invalid status transition." |
| `winner_team_ref` | reference(#obj-team) | required at completion; ∈ {team_a, team_b} | winner ∈ two teams | "Winner must be one of the two participating teams." |
| `started_by_facilitator_ref` | reference(#obj-facilitatoraccount) | required; server-set from session | auto | — |
| `started_at` | timestamp | required; server-set | auto | — |
| `completed_at` | timestamp | required at completion | auto | — |
| `points_awarded_snapshot` | object {win_points: int, loss_points: int} | frozen from PointConfig at completion | auto-copy | — |
| `is_voided` | boolean | default false; superadmin-only; reversible | see void convention | — |
| `last_edited_by_superadmin_ref` | reference(#obj-superadminaccount) | optional; set on superadmin winner edit | auto | — |
| `last_edited_at` | timestamp | optional; set on winner edit | auto | — |
| `edit_reason` | string(1–200) | required on winner edit | non-empty | "Reason required for match winner edit." |

### 2.7 FringeActivity `#obj-fringeactivity`

Named fringe station (e.g., "Sandcastle Station!"); superadmin-defined.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `activity_name` | string(3–50) | required; unique | length 3–50; non-empty | "Activity name must be 3–50 characters and unique." |
| `award_tiers` | list(1–4) of {label: string(1–20), points: integer(≥1)} | required; labels unique per activity; first tier is the station's pre-armed default; a flat-rate station is a single tier (ADR-092) | 1–4 entries; label 1–20 chars; points ≥ 1 | "Define one to four tiers, each with a different label." |
| `is_active` | boolean | default true; deactivate auto-closes open/ended round | — | "This activity is not currently accepting scans." |
| `assigned_facilitator_ref` | reference(#obj-facilitatoraccount) | optional | must exist if set | "Facilitator not found." |
| `created_at` | timestamp | server-set | auto | — |

### 2.8 FringeRound `#obj-fringeround`

Time-based batch label within a fringe activity.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `activity_ref` | reference(#obj-fringeactivity) | required | must exist | "Activity not found." |
| `round_number` | integer(≥1) | auto-incremented per activity | `(activity_ref, round_number)` unique; = max+1 | "Round number conflict." |
| `status` | enum(open, closed, ended) | required; see §3.3 | at most one round per activity in {open, ended} | "Only one active round per activity." |
| `opened_at` | timestamp | required; server-set | auto | — |
| `closed_at` | timestamp | required when status=closed | auto | — |
| `opened_by_facilitator_ref` | reference(#obj-facilitatoraccount) | required; server-set | auto | — |

### 2.9 FringeScan `#obj-fringescan`

Data-carrying junction: Participant ↔ FringeRound. Immutable except superadmin void flag.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `participant_ref` | reference(#obj-participant) | required | must exist | "Participant not found." |
| `round_ref` | reference(#obj-fringeround) | required; trusted from client at sync time | round exists | "Round not found." |
| `activity_ref` | reference(#obj-fringeactivity) | required; must match round.activity_ref | derived + validated | "Activity mismatch." |
| `facilitator_ref` | reference(#obj-facilitatoraccount) | required; server-set from session | auto | — |
| `activity_name_snapshot` | string(3–50) | snapshotted from activity | auto-copy | — |
| `round_number_snapshot` | integer(≥1) | snapshotted from round | auto-copy | — |
| `points_awarded_snapshot` | integer(≥1) | snapshotted from the awarded tier's points (ADR-092) | auto-copy | — |
| `tier_label_snapshot` | string(1–20) | snapshotted from the awarded tier's label; the scan request names the tier, the server prices it (ADR-092) | tier must exist on the activity | "That award tier is not on this activity." |
| `facilitator_username_snapshot` | string | snapshotted from facilitator | auto-copy | — |
| `client_scan_uuid` | string(uuid) | required; globally unique (idempotency key for offline sync) | server-enforced uniqueness | (duplicate POST returns existing row) |
| `client_timestamp` | timestamp | required; from client at scan time | client-set | — |
| `scanned_at` | timestamp | required; server receipt time | server-set | — |
| `is_voided` | boolean | default false; superadmin-only; reversible | see void convention | — |

**Composite uniqueness:** `(participant_ref, round_ref)` unique — first-write-wins on offline sync collision.

### 2.10 FacilitatorAccount `#obj-facilitatoraccount`

Shared credential for facilitator console.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `username` | string(4–20) | required; unique (case-insensitive); alphanumeric | e.g., `psdadmin1` | "Username not found or passcode incorrect." (generic) |
| `passcode` | string(4) | required; exactly 4 digits; plaintext | matches `^[0-9]{4}$` | "Passcode must be 4 digits." |
| `display_label` | string(1–30) | optional | non-empty if provided | — |
| `default_station_type` | enum(court, fringe_activity, none) | default `none` | value ∈ enum | — |
| `default_station_ref` | polymorphic ref (Court OR FringeActivity) | optional; must match type | — | — |
| `created_at` | timestamp | server-set | auto | — |
| `last_login_at` | timestamp | updated on login | auto | — |

### 2.11 SuperadminAccount `#obj-superadminaccount`

Dedicated config authority.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `username` | string(4–20) | required; unique (case-insensitive) | e.g., `superadmin` | "Username not found or passcode incorrect." |
| `passcode` | string(4) | required; exactly 4 digits; plaintext | matches `^[0-9]{4}$` | "Passcode must be 4 digits." |
| `created_at` | timestamp | server-set | auto | — |
| `last_login_at` | timestamp | required | auto | — |

### 2.12 PointConfig `#obj-pointconfig`

Global tournament point values. Singleton (exactly one row).

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `tournament_win_points` | integer(≥0) | required; NO default (superadmin must set at bootstrap) | value ≥ 0 | "Win points must be zero or greater." |
| `tournament_loss_points` | integer(≥0) | required; NO default | value ≥ 0 | "Loss points must be zero or greater." |
| `updated_at` | timestamp | server-set on change | auto | — |
| `updated_by_superadmin_ref` | reference(#obj-superadminaccount) | required on change | auto | — |

**Bootstrap gate:** no TournamentMatch can be started until both point values are set.

### 2.13 VoidAuditEntry `#obj-voidauditentry`

Immutable audit log for void/unvoid actions on FringeScan and TournamentMatch.

| Attribute | Type | Constraints | Validation | Error Message |
|---|---|---|---|---|
| `target_type` | enum(fringescan, tournamentmatch) | required | value ∈ enum | — |
| `target_ref` | polymorphic reference | required; matches target_type | must exist | "Target not found." |
| `action` | enum(void, unvoid) | required | value ∈ enum | — |
| `reason` | string(1–200) | required | non-empty | "Reason is required for void/unvoid actions." |
| `performed_by_superadmin_ref` | reference(#obj-superadminaccount) | required; server-set | auto | — |
| `performed_at` | timestamp | required; server-set | auto | — |

---

## 3. State Machines `#sec-state`

### 3.1 Team Lifecycle `#state-team`

**States:** `open` ↔ `locked` → `disbanded` (terminal)

| From | To | Trigger | Actor | Guard |
|---|---|---|---|---|
| (creation) | open | Team create | Participant | Creator has no team |
| open | locked | Toggle lock | Captain | — |
| locked | open | Toggle unlock | Captain | — |
| open/locked | (captain changed) | Explicit transfer OR auto on captain leave | Captain / system | New captain is current member |
| open/locked | disbanded | Last member (captain) leaves | System | Zero members remain |
| disbanded | — | terminal | — | — |

**Forbidden:** direct disbandment without zero-member path; no state changes by superadmin (participant-controlled).

### 3.2 TournamentMatch Lifecycle `#state-match`

**States:** `in_progress` → `completed` / `cancelled`; `completed` ↔ `voided`

| From | To | Trigger | Actor | Guard |
|---|---|---|---|---|
| (creation) | in_progress | Facilitator starts match | Facilitator | Court enabled; teams differ; PointConfig set |
| in_progress | completed | Declare winner | Facilitator | Winner ∈ {team_a, team_b} |
| in_progress | cancelled | Cancel | Only starting facilitator | Still in_progress |
| completed | completed (edited) | Superadmin edits winner | Superadmin | New winner ∈ {team_a, team_b}; edit_reason required |
| completed | voided | Superadmin voids | Superadmin | Reason required |
| voided | completed | Superadmin unvoids | Superadmin | Reason required |
| cancelled | — | terminal | — | — |

**Forbidden:** in_progress → voided directly; completed → in_progress; non-starting facilitator cannot cancel.

### 3.3 FringeRound Lifecycle `#state-round`

**States:** `open` → `closed` (via advance); `open` ↔ `ended` (via end-for-day / reactivate)

| From | To | Trigger | Actor | Guard |
|---|---|---|---|---|
| (creation) | open | Open first round OR advance | Facilitator | No other {open, ended} round for activity |
| open | closed | Advance round (atomic close + new-open) | Facilitator | — |
| open | ended | End for the day | Facilitator | — |
| ended | open | Reactivate | Facilitator | — |
| closed | — | terminal | — | — |

**Constraint:** at most one round per activity in `open` OR `ended` state at any time.

### 3.4 Court Lifecycle `#state-court`

**States:** `enabled` ↔ `disabled`

**Soft disable:** disabling a court does NOT auto-cancel in-progress match on that court; the match continues to natural completion. Only new match starts are blocked.

### 3.5 FringeActivity Lifecycle `#state-activity`

**States:** `active` ↔ `inactive`

**Cascading effect:** deactivating an activity auto-closes any `open` or `ended` round on that activity. Reactivating requires facilitator to open a new round (round_number = previous + 1).

### 3.6 Objects Without State Machines

Explicit declaration per state-explicitness principle: **Participant, Cluster, TeamMembership, FringeScan, FacilitatorAccount, SuperadminAccount, PointConfig, VoidAuditEntry** have no state machines. FringeScan and TournamentMatch have `is_voided` boolean flags (denormalized current state), not state machines.

---

## 4. Relationships + Cross-Object Constraints `#sec-relationships`

### 4.1 Central Relationship Table

| # | Object A | Card. | Object B | Name | Constraints | Data-Carrying? |
|---|---|---|---|---|---|---|
| R1 | Participant | N:1 | Cluster | belongs_to | required at signup; immutable | No |
| R2 | Participant | N:M | Team | membership | max 1 team per participant | **Yes** (TeamMembership) |
| R3 | Team | 1:1 | Participant | captained_by | exactly 1 captain; must be member | No (denorm ref) |
| R4 | TournamentMatch | N:1 | Court | played_on | court enabled at start | No |
| R5 | TournamentMatch | N:2 | Team | between (team_a, team_b) | teams must differ | No (two direct refs) |
| R6 | TournamentMatch | N:1 | Team | won_by | winner ∈ {team_a, team_b}; nullable pre-completion | No |
| R7 | TournamentMatch | N:1 | FacilitatorAccount | started_by | server-set from session | No |
| R8 | FringeRound | N:1 | FringeActivity | round_of | at most 1 {open,ended} round per activity | No |
| R9 | Participant | N:M | FringeRound | scanned_at | one scan per (participant, round) | **Yes** (FringeScan) |
| R10 | FringeScan | N:1 | FacilitatorAccount | scanned_by | server-set from session | No |
| R11 | Court | N:1 | FacilitatorAccount | default_assigned_to | optional; superadmin-set | No |
| R12 | FringeActivity | N:1 | FacilitatorAccount | default_assigned_to | optional; superadmin-set | No |
| R13 | PointConfig | N:1 | SuperadminAccount | last_updated_by | server-set on update | No |
| R14 | TournamentMatch | N:1 | SuperadminAccount | last_edited_by | server-set on superadmin edit | No |
| R15 | VoidAuditEntry | N:1 | SuperadminAccount | performed_by | server-set | No |

### 4.2 Cross-Object Constraints

1. **One team max per participant** — TeamMembership create rejects if participant has any existing membership row.
2. **Captain must be a team member** — Team.captain_ref must match a TeamMembership row with is_captain=true.
3. **Auto-transfer on captain leave** — when captain's TeamMembership is removed and ≥1 member remains, is_captain transfers to the member with earliest `joined_at`.
4. **Team disband on last member leave** — when captain is sole member and leaves, Team transitions to `disbanded`.
5. **Winner must be one of the two match teams** — TournamentMatch.winner_team_ref ∈ {team_a_ref, team_b_ref}, enforced at completion AND at superadmin edit.
6. **At most one open/ended round per activity** — FringeRound uniqueness constraint on (activity_ref, status IN {open, ended}).
7. **PointConfig bootstrap gate** — TournamentMatch cannot be created until PointConfig has non-null win + loss values.
8. **Scan requires open round + active activity** — FringeScan create validates round.status=open AND activity.is_active=true at client scan time; for offline sync, server trusts client's round_ref regardless of round's current status (per DC-004 policy).
9. **Case-insensitive nickname uniqueness** — Participant.nickname lowercased-form is globally unique.
10. **Case-insensitive team name uniqueness** — Team.team_name lowercased-form is globally unique.
11. **Scan idempotency** — server-side unique constraint on FringeScan.client_scan_uuid; duplicate POST returns existing row (offline queue safety).
12. **Snapshot integrity** — FringeScan and TournamentMatch snapshot referenced values at write time; edits to source objects (activity rename, award-tier change) do NOT rewrite historical snapshots.

---

## 5. Surface Inventory `#sec-surfaces`

**Total: 60 surfaces.** All `[MVP]`.

### 5.1 Participant Surfaces (17)

| # | Surface | Anchor | Object/Relationship | CRUD |
|---|---|---|---|---|
| S1 | Sign Up Form (nickname, PIN, cluster, gender, avatar variant) | `#surf-signup` | Participant | Create |
| S2 | Sign In Form | `#surf-signin` | Session | Create |
| S3 | QR Home Screen (default landing; shows avatar + QR) | `#surf-qr-home` | Participant | Read (self) |
| S4 | Profile View | `#surf-profile` | Participant | Read |
| S5 | Cluster Leaderboard (real-time + top-10 individuals) | `#surf-clusterleaderboard` | Cluster (aggregated) | Read |
| S6 | My Scan History (total + cluster contribution) | `#surf-my-scans` | FringeScan | List (own) |
| S7 | Create Team | `#surf-team-create` | Team, TeamMembership | Create |
| S8 | Join Team by Code | `#surf-team-join-code` | TeamMembership | Create |
| S9 | Browse Teams (shows name, member count, captain nickname, lock status) | `#surf-team-browse` | Team | List |
| S10 | Team Detail (any team) | `#surf-team-detail` | Team, TeamMembership | Read |
| S11 | My Team View | `#surf-my-team` | Team, TeamMembership | Read |
| S12 | Leave Team | `#surf-team-leave` | TeamMembership | Delete (self) |
| S13 | Captain: Add Member by Nickname | `#surf-team-add-member` | TeamMembership | Create |
| S14 | Captain: Kick Member | `#surf-team-kick` | TeamMembership | Delete |
| S15 | Captain: Toggle Lock | `#surf-team-lock` | Team | Update |
| S16 | Captain: Transfer Captaincy | `#surf-captain-transfer` | TeamMembership | Update |
| S17 | Team Match History (own team) | `#surf-team-matches` | TournamentMatch | List |

### 5.2 Facilitator Surfaces (16)

| # | Surface | Anchor | Object/Relationship | CRUD |
|---|---|---|---|---|
| S18 | Facilitator Sign In | `#surf-fac-signin` | Session | Create |
| S19 | Facilitator Landing (default station or picker) | `#surf-fac-landing` | Court/FringeActivity | Read |
| S20 | Station Switcher | `#surf-fac-switch` | Court, FringeActivity | List |
| S21 | Court View (current match + start button) | `#surf-court-view` | TournamentMatch, Court | Read |
| S22 | Start Match — Team Picker | `#surf-match-start` | TournamentMatch, Team | Create |
| S23 | Match in Progress Screen (two big winner buttons) | `#surf-match-active` | TournamentMatch | Update (winner) |
| S24 | Cancel Match | `#surf-match-cancel` | TournamentMatch | Update (cancel) |
| S25 | Fringe Station Landing (with Scan CTA) | `#surf-fringe-station` | FringeActivity, FringeRound | Read |
| S26 | Open Round 1 (first-round create) | `#surf-round-open` | FringeRound | Create |
| S27 | QR Scanner + Nickname Fallback | `#surf-scan` | FringeScan | Create |
| S28 | Current Round Scan Log | `#surf-scan-log` | FringeScan | List (station/round) |
| S29 | Advance Round (atomic close + open next) | `#surf-round-advance` | FringeRound | Update |
| S30 | End Activity for the Day | `#surf-round-end` | FringeRound | Update (→ended) |
| S31 | Reactivate Activity | `#surf-round-reactivate` | FringeRound | Update (→open) |
| S32 | Sync Queue Viewer (pending scans + manual retry) | `#surf-sync-queue` | (client localStorage) | Read + Retry |
| S33 | Reset Participant PIN (facilitator path) | `#surf-fac-pin-reset` | Participant | Update (pin only) |

### 5.3 Superadmin Surfaces (26)

| # | Surface | Anchor | Object/Relationship | CRUD |
|---|---|---|---|---|
| S34 | Superadmin Sign In | `#surf-super-signin` | Session | Create |
| S35 | Superadmin Dashboard | `#surf-super-dashboard` | (aggregate) | Read |
| S36 | PointConfig Editor | `#surf-pointconfig` | PointConfig | Update |
| S37 | Create Fringe Activity | `#surf-activity-create` | FringeActivity | Create |
| S38 | Edit Fringe Activity (all fields) | `#surf-activity-edit` | FringeActivity | Update |
| S39 | Toggle Activity Active/Inactive | `#surf-activity-toggle` | FringeActivity | Update (state) |
| S40 | List Fringe Activities | `#surf-activity-list` | FringeActivity | List |
| S41 | Create/Edit Court | `#surf-court-manage` | Court | Create + Update |
| S42 | Toggle Court Enabled/Disabled | `#surf-court-toggle` | Court | Update (state) |
| S43 | List Courts | `#surf-court-list` | Court | List |
| S44 | Create Facilitator Account | `#surf-fac-create` | FacilitatorAccount | Create |
| S45 | Edit Facilitator Account (passcode, default station) | `#surf-fac-edit` | FacilitatorAccount | Update |
| S46 | List Facilitator Accounts | `#surf-fac-list` | FacilitatorAccount | List |
| S47 | View All Matches (filterable) | `#surf-super-matches` | TournamentMatch | List |
| S48 | Edit Match Winner | `#surf-match-edit` | TournamentMatch | Update (winner) |
| S49 | Void/Unvoid Match | `#surf-match-void` | TournamentMatch, VoidAuditEntry | Update + audit |
| S50 | View All Scans (filterable) | `#surf-super-scans` | FringeScan | List |
| S51 | Void/Unvoid Scan | `#surf-scan-void-super` | FringeScan, VoidAuditEntry | Update + audit |
| S52 | Participant Detail | `#surf-participant-detail` | Participant, FringeScan, TeamMembership | Read |
| S53 | List All Participants (search/filter) | `#surf-super-participants` | Participant | List |
| S54 | View All Teams (read-only) | `#surf-super-teams` | Team, TeamMembership | List/Read |
| S55 | View Void Audit Log | `#surf-void-audit-log` | VoidAuditEntry | List |
| S56 | Reset Participant PIN (superadmin path) | `#surf-super-pin-reset` | Participant | Update (pin only) |
| S57 | Create Superadmin Account | `#surf-super-create` | SuperadminAccount | Create |
| S58 | List Superadmin Accounts | `#surf-super-list` | SuperadminAccount | List |
| S59 | Edit Superadmin Passcode | `#surf-super-edit` | SuperadminAccount | Update (passcode) |

### 5.4 Shared Cross-Role Surface (1)

| # | Surface | Anchor | Object/Relationship | CRUD |
|---|---|---|---|---|
| S60 | Global Match Feed (all completed matches, chronological) | `#surf-match-feed` | TournamentMatch | List |

### 5.5 Avatar Rendering Rule

Avatars appear on **participant-facing surfaces only** (S3, S4, S5, S6, S9, S10, S11, S17, S60). **Facilitator + superadmin surfaces (S18–S59) are text-only** per spartan admin principle.

---

## 6. Features `#sec-features`

### 6.1 Participant Features

| # | Feature | Anchor | Actor | Description |
|---|---|---|---|---|
| F1 | Sign Up | `#feat-signup` | Guest | Nickname + PIN + cluster + gender + avatar |
| F2 | Sign In | `#feat-signin` | Guest | Resume via nickname + PIN |
| F3 | Long-Lived Session | `#feat-session` | Participant | Auto-restore via cookie |
| F4 | View Profile | `#feat-profile` | Participant | Nickname, cluster, avatar, total points |
| F5 | Display QR Code | `#feat-qr` | Participant | ≤1-tap access via persistent bottom-nav tab |
| F6 | Create Team | `#feat-team-create` | Participant | Become captain; team gets join_code |
| F7 | Join Team via Code | `#feat-team-join-code` | Participant | Enter code to join |
| F8 | Browse & Join Team | `#feat-team-browse` | Participant | See list of teams |
| F9 | View My Team | `#feat-my-team` | Participant | Roster, captain, lock, join_code |
| F10 | Leave Team | `#feat-team-leave` | Participant | Auto-transfers captaincy if applicable |
| F11 | Captain: Add Member by Nickname | `#feat-captain-add` | Captain | Bypasses lock |
| F12 | Captain: Kick Member | `#feat-captain-kick` | Captain | — |
| F13 | Captain: Lock/Unlock Team | `#feat-captain-lock` | Captain | — |
| F14 | Captain: Transfer Captaincy | `#feat-captain-transfer` | Captain | Explicit designation |
| F15 | View My Scan History | `#feat-my-scans` | Participant | Total + cluster contribution |
| F16 | View Cluster Leaderboard | `#feat-clusterleaderboard` | Participant | Real-time + top-10 individuals |
| F17 | View Team Match History | `#feat-team-matches` | Participant | Own team's matches |

### 6.2 Facilitator Features

| # | Feature | Anchor | Actor | Description |
|---|---|---|---|---|
| F18 | Facilitator Sign In | `#feat-fac-signin` | Guest | username + 4-digit passcode |
| F19 | Long-Lived Session | `#feat-fac-session` | Facilitator | Same as participant |
| F20 | Landing on Default Station | `#feat-fac-landing` | Facilitator | Auto-nav to default |
| F21 | Switch Station | `#feat-fac-switch` | Facilitator | Move between courts / fringe |
| F22 | Start Tournament Match | `#feat-match-start` | Facilitator | Pick 2 teams |
| F23 | Declare Match Winner | `#feat-match-complete` | Facilitator | Awards points |
| F24 | Cancel In-Progress Match | `#feat-match-cancel` | Starting facilitator only | No points |
| F25 | View Court's Current Match | `#feat-court-view` | Facilitator | — |
| F26 | Open First Round | `#feat-round-open` | Facilitator | Start scoring |
| F27 | Scan Participant QR | `#feat-scan` | Facilitator | QR or nickname fallback; offline-queue capable |
| F28 | Advance Round | `#feat-round-advance` | Facilitator | Atomic close + open |
| F29 | End Activity for the Day | `#feat-round-end` | Facilitator | Reversible |
| F30 | Reactivate Activity | `#feat-round-reactivate` | Facilitator | Restore ended → open |
| F31 | View Current Round's Scan Log | `#feat-scan-log` | Facilitator | Verification |
| F51 | View Sync Queue | `#feat-sync-queue` | Facilitator | Pending scans + manual retry |

### 6.3 Superadmin Features

| # | Feature | Anchor | Actor | Description |
|---|---|---|---|---|
| F32 | Superadmin Sign In | `#feat-super-signin` | Guest | — |
| F33 | Configure PointConfig | `#feat-pointconfig` | Superadmin | Bootstrap-gated |
| F34 | Create Fringe Activity | `#feat-activity-create` | Superadmin | Name + point value |
| F35 | Edit Fringe Activity | `#feat-activity-edit` | Superadmin | All fields |
| F36 | Toggle Activity Active/Inactive | `#feat-activity-toggle` | Superadmin | Auto-closes open round |
| F37 | Create/Edit Court | `#feat-court-manage` | Superadmin | — |
| F38 | Toggle Court Enabled/Disabled | `#feat-court-toggle` | Superadmin | Soft disable |
| F39 | Create Facilitator Account | `#feat-fac-create` | Superadmin | — |
| F40 | Edit Facilitator Account | `#feat-fac-edit` | Superadmin | Passcode reset + default station |
| F42 | View All Matches | `#feat-super-matches` | Superadmin | Filterable |
| F43 | Edit Match Winner | `#feat-match-edit` | Superadmin | Requires reason |
| F44 | Void/Unvoid Match | `#feat-match-void` | Superadmin | Reversible; requires reason |
| F45 | View All Scans | `#feat-super-scans` | Superadmin | Filterable |
| F46 | Void/Unvoid Scan | `#feat-scan-void-super` | Superadmin | Reversible; requires reason |
| F47 | View Participant Detail | `#feat-participant-detail` | Superadmin | — |
| F48 | View All Teams | `#feat-super-teams` | Superadmin | Read-only |
| F49 | View Cluster Leaderboard (Admin) | `#feat-super-leaderboard` | Superadmin | Same as participant + drill-through |
| F50 | View Void Audit Log | `#feat-void-audit-log` | Superadmin | Filterable by target/actor/date |

**Note:** F41 (delete facilitator account) intentionally omitted — accounts persist to preserve audit foreign keys (per Q38B).

### 6.4 Cross-Role Feature

| # | Feature | Anchor | Actor | Description |
|---|---|---|---|---|
| F17b | View Global Match Feed | `#feat-match-feed` | Any authenticated | All completed matches chronological |

### 6.5 BDD Acceptance Criteria (Selected Critical Features)

**F1 Sign Up:**
- Given no session, When I enter unique nickname + 4-digit PIN + cluster + gender + avatar variant and tap Join, Then Participant is created and I land on QR home showing my avatar.
- Given a nickname already taken, When I try to sign up, Then I see "Nickname must be 3–20 characters, letters/numbers/underscore only, and not already taken."
- Given cluster catalog fails to load, When I reach step 5, Then signup is blocked with connection error message.

**F27 Scan:**
- Given facilitator at active fringe station with open round, When I scan a valid participant QR, Then FringeScan is created with snapshots and confirmation "✓ [Nickname] +[N] pts" shows for 1.5s (on a multi-tier station the armed tier's label is appended — "· First place", ADR-092).
- Given participant already scanned this round, When I scan same participant, Then request rejected with "Already scanned this round" (yellow warning).
- Given no open round exists, When I load scan surface, Then Scan button disabled; "Open Round 1" button shown instead.
- Given offline (no server connection), When I scan, Then scan queued to localStorage; UI shows "✓ [Nickname] +[N] pts (queued)" immediately; sync queue badge increments.

**F23 Declare Winner:**
- Given match in_progress, When I tap winner team button and confirm, Then match status=completed; points_awarded_snapshot copied from PointConfig; team members' clusters gain points.
- Given PointConfig not set, When I try to start match, Then start button disabled with message "Tournament not yet configured — ask superadmin to set point values."

**F44 Void Match:**
- Given a completed match, When superadmin voids with reason, Then match.is_voided=true; VoidAuditEntry row created with action=void; leaderboard recomputes excluding this match.
- Given a voided match, When superadmin unvoids with reason, Then match.is_voided=false; new VoidAuditEntry row with action=unvoid; leaderboard recomputes including this match.

---

## 7. User Flows `#sec-flows`

### 7.1 Participant Sign Up `#flow-signup`

**Actor:** Participant (new). **Trigger:** No session cookie.

**Happy path:**
1. Landing screen: Sign Up / Sign In.
2. Tap Sign Up.
3. Enter nickname (live-validated).
4. Enter 4-digit PIN.
5. Select cluster from 16.
6. Select gender (male/female).
7. Pick avatar variant from 5 shown sprites for chosen gender.
8. Tap Join Active Day.
9. Server creates Participant; long-lived cookie set.
10. Land on QR home showing chosen avatar.

**Alternate:** Nickname taken → validation error inline. Cluster/avatar assets fail to load → block with connection error.

**Postconditions:** Participant row exists; session cookie set; user on QR home.

### 7.2 Session Recovery `#flow-signin`

**Actor:** Returning participant. **Trigger:** No valid session cookie.

**Happy path:**
1. Landing → Sign In.
2. Enter nickname + 4-digit PIN.
3. Tap Resume.
4. Server matches; cookie set; land on QR home.

**Alternate:** Wrong nickname or PIN → generic error "Nickname or PIN doesn't match." Lost PIN → contact facilitator/superadmin for reset (S33 or S56).

### 7.3 Facilitator Scans Participant `#flow-scan`

**Actor:** Facilitator. **Preconditions:** At fringe station with open round.

**Happy path:**
1. Tap Scan button (default station action).
2. Camera opens.
3. QR decoded (nickname).
4. Server validates: nickname exists, activity active, round open, (participant, round) not already scanned.
5. FringeScan created with all snapshots.
6. Confirmation shows: "✓ [Nickname] +[N] pts" for ~1.5s.
7. Camera auto-reopens for next scan.

**Alternates:**
- QR fails to scan (glare/damage) → after ~3s, typed-nickname fallback appears.
- Duplicate scan → "Already scanned this round" yellow warning, 2s auto-dismiss.
- Nickname not found → "Nickname not found — is this participant signed up?"
- No open round → Scan button disabled; "Open Round 1" or "Advance Round" prompt shown.
- Camera permission denied → typed-nickname fallback as primary path.
- **Server unreachable** → scan queued to localStorage; UI shows "✓ (queued)"; sync worker retries; queue badge updates.

**Postconditions:** FringeScan created (immediately if online; on next sync if queued); participant total and cluster leaderboard updated.

### 7.4 Facilitator Runs Tournament Match `#flow-match`

**Actor:** Facilitator at a court.

**Start:**
1. Tap Start Match on court landing.
2. Team picker (search/scroll; shows name + count + captain nickname).
3. Pick Team A.
4. Pick Team B (list excludes Team A).
5. Confirmation: "Team A vs Team B on Court N — Start?"
6. Tap Start. Match created, status=in_progress.
7. Two big winner buttons + small Cancel Match link.

**Complete:**
8. Tap winner button.
9. Confirm "Confirm [Winner Team] wins?"
10. Server marks completed; snapshots PointConfig; awards points.
11. Return to court landing.

**Alternates:**
- Wrong teams started → Cancel Match (only by starting facilitator) → confirm → status=cancelled.
- Court disabled mid-match → match continues (soft disable).
- PointConfig not set → Start button disabled with configuration prompt.
- Zero or one team exists → Start blocked with count message.

**Postconditions:** TournamentMatch created + completed (or cancelled); on completion, team members' clusters gain points.

### 7.5 Participant Creates Team `#flow-team-create`

1. Teams tab → Create Team.
2. Enter team name (live-validated).
3. Tap Create.
4. Server creates Team + TeamMembership(is_captain=true) + join_code.
5. Land on My Team showing team name, join_code (copyable), roster, lock toggle.

**Alternates:** Name taken → inline error. Already on team → Create button hidden.

### 7.6 Participant Joins Team `#flow-team-join`

**By code:**
1. Join Team → Enter Code.
2. Type 6-char code (auto-uppercased).
3. Server validates: code exists, team not locked, no existing team.
4. Confirm "Join [Team Name]? Captain: [nickname]. Members: [N]" → Join.
5. TeamMembership created; land on My Team.

**By browse:**
1. Join Team → Browse Teams.
2. See list.
3. Tap team → detail → Join.

**Alternates:** Invalid code, team locked, already on team — all inline errors. Zero teams exist → "Be the first — create a team!" CTA.

### 7.7 Captain Manages Team `#flow-team-manage`

**Add member:** Add Member → type nickname → validate (exists, no existing team; lock bypassed) → TeamMembership created.

**Kick:** Kebab next to member → confirm → TeamMembership deleted.

**Lock toggle:** Tap toggle → state flips.

**Transfer captaincy:** Action on member → "Make Captain" → confirm → is_captain swapped.

**Captain leaves:** Leave Team → warning about auto-transfer OR disband → confirm → auto-transfer OR team disbanded.

### 7.8 Facilitator Advances Round `#flow-round-advance`

**Advance:** Tap Advance Round → confirm with round N scan count → server atomically closes round N + opens round N+1 → UI updates.

**End for the day:** Tap End for the Day → 2-tap confirm → round transitions to ended → "Reactivate" button shown.

**Reactivate:** Tap Reactivate → round transitions ended → open → scanning resumes with same round_number.

**Concurrent superadmin deactivation:** activity toggled inactive → next scan fails; facilitator UI syncs to inactive state.

### 7.9 Superadmin Voids Scan `#flow-void-scan`

1. Navigate to S50 All Scans or S52 Participant Detail.
2. Filter/search → tap scan.
3. Detail view → Void Scan.
4. Modal: reason input (required 1–200 chars) → confirm.
5. Server: is_voided=true; VoidAuditEntry(action=void) created.
6. Scan appears crossed-out; excluded from scoring; leaderboard recomputes.

**Unvoid:** Same flow with Unvoid action; new VoidAuditEntry(action=unvoid) created.

### 7.10 Superadmin Edits Match Winner `#flow-match-edit`

1. Navigate to S47 All Matches → filter → tap match.
2. Detail view → Edit Winner.
3. Modal shows current winner; offers other team; requires edit_reason.
4. Confirm → server updates winner_team_ref; sets last_edited_by/at/reason; points_awarded_snapshot unchanged.
5. Points flip between teams; leaderboard recomputes.

**Alternate:** Void Match instead → same navigation → reason → confirm → match excluded from scoring.

---

## 8. Day-Zero Bootstrap + Empty States `#sec-bootstrap`

### 8.1 Bootstrap Sequence (Empty DB → First Cluster-Scoring Event)

| Step | Actor | Surface | Action | Unlock |
|---|---|---|---|---|
| B1 | System | (DB migration) | Seed 16 Cluster rows `[SEED]` | Enables participant signup |
| B2 | System | (DB migration) | Seed 1 SuperadminAccount (`username=superadmin`, `passcode=$SUPERADMIN_INITIAL_PASSCODE` env var) `[SEED]` | Enables superadmin login |
| B3 | Superadmin | S34 | Sign in with seeded credentials | Unlocks superadmin dashboard |
| B4 | Superadmin | S36 | Set PointConfig (win + loss points) | Unlocks tournament match creation |
| B5 | Superadmin | S41 | Create Courts (1–5) | Unlocks facilitator default-station assignment to courts |
| B6 | Superadmin | S37 | Create each FringeActivity | Unlocks facilitator default-station assignment to activities |
| B7 | Superadmin | S44 | Create FacilitatorAccounts | Unlocks facilitator login |
| B8 | Superadmin | S45 | (Optional) Assign default stations to facilitators | Faster facilitator landing |
| B9 | Superadmin | S57 | (Optional) Create backup superadmin | Redundancy |
| B10 | Participant | S1 | First participant signs up | Unlocks team formation |
| B11 | Participant | S7 | First team created | Unlocks joining |
| B12 | Participant | S8/S9 | Second participant joins team | Team has ≥2 members |
| B13 | Participant | S7 | Second team created | ≥2 teams exist |
| B14 | Facilitator | S18 | Facilitator signs in | Unlocks facilitator UI |
| B15 | Facilitator | S22 or S26 | Start first match OR open first round | Unlocks scoring events |
| B16 | Facilitator | S27 | First QR scan | First non-zero cluster leaderboard entry |
| B17 | Facilitator | S23 | First match completion | First tournament contribution to leaderboard |

### 8.2 Bootstrap Gates

- **B1 → B10:** cluster catalog required for signup.
- **B2 → B3:** superadmin must exist for admin access.
- **B4 → B15 (match branch):** PointConfig required for match start.
- **B5 → B15 (match branch):** ≥1 enabled Court required.
- **B6 → B15 (round branch):** ≥1 active FringeActivity required.
- **B7 → B14:** FacilitatorAccount required for facilitator login.
- **B11 + B13 → match start:** ≥2 teams required.
- **B15 (round) → B16:** open round required for scan.

### 8.3 Deployment Prerequisite

`SUPERADMIN_INITIAL_PASSCODE` environment variable **MUST** be set at deploy time. DB migration reads this variable to seed SuperadminAccount.passcode. Missing variable → migration fails with error: "SUPERADMIN_INITIAL_PASSCODE environment variable required for initial superadmin seeding."

### 8.4 Empty-State Variants

| Surface | Empty State | Message |
|---|---|---|
| S5 Cluster Leaderboard | Zero points anywhere | "Active Day just started. Points will appear here as they're earned." |
| S6 My Scan History | Participant has zero scans | "No scans yet. Visit fringe stations to earn points!" |
| S9 Browse Teams | Zero teams | "No teams yet. Be the first — create a team!" |
| S17 Team Match History | Team has zero matches | "Your team hasn't played yet." |
| S22 Team Picker (facilitator) | <2 teams exist | "At least 2 teams must exist before a match can start." |
| S28 Current Round Scan Log | Zero scans this round | "No scans yet this round. Ready when you are." |
| S40 Activity List (superadmin) | Zero activities | "No fringe activities yet. Create one to get started." |
| S43 Court List (superadmin) | Zero courts | "No courts yet. Add at least one before facilitators can start matches." |
| S46 Facilitator List (superadmin) | Zero facilitators | "No facilitator accounts yet." |
| S47 All Matches | Zero matches | "No matches yet." |
| S50 All Scans | Zero scans | "No scans yet." |
| S53 All Participants | Zero participants | "No participants signed up yet." |
| S54 All Teams | Zero teams | "No teams yet." |
| S60 Match Feed | Zero completed matches | "No matches completed yet. Check back after games start!" |

---

## 9. Changelog + Assumptions + Appendices `#sec-appendix`

### 9.1 Changelog (Decision Contexts)

| DC | Description | Impact |
|---|---|---|
| DC-001 | FringeScan traceability additions (station label, round name, facilitator ID) | Introduced snapshot pattern on FringeScan |
| DC-002 | Superadmin can edit match winners + void matches | Added is_voided, last_edited_by, edit_reason on TournamentMatch; new S48, S49 surfaces |
| DC-003 | End activity for the day is reversible | Added `ended` state to FringeRound; new F29, F30, S30, S31 |
| DC-004 | Offline scan queue via browser localStorage | Added client_scan_uuid + client_timestamp on FringeScan; server idempotency; new S32, F51 |
| DC-005 | Operational assumption: one facilitator per station/round | Not enforced in system; documented as operational constraint |
| DC-006 | Gender + Gameboy-style avatar (5 variants per gender) | Added gender + avatar_variant on Participant; avatar rendering on participant-facing surfaces only |

### 9.2 Operational Assumptions (Not System-Enforced)

- **A1 (DC-005):** exactly one facilitator operates any given station at any time. System allows any authenticated facilitator to operate any station; org must coordinate.
- **A2:** participants trust each other regarding cluster self-declaration; no verification.
- **A3:** team names are self-moderated; no profanity filter or content moderation surface.
- **A4:** superadmin passcode rotation is manual (via S59) — no forced rotation policy.
- **A5:** avatar sprite assets are static and shipped with the app; N=5 per gender is fixed.
- **A6:** offline scan queue survives browser tab close but not localStorage clear; facilitators should not clear browser data mid-event.

### 9.3 Authorization Derivation Chains (R2 Reference)

| Feature | Authorization IFF | Population Surface |
|---|---|---|
| Captain actions (F11–F14) | TeamMembership.is_captain=true for current user + target team | S7 (creator becomes captain) OR S16 (transfer) |
| Match cancel (F24) | TournamentMatch.started_by = current facilitator AND status=in_progress | S22 (auto-set on match start) |
| Facilitator station operations | Valid facilitator session (no station-specific gating) | S18 |
| Superadmin operations | actor_type = superadmin | B2 or S57 |
| Participant self-data | resource.participant_ref = session.participant_id | S1 or S2 |
| PIN reset | actor_type ∈ {facilitator, superadmin} | S18 or S34 |

### 9.4 Parity Audit Summary (R5)

All 13 objects × their model-permitted operations → mapped to at least one surface. **Zero orphan capabilities.** Confirmed absences (no delete on Participant/FacilitatorAccount/Cluster (**ADR-172**: Cluster gains create/update and a *retire*, still never a delete); no create/delete on PointConfig singleton; auto-only Team disband; immutable VoidAuditEntry) are deliberate.

### 9.5 Deferred Scope (Explicit)

The following are deliberately excluded from MVP; document them separately if pursued later:
- Prize ceremony workflow
- Post-event analytics and reporting
- Photo/media features
- Push notifications
- Participant-to-participant social features (chat, friends)
- Broadcast/display mode for leaderboard TVs
- Live match spectator view
- Facilitator activity notes/log
- Participant search directory
- Team profile customization beyond name
- Hard delete for accounts (breaks audit foreign keys)
- Multi-language / i18n
- Full NFR archetype battery (Security, Performance, Scalability, Accessibility, Observability)

### 9.6 Design Decisions Reference

| Decision | Choice | Rationale |
|---|---|---|
| PIN storage | Plaintext | Low-stakes event; session recovery only; user directive |
| Facilitator auth | Shared 4-digit passcode | Beach ops speed; no real identity assurance needed |
| QR encoding | Raw nickname | Fallback readability if scan fails |
| Cluster editability | ~~Immutable~~ **Editable (ADR-172)** | The gaming risk is specifically *reassignment*, which moves already-earned points, so retiring and reassignment freeze once scoring starts. Adding and renaming cannot move a point and stay open. |
| Team membership | One team max | Scoring integrity |
| Captain leave | Auto-transfer to earliest-joined | Continuity during matches |
| Superadmin team override | None | Participant-controlled social dynamics |
| Court disable | Soft (in-progress continues) | Don't disrupt live play |
| PointConfig defaults | None; bootstrap-gated | Force explicit configuration |
| Match winner edit | Superadmin-only, single audit fields | Rare event |
| Scan/match void | Superadmin-only, full audit log | Frequent corrections expected |
| Offline scan | localStorage queue, idempotent sync | Beach connectivity reality |
| Sync round attachment | Trust client's original round_ref | Historical fidelity |
| Duplicate scan on sync | First-write-wins | Uniqueness constraint |
| Avatar model | Enum-based (gender × 5 variants) | Personalization without object overhead |
| Avatar visibility | Participant surfaces only | Preserves spartan admin aesthetic |

---

**End of FDS Core v1.0.**

**Handoff notes for implementers:**
- Object anchors, feature anchors, and surface anchors are stable and referenced across sections.
- All snapshot fields on FringeScan and TournamentMatch must be populated at write time — do NOT lazy-load from source refs.
- Server-side scan endpoint MUST implement idempotency via `client_scan_uuid` unique constraint.
- Migration MUST fail loudly if `SUPERADMIN_INITIAL_PASSCODE` env var is unset.
- Avatar rendering: 10 static sprite assets (5 male + 5 female) shipped with app bundle.
- Voiding is always reversible and always requires a reason; every void/unvoid transition writes a new VoidAuditEntry row.

---

**Delivery complete.** Reply with any corrections, clarifications, or extension requests. If satisfied, I can offer the friction/self-improvement loop next.
