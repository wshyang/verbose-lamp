import { useRef } from 'react';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { Link } from 'react-router-dom';
import { useAuthHandoff, useStaffSignIn } from '../lib/hooks/useAuthForms.js';
import { required } from '../lib/required.js';
import { useConsoleTheme } from '../lib/hooks/useConsoleTheme.js';
import { ConsoleThemeToggle } from '../components/console/ConsoleThemeToggle.js';

/** S18 — facilitator sign-in (F30). Username + 4-digit passcode, no decoration. */
export function StaffSignInPage() {
  const handoff = useAuthHandoff('/staff');
  const form = useStaffSignIn({ isSuperadmin: false, onSignedIn: handoff.complete });
  const error = form.error ?? handoff.error;
  const passcodeRef = useRef<HTMLInputElement | null>(null);
  const { theme, toggleTheme } = useConsoleTheme();

  return (
    <div className="theme-console" data-console-theme={theme}>
      <header className="console-bar">
        <h1>Facilitator sign-in</h1>
        <ConsoleThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>
      <main className="console-main">
        <form
          className="console-panel"
          data-testid="staff-signin__form"
          /* Credentials are meant to be saved: a facilitator signs in many times a day. */
          autoComplete="on"
          onSubmit={(event) => {
            event.preventDefault();
            void form.submit().then((signedIn) => {
              if (!signedIn) required(passcodeRef.current, 'passcode field').focus();
            });
          }}
        >
          <ConsoleField id="staff-username" label="Username" topic="signInUsername">
          <input
            id="staff-username"
            name="username"
            className="console-input"
            data-testid="staff-signin__username"
            autoCapitalize="none"
            autoComplete="username"
            value={form.username}
            onChange={(event) => form.setUsername(event.target.value)}
          />
          </ConsoleField>
          <ConsoleField id="staff-passcode" label="4-digit passcode" topic="signInPasscode">
          <input
            id="staff-passcode"
            ref={passcodeRef}
            name="passcode"
            className="console-input"
            data-testid="staff-signin__passcode"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={4}
            value={form.passcode}
            onChange={(event) => form.setPasscode(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          </ConsoleField>
          {error ? (
            <p className="console-danger" role="alert" data-testid="staff-signin__error">
              {error}
            </p>
          ) : null}
          <div style={{ height: 16 }} />
          <button
            type="submit"
            className="console-button console-button--primary console-button--huge"
            data-testid="staff-signin__submit"
            disabled={!form.canSubmit || form.isPending}
          >
            Sign in
          </button>
          <div style={{ height: 16 }} />
          <Link className="console-button console-button--ghost" to="/" data-testid="staff-signin__back">
            Back to participant app
          </Link>
        </form>
      </main>
    </div>
  );
}
