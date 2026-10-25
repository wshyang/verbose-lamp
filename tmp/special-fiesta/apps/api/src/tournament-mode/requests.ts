import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import {
  messages,
  type ModeRequestAnswerView,
  type ModeRequestView,
} from "@psd/contracts";
import type { AppDatabase, Executor } from "../db/client.js";
import { newId } from "../db/ids.js";
import { firstOrNull, firstOrThrow } from "../db/rows.js";
import { uniqueViolationOf } from "../db/violations.js";
import {
  tournamentCourts,
  tournamentModeRequests,
  type TournamentModeRequestRow,
} from "../db/schema/index.js";
import type { FacilitatorActor } from "../lib/session.js";
import { isAwarding, readOperatingMode } from "./mode.js";

/**
 * ADR-336 §5.4 — the facilitator's ask, and the desk's answer to it.
 *
 * A facilitator can see that the room is stuck; only a superadmin may end the fixture day. The ask is
 * therefore a *question*, not a capability: it records who saw what and why.
 *
 * ADR-342 — the ask does not expire. An ask is about the room at 14:20, and one confirmed at 16:40
 * switches a day nobody described — but the owner ruled that this is the desk's judgement to make,
 * not the clock's: the desk is shown the ask's age and answers it in person, however long it has
 * waited. A timer would answer a question nobody asked it to.
 *
 * The reads are all idempotent:
 *  - asking twice with the same `clientUuid` returns the same ask, while that ask is alive — a double
 *    tap is not two asks. Once the ask has been answered, its key is spent: the replay returns the
 *    answer rather than asking again, so a client that means to ask again mints a new key (the hook
 *    does; the court page's remint is the contract's other half);
 *  - asking while one is pending returns *that* one, so two marshals stack into one question;
 *  - asking once the room is awarding is refused — there is nothing left to ask for.
 */

export interface AskInput {
  actor: FacilitatorActor["facilitator"];
  reason: string;
  courtId: string | null;
  clientUuid: string;
}

export type AskOutcome =
  | {
      ok: true;
      request: TournamentModeRequestRow;
      created: boolean;
    }
  | { ok: false; error: string; status: 400 | 409 };

export type ResolveOutcome =
  | { ok: true }
  | { ok: false; error: string; status: 400 | 409 };

