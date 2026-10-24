import type { ClusterCode } from './clusters.js';
import type { ScreenSceneId, StationType } from './schemas.js';

/**
 * Wire contracts — the shapes crossing the network, defined once and typed on both sides
 * (AGENTS.md §3.x "stable, typed wire contracts"). A field rename here is a compile error in
 * the API and in the web app, never a runtime `undefined`.
 */

export type ActorType = 'participant' | 'facilitator' | 'superadmin';
export type Gender = 'male' | 'female';
export type MatchStatus = 'in_progress' | 'completed' | 'cancelled';
export type RoundStatus = 'open' | 'closed' | 'ended';
// ADR-248 — a reversed award batch is a taken-back decision, which is what this register counts.
// ADR-270 — 'tournamentmatch' left with the old match table; the list matches the CHECK in `schema.sql`.
export type VoidTargetType = 'fringescan' | 'swagclaim' | 'awardbatch';
export type VoidAction = 'void' | 'unvoid';

export interface ClusterView {
  code: ClusterCode;
  displayName: string;
}

export interface ParticipantView {
  id: string;
  nickname: string;
  clusterCode: ClusterCode;
  gender: Gender;
  avatarVariant: number;
  avatarLook: string;
  /**
   * ADR-031/035 — the id of a sprite made from the participant's own photo, or null for
   * one of the drawn characters. The sprite itself is fetched once and cached by the
   * browser (`GET /api/avatars`).
   */
  avatarPhotoId: string | null;
  /**
   * ADR-061 — the energetic word this participant is called, assigned at sign-up. Shown wherever
   * the app used to say "Trainer". Always present: every participant has one.
   */
  title: string;
  /**
   * ADR-088 — the 4-digit number spoken to a facilitator for manual award entry. Public by
   * design (unlike the PIN): it identifies, it does not authenticate.
   */
  scanNumber: string;
  createdAt: string;
}

export interface ParticipantTotalsView {
  fringePoints: number;
  tournamentPoints: number;
  totalPoints: number;
  /** Every scan this person holds, including repeat visits to the same station. */
  scanCount: number;
  /** ADR-176 — progress toward the passport bonus, and whether it has been earned. */
  passport: PassportProgressView;
}

/**
 * ADR-176 — the passport, from one participant's point of view.
 *
 * `stationsVisited` counts DISTINCT stations, which is not `scanCount`: two rounds at the same
 * station are two scans and one station, and only the latter moves a passport along. The config
 * values travel with the progress so the card can say what is still needed without a second
 * request, and so a day with no passport (`bonusPoints: 0`) can render nothing at all.
 */
export interface PassportProgressView {
  stationsVisited: number;
  stationsRequired: number;
  bonusPoints: number;
  isEarned: boolean;
}

/**
 * ADR-239 — one station on the passport tab. `isCompleted` is true once this participant holds
 * a counted scan there. A voided scan or one undone at the station is not counted, which is the
 * same rule the points use. ADR-261 — `completions` is how many counted scans they hold there:
 * each round at a station they already know strikes another chop, so the passport needs the
 * number, not just the fact.
 */
export interface PassportStationView {
  activityId: string;
  activityName: string;
  isCompleted: boolean;
  completions: number;
}

/** ADR-239 — every station the day has, in the order the facilitators see them. */
export interface PassportView {
  stations: PassportStationView[];
}

export interface SessionView {
  actorType: ActorType;
  participant?: ParticipantView;
  staff?: { id: string; username: string; displayLabel: string | null };
  defaultStation?: StationRefView | null;
}

export interface StationRefView {
  type: StationType;
  id: string | null;
  label: string | null;
}

export interface TeamMemberView {
  participantId: string;
  nickname: string;
  clusterCode: ClusterCode;
  gender: Gender;
  avatarVariant: number;
  avatarLook: string;
  avatarPhotoId: string | null;
  /** ADR-061 — the energetic word this participant is called, for the avatar peek (ADR-062). */
  title: string;
  isCaptain: boolean;
  joinedAt: string;
}

export interface TeamSummaryView {
  id: string;
  teamName: string;
  captainNickname: string;
  memberCount: number;
  isLocked: boolean;
  createdAt: string;
}

export interface TeamDetailView extends TeamSummaryView {
  members: TeamMemberView[];
  joinCode: string | null;
  viewerIsMember: boolean;
  viewerIsCaptain: boolean;
}

/** ADR-172 — S44 a row of the editable cluster catalogue. */
export interface ClusterAdminView {
  code: string;
  displayName: string;
  /** Live members. Non-zero is exactly why a retire is refused. */
  memberCount: number;
  retiredAt: string | null;
  isRetired: boolean;
}

export interface CourtView {
  id: string;
  courtNumber: number;
  displayLabel: string;
  isEnabled: boolean;
  assignedFacilitatorId: string | null;
  assignedFacilitatorUsername: string | null;
  currentMatchId: string | null;
}

