import {
  createFacilitatorRequestSchema,
  createSuperadminRequestSchema,
  editFacilitatorRequestSchema,
  editSuperadminPasscodeRequestSchema,
  messages,
} from '@psd/contracts';
import { Hono } from 'hono';
import {
  createFacilitator,
  createSuperadmin,
  findFacilitatorById,
  findFacilitatorByUsername,
  findSuperadminById,
  findSuperadminByUsername,
  listFacilitators,
  listSuperadmins,
  updateFacilitator,
  updateSuperadminPasscode,
} from '../db/entities/index.js';
import { conflict, notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings, type AppContext } from '../lib/session.js';
import { facilitatorView, superadminView } from './views.js';
import { required } from '../db/rows.js';

/**
 * F39, F40 and the superadmin account surfaces (S44–S46, S57–S59).
 * F41 (delete facilitator) is intentionally absent: accounts persist so audit FKs stay valid.
 */
export function superadminAccountRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.get('/facilitators', async (c) => {
    requireSuperadmin(c);
    const facilitators = await listFacilitators(c.get('db'));
    return c.json({ items: facilitators.map(facilitatorView) });
  });

  routes.post('/facilitators', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, createFacilitatorRequestSchema);
    const taken = await findFacilitatorByUsername(c.get('db'), body.username);
    if (taken) throw conflict(messages.usernameTaken, 'username');
    const created = await createFacilitator(c.get('db'), body);
    return c.json({ facilitator: await readFacilitatorView(c, created.id) }, 201);
  });

  routes.put('/facilitators/:facilitatorId', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, editFacilitatorRequestSchema);
    const facilitatorId = requireParam(c, 'facilitatorId');
    const existing = await findFacilitatorById(c.get('db'), facilitatorId);
    if (!existing) throw notFound(messages.facilitatorNotFound);
    await updateFacilitator(c.get('db'), { ...body, facilitatorId });
    return c.json({ facilitator: await readFacilitatorView(c, facilitatorId) });
  });

  routes.get('/superadmins', async (c) => {
    requireSuperadmin(c);
    const superadmins = await listSuperadmins(c.get('db'));
    return c.json({ items: superadmins.map(superadminView) });
  });

  routes.post('/superadmins', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, createSuperadminRequestSchema);
    const taken = await findSuperadminByUsername(c.get('db'), body.username);
    if (taken) throw conflict(messages.usernameTaken, 'username');
    const created = await createSuperadmin(c.get('db'), body);
    return c.json({ superadmin: superadminView(created) }, 201);
  });

  routes.put('/superadmins/:superadminId/passcode', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, editSuperadminPasscodeRequestSchema);
    const superadminId = requireParam(c, 'superadminId');
    const existing = await findSuperadminById(c.get('db'), superadminId);
    if (!existing) throw notFound(messages.notFound);
    const updated = await updateSuperadminPasscode(c.get('db'), { superadminId, ...body });
    return c.json({ superadmin: superadminView(required(updated, 'Superadmin')) });
  });

  return routes;
}

async function readFacilitatorView(c: AppContext, facilitatorId: string) {
  const record = required(await findFacilitatorById(c.get('db'), facilitatorId), 'Facilitator');
  return facilitatorView(record);
}
