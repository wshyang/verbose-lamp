import type { ReactElement } from "react";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AdminTournamentConsoleView,
  ContingencyPreviewView,
  TimetableView,
  TournamentDraftSetup,
} from "@psd/contracts";
import {
  installFetchStub,
  type FetchStub,
  type RouteTable,
} from "../../test-utils/fetchStub.js";
import { superadminSession } from "../../test-utils/fixtures.js";
import { renderWithProviders } from "../../test-utils/renderWithProviders.js";
import {
  adminMatch,
  adminTournament,
  consoleView,
} from "../../test-utils/tournamentFixtures.js";
import { TournamentControlPage } from "./TournamentControlPage.js";
import {
  courtOf,
  fitSummary,
  roomLine,
  TournamentSimulatorPage,
} from "./TournamentSimulatorPage.js";
import { scoreLine } from "./MatchesPanel.js";
import { advancerLine, waitingGroupLine } from "./DayPanel.js";
import { TournamentTimetablePage } from "./TournamentTimetablePage.js";

/**
 * ADR-279 — the Tournament tab's three subtabs, rendered with the real hooks and router; only fetch is
 * stubbed. Every write is asserted by what the page sent, and by what the page then shows.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

/** A second render in one test: the first page and its stub go first. */
function cleanupStub() {
  cleanup();
  stub.restore();
}

function render(page: ReactElement, routes: RouteTable) {
  stub = installFetchStub({
    "GET /api/auth/session": { body: superadminSession },
    ...routes,
  });
  return renderWithProviders(page);
}

describe("advancerLine — the reconciled handover on the desk (ADR-320)", () => {
  it("names the table points as ranking-only and labels the shortfall fill", () => {
    const stage = {
      id: "s1",
      code: "GRP",
      hasStarted: true,
      rosterCount: 0,
      label: "Groups",
      kind: "pool" as const,
      status: "active" as const,
      advanceCount: 1,
      tablePoints: { win: 2, draw: 1, loss: 0 },
      intake: null,
      advancers: [
        { teamId: "t1", name: "Reds", place: 1, via: "qualifier" as const },
        { teamId: "t2", name: "Blues", place: 4, via: "fill" as const },
      ],
      cutTies: [],
      groups: [],
      standings: [],
    };
    expect(advancerLine(stage)).toBe(
      "Table points 2/1/0 (ranking only). Through: #1 Reds · #4 Blues (fill).",
    );
    expect(advancerLine({ ...stage, advancers: [] })).toBe(
      "Table points 2/1/0 (ranking only).",
    );
  });
});

describe("waitingGroupLine — a group whose teams are not decided yet (ADR-325)", () => {
  const base = {
    id: "s2",
    code: "PL2",
    hasStarted: false,
    rosterCount: 0,
    label: "Second pools",
    kind: "pool" as const,
    status: "pending" as const,
    advanceCount: 1,
    tablePoints: { win: 3, draw: 1, loss: 0 },
    advancers: [],
    cutTies: [],
    standings: [],
    intake: { fromLabel: "Groups", count: 6 },
  };

  it("says which stage decides it, for each empty group of a stage that is waiting on one", () => {
    const stage = {
      ...base,
      groups: [{ id: "g1", code: "PA", label: "Group A", standings: [] }],
    };
    expect(waitingGroupLine(stage, stage.groups[0]!)).toBe(
      "Group A: decided when Groups closes.",
    );
  });

  it("says nothing for a group that already has a table", () => {
    const row = {
      name: "Reds",
      rank: 1,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      difference: 0,
      points: 0,
      explanation: "",
      teamId: "t1",
    };
    const stage = {
      ...base,
      groups: [{ id: "g1", code: "PA", label: "Group A", standings: [row] }],
    };
    expect(waitingGroupLine(stage, stage.groups[0]!)).toBeNull();
  });

  it("says nothing for a stage with no intake: an empty group there is not waiting on anything", () => {
    const stage = {
      ...base,
      intake: null,
      groups: [{ id: "g1", code: "A", label: "Group A", standings: [] }],
    };
    expect(waitingGroupLine(stage, stage.groups[0]!)).toBeNull();
  });
});

const entrants = [
  {
    teamId: "t1",
    name: "Reds",
    entryOrder: 1,
    withdrawnAt: null,
    awardedPoints: 30,
  },
  {
    teamId: "t2",
    name: "Blues",
    entryOrder: 2,
    withdrawnAt: "2026-10-15T02:30:00.000Z",
    awardedPoints: 10,
  },
];

const live = adminTournament({
  scheduler: {
    format: "round_robin",
    options: {},
    status: "active",
    matchMinutes: 12,
    changeoverMinutes: 3,
    restMinutes: 0,
    deadlineAt: null,
    plannedAt: null,
    terminatedAt: null,
    terminatedByLabel: null,
    terminateReason: null,
    revision: 1,
  },
  fit: {
    remainingMatches: 1,
    courtMinutes: 12,
    projectedFinishAt: "2026-10-15T03:00:00.000Z",
    fitsDeadline: false,
    overrunMinutes: 7,
  },
  entrants,
  stages: [
    {
      id: "s1",
      code: "GRP",
      hasStarted: false,
      rosterCount: 0,
      label: "Pool",
      kind: "pool",
      status: "active",
      advanceCount: 0,
      tablePoints: { win: 3, draw: 1, loss: 0 },
      intake: null,
      advancers: [],
      cutTies: [],
      groups: [
        {
          id: "g",
          code: "A",
          label: "Group A",
          standings: [
            {
              teamId: "t1",
              name: "Reds",
              played: 1,
              wins: 1,
              draws: 0,
              losses: 0,
              difference: 2,
              points: 3,
              rank: 1,
              explanation: "Top on 3 pts.",
            },
          ],
        },
      ],
      standings: [],
    },
  ],
  matches: [
    adminMatch({
      id: "done",
      status: "completed",
      scoreA: 2,
      scoreB: 0,
      resultKind: "score",
      winnerSide: "a",
      endedAt: "2026-10-15T02:12:00.000Z",
    }),
    adminMatch({
      id: "walk",
      status: "completed",
      resultKind: "walkover",
      winnerSide: "b",
      endedAt: "2026-10-15T02:13:00.000Z",
      isVoided: true,
    }),
    adminMatch({ id: "next", isPinned: true }),
    adminMatch({
      id: "tbd",
      a: {
        label: "Winner of #1",
        teamId: null,
        teamName: null,
        isSeated: false,
        seatOverrideReason: null,
      },
    }),
  ],
});

describe("Control — setup", () => {
  it("creates a draft with the teams picked, refuses a Start the format cannot play, then starts", async () => {
    const draftEntrants = entrants.map((entrant) => ({
      ...entrant,
      withdrawnAt: null,
      awardedPoints: 0,
    }));
    const draft = consoleView(
      adminTournament({ status: "draft", entrants: draftEntrants }),
    );
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
      "POST /api/admin/tournament": { body: draft },
      "POST /api/admin/tournament/activate": { body: consoleView(live) },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("tournament-setup__pick-all"));
    await user.click(screen.getByTestId("tournament-setup__create"));
    expect(stub.callsTo("POST /api/admin/tournament")[0]?.body).toMatchObject({
      teamIds: ["t1", "t2"],
    });
    // Two teams: groups then knockout needs at least four, in the engine's own words.
    expect(
      await screen.findByTestId("tournament-setup__problem"),
    ).toHaveTextContent(/at least 4/);
    expect(screen.getByTestId("tournament-setup__start")).toBeDisabled();
    await user.selectOptions(
      screen.getByTestId("tournament-setup__format"),
      "round_robin",
    );
    await waitFor(() =>
      expect(screen.queryByTestId("tournament-setup__problem")).toBeNull(),
    );
    await user.click(screen.getByTestId("tournament-setup__start"));
    expect(
      stub.callsTo("POST /api/admin/tournament/activate")[0]?.body,
    ).toMatchObject({ formatId: "round_robin", matchMinutes: 12 });
    expect(await screen.findByTestId("tournament-scheduler")).toHaveTextContent(
      "round_robin, active",
    );
  });

  it("shows the options each format reads, and discards a draft", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(adminTournament({ status: "draft" })),
      },
      "POST /api/admin/tournament/discard": {
        body: consoleView(
          adminTournament({
            status: "closed",
            closeReason: "Discarded before it started.",
          }),
        ),
      },
    });
    const user = userEvent.setup();
    expect(
      await screen.findByTestId("tournament-setup__group-size"),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByTestId("tournament-setup__format"),
      "swiss",
    );
    expect(screen.getByTestId("tournament-setup__rounds")).toBeInTheDocument();
    expect(screen.queryByTestId("tournament-setup__third-place")).toBeNull();
    await user.click(screen.getByTestId("tournament-setup__discard"));
    expect(
      await screen.findByTestId("tournament-control__closed"),
    ).toHaveTextContent("Discarded before it started.");
    expect(screen.getByTestId("tournament-setup__draft")).toBeInTheDocument();
  });
});

