import type { HeroTitleConfig } from '@/features/premiere/model';

export function normalizeHeroTitle(config: HeroTitleConfig): HeroTitleConfig {
  return {
    keystone: config.keystone.trim().toUpperCase().slice(0, 8) || 'THE',
    preTitle: config.preTitle.trim().toUpperCase().slice(0, 18),
    mainTitle: config.mainTitle.trim().toUpperCase().slice(0, 16) || 'GATSBY',
    subCredit: config.subCredit.trim().toUpperCase().slice(0, 46),
    pinstripeAlternation: config.pinstripeAlternation,
  };
}