/** ADR-089 — the active schedule, if the superadmin has activated one. */
export interface TournamentView {
  id: string;
  format: 'round_robin' | 'world_cup';
  status: 'group_stage' | 'knockout' | 'completed';
  groupSize: number;
  advanceCount: number;
  /** ADR-137 — whether the bracket carries a third-place match. Chosen at activation. */
  hasThirdPlace: boolean;
  /** ADR-169 — how the first knockout round was paired. Frozen at activation. */
  knockoutPairing: KnockoutPairing;
  activatedAt: string;
}

/**
 * ADR-089 — one suggested matchup. Fixtures are suggestions; matches stay the truth: a
 * fixture is `claimed` by the real match that fulfils it and `played` when that match
 * completes. Knockout slots may not know their teams yet (null until the feeder resolves).
 */
export interface FixtureView {
  id: string;
  /** ADR-137 — `third_place` is the semi-final losers' match, never the final. */
  stage: 'group' | 'knockout' | 'third_place';
  roundNumber: number;
  groupCode: string | null;
  sequence: number;
  teamAId: string | null;
  teamAName: string | null;
  teamBId: string | null;
  teamBName: string | null;
  suggestedCourtLabel: string | null;
  /**
   * ADR-109 — projected kick-off, simulated from live matches, match length and the
   * changeover gap. Only the Line-ups read computes it; elsewhere it is absent.
   */
  estimatedStartAt?: string | null | undefined;
  /**
   * ADR-111 — when a knockout seat is still TBD, which queue position feeds it: the
   * Line-ups can then say "Winner of #7" instead of a mute "Winner TBD".
   */
  teamAFromSequence?: number | null | undefined;
  teamBFromSequence?: number | null | undefined;
  status: 'pending' | 'claimed' | 'played' | 'walkover' | 'skipped';
  resolvedWinnerTeamId: string | null;
}

/**
 * ADR-091 — the viewer's own next fixture, when it is close enough to warrant moving.
 * gamesAway is the queue position among unresolved fixtures: 0 means up next (or already
 * in play, if the fixture is claimed).
 */
export interface UpSoonView {
  fixtureId: string;
  gamesAway: number;
}

export interface StandingRowView {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  /**
   * ADR-156 — drawn group matches, which existed in the fold from ADR-152 onward but were
   * dropped at this boundary. A table showing only W and L made `played` disagree with
   * `wins + losses`, and the quietest reading of that disagreement is that the missing game
   * was a loss. Carried as its own number so every surface has to decide what to say.
   */
  draws: number;
  losses: number;
  /**
   * ADR-115 — points scored and conceded across this team's group matches, and the
   * difference, which breaks a tie that head-to-head could not. `isFullyScored` is false
   * when any of those matches carried no score (a walkover, or one nobody scored): the
   * difference is then a partial sum and is neither used for ranking nor shown as a fact.
   */
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  isFullyScored: boolean;
  rank: number;
}

/**
 * ADR-150 — the hall screen's picture of the day's shape: who is in which group, and how a
 * team gets from there to the final.
 *
 * One read answers it at every stage of the day, which is the point: before activation it is
 * a plan drawn from the team count and the chosen format, afterwards it is the real draw, and
 * during play it fills in. The room should never have to be told which of those it is looking
 * at — the picture is the same picture.
 */
export interface BracketSeatView {
  /** A team name once one is known, else what will fill it: "Winner A", "Winner SF1". */
  label: string;
  teamId: string | null;
  /** True once this seat has won the match it is in; the wall marks it and moves on. */
  isWinner: boolean;
}

export interface BracketMatchView {
  /** The real fixture once one exists; null while this is still only a plan. */
  fixtureId: string | null;
  a: BracketSeatView;
  b: BracketSeatView;
}

export interface BracketRoundView {
  /** Named by distance from the end — Final, Semi-finals — because that is how rooms read. */
  label: string;
  matches: BracketMatchView[];
}

export interface BracketSlotView {
  teamId: string | null;
  /** A team name, or "Team 3" while the draw has not happened. */
  label: string;
  played: number;
  wins: number;
  /** ADR-156 — see StandingRowView.draws; the hall board reads this one. */
  draws: number;
  /** Null before any match has been played: a table of rank-1s would be a lie. */
  rank: number | null;
  /** Currently inside the advancing places. Meaningless, and false, in a round robin. */
  isQualifying: boolean;
}

export interface BracketGroupView {
  code: string;
  slots: BracketSlotView[];
}

/**
 * ADR-169 — how the first knockout round is paired. 'classic' keeps the top seeds apart until
 * late; 'adjacent' pairs the list in order, 1 v 2 and 3 v 4.
 */
export type KnockoutPairing = 'classic' | 'adjacent';


