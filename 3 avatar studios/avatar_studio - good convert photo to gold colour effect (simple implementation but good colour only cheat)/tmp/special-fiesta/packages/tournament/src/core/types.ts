/**
 * ADR-273 — the tournament as data. Pure types: no I/O, no clock, no ids minted here.
 *
 * Every timestamp is an ISO instant string and every id an opaque string, so the same values cross
 * the database, the wire and the browser simulator without conversion. The engine never asks what
 * time it is; a caller passes `now` in (docs/design/tournament-engine.md §1).
 */

export type Side = 'a' | 'b';

export type StageKind = 'pool' | 'bracket' | 'swiss' | 'open';
export type StageStatus = 'pending' | 'active' | 'completed';
export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'superseded';
export type MatchOrigin = 'structure' | 'ad_hoc';
export type ResultKind = 'score' | 'walkover' | 'bye';
export type ActorKind = 'facilitator' | 'superadmin' | 'system';

/** Active-day points a result is worth (not table points — those are fixed, §4 of the spec). */
export interface PointRates {
  win: number;
  draw: number;
  loss: number;
}

export interface Actor {
  kind: ActorKind;
  id: string;
  label: string;
}

export interface Entrant {
  id: string;
  name: string;
  /** P-02/P-10 — the order teams were entered: the visibly arbitrary last tie-break. */
  entryOrder: number;
  withdrawnAt: string | null;
}

export interface Stage {
  id: string;
  ordinal: number;
  label: string;
  kind: StageKind;
  /** Whether a level score is a result here. False is a bracket's rule: somebody must go through. */
  allowsDraws: boolean;
  /** How many go through from each group (pool) or from the stage (stage_place readers). */
  advanceCount: number;
  /** Null = the tournament's own rates. */
  rates: PointRates | null;
  /**
   * ADR-320 — the stage's INTERNAL table points: what a win/draw/loss is worth for ranking
   * this stage's tables and picking who advances. Null = the default 3/1/0. These rank;
   * they are never paid. What anybody is paid is `rates` (awards), a separate number.
   */
  tablePoints: PointRates | null;
  /**
   * ADR-325 — where this stage's teams come from, when an earlier stage decides them: the feeder
   * and how many it sends on. Null for a stage dealt from the entered teams.
   */
  intake: { fromStageId: string; count: number } | null;
  /**
   * ADR-325 — who actually came through, frozen when the feeder closes (empty until then, and
   * always empty for a stage with no intake). An open stage plays only these teams.
   */
  roster: readonly string[];
  status: StageStatus;
}

export interface Group {
  id: string;
  stageId: string;
  code: string;
  label: string;
  /** Seeded order. */
  entrantIds: readonly string[];
}

/** ADR-273 — requirement 10: a future seat names what fills it, as a real reference. */
export type SlotSource =
  | { kind: 'entrant'; entrantId: string }
  | { kind: 'winner_of'; matchId: string }
  | { kind: 'loser_of'; matchId: string }
  | { kind: 'group_place'; groupId: string; place: number }
  | { kind: 'stage_place'; stageId: string; place: number }
  | { kind: 'pairing'; stageId: string; round: number; pairIndex: number; side: Side }
  | { kind: 'vacant' };

export interface Slot {
  source: SlotSource;
  /** What the seat is called before anybody sits in it: "Winner of #7", "2nd in Group B". */
  label: string;
  /** Frozen at kick-off or stage completion; never moved except by an attributable reseat. */
  seatedEntrantId: string | null;
  seatOverrideReason: string | null;
}

export interface MatchResult {
  kind: ResultKind;
  /** Null with kind 'score' is a draw. */
  winnerSide: Side | null;
}

export interface Match {
  id: string;
  code: string;
  stageId: string;
  groupId: string | null;
  round: number;
  sequence: number;
  origin: MatchOrigin;
  /** True for a placement match between two losers (a third-place play-off). */
  isPlacement: boolean;
  status: MatchStatus;
  courtId: string | null;
  plannedStartAt: string | null;
  plannedMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
  startedBy: Actor | null;
  scoreA: number;
  scoreB: number;
  result: MatchResult | null;
  isVoided: boolean;
  cancelReason: string | null;
  version: number;
  slots: { a: Slot; b: Slot };
}