describe("Control — setup by stages (ADR-311)", () => {
  const nineEntrants = Array.from({ length: 9 }, (_, index) => ({
    teamId: `t${index + 1}`,
    name: `Team ${index + 1}`,
    entryOrder: index + 1,
    withdrawnAt: null,
    awardedPoints: 0,
  }));
  const draftOfNine = () =>
    consoleView(adminTournament({ status: "draft", entrants: nineEntrants }));
  const pipelineLive = () =>
    adminTournament({
      scheduler: {
        format: "pipeline",
        options: {},
        status: "active",
        matchMinutes: 12,
        changeoverMinutes: 3,
        restMinutes: 0,
        deadlineAt: null,
        plannedAt: null,
        terminatedAt: null,
        terminatedByLabel: null,
        terminateReason: null,
        revision: 1,
      },
      entrants: nineEntrants,
    });

  it("starts the template pipeline: two stages with their own minutes, and no formatId", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: draftOfNine() },
      "POST /api/admin/tournament/activate": {
        body: consoleView(pipelineLive()),
      },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("tournament-setup__build"),
      "pipeline",
    );
    // The template is only a default presentation: groups at 15, knockouts at 20.
    expect(screen.getByTestId("tournament-setup__stage-0-code")).toHaveValue(
      "GRP",
    );
    expect(screen.getByTestId("tournament-setup__stage-0-minutes")).toHaveValue(
      "15",
    );
    expect(screen.getByTestId("tournament-setup__stage-1-code")).toHaveValue(
      "KO",
    );
    expect(screen.getByTestId("tournament-setup__stage-1-minutes")).toHaveValue(
      "20",
    );
    await user.click(screen.getByTestId("tournament-setup__start"));
    const body = stub.callsTo("POST /api/admin/tournament/activate")[0]
      ?.body as {
      formatId?: string;
      pipeline?: {
        stages: { code: string; format: string; matchMinutes: number | null }[];
      };
    };
    expect(body.formatId).toBeUndefined();
    expect(
      body.pipeline?.stages.map((stage) => [
        stage.code,
        stage.format,
        stage.matchMinutes,
      ]),
    ).toEqual([
      ["GRP", "pool", 15],
      ["KO", "bracket", 20],
    ]);
    expect(await screen.findByTestId("tournament-scheduler")).toHaveTextContent(
      "Stage pipeline, active",
    );
  });

  it("opens a saved pipeline draft already built stage by stage, and Start posts it unchanged (ADR-313)", async () => {
    const savedSetup: TournamentDraftSetup = {
      buildMode: "pipeline",
      options: {},
      pipeline: {
        stages: [
          {
            code: "GRP",
            label: "Group stage",
            format: "pool",
            source: { kind: "initial" },
            matchMinutes: 15,
            options: { groupSize: 3, advanceCount: 1 },
          },
          {
            code: "KO",
            label: "Knockout",
            format: "bracket",
            source: { kind: "advancers", fromStage: "GRP", count: 4 },
            matchMinutes: 20,
            options: { hasThirdPlace: false },
          },
        ],
      },
      matchMinutes: 12,
      changeoverMinutes: 3,
      restMinutes: 0,
      deadline: null,
    };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(
          adminTournament({
            status: "draft",
            entrants: nineEntrants,
            draftSetup: savedSetup,
          }),
        ),
      },
      "POST /api/admin/tournament/activate": {
        body: consoleView(pipelineLive()),
      },
    });
    const user = userEvent.setup();
    // No Build switch to flip: the saved answer is already in the form.
    await waitFor(() =>
      expect(screen.getByTestId("tournament-setup__build")).toHaveValue(
        "pipeline",
      ),
    );
    expect(screen.getByTestId("tournament-setup__stage-0-code")).toHaveValue(
      "GRP",
    );
    expect(screen.getByTestId("tournament-setup__stage-0-minutes")).toHaveValue(
      "15",
    );
    expect(screen.getByTestId("tournament-setup__stage-1-code")).toHaveValue(
      "KO",
    );
    expect(screen.getByTestId("tournament-setup__stage-1-minutes")).toHaveValue(
      "20",
    );
    await user.click(screen.getByTestId("tournament-setup__start"));
    const body = stub.callsTo("POST /api/admin/tournament/activate")[0]
      ?.body as {
      formatId?: string;
      pipeline?: unknown;
      matchMinutes?: number;
      changeoverMinutes?: number;
      restMinutes?: number;
      deadlineAt?: string | null;
    };
    expect(body.formatId).toBeUndefined();
    expect(body.pipeline).toEqual(savedSetup.pipeline);
    expect(body).toMatchObject({
      matchMinutes: 12,
      changeoverMinutes: 3,
      restMinutes: 0,
      deadlineAt: null,
    });
    expect(await screen.findByTestId("tournament-scheduler")).toHaveTextContent(
      "Stage pipeline, active",
    );
  });

  it("refuses advancers whose feeder stage is gone, in the engine’s words", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: draftOfNine() },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("tournament-setup__build"),
      "pipeline",
    );
    await user.click(screen.getByTestId("tournament-setup__stage-0-remove"));
    expect(
      await screen.findByTestId("tournament-setup__problem"),
    ).toHaveTextContent(/earlier stage/);
    expect(screen.getByTestId("tournament-setup__start")).toBeDisabled();
  });

  it("builds from scratch: one edited pool stage, the knockout deleted", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: draftOfNine() },
      "POST /api/admin/tournament/activate": {
        body: consoleView(pipelineLive()),
      },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("tournament-setup__build"),
      "pipeline",
    );
    await user.click(screen.getByTestId("tournament-setup__stage-1-remove"));
    const minutes = screen.getByTestId("tournament-setup__stage-0-minutes");
    await user.clear(minutes);
    await user.type(minutes, "18");
    await user.click(screen.getByTestId("tournament-setup__start"));
    const body = stub.callsTo("POST /api/admin/tournament/activate")[0]
      ?.body as {
      pipeline?: { stages: { code: string; matchMinutes: number | null }[] };
    };
    expect(body.pipeline?.stages).toEqual([
      expect.objectContaining({ code: "GRP", matchMinutes: 18 }),
    ]);
  });
});

