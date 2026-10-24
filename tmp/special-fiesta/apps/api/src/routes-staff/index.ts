import { messages, resetPinRequestSchema, scanNumberSchema } from '@psd/contracts';
import { Hono } from 'hono';
import {
  findParticipantByNickname,
  findParticipantByScanNumber,
  listParticipants,
  resetParticipantPin,
} from '../db/entities/index.js';
import { badRequest, notFound, readBody, requireParam } from '../lib/http.js';
import { requireStaff, type AppBindings } from '../lib/session.js';
import { participantView } from '../views/participants.js';

/**
 * S33 + S56 — fds.md §9.3 authorises BOTH facilitators and superadmins to reset a participant
 * PIN, and nobody else. Keeping the two paths on one route means one guard, one test row in
 * the authorization matrix, and no chance of the two implementations drifting.
 */
export function staffRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.get('/participants', async (c) => {
    requireStaff(c);
    const rows = await listParticipants(c.get('db'), { search: c.req.query('search') });
    const items = rows.map((row) => ({
      participant: participantView(row),
      teamName: row.teamName,
    }));
    return c.json({ items });
  });

  routes.get('/participants/by-nickname/:nickname', async (c) => {
    requireStaff(c);
    const participant = await findParticipantByNickname(c.get('db'), requireParam(c, 'nickname'));
    if (!participant) throw notFound(messages.nicknameNotFound);
    return c.json({ participant: participantView(participant) });
  });

  /**
   * ADR-088 — the manual-entry lookup, `by-nickname`'s exact naming mirror. Staff-only is also
   * the enumeration control: the space is only 10,000 wide, so an unauthenticated walk of it
   * would read out the roster.
   */
  routes.get('/participants/by-number/:number', async (c) => {
    requireStaff(c);
    const parsed = scanNumberSchema.safeParse(requireParam(c, 'number'));
    if (!parsed.success) throw badRequest(messages.scanNumberInvalid, 'number');
    const participant = await findParticipantByScanNumber(c.get('db'), parsed.data);
    if (!participant) throw notFound(messages.scanNumberNotFound);
    return c.json({ participant: participantView(participant) });
  });

  routes.put('/participants/:participantId/pin', async (c) => {
    requireStaff(c);
    const body = await readBody(c, resetPinRequestSchema);
    const updated = await resetParticipantPin(c.get('db'), {
      participantId: requireParam(c, 'participantId'),
      pin: body.pin,
    });
    if (!updated) throw notFound(messages.participantNotFound);
    return c.json({ participant: participantView(updated) });
  });

  return routes;
}
