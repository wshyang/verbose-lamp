import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tournamentCourts } from '../db/schema/index.js';
import { newId } from '../db/ids.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, type TestContext } from './harness.js';
import { rehearsalDay, type ConsoleView, type RehearsalDay } from './rehearsal-day.js';

/**
 * ADR-335 — the dress rehearsal for 5 November (ADR-329 F7, phase 5). One small day, six
 * things go wrong in the order they would, and every one is settled with the machinery the
 * day-of lock-ins added — over HTTP, the way the desk and the courts actually drive it:
 *
 *   1. side A never arrives         → the desk awards a walkover (phase 1, F1)
 *   2. two runners-up dead level    → the desk's toss settles the cut at close (F2)
 *   3. a qualifier is absent        → his semi-final seat is reseated (F3)
 *   4. the hall needs the courts    → the 20-minute knockout is cut to 12 (F13)
 *   5. the marshal's phone dies     → the desk hands the live semi back (F4)
 *   6. the other semi finishes level → a coin toss names who goes through (phase 2, F5)
 *
 * Six teams: two groups of three send two each into cross-seeded semi-finals at 20 minutes,
 * then a final. The groups are played to a script: one finishes 1-2-3 clean; the other's
 * second and third draw with each other and lose identically, so the last place through is
 * a genuine tie on the cut. Which teams those are is read from the tables as the day unfolds,
 * never assumed from seed order.
 */

let ctx: TestContext;
let day: RehearsalDay;
const teamIds: string[] = [];
const courtIds = [newId(), newId()];

type ConsoleBody = ConsoleView;

/** The cast, discovered from the tables as the day unfolds (group seeding is the builder's business). */
const cast = { walkoverWinner: '', walkoverLoser: '', cleanThird: '', tiedWinner: '', tieLoser: '', groupWinner: '' };

beforeAll(async () => {
  ctx = await createTestContext();
  const desk = await ctx.signInSuperadmin();
  const marshal = await ctx.createFacilitator();
  day = rehearsalDay(ctx, { desk, marshal });
  await ctx.handle.db.insert(tournamentCourts).values(courtIds.map((id, index) => ({ id, courtNumber: index + 1, label: `Court ${index + 1}` })));
  for (let index = 0; index < 6; index += 1) teamIds.push(await createTeam(ctx, await ctx.signUpParticipant(), teamNameFor(ctx.runId)));
});

afterAll(async () => {
  await ctx.close();
});

/** Invariant at every step of the rehearsal: no team in two live matches (task 61). */
async function noTeamTwiceOnCourt(): Promise<void> {
  const live = (await day.console()).matches.filter((match) => match.status === 'in_progress');
  const onCourt = live.flatMap((match) => [match.a.teamId, match.b.teamId]).filter((id) => id !== null);
  expect(new Set(onCourt).size).toBe(onCourt.length);
}

const unplayedIn = (_stageLabel: string) => (row: { status: string }) => row.status === 'scheduled';