/** The pending ask as the desk and the court read it, with the court's name when it named one. */
export function modeRequestView(
  row: TournamentModeRequestRow,
  courtLabel: string | null,
): ModeRequestView {
  return {
    id: row.id,
    requestedByLabel: row.requestedByLabel,
    reason: row.reason,
    courtLabel,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The one ask waiting on the desk, if any. Null on the ordinary day. */
export async function pendingRequest(
  db: Executor,
): Promise<TournamentModeRequestRow | null> {
  return firstOrNull(
    await db
      .select()
      .from(tournamentModeRequests)
      .where(isNull(tournamentModeRequests.resolvedAt))
      .orderBy(desc(tournamentModeRequests.createdAt))
      .limit(1),
  );
}

/** The pending ask with the court's own name attached, or null. */
export async function pendingRequestView(
  db: Executor,
): Promise<ModeRequestView | null> {
  const row = await pendingRequest(db);
  if (row === null) return null;
  const court =
    row.courtId === null
      ? null
      : firstOrNull(
          await db
            .select({ label: tournamentCourts.label })
            .from(tournamentCourts)
            .where(eq(tournamentCourts.id, row.courtId)),
        );
  return modeRequestView(row, court?.label ?? null);
}

/**
 * ADR-342 — the asker's latest answer. The court that asked learns why the desk said no, which is the
 * loop the ask exists to close: a decline that teaches nothing invites the same ask again. Nobody
 * else's read carries it — the other marshal did not ask.
 */
export async function latestAnswerBy(
  db: Executor,
  askedById: string,
): Promise<ModeRequestAnswerView | null> {
  const row = firstOrNull(
    await db
      .select()
      .from(tournamentModeRequests)
      .where(
        and(
          eq(tournamentModeRequests.requestedById, askedById),
          isNotNull(tournamentModeRequests.resolvedAt),
        ),
      )
      .orderBy(desc(tournamentModeRequests.resolvedAt))
      .limit(1),
  );
  if (row === null) return null;
  return {
    id: row.id,
    resolution: row.resolution === "confirmed" ? "confirmed" : "declined",
    declineReason: row.declineReason ?? null,
    resolvedAt: (row.resolvedAt as Date).toISOString(),
  };
}

export async function askToSwitch(
  db: AppDatabase,
  input: AskInput,
): Promise<AskOutcome> {
  // There is nothing left to ask for once the courts award: the page hides the ask, and a stale
  // page is told the same thing rather than queueing a banner for a day that already changed.
  if (isAwarding(await readOperatingMode(db))) {
    return { ok: false, error: messages.modeSwitchAlreadyAwarding, status: 409 };
  }
  const replay = firstOrNull(
    await db
      .select()
      .from(tournamentModeRequests)
      .where(eq(tournamentModeRequests.clientUuid, input.clientUuid)),
  );
  if (replay !== null) return { ok: true, request: replay, created: false };
  const pending = await pendingRequest(db);
  // Two marshals, one question: the second ask is answered with the first, which names who asked.
  if (pending !== null) return { ok: true, request: pending, created: false };
  let row: TournamentModeRequestRow;
  try {
    row = firstOrThrow(
      await db
        .insert(tournamentModeRequests)
        .values({
          id: newId(),
          requestedById: input.actor.id,
          requestedByLabel: input.actor.username,
          reason: input.reason,
          courtId: input.courtId,
          clientUuid: input.clientUuid,
          createdAt: new Date(),
        })
        .returning(),
      "request insert",
    );
  } catch (caught) {
    // Two marshals pressing in the same second: the pending index keeps one ask, and the loser is
    // answered with the winner's — which is what a second ask means anyway.
    if (uniqueViolationOf(caught) === null) throw caught;
    const winner = await pendingRequest(db);
    if (winner === null) throw caught;
    return { ok: true, request: winner, created: false };
  }
  return { ok: true, request: row, created: true };
}

async function answerable(
  db: Executor,
  id: string,
): Promise<
  | { ok: true; row: TournamentModeRequestRow }
  | { ok: false; error: string; status: 400 | 409 }
> {
  const row = firstOrNull(
    await db
      .select()
      .from(tournamentModeRequests)
      .where(eq(tournamentModeRequests.id, id)),
  );
  if (row === null) return { ok: false, error: messages.notFound, status: 400 };
  // ADR-342 — age is never a refusal. The only ask that cannot be answered is one already answered.
  if (row.resolvedAt !== null) {
    return { ok: false, error: messages.modeRequestNotPending, status: 409 };
  }
  return { ok: true, row };
}

/** The desk says no, with a reason. The ask stays on the record as declined. */
export async function declineRequest(
  db: AppDatabase,
  input: { id: string; reason: string; resolvedByLabel: string },
): Promise<ResolveOutcome> {
  const answer = await answerable(db, input.id);
  if (!answer.ok) return answer;
  await db
    .update(tournamentModeRequests)
    .set({
      resolvedAt: new Date(),
      resolution: "declined",
      resolvedByLabel: input.resolvedByLabel,
      declineReason: input.reason,
    })
    .where(eq(tournamentModeRequests.id, input.id));
  return { ok: true };
}

/**
 * The desk says yes. Called inside the switch's own transaction, so a switch that fails leaves the ask
 * pending rather than answered by an act that never happened.
 */
export async function confirmRequestIn(
  tx: Executor,
  input: { id: string; resolvedByLabel: string; now: Date },
): Promise<ResolveOutcome> {
  const answer = await answerable(tx, input.id);
  if (!answer.ok) return answer;
  await tx
    .update(tournamentModeRequests)
    .set({
      resolvedAt: input.now,
      resolution: "confirmed",
      resolvedByLabel: input.resolvedByLabel,
    })
    .where(eq(tournamentModeRequests.id, input.id));
  return { ok: true };
}
