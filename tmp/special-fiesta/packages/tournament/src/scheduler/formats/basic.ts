import type { FormatPlugin, SeededEntrant, Structure } from '../types.js';
import { buildKnockout, entrantSeat, groupFixtures, stageOf } from './common.js';

/**
 * ADR-274 — the shapes the problem catalogue calls basic (§6): open play, everyone plays everyone,
 * and straight elimination. Ironman is straight elimination with a rest rule, so it lives here too.
 */

const NO_REST_RULE = { restMinutes: null, flagBackToBack: false } as const;

export function between(teamCount: number, bounds: { min: number; max: number }): string | null {
  if (teamCount < bounds.min) return `This format needs at least ${bounds.min} teams.`;
  if (teamCount > bounds.max) return `This format takes at most ${bounds.max} teams.`;
  return null;
}

/** Open play: one open stage, no fixtures. Every match is staged by hand and counts (P-05). */
export const openFormat: FormatPlugin = {
  id: 'open',
  label: 'Open play',
  summary: 'No fixtures: courts call matches as they come, and every match counts.',
  minTeams: 2,
  maxTeams: 64,
  validate: (teamCount) => between(teamCount, { min: 2, max: 64 }),
  build: (_entrants, options): Structure => ({
    stages: [stageOf({ code: 'OPEN', ordinal: 1, label: 'Open play', kind: 'open', tablePoints: options.tablePoints ?? null })],
    groups: [],
    matches: [],
  }),
  restPolicy: NO_REST_RULE,
  isDynamic: false,
};

/** Everyone plays everyone, one table (P-06 is the organising principle). */
export const roundRobinFormat: FormatPlugin = {
  id: 'round_robin',
  label: 'Round robin',
  summary: 'Everyone plays everyone once; the table is the result.',
  minTeams: 2,
  maxTeams: 16,
  validate: (teamCount) => between(teamCount, { min: 2, max: 16 }),
  build: (entrants, options) => ({
    stages: [stageOf({ code: 'RR', ordinal: 1, label: 'Round robin', kind: 'pool', tablePoints: options.tablePoints ?? null })],
    groups: [{ code: 'A', stageCode: 'RR', label: 'Table', entrantIds: entrants.map((entrant) => entrant.id) }],
    matches: groupFixtures({ entrants, stageCode: 'RR', groupCode: 'A', codePrefix: 'R', firstSequence: 1 }),
  }),
  restPolicy: NO_REST_RULE,
  isDynamic: false,
};

interface EliminationShape {
  code: string;
  prefix: string;
  label: string;
  pairing: 'classic' | 'adjacent';
  hasThirdPlace: boolean;
}

function eliminationStructure(entrants: readonly SeededEntrant[], shape: EliminationShape): Structure {
  const built = buildKnockout({
    seeds: entrants.map(entrantSeat),
    stageCode: shape.code,
    codePrefix: shape.prefix,
    pairing: shape.pairing,
    hasThirdPlace: shape.hasThirdPlace,
    firstSequence: 1,
    firstRound: 1,
  });
  return {
    stages: [stageOf({ code: shape.code, ordinal: 1, label: shape.label, kind: 'bracket' })],
    groups: [],
    matches: built.matches,
  };
}

/** Straight elimination: byes to the top seeds as structure, an optional third-place match. */
export const singleEliminationFormat: FormatPlugin = {
  id: 'single_elimination',
  label: 'Single elimination',
  summary: 'Lose once and you are out; the top seeds get the byes.',
  minTeams: 2,
  maxTeams: 32,
  validate: (teamCount) => between(teamCount, { min: 2, max: 32 }),
  build: (entrants, options) =>
    eliminationStructure(entrants, {
      code: 'KO',
      prefix: 'K',
      label: 'Knockout',
      pairing: options.pairing ?? 'classic',
      hasThirdPlace: options.hasThirdPlace ?? false,
    }),
  restPolicy: NO_REST_RULE,
  isDynamic: false,
};

/**
 * Ironman: the same bracket, played with no rest — the winners of the early rounds go straight back
 * on. The planner reads the rest policy and flags every back-to-back match so the room can see it.
 */
export const ironmanFormat: FormatPlugin = {
  id: 'ironman',
  label: 'Ironman knockout',
  summary: 'A knockout squeezed into the shortest day: no rest, winners play back to back.',
  minTeams: 4,
  maxTeams: 32,
  validate: (teamCount) => between(teamCount, { min: 4, max: 32 }),
  build: (entrants, options) =>
    eliminationStructure(entrants, {
      code: 'IM',
      prefix: 'I',
      label: 'Ironman',
      pairing: options.pairing ?? 'classic',
      hasThirdPlace: options.hasThirdPlace ?? false,
    }),
  restPolicy: { restMinutes: 0, flagBackToBack: true },
  isDynamic: false,
};
