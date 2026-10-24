import type {
  Actor,
  CommandContext,
  CommandResult,
  Refusal,
  TournamentEvent,
  TournamentKind,
  TournamentState,
} from "@psd/tournament/core";
import type { AppDatabase, AppTransaction } from "../db/client.js";
import { newId } from "../db/ids.js";
import { findOpenTournament, loadState } from "./load.js";
import { persistChanges, type Written } from "./persist.js";

/**
 * ADR-275 — running one engine command against the database: load the open tournament, let the pure
 * core decide, write what changed, all inside one transaction. The write bumps the tournament's
 * revision, so two commands racing on the same day serialise on that row instead of interleaving.
 *
 * Nothing here knows the scheduler or the app's people (ADR-272): the composition root decides what
 * else a write means — a pushed feed frame, a roster frozen for the points bridge, a re-plan.
 */

export type EngineCommand = (
  state: TournamentState,
  context: CommandContext,
) => CommandResult;

export type CommandOutcome =
  | {
      ok: true;
      before: TournamentState;
      state: TournamentState;
      events: readonly TournamentEvent[];
      written: Written;
    }
  | { ok: false; refusal: Refusal };

/** Enough fresh ids for anything one command may create; a whole structure is never built by a command. */
const IDS_PER_COMMAND = 8;

export const NO_TOURNAMENT: Refusal = {
  code: "not_found",
  message: "There is no tournament running.",
};

export interface RunInput {
  actor: Actor;
  now: Date;
  command: EngineCommand;
  /** ADR-293 — which game type's tournament to operate on. Defaults to 'captains_ball'. */
  kind?: TournamentKind;
  /** Fresh ids to mint, when a command may create more than a handful (a Swiss round). */
  idCount?: number;
  /**
   * What the composition root writes in the same transaction once the engine's changes are in —
   * the points bridge's roster snapshots (ADR-276). A hook rather than an import, so this adapter
   * still knows nothing of the app's people (ADR-272).
   */
  afterPersist?: (tx: AppTransaction, written: Written) => Promise<void>;
}

/**
 * ADR-336 — the same run, inside a transaction the caller already opened.
 *
 * The switch has to pause one tournament, start another and log that in ONE transaction; a runner
 * that insists on opening its own would make that three commits and leave a half-switched room if
 * the third failed. `runCommand` is now the thin wrapper, so no existing caller changed.
 */
export async function runCommandIn(
  tx: AppTransaction,
  input: RunInput,
): Promise<CommandOutcome> {
  return runCommandBody(tx, input);
}

/** Runs `command` against the open tournament of the given kind as `actor`, at `now`. */
export async function runCommand(
  db: AppDatabase,
  input: RunInput,
): Promise<CommandOutcome> {
  return db.transaction((tx) => runCommandBody(tx, input));
}

async function runCommandBody(
  tx: AppTransaction,
  input: RunInput,
): Promise<CommandOutcome> {
  // ADR-345 — the adapter's one sanctioned finder use: the kind is the command's own input and
  // the resolution belongs inside the engine's transaction. Every route-level surface imports a
  // named policy from tournament/dayPolicy.ts instead.
  const row = await findOpenTournament(tx, input.kind);
  if (row === null) return { ok: false as const, refusal: NO_TOURNAMENT };
  const before = await loadState(tx, row);
  const context: CommandContext = {
    now: input.now.toISOString(),
    actor: input.actor,
    newIds: Array.from({ length: input.idCount ?? IDS_PER_COMMAND }, () =>
      newId(),
    ),
  };
  const result = input.command(before, context);
  if (!result.ok) return { ok: false as const, refusal: result.refusal };
  const written = await persistChanges(tx, {
    before,
    after: result.state,
    events: result.events,
    now: context.now,
  });
  if (input.afterPersist !== undefined) await input.afterPersist(tx, written);
  return {
    ok: true as const,
    before,
    state: result.state,
    events: result.events,
    written,
  };
}
