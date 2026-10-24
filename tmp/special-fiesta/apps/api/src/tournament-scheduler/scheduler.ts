import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  completeStage,
  dependenciesOf,
  occupantsOf,
  type Actor,
  type Match,
  type TournamentState,
} from "@psd/tournament/core";
import {
  buildPipeline,
  findFormat,
  validatePipeline,
  type FormatOptions,
  type PipelineSpec,
  type Structure,
} from "@psd/tournament/scheduler";
import type { AppDatabase, AppTransaction, Executor } from "../db/client.js";
import {
  tournamentEntrants,
  tournamentSchedulerPins,
  tournamentSchedulers,
  tournaments,
} from "../db/schema/index.js";
import type { TournamentSchedulerRow } from "../db/schema/index.js";
import { firstOrNull } from "../db/rows.js";
import { runCommand } from "../tournament/commands.js";
import { insertStructure } from "../tournament/persist.js";
import { materialise } from "./materialise.js";

/**
 * ADR-274/275 — the scheduler adapter's own row, activation, and the stage auto-advance it runs. It
 * imports the core adapter; the core adapter never imports this (ADR-272). Planning lives in
 * `planning.ts`, contingency and termination in `control.ts`.
 */

/** The seeded `system` facilitator row (seed-default.sql): the scheduler acts as a real actor. */
export const SYSTEM_ACTOR: Actor = {
  kind: "system",
  id: "fac10000-0000-4000-8000-000000000000",
  label: "scheduler",
};

export async function findScheduler(
  db: Executor,
  tournamentId: string,
): Promise<TournamentSchedulerRow | null> {
  return firstOrNull(
    await db
      .select()
      .from(tournamentSchedulers)
      .where(eq(tournamentSchedulers.tournamentId, tournamentId)),
  );
}

export interface ActivateInput {
  tournamentId: string;
  formatId?: string | undefined;
  options?: FormatOptions | undefined;
  /** ADR-310 — a stage pipeline instead of a whole-tournament format. */
  pipeline?: PipelineSpec | undefined;
  matchMinutes: number;
  changeoverMinutes: number;
  restMinutes: number;
  deadlineAt: Date | null;
  now: Date;
}

export type ActivateOutcome = { ok: true } | { ok: false; error: string };

async function seededEntrants(tx: Executor, tournamentId: string) {
  const rows = await tx
    .select()
    .from(tournamentEntrants)
    .where(eq(tournamentEntrants.tournamentId, tournamentId));
  return [...rows]
    .filter((row) => row.withdrawnAt === null)
    .sort((left, right) => left.entryOrder - right.entryOrder)
    .map((row, index) => ({
      id: row.id,
      name: row.nameSnapshot,
      seed: index + 1,
    }));
}

/** The structure an activation builds, or why it cannot: a format's, validated, or a pipeline's. */
function planStructure(input: {
  input: ActivateInput;
  format: ReturnType<typeof findFormat>;
  options: FormatOptions;
  seeded: Awaited<ReturnType<typeof seededEntrants>>;
}): { structure: Structure } | { error: string } {
  if (input.input.pipeline !== undefined) {
    const invalid = validatePipeline(input.input.pipeline, input.seeded.length);
    return invalid === null
      ? { structure: buildPipeline(input.input.pipeline, input.seeded) }
      : { error: invalid };
  }
  const format = input.format as NonNullable<typeof input.format>;
  const invalid = format.validate(input.seeded.length, input.options);
  return invalid === null
    ? { structure: format.build(input.seeded, input.options) }
    : { error: invalid };
}

/**
 * ADR-334 — what Start keeps of the plan, so an unstarted stage can be rebuilt on the day:
 * the exact pipeline spec, or a per-stage sketch of a single-format build (whose restage
 * rebuilds from format + options instead).
 */
