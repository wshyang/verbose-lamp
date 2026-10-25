import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectRegistry } from '../engine/effectRegistry';
import type { EffectDefinition, FrameInfo } from '../engine/types';
import { qualitySettings } from '../model/quality';
import type { EffectParamsMap } from '../model/types';
import {
  createRecordingContext, hashText, stubBrowserGlobals, unstubBrowserGlobals,
} from '../testing/recordingCanvas';

const VIEWPORT = { w: 1280, h: 720 } as const;
const STEP_MS = 100;
const MAX_MS = 6000;
const ORIGIN = { x: 0.5, y: 0.5 } as const;

interface GoldenCase {
  name: string;
  effect: keyof EffectParamsMap;
  params: EffectParamsMap[keyof EffectParamsMap];
}

const CASES: readonly GoldenCase[] = [
  { name: 'fireworks', effect: 'fireworks', params: { seed: 1925, intensity: 0.6 } },
  { name: 'fireworks finale', effect: 'fireworks', params: { seed: 1925, finale: true, greenLight: true } },
  { name: 'orbs sides outward', effect: 'orb-transition', params: { origin: ORIGIN, pattern: 'sides', direction: 'outward' } },
  { name: 'orbs sides inward', effect: 'orb-transition', params: { origin: ORIGIN, pattern: 'sides', direction: 'inward' } },
  { name: 'orbs corners outward', effect: 'orb-transition', params: { origin: ORIGIN, pattern: 'corners', direction: 'outward' } },
  { name: 'orbs corners inward', effect: 'orb-transition', params: { origin: ORIGIN, pattern: 'corners', direction: 'inward' } },
  { name: 'sunburst iris', effect: 'sunburst-wipe', params: { origin: ORIGIN, variant: 'iris' } },
  { name: 'sunburst fan', effect: 'sunburst-wipe', params: { origin: { x: 0.5, y: 1 }, variant: 'fan' } },
  { name: 'confetti burst', effect: 'confetti', params: { mode: 'burst', origin: ORIGIN, seed: 1925 } },
  { name: 'confetti rain', effect: 'confetti', params: { mode: 'rain', seed: 1925 } },
  { name: 'champagne', effect: 'champagne', params: { seed: 1925 } },
  { name: 'searchlights', effect: 'searchlights', params: { beams: 3, seed: 1925 } },
  { name: 'countdown', effect: 'countdown', params: { from: 3 } },
  { name: 'name reveal', effect: 'name-reveal', params: { name: 'Jay Gatsby', subtitle: 'Lucky draw winner' } },
  { name: 'sparkler single', effect: 'sparkler', params: { origin: ORIGIN, seed: 1925 } },
  { name: 'sparkler fan', effect: 'sparkler', params: { origin: ORIGIN, seed: 1925, count: 5, intensity: 0.9 } },
  { name: 'flash', effect: 'flash', params: { origin: ORIGIN } },
];

interface RunSummary {
  calls: number;
  hash: string;
  status: 'running' | 'done';
  announced: readonly string[];
}

function runEffect(testCase: GoldenCase, reducedMotion: boolean): RunSummary {
  const definition = effectRegistry[testCase.effect] as EffectDefinition<unknown>;
  const announced: string[] = [];
  const instance = definition.create(
    { quality: qualitySettings('high'), reducedMotion, announce: (text) => announced.push(text) },
    testCase.params,
  );
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, ...VIEWPORT, fade: 1 };
  let status: 'running' | 'done' = 'running';
  for (let t = 0; t <= MAX_MS && status === 'running'; t += STEP_MS) {
    status = instance.update(t, frame);
  }
  return { calls: log.length, hash: hashText(log.join('\n')), status, announced };
}

describe('effect golden recordings', () => {
  beforeEach(stubBrowserGlobals);
  afterEach(unstubBrowserGlobals);

  for (const testCase of CASES) {
    it(`${testCase.name} draws identically (full motion)`, () => {
      expect(runEffect(testCase, false)).toMatchSnapshot();
    });

    it(`${testCase.name} draws identically (reduced motion)`, () => {
      expect(runEffect(testCase, true)).toMatchSnapshot();
    });

    it(`${testCase.name} is deterministic`, () => {
      expect(runEffect(testCase, false)).toEqual(runEffect(testCase, false));
    });
  }
});
