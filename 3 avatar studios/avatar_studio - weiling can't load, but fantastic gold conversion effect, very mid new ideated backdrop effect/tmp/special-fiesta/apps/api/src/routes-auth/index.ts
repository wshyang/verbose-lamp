import {
  messages,
  participantSignInRequestSchema,
  signUpRequestSchema,
  staffSignInRequestSchema,
} from '@psd/contracts';
import { Hono } from 'hono';
import { assertClusterUsable } from '../lib/clusterGuards.js';
import {
  createParticipant,
  findFacilitatorByUsername,
  findParticipantByNickname,
  findSuperadminByUsername,
  resolveStationLabel,
  touchFacilitatorLogin,
  touchSuperadminLogin,
} from '../db/entities/index.js';
import { HttpError, conflict, readBody, unauthorized } from '../lib/http.js';
import { signInThrottle, type ThrottleKind } from '../lib/signInThrottle.js';
import { uniqueViolationOf } from '../db/violations.js';
import {
  endSession,
  requireAnyActor,
  startSession,
  type AppBindings,
  type AppContext,
} from '../lib/session.js';
import { participantView } from '../views/participants.js';
import { sessionView } from './sessionView.js';

/** F1/F2/F18/F32 — sign up, sign in, resume, sign out for all three actor types. */
export function authRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.post('/participants/signup', async (c) => {
    const body = await readBody(c, signUpRequestSchema);
    /*
     * ADR-172 — the catalogue is editable, so the cluster has to be checked against it. The
     * schema can only vouch for the shape now: it was a `z.enum` of sixteen literals, and a
     * string that merely looks like a code is not evidence the cluster exists or is still open.
     * The foreign key would catch an invented one as a 500; this makes it the 400 it is.
     */
    await assertClusterUsable(c, body.clusterCode);
    // The friendly fast path; the constraint catch below is what actually closes the race.
    const taken = await findParticipantByNickname(c.get('db'), body.nickname);
    if (taken) throw conflict(messages.nicknameInvalid, 'nickname');
    let participant;
    try {
      participant = await createParticipant(c.get('db'), body);
    } catch (error) {
      /*
       * ADR-088 — two signups can pass the check above together; the nickname unique index
       * picks the winner and the loser belongs here as a 409, not a 500. Scan-number
       * collisions never surface: createParticipant retries those internally.
       */
      if (uniqueViolationOf(error) === 'ux_participant_nickname_lower') {
        throw conflict(messages.nicknameInvalid, 'nickname');
      }
      throw error;
    }
    const sessionToken = await startSession(c, { actorType: 'participant', actorId: participant.id });
    return c.json({ participant: participantView(participant), sessionToken }, 201);
  });

  routes.post('/participants/signin', async (c) => {
    const body = await readBody(c, participantSignInRequestSchema);
    refuseWhenBlocked('participant', body.nickname);
    const participant = await findParticipantByNickname(c.get('db'), body.nickname);
    if (!participant || participant.pin !== body.pin) {
      signInThrottle().recordFailure('participant', body.nickname);
      throw unauthorized(messages.signInRejected);
    }
    const sessionToken = await startSession(c, { actorType: 'participant', actorId: participant.id });
    return c.json({ participant: participantView(participant), sessionToken });
  });

  routes.post('/facilitators/signin', (c) => signInFacilitator(c));
  routes.post('/superadmins/signin', (c) => signInSuperadmin(c));

  routes.get('/session', async (c) => {
    const actor = requireAnyActor(c);
    return c.json(await buildSessionResponse(c, actor));
  });

  routes.post('/signout', async (c) => {
    await endSession(c);
    return c.json({ ok: true });
  });

  return routes;
}

/** ADR-324 — checked before the account is even looked up, so a blocked guess costs no query and cannot succeed. */
function refuseWhenBlocked(kind: ThrottleKind, name: string): void {
  if (signInThrottle().isBlocked(kind, name)) throw new HttpError(429, messages.signInThrottled);
}

async function signInFacilitator(c: AppContext) {
  const body = await readBody(c, staffSignInRequestSchema);
  refuseWhenBlocked('staff', `facilitator:${body.username}`);
  const facilitator = await findFacilitatorByUsername(c.get('db'), body.username);
  if (!facilitator || facilitator.passcode !== body.passcode) {
    signInThrottle().recordFailure('staff', `facilitator:${body.username}`);
    throw unauthorized(messages.credentialsRejected);
  }
  await touchFacilitatorLogin(c.get('db'), facilitator.id);
  const sessionToken = await startSession(c, { actorType: 'facilitator', actorId: facilitator.id });
  return c.json({
    facilitator: { id: facilitator.id, username: facilitator.username },
    sessionToken,
  });
}

async function signInSuperadmin(c: AppContext) {
  const body = await readBody(c, staffSignInRequestSchema);
  refuseWhenBlocked('staff', `superadmin:${body.username}`);
  const superadmin = await findSuperadminByUsername(c.get('db'), body.username);
  if (!superadmin || superadmin.passcode !== body.passcode) {
    signInThrottle().recordFailure('staff', `superadmin:${body.username}`);
    throw unauthorized(messages.credentialsRejected);
  }
  await touchSuperadminLogin(c.get('db'), superadmin.id);
  const sessionToken = await startSession(c, { actorType: 'superadmin', actorId: superadmin.id });
  return c.json({
    superadmin: { id: superadmin.id, username: superadmin.username },
    sessionToken,
  });
}

async function buildSessionResponse(c: AppContext, actor: ReturnType<typeof requireAnyActor>) {
  if (actor.type !== 'facilitator') return sessionView({ actor, stationLabel: null });
  const stationLabel = await resolveStationLabel(c.get('db'), {
    type: actor.facilitator.defaultStationType,
    id: actor.facilitator.defaultStationId,
  });
  return sessionView({ actor, stationLabel });
}
