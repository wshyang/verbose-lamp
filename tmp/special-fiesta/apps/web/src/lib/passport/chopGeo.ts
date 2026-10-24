/**
 * ADR-242 — the geometry a die is drawn from.
 *
 * Nothing in this file knows what a stamp looks like. These are the shapes a die is composed
 * from, in a coordinate system centred on the origin so that a turn or a tilt pivots where the
 * stamp was pressed rather than at a corner of the page.
 *
 * Two rules hold everywhere here. Every number is rounded to two decimals, so the markup one
 * seed produces is stable text rather than a float that differs between machines. And every
 * shape is built around `CELL`, the page the stamp lands on: a die may fill it or sit in the
 * middle of it, but `chopDies.test.ts` holds that no die draws outside it.
 */

/** The cell a chop is drawn into: the view box of `PassportChop`, centred on the origin. */
export const CELL = { width: 200, height: 120 } as const;

export interface Point {
  readonly x: number;
  readonly y: number;
}

const PLACES = 100;
const DEGREES = Math.PI / 180;

/** How deep a star's waist is, as a share of its reach. The ratio on a flag. */
const STAR_INNER_RATIO = 0.42;

/** Two decimals, no trailing zeros: one seed, one string, on every engine. */
function n(value: number): string {
  return (Math.round(value * PLACES) / PLACES).toFixed(2).replace(/\.?0+$/u, '');
}

function pair(x: number, y: number): string {
  return `${n(x)} ${n(y)}`;
}

const ORIGIN: Point = { x: 0, y: 0 };

/**
 * A point on a circle around `centre`. Angles are degrees with the y axis pointing down, which is
 * how SVG draws them: -90° is the top.
 */
function pointOn(radius: number, degrees: number, centre: Point = ORIGIN): Point {
  return {
    x: centre.x + radius * Math.cos(degrees * DEGREES),
    y: centre.y + radius * Math.sin(degrees * DEGREES),
  };
}

function through(points: readonly Point[], close: string): string {
  const head = points[0] as Point;
  const body = points.slice(1).map((point) => `L ${pair(point.x, point.y)}`).join(' ');
  return `M ${pair(head.x, head.y)} ${body}${close}`;
}

/** A ring of straight edges, closed. */
function closedPath(points: readonly Point[]): string {
  return through(points, ' Z');
}

/** An open run of straight edges: a line somebody drew, not a shape. */
function openPath(points: readonly Point[]): string {
  return through(points, '');
}

export interface RectSpec {
  readonly width: number;
  readonly height: number;
  readonly corner?: number;
  readonly cx?: number;
  readonly cy?: number;
}

/** A rectangle, optionally with rounded corners, centred on `cx`/`cy`. */
export function roundedRectPath(spec: RectSpec): string {
  const halfWidth = spec.width / 2;
  const halfHeight = spec.height / 2;
  const cx = spec.cx ?? 0;
  const cy = spec.cy ?? 0;
  const corner = Math.min(spec.corner ?? 0, halfWidth, halfHeight);
  const x = (value: number) => n(value + cx);
  const y = (value: number) => n(value + cy);
  if (corner <= 0) {
    return `M ${x(-halfWidth)} ${y(-halfHeight)} H ${x(halfWidth)} V ${y(halfHeight)} H ${x(-halfWidth)} Z`;
  }
  const arc = (toX: number, toY: number) => `A ${n(corner)} ${n(corner)} 0 0 1 ${x(toX)} ${y(toY)}`;
  return [
    `M ${x(-halfWidth + corner)} ${y(-halfHeight)}`,
    `H ${x(halfWidth - corner)}`,
    arc(halfWidth, -halfHeight + corner),
    `V ${y(halfHeight - corner)}`,
    arc(halfWidth - corner, halfHeight),
    `H ${x(-halfWidth + corner)}`,
    arc(-halfWidth, halfHeight - corner),
    `V ${y(-halfHeight + corner)}`,
    arc(-halfWidth + corner, -halfHeight),
    'Z',
  ].join(' ');
}

export interface EllipseSpec {
  readonly radiusX: number;
  readonly radiusY: number;
  readonly cx?: number;
  readonly cy?: number;
}

