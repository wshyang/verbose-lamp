/** Class names for a toggle chip; the active state is also announced with aria-pressed by callers. */
export const chip = (active: boolean): string =>
  `cursor-pointer border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-1 ${
    active
      ? 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc]'
      : 'border-[#d4af37]/25 bg-[#0f0b16] text-[#d4af37]/80 hover:border-[#f8e29b]/70 hover:text-[#f5e7c6]'
  }`;

export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-2';
