import type { AgendaView } from '@psd/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createTestContext,
  jsonRequest,
  withMethod,
  type ActorSession,
  type TestContext,
} from './harness.js';
import { resetCachesForTests } from '../lib/cache.js';

/**
 * ADR-177 — the day's programme.
 *
 * The assertions worth writing here are not "a row round-trips". They are the three places the
 * model says something non-obvious and could quietly stop saying it:
 *
 *   - a TIMELESS item sorts first and is never "now" or "next" (the run sheet really does open
 *     with one, so NULLS FIRST is load-bearing rather than tidy);
 *   - a CANCELLED item stays in the list and drops out of now/next (the whole reason `is_active`
 *     is a flag and not a delete);
 *   - a MOMENT — an item with a start and no end — is never "now", only "next" and then past.
 *
 * The clock is pinned by writing items around a fixed instant rather than by faking timers,
 * because the derivation happens server-side against `new Date()` and the thing under test is
 * the comparison, not the clock.
 */

let ctx: TestContext;
let superadmin: ActorSession;

beforeAll(async () => {
  ctx = await createTestContext();
  superadmin = await ctx.signInSuperadmin();
});

afterAll(async () => {
  await ctx.close();
});

/*
 * A fresh programme per test.
 *
 * `now` and `next` are singular properties of the whole day, so items left behind by an earlier
 * case silently become the answer in a later one — which is exactly how the first draft of this
 * file passed two assertions it had no right to. Emptying the table is cheaper and far clearer
 * than trying to give every test a disjoint window on the clock.
 */
beforeEach(async () => {
  // Straight to the table, because there is no delete route to call (see the entity: this
  // repository invalidates rows rather than removing them). A test fixture may truncate what
  // the product deliberately will not.
  await ctx.handle.db.execute(sql`DELETE FROM agenda_item`);
  resetCachesForTests();
});

