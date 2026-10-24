export type ModeId =
  | 'manual'
  | 'round-robin'
  | 'groups'
  | 'swiss'
  | 'single-elimination'
  | 'consolation'
  | 'flighted-quads'
  | 'ironman'
  | 'points-rush'
  | 'world-cup';

export interface FormatDescriptor {
  id: ModeId;
  name: string;
  summary: string;
  minTeams: number;
  maxTeams: number;
  teamStep: number;
  fixedTeamCount?: number;
  supportedViews: readonly ('rounds' | 'bracket' | 'groups' | 'flights')[];
}

export const FORMAT_CATALOG: readonly FormatDescriptor[] = [
  {
    id: 'manual',
    name: 'Open play',
    summary: 'Stage any matchup at the desk as teams are ready.',
    minTeams: 2,
    maxTeams: 32,
    teamStep: 1,
    supportedViews: ['rounds'],
  },
  {
    id: 'round-robin',
    name: 'Round robin',
    summary: 'Every team plays every other team once.',
    minTeams: 2,
    maxTeams: 32,
    teamStep: 1,
    supportedViews: ['rounds'],
  },
  {
    id: 'groups',
    name: 'Groups league',
    summary: 'Balanced pools play round robin; the day ends at the group tables.',
    minTeams: 4,
    maxTeams: 32,
    teamStep: 1,
    supportedViews: ['groups', 'rounds'],
  },
  {
    id: 'swiss',
    name: 'Swiss system',
    summary: 'Each round is paired from the standing after the previous round.',
    minTeams: 4,
    maxTeams: 32,
    teamStep: 1,
    supportedViews: ['rounds'],
  },
  {
    id: 'single-elimination',
    name: 'Single elimination',
    summary: 'A seeded knockout bracket with byes shown as advances, not phantom games.',
    minTeams: 2,
    maxTeams: 32,
    teamStep: 1,
    supportedViews: ['bracket'],
  },
  {
    id: 'consolation',
    name: 'Consolation bracket',
    summary: 'Eight teams are guaranteed a second game, including a consolation path.',
    minTeams: 8,
    maxTeams: 8,
    teamStep: 1,
    fixedTeamCount: 8,
    supportedViews: ['bracket'],
  },
  {
    id: 'flighted-quads',
    name: 'Flighted quads',
    summary: 'Teams are placed into four-team flights; each flight has semifinals and a final.',
    minTeams: 8,
    maxTeams: 32,
    teamStep: 4,
    supportedViews: ['flights', 'bracket'],
  },
  {
    id: 'ironman',
    name: 'Ironman 12',
    summary: 'The original 12-team knockout interleaved across three courts.',
    minTeams: 12,
    maxTeams: 12,
    teamStep: 1,
    fixedTeamCount: 12,
    supportedViews: ['bracket'],
  },
  {
    id: 'points-rush',
    name: 'Points rush',
    summary: 'Four groups of three feed a final between the top two group winners.',
    minTeams: 12,
    maxTeams: 12,
    teamStep: 1,
    fixedTeamCount: 12,
    supportedViews: ['groups', 'bracket'],
  },
  {
    id: 'world-cup',
    name: 'World Cup',
    summary: 'Group play feeds a cross-group knockout; choose 10, 16, or 32 teams.',
    minTeams: 10,
    maxTeams: 32,
    teamStep: 1,
    supportedViews: ['groups', 'bracket'],
  },
] as const;

export type TournamentStatus = 'scheduled' | 'running' | 'closed';
export type MatchStatus = 'staged' | 'live' | 'final' | 'cancelled';
export type PointEntryKind = 'outcome-award' | 'desk-award' | 'void';

export interface TournamentSettings {
  teamCount: number;
  courtCount: number;
  matchDurationMinutes: number;
  tournamentLengthMinutes: number;
  startTimeMinutes: number;
}

export interface TeamInput {
  name: string;
}

export interface TeamRecord {
  id: string;
  tournamentId: string;
  name: string;
  seed: number;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
}

