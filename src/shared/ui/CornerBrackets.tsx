interface CornerBracketsProps {
  /** Tailwind size classes for each bracket, e.g. `w-4 h-4`. */
  sizeClass: string;
}

const CORNERS = [
  { position: 'top-2 left-2', edges: 'border-t-2 border-l-2' },
  { position: 'top-2 right-2', edges: 'border-t-2 border-r-2' },
  { position: 'bottom-2 left-2', edges: 'border-b-2 border-l-2' },
  { position: 'bottom-2 right-2', edges: 'border-b-2 border-r-2' },
] as const;

/** The four Art Deco corner marks that frame a modal. Decorative, so hidden from pointer and reader. */
export function CornerBrackets({ sizeClass }: CornerBracketsProps) {
  return (
    <>
      {CORNERS.map(({ position, edges }) => (
        <span
          key={position}
          className={`pointer-events-none absolute ${position} ${sizeClass} ${edges} border-[#f8e29b]/70`}
        />
      ))}
    </>
  );
}
