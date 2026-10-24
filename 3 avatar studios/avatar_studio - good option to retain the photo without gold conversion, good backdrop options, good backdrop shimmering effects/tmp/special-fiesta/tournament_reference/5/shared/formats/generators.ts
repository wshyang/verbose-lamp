import type { MatchSpec } from '../types.js';
import { byeSlot, loserOf, rankOf, recordPool, seedSlot, teamSlot, winnerOf } from '../slots.js';
import {
  buildKnockoutFromSlots, buildSeededKnockout, circlePairs, distributeSeeds,
  groupLetters, groupMatches, placementMatch,
} from './common.js';

export function generateRoundRobin(teamCount: number): MatchSpec[] {
  const seeds = Array.from({ length: teamCount }, (_, index) => index + 1);
  const specs: MatchSpec[] = [];
  let counter = 1;
  for (const round of circlePairs(seeds)) {
    for (const [home, away] of round.pairs) {
      specs.push({
        key: `M${counter}`, phase: `Round ${round.round}`, groupKey: null, round: round.round,
        slotA: seedSlot(home), slotB: seedSlot(away), dependsOn: [],
      });
      counter += 1;
    }
  }
  return specs;
}

export function generateSingleElimination(teamCount: number): MatchSpec[] {
  return buildSeededKnockout(teamCount, { keyPrefix: 'SE', phasePrefix: '', firstRound: 1 });
}

export function generateConsolation(teamCount: number): MatchSpec[] {
  void teamCount;
  const quarter = (key: string, a: number, b: number): MatchSpec => ({
    key, phase: 'Quarter-Finals', groupKey: null, round: 1,
    slotA: seedSlot(a), slotB: seedSlot(b), dependsOn: [],
  });
  return [
    quarter('QF1', 1, 8), quarter('QF2', 4, 5), quarter('QF3', 3, 6), quarter('QF4', 2, 7),
    { key: 'SF1', phase: 'Semi-Finals', groupKey: null, round: 2, slotA: winnerOf('QF1'), slotB: winnerOf('QF2'), dependsOn: ['QF1', 'QF2'] },
    { key: 'SF2', phase: 'Semi-Finals', groupKey: null, round: 2, slotA: winnerOf('QF3'), slotB: winnerOf('QF4'), dependsOn: ['QF3', 'QF4'] },
    { key: 'CON1', phase: 'Consolation', groupKey: null, round: 2, slotA: loserOf('QF1'), slotB: loserOf('QF2'), dependsOn: ['QF1', 'QF2'] },
    { key: 'CON2', phase: 'Consolation', groupKey: null, round: 2, slotA: loserOf('QF3'), slotB: loserOf('QF4'), dependsOn: ['QF3', 'QF4'] },
    { key: 'GF', phase: 'Grand Final', groupKey: null, round: 3, slotA: winnerOf('SF1'), slotB: winnerOf('SF2'), dependsOn: ['SF1', 'SF2'] },
    placementMatch('P3', 'SF1', 'SF2', 3, '3rd Place'),
    { key: 'P5', phase: '5th Place', groupKey: null, round: 3, slotA: winnerOf('CON1'), slotB: winnerOf('CON2'), dependsOn: ['CON1', 'CON2'] },
  ];
}

function winnersBracket(teamCount: number): MatchSpec[] {
  return buildSeededKnockout(teamCount, { keyPrefix: 'WB', phasePrefix: 'Winners', firstRound: 1 });
}

