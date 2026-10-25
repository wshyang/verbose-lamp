import type { LayerGroup } from '../hooks/useDecoLatticePaths';

interface BrassDefsProps {
  uid: string;
  groups: readonly LayerGroup[];
}

/** Per-layer brass gradients (seeded angles) and the layered drop shadow. */
export function BrassDefs({ uid, groups }: BrassDefsProps) {
  return (
    <defs>
      {groups.map((group) => (
        <linearGradient
          key={group.layer}
          id={`${uid}-brass-${group.layer}`}
          gradientTransform={`rotate(${group.brassAngle} 0.5 0.5)`}
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
  );
}
