import { describe, expect, it } from 'vitest';
import { buildAuthoredFrame, buildFrame, buildFrameSpecs } from './index';
import { SIGNATURE_GENOME } from './genome';

/**
 * The two compatibility wrappers around `buildFrame`. The pipeline itself is pinned by
 * the golden suites; these cases only prove the wrappers reach it with the arguments
 * the callers expect.
 */
describe('frameGrammar wrappers', () => {
  it('buildFrameSpecs is buildFrame with the default formula', () => {
    expect(buildFrameSpecs('gatsby_hero', 0.5)).toEqual(buildFrame({ archetype: 'gatsby_hero', mainWidth: 0.5 }));
  });

  it('buildAuthoredFrame pins the authored source and the supplied genome', () => {
    const specs = buildAuthoredFrame('gatsby_hero', 0.5, SIGNATURE_GENOME);

    expect(specs.length).toBeGreaterThan(0);
    expect(specs).toEqual(buildFrameSpecs('gatsby_hero', 0.5));
  });

  it('passes the intricacy through both wrappers', () => {
    const low = buildAuthoredFrame('gatsby_hero', 0.5, SIGNATURE_GENOME, 1);
    const high = buildAuthoredFrame('gatsby_hero', 0.5, SIGNATURE_GENOME, 4);

    expect(low.length).toBeLessThanOrEqual(high.length);
  });
});