export type AwardKind = 'result' | 'manual';

export interface Award {
  id: string;
  entrantId: string;
  matchId: string | null;
  kind: AwardKind;
  points: number;
  reason: string;
  createdAt: string;
  voidedAt: string | null;
}

export interface Court {
  id: string;
  label: string;
  isEnabled: boolean;
}

export type TournamentStatus = 'draft' | 'live' | 'closed';

/**
 * ADR-293 — the game type a tournament is for. Orthogonal to format (bracket/scheduling shape).
 * The engine is game-agnostic; kind is carried as data/label only.
 *
 * ADR-321 — 'dumb_courts' is the one kind that changes engine behaviour: there are no stages or
 * matches, and facilitators (court masters) may grant and take back manual awards directly,
 * because awarding points at the court IS the game. Everywhere else kind stays a label.
 */
export type TournamentKind = 'captains_ball' | 'dumb_courts';

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  kind: TournamentKind;
  rates: PointRates;
  closeReason: string | null;
  /**
   * ADR-336 — the instant the day stopped taking new matches, or null. A paused tournament refuses
   * to START anything and allows everything else, so a live match is finished by the people scoring
   * it. There is no resume: the switch to court awards is one-way, so this is the beginning of the
   * end of the bracket, not a reversible hold.
   */
  pausedAt: string | null;
}

/** Everything a decision needs, in one value the adapter loads and the engine never mutates. */
export interface TournamentState {
  tournament: Tournament;
  entrants: readonly Entrant[];
  stages: readonly Stage[];
  groups: readonly Group[];
  matches: readonly Match[];
  awards: readonly Award[];
  courts: readonly Court[];
}

/** The context every command is run in: who, and when. */
export interface CommandContext {
  now: string;
  actor: Actor;
  /** Ids the adapter has minted for anything this command may create, consumed in order. */
  newIds: readonly string[];
}

export type EventKind =
  | 'match_started'
  | 'match_scored'
  | 'match_completed'
  | 'match_cancelled'
  | 'match_staged'
  | 'result_corrected'
  | 'walkover_recorded'
  | 'match_voided'
  | 'match_unvoided'
  | 'seat_conflict'
  | 'reseated'
  | 'stage_completed'
  | 'stage_restructured'
  | 'stage_activated'
  | 'award_granted'
  | 'award_voided'
  | 'entrant_withdrawn'
  | 'tournament_closed'
  | 'tournament_paused'
  | 'round_paired'
  | 'bye_recorded'
  | 'match_placed'
  | 'matches_retimed'
  | 'match_released';

export interface TournamentEvent {
  kind: EventKind;
  at: string;
  actor: Actor;
  matchId: string | null;
  reason: string | null;
  detail: Readonly<Record<string, string | number | boolean | null>>;
}

export type RefusalCode =
  | 'not_found'
  | 'wrong_status'
  | 'not_allowed'
  | 'seat_unresolved'
  | 'same_entrant'
  | 'entrant_busy'
  | 'entrant_withdrawn'
  | 'court_unavailable'
  | 'court_busy'
  | 'stale_score'
  | 'bad_step'
  | 'draw_not_allowed'
  | 'play_on'
  | 'winner_required'
  | 'tiebreak_not_needed'
  | 'reason_required'
  | 'points_invalid'
  | 'stage_unfinished'
  | 'tie_on_cut'
  /** ADR-329 F4 — cancelling this match would strand a dependant seat that still reads it. */
  | 'has_dependents'
  | 'tournament_closed'
  | 'tournament_paused'
  | 'live_match'
  /** ADR-325 — a fed stage whose feeder has not closed yet: nobody has come through. */
  | 'stage_not_fed'
  | 'stage_started'
  | 'stage_fed'
  /** ADR-325 — a team that did not come through the stage feeding this one. */
  | 'not_in_stage';

export interface Refusal {
  code: RefusalCode;
  message: string;
}

export type CommandResult =
  | { ok: true; state: TournamentState; events: readonly TournamentEvent[] }
  | { ok: false; refusal: Refusal };
