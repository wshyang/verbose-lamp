import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-298 — a venue that animates something travelling across the scene must hide it under
 * `prefers-reduced-motion`, not leave it frozen.
 *
 * The generic reduced-motion rule in `gameboy.css` only stops animations (`animation: none`). A
 * cable car parked mid-sky or a car stopped mid-road reads as broken art, so what TRAVELS is hidden
 * outright, and which layers those are is each venue's to say in its own `scene.css`. A venue that
 * forgets leaves nothing wrong in any unit test and a frozen vehicle on every phone whose owner
 * asked for less motion — so the rule is a test over every `themes/<id>/scene.css`, found by
 * directory, not a convention.
 *
 * ENTRANCES are the one exception (ADR-299). An animation that is only run behind
 * `[data-intro='play']` (a building rising, a car arriving) ends in the picture the venue wants at
 * rest, so under reduced motion it must be STOPPED (`animation: none`, leaving that end state) or
 * sit under an ancestor that is hidden; hiding the car would remove it from the scene altogether.
 * Anything not gated that way and still travelling must be hidden, as before.
 *
 * "Travels" is decided by the keyframes, not by a list of names: a keyframe whose transform
 * translates by 20% or more of the element (or by a custom property, which is how the photoreal
 * cabins carry their own distance), or by 20vw / 100px or more, moves the thing somewhere else.
 * A two-frame sprite flip or a hop of a few percent stays where it is.
 */

function themesDir(): string {
  let dir = resolve(process.cwd());
  while (!existsSync(join(dir, 'src', 'themes'))) {
    const next = existsSync(join(dir, 'apps', 'web', 'src', 'themes')) ? join(dir, 'apps', 'web') : dirname(dir);
    if (next === dir) throw new Error(`cannot locate apps/web from ${process.cwd()}`);
    dir = next;
  }
  return join(dir, 'src', 'themes');
}

const THEMES = themesDir();
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

const venues = readdirSync(THEMES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(THEMES, entry.name, 'scene.css')))
  .map((entry) => entry.name)
  .sort();

/** Body of the `{ … }` that opens at `open`, with nested braces balanced. */
function blockFrom(css: string, open: number): string {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('unbalanced braces');
}

function movesFar(value: string): boolean {
  const part = value.trim();
  if (part.startsWith('var(')) return true;
  const n = Number.parseFloat(part);
  if (Number.isNaN(n)) return false;
  if (/%$/.test(part) || /vw$/.test(part)) return Math.abs(n) >= 20;
  if (/px$/.test(part)) return Math.abs(n) >= 100;
  return false;
}

/** Every `@keyframes` name whose transforms carry the element a long way. */
function travellingKeyframes(css: string): string[] {
  const text = strip(css);
  const out: string[] = [];
  for (const match of text.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const body = blockFrom(text, (match.index ?? 0) + match[0].length - 1);
    const travels = [...body.matchAll(/translate[XY]?\(([^)]*)\)/g)].some(([, args]) =>
      (args ?? '').split(',').some(movesFar),
    );
    if (travels) out.push(match[1] ?? '');
  }
  return out;
}

/**
 * The classes ON the animated element for every rule that runs `name` as an animation: the last
 * compound of each comma-separated selector. `.gb-scene--real .gb-scene__cablecar` animates the
 * cable car, not the `.gb-scene--real` ancestor it is scoped under.
 */
function classesAnimating(css: string, name: string): string[] {
  const out: string[] = [];
  const usesIt = new RegExp(`animation(?:-name)?:[^;]*\\b${name}\\b`);
  for (const rule of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!usesIt.test(rule[2] ?? '')) continue;
    for (const selector of (rule[1] ?? '').split(',')) {
      const last = selector.trim().split(/\s+/).pop() ?? '';
      out.push(...(last.match(/\.[\w-]+/g) ?? []));
    }
  }
  return out;
}

/** Every comma-separated selector that runs `name`, as the class tokens it names (scope included). */
function selectorsAnimating(css: string, name: string): { entrance: boolean; tokens: string[]; last: string[] }[] {
  const out: { entrance: boolean; tokens: string[]; last: string[] }[] = [];
  const usesIt = new RegExp(`animation(?:-name)?:[^;]*\\b${name}\\b`);
  for (const rule of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!usesIt.test(rule[2] ?? '')) continue;
    for (const selector of (rule[1] ?? '').split(',')) {
      const text = selector.trim();
      out.push({
        entrance: /\[data-intro=['"]play['"]\]/.test(text),
        tokens: text.match(/\.[\w-]+/g) ?? [],
        last: (text.split(/\s+/).pop() ?? '').match(/\.[\w-]+/g) ?? [],
      });
    }
  }
  return out;
}

/** Class tokens stopped (`animation: none`) inside a `prefers-reduced-motion: reduce` block. */
function stoppedUnderReducedMotion(css: string): Set<string> {
  const stopped = new Set<string>();
  const text = strip(css);
  for (const match of text.matchAll(/@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{/g)) {
    const block = blockFrom(text, (match.index ?? 0) + match[0].length - 1);
    for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/animation:\s*none/.test(rule[2] ?? '')) continue;
      for (const token of (rule[1] ?? '').match(/\.[\w-]+/g) ?? []) stopped.add(token);
    }
  }
  return stopped;
}

