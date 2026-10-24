import type { MatchSpec, SlotSource } from '../types.js';
import { loserOf, seedSlot, teamSlot, winnerOf } from '../slots.js';

export function roundNameFor(matchesInRound: number): string {
  if (matchesInRound === 1) return 'Final';
  if (matchesInRound === 2) return 'Semi-Finals';
  if (matchesInRound === 4) return 'Quarter-Finals';
  return `Round of ${matchesInRound * 2}`;
}

export function seededOrder(size: number): number[] {
  if (size === 2) return [1, 2];
  const previous = seededOrder(size / 2);
  return previous.flatMap((seed) => [seed, size + 1 - seed]);
}

export function circlePairs(seeds: number[]): { round: number; pairs: [number, number][] }[] {
  const list = [...seeds];
  if (list.length % 2 !== 0) list.push(-1);
  const rounds: { round: number; pairs: [number, number][] }[] = [];
  const working = [...list];
  for (let round = 1; round <= list.length - 1; round += 1) {
    const pairs: [number, number][] = [];
    for (let index = 0; index < list.length / 2; index += 1) {
      const home = working[index];
      const away = working[list.length - 1 - index];
      if (home !== -1 && away !== -1) pairs.push([home, away]);
    }
    rounds.push({ round, pairs });
    const last = working.pop() as number;
    working.splice(1, 0, last);
  }
  return rounds;
}

interface KnockoutOptions {
  keyPrefix: string;
  phasePrefix: string;
  firstRound: number;
}

/**
 * Single-elimination bracket over seeded teams. The main bracket is the
 * largest power of two <= teamCount; the lowest seeds play in for the
 * lowest main-bracket slots (the source simulator's 9-12 team shape,
 * generalised). Byes never become phantom matches (P-12).
 */
export function buildSeededKnockout(teamCount: number, options: KnockoutOptions): MatchSpec[] {
  let bracket = 2;
  while (bracket * 2 <= teamCount) bracket *= 2;
  const playInCount = teamCount - bracket;
  const specs: MatchSpec[] = [];
  const slotForSeed = new Map<number, SlotSource>();
  for (let seed = 1; seed <= bracket; seed += 1) slotForSeed.set(seed, seedSlot(seed));
  for (let index = 0; index < playInCount; index += 1) {
    const mainSeed = bracket - index;
    const challengerSeed = 2 * bracket - mainSeed + 1;
    const key = `${options.keyPrefix}-PI${index + 1}`;
    specs.push({
      key, phase: 'Play-In', groupKey: null, round: options.firstRound,
      slotA: seedSlot(mainSeed), slotB: seedSlot(challengerSeed), dependsOn: [],
    });
    slotForSeed.set(mainSeed, winnerOf(key));
  }
  const order = seededOrder(bracket);
  let current: SlotSource[] = order.map((seed) => slotForSeed.get(seed) as SlotSource);
  let round = options.firstRound + (playInCount > 0 ? 1 : 0);
  let roundIndex = 0;
  while (current.length >= 2) {
    const matchesInRound = current.length / 2;
    const next: SlotSource[] = [];
    for (let index = 0; index < matchesInRound; index += 1) {
      const key = `${options.keyPrefix}-R${roundIndex + 1}M${index + 1}`;
      const slotA = current[index * 2];
      const slotB = current[index * 2 + 1];
      specs.push({
        key, phase: `${options.phasePrefix} ${roundNameFor(matchesInRound)}`.trim(),
        groupKey: null, round, slotA, slotB,
        dependsOn: [slotA, slotB].flatMap((slot) => (slot.kind === 'winnerOf' ? [slot.matchKey] : [])),
      });
      next.push(winnerOf(key));
    }
    current = next;
    round += 1;
    roundIndex += 1;
  }
  return specs;
}

/** Knockout over arbitrary slots (e.g. group ranks); top slots receive byes. */
export function buildKnockoutFromSlots(slots: SlotSource[], options: KnockoutOptions): MatchSpec[] {
  let bracket = 2;
  while (bracket < slots.length) bracket *= 2;
  const byeCount = bracket - slots.length;
  const specs: MatchSpec[] = [];
  const playSlots = byeCount > 0 ? slots.slice(byeCount) : [...slots];
  const firstWinners: SlotSource[] = [];
  for (let index = 0; index < playSlots.length / 2; index += 1) {
    const slotA = playSlots[index];
    const slotB = byeCount > 0 ? playSlots[playSlots.length - 1 - index] : playSlots[index * 2 + 1];
    const key = `${options.keyPrefix}-R1M${index + 1}`;
    specs.push({
      key, phase: `${options.phasePrefix} ${roundNameFor(playSlots.length / 2)}`.trim(),
      groupKey: null, round: options.firstRound, slotA, slotB,
      dependsOn: [slotA, slotB].flatMap((slot) => (slot.kind === 'winnerOf' ? [slot.matchKey] : [])),
    });
    firstWinners.push(winnerOf(key));
  }
  let current: SlotSource[] = byeCount > 0 ? [...slots.slice(0, byeCount), ...firstWinners] : firstWinners;
  let round = options.firstRound + 1;
  let roundIndex = 2;
  while (current.length >= 2) {
    const next: SlotSource[] = [];
    for (let index = 0; index < current.length / 2; index += 1) {
      const key = `${options.keyPrefix}-R${roundIndex}M${index + 1}`;
      const slotA = current[index * 2];
      const slotB = current[index * 2 + 1];
      specs.push({
        key, phase: `${options.phasePrefix} ${roundNameFor(current.length / 2)}`.trim(),
        groupKey: null, round, slotA, slotB,
        dependsOn: [slotA, slotB].flatMap((slot) => (slot.kind === 'winnerOf' ? [slot.matchKey] : [])),
      });
      next.push(winnerOf(key));
    }
    current = next;
    round += 1;
    roundIndex += 1;
  }
  return specs;
}

export function groupLetters(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
}

export function distributeSeeds(teamCount: number, groupCount: number): number[][] {
  const groups: number[][] = Array.from({ length: groupCount }, () => []);
  let seed = 1;
  while (seed <= teamCount) {
    const forward = groups.map((_, index) => index);
    const order = (seed - 1) % (groupCount * 2) < groupCount ? forward : [...forward].reverse();
    for (const groupIndex of order) {
      if (seed > teamCount) break;
      groups[groupIndex].push(seed);
      seed += 1;
    }
  }
  return groups;
}

export function groupMatches(
  letter: string,
  seeds: number[],
  keyPrefix: string,
  firstRound: number,
): MatchSpec[] {
  const specs: MatchSpec[] = [];
  let counter = 1;
  for (const round of circlePairs(seeds)) {
    for (const [home, away] of round.pairs) {
      specs.push({
        key: `${keyPrefix}${counter}`,
        phase: `Group ${letter}`,
        groupKey: letter,
        round: firstRound + round.round - 1,
        slotA: teamSlot(`team-${home}`, `Group ${letter} · Seed ${home}`),
        slotB: teamSlot(`team-${away}`, `Group ${letter} · Seed ${away}`),
        dependsOn: [],
      });
      counter += 1;
    }
  }
  return specs;
}

export function placementMatch(
  key: string,
  feederA: string,
  feederB: string,
  round: number,
  phase: string,
): MatchSpec {
  return {
    key, phase, groupKey: null, round,
    slotA: loserOf(feederA), slotB: loserOf(feederB), dependsOn: [feederA, feederB],
  };
}
