import { MOTIF_VERSION } from './art/motifVersion.js';
import { SentosaScene } from './SentosaScene.js';
import type { VenueTheme } from '../types.js';

/**
 * ADR-294 — Sentosa: the beach, the Merlion, the cable cars.
 *
 * The role mapping reproduces exactly what the pages named directly before roles existed
 * (ADR-297), so the app looks the same: the Merlion beside the title, a shell for Social, a crab,
 * a shell and a starfish under the QR badge, a sun to welcome people and a sandcastle for the
 * team pages.
 */
export const SENTOSA: VenueTheme = {
  id: 'sentosa',
  name: 'Sentosa',
  // --primary (#2f7dd1): the colour the status bar wore before themes existed.
  metaThemeColor: '#2f7dd1',
  copy: {
    landingSubtitle: "Sentosa · Captain's Ball + Fringe",
    landingStationsPlace: 'the beach',
  },
  motifBase: '/themes/sentosa/motifs',
  motifVersion: MOTIF_VERSION,
  motifRoles: {
    bannerMark: 'merlion',
    navSocial: 'shell',
    groundStripLeft: 'crab',
    groundStripMiddle: 'shell',
    groundStripRight: 'starfish',
    landingHero: 'sun',
    teamsHero: 'sandcastle',
    teamsQuiet: 'crab',
    myTeamHero: 'shell',
  },
  styles: ['classic', 'fine', 'real'],
  Scene: SentosaScene,
};
