// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT_CATALOG } from '../shared/contracts.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const payload = String(input).endsWith('/api/formats') ? FORMAT_CATALOG : [];
    return { ok: true, json: async () => payload } as Response;
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('browser entry point', () => {
  it('mounts the React app into the root element', async () => {
    await import('./main.js');
    expect(await screen.findByRole('heading', { name: 'Set up a tournament' })).toBeInTheDocument();
    expect(screen.getByText('No event open')).toBeInTheDocument();
  });
});
