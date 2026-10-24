import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useRouteId } from './useRouteId.js';

function wrapperFor(path: string, route: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={children} />
        </Routes>
      </MemoryRouter>
    );
  };
}

describe('useRouteId', () => {
  it('reads the id the route declares', () => {
    const { result } = renderHook(() => useRouteId('teamId'), {
      wrapper: wrapperFor('/teams/team-1', '/teams/:teamId'),
    });
    expect(result.current).toBe('team-1');
  });

  it('returns an empty id when the route has no such parameter', () => {
    const { result } = renderHook(() => useRouteId('teamId'), {
      wrapper: wrapperFor('/teams', '/teams'),
    });
    expect(result.current).toBe('');
  });
});
