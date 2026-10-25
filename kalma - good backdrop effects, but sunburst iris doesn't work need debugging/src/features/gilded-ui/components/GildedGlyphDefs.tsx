import { goldTableValues } from '../model/goldTable';

/**
 * One shared <defs> per page. Emoji colour collapses to luminance, then a
 * gold ramp table re-colours it — platform emoji differences mostly vanish.
 * Vocabulary matches the gold QR sheen (ADDENDUM-020 §3.8).
 */
export function GildedGlyphDefs() {
  const classic = goldTableValues('classic');
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        <filter id="gilded-glyph" x="-20%" y="-20%" width="140%" height="140%">
          <feColorMatrix
            type="matrix"
            values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"
            result="lum"
          />
          <feComponentTransfer in="lum" result="tinted">
            <feFuncR type="table" tableValues={classic.r} />
            <feFuncG type="table" tableValues={classic.g} />
            <feFuncB type="table" tableValues={classic.b} />
          </feComponentTransfer>
          <feSpecularLighting
            in="lum"
            surfaceScale="1.4"
            specularConstant="0.55"
            specularExponent="14"
            lightingColor="#fff6d8"
            result="emboss"
          >
            <fePointLight x="-40" y="-60" z="90" />
          </feSpecularLighting>
          <feComposite in="emboss" in2="tinted" operator="arithmetic" k1="0" k2="1" k3="0.7" k4="0" result="lit" />
          <feComposite in="lit" in2="SourceAlpha" operator="in" />
        </filter>
        <linearGradient id="gilded-plaque" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a2a10" />
          <stop offset="45%" stopColor="#6e5223" />
          <stop offset="70%" stopColor="#4a3512" />
          <stop offset="100%" stopColor="#2a1d0a" />
        </linearGradient>
        <linearGradient id="gilded-plaque-active" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7a5a20" />
          <stop offset="40%" stopColor="#c99b45" />
          <stop offset="62%" stopColor="#f4d67e" />
          <stop offset="100%" stopColor="#8a6428" />
        </linearGradient>
        <linearGradient id="gilded-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#efd9a0" />
          <stop offset="50%" stopColor="#8a6a2f" />
          <stop offset="100%" stopColor="#e2c377" />
        </linearGradient>
      </defs>
    </svg>
  );
}