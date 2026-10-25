import { describe, expect, it } from 'vitest';
import { isStageBusy, nextStage, stageHint } from './stage';
import type { StageFacts, StudioStage } from './types';

const CROP = { x: 10, y: 12, size: 96 };
// The stage machine only reads the matte's presence, never its pixels.
const MATTE = { width: 1, height: 1 } as StageFacts['matte'];

function facts(overrides: Partial<StageFacts> = {}): StageFacts {
  return {
    hasImage: false,
    error: null,
    crop: null,
    matte: null,
    isLocating: false,
    isSegmenting: false,
    ...overrides,
  };
}

describe('nextStage', () => {
  it('reports failure above everything else', () => {
    expect(nextStage(facts({ error: 'unreadable', hasImage: true }))).toBe('failed');
  });

  it('idles without a photo, works while locating one', () => {
    expect(nextStage(facts())).toBe('idle');
    expect(nextStage(facts({ isLocating: true }))).toBe('working');
    expect(nextStage(facts({ hasImage: true, isLocating: true }))).toBe('working');
  });

  it('asks for a manual crop when no face was found', () => {
    expect(nextStage(facts({ hasImage: true }))).toBe('cropping');
  });

  it('refines while segmenting, then splits ready from plain', () => {
    expect(nextStage(facts({ hasImage: true, crop: CROP, isSegmenting: true }))).toBe('refining');
    expect(nextStage(facts({ hasImage: true, crop: CROP, matte: MATTE }))).toBe('ready');
    expect(nextStage(facts({ hasImage: true, crop: CROP }))).toBe('plain');
  });
});

describe('stageHint / isStageBusy', () => {
  const ALL_STAGES: StudioStage[] = ['idle', 'working', 'refining', 'ready', 'plain', 'cropping', 'failed'];

  it('has a plain-words hint for every stage', () => {
    for (const stage of ALL_STAGES) expect(stageHint(stage).length).toBeGreaterThan(10);
    expect(stageHint('idle')).toContain('Wei_Ling');
  });

  it('is busy only while background work runs', () => {
    expect(ALL_STAGES.filter(isStageBusy)).toEqual(['working', 'refining']);
  });
});
