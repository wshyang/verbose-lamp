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
