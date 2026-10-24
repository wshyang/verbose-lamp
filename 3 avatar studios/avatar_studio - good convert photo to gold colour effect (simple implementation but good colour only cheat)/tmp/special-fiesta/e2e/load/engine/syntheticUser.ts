import {
  CLUSTER_CODES,
  DEFAULT_AVATAR_LOOK_CODE,
  STATUS_ANNOUNCEMENT_EVENT,
  STATUS_LEADERBOARD_EVENT,
} from '@psd/contracts';
import { readSseBody, type SseFrame } from './sseReader.js';
import type { ParticipantPlan } from './scripts.js';
import type { Recorder, StreamKind, StreamRecord } from './recorder.js';

/**
 * ADR-350 — the synthetic user (the plan's §4, `syntheticUser.ts`): one participant, signed
 * up through the real API, holding the real streams and walking its seeded plan. The state
 * machine is the one the plan lists — signingUp → streaming → acting ⇄ idle → leaving — with
 * the actions coming from `scripts.ts` and the receipts going to `recorder.ts`.
 *
 * The network is an injected `Transport`, which is what makes Phase 2's verification possible
 * in a browserless sandbox: the integration test drives a Hono app through `app.request()`
 * (ADR-046's precedent — the real router, real cookies, real streams, no socket), while
 * Phase 3's CLI injects a `fetch` transport against a URL. Nothing in this file knows which.
 *
 * Deliberately not here: reconnect. ADR-122's spread backoff is the driver's job, because it
 * needs a clock and a policy; a user that loses its stream before leaving records the cut
 * (`truncated`) and lets the report say so. Also not here: the leaderboard beat's join —
 * frames without a nonce are recorded bare, and `summary.ts` owns every join strategy.
 */

/** The run-tagged nonce the beats carry in announcement bodies: `[{runId}:{beatId}]` (§4). */
const NONCE_PATTERN = /\[([A-Za-z0-9_-]+:[A-Za-z0-9_-]+)\]/;

/** Only announcement bodies carry a nonce today; every other frame records bare (§4). */
export function nonceIn(frame: SseFrame): string | undefined {
  if (frame.event !== STATUS_ANNOUNCEMENT_EVENT) return undefined;
  let parsed: { body?: unknown };
  try {
    parsed = JSON.parse(frame.data) as { body?: unknown };
  } catch {
    return undefined;
  }
  if (typeof parsed.body !== 'string') return undefined;
  return NONCE_PATTERN.exec(parsed.body)?.[1] ?? undefined;
}

/**
 * The deterministic cluster assignment every synthetic user signs up under — staff's
 * leaderboard beats need the same rule to know which cluster a scan touched.
 */
export function clusterForUser(userId: number): string {
  return CLUSTER_CODES[(userId - 1) % CLUSTER_CODES.length] ?? CLUSTER_CODES[0];
}

/** Leaderboard frames carry no nonce; their standings say which clusters they touch (§4). */
export function clustersIn(frame: SseFrame): readonly string[] | undefined {
  if (frame.event !== STATUS_LEADERBOARD_EVENT) return undefined;
  let parsed: { clusters?: { clusterCode?: unknown }[] };
  try {
    parsed = JSON.parse(frame.data) as { clusters?: { clusterCode?: unknown }[] };
  } catch {
    return undefined;
  }
  const codes = (parsed.clusters ?? [])
    .map((entry) => entry.clusterCode)
    .filter((code): code is string => typeof code === 'string');
  return codes.length === 0 ? undefined : codes;
}

/**
 * `chat.activity` frames carry the row's own `createdAt` (ADR-125), which is what a chat
 * burst joins by — the smallest payload that lets a phone decide for itself is also the
 * smallest payload that lets the report decide for itself. The wire carries the activity
 * view itself (`{ at }`), unwrapped by the status stream's feed-frame table.
 */
export function activityAtIn(frame: SseFrame): string | undefined {
  if (frame.event !== 'chat.activity') return undefined;
  let parsed: { at?: unknown };
  try {
    parsed = JSON.parse(frame.data) as { at?: unknown };
  } catch {
    return undefined;
  }
  return typeof parsed.at === 'string' ? parsed.at : undefined;
}

