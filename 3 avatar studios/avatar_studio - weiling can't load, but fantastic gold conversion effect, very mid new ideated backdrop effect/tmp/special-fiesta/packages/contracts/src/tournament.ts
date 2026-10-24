import { z } from "zod";
import { messages } from "./messages.js";
import { awardTiersSchema, reasonSchema } from "./schemas.js";
import type { AwardTier, MatchView } from "./wire.js";

/**
 * ADR-279 — the superadmin's tournament console: the Control, Timetable and Simulator subtabs. Its
 * own module because the two shared files are at the size limit, and because nothing here is read by
 * a kept surface — those keep the wire types in `wire.ts` (ADR-277).
 */

export const tournamentFormatIds = [
  "open",
  "round_robin",
  "groups_knockout",
  "single_elimination",
  "double_elimination",
  "consolation",
  "swiss",
  "flighted_quads",
  "ironman",
  "points_rush",
] as const;

export type TournamentFormatId = (typeof tournamentFormatIds)[number];

/** ADR-311 — what a scheduler row can name: a whole-tournament format, or a composed pipeline. */
export type SchedulerFormatId = TournamentFormatId | "pipeline";

// ── requests ─────────────────────────────────────────────────────────────────────────────────

const points = z
  .number()
  .int()
  .min(0, messages.winPointsInvalid)
  .max(100, messages.winPointsInvalid);

const minutes = (bounds: { min: number; max: number }) =>
  z
    .number()
    .int()
    .min(bounds.min, messages.tournamentTimingInvalid)
    .max(bounds.max, messages.tournamentTimingInvalid);

export const courtRequestSchema = z.object({
  courtNumber: z
    .number()
    .int()
    .min(1, messages.courtNumberInvalid)
    .max(20, messages.courtNumberInvalid),
  label: z
    .string()
    .trim()
    .min(1, messages.courtLabelRequired)
    .max(30, messages.courtLabelRequired),
});

export const courtEnabledRequestSchema = z.object({ isEnabled: z.boolean() });

/** ADR-293 — implemented game types. Extend when a new game type is added. */
/** ADR-321 — 'dumb_courts': courts run as award stations; no fixtures are ever built. */
export const tournamentKinds = ["captains_ball", "dumb_courts"] as const;
export type TournamentKind = (typeof tournamentKinds)[number];

export const pointRatesSchema = z.object({
  win: points,
  draw: points,
  loss: points,
});

export const formatOptionsSchema = z.object({
  groupSize: z.number().int().min(2).max(8).optional(),
  advanceCount: z.number().int().min(1).max(4).optional(),
  hasThirdPlace: z.boolean().optional(),
  pairing: z.enum(["classic", "adjacent"]).optional(),
  rounds: z.number().int().min(1).max(10).optional(),
  /** ADR-320 — a stage's internal table points (ranking only, never paid); absent = default 3/1/0. */
  tablePoints: pointRatesSchema.optional(),
});

/**
 * ADR-310 — one stage of a pipeline activation: its own format, entrant source
 * and duration. The structural reading lives here; the semantic reading (codes
 * unique, advancers from an earlier stage, groups that divide the field) is the
 * engine's `validatePipeline`, refused at activation with its message.
 */
export const pipelineStageSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, messages.tournamentTimingInvalid)
    .max(12, messages.tournamentTimingInvalid)
    .regex(/^[A-Za-z0-9_-]+$/, messages.tournamentTimingInvalid),
  label: z
    .string()
    .trim()
    .min(1, messages.tournamentTimingInvalid)
    .max(40, messages.tournamentTimingInvalid),
  format: z.enum(["pool", "bracket", "open"]),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("initial") }),
    z.object({
      kind: z.literal("advancers"),
      fromStage: z.string().trim().min(1).max(12),
      count: z.number().int().min(2).max(32),
    }),
  ]),
  matchMinutes: minutes({ min: 1, max: 180 }).nullable().default(null),
  options: formatOptionsSchema
    .extend({
      groupCount: z.number().int().min(1).max(16).optional(),
      rates: pointRatesSchema.optional(),
    })
    .default({}),
});