export interface TournamentBracketView {
  /** `planned` means nothing is activated yet and this is the intended shape. */
  status: 'planned' | 'group_stage' | 'knockout' | 'completed';
  format: 'round_robin' | 'world_cup';
  teamCount: number;
  groupSize: number;
  advanceCount: number;
  hasThirdPlace: boolean;
  knockoutPairing: KnockoutPairing;
  groups: BracketGroupView[];
  /** Empty in a round robin, which has no bracket: the table IS the road to the final. */
  rounds: BracketRoundView[];
}

/** ADR-152 (F-1) — mirrors `tournament_fixture.stage`; only `group` may end level. */
export type MatchStage = 'group' | 'knockout' | 'third_place';

export interface MatchView {
  id: string;
  courtId: string;
  courtLabel: string;
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  status: MatchStatus;
  /**
   * ADR-114 — the running score, which is also the result once the match ends: the team
   * with the higher score IS the winner, so these are never merely decorative.
   */
  scoreA: number;
  scoreB: number;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  startedByFacilitatorId: string;
  startedByUsername: string;
  startedAt: string;
  completedAt: string | null;
  winPointsSnapshot: number | null;
  lossPointsSnapshot: number | null;
  /** ADR-152 (F-1) — what a draw paid, frozen like the other two. */
  drawPointsSnapshot: number | null;
  /**
   * ADR-152 (F-1) — the stage this match belongs to, so the marshal's console knows whether
   * a level score may end it. Null means the match claimed no fixture (ADR-089).
   */
  stage: MatchStage | null;
  isVoided: boolean;
  lastEditedAt: string | null;
  editReason: string | null;
}

/** ADR-092 — a named award level ("First place" +10). Every activity has at least one. */
export interface AwardTier {
  label: string;
  points: number;
}

/** ADR-110 — a swag item: what it is called and how many one participant may take per round. */
export interface SwagItemView {
  label: string;
  limit: number;
}

export interface SwagStationView {
  id: string;
  stationName: string;
  items: SwagItemView[];
  isActive: boolean;
  createdAt: string;
  currentRound: SwagRoundView | null;
}

export interface SwagRoundView {
  id: string;
  stationId: string;
  roundNumber: number;
  status: RoundStatus;
  openedAt: string;
  closedAt: string | null;
  openedByUsername: string;
  claimCount: number;
}

export interface SwagClaimView {
  id: string;
  participantId: string;
  participantNickname: string;
  clusterCode: ClusterCode;
  /** ADR-159 — the superadmin list filters by station, as the scan list filters by activity. */
  stationId: string;
  stationNameSnapshot: string;
  roundNumberSnapshot: number;
  itemLabelSnapshot: string;
  facilitatorUsernameSnapshot: string;
  claimedAt: string;
  /** ADR-159 — reversed, by the counter's own undo or by a superadmin void. */
  isVoided: boolean;
  /**
   * ADR-159 — set only when the counter took its own handout back inside the window.
   * A superadmin void leaves this null and writes to the void audit instead, so the two
   * reversals stay tellable apart on the row itself (ADR-138 made the same distinction).
   */
  undoneAt: string | null;
}

export interface ActivityView {
  id: string;
  activityName: string;
  awardTiers: AwardTier[];
  isActive: boolean;
  assignedFacilitatorId: string | null;
  assignedFacilitatorUsername: string | null;
  createdAt: string;
  currentRound: RoundView | null;
}

export interface RoundView {
  id: string;
  activityId: string;
  roundNumber: number;
  status: RoundStatus;
  openedAt: string;
  closedAt: string | null;
  openedByUsername: string;
  scanCount: number;
}

export interface ScanView {
  id: string;
  participantId: string;
  participantNickname: string;
  clusterCode: ClusterCode;
  roundId: string;
  activityId: string;
  activityNameSnapshot: string;
  roundNumberSnapshot: number;
  pointsAwardedSnapshot: number;
  tierLabelSnapshot: string;
  facilitatorUsernameSnapshot: string;
  clientScanUuid: string;
  clientTimestamp: string;
  scannedAt: string;
  isVoided: boolean;
  /**
   * ADR-138 — set when the station undid its own award inside the ten-second window. A
   * superadmin void leaves it null, so the corrections console can tell "a marshal corrected
   * themselves" from "somebody overruled this" without a second table.
   */
  undoneAt: string | null;
}

/**
 * ADR-202 — who somebody is, for a surface that only holds their id.
 *
 * Everything needed to draw a face and open the peek card (ADR-062), and nothing else: no PIN,
 * no scan number, no team. Resolved by participant id and cached once per device, which is why
 * it is a view of its own rather than four more fields on everything that mentions a person.
 *
 * Deliberately **live**, unlike the snapshot fields on a chat row beside it. A nickname is
 * frozen because the room's record of what was said must not be rewritten; an avatar is not
 * part of what was said. It answers "who is this, go and find them", and a person who changed
 * their face an hour ago has one face, not three.
 */
