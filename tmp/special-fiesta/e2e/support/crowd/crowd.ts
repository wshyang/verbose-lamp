import { chromium, request, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import { apiSignUp, unique } from '../fixtures.js';
import { AdmissionController, defaultAdmission, type AdmissionConfig, type AdmissionState } from './admission.js';
import { ResourceMonitor } from './resourceMonitor.js';
import { lehmer, seedFrom } from '../seeded.js';

/**
 * ADR-348/349 — the crowd: browser extras behind the unprunable core cast.
 *
 * The cast (ADR-347) is correctness: the fixture browser, camera flags, video, sign-in driven
 * through the real UI. The crowd is load, so it takes the cheaper path everywhere — its own
 * `chromium.launch()` shards (no camera flags, **no video**: a hundred videos is terabytes),
 * sign-up through the app's own API with the session token seeded straight into the context
 * (ADR-016 keeps the token in localStorage; a hundred UI sign-ins would measure Playwright,
 * not the app), and think-time jitter so a hundred extras do not behave like one herd.
 *
 * Ids are the reproducibility contract (plan §5): extra #k always runs script
 * `(k + round) % scripts.length` with an id-seeded random, so a run that reached 47 extras is
 * an exact prefix of a run that reached 140. ADR-349's line is drawn inside this file: the
 * controller only ever grows the crowd; contexts close only through scripted departures
 * (`departWave`, highest id first) or error cleanup — never for resource reasons — and dead ids
 * are never reused.
 */

/** ADR-016 — the token's home, mirroring apps/web/src/lib/session/tokenStore.ts. */
const TOKEN_KEY = 'psd.sessionToken.v1';

export type ExtraPhase = 'admitting' | 'idle' | 'acting' | 'retiring' | 'departed' | 'dead';

/** A live view of one extra, as the spec sees it. */
export interface ExtraHandle {
  readonly id: number;
  readonly nickname: string;
  readonly phase: ExtraPhase;
  readonly page: Page;
}

/** What a script may do: act on its own page, at its own pace, and notice retirement. */
export interface ExtraWorld {
  readonly id: number;
  readonly round: number;
  readonly page: Page;
  /** Id-seeded, so extra #k's think-times are the same in every run. */
  readonly random: () => number;
  /** A paced pause that ends early the moment retirement or a pause is requested. */
  readonly think: (ms: number) => Promise<void>;
  readonly retiring: () => boolean;
}

/** One unit of extra activity. */
export type ExtraScript = (world: ExtraWorld) => Promise<void>;

/** A venue-chat turn: navigate to the room, think, speak. The load this makes is real fan-out. */
export const VENUE_CHAT: ExtraScript = async (world) => {
  await world.page.goto('/social/chat');
  const draft = world.page.getByTestId('chat-panel__draft');
  await draft.waitFor({ state: 'visible', timeout: 30_000 });
  await world.think(1_000 + Math.floor(world.random() * 2_000));
  if (world.retiring()) return;
  // `fill`, not `typeInto`: the crowd is Chromium-only (ADR-044's quirk is WebKit's), and this
  // is traffic, not an assertion — but the same string is asserted downstream, so it must land.
  await draft.fill(`extra #${world.id} round ${world.round}: the room is warm`);
  await world.page.getByTestId('chat-panel__send').click();
};

/** The quiet majority — a realistic crowd mostly watches. */
export const LURK: ExtraScript = async (world) => {
  await world.think(20_000 + Math.floor(world.random() * 20_000));
};

export const CROWD_SCRIPTS: readonly ExtraScript[] = [VENUE_CHAT, LURK];

function isAlivePhase(phase: ExtraPhase): boolean {
  return phase === 'idle' || phase === 'acting' || phase === 'retiring';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parks an extra's script loop at its next safe point so the spec may drive that page itself —
 * a spec typing into a page a script is also driving is a collision, not a choreography.
 * `request()` resolves when the loop has parked; `release()` lets it continue; `abandon()`
 * frees a holder whose member died or departed before parking.
 */
class PauseGate {
  requested = false;
  private enteredResolve: (() => void) | null = null;
  private resumeResolve: (() => void) | null = null;

  request(): Promise<void> {
    this.requested = true;
    return new Promise((resolve) => {
      this.enteredResolve = resolve;
    });
  }

  enter(): Promise<void> {
    this.enteredResolve?.();
    return new Promise((resolve) => {
      this.resumeResolve = resolve;
    });
  }

  release(): void {
    this.requested = false;
    this.resumeResolve?.();
  }

  abandon(): void {
    this.requested = false;
    this.enteredResolve?.();
    this.resumeResolve?.();
  }
}

class ExtraMember {
  phase: ExtraPhase = 'admitting';
  context?: BrowserContext;
  page?: Page;
  loop?: Promise<void>;
  retireRequested = false;
  readonly pauseGate = new PauseGate();

  constructor(readonly id: number, readonly nickname: string) {}
}

export interface CrowdOptions {
  baseURL: string;
  /** Contexts per launched browser; a shard is a soft cap under concurrent admission. */
  shardSize?: number | undefined;
  scripts?: readonly ExtraScript[] | undefined;
  telemetry?: ((event: Record<string, unknown>) => void | Promise<void>) | undefined;
  onAliveChange?: ((alive: number) => void) | undefined;
}

export class Crowd {
  private readonly api: APIRequestContext;
  private readonly baseURL: string;
  private readonly shardSize: number;
  private readonly scripts: readonly ExtraScript[];
  private readonly telemetry: ((event: Record<string, unknown>) => void | Promise<void>) | undefined;
  private readonly onAliveChange: ((alive: number) => void) | undefined;
  private readonly shards: Browser[] = [];
  private readonly members: ExtraMember[] = [];
  private nextId = 0;
  private closed = false;

  private constructor(options: CrowdOptions & { api: APIRequestContext }) {
    this.api = options.api;
    this.baseURL = options.baseURL;
    this.shardSize = options.shardSize ?? 25;
    this.scripts = options.scripts ?? CROWD_SCRIPTS;
    this.telemetry = options.telemetry;
    this.onAliveChange = options.onAliveChange;
  }

  static async open(options: CrowdOptions): Promise<Crowd> {
    const api = await request.newContext({ baseURL: options.baseURL });
    return new Crowd({ ...options, api });
  }

  get alive(): number {
    return this.members.filter((member) => isAlivePhase(member.phase)).length;
  }

  /** Live extras, lowest id first. */
  list(): ExtraHandle[] {
    const alive: ExtraHandle[] = [];
    for (const member of this.members) {
      if (!isAlivePhase(member.phase) || member.page === undefined) continue;
      alive.push({ id: member.id, nickname: member.nickname, phase: member.phase, page: member.page });
    }
    return alive.sort((a, b) => a.id - b.id);
  }

  /**
   * Admits `count` extras: one id each, one signup through the API, one context on a shard,
   * one page landed on /home with its token already in place. A failure admits nothing silently
   * — the batch settles, the failure is reported upward, and the controller stops the climb.
   */
  async admit(count: number): Promise<void> {
    if (this.closed) throw new Error('the crowd has closed — no more admissions');
    if (count < 1) return;
    const batch: ExtraMember[] = [];
    for (let i = 0; i < count; i += 1) {
      this.nextId += 1;
      const member = new ExtraMember(this.nextId, unique(`Extra${this.nextId}`));
      this.members.push(member);
      batch.push(member);
    }
    const settled = await Promise.allSettled(batch.map((member) => this.admitOne(member)));
    const failure = settled.find((outcome) => outcome.status === 'rejected');
    this.reportAlive();
    await this.telemetry?.({
      event: 'admit',
      count,
      firstId: batch[0]?.id,
      admitted: settled.filter((outcome) => outcome.status === 'fulfilled').length,
    });
    if (failure !== undefined && failure.status === 'rejected') throw failure.reason;
  }

  /**
   * ADR-349 — scripted departures: people leave the beach. Choreography, never
   * resource-triggered; highest ids first; dead ids are never reused. Each departure lands at
   * the member's next safe point, and a stuck script is force-closed rather than hung upon.
   */
  async departWave(count: number): Promise<number> {
    if (this.closed) return 0;
    const leaving = this.members
      .filter((member) => isAlivePhase(member.phase) && member.loop !== undefined)
      .sort((a, b) => b.id - a.id)
      .slice(0, count);
    for (const member of leaving) {
      member.pauseGate.release();
      member.retireRequested = true;
      member.phase = 'retiring';
    }
    await Promise.race([
      Promise.all(leaving.map((member) => member.loop ?? Promise.resolve())),
      sleep(60_000).then(async () => {
        for (const member of leaving) await member.context?.close().catch(() => undefined);
      }),
    ]);
    await this.telemetry?.({ event: 'depart', count: leaving.length, ids: leaving.map((m) => m.id) });
    this.reportAlive();
    return leaving.length;
  }

  /** Parks the given extras' scripts at their next safe point, so the spec may drive their pages. */
  async hold(ids: number[]): Promise<void> {
    const holds = this.members
      .filter((member) => isAlivePhase(member.phase) && ids.includes(member.id))
      .map((member) => member.pauseGate.request());
    // Bounded: a member that dies mid-request would otherwise park the holder forever.
    await Promise.race([Promise.all(holds), sleep(30_000)]);
  }

  release(ids: number[]): void {
    for (const member of this.members) {
      if (ids.includes(member.id)) member.pauseGate.release();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const member of this.members) {
      member.retireRequested = true;
      member.pauseGate.release();
    }
    await Promise.allSettled(this.members.map((member) => member.loop ?? Promise.resolve()));
    await Promise.all(this.shards.map((shard) => shard.close().catch(() => undefined)));
    await this.api.dispose();
  }

  private async admitOne(member: ExtraMember): Promise<void> {
    const shard = await this.shardWithRoom();
    const context = await shard.newContext({ baseURL: this.baseURL });
    member.context = context;
    try {
      const page = await context.newPage();
      member.page = page;
      const { sessionToken } = (await apiSignUp(this.api, { nickname: member.nickname })) as {
        sessionToken: string;
      };
      const seed: [string, string] = [sessionToken, TOKEN_KEY];
      await context.addInitScript(
        ([token, key]) => {
          window.localStorage.setItem(key, token);
        },
        seed,
      );
      await page.goto('/home');
      // The QR number is the signed-in landing: a token that did not take redirects to
      // /signin, and this wait turns that into a loud failure instead of a silent lurker.
      await page.getByTestId('qr-home__scan-number').waitFor({ state: 'visible', timeout: 30_000 });
      member.phase = 'idle';
      member.loop = this.runLoop(member);
    } catch (error) {
      member.phase = 'dead';
      await context.close().catch(() => undefined);
      await this.telemetry?.({ event: 'admit-failed', id: member.id, message: String(error) });
      throw error;
    }
  }

  private async shardWithRoom(): Promise<Browser> {
    for (const shard of this.shards) {
      if (shard.contexts().length < this.shardSize) return shard;
    }
    const shard = await chromium.launch();
    this.shards.push(shard);
    return shard;
  }

  private async runLoop(member: ExtraMember): Promise<void> {
    const page = member.page;
    if (page === undefined) return;
    // seedFrom, not the raw id: consecutive ids must not draw alike (see seeded.ts).
    const random = lehmer(seedFrom('psd-crowd', member.id));
    const think = async (ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !member.retireRequested && !member.pauseGate.requested && !this.closed) {
        await sleep(Math.min(250, deadline - Date.now()));
      }
    };
    let round = 0;
    while (!member.retireRequested && !this.closed) {
      if (member.pauseGate.requested) {
        const resume = member.pauseGate.enter();
        await resume;
        continue;
      }
      const script = this.scripts[(member.id + round) % this.scripts.length] ?? LURK;
      member.phase = 'acting';
      try {
        await script({ id: member.id, round, page, random, think, retiring: () => member.retireRequested });
      } catch (error) {
        member.phase = 'dead';
        member.pauseGate.abandon();
        await member.context?.close().catch(() => undefined);
        await this.telemetry?.({ event: 'extra-died', id: member.id, message: String(error) });
        this.reportAlive();
        return;
      }
      member.phase = 'idle';
      round += 1;
      await think(3_000 + Math.floor(random() * 5_000));
    }
    member.phase = 'departed';
    member.pauseGate.abandon();
    await member.context?.close().catch(() => undefined);
    this.reportAlive();
  }

  private reportAlive(): void {
    this.onAliveChange?.(this.alive);
  }
}

export interface ScaleRunOptions {
  baseURL: string;
  telemetryDir?: string | undefined;
  admission?: Partial<AdmissionConfig> | undefined;
  scripts?: readonly ExtraScript[] | undefined;
  monitorIntervalMs?: number | undefined;
}

/**
 * The whole orchestrator wired together: the monitor feeds the controller, the controller grows
 * the crowd, the crowd reports its truth back. Opened once per run; the core cast lives beside
 * it in the spec, on the fixture browser, with video (ADR-347).
 */
export class ScaleRun {
  private constructor(
    readonly monitor: ResourceMonitor,
    readonly controller: AdmissionController,
    readonly crowd: Crowd,
  ) {}

  static async open(options: ScaleRunOptions): Promise<ScaleRun> {
    const telemetryDir = options.telemetryDir ?? 'test-results-scale';
    const monitor = new ResourceMonitor({
      intervalMs: options.monitorIntervalMs,
      telemetryPath: join(telemetryDir, 'telemetry.jsonl'),
    });
    let admit: (count: number) => Promise<void> = () =>
      Promise.reject(new Error('the crowd has not opened'));
    const controller = new AdmissionController({
      config: { ...defaultAdmission(), ...options.admission },
      spawn: (count) => admit(count),
    });
    const crowd = await Crowd.open({
      baseURL: options.baseURL,
      scripts: options.scripts,
      telemetry: (event) => monitor.logEvent(event),
      onAliveChange: (alive) => controller.reportAlive(alive),
    });
    admit = (count) => crowd.admit(count);
    monitor.onSample((sample) => controller.observe(sample));
    // The first sample is awaited here: a machine that cannot be read even once is a preflight
    // failure, and a climb that starts before its baseline swap exists is not a climb.
    await monitor.start();
    return new ScaleRun(monitor, controller, crowd);
  }

  get state(): AdmissionState {
    return this.controller.state;
  }

  /** Tier C's barrier (plan §6): blocks until k extras are alive, or resolves false honestly. */
  guarantee(k: number): Promise<boolean> {
    return this.controller.guarantee(k);
  }

  /** ADR-349 — departures are choreography, and they end the climb for good. */
  async departWave(count: number): Promise<number> {
    this.controller.halt('scripted departures began — the climb never resumes (ADR-349)');
    return this.crowd.departWave(count);
  }

  async close(): Promise<void> {
    this.controller.halt('the run is closing');
    await this.crowd.close();
    await this.monitor.stop();
  }
}
