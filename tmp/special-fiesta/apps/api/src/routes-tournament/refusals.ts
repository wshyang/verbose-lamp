import { messages } from '@psd/contracts';
import type { Refusal, RefusalCode } from '@psd/tournament/core';
import { HttpError } from '../lib/http.js';

/**
 * ADR-272 — the engine's refusal messages are developer fallbacks; what a person reads comes from
 * `@psd/contracts`. This is the one table between the two: a refusal code becomes a status and the
 * contract's copy for it. A code with no entry keeps the engine's sentence, as a 400.
 */

interface Spoken {
  status: 400 | 403 | 404 | 409;
  message: string;
}

const SPOKEN: Partial<Record<RefusalCode, Spoken>> = {
  not_found: { status: 404, message: messages.matchNotFound },
  not_allowed: { status: 403, message: messages.onlyStartingFacilitatorCancels },
  wrong_status: { status: 400, message: messages.invalidStatusTransition },
  same_entrant: { status: 400, message: messages.teamCannotPlayItself },
  entrant_busy: { status: 409, message: messages.teamAlreadyPlaying },
  court_unavailable: { status: 400, message: messages.matchOnDisabledCourt },
  court_busy: { status: 409, message: messages.courtBusy },
  stale_score: { status: 400, message: messages.scoreMovesByOne },
  bad_step: { status: 400, message: messages.scoreMovesByOne },
  play_on: { status: 400, message: messages.knockoutPlaysOn },
  winner_required: { status: 400, message: messages.winnerMustMatchScore },
  stage_not_fed: { status: 409, message: messages.stageNotFed },
  stage_started: { status: 409, message: messages.stageStarted },
  stage_fed: { status: 409, message: messages.stageFed },
  has_dependents: { status: 409, message: messages.matchHasDependents },
  not_in_stage: { status: 400, message: messages.teamNotInStage },
  // ADR-336 — a paused day refuses to put anything new on a court. The copy in `messages` is what a
  // marshal reads at the moment their Start button would have worked a second earlier.
  tournament_paused: { status: 409, message: messages.tournamentPaused },
};

export function refusalError(refusal: Refusal): HttpError {
  const spoken = SPOKEN[refusal.code];
  return spoken === undefined ? new HttpError(400, refusal.message) : new HttpError(spoken.status, spoken.message);
}