export interface ParticipantIdentityView {
  participantId: string;
  nickname: string;
  clusterCode: ClusterCode;
  gender: Gender;
  avatarVariant: number;
  avatarLook: string;
  avatarPhotoId: string | null;
  title: string;
}

export interface ParticipantIdentityListView {
  items: ParticipantIdentityView[];
}

/**
 * ADR-046 — a chat message on the wire. `authorParticipantId` is an id, never a sprite body:
 * avatars resolve through the client's existing fetch-once sprite cache, so a busy room does
 * not re-send the same avatar three hundred times.
 *
 * ADR-202 took that sentence at its word. When chat grew avatars, nothing on this interface
 * had to change: the id was already the whole of what the room needs to say about a face, and
 * the identity behind it is fetched once per person rather than once per message.
 */
export interface ChatMessageView {
  id: string;
  authorType: 'participant' | 'facilitator' | 'superadmin';
  authorLabel: string;
  authorParticipantId: string | null;
  clusterCode: ClusterCode | null;
  body: string;
  createdAt: string;
}

export interface ChatPageView {
  messages: ChatMessageView[];
  /**
   * ADR-065 — is there history behind the oldest message in this page?
   *
   * A fact, not a guess: the server reads one row past the limit and drops it, so a list knows to
   * stop asking instead of making one more empty request at the end of the conversation. Always
   * false for a forward delta, where the question does not apply.
   */
  hasOlder: boolean;
}

/**
 * ADR-066 — a message is gone, said to every phone already holding it.
 *
 * Only the id travels. The row still exists for the audit trail (it is a soft hide, never a
 * delete), but nothing about what it said may be re-sent to a room it has just been pulled from —
 * a retraction that quotes the thing it is retracting is not a retraction.
 */
export interface ChatHiddenView {
  messageId: string;
}

/**
 * ADR-063 — a message in a team's own room.
 *
 * Thinner than `ChatMessageView` because a team room is its members: the author is always a
 * participant, so there is no author type and no cluster (everyone in the room can see the
 * roster). It carries the author's title instead (ADR-061), frozen as it was when they spoke.
 */
/**
 * ADR-063 plus ADR-154's three. `said` is a person talking; everything else is the room's own
 * history. The staff kinds are distinct from `joined`/`left` on purpose: the member did not do
 * it, and a room that says they did is a false record rather than a terse one.
 */
export type TeamChatMessageKind =
  | 'said'
  | 'joined'
  | 'left'
  | 'staff_added'
  | 'staff_removed'
  | 'captain_changed';

export interface TeamChatMessageView {
  id: string;
  /**
   * ADR-063 — the room is also the team's history. `said` is a line someone typed; `joined` and
   * `left` are roster events whose sentence is rendered from `messages.ts` rather than stored, so
   * that user-facing copy stays in one place.
   */
  kind: TeamChatMessageKind;
  authorLabel: string;
  /** The subject: whoever spoke, or whoever joined or left. */
  authorParticipantId: string;
  title: string;
  body: string | null;
  createdAt: string;
}

/**
 * ADR-146 — somebody in this room has the box open and is writing in it.
 *
 * Carries no body, no id and no time: it is an assertion about *now*, it expires on the
 * receiving phone, and the nickname is one the reader can already see on every message above
 * it. `participantId` is here so a phone can recognise and discard its own echo — the server
 * fans out to a team topic and does not keep a listener-to-participant map to filter by.
 */
export interface TeamChatTypingView {
  participantId: string;
  label: string;
}

export interface TeamChatPageView {
  messages: TeamChatMessageView[];
  /**
   * ADR-075 — is there history behind the oldest message in this page?
   *
   * The same fact the global room reports (ADR-065), and exact for the same reason: the server reads
   * one row past the limit and drops it. Always false for a forward delta, where the question does
   * not apply.
   */
  hasOlder: boolean;
}

/**
 * ADR-177 — one line of the day's programme.
 *
 * `startsAt` is nullable because the run sheet opens with an item that has no time ("before
 * departure: have an early lunch"). A timeless item renders without a clock column, sorts first,
 * and is never `now` or `next`.
 *
 * The times are ISO strings like every other instant on the wire; the client formats them. The
 * server deliberately does NOT send "2.30pm" — a preformatted time cannot be re-rendered in
 * another locale and cannot be compared, and this is the one screen where comparing is the point.
 */
export interface AgendaItemView {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  title: string;
  location: string | null;
  detail: string | null;
  isActive: boolean;
}

/**
 * The programme as a participant reads it, with `now` and `next` DERIVED on read.
 *
 * Derived, never stored, for the same reason as the champion bonus (ADR-006) and the passport
 * (ADR-176): "now" is a function of the clock, and a stored flag is only true until the next
 * minute. There is no cron in this app and there should not be one for this.
 *
 * `nowId` and `nextId` are ids rather than embedded copies so the list stays the single source of
 * each item's text — a highlighted row and its copy in the list cannot drift if there is only one.
 */
