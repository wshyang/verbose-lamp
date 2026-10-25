export type DemoScreen = 'premiere' | 'event-night';

export const EVENT_NIGHT_HASH = '#event-night';

/** Which demo a URL hash selects. Anything unrecognised is the premiere. */
export function parseDemoScreen(hash: string): DemoScreen {
  return hash.toLowerCase() === EVENT_NIGHT_HASH ? 'event-night' : 'premiere';
}
