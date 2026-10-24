import {
  PARTICIPATION_LABEL,
  SCAN_UNDO_WINDOW_SECONDS,
  createScanRequestSchema,
  messages,
} from '@psd/contracts';
import { Hono } from 'hono';
import {
  advanceRound,
  createScan,
  findPointConfig,
  replaceScan,
  endRound,
  findActivityById,
  findCurrentRound,
  findParticipantByNickname,
  findRoundById,
  findScanById,
  undoScanAtStation,
  requireRoundRecord,
  listActivities,
  listScansForRound,
  openRound,
  reactivateRound,
} from '../db/entities/index.js';
import { badRequest, conflict, forbidden, notFound, readBody, requireParam } from '../lib/http.js';
import { requireFacilitator, type AppBindings, type AppContext } from '../lib/session.js';
import { activityView, roundView, scanView } from '../views/fringe.js';
import { loadOpenableRound, loadStation } from './station.js';
import { required } from '../db/rows.js';

/** F26–F31, F51 — fringe stations, rounds and scanning (fds.md §7.3 / §7.8). */
export function fringeRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  registerActivityReads(routes);
  registerRoundActions(routes);
  registerScanActions(routes);
  return routes;
}

/** S20 station switcher, S25 station landing, S28 scan log. */
function registerActivityReads(routes: Hono<AppBindings>): void {
  routes.get('/activities', async (c) => {
    requireFacilitator(c);
    const activities = await listActivities(c.get('db'));
    const views = [];
    for (const activity of activities) {
      const currentRound = await findCurrentRound(c.get('db'), activity.id);
      views.push(activityView({ activity, currentRound }));
    }
    return c.json({ items: views });
  });

  routes.get('/activities/:activityId', async (c) => {
    requireFacilitator(c);
    const station = await loadStation(c, requireParam(c, 'activityId'));
    // ADR-116 — the station needs the day's participation floor to label its "Took part"
    // control and to price a queued participation scan while offline.
    return c.json({
      activity: activityView(station),
      participationPoints: await participationRate(c),
    });
  });

  // S28 current round scan log
  routes.get('/rounds/:roundId/scans', async (c) => {
    requireFacilitator(c);
    const round = await findRoundById(c.get('db'), requireParam(c, 'roundId'));
    if (!round) throw notFound(messages.roundNotFound);
    const scans = await listScansForRound(c.get('db'), round.id);
    return c.json({ items: scans.map(scanView) });
  });
}

/** F26, F28, F29, F30 — the FringeRound state machine (fds.md §3.3). */
function registerRoundActions(routes: Hono<AppBindings>): void {
  // F26 open round 1 (or the next round after a close)
  routes.post('/activities/:activityId/rounds', async (c) => {
    const actor = requireFacilitator(c);
    const station = await loadStation(c, requireParam(c, 'activityId'));
    if (!station.activity.isActive) throw badRequest(messages.activityInactive);
    if (station.currentRound) throw badRequest(messages.singleActiveRound);
    const round = await openRound(c.get('db'), {
      activityId: station.activity.id,
      facilitatorId: actor.facilitator.id,
    });
    return c.json({ round: roundView(await requireRoundRecord(c.get('db'), round.id)) }, 201);
  });

  // F28 advance — atomic close + open (fds.md §7.8)
  routes.post('/rounds/:roundId/advance', async (c) => {
    const actor = requireFacilitator(c);
    const round = await loadOpenableRound(c, requireParam(c, 'roundId'));
    if (round.status !== 'open') throw badRequest(messages.invalidStatusTransition);
    const next = await advanceRound(c.get('db'), {
      round,
      facilitatorId: actor.facilitator.id,
    });
    return c.json({ round: roundView(await requireRoundRecord(c.get('db'), next.id)) }, 201);
  });

  // F29 end for the day — reversible (DC-003)
  routes.post('/rounds/:roundId/end', async (c) => {
    requireFacilitator(c);
    const round = await loadOpenableRound(c, requireParam(c, 'roundId'));
    const ended = await endRound(c.get('db'), round.id);
    if (!ended) throw badRequest(messages.invalidStatusTransition);
    return c.json({ round: roundView(await requireRoundRecord(c.get('db'), ended.id)) });
  });

  // F30 reactivate
  routes.post('/rounds/:roundId/reactivate', async (c) => {
    requireFacilitator(c);
    const round = await loadOpenableRound(c, requireParam(c, 'roundId'));
    const reopened = await reactivateRound(c.get('db'), round.id);
    if (!reopened) throw badRequest(messages.invalidStatusTransition);
    return c.json({ round: roundView(await requireRoundRecord(c.get('db'), reopened.id)) });
  });

}