describe('the dress rehearsal — a day in six mishaps', () => {
  it('starts: groups of three at 10 minutes, cross-seeded semis and a final at 20', async () => {
    const created = await day.act<ConsoleBody>('', { name: 'Rehearsal day', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds }, await ctx.signInSuperadmin());
    expect(created.status).toBe(201);
    const started = await day.act<ConsoleBody>('/activate', {
      pipeline: {
        stages: [
          { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 10, options: { groupSize: 3, advanceCount: 2 } },
          { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 20, options: {} },
        ],
      },
      matchMinutes: 10,
      changeoverMinutes: 2,
      restMinutes: 0,
    });
    expect(started.status).toBe(200);
    const tournament = await day.console();
    expect(tournament.stages.map((stage) => [stage.label, stage.status])).toEqual([
      ['Groups', 'active'],
      ['Knockout', 'pending'],
    ]);
    const knockout = tournament.matches.filter((match) => match.stageLabel === 'Knockout');
    expect(knockout.length).toBeGreaterThan(0);
    expect(knockout.every((match) => match.plannedMinutes === 20)).toBe(true);
  });

  it('1 · side A never arrives: the desk awards the walkover, and the table reads it', async () => {
    const fixture = await day.match('Groups', (row) => row.status === 'scheduled');
    cast.walkoverWinner = fixture.b.teamId as string;
    cast.walkoverLoser = fixture.a.teamId as string;
    const awarded = await day.act<ConsoleBody>(`/matches/${fixture.id}/walkover`, { winnerSide: 'b', reason: 'Side A never arrived.' });
    expect(awarded.status).toBe(200);
    const settled = (await day.console()).matches.find((match) => match.id === fixture.id);
    expect(settled).toMatchObject({ status: 'completed', resultKind: 'walkover', winnerSide: 'b' });
    await noTeamTwiceOnCourt();
  });

  it('plays the groups out to the script', async () => {
    // The walkover group finishes clean: the walkover winner beats the third team, the
    // no-show side beats them too — 1st, 2nd, 3rd with no ties.
    const cleanWinnerGame = await day.match(
      'Groups',
      (row) => row.status === 'scheduled' && [row.a.teamId, row.b.teamId].includes(cast.walkoverWinner) && ![row.a.teamId, row.b.teamId].includes(cast.walkoverLoser),
    );
    cast.cleanThird = cleanWinnerGame.a.teamId === cast.walkoverWinner ? (cleanWinnerGame.b.teamId as string) : (cleanWinnerGame.a.teamId as string);
    await day.play(cleanWinnerGame, { winner: cleanWinnerGame.a.teamId === cast.walkoverWinner ? 'a' : 'b' });
    const cleanLast = await day.match('Groups', (row) => row.status === 'scheduled' && [row.a.teamId, row.b.teamId].includes(cast.walkoverLoser));
    await day.play(cleanLast, { winner: cleanLast.a.teamId === cast.walkoverLoser ? 'a' : 'b' });
    // The other group: its strongest side beats both others identically; the other two draw
    // 1-1 with each other and finish dead level for second place.
    const groupsStage = await day.stage('Groups');
    const tiedGroup = groupsStage.groups.find((group) => !group.standings.some((row) => row.teamId === cast.walkoverWinner));
    const tiedTeams = (tiedGroup?.standings ?? []).map((row) => row.teamId as string);
    cast.groupWinner = tiedTeams[0] as string;
    cast.tiedWinner = tiedTeams[1] as string;
    cast.tieLoser = tiedTeams[2] as string;
    for (const opponent of [cast.tiedWinner, cast.tieLoser]) {
      const game = await day.match('Groups', (row) => row.status === 'scheduled' && [row.a.teamId, row.b.teamId].includes(cast.groupWinner) && [row.a.teamId, row.b.teamId].includes(opponent));
      await day.play(game, { winner: game.a.teamId === cast.groupWinner ? 'a' : 'b' });
    }
    const drawn = await day.match('Groups', (row) => row.status === 'scheduled');
    expect([drawn.a.teamId, drawn.b.teamId].sort()).toEqual([cast.tiedWinner, cast.tieLoser].sort());
    await day.start(drawn);
    await day.score(drawn, 'a', 1);
    await day.score(drawn, 'b', 1);
    expect(await day.complete(drawn, { winnerTeamId: null })).toBe(200);
    // Nothing left to play in the groups, and the tie is real.
    const groups = await day.stage('Groups');
    expect(groups.cutTies.length).toBeGreaterThan(0);
    const tied = (tiedGroup === undefined ? [] : groups.groups.find((group) => group.id === tiedGroup.id)?.standings ?? []).filter((row) => row.played === 2 && row.points === 1);
    expect(tied.map((row) => row.teamId).sort()).toEqual([cast.tiedWinner, cast.tieLoser].sort());
  });

  it('2 · dead level on the cut: the desk closes the groups with the toss winner named', async () => {
    const groups = await day.stage('Groups');
    const closed = await day.act<ConsoleBody>(`/stages/${groups.id}/complete`, {
      // The desk's coin put cast.tieLoser through over cast.tiedWinner; the desk names her.
      overrides: [{ place: 4, teamId: cast.tieLoser }],
      reason: 'Level on points, difference and scored: the coin put them through.',
    });
    expect(closed.status).toBe(200);
    expect((await day.stage('Groups')).status).toBe('completed');
    const semi = (await day.console()).matches.filter((match) => match.stageLabel === 'Knockout' && match.status === 'scheduled');
    const seated = semi.flatMap((match) => [match.a.teamId, match.b.teamId]);
    expect(seated).toContain(cast.tieLoser);
    expect(seated).not.toContain(cast.tiedWinner);
    expect((await day.stage('Knockout')).status).toBe('active');
  });

  it('3 · a qualifier is absent: his semi-final seat is reseated to a team that is there', async () => {
    // The tied group's winner is nowhere to be found; the clean group's third team is present.
    const semi = await day.match('Knockout', (row) => row.status === 'scheduled' && (row.a.teamId === cast.groupWinner || row.b.teamId === cast.groupWinner));
    const side = semi.a.teamId === cast.groupWinner ? 'a' : 'b';
    const reseated = await day.act<ConsoleBody>(`/matches/${semi.id}/reseat`, { side, teamId: cast.cleanThird, reason: 'The qualifier is absent; the next team present takes the seat.' });
    expect(reseated.status).toBe(200);
    const now = (await day.console()).matches.find((match) => match.id === semi.id);
    expect(side === 'a' ? now?.a.teamId : now?.b.teamId).toBe(cast.cleanThird);
    await noTeamTwiceOnCourt();
  });

  it('4 · the hall needs the courts back: the 20-minute knockout is cut to 12', async () => {
    const knockout = await day.stage('Knockout');
    const applied = await day.act<ConsoleBody>('/contingency/apply', {
      enabledCourtIds: courtIds,
      matchMinutes: 10,
      changeoverMinutes: 2,
      stageMinutes: [{ stageId: knockout.id, matchMinutes: 12 }],
    });
    expect(applied.status).toBe(200);
    const matches = (await day.console()).matches.filter((match) => match.stageLabel === 'Knockout');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((match) => match.plannedMinutes === 12)).toBe(true);
  });

  it('5 · the marshal’s phone dies mid-semi: the desk hands the match back, and it is played again', async () => {
    const semi = await day.match('Knockout', unplayedIn('Knockout'));
    await day.start(semi);
    expect((await day.console()).matches.find((match) => match.id === semi.id)?.status).toBe('in_progress');
    const handedBack = await day.act<ConsoleBody>(`/matches/${semi.id}/hand-back`, { reason: 'The marshal’s phone died; the desk takes the match back.' });
    expect(handedBack.status).toBe(200);
    const queued = (await day.console()).matches.find((match) => match.id === semi.id);
    expect(queued?.status).toBe('scheduled');
    await noTeamTwiceOnCourt();
    await day.play(queued as NonNullable<typeof queued>, { winner: 'a' });
    expect((await day.console()).matches.find((match) => match.id === semi.id)?.status).toBe('completed');
  });

  it('6 · the other semi finishes level: a coin toss names who goes through', async () => {
    const semi = await day.match('Knockout', unplayedIn('Knockout'));
    await day.start(semi);
    await day.score(semi, 'a', 1);
    await day.score(semi, 'b', 1);
    // Level in a knockout without a named settle is refused; the toss settles it.
    expect(await day.complete(semi, { winnerTeamId: null })).not.toBe(200);
    const winnerTeamId = semi.a.teamId;
    expect(await day.complete(semi, { winnerTeamId, tiebreakMethod: 'coin_toss' })).toBe(200);
    const settled = (await day.console()).matches.find((match) => match.id === semi.id);
    expect(settled).toMatchObject({ status: 'completed', scoreA: 1, scoreB: 1, winnerSide: 'a' });
  });

  it('the final is played — at 12 minutes, as retimed — and the day closes', async () => {
    const final = await day.match('Knockout', unplayedIn('Knockout'));
    expect(final.plannedMinutes).toBe(12);
    await day.play(final, { winner: 'a', winnerScore: 2, loserScore: 1 });
    const closing = await day.act<ConsoleBody>('/close', { reason: 'The rehearsal day is done.' });
    expect(closing.status).toBe(200);
    expect(closing.body.tournament?.status).toBe('closed');
  });
});
