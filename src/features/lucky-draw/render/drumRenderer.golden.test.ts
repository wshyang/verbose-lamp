import { describe, expect, it } from 'vitest';
import { createRecordingContext, hashText } from '@/features/spectacle/testing/recordingCanvas';
import { SAMPLE_GUESTS } from '../data/sampleGuests';
import { drawDrum } from './drumRenderer';

const WIDTH = 640;
const HEIGHT = 400;
const ENTRIES = SAMPLE_GUESTS.slice(0, 30);

const CASES = [
  { name: 'rest at slot 0', position: 0, speed: 0, landedPlateGlow: false },
  { name: 'rest between slots', position: 3.4, speed: 0, landedPlateGlow: false },
  { name: 'fast spin with smear', position: 7.25, speed: 9, landedPlateGlow: false },
  { name: 'landed with glow', position: 12, speed: 0, landedPlateGlow: true },
] as const;

describe('drawDrum golden recordings', () => {
  for (const testCase of CASES) {
    it(`${testCase.name} draws identically`, () => {
      const { ctx, log } = createRecordingContext();
      drawDrum(ctx, { ...testCase, entries: ENTRIES }, { w: WIDTH, h: HEIGHT });
      expect({ calls: log.length, hash: hashText(log.join('\n')) }).toMatchSnapshot();
    });
  }
});

// `rgba()` takes channels as integers. The panel shading computed them as `120 * lit + 40` and
// passed the raw float, e.g. `rgba(128.53,95.2,...)`. Browsers accept that today, but the 2D context
// spec only guarantees integers, and a stricter parser (or a future one) drops the stop silently,
// leaving a drum panel the wrong colour with no error to find.
describe('drawDrum colour stops', () => {
  const stops = (testCase: (typeof CASES)[number]) => {
    const { ctx, log } = createRecordingContext();
    drawDrum(ctx, { ...testCase, entries: ENTRIES }, { w: WIDTH, h: HEIGHT });
    return log
      .filter((line) => line.includes('addColorStop'))
      .map((line) => /,(rgba?\([^)]*\))/.exec(line)?.[1])
      .filter((colour): colour is string => colour !== undefined);
  };

  it('draws at least some colour stops, so the check below is not vacuous', () => {
    expect(stops(CASES[0]).length).toBeGreaterThan(10);
  });

  it.each(CASES)('emits only whole-number rgb channels ($name)', (testCase) => {
    const offenders = stops(testCase).filter((colour) => {
      const [r, g, b] = colour.slice(colour.indexOf('(') + 1, -1).split(',').slice(0, 3);
      return [r, g, b].some((channel) => !/^\d+$/.test(channel.trim()));
    });

    expect(offenders).toEqual([]);
  });

  it('keeps every channel inside 0 to 255', () => {
    for (const colour of stops(CASES[1])) {
      for (const channel of colour.slice(colour.indexOf('(') + 1, -1).split(',').slice(0, 3)) {
        expect(Number(channel)).toBeGreaterThanOrEqual(0);
        expect(Number(channel)).toBeLessThanOrEqual(255);
      }
    }
  });
});
