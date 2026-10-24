import type { AdminTournamentConsoleView, AwardTier, ContingencyPreviewView, FixtureView, TimetableView, TournamentDraftSetup, TournamentFormatId, TournamentKind } from '@psd/contracts';
import type { PipelineSpec } from '@psd/tournament/scheduler';
import { apiGet, apiPatch, apiPost, apiPut } from './client.js';

/**
 * ADR-279 — the superadmin's tournament console (`/api/admin/tournament`). Every write answers with the
 * whole Control read, so a hook replaces what it holds with the answer instead of patching it.
 *
 * Only the calls a page makes are here (YAGNI): hand-staging and the event log are served by the API
 * and gain a client function with the surface that uses them.
 */

type Console = AdminTournamentConsoleView;

const BASE = '/api/admin/tournament';

export function fetchConsole(): Promise<Console> {
  return apiGet(BASE);
}

export function fetchTimetable(): Promise<TimetableView> {
  return apiGet(`${BASE}/timetable`);
}

/** ADR-288 — the venue's courts (fds S41–S43). The number is 1–20 and unique; the label is shown everywhere. */
export interface CourtBody {
  courtNumber: number;
  label: string;
}

export function createCourt(body: CourtBody): Promise<Console> {
  return apiPost(`${BASE}/courts`, body);
}

export function updateCourt(input: CourtBody & { courtId: string }): Promise<Console> {
  const { courtId, ...body } = input;
  return apiPut(`${BASE}/courts/${courtId}`, body);
}

/** §3.4 — soft: a match already on the court plays on, and no new one starts there. */
export function setCourtEnabled(input: { courtId: string; isEnabled: boolean }): Promise<Console> {
  return apiPatch(`${BASE}/courts/${input.courtId}/enabled`, { isEnabled: input.isEnabled });
}

export interface DraftBody {
  name: string;
  /** ADR-293 — which game type this tournament is for. */
  kind: TournamentKind;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  /** Seed order: the first is seed 1. */
  teamIds: string[];
  /** ADR-313 — the Start configuration saved with the draft, if the form has one to save. */
  setup?: TournamentDraftSetup;
  /** ADR-321 — dumb courts only: the award tiers court masters will use. */
  tiers?: { label: string; points: number }[];
}

export function createDraft(body: DraftBody): Promise<Console> {
  return apiPost(BASE, body);
}

export function discardDraft(): Promise<Console> {
  return apiPost(`${BASE}/discard`, {});
}

export interface FormatOptionsBody {
  groupSize?: number;
  advanceCount?: number;
  hasThirdPlace?: boolean;
  pairing?: 'classic' | 'adjacent';
  rounds?: number;
}

export interface ActivateBody {
  /** ADR-321 — dumb courts Start: no format, no pipeline; the draft simply goes live. */
  dumb?: boolean;
  formatId?: TournamentFormatId;
  options?: FormatOptionsBody;
  /** ADR-311 — or a stage pipeline instead of a format (ADR-310); never both. */
  pipeline?: PipelineSpec;
  matchMinutes: number;
  changeoverMinutes: number;
  restMinutes: number;
  deadlineAt: string | null;
}

export function activateTournament(body: ActivateBody): Promise<Console> {
  return apiPost(`${BASE}/activate`, body);
}

export interface CorrectionBody {
  matchId: string;
  scoreA: number;
  scoreB: number;
  winnerSide: 'a' | 'b' | null;
  tiebreakMethod?: 'coin_toss' | 'rock_paper_scissors' | null;
  reason: string;
}

export function correctResult(input: CorrectionBody): Promise<Console> {
  const { matchId, ...body } = input;
  return apiPost(`${BASE}/matches/${matchId}/result`, body);
}

export function recordWalkover(input: { matchId: string; winnerSide: 'a' | 'b'; reason: string }): Promise<Console> {
  const { matchId, ...body } = input;
  return apiPost(`${BASE}/matches/${matchId}/walkover`, body);
}

export function setMatchVoided(input: { matchId: string; isVoided: boolean; reason: string }): Promise<Console> {
  const { matchId, ...body } = input;
  return apiPost(`${BASE}/matches/${matchId}/void`, body);
}

export function cancelMatch(input: { matchId: string; reason: string }): Promise<Console> {
  return apiPost(`${BASE}/matches/${input.matchId}/cancel`, { reason: input.reason });
}

/** ADR-329 F2 — a stage-close override, spoken by seat or by place (fed open stages have no seats to name). */
export type StageOverrideBody =
  | { matchId: string; side: 'a' | 'b'; teamId: string }
  | { place: number; teamId: string };

