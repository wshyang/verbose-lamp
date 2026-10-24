import { motifUrl } from '../../themes/motifUrl.js';
import type { MotifRole } from '../../themes/types.js';
import { useVenueTheme } from '../../themes/venueContext.js';
import { MotifImage } from './PixelMotif.js';

/**
 * ADR-297 — a venue-flavoured sprite, asked for by the PLACE it goes rather than by the picture.
 *
 * The page says `bannerMark`; the active theme says that is the Merlion at Sentosa and something
 * else elsewhere. Same decorative contract as `<PixelMotif>`: `aria-hidden`, empty alt.
 */
export function RoleMotif(props: { role: MotifRole; size: number; className: string }) {
  const theme = useVenueTheme();
  return (
    <MotifImage
      src={motifUrl(theme, theme.motifRoles[props.role])}
      size={props.size}
      className={props.className}
    />
  );
}
