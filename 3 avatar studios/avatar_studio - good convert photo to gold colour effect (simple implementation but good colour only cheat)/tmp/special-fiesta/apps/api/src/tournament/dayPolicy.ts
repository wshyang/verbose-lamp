import { and, desc, eq } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { firstOrNull } from '../db/rows.js';
import { tournaments, type TournamentRow } from '../db/schema/index.js';
import { findDayTournament, findDeskTournamentAnyKind, findOpenTournament } from './load.js';

/**
 * ADR-345 — the day policy: which tournament a surface means, named once (S10).
 *
 * Every surface that asks "which tournament?" is really making a two-axis choice — which row
 * states it will see (draft / live / closed-started / discarded) and which kinds it will cross
 * (captain's ball / dumb courts). Before this module, ten routes composed those axes from the
 * `load.ts` finders by hand, and ADR-326 is what that costs: the console resolved the desk's
 * day one way (ADR-321 — any kind, captain's ball preferred) while the close route resolved it
 * another (open captain's ball, or nothing), and on a dumb-only day the Close button closed
 * nothing — it 404'd on the captain's-ball slot. Two routes, two compositions, one bug.
 *
 * Here each policy is one function with one name, its two axes stated in its doc comment, and
 * the whole matrix played against a real database in `tests/tournament-day-policy.test.ts`.
 * The finder primitives stay in `load.ts`; `commands.ts` keeps its one sanctioned use (it
 * resolves inside the engine transaction, with the kind dynamic); everywhere else the standards
 * rule `tournament-day-policy` refuses the finder names, so a new route cannot quietly go back
 * to composing.
 */

/**
 * The desk's draft, whatever its kind.
 *
 * A draft is unambiguous where an *open tournament* is not: once a bracket is live, "the open
 * one" is the bracket, so a dumb draft waiting beside it could never be started and the operator
 * was told "this tournament has already started" — a true sentence about the wrong tournament.
 * (Moved out of the mode module at ADR-336's home by ADR-345; the mode keeps only what reads
 * the mode itself.)
 */
