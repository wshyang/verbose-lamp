import type { ModeId, TeamRecord } from '../../shared/contracts.js';
import {
  buildConsolation,
  buildFlightedQuads,
  buildIronman,
  buildSingleElimination,
  buildWorldCupKnockout,
} from './brackets.js';
import {
  createMatchDraft,
  groupWinnerParticipant,
  swissParticipant,
  teamParticipant,
  type DraftParticipant,
  type FormatDraft,
  type MatchDraft,
} from './drafts.js';
import { createBalancedGroups, createPoolSchedule, roundRobinGroupCount } from './pools.js';

export function buildFormatDraft(mode: ModeId, teams: TeamRecord[]): FormatDraft {
  switch (mode) {
    case 'manual':
      return { matches: [], groupKeys: [] };
    case 'round-robin':
      return buildRoundRobin(teams);
    case 'groups':
      return buildGroupsLeague(teams);
    case 'swiss':
      return buildSwiss(teams);
    case 'single-elimination':
      return { matches: buildSingleElimination(teams), groupKeys: [] };
    case 'consolation':
      return { matches: buildConsolation(teams), groupKeys: [] };
    case 'flighted-quads':
      return buildFlights(teams);
    case 'ironman':
      return { matches: buildIronman(teams), groupKeys: [] };
    case 'points-rush':
      return buildPointsRush(teams);
    case 'world-cup':
      return buildWorldCup(teams);
  }
}

function buildRoundRobin(teams: TeamRecord[]): FormatDraft {
  const group = { key: 'ALL', name: 'All teams', teams };
  const pool = createPoolSchedule([group], 'RR', 'Round robin', 1);
  return { matches: pool.matches, groupKeys: [] };
}

function buildGroupsLeague(teams: TeamRecord[]): FormatDraft {
  const groups = createBalancedGroups(teams, roundRobinGroupCount(teams.length));
  const pool = createPoolSchedule(groups, 'GL', 'Group play', 1);
  return { matches: pool.matches, groupKeys: groups.map((group) => group.key) };
}

function buildSwiss(teams: TeamRecord[]): FormatDraft {
  const roundCount = Math.ceil(Math.log2(teams.length));
  const matchCount = Math.floor(teams.length / 2);
  const matches: MatchDraft[] = [];
  let previousRoundCodes: string[] = [];
  let position = 1;
  for (let round = 1; round <= roundCount; round += 1) {
    const currentCodes: string[] = [];
    for (let pair = 0; pair < matchCount; pair += 1) {
      const code = `SW-R${round}-M${pair + 1}`;
      const [home, away] = swissPairingSlots(teams, round, pair);
      matches.push(
        createMatchDraft(
          code,
          `Swiss round ${round}`,
          round,
          'Swiss',
          position++,
          home,
          away,
          round === 1 ? [] : previousRoundCodes,
        ),
      );
      currentCodes.push(code);
    }
    previousRoundCodes = currentCodes;
  }
  return { matches, groupKeys: [] };
}

function swissPairingSlots(
  teams: TeamRecord[],
  round: number,
  pair: number,
): [DraftParticipant, DraftParticipant] {
  if (round > 1) {
    return [swissParticipant(round - 1, pair + 1, 1), swissParticipant(round - 1, pair + 1, 2)];
  }
  const home = teams[pair * 2];
  const away = teams[pair * 2 + 1];
  if (!home || !away) throw new Error(`Swiss pairing ${pair + 1} has no team seed.`);
  return [teamParticipant(home), teamParticipant(away)];
}

function buildFlights(teams: TeamRecord[]): FormatDraft {
  const matches = buildFlightedQuads(teams);
  const groupKeys = Array.from({ length: teams.length / 4 }, (_, index) =>
    `Flight ${String.fromCharCode(65 + index)}`,
  );
  return { matches, groupKeys };
}

function buildPointsRush(teams: TeamRecord[]): FormatDraft {
  const groups = createBalancedGroups(teams, 4);
  const pool = createPoolSchedule(groups, 'PR', 'Group play', 1);
  const finalCode = 'PR-FINAL';
  const sourceCodes = pool.matches.map((match) => match.code);
  const finalMatch = createMatchDraft(
    finalCode,
    'Points-rush final',
    pool.roundCount + 1,
    null,
    pool.matches.length + 1,
    groupWinnerParticipant(groups.map((group) => group.key), 1),
    groupWinnerParticipant(groups.map((group) => group.key), 2),
    sourceCodes,
  );
  return { matches: [...pool.matches, finalMatch], groupKeys: groups.map((group) => group.key) };
}

function buildWorldCup(teams: TeamRecord[]): FormatDraft {
  const groupCount = teams.length === 10 ? 2 : teams.length / 4;
  const groups = createBalancedGroups(teams, groupCount);
  const pool = createPoolSchedule(groups, 'WC-G', 'Group stage', 1);
  const knockout = buildWorldCupKnockout(
    groups.map((group) => group.key),
    pool.matches.map((match) => match.code),
    pool.roundCount,
  );
  return { matches: [...pool.matches, ...knockout], groupKeys: groups.map((group) => group.key) };
}
