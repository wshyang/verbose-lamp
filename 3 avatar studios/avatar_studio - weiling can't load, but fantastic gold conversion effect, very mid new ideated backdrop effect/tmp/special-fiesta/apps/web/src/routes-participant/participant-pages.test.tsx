import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyStates, formatAvatarSprite, messages } from '@psd/contracts';
import { SpriteProvider } from '../components/participant/SpriteProvider.js';
import { LandingPage } from './LandingPage.js';
import { SignInPage } from './SignInPage.js';
import { QrHomePage } from './QrHomePage.js';
import { ProfilePage } from './ProfilePage.js';
import { ScanHistoryPage } from './ScanHistoryPage.js';
import { PassportPage } from './PassportPage.js';
import { MatchFeedPage } from './MatchFeedPage.js';
import { LeaderboardPage } from './LeaderboardPage.js';
import { TeamsPage } from './TeamsPage.js';
import { MyTeamPage } from './MyTeamPage.js';
import { TeamDetailPage } from './TeamDetailPage.js';
import { renderWithProviders, confirmDialog } from '../test-utils/renderWithProviders.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../test-utils/fetchStub.js';
import { teamChatRoutes } from '../test-utils/ambientRoutes.js';
import {
  completedMatchFixture,
  participantFixture,
  participantSession,
  scanFixture,
  teamFixture,
} from '../test-utils/fixtures.js';

/**
 * Every participant surface (S1–S17, S60) rendered through its real hooks against a stubbed
 * network. These are the Gameboy-styled screens, so the assertions are about what a player
 * sees: their points, their roster, the empty-state copy from fds.md §8.4.
 */

let stub: FetchStub;

/*
 * ADR-112 — these pages read through the device cache now, so each case has to start on a
 * phone that has never been used. Without this the suite tests the wrong thing: the first
 * case to read `/api/me` successfully would leave a remembered card behind, and the later
 * case that asserts the 401 copy would be served that card instead — passing or failing on
 * the order the cases happen to run in rather than on the behaviour it names.
 */
beforeEach(() => window.localStorage.clear());

afterEach(() => stub?.restore());

const session = { body: participantSession };
const passport = {
  stationsVisited: 2,
  stationsRequired: 4,
  bonusPoints: 20,
  isEarned: false,
};
const totals = {
  fringePoints: 45,
  tournamentPoints: 10,
  totalPoints: 55,
  scanCount: 3,
  passport,
};

function render(ui: Parameters<typeof renderWithProviders>[0], routes: RouteTable, path?: string) {
  stub = installFetchStub({
    ...teamChatRoutes(), 'GET /api/auth/session': session, ...routes });
  return renderWithProviders(ui, path ? { path, route: '/teams/:teamId' } : undefined);
}

describe('S1 — landing', () => {
  it('offers both participant doors and both staff doors', () => {
    render(<LandingPage />, {});
    expect(screen.getByTestId('landing__signup')).toHaveAttribute('href', '/signup');
    expect(screen.getByTestId('landing__signin')).toHaveAttribute('href', '/signin');
    expect(screen.getByTestId('landing__staff')).toHaveAttribute('href', '/staff/signin');
    expect(screen.getByTestId('landing__admin')).toHaveAttribute('href', '/admin/signin');
  });
});

