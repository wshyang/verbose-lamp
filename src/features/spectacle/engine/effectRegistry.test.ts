import { describe, expect, it } from 'vitest';
import type { EffectId } from '../model/types';
import { effectRegistry } from './effectRegistry';

describe('effectRegistry', () => {
  it('registers every effect under a definition that names a layer', () => {
    for (const id of Object.keys(effectRegistry) as EffectId[]) {
      expect(effectRegistry[id].layer).toMatch(/^(light-backdrop|light-overlay|solid-overlay)$/);
      expect(typeof effectRegistry[id].create).toBe('function');
    }
  });

  it('has the party sparkler as its own effect', () => {
    expect(effectRegistry.sparkler.id).toBe('sparkler');
  });

  // Hosts (Event Night, the preview console) still say 'orb-transition'. It is a deprecated name
  // for the same effect, not a second implementation, so both keys must be the one definition.
  it('serves the legacy orb-transition id from the sparkler-transition definition', () => {
    expect(effectRegistry['sparkler-transition']).toBeDefined();
    expect(effectRegistry['orb-transition']).toBe(effectRegistry['sparkler-transition']);
    expect(effectRegistry['sparkler-transition'].id).toBe('sparkler-transition');
  });
});
