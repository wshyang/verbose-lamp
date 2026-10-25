import type { MatchSpec } from '../types.js';
import {
  generateConsolation, generateDoubleElimination, generateFlightedQuads,
  generateIronman, generatePointsRush, generateRoundRobin,
  generateSingleElimination, generateSwiss, generateWorldCup,
} from './generators.js';

export interface FormatDefinition {
  id: string;
  name: string;
  description: string;
  minTeams: number;
  maxTeams: number;
  enforcedRestMinutes: number | null;
  validate: (teamCount: number) => string | null;
  generate: (teamCount: number) => MatchSpec[];
}

function range(min: number, max: number): (teamCount: number) => string | null {
  return (teamCount) => (teamCount < min || teamCount > max
    ? `This format needs between ${min} and ${max} teams`
    : null);
}

export const FORMATS: FormatDefinition[] = [
  {
    id: 'round-robin', name: 'Round Robin', minTeams: 2, maxTeams: 32, enforcedRestMinutes: null,
    description: 'Everyone plays everyone once; the table is the result.',
    validate: range(2, 32), generate: generateRoundRobin,
  },
  {
    id: 'single-elimination', name: 'Single Elimination', minTeams: 2, maxTeams: 32, enforcedRestMinutes: null,
    description: 'Seeded knockout; lowest seeds play in, byes are never phantom matches.',
    validate: range(2, 32), generate: generateSingleElimination,
  },
  {
    id: 'double-elimination', name: 'Double Elimination', minTeams: 4, maxTeams: 8, enforcedRestMinutes: null,
    description: 'Winners and losers brackets; a team is out after two losses.',
    validate: (n) => (n === 4 || n === 8 ? null : 'Double elimination needs 4 or 8 teams'),
    generate: generateDoubleElimination,
  },
  {
    id: 'consolation', name: 'Consolation Bracket', minTeams: 8, maxTeams: 8, enforcedRestMinutes: null,
    description: '8-team knockout with consolation and placement matches; everyone plays at least twice.',
    validate: (n) => (n === 8 ? null : 'Consolation bracket needs exactly 8 teams'),
    generate: generateConsolation,
  },
  {
    id: 'swiss', name: 'Swiss System', minTeams: 3, maxTeams: 32, enforcedRestMinutes: null,
    description: 'Fixed rounds; each next round pairs teams on similar records (record-pool placeholders).',
    validate: range(3, 32), generate: generateSwiss,
  },
  {
    id: 'world-cup', name: 'World Cup (Groups + Knockout)', minTeams: 6, maxTeams: 32, enforcedRestMinutes: null,
    description: 'Balanced group round robins, then a cross-seeded knockout from group ranks.',
    validate: range(6, 32), generate: generateWorldCup,
  },
  {
    id: 'flighted-quads', name: 'Flighted Quads', minTeams: 8, maxTeams: 32, enforcedRestMinutes: null,
    description: 'Flights of four teams, each with its own semi-finals, final and 3rd-place match.',
    validate: (n) => (n >= 8 && n <= 32 && n % 4 === 0 ? null : 'Flighted quads needs a multiple of 4 teams (8–32)'),
    generate: generateFlightedQuads,
  },
  {
    id: 'points-rush', name: 'Points Rush', minTeams: 6, maxTeams: 30, enforcedRestMinutes: null,
    description: 'Groups of three race for overall leaderboard places; the top four play placement finals.',
    validate: (n) => (n >= 6 && n <= 30 && n % 3 === 0 ? null : 'Points rush needs a multiple of 3 teams (6–30)'),
    generate: generatePointsRush,
  },
  {
    id: 'ironman', name: 'Ironman (Back-to-Back Knockout)', minTeams: 2, maxTeams: 32, enforcedRestMinutes: 0,
    description: 'Single-elimination topology with zero rest between rounds; back-to-back matches are flagged.',
    validate: range(2, 32), generate: generateIronman,
  },
];

export function getFormat(formatId: string): FormatDefinition {
  const format = FORMATS.find((candidate) => candidate.id === formatId);
  if (format === undefined) throw new Error(`Unknown tournament format: ${formatId}`);
  return format;
}

export function generateFormat(formatId: string, teamCount: number): MatchSpec[] {
  const format = getFormat(formatId);
  const problem = format.validate(teamCount);
  if (problem !== null) throw new Error(problem);
  return format.generate(teamCount);
}
