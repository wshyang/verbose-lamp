import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { avatarSpriteId, messages, type Gender, type PassportProgressView } from '@psd/contracts';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { AvatarStudio, type AvatarDraft } from '../components/participant/AvatarStudio.js';
import { PixelMotif } from '../components/participant/PixelMotif.js';
import { Avatar } from '../components/participant/Avatar.js';
import { useSprite, useSpriteForget } from '../components/participant/SpriteProvider.js';
import { formatPoints } from '../lib/format.js';
import { useAvatarSave, useProfile } from '../lib/hooks/useParticipantHome.js';
import { useMyTeam } from '../lib/hooks/useTeams.js';
import { useSession } from '../lib/session/context.js';

/** S4 — profile: identity, point breakdown, team, sign out. */

/**
 * ADR-059 — resolve the draft's photo against the one actually worn.
 *
 * `avatarPhoto` is deliberately three-valued: `undefined` means "whatever is worn", a string means a
 * photo the participant just chose, and `null` means they took it off. Resolving on every render
 * rather than snapshotting when the edit button is pressed is what makes it correct — the sprite
 * BODY arrives asynchronously, since the profile row carries only `avatarPhotoId` (ADR-035), so a
 * snapshot taken before it landed would seed the studio with no photo and then save that, quietly
 * discarding the participant's photograph.
 */
function withWornPhoto(draft: AvatarDraft, worn: string | null): AvatarDraft {
  return { ...draft, avatarPhoto: draft.avatarPhoto === undefined ? worn : draft.avatarPhoto };
}

interface LookSave {
  error: string | null;
  isPending: boolean;
  /** Resolves to the saved participant, or to null when the save failed. */
  run: (draft: AvatarDraft) => Promise<unknown>;
}

/**
 * ADR-059 — the studio, plus the sprite lookup that has to happen *here*.
 *
 * This is its own component for a reason that is easy to get wrong: `SpriteProvider` is mounted
 * inside `GameboyShell`, which `ProfilePage` RENDERS — so a `useSprite` call in `ProfilePage`'s own
 * body sits above the provider and reads no context at all. It does not complain; it returns null,
 * which is indistinguishable from "this participant has no photo". That is exactly how the first
 * attempt at this fix passed its unit test and still showed the drawn character in the real app.
 * A component rendered *inside* the shell is the only place the lookup can succeed.
 */
