// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('./lib/api.js', () => ({
  api: {
    listTournaments: vi.fn(async () => []),
    getTournament: vi.fn(),
    createTournament: vi.fn(),
    stageManualMatch: vi.fn(),
    startMatch: vi.fn(),
    scoreMatch: vi.fn(),
    finaliseMatch: vi.fn(),
    cancelMatch: vi.fn(),
    assignPoints: vi.fn(),
    voidPoints: vi.fn(),
    applyContingency: vi.fn(),
    closeTournament: vi.fn(),
  },
}));

describe('main entrypoint', () => {
  it('mounts the app into #root', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('./main.js');
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Tournament Engine');
    });
  });
});
