import { and, eq, isNull } from 'drizzle-orm';
import { placeMatch, retimeMatches, type Actor } from '@psd/tournament/core';
import { diffPlacements, plan, type FitSummary, type PlacementChange } from '@psd/tournament/scheduler';
import type { AppDatabase } from '../db/client.js';
import { tournamentCourts, tournamentSchedulerPins, tournamentSchedulers } from '../db/schema/index.js';
import { runCommand, type CommandOutcome } from '../tournament/commands.js';
import { schedulerDay } from '../tournament/dayPolicy.js';
import { loadState } from '../tournament/load.js';
import { currentPlacements, planInputOf, reconcile } from './planning.js';
import { findScheduler, pinnedIds, SYSTEM_ACTOR } from './scheduler.js';

/**
 * ADR-274 — requirements 8 and 9: the contingency lever (courts and timings change, the day is
 * re-planned, and the change is shown before it is made) and the off switch (the scheduler stops for
 * good and every scheduling act is a person's). Also the pin: a person's placement the planner keeps.
 */

export interface ContingencyInput {
  enabledCourtIds: readonly string[];
  matchMinutes: number;
  changeoverMinutes: number;
  /** ADR-329 F13 — explicit lengths per stage; a stage not named follows `matchMinutes`. */
  stageMinutes?: readonly { stageId: string; matchMinutes: number }[];
  restMinutes?: number | undefined;
  /** Undefined keeps the hard stop; null clears it. */
  deadlineAt?: Date | null | undefined;
  /** The person applying the change, recorded on the retime event. */
  actor?: Actor | undefined;
  now: Date;
}

function stageMinutesOf(input: ContingencyInput): Map<string, number> {
  return new Map((input.stageMinutes ?? []).map((row) => [row.stageId, row.matchMinutes]));
}

export type ContingencyPreview = { ok: true; changes: PlacementChange[]; fit: FitSummary } | { ok: false; error: string };

const NO_ACTIVE_SCHEDULER = 'The scheduler is not running, so there is no plan to change.';

async function activeContext(db: AppDatabase) {
  const row = await schedulerDay(db);
  if (row === null) return null;
  const scheduler = await findScheduler(db, row.id);
  if (scheduler === null || scheduler.status !== 'active') return null;
  return { row, scheduler };
}

/** What the change would do, written nowhere (P-14: say it before doing it). */
export async function previewContingency(db: AppDatabase, input: ContingencyInput): Promise<ContingencyPreview> {
  const active = await activeContext(db);
  if (active === null) return { ok: false, error: NO_ACTIVE_SCHEDULER };
  const state = await loadState(db, active.row);
  const enabled = new Set(input.enabledCourtIds);
  const pinned = await pinnedIds(db, state.matches.map((match) => match.id));
  const result = plan(
    planInputOf({
      state,
      scheduler: active.scheduler,
      pinned,
      now: input.now,
      courts: state.courts.filter((court) => enabled.has(court.id)),
      matchMinutes: input.matchMinutes,
      stageMinutes: stageMinutesOf(input),
      changeoverMinutes: input.changeoverMinutes,
      restMinutes: input.restMinutes,
      deadlineAt: input.deadlineAt,
    }),
  );
  return { ok: true, changes: diffPlacements(currentPlacements(state), result.placements), fit: result.fit };
}

/**
 * The change, made: courts switched, timings set, every unplayed match re-timed, then re-planned. A
 * court switched off mid-match keeps its match (the FDS's soft disable); it just gets no new one.
 */
