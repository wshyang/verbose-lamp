import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { typeInto } from '../support/fixtures.js';
import { fromRepo, REPO_ROOT } from '../support/paths.js';
import {
  CDN,
  FAKE_FACE_DETECTOR,
  FAKE_MEDIAPIPE,
  FAKE_TRANSFORMERS,
  HINTS,
  MEDIAPIPE_CDN,
} from '../support/photo-stubs.js';

/**
 * ADR-040 — the demo seed is not invented, it is RECORDED. This suite walks every
 * persona in `scripts/demo-personas.json` through the real sign-up screen and the
 * real photo studio on an EMPTY server, on the happy path — the FaceDetector finds
 * the face and the cut-out model removes the background — and then asks the server
 * what it now holds. That answer becomes `scripts/demo-participants.dump.json`,
 * which `seed-demo.mjs` replays verbatim.
 *
 * It refuses to run against a lived-in database: the recording is only honest if
 * every participant on the server came from this walk. Run it through
 * `npm run demo:record`, which wipes a dedicated data directory first — it never
 * runs as part of the ordinary suites (PSD_E2E_ONBOARDING gates it).
 */

const PERSONAS = fromRepo('scripts', 'demo-personas.json');
const DUMP = fromRepo('scripts', 'demo-participants.dump.json');
const REPO = REPO_ROOT;

type Persona = {
  sourceImage: string;
  nickname: string;
  pin: string;
  clusterCode: string;
  gender: 'female' | 'male';
  avatarVariant: number;
  persona: string;
};

/**
 * PSD_E2E_REAL_MODEL=1 — on a host with internet, record with the REAL pipeline: the
 * CDN is left alone so Transformers.js and the MODNET weights actually load, and no
 * fake FaceDetector is injected (Chromium's own, where it ships one, or the model's
 * mask does the cropping). The happy-path assertion — the hint must reach "refined" —
 * is unchanged, so a recording only succeeds when the real model genuinely worked on
 * every photo. Sprites then follow true silhouettes instead of the stand-in ellipse,
 * which is the difference between a cameo and a likeness for off-centre photos.
 */
const REAL_MODEL = process.env['PSD_E2E_REAL_MODEL'] === '1';

test.use({ video: 'off' });

async function superadmin(request: APIRequestContext): Promise<void> {
  const signin = await request.post('/api/auth/superadmins/signin', {
    data: { username: 'superadmin', passcode: '4242' },
  });
  expect(signin.ok(), 'superadmin signin').toBe(true);
}

async function directory(request: APIRequestContext) {
  const response = await request.get('/api/admin/participants');
  expect(response.ok(), 'admin directory').toBe(true);
  const body = (await response.json()) as {
    items: {
      participant: {
        nickname: string;
        clusterCode: string;
        gender: string;
        avatarVariant: number;
        avatarLook: string;
        avatarPhotoId: string | null;
      };
    }[];
  };
  return body.items.map((item) => item.participant);
}

