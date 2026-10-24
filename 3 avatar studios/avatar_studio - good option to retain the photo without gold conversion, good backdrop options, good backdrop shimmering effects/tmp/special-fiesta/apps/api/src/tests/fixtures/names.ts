import { CLUSTER_CODES } from '@psd/contracts';

/**
 * Realistic, deterministic fixture pools (AGENTS-testing.md §7). Named people, not user-123,
 * so a failing assertion reads like an event roster. Pools differ per cluster so output also
 * tells you which side of the leaderboard a row belongs to.
 */

const POOLS: Record<string, string[]> = {
  BP: ['Aisyah', 'Bala', 'Cheryl', 'Darren'],
  CHROO: ['Eunice', 'Faizal', 'Gerald', 'Hui_Min'],
  Comms: ['Ismail', 'Joanne', 'Kavitha', 'Lionel'],
  CS: ['Marcus', 'Nadia', 'Oliver', 'Priya'],
  Cumulus: ['Qistina', 'Raj', 'Serene', 'Tobias'],
  HRP: ['Umar', 'Valerie', 'Wesley', 'Xinyi'],
  HRPS: ['Yasmin', 'Zachary', 'Amira', 'Benedict'],
  ITC: ['Clarence', 'Divya', 'Ezra', 'Farah'],
  LDS: ['Gwen', 'Hakim', 'Irene', 'Jerome'],
  OLI: ['Karthik', 'Lydia', 'Mervyn', 'Noorain'],
  PCG: ['Otto', 'Pearlyn', 'Quek', 'Rashid'],
  'PSC Sect': ['Shanti', 'Terence', 'Ursula', 'Vikram'],
  PST: ['Wendy', 'Xavier', 'Yusof', 'Zoe'],
  ServiceSG: ['Adeline', 'Bryan', 'Cassandra', 'Dinesh'],
  SPR: ['Elena', 'Fauzi', 'Grace', 'Haziq'],
  WD: ['Indra', 'Jasmine', 'Kelvin', 'Larissa'],
};

export const TEAM_NAME_POOL = [
  'Sandstorm Serangoon',
  'Merlion Mavericks',
  'Siloso Smashers',
  'Tanjong Tornadoes',
  'Palawan Pioneers',
  'Kelong Kings',
];

export const ACTIVITY_NAME_POOL = [
  'Sandcastle Station',
  'Beach Volleyball Sprint',
  'Tug of Shore',
  'Coconut Relay',
];

let cursor = 0;

/** Unique per run: `{label}.{runId}` keeps parallel suites from colliding (§7). */
export function uniqueSuffix(runId: string): string {
  cursor += 1;
  return `${runId}_${cursor.toString(36)}`;
}

export function nicknameFor(input: { clusterCode: string; runId: string }): string {
  const pool = POOLS[input.clusterCode] ?? POOLS['BP']!;
  const base = pool[cursor % pool.length]!;
  return `${base}_${uniqueSuffix(input.runId)}`;
}

export function anyClusterCode(index: number): string {
  return CLUSTER_CODES[index % CLUSTER_CODES.length]!;
}

export function teamNameFor(runId: string): string {
  const base = TEAM_NAME_POOL[cursor % TEAM_NAME_POOL.length]!;
  return `${base} ${uniqueSuffix(runId)}`;
}

export function activityNameFor(runId: string): string {
  const base = ACTIVITY_NAME_POOL[cursor % ACTIVITY_NAME_POOL.length]!;
  return `${base} ${uniqueSuffix(runId)}`;
}