describe("Control — the stage builder’s edits (ADR-311)", () => {
  const nineEntrants = Array.from({ length: 9 }, (_, index) => ({
    teamId: `t${index + 1}`,
    name: `Team ${index + 1}`,
    entryOrder: index + 1,
    withdrawnAt: null,
    awardedPoints: 0,
  }));

  it("adds, reorders and resets stages; the template is only a default", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(
          adminTournament({ status: "draft", entrants: nineEntrants }),
        ),
      },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("tournament-setup__build"),
      "pipeline",
    );
    await user.click(screen.getByTestId("tournament-setup__stage-add"));
    expect(screen.getByTestId("tournament-setup__stage-2-code")).toHaveValue(
      "S3",
    );
    // The new stage leads after two moves up; the template reset restores GRP then KO.
    await user.click(screen.getByTestId("tournament-setup__stage-2-up"));
    await user.click(screen.getByTestId("tournament-setup__stage-1-up"));
    expect(screen.getByTestId("tournament-setup__stage-0-code")).toHaveValue(
      "S3",
    );
    await user.click(screen.getByTestId("tournament-setup__stage-0-down"));
    expect(screen.getByTestId("tournament-setup__stage-0-code")).toHaveValue(
      "GRP",
    );
    await user.click(screen.getByTestId("tournament-setup__stage-template"));
    expect(screen.getByTestId("tournament-setup__stage-0-code")).toHaveValue(
      "GRP",
    );
    expect(screen.getByTestId("tournament-setup__stage-1-code")).toHaveValue(
      "KO",
    );
    expect(screen.queryByTestId("tournament-setup__stage-2")).toBeNull();
    // A stage with no code offers no feeder to the stage below it, and an emptied
    // list says so plainly: the tournament is whatever you add.
    await user.clear(screen.getByTestId("tournament-setup__stage-0-code"));
    expect(
      within(screen.getByTestId("tournament-setup__stage-1")).getByTestId(
        "tournament-setup__stage-1-from",
      ),
    ).toHaveValue("");
    await user.click(screen.getByTestId("tournament-setup__stage-1-remove"));
    await user.click(screen.getByTestId("tournament-setup__stage-0-remove"));
    expect(screen.getByTestId("tournament-setup__stages")).toHaveTextContent(
      "No stages yet",
    );
    expect(screen.getByTestId("tournament-setup__start")).toBeDisabled();
  });

  it("lets every kind of stage pick where its teams come from, and shows open play honestly (ADR-325)", async () => {
    render(<TournamentSimulatorPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("simulator__build"),
      "pipeline",
    );
    // The knockout becomes a pool and KEEPS its source choice: a pool can take an earlier stage's finishers.
    await user.selectOptions(
      screen.getByTestId("simulator__stage-1-format"),
      "pool",
    );
    expect(
      screen.getByTestId("simulator__stage-1-group-size"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("simulator__stage-1-source")).toHaveValue(
      "advancers",
    );
    expect(screen.getByTestId("simulator__stage-1-from")).toHaveValue("GRP");
    await user.selectOptions(
      screen.getByTestId("simulator__stage-1-format"),
      "open",
    );
    expect(screen.getByTestId("simulator__stage-1")).toHaveTextContent(
      "staged by hand",
    );
    expect(screen.getByTestId("simulator__stage-1-source")).toBeInTheDocument();
    // Third place belongs to a knockout alone.
    expect(screen.queryByTestId("simulator__stage-1-third-place")).toBeNull();
    await user.click(screen.getByTestId("simulator__stage-add"));
    expect(screen.getByTestId("simulator__stage-2-code")).toHaveValue("S3");
    await user.click(screen.getByTestId("simulator__stage-2-remove"));
    expect(screen.queryByTestId("simulator__stage-2")).toBeNull();
  });

  it("offers the first stage the entered teams only, with the reason the other option is off", async () => {
    render(<TournamentSimulatorPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("simulator__build"),
      "pipeline",
    );
    const source = screen.getByTestId("simulator__stage-0-source");
    expect(source).toHaveValue("initial");
    const advancers = within(source).getByRole("option", {
      name: /best finishers of an earlier stage/i,
    });
    expect(advancers).toBeDisabled();
    expect(source).toHaveAccessibleDescription(/no earlier stage/i);
    // And the later stage may pick either.
    const later = within(
      screen.getByTestId("simulator__stage-1-source"),
    ).getByRole("option", { name: /best finishers of an earlier stage/i });
    expect(later).toBeEnabled();
  });

  it("shows each stage what it takes in and sends on, read-only, and keeps it true as the form changes", async () => {
    render(<TournamentSimulatorPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("simulator__build"),
      "pipeline",
    );
    await user.clear(screen.getByTestId("simulator__teamCount"));
    await user.type(screen.getByTestId("simulator__teamCount"), "9");
    expect(screen.getByTestId("simulator__stage-0-ingress")).toHaveTextContent(
      "In: 9 entered teams",
    );
    expect(screen.getByTestId("simulator__stage-0-shape")).toHaveTextContent(
      "3 groups of 3, 9 matches",
    );
    expect(screen.getByTestId("simulator__stage-0-egress")).toHaveTextContent(
      "Out: 3 group winners + the best 1 runner-up, to KO",
    );
    expect(screen.getByTestId("simulator__stage-1-ingress")).toHaveTextContent(
      "In: 4 from GRP",
    );
    expect(screen.getByTestId("simulator__stage-1-egress")).toHaveTextContent(
      "Out: final placings",
    );
    // They are text, not controls.
    expect(
      within(screen.getByTestId("simulator__stage-0-ingress")).queryByRole(
        "textbox",
      ),
    ).toBeNull();
    // Changing the groups changes the numbers under every stage that depends on them.
    await user.type(screen.getByTestId("simulator__stage-0-group-count"), "2");
    // Nine teams in two groups: a group of five (10 matches) and a group of four (6).
    expect(screen.getByTestId("simulator__stage-0-shape")).toHaveTextContent(
      "2 groups of 5, 4, 16 matches",
    );
  });

  it("replaces the numbers with the engine’s sentence when the stage cannot be built", async () => {
    render(<TournamentSimulatorPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("simulator__build"),
      "pipeline",
    );
    await user.clear(screen.getByTestId("simulator__teamCount"));
    await user.type(screen.getByTestId("simulator__teamCount"), "4");
    await user.type(screen.getByTestId("simulator__stage-0-group-count"), "4");
    expect(screen.getByTestId("simulator__stage-0-problem")).toHaveTextContent(
      /at least two teams/i,
    );
    expect(screen.queryByTestId("simulator__stage-0-shape")).toBeNull();
  });
});

describe("Simulator — every stage field (ADR-311)", () => {
  it("edits names, sources, counts and rates across a pool and a bracket stage", async () => {
    render(<TournamentSimulatorPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("simulator__build"),
      "pipeline",
    );
    await user.clear(screen.getByTestId("simulator__teamCount"));
    await user.type(screen.getByTestId("simulator__teamCount"), "9");
    // Pool stage: name, sizing by count, inherited minutes, its own rates.
    const label = screen.getByTestId("simulator__stage-0-label");
    await user.clear(label);
    await user.type(label, "Heats");
    const groupCount = screen.getByTestId("simulator__stage-0-group-count");
    await user.type(groupCount, "3");
    const advance = screen.getByTestId("simulator__stage-0-advance");
    await user.clear(advance);
    await user.type(advance, "1");
    const win = screen.getByTestId("simulator__stage-0-win");
    await user.type(win, "10");
    await user.type(screen.getByTestId("simulator__stage-0-draw"), "5");
    await user.type(screen.getByTestId("simulator__stage-0-loss"), "0");
    // Bracket stage: from the entered teams and back to advancers, with a third place.
    await user.selectOptions(
      screen.getByTestId("simulator__stage-1-source"),
      "initial",
    );
    expect(screen.queryByTestId("simulator__stage-1-count")).toBeNull();
    await user.selectOptions(
      screen.getByTestId("simulator__stage-1-source"),
      "advancers",
    );
    await user.selectOptions(
      screen.getByTestId("simulator__stage-1-from"),
      "GRP",
    );
    const count = screen.getByTestId("simulator__stage-1-count");
    await user.clear(count);
    await user.type(count, "4");
    await user.click(screen.getByTestId("simulator__stage-1-third-place"));
    const minutes = screen.getByTestId("simulator__stage-1-minutes");
    await user.clear(minutes);
    await user.type(minutes, "25");
    // The rehearsal still plans the day through every edit.
    expect(screen.getByTestId("simulator__fit")).toHaveTextContent(
      "matches, last one ends",
    );
  });
});

describe("Control — the venue’s courts (ADR-288)", () => {
  it("adds a court, edits one, and switches one off before any tournament exists", async () => {
    const two = {
      ...consoleView(null),
      courts: [
        ...consoleView(null).courts,
        { id: "c2", courtNumber: 2, label: "Court 2", isEnabled: true },
      ],
    };
    const renamed = {
      ...two,
      courts: [
        { id: "c1", courtNumber: 1, label: "Centre court", isEnabled: true },
        two.courts[1]!,
      ],
    };
    const off = {
      ...renamed,
      courts: [renamed.courts[0]!, { ...two.courts[1]!, isEnabled: false }],
    };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
      "POST /api/admin/tournament/courts": { status: 201, body: two },
      "PUT /api/admin/tournament/courts/c1": { body: renamed },
      "PATCH /api/admin/tournament/courts/c2/enabled": { body: off },
    });
    const user = userEvent.setup();
    expect(await screen.findAllByTestId("tournament-courts__row")).toHaveLength(
      1,
    );
    await user.type(screen.getByTestId("tournament-courts__number"), "2");
    await user.type(screen.getByTestId("tournament-courts__label"), "Court 2");
    await user.click(screen.getByTestId("tournament-courts__submit"));
    expect(stub.callsTo("POST /api/admin/tournament/courts")[0]?.body).toEqual({
      courtNumber: 2,
      label: "Court 2",
    });
    expect(await screen.findAllByTestId("tournament-courts__row")).toHaveLength(
      2,
    );

    await user.click(screen.getAllByTestId("tournament-courts__edit")[0]!);
    expect(screen.getByTestId("tournament-courts__submit")).toHaveTextContent(
      "Save court",
    );
    await user.clear(screen.getByTestId("tournament-courts__label"));
    await user.type(
      screen.getByTestId("tournament-courts__label"),
      "Centre court",
    );
    await user.click(screen.getByTestId("tournament-courts__submit"));
    expect(
      stub.callsTo("PUT /api/admin/tournament/courts/c1")[0]?.body,
    ).toEqual({ courtNumber: 1, label: "Centre court" });
    await waitFor(() =>
      expect(
        screen.getAllByTestId("tournament-courts__row")[0],
      ).toHaveTextContent("#1 Centre court — On"),
    );

    await user.click(screen.getAllByTestId("tournament-courts__toggle")[1]!);
    expect(
      stub.callsTo("PATCH /api/admin/tournament/courts/c2/enabled")[0]?.body,
    ).toEqual({ isEnabled: false });
    await waitFor(() =>
      expect(
        screen.getAllByTestId("tournament-courts__row")[1],
      ).toHaveTextContent("Off"),
    );
  });

  it("says there are no courts yet, and abandons an edit", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: { ...consoleView(null), courts: [] },
      },
    });
    expect(
      await screen.findByTestId("tournament-courts__empty"),
    ).toHaveTextContent("No courts yet");
    cleanupStub();
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("tournament-courts__edit"));
    await user.click(screen.getByTestId("tournament-courts__cancel"));
    expect(screen.getByTestId("tournament-courts__submit")).toHaveTextContent(
      "Add court",
    );
  });

  it("leaves switching a court on or off to contingency while the day is live", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(live) },
    });
    expect(await screen.findAllByTestId("tournament-courts__row")).toHaveLength(
      1,
    );
    expect(screen.queryByTestId("tournament-courts__toggle")).toBeNull();
    expect(
      screen.getByTestId("tournament-courts__live-note"),
    ).toHaveTextContent("Courts and timings");
  });
});