export interface AgendaView {
  items: AgendaItemView[];
  nowId: string | null;
  nextId: string | null;
  /** The server's clock at read time, so the client can re-derive without trusting the device. */
  asOf: string;
}

/**
 * ADR-074 — a staff announcement, which is not a chat message.
 *
 * It is delivered as a toast over the banner rather than as a line in a room nobody is sitting in,
 * and it is dismissed per reader rather than per row — which is the other half of why it is not a
 * chat message, and why that state lives in the browser and not in a column (ADR-074). Only a
 * superadmin writes one.
 */
export interface AnnouncementView {
  id: string;
  body: string;
  authorLabel: string;
  createdAt: string;
}

/**
 * ADR-125 — when each social feed last changed.
 *
 * A time rather than an id, which reverses ADR-082's reasoning for the announcement floor, and
 * the reversal is deliberate: the clock-skew objection to timestamps only bites when the two
 * sides of the comparison come from different clocks. Here they do not. The reader stores the
 * server's own string as its last-read mark, so every comparison is server-clock against
 * server-clock and a phone two hours out still lights correctly.
 *
 * `iso()` emits fixed-width UTC, so these sort lexicographically in exactly timestamp order:
 * compare the strings, never parse them.
 */
export interface FeedWatermarksView {
  /** ADR-083 — the global room. */
  chat: string | null;
  /** ADR-063 — the viewer's own team room; null for a participant with no team. */
  teamChat: string | null;
  /** ADR-047 — the photo wall. */
  gallery: string | null;
}

/**
 * ADR-125 — one feed's activity, as the moment it last changed.
 *
 * The same string the snapshot carries for that feed, so a frame and a reconnect say the
 * identical thing and the client has one comparison rather than two code paths.
 */
export interface FeedActivityView {
  at: string;
}

/**
 * ADR-153 — a feed's latest moment after something was REMOVED from it.
 *
 * Deliberately not a `FeedActivityView`. Activity says "something happened at `at`, so raise
 * your mark if it is lower"; a retraction says "`at` is now the feed's latest, whatever you
 * believed", which is the only frame in the system that may move a watermark BACKWARDS.
 * Giving the two the same type would make the client's merge a guess about which it holds.
 *
 * `at` is null when nothing visible is left in that feed at all, which is a real state: hide
 * the only message in the room and the dot must go out rather than cling to the hidden one.
 */
export interface FeedRetractionView {
  at: string | null;
}

/**
 * ADR-063 — what needs the participant's attention.
 *
 * The unread signal is a dot, not a number: one unread message and a hundred both mean "look in
 * here", and a boolean cannot drift between two phones the way a count can.
 *
 * ADR-074 — and announcements ride the same endpoint, which is exactly what its first comment said it
 * was shaped for: "an object with one field so a second kind of alert does not need a new endpoint".
 * This is already polled on the jittered cadence, so a toast costs no new request and no new stream.
 */
export interface AlertsView {
  /**
   * ADR-091 — the viewer's team is due on a court within the capacity window (its first
   * unresolved fixture sits inside the next `enabled court count` queue positions).
   *
   * ADR-133 — the **same type the live frame carries**, where this was once a bare boolean.
   * The LED only ever needed `upSoon`, but a toast must not fire twice for one fixture, and
   * the device cannot tell a reconnect's snapshot from news without the `fixtureId` to compare
   * against what it last announced. ADR-118's restart button re-states the window to every
   * team at once, so a snapshot that says only "yes" would set off the whole building.
   *
   * Sharing the frame's type rather than defining a second shape is deliberate: the snapshot
   * and the frame answer one question, and two representations of one fact drift (ADR-131).
   */
  teamUpSoon: TeamUpSoonView;
  /**
   * ADR-125 — when each social feed last changed, for the reader to compare against what it
   * has already seen.
   *
   * This replaced two server-computed `unread` booleans, and the reason is load rather than
   * taste. A boolean had to be answered *per reader*, keyed by that reader's stored marker, so
   * three hundred reconnects asked six hundred keyed questions. A watermark is one fact about
   * the feed, shared by every reader of it, so the same wave asks three.
   *
   * Null means the feed is empty, which is the one state that must never light an LED.
   */
  feeds: FeedWatermarksView;
  /**
   * Every live announcement, oldest first — the same list for every participant.
   *
   * ADR-074 — dismissal is not filtered here. It is the reading browser's business
   * (`lib/storage/announcementStore.ts`), which is what lets this read be one `cachedRead` shared
   * by three hundred phones instead of three hundred per-reader queries.
   */
  announcements: AnnouncementView[];
}

/**
 * ADR-121 — the first frame on every status connection: the whole of what the alerts poll used
 * to answer, which is what makes a reconnect a re-sync rather than a gap.
 *
 * It is literally `AlertsView` and not a new shape, so the client has one code path for "what is
 * true now" whether it arrived over a socket or over the fallback poll.
 */
export type StatusSnapshotView = AlertsView;