export async function applyContingency(db: AppDatabase, input: ContingencyInput): Promise<ContingencyPreview> {
  const active = await activeContext(db);
  if (active === null) return { ok: false, error: NO_ACTIVE_SCHEDULER };
  const enabled = new Set(input.enabledCourtIds);
  // ADR-329 F13 — the lengths change through the core's `retimeMatches`, an attributable
  // act with an event, never a raw rewrite of core rows. A stage the change names runs at
  // its named length; any other stage follows the one length. Live and finished matches
  // are not in the updates: the command refuses them, so they are not sent.
  const before = await loadState(db, active.row);
  const byStage = stageMinutesOf(input);
  const scheduled = before.matches.filter((match) => match.status === 'scheduled');
  const updates = scheduled
    .map((match) => ({ matchId: match.id, minutes: byStage.get(match.stageId) ?? input.matchMinutes, planned: match.plannedMinutes }))
    .filter((update) => update.minutes !== update.planned)
    .map(({ matchId, minutes }) => ({ matchId, minutes }));
  if (updates.length > 0) {
    const retimed = await runCommand(db, {
      actor: input.actor ?? SYSTEM_ACTOR,
      now: input.now,
      command: (state, context) => retimeMatches(state, { updates }, context),
    });
    if (!retimed.ok) return { ok: false, error: retimed.refusal.message };
  }
  await db.transaction(async (tx) => {
    for (const court of await tx.select({ id: tournamentCourts.id }).from(tournamentCourts)) {
      await tx.update(tournamentCourts).set({ isEnabled: enabled.has(court.id) }).where(eq(tournamentCourts.id, court.id));
    }
    await tx
      .update(tournamentSchedulers)
      .set({
        matchMinutes: input.matchMinutes,
        changeoverMinutes: input.changeoverMinutes,
        ...(input.restMinutes === undefined ? {} : { restMinutes: input.restMinutes }),
        ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
      })
      .where(eq(tournamentSchedulers.tournamentId, active.row.id));
  });
  const changes = await reconcile(db, input.now);
  // The scheduler is still active: nothing in between could have stopped it.
  const after = await previewContingency(db, input);
  if (!after.ok) throw new Error(`contingency applied, then the plan could not be read: ${after.error}`);
  return { ok: true, changes, fit: after.fit };
}

export type TerminateOutcome = { ok: true } | { ok: false; error: string };

/** Requirement 9 — the scheduler stops for good. Placements stay where they were; nothing re-plans them. */
export async function terminate(db: AppDatabase, input: { reason: string; label: string; now: Date }): Promise<TerminateOutcome> {
  const active = await activeContext(db);
  if (active === null) return { ok: false, error: 'The scheduler is already stopped.' };
  await db
    .update(tournamentSchedulers)
    .set({ status: 'terminated', terminatedAt: input.now, terminatedByLabel: input.label, terminateReason: input.reason })
    .where(and(eq(tournamentSchedulers.tournamentId, active.row.id), eq(tournamentSchedulers.status, 'active')));
  return { ok: true };
}

export interface PinInput {
  actor: Actor;
  matchId: string;
  courtId: string;
  start: Date;
  now: Date;
}

/**
 * A person puts a match on a court at a time. The move is the core's (`placeMatch`, attributable);
 * the pin is the scheduler's note to keep it there. Without a running scheduler there is nothing to
 * keep it from, so the move is simply made.
 */
export async function moveMatch(db: AppDatabase, input: PinInput): Promise<CommandOutcome> {
  const outcome = await runCommand(db, {
    actor: input.actor,
    now: input.now,
    command: (state, context) => placeMatch(state, { matchId: input.matchId, courtId: input.courtId, plannedStartAt: input.start.toISOString() }, context),
  });
  if (!outcome.ok) return outcome;
  const active = await activeContext(db);
  if (active === null) return outcome;
  await db
    .insert(tournamentSchedulerPins)
    .values({ matchId: input.matchId, pinnedBy: input.actor.label, pinnedAt: input.now, releasedAt: null })
    .onConflictDoUpdate({ target: tournamentSchedulerPins.matchId, set: { pinnedBy: input.actor.label, pinnedAt: input.now, releasedAt: null } });
  await reconcile(db, input.now);
  return outcome;
}

/** Hands a pinned match back to the planner. Released, never deleted: the row says who pinned it. */
export async function releasePin(db: AppDatabase, input: { matchId: string; now: Date }): Promise<boolean> {
  const released = await db
    .update(tournamentSchedulerPins)
    .set({ releasedAt: input.now })
    .where(and(eq(tournamentSchedulerPins.matchId, input.matchId), isNull(tournamentSchedulerPins.releasedAt)))
    .returning({ matchId: tournamentSchedulerPins.matchId });
  if (released.length === 0) return false;
  await reconcile(db, input.now);
  return true;
}
