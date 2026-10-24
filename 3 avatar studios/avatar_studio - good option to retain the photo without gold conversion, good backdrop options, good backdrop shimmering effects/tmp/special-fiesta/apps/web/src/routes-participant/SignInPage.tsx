import { useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { PinField } from '../components/participant/PinField.js';
import { asNickname } from '../lib/format.js';
import { required } from '../lib/required.js';
import { useAuthHandoff, useParticipantSignIn } from '../lib/hooks/useAuthForms.js';

/** S2 — participant sign-in (F3). */
export function SignInPage() {
  const handoff = useAuthHandoff('/home');
  // ADR-164 — arriving from the nickname finder, with the name already found.
  const [params] = useSearchParams();
  const form = useParticipantSignIn(handoff.complete, params.get('nickname') ?? '');
  const error = form.error ?? handoff.error;
  const pinRef = useRef<HTMLInputElement | null>(null);

  // A wrong PIN clears itself and takes the caret back, so the retry is four taps rather than four
  // backspaces and four taps. Named so the form, the button and ADR-085's fourth-digit submit all
  // run this exact code rather than three things that resemble each other.
  const signIn = (pin?: string) => {
    void form.submit(pin).then((signedIn) => {
      if (!signedIn) required(pinRef.current, 'PIN field').focus();
    });
  };

  return (
    <GameboyShell title="WELCOME BACK" subtitle="Nickname + PIN" showNav={false}>
      <form
        className="gb-panel"
        data-testid="signin-form__form"
        /* ADR-101 — credentials are meant to be saved; agency phones, not shared ones. */
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          signIn();
        }}
      >
        <label className="gb-label" htmlFor="signin-nickname">
          Nickname
        </label>
        <input
          id="signin-nickname"
          name="nickname"
          className="gb-input"
          data-testid="signin-form__nickname"
          value={form.nickname}
          autoComplete="username"
          onChange={(event) => form.setNickname(asNickname(event.target.value))}
        />
        <PinField
          id="signin-pin"
          label="4-digit PIN"
          testId="signin-form__pin"
          autoComplete="current-password"
          inputRef={pinRef}
          value={form.pin}
          onChange={form.setPin}
          /*
           * ADR-085 — the PIN is the last thing asked for here, so the fourth digit IS the submit.
           *
           * Guarded on the NICKNAME, deliberately, and not on `form.canSubmit`: that also requires
           * a four-digit PIN, and this fires from inside the change that produces the fourth digit,
           * so `canSubmit` is still false at this instant and the auto-submit would never happen. A
           * PIN completed before the nickname waits for the button rather than sending a request
           * that could only fail.
           */
          onComplete={form.nickname.trim() === '' ? undefined : signIn}
        />
        {error ? (
          <span className="gb-inline-error" role="alert" data-testid="signin-form__error">
            {error}
          </span>
        ) : null}
        <div style={{ height: 16 }} />
        <button
          type="submit"
          className="gb-button"
          data-testid="signin-form__submit"
          disabled={!form.canSubmit || form.isPending}
        >
          Let&apos;s go!
        </button>
        <div style={{ height: 12 }} />
        <Link
          className="gb-button gb-button--secondary"
          to="/signup"
          data-testid="signin-form__signup"
        >
          I need a nickname
        </Link>
        <p className="gb-hint">Forgot your PIN? Ask any facilitator to reset it.</p>
        <div style={{ height: 8 }} />
        {/*
          ADR-164 — the other half of "I can't get in". A PIN can be reset by any facilitator;
          a forgotten NICKNAME had no route at all, and the fastest thing to do about it was to
          sign up again, which strands the morning's points under a name nobody can name.
        */}
        <Link
          className="gb-button gb-button--secondary"
          to="/find-nickname"
          data-testid="signin-form__find-nickname"
        >
          I forgot my nickname
        </Link>
      </form>
    </GameboyShell>
  );
}