/**
 * ADR-091/121 — a transition in the up-soon window, as state rather than as an instruction.
 *
 * `gamesAway` rides along because the server already knows it and the copy is better for it —
 * "you are up next" at 0 reads differently from "one game away" at 1. `fixtureId` is what the
 * client floors against, so one fixture can only ever interrupt somebody once.
 */
export interface TeamUpSoonView {
  upSoon: boolean;
  gamesAway: number | null;
  fixtureId: string | null;
}

/**
 * ADR-047 — a gallery photo's metadata. The bytes are never here: they are fetched from
 * `/api/gallery/photos/{id}/{full|thumb}`, whose URL is permanent because the id is a UUIDv7 and a
 * photo never changes after upload. That is what makes `immutable` caching safe, and caching is what
 * keeps a hundred phones opening the gallery at once survivable.
 *
 * ADR-048 — the bytes live in `gallery_blob`, not on disk, in their own table so that a listing
 * physically cannot read one.
 */
export interface GalleryPhotoView {
  id: string;
  caption: string;
  uploaderType: 'participant' | 'facilitator';
  uploaderLabel: string;
  uploaderParticipantId: string | null;
  clusterCode: ClusterCode | null;
  width: number;
  height: number;
  voteCount: number;
  /*
   * ADR-134 — `hasMyVote` is deliberately NOT here. It was the one per-viewer field in an
   * otherwise identical list, and it made three hundred phones three hundred cached pages of
   * the same sixty photos. The personal half travels as `myVoteIds` on the page below.
   */
  createdAt: string;
}

export interface GalleryPageView {
  /** The same sixty photos for everybody, which is what lets one answer serve the room. */
  photos: GalleryPhotoView[];
  /**
   * ADR-134 — the per-viewer overlay: which of these photos this participant has liked.
   *
   * Ids rather than a flag per photo, and a separate field rather than a second endpoint
   * (decision C3): the list stays shared and cacheable, and the client folds the two together.
   * Empty for a facilitator or a superadmin, who browse the wall but do not vote on it.
   */
  myVoteIds: string[];
  remainingUploads: number;
}

/**
 * ADR-047 — what a superadmin sees that a participant does not: whether a photo is already
 * hidden, and how many people reported it. The report count is the signal moderation actually
 * runs on, so it is sorted to the top of the console rather than left to be noticed.
 */
export interface GalleryModerationView extends GalleryPhotoView {
  hiddenAt: string | null;
  reportCount: number;
  /**
   * ADR-052 — false when the phone had to re-encode an oversized original to fit the archive cap.
   * Corporate needs this: an archive is only useful if you can tell which files are pristine.
   */
  rawIsOriginal: boolean;
}

export interface ClusterStandingView {
  clusterCode: ClusterCode;
  displayName: string;
  fringePoints: number;
  tournamentPoints: number;
  totalPoints: number;
  participantCount: number;
  rank: number;
  /** When this total was reached — ties go to whoever got there first (ADR-029). */
  reachedAt: string | null;
}

export interface IndividualStandingView {
  participantId: string;
  nickname: string;
  clusterCode: ClusterCode;
  gender: Gender;
  avatarVariant: number;
  avatarLook: string;
  avatarPhotoId: string | null;
  /** ADR-061 — the energetic word this participant is called, for the avatar peek (ADR-062). */
  title: string;
  totalPoints: number;
  rank: number;
  reachedAt: string | null;
}

/**
 * ADR-161 — one row of the day's tournament record, flattened out of the group tables.
 *
 * Flat rather than grouped because this is the shape a spreadsheet wants, and because a
 * reader asking "where did we come" should not have to find their group first.
 */
export interface FinalTeamRowView {
  groupCode: string;
  /** Rank WITHIN the group (ADR-115's ordering), not across the tournament. */
  rank: number;
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  /** ADR-115 — false when a match carried no score, so the difference is a partial sum. */
  isFullyScored: boolean;
}

/** ADR-161 — a place on the tournament rostrum, which no group table can state. */
export interface FinalPodiumEntryView {
  place: 1 | 2 | 3;
  teamId: string;
  teamName: string;
  /** How the place was won: 'Won the final', 'Lost the final', 'Won the third-place match'. */
  basis: string;
}

/** ADR-161 — everything the prize-giving reads out and everything the record needs. */
export interface FinalStandingsView {
  generatedAt: string;
  /**
   * True until the tournament is completed. Printed on the sheet itself rather than used to
   * refuse the read: an unclosed match at 15:50 must not be the reason nothing prints.
   */
  isProvisional: boolean;
  /** null when no tournament has been activated, in which case the teams table is empty. */
  tournamentStatus: 'planned' | 'group_stage' | 'knockout' | 'completed' | null;
  /** All 16, including the ones that scored nothing (fds.md §8.4). */
  clusters: ClusterStandingView[];
  /** EVERY participant, including those on zero: a record that omits them is not a record. */
  individuals: IndividualStandingView[];
  teams: FinalTeamRowView[];
  /**
   * As complete as the results allow, and no more: empty before the final is won, two deep
   * in a bracket with no third-place match, three deep from a round robin's table the
   * moment every fixture has resolved. Each entry says how it was earned, so a short
   * rostrum reads as a fact about the format rather than as missing data.
   */
  podium: FinalPodiumEntryView[];
}

