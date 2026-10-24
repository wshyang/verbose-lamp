import { messages } from '@psd/contracts';
import type { SwagClaimView, SwagRoundView, SwagStationView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  jsonRequest,
  withMethod,
  type ActorSession,
  type TestContext,
} from './harness.js';

/**
 * ADR-110 — the swag counter: rounds behave like fringe rounds, claims consume allowance
 * instead of awarding points, and the idempotency contract matches the scan's.
 */

describe('ADR-110 — swag stations, rounds and claims', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;
  let facilitator: ActorSession;
  let stationId: string;
  let roundId: string;
  let nickname: string;
  const ghostId = '00000000-0000-4000-8000-00000000dea1';

  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
    facilitator = await ctx.createFacilitator();
    const participant = await ctx.signUpParticipant();
    nickname = participant.nickname;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates a station with its item catalogue, unique by name', async () => {
    const created = await ctx.app.request(
      '/api/admin/swag-stations',
      jsonRequest(
        {
          stationName: `Goodie Bag Counter ${ctx.runId.slice(0, 4)}`,
          items: [
            { label: 'Tote bag', limit: 1 },
            { label: 'Sticker pack', limit: 2 },
          ],
        },
        superadmin.headers,
      ),
    );
    expect(created.status).toBe(201);
    const { station } = await ctx.json<{ station: SwagStationView }>(created);
    stationId = station.id;
    expect(station.items).toHaveLength(2);
    expect(station.currentRound).toBeNull();

    const dupe = await ctx.app.request(
      '/api/admin/swag-stations',
      jsonRequest(
        {
          stationName: station.stationName.toUpperCase(),
          items: [{ label: 'Cap', limit: 1 }],
        },
        superadmin.headers,
      ),
    );
    expect(dupe.status).toBe(409);
  });

  it('refuses a catalogue with duplicate labels or silly limits', async () => {
    const bad = await ctx.app.request(
      '/api/admin/swag-stations',
      jsonRequest(
        {
          stationName: `Broken Counter ${ctx.runId.slice(0, 4)}`,
          items: [
            { label: 'Tote bag', limit: 1 },
            { label: 'tote BAG', limit: 2 },
          ],
        },
        superadmin.headers,
      ),
    );
    expect(bad.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(bad);
    expect(body.error.message).toBe(messages.swagItemsInvalid);
  });

  it('opens a round; a second open is refused while one is active', async () => {
    const opened = await ctx.app.request(
      `/api/swag/stations/${stationId}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    expect(opened.status).toBe(201);
    const { round } = await ctx.json<{ round: SwagRoundView }>(opened);
    roundId = round.id;
    expect(round.roundNumber).toBe(1);
    expect(round.claimCount).toBe(0);

    const again = await ctx.app.request(
      `/api/swag/stations/${stationId}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    expect(again.status).toBe(400);
  });

  it('hands out up to the limit, refuses past it, and replays idempotently', async () => {
    const claim = (uuid: string, itemLabel = 'Sticker pack') =>
      ctx.app.request(
        '/api/swag/claims',
        jsonRequest(
          { nickname, roundId, itemLabel, clientClaimUuid: uuid },
          facilitator.headers,
        ),
      );
    const first = crypto.randomUUID();

    const one = await claim(first);
    expect(one.status).toBe(201);
    const oneBody = await ctx.json<{ claim: SwagClaimView; duplicate: boolean }>(one);
    expect(oneBody.duplicate).toBe(false);
    expect(oneBody.claim.itemLabelSnapshot).toBe('Sticker pack');

    // The same uuid replayed (a retried request) is the SAME handout, not a second one.
    const replay = await claim(first);
    expect(replay.status).toBe(200);
    expect((await ctx.json<{ duplicate: boolean }>(replay)).duplicate).toBe(true);

    // A fresh uuid takes the second of two allowed stickers…
    expect((await claim(crypto.randomUUID())).status).toBe(201);
    // …and the third is refused by allowance, not by accident.
    const over = await claim(crypto.randomUUID());
    expect(over.status).toBe(409);
    expect((await ctx.json<{ error: { message: string } }>(over)).error.message).toBe(
      messages.swagLimitReached,
    );

    // A different item has its own allowance.
    expect((await claim(crypto.randomUUID(), 'Tote bag')).status).toBe(201);
    // An item not on the station is a named 400.
    const unknown = await claim(crypto.randomUUID(), 'Golden crown');
    expect(unknown.status).toBe(400);
  });

  it('advance opens a fresh allowance; end is reversible by the next open', async () => {
    const advanced = await ctx.app.request(
      `/api/swag/rounds/${roundId}/advance`,
      jsonRequest({}, facilitator.headers),
    );
    expect(advanced.status).toBe(201);
    const { round: next } = await ctx.json<{ round: SwagRoundView }>(advanced);
    expect(next.roundNumber).toBe(2);

    // Round 2: the sticker allowance is fresh.
    const fresh = await ctx.app.request(
      '/api/swag/claims',
      jsonRequest(
        {
          nickname,
          roundId: next.id,
          itemLabel: 'Sticker pack',
          clientClaimUuid: crypto.randomUUID(),
        },
        facilitator.headers,
      ),
    );
    expect(fresh.status).toBe(201);

    const ended = await ctx.app.request(
      `/api/swag/rounds/${next.id}/end`,
      jsonRequest({}, facilitator.headers),
    );
    expect(ended.status).toBe(200);

    const claims = await ctx.app.request(`/api/swag/rounds/${roundId}/claims`, {
      headers: facilitator.headers,
    });
    expect(claims.status).toBe(200);
    const list = await ctx.json<{ items: SwagClaimView[] }>(claims);
    expect(list.items.length).toBe(3);
  });

  it('answers every edge with the named refusal, never a surprise', async () => {
    const ghost = '00000000-0000-4000-8000-00000000dead';
    const station404 = await ctx.app.request(`/api/swag/stations/${ghost}`, {
      headers: facilitator.headers,
    });
    expect(station404.status).toBe(404);

    const claims404 = await ctx.app.request(`/api/swag/rounds/${ghost}/claims`, {
      headers: facilitator.headers,
    });
    expect(claims404.status).toBe(404);

    const openOnGhost = await ctx.app.request(
      `/api/swag/stations/${ghost}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    expect(openOnGhost.status).toBe(404);

    const claimGhostRound = await ctx.app.request(
      '/api/swag/claims',
      jsonRequest(
        { nickname, roundId: ghost, itemLabel: 'Tote bag', clientClaimUuid: crypto.randomUUID() },
        facilitator.headers,
      ),
    );
    expect(claimGhostRound.status).toBe(404);

    const claimGhostPerson = await ctx.app.request(
      '/api/swag/claims',
      jsonRequest(
        {
          nickname: 'Nobody_Here',
          roundId,
          itemLabel: 'Tote bag',
          clientClaimUuid: crypto.randomUUID(),
        },
        facilitator.headers,
      ),
    );
    expect(claimGhostPerson.status).toBe(404);

    // The ended round refuses an advance; ending it again is idempotent (DC-003's twin).
    const stations = await ctx.app.request('/api/swag/stations', { headers: facilitator.headers });
    expect(stations.status).toBe(200);
    const list = await ctx.json<{ items: SwagStationView[] }>(stations);
    const mine = list.items.find((entry) => entry.id === stationId) as SwagStationView;
    const endedRound = mine.currentRound as SwagRoundView;
    expect(endedRound.status).toBe('ended');
    const advanceEnded = await ctx.app.request(
      `/api/swag/rounds/${endedRound.id}/advance`,
      jsonRequest({}, facilitator.headers),
    );
    expect(advanceEnded.status).toBe(400);
    const endAgain = await ctx.app.request(
      `/api/swag/rounds/${endedRound.id}/end`,
      jsonRequest({}, facilitator.headers),
    );
    expect(endAgain.status).toBe(200);
  });

  it('superadmin reshapes the catalogue and the name through one save', async () => {
    const save = (id: string, stationName: string) =>
      ctx.app.request(
        `/api/admin/swag-stations/${id}`,
        withMethod(
          'PUT',
          { stationName, items: [{ label: 'Cap', limit: 1 }] },
          superadmin.headers,
        ),
      );

    const renamed = `Merch Marquee ${ctx.runId.slice(0, 4)}`;
    const updated = await save(stationId, renamed);
    expect(updated.status).toBe(200);
    const { station } = await ctx.json<{ station: SwagStationView }>(updated);
    expect(station.items).toEqual([{ label: 'Cap', limit: 1 }]);
    // ADR-188 — the name was the part that used to be permanent for the life of the event.
    expect(station.stationName).toBe(renamed);

    expect((await save(ghostId, 'Nowhere')).status).toBe(404);
  });

  it('refuses a rename onto a name another station already holds', async () => {
    const taken = `Taken Table ${ctx.runId.slice(0, 4)}`;
    const make = (stationName: string) =>
      ctx.app.request(
        '/api/admin/swag-stations',
        jsonRequest({ stationName, items: [{ label: 'Pin', limit: 1 }] }, superadmin.headers),
      );
    expect((await make(taken)).status).toBe(201);
    const mover = await ctx.json<{ station: SwagStationView }>(
      await make(`Moving Table ${ctx.runId.slice(0, 4)}`),
    );

    // The unique index is on `lower(station_name)`, so a change of case is still a collision.
    const clash = await ctx.app.request(
      `/api/admin/swag-stations/${mover.station.id}`,
      withMethod(
        'PUT',
        { stationName: taken.toUpperCase(), items: [{ label: 'Pin', limit: 1 }] },
        superadmin.headers,
      ),
    );
    expect(clash.status).toBe(409);
  });

  it('an inactive station refuses new rounds', async () => {
    const toggled = await ctx.app.request(
      `/api/admin/swag-stations/${stationId}/active`,
      withMethod('PATCH', {}, superadmin.headers),
    );
    expect(toggled.status).toBe(200);

    const refused = await ctx.app.request(
      `/api/swag/stations/${stationId}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    expect(refused.status).toBe(400);
    expect((await ctx.json<{ error: { message: string } }>(refused)).error.message).toBe(
      messages.swagStationInactive,
    );
  });
});