/** F27 scan — idempotent, offline-queue safe (ADR-009). */
function registerScanActions(routes: Hono<AppBindings>): void {
  routes.post('/scans', async (c) => {
    const actor = requireFacilitator(c);
    const body = await readBody(c, createScanRequestSchema);
    const result = await recordScan(c, { body, facilitator: actor.facilitator });
    return c.json(result, result.duplicate ? 200 : 201);
  });

  /**
   * ADR-138 (F1) — undo the award this station just made.
   *
   * Scoped to the facilitator who made it and to a ten-second window, both decided by the
   * single statement in `undoScanAtStation`. The refusals are deliberately told apart: a
   * scan that was never this station's is a different mistake from one that was, and is now
   * too old — and the second one has a remedy the facilitator can act on.
   */
  routes.post('/scans/:scanId/undo', async (c) => {
    const actor = requireFacilitator(c);
    const db = c.get('db');
    const scanId = requireParam(c, 'scanId');
    const scan = await findScanById(db, scanId);
    if (!scan) throw notFound(messages.notFound);
    if (scan.facilitatorId !== actor.facilitator.id) throw forbidden(messages.scanUndoNotYours);
    const undone = await undoScanAtStation(db, {
      scanId,
      facilitatorId: actor.facilitator.id,
      windowSeconds: SCAN_UNDO_WINDOW_SECONDS,
    });
    /*
     * Null means the statement matched nothing: the window has closed, or the scan was
     * already voided (by a superadmin, or by a second tap of this button). All three are the
     * same answer to the facilitator — it is not yours to take back any more.
     */
    if (!undone) throw conflict(messages.scanUndoExpired);
    return c.json({ scan: scanView({ ...undone, participantNickname: scan.participantNickname, clusterCode: scan.clusterCode }) });
  });
}

interface RecordScanInput {
  body: {
    nickname: string;
    roundId: string;
    tierLabel: string | null;
    replaceExisting?: boolean | undefined;
    clientScanUuid: string;
    clientTimestamp: string;
  };
  facilitator: { id: string; username: string };
}

/**
 * ADR-116 — the participation floor. `tierLabel: null` means the participant took part and did
 * not place, which the activity's own tier list may well have no way to express. Pricing it
 * from the day's config keeps the ADR-092 rule intact: the client names an award, the server
 * decides what it is worth.
 *
 * The floor falls back to a constant when no `point_config` row exists, because that row's
 * absence is the bootstrap gate for *match* creation (§4.2.7) and a fringe-only day must not
 * inherit it. Making people wait on tournament setup to score for turning up would reintroduce
 * the gap from the other side.
 */
const DEFAULT_PARTICIPATION_POINTS = 5;

export async function participationRate(c: AppContext): Promise<number> {
  const config = await findPointConfig(c.get('db'));
  return config?.fringeParticipationPoints ?? DEFAULT_PARTICIPATION_POINTS;
}

async function priceAward(
  c: AppContext,
  activity: { awardTiers: { label: string; points: number }[] },
  tierLabel: string | null,
): Promise<{ points: number; label: string }> {
  if (tierLabel === null) {
    return { points: await participationRate(c), label: PARTICIPATION_LABEL };
  }
  const tier = activity.awardTiers.find((entry) => entry.label === tierLabel);
  if (!tier) throw badRequest(messages.tierNotFound, 'tierLabel');
  return { points: tier.points, label: tier.label };
}

async function recordScan(c: AppContext, input: RecordScanInput) {
  const participant = await findParticipantByNickname(c.get('db'), input.body.nickname);
  if (!participant) throw notFound(messages.nicknameNotFound);
  // ADR-009: the client's round is authoritative at sync time, even if it has since closed.
  const round = await findRoundById(c.get('db'), input.body.roundId);
  if (!round) throw notFound(messages.roundNotFound);
  // fringe_round.activity_id is a foreign key, so the parent activity is always there.
  const activity = required(await findActivityById(c.get('db'), round.activityId), 'Activity');
  const award = await priceAward(c, activity, input.body.tierLabel);
  const write = {
    participantId: participant.id,
    roundId: round.id,
    activityId: activity.id,
    facilitatorId: input.facilitator.id,
    activityNameSnapshot: activity.activityName,
    roundNumberSnapshot: round.roundNumber,
    pointsAwardedSnapshot: award.points,
    tierLabelSnapshot: award.label,
    facilitatorUsernameSnapshot: input.facilitator.username,
    clientScanUuid: input.body.clientScanUuid,
    clientTimestamp: new Date(input.body.clientTimestamp),
  };
  const written = await writeScan({ c, write, replaceExisting: input.body.replaceExisting === true });
  return {
    duplicate: written.outcome === 'retry',
    scan: scanView({
      ...written.scan,
      participantNickname: participant.nickname,
      clusterCode: participant.clusterCode,
    }),
  };
}

/**
 * ADR-116 — a held slot is a 409, not a 200 over a discarded write. The facilitator sees what
 * is already there and decides; `replaceExisting` is them having decided.
 */
async function writeScan(input: {
  c: AppContext;
  write: NewScanWrite;
  replaceExisting: boolean;
}) {
  const { c, write } = input;
  const written = await createScan(c.get('db'), write);
  if (written.outcome !== 'conflict') return written;
  if (!input.replaceExisting) throw conflict(messages.scanSlotHeld, 'tierLabel');
  return replaceScan(c.get('db'), { ...write, replacedScanId: written.scan.id });
}

type NewScanWrite = Parameters<typeof createScan>[1];
