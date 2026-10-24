import { z } from 'zod';
import type { BeatKind } from './engine/summary.js';

/**
 * ADR-350 — cast mode's pure half (the plan's §5): the stdin protocol the spec speaks, and
 * the expectation maths the CLI applies to each beat line. Kept out of `cli.ts` so both can
 * be tested without a stack — the protocol is a contract, and contracts get tests.
 *
 * The protocol is deliberately one line per beat, JSON on stdout's mirror: the spec plays a
 * beat in the browsers it owns, then tells the engine what happened and when. `t0` is the
 * SPEC's clock (epoch ms), because only the spec knows when its own click landed; the engine
 * records the beat with that `t0` and joins receipts against it. Stdin EOF ends the run —
 * the cast is the choreographer, and the engine holds the room only while the cast is on.
 */

const beatLineSchema = z.union([
  z.object({
    kind: z.literal('announcement'),
    beatId: z.string().min(1),
    nonce: z.string().min(1),
    t0: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('match-result'),
    beatId: z.string().min(1),
    t0: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('chat-burst'),
    beatId: z.string().min(1),
    at: z.string().min(1),
    t0: z.number().int().positive(),
  }),
]);

/** One line from the spec: what the cast did, and when. */
export type CastBeatLine = z.infer<typeof beatLineSchema>;

/** A malformed line is a lost claim, so it is refused by name — never silently skipped. */
export function parseBeatLine(line: string): CastBeatLine {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(`cast beat line is not JSON: ${line.slice(0, 200)}`);
  }
  const result = beatLineSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `cast beat line is not a valid beat (${result.error.issues.map((issue) => issue.message).join('; ')}): ${line.slice(0, 200)}`,
    );
  }
  return result.data;
}

/** The one line the engine prints on stdout: the room is ready, and this is who is in it. */
export interface ReadyLine {
  readonly ready: true;
  readonly runId: string;
  readonly users: number;
  readonly teams: readonly string[];
  /** Where the run's artifacts (and `summary.json`) are — absolute, so the spec need not guess. */
  readonly outDir: string;
}

export function readyLineOf(input: Omit<ReadyLine, 'ready'>): ReadyLine {
  return { ready: true, ...input };
}

/**
 * What the line-ups read answers, reduced to the seats the expectation needs. Names that are
 * not this run's teams ("Winner of #12") simply match nobody.
 */
export interface LineupItem {
  readonly teamAName: string | null;
  readonly teamBName: string | null;
}

/** One user's facts for the up-soon expectation: which team, when the join was due, when admitted. */
export interface UpSoonUser {
  readonly userId: number;
  /** The plan's team index, or null when the plan joins no team this run fielded. */
  readonly teamIndex: number | null;
  /** The plan's join time, relative to the user's session start. */
  readonly joinAtMs: number | null;
  /** When the user was admitted, in epoch ms. */
  readonly admitAt: number;
}

/**
 * How long after the plan's join time a join may still be in flight — the code wait plus the
 * POST's flight. A user whose join had not landed by `t0` was not on the team when the result
 * moved the window, so the watcher owes them nothing for THIS transition.
 */
export const JOIN_SLACK_MS = 5_000;

export interface UpSoonExpectation {
  /** The line-up in play order — only the first `depth` rows are the watched window. */
  readonly front: readonly LineupItem[];
  readonly teamNames: readonly string[];
  readonly users: readonly UpSoonUser[];
  /** The watcher's window depth: the enabled courts (ADR-121/282). */
  readonly depth: number;
  readonly t0: number;
}

/**
 * The up-soon expectation: members of the teams in the first `depth` line-up rows — the
 * window `upSoonOf` watches (ADR-121/282) — whose joins had landed by `t0`. The teams LEAVING
 * the window receive their clearing frame too; it is recorded, but it is not this beat's
 * delivery claim, because "your team plays soon" is the sentence the product owes.
 */
export function expectedUpSoon(input: UpSoonExpectation): number {
  const { front, teamNames, users, depth, t0 } = input;
  const wanted = new Set<number>();
  for (const item of front.slice(0, Math.max(1, depth))) {
    for (const name of [item.teamAName, item.teamBName]) {
      const index = teamNames.indexOf(name ?? '');
      if (index >= 0) wanted.add(index);
    }
  }
  let expected = 0;
  for (const user of users) {
    if (user.teamIndex === null || !wanted.has(user.teamIndex)) continue;
    if (user.joinAtMs === null || user.admitAt + user.joinAtMs + JOIN_SLACK_MS > t0) continue;
    expected += 1;
  }
  return expected;
}

/** The beats one line expands to — a match result is two claims (the board and the window). */
export interface ExpandedBeat {
  readonly beatId: string;
  readonly kind: BeatKind;
  readonly t0: number;
  readonly expectedUsers: number;
  readonly nonce?: string;
  readonly at?: string;
}