describe('S2 — participant sign-in (F3)', () => {
  it('invites the browser to save the credentials (ADR-101)', () => {
    render(<SignInPage />, {});
    expect(screen.getByTestId('signin-form__form')).toHaveAttribute('autocomplete', 'on');
    expect(screen.getByTestId('signin-form__nickname')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByTestId('signin-form__pin')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('sends the nickname and PIN, and reports a wrong PIN with the spec copy', async () => {
    render(<SignInPage />, {
      'POST /api/auth/participants/signin': {
        status: 401,
        body: { error: { message: messages.signInRejected } },
      },
    });
    const user = userEvent.setup();
    await user.type(screen.getByTestId('signin-form__nickname'), 'BeachBoss');
    // ADR-085 — the fourth digit IS the submit here; clicking afterwards would be a second one.
    await user.type(screen.getByTestId('signin-form__pin'), '4821');

    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signin')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/participants/signin')[0]?.body).toEqual({
      nickname: 'BeachBoss',
      pin: '4821',
    });
    expect(await screen.findByTestId('signin-form__error')).toHaveTextContent(messages.signInRejected);
    // ADR-027 — the wrong PIN clears itself and takes the caret back, so the retry is
    // four taps rather than four backspaces and four taps.
    expect(screen.getByTestId('signin-form__pin')).toHaveValue('');
    expect(document.activeElement).toBe(screen.getByTestId('signin-form__pin'));
    // And the browser is allowed to remember the pair now.
    expect(screen.getByTestId('signin-form__pin')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByTestId('signin-form__nickname')).toHaveAttribute('autocomplete', 'username');
  });

  it('lands the signed-in player on their badge', async () => {
    render(<SignInPage />, {
      'POST /api/auth/participants/signin': { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();
    await user.type(screen.getByTestId('signin-form__nickname'), participantFixture.nickname);
    await user.type(screen.getByTestId('signin-form__pin'), '1234');

    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signin')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/participants/signin')[0]?.body).toEqual({
      nickname: participantFixture.nickname,
      pin: '1234',
    });
    // The session is re-read so the badge can be drawn for the player who just signed in.
    await waitFor(() => expect(stub.callsTo('GET /api/auth/session').length).toBeGreaterThan(1));
  });

  it('keeps the submit button disabled until both fields are filled', async () => {
    render(<SignInPage />, {
      'POST /api/auth/participants/signin': { body: { participant: participantFixture } },
    });
    expect(screen.getByTestId('signin-form__submit')).toBeDisabled();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('signin-form__nickname'), 'BeachBoss');
    // Three digits, deliberately: a fourth would submit (ADR-085), and the rule under test is the
    // button's, which still wants a complete PIN before it offers itself.
    await user.type(screen.getByTestId('signin-form__pin'), '482');

    expect(screen.getByTestId('signin-form__submit')).toBeDisabled();
    // Nothing has been sent either: an incomplete PIN is not a submission by any route.
    expect(stub.callsTo('POST /api/auth/participants/signin')).toHaveLength(0);
  });

  /**
   * The button's enabled state is deliberately NOT asserted after a complete PIN: ADR-085 submits on
   * the fourth digit, so on a successful sign-in the form has navigated away and the button is gone.
   * That the completed PIN sends is covered above; this pins the only case where the button is still
   * the way through — a PIN completed before the nickname, which does not auto-submit.
   */
  it('offers the button once both fields are filled, PIN last or not', async () => {
    render(<SignInPage />, {
      'POST /api/auth/participants/signin': { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();

    await user.type(screen.getByTestId('signin-form__pin'), '4821');
    await user.type(screen.getByTestId('signin-form__nickname'), 'BeachBoss');

    expect(screen.getByTestId('signin-form__submit')).toBeEnabled();
    expect(stub.callsTo('POST /api/auth/participants/signin')).toHaveLength(0);
  });

  /**
   * ADR-085 — a PIN completed before the nickname must NOT fire, or a participant who fills the
   * fields out of order sends a request that could only fail.
   */
  it('waits for the button when the PIN is completed before the nickname', async () => {
    render(<SignInPage />, {
      'POST /api/auth/participants/signin': { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();

    await user.type(screen.getByTestId('signin-form__pin'), '4821');

    expect(stub.callsTo('POST /api/auth/participants/signin')).toHaveLength(0);
  });
});

describe('S3 — QR badge home (F25)', () => {
  it('draws the badge with the nickname, cluster and running total', async () => {
    render(<QrHomePage />, { 'GET /api/me': { body: { participant: participantFixture, totals } } });
    expect(await screen.findByRole('heading', { name: participantFixture.nickname })).toBeVisible();
    expect(screen.getByText(participantFixture.clusterCode)).toBeVisible();
    const image = await screen.findByAltText(`QR code for ${participantFixture.nickname}`);
    expect(image.getAttribute('src')).toContain('data:image/svg+xml');
    expect(screen.getByText('55 pts')).toBeVisible();
  });

  it('asks an unauthenticated visitor to sign in instead of drawing a badge', async () => {
    render(<QrHomePage />, {
      'GET /api/me': { status: 401, body: { error: { message: messages.signInRequired } } },
    });
    expect(await screen.findByText(messages.signInRequired)).toBeVisible();
  });
});

describe('S4 — trainer card (F4/F5)', () => {
  it('breaks points down and links to the team the player is on', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: teamFixture } },
    });
    expect(await screen.findByText('45 pts')).toBeVisible();
    expect(screen.getByText('10 pts')).toBeVisible();
    expect(screen.getByText('55 pts')).toBeVisible();
    expect(screen.getByTestId('profile__team')).toHaveAttribute('href', '/team');
    // ADR-260 — the profile sends a participant to the passport, not the scan list.
    expect(screen.getByTestId('profile__passport-link')).toHaveAttribute('href', '/me/scans/passport');
    expect(screen.getByTestId('profile__passport-link')).toHaveTextContent('See my passport');
  });

  /*
   * ADR-176 — the passport card. The unearned copy must lead with what is still needed: the
   * whole reason the card exists is to move somebody to the next station, and "2 of 4" alone
   * does not do that.
   */
  it('says how many more stations the passport needs, and what they are worth', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: teamFixture } },
    });
    const card = await screen.findByTestId('profile__passport');
    expect(card).toHaveTextContent('Passport: 2 of 4 stations.');
    expect(card).toHaveTextContent('2 more for 20 points.');
  });

  it('congratulates rather than nags once the passport is complete', async () => {
    render(<ProfilePage />, {
      'GET /api/me': {
        body: {
          participant: participantFixture,
          totals: { ...totals, passport: { ...passport, stationsVisited: 4, isEarned: true } },
        },
      },
      'GET /api/teams/mine': { body: { team: teamFixture } },
    });
    expect(await screen.findByTestId('profile__passport')).toHaveTextContent(
      'Passport complete — 20 bonus points earned.',
    );
  });

  /*
   * The card is decoration on a page that also carries identity and team. Its first version
   * destructured the passport and took the whole page down with it when the object was absent.
   */
  it('still renders the rest of the card if the passport is missing entirely', async () => {
    const { passport: _omitted, ...withoutPassport } = totals;
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals: withoutPassport } },
      'GET /api/teams/mine': { body: { team: teamFixture } },
    });
    expect(await screen.findByText('55 pts')).toBeVisible();
    expect(screen.queryByTestId('profile__passport')).toBeNull();
  });

  /* A day that is not running a passport must not show a row of zeroes about one. */
  it('shows no passport card at all when the bonus is off', async () => {
    render(<ProfilePage />, {
      'GET /api/me': {
        body: {
          participant: participantFixture,
          totals: { ...totals, passport: { ...passport, bonusPoints: 0 } },
        },
      },
      'GET /api/teams/mine': { body: { team: teamFixture } },
    });
    await screen.findByTestId('profile__passport-link');
    expect(screen.queryByTestId('profile__passport')).toBeNull();
  });

  it('never claims "not on a team" while the team answer is still in flight (ADR-099)', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: teamFixture }, delayMs: 30 },
    });

    // The profile has landed but /mine has not: the team row must hold its tongue.
    await screen.findByText('45 pts');
    expect(screen.getByTestId('profile__team-loading')).toBeVisible();
    expect(screen.queryByTestId('profile__find-team')).toBeNull();

    expect(await screen.findByTestId('profile__team')).toHaveAttribute('href', '/team');
  });

  it('points a teamless player at the team finder and signs them out on request', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
      'POST /api/auth/signout': { body: {} },
    });
    expect(await screen.findByTestId('profile__find-team')).toHaveAttribute('href', '/teams');
    await userEvent.setup().click(screen.getByTestId('profile__signout'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/signout')).toHaveLength(1));
  });

  it('opens a peek card on a small avatar, and dismisses it on tap (ADR-062)', async () => {
    /*
     * A 32 px sprite in a roster is too small to recognise, so tapping it shows the same face big
     * enough to read plus who it belongs to. The card dismisses on its own tap: on a phone there is
     * no cursor to move away, so the way out has to be the same gesture as the way in.
     */
    render(<MyTeamPage />, {
      'GET /api/teams/mine': { body: { team: teamFixture } },
      'GET /api/teams/team-a': { body: { team: teamFixture } },
      'GET /api/teams/team-a/matches': { body: { items: [] } },
    });
    const user = userEvent.setup();

    const triggers = await screen.findAllByTestId('avatar-peek__open');
    expect(triggers[0]).toHaveAttribute('aria-expanded', 'false');

    await user.click(triggers[0] as HTMLElement);

    expect(screen.getAllByTestId('avatar-peek__open')[0]).toHaveAttribute('aria-expanded', 'true');
    // Nickname, the energetic word and the cluster — the three things a face alone cannot say.
    expect(screen.getAllByTestId('avatar-peek__nickname')[0]).toHaveTextContent(
      participantFixture.nickname,
    );
    expect(screen.getAllByTestId('avatar-peek__title')[0]).toHaveTextContent('Pathfinder');
    expect(screen.getAllByTestId('avatar-peek__cluster')[0]).toHaveTextContent('BP');

    await user.click(screen.getAllByTestId('avatar-peek__card')[0] as HTMLElement);

    expect(screen.getAllByTestId('avatar-peek__open')[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('calls the participant by their own energetic word, not "Trainer" (ADR-061)', async () => {
    /*
     * Every participant is given one of a hundred words at sign-up and wears it all day, so the card
     * header is theirs rather than a generic label. The fixture wears "Pathfinder".
     */
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
    });

    expect(await screen.findByText('PATHFINDER CARD')).toBeVisible();
    expect(screen.queryByText(/TRAINER/i)).toBeNull();
  });

  it('opens the studio wearing the photo, not the drawn character (ADR-059)', async () => {
    /*
     * The bug: the draft was built from `avatarVariant` and `avatarLook` only, so a participant
     * wearing a photograph opened "Change my look" and saw their DRAWN character — and saving from
     * there dropped the photo without ever saying so. The studio needs the sprite BODY, which the
     * profile row does not carry (it has `avatarPhotoId`, ADR-035), so it comes from the same
     * sprite store the `Avatar` beside the button already reads.
     */
    const sprite = formatAvatarSprite({
      size: 128,
      palette: ['#223344', '#1d5b8c'],
      rows: Array.from({ length: 128 }, () => '0'.repeat(128)),
    });
    const worn = { ...participantFixture, avatarPhotoId: 'a'.repeat(16) };
    // `renderWithProviders` does not install a SpriteProvider, and without one `useSprite` can only
    // ever answer null — so the provider the real participant tree supplies is supplied here too.
    render(
      <SpriteProvider>
        <ProfilePage />
      </SpriteProvider>,
      {
      'GET /api/me': { body: { participant: worn, totals } },
      'GET /api/teams/mine': { body: { team: null } },
      'GET /api/avatars': { body: { items: [{ id: 'a'.repeat(16), sprite }] } },
      'PUT /api/me/avatar': { body: { participant: worn } },
      },
    );
    const user = userEvent.setup();

    // The sprite body arrives over the wire, so wait for that request to land before opening the
    // studio. The studio would still be right if it had not — the photo is resolved on every render
    // rather than snapshotted (ADR-059) — but waiting keeps this test about the studio, not timing.
    await waitFor(() => expect(stub.callsTo('GET /api/avatars').length).toBeGreaterThan(0));
    await user.click(await screen.findByTestId('profile__look-edit'));

    // The studio is in its photo state: no picker, no selfie, and removal needs no character (ADR-227).
    await waitFor(() => expect(screen.getByTestId('avatar-studio__photo-clear')).toBeVisible());
    expect(screen.queryByTestId('avatar-studio__photo-label')).toBeNull();
    expect(screen.queryByTestId('avatar-studio__selfie-open')).toBeNull();
    expect(screen.getByTestId('avatar-studio__photo-clear')).toBeEnabled();
    // The preview is the photograph, and the backdrop is offered (ADR-055).
    expect(screen.getByTestId('avatar-studio__preview')).toHaveAttribute('alt', 'Photo portrait');
    expect(screen.getAllByTestId('avatar-studio__backdrop').length).toBeGreaterThan(1);

    // Saving carries the photo back rather than quietly dropping it.
    await user.click(screen.getByTestId('profile__look-save'));
    await waitFor(() => expect(stub.callsTo('PUT /api/me/avatar')).toHaveLength(1));
    expect(stub.callsTo('PUT /api/me/avatar')[0]?.body).toMatchObject({ avatarPhoto: sprite });
  });

  it('lets a participant redraw themselves and saves the new look (ADR-021)', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
      'PUT /api/me/avatar': { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('profile__look-edit'));

    await user.click(screen.getAllByTestId('profile__persona')[4] as HTMLElement);
    await user.click(screen.getAllByTestId('avatar-studio__skinTone')[6] as HTMLElement);
    await user.click(screen.getByTestId('profile__look-save'));

    await waitFor(() => expect(stub.callsTo('PUT /api/me/avatar')).toHaveLength(1));
    expect(stub.callsTo('PUT /api/me/avatar')[0]?.body).toEqual({
      avatarVariant: 5,
      // Sundowner's character, the skin tone just chosen — and the colours this player
      // already wears, which are theirs and not the character's (ADR-023).
      avatarLook: '7-1-2-1-3-1f4e9c-1d5b8c',
      // ADR-059 — the draft now starts from the avatar actually worn, so the photo travels with it.
      // This fixture wears none, and saying so explicitly is the point: the field used to be absent
      // altogether, which is how editing a look could silently drop a participant's photograph.
      avatarPhoto: null,
    });
    expect(await screen.findByTestId('profile__look-saved')).toBeVisible();
  });

  /*
   * ADR-204 — the spiral is the LAST SQUARE OF THE BACKDROP PALETTE, under no heading of its
   * own. Asserted structurally rather than by eye: the thing that regresses is someone moving
   * it back out into a row of its own, and a snapshot of the markup would not say why that
   * is wrong. The contract is (a) same swatch row as the backdrop colours, (b) last in it,
   * (c) no label announcing it as a separate setting.
   */
  it('puts the spiral at the end of the backdrop palette, with no heading of its own', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('profile__look-edit'));

    const spiral = screen.getByTestId('avatar-studio__backdrop-spiral');
    const rings = screen.getByTestId('avatar-studio__backdrop-concentric');
    const row = spiral.closest('.gb-swatches');
    expect(row).not.toBeNull();
    // The backdrop colours and the patterns share one row...
    const backdrops = screen.getAllByTestId('avatar-studio__backdrop');
    for (const swatch of backdrops) expect(swatch.closest('.gb-swatches')).toBe(row);
    // ...and each later pattern is one more SWATCH on the end, not a new row.
    const bars = screen.getByTestId('avatar-studio__backdrop-waves');
    const swirls = screen.getByTestId('avatar-studio__backdrop-psychedelic');
    for (const square of [rings, bars, swirls]) {
      expect(square.closest('.gb-swatches')).toBe(row);
    }
    expect(row?.lastElementChild).toBe(swirls);
    expect(screen.getByTestId('avatar-studio__backdrop-wheel').closest('.gb-swatches')).toBe(row);

    // No heading for either pattern: the names live on the squares' accessible labels and in
    // the hint that says what is currently on. A `.gb-label` would announce a separate setting.
    const headings = screen
      .queryAllByText(/spiral|rings|waves|swirls/i)
      .filter((node) => node.classList.contains('gb-label'));
    expect(headings).toEqual([]);
    expect(spiral).toHaveAccessibleName('Backdrop: spiral, off');
    expect(rings).toHaveAccessibleName('Backdrop: rings, off');
    expect(bars).toHaveAccessibleName('Backdrop: waves, off');
    expect(swirls).toHaveAccessibleName('Backdrop: swirls, off');
  });

  /*
   * ADR-207 — a second pattern is a second square. The thing worth asserting is that the two
   * are mutually exclusive and that each one's own knobs come and go with it, because that is
   * the behaviour a third pattern will have to copy.
   */
  it('swaps between patterns from the palette, one at a time', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
      'PUT /api/me/avatar': { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('profile__look-edit'));

    const spiral = screen.getByTestId('avatar-studio__backdrop-spiral');
    const rings = screen.getByTestId('avatar-studio__backdrop-concentric');
    expect(screen.getByTestId('avatar-studio__backdrop-style-value'))
      .toHaveTextContent('off — plain colour');

    await user.click(rings);
    expect(rings).toHaveAttribute('aria-pressed', 'true');
    expect(spiral).toHaveAttribute('aria-pressed', 'false');
    // Its own knobs are here; the spiral's are not.
    expect(screen.getByTestId('avatar-studio__concentric-ring')).toBeVisible();
    expect(screen.getByTestId('avatar-studio__concentric-lobes')).toBeVisible();
    expect(screen.queryByTestId('avatar-studio__sunburst-rays')).toBeNull();
    // Shades and the second colour are shared, so they stay.
    expect(screen.getByTestId('avatar-studio__sunburst-bands')).toBeVisible();
    expect(screen.getByTestId('avatar-studio__backdrop-style-value'))
      .toHaveTextContent('6 petals');

    // Petals to zero and it says so in words rather than leaving a 0 on screen.
    fireEvent.change(screen.getByTestId('avatar-studio__concentric-lobes'), {
      target: { value: '0' },
    });
    expect(screen.getByTestId('avatar-studio__concentric-lobes-value'))
      .toHaveTextContent('None — plain rings');
    await user.click(screen.getAllByTestId('avatar-studio__concentric-shape')[3] as HTMLElement);

    // The other square takes over rather than adding a second pattern.
    await user.click(spiral);
    expect(rings).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('avatar-studio__concentric-ring')).toBeNull();
    expect(screen.getByTestId('avatar-studio__sunburst-rays')).toBeVisible();

    // And back to rings, then off entirely from its own square.
    await user.click(rings);
    await user.click(rings);
    expect(rings).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('avatar-studio__sunburst-bands')).toBeNull();
  });

  it('saves a concentric backdrop with every part written out (ADR-207)', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
      'PUT /api/me/avatar': { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('profile__look-edit'));
    await user.click(screen.getByTestId('avatar-studio__backdrop-concentric'));
    fireEvent.change(screen.getByTestId('avatar-studio__concentric-ring'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByTestId('avatar-studio__concentric-depth'), {
      target: { value: '4' },
    });
    expect(screen.getByTestId('avatar-studio__concentric-depth-value')).toHaveTextContent('4');

    await user.click(screen.getByTestId('profile__look-save'));
    await waitFor(() => expect(stub.callsTo('PUT /api/me/avatar')).toHaveLength(1));
    // tag, colour, shape, ring, petals, depth, shades — fixed arity, nothing inferred. Every
    // knob moved above has to show up in its own slot, which is what makes this a test of the
    // wire format and not just of the sliders.
    expect(stub.callsTo('PUT /api/me/avatar')[0]?.body).toMatchObject({
      avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c-c-f7d154-2-12-6-4-3',
    });
  });

  it('saves chevron waves, and names stripes when the wave is flattened (ADR-208)', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
      'PUT /api/me/avatar': { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('profile__look-edit'));
    await user.click(screen.getByTestId('avatar-studio__backdrop-waves'));

    // Amplitude is shown as a share of the width, never in cells -- the probe's finding that
    // legibility tracks the RATIO is the one thing fiddling with the slider cannot teach.
    expect(screen.getByTestId('avatar-studio__waves-amplitude-value'))
      .toHaveTextContent('40% of the width');
    expect(screen.getByTestId('avatar-studio__backdrop-style-value'))
      .toHaveTextContent('Chevron waves');

    await user.click(screen.getAllByTestId('avatar-studio__waves-form')[1] as HTMLElement);
    expect(screen.getByTestId('avatar-studio__backdrop-style-value'))
      .toHaveTextContent('Bargello waves');

    // Flat is stripes, and says so rather than reporting a chevron with nothing in it.
    fireEvent.change(screen.getByTestId('avatar-studio__waves-amplitude'), {
      target: { value: '0' },
    });
    expect(screen.getByTestId('avatar-studio__backdrop-style-value')).toHaveTextContent('Stripes');

    // Wave width and band height are two different lengths and two different sliders; a code
    // that transposed them would still parse, so both are moved to distinct values here.
    fireEvent.change(screen.getByTestId('avatar-studio__waves-period'), {
      target: { value: '36' },
    });
    fireEvent.change(screen.getByTestId('avatar-studio__waves-band'), { target: { value: '12' } });
    expect(screen.getByTestId('avatar-studio__waves-period-value')).toHaveTextContent('36 across');
    expect(screen.getByTestId('avatar-studio__waves-band-value')).toHaveTextContent('12 tall');

    await user.click(screen.getByTestId('profile__look-save'));
    await waitFor(() => expect(stub.callsTo('PUT /api/me/avatar')).toHaveLength(1));
    expect(stub.callsTo('PUT /api/me/avatar')[0]?.body).toMatchObject({
      avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c-w-f7d154-2-36-0-12-3',
    });
  });

  it('saves psychedelic swirls, naming the un-swirled case groovy waves (ADR-209)', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
      'PUT /api/me/avatar': { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('profile__look-edit'));
    await user.click(screen.getByTestId('avatar-studio__backdrop-psychedelic'));

    expect(screen.getByTestId('avatar-studio__backdrop-style-value'))
      .toHaveTextContent('Psychedelic swirls');
    // Ripple is a share of what is safe at the current waviness, never an absolute distance.
    expect(screen.getByTestId('avatar-studio__psychedelic-ripple-value')).toHaveTextContent('60%');

    fireEvent.change(screen.getByTestId('avatar-studio__psychedelic-swirl'), {
      target: { value: '0' },
    });
    expect(screen.getByTestId('avatar-studio__psychedelic-swirl-value'))
      .toHaveTextContent('None — liquid blobs');
    expect(screen.getByTestId('avatar-studio__backdrop-style-value'))
      .toHaveTextContent('Groovy waves');

    fireEvent.change(screen.getByTestId('avatar-studio__psychedelic-frequency'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByTestId('avatar-studio__psychedelic-scale'), {
      target: { value: '11' },
    });

    await user.click(screen.getByTestId('profile__look-save'));
    await waitFor(() => expect(stub.callsTo('PUT /api/me/avatar')).toHaveLength(1));
    expect(stub.callsTo('PUT /api/me/avatar')[0]?.body).toMatchObject({
      avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c-p-f7d154-0-4-6-11-3',
    });
  });

  it('builds a sunburst backdrop and saves it on the end of the look (ADR-173)', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
      'PUT /api/me/avatar': { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('profile__look-edit'));

    // It starts plain, and the knobs that only mean something for a spiral are not there.
    const spiral = screen.getByTestId('avatar-studio__backdrop-spiral');
    expect(spiral).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('avatar-studio__preview')).toHaveAttribute('data-sunburst', 'off');
    expect(screen.queryByTestId('avatar-studio__sunburst-rays')).toBeNull();

    await user.click(spiral);

    // ADR-181 — one square, pressed, and the three controls it owns appear beneath it.
    expect(spiral).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('avatar-studio__sunburst-rays')).toBeVisible();
    expect(screen.getByTestId('avatar-studio__sunburst-twist')).toBeVisible();
    expect(screen.getByTestId('avatar-studio__preview')).toHaveAttribute('data-sunburst', 'on');
    // The first colour is the backdrop already chosen, not a second thing to pick.
    // ADR-232 (F8) — the colour is named in the visible text, and its hex is not written out.
    expect(screen.getByTestId('avatar-studio__sunburst-first')).toHaveTextContent('First colour:');
    expect(screen.getByTestId('avatar-studio__sunburst-first')).not.toHaveTextContent('#1D5B8C');

    // Both sliders move, and both are echoed back.
    fireEvent.change(screen.getByTestId('avatar-studio__sunburst-rays'), {
      target: { value: '20' },
    });
    expect(screen.getByTestId('avatar-studio__sunburst-rays-value')).toHaveTextContent('20');
    fireEvent.change(screen.getByTestId('avatar-studio__sunburst-twist'), {
      target: { value: '0' },
    });
    expect(screen.getByTestId('avatar-studio__sunburst-twist-value')).toHaveTextContent('Straight');

    // ADR-206 — the shade count is a slider, not a row of extra colour wells: two colours are
    // chosen and everything between them is worked out.
    const bands = screen.getByTestId('avatar-studio__sunburst-bands');
    expect(screen.getByTestId('avatar-studio__sunburst-bands-value')).toHaveTextContent('Two');
    fireEvent.change(bands, { target: { value: '3' } });
    expect(screen.getByTestId('avatar-studio__sunburst-bands-value'))
      .toHaveTextContent('3 colours, blended');
    fireEvent.change(bands, { target: { value: '2' } });

    // And the second colour comes off the same palette as every other colour here —
    // the named swatches, or the wheel for anything else (ADR-028).
    fireEvent.change(screen.getByTestId('avatar-studio__sunburst-colour-wheel'), {
      target: { value: '#AB12CD' },
    });
    // ADR-232 (F8) — a custom colour is named in the visible text, not written as its hex.
    expect(screen.getByTestId('avatar-studio__sunburst-colour-value')).toHaveTextContent('a custom colour');
    await user.click(screen.getAllByTestId('avatar-studio__sunburst-colour')[3] as HTMLElement);
    expect(screen.getByTestId('avatar-studio__sunburst-colour-value')).toHaveTextContent('Gold');

    await user.click(screen.getByTestId('profile__look-save'));
    await waitFor(() => expect(stub.callsTo('PUT /api/me/avatar')).toHaveLength(1));
    // ADR-205 — what the studio MINTS is tagged: `s` says the trailing parts are a spiral's,
    // rather than leaving that to be inferred from how many of them there happen to be.
    expect(stub.callsTo('PUT /api/me/avatar')[0]?.body).toMatchObject({
      avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c-s-b8770a-20-0',
    });
  });

  it('turns a sunburst back off, leaving the look exactly as it was (ADR-173)', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
      'PUT /api/me/avatar': { body: { participant: participantFixture } },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('profile__look-edit'));

    const spiral = screen.getByTestId('avatar-studio__backdrop-spiral');
    await user.click(spiral);
    expect(screen.getByTestId('avatar-studio__backdrop-style-value')).toHaveTextContent('12 rays');

    // The same square turns it off again — it is a toggle, not a one-way switch.
    await user.click(spiral);
    expect(spiral).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('avatar-studio__sunburst-rays')).toBeNull();
    expect(screen.getByTestId('avatar-studio__preview')).toHaveAttribute('data-sunburst', 'off');

    await user.click(screen.getByTestId('profile__look-save'));
    await waitFor(() => expect(stub.callsTo('PUT /api/me/avatar')).toHaveLength(1));
    expect(stub.callsTo('PUT /api/me/avatar')[0]?.body).toMatchObject({
      avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c',
    });
  });

  it('offers the backdrop style behind a photo too, so a spiral cannot get stuck (ADR-179)', async () => {
    /*
     * The bug: `BackdropStyleRow` was mounted only in the studio's DRAWN branch, while
     * `avatarPreviewLayers` has always painted a sunburst behind a photo sprite. So a participant
     * who chose a spiral as a drawn character and then put a photograph on kept WEARING the
     * spiral with no control left to change or remove it. The backdrop's style belongs to a photo
     * for exactly the reason ADR-054 already gives for its colour.
     */
    const sprite = formatAvatarSprite({
      size: 128,
      palette: ['#223344', '#1d5b8c'],
      rows: Array.from({ length: 128 }, () => '0'.repeat(128)),
    });
    const worn = {
      ...participantFixture,
      avatarPhotoId: 'a'.repeat(16),
      // Already wearing the spiral, chosen back when this participant was a drawn character.
      // Deliberately the UNTAGGED pre-ADR-205 form: this is a code out of the database, and
      // the studio has to open on the spiral its owner actually chose, not fall back to plain.
      avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c-b8770a-20-0',
    };
    render(
      <SpriteProvider>
        <ProfilePage />
      </SpriteProvider>,
      {
        'GET /api/me': { body: { participant: worn, totals } },
        'GET /api/teams/mine': { body: { team: null } },
        'GET /api/avatars': { body: { items: [{ id: 'a'.repeat(16), sprite }] } },
        'PUT /api/me/avatar': { body: { participant: worn } },
      },
    );
    const user = userEvent.setup();
    await waitFor(() => expect(stub.callsTo('GET /api/avatars').length).toBeGreaterThan(0));
    await user.click(await screen.findByTestId('profile__look-edit'));

    // The studio is in its photo state, and the spiral is on the face already.
    await waitFor(() => expect(screen.getByTestId('avatar-studio__photo-clear')).toBeVisible());
    expect(screen.getByTestId('avatar-studio__preview')).toHaveAttribute('data-sunburst', 'on');

    // The control is reachable without expanding anything — the photo branch has no toggle —
    // and it opens showing what is actually worn rather than a default.
    const spiral = screen.getByTestId('avatar-studio__backdrop-spiral');
    expect(spiral).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('avatar-studio__sunburst-rays')).toHaveValue('20');

    // And it can be taken off, which is the thing that was impossible.
    await user.click(spiral);
    expect(screen.getByTestId('avatar-studio__preview')).toHaveAttribute('data-sunburst', 'off');

    await user.click(screen.getByTestId('profile__look-save'));
    await waitFor(() => expect(stub.callsTo('PUT /api/me/avatar')).toHaveLength(1));
    expect(stub.callsTo('PUT /api/me/avatar')[0]?.body).toMatchObject({
      avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c',
    });
  });

  it('keeps the old face when the save is refused, and can be abandoned', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
      'GET /api/teams/mine': { body: { team: null } },
      'PUT /api/me/avatar': {
        status: 400,
        body: { error: { message: messages.avatarLookInvalid } },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('profile__look-edit'));
    await user.click(screen.getByTestId('profile__look-save'));
    expect(await screen.findByTestId('profile__look-error')).toHaveTextContent(
      messages.avatarLookInvalid,
    );

    await user.click(screen.getByTestId('profile__look-cancel'));
    expect(screen.queryByTestId('avatar-studio__preview')).toBeNull();
    expect(screen.getByTestId('profile__look-edit')).toBeVisible();
  });

  it('shows the loading copy until the card has data', async () => {
    render(<ProfilePage />, {
      'GET /api/me': { status: 401, body: { error: { message: messages.signInRequired } } },
      'GET /api/teams/mine': { body: { team: null } },
    });
    expect(await screen.findByText(messages.signInRequired)).toBeVisible();
  });
});

