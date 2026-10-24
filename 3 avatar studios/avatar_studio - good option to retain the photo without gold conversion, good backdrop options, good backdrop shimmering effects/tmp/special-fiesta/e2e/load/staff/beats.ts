import { marshalPlan, participantNickname, type PlannedScan } from '../engine/scripts.js';
import type { Recorder } from '../engine/recorder.js';
import type { Transport, TransportResponse } from '../engine/syntheticUser.js';
import type { FacilitatorSession, StaffSession } from './sessions.js';

/**
 * ADR-350 — standalone mode's beats (the plan's §5): the events the delivery claim is
 * measured against. A superadmin posts run-tagged announcements on a cadence; a marshal
 * walks their seeded scan plan against the open round, re-POSTing every n-th scan under the
 * same `client_scan_uuid` so the §4.2.11 idempotency path is exercised under load.
 *
 * All times are the wall clock the orchestrator owns: `runStart` is the run's zero, and
 * `expectedAt(tMs)` answers how many users the admission schedule had let in by then —
 * a user who was never admitted is not silently counted as a miss.
 */

export interface BeatRunner {
  stop(): Promise<void>;
}

/** A marshal's runner also reports which scan uuids the server actually acknowledged. */
export interface MarshalRunner extends BeatRunner {
  acknowledgedScanUuids(): readonly string[];
}

export interface BeatContext {
  readonly transport: Transport;
  readonly recorder: Recorder;
  readonly runId: string;
  readonly superadmin: StaffSession;
  readonly marshal: FacilitatorSession;
  readonly roundId: string;
  /** The run's zero, in epoch ms — every plan time is relative to it. */
  readonly runStart: number;
  /** The admission curve: how many users were live at tMs from run start. */
  readonly expectedAt: (tMs: number) => number;
  readonly now: () => number;
}

const ANNOUNCE_INTERVAL_MS = 45_000;

/** The first announcement lands just after the admission window closes. */
export function firstAnnouncementMs(windowMs: number): number {
  return windowMs + 5_000;
}

export function startAnnouncer(context: BeatContext, windowMs: number): BeatRunner {
  const controller = new AbortController();
  const done = (async (): Promise<void> => {
    let beatNumber = 0;
    let nextAt = context.runStart + firstAnnouncementMs(windowMs);
    for (;;) {
      if ((await interruptedSleep(nextAt - context.now(), controller.signal)) === 'interrupted') return;
      beatNumber += 1;
      nextAt += ANNOUNCE_INTERVAL_MS;
      const beatId = `a${beatNumber}`;
      const nonce = `${context.runId.slice(0, 6)}:${beatId}`;
      const t0 = context.now();
      const response = await context.transport.request({
        method: 'POST',
        path: '/api/admin/announcements',
        body: { body: `Load run desk announcement ${beatNumber} [${nonce}]` },
        token: context.superadmin.token,
      });
      if (response.status !== 201) continue;
      context.recorder.recordBeat({
        beatId,
        kind: 'announcement',
        nonce,
        t0,
        expectedUsers: context.expectedAt(t0 - context.runStart),
      });
    }
  })();
  return runnerOf(controller, done);
}

/** The marshal's seeded scan plan, walked on the wall clock the orchestrator owns. */
export function startMarshal(context: BeatContext, scans: readonly PlannedScan[]): MarshalRunner {
  const controller = new AbortController();
  const acknowledged: string[] = [];
  const done = (async (): Promise<void> => {
    for (const scan of scans) {
      if ((await interruptedSleep(context.runStart + scan.atMs - context.now(), controller.signal)) === 'interrupted') return;
      const response = await postScan(context, scan);
      if (response === null) continue;
      acknowledged.push(scan.clientScanUuid);
      /*
       * No delivery beat here — a Phase 3 finding: a fringe scan does NOT push a leaderboard
       * frame. `pushLeaderboard` is tournament-only (ADR-131 B6); a scan invalidates the
       * scoreboard cache and nothing else, so there is no frame to join in standalone mode.
       * The leaderboard delivery claim moves to cast mode (Phase 4), where a real match
       * result does push. The scans still walk: idempotency under load and the §7 read-back
       * are this tier's claims about them.
       */
    }
  })();
  return {
    ...runnerOf(controller, done),
    acknowledgedScanUuids: (): readonly string[] => [...acknowledged],
  };
}

/** The scan plan one marshal walks: their own seed over the run's whole population. */
export function marshalScans(input: { runId: string; marshalIndex: number; users: number; durationMs: number }): readonly PlannedScan[] {
  return marshalPlan({
    runId: input.runId,
    marshalIndex: input.marshalIndex,
    targetUserIds: Array.from({ length: input.users }, (_, index) => index + 1),
    durationMs: input.durationMs,
  });
}

async function postScan(context: BeatContext, scan: PlannedScan): Promise<TransportResponse | null> {
  const response = await context.transport.request({
    method: 'POST',
    path: '/api/fringe/scans',
    body: {
      nickname: participantNickname(context.runId, scan.targetUserId),
      roundId: context.roundId,
      tierLabel: null,
      clientScanUuid: scan.clientScanUuid,
      clientTimestamp: new Date(context.now()).toISOString(),
    },
    token: context.marshal.token,
  });
  // 201 fresh, 200 idempotent replay (§4.2.11) — both are the scan landing.
  return response.status === 201 || response.status === 200 ? response : null;
}

function runnerOf(controller: AbortController, done: Promise<void>): BeatRunner {
  return {
    async stop(): Promise<void> {
      controller.abort();
      await done.catch(() => undefined);
    },
  };
}

/** Whether a wait ended because the run is stopping, or because the time simply came. */
type SleepOutcome = 'interrupted' | 'elapsed';

function interruptedSleep(ms: number, signal: AbortSignal): Promise<SleepOutcome> {
  if (ms <= 0) return Promise.resolve(signal.aborted ? 'interrupted' : 'elapsed');
  return new Promise((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve('interrupted');
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve('elapsed');
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