export const pipelineSpecSchema = z.object({
  stages: z.array(pipelineStageSchema).min(1).max(8),
});

/**
 * ADR-313 — the Start configuration a draft may carry before Start finalises it. The deadline is a
 * local time of day, not an instant: the day Start is pressed supplies the date, exactly as the
 * Start form's own deadline field does.
 */
export const draftSetupSchema = z
  .object({
    buildMode: z.enum(["format", "pipeline"]),
    formatId: z.enum(tournamentFormatIds).optional(),
    options: formatOptionsSchema.default({}),
    pipeline: pipelineSpecSchema.optional(),
    matchMinutes: minutes({ min: 1, max: 180 }),
    changeoverMinutes: minutes({ min: 0, max: 60 }),
    restMinutes: minutes({ min: 0, max: 120 }),
    deadline: z
      .string()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
      .nullable()
      .default(null),
  })
  .superRefine((value, context) => {
    if (value.buildMode === "format" && value.formatId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["formatId"],
        message: "Choose a format or a pipeline, not both.",
      });
    }
    if (value.buildMode === "format" && value.pipeline !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pipeline"],
        message: "Choose a format or a pipeline, not both.",
      });
    }
    if (value.buildMode === "pipeline" && value.pipeline === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pipeline"],
        message: "Choose a format or a pipeline, not both.",
      });
    }
    if (value.buildMode === "pipeline" && value.formatId !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["formatId"],
        message: "Choose a format or a pipeline, not both.",
      });
    }
  });

export type TournamentDraftSetup = z.infer<typeof draftSetupSchema>;

export const createTournamentRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, messages.tournamentNameInvalid)
    .max(60, messages.tournamentNameInvalid),
  /** Which game type this tournament is for. Orthogonal to format (bracket shape, chosen at activate). */
  kind: z.enum(tournamentKinds).default("captains_ball"),
  winPoints: points,
  drawPoints: points,
  lossPoints: points,
  /** Teams in seed order; the first is seed 1. */
  teamIds: z
    .array(z.string().uuid())
    .min(2, messages.needTwoTeams)
    .max(64, messages.tournamentTooManyTeams),
  /** ADR-313 — the Start configuration saved with the draft, if the desk has one to save. */
  setup: draftSetupSchema.optional(),
  /** ADR-321 — dumb courts only: the point tiers court masters award from. Required for that kind. */
  tiers: awardTiersSchema.optional(),
});

export const activateTournamentRequestSchema = z
  .object({
    /** ADR-321 — dumb courts Start: no format, no pipeline, no fixtures; the draft simply goes live. */
    dumb: z.boolean().optional(),
    formatId: z.enum(tournamentFormatIds).optional(),
    options: formatOptionsSchema.default({}),
    /** ADR-310 — a stage pipeline instead of a whole-tournament format. */
    pipeline: pipelineSpecSchema.optional(),
    matchMinutes: minutes({ min: 1, max: 180 }),
    changeoverMinutes: minutes({ min: 0, max: 60 }),
    restMinutes: minutes({ min: 0, max: 120 }),
    /** The day's hard stop, if there is one: the fit is measured against it; it never gates anything. */
    deadlineAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.dumb === true) {
      if (value.formatId !== undefined || value.pipeline !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dumb"],
          message: "Dumb courts have no format or pipeline.",
        });
      }
      return;
    }
    if ((value.formatId === undefined) === (value.pipeline === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["formatId"],
        message: "Choose a format or a pipeline, not both.",
      });
    }
  });

export const contingencyRequestSchema = z.object({
  enabledCourtIds: z.array(z.string().uuid()).max(20),
  matchMinutes: minutes({ min: 1, max: 180 }),
  changeoverMinutes: minutes({ min: 0, max: 60 }),
  /** ADR-329 F13 — explicit lengths per stage; a stage not named follows `matchMinutes`. */
  stageMinutes: z
    .array(
      z.object({
        stageId: z.string().uuid(),
        matchMinutes: minutes({ min: 1, max: 180 }),
      }),
    )
    .max(32)
    .default([]),
  restMinutes: minutes({ min: 0, max: 120 }).optional(),
  /** Omitted keeps the hard stop; null clears it. */
  deadlineAt: z.string().datetime().nullable().optional(),
});