export interface TeamSlot {
  kind: 'team';
  teamId: string;
  label: string;
}

export interface OutcomeSlot {
  kind: 'winner' | 'loser';
  matchId: string;
  matchCode: string;
  label: string;
}

export interface GroupRankSlot {
  kind: 'group-rank';
  groupKey: string;
  rank: number;
  label: string;
}

export interface GroupWinnerRankSlot {
  kind: 'group-winner-rank';
  groupKeys: string[];
  rank: number;
  label: string;
}

export interface SwissPairingSlot {
  kind: 'swiss-pairing';
  afterRound: number;
  pairNumber: number;
  seat: 1 | 2;
  label: string;
}

export type ParticipantSlot =
  | TeamSlot
  | OutcomeSlot
  | GroupRankSlot
  | GroupWinnerRankSlot
  | SwissPairingSlot;

export interface ParticipantView {
  reference: ParticipantSlot;
  displayName: string;
  resolvedTeamId: string | null;
}

export interface MatchSchedule {
  startMinute: number;
  endMinute: number;
  courtNumber: number;
  durationMinutes: number;
}

export interface MatchScore {
  home: number;
  away: number;
  winnerTeamId: string | null;
  finalizedAt: string | null;
}

export interface MatchRecord {
  id: string;
  tournamentId: string;
  code: string;
  phase: string;
  roundNumber: number;
  groupKey: string | null;
  position: number;
  status: MatchStatus;
  homeSlot: ParticipantSlot;
  awaySlot: ParticipantSlot;
  dependsOn: string[];
  schedule: MatchSchedule;
  score: MatchScore | null;
}

export interface MatchView extends Omit<MatchRecord, 'homeSlot' | 'awaySlot'> {
  participants: [ParticipantView, ParticipantView];
}

export interface PointEntry {
  id: string;
  tournamentId: string;
  teamId: string;
  teamName: string;
  matchId: string | null;
  kind: PointEntryKind;
  points: number;
  reason: string;
  voidsEntryId: string | null;
  voided: boolean;
  createdAt: string;
}

export interface StandingRow {
  teamId: string;
  teamName: string;
  seed: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDifference: number;
  points: number;
}

export interface ScheduleSummary {
  matchCount: number;
  durationMinutes: number;
  finishTimeMinutes: number;
  tournamentLengthMinutes: number;
  fits: boolean;
  courtsAvailable: number;
  matchDurationMinutes: number;
}

export interface TournamentRecord extends TournamentSettings {
  id: string;
  name: string;
  mode: ModeId;
  status: TournamentStatus;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  closingReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentSnapshot {
  tournament: TournamentRecord;
  teams: TeamRecord[];
  matches: MatchView[];
  pointEntries: PointEntry[];
  standings: StandingRow[];
  groupStandings: Record<string, StandingRow[]>;
  scheduleSummary: ScheduleSummary;
}

export interface SimulationResult {
  mode: ModeId;
  teams: TeamRecord[];
  matches: MatchView[];
  scheduleSummary: ScheduleSummary;
  groupKeys: string[];
}

export interface CreateTournamentInput {
  name: string;
  mode: ModeId;
  settings: TournamentSettings;
  teamNames: string[];
}

export interface PreviewInput {
  mode: ModeId;
  settings: TournamentSettings;
  teamNames: string[];
}

export interface WeatherChangeInput {
  courtCount: number;
  matchDurationMinutes: number;
  effectiveAtMinutes: number;
}

export interface StageMatchInput {
  homeTeamId: string;
  awayTeamId: string;
  phase?: string;
  roundNumber?: number;
  startMinute?: number;
  courtNumber?: number;
}

export interface LiveScoreInput {
  home: number;
  away: number;
}

export interface FinalizeMatchInput extends LiveScoreInput {
  advancingTeamId?: string;
}

export interface AwardPointsInput {
  teamId: string;
  points: number;
  reason: string;
  matchId?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
