import type { TeamRecord } from '../../shared/contracts.js';
import {
  createMatchDraft,
  groupRankParticipant,
  outcomeParticipant,
  teamParticipant,
  type DraftParticipant,
  type MatchDraft,
} from './drafts.js';

export function buildSingleElimination(teams: TeamRecord[], prefix = 'SE'): MatchDraft[] {
  if (teams.length < 2) throw new Error('Single-elimination requires at least two teams.');
  let slots: Array<DraftParticipant | null> = createSeedOrder(nextPowerOfTwo(teams.length)).map(
    (seed) => (seed <= teams.length ? teamParticipant(teamAt(teams, seed - 1)) : null),
  );
  const matches: MatchDraft[] = [];
  let roundNumber = 1;
  let position = 1;
  while (slots.length > 1) {
    const pairs = pairSlots(slots);
    const playableCount = pairs.filter(([home, away]) => home && away).length;
    const phase = eliminationPhase(roundNumber, playableCount, slots.length > teams.length);
    slots = pairs.map(([home, away], pairIndex) => {
      const resolvedPair = resolveBracketPair(home, away);
      if (resolvedPair.kind === 'bye') return resolvedPair.team;
      const { home: playableHome, away: playableAway } = resolvedPair;
      const code = `${prefix}-R${roundNumber}-M${pairIndex + 1}`;
      matches.push(
        createMatchDraft(
          code,
          phase,
          roundNumber,
          null,
          position++,
          playableHome,
          playableAway,
          outcomeDependencies(playableHome, playableAway),
        ),
      );
      return outcomeParticipant('winner', code);
    });
    roundNumber += 1;
  }
  return matches;
}

export function buildIronman(teams: TeamRecord[]): MatchDraft[] {
  const seeded = seedLookup(teams);
  const drafts: MatchDraft[] = [];
  const roundOne = [
    ['R1-M1', 8, 9],
    ['R1-M2', 5, 12],
    ['R1-M3', 6, 11],
    ['R1-M4', 7, 10],
  ] as const;
  roundOne.forEach(([code, homeSeed, awaySeed], index) => {
    drafts.push(createTeamMatch(code, 'Play-in', 1, index + 1, teamAt(seeded, homeSeed - 1), teamAt(seeded, awaySeed - 1)));
  });
  const quarterfinals = [
    ['QF-1', 1, 'R1-M1'],
    ['QF-2', 4, 'R1-M2'],
    ['QF-3', 3, 'R1-M3'],
    ['QF-4', 2, 'R1-M4'],
  ] as const;
  quarterfinals.forEach(([code, seed, source], index) => {
    drafts.push(
      createMatchDraft(
        code,
        'Quarterfinal',
        2,
        null,
        index + 5,
        teamParticipant(teamAt(seeded, seed - 1)),
        outcomeParticipant('winner', source),
        [source],
      ),
    );
  });
  addIronmanSemifinals(drafts);
  addIronmanFinal(drafts);
  return drafts;
}

export function buildConsolation(teams: TeamRecord[]): MatchDraft[] {
  const seeded = seedLookup(teams);
  const drafts: MatchDraft[] = [];
  const quarterfinalPairs = [
    ['QF1', 1, 8],
    ['QF2', 4, 5],
    ['QF3', 3, 6],
    ['QF4', 2, 7],
  ] as const;
  quarterfinalPairs.forEach(([code, homeSeed, awaySeed], index) => {
    drafts.push(createTeamMatch(code, 'Quarterfinal', 1, index + 1, teamAt(seeded, homeSeed - 1), teamAt(seeded, awaySeed - 1)));
  });
  addConsolationSemifinals(drafts);
  addConsolationPlacementGames(drafts);
  return drafts;
}

