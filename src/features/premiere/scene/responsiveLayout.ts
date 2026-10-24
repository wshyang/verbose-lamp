export interface ViewportFit {
  aspect: number;
  isMobile: boolean;
  cardScale: number;
  cameraPullback: number;
}

export interface PointerAim {
  x: number;
  y: number;
}

export interface CinemaCameraPose {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  roll: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function resolveViewportFit(width: number, height: number, hasCoarsePointer: boolean): ViewportFit {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;
  const isMobile = hasCoarsePointer && Math.min(safeWidth, safeHeight) <= 1024;
  return {
    aspect,
    isMobile,
    cardScale: isMobile ? clamp(aspect / 0.9, 0.3, 1) : 1,
    cameraPullback: clamp((1.65 - aspect) * 6.5, 0, 5.8),
  };
}

export function getCinemaCameraPose(
  viewport: ViewportFit,
  pointer: PointerAim,
  elapsed: number
): CinemaCameraPose {
  if (viewport.isMobile) return { x: 0, y: 0, targetX: 0, targetY: 0, roll: 0 };
  return {
    x: Math.sin(elapsed * 0.42) * 0.09 + pointer.x * 0.56,
    y: 0.14 + Math.cos(elapsed * 0.35) * 0.06 + pointer.y * 0.36,
    targetX: pointer.x * 0.18,
    targetY: -0.18 + pointer.y * 0.12,
    roll: -pointer.x * 0.018,
  };
}