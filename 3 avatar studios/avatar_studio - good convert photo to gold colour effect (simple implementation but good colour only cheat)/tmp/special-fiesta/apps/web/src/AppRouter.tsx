import type { ReactNode } from 'react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

/**
 * ADR-287 — the router the app runs in, with navigations committed straight away.
 *
 * React Router 7 wraps every navigation in `React.startTransition` unless told not to. A
 * transition is low priority, so an urgent state update made in the same tick renders FIRST,
 * against the route being left. Sign-out is exactly that tick: `endSession` clears the session
 * (urgent) and the page navigates to `/` (a transition), so the guarded page renders once with no
 * session, and its `RequireActor` sends the participant to `/signin` before the landing page ever
 * arrives. `useTransitions={false}` commits the navigation with the state change, in one render.
 *
 * `TestRouter` is the same router for a test, so a test that renders the app drives the same
 * scheduling the phone does rather than one that hides the race.
 */
export function AppRouter(props: { children: ReactNode }) {
  return <BrowserRouter useTransitions={false}>{props.children}</BrowserRouter>;
}

export function TestRouter(props: { initialEntries: string[]; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={props.initialEntries} useTransitions={false}>
      {props.children}
    </MemoryRouter>
  );
}
