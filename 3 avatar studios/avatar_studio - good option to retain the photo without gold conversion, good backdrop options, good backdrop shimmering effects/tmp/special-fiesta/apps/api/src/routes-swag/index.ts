import { SCAN_UNDO_WINDOW_SECONDS, createSwagClaimRequestSchema, messages } from '@psd/contracts';
import { Hono } from 'hono';
import {
  advanceSwagRound,
  createSwagClaim,
  endSwagRound,
  findCurrentSwagRound,
  findParticipantByNickname,
  findSwagClaimById,
  findSwagRoundById,
  findSwagStationById,
  listSwagClaimsForRound,
  listSwagStations,
  openSwagRound,
  requireSwagRoundRecord,
  undoSwagClaimAtStation,
} from '../db/entities/index.js';
import { badRequest, conflict, forbidden, notFound, readBody, requireParam } from '../lib/http.js';
import { requireFacilitator, type AppBindings, type AppContext } from '../lib/session.js';
import { required } from '../db/rows.js';
import { swagClaimView, swagRoundView, swagStationView } from '../views/swag.js';

/**
 * ADR-110 — the swag counter console: the fringe station's twin (S25–S31 shapes), with
 * allowance instead of points. Facilitator-only throughout: handing out a tote bag is a
 * staff act exactly like awarding a scan.
 */
export function swagRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  registerSwagReads(routes);
  registerSwagRoundActions(routes);
  routes.post('/claims', async (c) => {
    const actor = requireFacilitator(c);
    const body = await readBody(c, createSwagClaimRequestSchema);
    return recordClaim(c, {
      body,
      facilitatorId: actor.facilitator.id,
      username: actor.facilitator.username,
    });
  });
  registerClaimUndo(routes);
  return routes;
}

/**
 * ADR-159 (mirrors ADR-138 F1) — take back the handout this counter just made.
 *
 * The same pair of refusals, told apart for the same reason: a claim that was never this
 * counter's is a different mistake from one that was and is now too old, and only the second
 * has a remedy the facilitator can act on ("a superadmin can still void it"). The window
 * itself is decided inside the UPDATE, never here.
 *
 * Deliberately NOT written to the void audit ledger. ADR-138 settled that question for the
 * fringe twin: a station correcting itself inside ten seconds is not a superadmin reversing a
 * recorded fact, and collapsing the two would make the audit a log of ordinary clumsiness.
 * `undone_at` is where this one is recorded.
 */
function registerClaimUndo(routes: Hono<AppBindings>): void {
  routes.post('/claims/:claimId/undo', async (c) => {
    const actor = requireFacilitator(c);
    const db = c.get('db');
    const claimId = requireParam(c, 'claimId');
    const claim = await findSwagClaimById(db, claimId);
    if (!claim) throw notFound(messages.swagClaimNotFound);
    if (claim.facilitatorId !== actor.facilitator.id) throw forbidden(messages.swagUndoNotYours);
    const undone = await undoSwagClaimAtStation(db, {
      claimId,
      facilitatorId: actor.facilitator.id,
      windowSeconds: SCAN_UNDO_WINDOW_SECONDS,
    });
    // Null means the statement matched nothing: window closed, already voided, or raced.
    if (!undone) throw conflict(messages.swagUndoExpired);
    return c.json({ claim: swagClaimView({ ...claim, ...undone }) });
  });
}

function registerSwagReads(routes: Hono<AppBindings>): void {
  routes.get('/stations', async (c) => {
    requireFacilitator(c);
    const stations = await listSwagStations(c.get('db'));
    const items = await Promise.all(
      stations.map(async (station) =>
        swagStationView(station, await findCurrentSwagRound(c.get('db'), station.id)),
      ),
    );
    return c.json({ items });
  });

  routes.get('/stations/:stationId', async (c) => {
    requireFacilitator(c);
    const station = await findSwagStationById(c.get('db'), requireParam(c, 'stationId'));
    if (!station) throw notFound(messages.swagStationNotFound);
    const round = await findCurrentSwagRound(c.get('db'), station.id);
    return c.json({ station: swagStationView(station, round) });
  });

  routes.get('/rounds/:roundId/claims', async (c) => {
    requireFacilitator(c);
    const round = await findSwagRoundById(c.get('db'), requireParam(c, 'roundId'));
    if (!round) throw notFound(messages.roundNotFound);
    const claims = await listSwagClaimsForRound(c.get('db'), round.id);
    return c.json({ items: claims.map(swagClaimView) });
  });

}