export function completeStage(input: { stageId: string; overrides: StageOverrideBody[]; reason: string | null }): Promise<Console> {
  return apiPost(`${BASE}/stages/${input.stageId}/complete`, { overrides: input.overrides, reason: input.reason });
}

/** ADR-329 F3 — the one way a filled seat moves: by a person, with a reason. */
export function reseatMatch(input: { matchId: string; side: 'a' | 'b'; teamId: string; reason: string }): Promise<Console> {
  const { matchId, ...body } = input;
  return apiPost(`${BASE}/matches/${matchId}/reseat`, body);
}

export interface RestageBody {
  groupSize?: number | undefined;
  advanceCount?: number | undefined;
  hasThirdPlace?: boolean | undefined;
  intakeCount?: number | undefined;
  matchMinutes?: number | undefined;
  tablePoints?: { win: number; draw: number; loss: number } | null | undefined;
  reason: string;
}

/** ADR-334 (ADR-329 F12) — rebuild one unstarted stage from the plan the tournament started with. */
export function restructureStage(input: { stageId: string; body: RestageBody }): Promise<Console> {
  return apiPost(`${BASE}/stages/${input.stageId}/restructure`, input.body);
}

/** ADR-329 F4 — hand a live structure match back to the queue from the desk. */
export function handBackMatch(input: { matchId: string; reason: string | null }): Promise<Console> {
  return apiPost(`${BASE}/matches/${input.matchId}/hand-back`, { reason: input.reason });
}

export function withdrawTeam(input: { teamId: string; reason: string }): Promise<Console> {
  return apiPost(`${BASE}/entrants/${input.teamId}/withdraw`, { reason: input.reason });
}

export function awardPoints(body: { teamId: string; points: number; reason: string }): Promise<Console> {
  return apiPost(`${BASE}/awards`, body);
}

/** ADR-289 — requirement 9: a person puts a match on a court at a time; a running scheduler keeps it there. */
export function moveMatch(input: { matchId: string; courtId: string; startAt: string }): Promise<Console> {
  return apiPost(`${BASE}/matches/${input.matchId}/move`, { courtId: input.courtId, startAt: input.startAt });
}

/** Hands a pinned match back to the planner. */
export function releaseMatchPin(matchId: string): Promise<Console> {
  return apiPost(`${BASE}/matches/${matchId}/release`, {});
}

export interface ContingencyBody {
  enabledCourtIds: string[];
  matchMinutes: number;
  changeoverMinutes: number;
  /** ADR-329 F13 — explicit lengths per stage; a stage not named follows `matchMinutes`. */
  stageMinutes: { stageId: string; matchMinutes: number }[];
  restMinutes?: number | undefined;
  /** Omitted keeps the hard stop; null clears it. */
  deadlineAt?: string | null | undefined;
}

export function previewContingency(body: ContingencyBody): Promise<ContingencyPreviewView> {
  return apiPost(`${BASE}/contingency/preview`, body);
}

export function applyContingency(body: ContingencyBody): Promise<Console> {
  return apiPost(`${BASE}/contingency/apply`, body);
}

export function terminateScheduler(reason: string): Promise<Console> {
  return apiPost(`${BASE}/scheduler/terminate`, { reason });
}

export function closeTournament(reason: string | null): Promise<Console> {
  return apiPost(`${BASE}/close`, { reason });
}

/**
 * ADR-336 §5 — the one-way switch to court awards. `clientUuid` is minted before the post: a double
 * tap replays the first switch instead of making a second award day. `confirmation` must be the word.
 */
export interface SwitchBody {
  reason: string;
  confirmation: string;
  clientUuid: string;
  tiers?: AwardTier[];
  /** ADR-336 §5.4 — the ask this switch answers, when the desk reviewed one. */
  requestId?: string;
}

export function switchToAwards(body: SwitchBody): Promise<Console> {
  return apiPost(`${BASE}/switch`, body);
}

/** ADR-336 §5.4 — the desk declining a facilitator’s ask, with a reason. */
export function declineModeRequest(input: {
  requestId: string;
  reason: string;
}): Promise<Console> {
  return apiPost(`${BASE}/mode/requests/${input.requestId}/decline`, {
    reason: input.reason,
  });
}

/** ADR-284 — the court console's Line-ups subtab: what is planned on one court, in play order. */
export function fetchCourtLineups(courtId: string): Promise<{ items: FixtureView[] }> {
  return apiGet(`/api/tournament/courts/${courtId}/lineups`);
}