describe('S6 — my scan history (F7)', () => {
  it('lists each scan and strikes through the voided ones', async () => {
    render(<ScanHistoryPage />, {
      'GET /api/me/scans': {
        body: {
          items: [scanFixture, { ...scanFixture, id: 'scan-2', isVoided: true }],
          totals,
        },
      },
    });
    const rows = await screen.findAllByTestId('scan-history__row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1] as HTMLElement).getByText(/Beach Volleyball Rally/)).toHaveStyle({
      textDecoration: 'line-through',
    });
  });

  it('uses the FDS empty-state copy before the first scan', async () => {
    render(<ScanHistoryPage />, {
      'GET /api/me/scans': {
        body: { items: [], totals: { ...totals, fringePoints: 0, totalPoints: 0, scanCount: 0 } },
      },
    });
    expect(await screen.findByText(emptyStates.myScanHistory)).toBeVisible();
  });
});

describe('ADR-239 — the passport tab of Scan History', () => {
  const passportView = {
    stations: [
      { activityId: 'station-dash', activityName: 'Beach Dash', isCompleted: true, completions: 1 },
      { activityId: 'station-tug', activityName: 'Tug of Rope', isCompleted: false, completions: 0 },
    ],
  };

  it('lists every station, with a chop only on the one this participant has completed', async () => {
    render(<PassportPage />, { 'GET /api/me/passport': { body: passportView } });
    const rows = await screen.findAllByTestId('passport__station');
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByTestId('passport-chop__mark')).toBeVisible();
    expect(within(rows[1] as HTMLElement).queryByTestId('passport-chop__mark')).toBeNull();
    expect(within(rows[1] as HTMLElement).getByTestId('passport__pending')).toHaveTextContent(
      emptyStates.passportNotYet,
    );
  });

  /*
   * ADR-261 — three rounds at one station stack three chops over its slot, first strike
   * announced and the repeats decorative, where an untouched station keeps its open slot.
   */
  it('stacks one chop per completion on a station scored at in several rounds', async () => {
    const regular = {
      stations: [
        { activityId: 'station-dash', activityName: 'Beach Dash', isCompleted: true, completions: 3 },
        { activityId: 'station-tug', activityName: 'Tug of Rope', isCompleted: false, completions: 0 },
      ],
    };
    render(<PassportPage />, { 'GET /api/me/passport': { body: regular } });
    const rows = await screen.findAllByTestId('passport__station');
    const marks = within(rows[0] as HTMLElement).getAllByTestId('passport-chop__mark');
    expect(marks).toHaveLength(3);
    expect(marks[0]).toHaveAccessibleName('Completed');
    expect(marks[1]?.getAttribute('aria-hidden')).toBe('true');
    expect(within(rows[1] as HTMLElement).getByTestId('passport__pending')).toBeVisible();
  });

  /*
   * ADR-262 — five completions draw the capped three strikes and fold the other
   * two into a "+2 more" pill on the stack, never a fourth and fifth impression.
   */
  it('folds strikes past the cap into a "+N more" pill', async () => {
    const habitual = {
      stations: [
        { activityId: 'station-dash', activityName: 'Beach Dash', isCompleted: true, completions: 5 },
        { activityId: 'station-tug', activityName: 'Tug of Rope', isCompleted: false, completions: 0 },
      ],
    };
    render(<PassportPage />, { 'GET /api/me/passport': { body: habitual } });
    const rows = await screen.findAllByTestId('passport__station');
    expect(within(rows[0] as HTMLElement).getAllByTestId('passport-chop__mark')).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByTestId('passport__more')).toHaveTextContent('+2 more');
  });

  it('says how many stations are done, out of how many the day has', async () => {
    render(<PassportPage />, { 'GET /api/me/passport': { body: passportView } });
    expect(await screen.findByText('1 of 2 stations completed')).toBeVisible();
  });

  it('uses the spec copy for a day with no stations yet', async () => {
    render(<PassportPage />, { 'GET /api/me/passport': { body: { stations: [] } } });
    expect(await screen.findByText(emptyStates.passportStations)).toBeVisible();
  });

  it('offers the passport as the first tab beside the scans', async () => {
    render(<ScanHistoryPage />, {
      'GET /api/me/scans': { body: { items: [], totals } },
    });
    const links = await screen.findAllByTestId('scan-history-tabs__link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/me/scans/passport',
      '/me/scans',
    ]);
  });
});

