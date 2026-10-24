import { eq } from 'drizzle-orm';
import {
  appendRound,
  hasRoundMatch,
  recordBye,
  type CommandContext,
  type CommandResult,
  type Match,
  type RoundEntrant,
  type Stage,
  type TournamentState,
} from '@psd/tournament/core';
import {
  defaultSwissRounds,
  diffPlacements,
  plan,
  planNextSwissRound,
  type PlacementChange,
  type PlanInput,
  type PlanResult,
} from '@psd/tournament/scheduler';
import type { AppDatabase, Executor } from '../db/client.js';
import { tournamentMatches, tournamentSchedulers } from '../db/schema/index.js';
import type { TournamentSchedulerRow } from '../db/schema/index.js';
import { schedulerDay } from '../tournament/dayPolicy.js';
import { loadState } from '../tournament/load.js';
import { required } from '../db/rows.js';
import { runCommand } from '../tournament/commands.js';
import { advanceStages, dependenciesOf, entrantsOf, feedersOf, findScheduler, pinnedIds, SYSTEM_ACTOR } from './scheduler.js';

/**
 * ADR-274 — the scheduler's planning half: the tournament as the planner's input, and the re-plan
 * (`reconcile`) that runs after every write and on a tick. Times are minutes since the epoch, which is
 * all the pure planner needs; this file is the only place they are converted.
 */

/** A round of up to 32 teams: sixteen matches, a bye, and its award. */
const SWISS_IDS = 20;

const NOTHING_TO_PAIR: CommandResult = { ok: false, refusal: { code: 'not_found', message: 'Nothing to pair.' } };

export function toMinutes(at: Date | string): number {
  return Math.floor(new Date(at).getTime() / 60_000);
}

export function fromMinutes(value: number): Date {
  return new Date(value * 60_000);
}

export interface PlanContext {
  state: TournamentState;
  scheduler: TournamentSchedulerRow;
  pinned: ReadonlySet<string>;
  now: Date;
  /** A contingency preview's courts and timings; the scheduler's own otherwise. */
  courts?: readonly { id: string; label: string }[];
  matchMinutes?: number;
  /** ADR-329 F13 — explicit per-stage lengths win over the scheduler's one length. */
  stageMinutes?: ReadonlyMap<string, number>;
  changeoverMinutes?: number;
  restMinutes?: number | undefined;
  /** Undefined keeps the scheduler's hard stop; null clears it. */
  deadlineAt?: Date | null | undefined;
}

function isFixed(match: Match, pinned: ReadonlySet<string>): boolean {
  return match.status === 'in_progress' || (match.status === 'scheduled' && pinned.has(match.id) && match.plannedStartAt !== null);
}

function fixedPlacements(context: PlanContext): PlanInput['fixed'] {
  const now = toMinutes(context.now);
  return context.state.matches
    .filter((match) => isFixed(match, context.pinned))
    .map((match) => {
      // Fixed means live (started, on a court) or pinned (planned, on a court): both are always set.
      const start = toMinutes(required(match.startedAt ?? match.plannedStartAt, 'fixed start'));
      return {
        matchId: match.id,
        courtId: required(match.courtId, 'fixed court'),
        start,
        end: Math.max(now, start + match.plannedMinutes),
        entrants: entrantsOf(context.state, match),
      };
    });
}

/** The planner's input from the tournament as it stands: live and pinned matches fixed, the rest to place. */
export function planInputOf(context: PlanContext): PlanInput {
  const { state, scheduler, pinned } = context;
  // ADR-329 F13 — every match carries its own length (`planned_minutes`, stamped from
  // its stage at activation). A contingency candidate says lengths per stage; a stage
  // it names runs at that length, a stage it does not name follows the candidate's one
  // length. The old "inherited" guess (ADR-310) is retired: the values are explicit.
  const minutesOf = (match: Match): number =>
    context.stageMinutes?.get(match.stageId) ?? (context.matchMinutes !== undefined ? context.matchMinutes : match.plannedMinutes);
  const toPlace = state.matches.filter((match) => match.status === 'scheduled' && !isFixed(match, pinned));
  return {
    now: toMinutes(context.now),
    courts: context.courts ?? state.courts.filter((court) => court.isEnabled),
    matches: toPlace.map((match) => ({
      id: match.id,
      priority: match.sequence,
      entrants: entrantsOf(state, match),
      dependsOn: dependenciesOf(state, match),
      feeders: feedersOf(match),
      minutes: minutesOf(match),
    })),
    fixed: fixedPlacements(context),
    finished: state.matches
      .filter((match) => match.status === 'completed' || match.status === 'cancelled')
      // Every way a match finishes — completed, walkover, bye, called off, withdrawn — stamps its end.
      .map((match) => ({ matchId: match.id, end: toMinutes(required(match.endedAt, 'match end')), entrants: entrantsOf(state, match) })),
    changeoverMinutes: context.changeoverMinutes ?? scheduler.changeoverMinutes,
    restMinutes: context.restMinutes ?? scheduler.restMinutes,
    deadline:
      context.deadlineAt === undefined
        ? scheduler.deadlineAt === null
          ? null
          : toMinutes(scheduler.deadlineAt)
        : context.deadlineAt === null
          ? null
          : toMinutes(context.deadlineAt),
  };
}