export const correctResultRequestSchema = z.object({
  scoreA: z.number().int().min(0).max(199),
  scoreB: z.number().int().min(0).max(199),
  /** A side, only when the score cannot say (a knockout recorded 0 - 0). */
  winnerSide: z.enum(["a", "b"]).nullable().default(null),
  /** ADR-329 F5 — how a level knockout was settled off the scoreboard, when it was. */
  tiebreakMethod: z
    .enum(["coin_toss", "rock_paper_scissors"])
    .nullable()
    .default(null),
  reason: reasonSchema,
});

export const walkoverRequestSchema = z.object({
  winnerSide: z.enum(["a", "b"]),
  reason: reasonSchema,
});

export const matchVoidRequestSchema = z.object({
  isVoided: z.boolean(),
  reason: reasonSchema,
});

export const reseatRequestSchema = z.object({
  side: z.enum(["a", "b"]),
  teamId: z.string().uuid(),
  reason: reasonSchema,
});

export const adminCancelMatchRequestSchema = z.object({ reason: reasonSchema });

export const stageAdHocRequestSchema = z.object({
  courtId: z.string().uuid(),
  teamAId: z.string().uuid(),
  teamBId: z.string().uuid(),
});

export const moveMatchRequestSchema = z.object({
  courtId: z.string().uuid(),
  startAt: z.string().datetime({ offset: true }),
});

export const completeStageRequestSchema = z.object({
  /**
   * Seats the desk fills against the table, all under the one reason below. Spoken by seat
   * (`matchId` + `side`) or by place (`place`) — the place form is for a fed open stage,
   * which has no fixture seats to name (ADR-329 F2).
   */
  overrides: z
    .array(
      z.union([
        z.object({
          matchId: z.string().uuid(),
          side: z.enum(["a", "b"]),
          teamId: z.string().uuid(),
        }),
        z.object({
          place: z.number().int().min(1).max(32),
          teamId: z.string().uuid(),
        }),
      ]),
    )
    .max(32)
    .default([]),
  reason: z.string().trim().max(200).nullable().default(null),
});

/**
 * ADR-334 (ADR-329 F12) — rebuild one unstarted, unfed stage on the day. Only the knobs the
 * format re-validates are sent; the reason is required because the rebuild is an audited act.
 */
export const restageStageRequestSchema = z.object({
  groupSize: z.number().int().min(2).max(16).optional(),
  advanceCount: z.number().int().min(0).max(16).optional(),
  hasThirdPlace: z.boolean().optional(),
  intakeCount: z.number().int().min(1).max(64).optional(),
  matchMinutes: z.number().int().min(1).max(180).optional(),
  tablePoints: z
    .object({
      win: z.number().int().min(0).max(999),
      draw: z.number().int().min(0).max(999),
      loss: z.number().int().min(0).max(999),
    })
    .nullable()
    .optional(),
  reason: reasonSchema,
});

/** ADR-329 F4 — hand a live structure match back to the queue from the desk. The reason is kept for the audit trail. */
export const handBackRequestSchema = z.object({
  reason: reasonSchema.nullable().default(null),
});

export const withdrawTeamRequestSchema = z.object({ reason: reasonSchema });

export const tournamentAwardRequestSchema = z.object({
  teamId: z.string().uuid(),
  points: z
    .number()
    .int()
    .min(-100, messages.adjustmentPointsInvalid)
    .max(100, messages.adjustmentPointsInvalid)
    .refine((value) => value !== 0, messages.adjustmentPointsInvalid),
  reason: reasonSchema,
});

export const terminateSchedulerRequestSchema = z.object({
  reason: reasonSchema,
});

export const closeTournamentRequestSchema = z.object({
  reason: z.string().trim().max(200).nullable().default(null),
});

/** ADR-336 — the one-way hold: a reason is required, because it is what the room is told. */
export const pauseTournamentRequestSchema = z.object({
  reason: z.string().trim().min(1).max(200),
});