describe('S3 — the badge (F25)', () => {
  it('tells the participant what to do when the QR will not scan (ADR-027)', async () => {
    render(<QrHomePage />, {
      'GET /api/me': { body: { participant: participantFixture, totals } },
    });
    const fallback = await screen.findByTestId('qr-home__fallback');
    // ADR-088 — the spoken fallback is the 4-digit scan number, not the nickname.
    expect(fallback).toHaveTextContent(
      `Give the facilitator your number: ${participantFixture.scanNumber}`,
    );
  });
});

describe('S60 — shared match feed (F51)', () => {
  it('shows completed results with the court and the winner', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': { body: { items: [completedMatchFixture] } },
    });
    const row = await screen.findByTestId('match-feed__row');
    expect(within(row).getByText(/Sandstorm beat Wave Riders/)).toBeVisible();
    expect(within(row).getByText(completedMatchFixture.courtLabel)).toBeVisible();
  });

  /*
   * ADR-156 — the feed's drawn row. A null winner meant "still playing" before ADR-152, and
   * a drawn match therefore appeared in the finished feed wearing the live wording.
   */
  it('says a finished match was drawn rather than showing it as a live fixture', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': {
        body: {
          items: [
            { ...completedMatchFixture, winnerTeamId: null, winnerTeamName: null, scoreB: 11 },
          ],
        },
      },
    });
    const row = await screen.findByTestId('match-feed__row');
    expect(within(row).getByText(/Sandstorm drew with Wave Riders/)).toBeVisible();
    expect(within(row).queryByText(/vs/)).toBeNull();
  });

  it('marks a voided result with its own chip and row state (ADR-109)', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': {
        body: { items: [{ ...completedMatchFixture, isVoided: true, completedAt: null }] },
      },
    });
    const row = await screen.findByTestId('match-feed__row');
    expect(within(row).getByTestId('match-feed__state')).toHaveTextContent('VOIDED');
    expect(within(row).getByTestId('match-feed__time')).toHaveTextContent('does not count');
    expect(row.className).toContain('gb-feed-row--voided');
  });

  it('shows only award lines in dumb mode — "Team XXX is awarded XXX points!" (ADR-321)', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': {
        body: {
          items: [],
          mode: 'dumb',
          awards: [
            { id: 'a1', teamName: 'Sandstorm', tierLabel: 'Gold', points: 10, awardedAt: '2026-09-18T01:00:00.000Z', isVoided: false },
            { id: 'a2', teamName: 'Wave Riders', tierLabel: 'Played', points: 2, awardedAt: '2026-09-18T01:05:00.000Z', isVoided: true },
          ],
        },
      },
    });
    const rows = await screen.findAllByTestId('match-feed__award-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Sandstorm is awarded 10 points!')).toBeVisible();
    expect(within(rows[1]!).getByText('Wave Riders is awarded 2 points!')).toBeVisible();
    expect(within(rows[1]!).getByTestId('match-feed__state')).toHaveTextContent('VOIDED');
    expect(screen.queryByTestId('match-feed__row')).toBeNull();
  });

  /*
   * ADR-341 (§7 option B) — a day that switched mid-way has both kinds of result, and neither is
   * allowed to erase the other: the awards lead, the matches played before the switch stay readable.
   */
  it('leads with the awards and keeps the matches played before the switch (ADR-341)', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': {
        body: {
          items: [completedMatchFixture],
          mode: 'mixed',
          awards: [
            {
              id: 'a1',
              teamName: 'Sandstorm',
              tierLabel: '30 pts',
              points: 30,
              awardedAt: '2026-09-18T01:00:00.000Z',
              isVoided: false,
            },
          ],
        },
      },
    });
    const award = await screen.findByTestId('match-feed__award-row');
    expect(within(award).getByText('Sandstorm is awarded 30 points!')).toBeVisible();
    const earlier = screen.getByTestId('match-feed__earlier');
    // The recorded divider (ADR-336 §8) — the sentence that says the day changed shape.
    expect(within(earlier).getByTestId('match-feed__switch-divider')).toHaveTextContent(
      'Tournament switched to points award mode',
    );
    expect(within(earlier).getByTestId('match-feed__earlier-heading')).toHaveTextContent(
      'Earlier: match results',
    );
    expect(within(earlier).getByTestId('match-feed__row')).toBeVisible();
    // Awards come first on the page, which is the order the room reads it in.
    expect(award.compareDocumentPosition(earlier) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says a match is still on court rather than calling it an earlier result (ADR-341)', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': {
        body: {
          items: [
            {
              ...completedMatchFixture,
              id: 'live-1',
              status: 'in_progress',
              winnerTeamName: null,
              completedAt: null,
            },
          ],
          mode: 'mixed',
          awards: [],
        },
      },
    });
    const earlier = await screen.findByTestId('match-feed__earlier');
    expect(within(earlier).getByTestId('match-feed__switch-divider')).toHaveTextContent(
      'Tournament switched to points award mode',
    );
    expect(within(earlier).getByTestId('match-feed__earlier-heading')).toHaveTextContent('Matches today');
    expect(within(earlier).getByTestId('match-feed__state')).toHaveTextContent('LIVE');
    // No awards yet still says so, rather than leaving a bare panel above the matches.
    expect(screen.getByTestId('match-feed__empty')).toHaveTextContent('No awards yet');
  });

  it('tells participants awards will appear as courts hand them out, before any exist (ADR-321)', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': { body: { items: [], mode: 'dumb', awards: [] } },
    });
    expect(await screen.findByTestId('match-feed__empty')).toHaveTextContent('No awards yet');
  });

  /* ADR-114 — the score belongs to the people watching from the sideline, not just the marshal. */
  it('shows the running score on a live match, so the sideline can follow it', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': {
        body: {
          items: [
            {
              ...completedMatchFixture,
              id: 'live-1',
              status: 'in_progress',
              winnerTeamName: null,
              completedAt: null,
              scoreA: 7,
              scoreB: 5,
            },
          ],
        },
      },
    });
    const row = await screen.findByTestId('match-feed__row');
    expect(within(row).getByTestId('match-feed__score')).toHaveTextContent('7 - 5');
  });

  it('keeps the score on a finished match, because that is the result', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': {
        body: { items: [{ ...completedMatchFixture, scoreA: 11, scoreB: 9 }] },
      },
    });
    const row = await screen.findByTestId('match-feed__row');
    expect(within(row).getByTestId('match-feed__state')).toHaveTextContent('ENDED');
    expect(within(row).getByTestId('match-feed__score')).toHaveTextContent('11 - 9');
  });

  it('prints no score for a finished match nobody scored, rather than a 0 - 0 that never happened', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': {
        body: { items: [{ ...completedMatchFixture, scoreA: 0, scoreB: 0 }] },
      },
    });
    const row = await screen.findByTestId('match-feed__row');
    expect(within(row).queryByTestId('match-feed__score')).toBeNull();
    // The winner is still named, because a walkover still has one.
    expect(within(row).getByTestId('match-feed__state')).toHaveTextContent('ENDED');
  });

  it('leads with a LIVE chip and the start time while a match is being played (ADR-109)', async () => {
    render(<MatchFeedPage />, {
      'GET /api/tournament/matches/feed': {
        body: {
          items: [
            { ...completedMatchFixture, id: 'live-1', status: 'in_progress', winnerTeamName: null, completedAt: null },
            completedMatchFixture,
          ],
        },
      },
    });
    const rows = await screen.findAllByTestId('match-feed__row');
    // The live match leads, wears the LED-red chip, and says when it started.
    expect(within(rows[0] as HTMLElement).getByTestId('match-feed__state')).toHaveTextContent('LIVE');
    expect(within(rows[0] as HTMLElement).getByTestId('match-feed__time')).toHaveTextContent(/^Started /);
    expect((rows[0] as HTMLElement).className).toContain('gb-feed-row--live');
    // ADR-114 — the finished one reads ENDED, which cannot be mistaken for the final.
    expect(within(rows[1] as HTMLElement).getByTestId('match-feed__state')).toHaveTextContent('ENDED');
    expect((rows[1] as HTMLElement).className).toContain('gb-feed-row--ended');
  });

  it('uses the FDS empty-state copy before the first match', async () => {
    render(<MatchFeedPage />, { 'GET /api/tournament/matches/feed': { body: { items: [] } } });
    expect(await screen.findByText(emptyStates.matchFeed)).toBeVisible();
  });
});

