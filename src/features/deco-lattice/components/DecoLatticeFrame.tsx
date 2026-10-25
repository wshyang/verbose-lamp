import type { ReactNode } from 'react';
import type { DecoLatticeRequest } from '../model/composition';
import { useDecoLatticePaths } from '../hooks/useDecoLatticePaths';
import { BrassDefs } from './BrassDefs';

interface DecoLatticeFrameProps {
  request?: Partial<DecoLatticeRequest>;
  className?: string;
  children?: ReactNode;
}

const LAYER_OPACITY = [1, 0.95, 0.85, 0.78] as const;

/**
 * The film's octilinear line-bundle frame as live SVG with the tutorial's
 * brass finish: per-layer gradient angles, chisel edge, layered shadow.
 */
export function DecoLatticeFrame({ request, className = '', children }: DecoLatticeFrameProps) {
  const { uid, groups, viewBox, aspectMode } = useDecoLatticePaths(request);

  return (
    <div className={`relative ${className}`} data-testid="deco-lattice-frame__root">
      <svg
        viewBox={viewBox}
        preserveAspectRatio={aspectMode}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <BrassDefs uid={uid} groups={groups} />
        {groups.map((group) => (
          <g
            key={group.layer}
            filter={group.layer === 0 ? `url(#${uid}-depth)` : undefined}
            opacity={LAYER_OPACITY[group.layer]}
          >
            {group.paths.map((p, i) => (
              <path
                key={i}
                d={p.d}
                fill="none"
                stroke={`url(#${uid}-brass-${group.layer})`}
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