function storedSpec(input: ActivateInput, structure: Structure) {
  if (input.pipeline !== undefined) return input.pipeline;
  return {
    stages: structure.stages.map((stage) => ({
      code: stage.code,
      label: stage.label,
      format:
        stage.kind === "pool"
          ? ("pool" as const)
          : stage.kind === "bracket"
            ? ("bracket" as const)
            : ("open" as const),
      source:
        stage.intake === null
          ? ({ kind: "initial" } as const)
          : {
              kind: "advancers" as const,
              fromStage: stage.intake.fromStageCode,
              count: stage.intake.count,
            },
      matchMinutes: stage.matchMinutes,
      options: {
        ...(stage.tablePoints !== null
          ? { tablePoints: stage.tablePoints }
          : {}),
      },
    })),
  };
}

/** Builds the chosen format over the tournament's entrants, writes the structure and the scheduler row. */
export async function activate(
  db: AppDatabase,
  input: ActivateInput,
): Promise<ActivateOutcome> {
  const format =
    input.pipeline === undefined ? findFormat(input.formatId ?? "") : null;
  if (input.pipeline === undefined && format === null)
    return { ok: false, error: "Unknown format." };
  if (input.pipeline !== undefined && input.formatId !== undefined) {
    return { ok: false, error: "Choose a format or a pipeline, not both." };
  }
  return db.transaction(async (tx): Promise<ActivateOutcome> => {
    const seeded = await seededEntrants(tx, input.tournamentId);
    const options = input.options ?? {};
    const planned = planStructure({ input, format, options, seeded });
    if ("error" in planned) return { ok: false, error: planned.error };
    const built = materialise({
      structure: planned.structure,
      entrants: new Map(seeded.map((row) => [row.id, row.id])),
      matchMinutes: input.matchMinutes,
    });
    await insertStructure(tx, {
      tournamentId: input.tournamentId,
      structure: built,
    });
    // A pipeline of nothing but open stages is open play: born stopped, like the format.
    const isOpen =
      input.pipeline !== undefined
        ? input.pipeline.stages.every((stage) => stage.format === "open")
        : format?.id === "open";
    await tx.insert(tournamentSchedulers).values({
      tournamentId: input.tournamentId,
      format:
        input.pipeline !== undefined
          ? "pipeline"
          : (format as NonNullable<typeof format>).id,
      // ADR-334 — the exact plan this Start used, kept so an unstarted stage can be rebuilt
      // on the day. A single-format day stores a per-stage sketch of the same shape; its
      // restage rebuilds from format + options, not from this sketch.
      pipelineSpec: storedSpec(input, planned.structure),
      options: { ...options } as Record<string, string | number | boolean>,
      status: isOpen ? "terminated" : "active",
      matchMinutes: input.matchMinutes,
      changeoverMinutes: input.changeoverMinutes,
      restMinutes:
        input.pipeline !== undefined
          ? input.restMinutes
          : ((format as NonNullable<typeof format>).restPolicy.restMinutes ??
            input.restMinutes),
      deadlineAt: input.deadlineAt,
      // Open play has nothing to schedule: its scheduler is born stopped, and the courts are the desk's.
      ...(isOpen
        ? {
            terminatedAt: input.now,
            terminatedByLabel: "open play",
            terminateReason: "Open play has no schedule.",
          }
        : {}),
    });
    await tx
      .update(tournaments)
      .set({ status: "live", startedAt: input.now })
      .where(eq(tournaments.id, input.tournamentId));
    return { ok: true };
  });
}

export type ActivateDumbOutcome = { ok: true } | { ok: false; error: string };

/**
 * ADR-321 — starting dumb courts: the draft simply goes live. There is no structure to build,
 * no scheduler row (nothing will ever be scheduled), and no fixtures — the entrants written at
 * creation are the whole tournament, and the courts become award stations.
 */
export async function activateDumb(
  db: AppDatabase,
  input: { tournamentId: string; now: Date },
): Promise<ActivateDumbOutcome> {
  return db.transaction((tx) => activateDumbIn(tx, input));
}

