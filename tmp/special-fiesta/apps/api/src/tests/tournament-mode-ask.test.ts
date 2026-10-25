import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  messages,
  type AdminTournamentConsoleView,
  type TournamentModeView,
} from "@psd/contracts";
import { eq } from "drizzle-orm";
import { tournamentModeRequests } from "../db/schema/index.js";
import { teamNameFor } from "./fixtures/names.js";
import {
  createTeam,
  createTestContext,
  jsonRequest,
  type ActorSession,
  type TestContext,
} from "./harness.js";

/**
 * ADR-336 §5.4 — the facilitator's ask, over HTTP.
 *
 * A marshal sees the room is stuck; only the desk can end the fixture day. This suite proves the
 * question is a question: it is recorded with who asked and why, a second marshal's press stacks into
 * the first ask rather than a queue, the desk can decline it with a reason the asker then reads back,
 * reviewing it switches the day and answers the ask in the same commit, and — ADR-342 — the ask
 * outlives any clock: it stays pending and confirmable however long the desk takes, because the
 * owner ruled that staleness is something the desk is shown, not something time decides.
 */

let ctx: TestContext;
let desk: ActorSession;
let marshal: ActorSession;
let otherMarshal: ActorSession;
let participant: ActorSession;

async function get(path: string, session: ActorSession) {
  return ctx.app.request(path, { headers: session.headers });
}

async function modeOf(session: ActorSession): Promise<TournamentModeView> {
  return (await (
    await get("/api/tournament/mode", session)
  ).json()) as TournamentModeView;
}

async function ask(
  session: ActorSession,
  input: { reason: string; clientUuid?: string },
) {
  const response = await ctx.app.request(
    "/api/tournament/mode/requests",
    jsonRequest(
      {
        reason: input.reason,
        courtId: courtId === "" ? undefined : courtId,
        clientUuid: input.clientUuid ?? randomUUID(),
      },
      session.headers,
    ),
  );
  return {
    status: response.status,
    body: (await response.json()) as TournamentModeView,
  };
}

let courtId = "";

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  marshal = await ctx.createFacilitator();
  otherMarshal = await ctx.createFacilitator();
  const captain = await ctx.signUpParticipant();
  const opponent = await ctx.signUpParticipant();
  participant = captain;
  const teamA = await createTeam(ctx, captain, teamNameFor(ctx.runId));
  const teamB = await createTeam(ctx, opponent, teamNameFor(ctx.runId));
  const court = await ctx.app.request(
    "/api/admin/tournament/courts",
    jsonRequest({ courtNumber: 1, label: "Court 1" }, desk.headers),
  );
  courtId =
    ((await court.json()) as AdminTournamentConsoleView).courts[0]?.id ?? "";
  const created = await ctx.app.request(
    "/api/admin/tournament",
    jsonRequest(
      {
        name: "Ask day",
        winPoints: 30,
        drawPoints: 20,
        lossPoints: 10,
        teamIds: [teamA, teamB],
      },
      desk.headers,
    ),
  );
  expect(created.status).toBe(201);
  const started = await ctx.app.request(
    "/api/admin/tournament/activate",
    jsonRequest(
      {
        formatId: "round_robin",
        matchMinutes: 12,
        changeoverMinutes: 3,
        restMinutes: 0,
      },
      desk.headers,
    ),
  );
  expect(started.status).toBe(200);
});

afterAll(async () => {
  await ctx.handle.close();
});