describe("Control — the one-way switch to court awards (ADR-336)", () => {
  it("offers the switch on a live day, and posts the typed word, the reason and the derived buttons", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(live, {
          suggestedTiers: [
            { label: "30 pts", points: 30 },
            { label: "20 pts", points: 20 },
            { label: "10 pts", points: 10 },
          ],
        }),
      },
      "POST /api/admin/tournament/switch": {
        body: consoleView(live, { mode: "dumb" }),
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("mode-panel__open"));
    // §4 — the buttons are the day's own paid rates, editable before they are committed.
    expect(
      screen
        .getAllByTestId("mode-panel__tier-points")
        .map((field) => (field as HTMLInputElement).value),
    ).toEqual(["30", "20", "10"]);
    await user.type(
      screen.getByTestId("mode-panel__reason"),
      "Court 3 is unplayable.",
    );
    await user.type(screen.getByTestId("mode-panel__word"), "switch");
    await user.click(screen.getByTestId("mode-panel__confirm"));
    await waitFor(() =>
      expect(stub.callsTo("POST /api/admin/tournament/switch")).toHaveLength(1),
    );
    const body = stub.callsTo("POST /api/admin/tournament/switch")[0]?.body as {
      confirmation: string;
      reason: string;
      tiers: { label: string; points: number }[];
      clientUuid: string;
    };
    expect(body.confirmation).toBe("switch");
    expect(body.reason).toBe("Court 3 is unplayable.");
    expect(body.tiers).toHaveLength(3);
    expect(body.tiers[0]).toEqual({ label: "30 pts", points: 30 });
    expect(body.clientUuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("will not confirm without the word, and says so rather than posting", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(live, {
          suggestedTiers: [{ label: "30 pts", points: 30 }],
        }),
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("mode-panel__open"));
    await user.type(screen.getByTestId("mode-panel__reason"), "Rain.");
    await user.click(screen.getByTestId("mode-panel__confirm"));
    expect(screen.getByTestId("mode-panel__confirm")).toBeDisabled();
    expect(stub.callsTo("POST /api/admin/tournament/switch")).toHaveLength(0);
  });

  it("shows the mixed window by court, and says the fixtures will end themselves", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(live, {
          mode: "switching",
          modeSwitch: {
            switchedAt: "2026-10-15T02:20:00.000Z",
            switchedByLabel: "superadmin",
            reason: "Court 3 is unplayable.",
            fixturesTournamentName: "Day",
            awardTournamentName: "Day — points",
            tiers: [{ label: "30 pts", points: 30 }],
            fixturesEnded: false,
            courts: [
              { courtId: "c1", courtLabel: "Court 1", isFinishing: true },
              { courtId: "c2", courtLabel: "Court 2", isFinishing: false },
            ],
          },
        }),
      },
    });
    expect(await screen.findByTestId("mode-panel__banner")).toHaveTextContent(
      "finish first",
    );
    expect(screen.getByTestId("mode-panel__drain")).toHaveTextContent(
      "Court 1 — finishing its match, then awarding",
    );
    expect(screen.getByTestId("mode-panel__drain")).toHaveTextContent(
      "Court 2 — awarding points",
    );
    expect(screen.getByTestId("mode-panel")).toHaveTextContent(
      "will end itself when the last court finishes",
    );
    // The switch itself is not offered twice: the day is already awarding.
    expect(screen.queryByTestId("mode-panel__open")).toBeNull();
  });
});

describe("Control — a marshal’s ask (ADR-336 §5.4)", () => {
  const ask = {
    id: "req-1",
    requestedByLabel: "psdadmin1",
    reason: "Court 3 is underwater.",
    courtLabel: "Court 3",
    createdAt: "2026-10-15T02:10:00.000Z",
  };

  it("shows who asked and why, and reviewing it opens the switch with that reason", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(live, {
          suggestedTiers: [{ label: "30 pts", points: 30 }],
          modeRequest: ask,
        }),
      },
      "POST /api/admin/tournament/switch": {
        body: consoleView(live, { mode: "dumb" }),
      },
    });
    const user = userEvent.setup();
    expect(await screen.findByTestId("mode-panel__ask-text")).toHaveTextContent(
      "psdadmin1 asks from Court 3 — Court 3 is underwater.",
    );
    // ADR-342 — no clock answers this ask; how long it has waited is the desk's warning instead.
    expect(screen.getByTestId("mode-panel__ask-age")).toHaveTextContent(
      /Asked .+ ago\. The room may have changed since/,
    );
    await user.click(screen.getByTestId("mode-panel__ask-review"));
    expect(screen.getByTestId("mode-panel__reason")).toHaveValue(
      "Court 3 is underwater.",
    );
    expect(screen.getByTestId("mode-panel__form-age")).toHaveTextContent(
      "Asked by psdadmin1,",
    );
    await user.type(screen.getByTestId("mode-panel__word"), "switch");
    await user.click(screen.getByTestId("mode-panel__confirm"));
    await waitFor(() =>
      expect(stub.callsTo("POST /api/admin/tournament/switch")).toHaveLength(1),
    );
    // The switch answers the ask, so the desk does not have to remember to clear the banner.
    expect(
      (
        stub.callsTo("POST /api/admin/tournament/switch")[0]?.body as {
          requestId?: string;
        }
      ).requestId,
    ).toBe("req-1");
  });

  it("declines with a reason of its own, and will not decline without one", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(live, { modeRequest: ask }),
      },
      "POST /api/admin/tournament/mode/requests/req-1/decline": {
        body: consoleView(live),
      },
    });
    const user = userEvent.setup();
    const decline = await screen.findByTestId("mode-panel__ask-decline");
    expect(decline).toBeDisabled();
    await user.type(
      screen.getByTestId("mode-panel__ask-decline-reason"),
      "The puddle is on the path.",
    );
    await user.click(screen.getByTestId("mode-panel__ask-decline"));
    await waitFor(() =>
      expect(
        stub.callsTo("POST /api/admin/tournament/mode/requests/req-1/decline"),
      ).toHaveLength(1),
    );
    expect(
      stub.callsTo("POST /api/admin/tournament/mode/requests/req-1/decline")[0]
        ?.body,
    ).toEqual({ reason: "The puddle is on the path." });
  });
});

describe("Control — every setup field reaches the request", () => {
  it("sends the name, rates and the teams in the order they were picked", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
      "POST /api/admin/tournament": { body: consoleView(null) },
    });
    const user = userEvent.setup();
    const name = await screen.findByTestId("tournament-setup__name");
    await user.clear(name);
    await user.type(name, "Sand day");
    for (const [field, value] of [
      ["win", "9"],
      ["draw", "4"],
      ["loss", "1"],
    ] as const) {
      await user.clear(screen.getByTestId(`tournament-setup__${field}`));
      await user.type(screen.getByTestId(`tournament-setup__${field}`), value);
    }
    const [reds, blues] = screen.getAllByTestId("tournament-setup__team");
    await user.click(blues as HTMLElement);
    await user.click(reds as HTMLElement);
    await user.click(screen.getByTestId("tournament-setup__create"));
    expect(stub.callsTo("POST /api/admin/tournament")[0]?.body).toEqual({
      name: "Sand day",
      kind: "captains_ball",
      winPoints: 9,
      drawPoints: 4,
      lossPoints: 1,
      teamIds: ["t2", "t1"],
    });
  });

  it("creates a dumb draft with its tiers and no Start answer (ADR-321)", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
      "POST /api/admin/tournament": { body: consoleView(null) },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("tournament-setup__kind"),
      "dumb_courts",
    );
    const labels = screen.getAllByTestId("tournament-setup__tier-label");
    expect(labels).toHaveLength(2);
    await user.clear(labels[0] as HTMLElement);
    await user.type(labels[0] as HTMLElement, "Played");
    const [reds, blues] = screen.getAllByTestId("tournament-setup__team");
    await user.click(reds as HTMLElement);
    await user.click(blues as HTMLElement);
    await user.click(screen.getByTestId("tournament-setup__tier-add"));
    expect(screen.getAllByTestId("tournament-setup__tier-label")).toHaveLength(
      3,
    );
    await user.click(
      screen.getAllByTestId("tournament-setup__tier-remove")[2] as HTMLElement,
    );
    await user.click(screen.getByTestId("tournament-setup__create"));
    const body = stub.callsTo("POST /api/admin/tournament")[0]?.body as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      kind: "dumb_courts",
      tiers: [
        { label: "Played", points: 2 },
        { label: "Gold", points: 10 },
      ],
    });
    expect(body).not.toHaveProperty("setup");
  });

  it("starts dumb courts with the dumb Start and no format (ADR-321)", async () => {
    const two = ["t1", "t2"].map((teamId, index) => ({
      teamId,
      name: teamId,
      entryOrder: index + 1,
      withdrawnAt: null,
      awardedPoints: 0,
    }));
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(
          adminTournament({
            status: "draft",
            kind: "dumb_courts",
            dumbTiers: [{ label: "Gold", points: 10 }],
            entrants: two,
          }),
        ),
      },
      "POST /api/admin/tournament/activate": { body: consoleView(null) },
    });
    expect(
      await screen.findByTestId("tournament-setup__dumb-note"),
    ).toHaveTextContent("Gold 10");
    const user = userEvent.setup();
    await user.click(screen.getByTestId("tournament-setup__start"));
    const body = stub.callsTo("POST /api/admin/tournament/activate")[0]
      ?.body as Record<string, unknown>;
    expect(body).toMatchObject({ dumb: true });
    expect(body).not.toHaveProperty("formatId");
    expect(body).not.toHaveProperty("pipeline");
  });

  it("sends the format options and the timing as typed", async () => {
    const four = ["t1", "t2", "t3", "t4"].map((teamId, index) => ({
      teamId,
      name: teamId,
      entryOrder: index + 1,
      withdrawnAt: null,
      awardedPoints: 0,
    }));
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(adminTournament({ status: "draft", entrants: four })),
      },
      "POST /api/admin/tournament/activate": { body: consoleView(live) },
    });
    const user = userEvent.setup();
    for (const [field, value] of [
      ["group-size", "2"],
      ["advance", "1"],
      ["minutes", "15"],
      ["changeover", "5"],
      ["rest", "2"],
    ] as const) {
      await user.clear(await screen.findByTestId(`tournament-setup__${field}`));
      await user.type(screen.getByTestId(`tournament-setup__${field}`), value);
    }
    await user.click(screen.getByTestId("tournament-setup__third-place"));
    await user.type(screen.getByTestId("tournament-setup__deadline"), "16:00");
    await user.click(screen.getByTestId("tournament-setup__start"));
    const body = stub.callsTo("POST /api/admin/tournament/activate")[0]
      ?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      formatId: "groups_knockout",
      options: { groupSize: 2, advanceCount: 1, hasThirdPlace: false },
      matchMinutes: 15,
      changeoverMinutes: 5,
      restMinutes: 2,
    });
    expect(body["deadlineAt"]).not.toBeNull();
  });

  it("asks Swiss for its rounds", async () => {
    const four = ["t1", "t2", "t3", "t4"].map((teamId, index) => ({
      teamId,
      name: teamId,
      entryOrder: index + 1,
      withdrawnAt: null,
      awardedPoints: 0,
    }));
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(adminTournament({ status: "draft", entrants: four })),
      },
      "POST /api/admin/tournament/activate": { body: consoleView(live) },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("tournament-setup__format"),
      "swiss",
    );
    await user.type(screen.getByTestId("tournament-setup__rounds"), "2");
    await user.click(screen.getByTestId("tournament-setup__start"));
    expect(
      stub.callsTo("POST /api/admin/tournament/activate")[0]?.body,
    ).toMatchObject({ formatId: "swiss", options: { rounds: 2 } });
  });
});

