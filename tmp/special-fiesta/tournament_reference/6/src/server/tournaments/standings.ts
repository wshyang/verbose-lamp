import type {
  MatchRecord,
  ParticipantSlot,
  PointEntryKind,
  StandingRow,
  TeamRecord,
} from '../../shared/contracts.js';

export interface LedgerRecord {
  id: string;
  tournamentId: string;
  teamId: string;
  matchId: string | null;
  kind: PointEntryKind;
  points: number;
  reason: string;
  voidsEntryId: string | null;
  createdAt: string;
}

export interface ResolvedSlot {
  teamId: string | null;
  displayName: string;
}

export interface StandingSummary {
  overall: StandingRow[];
  groups: Record<string, StandingRow[]>;
}

interface ResolutionContext {
  teams: TeamRecord[];
  matches: MatchRecord[];
  ledger: LedgerRecord[];
  matchesById: Map<string, MatchRecord>;
  teamsById: Map<string, TeamRecord>;
}

export function buildStandings(
  teams: TeamRecord[],
  matches: MatchRecord[],
  ledger: LedgerRecord[],
): StandingSummary {
  const context = createContext(teams, matches, ledger);
  const overall = makeStandingRows(teams, matches, ledger, context, false);
  const groupKeys = [...new Set(matches.flatMap((match) => (match.groupKey ? [match.groupKey] : [])))];
  const groups = Object.fromEntries(
    groupKeys.map((groupKey) => [groupKey, buildGroupRows(groupKey, context)]),
  );
  return { overall, groups };
}

export function resolveParticipant(
  slot: ParticipantSlot,
  context: ResolutionContext,
  visited: Set<string> = new Set(),
): ResolvedSlot {
  const teamId = resolveTeamId(slot, context, visited);
  const team = teamId ? context.teamsById.get(teamId) : undefined;
  return { teamId: team?.id ?? null, displayName: team?.name ?? slot.label };
}

export function createResolutionContext(
  teams: TeamRecord[],
  matches: MatchRecord[],
  ledger: LedgerRecord[],
): ResolutionContext {
  return createContext(teams, matches, ledger);
}

function createContext(
  teams: TeamRecord[],
  matches: MatchRecord[],
  ledger: LedgerRecord[],
): ResolutionContext {
  return {
    teams,
    matches,
    ledger,
    matchesById: new Map(matches.map((match) => [match.id, match])),
    teamsById: new Map(teams.map((team) => [team.id, team])),
  };
}

function resolveTeamId(
  slot: ParticipantSlot,
  context: ResolutionContext,
  visited: Set<string>,
): string | null {
  if (slot.kind === 'team') return context.teamsById.has(slot.teamId) ? slot.teamId : null;
  if (slot.kind === 'winner' || slot.kind === 'loser') {
    return resolveOutcomeTeam(slot, context, visited);
  }
  if (slot.kind === 'group-rank') return resolveGroupRank(slot.groupKey, slot.rank, context, visited);
  if (slot.kind === 'group-winner-rank') {
    return resolveGroupWinnerRank(slot.groupKeys, slot.rank, context, visited);
  }
  return null;
}

function resolveOutcomeTeam(
  slot: Extract<ParticipantSlot, { kind: 'winner' | 'loser' }>,
  context: ResolutionContext,
  visited: Set<string>,
): string | null {
  const source = context.matchesById.get(slot.matchId);
  if (!source || source.status !== 'final' || !source.score?.winnerTeamId) return null;
  if (slot.kind === 'winner') return source.score.winnerTeamId;
  const homeId = resolveTeamId(source.homeSlot, context, new Set(visited));
  const awayId = resolveTeamId(source.awaySlot, context, new Set(visited));
  if (!homeId || !awayId) return null;
  return homeId === source.score.winnerTeamId ? awayId : homeId;
}

function resolveGroupRank(
  groupKey: string,
  rank: number,
  context: ResolutionContext,
  visited: Set<string>,
): string | null {
  const visitKey = `group:${groupKey}:${rank}`;
  if (visited.has(visitKey)) return null;
  const groupMatches = completedGroupMatches(groupKey, context.matches);
  if (!groupMatches) return null;
  const nextVisited = new Set([...visited, visitKey]);
  if (!allParticipantsResolved(groupMatches, context, nextVisited)) return null;
  const groupTeams = teamsInMatches(groupMatches, context, nextVisited);
  const rows = makeStandingRows(groupTeams, groupMatches, context.ledger, context, true, nextVisited);
  return rows[rank - 1]?.teamId ?? null;
}