function LookEditor(props: {
  person: { gender: Gender; avatarPhotoId?: string | null };
  draft: AvatarDraft;
  save: LookSave;
  onChange: (next: AvatarDraft) => void;
  onCancel: () => void;
}) {
  const worn = useSprite(props.person.avatarPhotoId ?? null);
  const editing = withWornPhoto(props.draft, worn);
  const { save } = props;
  const forgetSprite = useSpriteForget();

  /*
   * ADR-228 — a photo this save takes off, or replaces, is forgotten on this phone once the server has
   * accepted the save. A save that fails keeps the face: the server still has it, and so does the phone.
   */
  const saveLook = async () => {
    const previous = props.person.avatarPhotoId ?? null;
    const next = editing.avatarPhoto ? avatarSpriteId(editing.avatarPhoto) : null;
    const saved = await save.run(editing);
    if (saved !== null && previous !== null && previous !== next) forgetSprite(previous);
  };

  return (
    <>
      <AvatarStudio
        startExpanded
        gender={props.person.gender}
        personaTestId="profile__persona"
        draft={editing}
        onChange={props.onChange}
      />
      {save.error ? (
        <span className="gb-inline-error" role="alert" data-testid="profile__look-error">
          {save.error}
        </span>
      ) : null}
      <div className="gb-row">
        <button
          type="button"
          className="gb-button gb-button--small"
          data-testid="profile__look-save"
          disabled={save.isPending}
          onClick={() => void saveLook()}
        >
          Save look
        </button>
        <button
          type="button"
          className="gb-button gb-button--small gb-button--secondary"
          data-testid="profile__look-cancel"
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

export function ProfilePage() {
  const profile = useProfile();
  const myTeam = useMyTeam();
  const navigate = useNavigate();
  const { endSession } = useSession();
  const [draft, setDraft] = useState<AvatarDraft | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const save = useAvatarSave(() => {
    setDraft(null);
    setIsSaved(true);
    profile.reload();
  });


  const participant = profile.participant;
  const totals = profile.totals;
  const teamName = myTeam.team?.teamName ?? null;

  const signOutNow = async () => {
    setSignOutFailed(false);
    /*
     * Only leave the page when the server actually ended the session. Navigating on a failed
     * sign-out was the bug: the HttpOnly cookie survives, so the destination simply
     * re-authenticates and the participant is back where they started, with no explanation.
     */
    if (!(await endSession())) {
      setSignOutFailed(true);
      return;
    }
    navigate('/', { replace: true });
  };

  if (!participant || !totals) {
    return (
      <GameboyShell title="PLAYER CARD">
        <p className="loading">{profile.error ?? 'Loading…'}</p>
      </GameboyShell>
    );
  }

  return (
    <GameboyShell title={`${participant.title.toUpperCase()} CARD`} subtitle={participant.nickname}>
      <section className="gb-panel">
        <div className="gb-row">
          <Avatar person={participant} size={128} />
          <div>
            <h2 style={{ margin: 0 }}>{participant.nickname}</h2>
            <span className="gb-badge">{participant.clusterCode}</span>
            {/* ADR-088 — labelled "number", never anything PIN-shaped: this one is public. */}
            <p className="gb-hint" style={{ marginTop: 8 }} data-testid="profile__scan-number">
              Scan number: <strong>{participant.scanNumber}</strong>
            </p>
          </div>
        </div>
        {draft ? (
          <LookEditor
            person={participant}
            draft={draft}
            save={save}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
          />
        ) : (
          <button
            type="button"
            className="gb-button gb-button--small"
            data-testid="profile__look-edit"
            onClick={() => {
              setIsSaved(false);
              // ADR-059 — no photo here on purpose: `undefined` means "whatever is worn", and
              // `LookEditor` resolves it against the real sprite. See `withWornPhoto`.
              setDraft({
                avatarVariant: participant.avatarVariant,
                avatarLook: participant.avatarLook,
              });
            }}
          >
            Change my look
          </button>
        )}
        {isSaved ? (
          <p className="gb-hint" data-testid="profile__look-saved">
            {messages.avatarSaved}
          </p>
        ) : null}
      </section>

      <section className="gb-panel">
        <h2>
          <PixelMotif name="coin" size={20} className="" />
          Points
        </h2>
        <ul className="gb-list">
          <li className="gb-row gb-row--between">
            <span>Fringe</span>
            <strong>{formatPoints(totals.fringePoints)}</strong>
          </li>
          <li className="gb-row gb-row--between">
            <span>Tournament</span>
            <strong>{formatPoints(totals.tournamentPoints)}</strong>
          </li>
          <li className="gb-row gb-row--between">
            <span>Total</span>
            <strong className="gb-points">{formatPoints(totals.totalPoints)}</strong>
          </li>
          <li className="gb-row gb-row--between">
            {/*
              ADR-176 — this said "Stations visited" and showed scanCount, which is the count
              of SCANS. Two rounds at one station made it read 2, and now that the passport
              turns on the difference it had to stop lying.
            */}
            <span>Stamps collected</span>
            <strong>{totals.scanCount}</strong>
          </li>
        </ul>
        <PassportProgress passport={totals.passport} />
        <Link className="gb-button gb-button--secondary" to="/me/scans/passport" data-testid="profile__passport-link">
          See my passport
        </Link>
      </section>

      <section className="gb-panel">
        <h2>
          <PixelMotif name="flag" size={20} className="" />
          Team
        </h2>
        <TeamSection isLoading={myTeam.isLoading} teamName={teamName} />
      </section>

      <section className="gb-panel">
        <button
          type="button"
          className="gb-button gb-button--danger"
          data-testid="profile__signout"
          onClick={() => void signOutNow()}
        >
          Sign out
        </button>
        {signOutFailed ? (
          <p className="gb-error" data-testid="profile__signout-failed">
            Could not sign out — you are still signed in on this phone. Check your connection and
            try again.
          </p>
        ) : null}
      </section>
    </GameboyShell>
  );
}

/**
 * ADR-099 — the team row has three states, not two: unknown yet, on a team, not on one.
 * "You are not on a team yet" is a claim, and it must wait for /api/teams/mine to answer
 * rather than flash while the request is in flight.
 */
function TeamSection(props: { isLoading: boolean; teamName: string | null }) {
  if (props.isLoading) {
    return (
      <p className="loading" data-testid="profile__team-loading">
        Loading…
      </p>
    );
  }
  if (props.teamName) {
    return (
      <>
        <p>
          You play for <strong>{props.teamName}</strong>.
        </p>
        <Link className="gb-button gb-button--secondary" to="/team" data-testid="profile__team">
          Manage my team
        </Link>
      </>
    );
  }
  return (
    <>
      <p>You are not on a team yet.</p>
      <Link className="gb-button gb-button--secondary" to="/teams" data-testid="profile__find-team">
        Find a team
      </Link>
    </>
  );
}

/**
 * ADR-176 — the passport card.
 *
 * Renders nothing at all when the day is not running a passport (bonus 0), so a feature that
 * is off is invisible rather than a row of zeroes. The unearned state deliberately leads with
 * what is still needed rather than what has been done: "2 more stations" is the sentence that
 * moves somebody to the next table at four o'clock, which is the entire purpose of showing it.
 */
function PassportProgress(props: { passport: PassportProgressView | undefined }) {
  /*
   * Tolerates an absent passport rather than destructuring it. The field is required by the
   * contract, so this should be unreachable — but this card is decoration on a page that also
   * carries the player's identity and team, and the first version of it took the whole page
   * down with a destructuring TypeError when a caller omitted the object. A nice-to-have must
   * not be able to do that.
   */
  if (!props.passport) return null;
  const { stationsVisited, stationsRequired, bonusPoints, isEarned } = props.passport;
  if (bonusPoints <= 0) return null;
  const remaining = Math.max(stationsRequired - stationsVisited, 0);
  return (
    <p className="gb-hint" data-testid="profile__passport">
      {isEarned
        ? `Passport complete — ${bonusPoints} bonus points earned.`
        : `Passport: ${stationsVisited} of ${stationsRequired} stations. ` +
          `${remaining} more for ${bonusPoints} points.`}
    </p>
  );
}