/** Class tokens hidden by a `prefers-reduced-motion: reduce` block with `display: none`. */
function hiddenUnderReducedMotion(css: string): Set<string> {
  const hidden = new Set<string>();
  const text = strip(css);
  for (const match of text.matchAll(/@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{/g)) {
    const block = blockFrom(text, (match.index ?? 0) + match[0].length - 1);
    for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/display:\s*none/.test(rule[2] ?? '')) continue;
      for (const token of (rule[1] ?? '').match(/\.[\w-]+/g) ?? []) hidden.add(token);
    }
  }
  return hidden;
}

describe('the travelling-keyframe detector', () => {
  it('flags a keyframe that carries an element a long way, and not a sprite flip', () => {
    const css = `
      @keyframes drives { from { transform: translateX(0); } to { transform: translate(103%, -24%); } }
      @keyframes flips  { from { background-position-x: 0%; } to { background-position-x: 100%; } }
      @keyframes hops   { from { transform: translateY(0); } to { transform: translateY(-14%); } }
      @keyframes viaVar { from { transform: translate(0, 0); } to { transform: translate(var(--dx), var(--dy)); } }
    `;

    expect(travellingKeyframes(css)).toEqual(['drives', 'viaVar']);
  });

  it('finds the classes that run a keyframe through either spelling of animation', () => {
    const css = `
      .a { animation: drives 9s linear infinite; }
      .b { animation-name: drives; }
      .c { animation: other 1s; }
    `;

    expect(classesAnimating(css, 'drives')).toEqual(['.a', '.b']);
  });

  it('counts the animated element, not an ancestor the rule is scoped under', () => {
    const css = '.scope--real .car { animation-name: drives; } .x, .y .z { animation: drives 1s; }';

    expect(classesAnimating(css, 'drives')).toEqual(['.car', '.x', '.z']);
  });

  it('sees a hide rule inside a reduced-motion block and ignores the same rule outside it', () => {
    const css = `
      .outside { display: none; }
      @media (prefers-reduced-motion: reduce) { .x, .y { display: none; } .z { animation: none; } }
    `;

    expect([...hiddenUnderReducedMotion(css)].sort()).toEqual(['.x', '.y']);
  });
});

describe('entrances (ADR-299)', () => {
  const css = `
    .s[data-intro='play'] .car { animation: drives 8s; }
    .s[data-intro='play'] .car .wrap { animation: lifts 8s; }
    .s .cyclist { animation: drives 4s; }
    @media (prefers-reduced-motion: reduce) { .s[data-intro='play'] .car { animation: none; } }
    @keyframes drives { from { transform: translateX(300%); } to { transform: translateX(0); } }
  `;

  it('marks only rules gated behind data-intro=play as entrances', () => {
    const found = selectorsAnimating(css, 'drives').map((hit) => [hit.entrance, hit.last.join('')]);

    expect(found).toEqual([
      [true, '.car'],
      [false, '.cyclist'],
    ]);
  });

  it('sees animation: none inside a reduced-motion block and nowhere else', () => {
    expect([...stoppedUnderReducedMotion(css)]).toEqual(['.s', '.car']);
    expect([...stoppedUnderReducedMotion('.a { animation: none; }')]).toEqual([]);
  });
});

describe('every venue hides what travels under reduced motion (ADR-298)', () => {
  it('finds at least Sentosa', () => {
    expect(venues).toContain('sentosa');
  });

  for (const id of venues) {
    it(`${id}: every class that animates a travelling keyframe is hidden, not frozen`, () => {
      const css = readFileSync(join(THEMES, id, 'scene.css'), 'utf8');
      const hidden = hiddenUnderReducedMotion(css);
      const stopped = stoppedUnderReducedMotion(css);
      const unhidden: string[] = [];

      for (const name of travellingKeyframes(css)) {
        for (const { entrance, last } of selectorsAnimating(css, name)) {
          const ok = entrance
            ? last.length > 0 && last.every((token) => hidden.has(token) || stopped.has(token))
            : last.every((token) => hidden.has(token));
          if (!ok) unhidden.push(`${last.join('')} (animates ${name})`);
        }
      }

      expect(unhidden).toEqual([]);
    });
  }
});
