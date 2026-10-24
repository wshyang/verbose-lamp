import type { HeroTitleConfig, SequenceChapter } from '../model/types';

export const TOTAL_SEQUENCE_DURATION = 38.0; // seconds

export const DEFAULT_HERO_TITLE: HeroTitleConfig = {
  keystone: 'THE',
  preTitle: 'GREAT',
  mainTitle: 'GATSBY',
  subCredit: 'FROM THE NOVEL BY F. SCOTT FITZGERALD',
  pinstripeAlternation: true,
};

export const SEQUENCE_CHAPTERS: readonly SequenceChapter[] = [
  {
    id: 'monogram',
    actNumber: 'I',
    label: 'The Green Light & GG Gate',
    archetype: 'monogram_gate',
    startTime: 0.0,
    endTime: 7.2,
    zPosition: 0,
    topLine: 'WARNER BROS. PICTURES & BAZMARK',
    mainLine: 'GG',
    bottomLine: 'NEW YORK · SUMMER 1922',
    description:
      'Opens in 1920s silver-nitrate projection flicker before blooming into 3D gold around the interlocking Tiffany & Co. octagonal GG signet gate and distant emerald dock beacon.',
  },
  {
    id: 'dicaprio',
    actNumber: 'II',
    label: 'Leonardo DiCaprio',
    archetype: 'ziggurat_chevron',
    startTime: 7.2,
    endTime: 14.0,
    zPosition: -26,
    topLine: 'STARRING',
    mainLine: 'LEONARDO DICAPRIO',
    bottomLine: 'AS JAY GATSBY',
    description:
      'Stepped skyscraper ziggurat brackets and 45° chevron wings draw outward in bevelled 24k gold around alternating solid and 4-line pinstriped Deco chrome typography.',
  },
  {
    id: 'ensemble',
    actNumber: 'III',
    label: 'Maguire · Mulligan',
    archetype: 'sunburst_octagon',
    startTime: 14.0,
    endTime: 20.8,
    zPosition: -52,
    topLine: 'TOBEY MAGUIRE',
    mainLine: 'CAREY MULLIGAN',
    bottomLine: 'JOEL EDGERTON · ELIZABETH DEBICKI',
    description:
      'Symmetrical cut-corner octagonal cartouche crowned by 11-ray Chrysler Building sunburst arches and parallel golden pinstripe rules across three Z-depth planes.',
  },
  {
    id: 'director',
    actNumber: 'IV',
    label: 'Baz Luhrmann',
    archetype: 'diamond_gateway',
    startTime: 20.8,
    endTime: 27.5,
    zPosition: -78,
    topLine: 'A FILM BY',
    mainLine: 'BAZ LUHRMANN',
    bottomLine: 'PRODUCTION & COSTUME DESIGN BY CATHERINE MARTIN',
    description:
      'Deep stereoscopic corridor of interlocking rhomboid lattices and Art Deco fan flourishes parting along the Z-axis as theatrical searchlights sweep the gold chamfers.',
  },
  {
    id: 'hero',
    actNumber: 'V',
    label: 'The Great Gatsby',
    archetype: 'gatsby_hero',
    startTime: 27.5,
    endTime: 38.0,
    zPosition: -108,
    topLine: 'THE',
    middleLine: 'GREAT',
    mainLine: 'GATSBY',
    bottomLine: 'FROM THE NOVEL BY F. SCOTT FITZGERALD',
    description:
      'The monumental hero lockup: nested upper keystone for "THE", tracked "GREAT" frieze, and condensed alternating-pinstripe chiseled platinum & 24k gold "GATSBY" framed by multi-plane golden filigree.',
  },
];
