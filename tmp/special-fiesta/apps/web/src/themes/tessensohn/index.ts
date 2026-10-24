import { MOTIF_VERSION } from './art/motifVersion.js';
import { TessensohnScene } from './TessensohnScene.js';
import type { VenueTheme } from '../types.js';

/**
 * ADR-299 — CSC @ Tessensohn: the Civil Service Club's building on Tessensohn Road, with its
 * solar roof, climbing wall and rooftop court.
 *
 * Every motif role is filled with a sprite every venue draws, so nothing here is a Sentosa
 * landmark: the banner mark is the shared `kueh` (as in the mockup), the Social tab is `chat`, and
 * the three figures under the QR badge are a cone, a bib and a whistle, the kit of the day.
 */
export const TESSENSOHN: VenueTheme = {
  id: 'tessensohn',
  name: 'CSC @ Tessensohn',
  // --primary (#2372bc): the blue title bar, so the browser chrome matches the banner.
  metaThemeColor: '#2372bc',
  copy: {
    landingSubtitle: "CSC @ Tessensohn · Captain's Ball + Fringe",
    landingStationsPlace: 'the club',
  },
  motifBase: '/themes/tessensohn/motifs',
  motifVersion: MOTIF_VERSION,
  motifRoles: {
    bannerMark: 'kueh',
    navSocial: 'chat',
    groundStripLeft: 'cone',
    groundStripMiddle: 'bib',
    groundStripRight: 'whistle',
    landingHero: 'flag',
    teamsHero: 'court',
    teamsQuiet: 'face',
    myTeamHero: 'badge',
  },
  styles: ['classic', 'fine'],
  Scene: TessensohnScene,
};
