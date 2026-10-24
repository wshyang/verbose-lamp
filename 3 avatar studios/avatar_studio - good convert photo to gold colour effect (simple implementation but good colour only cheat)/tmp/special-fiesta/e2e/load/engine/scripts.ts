import { lehmer, seedFrom } from '../../support/seeded.js';

/**
 * ADR-350 — the seeded action plans (the plan's §4, `scripts.ts`): pure, and the load tier's
 * half of the reproducibility contract. User #k's plan is a pure function of `(runId, k)` —
 * never of how many users the run has — so a run that reached 47 users is an exact prefix of a
 * run that reached 300, and two runs under the same run id can be compared line by line.
 *
 * What a plan DESCRIBES but does not do: opening streams, joining teams, chatting, typing.
 * The executor (Phase 2's `syntheticUser`) walks the list and performs each action at its
 * `atMs`; nothing here touches the network, which is what makes the prefix property testable.
 *
 * The marshal's plan lives here too, because "scan" is a staff action: the plan's §5 has a
 * facilitator scanning users at an open round, with some scans deliberately re-POSTed under
 * the same `client_scan_uuid` — the §4.2.11 idempotency path, exercised under load on purpose.
 */

/** The run id's alphabet is nickname-safe by construction (`ld_{runId6}_{k}`, ADR-088's rules). */
export function newRunId(random: () => number = Math.random): string {
  return `${Date.now().toString(36)}${Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0')}`;
}

/** `ld_{runId6}_{k}` — 4+6+1+digits, so up to 99,999 users stays inside the 20-character limit. */
export function participantNickname(runId: string, userId: number): string {
  return `ld_${runId.slice(0, 6)}_${userId}`;
}

export type PlannedAction =
  | { atMs: number; kind: 'open-chat-stream' }
  | { atMs: number; kind: 'join-team'; teamIndex: number }
  | { atMs: number; kind: 'chat'; body: string }
  | { atMs: number; kind: 'team-typing'; strokes: number };

export interface ParticipantPlan {
  readonly userId: number;
  readonly nickname: string;
  /** Opens `/api/chat/stream` as well as the status stream. */
  readonly holdsChatStream: boolean;
  /** Joins a team — and so, once joined, holds `/api/team-chat/stream`. */
  readonly joinsTeam: boolean;
  /** Sorted by `atMs`; times are relative to the user's session start. */
  readonly actions: readonly PlannedAction[];
  /** The session's horizon: the user holds its streams until this, then leaves. */
  readonly durationMs: number;
}

export interface ParticipantPlanOptions {
  /** How many distinct teams the population may spread across (indices, resolved at runtime). */
  teamSpread?: number;
  /** Plans are bounded to this horizon; the executor may simply stop at the end. */
  durationMs?: number;
}

export function participantPlan(runId: string, userId: number, options: ParticipantPlanOptions = {}): ParticipantPlan {
  const teamSpread = Math.max(1, options.teamSpread ?? 30);
  const durationMs = options.durationMs ?? 600_000;
  const random = lehmer(seedFrom(runId, userId));
  /*
   * The draw ORDER is part of the contract: adding a new draw means appending it after the
   * existing ones (or bumping a documented plan version), never interleaving, or every
   * previously-recorded run stops being comparable.
   */
  const holdsChatStream = random() < 0.5;
  const joinsTeam = random() < 0.5;
  const teamIndex = Math.floor(random() * teamSpread);
  const actions: PlannedAction[] = [];

  if (joinsTeam) {
    // Every atMs is bounded to the horizon — a plan must fit the session it describes, or the
    // executor would wait past the run for an action that never fits (Phase 2 caught this:
    // a 9 s test horizon with join times drawn from 60 s hung the run).
    actions.push({ atMs: Math.floor(random() * Math.min(60_000, durationMs)), kind: 'join-team', teamIndex });
    const strokes = 8 + Math.floor(random() * 22);
    actions.push({ atMs: Math.floor(random() * durationMs), kind: 'team-typing', strokes });
  }
  const chatTurns = holdsChatStream ? 2 + Math.floor(random() * 3) : 0;
  for (let turn = 0; turn < chatTurns; turn += 1) {
    actions.push({
      atMs: Math.floor(random() * durationMs),
      kind: 'chat',
      // Run-tagged, so §7's read-back can select exactly this run's messages.
      body: `ld ${runId.slice(0, 6)} u${userId} n${turn}`,
    });
  }
  if (holdsChatStream) {
    actions.push({ atMs: Math.floor(random() * Math.min(20_000, durationMs)), kind: 'open-chat-stream' });
  }
  actions.sort((a, b) => a.atMs - b.atMs);
  return { userId, nickname: participantNickname(runId, userId), holdsChatStream, joinsTeam, actions, durationMs };
}

/** One scan by a marshal. A duplicate re-POST shares the earlier scan's uuid AND target. */
export interface PlannedScan {
  readonly atMs: number;
  readonly targetUserId: number;
  readonly clientScanUuid: string;
  /** Set on the deliberate re-POSTs — the idempotency path under load (plan §5). */
  readonly duplicateOf: string | null;
}

export interface MarshalPlanOptions {
  durationMs?: number;
  /** Every n-th scan is a re-POST of its predecessor (plan §5); 0 disables. */
  duplicateEvery?: number;
}

export interface MarshalPlanInput extends MarshalPlanOptions {
  runId: string;
  marshalIndex: number;
  targetUserIds: readonly number[];
}

export function marshalPlan(input: MarshalPlanInput): readonly PlannedScan[] {
  const { runId, marshalIndex, targetUserIds } = input;
  if (targetUserIds.length === 0) return [];
  const durationMs = input.durationMs ?? 600_000;
  const duplicateEvery = input.duplicateEvery ?? 10;
  const random = lehmer(seedFrom(`${runId}:marshal`, marshalIndex));
  const pickTarget = (): number => {
    const target = targetUserIds[Math.floor(random() * targetUserIds.length)];
    return target ?? targetUserIds[0] ?? 1;
  };
  const scans: PlannedScan[] = [];
  let scanCount = 0;
  // Enough scan slots to cover the horizon at a marshal's realistic pace: one per ~8 s.
  const slots = Math.max(1, Math.floor(durationMs / 8_000));
  for (let slot = 0; slot < slots; slot += 1) {
    const atMs = Math.floor((durationMs * slot) / slots + random() * 4_000);
    scanCount += 1;
    const previous = scans[scans.length - 1];
    const isDuplicate = duplicateEvery > 0 && scanCount % duplicateEvery === 0 && previous !== undefined;
    if (isDuplicate) {
      scans.push({
        atMs: atMs + 500,
        targetUserId: previous.targetUserId,
        clientScanUuid: previous.clientScanUuid,
        duplicateOf: previous.clientScanUuid,
      });
      continue;
    }
    scans.push({ atMs, targetUserId: pickTarget(), clientScanUuid: uuidFrom(random), duplicateOf: null });
  }
  return scans;
}

/** A deterministic uuid-shaped token — uniqueness is what the scan route needs, not RFC 4122. */
function uuidFrom(random: () => number): string {
  const hex = (count: number): string => {
    let out = '';
    for (let i = 0; i < count; i += 1) out += Math.floor(random() * 16).toString(16);
    return out;
  };
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}
