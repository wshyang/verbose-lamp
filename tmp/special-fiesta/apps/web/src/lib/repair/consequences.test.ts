import { describe, expect, it } from 'vitest';
import {
  liveMatchWarning,
  moveConsequence,
  removalConsequence,
  withdrawalNotice,
} from './consequences.js';
import type { TeamRepairContext, WithdrawalView } from '../api/admin.js';

/**
 * ADR-154 — the sentences are the feature, so they are tested as sentences.
 *
 * Each of these is the whole of what a superadmin is told before an irreversible action, and
 * two of them describe consequences that are invisible from the screen they are standing on.
 */

const context = (over: Partial<TeamRepairContext> = {}): TeamRepairContext => ({
  teamName: 'Dune Dogs',
  memberCount: 4,
  liveMatchCourtName: null,
  ...over,
});

const withdrawal = (over: Partial<WithdrawalView> = {}): WithdrawalView => ({
  playedCount: 0,
  skippedCount: 0,
  affectedTeamIds: [],
  ...over,
});

describe('§3 — the live-match warning', () => {
  it('names the court and the cost, because the cost is invisible from the row', async () => {
    const warning = liveMatchWarning(context({ liveMatchCourtName: 'Court 2' }), 'Priya');

    expect(warning).toBe(
      'Dune Dogs are on Court 2 right now. If you move Priya before that match is completed, ' +
        'they will not be credited for it.',
    );
  });

  /*
   * Absent, not empty. A caller that rendered `''` would leave a blank warning line on screen
   * for the common case, and a reader learns to ignore a line that is usually empty.
   */
  it('says nothing at all when the team is not on court', async () => {
    expect(liveMatchWarning(context(), 'Priya')).toBeNull();
  });
});

describe('§6 — the captain cascade, named before it happens', () => {
  it('warns that removing the only member disbands the team and clears its fixtures', async () => {
    expect(removalConsequence(context({ memberCount: 1 }), 'Sam')).toBe(
      'Sam is the only member. Removing them disbands Dune Dogs, and any of their unplayed ' +
        'fixtures will be removed from the schedule.',
    );
  });

  it('says only what happens when there are survivors to promote', async () => {
    expect(removalConsequence(context({ memberCount: 3 }), 'Sam')).toBe(
      'Sam will be removed from Dune Dogs.',
    );
  });
});

describe('a move that empties a team is a withdrawal, and says so', () => {
  it('warns when the mover is the last member', async () => {
    expect(moveConsequence(context({ memberCount: 1 }), 'Priya', 'Reef Raiders')).toContain(
      'also disbands Dune Dogs',
    );
  });

  it('stays a plain move when somebody is left behind', async () => {
    expect(moveConsequence(context({ memberCount: 2 }), 'Priya', 'Reef Raiders')).toBe(
      'Priya will be moved to Reef Raiders.',
    );
  });
});

describe('§7 — what the withdrawal did to everybody else', () => {
  const nameOf = (id: string) => (id === 'kelp' ? 'Kelp Kings' : 'Tide Turners');

  /*
   * The asymmetry is the cost of skipping rather than awarding walkovers, and the console
   * states it rather than hiding it: somebody really does play fewer matches than their
   * neighbours, and they should hear it from the console and not from the bracket.
   */
  it('reports the played results standing and the opponents left short', async () => {
    const notice = withdrawalNotice(
      withdrawal({ playedCount: 2, skippedCount: 1, affectedTeamIds: ['kelp'] }),
      'Dune Dogs',
      nameOf,
    );

    expect(notice).toBe(
      'Dune Dogs withdrew. 2 of their 3 fixtures had been played; those results stand. ' +
        'The remaining 1 has been removed, so Kelp Kings play fewer group matches.',
    );
  });

  it('names each affected opponent once, however many fixtures they lost', async () => {
    const notice = withdrawalNotice(
      withdrawal({ skippedCount: 2, affectedTeamIds: ['kelp', 'kelp'] }),
      'Dune Dogs',
      nameOf,
    );

    expect(notice).toBe(
      'Dune Dogs withdrew. The remaining 2 have been removed, so Kelp Kings play fewer group matches.',
    );
  });

  it('drops the played clause when nothing had been played', async () => {
    const notice = withdrawalNotice(
      withdrawal({ skippedCount: 1, affectedTeamIds: ['kelp'] }),
      'Dune Dogs',
      nameOf,
    );

    expect(notice).not.toContain('had been played');
  });

  it('reports a withdrawal whose fixtures had ALL been played', async () => {
    expect(withdrawalNotice(withdrawal({ playedCount: 3 }), 'Dune Dogs', nameOf)).toBe(
      'Dune Dogs withdrew. 3 of their 3 fixtures had been played; those results stand.',
    );
  });

  // Nothing was scheduled, so there is nothing to say. "No fixtures were affected" is noise
  // on a screen whose whole job is to surface the things that are not obvious.
  it('says nothing when the team had no fixtures at all', async () => {
    expect(withdrawalNotice(withdrawal(), 'Dune Dogs', nameOf)).toBeNull();
  });
});
