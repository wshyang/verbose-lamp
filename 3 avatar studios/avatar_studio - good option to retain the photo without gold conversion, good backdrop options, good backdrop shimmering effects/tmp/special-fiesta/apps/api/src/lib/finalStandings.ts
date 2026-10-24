import type { FinalPodiumEntryView, FinalStandingsView, FinalTeamRowView } from '@psd/contracts';
import { groupStandings, stageStandings, winningSide, type Group, type Match } from '@psd/tournament/core';
import type { AppDatabase } from '../db/client.js';
import { readAllIndividuals, readClusterStandings } from '../db/entities/index.js';
import { readDay } from '../routes-tournament/support.js';
import { clusterStandingView, individualStandingView } from '../views/admin.js';
import { bracketView, type ViewContext } from '../views/tournament.js';

/**
 * ADR-161 — the day's result, assembled once so that it can leave the building.
 *
 * Composed from the readers the hall screen and the board already use rather than from new
 * queries, because an export that disagrees with the projector is worse than no export: it
 * gives two answers to "who won" and no way to tell which is the real one.
 *
 * ADR-280 — the team tables and the podium come from the rebuilt tournament: the day the readers see
 * (`readDay`), its group tables flattened, its rostrum read off the final and the third-place match —
 * or off the table, for a day with no final. Provisional until the desk closes the tournament.
 */
export async function readFinalStandings(db: AppDatabase): Promise<FinalStandingsView> {
  const [clusters, individuals, day] = await Promise.all([readClusterStandings(db), readAllIndividuals(db), readDay(db)]);
  const base = {
    generatedAt: new Date().toISOString(),
    clusters: clusters.map(clusterStandingView),
    individuals: individuals.map(individualStandingView),
  };
  if (day === null) return { ...base, isProvisional: true, tournamentStatus: null, teams: [], podium: [] };
  return {
    ...base,
    isProvisional: day.row.status !== 'closed',
    tournamentStatus: bracketView(day.context).status,
    teams: day.context.state.groups.flatMap((group) => groupRows(day.context, group)),
    podium: podiumOf(day.context),
  };
}

/**
 * One group's table, flattened. `rank` stays the rank within the group: flattening is a convenience
 * for the spreadsheet, not a claim that group A's third is worse than group B's second. A walkover or
 * a bye is a result with no score, so a team that had one has a difference that is a partial sum.
 */
function groupRows(context: ViewContext, group: Group): FinalTeamRowView[] {
  const { state } = context;
  const unscored = new Set(
    state.matches
      .filter((match) => match.groupId === group.id && match.result !== null && match.result.kind !== 'score')
      .flatMap((match) => [match.slots.a.seatedEntrantId, match.slots.b.seatedEntrantId]),
  );
  return groupStandings(state, group).map((row) => ({
    groupCode: group.code,
    rank: row.rank,
    teamId: context.teamOf.get(row.entrantId) ?? '',
    teamName: row.name,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    pointsFor: row.scored,
    pointsAgainst: row.conceded,
    pointDifference: row.difference,
    isFullyScored: !unscored.has(row.entrantId),
  }));
}

interface Place {
  place: 1 | 2 | 3;
  entrantId: string | null;
  basis: string;
}

function entry(context: ViewContext, input: Place): FinalPodiumEntryView[] {
  if (input.entrantId === null) return [];
  const name = context.state.entrants.find((entrant) => entrant.id === input.entrantId)?.name ?? 'Unnamed team';
  return [{ place: input.place, teamId: context.teamOf.get(input.entrantId) ?? '', teamName: name, basis: input.basis }];
}

/** The bracket's last match: the bracket match no other match reads a winner or a loser from. */
function findFinal(context: ViewContext): Match | undefined {
  const { state } = context;
  const bracketStages = new Set(state.stages.filter((stage) => stage.kind === 'bracket').map((stage) => stage.id));
  const read = new Set(
    state.matches.flatMap((match) =>
      [match.slots.a.source, match.slots.b.source].flatMap((source) =>
        source.kind === 'winner_of' || source.kind === 'loser_of' ? [source.matchId] : [],
      ),
    ),
  );
  return state.matches.find((match) => bracketStages.has(match.stageId) && !match.isPlacement && !read.has(match.id));
}

function seated(match: Match, side: 'a' | 'b' | null): string | null {
  return side === null ? null : match.slots[side].seatedEntrantId;
}

function bracketPodium(context: ViewContext, final: Match): FinalPodiumEntryView[] {
  const winner = winningSide(final);
  if (winner === null) return [];
  const third = context.state.matches.find((match) => match.isPlacement && match.stageId === final.stageId);
  const places: Place[] = [
    { place: 1, entrantId: seated(final, winner), basis: 'Won the final' },
    { place: 2, entrantId: seated(final, winner === 'a' ? 'b' : 'a'), basis: 'Lost the final' },
  ];
  if (third !== undefined) places.push({ place: 3, entrantId: seated(third, winningSide(third)), basis: 'Won the third-place match' });
  return places.flatMap((place) => entry(context, place));
}

const TABLE_BASIS = ['Top of the table', 'Second in the table', 'Third in the table'] as const;

/**
 * A day with no final (a round robin, Swiss, open play) is decided by its table — but only once it
 * is finished: a leader with games in hand is not a champion, and a printed rostrum reads as settled.
 */
function tablePodium(context: ViewContext): FinalPodiumEntryView[] {
  const { state } = context;
  if (state.matches.some((match) => match.status === 'scheduled' || match.status === 'in_progress')) return [];
  const last = [...state.stages].sort((left, right) => right.ordinal - left.ordinal)[0];
  if (last === undefined) return [];
  return stageStandings(state, last)
    .slice(0, 3)
    .flatMap((row, index) => entry(context, { place: (index + 1) as 1 | 2 | 3, entrantId: row.entrantId, basis: TABLE_BASIS[index] ?? '' }));
}

function podiumOf(context: ViewContext): FinalPodiumEntryView[] {
  const final = findFinal(context);
  return final === undefined ? tablePodium(context) : bracketPodium(context, final);
}
