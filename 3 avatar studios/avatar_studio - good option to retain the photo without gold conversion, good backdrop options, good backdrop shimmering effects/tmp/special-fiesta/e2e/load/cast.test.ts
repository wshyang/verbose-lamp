import { describe, expect, it } from 'vitest';
import { expectedUpSoon, JOIN_SLACK_MS, parseBeatLine, readyLineOf } from './cast.js';

/**
 * ADR-350 — cast mode's pure half: the stdin protocol and the expectation maths. The
 * protocol is a contract between the spec and the engine, and contracts get tests; the
 * expectations are the numbers the report prints, so a wrong one is a wrong claim.
 */

describe('parseBeatLine — the spec-to-engine contract', () => {
  it('takes the three beat shapes, refusing anything else by name', () => {
    expect(parseBeatLine('{"kind":"announcement","beatId":"a1","nonce":"r1a2b3:a1","t0":1000}')).toEqual({
      kind: 'announcement',
      beatId: 'a1',
      nonce: 'r1a2b3:a1',
      t0: 1_000,
    });
    expect(parseBeatLine('{"kind":"match-result","beatId":"m1","t0":1000}')).toEqual({
      kind: 'match-result',
      beatId: 'm1',
      t0: 1_000,
    });
    expect(parseBeatLine('{"kind":"chat-burst","beatId":"c1","at":"2026-10-23T10:00:02.000Z","t0":1000}')).toEqual({
      kind: 'chat-burst',
      beatId: 'c1',
      at: '2026-10-23T10:00:02.000Z',
      t0: 1_000,
    });
    expect(() => parseBeatLine('not json')).toThrow(/not JSON/);
    expect(() => parseBeatLine('{"kind":"scan"}')).toThrow(/not a valid beat/);
    expect(() => parseBeatLine('{"kind":"announcement","beatId":"a1","nonce":"n","t0":-5}')).toThrow(/not a valid beat/);
    // A missing `at` on a chat burst is a lost join, not a default.
    expect(() => parseBeatLine('{"kind":"chat-burst","beatId":"c1","t0":1000}')).toThrow(/not a valid beat/);
  });
});

describe('readyLineOf — the one stdout line', () => {
  it('carries the run id, the population, the teams, and the artifacts directory', () => {
    const line = readyLineOf({ runId: 'r1a2b3c4', users: 25, teams: ['ld_r1a2b3_t0'], outDir: '/tmp/out' });
    expect(line).toEqual({
      ready: true,
      runId: 'r1a2b3c4',
      users: 25,
      teams: ['ld_r1a2b3_t0'],
      outDir: '/tmp/out',
    });
  });
});

describe('expectedUpSoon — the window the watcher owes (ADR-121/282)', () => {
  const teamNames = ['ld_r1a2b3_t0', 'ld_r1a2b3_t1', 'ld_r1a2b3_t2'];
  const t0 = 100_000;
  const users = [
    { userId: 1, teamIndex: 0, joinAtMs: 5_000, admitAt: 0 }, // front team, joined long before t0
    { userId: 2, teamIndex: 1, joinAtMs: 5_000, admitAt: 0 }, // front team, joined long before t0
    { userId: 3, teamIndex: 2, joinAtMs: 5_000, admitAt: 0 }, // NOT in the front — owes nothing here
    { userId: 4, teamIndex: null, joinAtMs: null, admitAt: 0 }, // no team at all
    // A join still in flight at t0: admitted late, the join due just before t0 — its latest
    // plausible landing (at + slack) is past t0, so the watcher owed it nothing.
    { userId: 5, teamIndex: 0, joinAtMs: 95_000, admitAt: 500 },
    // A join that had not even left the phone: excluded by the slack.
    { userId: 6, teamIndex: 0, joinAtMs: 99_999, admitAt: 1_000 },
    // A late-but-landed join: at + slack is still before t0, so it counts.
    { userId: 7, teamIndex: 1, joinAtMs: 94_000, admitAt: 0 },
  ];

  it('counts the members of the first depth rows whose joins had landed', () => {
    const front = [
      { teamAName: 'ld_r1a2b3_t0', teamBName: 'ld_r1a2b3_t1' },
      { teamAName: 'ld_r1a2b3_t2', teamBName: 'Winner of #3' },
    ];
    // depth 1 (one court): only the front row counts — its landed members are users 1, 2 and 7.
    expect(expectedUpSoon({ front, teamNames, users, depth: 1, t0 })).toBe(3);
    // depth 2: the second row's team counts too (user 3).
    expect(expectedUpSoon({ front, teamNames, users, depth: 2, t0 })).toBe(4);
  });

  it('treats a null seat and an alien name as nobody, and depth as at least one', () => {
    const front = [{ teamAName: null, teamBName: 'Winner of #2' }];
    expect(expectedUpSoon({ front, teamNames, users, depth: 1, t0 })).toBe(0);
    expect(expectedUpSoon({ front: [], teamNames, users, depth: 0, t0 })).toBe(0);
  });

  it('excludes joins inside the flight slack — the watcher owed them nothing at t0', () => {
    expect(JOIN_SLACK_MS).toBe(5_000);
    // users 1, 2 and 7 landed; user 5's latest plausible landing (500 + 95_000 + 5_000) is past
    // t0; user 6 never left the phone.
    expect(
      expectedUpSoon({ front: [{ teamAName: 'ld_r1a2b3_t0', teamBName: 'ld_r1a2b3_t1' }], teamNames, users, depth: 1, t0 }),
    ).toBe(3);
  });
});