async function findDraft(db: Executor): Promise<TournamentRow | null> {
  const rows = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.status, 'draft'))
    .orderBy(desc(tournaments.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The live tournament of one kind, if there is one.
 *
 * (Moved from the mode module, ADR-336, where it was read off the live-rows read; here it is
 * the primitive behind `liveBracket`, `bracketIsLive` and `liveDumbDay` — the three call sites
 * that had each re-composed it by hand, which is S10's finding in miniature.)
 */
async function liveTournamentOfKind(db: Executor, kind: 'captains_ball' | 'dumb_courts'): Promise<TournamentRow | null> {
  return firstOrNull(
    await db
      .select()
      .from(tournaments)
      .where(and(eq(tournaments.status, 'live'), eq(tournaments.kind, kind)))
      .limit(1),
  );
}

/**
 * The day every reader sees (ADR-277). Axes: row states — live, else the one closed most
 * recently WITH a start (a played day's results stand, so the feed and the tables do not go
 * blank the moment the desk closes the day; a draft is the desk's work in progress and shows
 * nobody anything, and neither does a discarded one — closed without ever starting, it would
 * read to the room as a day already played); kinds — captain's ball only.
 *
 * Caller: `routes-tournament/support.ts` `readDay`, the cached picture every poll reads.
 */
export async function readersDay(db: Executor): Promise<TournamentRow | null> {
  return findDayTournament(db);
}

/**
 * The dumb day a reader sees: the award ledger's own day. Axes: row states — live, else the one
 * closed most recently with a start (same reading as `readersDay`); kinds — dumb courts only.
 *
 * Callers: `routes-tournament/dumb.ts` (the desk's view of the award day) and
 * `routes-tournament/reads.ts` (the surfaces that mix award entries into the day).
 */
export async function dumbDay(db: Executor): Promise<TournamentRow | null> {
  return findDayTournament(db, 'dumb_courts');
}

/**
 * The desk's tournament, whatever its kind (ADR-321). Axes: row states — an open one (draft or
 * live) first, else the one closed most recently, a discarded day included (the desk may look
 * at its own history); kinds — both, captain's ball preferred when both are open. The console
 * is modal: it runs the tournament the day is operating.
 *
 * Callers: `routes-tournament/desk.ts` (`readDesk`, `readEventLog`). The close route's kind
 * picker (`openDayExists`) states the same preference — that pairing is ADR-326's fix, held
 * here so the console and the Close button cannot drift apart again.
 */
export async function deskDay(db: Executor): Promise<TournamentRow | null> {
  return findDeskTournamentAnyKind(db);
}

/**
 * The live bracket, for the switch's own arithmetic (ADR-342 §4 — the buttons a switch starts
 * with, derived from the live bracket's own paid rates). Axes: row states — live only (a draft
 * has no paid rates to derive anything from); kinds — captain's ball only.
 *
 * Caller: `routes-tournament/desk.ts` `suggestedTiers`. The open-then-check-live composition
 * this replaces was `liveTournamentOfKind('captains_ball')` written out longhand.
 */
export async function liveBracket(db: Executor): Promise<TournamentRow | null> {
  return liveTournamentOfKind(db, 'captains_ball');
}

/**
 * The live dumb day to award against. Axes: row states — live only (an award needs the day that
 * is running, not yesterday's results); kinds — dumb courts only.
 *
 * Caller: `routes-tournament/dumb.ts` (the award, the undo and the court master's own view).
 * Absorbs that file's private `liveDumb`, which was the same composition by hand.
 */
export async function liveDumbDay(db: Executor): Promise<TournamentRow | null> {
  return liveTournamentOfKind(db, 'dumb_courts');
}

/**
 * Is a bracket live — the question that refuses the accidental mode (ADR-336): a dumb Start
 * beside a live bracket would shadow the bracket's Results and Line-ups while it kept planning
 * underneath, and the refusal names the switch, the only way the room is meant to get here.
 * Axes: row states — live only; kinds — captain's ball only.
 *
 * Caller: `routes-tournament/desk-setup.ts` (the dumb Start's refusal).
 */
export async function bracketIsLive(db: Executor): Promise<boolean> {
  return (await liveTournamentOfKind(db, 'captains_ball')) !== null;
}

/**
 * Does a captain's-ball day stand open (draft or live)? The close route's kind picker: the desk
 * closes the tournament it is looking at, and the console looks at captain's ball first and
 * dumb courts otherwise (ADR-321) — so the close must resolve the same way (ADR-326: a
 * dumb-only day used to have a Close button that closed nothing). `deskDay` states the same
 * preference; the matrix test asserts the two against each other. Axes: row states — draft or
 * live, existence only; kinds — captain's ball only.
 *
 * Caller: `routes-tournament/desk-day.ts` (`POST /close`).
 */
export async function openDayExists(db: Executor): Promise<boolean> {
  return (await findOpenTournament(db, 'captains_ball')) !== null;
}

/**
 * The tournament the setup screen works on: the desk's draft first, whatever its kind, else the
 * desk's day. Axes: row states — the newest draft before everything, then `deskDay`'s
 * open-else-last-closed; kinds — both.
 *
 * The draft comes first (ADR-336) because once a bracket is live, resolving "the open
 * tournament" would hand back the bracket and make a waiting dumb draft unreachable; the desk
 * works on its draft first and falls back to the open day, which keeps the old refusal for the
 * case it was written for (no draft at all).
 *
 * Caller: `routes-tournament/desk-setup.ts` `requireDraft`.
 */
export async function deskSetupSlot(db: Executor): Promise<TournamentRow | null> {
  return (await findDraft(db)) ?? (await findDeskTournamentAnyKind(db));
}

/**
 * The scheduler's day: the open bracket the planner plans. Axes: row states — draft or live
 * (a paused one is still the day; `reconcile` reads `pausedAt` itself and re-plans nothing);
 * kinds — captain's ball only (dumb courts build nothing, ADR-321, so there is nothing to plan).
 *
 * Callers: the scheduler adapter's `control.ts` (`activeContext`), `planning.ts`
 * (`reconcile`) and `restage.ts` (the rebuild's guard).
 */
export async function schedulerDay(db: Executor): Promise<TournamentRow | null> {
  return findOpenTournament(db, 'captains_ball');
}
