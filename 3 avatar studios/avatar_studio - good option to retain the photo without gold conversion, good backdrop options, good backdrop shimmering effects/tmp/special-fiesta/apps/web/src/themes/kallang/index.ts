import { MOTIF_VERSION } from './art/motifVersion.js';
import { KallangScene } from './KallangScene.js';
import type { VenueTheme } from '../types.js';

/**
 * ADR-301 — The Kallang: Singapore Sports Hub, the National Stadium across the basin.
 *
 * Every motif role is filled with a sprite every venue draws, recoloured in this venue's
 * palette, so nothing here is another venue's landmark. The backdrop is the venue's own:
 * one photographic plate of the waterfront (see `KallangScene`).
 */
export const KALLANG: VenueTheme = {
  id: 'kallang',
  name: 'The Kallang',
  // --primary (#1f6fb4): the river-blue title bar, so the browser chrome matches the banner.
  metaThemeColor: '#1f6fb4',
  copy: {
    landingSubtitle: "The Kallang · Captain's Ball + Fringe",
    landingStationsPlace: 'the Sports Hub',
  },
  motifBase: '/themes/kallang/motifs',
  motifVersion: MOTIF_VERSION,
  motifRoles: {
    bannerMark: 'flag',
    navSocial: 'chat',
    groundStripLeft: 'cone',
    groundStripMiddle: 'bib',
    groundStripRight: 'whistle',
    landingHero: 'trophy',
    teamsHero: 'court',
    teamsQuiet: 'face',
    myTeamHero: 'badge',
  },
  styles: ['classic', 'fine'],
  Scene: KallangScene,
};