/** Two half-ellipses, which is how a circle or an oval is written when there is no `<ellipse>`. */
export function ellipsePath(spec: EllipseSpec): string {
  const cx = spec.cx ?? 0;
  const cy = spec.cy ?? 0;
  const left = n(-spec.radiusX + cx);
  const right = n(spec.radiusX + cx);
  const arc = `A ${n(spec.radiusX)} ${n(spec.radiusY)} 0 0 1`;
  return `M ${left} ${n(cy)} ${arc} ${right} ${n(cy)} ${arc} ${left} ${n(cy)} Z`;
}

/** A circle on the origin. A ring that sits off centre is an `ellipsePath` with equal radii. */
export function circlePath(radius: number): string {
  return ellipsePath({ radiusX: radius, radiusY: radius });
}

export interface PolygonSpec {
  readonly radius: number;
  readonly sides: number;
  /** Degrees. 0 puts the first vertex on the right; a hexagon and an octagon want something else. */
  readonly rotation?: number;
}

/** A regular polygon, centred on the origin. Hexagons and octagons are the border dies. */
export function polygonPath(spec: PolygonSpec): string {
  const points = Array.from({ length: spec.sides }, (_unused, index) =>
    pointOn(spec.radius, (spec.rotation ?? 0) + (360 / spec.sides) * index),
  );
  return closedPath(points);
}

export interface StarSpec {
  readonly cx: number;
  readonly cy: number;
  readonly outer: number;
  readonly inner: number;
  readonly points: number;
  readonly rotation?: number;
}

/** A star with one point at `-90°` by default, so the ring of them all stands up straight. */
export function starPath(spec: StarSpec): string {
  const steps = spec.points * 2;
  const centre = { x: spec.cx, y: spec.cy };
  const points = Array.from({ length: steps }, (_unused, index) =>
    pointOn(
      index % 2 === 0 ? spec.outer : spec.inner,
      (spec.rotation ?? -90) + (360 / steps) * index,
      centre,
    ),
  );
  return closedPath(points);
}

export interface StarRingSpec {
  readonly count: number;
  readonly radius: number;
  readonly size: number;
}

/** The twelve stars of a union circle: one path, one subpath per star, every star standing up. */
export function starRingPath(spec: StarRingSpec): string {
  const inner = spec.size * STAR_INNER_RATIO;
  return Array.from({ length: spec.count }, (_unused, index) => {
    const centre = pointOn(spec.radius, -90 + (360 / spec.count) * index);
    return starPath({ cx: centre.x, cy: centre.y, outer: spec.size, inner, points: 5 });
  }).join(' ');
}

export interface TickSpec {
  readonly count: number;
  readonly inner: number;
  readonly outer: number;
  readonly rotation?: number;
}

/** Radial ticks between two circles: the engine-turned edge of a vignette or a seal. */
export function ticksPath(spec: TickSpec): string {
  return Array.from({ length: spec.count }, (_unused, index) => {
    const angle = (spec.rotation ?? 0) + (360 / spec.count) * index;
    const from = pointOn(spec.inner, angle);
    const to = pointOn(spec.outer, angle);
    return `M ${pair(from.x, from.y)} L ${pair(to.x, to.y)}`;
  }).join(' ');
}

export interface WaveSpec {
  readonly fromX: number;
  readonly toX: number;
  readonly y: number;
  readonly amplitude: number;
  readonly waves: number;
}

/** The cancellation lines of a postmark: a sine written as one cubic per half wave. */
export function wavyPath(spec: WaveSpec): string {
  const step = (spec.toX - spec.fromX) / spec.waves;
  const parts = [`M ${n(spec.fromX)} ${n(spec.y)}`];
  for (let index = 0; index < spec.waves; index += 1) {
    const start = spec.fromX + step * index;
    const lift = index % 2 === 0 ? -spec.amplitude : spec.amplitude;
    parts.push(
      `C ${n(start + step / 3)} ${n(spec.y + lift)} ${n(start + (2 * step) / 3)} ${n(spec.y + lift)} ` +
        `${n(start + step)} ${n(spec.y)}`,
    );
  }
  return parts.join(' ');
}

export interface BracketSpec {
  readonly width: number;
  readonly height: number;
  readonly arm: number;
}

/** Four corner marks and nothing between them: the frame a lazy printer leaves unfinished. */
export function bracketPath(spec: BracketSpec): string {
  const halfWidth = spec.width / 2;
  const halfHeight = spec.height / 2;
  const arms = [
    `M ${n(-halfWidth)} ${n(-halfHeight + spec.arm)} V ${n(-halfHeight)} H ${n(-halfWidth + spec.arm)}`,
    `M ${n(halfWidth - spec.arm)} ${n(-halfHeight)} H ${n(halfWidth)} V ${n(-halfHeight + spec.arm)}`,
    `M ${n(halfWidth)} ${n(halfHeight - spec.arm)} V ${n(halfHeight)} H ${n(halfWidth - spec.arm)}`,
    `M ${n(-halfWidth + spec.arm)} ${n(halfHeight)} H ${n(-halfWidth)} V ${n(halfHeight - spec.arm)}`,
  ];
  return arms.join(' ');
}

