import React, { useId } from 'react';
import { buildGoldenQrIds, GoldenQrDefs } from './GoldenQrDefs';
import type { QrRenderPlan } from './types';

interface GoldenQrCodeProps {
  plan: QrRenderPlan;
  caption?: string;
  isShimmering?: boolean;
  svgRef?: React.Ref<SVGSVGElement>;
  className?: string;
  testId?: string;
}

/** Extra vertical band, in module units, reserved beneath the symbol for a caption. */
const CAPTION_BAND = 3.2;
const BORDER_INSET = 1;
const BRACKET_ARM = 1.4;

interface SymbolLayerProps {
  plan: QrRenderPlan;
  fill: string;
  opacity?: number;
  filter?: string;
}

/** The three gold paths (modules, finder rings, finder cores) drawn with one fill. */
const SymbolLayer: React.FC<SymbolLayerProps> = ({ plan, fill, opacity, filter }) => (
  <g fill={fill} opacity={opacity} filter={filter}>
    <path d={plan.modulePath} />
    <path d={plan.finderPaths.ring} fillRule="evenodd" />
    <path d={plan.finderPaths.core} />
  </g>
);

interface DecoBorderProps {
  width: number;
  height: number;
}

function bracketPath(x: number, y: number, dx: number, dy: number): string {
  return `M${x + dx * BRACKET_ARM} ${y}L${x} ${y}L${x} ${y + dy * BRACKET_ARM}`;
}

const DecoBorder: React.FC<DecoBorderProps> = ({ width, height }) => {
  const left = BORDER_INSET;
  const top = BORDER_INSET;
  const right = width - BORDER_INSET;
  const bottom = height - BORDER_INSET;
  const brackets = [
    bracketPath(left, top, 1, 1),
    bracketPath(right, top, -1, 1),
    bracketPath(left, bottom, 1, -1),
    bracketPath(right, bottom, -1, -1),
  ].join('');
  return (
    <g fill="none" strokeLinecap="square">
      <rect x={left} y={top} width={right - left} height={bottom - top} stroke="#d4af37" strokeOpacity={0.32} strokeWidth={0.07} />
      <path d={brackets} stroke="#f8e29b" strokeOpacity={0.75} strokeWidth={0.22} />
    </g>
  );
};

export const GoldenQrCode: React.FC<GoldenQrCodeProps> = ({
  plan,
  caption = '',
  isShimmering = true,
  svgRef,
  className,
  testId,
}) => {
  const ids = buildGoldenQrIds(useId());
  const hasCaption = caption.trim().length > 0;
  const width = plan.viewBox;
  const height = plan.viewBox + (hasCaption ? CAPTION_BAND : 0);

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="geometricPrecision"
      role="img"
      aria-label={hasCaption ? `Golden QR code: ${caption}` : 'Golden QR code'}
      className={className}
      data-testid={testId}
    >
      <GoldenQrDefs ids={ids} viewBox={width} isShimmering={isShimmering} />

      <rect width={width} height={height} fill={`url(#${ids.plaque})`} />
      <DecoBorder width={width} height={height} />

      <SymbolLayer plan={plan} fill="#d4af37" opacity={0.6} filter={`url(#${ids.glow})`} />
      <SymbolLayer plan={plan} fill={`url(#${ids.gold})`} />
      <SymbolLayer plan={plan} fill="#2a1c05" filter={`url(#${ids.brush})`} />
      <SymbolLayer plan={plan} fill={`url(#${ids.sheen})`} />

      {hasCaption ? (
        <text
          x={width / 2}
          y={plan.viewBox + CAPTION_BAND * 0.42}
          textAnchor="middle"
          fontFamily="Cinzel, Marcellus, Georgia, serif"
          fontSize={1.15}
          letterSpacing={0.2}
          fill={`url(#${ids.gold})`}
        >
          {caption.toUpperCase()}
        </text>
      ) : null}
    </svg>
  );
};