export function currentPlacements(state: TournamentState): { matchId: string; courtId: string; start: number }[] {
  return state.matches.flatMap((match) => {
    const { courtId, plannedStartAt } = match;
    if (match.status !== 'scheduled' || courtId === null || plannedStartAt === null) return [];
    return [{ matchId: match.id, courtId, start: toMinutes(plannedStartAt) }];
  });
}

async function writePlacements(tx: Executor, result: PlanResult): Promise<void> {
  for (const row of result.placements) {
    await tx
      .update(tournamentMatches)
      .set({ courtId: row.courtId, plannedStartAt: fromMinutes(row.start) })
      .where(eq(tournamentMatches.id, row.matchId));
  }
}

/** The one active team the latest round left out (an odd field), still owed its bye. */
function owedBye(state: TournamentState, stage: Stage): RoundEntrant | null {
  // A Swiss stage is built with its first round, so its latest round is always at least 1.
  const round = state.matches.filter((match) => match.stageId === stage.id).reduce((highest, match) => Math.max(highest, match.round), 0);
  const waiting = state.entrants.filter(
    (entrant) => entrant.withdrawnAt === null && !hasRoundMatch(state, { stageId: stage.id, round, entrantId: entrant.id }),
  );
  const [only] = waiting;
  return waiting.length === 1 && only !== undefined ? { stageId: stage.id, round, entrantId: only.id } : null;
}

function swissStep(state: TournamentState, input: { scheduler: TournamentSchedulerRow; context: CommandContext }): CommandResult {
  const stage = state.stages.find((candidate) => candidate.kind === 'swiss' && candidate.status === 'active');
  if (stage === undefined) return NOTHING_TO_PAIR;
  const owed = owedBye(state, stage);
  if (owed !== null) return recordBye(state, owed, input.context);
  const rounds = Number(input.scheduler.options['rounds'] ?? defaultSwissRounds(state.entrants.length));
  const next = planNextSwissRound(state, { stage, rounds });
  if (next === null || next.pairs.length === 0) return NOTHING_TO_PAIR;
  const round = { stageId: stage.id, round: next.round, pairs: next.pairs, byeEntrantId: next.byeEntrantId, plannedMinutes: input.scheduler.matchMinutes };
  return appendRound(state, round, input.context);
}

/**
 * The Swiss step of a re-plan (the only format whose rounds wait on results): the latest round's bye
 * if an odd field still owes one (round one's, which the format's structure cannot hold), else the
 * next round once the last is over. Through the core's commands, so each is an attributable decision.
 */
export async function advanceSwiss(db: AppDatabase, input: { scheduler: TournamentSchedulerRow; now: Date }): Promise<boolean> {
  const outcome = await runCommand(db, {
    actor: SYSTEM_ACTOR,
    now: input.now,
    idCount: SWISS_IDS,
    command: (state, context) => swissStep(state, { scheduler: input.scheduler, context }),
  });
  return outcome.ok;
}

/** Re-plans the day and says what moved. A terminated (or absent) scheduler moves nothing (requirement 9). */
export async function reconcile(db: AppDatabase, now: Date): Promise<PlacementChange[]> {
  const row = await schedulerDay(db);
  if (row === null) return [];
  // ADR-336 — a paused day is not re-planned. Nothing new may be offered to a court, so there is
  // nothing for the planner to place: the matches already on court are finishing under their own
  // marshals, and the unplayed ones are not going to be played. The planner reads a core field
  // only, so the arrow stays scheduler → core: it never learns what a switch is.
  if (row.pausedAt !== null) return [];
  const scheduler = await findScheduler(db, row.id);
  if (scheduler === null || scheduler.status !== 'active') return [];
  if (scheduler.autoAdvance) await advanceStages(db, now);
  if (scheduler.format === 'swiss') await advanceSwiss(db, { scheduler, now });
  return db.transaction(async (tx) => {
    const state = await loadState(tx, row);
    const pinned = await pinnedIds(tx, state.matches.map((match) => match.id));
    const result = plan(planInputOf({ state, scheduler, pinned, now }));
    await writePlacements(tx, result);
    await tx
      .update(tournamentSchedulers)
      .set({ plannedAt: now, revision: scheduler.revision + 1 })
      .where(eq(tournamentSchedulers.tournamentId, row.id));
    return diffPlacements(currentPlacements(state), result.placements);
  });
}
