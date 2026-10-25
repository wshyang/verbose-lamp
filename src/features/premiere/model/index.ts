/**
 * The premiere's pure entry: the sequence data and the types a consumer reads, with no React, no
 * Three.js and no audio. A pure consumer (the title customizer) imports this, not the feature
 * barrel, which also exports the controller hooks (modularity review 2026-10-26, Issue 2).
 */
export { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
export type { CameraMode, HeroTitleConfig, SequenceChapter } from './types';