export function generateDoubleElimination(teamCount: number): MatchSpec[] {
  const winners = winnersBracket(teamCount);
  const finalRound = Math.max(...winners.map((match) => match.round));
  const wbFinal = winners[winners.length - 1];
  if (teamCount === 4) {
    return [
      ...winners,
      { key: 'LB-R1M1', phase: 'Losers Round 1', groupKey: null, round: 2, slotA: loserOf('WB-R1M1'), slotB: loserOf('WB-R1M2'), dependsOn: ['WB-R1M1', 'WB-R1M2'] },
      { key: 'LB-F', phase: 'Losers Final', groupKey: null, round: 3, slotA: winnerOf('LB-R1M1'), slotB: loserOf(wbFinal.key), dependsOn: ['LB-R1M1', wbFinal.key] },
      { key: 'GF', phase: 'Grand Final', groupKey: null, round: 4, slotA: winnerOf(wbFinal.key), slotB: winnerOf('LB-F'), dependsOn: [wbFinal.key, 'LB-F'] },
    ];
  }
  return [
    ...winners,
    { key: 'LB-R1M1', phase: 'Losers Round 1', groupKey: null, round: 2, slotA: loserOf('WB-R1M1'), slotB: loserOf('WB-R1M2'), dependsOn: ['WB-R1M1', 'WB-R1M2'] },
    { key: 'LB-R1M2', phase: 'Losers Round 1', groupKey: null, round: 2, slotA: loserOf('WB-R1M3'), slotB: loserOf('WB-R1M4'), dependsOn: ['WB-R1M3', 'WB-R1M4'] },
    { key: 'LB-R2M1', phase: 'Losers Round 2', groupKey: null, round: 3, slotA: winnerOf('LB-R1M1'), slotB: loserOf('WB-R2M2'), dependsOn: ['LB-R1M1', 'WB-R2M2'] },
    { key: 'LB-R2M2', phase: 'Losers Round 2', groupKey: null, round: 3, slotA: winnerOf('LB-R1M2'), slotB: loserOf('WB-R2M1'), dependsOn: ['LB-R1M2', 'WB-R2M1'] },
    { key: 'LB-R3M1', phase: 'Losers Semi-Final', groupKey: null, round: 4, slotA: winnerOf('LB-R2M1'), slotB: winnerOf('LB-R2M2'), dependsOn: ['LB-R2M1', 'LB-R2M2'] },
    { key: 'LB-F', phase: 'Losers Final', groupKey: null, round: 5, slotA: winnerOf('LB-R3M1'), slotB: loserOf(wbFinal.key), dependsOn: ['LB-R3M1', wbFinal.key] },
    { key: 'GF', phase: 'Grand Final', groupKey: null, round: finalRound + 3, slotA: winnerOf(wbFinal.key), slotB: winnerOf('LB-F'), dependsOn: [wbFinal.key, 'LB-F'] },
  ];
}

export function generateSwiss(teamCount: number): MatchSpec[] {
  const totalRounds = Math.max(1, Math.ceil(Math.log2(teamCount)));
  const specs: MatchSpec[] = [];
  let previousKeys: string[] = [];
  for (let round = 1; round <= totalRounds; round += 1) {
    const keys: string[] = [];
    const matchesInRound = Math.ceil(teamCount / 2);
    for (let index = 0; index < matchesInRound; index += 1) {
      const key = `SW-R${round}M${index + 1}`;
      keys.push(key);
      if (round === 1) {
        const seedA = index * 2 + 1;
        const seedB = index * 2 + 2;
        const isBye = seedB > teamCount;
        specs.push({
          key, phase: `Swiss Round ${round}`, groupKey: null, round,
          slotA: seedSlot(seedA), slotB: isBye ? byeSlot() : seedSlot(seedB), dependsOn: [],
        });
      } else {
        const isBye = teamCount % 2 !== 0 && index === matchesInRound - 1;
        specs.push({
          key, phase: `Swiss Round ${round}`, groupKey: null, round,
          slotA: recordPool(round - 1, `Round ${round - 1} record pool · pairing ${index * 2 + 1}`),
          slotB: isBye ? byeSlot() : recordPool(round - 1, `Round ${round - 1} record pool · pairing ${index * 2 + 2}`),
          dependsOn: [...previousKeys],
        });
      }
    }
    previousKeys = keys;
  }
  return specs;
}