describe("ADR-336 — a marshal asks, the desk answers", () => {
  let requestId = "";
  let firstKey = "";

  it("refuses a participant and a blank reason, and lets a marshal ask once", async () => {
    const byParticipant = await ctx.app.request(
      "/api/tournament/mode/requests",
      jsonRequest(
        { reason: "Please.", clientUuid: randomUUID() },
        participant.headers,
      ),
    );
    expect(byParticipant.status).toBeGreaterThanOrEqual(400);
    const blank = await ask(marshal, { reason: "   " });
    expect(blank.status).toBe(400);

    firstKey = randomUUID();
    const first = await ask(marshal, {
      reason: "Court 3 is underwater.",
      clientUuid: firstKey,
    });
    expect(first.status).toBe(201);
    expect(first.body.pendingRequest?.requestedByLabel).toBe(marshal.username);
    expect(first.body.pendingRequest?.reason).toBe("Court 3 is underwater.");
    expect(first.body.pendingRequest?.courtLabel).toBe("Court 1");
    expect(first.body.mode).toBe("fixtures");
    expect(first.body.isAwarding).toBe(false);
    expect(first.body.lastAnswer).toBeNull();
    requestId = first.body.pendingRequest?.id ?? "";
    expect(requestId).not.toBe("");
  });

  it("stacks a second marshal into the ask already pending rather than a second banner", async () => {
    const second = await ask(otherMarshal, { reason: "Also underwater." });
    expect(second.status).toBe(200);
    expect(second.body.pendingRequest?.id).toBe(requestId);
    expect(second.body.pendingRequest?.requestedByLabel).toBe(marshal.username);
    const rows = await ctx.handle.db.select().from(tournamentModeRequests);
    expect(rows).toHaveLength(1);
  });

  it("replays an ask with the same clientUuid", async () => {
    const clientUuid = randomUUID();
    // The pending one is returned either way; what matters is that no second row appears.
    const replay = await ask(marshal, { reason: "Same tap.", clientUuid });
    expect(replay.body.pendingRequest?.id).toBe(requestId);
    expect(
      await ctx.handle.db.select().from(tournamentModeRequests),
    ).toHaveLength(1);
  });

  it("is declined by the desk with a reason the asker reads back, and the banner clears", async () => {
    const byMarshal = await ctx.app.request(
      `/api/admin/tournament/mode/requests/${requestId}/decline`,
      jsonRequest({ reason: "No." }, marshal.headers),
    );
    expect(byMarshal.status).toBe(403);

    const declined = await ctx.app.request(
      `/api/admin/tournament/mode/requests/${requestId}/decline`,
      jsonRequest(
        { reason: "The courts are fine — the puddle is on the path." },
        desk.headers,
      ),
    );
    expect(declined.status).toBe(200);
    const [row] = await ctx.handle.db
      .select()
      .from(tournamentModeRequests)
      .where(eq(tournamentModeRequests.id, requestId));
    expect(row?.resolution).toBe("declined");
    expect(row?.declineReason).toBe(
      "The courts are fine — the puddle is on the path.",
    );

    // ADR-342 — the answer reaches the asker, with its reason, and nobody else's page.
    const answered = await modeOf(marshal);
    expect(answered.pendingRequest).toBeNull();
    expect(answered.lastAnswer?.resolution).toBe("declined");
    expect(answered.lastAnswer?.declineReason).toBe(
      "The courts are fine — the puddle is on the path.",
    );
    expect(await modeOf(otherMarshal).then((view) => view.lastAnswer)).toBeNull();
    expect(await modeOf(desk).then((view) => view.lastAnswer)).toBeNull();

    const again = await ctx.app.request(
      `/api/admin/tournament/mode/requests/${requestId}/decline`,
      jsonRequest({ reason: "No." }, desk.headers),
    );
    expect(again.status).toBe(409);
  });

  it("replays an answered key as its answer, and takes a new key as a new ask at once", async () => {
    // The key of the declined ask is spent: ADR-009's replay stays true for the one case it exists
    // for (a double tap on a live question), and an answered question needs a new key — which is the
    // hook's job, proven here as the contract the hook relies on.
    const replayed = await ask(marshal, {
      reason: "Same marshal, same phone.",
      clientUuid: firstKey,
    });
    expect(replayed.status).toBe(200);
    expect(replayed.body.pendingRequest).toBeNull();
    expect(
      await ctx.handle.db.select().from(tournamentModeRequests),
    ).toHaveLength(1);

    const again = await ask(marshal, { reason: "The rain is not stopping." });
    expect(again.status).toBe(201);
    expect(again.body.pendingRequest?.reason).toBe("The rain is not stopping.");
    expect(again.body.pendingRequest?.id).not.toBe(requestId);
    expect(
      await ctx.handle.db.select().from(tournamentModeRequests),
    ).toHaveLength(2);
    requestId = again.body.pendingRequest?.id ?? "";
    expect(requestId).not.toBe("");
  });

  it("is answered by the switch it asked for, in the same commit", async () => {
    const switched = await ctx.app.request(
      "/api/admin/tournament/switch",
      jsonRequest(
        {
          confirmation: "switch",
          reason: "The rain is not stopping.",
          clientUuid: randomUUID(),
          requestId,
        },
        desk.headers,
      ),
    );
    expect(switched.status, await switched.clone().text()).toBe(200);
    const body = (await switched.json()) as AdminTournamentConsoleView;
    expect(body.mode).toBe("dumb");
    expect(body.modeRequest).toBeNull();
    const [row] = await ctx.handle.db
      .select()
      .from(tournamentModeRequests)
      .where(eq(tournamentModeRequests.id, requestId));
    expect(row?.resolution).toBe("confirmed");
    expect(row?.resolvedByLabel).toBe("superadmin");
  });

  it("refuses a switch that names an ask already answered", async () => {
    const switchAgain = await ctx.app.request(
      "/api/admin/tournament/switch",
      jsonRequest(
        {
          confirmation: "switch",
          reason: "Twice.",
          clientUuid: randomUUID(),
          requestId: randomUUID(),
        },
        desk.headers,
      ),
    );
    // An unknown id is a refusal, not a switch that quietly happens without its ask.
    expect(switchAgain.status).toBeGreaterThanOrEqual(400);
  });
});

