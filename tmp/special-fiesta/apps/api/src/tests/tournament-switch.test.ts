import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  messages,
  type AdminTournamentConsoleView,
  type DumbCourtView,
} from "@psd/contracts";
import {
  announcements,
  tournamentModeChanges,
  tournaments,
} from "../db/schema/index.js";
import { teamNameFor } from "./fixtures/names.js";
import {
  createTeam,
  createTestContext,
  jsonRequest,
  type ActorSession,
  type TestContext,
} from "./harness.js";

/**
 * ADR-336 phase 2 — the desk switch and the per-court drain, over HTTP.
 *
 * The unit suite proves the derivation (`tournament-tier-derivation.test.ts`); this one proves the
 * acts that only the composition root can make: the typed word, one transaction, a paused bracket, an
 * award day over the same teams, a court that awards the moment *its own* match closes, a team still
 * playing that may not be paid, and a bracket that ends itself with the switch's own words.
 *
 * The suite is deliberately two contexts. The first switches with a match on court (the drain); the
 * second switches with nothing live, which must end the fixtures inside the same act.
 */

const SWITCH = "/switch";

interface Posted<T> {
  status: number;
  body: T;
}

type Ctx = TestContext & { desk: ActorSession; marshal: ActorSession };

function clientOf(ctx: Ctx) {
  return {
    desk: async <T>(
      path: string,
      body: unknown,
      session?: ActorSession,
    ): Promise<Posted<T>> => {
      const target = session ?? ctx.desk;
      const response = await ctx.app.request(
        `/api/admin/tournament${path}`,
        jsonRequest(body, target.headers),
      );
      return { status: response.status, body: (await response.json()) as T };
    },
    marshal: async <T>(
      path: string,
      body: unknown,
      session?: ActorSession,
    ): Promise<Posted<T>> => {
      const target = session ?? ctx.marshal;
      const response = await ctx.app.request(
        `/api/tournament${path}`,
        jsonRequest(body, target.headers),
      );
      return { status: response.status, body: (await response.json()) as T };
    },
    get: (path: string, session: ActorSession) =>
      ctx.app.request(path, { headers: session.headers }),
  };
}

async function setUpBracket(
  ctx: Ctx,
  input: { name: string; startMatch: boolean },
) {
  const c = clientOf(ctx);
  const participants = await Promise.all(
    [0, 1, 2, 3].map(() => ctx.signUpParticipant()),
  );
  const teamIds: string[] = [];
  for (const participant of participants) {
    teamIds.push(await createTeam(ctx, participant, teamNameFor(ctx.runId)));
  }
  const court = await c.desk<AdminTournamentConsoleView>("/courts", {
    courtNumber: 1,
    label: "Court 1",
  });
  await c.desk("/courts", { courtNumber: 2, label: "Court 2" });
  const courtId = court.body.courts[0]?.id ?? "";
  const created = await c.desk<AdminTournamentConsoleView>("", {
    name: input.name,
    winPoints: 30,
    drawPoints: 20,
    lossPoints: 10,
    teamIds,
  });
  expect(created.status).toBe(201);
  const started = await c.desk<AdminTournamentConsoleView>("/activate", {
    formatId: "round_robin",
    matchMinutes: 12,
    changeoverMinutes: 3,
    restMinutes: 0,
  });
  expect(started.status).toBe(200);
  const first = started.body.tournament?.matches.find(
    (match) => match.a.teamId !== null && match.b.teamId !== null,
  );
  const live = input.startMatch
    ? await c.marshal<{ match: { id: string } }>("/matches", {
        courtId,
        teamAId: first?.a.teamId,
        teamBId: first?.b.teamId,
      })
    : null;
  if (input.startMatch)
    expect(live?.status, JSON.stringify(live?.body)).toBe(201);
  return {
    courtId,
    freeCourtId: court.body.courts[1]?.id ?? courtId,
    teamIds,
    playing: [first?.a.teamId ?? "", first?.b.teamId ?? ""] as const,
    matchId: live?.body.match.id ?? first?.id ?? "",
    c,
  };
}