/**
 * `team.upsoon` frames say whether the team is IN the window — true on the way in, false on
 * the way out (ADR-121/282). The up-soon beat claims the entering sentence ("your team
 * plays soon"); the clearing frames are recorded but join nothing. The wire carries the
 * view itself (`{ upSoon, gamesAway, fixtureId }`).
 */
export function upSoonIn(frame: SseFrame): boolean | undefined {
  if (frame.event !== 'team.upsoon') return undefined;
  let parsed: { upSoon?: unknown };
  try {
    parsed = JSON.parse(frame.data) as { upSoon?: unknown };
  } catch {
    return undefined;
  }
  return typeof parsed.upSoon === 'boolean' ? parsed.upSoon : undefined;
}

export interface RequestSpec {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: unknown;
  /** The signup's bearer token (ADR-016: the same opaque token also rides the query on streams). */
  readonly token?: string;
}

export interface TransportResponse {
  readonly status: number;
  json<T>(): Promise<T>;
  /** The raw body — for error messages that carry the server's own reason. */
  text(): Promise<string>;
}

export interface TransportStream {
  readonly status: number;
  readonly body: ReadableStream<Uint8Array>;
}

export interface StreamSpec {
  readonly path: string;
  readonly token: string;
}

/** One user's whole view of the network — injected, so the engine runs in-process or remote. */
export interface Transport {
  request(spec: RequestSpec): Promise<TransportResponse>;
  openStream(spec: StreamSpec): Promise<TransportStream>;
}

/** A transport that never got a response: the fd wall, or plain network trouble. */
export class TransportFailure extends Error {
  readonly refusal: 'fd' | 'network';

  constructor(refusal: 'fd' | 'network', detail: string) {
    super(detail);
    this.refusal = refusal;
  }
}

export interface SyntheticUserInput {
  readonly userId: number;
  readonly plan: ParticipantPlan;
  readonly transport: Transport;
  readonly recorder: Recorder;
  /** teamIndex → the join code of a team the run has fielded, or null while nobody has yet. */
  readonly teamCode: (teamIndex: number) => string | null;
  /**
   * Fires once, when the status stream delivers its first frame of any kind — cast mode's
   * ready gate, because a user whose stream has said nothing is not a member of the room yet.
   */
  readonly onStatusSnapshot?: () => void;
  readonly now?: () => number;
}

interface HeldStream {
  readonly kind: StreamKind;
  readonly done: Promise<void>;
  /** Ends this one stream (the status reconnect after a team join) without touching the rest. */
  close(): Promise<void>;
}

const PARTICIPANT_PIN = '1234';
/** How long a joiner waits for its team's captain to field the team before skipping the join. */
const TEAM_CODE_WAIT_MS = 30_000;
const POLL_MS = 250;

export class SyntheticUser {
  private token: string | null = null;
  private onTeam = false;
  private readonly streams: HeldStream[] = [];
  private readonly controller = new AbortController();
  private readonly now: () => number;

  constructor(private readonly input: SyntheticUserInput) {
    this.now = input.now ?? Date.now;
  }

  /** The full lifecycle: signingUp → streaming → acting ⇄ idle → leaving. */
  async run(): Promise<void> {
    const started = this.now();
    await this.signUp();
    await this.openStream('status', '/api/status/stream');
    await this.act(started);
    /*
     * Idle is a state, not an exit. A participant whose action list has run out — or whose
     * plan never had one — is still a live phone holding its stream, and the delivery claim
     * is about exactly those phones. Leaving when the actions end (Phase 2's first cut)
     * cancelled streams before the snapshot's async read completed, and seven users in
     * twenty-five recorded a stream that never told them anything.
     */
    await this.waitUntil(started + this.input.plan.durationMs);
    await this.leave();
  }

  private async signUp(): Promise<void> {
    const response = await this.call('POST /api/auth/participants/signup', {
      method: 'POST',
      path: '/api/auth/participants/signup',
      body: {
        nickname: this.input.plan.nickname,
        pin: PARTICIPANT_PIN,
        clusterCode: clusterForUser(this.input.userId),
        gender: 'female',
        avatarVariant: 3,
        avatarLook: DEFAULT_AVATAR_LOOK_CODE,
      },
    });
    // A signup that did not make a user is a dead user, and dead users are counted, not hidden.
    if (response.status !== 201) throw new Error(`signup failed with ${response.status}`);
    const payload = await response.json<{ sessionToken: string }>();
    this.token = payload.sessionToken;
  }