function registerSwagRoundActions(routes: Hono<AppBindings>): void {
  routes.post('/stations/:stationId/rounds', async (c) => {
    const actor = requireFacilitator(c);
    const station = await findSwagStationById(c.get('db'), requireParam(c, 'stationId'));
    if (!station) throw notFound(messages.swagStationNotFound);
    if (!station.isActive) throw badRequest(messages.swagStationInactive);
    if (await findCurrentSwagRound(c.get('db'), station.id)) {
      throw badRequest(messages.singleActiveRound);
    }
    const round = await openSwagRound(c.get('db'), {
      stationId: station.id,
      facilitatorId: actor.facilitator.id,
    });
    return c.json({ round: swagRoundView(await requireSwagRoundRecord(c.get('db'), round.id)) }, 201);
  });

  routes.post('/rounds/:roundId/advance', async (c) => {
    const actor = requireFacilitator(c);
    const round = await findSwagRoundById(c.get('db'), requireParam(c, 'roundId'));
    if (!round) throw notFound(messages.roundNotFound);
    if (round.status !== 'open') throw badRequest(messages.invalidStatusTransition);
    const next = await advanceSwagRound(c.get('db'), { round, facilitatorId: actor.facilitator.id });
    return c.json({ round: swagRoundView(await requireSwagRoundRecord(c.get('db'), next.id)) }, 201);
  });

  routes.post('/rounds/:roundId/end', async (c) => {
    requireFacilitator(c);
    const round = await findSwagRoundById(c.get('db'), requireParam(c, 'roundId'));
    if (!round) throw notFound(messages.roundNotFound);
    const ended = await endSwagRound(c.get('db'), round.id);
    if (!ended) throw badRequest(messages.invalidStatusTransition);
    return c.json({ round: swagRoundView(await requireSwagRoundRecord(c.get('db'), ended.id)) });
  });
}

interface RecordClaimInput {
  body: {
    nickname: string;
    roundId: string;
    itemLabel: string;
    clientClaimUuid: string;
  };
  facilitatorId: string;
  username: string;
}

async function recordClaim(c: AppContext, input: RecordClaimInput) {
  const db = c.get('db');
  const participant = await findParticipantByNickname(db, input.body.nickname);
  if (!participant) throw notFound(messages.nicknameNotFound);
  const round = await findSwagRoundById(db, input.body.roundId);
  if (!round) throw notFound(messages.roundNotFound);
  const station = required(await findSwagStationById(db, round.stationId), 'Swag station');
  // The server resolves the label against the station's current list — the item list is
  // the integrity boundary, exactly as the tier list is for scans (ADR-092).
  const item = station.items.find((entry) => entry.label === input.body.itemLabel);
  if (!item) throw badRequest(messages.swagItemNotFound, 'itemLabel');
  const outcome = await createSwagClaim(db, {
    participantId: participant.id,
    roundId: round.id,
    stationId: station.id,
    facilitatorId: input.facilitatorId,
    stationNameSnapshot: station.stationName,
    roundNumberSnapshot: round.roundNumber,
    itemLabelSnapshot: item.label,
    itemLimit: item.limit,
    facilitatorUsernameSnapshot: input.username,
    clientClaimUuid: input.body.clientClaimUuid,
  });
  if (outcome.kind === 'limit_reached') throw conflict(messages.swagLimitReached);
  const withParty = {
    ...outcome.claim,
    participantNickname: participant.nickname,
    clusterCode: participant.clusterCode,
  };
  return c.json(
    { claim: swagClaimView(withParty), duplicate: outcome.kind === 'duplicate' },
    outcome.kind === 'duplicate' ? 200 : 201,
  );
}
