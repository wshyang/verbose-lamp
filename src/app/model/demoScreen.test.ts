import { describe, expect, it } from 'vitest';
import { EVENT_NIGHT_HASH, parseDemoScreen } from './demoScreen';

describe('parseDemoScreen', () => {
  it('opens the premiere when there is no hash', () => {
    expect(parseDemoScreen('')).toBe('premiere');
    expect(parseDemoScreen('#')).toBe('premiere');
  });

  it('opens the Event Night demo for its hash, ignoring case', () => {
    expect(parseDemoScreen(EVENT_NIGHT_HASH)).toBe('event-night');
    expect(parseDemoScreen('#EVENT-NIGHT')).toBe('event-night');
  });

  it('falls back to the premiere for any other hash', () => {
    expect(parseDemoScreen('#research')).toBe('premiere');
    expect(parseDemoScreen('#event-night-two')).toBe('premiere');
  });
});
