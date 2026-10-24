import type { PointRates, Side, StageKind } from '../core/index.js';

/**
 * ADR-274 — what a format produces, before any id exists.
 *
 * A structure is stages, groups and match drafts whose seats point at other drafts BY CODE. The
 * core adapter mints the ids once and rewrites the references (ADR-273), so a format is a pure
 * function of the entrant list and its options, and the browser simulator runs the very same one.
 */

export type DraftSource =
  | { kind: 'entrant'; entrantId: string }
  | { kind: 'winner_of'; code: string }
  | { kind: 'loser_of'; code: string }
  | { kind: 'group_place'; groupCode: string; place: number }
  | { kind: 'stage_place'; stageCode: string; place: number }
  | { kind: 'pairing'; stageCode: string; round: number; pairIndex: number; side: Side }
  | { kind: 'vacant' };

export interface DraftSlot {
  source: DraftSource;
  label: string;
}

export interface DraftMatch {
  code: string;
  stageCode: string;
  groupCode: string | null;
  round: number;
  /** Play order within the structure; the planner's default priority. */
  sequence: number;
  isPlacement: boolean;
  a: DraftSlot;
  b: DraftSlot;
}

export interface DraftStage {
  code: string;
  ordinal: number;
  label: string;
  kind: StageKind;
  allowsDraws: boolean;
  advanceCount: number;
  rates: PointRates | null;
  /** ADR-320 — the stage's internal table points (ranking only, never paid); null = default 3/1/0. */
  tablePoints: PointRates | null;
  /**
   * ADR-310 — this stage's match length in minutes, or null to inherit the
   * tournament's. The planner already times every match individually; carrying
   * the duration on the stage is what lets one tournament play 15-minute group
   * matches and 20-minute knockouts.
   */
  matchMinutes: number | null;
  /** ADR-325 — the feeding stage's CODE and how many it sends on; null for a first stage. */
  intake: { fromStageCode: string; count: number } | null;
}

export interface DraftGroup {
  code: string;
  stageCode: string;
  label: string;
  entrantIds: readonly string[];
}

export interface Structure {
  stages: readonly DraftStage[];
  groups: readonly DraftGroup[];
  matches: readonly DraftMatch[];
}

/** An entrant as a format sees it: an id, a name for labels, and its seed (entry order). */
export interface SeededEntrant {
  id: string;
  name: string;
  seed: number;
}

export type KnockoutPairing = 'classic' | 'adjacent';

/** Every format reads the options it understands and ignores the rest. */
export interface FormatOptions {
  groupSize?: number;
  advanceCount?: number;
  hasThirdPlace?: boolean;
  pairing?: KnockoutPairing;
  rounds?: number;
  /** ADR-320 — internal table points for the format's ranked stages; null/absent = default 3/1/0. */
  tablePoints?: PointRates | null;
}

/** How long a team must rest between matches, as the format sees it. Null = the day's setting. */
export interface RestPolicy {
  restMinutes: number | null;
  flagBackToBack: boolean;
}

export type FormatId =
  | 'open'
  | 'round_robin'
  | 'groups_knockout'
  | 'single_elimination'
  | 'double_elimination'
  | 'consolation'
  | 'swiss'
  | 'flighted_quads'
  | 'ironman'
  | 'points_rush';

export interface FormatPlugin {
  id: FormatId;
  label: string;
  summary: string;
  minTeams: number;
  maxTeams: number;
  /** A message when this team count or option set cannot be played, else null. */
  validate: (teamCount: number, options: FormatOptions) => string | null;
  build: (entrants: readonly SeededEntrant[], options: FormatOptions) => Structure;
  restPolicy: RestPolicy;
  /** Only Swiss generates later rounds from results; every other format is fixed at build. */
  isDynamic: boolean;
}
