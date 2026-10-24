import type { Hono } from 'hono';
import {
  activateTournamentRequestSchema,
  courtEnabledRequestSchema,
  courtRequestSchema,
  createTournamentRequestSchema,
  messages,
} from '@psd/contracts';
import { findFormat, validatePipeline, type PipelineSpec } from '@psd/tournament/scheduler';
import { listTeams } from '../db/entities/index.js';
import { badRequest, conflict, notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings, type AppContext } from '../lib/session.js';
import { bracketIsLive, deskSetupSlot } from '../tournament/dayPolicy.js';
import { createCourt, createDraft, discardDraft, setCourtEnabled, updateCourt, type CourtOutcome } from '../tournament/setup.js';
import { activate, activateDumb } from '../tournament-scheduler/scheduler.js';
import { readConsole } from './desk.js';
import { engineActorOf, withTournamentWrite } from './support.js';

/**
 * ADR-279 — the desk's setup: the venue's courts, a draft with its entrants, and Start (the chosen
 * format built over the entrants and handed to the scheduler). Every write answers with the whole
 * Control read, so the console never has to stitch a response onto what it already holds.
 */

function assertCourt(outcome: CourtOutcome): void {
  if (outcome.ok) return;
  if (outcome.reason === 'number_taken') throw conflict(messages.courtNumberTaken, 'courtNumber');
  throw notFound(messages.courtNotFound);
}

// ADR-346 — the follow-through moved into the writes (withTournamentWrite); the answer is now
// just the console as it stands after them.
async function answer(c: AppContext, status: 200 | 201 = 200) {
  const now = new Date();
  return c.json(await readConsole(c.get('db'), now), status);
}

function registerCourts(routes: Hono<AppBindings>): void {
  routes.post('/courts', async (c) => {
    requireSuperadmin(c);
    await withTournamentWrite(c.get('db'), { now: new Date(), isResult: false }, async () =>
      assertCourt(await createCourt(c.get('db'), await readBody(c, courtRequestSchema))));
    return answer(c, 201);
  });

  routes.put('/courts/:courtId', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, courtRequestSchema);
    await withTournamentWrite(c.get('db'), { now: new Date(), isResult: false }, async () =>
      assertCourt(await updateCourt(c.get('db'), { ...body, id: requireParam(c, 'courtId') })));
    return answer(c);
  });

  // §3.4 — soft: a match already on the court plays on.
  routes.patch('/courts/:courtId/enabled', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, courtEnabledRequestSchema);
    await withTournamentWrite(c.get('db'), { now: new Date(), isResult: false }, async () =>
      assertCourt(await setCourtEnabled(c.get('db'), { id: requireParam(c, 'courtId'), isEnabled: body.isEnabled })));
    return answer(c);
  });
}

async function requireDraft(c: AppContext) {
  // ADR-336/345 — the desk's draft comes first, whatever its kind: once a bracket is live, resolving
  // "the open tournament" would hand back the bracket and make a waiting dumb draft unreachable.
  const row = await deskSetupSlot(c.get('db'));
  if (row === null || row.status === 'closed') throw notFound(messages.tournamentNotActive);
  if (row.status !== 'draft') throw conflict(messages.tournamentNotDraft);
  return row;
}

async function entrantsOf(c: AppContext, teamIds: readonly string[]) {
  if (new Set(teamIds).size !== teamIds.length) throw badRequest(messages.teamCannotPlayItself, 'teamIds');
  const names = new Map((await listTeams(c.get('db'))).map((team) => [team.id, team.teamName]));
  return teamIds.map((teamId) => {
    const name = names.get(teamId);
    if (name === undefined) throw notFound(messages.teamNotFound);
    return { teamId, name };
  });
}

/** ADR-313 — why a saved Start configuration cannot be played over this field, or null when it can. */
function draftSetupProblem(setup: { buildMode: 'format' | 'pipeline'; formatId?: string | undefined; options: Record<string, unknown>; pipeline?: PipelineSpec | undefined }, teamCount: number): string | null {
  if (setup.buildMode === 'pipeline') {
    return setup.pipeline === undefined ? 'Choose a format or a pipeline, not both.' : validatePipeline(setup.pipeline, teamCount);
  }
  const format = setup.formatId === undefined ? null : findFormat(setup.formatId);
  return format === null ? 'Choose a format or a pipeline, not both.' : format.validate(teamCount, setup.options);
}

