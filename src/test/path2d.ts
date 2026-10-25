/**
 * A recording stand-in for `Path2D` (jsdom and node have none). Every path
 * command is appended to `log` as text, so a golden can lock the *geometry*
 * an alphabet or motif draws without a canvas (ADDENDUM-029 §4).
 */
export interface RecordingPath {
  path: Path2D;
  log: string[];
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

export function createRecordingPath(): RecordingPath {
  const log: string[] = [];
  const record =
    (name: string) =>
    (...args: number[]) =>
      log.push(`${name}(${args.map(round).join(',')})`);

  const path = {
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    bezierCurveTo: record('bezierCurveTo'),
    quadraticCurveTo: record('quadraticCurveTo'),
    arc: record('arc'),
    arcTo: record('arcTo'),
    ellipse: record('ellipse'),
    rect: record('rect'),
    closePath: () => log.push('closePath()'),
    addPath: () => log.push('addPath()'),
  } as unknown as Path2D;

  return { path, log };
}

/** Coordinates of every command that carries them, in order. */
export function coordinates(log: readonly string[]): number[] {
  return log.flatMap((entry) => {
    const args = /\((.*)\)/.exec(entry)?.[1];
    if (!args) return [];
    return args.split(',').filter(Boolean).map(Number);
  });
}