/**
 * ADR-336 §5 — the one-way switch to court awards.
 *
 * `confirmation` must be the word "switch": the guard against a slip must not become a spelling test,
 * so it is compared case-insensitively and trimmed, but it is required — this is the only act in the
 * app that cannot be undone. `clientUuid` is minted before the desk posts, so a double tap replays the
 * first switch rather than making a second award day. `tiers` is what the dialog showed after the desk
 * edited it; omitting it accepts the derivation from the day's own paid rates (§4).
 */
export const switchTournamentRequestSchema = z.object({
  confirmation: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(1).max(200),
  tiers: awardTiersSchema.optional(),
  clientUuid: z.string().uuid(),
  /** ADR-336 §5.4 — the ask this switch is answering, when the desk reviewed one. */
  requestId: z.string().uuid().optional(),
});

/**
 * ADR-336 §5.4 — a facilitator asking the desk to switch the day.
 *
 * The ask is not authority: it names a person, a reason and (optionally) the court it came from, and
 * the desk either reviews it into a full switch or declines it. `clientUuid` is minted before the
 * post so a double tap returns the same ask rather than two for the desk to read.
 */
export const askSwitchRequestSchema = z.object({
  reason: z.string().trim().min(1).max(200),
  courtId: z.string().uuid().optional(),
  clientUuid: z.string().uuid(),
});

export const declineSwitchRequestSchema = z.object({
  reason: z.string().trim().min(1).max(200),
});

// ── views ────────────────────────────────────────────────────────────────────────────────────

export interface AdminCourtView {
  id: string;
  courtNumber: number;
  label: string;
  isEnabled: boolean;
}

export interface AdminSeatView {
  label: string;
  teamId: string | null;
  teamName: string | null;
  /** True once the seat is frozen: the team is sent, and a correction will not move it. */
  isSeated: boolean;
  seatOverrideReason: string | null;
}

/** ADR-329 F3 — a frozen seat the results, as they now stand, would fill differently. */
export interface AdminSeatConflictView {
  side: "a" | "b";
  seatedTeamId: string | null;
  seatedTeamName: string | null;
  wouldBeTeamId: string | null;
  wouldBeTeamName: string | null;
}

export interface AdminMatchView {
  id: string;
  code: string;
  stageId: string;
  stageLabel: string;
  groupCode: string | null;
  round: number;
  sequence: number;
  origin: "structure" | "ad_hoc";
  isPlacement: boolean;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  courtId: string | null;
  courtLabel: string | null;
  plannedStartAt: string | null;
  plannedMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
  startedByLabel: string | null;
  scoreA: number;
  scoreB: number;
  resultKind: "score" | "walkover" | "bye" | null;
  winnerSide: "a" | "b" | null;
  isVoided: boolean;
  cancelReason: string | null;
  isPinned: boolean;
  /** ADR-329 F3 — the first open seat conflict on this match, or null when its seats agree with the table. */
  seatConflict: AdminSeatConflictView | null;
  a: AdminSeatView;
  b: AdminSeatView;
}

export interface AdminStandingView {
  teamId: string | null;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  difference: number;
  points: number;
  rank: number;
  explanation: string;
}

export interface AdminGroupView {
  id: string;
  code: string;
  label: string;
  standings: AdminStandingView[];
}

export interface AdminAdvancerView {
  teamId: string | null;
  name: string;
  /** 1-based place in advancer order (qualifiers first, then shortfall fills). */
  place: number;
  /** ADR-320 — a per-group qualifier, or a shortfall fill from the internal table. */
  via: "qualifier" | "fill";
}