describe("Control — every act on the live day", () => {
  it("opens the right dialog for each button, and each sends its own route", async () => {
    const answer = { body: consoleView(live) };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(live) },
      "POST /api/admin/tournament/matches/done/void": answer,
      "POST /api/admin/tournament/matches/next/walkover": answer,
      "POST /api/admin/tournament/matches/next/cancel": answer,
      "POST /api/admin/tournament/stages/s1/complete": answer,
      "POST /api/admin/tournament/entrants/t1/withdraw": answer,
      "POST /api/admin/tournament/close": answer,
    });
    const user = userEvent.setup();
    const press = async (testId: string, title: string, index = 0) => {
      await user.click(
        (await screen.findAllByTestId(testId))[index] as HTMLElement,
      );
      expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
      await user.type(screen.getByTestId("reason-dialog__reason"), "why");
      await user.click(screen.getByTestId("reason-dialog__confirm"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    };
    await press("tournament-matches__void", "Void DONE", 1);
    await press("tournament-matches__walkover-a", "Walkover in NEXT");
    await press("tournament-matches__cancel", "Call off NEXT");
    await press("tournament-stages__complete", "Close Pool");
    await press("tournament-entrants__withdraw", "Withdraw Reds");
    await press("tournament-scheduler__close", "Close the tournament");
    for (const route of [
      "matches/done/void",
      "matches/next/walkover",
      "matches/next/cancel",
      "stages/s1/complete",
      "entrants/t1/withdraw",
      "close",
    ]) {
      expect(stub.callsTo(`POST /api/admin/tournament/${route}`)).toHaveLength(
        1,
      );
    }
  });

  it("shows why the scheduler stopped, and a stage with no groups as one table", async () => {
    const stopped = {
      ...live,
      scheduler:
        live.scheduler === null
          ? null
          : {
              ...live.scheduler,
              status: "terminated" as const,
              terminatedByLabel: "superadmin",
              terminateReason: "Lightning.",
            },
      fit: null,
      stages: [
        {
          id: "s9",
          code: "SW",
          hasStarted: true,
          rosterCount: 4,
          label: "Swiss",
          kind: "swiss" as const,
          status: "completed" as const,
          advanceCount: 0,
          tablePoints: { win: 3, draw: 1, loss: 0 },
          intake: null,
          advancers: [],
          cutTies: [],
          groups: [],
          standings: [
            {
              teamId: "t1",
              name: "Reds",
              played: 2,
              wins: 2,
              draws: 0,
              losses: 0,
              difference: 4,
              points: 6,
              rank: 1,
              explanation: "Top on 6 pts.",
            },
          ],
        },
      ],
    };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(stopped) },
    });
    expect(
      await screen.findByText(/Stopped by superadmin: Lightning\./),
    ).toBeInTheDocument();
    expect(screen.getByTestId("tournament-stages__table")).toHaveTextContent(
      "Top on 6 pts.",
    );
    expect(screen.queryByTestId("tournament-stages__complete")).toBeNull();
  });
});

describe("Control — day-of lock-ins (ADR-329 phase 1)", () => {
  it("hands a walkover to side B when B is the team that showed up", async () => {
    const answer = { body: consoleView(live) };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(live) },
      "POST /api/admin/tournament/matches/next/walkover": answer,
    });
    const user = userEvent.setup();
    await user.click(
      (
        await screen.findAllByTestId("tournament-matches__walkover-b")
      )[0] as HTMLElement,
    );
    expect(
      screen.getByRole("dialog", { name: "Walkover in NEXT" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByTestId("reason-dialog__reason"),
      "Reds never arrived",
    );
    await user.click(screen.getByTestId("reason-dialog__confirm"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      stub.callsTo("POST /api/admin/tournament/matches/next/walkover")[0]?.body,
    ).toMatchObject({ winnerSide: "b" });
  });

  it("shows a seat conflict and reseats the seat to the team the table now sends", async () => {
    const conflicted = adminTournament({
      ...live,
      matches: [
        adminMatch({
          id: "conf",
          seatConflict: {
            side: "b",
            seatedTeamId: "t2",
            seatedTeamName: "Blues",
            wouldBeTeamId: "t1",
            wouldBeTeamName: "Reds",
          },
        }),
      ],
    });
    const answer = { body: consoleView(conflicted) };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(conflicted) },
      "POST /api/admin/tournament/matches/conf/reseat": answer,
    });
    const user = userEvent.setup();
    expect(
      await screen.findByTestId("tournament-matches__seat-conflict"),
    ).toHaveTextContent("Reds");
    await user.click(screen.getByTestId("tournament-matches__reseat"));
    expect(
      screen.getByRole("dialog", { name: "Reseat CONF" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("tournament-act__reseat-side")).toHaveValue("b");
    expect(screen.getByTestId("tournament-act__reseat-team")).toHaveValue("t1");
    await user.type(
      screen.getByTestId("reason-dialog__reason"),
      "Corrected result moved the seat",
    );
    await user.click(screen.getByTestId("reason-dialog__confirm"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      stub.callsTo("POST /api/admin/tournament/matches/conf/reseat")[0]?.body,
    ).toMatchObject({ side: "b", teamId: "t1" });
  });

  it("hands a live structure match back to the queue from the desk", async () => {
    const handed = adminTournament({
      ...live,
      matches: [
        adminMatch({
          id: "live1",
          status: "in_progress",
          startedAt: "2026-10-15T02:05:00.000Z",
        }),
      ],
    });
    const answer = { body: consoleView(handed) };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(handed) },
      "POST /api/admin/tournament/matches/live1/hand-back": answer,
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByTestId("tournament-matches__hand-back"),
    );
    expect(
      screen.getByRole("dialog", { name: "Hand back LIVE1" }),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("reason-dialog__confirm"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      stub.callsTo("POST /api/admin/tournament/matches/live1/hand-back"),
    ).toHaveLength(1);
  });

  it("closes a stage sending a different team through a tied place, with the reason", async () => {
    const tied = adminTournament({
      ...live,
      stages: [
        {
          id: "s1",
          code: "GRP",
          hasStarted: true,
          rosterCount: 0,
          label: "Pool",
          kind: "pool",
          status: "active",
          advanceCount: 1,
          tablePoints: { win: 3, draw: 1, loss: 0 },
          intake: null,
          advancers: [
            { teamId: "t1", name: "Reds", place: 1, via: "qualifier" as const },
          ],
          cutTies: ["Reds / Blues"],
          groups: [],
          standings: [],
        },
      ],
    });
    const answer = { body: consoleView(tied) };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(tied) },
      "POST /api/admin/tournament/stages/s1/complete": answer,
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("tournament-stages__complete"));
    expect(
      screen.getByRole("dialog", { name: "Close Pool" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("tournament-act__cut-ties")).toHaveTextContent(
      "Reds / Blues",
    );
    await user.selectOptions(
      screen.getByTestId("tournament-act__override"),
      "t2",
    );
    await user.type(
      screen.getByTestId("reason-dialog__reason"),
      "Blues won the toss for the tied place",
    );
    await user.click(screen.getByTestId("reason-dialog__confirm"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      stub.callsTo("POST /api/admin/tournament/stages/s1/complete")[0]?.body,
    ).toMatchObject({
      overrides: [{ place: 1, teamId: "t2" }],
    });
  });
});

