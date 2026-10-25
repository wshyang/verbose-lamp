import '../gildedUi.css';
import { chamferPlaque } from '../model/plaqueGeometry';
import { GildedGlyph, type GlyphInput } from './GildedGlyph';

export type TileState = 'idle' | 'active' | 'disabled';

interface GildedTileProps {
  glyph: GlyphInput;
  label: string;
  state?: TileState;
  onSelect?: () => void;
  testId?: string;
  current?: boolean;
}

/** Chamfered Deco plaque with pinstripe and an engraved label. Render only. */
export function GildedTile({ glyph, label, state = 'idle', onSelect, testId, current }: GildedTileProps) {
  const active = state === 'active';
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={state === 'disabled'}
      data-testid={testId}
      aria-current={current ? 'page' : undefined}
      className={`group relative flex min-w-16 flex-col items-center gap-0.5 px-3 pb-1.5 pt-2 outline-none transition-transform duration-200 focus-visible:ring-1 focus-visible:ring-[#f2d38a] ${
        state === 'disabled' ? 'opacity-40' : 'hover:-translate-y-0.5'
      }`}
    >
      <svg viewBox="0 0 100 84" className="absolute inset-0 h-full w-full" aria-hidden="true" preserveAspectRatio="none">
        <path
          d={chamferPlaque(100, 84, 12)}
          fill={active ? 'url(#gilded-plaque-active)' : 'url(#gilded-plaque)'}
          stroke="url(#gilded-edge)"
          strokeWidth="1.6"
        />
        <g transform="translate(4 4)">
          <path d={chamferPlaque(92, 76, 9)} fill="none" stroke={active ? '#fff0c2' : '#a8853f'} strokeWidth="0.8" opacity="0.7" />
        </g>
      </svg>
      {active && <span className="gilded-sheen pointer-events-none absolute inset-0" aria-hidden="true" />}
      <span className={`relative transition ${active ? 'drop-shadow-[0_0_6px_rgba(255,230,160,0.6)]' : 'opacity-90'}`}>
        <GildedGlyph glyph={glyph} size={34} />
      </span>
      <span
        className={`relative font-body text-[10px] font-medium tracking-[0.14em] ${
          active ? 'text-[#2a1a06]' : 'text-[#e3c078]'
        }`}
        style={active ? undefined : { textShadow: '0 1px 0 rgba(0,0,0,0.8)' }}
      >
        {label.toUpperCase()}
      </span>
      {active && <span className="relative mt-0.5 h-0.5 w-6 bg-[#3a2708]" aria-hidden="true" />}
    </button>
  );
}