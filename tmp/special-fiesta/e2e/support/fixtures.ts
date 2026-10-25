import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { readAvatarLook } from '@psd/contracts';

/**
 * E2E provisioning goes through the app's own APIs — never a direct database write
 * (AGENTS-testing.md §6). Every name carries a per-run suffix so repeated runs against the
 * same event database never collide.
 */

/**
 * Unique per RUN and per WORKER — the second half is what makes parallel files safe.
 *
 * A clock-only id collides the moment two workers start inside the same millisecond, which
 * is exactly what happens when Playwright launches a pool at once: every worker imports this
 * module within a few ms of its siblings. Two workers sharing a run id would then sign up the
 * same nickname and one of them would fail on a duplicate — intermittently, and only when the
 * machine was fast enough to start them together, which is the worst kind of failure to own.
 *
 * `TEST_WORKER_INDEX` is set by Playwright in every worker process (it is undefined when a
 * helper is imported outside a run, hence the fallback). The ids stay short because a nickname
 * is capped at 20 characters and these are suffixed onto labels.
 */
const workerSlot = Number.parseInt(process.env['TEST_WORKER_INDEX'] ?? '0', 10) || 0;
export const runId = `${Date.now().toString(36).slice(-5)}${workerSlot.toString(36)}`;

export const seeded = {
  superadmin: { username: 'superadmin', passcode: '4242' },
  facilitatorPasscode: '1111',
};

/**
 * Asia/Singapore, `YYMMDD-HHMMSS` — the repository's screenshot naming convention.
 *
 * ADR-073 — it lives here after having been copied verbatim into three specs. A fourth copy was the
 * prompt to move it: the screenshots are a time-ordered audit trail, and a convention with four
 * definitions is a convention waiting to drift.
 */