describe("Control — rebuilding an unstarted stage (ADR-334)", () => {
  it("offers Rebuild only before a stage starts, and posts the new shape with its reason", async () => {
    const stage = {
      id: "s1",
      code: "GRP",
      hasStarted: false,
      rosterCount: 0,
      label: "Groups",
      kind: "pool" as const,
      status: "active" as const,
      advanceCount: 1,
      tablePoints: { win: 3, draw: 1, loss: 0 },
      intake: null,
      advancers: [],
      cutTies: [],
      groups: [],
      standings: [],
    };
    const pipelineDay = adminTournament({
      ...live,
      scheduler:
        live.scheduler === null
          ? null
          : { ...live.scheduler, format: "pipeline" as const },
      stages: [stage],
    });
    const answer = { body: consoleView(pipelineDay) };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(pipelineDay) },
      "POST /api/admin/tournament/stages/s1/restructure": answer,
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("tournament-stages__restage"));
    expect(
      screen.getByRole("dialog", { name: "Rebuild Groups" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByTestId("tournament-act__restage-group-size"),
      "4",
    );
    await user.type(screen.getByTestId("tournament-act__restage-minutes"), "8");
    await user.type(
      screen.getByTestId("reason-dialog__reason"),
      "The hall lost a court.",
    );
    await user.click(screen.getByTestId("reason-dialog__confirm"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      stub.callsTo("POST /api/admin/tournament/stages/s1/restructure")[0]?.body,
    ).toEqual({
      reason: "The hall lost a court.",
      groupSize: 4,
      matchMinutes: 8,
    });
  });

  it("hides Rebuild once a match in the stage has started", async () => {
    const startedDay = adminTournament({
      ...live,
      scheduler:
        live.scheduler === null
          ? null
          : { ...live.scheduler, format: "pipeline" as const },
      stages: [
        {
          id: "s1",
          code: "GRP",
          hasStarted: true,
          rosterCount: 0,
          label: "Groups",
          kind: "pool" as const,
          status: "active" as const,
          advanceCount: 1,
          tablePoints: { win: 3, draw: 1, loss: 0 },
          intake: null,
          advancers: [],
          cutTies: [],
          groups: [],
          standings: [],
        },
      ],
    });
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(startedDay) },
    });
    expect(await screen.findByTestId("tournament-stages")).toBeInTheDocument();
    expect(screen.queryByTestId("tournament-stages__restage")).toBeNull();
  });
});

describe("Control — closing an open stage (ADR-329 F7)", () => {
  it("offers Close on an open stage and posts the close with its reason", async () => {
    const openDay = adminTournament({
      ...live,
      stages: [
        {
          id: "s1",
          code: "FUN",
          hasStarted: true,
          rosterCount: 4,
          label: "Open play",
          kind: "open" as const,
          status: "active" as const,
          advanceCount: 0,
          tablePoints: { win: 3, draw: 1, loss: 0 },
          intake: { fromLabel: "Groups", count: 4 },
          advancers: [],
          cutTies: [],
          groups: [],
          standings: [],
        },
      ],
    });
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(openDay) },
      "POST /api/admin/tournament/stages/s1/complete": {
        body: consoleView(openDay),
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("tournament-stages__complete"));
    expect(
      screen.getByRole("dialog", { name: "Close Open play" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByTestId("reason-dialog__reason"),
      "The fringe programme takes the courts now.",
    );
    await user.click(screen.getByTestId("reason-dialog__confirm"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      stub.callsTo("POST /api/admin/tournament/stages/s1/complete")[0]?.body,
    ).toMatchObject({ overrides: [] });
  });
});

describe("Control — putting a match on a court by hand (ADR-289)", () => {
  it("moves a queued match to the court and time picked, and releases a pinned one", async () => {
    const moved = {
      ...live,
      matches: live.matches.map((match) =>
        match.id === "tbd" ? { ...match, isPinned: true } : match,
      ),
    };
    const released = {
      ...live,
      matches: live.matches.map((match) =>
        match.id === "next" ? { ...match, isPinned: false } : match,
      ),
    };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(live) },
      "POST /api/admin/tournament/matches/tbd/move": {
        body: consoleView(moved),
      },
      "POST /api/admin/tournament/matches/next/release": {
        body: consoleView(released),
      },
    });
    const user = userEvent.setup();
    const queuedTable = await screen.findByTestId("tournament-matches__queued");
    // `next` is pinned, `tbd` is not: one Release, two Moves.
    expect(
      within(queuedTable).getAllByTestId("tournament-matches__move"),
    ).toHaveLength(2);
    expect(
      within(queuedTable).getAllByTestId("tournament-matches__release"),
    ).toHaveLength(1);

    await user.click(
      within(queuedTable).getAllByTestId("tournament-matches__move")[1]!,
    );
    const form = screen.getByTestId("tournament-placement");
    expect(form).toHaveTextContent("Move TBD");
    await user.selectOptions(
      within(form).getByTestId("tournament-placement__court"),
      "c1",
    );
    await user.clear(within(form).getByTestId("tournament-placement__time"));
    await user.type(
      within(form).getByTestId("tournament-placement__time"),
      "14:45",
    );
    await user.click(within(form).getByTestId("tournament-placement__confirm"));
    const sent = stub.callsTo("POST /api/admin/tournament/matches/tbd/move")[0]
      ?.body as { courtId: string; startAt: string };
    expect(sent.courtId).toBe("c1");
    expect(new Date(sent.startAt).getHours()).toBe(14);
    await waitFor(() =>
      expect(screen.queryByTestId("tournament-placement")).toBeNull(),
    );

    await user.click(
      within(screen.getByTestId("tournament-matches__queued")).getAllByTestId(
        "tournament-matches__release",
      )[0]!,
    );
    expect(
      stub.callsTo("POST /api/admin/tournament/matches/next/release"),
    ).toHaveLength(1);
  });

  it("says what is missing before it asks, and backs out", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(live) },
    });
    const user = userEvent.setup();
    await user.click(
      (await screen.findAllByTestId("tournament-matches__move"))[0]!,
    );
    const form = screen.getByTestId("tournament-placement");
    await user.clear(within(form).getByTestId("tournament-placement__time"));
    await user.click(within(form).getByTestId("tournament-placement__confirm"));
    expect(
      within(form).getByTestId("tournament-placement__problem"),
    ).toHaveTextContent("Pick a start time.");
    await user.click(within(form).getByTestId("tournament-placement__cancel"));
    expect(screen.queryByTestId("tournament-placement")).toBeNull();
  });
});

