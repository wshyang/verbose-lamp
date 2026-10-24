import type { FrameArchetype } from '@/features/art-deco-frame/model/types';

export type CameraMode = 'cinema' | 'orbit';

export interface HeroTitleConfig {
  keystone: string;     // e.g. "THE"
  preTitle: string;     // e.g. "GREAT"
  mainTitle: string;    // e.g. "GATSBY"
  subCredit: string;    // e.g. "FROM THE NOVEL BY F. SCOTT FITZGERALD"
  pinstripeAlternation: boolean;
}

export interface SequenceChapter {
  id: string;
  actNumber: string;
  label: string;
  archetype: FrameArchetype;
  startTime: number; // seconds
  endTime: number;   // seconds
  zPosition: number; // world Z placement along theatrical corridor
  topLine?: string;
  middleLine?: string;
  mainLine: string;
  bottomLine?: string;
  description: string;
}