export function buildFlightedQuads(teams: TeamRecord[]): MatchDraft[] {
  const drafts: MatchDraft[] = [];
  const flightCount = teams.length / 4;
  for (let flightIndex = 0; flightIndex < flightCount; flightIndex += 1) {
    const flightKey = `Flight ${String.fromCharCode(65 + flightIndex)}`;
    const flightTeams = teams.slice(flightIndex * 4, flightIndex * 4 + 4);
    const semiOne = `F${flightIndex + 1}-SF1`;
    const semiTwo = `F${flightIndex + 1}-SF2`;
    drafts.push(
      createMatchDraft(semiOne, 'Semifinal', 1, flightKey, flightIndex * 3 + 1, teamParticipant(teamAt(flightTeams, 0)), teamParticipant(teamAt(flightTeams, 3))),
      createMatchDraft(semiTwo, 'Semifinal', 1, flightKey, flightIndex * 3 + 2, teamParticipant(teamAt(flightTeams, 1)), teamParticipant(teamAt(flightTeams, 2))),
      createMatchDraft(
        `F${flightIndex + 1}-FINAL`,
        'Flight final',
        2,
        flightKey,
        flightIndex * 3 + 3,
        outcomeParticipant('winner', semiOne),
        outcomeParticipant('winner', semiTwo),
        [semiOne, semiTwo],
      ),
    );
  }
  return drafts;
}

export function buildWorldCupKnockout(
  groupKeys: string[],
  groupMatchCodes: string[],
  groupRoundCount: number,
): MatchDraft[] {
  const openingPairs = worldCupOpeningPairs(groupKeys);
  const drafts: MatchDraft[] = [];
  const dependencies = [...groupMatchCodes];
  let previousCodes: string[] = [];
  let position = 1;
  const firstRound = groupRoundCount + 1;
  openingPairs.forEach(([homeGroup, awayGroup], index) => {
    const code = `WC-KO-R1-M${index + 1}`;
    drafts.push(
      createMatchDraft(
        code,
        eliminationPhase(1, openingPairs.length, false),
        firstRound,
        null,
        position++,
        groupRankParticipant(homeGroup, 1),
        groupRankParticipant(awayGroup, 2),
        dependencies,
      ),
    );
    previousCodes.push(code);
  });
  addWorldCupRounds(drafts, previousCodes, firstRound, position);
  return drafts;
}

function addWorldCupRounds(
  drafts: MatchDraft[],
  previousCodes: string[],
  firstRound: number,
  firstPosition: number,
): void {
  let round = 2;
  let position = firstPosition;
  let currentCodes = previousCodes;
  while (currentCodes.length > 1) {
    const nextCodes: string[] = [];
    for (let index = 0; index < currentCodes.length / 2; index += 1) {
      const homeCode = stringAt(currentCodes, index * 2);
      const awayCode = stringAt(currentCodes, index * 2 + 1);
      const code = `WC-KO-R${round}-M${index + 1}`;
      drafts.push(
        createMatchDraft(
          code,
          eliminationPhase(round, currentCodes.length / 2, false),
          firstRound + round - 1,
          null,
          position++,
          outcomeParticipant('winner', homeCode),
          outcomeParticipant('winner', awayCode),
          [homeCode, awayCode],
        ),
      );
      nextCodes.push(code);
    }
    currentCodes = nextCodes;
    round += 1;
  }
}

function worldCupOpeningPairs(groupKeys: string[]): Array<[string, string]> {
  if (groupKeys.length === 2) {
    const first = stringAt(groupKeys, 0);
    const second = stringAt(groupKeys, 1);
    return [[first, second], [second, first]];
  }
  const pairs: Array<[string, string]> = [];
  for (let index = 0; index < groupKeys.length; index += 2) {
    pairs.push([stringAt(groupKeys, index), stringAt(groupKeys, index + 1)]);
  }
  for (let index = 1; index < groupKeys.length; index += 2) {
    pairs.push([stringAt(groupKeys, index), stringAt(groupKeys, index - 1)]);
  }
  return pairs;
}

function addIronmanSemifinals(drafts: MatchDraft[]): void {
  const semifinals = [
    ['SF-1', 'QF-1', 'QF-2'],
    ['SF-2', 'QF-3', 'QF-4'],
  ] as const;
  semifinals.forEach(([code, homeCode, awayCode], index) => {
    drafts.push(
      createMatchDraft(
        code,
        'Semifinal',
        4,
        null,
        index + 9,
        outcomeParticipant('winner', homeCode),
        outcomeParticipant('winner', awayCode),
        [homeCode, awayCode],
      ),
    );
  });
}

function addIronmanFinal(drafts: MatchDraft[]): void {
  drafts.push(
    createMatchDraft(
      'FINAL',
      'Grand final',
      5,
      null,
      11,
      outcomeParticipant('winner', 'SF-1'),
      outcomeParticipant('winner', 'SF-2'),
      ['SF-1', 'SF-2'],
    ),
  );
}