export interface AdminStageView {
  id: string;
  /** ADR-334 — the stage's plan code ('GRP', 'KO'), as stored when the tournament started. */
  code: string;
  /** ADR-334 — a match in this stage has started or finished ("started" is measured on matches). */
  hasStarted: boolean;
  /** ADR-334 — how many teams have been fed into this stage (0 until its feeder closes). */
  rosterCount: number;
  label: string;
  kind: "pool" | "bracket" | "swiss" | "open";
  status: "pending" | "active" | "completed";
  advanceCount: number;
  /** ADR-320 — the internal table points this stage ranks by (default 3/1/0); never paid. */
  tablePoints: { win: number; draw: number; loss: number };
  /** ADR-320 — who the next stage takes from this one, in order, and how each got there. */
  advancers: AdminAdvancerView[];
  /**
   * ADR-325 — where this stage's teams come from when an earlier stage decides them: that stage's
   * name and how many it sends on. Null for a stage dealt from the entered teams. Lets the desk say
   * "decided when Groups closes" for a group nobody has been seated in yet.
   */
  intake: { fromLabel: string; count: number } | null;
  /** ADR-329 F2 — the pairs level on a cut line of this stage ("A / B"), for the desk to settle when closing. */
  cutTies: string[];
  groups: AdminGroupView[];
  /** Ranked over the whole stage: what decides a Swiss table, the points-rush winners, open play. */
  standings: AdminStandingView[];
}

export interface AdminEntrantView {
  teamId: string;
  name: string;
  entryOrder: number;
  withdrawnAt: string | null;
  awardedPoints: number;
}

export interface AdminSchedulerView {
  format: SchedulerFormatId;
  options: Record<string, string | number | boolean>;
  status: "active" | "terminated";
  matchMinutes: number;
  changeoverMinutes: number;
  restMinutes: number;
  deadlineAt: string | null;
  plannedAt: string | null;
  terminatedAt: string | null;
  terminatedByLabel: string | null;
  terminateReason: string | null;
  revision: number;
}

export interface FitView {
  remainingMatches: number;
  courtMinutes: number;
  projectedFinishAt: string | null;
  fitsDeadline: boolean | null;
  overrunMinutes: number;
}

export interface PlacementChangeView {
  matchId: string;
  code: string;
  kind: "added" | "removed" | "moved";
  from: { courtLabel: string; startAt: string } | null;
  to: { courtLabel: string; startAt: string } | null;
}

export interface TournamentEventView {
  at: string;
  kind: string;
  actorLabel: string;
  matchId: string | null;
  reason: string | null;
}

export interface AdminTournamentView {
  id: string;
  name: string;
  status: "draft" | "live" | "closed";
  /** ADR-293 — which game type this tournament is for. */
  kind: TournamentKind;
  rates: { win: number; draw: number; loss: number };
  createdAt: string;
  startedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  revision: number;
  entrants: AdminEntrantView[];
  stages: AdminStageView[];
  matches: AdminMatchView[];
  scheduler: AdminSchedulerView | null;
  /** ADR-313 — the Start configuration saved with this draft; null once there is nothing to save. */
  draftSetup: TournamentDraftSetup | null;
  /** ADR-321 — dumb courts only: the configured award tiers; empty for captain's ball. */
  dumbTiers: AwardTier[];
  fit: FitView | null;
}

export interface AdminTeamChoiceView {
  id: string;
  name: string;
  memberCount: number;
}

/** The Control subtab in one read: the venue, the day, and the teams the setup form can enter. */
export interface AdminTournamentConsoleView {
  courts: AdminCourtView[];
  tournament: AdminTournamentView | null;
  teams: AdminTeamChoiceView[];
  /** ADR-336 — which game the room is playing, read once so no screen has to infer it. */
  mode: TournamentOperatingMode;
  /** ADR-336 — the switch that made this an award day, and what the drain is still waiting for. */
  modeSwitch: ModeSwitchView | null;
  /** ADR-336 §5.4 — a facilitator's pending ask, for the desk to review or decline. */
  modeRequest: ModeRequestView | null;
  /** ADR-336 §4 — what the switch dialog opens with: the day's own paid rates, as buttons. */
  suggestedTiers: AwardTier[];
}

/**
 * ADR-336 — which game the room is playing. `switching` is the mixed window: the desk has confirmed
 * and some courts are still finishing; every court with no live match already awards.
 */
export type TournamentOperatingMode = "fixtures" | "switching" | "dumb";

/** One court during the drain: still finishing its match, or already awarding. */
export interface DrainCourtView {
  courtId: string;
  courtLabel: string;
  isFinishing: boolean;
}

/** ADR-336 §5.4 — a facilitator's ask, as the desk and the court read it. */
export interface ModeRequestView {
  id: string;
  requestedByLabel: string;
  reason: string;
  /** The court it was made from, when it was made from one. */
  courtLabel: string | null;
  createdAt: string;
}

