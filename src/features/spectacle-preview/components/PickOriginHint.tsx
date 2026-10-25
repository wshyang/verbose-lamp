interface PickOriginHintProps {
  testId?: string;
}

/** Shown while the host is choosing an effect origin by clicking the stage. */
export function PickOriginHint({ testId = 'spectacle-preview__pick-hint' }: PickOriginHintProps) {
  return (
    <p
      className="pointer-events-none absolute inset-x-0 top-16 z-20 text-center text-[10px] tracking-[0.35em] text-[#f2d38a]"
      data-testid={testId}
    >
      CLICK ANYWHERE ON THE STAGE TO SET THE ORIGIN
    </p>
  );
}
