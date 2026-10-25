// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { createPremiereStore } from './premiereStore';
import { storeSceneApi } from './storeSceneApi';

/**
 * The adapter is what lets the transport, the scene options and Frame Studio stay
 * exactly as they are (ADDENDUM-022 §6 step 2.1). Every method must reach the store.
 */
describe('storeSceneApi', () => {
  it('disposes nothing, because the Canvas owns every GPU resource', () => {
    const store = createPremiereStore();
    const before = store.getState();

    expect(() => storeSceneApi(store).dispose()).not.toThrow();
    expect(store.getState().currentTime).toBe(before.currentTime);
  });
});
