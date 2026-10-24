import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiSignIn, signInParticipant, signInSuperadmin } from '../support/fixtures.js';
import { busyPhoto, socialPhotoCount } from '../support/photo-stubs.js';
import { fromRepo } from '../support/paths.js';

/**
 * Fills the chat room and the photo gallery with something worth looking at.
 *
 * This is a **seeding tool, not a test**, and it is a Playwright spec on purpose: the gallery's
 * renditions are produced by a real canvas in a real browser (ADR-050), so the only way to seed
 * realistic photos is to drive the actual picker rather than to post bytes at the API and guess.
 * It also closes, for a demo, the gap ADR-047 recorded — the recorded demo dump carries sprite
 * strings, not image files, so `seed:demo` cannot populate the gallery on its own.
 *
 *   PSD_SEED_SOCIAL=1 PSD_E2E_NO_SERVER=1 \
 *     npx playwright test e2e/seed-social.spec.ts --project=desktop-chrome
 *
 * Skipped without `PSD_SEED_SOCIAL=1`, so a normal suite run never writes demo content.
 */

/**
 * Each recorded persona has its OWN pin — `seed:demo`'s "every nickname works" line means they all
 * exist, not that they share a credential. Reading the dump is the only way to know, and assuming
 * otherwise is what made the first run of this file hang on a failed sign-in.
 */
interface Persona {
  nickname: string;
  pin: string;
}

const PERSONAS: Persona[] = (
  JSON.parse(
    readFileSync(
      fromRepo('scripts', 'demo-personas.json'),
      'utf8',
    ),
  ) as { participants: Persona[] }
).participants;

function personaAt(index: number): Persona {
  const persona = PERSONAS[index];
  if (!persona) throw new Error(`No persona at index ${index}`);
  return persona;
}

const CAPTIONS = [
  'Sandcastle crew at Siloso',
  'Court 2 semi-final, last point',
  'Tug of war — we did NOT win',
  'Sunrise before setup',
  'Team Merlion Mavericks',
  'Beach volleyball rally',
  'Kueh break between rounds',
  'Our cluster taking the lead',
  'Monorail over the water',
  'Prize table, filling up',
];

/**
 * ADR-063 — a few lines in one team's room, so the team surface is not empty in a demo.
 *
 * The first personas of the recorded seed share a team, so signing them in one after another fills
 * that room. Their joining lines are already there — the server writes those when the seed builds the
 * team — so this only adds the conversation on top of the history.
 */
const TEAM_LINES = [
  'Warm up at court two in ten minutes?',
  'I will bring the good ball, the spare one is flat',
  'Sunscreen is with me if anyone needs it',
  'Captain says we are up right after the Cumulus match',
];

const LINES = [
  'Morning everyone! Anyone at the volleyball court yet?',
  'Court 2 is free if anyone wants a warm-up game',
  'We need one more for tug of war, Cumulus cluster',
  'Sandcastle station has the shortest queue right now',
  'Just posted photos from the semi-final to the gallery',
  'Reminder: hydrate. It is very hot out here.',
  'Who is winning? The board says Cumulus but I do not believe it',
];

/** The one thing the superadmin says, so the demo has a toast to show (ADR-074). */
const ANNOUNCEMENT = 'Finals start at 4pm on court 1. Come and watch!';

/**
 * ADR-071 — which corpus photo a caption gets, spread across the whole set.
 *
 * The caption index used to be the corpus index, so ten captions meant photos 1–10 and the other
 * fifty were never seeded. Those first ten are also the plainest of the set — the clean portrait
 * variants — which is why a re-run looked like the same handful of faces over and over.
 *
 * The stride is derived rather than written down: with a hundred photos and ten captions it is ten, and
 * it stays correct when either count changes. Deterministic on purpose — a seeded shuffle would
 * make two runs of a *seeding tool* disagree about what is in the gallery for no gain.
 */
const CORPUS_COUNT = socialPhotoCount();
const CORPUS_STRIDE = Math.max(1, Math.floor(CORPUS_COUNT / CAPTIONS.length));

function corpusIndexFor(index: number): number {
  return (index * CORPUS_STRIDE) % CORPUS_COUNT;
}

/**
 * Whether a live announcement already exists — which only a *participant* read can answer.
 *
 * Counting `announce__row` on the console was the obvious guard and it is wrong: the console lists
 * retracted announcements too, on purpose, because ADR-074 keeps them for the audit trail. Since
 * `announcementView` carries no `retractedAt`, that table cannot distinguish a live row from a dead
 * one, so a row-count guard skips forever once any announcement has ever been made. `/api/me/alerts`
 * is the read that filters on `retracted_at IS NULL`, so it is the one that means anything here.
 */
async function announcementIsLive(request: APIRequestContext): Promise<boolean> {
  const persona = personaAt(0);
  await apiSignIn(request, '/api/auth/participants/signin', {
    nickname: persona.nickname,
    pin: persona.pin,
  });
  const alerts = await request.get('/api/me/alerts');
  const { announcements } = (await alerts.json()) as { announcements: unknown[] };
  return announcements.length > 0;
}

/**
 * The demo's one announcement.
 *
 * Guarded by the caller rather than announced unconditionally, because only `announcements[0]` — the
 * OLDEST live row — is ever rendered as a toast. A second seeding run that announced anyway would
 * add a row nobody can ever see while quietly growing the table, which is the same shape of problem
 * ADR-071 just fixed one surface along.
 */