describe("Control — the live day", () => {
  it("shows the scheduler’s fit, the matches, the tables and the teams", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(live) },
    });
    expect(
      await screen.findByTestId("tournament-scheduler__fit"),
    ).toHaveTextContent("7 min past the hard stop");
    expect(
      within(screen.getByTestId("tournament-matches__queued")).getAllByTestId(
        "tournament-matches__row",
      ),
    ).toHaveLength(2);
    expect(
      within(screen.getByTestId("tournament-matches__finished")).getByText(
        "walkover → B",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("tournament-stages__table")).toHaveTextContent(
      "Top on 3 pts.",
    );
    expect(
      screen.getAllByTestId("tournament-entrants__row")[1],
    ).toHaveTextContent("(withdrawn)");
    expect(screen.getAllByTestId("tournament-entrants__withdraw")).toHaveLength(
      1,
    );
  });

  it("corrects a result with a reason through the one dialog, and keeps the dialog open on a refusal", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(live) },
      "POST /api/admin/tournament/matches/done/result": {
        body: consoleView(live),
      },
      "POST /api/admin/tournament/scheduler/terminate": {
        status: 400,
        body: { error: { message: "The scheduler is already stopped." } },
      },
    });
    const user = userEvent.setup();
    // Finished matches are listed latest first, so DONE (ended 02:12) is under WALK (02:13).
    const doneRow = (
      await screen.findAllByTestId("tournament-matches__row")
    ).find((row) => row.textContent?.startsWith("DONE"));
    await user.click(
      within(doneRow as HTMLElement).getByTestId("tournament-matches__correct"),
    );
    expect(
      screen.getByRole("dialog", { name: "Correct DONE" }),
    ).toBeInTheDocument();
    await user.clear(screen.getByTestId("tournament-act__score-a"));
    await user.type(screen.getByTestId("tournament-act__score-a"), "0");
    await user.type(
      screen.getByTestId("reason-dialog__reason"),
      "Scores swapped",
    );
    await user.click(screen.getByTestId("reason-dialog__confirm"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      stub.callsTo("POST /api/admin/tournament/matches/done/result")[0]?.body,
    ).toEqual({
      scoreA: 0,
      scoreB: 0,
      winnerSide: null,
      tiebreakMethod: null,
      reason: "Scores swapped",
    });
    await user.click(screen.getByTestId("tournament-scheduler__terminate"));
    await user.type(screen.getByTestId("reason-dialog__reason"), "Lightning");
    await user.click(screen.getByTestId("reason-dialog__confirm"));
    expect(
      await screen.findByText("The scheduler is already stopped."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByTestId("reason-dialog__cancel"));
    expect(
      await screen.findByTestId("tournament-control__error"),
    ).toHaveTextContent("already stopped");
  });

  it("awards points with the amount the desk typed", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(live) },
      "POST /api/admin/tournament/awards": { body: consoleView(live) },
    });
    const user = userEvent.setup();
    await user.click(
      (
        await screen.findAllByTestId("tournament-entrants__award")
      )[0] as HTMLElement,
    );
    await user.type(screen.getByTestId("tournament-act__points"), "5");
    await user.type(screen.getByTestId("reason-dialog__reason"), "Fair play");
    await user.click(screen.getByTestId("reason-dialog__confirm"));
    await waitFor(() =>
      expect(stub.callsTo("POST /api/admin/tournament/awards")).toHaveLength(1),
    );
    expect(stub.callsTo("POST /api/admin/tournament/awards")[0]?.body).toEqual({
      teamId: "t1",
      points: 5,
      reason: "Fair play",
    });
  });

  it("previews a court out, shows what would move, then applies it", async () => {
    const preview: ContingencyPreviewView = {
      changes: [
        {
          matchId: "next",
          code: "NEXT",
          kind: "moved",
          from: { courtLabel: "Court 1", startAt: "2026-10-15T02:00:00.000Z" },
          to: { courtLabel: "Court 1", startAt: "2026-10-15T02:30:00.000Z" },
        },
        {
          matchId: "tbd",
          code: "TBD",
          kind: "removed",
          from: { courtLabel: "Court 1", startAt: "2026-10-15T03:00:00.000Z" },
          to: null,
        },
        {
          matchId: "x",
          code: "X",
          kind: "added",
          from: null,
          to: { courtLabel: "Court 1", startAt: "2026-10-15T04:00:00.000Z" },
        },
      ],
      fit: {
        remainingMatches: 2,
        courtMinutes: 24,
        projectedFinishAt: null,
        fitsDeadline: null,
        overrunMinutes: 0,
      },
    };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(live) },
      "POST /api/admin/tournament/contingency/preview": { body: preview },
      "POST /api/admin/tournament/contingency/apply": {
        body: consoleView(live),
      },
    });
    const user = userEvent.setup();
    expect(
      await screen.findByTestId("tournament-contingency__apply"),
    ).toBeDisabled();
    await user.clear(screen.getByTestId("tournament-contingency__minutes"));
    await user.type(
      screen.getByTestId("tournament-contingency__minutes"),
      "10",
    );
    await user.click(screen.getByTestId("tournament-contingency__court"));
    await user.click(
      screen.getByTestId("tournament-contingency__preview-button"),
    );
    const shown = await screen.findByTestId("tournament-contingency__preview");
    expect(shown).toHaveTextContent("NEXT: Court 1");
    expect(shown).toHaveTextContent("TBD: Court 1");
    expect(shown).not.toHaveTextContent("X:");
    expect(
      stub.callsTo("POST /api/admin/tournament/contingency/preview")[0]?.body,
    ).toEqual({
      enabledCourtIds: [],
      matchMinutes: 10,
      changeoverMinutes: 3,
      stageMinutes: [{ stageId: "s1", matchMinutes: 12 }],
      restMinutes: 0,
    });
    await user.click(screen.getByTestId("tournament-contingency__apply"));
    await waitFor(() =>
      expect(
        stub.callsTo("POST /api/admin/tournament/contingency/apply"),
      ).toHaveLength(1),
    );
  });

  it("says so when a preview is refused, and offers no stop button without a running scheduler", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView({ ...live, scheduler: null, fit: null }),
      },
      "POST /api/admin/tournament/contingency/preview": {
        status: 400,
        body: {
          error: {
            message:
              "The scheduler is not running, so there is no plan to change.",
          },
        },
      },
    });
    const user = userEvent.setup();
    expect(
      await screen.findByTestId("tournament-scheduler__fit"),
    ).toHaveTextContent("No plan");
    expect(screen.queryByTestId("tournament-scheduler__terminate")).toBeNull();
    await user.click(
      screen.getByTestId("tournament-contingency__preview-button"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no plan to change",
    );
  });
});

describe("Timetable", () => {
  it("draws a lane per court with its blocks, a now-line, and the unplaced", async () => {
    const view: TimetableView = {
      now: "2026-10-15T02:00:00.000Z",
      lanes: [
        {
          court: {
            id: "c1",
            courtNumber: 1,
            label: "Court 1",
            isEnabled: true,
          },
          matches: [
            adminMatch({
              id: "a",
              status: "in_progress",
              startedAt: "2026-10-15T01:55:00.000Z",
            }),
            adminMatch({
              id: "b",
              isPinned: true,
              plannedStartAt: "2026-10-15T02:20:00.000Z",
            }),
            adminMatch({
              id: "c",
              status: "cancelled",
              plannedStartAt: "2026-10-15T02:40:00.000Z",
            }),
          ],
        },
        {
          court: {
            id: "c2",
            courtNumber: 2,
            label: "Court 2",
            isEnabled: false,
          },
          matches: [
            adminMatch({
              id: "d",
              status: "completed",
              startedAt: "2026-10-15T01:00:00.000Z",
              endedAt: "2026-10-15T01:12:00.000Z",
            }),
          ],
        },
      ],
      unplaced: [adminMatch({ id: "e", plannedStartAt: null, courtId: null })],
      fit: {
        remainingMatches: 2,
        courtMinutes: 24,
        projectedFinishAt: "2026-10-15T03:00:00.000Z",
        fitsDeadline: true,
        overrunMinutes: 0,
      },
    };
    render(<TournamentTimetablePage />, {
      "GET /api/admin/tournament/timetable": { body: view },
    });
    expect(await screen.findAllByTestId("timetable__lane")).toHaveLength(2);
    const statuses = screen
      .getAllByTestId("timetable__block")
      .map((block) => block.dataset["status"]);
    expect(statuses).toEqual([
      "in_progress",
      "scheduled",
      "cancelled",
      "completed",
    ]);
    expect(screen.getAllByTestId("timetable__now")).toHaveLength(2);
    expect(screen.getByTestId("timetable__unplaced")).toHaveTextContent("E");
    expect(screen.getByTestId("timetable__fit")).toHaveTextContent(
      "fits the hard stop",
    );
    expect(
      screen.getAllByTestId("timetable__block")[1]?.getAttribute("title"),
    ).toContain("(pinned)");
  });

  it("says there are no courts yet", async () => {
    render(<TournamentTimetablePage />, {
      "GET /api/admin/tournament/timetable": {
        body: {
          now: "2026-10-15T02:00:00.000Z",
          lanes: [],
          unplaced: [],
          fit: null,
        },
      },
    });
    expect(await screen.findByTestId("timetable__empty")).toHaveTextContent(
      "No courts yet",
    );
  });
});

describe("Simulator", () => {
  it("starts from the room, plans the day, flags back-to-backs and an overrun, and refuses an impossible field", async () => {
    const room: AdminTournamentConsoleView = consoleView(null);
    render(<TournamentSimulatorPage />, {
      "GET /api/admin/tournament": { body: room },
    });
    expect(await screen.findByTestId("simulator__room")).toHaveTextContent(
      "2 teams registered, 1 courts on",
    );
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByTestId("simulator__format"),
      "ironman",
    );
    await user.clear(screen.getByTestId("simulator__teamCount"));
    await user.type(screen.getByTestId("simulator__teamCount"), "8");
    await user.type(screen.getByTestId("simulator__deadline"), "10:30");
    expect(screen.getAllByTestId("simulator__row").length).toBeGreaterThan(0);
    expect(screen.getByTestId("simulator__fit")).toHaveTextContent(
      "past the hard stop",
    );
    expect(
      screen
        .getAllByTestId("simulator__row")
        .some((row) => row.dataset["backToBack"] === "true"),
    ).toBe(true);
    await user.click(screen.getByTestId("simulator__third-place"));
    await user.selectOptions(
      screen.getByTestId("simulator__format"),
      "consolation",
    );
    await user.clear(screen.getByTestId("simulator__teamCount"));
    await user.type(screen.getByTestId("simulator__teamCount"), "6");
    expect(screen.getByTestId("simulator__error")).toHaveTextContent(
      /exactly eight/,
    );
  });

  it("rehearses a stage pipeline with per-stage durations against the hard stop (ADR-311)", async () => {
    render(<TournamentSimulatorPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("simulator__build"),
      "pipeline",
    );
    expect(screen.getByTestId("simulator__stage-0-minutes")).toHaveValue("15");
    await user.clear(screen.getByTestId("simulator__teamCount"));
    await user.type(screen.getByTestId("simulator__teamCount"), "9");
    await user.clear(screen.getByTestId("simulator__courtCount"));
    await user.type(screen.getByTestId("simulator__courtCount"), "3");
    await user.type(screen.getByTestId("simulator__deadline"), "11:30");
    // 10:00 start, 90 minutes allowed, the template needs 97: seven past the stop.
    expect(screen.getByTestId("simulator__fit")).toHaveTextContent(
      "12 matches, last one ends 11:37",
    );
    expect(screen.getByTestId("simulator__fit")).toHaveTextContent(
      "7 min past the hard stop",
    );
  });
});

