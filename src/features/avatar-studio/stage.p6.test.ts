// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { isStageBusy, nextStage, stageHint, STAGE_HINTS } from './stage';

/** The studio stage machine, derived from facts — never stored (reference ADR-054). */
describe('nextStage', () => {
  const base = { hasImage: true, isLocating: false, isSegmenting: false, crop: {}, matte: {}, error: null };

  it('walks the happy path from working to ready', () => {
    expect(nextStage({ ...base, hasImage: false, isLocating: true } as never)).toBe('working');
    expect(nextStage({ ...base, isLocating: true } as never)).toBe('working');
    expect(nextStage({ ...base, crop: null } as never)).toBe('cropping');
    expect(nextStage({ ...base, isSegmenting: true } as never)).toBe('refining');
    expect(nextStage({ ...base, matte: null } as never)).toBe('plain');
    expect(nextStage(base as never)).toBe('ready');
  });

  it('an error wins over everything else', () => {
    expect(nextStage({ ...base, error: 'boom' } as never)).toBe('failed');
  });
});
describe('isStageBusy', () => {
  it('is busy exactly while work is running, so controls can show it', () => {
    expect(isStageBusy('working')).toBe(true);
    expect(isStageBusy('refining')).toBe(true);
    for (const stage of ['idle', 'ready', 'plain', 'cropping', 'failed'] as const) {
      expect(isStageBusy(stage)).toBe(false);
    }
  });

  it('has a plain-words hint for every stage, with no library names', () => {
    for (const stage of Object.keys(STAGE_HINTS) as (keyof typeof STAGE_HINTS)[]) {
      expect(stageHint(stage).length).toBeGreaterThan(10);
      expect(stageHint(stage)).not.toMatch(/mediapipe|tensorflow|onnx/i);
    }
  });
});
