export type SlotSource =
  | { kind: 'team'; teamRef: string; label: string }
  | { kind: 'winnerOf'; matchKey: string }
  | { kind: 'loserOf'; matchKey: string }
  | { kind: 'rankOf'; scope: string; rank: number }
  | { kind: 'recordPool'; round: number; label: string }
  | { kind: 'bye' };

export interface MatchSpec {
  key: string;
  phase: string;
  groupKey: string | null;
  round: number;
  slotA: SlotSource;
  slotB: SlotSource;
  dependsOn: string[];
}

export interface ScheduledMatch extends MatchSpec {
  court: number | null;
  startMinutes: number | null;
  endMinutes: number | null;
  isBackToBack: boolean;
}

export interface ScheduleConfig {
  courts: number;
  matchLengthMinutes: number;
  startMinutes: number;
  restMinutes: number;
}

export interface FitConfig extends ScheduleConfig {
  tournamentLengthMinutes: number;
}

export interface SimulationResult {
  matches: ScheduledMatch[];
  totalMinutes: number;
  finishMinutes: number;
  playableMatches: number;
  courtMinutes: number;
  fitsInTournamentLength: boolean;
  overrunMinutes: number;
}

export type MatchStatus = 'scheduled' | 'live' | 'final' | 'cancelled';
export type TournamentStatus = 'draft' | 'live' | 'closed';

export interface TournamentConfig {
  courts: number;
  matchLengthMinutes: number;
  tournamentLengthMinutes: number;
  startMinutes: number;
  restMinutes: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
}

export interface TeamView {
  id: string;
  name: string;
  seed: number;
}

export interface CourtView {
  id: string;
  name: string;
}

export interface MatchView {
  id: string;
  key: string;
  phase: string;
  groupKey: string | null;
  round: number;
  slotA: SlotSource;
  slotB: SlotSource;
  dependsOn: string[];
  courtId: string | null;
  courtName: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  status: MatchStatus;
  scoreA: number | null;
  scoreB: number | null;
  origin: 'generated' | 'manual';
}

export interface PointsEntryView {
  id: string;
  teamId: string;
  matchId: string | null;
  points: number;
  reason: string;
  status: 'active' | 'voided';
  voidReason: string | null;
}

export interface StandingRow {
  teamId: string;
  name: string;
  seed: number;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoredFor: number;
  scoredAgainst: number;
  scoreDifference: number;
  rank: number;
}

export interface TournamentGraph {
  tournament: {
    id: string;
    name: string;
    mode: string;
    status: TournamentStatus;
    config: TournamentConfig;
  };
  teams: TeamView[];
  courts: CourtView[];
  matches: MatchView[];
  pointsEntries: PointsEntryView[];
  standings: StandingRow[];
}