export interface LeaderboardView {
  clusters: ClusterStandingView[];
  topIndividuals: IndividualStandingView[];
  generatedAt: string;
}

/** ADR-117 — one entry in the superadmin's manual correction ledger. */
export interface ScoreAdjustmentView {
  id: string;
  participantId: string;
  activityId: string;
  /** Signed: negative entries take points away. */
  points: number;
  reason: string;
  activityName: string;
  createdByUsername: string;
  createdAt: string;
  /**
   * ADR-248 — the batch this was posted inside, if any. The ledger shows a reversed batch and marks it
   * rather than hiding it: this view is the record of decisions, and the points filter lives on the
   * board, where counting is what it is for.
   */
  batchId: string | null;
  batchLabel: string | null;
  batchReversed: boolean;
}

/** One team's line of a posted award batch (ADR-248). */
export interface TeamAwardView {
  id: string;
  teamId: string;
  teamName: string;
  points: number;
  /** Who the money was paid to, as the roster stood when the batch was posted (ADR-005). */
  participantIds: string[];
  createdAt: string;
  /**
   * The batch this line belongs to, and whether it was taken back. A team's own ledger has to be able to
   * say which of its awards are live without the console holding the batch list in memory — and it says it
   * as a mark, not by omission: the reversed line is a decision the register keeps showing (ADR-248).
   */
  batchLabel: string;
  batchReversed: boolean;
}

/**
 * A posted decision: what it paid, who said so, and whether it was taken back (ADR-248).
 *
 * This is what the register lists — the header and the size of the batch, without its rows. The rows come
 * with the one batch the console opens, because a list that carried them would be a page that reads a
 * hundred lines to show a dozen numbers.
 */
export interface AwardBatchView {
  id: string;
  clientBatchUuid: string;
  label: string;
  reason: string;
  createdByUsername: string;
  createdAt: string;
  isReversed: boolean;
  reversedAt: string | null;
  reversedByUsername: string | null;
  reversedReason: string | null;
  /** Signed totals and row counts per ledger, so a list row can say what a batch did unopened. */
  teamTotal: number;
  participantTotal: number;
  teamCount: number;
  participantCount: number;
}

/** The batch as posted, with both ledgers under it (ADR-248). */
export interface AwardBatchDetailView extends AwardBatchView {
  teams: TeamAwardView[];
  adjustments: ScoreAdjustmentView[];
}

/** fds.md §2.12 — the day's fringe point settings. ADR-270 moved the tournament's rates onto the tournament. */
export interface PointConfigView {
  /** ADR-116 — what turning up to a fringe activity is worth when you do not place. */
  fringeParticipationPoints: number;
  /**
   * ADR-176 — one bonus for visiting `fringePassportStations` DISTINCT stations. Zero is off.
   */
  fringePassportBonusPoints: number;
  fringePassportStations: number;
  updatedAt: string;
  updatedByUsername: string;
}

export interface FacilitatorView {
  id: string;
  username: string;
  displayLabel: string | null;
  defaultStationType: StationType;
  defaultStationId: string | null;
  defaultStationLabel: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  /** ADR-151 — last request from this account, batched by the presence flusher. */
  lastSeenAt: string | null;
}

