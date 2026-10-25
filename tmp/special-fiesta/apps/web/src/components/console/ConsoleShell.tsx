import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSession } from '../../lib/session/context.js';
import { useConsoleTheme } from '../../lib/hooks/useConsoleTheme.js';
import { ConsoleThemeToggle } from './ConsoleThemeToggle.js';

/**
 * Staff chrome: spartan, text-only, no sprites (fds.md §5.5). One <nav> of plain links and a
 * sign-out control — everything else belongs to the page.
 */

export interface ConsoleTab {
  to: string;
  label: string;
  end?: boolean;
}

export function ConsoleShell(props: {
  title: string;
  tabs: ConsoleTab[];
  meta?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const { session, endSession } = useSession();
  const { theme, toggleTheme } = useConsoleTheme();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const navigate = useNavigate();
  const mainClass = props.wide ? 'console-main console-main--wide' : 'console-main';

  const signOutNow = async () => {
    setSignOutFailed(false);
    // Same rule as the participant profile: a sign-out the server never confirmed has not
    // happened, and walking to a page the surviving cookie re-authenticates only hides that.
    if (!(await endSession())) {
      setSignOutFailed(true);
      return;
    }
    navigate('/');
  };

  return (
    <div className="theme-console" data-console-theme={theme}>
      <header className="console-bar">
        <h1>{props.title}</h1>
        <div className="console-row">
          {props.meta}
          <ConsoleThemeToggle theme={theme} onToggle={toggleTheme} />
          <span className="console-meta">{session?.staff?.username ?? ''}</span>
          <button
            type="button"
            className="console-button"
            data-testid="console-shell__signout"
            onClick={() => void signOutNow()}
          >
            Sign out
          </button>
          {signOutFailed ? (
            <span className="console-meta" data-testid="console-shell__signout-failed">
              Could not sign out — still signed in. Try again.
            </span>
          ) : null}
        </div>
      </header>
      <nav className="console-tabs" aria-label="Console sections">
        {/*
          `end` is spread conditionally rather than passed as possibly-`undefined`: it is React
          Router's own prop, so it cannot be widened here, and with exactOptionalPropertyTypes an
          absent key and an explicit `undefined` are different types.
        */}
        {props.tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            {...(tab.end === undefined ? {} : { end: tab.end })}
            data-testid="console-shell__tab"
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <main className={mainClass}>{props.children}</main>
    </div>
  );
}
