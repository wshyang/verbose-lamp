const BACKDROP_GRADIENT =
  'radial-gradient(ellipse 90% 65% at 50% 38%, #1c1206 0%, #0d0803 55%, #050302 100%)';

/** The ballroom's warm dark gradient, behind every other layer. */
export function StageBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: BACKDROP_GRADIENT }}
      aria-hidden="true"
    />
  );
}
