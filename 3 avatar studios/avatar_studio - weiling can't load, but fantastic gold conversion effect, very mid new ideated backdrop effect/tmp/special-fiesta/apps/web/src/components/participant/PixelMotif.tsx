import type { SharedMotifName } from '../../lib/motifs.js';
import { motifUrl } from '../../themes/motifUrl.js';
import { useVenueTheme } from '../../themes/venueContext.js';

/**
 * A single decorative sprite (ADR-014). Purely ornamental: it is always `aria-hidden`, so the
 * meaning of a heading, tab or row never depends on the picture next to it.
 *
 * Takes only a SHARED name (ADR-297): a sprite every venue draws. A venue-flavoured sprite (the
 * Merlion, a crab) is asked for by role through `<RoleMotif>`, so naming one here is a compile
 * error rather than a page that is wrong the day the venue changes.
 *
 * fds.md §5.5 / DC-006 — participant surfaces only; `npm run standards` fails if this module is
 * imported under routes-facilitator/ or routes-superadmin/.
 */
export function PixelMotif(props: { name: SharedMotifName; size: number; className: string }) {
  const theme = useVenueTheme();
  return <MotifImage src={motifUrl(theme, props.name)} size={props.size} className={props.className} />;
}

/** The one `<img>` both motif components render, so the decorative contract lives in one place. */
export function MotifImage(props: { src: string; size: number; className: string }) {
  return (
    <img
      className={`gb-motif ${props.className}`}
      src={props.src}
      alt=""
      aria-hidden="true"
      width={props.size}
      height={props.size}
    />
  );
}
