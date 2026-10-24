import { describe, expect, it } from 'vitest';
import { marshalPlan, newRunId, participantNickname, participantPlan } from './scripts.js';

describe('newRunId / participantNickname — the naming rules of a run', () => {
  it('produces nickname-safe run ids and run-tagged nicknames inside the schema limits', () => {
    for (let i = 0; i < 50; i += 1) {
      const runId = newRunId();
      expect(runId).toMatch(/^[a-z0-9]+$/);
      expect(runId.length).toBeGreaterThanOrEqual(8);
    }
    // ADR-088's rules, as the contracts state them: <= 20 chars, [A-Za-z0-9_], never all digits.
    for (const userId of [1, 9, 99, 999, 99_999]) {
      const nickname = participantNickname('m1abcz7k2', userId);
      expect(nickname).toMatch(/^ld_[a-z0-9]{6}_\d+$/);
      expect(nickname.length).toBeLessThanOrEqual(20);
      expect(nickname).toMatch(/^[A-Za-z0-9_]+$/);
      expect(nickname).toMatch(/\D/);
    }
  });
});

describe('participantPlan — the reproducibility contract', () => {
  it('is a pure function of (runId, userId): same inputs, deep-equal plans', () => {
    expect(participantPlan('runabc1234', 7)).toEqual(participantPlan('runabc1234', 7));
    expect(participantPlan('runabc1234', 7)).not.toEqual(participantPlan('runabc1234', 8));
    expect(participantPlan('runabc1234', 7)).not.toEqual(participantPlan('otherzzzz9', 7));
  });

  it('holds the prefix property: the plan of user #k never depends on how big the run is', () => {
    const before = participantPlan('runabc1234', 3);
    for (let k = 1; k <= 50; k += 1) participantPlan('runabc1234', k);
    expect(participantPlan('runabc1234', 3)).toEqual(before);
  });

  it('returns actions sorted by time, bounded to the horizon, with consistent stream choices', () => {
    const plan = participantPlan('runabc1234', 12, { durationMs: 120_000 });
    expect(plan.nickname).toBe(participantNickname('runabc1234', 12));
    const times = plan.actions.map((action) => action.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    for (const time of times) {
      expect(time).toBeGreaterThanOrEqual(0);
      expect(time).toBeLessThan(120_000);
    }
    // A plan that chats must open the chat stream; a plan that never joined a team never types.
    const chats = plan.actions.filter((action) => action.kind === 'chat');
    expect(chats.length > 0).toBe(plan.holdsChatStream);
    const typing = plan.actions.filter((action) => action.kind === 'team-typing');
    expect(typing.length > 0).toBe(plan.joinsTeam);
  });

  it('spreads the population across streams and teams — a crowd, not a clone army', () => {
    let chatters = 0;
    let joiners = 0;
    const N = 200;
    for (let k = 1; k <= N; k += 1) {
      const plan = participantPlan('runabc1234', k);
      if (plan.holdsChatStream) chatters += 1;
      if (plan.joinsTeam) joiners += 1;
    }
    expect(chatters).toBeGreaterThan(N * 0.3);
    expect(chatters).toBeLessThan(N * 0.7);
    expect(joiners).toBeGreaterThan(N * 0.3);
    expect(joiners).toBeLessThan(N * 0.7);
  });
});

describe('marshalPlan — scans and the deliberate idempotency re-POSTs', () => {
  it('is deterministic and seeded by (runId, marshalIndex)', () => {
    expect(marshalPlan({ runId: 'runabc1234', marshalIndex: 1, targetUserIds: [10, 11, 12] })).toEqual(
      marshalPlan({ runId: 'runabc1234', marshalIndex: 1, targetUserIds: [10, 11, 12] }),
    );
    expect(marshalPlan({ runId: 'runabc1234', marshalIndex: 1, targetUserIds: [10, 11, 12] })).not.toEqual(
      marshalPlan({ runId: 'runabc1234', marshalIndex: 2, targetUserIds: [10, 11, 12] }),
    );
  });

  it('re-POSTs every n-th scan under the SAME uuid and target — the idempotency path (plan §5)', () => {
    const scans = marshalPlan({ runId: 'runabc1234', marshalIndex: 1, targetUserIds: [10, 11, 12], duplicateEvery: 3, durationMs: 80_000 });
    expect(scans.length).toBeGreaterThanOrEqual(4);
    const duplicates = scans.filter((scan) => scan.duplicateOf !== null);
    expect(duplicates.length).toBeGreaterThanOrEqual(1);
    for (const duplicate of duplicates) {
      const original = scans.find((scan) => scan.clientScanUuid === duplicate.duplicateOf && scan !== duplicate);
      expect(original, 'a duplicate always has its original in the same plan').toBeDefined();
      expect(duplicate.atMs).toBeGreaterThan(original?.atMs ?? Number.POSITIVE_INFINITY);
      expect(duplicate.targetUserId).toBe(original?.targetUserId);
    }
    // Distinct scans carry distinct uuids, and they look like uuids.
    const uuids = new Set(scans.map((scan) => scan.clientScanUuid));
    expect(uuids.size).toBe(scans.length - duplicates.length);
    for (const scan of scans) expect(scan.clientScanUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns nothing to scan when there is nobody to scan', () => {
    expect(marshalPlan({ runId: 'runabc1234', marshalIndex: 1, targetUserIds: [] })).toEqual([]);
  });
});
