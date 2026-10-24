export type FrameArchetype =
  | 'monogram_gate'
  | 'ziggurat_chevron'
  | 'sunburst_octagon'
  | 'diamond_gateway'
  | 'gatsby_hero';

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

export interface ResearchSection {
  id: string;
  numeral: string;
  title: string;
  subtitle: string;
  credits: string;
  summary: string;
  bulletPoints: string[];
}
