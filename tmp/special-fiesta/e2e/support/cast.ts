import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { apiSignUp, signInParticipant, signInStaff, signInSuperadmin } from './fixtures.js';

/**
 * ADR-347 — the cast: many browsers, one choreography.
 *
 * The suite already opens second contexts by hand — chat-concurrent, team-chat-concurrent,
 * team-chat-typing, announcements, seed-social, demo-onboarding — and each of those proves a
 * *relay*: one browser acts, then another is checked. What none of them can say is what a room
 * actually is: several people, in several browsers, acting at the same moment, with an
 * assertion made on one screen while another screen's action is still in flight.
 *
 * This module is the one definition of that shape. A `Cast` opens one context per role — a
 * session belongs to a context, so separate contexts are the only way two roles can be signed
 * in at once — signs each in through the real UI (the cookie must belong to the browser that
 * will use it), and records video for every context it opens: the config's `video: 'on'`
 * reaches only the fixture page, so an ad-hoc context is otherwise blind on failure, which
 * this suite's own policy calls worse than no suite.
 *
 * The choreography primitives:
 *   — `together(...thunks)` — the simultaneous beat. Promise.all with a name, because the
 *     reader of a choreography needs to see that these actions fire as one.
 *   — `rendezvous(n)` — the aligned start. Every role arrives at the gate, the last one opens
 *     it, and only then does anybody act, so a burst starts together rather than merely being
 *     unsequenced.
 *
 * Everything shares the one browser the run already launched (the external-chromium recipe
 * and ADR-044's camera flags were applied at launch — nothing here re-launches anything), and
 * ad-hoc contexts resolve relative URLs against the same baseURL as the fixture page, which is
 * why every existing two-context spec navigates with paths. Four live contexts is roughly four
 * times one browser's memory; that is the honest cost of a room, and the reason the cast specs
 * stay Chromium-only and few.
 */

/** One browser in the cast: what it plays, the name the room sees, its context and its page. */
export interface CastMember {
  readonly kind: 'participant' | 'facilitator' | 'superadmin';
  /** The participant's nickname, when the role is one — the name the room sees. Null otherwise. */
  readonly nickname: string | null;
  readonly context: BrowserContext;
  readonly page: Page;
}

/**
 * How a role joins. Participants are created through the signup API first (AGENTS-testing.md
 * §6 — provisioning goes through the app's own APIs) and then signed in through the UI.
 * Facilitators default to the seeded `court1`; the superadmin is the seeded one.
 */
export type Role =
  | { readonly as: 'participant'; readonly name: string; readonly request: APIRequestContext; readonly nickname: string }
  | { readonly as: 'facilitator'; readonly name: string; readonly username?: string }
  | { readonly as: 'superadmin'; readonly name: string };

export class Cast {
  private readonly members = new Map<string, CastMember>();

  private constructor(
    private readonly browser: Browser,
    private readonly videoDir: string,
  ) {}

  /**
   * Opens one context per role and signs each in — all at once. The assembly is itself the
   * first concurrent beat: sign-ins that overlap are browsers the suite has already proved
   * can act simultaneously, and a cast that cannot assemble concurrently has no business
   * choreographing anything.
   */
  static async open(browser: Browser, roles: readonly Role[], videoDir = 'test-results/cast'): Promise<Cast> {
    const cast = new Cast(browser, videoDir);
    await Promise.all(roles.map(async (role) => cast.admit(role)));
    return cast;
  }

  private async admit(role: Role): Promise<void> {
    const context = await this.browser.newContext({ recordVideo: { dir: this.videoDir } });
    try {
      const page = await context.newPage();
      if (role.as === 'participant') {
        await apiSignUp(role.request, { nickname: role.nickname });
        await signInParticipant(page, role.nickname);
      } else if (role.as === 'facilitator') {
        await signInStaff(page, role.username ?? 'court1');
      } else {
        await signInSuperadmin(page);
      }
      this.members.set(role.name, {
        kind: role.as,
        nickname: role.as === 'participant' ? role.nickname : null,
        context,
        page,
      });
    } catch (error) {
      // A role that cannot join must not leak its context — and must not have its failure
      // masked by a close that fails too.
      void context.close().catch(() => undefined);
      throw error;
    }
  }

  /** The role's page — the handle every assertion in the choreography is made on. */
  page(name: string): Page {
    return this.member(name).page;
  }

  member(name: string): CastMember {
    const found = this.members.get(name);
    if (found === undefined) throw new Error(`no cast member called "${name}" — check Cast.open's roles`);
    return found;
  }

  /**
   * Closes every context, last-opened first. The videos are written when the context closes,
   * which is why this is `afterAll` and not a garbage-collection hope.
   */
  async close(): Promise<void> {
    const opened = [...this.members.values()];
    this.members.clear();
    for (const member of opened.reverse()) await member.context.close();
  }
}

/**
 * The simultaneous beat: starts every action in the same tick and waits for them all. Written
 * with thunks rather than pre-made promises so the choreography reads as verbs side by side —
 * and so nobody can accidentally start an action a line early while meaning "together".
 */
export async function together<T>(...actions: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(actions.map((action) => action()));
}

/**
 * The aligned start: `arrive()` is each role's "I'm ready", `wait()` is everyone holding until
 * the last one arrives. Used inside a `together` beat, it makes a burst that begins together —
 * which a plain Promise.all of actions with unknown-length setups does not.
 */
export function rendezvous(count: number): { arrive: () => void; wait: () => Promise<void> } {
  let arrived = 0;
  let open: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    arrive: () => {
      arrived += 1;
      if (arrived >= count) open();
    },
    wait: () => gate,
  };
}