function resolveGroupWinnerRank(
  groupKeys: string[],
  rank: number,
  context: ResolutionContext,
  visited: Set<string>,
): string | null {
  const winners = groupKeys.flatMap((groupKey) => {
    const teamId = resolveGroupRank(groupKey, 1, context, new Set(visited));
    return teamId ? [teamId] : [];
  });
  if (winners.length !== groupKeys.length) return null;
  const teams = winners.flatMap((teamId) => {
    const team = context.teamsById.get(teamId);
    return team ? [team] : [];
  });
  const groupMatches = context.matches.filter((match) => groupKeys.includes(match.groupKey ?? ''));
  const rows = makeStandingRows(teams, groupMatches, context.ledger, context, true, visited);
  return rows[rank - 1]?.teamId ?? null;
}

function completedGroupMatches(groupKey: string, matches: MatchRecord[]): MatchRecord[] | null {
  const groupMatches = matches.filter((match) => match.groupKey === groupKey);
  if (groupMatches.length === 0 || groupMatches.some((match) => match.status !== 'final')) return null;
  return groupMatches;
}

function buildGroupRows(groupKey: string, context: ResolutionContext): StandingRow[] {
  const groupMatches = context.matches.filter((match) => match.groupKey === groupKey);
  const groupTeams = teamsInMatches(groupMatches, context);
  return makeStandingRows(groupTeams, groupMatches, context.ledger, context, true);
}

function allParticipantsResolved(
  matches: MatchRecord[],
  context: ResolutionContext,
  visited: Set<string>,
): boolean {
  return matches.every((match) =>
    [match.homeSlot, match.awaySlot].every((slot) => resolveTeamId(slot, context, visited) !== null),
  );
}

function teamsInMatches(
  matches: MatchRecord[],
  context: ResolutionContext,
  visited: Set<string> = new Set(),
): TeamRecord[] {
  const teamIds = new Set(
    matches.flatMap((match) => [match.homeSlot, match.awaySlot]).flatMap((slot) => {
      const result = resolveParticipant(slot, context, visited);
      return result.teamId ? [result.teamId] : [];
    }),
  );
  return context.teams.filter((team) => teamIds.has(team.id));
}

function makeStandingRows(
  teams: TeamRecord[],
  matches: MatchRecord[],
  ledger: LedgerRecord[],
  context: ResolutionContext,
  isScoped: boolean,
  visited: Set<string> = new Set(),
): StandingRow[] {
  const rows = new Map(teams.map((team) => [team.id, emptyRow(team)]));
  const finalMatches = matches.filter((match) => match.status === 'final');
  finalMatches.forEach((match) => updateRowsFromMatch(match, rows, context, visited));
  addLedgerPoints(rows, ledger, finalMatches, isScoped);
  return [...rows.values()].sort(compareStanding);
}

function emptyRow(team: TeamRecord): StandingRow {
  return {
    teamId: team.id,
    teamName: team.name,
    seed: team.seed,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    scoreFor: 0,
    scoreAgainst: 0,
    scoreDifference: 0,
    points: 0,
  };
}

function updateRowsFromMatch(
  match: MatchRecord,
  rows: Map<string, StandingRow>,
  context: ResolutionContext,
  visited: Set<string>,
): void {
  if (match.score === null) return;
  const homeId = resolveTeamId(match.homeSlot, context, new Set(visited));
  const awayId = resolveTeamId(match.awaySlot, context, new Set(visited));
  const home = homeId ? rows.get(homeId) : undefined;
  const away = awayId ? rows.get(awayId) : undefined;
  if (!home || !away) return;
  const homeWon = match.score.home > match.score.away;
  const awayWon = match.score.away > match.score.home;
  updateTeamRow(home, match.score.home, match.score.away, homeWon, awayWon);
  updateTeamRow(away, match.score.away, match.score.home, awayWon, homeWon);
}

function updateTeamRow(
  row: StandingRow,
  scoreFor: number,
  scoreAgainst: number,
  isWinner: boolean,
  opponentWon: boolean,
): void {
  row.played += 1;
  row.scoreFor += scoreFor;
  row.scoreAgainst += scoreAgainst;
  row.scoreDifference = row.scoreFor - row.scoreAgainst;
  if (isWinner) row.wins += 1;
  else if (opponentWon) row.losses += 1;
  else row.draws += 1;
}

function addLedgerPoints(
  rows: Map<string, StandingRow>,
  ledger: LedgerRecord[],
  matches: MatchRecord[],
  isScoped: boolean,
): void {
  const includedMatchIds = new Set(matches.map((match) => match.id));
  ledger.forEach((entry) => {
    const row = rows.get(entry.teamId);
    if (!row) return;
    if (isScoped && (!entry.matchId || !includedMatchIds.has(entry.matchId))) return;
    row.points += entry.points;
  });
}

function compareStanding(first: StandingRow, second: StandingRow): number {
  if (first.points !== second.points) return second.points - first.points;
  if (first.scoreDifference !== second.scoreDifference) {
    return second.scoreDifference - first.scoreDifference;
  }
  if (first.scoreFor !== second.scoreFor) return second.scoreFor - first.scoreFor;
  if (first.seed !== second.seed) return first.seed - second.seed;
  return first.teamName.localeCompare(second.teamName);
}