export interface SuperadminView {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface VoidAuditEntryView {
  id: string;
  targetType: VoidTargetType;
  targetId: string;
  action: VoidAction;
  reason: string;
  performedByUsername: string;
  performedAt: string;
}

export interface ParticipantDetailView {
  participant: ParticipantView;
  totals: ParticipantTotalsView;
  team: TeamSummaryView | null;
  scans: ScanView[];
  /** ADR-117 — the manual correction ledger for this participant, newest first. */
  adjustments: ScoreAdjustmentView[];
}

export interface BootstrapStatusView {
  isPointConfigSet: boolean;
  courtCount: number;
  enabledCourtCount: number;
  activityCount: number;
  activeActivityCount: number;
  facilitatorCount: number;
  participantCount: number;
  teamCount: number;
  matchCount: number;
  scanCount: number;
}

/** ADR-035 — the bodies behind the ids, fetched in one go and cached for good. */
export interface AvatarSpriteView {
  id: string;
  sprite: string;
}

/**
 * ADR-118 — what the operations switch is currently doing. Public, unauthenticated and tiny:
 * a phone must be able to ask "is the room closed, or is it me?" without a session.
 */
/**
 * ADR-140 — a key issued to a projector. The token is returned **only** by the call that
 * creates it: a list that re-shows every live credential turns one careless screenshot of the
 * admin page into every screen key in the building.
 */
export interface ScreenKeyView {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  /** ADR-160 — which scenes this screen is allowed to show, in no particular order. */
  enabledScenes: ScreenSceneId[];
}

/**
 * ADR-160 — what a screen is told about itself.
 *
 * The projector has never had a "who am I" read: it carries a token and fetches the same
 * public boards everybody else does. It needs one now, because the scene list is a property
 * of the KEY rather than of the day, and the screen cannot be trusted to be told once at
 * pairing time — a projector runs for eight hours and nobody is going to walk to the booth
 * to reload it after a change.
 */
export interface ScreenProfileView {
  label: string;
  enabledScenes: ScreenSceneId[];
}

/**
 * ADR-307 — what the system reset took, counted as it went. The console reads these back to
 * the operator rather than claiming success in the abstract: on the morning of the real
 * event, "participants: 0 remaining practice accounts" is the sentence that settles nerves.
 * Counts are of rows deleted, and `sessionsEnded` excludes the acting superadmin's own
 * session, which survives so the console stays signed in to report this.
 */
export interface SystemResetView {
  resetAt: string;
  participants: number;
  teams: number;
  chatMessages: number;
  teamChatMessages: number;
  announcements: number;
  photos: number;
  tournaments: number;
  matches: number;
  fringeRounds: number;
  swagRounds: number;
  sessionsEnded: number;
}

export interface ServiceStateView {
  isSocialPaused: boolean;
  updatedAt: string | null;
  updatedByUsername: string | null;  /**
   * ADR-147 — station offline mode: may a facilitator's phone keep a copy of the app shell,
   * so a reload in a dead spot still paints? Off until an operator turns it on, and the same
   * switch retires every worker already installed.
   */
  isStationOfflineEnabled: boolean;
  /**
   * When the switch was last moved. There is deliberately no "by whom" here, unlike the
   * pause: that would need a second join for a fact nobody asks about, and the pause's
   * attribution exists because participants can see its effect. This one shows on ~20 staff
   * phones and in no participant's view at all.
   */
  stationOfflineUpdatedAt: string | null;
}

/**
 * ADR-147 — the one thing a browser may ask about caching, and the only route the service
 * worker's registration consults. Public and `no-store`: a phone must be able to ask before
 * it has a session, and an answer that could itself be cached would be a switch that cannot
 * be flipped back.
 */
export interface AppShellPolicyView {
  serveFromCache: boolean;
}

/**
 * ADR-151 — the operations overview: the last fifteen minutes, which is the only window the
 * question "is anything still happening" is ever asked about.
 *
 * Every field here is a statement about a window or a moment. Nothing on this view is a
 * total since the database was created, because such a number is as true at 11:16 as it was
 * at 11:15 and tells a superadmin nothing either time.
 */
export interface OperationsStationView {
  kind: 'fringe' | 'swag';
  id: string;
  name: string;
  /** The round currently taking scans, or null when the station has nothing open. */
  openRoundNumber: number | null;
  /** Live scans or claims recorded here inside the window. */
  recentCount: number;
  /** When this station last recorded anything at all. Null means not once, all day. */
  lastEventAt: string | null;
  /**
   * A round is open here and nothing has happened for the whole window. The single thing
   * this panel exists to surface: either that activity has finished and nobody closed it,
   * or the marshal's phone is dead, and from the laptop those look identical.
   */
  isQuiet: boolean;
}

export interface OperationsMatchView {
  id: string;
  courtLabel: string;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  startedAt: string;
  elapsedMinutes: number;
  /** Running longer than the match length the schedule itself is built on. */
  isOverdue: boolean;
}

export interface OperationsFacilitatorView {
  id: string;
  username: string;
  displayLabel: string | null;
  defaultStationLabel: string | null;
  lastSeenAt: string | null;
  /** Seen inside the window. False covers both "gone quiet" and "never signed in". */
  isActive: boolean;
}

/**
 * ADR-158 — the teams the tournament is not carrying, on the page the superadmin watches.
 *
 * `canAdmit` travels with the count on purpose. The count alone would drop to nothing the
 * moment the group stage closed, and silence on an operations panel reads as "resolved" —
 * the superadmin who saw three outside teams at 11:00 would conclude they had been let in.
 * So the number stays and the sentence changes.
 */
export interface OperationsOutsideTeamsView {
  count: number;
  canAdmit: boolean;
}

export interface OperationsOverviewView {
  generatedAt: string;
  windowMinutes: number;
  /** The configured match length the overdue mark is measured against. */
  matchMinutes: number;
  scanCount: number;
  claimCount: number;
  matchesCompleted: number;
  /** ADR-158 — teams formed after activation, which are in no group and no fixture. */
  teamsOutside: OperationsOutsideTeamsView;
  stations: OperationsStationView[];
  liveMatches: OperationsMatchView[];
  facilitators: OperationsFacilitatorView[];
}
