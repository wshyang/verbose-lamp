import { messages } from '@psd/contracts';
import type { ClusterAdminView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  jsonRequest,
  seedFringeReady,
  withMethod,
  type ActorSession,
  type TestContext,
} from './harness.js';

/**
 * ADR-172 — the editable cluster catalogue (S44).
 *
 * The rules worth testing are the refusals, because each one guards damage that is silent at
 * the moment it is done: a retired cluster still being offered at signup, a cluster retired out
 * from under its members, and a reassignment that quietly rewrites the leaderboard.
 */

interface ErrorBody {
  error: { message: string; field?: string };
}

interface ClusterList {
  items: ClusterAdminView[];
  scoringStarted: boolean;
}

describe('ADR-172 — the cluster catalogue', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const asAdmin = () => ({ headers: superadmin.headers });

  async function listClusters(): Promise<ClusterList> {
    const response = await ctx.app.request('/api/admin/clusters', asAdmin());
    expect(response.status).toBe(200);
    return ctx.json<ClusterList>(response);
  }

  async function findCluster(code: string): Promise<ClusterAdminView | undefined> {
    const { items } = await listClusters();
    return items.find((item) => item.code === code);
  }

  async function addCluster(code: string, displayName = code) {
    return ctx.app.request(
      '/api/admin/clusters',
      jsonRequest({ code, displayName }, superadmin.headers),
    );
  }

  async function retire(code: string) {
    return ctx.app.request(
      `/api/admin/clusters/${encodeURIComponent(code)}/retire`,
      jsonRequest({}, superadmin.headers),
    );
  }

  it('seeds the catalogue and reports that nothing has been scored yet', async () => {
    const { items, scoringStarted } = await listClusters();
    expect(items.length).toBeGreaterThanOrEqual(16);
    expect(scoringStarted).toBe(false);
    // Every seeded cluster starts open, or signup would have nothing to offer.
    expect(items.every((item) => !item.isRetired)).toBe(true);
  });

  it('adds a cluster, and signup offers it immediately', async () => {
    const code = `New${ctx.runId}`;

    /*
     * Prime the cache FIRST. ADR-038 holds this list for a minute, so the staleness only exists
     * if something populated it before the edit — which is exactly what a signup queue does.
     *
     * The first version of this test added the cluster and then read, and a sabotage that
     * removed the invalidation entirely still passed it: there was no cached entry to go stale.
     * A test for a cache has to put something in the cache.
     */
    const primed = await ctx.app.request('/api/clusters');
    const before = await ctx.json<{ items: { code: string }[] }>(primed);
    expect(before.items.map((item) => item.code)).not.toContain(code);

    const created = await addCluster(code, 'Newly Formed');
    expect(created.status).toBe(201);

    const offered = await ctx.app.request('/api/clusters');
    const { items } = await ctx.json<{ items: { code: string; displayName: string }[] }>(offered);
    expect(items.map((item) => item.code)).toContain(code);

    // And a participant can actually join it, which is the only proof that matters.
    const joined = await ctx.signUpParticipant({ clusterCode: code });
    expect(joined.clusterCode).toBe(code);
  });

  it('refuses a duplicate code, however it is spelled', async () => {
    const code = `Dup${ctx.runId}`;
    expect((await addCluster(code)).status).toBe(201);

    const again = await addCluster(code.toUpperCase());
    expect(again.status).toBe(409);
    const body = await ctx.json<ErrorBody>(again);
    expect(body.error.message).toBe(messages.clusterCodeTaken);
  });

  it('renames the label without disturbing the code anything references', async () => {
    const code = `Ren${ctx.runId}`;
    await addCluster(code, 'Before');
    const member = await ctx.signUpParticipant({ clusterCode: code });

    const renamed = await ctx.app.request(
      `/api/admin/clusters/${encodeURIComponent(code)}`,
      withMethod('PUT', { displayName: 'After' }, superadmin.headers),
    );
    expect(renamed.status).toBe(200);

    const after = await findCluster(code);
    expect(after?.displayName).toBe('After');
    // The participant is still in it: a rename moves a label, not a person.
    expect(after?.memberCount).toBe(1);

    const profile = await ctx.app.request('/api/me', { headers: member.headers });
    const { participant } = await ctx.json<{ participant: { clusterCode: string } }>(profile);
    expect(participant.clusterCode).toBe(code);
  });

  it('refuses to retire a cluster that still has members', async () => {
    const code = `Busy${ctx.runId}`;
    await addCluster(code);
    await ctx.signUpParticipant({ clusterCode: code });

    const refused = await retire(code);
    expect(refused.status).toBe(400);
    const body = await ctx.json<ErrorBody>(refused);
    expect(body.error.message).toBe(messages.clusterHasMembers);

    // Still open, and still offered — a refusal must not half-apply.
    expect((await findCluster(code))?.isRetired).toBe(false);
  });

  it('retires an empty cluster, and signup stops offering it', async () => {
    const code = `Gone${ctx.runId}`;
    await addCluster(code);

    // Prime again, so the retire has a populated cache to invalidate (see the note above).
    const primed = await ctx.app.request('/api/clusters');
    expect((await ctx.json<{ items: { code: string }[] }>(primed)).items.map((i) => i.code))
      .toContain(code);

    expect((await retire(code)).status).toBe(200);
    expect((await findCluster(code))?.isRetired).toBe(true);

    const offered = await ctx.app.request('/api/clusters');
    const { items } = await ctx.json<{ items: { code: string }[] }>(offered);
    expect(items.map((item) => item.code)).not.toContain(code);
  });

  it('refuses a signup into a retired cluster even when the code is spelled correctly', async () => {
    const code = `Shut${ctx.runId}`;
    await addCluster(code);
    await retire(code);

    /*
     * The schema cannot catch this: since ADR-172 it only checks the shape, and this code is a
     * perfectly well-formed one that happens to be closed. Without `assertClusterUsable` the
     * signup would succeed and quietly repopulate a retired cluster.
     */
    const response = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest({
        nickname: `shut_${ctx.runId}`,
        pin: '1234',
        clusterCode: code,
        gender: 'female',
        avatarVariant: 1,
        avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c',
      }),
    );
    expect(response.status).toBe(400);
    const body = await ctx.json<ErrorBody>(response);
    expect(body.error.message).toBe(messages.clusterRetired);
  });

  it('rejects a cluster code that never existed, as a 400 rather than a crash', async () => {
    const response = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest({
        nickname: `ghost_${ctx.runId}`,
        pin: '1234',
        clusterCode: 'NotACluster',
        gender: 'male',
        avatarVariant: 1,
        avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c',
      }),
    );
    // The foreign key would have made this a 500; the guard makes it the 400 it is.
    expect(response.status).toBe(400);
  });

  it('restores a retired cluster and offers it again', async () => {
    const code = `Back${ctx.runId}`;
    await addCluster(code);
    await retire(code);

    const restored = await ctx.app.request(
      `/api/admin/clusters/${encodeURIComponent(code)}/restore`,
      jsonRequest({}, superadmin.headers),
    );
    expect(restored.status).toBe(200);
    expect((await findCluster(code))?.isRetired).toBe(false);
  });

  it('moves every member out in one go, which is what makes retiring possible', async () => {
    const from = `From${ctx.runId}`;
    const to = `To${ctx.runId}`;
    await addCluster(from);
    await addCluster(to);
    await ctx.signUpParticipant({ clusterCode: from });
    await ctx.signUpParticipant({ clusterCode: from });

    const moved = await ctx.app.request(
      `/api/admin/clusters/${encodeURIComponent(from)}/reassign`,
      jsonRequest({ toClusterCode: to }, superadmin.headers),
    );
    expect(moved.status).toBe(200);
    expect((await ctx.json<{ moved: number }>(moved)).moved).toBe(2);

    expect((await findCluster(from))?.memberCount).toBe(0);
    expect((await findCluster(to))?.memberCount).toBe(2);

    // The point of the move: the cluster can now be retired.
    expect((await retire(from)).status).toBe(200);
  });

  it('refuses to move a cluster into itself, or into a retired one', async () => {
    const from = `Self${ctx.runId}`;
    const closed = `Closed${ctx.runId}`;
    await addCluster(from);
    await addCluster(closed);
    await retire(closed);
    await ctx.signUpParticipant({ clusterCode: from });

    const itself = await ctx.app.request(
      `/api/admin/clusters/${encodeURIComponent(from)}/reassign`,
      jsonRequest({ toClusterCode: from }, superadmin.headers),
    );
    expect(itself.status).toBe(400);
    expect((await ctx.json<ErrorBody>(itself)).error.message).toBe(messages.clusterSameTarget);

    const intoRetired = await ctx.app.request(
      `/api/admin/clusters/${encodeURIComponent(from)}/reassign`,
      jsonRequest({ toClusterCode: closed }, superadmin.headers),
    );
    expect(intoRetired.status).toBe(400);
    expect((await ctx.json<ErrorBody>(intoRetired)).error.message).toBe(messages.clusterRetired);
  });

  it('corrects one participant, which is the ordinary signup mistake', async () => {
    const from = `One${ctx.runId}`;
    const to = `Two${ctx.runId}`;
    await addCluster(from);
    await addCluster(to);
    const participant = await ctx.signUpParticipant({ clusterCode: from });

    const response = await ctx.app.request(
      `/api/admin/participants/${participant.id}/cluster`,
      withMethod('PUT', { toClusterCode: to }, superadmin.headers),
    );
    expect(response.status).toBe(200);
    const body = await ctx.json<{ participant: { clusterCode: string } }>(response);
    expect(body.participant.clusterCode).toBe(to);
    expect((await findCluster(from))?.memberCount).toBe(0);
  });

  it('refuses a cluster code that is only shaped right', async () => {
    const response = await ctx.app.request(
      '/api/admin/clusters',
      jsonRequest({ code: '!!!', displayName: 'Bad' }, superadmin.headers),
    );
    expect(response.status).toBe(400);
  });

  it('never exposes a delete route — a cluster is retired, never removed', async () => {
    const code = `NoDel${ctx.runId}`;
    await addCluster(code);
    const response = await ctx.app.request(
      `/api/admin/clusters/${encodeURIComponent(code)}`,
      withMethod('DELETE', undefined, superadmin.headers),
    );
    /*
     * Not a style point. `chat_message` and `gallery_photo` snapshot the code permanently, so a
     * delete could only succeed by orphaning or rewriting somebody's history.
     */
    expect(response.status).toBe(404);
  });
});