export interface BlobSpec {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly lobes: number;
  readonly lumpiness: number;
}

/**
 * An irregular closed pool: ink spat out at the edge of a slab, or a thumb that steadied the page.
 * The lumps are a sine of the angle, so the shape comes from its numbers alone and no random
 * draw is involved.
 */
export function blobPath(spec: BlobSpec): string {
  const steps = Math.max(12, spec.lobes * 8);
  const centre = { x: spec.cx, y: spec.cy };
  const points = Array.from({ length: steps }, (_unused, index) => {
    const angle = (360 / steps) * index;
    const swell = 1 + spec.lumpiness * Math.sin(angle * DEGREES * spec.lobes);
    return pointOn(spec.radius * swell, angle, centre);
  });
  const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = middle(points[steps - 1] as Point, points[0] as Point);
  const parts = [`M ${pair(start.x, start.y)}`];
  for (let index = 0; index < steps; index += 1) {
    const point = points[index] as Point;
    const next = points[(index + 1) % steps] as Point;
    const to = middle(point, next);
    parts.push(`Q ${n(point.x)} ${n(point.y)} ${n(to.x)} ${n(to.y)}`);
  }
  return `${parts.join(' ')} Z`;
}

export interface ScrawlSpec {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly loops: number;
}

/**
 * A pen date over a printed line: a prolate cycloid, which loops the way a hurried hand does.
 * No randomness — the shape is a function of the numbers the die was given.
 */
export function scrawlPath(spec: ScrawlSpec): string {
  const steps = spec.loops * 10;
  const radius = spec.height / 2;
  const points = Array.from({ length: steps + 1 }, (_unused, index) => {
    const t = index / steps;
    const angle = t * spec.loops * 2 * Math.PI;
    return {
      x: spec.x + spec.width * t + radius * Math.cos(angle),
      y: spec.y - radius * Math.sin(angle),
    };
  });
  return openPath(points);
}

export interface ArcSpec {
  readonly radius: number;
  readonly from: number;
  readonly to: number;
  readonly cx?: number;
  readonly cy?: number;
}

/**
 * The path a curved line of type runs along. Increasing angle is clockwise on screen, which is
 * how SVG wants its sweep flag: a top arc from -140° to -40° reads left to right over the top,
 * and a bottom arc from 140° to 40° reads left to right under the bottom.
 */
export function arcPath(spec: ArcSpec): string {
  const cx = spec.cx ?? 0;
  const cy = spec.cy ?? 0;
  const centre = { x: cx, y: cy };
  const from = pointOn(spec.radius, spec.from, centre);
  const to = pointOn(spec.radius, spec.to, centre);
  const large = Math.abs(spec.to - spec.from) > 180 ? 1 : 0;
  const sweep = spec.to > spec.from ? 1 : 0;
  return `M ${pair(from.x, from.y)} A ${n(spec.radius)} ${n(spec.radius)} 0 ${large} ${sweep} ${pair(to.x, to.y)}`;
}

/** A straight rule, the commonest ornament on a die: the line under the header band. */
export function rulePath(fromX: number, toX: number, y: number): string {
  return `M ${n(fromX)} ${n(y)} L ${n(toX)} ${n(y)}`;
}

export function rectPerimeter(spec: { width: number; height: number; corner?: number }): number {
  const corner = Math.min(spec.corner ?? 0, spec.width / 2, spec.height / 2);
  return (
    2 * (spec.width - 2 * corner) + 2 * (spec.height - 2 * corner) + 2 * Math.PI * corner
  );
}

export function circlePerimeter(radius: number): number {
  return 2 * Math.PI * radius;
}

/** Ramanujan's approximation, which is within a hair of the true length of an ellipse. */
export function ellipsePerimeter(radiusX: number, radiusY: number): number {
  const a = radiusX;
  const b = radiusY;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

export function polygonPerimeter(spec: { radius: number; sides: number }): number {
  return spec.sides * 2 * spec.radius * Math.sin(Math.PI / spec.sides);
}
