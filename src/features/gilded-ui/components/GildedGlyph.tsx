export type GlyphInput = { kind: 'emoji'; emoji: string } | { kind: 'svg'; path: string };

interface GildedGlyphProps {
  glyph: GlyphInput;
  size?: number;
  className?: string;
}

/** An emoji or SVG path, gilded live through the shared filter chain. */
export function GildedGlyph({ glyph, size = 40, className = '' }: GildedGlyphProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {glyph.kind === 'emoji' ? (
        <text x="32" y="46" textAnchor="middle" fontSize="44" filter="url(#gilded-glyph)">
          {glyph.emoji}
        </text>
      ) : (
        <g transform="translate(8 8) scale(2)" filter="url(#gilded-glyph)">
          <path
            d={glyph.path}
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}