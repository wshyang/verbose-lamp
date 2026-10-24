interface OrbitHintProps {
  isVisible: boolean;
}

export function OrbitHint({ isVisible }: OrbitHintProps) {
  if (!isVisible) return null;
  return (
    <p className="pointer-events-none absolute left-1/2 top-22 z-20 -translate-x-1/2 border border-[#f8e29b]/45 bg-[#09070d]/85 px-4 py-1.5 text-center text-[11px] uppercase tracking-[0.2em] text-[#fff4d4] shadow-[0_0_24px_rgba(212,175,55,0.2)] backdrop-blur-sm">
      Drag to Orbit 3D Gold Lattice · Scroll to Zoom · Click Any Act Below
    </p>
  );
}