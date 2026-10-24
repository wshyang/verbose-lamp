import type { AdminTournamentConsoleView } from '@psd/contracts';
import { jsonRequest, type ActorSession, type TestContext } from './harness.js';

/**
 * The dress rehearsal's small vocabulary (ADR-335): every act the day-of lock-ins added,
 * driven over HTTP the way the consoles drive it. Walkovers, reseats, hand-backs and stage
 * closes go through the desk routes; matches are started, scored and finished through the
 * facilitator's court console. Nothing here writes to the database directly.
 */

export type ConsoleView = AdminTournamentConsoleView;
export type MatchRow = NonNullable<ConsoleView['tournament']>['matches'][number];
export type StageRow = NonNullable<ConsoleView['tournament']>['stages'][number];

export interface RehearsalDay {
  console: () => Promise<NonNullable<ConsoleView['tournament']>>;
  stage: (label: string) => Promise<StageRow>;
  match: (stageLabel: string, include: (row: MatchRow) => boolean) => Promise<MatchRow>;
  start: (match: MatchRow) => Promise<void>;
  score: (match: MatchRow, side: 'a' | 'b', count: number) => Promise<void>;
  complete: (match: MatchRow, input: { winnerTeamId: string | null; tiebreakMethod?: 'coin_toss' | 'rock_paper_scissors' }) => Promise<number>;
  play: (match: MatchRow, input: { winner: 'a' | 'b'; winnerScore?: number; loserScore?: number }) => Promise<void>;
  act: <T>(path: string, body?: unknown, session?: ActorSession) => Promise<{ status: number; body: T }>;
}

export function rehearsalDay(ctx: TestContext, sessions: { desk: ActorSession; marshal: ActorSession }): RehearsalDay {
  async function act<T>(path: string, body?: unknown, session: ActorSession = sessions.desk) {
    const init = body === undefined ? { headers: session.headers } : jsonRequest(body, session.headers);
    const response = await ctx.app.request(`/api/admin/tournament${path}`, init);
    return { status: response.status, body: (await response.json()) as T };
  }
  async function station(path: string, body: unknown): Promise<number> {
    const response = await ctx.app.request(`/api/tournament${path}`, jsonRequest(body, sessions.marshal.headers));
    return response.status;
  }
  async function readConsole(): Promise<NonNullable<ConsoleView['tournament']>> {
    const tournament = (await act<ConsoleView>('')).body.tournament;
    if (tournament === null) throw new Error('no tournament on the console');
    return tournament;
  }
  async function play(match: MatchRow, input: { winner: 'a' | 'b'; winnerScore?: number; loserScore?: number }): Promise<void> {
    await start(match);
    // Scores are always told from the winner's side; the named winner must agree with them.
    await score(match, input.winner, input.winnerScore ?? 1);
    await score(match, input.winner === 'a' ? 'b' : 'a', input.loserScore ?? 0);
    const winnerTeamId = input.winner === 'a' ? match.a.teamId : match.b.teamId;
    const status = await complete(match, { winnerTeamId });
    if (status !== 200) throw new Error(`complete answered ${status}`);
  }
  async function start(match: MatchRow): Promise<void> {
    if (match.courtId === null || match.a.teamId === null || match.b.teamId === null) throw new Error('match is not seated on a court');
    const status = await station('/matches', { courtId: match.courtId, teamAId: match.a.teamId, teamBId: match.b.teamId });
    if (status !== 201) throw new Error(`start answered ${status}`);
  }
  async function score(match: MatchRow, side: 'a' | 'b', count: number): Promise<void> {
    for (let point = 0; point < count; point += 1) {
      const status = await station(`/matches/${match.id}/score`, { side, from: point, to: point + 1 });
      if (status !== 200) throw new Error(`score answered ${status}`);
    }
  }
  async function complete(match: MatchRow, input: { winnerTeamId: string | null; tiebreakMethod?: 'coin_toss' | 'rock_paper_scissors' }): Promise<number> {
    return station(`/matches/${match.id}/complete`, input);
  }
  return {
    act,
    play,
    start,
    score,
    complete,
    console: readConsole,
    stage: async (label) => {
      const found = (await readConsole()).stages.find((stage) => stage.label === label);
      if (found === undefined) throw new Error(`no stage ${label}`);
      return found;
    },
    match: async (stageLabel, include) => {
      const found = (await readConsole()).matches.find((row) => row.stageLabel === stageLabel && include(row));
      if (found === undefined) throw new Error(`no match in ${stageLabel}`);
      return found;
    },
  };
}
