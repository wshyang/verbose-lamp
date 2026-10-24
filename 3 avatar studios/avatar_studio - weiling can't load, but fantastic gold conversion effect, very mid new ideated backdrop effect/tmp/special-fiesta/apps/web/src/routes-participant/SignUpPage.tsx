import { Link } from 'react-router-dom';
import type { ClusterCode, Gender } from '@psd/contracts';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { PinField } from '../components/participant/PinField.js';
import { AvatarStudio } from '../components/participant/AvatarStudio.js';
import { asNickname } from '../lib/format.js';
import { required } from '../lib/required.js';
import { useAuthHandoff, useSignUpForm } from '../lib/hooks/useAuthForms.js';

/** S1 — sign up (F1). Nickname + PIN + cluster + gender + avatar, all on one screen. */
export function SignUpPage() {
  const handoff = useAuthHandoff('/home');
  const form = useSignUpForm(handoff.complete);
  const error = form.error ?? handoff.error;

  const gender: Gender | '' = form.fields.gender;
  const isSubmitDisabled = form.isPending;

  return (
    <GameboyShell title="JOIN IN" subtitle="Step into Active Day" showNav={false}>
      {/*
        ADR-164 — the interruption, and the only moment a duplicate sign-up can be stopped.
        It cannot be detected as it happens (a nickname and a PIN are the whole of identity)
        and it cannot be undone afterwards: nothing merges two participants, so the points
        earned under the first nickname stay there, uncounted, for the rest of the day.

        Above the form rather than below it, and before the nickname field rather than beside
        the "I already have a nickname" link at the bottom: somebody who could remember their
        nickname would have taken that link already. This is for the person who cannot, and
        who is three taps from making a second one.
      */}
      <section className="gb-panel" data-testid="signup-form__duplicate-warning">
        <p className="gb-hint">
          Signed up earlier today? Don&apos;t sign up again — a second nickname leaves this
          morning&apos;s points behind on the first one.
        </p>
        <Link
          className="gb-button gb-button--secondary"
          to="/find-nickname"
          data-testid="signup-form__find-nickname"
        >
          Find my nickname
        </Link>
      </section>

      <form
        className="gb-panel"
        data-testid="signup-form__form"
        /* ADR-101 — let the manager capture the new credentials the moment they are minted. */
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          // The caret goes to the field that was rejected, in reading order, instead of
          // leaving the participant to hunt for it down a form two screens long.
          void form.submit().then((focusId) => {
            if (focusId !== null) required(document.getElementById(focusId), 'sign-up field').focus();
          });
        }}
      >
        <label className="gb-label" htmlFor="signup-nickname">
          Nickname
        </label>
        <input
          id="signup-nickname"
          name="nickname"
          className="gb-input"
          data-testid="signup-form__nickname"
          value={form.fields.nickname}
          maxLength={20}
          autoComplete="username"
          onChange={(event) => form.setField('nickname', asNickname(event.target.value))}
        />
        <p className="gb-hint">3–20 characters. Letters, numbers and underscore — space becomes _.</p>

        <PinField
          id="signup-pin"
          label="4-digit PIN"
          testId="signup-form__pin"
          autoComplete="new-password"
          value={form.fields.pin}
          onChange={(value) => form.setField('pin', value)}
        />

        <label className="gb-label" htmlFor="signup-cluster">
          Cluster
        </label>
        <select
          id="signup-cluster"
          className="gb-select"
          data-testid="signup-form__cluster"
          value={form.fields.clusterCode}
          onChange={(event) => form.setField('clusterCode', event.target.value as ClusterCode)}
        >
          <option value="">— choose your cluster —</option>
          {form.clusters.map((cluster) => (
            <option key={cluster.code} value={cluster.code}>
              {cluster.displayName}
            </option>
          ))}
        </select>

        <span className="gb-label">Gender</span>
        <div className="gb-row">
          <button
            id="signup-gender"
            type="button"
            className="gb-button gb-button--small"
            data-testid="signup-form__gender-male"
            aria-pressed={gender === 'male'}
            onClick={() => form.setField('gender', 'male')}
          >
            Male
          </button>
          <button
            type="button"
            className="gb-button gb-button--small"
            data-testid="signup-form__gender-female"
            aria-pressed={gender === 'female'}
            onClick={() => form.setField('gender', 'female')}
          >
            Female
          </button>
        </div>

        <span className="gb-label">Avatar</span>
        {/*
          ADR-231 — no figure until a gender is chosen. The studio used to draw a male figure while the gender
          was blank, which showed a choice nobody had made. The characters are drawn for the gender chosen.
        */}
        {gender === '' ? (
          <span className="gb-hint" data-testid="signup-form__avatar-wait">
            Choose a gender to see the characters.
          </span>
        ) : (
          <AvatarStudio
            id="signup-avatar"
            gender={gender}
            personaTestId="signup-form__avatar"
            draft={{
              avatarVariant: form.fields.avatarVariant ?? 1,
              avatarLook: form.fields.avatarLook,
              avatarPhoto: form.fields.avatarPhoto,
            }}
            onChange={(next) => {
              form.setField('avatarVariant', next.avatarVariant);
              form.setField('avatarLook', next.avatarLook);
              form.setField('avatarPhoto', next.avatarPhoto ?? null);
            }}
          />
        )}

        {error ? (
          <span className="gb-inline-error" role="alert" data-testid="signup-form__error">
            {error}
          </span>
        ) : null}
        {form.errorHint ? (
          <span className="gb-hint" data-testid="signup-form__error-hint">
            {form.errorHint}
          </span>
        ) : null}

        <div style={{ height: 16 }} />
        <button
          type="submit"
          className="gb-button"
          data-testid="signup-form__submit"
          disabled={isSubmitDisabled}
        >
          Sign up &amp; join!
        </button>
        <div style={{ height: 12 }} />
        <Link className="gb-button gb-button--secondary" to="/signin" data-testid="signup-form__signin">
          I already have a nickname
        </Link>
      </form>
    </GameboyShell>
  );
}