/**
 * ADR-172 — the freeze.
 *
 * Its own context because it has to score a point, and a scored point is not something the
 * tests above can be allowed to see: `scoringStarted` is global, so one scan would lock every
 * case in the suite that retires or moves anybody.
 *
 * This is the guard fds.md §9 was really asking for. The catalogue was immutable to stop the
 * leaderboard being gamed, and the operation that can game it is the move: a participant's
 * points are counted wherever they are now, so moving them after scoring rewrites the board
 * retroactively. Adding and renaming cannot do that, and stay open.
 */
describe('ADR-172 — once scoring has started', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function scoreSomething() {
    const fixture = await seedFringeReady(ctx);
    const scorer = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname: scorer.nickname,
          roundId: fixture.roundId,
          tierLabel: fixture.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        fixture.facilitator.headers,
      ),
    );
    expect(response.status).toBe(201);
  }

  it('locks retiring and moving, but still allows adding and renaming', async () => {
    const empty = `Lock${ctx.runId}`;
    const peopled = `Held${ctx.runId}`;
    const target = `Dest${ctx.runId}`;
    for (const code of [empty, peopled, target]) {
      const created = await ctx.app.request(
        '/api/admin/clusters',
        jsonRequest({ code, displayName: code }, superadmin.headers),
      );
      expect(created.status).toBe(201);
    }
    const moved = await ctx.signUpParticipant({ clusterCode: peopled });

    // Nothing is locked yet.
    const before = await ctx.app.request('/api/admin/clusters', { headers: superadmin.headers });
    expect((await ctx.json<ClusterList>(before)).scoringStarted).toBe(false);

    await scoreSomething();

    const after = await ctx.app.request('/api/admin/clusters', { headers: superadmin.headers });
    expect((await ctx.json<ClusterList>(after)).scoringStarted).toBe(true);

    // Retiring: refused, even though this cluster is empty and would otherwise be retirable.
    const retired = await ctx.app.request(
      `/api/admin/clusters/${encodeURIComponent(empty)}/retire`,
      jsonRequest({}, superadmin.headers),
    );
    expect(retired.status).toBe(409);
    expect((await ctx.json<ErrorBody>(retired)).error.message).toBe(
      messages.clusterLockedByScoring,
    );

    // A bulk move: refused, because it would move points.
    const bulk = await ctx.app.request(
      `/api/admin/clusters/${encodeURIComponent(peopled)}/reassign`,
      jsonRequest({ toClusterCode: target }, superadmin.headers),
    );
    expect(bulk.status).toBe(409);

    // One participant: refused for the same reason. A single correction moves points too.
    const single = await ctx.app.request(
      `/api/admin/participants/${moved.id}/cluster`,
      withMethod('PUT', { toClusterCode: target }, superadmin.headers),
    );
    expect(single.status).toBe(409);

    // Adding still works: a new cluster starts at zero and cannot disturb a standing.
    const added = await ctx.app.request(
      '/api/admin/clusters',
      jsonRequest({ code: `Late${ctx.runId}`, displayName: 'Walked in late' }, superadmin.headers),
    );
    expect(added.status).toBe(201);

    // And renaming: the label moves, the code every table references does not.
    const renamed = await ctx.app.request(
      `/api/admin/clusters/${encodeURIComponent(empty)}`,
      withMethod('PUT', { displayName: 'Renamed mid-event' }, superadmin.headers),
    );
    expect(renamed.status).toBe(200);
  });
});