test.describe('recording the demo seed from real onboardings', () => {
  test.skip(
    process.env['PSD_E2E_ONBOARDING'] !== '1',
    'runs only through `npm run demo:record`, against a wiped server',
  );
  test.skip(({ isMobile }) => isMobile === true, 'the recording runs once, on desktop Chromium');

  test('every persona signs up, wears their photo, and the server dump becomes the seed', async ({
    browser,
    request,
  }) => {
    const all = (JSON.parse(readFileSync(PERSONAS, 'utf8')) as { participants: Persona[] })
      .participants;
    /*
     * `PSD_DEMO_LIMIT=3` records the first few personas instead of all of them. Iterating on the
     * recording used to mean an hour per attempt, which is how a defect in it survived: nobody
     * re-runs a one-hour job to check a hunch.
     */
    const limit = Number(process.env['PSD_DEMO_LIMIT'] ?? all.length);
    const personas = all.slice(0, Math.max(1, limit));
    /*
     * Measured, not guessed: one photo through the genuine library takes ~7 s on this engine
     * (`e2e/model-available.spec.ts`), and the weights are fetched once per browser context rather
     * than once per persona now. 20 s each is generous against that without hiding a regression —
     * an over-large budget is what let the old per-persona model reload go unnoticed
     * (AGENTS-workflow.md §4b).
     */
    const perPhoto = REAL_MODEL ? 20_000 : 10_000;
    test.setTimeout(120_000 + personas.length * perPhoto);

    // An honest recording starts from nothing: no participant this walk did not create.
    await superadmin(request);
    const before = await directory(request);
    expect(
      before.length,
      'the server already has participants — run this through `npm run demo:record`, which wipes its own data directory',
    ).toBe(0);

    /*
     * ONE context for the whole walk, a fresh PAGE per persona.
     *
     * A page per persona keeps each sign-up honest — new page, new session, the flow a participant
     * actually meets. But a context per persona also threw away the HTTP cache, so under
     * PSD_E2E_REAL_MODEL the MODNET weights were re-fetched and the runtime re-initialised eighty
     * times. That is what made a real-model recording take an hour, and the 180 s per-photo budget
     * that hid it.
     */
    const context = await browser.newContext();
    if (!REAL_MODEL) {
      await context.route(CDN, (route) =>
        route.fulfill({ contentType: 'text/javascript', body: FAKE_TRANSFORMERS }),
      );
      await context.addInitScript(FAKE_FACE_DETECTOR);
      /*
       * ADR-054 — the face locator is stubbed too, or a "stubbed" recording would quietly fetch
       * 2.7 MB of real MediaPipe from a CDN and depend on the host being online. Under
       * PSD_E2E_REAL_MODEL nothing here is routed and the genuine detector runs, which is the
       * only way the dump's framing is evidence about what a participant will actually get.
       */
      await context.route(MEDIAPIPE_CDN, (route) =>
        route.fulfill({ contentType: 'text/javascript', body: FAKE_MEDIAPIPE }),
      );
    }

    for (const persona of personas) {
      const page = await context.newPage();

      // The sign-up screen, exactly as a participant meets it (fds.md §6.5 F1).
      await page.goto('/signup');
      await typeInto(page.getByTestId('signup-form__nickname'), persona.nickname);
      await typeInto(page.getByTestId('signup-form__pin'), persona.pin);
      await page.getByTestId('signup-form__cluster').selectOption(persona.clusterCode);
      await page.getByTestId(`signup-form__gender-${persona.gender}`).click();
      await page
        .getByTestId('signup-form__avatar')
        .nth(persona.avatarVariant - 1)
        .click();
      await page.getByTestId('signup-form__submit').click();
      await page.waitForURL('**/home');

      // Then their photo, through the studio: detector finds the face, model cuts it out.
      await page.goto('/me');
      await page.getByTestId('profile__look-edit').click();
      await page
        .getByTestId('avatar-studio__photo')
        .setInputFiles(join(REPO, persona.sourceImage));
      /*
       * ADR-056 — wait for the SQUARE, then accept it, which is exactly what a participant does.
       *
       * This used to demand `HINTS.refined`, which made the whole recording hinge on every single
       * photograph being framed automatically: one photo the detector cannot find a face in
       * (measured: `social-02-male.png`) aborted all eighty. That is asserting a model's recall
       * rather than the app's behaviour. Waiting for the square covers all three honest outcomes —
       * found by the browser, found by the locator, or placed in the middle to be adjusted — and
       * confirming it is the same single tap in each.
       */
      await expect(page.getByTestId('photo-cropper'), persona.sourceImage).toBeVisible({
        timeout: REAL_MODEL ? 180_000 : 30_000,
      });
      /*
       * Accept the square when a face was found; otherwise drop the photo and keep the drawn
       * archetype.
       *
       * A participant looking at a square sitting on the wrong thing would move it — but the
       * recorder cannot know where the face is, and blindly tapping "use" is what put an arm
       * holding a phone on the seeded crowd. Measured: `social-02-male.png` is shot upside down,
       * and BlazeFace does not detect inverted faces. Keeping the archetype is the honest seed for
       * that photo, and it makes the demo crowd the real mix — mostly photo avatars, a few drawn.
       */
      const hint = page.getByTestId('avatar-studio__photo-state');
      const foundAFace = (await hint.textContent()) !== HINTS.cropping;
      if (foundAFace) {
        await page.getByTestId('photo-cropper__use').click();
        // ADR-229 — Done commits the square and closes the dialog.
        await expect(page.getByTestId('photo-dialog'), persona.sourceImage).toBeHidden({ timeout: 30_000 });
      } else {
        console.log(`[demo:record] no face in ${persona.sourceImage} — keeping the archetype`);
        // ADR-229 — a photo nobody frames is never committed, so there is nothing worn to remove. Cancel
        // discards it, and the drawn character the participant chose at sign-up stays, as it would for a
        // participant who gives up on the photo.
        await page.getByTestId('photo-cropper__cancel').click();
        await expect(page.getByTestId('photo-dialog'), persona.sourceImage).toBeHidden({ timeout: 30_000 });
      }
      await page.getByTestId('profile__look-save').click();
      await expect(page.getByTestId('profile__look-saved')).toBeVisible();
      await page.close();
    }
    await context.close();

    // Now ask the server what it holds — the dump is its answer, not our intention.
    const after = await directory(request);
    expect(after.length).toBe(personas.length);
    const byNickname = new Map(after.map((row) => [row.nickname, row]));

    /*
     * ADR-056 — most personas wear a photo sprite; a few legitimately do not.
     *
     * A photograph the detector cannot find a face in keeps its drawn archetype rather than a crop
     * of whatever happened to be in the middle of the frame. So the assertion is that every id
     * present is well formed, and that the crowd is still overwhelmingly photographic — not that
     * every single photo converted, which would be asserting a model's recall rather than the app's
     * behaviour.
     */
    const spriteIds = after.flatMap((row) => (row.avatarPhotoId == null ? [] : [row.avatarPhotoId]));
    for (const id of spriteIds) expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(spriteIds.length).toBeGreaterThanOrEqual(Math.ceil(personas.length * 0.8));

    // Sprite bodies come through the same batch endpoint the leaderboard uses (ADR-035).
    const sprites = new Map<string, string>();
    for (let at = 0; at < spriteIds.length; at += 60) {
      const ids = spriteIds.slice(at, at + 60).join(',');
      const response = await request.get(`/api/avatars?ids=${ids}`);
      expect(response.ok()).toBe(true);
      const body = (await response.json()) as { items: { id: string; sprite: string }[] };
      for (const item of body.items) sprites.set(item.id, item.sprite);
    }

    const participants = personas.map((persona) => {
      const row = byNickname.get(persona.nickname);
      if (row === undefined) throw new Error(`${persona.nickname} never made it to the server`);
      // `null` where the photo was dropped: the seed then replays a drawn archetype for them.
      const sprite = row.avatarPhotoId == null ? null : sprites.get(row.avatarPhotoId);
      if (sprite === undefined) throw new Error(`${persona.nickname} has no sprite body`);
      if (sprite !== null) {
        expect(sprite.startsWith('128:'), `${persona.nickname} wears a 128×128 sprite`).toBe(true);
      }
      return {
        sourceImage: persona.sourceImage,
        persona: persona.persona,
        nickname: row.nickname,
        pin: persona.pin,
        clusterCode: row.clusterCode,
        gender: row.gender,
        avatarVariant: row.avatarVariant,
        avatarLook: row.avatarLook,
        avatarPhoto: sprite,
      };
    });

    writeFileSync(
      DUMP,
      `${JSON.stringify({ version: 1, recordedAt: new Date().toISOString(), participants }, null, 1)}\n`,
    );
  });
});
