import { useId, useMemo, type ReactNode } from 'react';
import { hash01 } from '@/shared/lib/random';
import { buildDecoLattice, type DecoLatticeRequest } from '../model/composition';
import { specsToLayerPaths } from '../model/latticeSvg';

interface DecoLatticeFrameProps {
  request?: Partial<DecoLatticeRequest>;
  className?: string;
  children?: ReactNode;
}

const LAYER_OPACITY = [1, 0.95, 0.85, 0.78] as const;

function brassAngle(seed: number, layer: number): number {
  return Math.round(hash01(seed, layer * 17 + 3) * 360);
}

/**
 * The film's octilinear line-bundle frame as live SVG with the tutorial's
 * brass finish: per-layer gradient angles, chisel edge, layered shadow.
 */
export function DecoLatticeFrame({ request, className = '', children }: DecoLatticeFrameProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const req: DecoLatticeRequest = {
    mode: request?.mode ?? 'medallion',
    hw: request?.hw ?? 1,
    hh: request?.hh ?? 1,
    seed: request?.seed ?? 1925,
    density: request?.density ?? 0.7,
    level: request?.level ?? 4,
  };
  const geometry = useMemo(
    () => buildDecoLattice(req),
    [req.mode, req.hw, req.hh, req.seed, req.density, req.level],
  );
  const paths = useMemo(() => specsToLayerPaths(geometry.specs), [geometry]);
  const margin = 0.06;
  const viewBox = `${-req.hw - margin} ${-req.hh - margin} ${2 * (req.hw + margin)} ${2 * (req.hh + margin)}`;

  return (
    <div className={`relative ${className}`} data-testid="deco-lattice-frame">
      <svg
        viewBox={viewBox}
        preserveAspectRatio={req.mode === 'frame' ? 'none' : 'xMidYMid meet'}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          {[0, 1, 2, 3].map((layer) => (
            <linearGradient
              key={layer}
              id={`${uid}-brass-${layer}`}
              gradientTransform={`rotate(${brassAngle(req.seed ?? 1925, layer)} 0.5 0.5)`}
            >
              <stop offset="0%" stopColor="#775320" />
              <stop offset="38%" stopColor="#ba9c72" />
              <stop offset="55%" stopColor="#e6cf9d" />
              <stop offset="72%" stopColor="#a98a58" />
              <stop offset="100%" stopColor="#775320" />
            </linearGradient>
          ))}
          <filter id={`${uid}-depth`} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="0.006" stdDeviation="0.005" floodColor="#000000" floodOpacity="0.65" />
          </filter>
        </defs>
        {[3, 2, 1, 0].map((layer) => (
          <g key={layer} filter={layer === 0 ? `url(#${uid}-depth)` : undefined} opacity={LAYER_OPACITY[layer]}>
            {paths
              .filter((p) => p.layer === layer)
              .map((p, i) => (
                <path
                  key={i}
                  d={p.d}
                  fill="none"
                  stroke={`url(#${uid}-brass-${layer})`}
                  strokeWidth={p.width}
                  strokeLinejoin="miter"
                  strokeLinecap="butt"
                />
              ))}
          </g>
        ))}
      </svg>
      {children}
    </div>
  );
}