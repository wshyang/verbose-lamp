import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useLiveList } from './useLiveList.js';

/**
 * ADR-024 — the rows must survive a refresh and move to their new places. jsdom has
 * neither layout nor the Web Animations API, so `offsetTop` is fed from a data attribute
 * and `animate` is a spy: what is asserted is which rows are asked to move, flash or fade
 * in, which is exactly the decision this hook makes.
 */

const animate = vi.fn();

interface Row {
  id: string;
  points: number;
  top: number;
  /** ADR-095 — grid surfaces move sideways too. */
  left?: number;
}

function Board(props: { rows: Row[]; withSignature?: boolean }) {
  const list = useLiveList<HTMLUListElement>();
  return (
    <ul ref={list}>
      {props.rows.map((row) => (
        <li
          key={row.id}
          data-live-key={row.id}
          data-live-signature={props.withSignature === false ? undefined : row.points}
          data-top={row['top']}
          data-left={row.left ?? 0}
        >
          {row.id}: {row.points}
        </li>
      ))}
    </ul>
  );
}

beforeEach(() => {
  animate.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: animate,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      return Number(this.dataset['top'] ?? 0);
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get(this: HTMLElement) {
      return Number(this.dataset['left'] ?? 0);
    },
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  Reflect.deleteProperty(HTMLElement.prototype, 'offsetTop');
  Reflect.deleteProperty(HTMLElement.prototype, 'offsetLeft');
  vi.unstubAllGlobals();
});

/** The first keyframe of the nth animate() call. */
function firstFrame(call: number): Record<string, unknown> {
  const frames = animate.mock.calls[call]?.[0] as Record<string, unknown>[];
  return frames[0] ?? {};
}

describe('useLiveList', () => {
  it('fades in every row the first time the list is drawn', () => {
    render(<Board rows={[{ id: 'a', points: 10, top: 0 }, { id: 'b', points: 5, top: 40 }]} />);

    expect(animate).toHaveBeenCalledTimes(2);
    expect(firstFrame(0)).toMatchObject({ opacity: 0 });
    expect(firstFrame(1)).toMatchObject({ opacity: 0 });
  });

  it('slides a row from where it was to where it now is', () => {
    const { rerender } = render(
      <Board rows={[{ id: 'a', points: 10, top: 0 }, { id: 'b', points: 5, top: 40 }]} />,
    );
    animate.mockClear();

    // B overtakes A: each row moves by one row height, in opposite directions.
    rerender(<Board rows={[{ id: 'b', points: 12, top: 0 }, { id: 'a', points: 10, top: 40 }]} />);

    const moves = animate.mock.calls
      .map((call) => (call[0] as Record<string, unknown>[])[0]?.['transform'])
      .filter((transform) => typeof transform === 'string');
    expect(moves).toEqual(['translate(0px, 40px)', 'translate(0px, -40px)']);
  });

  it('slides a grid cell sideways as well as down (ADR-095)', () => {
    // Two photos side by side; a like reorders them, so each crosses one column.
    const { rerender } = render(
      <Board rows={[{ id: 'a', points: 3, top: 0, left: 0 }, { id: 'b', points: 2, top: 0, left: 140 }]} />,
    );
    animate.mockClear();

    rerender(
      <Board rows={[{ id: 'b', points: 4, top: 0, left: 0 }, { id: 'a', points: 3, top: 0, left: 140 }]} />,
    );

    const moves = animate.mock.calls
      .map((call) => (call[0] as Record<string, unknown>[])[0]?.['transform'])
      .filter((transform) => typeof transform === 'string');
    expect(moves).toEqual(['translate(140px, 0px)', 'translate(-140px, 0px)']);
  });

  it('flashes only the row whose own value changed', () => {
    const rows = [{ id: 'a', points: 10, top: 0 }, { id: 'b', points: 5, top: 40 }];
    const { rerender } = render(<Board rows={rows} />);
    animate.mockClear();

    rerender(<Board rows={[{ id: 'a', points: 25, top: 0 }, { id: 'b', points: 5, top: 40 }]} />);

    expect(animate).toHaveBeenCalledTimes(1);
    // The venue's accent via a token (ADR-296), never a literal that would stay gold in a
    // venue whose accent is not.
    expect(firstFrame(0)).toHaveProperty('backgroundColor', 'var(--live-flash)');
  });

  it('leaves an unchanged list completely alone', () => {
    const rows = [{ id: 'a', points: 10, top: 0 }, { id: 'b', points: 5, top: 40 }];
    const { rerender } = render(<Board rows={rows} />);
    animate.mockClear();

    rerender(<Board rows={rows} />);

    expect(animate).not.toHaveBeenCalled();
  });

  it('treats a row with no signature as never changing', () => {
    const { rerender } = render(<Board rows={[{ id: 'a', points: 1, top: 0 }]} withSignature={false} />);
    animate.mockClear();

    rerender(<Board rows={[{ id: 'a', points: 99, top: 0 }]} withSignature={false} />);

    expect(animate).not.toHaveBeenCalled();
  });

  it('animates nothing when the reader asked for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));

    render(<Board rows={[{ id: 'a', points: 10, top: 0 }]} />);

    expect(animate).not.toHaveBeenCalled();
  });

  it('runs where there is a matchMedia that says motion is fine', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

    render(<Board rows={[{ id: 'a', points: 10, top: 0 }]} />);

    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all in a browser without the animation API', () => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    const { rerender } = render(<Board rows={[{ id: 'a', points: 10, top: 0 }]} />);

    expect(() => rerender(<Board rows={[{ id: 'a', points: 11, top: 40 }]} />)).not.toThrow();
    expect(animate).not.toHaveBeenCalled();
  });

  it('survives an empty list and a container that was never attached', () => {
    const { container } = render(<Board rows={[]} />);
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(animate).not.toHaveBeenCalled();

    function Detached() {
      useLiveList<HTMLUListElement>();
      return <p>nothing to place</p>;
    }
    expect(() => render(<Detached />)).not.toThrow();
  });
});