function registerCreate(routes: Hono<AppBindings>): void {
  // The teams in the order given are the seeds; their names are snapshotted as they stand today.
  routes.post('/', async (c) => {
    const actor = requireSuperadmin(c);
    const body = await readBody(c, createTournamentRequestSchema);
    const entrants = await entrantsOf(c, body.teamIds);
    if (body.setup !== undefined) {
      const problem = draftSetupProblem(body.setup, body.teamIds.length);
      if (problem !== null) throw badRequest(problem);
    }
    if (body.kind === 'dumb_courts' && (body.tiers === undefined || body.tiers.length === 0)) {
      throw badRequest('Dumb courts need at least one award tier.', 'tiers');
    }
    const rates = { win: body.winPoints, draw: body.drawPoints, loss: body.lossPoints };
    await withTournamentWrite(c.get('db'), { now: new Date(), isResult: false }, async () => {
      const draft = await createDraft(c.get('db'), {
        name: body.name,
        kind: body.kind,
        rates,
        entrants,
        setup: body.setup ?? null,
        tiers: body.kind === 'dumb_courts' ? (body.tiers ?? null) : null,
        createdBy: engineActorOf(actor),
      });
      if (!draft.ok) throw conflict(messages.tournamentAlreadyOpen);
    });
    return answer(c, 201);
  });

}

function registerDiscardAndActivate(routes: Hono<AppBindings>): void {
  routes.post('/discard', async (c) => {
    requireSuperadmin(c);
    const draft = await requireDraft(c);
    await withTournamentWrite(c.get('db'), { now: new Date(), isResult: false }, () =>
      discardDraft(c.get('db'), { tournamentId: draft.id, now: new Date() }));
    return answer(c);
  });

  // Start — the format built over the entrants, the structure written, the scheduler engaged.
  routes.post('/activate', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, activateTournamentRequestSchema);
    const draft = await requireDraft(c);
    // ADR-321 — dumb courts Start builds nothing: no format, no pipeline, no fixtures.
    if (draft.kind === 'dumb_courts') {
      if (body.dumb !== true) throw badRequest('Start dumb courts with the dumb Start, not a format.');
      // ADR-336 — the accidental mode is closed. A dumb day started beside a live bracket shadows
      // Results and Line-ups while the bracket keeps planning underneath; the way the room gets to
      // court awards mid-day is the switch, which pauses the bracket first.
      if (await bracketIsLive(c.get('db'))) {
        throw badRequest(
          'A tournament is already being played. To award points at the courts instead, switch the day from Tournament Control.',
        );
      }
      await withTournamentWrite(c.get('db'), { now: new Date(), isResult: false }, async () => {
        const dumbOutcome = await activateDumb(c.get('db'), { tournamentId: draft.id, now: new Date() });
        if (!dumbOutcome.ok) throw badRequest(dumbOutcome.error);
      });
      return answer(c);
    }
    if (body.dumb === true) throw badRequest('This tournament is not dumb courts.');
    const deadlineAt = body.deadlineAt === null ? null : new Date(body.deadlineAt);
    const timing = { matchMinutes: body.matchMinutes, changeoverMinutes: body.changeoverMinutes, restMinutes: body.restMinutes, deadlineAt };
    // exactOptionalPropertyTypes: an option the form left out is absent, never `undefined`.
    const options = Object.fromEntries(Object.entries(body.options).filter(([, value]) => value !== undefined));
    await withTournamentWrite(c.get('db'), { now: new Date(), isResult: false }, async () => {
      const outcome = await activate(c.get('db'), {
        tournamentId: draft.id,
        ...(body.pipeline === undefined
          ? { formatId: body.formatId, options }
          : { pipeline: body.pipeline as PipelineSpec }),
        ...timing,
        now: new Date(),
      });
      if (!outcome.ok) throw badRequest(outcome.error);
    });
    return answer(c);
  });
}

export function registerDeskSetup(routes: Hono<AppBindings>): void {
  registerCourts(routes);
  registerCreate(routes);
  registerDiscardAndActivate(routes);
}