describe('S5 — cluster leaderboard (F8/F9)', () => {
  const standing = {
    reachedAt: '2026-09-29T03:00:00.000Z',
    clusterCode: 'BP',
    displayName: 'BP',
    rank: 1,
    totalPoints: 120,
    fringePoints: 90,
    tournamentPoints: 30,
    participantCount: 12,
  };
  const individual = {
    reachedAt: '2026-09-29T03:00:00.000Z',
    participantId: participantFixture.id,
    nickname: participantFixture.nickname,
    clusterCode: 'BP',
    gender: 'female',
    avatarVariant: 3,
    rank: 1,
    totalPoints: 55,
  };

  it('ranks the clusters, flags the viewer and lists the top trainers', async () => {
    render(<LeaderboardPage />, {
      'GET /api/leaderboard': {
        body: {
          clusters: [standing, { ...standing, clusterCode: 'CS', displayName: 'CS', rank: 2, totalPoints: 60 }],
          topIndividuals: [individual],
          generatedAt: '2026-09-29T03:00:00.000Z',
        },
      },
    });
    const rows = await screen.findAllByTestId('leaderboard__row');
    expect(rows).toHaveLength(2);
    // The "you" pill is its own element with the spacing modifier — pushed up against the
    // cluster name it read as part of the word.
    const pill = within(rows[0] as HTMLElement).getByText('you');
    expect(pill).toHaveClass('gb-badge--you');
    expect(screen.getAllByTestId('leaderboard__individual')).toHaveLength(1);
  });

  it('says who got to a shared score first (ADR-029)', async () => {
    const earlier = { ...standing, reachedAt: '2026-09-29T03:10:00.000Z' };
    const later = {
      ...standing, clusterCode: 'CS', displayName: 'CS', rank: 2,
      reachedAt: '2026-09-29T03:40:00.000Z',
    };
    const behind = {
      ...standing, clusterCode: 'WD', displayName: 'WD', rank: 3, totalPoints: 60,
      reachedAt: '2026-09-29T03:20:00.000Z',
    };
    render(<LeaderboardPage />, {
      'GET /api/leaderboard': {
        body: {
          clusters: [earlier, later, behind],
          topIndividuals: [individual],
          generatedAt: '2026-09-29T04:00:00.000Z',
        },
      },
    });
    const rows = await screen.findAllByTestId('leaderboard__row');

    // Level on 120 points: BP is ahead because BP got there first, and the board says so
    // rather than looking mis-ranked.
    expect(within(rows[0] as HTMLElement).getByTestId('leaderboard__tie-note'))
      .toHaveTextContent('first to 120');
    expect(within(rows[1] as HTMLElement).queryByTestId('leaderboard__tie-note')).toBeNull();
    // A cluster that shares its score with nobody says nothing.
    expect(within(rows[2] as HTMLElement).queryByTestId('leaderboard__tie-note')).toBeNull();
  });

  it('does not call a shared zero a tie (ADR-029)', async () => {
    const zeroed = { ...standing, totalPoints: 0, fringePoints: 0, tournamentPoints: 0, reachedAt: null };
    render(<LeaderboardPage />, {
      'GET /api/leaderboard': {
        body: {
          clusters: [
            { ...standing, totalPoints: 5, fringePoints: 5, tournamentPoints: 0 },
            zeroed,
            { ...zeroed, clusterCode: 'CS', displayName: 'CS', rank: 3 },
          ],
          topIndividuals: [],
          generatedAt: '2026-09-29T04:00:00.000Z',
        },
      },
    });
    const rows = await screen.findAllByTestId('leaderboard__row');
    expect(screen.queryAllByTestId('leaderboard__tie-note')).toHaveLength(0);
    expect(rows).toHaveLength(3);
  });

  it('labels each row so a refresh can move it instead of rebuilding it (ADR-024)', async () => {
    render(<LeaderboardPage />, {
      'GET /api/leaderboard': {
        body: {
          clusters: [standing, { ...standing, clusterCode: 'CS', displayName: 'CS', rank: 2, totalPoints: 60 }],
          topIndividuals: [individual],
          generatedAt: '2026-09-29T03:00:00.000Z',
        },
      },
    });
    const rows = await screen.findAllByTestId('leaderboard__row');

    expect(rows.map((row) => row.dataset['liveKey'])).toEqual(['BP', 'CS']);
    expect(rows.map((row) => row.dataset['liveSignature'])).toEqual(['120', '60']);
    const [top] = screen.getAllByTestId('leaderboard__individual');
    expect(top?.dataset['liveKey']).toBe(individual.participantId);
  });

  it('shows the empty-state copy while every cluster is on zero', async () => {
    render(<LeaderboardPage />, {
      'GET /api/leaderboard': {
        body: {
          clusters: [{ ...standing, totalPoints: 0, fringePoints: 0, tournamentPoints: 0 }],
          topIndividuals: [],
          generatedAt: '2026-09-29T03:00:00.000Z',
        },
      },
    });
    expect(await screen.findByText(emptyStates.clusterLeaderboard)).toBeVisible();
  });
});

