import { describe, expectTypeOf, it } from 'vitest';
import type { FrameStudioTarget } from '@/features/frame-studio';
import type { PremiereSceneApi } from '@/features/premiere';

// The host binds the Frame Studio to the premiere scene (PremiereSurfaces), so the host is where
// the two features meet. Neither feature imports the other (modularity review, Issue 3); this
// compile-time assertion is what notices if the scene API stops satisfying the studio's target.
describe('the Frame Studio binds to the premiere scene', () => {
  it('is satisfied by the whole scene API', () => {
    expectTypeOf<PremiereSceneApi>().toExtend<FrameStudioTarget>();
  });

  it('asks the scene for exactly the three surface-style operations', () => {
    expectTypeOf<keyof FrameStudioTarget>().toEqualTypeOf<
      'setSequenceFrameStyle' | 'setScreenBorderStyle' | 'setScreenBorderEnabled'
    >();
  });
});
