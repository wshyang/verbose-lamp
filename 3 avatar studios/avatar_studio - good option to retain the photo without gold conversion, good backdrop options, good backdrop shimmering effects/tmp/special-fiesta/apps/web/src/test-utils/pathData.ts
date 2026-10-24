/**
 * Reading the SVG path data a die drew, for the tests that hold a die inside its cell.
 *
 * `pointsOf` walks the small command set `chopGeo.ts` emits — absolute `M`, `H`, `V`, `L`, `C`,
 * `Q`, `A`, `Z` — and returns the coordinates it names. `extentsOf` adds the reach of every arc,
 * because a half-oval reveals its height nowhere in its markup: the only numbers written down are
 * the two ends of the chord and the radii. Living under `test-utils/` keeps this out of the shipped
 * bundle and out of the coverage run.
 */

export interface PathPoint {
  x: number;
  y: number;
}

const COMMAND = /([MHVLCSQA])([^MHVLCSQA]*)/gu;
const NUMBER = /-?\d+(?:\.\d+)?/gu;

/** How many numbers one argument of each command takes. */
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, A: 7, Z: 0 };

interface Step {
  /** Where the pen ends up. */
  to: PathPoint;
  /** Control points the pen is pulled through. */
  held: PathPoint[];
  /** The corners of the box an arc belongs to, empty for every other command. */
  arcs: PathPoint[];
}

function numbersOf(body: string): number[] {
  return body.match(NUMBER)?.map(Number) ?? [];
}

function stepOf(command: string, group: readonly number[], pen: PathPoint): Step {
  const read = (offset: number): number => group[offset] as number;
  const none = { held: [], arcs: [] };
  if (command === 'H') return { to: { x: read(0), y: pen.y }, ...none };
  if (command === 'V') return { to: { x: pen.x, y: read(0) }, ...none };
  if (command === 'Q') return { to: { x: read(2), y: read(3) }, held: [{ x: read(0), y: read(1) }], arcs: [] };
  if (command === 'C') {
    return {
      to: { x: read(4), y: read(5) },
      held: [{ x: read(0), y: read(1) }, { x: read(2), y: read(3) }],
      arcs: [],
    };
  }
  if (command === 'A') {
    /*
     * The radii here are axis aligned, so the box of the ellipse an arc runs along is the chord's
     * midpoint plus and minus those radii. That is exact for the half ovals `chopGeo` writes and
     * conservative for the quarter turns of a rounded corner.
     */
    const to = { x: read(5), y: read(6) };
    const middle = { x: (pen.x + to.x) / 2, y: (pen.y + to.y) / 2 };
    const radiusX = read(0);
    const radiusY = read(1);
    return {
      to,
      held: [],
      arcs: [
        { x: middle.x + radiusX, y: middle.y + radiusY },
        { x: middle.x - radiusX, y: middle.y - radiusY },
      ],
    };
  }
  return { to: { x: read(0), y: read(1) }, ...none };
}

function readPath(d: string): { points: PathPoint[]; arcs: PathPoint[] } {
  const points: PathPoint[] = [];
  const arcs: PathPoint[] = [];
  let pen: PathPoint = { x: 0, y: 0 };
  for (const match of d.matchAll(COMMAND)) {
    const command = match[1] as string;
    const values = numbersOf(match[2] ?? '');
    const arity = ARITY[command] ?? 0;
    for (let start = 0; arity > 0 && start + arity <= values.length; start += arity) {
      const step = stepOf(command, values.slice(start, start + arity), pen);
      points.push(...step.held, step.to);
      arcs.push(...step.arcs);
      pen = step.to;
    }
  }
  return { points, arcs };
}

/** The coordinates the path names: every vertex and every control point. */
export function pointsOf(d: string): PathPoint[] {
  return readPath(d).points;
}

/** Those coordinates plus the reach of every arc, which is what a shape actually covers. */
export function extentsOf(d: string): PathPoint[] {
  const read = readPath(d);
  return [...read.points, ...read.arcs];
}

export interface PathBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function boundsOf(d: string): PathBounds {
  const points = extentsOf(d);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Every number in the string, which is what a rounding rule has to hold to. */
export function numbersIn(d: string): number[] {
  return numbersOf(d);
}