  private async act(started: number): Promise<void> {
    for (const action of this.input.plan.actions) {
      await this.waitUntil(started + action.atMs);
      if (this.controller.signal.aborted) return;
      if (action.kind === 'open-chat-stream') await this.openStream('chat', '/api/chat/stream');
      else if (action.kind === 'join-team') await this.joinTeam(action.teamIndex);
      else if (action.kind === 'team-typing') await this.teamTyping();
      else if (action.kind === 'chat') await this.sendChat(action.body);
    }
  }

  private async joinTeam(teamIndex: number): Promise<void> {
    const joinCode = await this.waitForTeamCode(teamIndex);
    // No team ever fielded for this index: the join is skipped, and the requests file shows
    // nothing rather than a refusal the server never had a chance to give.
    if (joinCode === null) return;
    const response = await this.call('POST /api/teams/join', {
      method: 'POST',
      path: '/api/teams/join',
      body: { joinCode },
      ...(this.token === null ? {} : { token: this.token }),
    });
    if (response.status !== 201) return;
    this.onTeam = true;
    /*
     * The status stream attaches the team topic from the membership it reads at CONNECT
     * (routes-status/stream.ts: "a team the participant joins after this point does not
     * reach them until they reconnect") — the product's own documented bargain, and the
     * reason a mid-session join alone would leave this user structurally deaf to
     * `team.upsoon`. The joiner therefore reconnects its status stream, exactly the
     * reconnect that comment names: the mid-day phone the up-soon claim is about has been
     * on its team since its current stream opened.
     */
    await this.reconnectStatusStream();
    await this.openStream('team', '/api/team-chat/stream');
  }

  /** One stream's end, without the leave(): the reconnect the join's bargain calls for. */
  private async reconnectStatusStream(): Promise<void> {
    const held = this.streams.find((stream) => stream.kind === 'status');
    if (held === undefined) return;
    this.streams.splice(this.streams.indexOf(held), 1);
    await held.close();
    await this.openStream('status', '/api/status/stream');
  }

  /** Typing only exists for a member; a user whose join was skipped types nothing. */
  private async teamTyping(): Promise<void> {
    if (!this.onTeam || this.token === null) return;
    await this.call('POST /api/team-chat/typing', {
      method: 'POST',
      path: '/api/team-chat/typing',
      token: this.token,
    });
  }

  private async sendChat(body: string): Promise<void> {
    if (this.token === null) return;
    await this.call('POST /api/chat/messages', {
      method: 'POST',
      path: '/api/chat/messages',
      body: { body },
      token: this.token,
    });
  }