/** ADR-336 — the dumb Start inside a transaction the caller opened (the mid-day switch). */
export async function activateDumbIn(
  tx: AppTransaction,
  input: { tournamentId: string; now: Date },
): Promise<ActivateDumbOutcome> {
  const [row] = await tx
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, input.tournamentId))
    .limit(1);
  if (row === undefined || row.status !== "draft")
    return { ok: false, error: "That tournament is not a draft." };
  if (row.kind !== "dumb_courts")
    return {
      ok: false,
      error: "Only a dumb-courts tournament starts this way.",
    };
  if (row.dumbTiers === null || row.dumbTiers.length === 0)
    return {
      ok: false,
      error: "Add at least one award tier before starting dumb courts.",
    };
  const entrants = await tx
    .select({ id: tournamentEntrants.id })
    .from(tournamentEntrants)
    .where(eq(tournamentEntrants.tournamentId, input.tournamentId));
  if (entrants.length < 2)
    return { ok: false, error: "At least 2 teams are needed." };
  await tx
    .update(tournaments)
    .set({ status: "live", startedAt: input.now })
    .where(eq(tournaments.id, input.tournamentId));
  return { ok: true };
}

/** Live pins: the human placements the planner must keep. */
export async function pinnedIds(
  db: Executor,
  matchIds: readonly string[],
): Promise<Set<string>> {
  if (matchIds.length === 0) return new Set();
  const rows = await db
    .select({ matchId: tournamentSchedulerPins.matchId })
    .from(tournamentSchedulerPins)
    .where(
      and(
        inArray(tournamentSchedulerPins.matchId, [...matchIds]),
        isNull(tournamentSchedulerPins.releasedAt),
      ),
    );
  return new Set(rows.map((row) => row.matchId));
}

function isOver(match: Match): boolean {
  return match.status === "completed" || match.status === "cancelled";
}

/** The active stage whose every match is over — the one the scheduler may close, unless it is Swiss or open. */
export function finishedStage(state: TournamentState) {
  return state.stages.find((stage) => {
    if (
      stage.status !== "active" ||
      stage.kind === "swiss" ||
      stage.kind === "open"
    )
      return false;
    const own = state.matches.filter((match) => match.stageId === stage.id);
    return own.length > 0 && own.every(isOver);
  });
}

/**
 * Closes every stage that is unambiguously over, as the scheduler. A tie on a cut line is refused by
 * the core (`tie_on_cut`) and left for a person; that refusal ends the loop.
 */
export async function advanceStages(
  db: AppDatabase,
  now: Date,
): Promise<number> {
  let closed = 0;
  for (let guard = 0; guard < 8; guard += 1) {
    const outcome = await runCommand(db, {
      actor: SYSTEM_ACTOR,
      now,
      command: (state, context) => {
        const stage = finishedStage(state);
        if (stage === undefined)
          return {
            ok: false,
            refusal: { code: "not_found", message: "Nothing to advance." },
          };
        return completeStage(
          state,
          { stageId: stage.id, overrides: [], reason: null },
          context,
        );
      },
    });
    if (!outcome.ok) return closed;
    closed += 1;
  }
  return closed;
}

/** Who sits (or would sit) in a match, for the planner's rest and double-booking rules. */
export function entrantsOf(
  state: TournamentState,
  match: Match,
): (string | null)[] {
  const seats = occupantsOf(state, match);
  return [seats.a, seats.b];
}

/** The direct feeders of a match whose seats are not yet frozen. */
export function feedersOf(match: Match): string[] {
  return (["a", "b"] as const).flatMap((side) => {
    const source = match.slots[side].source;
    const isFeeder = source.kind === "winner_of" || source.kind === "loser_of";
    return isFeeder && match.slots[side].seatedEntrantId === null
      ? [source.matchId]
      : [];
  });
}

export { dependenciesOf };