/**
 * ADR-342 — the asker's latest answer. The ask never expires, so the loop closes by telling the court
 * what the desk decided: a decline carries its reason, a confirmation is the room switching.
 */
export interface ModeRequestAnswerView {
  id: string;
  resolution: "confirmed" | "declined";
  declineReason: string | null;
  resolvedAt: string;
}

/**
 * ADR-336 §5.4 — `GET /api/tournament/mode`: the room's mode and the ask waiting on the desk, in one
 * read, so a court page polls one thing rather than inferring either.
 */
export interface TournamentModeView {
  mode: TournamentOperatingMode;
  /** True when this court should be awarding: `dumb`, or `switching` with no match on this court. */
  isAwarding: boolean;
  pendingRequest: ModeRequestView | null;
  /** The viewer's own latest answer, if they are the facilitator who asked. ADR-342. */
  lastAnswer: ModeRequestAnswerView | null;
}

/** ADR-336 §5/§6.4 — the switch as the desk reads it back. */
export interface ModeSwitchView {
  switchedAt: string;
  switchedByLabel: string;
  reason: string;
  fixturesTournamentName: string;
  awardTournamentName: string;
  tiers: AwardTier[];
  /** True once the retired bracket has closed itself; false while the drain still has a court busy. */
  fixturesEnded: boolean;
  courts: DrainCourtView[];
}

/** One court's lane on the Timetable subtab. */
export interface TimetableLaneView {
  court: AdminCourtView;
  matches: AdminMatchView[];
}

export interface TimetableView {
  now: string;
  lanes: TimetableLaneView[];
  /** Scheduled matches with no court or time yet: the planner could not place them. */
  unplaced: AdminMatchView[];
  fit: FitView | null;
}

/** A contingency preview: what the change would move, and how the day would then fit. */
export interface ContingencyPreviewView {
  changes: PlacementChangeView[];
  fit: FitView;
}

/** ADR-321 — a court master's award: the tier is named, the points always come from the tournament's configured tier. */
export const dumbAwardRequestSchema = z.object({
  teamId: z.string().uuid(),
  tierLabel: z
    .string()
    .trim()
    .min(1, messages.tierLabelInvalid)
    .max(20, messages.tierLabelInvalid),
  /** Minted when the court master arms the award; a retried tap replays the same award, never a second one. */
  clientAwardUuid: z.string().uuid(),
});

export const dumbVoidRequestSchema = z.object({
  reason: reasonSchema.optional(),
});

export interface DumbTeamOptionView {
  teamId: string;
  teamName: string;
  memberCount: number;
}

export interface DumbAwardView {
  id: string;
  teamId: string;
  teamName: string;
  tierLabel: string;
  points: number;
  awardedAt: string;
  awardedByLabel: string;
  isVoided: boolean;
  /** True only for the awarding facilitator, inside the undo window. */
  canUndo: boolean;
}

export interface DumbCourtView {
  courtId: string;
  courtLabel: string;
  tournamentName: string;
  tiers: AwardTier[];
  teams: DumbTeamOptionView[];
  awards: DumbAwardView[];
  undoWindowSeconds: number;
}

/** ADR-321 — one Results line in dumb mode: "Team XXX is awarded XXX points!" */
export interface AwardFeedEntryView {
  id: string;
  teamName: string;
  tierLabel: string;
  points: number;
  awardedAt: string;
  isVoided: boolean;
}

/** ADR-341 — how Results reads the day: the fixtures, the awards, or a day that switched between them. */
export type MatchFeedMode = "matches" | "dumb" | "mixed";

/**
 * ADR-341 (§7 option B) — a day that switched mid-way has both kinds of result, so the feed says so.
 *
 * `mixed` is the one shape that carries both: the award ledger the room is watching now in `awards`,
 * and the matches it watched earlier in `items`. Nothing is dropped for being from before the switch,
 * which is the whole point of the option.
 */
export interface MatchFeedView {
  items: MatchView[];
  mode: MatchFeedMode;
  awards: AwardFeedEntryView[];
}