describe('S7–S9 — creating, joining and browsing teams (F6/F8/F9)', () => {
  const browseBody = {
    items: [
      { id: 'team-b', teamName: 'Wave Riders', captainNickname: 'SandSprinter', memberCount: 3, isLocked: false },
      { id: 'team-c', teamName: 'Locked Out', captainNickname: 'Kai', memberCount: 4, isLocked: true },
    ],
  };

  it('never flashes the create-team panels at a player already on a team (ADR-099)', async () => {
    render(<TeamsPage />, {
      'GET /api/teams/mine': { body: { team: teamFixture }, delayMs: 20 },
      'GET /api/teams': { body: browseBody },
    });

    // While /mine is in flight the page says it is loading — it does NOT guess "no team"
    // and paint the create/join panels for them to flash away a beat later.
    expect(screen.getByTestId('teams__loading')).toBeVisible();
    expect(screen.queryByTestId('teams__create-form')).toBeNull();

    // The answer lands: the page redirects to /team (ADR-103) with no create-form detour.
    await waitFor(() => expect(screen.queryByTestId('teams__loading')).toBeNull());
    expect(screen.queryByTestId('teams__create-form')).toBeNull();
  });

  it('creates a team from the name field', async () => {
    render(<TeamsPage />, {
      'GET /api/teams/mine': { body: { team: null } },
      'GET /api/teams': { body: browseBody },
      'POST /api/teams': { status: 201, body: { team: teamFixture } },
    });
    await screen.findByTestId('teams__create-name');
    const user = userEvent.setup();
    await user.type(screen.getByTestId('teams__create-name'), 'Sandstorm');
    await user.click(screen.getByTestId('teams__create-submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/teams')).toHaveLength(1));
    expect(stub.callsTo('POST /api/teams')[0]?.body).toEqual({ teamName: 'Sandstorm' });
  });

  it('reports a duplicate team name inline', async () => {
    render(<TeamsPage />, {
      'GET /api/teams/mine': { body: { team: null } },
      'GET /api/teams': { body: browseBody },
      'POST /api/teams': {
        status: 409,
        body: { error: { message: messages.teamNameInvalid, field: 'teamName' } },
      },
    });
    await screen.findByTestId('teams__create-name');
    const user = userEvent.setup();
    await user.type(screen.getByTestId('teams__create-name'), 'Sandstorm');
    await user.click(screen.getByTestId('teams__create-submit'));
    expect(await screen.findByTestId('teams__create-error')).toHaveTextContent(
      messages.teamNameInvalid,
    );
  });

  it('joins with a code and reports an unknown one', async () => {
    render(<TeamsPage />, {
      'GET /api/teams/mine': { body: { team: null } },
      'GET /api/teams': { body: browseBody },
      'POST /api/teams/join': {
        status: 404,
        body: { error: { message: messages.teamNotFound } },
      },
    });
    await screen.findByTestId('teams__join-code');
    const user = userEvent.setup();
    await user.type(screen.getByTestId('teams__join-code'), 'ABC234');
    await user.click(screen.getByTestId('teams__join-submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/teams/join')).toHaveLength(1));
    expect(stub.callsTo('POST /api/teams/join')[0]?.body).toEqual({ joinCode: 'ABC234' });
    expect(await screen.findByTestId('teams__join-error')).toHaveTextContent(messages.teamNotFound);
  });

  /**
   * ADR-085 — Enter in a single-field panel does what its button does. These are real forms now, so
   * the platform supplies the behaviour; what is worth pinning is that the wiring exists at all.
   */
  it('joins on Enter in the code field, without reaching for the button', async () => {
    render(<TeamsPage />, {
      'GET /api/teams/mine': { body: { team: null } },
      'GET /api/teams': { body: browseBody },
      'POST /api/teams/join': { body: { team: teamFixture } },
    });
    await screen.findByTestId('teams__join-code');
    const user = userEvent.setup();

    await user.type(screen.getByTestId('teams__join-code'), 'ABC234{Enter}');

    await waitFor(() => expect(stub.callsTo('POST /api/teams/join')).toHaveLength(1));
    expect(stub.callsTo('POST /api/teams/join')[0]?.body).toEqual({ joinCode: 'ABC234' });
  });

  it('creates the team on Enter in the name field', async () => {
    render(<TeamsPage />, {
      'GET /api/teams/mine': { body: { team: null } },
      'GET /api/teams': { body: browseBody },
      'POST /api/teams': { status: 201, body: { team: teamFixture } },
    });
    await screen.findByTestId('teams__create-name');
    const user = userEvent.setup();

    await user.type(screen.getByTestId('teams__create-name'), 'Sandy Spikers{Enter}');

    await waitFor(() => expect(stub.callsTo('POST /api/teams')).toHaveLength(1));
  });

  it('browses open teams, hides Join on a locked one and filters by search', async () => {
    render(<TeamsPage />, {
      'GET /api/teams/mine': { body: { team: null } },
      'GET /api/teams': { body: browseBody },
      'POST /api/teams/team-b/join': { body: { team: teamFixture } },
    });
    const rows = await screen.findAllByTestId('team-browse__row');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId('team-browse__join')).toHaveLength(1);

    const user = userEvent.setup();
    await user.type(screen.getByTestId('teams__search'), 'Locked');
    await waitFor(() => expect(screen.getAllByTestId('team-browse__row')).toHaveLength(1));
  });

  it('joins an open team straight from the browse list', async () => {
    render(<TeamsPage />, {
      'GET /api/teams/mine': { body: { team: null } },
      'GET /api/teams': { body: browseBody },
      'POST /api/teams/team-b/join': { body: { team: teamFixture } },
    });
    await screen.findAllByTestId('team-browse__row');
    await userEvent.setup().click(screen.getByTestId('team-browse__join'));
    await waitFor(() => expect(stub.callsTo('POST /api/teams/team-b/join')).toHaveLength(1));
  });

  it('redirects a player who already has a team straight to the team page (ADR-103)', async () => {
    render(<TeamsPage />, {
      'GET /api/teams/mine': { body: { team: teamFixture } },
      'GET /api/teams': { body: browseBody },
    });
    // No interstitial, no extra tap: the page navigates away, leaving nothing of itself.
    await waitFor(() => expect(screen.queryByTestId('teams__loading')).toBeNull());
    expect(screen.queryByTestId('teams__create-form')).toBeNull();
    expect(screen.queryByText("You're on a team")).toBeNull();
  });

  it('shows the browse empty state when nobody has made a team yet', async () => {
    render(<TeamsPage />, {
      'GET /api/teams/mine': { body: { team: null } },
      'GET /api/teams': { body: { items: [] } },
    });
    expect(await screen.findByText(emptyStates.browseTeams)).toBeVisible();
  });
});

