import { useId } from 'react';
import { CHOP_WORD, type ChopSpec } from '../../lib/passport/chop.js';
import type { ArtworkArc, ArtworkLettering, ArtworkPath } from '../../lib/passport/chopArtwork.js';

/**
 * ADR-241 / ADR-242 — one impression of the passport chop, drawn as SVG.
 *
 * The component is a renderer for a `ChopSpec` and nothing more: it lays out the primitives the
 * die returned, then roughens the edge, starves the ink and presses it unevenly. No die name
 * appears in here, which is what lets nine designs share one wear and one set of tests.
 *
 * It carries the one word a participant needs, so it is labelled `role="img"` with that word, not
 * hidden from assistive technology. The station's own name is printed on the die too, as art: the
 * row already says it, so the label does not repeat it.
 */

/** The cell every die is drawn into, matching `CELL` in `chopGeo.ts`. */
const VIEW_BOX = '-100 -60 200 120';

/** Wide enough that a filter or mask never clips the impression, however it is placed. */
const REGION = { x: -120, y: -80, width: 240, height: 160 };

/** How steeply the ink's alpha rises with the noise: steep enough that a hole has an edge. */
const ALPHA_GAIN = 8;

/**
 * The face the type is set in. A stamp's lettering is a heavy grotesque, and this is the one
 * every phone already has; the weight comes from the die, not from a font file.
 */
const TYPE_FACE = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";

interface ChopIds {
  edge: string;
  mask: string;
  pressure: string;
  die: string;
  knock: string;
  arc: (index: number) => string;
}

/** A feColorMatrix that sets alpha from the first noise channel: holes where the noise is low. */
function starveMatrix(threshold: number): string {
  const zeros = '0 0 0 0 0';
  return `${zeros} ${zeros} ${zeros} ${ALPHA_GAIN} 0 0 0 ${-ALPHA_GAIN * threshold}`;
}

/** The filter that roughens and starves the ink, the gradient that presses it unevenly, and the mask. */
function ChopFilters(props: { ids: ChopIds; chop: ChopSpec }) {
  const { ids, chop } = props;
  const { edge, starve, pressure } = chop;
  const shade = Math.round(pressure.floor * 255);
  return (
    <>
      <filter
        id={ids.edge}
        filterUnits="userSpaceOnUse"
        x={REGION.x}
        y={REGION.y}
        width={REGION.width}
        height={REGION.height}
      >
        <feTurbulence type="fractalNoise" baseFrequency={edge.frequency} numOctaves={2} seed={edge.seed} result="warp" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="warp"
          scale={edge.scale}
          xChannelSelector="R"
          yChannelSelector="G"
          result="edged"
        />
        <feTurbulence
          type="fractalNoise"
          baseFrequency={starve.frequency}
          numOctaves={3}
          seed={starve.seed}
          result="grain"
        />
        <feColorMatrix in="grain" type="matrix" values={starveMatrix(starve.threshold)} result="pad" />
        <feComposite in="edged" in2="pad" operator="in" />
      </filter>
      <linearGradient
        id={ids.pressure}
        gradientUnits="userSpaceOnUse"
        x1={pressure.x1}
        y1={pressure.y1}
        x2={pressure.x2}
        y2={pressure.y2}
      >
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor={`rgb(${shade}, ${shade}, ${shade})`} />
      </linearGradient>
      <mask id={ids.mask} maskUnits="userSpaceOnUse" x={REGION.x} y={REGION.y} width={REGION.width} height={REGION.height}>
        <rect {...REGION} fill={`url(#${ids.pressure})`} />
      </mask>
    </>
  );
}

/** One line of the die's type. `y` and `rotate` carry one value per character. */
function ChopLine(props: { line: ArtworkLettering; fill: string }) {
  const { line } = props;
  return (
    <text
      x={line.x}
      y={line.y.join(' ')}
      rotate={line.rotate.join(' ')}
      textLength={line.length}
      lengthAdjust="spacing"
      fontSize={line.size}
      fontWeight={line.weight}
      fontFamily={TYPE_FACE}
      fill={props.fill}
    >
      {line.content}
    </text>
  );
}

/** One line of type run along a curve, centred on the path the die drew for it. */
function ChopArcLine(props: { arc: ArtworkArc; pathId: string }) {
  const { arc, pathId } = props;
  return (
    <text fontSize={arc.size} fontWeight={arc.weight} fontFamily={TYPE_FACE} fill="currentColor">
      <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
        {arc.content}
      </textPath>
    </text>
  );
}

