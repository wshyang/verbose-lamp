import { createHash } from 'node:crypto';
import { vi } from 'vitest';

/**
 * Test-only fake 2D context. It records every method call and property write
 * as text, so golden tests can lock the exact drawing a refactor must keep
 * (CLAUDE.md §2: geometry-level goldens, not pixels). Not exported from the
 * feature barrel.
 */
export interface RecordingContext {
  ctx: CanvasRenderingContext2D;
  log: string[];
}

interface Tagged {
  __tag: string;
}

const FONT_SIZE = /(\d+(?:\.\d+)?)px/;
const GLYPH_WIDTH_RATIO = 0.55;
const DEFAULT_FONT_SIZE = 10;
const STUB_VIEWPORT = { innerWidth: 1280, innerHeight: 720 } as const;

function isTagged(value: unknown): value is Tagged {
  return typeof value === 'object' && value !== null && '__tag' in value;
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
  if (isTagged(value)) return value.__tag;
  return String(value);
}

export function hashText(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

function createGradient(log: string[], id: number): Tagged & { addColorStop: (o: number, c: string) => void } {
  return {
    __tag: `[Gradient#${id}]`,
    addColorStop: (offset, color) => log.push(`gradient#${id}.addColorStop(${formatValue(offset)},${color})`),
  };
}

export function createRecordingContext(): RecordingContext {
  const log: string[] = [];
  const state: Record<string, unknown> = {};
  let gradientCount = 0;

  const results: Record<string, (...args: unknown[]) => unknown> = {
    measureText: (text) => {
      const size = Number(FONT_SIZE.exec(String(state.font ?? ''))?.[1] ?? DEFAULT_FONT_SIZE);
      return { width: String(text).length * size * GLYPH_WIDTH_RATIO };
    },
    createLinearGradient: () => createGradient(log, (gradientCount += 1)),
    createRadialGradient: () => createGradient(log, (gradientCount += 1)),
  };

  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      if (prop in state) return state[prop];
      return (...args: unknown[]) => {
        log.push(`${prop}(${args.map(formatValue).join(',')})`);
        return results[prop]?.(...args);
      };
    },
    set(_target, prop: string, value) {
      state[prop] = value;
      log.push(`${prop}=${formatValue(value)}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

/** Stubs the globals effects touch (window size, offscreen sprite canvases). */
export function stubBrowserGlobals(): void {
  vi.stubGlobal('window', STUB_VIEWPORT);
  vi.stubGlobal('document', {
    createElement: () => ({
      __tag: '[Canvas]',
      width: 0,
      height: 0,
      getContext: () => createRecordingContext().ctx,
    }),
  });
}

export function unstubBrowserGlobals(): void {
  vi.unstubAllGlobals();
}