async function seedAnnouncement(page: Page): Promise<void> {
  await page.getByTestId('announce__body').fill(ANNOUNCEMENT);
  await page.getByTestId('announce__send').click();
  await expect(page.getByTestId('announce__row').filter({ hasText: ANNOUNCEMENT })).toBeVisible({
    timeout: 20_000,
  });
  console.log('[seed] announcement from superadmin');
}

/** A unique copy of a corpus photo: the archive dedupes globally on the raw bytes (ADR-050). */
function uniquePhoto(index: number) {
  const at = corpusIndexFor(index);
  // Named for the corpus photo rather than the caption slot: this becomes `original_filename` in
  // the archive, where "which source photo is this" is the only question worth being able to ask.
  const original = readFileSync(busyPhoto(at));
  return {
    name: `SEED_${at}_${Date.now()}.png`,
    mimeType: 'image/png',
    buffer: Buffer.concat([original, randomBytes(64)]),
  };
}

test.describe('seed the social surfaces', () => {
  test.skip(process.env['PSD_SEED_SOCIAL'] !== '1', 'Set PSD_SEED_SOCIAL=1 to write demo content.');
  test.skip(({ browserName }) => browserName !== 'chromium', 'One engine is enough to seed.');
  /*
   * Ten uploads plus eight messages, measured at roughly two seconds each. 120 s is deliberately
   * close to that: an over-generous timeout does not make a run safer, it just turns a failed
   * sign-in into a five-minute stall instead of a fast, obvious failure — which is exactly what
   * happened on the first run of this file.
   */
  test.setTimeout(120_000);

  test('photos, votes and conversation', async ({ browser, request }) => {
    for (const [index, caption] of CAPTIONS.entries()) {
      const persona = personaAt(index);
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await signInParticipant(page, persona.nickname, persona.pin);
        await page.goto('/social/photos');
        await page.getByTestId('photos-panel__pick').setInputFiles(uniquePhoto(index));
        await page.getByTestId('photos-panel__caption').fill(caption);
        await page.getByTestId('photos-panel__share').click();
        // `.first()` because this is a SEEDER and may be run twice: a second pass produces a second
        // photo with the same caption, and strict mode would fail on the duplicate rather than on
        // anything being wrong.
        await expect(
          page.getByTestId('photos-panel__photo').filter({ hasText: caption }).first(),
        ).toBeVisible({ timeout: 30_000 });

        // Spread some likes so "Most liked" and the wall have a real ranking to show.
        const hearts = page.getByTestId('photos-panel__like');
        const likes = Math.min(await hearts.count(), index % 4);
        for (let at = 0; at < likes; at += 1) {
          await hearts.nth(at).click();
          await page.waitForTimeout(150);
        }
        console.log(`[seed] photo from ${persona.nickname}`);
      } finally {
        await context.close();
      }
    }

    for (const [index, body] of LINES.entries()) {
      const persona = personaAt(index);
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await signInParticipant(page, persona.nickname, persona.pin);
        await page.goto('/social/chat');
        await page.getByTestId('chat-panel__draft').fill(body);
        await page.getByTestId('chat-panel__send').click();
        await expect(
          page.getByTestId('chat-panel__message').filter({ hasText: body.slice(0, 24) }).first(),
        ).toBeVisible({ timeout: 20_000 });
        console.log(`[seed] chat from ${persona.nickname}`);
      } finally {
        await context.close();
      }
    }

    /*
     * ADR-063 — the team room. Posted from `/team` rather than the social tab, and only by personas
     * who share a team: a participant with no team correctly gets a 403 rather than a room, so
     * choosing the wrong nickname here would seed nothing and look like a bug in the feature.
     */
    for (const [index, body] of TEAM_LINES.entries()) {
      const persona = personaAt(index);
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await signInParticipant(page, persona.nickname, persona.pin);
        await page.goto('/team');
        const draft = page.getByTestId('team-chat__draft');
        /*
         * Waited for, not counted. `count()` straight after `goto` races the team fetch and returns
         * zero before React has rendered the panel, which made every persona look teamless — the
         * first version of this block skipped all four for that reason and looked like a broken
         * feature rather than a racy check.
         */
        const hasRoom = await draft
          .waitFor({ state: 'visible', timeout: 10_000 })
          .then(() => true)
          .catch(() => false);
        if (!hasRoom) {
          console.log(`[seed] ${persona.nickname} has no team — skipping their team line`);
          continue;
        }
        await draft.fill(body);
        await page.getByTestId('team-chat__send').click();
        await expect(
          page.getByTestId('team-chat__message').filter({ hasText: body.slice(0, 24) }).first(),
        ).toBeVisible({ timeout: 20_000 });
        console.log(`[seed] team chat from ${persona.nickname}`);
      } finally {
        await context.close();
      }
    }

    /*
     * ADR-074 — one announcement, so the demo has a toast over the banner.
     *
     * This replaced a facilitator posting a "staff voice" line into `/social/chat`, which could not
     * seed and was never going to: that surface is wrapped in `RequireActor actorType="participant"`,
     * so a facilitator is redirected to `/staff` before `ChatPanel` mounts. ADR-074 retired the need
     * rather than the obstacle — announcing is a superadmin act, and it arrives where the participant
     * already is instead of as line eighty-three of a room nobody is sitting in.
     */
    if (await announcementIsLive(request)) {
      console.log('[seed] an announcement is already live — leaving it alone');
      return;
    }

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    try {
      await signInSuperadmin(adminPage);
      await adminPage.goto('/admin/announce');
      await seedAnnouncement(adminPage);
    } finally {
      await adminContext.close();
    }
  });
});