export function generateWorldCup(teamCount: number): MatchSpec[] {
  const groupCount = Math.max(2, Math.round(teamCount / 4));
  const groups = distributeSeeds(teamCount, groupCount);
  const letters = groupLetters(groupCount);
  const specs: MatchSpec[] = [];
  for (let index = 0; index < groupCount; index += 1) {
    specs.push(...groupMatches(letters[index], groups[index], `G${letters[index]}-M`, 1));
  }
  const groupKeys = specs.map((match) => match.key);
  const qualifiers: MatchSpec['slotA'][] = [];
  for (let index = 0; index < groupCount; index += 1) {
    qualifiers.push(rankOf(`Group ${letters[index]}`, 1));
    if (index + 1 < groupCount) qualifiers.push(rankOf(`Group ${letters[index + 1]}`, 2));
    else if (groupCount > 1) qualifiers.push(rankOf(`Group ${letters[0]}`, 2));
  }
  const lastGroupRound = Math.max(...specs.map((match) => match.round));
  const knockout = buildKnockoutFromSlots(qualifiers, { keyPrefix: 'KO', phasePrefix: 'Knockout', firstRound: 1 })
    .map((match) => ({
      ...match,
      round: lastGroupRound + match.round,
      dependsOn: [...groupKeys, ...match.dependsOn],
    }));
  return [...specs, ...knockout];
}

export function generateFlightedQuads(teamCount: number): MatchSpec[] {
  const flightCount = teamCount / 4;
  const letters = groupLetters(flightCount);
  const flightNames = ['Pro Flight', 'Amateur Flight', 'Casual Flight', 'Social Flight'];
  const specs: MatchSpec[] = [];
  for (let flight = 0; flight < flightCount; flight += 1) {
    const letter = letters[flight];
    const name = flightNames[flight % flightNames.length];
    const base = flight * 4;
    const slot = (position: number) => teamSlot(`team-${base + position}`, `${name} · Seed ${position}`);
    const sf1 = `SF-${letter}1`;
    const sf2 = `SF-${letter}2`;
    specs.push(
      { key: sf1, phase: `${name} Semi-Final`, groupKey: letter, round: 1, slotA: slot(1), slotB: slot(4), dependsOn: [] },
      { key: sf2, phase: `${name} Semi-Final`, groupKey: letter, round: 1, slotA: slot(2), slotB: slot(3), dependsOn: [] },
      { key: `FIN-${letter}`, phase: `${name} Final`, groupKey: letter, round: 2, slotA: winnerOf(sf1), slotB: winnerOf(sf2), dependsOn: [sf1, sf2] },
      placementMatch(`P3-${letter}`, sf1, sf2, 2, `${name} 3rd Place`),
    );
  }
  return specs;
}

export function generatePointsRush(teamCount: number): MatchSpec[] {
  const groupCount = teamCount / 3;
  const letters = groupLetters(groupCount);
  const specs: MatchSpec[] = [];
  for (let group = 0; group < groupCount; group += 1) {
    const base = group * 3;
    const seeds = [base + 1, base + 2, base + 3];
    specs.push(...groupMatches(letters[group], seeds, `G${letters[group]}-M`, 1));
  }
  const groupKeys = specs.map((match) => match.key);
  specs.push(
    { key: 'GF', phase: 'Grand Final', groupKey: null, round: 90, slotA: rankOf('Overall', 1), slotB: rankOf('Overall', 2), dependsOn: groupKeys },
    { key: 'P3', phase: '3rd Place', groupKey: null, round: 90, slotA: rankOf('Overall', 3), slotB: rankOf('Overall', 4), dependsOn: groupKeys },
  );
  return specs.map((match) => (match.round === 90 ? { ...match, round: 4 } : match));
}

export function generateIronman(teamCount: number): MatchSpec[] {
  return buildSeededKnockout(teamCount, { keyPrefix: 'IM', phasePrefix: 'Ironman', firstRound: 1 });
}
