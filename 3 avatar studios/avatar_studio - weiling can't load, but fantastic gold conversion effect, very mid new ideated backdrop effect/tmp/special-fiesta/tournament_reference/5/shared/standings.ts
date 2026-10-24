import type { PointsEntryView, StandingRow, TeamView } from './types.js';
import type { ResolvableMatch } from './resolve.js';
import { indexMatches, resolveSlotTeam } from './resolve.js';

interface Tally {
  played: number; wins: number; draws: number; losses: number;
  scoredFor: number; scoredAgainst: number; points: number;
}

function emptyTally(): Tally {
  return { played: 0, wins: 0, draws: 0, losses: 0, scoredFor: 0, scoredAgainst: 0, points: 0 };
}

function applyResult(tally: Tally, scoredFor: number, scoredAgainst: number): void {
  tally.played += 1;
  tally.scoredFor += scoredFor;
  tally.scoredAgainst += scoredAgainst;
  if (scoredFor > scoredAgainst) tally.wins += 1;
  else if (scoredFor < scoredAgainst) tally.losses += 1;
  else tally.draws += 1;
}

function tallyMatch(tallies: Map<string, Tally>, match: ResolvableMatch, byKey: Map<string, ResolvableMatch>): void {
  if (match.scoreA === null || match.scoreB === null) return;
  const teamA = resolveSlotTeam(match.slotA, byKey);
  const teamB = resolveSlotTeam(match.slotB, byKey);
  if (teamA === null || teamB === null) return;
  const tallyA = tallies.get(teamA);
  const tallyB = tallies.get(teamB);
  if (tallyA === undefined || tallyB === undefined) return;
  applyResult(tallyA, match.scoreA, match.scoreB);
  applyResult(tallyB, match.scoreB, match.scoreA);
}

function compareRows(a: StandingRow, b: StandingRow): number {
  return b.points - a.points
    || b.wins - a.wins
    || b.scoreDifference - a.scoreDifference
    || b.scoredFor - a.scoredFor
    || a.seed - b.seed;
}

export function computeStandings(
  teams: TeamView[],
  matches: ResolvableMatch[],
  entries: Pick<PointsEntryView, 'teamId' | 'points' | 'status'>[],
): StandingRow[] {
  const tallies = new Map(teams.map((team) => [team.id, emptyTally()]));
  const byKey = indexMatches(matches);
  for (const match of matches) {
    if (match.status === 'final') tallyMatch(tallies, match, byKey);
  }
  for (const entry of entries) {
    const tally = tallies.get(entry.teamId);
    if (entry.status === 'active' && tally !== undefined) tally.points += entry.points;
  }
  const rows = teams.map((team) => {
    const tally = tallies.get(team.id) as Tally;
    return {
      teamId: team.id, name: team.name, seed: team.seed, points: tally.points,
      played: tally.played, wins: tally.wins, draws: tally.draws, losses: tally.losses,
      scoredFor: tally.scoredFor, scoredAgainst: tally.scoredAgainst,
      scoreDifference: tally.scoredFor - tally.scoredAgainst, rank: 0,
    };
  });
  rows.sort(compareRows);
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function standingExplanation(row: StandingRow): string {
  const diff = row.scoreDifference >= 0 ? `+${row.scoreDifference}` : `${row.scoreDifference}`;
  return `${row.points} pts from ${row.wins}W/${row.draws}D/${row.losses}L, score difference ${diff}, ${row.scoredFor} scored; seed ${row.seed} breaks any remaining tie`;
}
