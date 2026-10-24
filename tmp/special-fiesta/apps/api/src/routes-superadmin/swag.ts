import {
  createSwagStationRequestSchema,
  messages,
  updateSwagStationRequestSchema,
} from '@psd/contracts';
import { Hono } from 'hono';
import type { SwagItem } from '../db/schema/index.js';
import {
  createSwagStation,
  findCurrentSwagRound,
  findSwagStationById,
  listSwagStations,
  setSwagStationActive,
  updateSwagStation,
} from '../db/entities/index.js';
import { conflict, notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings, type AppContext } from '../lib/session.js';
import { uniqueViolationOf } from '../db/violations.js';
import { swagStationView } from '../views/swag.js';

/** ADR-110 — swag station administration: the activities admin surface, mirrored. */
export function superadminSwagRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  registerStationCrud(routes);
  registerStationEdits(routes);
  return routes;
}

function registerStationCrud(routes: Hono<AppBindings>): void {
  routes.get('/swag-stations', async (c) => {
    requireSuperadmin(c);
    const stations = await listSwagStations(c.get('db'));
    const items = await Promise.all(
      stations.map(async (station) =>
        swagStationView(station, await findCurrentSwagRound(c.get('db'), station.id)),
      ),
    );
    return c.json({ items });
  });

  routes.post('/swag-stations', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, createSwagStationRequestSchema);
    try {
      const station = await createSwagStation(c.get('db'), body);
      return c.json({ station: swagStationView(station, null) }, 201);
    } catch (error) {
      if (uniqueViolationOf(error) !== null) {
        throw conflict(messages.swagStationNameInvalid, 'stationName');
      }
      throw error;
    }
  });

}

function registerStationEdits(routes: Hono<AppBindings>): void {
  routes.patch('/swag-stations/:stationId/active', async (c) => {
    requireSuperadmin(c);
    const station = await requireStation(c);
    const updated = await setSwagStationActive(c.get('db'), {
      stationId: station.id,
      isActive: !station.isActive,
    });
    return c.json({
      station: swagStationView(
        updated ?? station,
        await findCurrentSwagRound(c.get('db'), station.id),
      ),
    });
  });

  /*
   * ADR-188 — one save for the whole station, name included. It was `/items`, which left the
   * name permanent for the life of the event; the unique index on `lower(station_name)` is the
   * only thing that can refuse, and it answers the same conflict as creating a duplicate does.
   */
  routes.put('/swag-stations/:stationId', async (c) => {
    requireSuperadmin(c);
    const station = await requireStation(c);
    const body = await readBody(c, updateSwagStationRequestSchema);
    const updated = await saveStation(c, station.id, body);
    return c.json({
      station: swagStationView(
        updated ?? station,
        await findCurrentSwagRound(c.get('db'), station.id),
      ),
    });
  });
}

async function saveStation(
  c: AppContext,
  stationId: string,
  body: { stationName: string; items: SwagItem[] },
) {
  try {
    return await updateSwagStation(c.get('db'), { stationId, ...body });
  } catch (error) {
    if (uniqueViolationOf(error) !== null) {
      throw conflict(messages.swagStationNameInvalid, 'stationName');
    }
    throw error;
  }
}

async function requireStation(c: AppContext) {
  const station = await findSwagStationById(c.get('db'), requireParam(c, 'stationId'));
  if (!station) throw notFound(messages.swagStationNotFound);
  return station;
}