describe('S11–S17 — my team (F10–F17)', () => {
  const matches = { items: [completedMatchFixture] };

  function myTeamRoutes(team: unknown, extra: RouteTable = {}): RouteTable {
    return {
      'GET /api/teams/mine': { body: { team } },
      'GET /api/teams/team-a': { body: { team } },
      'GET /api/teams/team-a/matches': { body: matches },
      ...extra,
    };
  }

  it('shows the roster, the join code and the win/loss record to the captain', async () => {
    render(<MyTeamPage />, myTeamRoutes(teamFixture));
    expect(await screen.findByTestId('my-team__join-code')).toHaveTextContent('ABC234');
    expect(screen.getAllByTestId('my-team__member')).toHaveLength(2);
    // ADR-259 — the cluster is plain text right of the nickname, not a pill.
    const nameSpan = screen.getAllByTestId('my-team__member')[1]?.querySelector('strong')?.parentElement;
    expect(nameSpan?.querySelector('strong')).toHaveTextContent('SandSprinter');
    expect(nameSpan?.querySelector('.gb-hint')).toHaveTextContent('CS');
    expect(await screen.findByText('1W · 0L')).toBeVisible();
    expect(screen.getAllByTestId('my-team__match')).toHaveLength(1);
  });

  // ADR-156 — the D joins the badge only when the team has one, and the drawn game is not
  // allowed to show up as a defeat on the way.
  it('puts a drawn match in the record as a D rather than an L', async () => {
    const drawn = { ...completedMatchFixture, winnerTeamId: null, winnerTeamName: null };
    render(
      <MyTeamPage />,
      myTeamRoutes(teamFixture, {
        'GET /api/teams/team-a/matches': {
          body: { items: [completedMatchFixture, { ...drawn, id: 'match-drawn' }] },
        },
      }),
    );
    expect(await screen.findByText('1W · 1D · 0L')).toBeVisible();
  });

  it('never asks for /api/teams// while the id is unknown — no "Team not found." over real matches (ADR-104)', async () => {
    render(
      <MyTeamPage />,
      myTeamRoutes(teamFixture, {
        // /mine answers late: the detail hook is mounted with an empty id for a while.
        'GET /api/teams/mine': { body: { team: teamFixture }, delayMs: 20 },
      }),
    );
    expect(await screen.findByText('1W · 0L')).toBeVisible();
    expect(screen.getAllByTestId('my-team__match')).toHaveLength(1);

    // The bug: GET /api/teams//matches 404'd and its stale rejection could land after the
    // real answer, pinning "Team not found." above a perfectly good match list.
    expect(screen.queryByText(messages.teamNotFound)).toBeNull();
    expect(stub.calls.some((call) => call.path.includes('//'))).toBe(false);
  });

  it('adds a member by nickname and clears the field afterwards', async () => {
    render(
      <MyTeamPage />,
      myTeamRoutes(teamFixture, {
        'POST /api/teams/team-a/members': { status: 201, body: { team: teamFixture } },
      }),
    );
    const field = await screen.findByTestId('my-team__add-nickname');
    const user = userEvent.setup();
    await user.type(field, 'DuneRunner');
    await user.click(screen.getByTestId('my-team__add-submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/teams/team-a/members')).toHaveLength(1));
    expect(stub.callsTo('POST /api/teams/team-a/members')[0]?.body).toEqual({
      nickname: 'DuneRunner',
    });
    await waitFor(() => expect(field).toHaveValue(''));
  });

  it('surfaces a rejected add without blanking the roster', async () => {
    render(
      <MyTeamPage />,
      myTeamRoutes(teamFixture, {
        'POST /api/teams/team-a/members': {
          status: 404,
          body: { error: { message: messages.participantNotFound } },
        },
      }),
    );
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('my-team__add-nickname'), 'Ghost');
    await user.click(screen.getByTestId('my-team__add-submit'));
    expect(await screen.findByTestId('my-team__error')).toHaveTextContent(
      messages.participantNotFound,
    );
    expect(screen.getAllByTestId('my-team__member')).toHaveLength(2);
  });

  it('kicks, promotes, locks and leaves through the captain tools', async () => {
    const other = teamFixture.members[1];
    render(
      <MyTeamPage />,
      myTeamRoutes(teamFixture, {
        'DELETE /api/teams/team-a/members/:participantId': { body: { team: teamFixture } },
        'POST /api/teams/team-a/captain': { body: { team: teamFixture } },
        'PATCH /api/teams/team-a/lock': { body: { team: { ...teamFixture, isLocked: true } } },
        'POST /api/teams/team-a/leave': { body: { outcome: 'left' } },
      }),
    );
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('my-team__member-menu'));
    await user.click(await screen.findByTestId('my-team__kick'));
    // ADR-027 — removing somebody from the squad asks first.
    expect(screen.getByTestId('confirm-dialog__title')).toHaveTextContent('Remove');
    await confirmDialog(user);
    await waitFor(() =>
      expect(stub.calls.some((call) => call.method === 'DELETE')).toBe(true),
    );

    await user.click(screen.getByTestId('my-team__member-menu'));
    await user.click(screen.getByTestId('my-team__promote'));
    await confirmDialog(user);
    await waitFor(() => expect(stub.callsTo('POST /api/teams/team-a/captain')).toHaveLength(1));
    expect(stub.callsTo('POST /api/teams/team-a/captain')[0]?.body).toEqual({
      participantId: other?.participantId,
    });

    await user.click(screen.getByTestId('my-team__lock'));
    await confirmDialog(user);
    await waitFor(() => expect(stub.callsTo('PATCH /api/teams/team-a/lock')).toHaveLength(1));
    expect(stub.callsTo('PATCH /api/teams/team-a/lock')[0]?.body).toEqual({ isLocked: true });

    await user.click(screen.getByTestId('my-team__leave'));
    await confirmDialog(user);
    await waitFor(() => expect(stub.callsTo('POST /api/teams/team-a/leave')).toHaveLength(1));
  });

  it('offers to unlock a locked team and hides captain-only tools from members', async () => {
    const locked = { ...teamFixture, isLocked: true, viewerIsCaptain: false, joinCode: null };
    render(
      <MyTeamPage />,
      myTeamRoutes(locked, {
        'PATCH /api/teams/team-a/lock': { body: { team: { ...locked, isLocked: false } } },
      }),
    );
    expect(await screen.findByText('Locked — no new members.')).toBeVisible();
    expect(screen.queryByTestId('my-team__add-nickname')).toBeNull();
    expect(screen.queryByTestId('my-team__join-code')).toBeNull();
    expect(screen.queryByTestId('my-team__lock')).toBeNull();
  });

  it('unlocks the roster again and strikes through a voided result (F14)', async () => {
    const locked = { ...teamFixture, isLocked: true };
    render(
      <MyTeamPage />,
      myTeamRoutes(locked, {
        'GET /api/teams/team-a/matches': {
          body: { items: [{ ...completedMatchFixture, isVoided: true }] },
        },
        'PATCH /api/teams/team-a/lock': { body: { team: teamFixture } },
      }),
    );
    const unlock = await screen.findByTestId('my-team__lock');
    expect(unlock).toHaveTextContent(/unlock/i);
    const match = await screen.findByTestId('my-team__match');
    expect(within(match).getByText(/beat/)).toHaveStyle({ textDecoration: 'line-through' });

    const unlocker = userEvent.setup();
    await unlocker.click(unlock);
    await confirmDialog(unlocker);
    await waitFor(() => expect(stub.callsTo('PATCH /api/teams/team-a/lock')).toHaveLength(1));
    expect(stub.callsTo('PATCH /api/teams/team-a/lock')[0]?.body).toEqual({ isLocked: false });
  });

  it('invites a teamless player to find a team', async () => {
    render(<MyTeamPage />, {
      'GET /api/teams/mine': { body: { team: null } },
      'GET /api/teams/': { body: { team: null } },
    });
    expect(await screen.findByTestId('my-team__find')).toHaveAttribute('href', '/teams');
  });
});