describe("the small readings", () => {
  it("names a walkover to either side, and a court the planner has not given", () => {
    expect(
      scoreLine(
        adminMatch({ id: "w", resultKind: "walkover", winnerSide: "a" }),
      ),
    ).toBe("walkover → A");
    expect(
      courtOf({
        code: "x",
        stageCode: "S",
        groupCode: null,
        round: 1,
        aLabel: "a",
        bLabel: "b",
        courtIndex: null,
        start: null,
        end: null,
        isBackToBack: false,
      }),
    ).toBe("—");
    expect(
      fitSummary({ error: null, structure: null, matches: [], fit: null }),
    ).toBe("");
    const fits = {
      remainingMatches: 1,
      courtMinutes: 12,
      projectedFinish: 615,
      fitsDeadline: true,
      overrunMinutes: 0,
    };
    expect(
      fitSummary({ error: null, structure: null, matches: [], fit: fits }),
    ).toContain("fits the hard stop");
    expect(roomLine({ registeredTeams: null, enabledCourts: null })).toBe("");
    expect(roomLine({ registeredTeams: 3, enabledCourts: null })).toBe(
      "3 teams registered, 0 courts on",
    );
  });

  it("shows a closed day with no reason, a match off court, and a preview that moves nothing", async () => {
    const closedDay = adminTournament({
      status: "closed",
      name: "Done day",
      closeReason: null,
    });
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(closedDay) },
    });
    expect(
      await screen.findByTestId("tournament-control__closed"),
    ).toHaveTextContent("Done day closed.");
  });

  it("turns a court back on before previewing, and says when nothing already planned would move", async () => {
    const offCourt = {
      ...live,
      matches: [adminMatch({ id: "loose", courtId: null, courtLabel: null })],
    };
    const view = {
      ...consoleView(offCourt),
      courts: [
        { id: "c1", courtNumber: 1, label: "Court 1", isEnabled: false },
      ],
    };
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: view },
      "POST /api/admin/tournament/contingency/preview": {
        body: {
          changes: [],
          fit: {
            remainingMatches: 1,
            courtMinutes: 12,
            projectedFinishAt: null,
            fitsDeadline: null,
            overrunMinutes: 0,
          },
        },
      },
    });
    const user = userEvent.setup();
    expect(
      within(await screen.findByTestId("tournament-matches__queued")).getByText(
        "—",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("tournament-contingency__court"));
    await user.click(
      screen.getByTestId("tournament-contingency__preview-button"),
    );
    expect(
      await screen.findByText("Nothing already planned would move."),
    ).toBeInTheDocument();
    expect(
      stub.callsTo("POST /api/admin/tournament/contingency/preview")[0]?.body,
    ).toMatchObject({ enabledCourtIds: ["c1"] });
  });
});

/**
 * ADR-319 — every editable field on the tournament surfaces explains itself. The check is generic on
 * purpose: it walks the rendered form and asks each input, select and textarea for its tooltip, so a
 * field added later without help fails here rather than shipping bare.
 */
describe("Every tournament field carries its help (ADR-319)", () => {
  function fieldsIn(root: HTMLElement): HTMLElement[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>("input, select, textarea"),
    ).filter((field) => field.getAttribute("type") !== "hidden");
  }

  function expectEveryFieldDescribed(
    root: HTMLElement,
    expectedAtLeast: number,
  ) {
    const fields = fieldsIn(root);
    expect(fields.length).toBeGreaterThanOrEqual(expectedAtLeast);
    for (const field of fields) {
      const name =
        field.getAttribute("data-testid") ?? field.id ?? field.tagName;
      const describedBy = field.getAttribute("aria-describedby");
      expect(describedBy, `${name} has no aria-describedby`).not.toBeNull();
      const tooltip = (describedBy ?? "")
        .split(" ")
        .map((id) => document.getElementById(id))
        .find((node) => node?.getAttribute("role") === "tooltip");
      expect(
        tooltip,
        `${name}: aria-describedby does not resolve to a tooltip`,
      ).toBeTruthy();
      expect(
        tooltip?.textContent?.trim().length ?? 0,
        `${name}: the tooltip is empty`,
      ).toBeGreaterThan(20);
    }
  }

  it("the new-tournament form", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
    });
    const form = await screen.findByTestId("tournament-setup__draft");
    expectEveryFieldDescribed(form, 6);
  });

  it("the Start form, in each build and for each format", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(adminTournament({ status: "draft" })),
      },
    });
    const user = userEvent.setup();
    const form = await screen.findByTestId("tournament-setup__start-form");
    expectEveryFieldDescribed(form, 8);
    await user.selectOptions(
      screen.getByTestId("tournament-setup__format"),
      "swiss",
    );
    expectEveryFieldDescribed(form, 6);
    await user.selectOptions(
      screen.getByTestId("tournament-setup__format"),
      "single_elimination",
    );
    expectEveryFieldDescribed(form, 6);
    await user.selectOptions(
      screen.getByTestId("tournament-setup__build"),
      "pipeline",
    );
    expectEveryFieldDescribed(form, 20);
  });

  it("a bracket stage fed by an earlier stage shows every one of its fields", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(adminTournament({ status: "draft" })),
      },
    });
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByTestId("tournament-setup__build"),
      "pipeline",
    );
    const second = screen.getByTestId("tournament-setup__stage-1");
    await user.selectOptions(
      within(second).getByTestId("tournament-setup__stage-1-source"),
      "advancers",
    );
    expect(
      within(second).getByTestId("tournament-setup__stage-1-from"),
    ).toBeInTheDocument();
    expectEveryFieldDescribed(second, 8);
    await user.selectOptions(
      within(second).getByTestId("tournament-setup__stage-1-format"),
      "open",
    );
    expectEveryFieldDescribed(second, 4);
  });

  it("the courts form", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
    });
    expectEveryFieldDescribed(
      await screen.findByTestId("tournament-courts__form"),
      2,
    );
  });

  it("the live day: contingency, move and the act dialogs", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(live) },
    });
    const user = userEvent.setup();
    expectEveryFieldDescribed(
      await screen.findByTestId("tournament-contingency"),
      3,
    );
    await user.click(
      (await screen.findAllByTestId("tournament-matches__move"))[0]!,
    );
    expectEveryFieldDescribed(screen.getByTestId("tournament-placement"), 2);
    await user.click(screen.getByTestId("tournament-placement__cancel"));
    const doneRow = (
      await screen.findAllByTestId("tournament-matches__row")
    ).find((row) => row.textContent?.startsWith("DONE"));
    await user.click(
      within(doneRow as HTMLElement).getByTestId("tournament-matches__correct"),
    );
    expectEveryFieldDescribed(
      screen.getByRole("dialog", { name: "Correct DONE" }),
      3,
    );
    await user.click(screen.getByTestId("reason-dialog__cancel"));
    await user.click(
      (
        await screen.findAllByTestId("tournament-entrants__award")
      )[0] as HTMLElement,
    );
    expectEveryFieldDescribed(screen.getByRole("dialog"), 2);
    await user.click(screen.getByTestId("reason-dialog__cancel"));
    await user.click(screen.getByTestId("tournament-scheduler__terminate"));
    expectEveryFieldDescribed(screen.getByRole("dialog"), 1);
  });

  it("the Simulator, in both builds", async () => {
    render(<TournamentSimulatorPage />, {
      "GET /api/admin/tournament": {
        body: consoleView(adminTournament({ status: "closed" })),
      },
    });
    const user = userEvent.setup();
    const knobs = await screen.findByTestId("simulator__knobs");
    expectEveryFieldDescribed(knobs, 12);
    await user.selectOptions(
      screen.getByTestId("simulator__build"),
      "pipeline",
    );
    expectEveryFieldDescribed(knobs, 14);
  });

  it("puts the help text where an admin who cannot hover can still read it", async () => {
    render(<TournamentControlPage />, {
      "GET /api/admin/tournament": { body: consoleView(null) },
    });
    const winTooltip = document.getElementById(
      (
        (await screen.findByTestId("tournament-setup__win")).getAttribute(
          "aria-describedby",
        ) ?? ""
      ).split(" ")[0] ?? "",
    );
    expect(winTooltip).toHaveTextContent(/points/i);
  });
});