function addConsolationSemifinals(drafts: MatchDraft[]): void {
  const semifinalPairs = [
    ['SF1', 'QF1', 'QF2'],
    ['SF2', 'QF3', 'QF4'],
  ] as const;
  semifinalPairs.forEach(([code, homeCode, awayCode], index) => {
    drafts.push(
      createMatchDraft(
        code,
        'Semifinal',
        2,
        null,
        index + 5,
        outcomeParticipant('winner', homeCode),
        outcomeParticipant('winner', awayCode),
        [homeCode, awayCode],
      ),
    );
  });
  const consolationPairs = [
    ['CON1', 'QF1', 'QF2'],
    ['CON2', 'QF3', 'QF4'],
  ] as const;
  consolationPairs.forEach(([code, homeCode, awayCode], index) => {
    drafts.push(
      createMatchDraft(
        code,
        'Consolation',
        2,
        null,
        index + 7,
        outcomeParticipant('loser', homeCode),
        outcomeParticipant('loser', awayCode),
        [homeCode, awayCode],
      ),
    );
  });
}

function addConsolationPlacementGames(drafts: MatchDraft[]): void {
  const placementGames = [
    ['GF', 'Grand final', 'winner', 'SF1', 'winner', 'SF2'],
    ['3RD', 'Third-place match', 'loser', 'SF1', 'loser', 'SF2'],
  ] as const;
  placementGames.forEach(([code, phase, homeOutcome, homeCode, awayOutcome, awayCode], index) => {
    drafts.push(
      createMatchDraft(
        code,
        phase,
        3,
        null,
        index + 9,
        outcomeParticipant(homeOutcome, homeCode),
        outcomeParticipant(awayOutcome, awayCode),
        ['SF1', 'SF2'],
      ),
    );
  });
}

function createTeamMatch(
  code: string,
  phase: string,
  roundNumber: number,
  position: number,
  home: TeamRecord,
  away: TeamRecord,
): MatchDraft {
  return createMatchDraft(
    code,
    phase,
    roundNumber,
    null,
    position,
    teamParticipant(home),
    teamParticipant(away),
  );
}

function seedLookup(teams: TeamRecord[]): TeamRecord[] {
  return [...teams].sort((first, second) => first.seed - second.seed);
}

export function pairSlots(
  slots: Array<DraftParticipant | null>,
): Array<[DraftParticipant | null, DraftParticipant | null]> {
  const pairs: Array<[DraftParticipant | null, DraftParticipant | null]> = [];
  for (let index = 0; index < slots.length; index += 2) {
    pairs.push([slots[index] ?? null, slots[index + 1] ?? null]);
  }
  return pairs;
}

export function resolveBracketPair(
  home: DraftParticipant | null,
  away: DraftParticipant | null,
):
  | { kind: 'bye'; team: DraftParticipant | null }
  | { kind: 'match'; home: DraftParticipant; away: DraftParticipant } {
  if (!home) return { kind: 'bye', team: away };
  if (!away) return { kind: 'bye', team: home };
  return { kind: 'match', home, away };
}

function outcomeDependencies(...participants: DraftParticipant[]): string[] {
  return participants.flatMap((participant) =>
    participant.kind === 'outcome' ? [participant.matchCode] : [],
  );
}

export function eliminationPhase(round: number, matches: number, hasByes: boolean): string {
  if (hasByes && round === 1) return 'Play-in';
  if (matches === 1) return 'Grand final';
  if (matches === 2) return 'Semifinal';
  if (matches === 4) return 'Quarterfinal';
  if (matches === 8) return 'Round of 16';
  return `Round ${round}`;
}

function createSeedOrder(bracketSize: number): number[] {
  let order = [1, 2];
  for (let size = 4; size <= bracketSize; size *= 2) {
    order = order.flatMap((seed) => [seed, size + 1 - seed]);
  }
  return order;
}

function teamAt(teams: TeamRecord[], index: number): TeamRecord {
  const team = teams[index];
  if (!team) throw new Error(`Team at seed ${index + 1} is missing.`);
  return team;
}

function stringAt(values: string[], index: number): string {
  const value = values[index];
  if (value === undefined) throw new Error(`Match path ${index + 1} is missing.`);
  return value;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}