/** Minutes either side of now, as the ISO strings the wire takes. */
function at(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function addItem(body: Record<string, unknown>): Promise<string> {
  const response = await ctx.app.request('/api/admin/agenda', jsonRequest(body, superadmin.headers));
  expect(response.status).toBe(201);
  const { item } = await ctx.json<{ item: { id: string } }>(response);
  return item.id;
}

async function readAgenda(): Promise<AgendaView> {
  resetCachesForTests();
  const response = await ctx.app.request('/api/agenda');
  expect(response.status).toBe(200);
  return ctx.json<AgendaView>(response);
}

describe('ADR-177 — the day programme', () => {
  it('sorts a timeless item first and never calls it now or next', async () => {
    const preamble = await addItem({ title: 'Before departure: have an early lunch' });
    const later = await addItem({ title: 'Opening speech', startsAt: at(30), endsAt: at(40) });

    const agenda = await readAgenda();

    expect(agenda.items[0]?.id).toBe(preamble);
    expect(agenda.items[0]?.startsAt).toBeNull();
    // It is at the top of the day, but it is not a thing you can be in the middle of.
    expect(agenda.nowId).not.toBe(preamble);
    expect(agenda.nextId).toBe(later);
  });

  it('reports the item whose window contains now, and the one after it', async () => {
    const running = await addItem({ title: "Captain's Ball", startsAt: at(-20), endsAt: at(40) });
    const upcoming = await addItem({ title: 'Prize presentation', startsAt: at(60), endsAt: at(70) });

    const agenda = await readAgenda();

    expect(agenda.nowId).toBe(running);
    expect(agenda.nextId).toBe(upcoming);
    expect(Date.parse(agenda.asOf)).toBeGreaterThan(0);
  });

  it('never treats a moment as now — an item with no end is only ever next', async () => {
    await addItem({ title: 'Meet at the pavilion', startsAt: at(-1) });

    const agenda = await readAgenda();

    // It started a minute ago and has no duration, so it is behind us, not around us.
    const moment = agenda.items.find((item) => item.title === 'Meet at the pavilion');
    expect(moment?.endsAt).toBeNull();
    expect(agenda.nowId).not.toBe(moment?.id);
    expect(agenda.nextId).not.toBe(moment?.id);
  });

  it('keeps a cancelled item in the list but drops it from now and next', async () => {
    const doomed = await addItem({ title: 'Beach games', startsAt: at(-5), endsAt: at(25) });
    expect((await readAgenda()).nowId).toBe(doomed);

    const toggled = await ctx.app.request(
      `/api/admin/agenda/${doomed}/active`,
      withMethod('PATCH', { isEnabled: false }, superadmin.headers),
    );
    expect(toggled.status).toBe(200);

    const agenda = await readAgenda();
    // Still on the page — somebody who memorised it has to see that it is cancelled.
    const cancelled = agenda.items.find((item) => item.id === doomed);
    expect(cancelled?.isActive).toBe(false);
    // But it is emphatically not what is happening.
    expect(agenda.nowId).not.toBe(doomed);
    expect(agenda.nextId).not.toBe(doomed);

    // Reinstated, it is what is happening again.
    const restored = await ctx.app.request(
      `/api/admin/agenda/${doomed}/active`,
      withMethod('PATCH', { isEnabled: true }, superadmin.headers),
    );
    expect(restored.status).toBe(200);
    expect((await readAgenda()).nowId).toBe(doomed);
  });

  it('refuses an end time without a start, and an end before its start', async () => {
    const orphanEnd = await ctx.app.request(
      '/api/admin/agenda',
      jsonRequest({ title: 'Nonsense', endsAt: at(10) }, superadmin.headers),
    );
    expect(orphanEnd.status).toBe(400);

    const backwards = await ctx.app.request(
      '/api/admin/agenda',
      jsonRequest({ title: 'Backwards', startsAt: at(30), endsAt: at(10) }, superadmin.headers),
    );
    expect(backwards.status).toBe(400);
  });

  it('clears a field that is edited away rather than keeping the old value', async () => {
    const id = await addItem({
      title: 'Warm-up',
      startsAt: at(5),
      endsAt: at(15),
      location: 'Pavilion',
      detail: 'Yoga stretch',
    });

    const edited = await ctx.app.request(
      `/api/admin/agenda/${id}`,
      withMethod('PATCH', { title: 'Warm-up', startsAt: at(5), endsAt: at(15) }, superadmin.headers),
    );
    expect(edited.status).toBe(200);

    const agenda = await readAgenda();
    const item = agenda.items.find((entry) => entry.id === id);
    expect(item?.location).toBeNull();
    expect(item?.detail).toBeNull();
  });

  it('is readable without signing in — the run sheet is on a poster, not a secret', async () => {
    await addItem({ title: 'Group photo', startsAt: at(120), endsAt: at(130) });
    resetCachesForTests();

    const guest = await ctx.app.request('/api/agenda');

    expect(guest.status).toBe(200);
    const agenda = await ctx.json<AgendaView>(guest);
    expect(agenda.items.some((item) => item.title === 'Group photo')).toBe(true);
  });

  it('moves a timeless item up and down, and leaves the timed ones to the clock (ADR-190)', async () => {
    const first = await addItem({ title: 'Early lunch' });
    await addItem({ title: 'Collect wristband' });
    const third = await addItem({ title: 'Find your team' });
    const timed = await addItem({ title: 'Opening speech', startsAt: at(30) });

    const titles = async (): Promise<string[]> =>
      (await readAgenda()).items.map((item) => item.title);
    const move = (itemId: string, direction: string) =>
      ctx.app.request(
        `/api/admin/agenda/${itemId}/move`,
        jsonRequest({ direction }, superadmin.headers),
      );

    // They start in the order they were typed, which is the thing being complained about.
    expect(await titles()).toEqual([
      'Early lunch',
      'Collect wristband',
      'Find your team',
      'Opening speech',
    ]);

    expect((await move(third, 'up')).status).toBe(200);
    expect(await titles()).toEqual([
      'Early lunch',
      'Find your team',
      'Collect wristband',
      'Opening speech',
    ]);

    expect((await move(first, 'down')).status).toBe(200);
    expect(await titles()).toEqual([
      'Find your team',
      'Early lunch',
      'Collect wristband',
      'Opening speech',
    ]);

    // The ends are walls, not wraps: an item at the top stays at the top.
    expect((await move(third, 'up')).status).toBe(200);
    expect((await titles())[0]).toBe('Find your team');

    // And a timed item is placed by its clock, so asking to move it is a mistake, not a no-op.
    const refused = await move(timed, 'up');
    expect(refused.status).toBe(400);
    expect(await titles()).toEqual([
      'Find your team',
      'Early lunch',
      'Collect wristband',
      'Opening speech',
    ]);

    const ghost = await move('00000000-0000-4000-8000-000000000000', 'up');
    expect(ghost.status).toBe(404);
  });

  it('refuses to let anyone but a superadmin write the programme', async () => {
    const participant = await ctx.signUpParticipant();

    const attempt = await ctx.app.request(
      '/api/admin/agenda',
      jsonRequest({ title: 'Free ice cream', startsAt: at(5) }, participant.headers),
    );

    expect(attempt.status).toBe(403);
  });
});
