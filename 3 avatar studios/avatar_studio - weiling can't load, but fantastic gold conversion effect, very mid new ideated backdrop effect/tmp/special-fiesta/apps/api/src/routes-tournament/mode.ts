import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import {
  askSwitchRequestSchema,
  type TournamentModeView,
} from "@psd/contracts";
import type { AppDatabase, Executor } from "../db/client.js";
import { firstOrNull } from "../db/rows.js";
import { tournamentMatches } from "../db/schema/index.js";
import { HttpError, readBody } from "../lib/http.js";
import {
  requireFacilitator,
  requireStaff,
  type AppBindings,
} from "../lib/session.js";
import { isAwarding, readOperatingMode } from "../tournament-mode/mode.js";
import {
  askToSwitch,
  latestAnswerBy,
  pendingRequestView,
} from "../tournament-mode/requests.js";

/**
 * ADR-336 §5.4 — the facilitator's side of the switch: what the room is doing, and the ask.
 *
 * Both live in the composition root because both need the mode, which is cross-tournament
 * orchestration (ADR-338). The ask is a question for the desk, not a capability: it is recorded with
 * who asked and why, and only a superadmin can answer it — in person, because ADR-342 ruled the ask
 * outlives any clock: nothing here expires it, and the desk is shown its age instead.
 *
 * `?courtId=` makes the answer per court, which is what a court page needs during the drain: the
 * room may be `switching` while this court still has a match on it.
 */

/** Is this court still playing, or is it an award station? A court with no live match awards at once. */
async function isAwardingOn(
  db: Executor,
  input: { mode: "fixtures" | "switching" | "dumb"; courtId: string | null },
): Promise<boolean> {
  if (!isAwarding(input.mode)) return false;
  if (input.mode === "dumb" || input.courtId === null) return true;
  const busy = firstOrNull(
    await db
      .select({ id: tournamentMatches.id })
      .from(tournamentMatches)
      .where(
        and(
          eq(tournamentMatches.courtId, input.courtId),
          eq(tournamentMatches.status, "in_progress"),
        ),
      )
      .limit(1),
  );
  return busy === null;
}

export async function modeView(
  db: AppDatabase,
  input: { courtId: string | null; askedById: string | null },
): Promise<TournamentModeView> {
  const mode = await readOperatingMode(db);
  return {
    mode,
    isAwarding: await isAwardingOn(db, { mode, courtId: input.courtId }),
    pendingRequest: await pendingRequestView(db),
    // ADR-342 — the asker's own latest answer: how a court learns the desk said no, and why.
    lastAnswer:
      input.askedById === null
        ? null
        : await latestAnswerBy(db, input.askedById),
  };
}

export function registerModeRoutes(routes: Hono<AppBindings>): void {
  routes.get("/mode", async (c) => {
    // §5.4 — the desk reads the same mode; a marshal asks about it, the desk answers. A superadmin
    // has no asks of their own, so their read carries no answer.
    const actor = requireStaff(c);
    const askedById = actor.type === "facilitator" ? actor.facilitator.id : null;
    const courtId = c.req.query("courtId") ?? null;
    return c.json(await modeView(c.get("db"), { courtId, askedById }));
  });

  routes.post("/mode/requests", async (c) => {
    const session = requireFacilitator(c);
    const body = await readBody(c, askSwitchRequestSchema);
    const outcome = await askToSwitch(c.get("db"), {
      actor: session.facilitator,
      reason: body.reason,
      courtId: body.courtId ?? null,
      clientUuid: body.clientUuid,
    });
    if (!outcome.ok) throw new HttpError(outcome.status, outcome.error);
    return c.json(
      await modeView(c.get("db"), {
        courtId: body.courtId ?? null,
        askedById: session.facilitator.id,
      }),
      outcome.created ? 201 : 200,
    );
  });
}
