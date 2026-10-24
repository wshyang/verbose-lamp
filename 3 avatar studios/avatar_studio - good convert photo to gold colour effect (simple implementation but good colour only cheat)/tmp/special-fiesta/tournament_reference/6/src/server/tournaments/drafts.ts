import type { TeamRecord } from '../../shared/contracts.js';

export type DraftParticipant =
  | { kind: 'team'; teamId: string; label: string }
  | { kind: 'outcome'; outcome: 'winner' | 'loser'; matchCode: string; label: string }
  | { kind: 'group-rank'; groupKey: string; rank: number; label: string }
  | { kind: 'group-winner-rank'; groupKeys: string[]; rank: number; label: string }
  | {
      kind: 'swiss-pairing';
      afterRound: number;
      pairNumber: number;
      seat: 1 | 2;
      label: string;
    };

export interface MatchDraft {
  code: string;
  phase: string;
  roundNumber: number;
  groupKey: string | null;
  position: number;
  home: DraftParticipant;
  away: DraftParticipant;
  dependsOnCodes: string[];
}

export interface FormatDraft {
  matches: MatchDraft[];
  groupKeys: string[];
}

export function teamParticipant(team: TeamRecord): DraftParticipant {
  return { kind: 'team', teamId: team.id, label: team.name };
}

export function outcomeParticipant(
  outcome: 'winner' | 'loser',
  matchCode: string,
): DraftParticipant {
  return { kind: 'outcome', outcome, matchCode, label: `${capitalize(outcome)} of ${matchCode}` };
}

export function groupRankParticipant(groupKey: string, rank: number): DraftParticipant {
  return {
    kind: 'group-rank',
    groupKey,
    rank,
    label: `${ordinal(rank)} · ${groupKey}`,
  };
}

export function groupWinnerParticipant(groupKeys: string[], rank: number): DraftParticipant {
  return {
    kind: 'group-winner-rank',
    groupKeys,
    rank,
    label: `${ordinal(rank)} group winner`,
  };
}

export function swissParticipant(
  afterRound: number,
  pairNumber: number,
  seat: 1 | 2,
): DraftParticipant {
  return {
    kind: 'swiss-pairing',
    afterRound,
    pairNumber,
    seat,
    label: `Pairing after round ${afterRound} · match ${pairNumber} · side ${seat}`,
  };
}

export function createMatchDraft(
  code: string,
  phase: string,
  roundNumber: number,
  groupKey: string | null,
  position: number,
  home: DraftParticipant,
  away: DraftParticipant,
  dependsOnCodes: string[] = [],
): MatchDraft {
  return { code, phase, roundNumber, groupKey, position, home, away, dependsOnCodes };
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function ordinal(value: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const remainder = value % 100;
  const suffix = suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0];
  return `${value}${suffix}`;
}
