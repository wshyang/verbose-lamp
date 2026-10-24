import { DEFAULT_HERO_TITLE } from '@/features/premiere/data/sequence';
import type { HeroTitleConfig } from '@/features/premiere/model/types';

export interface HeroTitlePreset {
  id: string;
  name: string;
  config: Readonly<HeroTitleConfig>;
}

export const HERO_TITLE_PRESETS: readonly HeroTitlePreset[] = [
  {
    id: 'film-lockup',
    name: 'Original 2013 Film Lockup',
    config: { ...DEFAULT_HERO_TITLE },
  },
  {
    id: 'trimalchio',
    name: 'Trimalchio (Fitzgerald 1924 Draft)',
    config: {
      keystone: 'IN',
      preTitle: 'WEST EGG',
      mainTitle: 'TRIMALCHIO',
      subCredit: 'F. SCOTT FITZGERALD · WORKING MANUSCRIPT TITLE',
      pinstripeAlternation: true,
    },
  },
  {
    id: 'gold-hatted',
    name: 'Gold-Hatted Gatsby',
    config: {
      keystone: 'THE',
      preTitle: 'GOLD-HATTED',
      mainTitle: 'GATSBY',
      subCredit: 'THOMAS PARKE D’INVILLIERS EPIGRAPH EDITION',
      pinstripeAlternation: true,
    },
  },
  {
    id: 'roaring-twenties',
    name: 'Roaring Twenties Gala',
    config: {
      keystone: 'THE',
      preTitle: 'ROARING',
      mainTitle: 'TWENTIES',
      subCredit: 'LONG ISLAND · NEW YORK · MCMXXII',
      pinstripeAlternation: true,
    },
  },
];