describe("ADR-336 — the switch, with a match on court", () => {
  const ctx = {} as Ctx;
  let allTeams: string[] = [];
  let courtId = "";
  let playing: readonly [string, string] = ["", ""];
  let idle = "";
  let freeCourtId = "";
  let matchId = "";
  let clientUuid = "";
  const reason = "Court 3 is unplayable — the rest of the day is on points.";

  beforeAll(async () => {
    const created = await createTestContext();
    Object.assign(ctx, created);
    ctx.desk = await created.signInSuperadmin();
    ctx.marshal = await created.createFacilitator();
    const day = await setUpBracket(ctx, {
      name: "Switch day",
      startMatch: true,
    });
    courtId = day.courtId;
    freeCourtId = day.freeCourtId;
    allTeams = day.teamIds;
    playing = day.playing;
    idle = day.teamIds.find((teamId) => !playing.includes(teamId)) ?? "";
    matchId = day.matchId;
  });

  afterAll(async () => {
    await ctx.handle.close();
  });

  it("refuses a facilitator, the wrong word, and a missing reason — and switches nothing", async () => {
    const c = clientOf(ctx);
    const byMarshal = await c.desk<{ error: { message: string } }>(
      SWITCH,
      {
        confirmation: "switch",
        reason,
        clientUuid: randomUUID(),
      },
      ctx.marshal,
    );
    expect(byMarshal.status).toBe(403);

    const wrongWord = await c.desk<{ error: { message: string } }>(SWITCH, {
      confirmation: "yes",
      reason,
      clientUuid: randomUUID(),
    });
    // Trimmed and case-insensitive, but the word itself is the guard: "yes" is not a confirmation.
    expect(wrongWord.status).toBe(400);
    expect(wrongWord.body.error.message).toBe(messages.modeSwitchNeedsWord);

    const noReason = await c.desk<{ error: { message: string } }>(SWITCH, {
      confirmation: "switch",
      reason: "  ",
      clientUuid: randomUUID(),
    });
    expect(noReason.status).toBe(400);

    const { readOperatingMode } = await import("../tournament-mode/mode.js");
    expect(await readOperatingMode(ctx.handle.db)).toBe("fixtures");
    expect(await ctx.handle.db.select().from(tournamentModeChanges)).toEqual(
      [],
    );
  });

  it("switches in one act: the bracket pauses, an award day starts over the same teams, with the day’s own rates as buttons", async () => {
    const c = clientOf(ctx);
    clientUuid = randomUUID();
    const switched = await c.desk<AdminTournamentConsoleView>(SWITCH, {
      confirmation: "  Switch ",
      reason,
      clientUuid,
    });
    expect(switched.status, JSON.stringify(switched.body)).toBe(200);
    expect(switched.body.mode).toBe("switching");

    const [bracket] = await ctx.handle.db.select().from(tournaments);
    expect(bracket?.status).toBe("live");
    // A live match was on court: the bracket is paused and waiting for it, not closed under it.
    expect(bracket?.pausedAt).not.toBeNull();

    const day = await c.get(
      "/api/tournament/dumb/courts/" + courtId,
      ctx.marshal,
    );
    const court = (await day.json()) as DumbCourtView;
    expect(court.tiers).toEqual([
      { label: "30 pts", points: 30 },
      { label: "20 pts", points: 20 },
      { label: "10 pts", points: 10 },
    ]);
    // The award day holds the whole field — the two on court included, since they are the same teams.
    expect(court.teams.map((team) => team.teamId).sort()).toEqual(
      [...allTeams].sort(),
    );

    const [change] = await ctx.handle.db.select().from(tournamentModeChanges);
    expect(change?.reason).toBe(reason);
    expect(change?.clientUuid).toBe(clientUuid);
    expect(change?.tiers).toEqual(court.tiers);

    const told = await ctx.handle.db.select().from(announcements);
    expect(told.map((row) => row.body)).toContain(
      messages.modeSwitchedAnnouncement,
    );

    expect(switched.body.modeSwitch?.fixturesEnded).toBe(false);
    expect(
      switched.body.modeSwitch?.courts.find((row) => row.courtId === courtId)
        ?.isFinishing,
    ).toBe(true);
  });

  it("replays a repeated clientUuid rather than making a second award day", async () => {
    const c = clientOf(ctx);
    const again = await c.desk<AdminTournamentConsoleView>(SWITCH, {
      confirmation: "switch",
      reason,
      clientUuid,
    });
    expect(again.status).toBe(200);
    expect(
      await ctx.handle.db.select().from(tournamentModeChanges),
    ).toHaveLength(1);
    const dumbDays = (await ctx.handle.db.select().from(tournaments)).filter(
      (row) => row.kind === "dumb_courts",
    );
    expect(dumbDays).toHaveLength(1);
  });

  it("stops the bracket taking new matches, and every surface reads the mixed window", async () => {
    const c = clientOf(ctx);
    const teams = playing;
    const refused = await c.marshal<{ error: { message: string } }>(
      "/matches",
      {
        courtId: freeCourtId,
        teamAId: teams[0],
        teamBId: idle,
      },
    );
    // A free court, so the refusal is the pause itself and not "that court is busy" — the order of
    // the engine's own checks, which is what a marshal reads.
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toBe(messages.tournamentPaused);

    const status = await c.get("/api/tournament/dumb/status", ctx.marshal);
    expect(((await status.json()) as { active: boolean }).active).toBe(true);
    const { readOperatingMode } = await import("../tournament-mode/mode.js");
    expect(await readOperatingMode(ctx.handle.db)).toBe("switching");
  });

  it("refuses to pay a team that is still playing, naming its court", async () => {
    const c = clientOf(ctx);
    const refused = await c.marshal<{ error: { message: string } }>(
      `/dumb/courts/${courtId}/awards`,
      {
        teamId: playing[0],
        tierLabel: "30 pts",
        clientAwardUuid: randomUUID(),
      },
    );
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.error.message).toContain("Court 1");

    // A team with nothing on court is paid at once: that is the per-court half of the switch.
    const paid = await c.marshal<DumbCourtView>(
      `/dumb/courts/${courtId}/awards`,
      {
        teamId: idle,
        tierLabel: "30 pts",
        clientAwardUuid: randomUUID(),
      },
    );
    expect(paid.status).toBe(201);
    expect(paid.body.awards[0]?.points).toBe(30);
  });

  it("ends the bracket itself, as the system, in the switch’s own words, the moment the last court closes", async () => {
    const c = clientOf(ctx);
    const scored = await c.marshal<{ error?: { message: string } }>(
      "/matches/" + matchId + "/score",
      {
        side: "a",
        from: 0,
        to: 1,
      },
    );
    expect(scored.status, JSON.stringify(scored.body)).toBe(200);
    const completed = await c.marshal("/matches/" + matchId + "/complete", {
      winnerTeamId: playing[0],
    });
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);

    const [bracket] = (await ctx.handle.db.select().from(tournaments)).filter(
      (row) => row.kind === "captains_ball",
    );
    expect(bracket?.status).toBe("closed");
    expect(bracket?.closeReason).toBe(reason);
    const events = await ctx.handle.db.select().from(announcements);
    expect(events.map((row) => row.body)).toContain(
      messages.modeFixturesEndedAnnouncement,
    );
    const { readOperatingMode } = await import("../tournament-mode/mode.js");
    expect(await readOperatingMode(ctx.handle.db)).toBe("dumb");

    // The desk's own read: no drain left, and the fixtures it retired are over.
    const console_ = await c.get("/api/admin/tournament", ctx.desk);
    const body = (await console_.json()) as AdminTournamentConsoleView;
    expect(body.mode).toBe("dumb");
    expect(body.modeSwitch?.fixturesEnded).toBe(true);

    // And a closed bracket keeps scoring nothing: the paired team is awardable now.
    const paid = await c.marshal<DumbCourtView>(
      `/dumb/courts/${courtId}/awards`,
      {
        teamId: playing[0],
        tierLabel: "10 pts",
        clientAwardUuid: randomUUID(),
      },
    );
    expect(paid.status).toBe(201);
  });
  /*
   * ADR-341 (§7 option B) — the switch is one-way, but the morning happened. The feed keeps the
   * bracket's finished matches beside the award ledger and says `mixed`, so the participant who
   * watched a match at 13:00 can still find it at 14:30.
   */
  it("keeps the matches played before the switch in Results, beside the awards (ADR-341)", async () => {
    const c = clientOf(ctx);
    const feed = await c.get("/api/tournament/matches/feed", ctx.marshal);
    const body = (await feed.json()) as {
      mode: string;
      items: { id: string; status: string; teamAName: string }[];
      awards: { points: number }[];
    };
    expect(body.mode).toBe("mixed");
    expect(body.items.map((item) => item.id)).toContain(matchId);
    expect(body.items.every((item) => item.status === "completed")).toBe(true);
    // Both halves are present: the ledger the room is watching and the bracket it watched.
    expect(body.awards.length).toBeGreaterThan(0);
  });
});