describe('S10 — public team detail (F17)', () => {
  it('shows the roster and match history of any team', async () => {
    render(
      <TeamDetailPage />,
      {
        'GET /api/teams/team-a': { body: { team: { ...teamFixture, joinCode: null } } },
        'GET /api/teams/team-a/matches': { body: { items: [completedMatchFixture] } },
      },
      '/teams/team-a',
    );
    expect(await screen.findByRole('heading', { name: 'Sandstorm' })).toBeVisible();
    expect(screen.getAllByTestId('team-detail__member')).toHaveLength(2);
    expect(screen.getAllByTestId('team-detail__match')).toHaveLength(1);
  });

  it('marks a locked team and strikes through a voided result', async () => {
    render(
      <TeamDetailPage />,
      {
        'GET /api/teams/team-a': {
          body: { team: { ...teamFixture, isLocked: true, joinCode: null } },
        },
        'GET /api/teams/team-a/matches': {
          body: { items: [{ ...completedMatchFixture, isVoided: true }] },
        },
      },
      '/teams/team-a',
    );
    expect(await screen.findByText(/· locked/)).toBeVisible();
    const match = await screen.findByTestId('team-detail__match');
    expect(within(match).getByText(/beat/)).toHaveStyle({ textDecoration: 'line-through' });
  });

  it('reports a team that does not exist', async () => {
    render(
      <TeamDetailPage />,
      {
        'GET /api/teams/nope': { status: 404, body: { error: { message: messages.teamNotFound } } },
        'GET /api/teams/nope/matches': { body: { items: [] } },
      },
      '/teams/nope',
    );
    expect(await screen.findByText(messages.teamNotFound)).toBeVisible();
  });
});
