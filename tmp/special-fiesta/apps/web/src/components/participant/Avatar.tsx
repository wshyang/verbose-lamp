import { avatarAlt, avatarUrl, type AvatarIdentity } from '../../lib/avatars.js';
import { useSprite } from './SpriteProvider.js';

/**
 * fds.md §5.5 / DC-006 — participant surfaces only (S3, S4, S5, S6, S9, S10, S11, S17, S60).
 * `npm run standards` fails if this module is imported under routes-facilitator/ or
 * routes-superadmin/.
 *
 * Sizes are 32, 64 or 128: the art is 64×64 (ADR-026), so a whole or half multiple keeps
 * every cell on a pixel boundary.
 *
 * ADR-035 — a person carries the *id* of their photo sprite, not the sprite. The provider
 * hands over the body from this device's cache, or fetches it once; until then the drawn
 * character stands in, so a list never has a hole in it.
 */
export function Avatar(props: { person: AvatarIdentity & { avatarPhotoId?: string | null }; size: number }) {
  const avatarPhoto = useSprite(props.person.avatarPhotoId ?? null);
  const identity = { ...props.person, avatarPhoto };
  return (
    <img
      className="gb-avatar"
      src={avatarUrl(identity)}
      alt={avatarAlt(identity)}
      width={props.size}
      height={props.size}
    />
  );
}