describe("ADR-336 — a switch with nothing on court ends the fixtures inside the same act", () => {
  const ctx = {} as Ctx;

  beforeAll(async () => {
    const created = await createTestContext();
    Object.assign(ctx, created);
    ctx.desk = await created.signInSuperadmin();
    ctx.marshal = await created.createFacilitator();
    await setUpBracket(ctx, { name: "Quiet day", startMatch: false });
  });

  afterAll(async () => {
    await ctx.handle.close();
  });

  it("closes the bracket now, as the system, with nothing left paused for the desk to click", async () => {
    const c = clientOf(ctx);
    const switched = await c.desk<AdminTournamentConsoleView>(SWITCH, {
      confirmation: "switch",
      reason: "Nobody signed up for the bracket.",
      clientUuid: randomUUID(),
    });
    expect(switched.status, JSON.stringify(switched.body)).toBe(200);
    expect(switched.body.mode).toBe("dumb");

    const [bracket] = (await ctx.handle.db.select().from(tournaments)).filter(
      (row) => row.kind === "captains_ball",
    );
    expect(bracket?.status).toBe("closed");
    expect(bracket?.closeReason).toBe("Nobody signed up for the bracket.");
    expect(switched.body.modeSwitch?.fixturesEnded).toBe(true);
  });

  it("answers `dumb`, not `mixed`, on a day that never played a match (ADR-341)", async () => {
    const c = clientOf(ctx);
    const feed = await c.get("/api/tournament/matches/feed", ctx.marshal);
    const body = (await feed.json()) as { mode: string; items: unknown[]; awards: unknown[] };
    // Nothing was played, so there is no earlier half to show — the plain award ledger it always was.
    expect(body.mode).toBe("dumb");
    expect(body.items).toEqual([]);
  });

  it("refuses a second switch while the award day is running", async () => {
    const c = clientOf(ctx);
    const again = await c.desk<{ error: { message: string } }>(SWITCH, {
      confirmation: "switch",
      reason: "Trying it twice.",
      clientUuid: randomUUID(),
    });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe(messages.modeSwitchNoFixtures);
  });
});