export function stamp(): string {
  const iso = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  const date = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;
  const time = `${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
  return `${date}-${time}`;
}

export function unique(label: string): string {
  return `${label}_${runId}`;
}

interface SignUpInput {
  nickname: string;
  clusterCode?: string;
  gender?: 'male' | 'female';
}

/** The look every fixture participant wears, and the backdrop a cut-out sprite falls onto. */
export const SIGNUP_LOOK = '3-1-2-1-3-1f4e9c-1d5b8c';
export const SIGNUP_BACKDROP = readAvatarLook(SIGNUP_LOOK).backdrop;

/** F1 — create a participant through the public signup endpoint. */
export async function apiSignUp(request: APIRequestContext, input: SignUpInput) {
  const body = {
    nickname: input.nickname,
    pin: '1234',
    clusterCode: input.clusterCode ?? 'ITC',
    gender: input.gender ?? 'female',
    avatarVariant: 1,
    avatarLook: SIGNUP_LOOK,
  };
  const response = await request.post('/api/auth/participants/signup', { data: body });
  if (!response.ok()) throw new Error(`signup failed: ${response.status()} ${await response.text()}`);
  return { ...body, ...(await response.json()) };
}

export async function apiSignIn(request: APIRequestContext, path: string, data: object) {
  const response = await request.post(path, { data });
  if (!response.ok()) throw new Error(`${path} failed: ${response.status()} ${await response.text()}`);
  return response.json();
}

/**
 * ADR-044 — how to put text into a controlled React input so the component actually has it.
 *
 * `fill()` sets the value and dispatches one input event, and WebKit can land that event
 * before React has attached its listener: the DOM holds the text, the component's state does
 * not, and the form then rejects a PIN the screenshot clearly shows. Typing character by
 * character makes each keystroke its own event, and because a controlled input re-renders
 * from state after every one, a dropped event leaves the field visibly short — so the value
 * check below is a real check, and retrying is what re-fires what was missed.
 */
export async function typeInto(field: Locator, value: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await field.fill('');
    await field.pressSequentially(value);
    if ((await field.inputValue()) === value) return;
  }
  await expect(field, 'the field never kept what was typed').toHaveValue(value);
}

/**
 * Every sign-in form gates its submit button on the app's own idea of a complete form, so
 * two filled fields are not the same as a ready form. Type, ask, and only then click: if the
 * app never agrees the form is submittable, the failure says so instead of timing out on a
 * click against a disabled button.
 */
async function fillAndSubmit(
  fields: { first: Locator; second: Locator; submit: Locator },
  values: [string, string],
): Promise<void> {
  await typeInto(fields.first, values[0]);
  await typeInto(fields.second, values[1]);
  await expect(fields.submit, 'the form never became submittable').toBeEnabled();
  await fields.submit.click();
}

/**
 * Waits for a sign-in to actually land, rather than for a URL that merely looks right.
 *
 * `waitForURL(/\/admin/)` was the original, and it matched `/admin/signin` — the page already on
 * screen — so it returned before the request had even been answered. Whatever the caller did next
 * ran without a session and was bounced straight back to the form.
 *
 * It only surfaced when the database moved off in-process PGlite onto a real Postgres server
 * (ADR-051): the sign-in round trip grew by milliseconds, and those milliseconds were the whole
 * margin this helper had been silently relying on. A race that only passes because the backend is
 * fast is a race, so the condition now excludes the sign-in page explicitly.
 */
async function signedInAt(page: Page, prefix: string): Promise<void> {
  await page.waitForURL((url) => url.pathname.startsWith(prefix) && !url.pathname.endsWith('/signin'));
}

/** Sign a participant in through the UI so the session cookie belongs to the browser context. */
export async function signInParticipant(page: Page, nickname: string, pin = '1234') {
  await page.goto('/signin');
  await typeInto(page.getByTestId('signin-form__nickname'), nickname);
  /*
   * ADR-085 — the fourth PIN digit IS the submit: the form signs in by itself once the nickname is in and the PIN is
   * complete, and leaves the page as the sign-in lands. Nothing is clicked or read after the digits, because the
   * button and the field are gone by then; a click or a read on them waits for nodes that have detached.
   */
  await page.getByTestId('signin-form__pin').pressSequentially(pin);
  await page.waitForURL('**/home');
}

/**
 * Signs a facilitator in (ADR-074). It spent a while deliberately without a caller, kept alive
 * for the first facilitator e2e spec — which is what the cast specs' station marshal now is —
 * because what it guards is not the twelve lines but `signedInAt`'s condition below, whose
 * comment records a race that only surfaced once the database moved to a real Postgres server.
 */
export async function signInStaff(page: Page, username: string, passcode = seeded.facilitatorPasscode) {
  await page.goto('/staff/signin');
  await fillAndSubmit(
    {
      first: page.getByTestId('staff-signin__username'),
      second: page.getByTestId('staff-signin__passcode'),
      submit: page.getByTestId('staff-signin__submit'),
    },
    [username, passcode],
  );
  await signedInAt(page, '/staff');
}

export async function signInSuperadmin(page: Page) {
  await page.goto('/admin/signin');
  await fillAndSubmit(
    {
      first: page.getByTestId('admin-signin__username'),
      second: page.getByTestId('admin-signin__passcode'),
      submit: page.getByTestId('admin-signin__submit'),
    },
    [seeded.superadmin.username, seeded.superadmin.passcode],
  );
  await signedInAt(page, '/admin');
}

/**
 * A team through the real UI, returning the join code a teammate needs (ADR-063).
 *
 * Here rather than in a spec because two of them now build a room before they can test
 * anything inside it, and a second copy of a helper is where this repository has agreed to
 * stop copying.
 */
export async function createTeam(page: Page, teamName: string): Promise<string> {
  await page.goto('/teams');
  await typeInto(page.getByTestId('teams__create-name'), teamName);
  await page.getByTestId('teams__create-submit').click();
  await expect(page.getByTestId('my-team__join-code')).toBeVisible({ timeout: 15_000 });
  return (await page.getByTestId('my-team__join-code').innerText()).trim();
}

export async function joinTeam(page: Page, joinCode: string): Promise<void> {
  await page.goto('/teams');
  await typeInto(page.getByTestId('teams__join-code'), joinCode);
  await page.getByTestId('teams__join-submit').click();
  await expect(page.getByTestId('team-chat__draft')).toBeVisible({ timeout: 15_000 });
}

/**
 * Retracts every live staff announcement. An announcement is **global** and only the oldest
 * live row is ever rendered as a toast, so a spec that announces must clear first — otherwise
 * a leftover from the seeder or an earlier run is the toast under test, and every assertion
 * after it is quietly about the wrong announcement. The admin list carries retracted rows too,
 * so an already-retracted row answers 404; that is the expected reply, which is why the
 * response goes unchecked.
 *
 * Lived in announcements.spec.ts until the cast specs needed the same guarantee (ADR-347) —
 * the second copy is where this repository agreed to stop copying.
 */
export async function clearAnnouncements(request: APIRequestContext): Promise<void> {
  await apiSignIn(request, '/api/auth/superadmins/signin', seeded.superadmin);
  const listed = await request.get('/api/admin/announcements');
  const { announcements } = (await listed.json()) as { announcements: { id: string }[] };
  for (const announcement of announcements) {
    await request.post(`/api/admin/announcements/${announcement.id}/retract`);
  }
}