  /**
   * Opens a stream, records its facts on close, and pumps its frames while it is open. Only
   * the status stream's frames reach `frames.jsonl` — the delivery claim is about the one
   * socket every phone holds (ADR-121); the chat streams are held load, recorded in
   * `streams.jsonl`, not a second delivery story.
   */
  private async openStream(kind: StreamKind, path: string): Promise<void> {
    const start = this.now();
    let response: Awaited<ReturnType<Transport['openStream']>>;
    try {
      response = await this.input.transport.openStream({ path, token: this.token ?? '' });
    } catch (error) {
      // The fd wall (plan §4) or network trouble: a fact for streams.jsonl, not a dead user.
      const refusal = error instanceof TransportFailure ? error.refusal : 'network';
      this.recordRefusal(kind, { connectMs: this.now() - start, refusal });
      return;
    }
    const connectMs = this.now() - start;
    if (response.status !== 200) {
      // A refused stream is a recorded fact, not a crash — and 429 is the ADR-324 cap working.
      this.recordRefusal(kind, { connectMs, refusal: response.status === 429 ? 'stream-cap' : 'network', status: response.status });
      return;
    }
    let snapshotMs: number | null = null;
    const recordEnded = (result: { truncated: boolean }): void => {
      this.recordStreamRecord(kind, { connectMs, snapshotMs, truncated: result.truncated, status: response.status });
    };
    // A rejected pump is still a stream that ended — recorded as cut, never unhandled.
    const recordCut = (): void => {
      this.recordStreamRecord(kind, { connectMs, snapshotMs, truncated: true, status: response.status });
    };
    let toldSnapshot = false;
    // This stream's own abort, composed with the user's leave: `close()` ends one stream,
    // `stop()` ends the session. The listener is dropped when the pump settles either way.
    const own = new AbortController();
    const onStop = (): void => {
      own.abort();
    };
    this.controller.signal.addEventListener('abort', onStop, { once: true });
    const held: HeldStream = {
      kind,
      done: readSseBody(
        response.body,
        (frame) => {
          /*
           * Time to first frame, for every kind of stream: the status stream's first frame IS
           * its snapshot (ADR-121), and a chat room's first frame is its room state — the
           * metric each stream owes is "how long until it told me anything".
           */
          if (snapshotMs === null) {
            snapshotMs = this.now() - start;
            if (kind === 'status' && !toldSnapshot) {
              toldSnapshot = true;
              this.input.onStatusSnapshot?.();
            }
          }
          if (kind === 'status') {
            const nonce = nonceIn(frame);
            const clusters = clustersIn(frame);
            const at = activityAtIn(frame);
            const upSoon = upSoonIn(frame);
            this.input.recorder.recordFrame(this.input.userId, frame.event, {
              ...(nonce === undefined ? {} : { nonce }),
              ...(clusters === undefined ? {} : { clusters }),
              ...(at === undefined ? {} : { at }),
              ...(upSoon === undefined ? {} : { upSoon }),
            });
          }
        },
        { signal: own.signal },
      ).then(recordEnded, recordCut)
        .finally(() => {
          this.controller.signal.removeEventListener('abort', onStop);
        }),
      close: async (): Promise<void> => {
        own.abort();
        await held.done;
      },
    };
    this.streams.push(held);
  }

  private recordRefusal(kind: StreamKind, facts: { connectMs: number; refusal: StreamRecord['refusal']; status?: number }): void {
    this.recordStreamRecord(kind, { connectMs: facts.connectMs, snapshotMs: null, truncated: true, ...(facts.status === undefined ? {} : { status: facts.status }), refusal: facts.refusal });
  }

  private recordStreamRecord(
    kind: StreamKind,
    facts: { connectMs: number; snapshotMs: number | null; truncated: boolean; status?: number; refusal?: StreamRecord['refusal'] },
  ): void {
    this.input.recorder.recordStream({
      userId: this.input.userId,
      stream: kind,
      status: facts.status ?? null,
      connectMs: facts.connectMs,
      snapshotMs: facts.snapshotMs,
      truncated: facts.truncated,
      ...(facts.refusal === undefined ? {} : { refusal: facts.refusal }),
    });
  }

  /** A request through the recorded path: every call the user makes is a line in requests.jsonl. */
  private async call(route: string, spec: RequestSpec): Promise<TransportResponse> {
    const start = this.now();
    const response = await this.input.transport.request(spec);
    this.input.recorder.recordRequest(this.input.userId, {
      route,
      status: response.status,
      ms: this.now() - start,
    });
    return response;
  }

  private async waitForTeamCode(teamIndex: number): Promise<string | null> {
    const deadline = this.now() + TEAM_CODE_WAIT_MS;
    for (;;) {
      const code = this.input.teamCode(teamIndex);
      if (code !== null) return code;
      if (this.now() >= deadline || this.controller.signal.aborted) return null;
      await sleep(POLL_MS);
    }
  }

  /** Sleeps until the wall clock reaches `target`, or wakes early if the user is leaving. */
  private waitUntil(target: number): Promise<void> {
    const remaining = target - this.now();
    if (remaining <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.controller.signal.removeEventListener('abort', onAbort);
        resolve();
      }, remaining);
      this.controller.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Ends the session early — the ramp's finish, or a shutdown. Safe to call twice. */
  async stop(): Promise<void> {
    await this.leave();
  }

  private async leave(): Promise<void> {
    this.controller.abort();
    await Promise.allSettled(this.streams.map((stream) => stream.done));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
