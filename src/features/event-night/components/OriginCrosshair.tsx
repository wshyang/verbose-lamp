interface OriginCrosshairProps {
  origin: { x: number; y: number };
  isPicking: boolean;
}

/** Marks where origin-driven effects will start; pulses while picking. */
export function OriginCrosshair({ origin, isPicking }: OriginCrosshairProps) {
  const ringClass = isPicking ? 'animate-pulse border-[#fff3d0]' : 'border-[#d9b264]/80';
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${origin.x * 100}%`, top: `${origin.y * 100}%` }}
      data-testid="event-night__origin-crosshair"
      aria-hidden="true"
    >
      <div className={`h-8 w-8 rounded-full border ${ringClass}`}>
        <span className="absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2 bg-[#d9b264]/60" />
        <span className="absolute left-1/2 top-1/2 h-10 w-px -translate-y-1/2 bg-[#d9b264]/60" />
      </div>
      <p className="mt-1 text-center text-[8px] tracking-[0.3em] text-[#d9b264]">ORIGIN</p>
    </div>
  );
}
