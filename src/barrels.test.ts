import { describe, expect, it } from 'vitest';

/**
 * Every feature barrel is loaded once (ADDENDUM-027). A barrel is the only door
 * between features (CLAUDE.md §6), so a broken or circular one should fail here
 * rather than in the browser — and loading them keeps the barrels themselves in
 * the coverage contract instead of leaving them as untested re-export lists.
 */
const BARRELS = [
  '@/app',
  '@/features/art-deco-frame',
  '@/features/avatar-studio',
  '@/features/background-removal',
  '@/features/deco-lattice',
  '@/features/enamel-backdrop',
  '@/features/event-night',
  '@/features/face-detection',
  '@/features/frame-studio',
  '@/features/gilded-portrait',
  '@/features/gilded-ui',
  '@/features/lucky-draw',
  '@/features/party-sparklers',
  '@/features/premiere',
  '@/features/qr-generator',
  '@/features/research',
  '@/features/spectacle',
  '@/features/spectacle-preview',
  '@/features/title-customizer',
  '@/shared/ui',
] as const;

describe('feature barrels', () => {
  it.each(BARRELS)('%s exports something', async (path) => {
    const barrel = await import(path);
    expect(Object.keys(barrel).length).toBeGreaterThan(0);
  });
});
