import type {
  QrFinder,
  QrFinderPaths,
  QrMatrix,
  QrModuleShape,
  QrRenderPlan,
  QrStyle,
} from './types';

export const FINDER_SPAN = 7;
/** Finder plus its one-module light separator. */
const FINDER_ZONE = FINDER_SPAN + 1;
const CORE_SPAN = 3;
const CORE_OFFSET = 2;

/**
 * Quiet zone is 5 rather than the spec minimum of 4 so the renderer's hairline
 * border (inset one module from the edge) still leaves four clean modules.
 */
export const DEFAULT_QR_STYLE: QrStyle = Object.freeze({
  shape: 'plaque',
  quietZone: 5,
  inset: 0.08,
  finderChamfer: 0.85,
});

const SHAPE_INSET: Readonly<Record<QrModuleShape, number>> = Object.freeze({
  plaque: 0.08,
  diamond: 0.02,
  dot: 0.06,
});

export function resolveQrStyle(shape: QrModuleShape): QrStyle {
  return { ...DEFAULT_QR_STYLE, shape, inset: SHAPE_INSET[shape] };
}

/** Compact numeric formatting keeps path strings small inside the single-file build. */
function fmt(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function locateFinders(size: number): readonly QrFinder[] {
  const far = size - FINDER_SPAN;
  return [
    { row: 0, col: 0 },
    { row: 0, col: far },
    { row: far, col: 0 },
  ];
}

export function isInFinderZone(row: number, col: number, size: number): boolean {
  const nearTop = row < FINDER_ZONE;
  const nearLeft = col < FINDER_ZONE;
  const nearRight = col >= size - FINDER_ZONE;
  const nearBottom = row >= size - FINDER_ZONE;
  return (nearTop && nearLeft) || (nearTop && nearRight) || (nearBottom && nearLeft);
}

function plaquePath(x: number, y: number, span: number): string {
  return `M${fmt(x)} ${fmt(y)}h${fmt(span)}v${fmt(span)}h${fmt(-span)}z`;
}

function diamondPath(x: number, y: number, span: number): string {
  const half = span / 2;
  const cx = x + half;
  const cy = y + half;
  return `M${fmt(cx)} ${fmt(y)}L${fmt(x + span)} ${fmt(cy)}L${fmt(cx)} ${fmt(y + span)}L${fmt(x)} ${fmt(cy)}z`;
}

function dotPath(x: number, y: number, span: number): string {
  const r = span / 2;
  const cy = y + r;
  return `M${fmt(x)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(span)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-span)} 0z`;
}

const SHAPE_PATH: Readonly<Record<QrModuleShape, (x: number, y: number, span: number) => string>> = {
  plaque: plaquePath,
  diamond: diamondPath,
  dot: dotPath,
};

export function buildModuleShape(style: QrStyle, col: number, row: number): string {
  const x = col + style.quietZone + style.inset;
  const y = row + style.quietZone + style.inset;
  const span = 1 - style.inset * 2;
  return SHAPE_PATH[style.shape](x, y, span);
}

function listDataModules(matrix: QrMatrix): readonly QrFinder[] {
  const cells: QrFinder[] = [];
  matrix.modules.forEach((cells_, row) => {
    cells_.forEach((isDark, col) => {
      if (isDark && !isInFinderZone(row, col, matrix.size)) cells.push({ row, col });
    });
  });
  return cells;
}

export function buildModulePath(matrix: QrMatrix, style: QrStyle): string {
  return listDataModules(matrix)
    .map((cell) => buildModuleShape(style, cell.col, cell.row))
    .join('');
}

/** Octagon: a square with each corner cut back by `chamfer` along both edges. */
export function chamferedSquarePath(x: number, y: number, span: number, chamfer: number): string {
  const c = Math.min(chamfer, span / 2);
  const points = [
    [x + c, y], [x + span - c, y], [x + span, y + c], [x + span, y + span - c],
    [x + span - c, y + span], [x + c, y + span], [x, y + span - c], [x, y + c],
  ];
  const body = points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${fmt(px)} ${fmt(py)}`).join('');
  return `${body}z`;
}

function finderRing(finder: QrFinder, style: QrStyle): string {
  const x = finder.col + style.quietZone;
  const y = finder.row + style.quietZone;
  const outer = chamferedSquarePath(x, y, FINDER_SPAN, style.finderChamfer);
  const hole = plaquePath(x + 1, y + 1, FINDER_SPAN - 2);
  return outer + hole;
}

function finderCore(finder: QrFinder, style: QrStyle): string {
  const x = finder.col + style.quietZone + CORE_OFFSET;
  const y = finder.row + style.quietZone + CORE_OFFSET;
  return chamferedSquarePath(x, y, CORE_SPAN, style.finderChamfer * 0.5);
}

export function buildFinderPaths(finders: readonly QrFinder[], style: QrStyle): QrFinderPaths {
  return {
    ring: finders.map((f) => finderRing(f, style)).join(''),
    core: finders.map((f) => finderCore(f, style)).join(''),
  };
}

export function buildRenderPlan(matrix: QrMatrix, style: QrStyle = DEFAULT_QR_STYLE): QrRenderPlan {
  const finders = locateFinders(matrix.size);
  return Object.freeze({
    size: matrix.size,
    version: matrix.version,
    quietZone: style.quietZone,
    viewBox: matrix.size + style.quietZone * 2,
    finders,
    finderPaths: buildFinderPaths(finders, style),
    modulePath: buildModulePath(matrix, style),
    darkModuleCount: listDataModules(matrix).length,
  });
}
