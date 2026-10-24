import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '../components/shared/SessionProvider.js';
import { SyncProvider } from '../components/shared/SyncProvider.js';

/**
 * Renders a real page inside the real providers and a real router — only `fetch` is stubbed.
 * A test that passes here exercised the component, its hooks and the api layer together.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: { path?: string; route?: string; withSync?: boolean },
) {
  const path = options?.path ?? '/';
  const route = options?.route ?? path;
  const withSync = options?.withSync ?? false;

  const wrapped: ReactNode = withSync ? <SyncProvider>{ui}</SyncProvider> : ui;

  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Routes>
          <Route path={route} element={wrapped} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

/**
 * ADR-027 — anything that awards points, ends a phase or removes somebody opens the
 * confirmation dialog first. Tests that exercise those buttons press through it here, so
 * the guard is asserted once rather than described in thirty places.
 */
export async function confirmDialog(user: { click: (element: Element) => Promise<void> }) {
  const { screen } = await import('@testing-library/react');
  await user.click(screen.getByTestId('confirm-dialog__confirm'));
}
