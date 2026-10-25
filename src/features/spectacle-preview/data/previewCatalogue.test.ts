import { describe, expect, it } from 'vitest';
import { DEFAULT_NAV_LINES, ORB_DEMOS, SPARKLER_DEMOS, SUNBURST_DEMOS } from './previewCatalogue';

describe('previewCatalogue', () => {
  it('offers every orb configuration exactly once', () => {
    expect(ORB_DEMOS.map((demo) => demo.key)).toEqual([
      'orb-sides-outward',
      'orb-sides-inward',
      'orb-corners-outward',
      'orb-corners-inward',
    ]);
    const shapes = ORB_DEMOS.map((demo) => `${demo.pattern}:${demo.direction}`);
    expect(new Set(shapes).size).toBe(ORB_DEMOS.length);
  });

  it('offers both sunburst variants', () => {
    expect(SUNBURST_DEMOS.map((demo) => demo.variant)).toEqual(['iris', 'fan']);
  });

  it('keys sparkler demos by their effect-run id and counts 1..5', () => {
    for (const demo of SPARKLER_DEMOS) {
      expect(demo.key).toBe(`sparkler-${demo.count}`);
      expect(demo.count).toBeGreaterThanOrEqual(1);
      expect(demo.count).toBeLessThanOrEqual(5);
      expect(demo.label.length).toBeGreaterThan(0);
    }
    expect(SPARKLER_DEMOS).toHaveLength(2);
  });

  it('seeds the nav with the lucky-draw line', () => {
    expect(DEFAULT_NAV_LINES.split('\n')).toHaveLength(5);
    expect(DEFAULT_NAV_LINES).toContain('Lucky Draw');
  });
});
