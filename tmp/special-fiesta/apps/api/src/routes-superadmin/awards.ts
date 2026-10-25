import {
  awardBatchRequestSchema,
  messages,
  voidRequestSchema,
  type AwardBatchDetailView,
  type AwardBatchRequest,
} from '@psd/contracts';
import { Hono } from 'hono';
import {
  createAwardBatch,
  findActivityById,
  findParticipantById,
  findTeamById,
  findAwardBatch,
  listAwardBatches,
  listTeamAwards,
  reinstateAwardBatch,
  reverseAwardBatch,
  type NewParticipantAward,
  type NewTeamAward,
} from '../db/entities/index.js';
import { conflict, notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings, type AppContext } from '../lib/session.js';
import { awardBatchDetailView, awardBatchView, teamLedgerView } from './views.js';

/**
 * ADR-248 — the award batch: a superadmin's decision about the day, posted as one unit.
 *
 * Five routes and one write path. The write resolves every id the console named before anything is
 * inserted, so a batch either pays the people the operator meant or refuses with the field that was wrong —
 * never half of a day's awards. Reads are behind the same session as writes: the register names people and
 * amounts, and there is no audience for it that is not the desk. A batch with no rows in it is a
 * `label`, a `reason` and an author, which is the whole of what the header holds — the rows are the award,
 * so a refusal that left a header behind would be a ledger entry for a decision nobody made.
 */
const BATCH_PAGE = 50;

export function superadminAwardBatchRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  routes.get('/award-batches', async (c) => {
    requireSuperadmin(c);
    const batches = await listAwardBatches(c.get('db'), BATCH_PAGE);
    return c.json({ items: batches.map(awardBatchView) });
  });

  routes.post('/award-batches', async (c) => {
    const actor = requireSuperadmin(c);
    const body = await readBody(c, awardBatchRequestSchema);
    const subjects = await resolveSubjects(c, body);
    const written = await createAwardBatch(c.get('db'), {
      clientBatchUuid: body.clientBatchUuid,
      label: body.label,
      reason: body.reason,
      createdBySuperadminId: actor.superadmin.id,
      teams: subjects.teams,
      participants: subjects.participants,
    });
    if (written.outcome === 'conflict') throw conflict(messages.awardBatchReplayMismatch);
    // Two returns rather than one with a computed status, so the flag and the code cannot disagree: the
    // retry IS the 200 and the creation IS the 201, which is what the offline queue branches on.
    if (written.outcome === 'retry') return c.json({ batch: awardBatchDetailView(written.batch), replayed: true }, 200);
    return c.json({ batch: awardBatchDetailView(written.batch), replayed: false }, 201);
  });

  routes.get('/award-batches/:batchId', async (c) => c.json(await readBatch(c, requireParam(c, 'batchId'))));

  /*
   * The team's own ledger lives here rather than on the team surface, because the person who reads it is
   * the person who is being asked to explain an award. A team has no route that shows its points at all
   * today — the board is a per-participant and per-cluster read — so this is the one place the day's
   * awards can be looked at from the side that received them.
   */
  routes.get('/teams/:teamId/awards', async (c) => {
    requireSuperadmin(c);
    const teamId = requireParam(c, 'teamId');
    const team = await findTeamById(c.get('db'), teamId);
    if (team === null) throw notFound(messages.teamNotFound);
    return c.json({ teamId, ...teamLedgerView(await listTeamAwards(c.get('db'), teamId)) });
  });

  routes.post('/award-batches/:batchId/reverse', async (c) => await applyReversal(c, { action: 'reverse' }));
  routes.post('/award-batches/:batchId/reinstate', async (c) => await applyReversal(c, { action: 'reinstate' }));
  return routes;
}

async function readBatch(c: AppContext, batchId: string): Promise<{ batch: AwardBatchDetailView }> {
  requireSuperadmin(c);
  const record = await findAwardBatch(c.get('db'), batchId);
  if (record === null) throw notFound(messages.awardBatchNotFound);
  return { batch: awardBatchDetailView(record) };
}

/**
 * Taking a batch back and putting it back are one handler, because they are one act with a direction: both
 * need a reason, both refuse a batch that is already in the state asked for, and both answer with the
 * batch as it now reads. Same shape as the correction desk's void and unvoid (ADR-031).
 */
async function applyReversal(c: AppContext, input: { action: 'reverse' | 'reinstate' }): Promise<Response> {
  const actor = requireSuperadmin(c);
  const body = await readBody(c, voidRequestSchema);
  const batchId = requireParam(c, 'batchId');
  const stamped =
    input.action === 'reverse'
      ? await reverseAwardBatch(c.get('db'), { batchId, superadminId: actor.superadmin.id, reason: body.reason })
      : await reinstateAwardBatch(c.get('db'), { batchId, superadminId: actor.superadmin.id, reason: body.reason });
  if (stamped === 'no_batch') throw notFound(messages.awardBatchNotFound);
  if (stamped === 'already') {
    throw conflict(input.action === 'reverse' ? messages.awardBatchAlreadyReversed : messages.awardBatchNotReversed);
  }
  return c.json(await readBatch(c, batchId));
}

/**
 * The ids in the request become rows the ledgers can hold, and every lookup that fails is a 404 naming the
 * kind of thing that was not found. Nothing here is a policy question — the batch's own rules (who is in
 * the field, what the rows are worth) belong to the entity that writes them.
 */
async function resolveSubjects(
  c: AppContext,
  body: AwardBatchRequest,
): Promise<{ teams: NewTeamAward[]; participants: NewParticipantAward[] }> {
  const db = c.get('db');
  const teams: NewTeamAward[] = [];
  for (const row of body.teams) {
    const team = await findTeamById(db, row.teamId);
    if (team === null) throw notFound(messages.teamNotFound);
    teams.push({ teamId: row.teamId, points: row.points });
  }
  const participants: NewParticipantAward[] = [];
  for (const row of body.participants) {
    if ((await findParticipantById(db, row.participantId)) === null) throw notFound(messages.participantNotFound);
    const activity = await findActivityById(db, row.activityId);
    if (activity === null) throw notFound(messages.activityNotFound);
    participants.push({ ...row, activityNameSnapshot: activity.activityName });
  }
  return { teams, participants };
}
