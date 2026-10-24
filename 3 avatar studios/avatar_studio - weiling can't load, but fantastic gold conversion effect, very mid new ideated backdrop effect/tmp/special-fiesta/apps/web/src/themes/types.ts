import type { VenueId } from '@psd/contracts';
import type { ComponentType } from 'react';
import type { MotifName } from '../lib/motifs.js';

/**
 * ADR-294 / ADR-297 — what a venue is, to the participant app.
 *
 * A theme is data plus one component. Everything else a venue changes (colours, CSS-placed
 * sprites) is CSS in `themes/<id>/theme.css`, defined against the contract in `cssContract.ts`.
 */

/**
 * Where a page wants a venue-flavoured sprite. A role names the PLACE, never the picture: the
 * banner mark is whatever the venue is known by, not "the merlion". Each venue maps every role
 * to one of its own themed sprites, and the type below makes a missing mapping a compile error.
 */
export const MOTIF_ROLES = [
  /** The landmark beside the page title, on every participant page. */
  'bannerMark',
  /** The Social tab: where people gather and trade photos. */
  'navSocial',
  /** The three small creatures standing under the QR badge. */
  'groundStripLeft',
  'groundStripMiddle',
  'groundStripRight',
  /** The welcome heading on Landing. */
  'landingHero',
  /** The Teams heading and the Landing "running the event" heading. */
  'teamsHero',
  /** An empty or quiet state on the Teams page. */
  'teamsQuiet',
  /** My team's heading. */
  'myTeamHero',
] as const;

export type MotifRole = (typeof MOTIF_ROLES)[number];

/** Copy that names the place. Everything else in the app is venue-neutral. */
export interface VenueCopy {
  /** Landing subtitle, after the event name: the place and what is on. */
  readonly landingSubtitle: string;
  /** The welcome paragraph's last phrase, completing "...for your cluster at every station on ". */
  readonly landingStationsPlace: string;
}

export interface VenueTheme {
  readonly id: VenueId;
  /** For humans: shown in logs and in the superadmin console, never in the participant app. */
  readonly name: string;
  /** The browser chrome colour (`<meta name="theme-color">`). A venue's primary, usually. */
  readonly metaThemeColor: string;
  readonly copy: VenueCopy;
  /** `/themes/<id>/motifs` — where this venue's sprites are served from. */
  readonly motifBase: string;
  /** The content stamp of this venue's sprites (ADR-067), appended to every sprite URL. */
  readonly motifVersion: string;
  /**
   * Which sprite plays each role. Total: every role has one. Any sprite will do (ADR-298): Sentosa
   * fills its roles with beach and landmark sprites, and a venue with no such flavour fills them
   * with sprites every venue draws. Only a *page* is limited to shared names.
   */
  readonly motifRoles: Readonly<Record<MotifRole, MotifName>>;
  /**
   * Which backdrop styles this venue has art for (ADR-299). `classic` and `fine` are drawn from
   * code and every venue has them; `real` is a 16 MB photoreal set only Sentosa has. A style
   * a venue lacks is not honoured: `?backdrop=real` at such a venue draws classic.
   */
  readonly styles: readonly ('classic' | 'fine' | 'real')[];
  /** The backdrop. Owns the classic/fine/real style dispatch for this venue. */
  readonly Scene: ComponentType;
}
