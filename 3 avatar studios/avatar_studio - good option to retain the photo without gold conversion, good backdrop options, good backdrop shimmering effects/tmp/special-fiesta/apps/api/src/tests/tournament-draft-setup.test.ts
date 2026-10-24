import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminTournamentConsoleView, TournamentDraftSetup } from '@psd/contracts';
import { defaultPipelineSpec } from '@psd/tournament/scheduler';
import { tournaments } from '../db/schema/index.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, jsonRequest, type ActorSession, type TestContext } from './harness.js';

/**
 * ADR-313 — a draft can carry the Start configuration it was saved with. The seed saves the
 * 1-hour-40 pipeline this way: the row is still a draft, nothing is scheduled, and Start is
 * the click that finalises it.
 */

let ctx: TestContext;
let desk: ActorSession;
const teamIds: string[] = [];

type Console = AdminTournamentConsoleView;

async function postDraft(body: unknown, session: ActorSession = desk) {
  const response = await ctx.app.request('/api/admin/tournament', jsonRequest(body, session.headers));
  return { status: response.status, body: (await response.json()) as Console & { error?: { message: string } } };
}

const DEFAULT_PIPELINE = {
  stages: defaultPipelineSpec().stages.map((stage) => {
    const options = stage.options ?? {};
    return {
      code: stage.code,
      label: stage.label,
      format: stage.format,
      source: stage.source,
      matchMinutes: stage.matchMinutes,
      options: {
        ...(options.groupSize !== undefined ? { groupSize: options.groupSize } : {}),
        ...(options.groupCount !== undefined ? { groupCount: options.groupCount } : {}),
        ...(options.advanceCount !== undefined ? { advanceCount: options.advanceCount } : {}),
        ...(options.hasThirdPlace !== undefined ? { hasThirdPlace: options.hasThirdPlace } : {}),
        ...(options.pairing !== undefined ? { pairing: options.pairing } : {}),
        ...(options.rates != null ? { rates: options.rates } : {}),
      },
    };
  }),
};

const SETUP: TournamentDraftSetup = {
  buildMode: 'pipeline',
  options: {},
  pipeline: DEFAULT_PIPELINE,
  matchMinutes: 12,
  changeoverMinutes: 3,
  restMinutes: 0,
  deadline: null,
};

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  for (let index = 0; index < 9; index += 1) {
    teamIds.push(await createTeam(ctx, await ctx.signUpParticipant(), teamNameFor(ctx.runId)));
  }
});

afterAll(async () => {
  await ctx.close();
});

describe('ADR-313 — a draft with its Start configuration saved', () => {
  it('refuses a participant saving one — session-scoping negative', async () => {
    const participant = await ctx.signUpParticipant();
    const result = await postDraft(
      { name: 'Hack', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds, setup: SETUP },
      participant,
    );
    expect(result.status).toBe(403);
    expect(await ctx.handle.db.select().from(tournaments)).toHaveLength(0);
  });

  it('refuses a saved pipeline the field cannot play, and saves nothing', async () => {
    const impossible: TournamentDraftSetup = {
      ...SETUP,
      pipeline: { stages: [DEFAULT_PIPELINE.stages[1]!] },
    };
    const result = await postDraft({ name: 'Broken', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds, setup: impossible });
    expect(result.status).toBe(400);
    expect(result.body.error?.message).toMatch(/earlier stage/);
    expect(await ctx.handle.db.select().from(tournaments)).toHaveLength(0);
  });

  it('saves the 1-hour-40 pipeline on a draft that Start has not finalised', async () => {
    const created = await postDraft({ name: 'Captain’s ball', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds, setup: SETUP });
    expect(created.status).toBe(201);
    const tournament = created.body.tournament;
    expect(tournament).toMatchObject({ status: 'draft', scheduler: null, stages: [], matches: [] });
    expect(tournament?.draftSetup?.buildMode).toBe('pipeline');
    expect(tournament?.draftSetup?.pipeline?.stages.map((stage) => [stage.code, stage.format, stage.matchMinutes])).toEqual([
      ['GRP', 'pool', 15],
      ['KO', 'bracket', 20],
    ]);
    expect(tournament?.draftSetup).toMatchObject({ matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0, deadline: null });
    const [row] = await ctx.handle.db.select().from(tournaments);
    expect(row?.status).toBe('draft');
    expect(row?.draftSetup?.pipeline?.stages).toHaveLength(2);
  });
});
