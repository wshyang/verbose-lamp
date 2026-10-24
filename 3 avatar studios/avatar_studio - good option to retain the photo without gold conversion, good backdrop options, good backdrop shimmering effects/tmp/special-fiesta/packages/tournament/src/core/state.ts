import type {
  Actor,
  CommandContext,
  CommandResult,
  EventKind,
  Match,
  Refusal,
  RefusalCode,
  TournamentEvent,
  TournamentState,
} from './types.js';

/**
 * ADR-273 — the small vocabulary every command is written in: refuse, accept, replace a match,
 * record an event. Nothing here mutates: every helper returns a new value.
 */

export function refuse(code: RefusalCode, message: string): CommandResult {
  return { ok: false, refusal: { code, message } satisfies Refusal };
}

export function accept(state: TournamentState, events: readonly TournamentEvent[]): CommandResult {
  return { ok: true, state, events };
}

export function findMatchById(state: TournamentState, matchId: string): Match | undefined {
  return state.matches.find((match) => match.id === matchId);
}

/** The state with one match replaced by its new value. */
export function withMatch(state: TournamentState, next: Match): TournamentState {
  return { ...state, matches: state.matches.map((match) => (match.id === next.id ? next : match)) };
}

/** The state with several matches replaced at once (a correction that also touches dependents). */
export function withMatches(state: TournamentState, next: readonly Match[]): TournamentState {
  const byId = new Map(next.map((match) => [match.id, match]));
  return { ...state, matches: state.matches.map((match) => byId.get(match.id) ?? match) };
}

export interface EventInput {
  kind: EventKind;
  matchId?: string | null;
  reason?: string | null;
  detail?: Readonly<Record<string, string | number | boolean | null>>;
}

export function eventOf(context: { now: string; actor: Actor }, input: EventInput): TournamentEvent {
  return {
    kind: input.kind,
    at: context.now,
    actor: context.actor,
    matchId: input.matchId ?? null,
    reason: input.reason ?? null,
    detail: input.detail ?? {},
  };
}

/** A reason a person must give: trimmed, 1–200 characters (the register's rule everywhere). */
export function cleanReason(reason: string | null | undefined): string | null {
  const trimmed = (reason ?? '').trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  return trimmed;
}

/** The next id the adapter minted for this command; throws when it did not mint enough. */
export function takeId(context: CommandContext, index: number): string {
  const id = context.newIds[index];
  if (id === undefined) throw new Error(`command needs at least ${index + 1} new id(s)`);
  return id;
}

export function isSuperadmin(actor: Actor): boolean {
  return actor.kind === 'superadmin' || actor.kind === 'system';
}

/**
 * ADR-336 — a paused tournament starts nothing. A pause stops STARTING, not finishing: scoring,
 * completing, correcting, voiding, awarding and closing all stay allowed, because the match on the
 * court belongs to the people playing it until somebody ends it.
 */
export function refuseWhenPaused(state: TournamentState): CommandResult | null {
  if (state.tournament.pausedAt === null) return null;
  return refuse(
    'tournament_paused',
    'The day has stopped starting matches. Finish what is on court, or call it off.',
  );
}

/** A tournament that is closed is read, not played (P-15). */
export function refuseWhenClosed(state: TournamentState): CommandResult | null {
  if (state.tournament.status === 'closed') return refuse('tournament_closed', 'This tournament is closed.');
  return null;
}
