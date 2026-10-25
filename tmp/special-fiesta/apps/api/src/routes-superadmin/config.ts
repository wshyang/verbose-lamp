import {
  createActivityRequestSchema,
  editActivityRequestSchema,
  messages,
  pointConfigRequestSchema,
  toggleRequestSchema,
} from '@psd/contracts';
import { Hono } from 'hono';
import {
  activateActivity,
  createActivity,
  deactivateActivity,
  findActivityById,
  findActivityByName,
  findCurrentRound,
  findPointConfig,
  listActivities,
  savePointConfig,
  updateActivity,
} from '../db/entities/index.js';
import { conflict, notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings, type AppContext } from '../lib/session.js';
import { activityView, pointConfigView } from './views.js';
import { required } from '../db/rows.js';

/**
 * F33–F36 — point configuration and fringe activities (S36–S40). ADR-270 — courts left with the
 * old tournament; the rebuilt tournament owns them.
 */
export function superadminConfigRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  registerPointConfigRoutes(routes);
  registerActivityRoutes(routes);
  return routes;
}

/** F33 — S36 the day's fringe point settings (ADR-116, ADR-176). */
function registerPointConfigRoutes(routes: Hono<AppBindings>): void {
  routes.get('/point-config', async (c) => {
    requireSuperadmin(c);
    const config = await findPointConfig(c.get('db'));
    return c.json({ pointConfig: config ? pointConfigView(config) : null });
  });

  routes.put('/point-config', async (c) => {
    const actor = requireSuperadmin(c);
    const body = await readBody(c, pointConfigRequestSchema);
    await savePointConfig(c.get('db'), { ...body, superadminId: actor.superadmin.id });
    const saved = required(await findPointConfig(c.get('db')), 'PointConfig');
    return c.json({ pointConfig: pointConfigView(saved) });
  });

}

/** F34–F36 — S37–S40 fringe activity CRUD and the active/inactive machine (§3.5). */
function registerActivityRoutes(routes: Hono<AppBindings>): void {
  routes.get('/activities', async (c) => {
    requireSuperadmin(c);
    return c.json({ items: await readActivityViews(c) });
  });

  routes.post('/activities', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, createActivityRequestSchema);
    const taken = await findActivityByName(c.get('db'), body.activityName);
    if (taken) throw conflict(messages.activityNameInvalid, 'activityName');
    const activity = await createActivity(c.get('db'), body);
    return c.json({ activity: await readActivityView(c, activity.id) }, 201);
  });

  routes.put('/activities/:activityId', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, editActivityRequestSchema);
    const activityId = requireParam(c, 'activityId');
    await assertActivityExists(c, activityId);
    await assertActivityNameFree(c, { activityId, activityName: body.activityName });
    await updateActivity(c.get('db'), { ...body, activityId });
    await applyActivityState(c, { activityId, isActive: body.isActive });
    return c.json({ activity: await readActivityView(c, activityId) });
  });

  // F36 — deactivation auto-closes the open/ended round (§3.5)
  routes.patch('/activities/:activityId/active', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, toggleRequestSchema);
    const activityId = requireParam(c, 'activityId');
    await assertActivityExists(c, activityId);
    await applyActivityState(c, { activityId, isActive: body.isEnabled });
    return c.json({ activity: await readActivityView(c, activityId) });
  });

}

async function assertActivityExists(c: AppContext, activityId: string): Promise<void> {
  const activity = await findActivityById(c.get('db'), activityId);
  if (!activity) throw notFound(messages.activityNotFound);
}

async function assertActivityNameFree(
  c: AppContext,
  input: { activityId: string; activityName: string },
): Promise<void> {
  const clash = await findActivityByName(c.get('db'), input.activityName);
  if (clash && clash.id !== input.activityId) {
    throw conflict(messages.activityNameInvalid, 'activityName');
  }
}

/** No flag arguments: the two transitions are two named repository calls (§3.5). */
async function applyActivityState(
  c: AppContext,
  input: { activityId: string; isActive: boolean },
): Promise<void> {
  if (input.isActive) {
    await activateActivity(c.get('db'), input.activityId);
    return;
  }
  await deactivateActivity(c.get('db'), input.activityId);
}

async function readActivityViews(c: AppContext) {
  const activities = await listActivities(c.get('db'));
  const views = [];
  for (const activity of activities) {
    const currentRound = await findCurrentRound(c.get('db'), activity.id);
    views.push(activityView({ activity, currentRound }));
  }
  return views;
}

async function readActivityView(c: AppContext, activityId: string) {
  const activity = required(await findActivityById(c.get('db'), activityId), 'Activity');
  const currentRound = await findCurrentRound(c.get('db'), activity.id);
  return activityView({ activity, currentRound });
}