function ChopShape(props: { shape: ArtworkPath; pen: string; mask?: string | undefined }) {
  const { shape } = props;
  const dash = shape.dash ? `${shape.dash.on} ${shape.dash.off}` : undefined;
  return (
    <path
      d={shape.d}
      fill={shape.fill === 'ink' ? 'currentColor' : 'none'}
      stroke={shape.width > 0 ? (shape.stroke === 'pen' ? props.pen : 'currentColor') : 'none'}
      strokeWidth={shape.width}
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={dash}
      strokeDashoffset={shape.dash?.offset}
      mask={props.mask}
    />
  );
}

/** Everything the die drew: the panels first, then the lines, then the type on top of both. */
function ChopDie(props: { id: string; ids: ChopIds; chop: ChopSpec }) {
  const { id, ids, chop } = props;
  const { artwork, penInk } = chop;
  const knockout = artwork.knocked.length > 0 ? `url(#${ids.knock})` : undefined;
  return (
    <g id={id}>
      {artwork.panels.map((panel, index) => (
        <ChopShape key={`panel${index}`} shape={panel} pen={penInk} mask={knockout} />
      ))}
      {artwork.frame ? <ChopShape shape={artwork.frame} pen={penInk} /> : null}
      {artwork.paths.map((path, index) => (
        <ChopShape key={`path${index}`} shape={path} pen={penInk} />
      ))}
      {artwork.lettering.map((line, index) => (
        <ChopLine key={`line${index}`} line={line} fill="currentColor" />
      ))}
      {artwork.arcs.map((arc, index) => (
        <ChopArcLine key={`arc${index}`} arc={arc} pathId={ids.arc(index)} />
      ))}
    </g>
  );
}

/** The holes punched in a panel: the same type, drawn in black inside a white mask. */
function ChopKnockout(props: { id: string; knocked: readonly ArtworkLettering[] }) {
  return (
    <mask id={props.id} maskUnits="userSpaceOnUse" x={REGION.x} y={REGION.y} width={REGION.width} height={REGION.height}>
      <rect {...REGION} fill="#ffffff" />
      {props.knocked.map((line, index) => (
        <ChopLine key={index} line={line} fill="#000000" />
      ))}
    </mask>
  );
}

export function PassportChop(props: { chop: ChopSpec; decorative?: boolean }) {
  const { chop } = props;
  // A React id can hold characters an id selector cannot; keep letters and digits only.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ids: ChopIds = {
    edge: `${uid}-edge`,
    mask: `${uid}-mask`,
    pressure: `${uid}-pressure`,
    die: `${uid}-die`,
    knock: `${uid}-knock`,
    arc: (index) => `${uid}-arc${index}`,
  };
  const { placement, ghost, artwork } = chop;
  const transform = `translate(${placement.dx} ${placement.dy}) rotate(${placement.rotation}) skewX(${placement.skew}) scale(${placement.scale})`;

  return (
    <svg
      className="gb-chop"
      viewBox={VIEW_BOX}
      overflow="visible"
      role={props.decorative === true ? undefined : 'img'}
      aria-label={props.decorative === true ? undefined : CHOP_WORD}
      aria-hidden={props.decorative === true ? true : undefined}
      data-testid="passport-chop__mark"
      data-die={chop.die}
    >
      <defs>
        <ChopFilters ids={ids} chop={chop} />
        <ChopKnockout id={ids.knock} knocked={artwork.knocked} />
        {artwork.arcs.map((arc, index) => (
          <path key={index} id={ids.arc(index)} d={arc.path} fill="none" stroke="none" />
        ))}
        <ChopDie id={ids.die} ids={ids} chop={chop} />
      </defs>
      <g transform={transform} color={chop.ink} opacity={chop.inkOpacity}>
        <g mask={`url(#${ids.mask})`}>
          <g filter={`url(#${ids.edge})`}>
            <use href={`#${ids.die}`} />
          </g>
        </g>
        {ghost ? (
          <use href={`#${ids.die}`} transform={`translate(${ghost.dx} ${ghost.dy})`} opacity={ghost.opacity} />
        ) : null}
      </g>
    </svg>
  );
}
