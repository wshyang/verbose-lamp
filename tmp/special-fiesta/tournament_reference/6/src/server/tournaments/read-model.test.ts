import { describe, expect, it } from 'vitest';
import type { TeamRecord } from '../../shared/contracts.js';
import { toPointEntries } from './read-model.js';
import type { LedgerRecord } from './standings.js';

const team: TeamRecord = {
  id: 'team-1',
  tournamentId: 'event-1',
  name: 'Northside',
  seed: 1,
  withdrawnAt: null,
  withdrawalReason: null,
};

describe('point ledger read projection', () => {
  it('labels known teams and flags original entries reversed by the append-only ledger', () => {
    const entries = toPointEntries([
      ledger('award-1', 'team-1', 3),
      ledger('void-1', 'team-1', -3, 'void', 'award-1'),
    ], [team]);
    expect(entries[0]).toMatchObject({ teamName: 'Northside', points: 3, voided: true });
    expect(entries[1]).toMatchObject({ teamName: 'Northside', points: -3, voided: false });
  });

  it('keeps an explicit fallback label if a ledger row references a missing team', () => {
    expect(toPointEntries([ledger('orphan', 'missing-team', 2)], [])[0]).toMatchObject({
      teamId: 'missing-team',
      teamName: 'Unknown team',
      voided: false,
    });
  });
});

function ledger(
  id: string,
  teamId: string,
  points: number,
  kind: LedgerRecord['kind'] = 'desk-award',
  voidsEntryId: string | null = null,
): LedgerRecord {
  return {
    id,
    tournamentId: 'event-1',
    teamId,
    matchId: null,
    kind,
    points,
    reason: 'Test ledger entry',
    voidsEntryId,
    createdAt: '2026-10-14T09:00:00.000Z',
  };
}