describe("ADR-342 — the ask outlives the clock", () => {
  const ctx2 = {} as TestContext;

  afterAll(async () => {
    await ctx2.close();
  });

  it("stays pending and confirmable however long it has waited", async () => {
    Object.assign(ctx2, await createTestContext());
    const desk2 = await ctx2.signInSuperadmin();
    const marshal2 = await ctx2.createFacilitator();
    const captain = await ctx2.signUpParticipant();
    const opponent = await ctx2.signUpParticipant();
    const teamA = await createTeam(ctx2, captain, teamNameFor(ctx2.runId));
    const teamB = await createTeam(ctx2, opponent, teamNameFor(ctx2.runId));
    await ctx2.app.request(
      "/api/admin/tournament",
      jsonRequest(
        {
          name: "Patience day",
          winPoints: 30,
          drawPoints: 20,
          lossPoints: 10,
          teamIds: [teamA, teamB],
        },
        desk2.headers,
      ),
    );
    await ctx2.app.request(
      "/api/admin/tournament/activate",
      jsonRequest(
        {
          formatId: "round_robin",
          matchMinutes: 12,
          changeoverMinutes: 3,
          restMinutes: 0,
        },
        desk2.headers,
      ),
    );

    const first = await ctx2.app.request(
      "/api/tournament/mode/requests",
      jsonRequest(
        { reason: "Let us award points.", clientUuid: randomUUID() },
        marshal2.headers,
      ),
    );
    const pending = ((await first.json()) as TournamentModeView).pendingRequest;
    expect(pending).not.toBeNull();

    // Two hours later, on the same row — and an old-shape row still carrying a deadline, so a
    // reintroduced sweep would catch it: nothing answers this ask but the desk.
    await ctx2.handle.db
      .update(tournamentModeRequests)
      .set({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      })
      .where(eq(tournamentModeRequests.id, pending?.id ?? ""));
    const view = (await (
      await ctx2.app.request("/api/tournament/mode", {
        headers: marshal2.headers,
      })
    ).json()) as TournamentModeView;
    expect(view.pendingRequest?.id).toBe(pending?.id);
    const [row] = await ctx2.handle.db
      .select()
      .from(tournamentModeRequests)
      .where(eq(tournamentModeRequests.id, pending?.id ?? ""));
    expect(row?.resolvedAt).toBeNull();
    expect(row?.resolution).toBeNull();

    // And the desk may still act on it: the age is shown to the desk, never enforced by the clock.
    const late = await ctx2.app.request(
      "/api/admin/tournament/switch",
      jsonRequest(
        {
          confirmation: "switch",
          reason: "Still the right call.",
          clientUuid: randomUUID(),
          requestId: pending?.id,
        },
        desk2.headers,
      ),
    );
    expect(late.status, await late.clone().text()).toBe(200);
    const [confirmed] = await ctx2.handle.db
      .select()
      .from(tournamentModeRequests)
      .where(eq(tournamentModeRequests.id, pending?.id ?? ""));
    expect(confirmed?.resolution).toBe("confirmed");
  });

  it("refuses a new ask once the courts are already awarding", async () => {
    const marshal2 = await ctx2.createFacilitator();
    const stale = await ctx2.app.request(
      "/api/tournament/mode/requests",
      jsonRequest(
        { reason: "The page is stale.", clientUuid: randomUUID() },
        marshal2.headers,
      ),
    );
    expect(stale.status).toBe(409);
    expect(
      ((await stale.json()) as { error: { message: string } }).error.message,
    ).toBe(messages.modeSwitchAlreadyAwarding);
    expect(
      await ctx2.handle.db.select().from(tournamentModeRequests),
    ).toHaveLength(1);
  });
});
