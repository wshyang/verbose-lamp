import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SentosaRealScene } from './SentosaRealScene.js';
import {
  SCENE_PARTS_REAL, REAL_PLAYERS_FAR, REAL_PLAYERS_NEAR, REAL_BOATS, REAL_CABLECARS,
} from './art/realArt.js';
import { SCENE_PARTS } from './art/pixelArt.js';
import { required } from '../../lib/required.js';

/**
 * ADR-193 — these tests were written while nothing rendered this component, to stop an
 * unreferenced thing from rotting before anybody could switch it on. ADR-200 switched it
 * on via `?backdrop=life`, and they paid for themselves: wiring it in needed no change to
 * a single assertion here, which is the whole claim those seven inert ADRs were making.
 */

describe('SentosaRealScene', () => {
  it('draws every layer the pixel scene draws, from the photoreal set', () => {
    render(<SentosaRealScene />);
    const scene = screen.getByTestId('real-beach-scene');
    const urls = [...scene.querySelectorAll<HTMLElement>('[style]')]
      .map((node) => node.style.backgroundImage)
      .filter((value) => value !== '');
    expect(urls.length).toBeGreaterThan(0);
    // Every layer points at the photoreal directory and nothing at the drawn one.
    expect(urls.every((url) => url.includes('/themes/sentosa/scene-real/'))).toBe(true);
    expect(urls.some((url) => url.includes('/themes/sentosa/scene/'))).toBe(false);
  });

  it('covers every part the pixel scene has, so a switch loses nothing', () => {
    const drawn = Object.keys(SCENE_PARTS).filter((key) => !key.startsWith('player'));
    const real = Object.keys(SCENE_PARTS_REAL).filter((key) => !key.startsWith('player'));
    for (const part of drawn) expect(real).toContain(part);
  });

  it('lists exactly the parts that have been decomposed out of the panorama', () => {
    const drawn = new Set(Object.keys(SCENE_PARTS));
    const extra = Object.keys(SCENE_PARTS_REAL).filter((key) => !drawn.has(key));
    /*
     * A superset of the drawn scene, and the surplus is the decomposition itself: the net
     * (ADR-194), the five landmarks and the sea (ADR-195), and the two pieces of
     * infrastructure the vehicles had been travelling without (ADR-201). Pinned as an exact
     * list so that splitting something else out is a deliberate act with a test to update,
     * rather than a thing that quietly happened.
     */
    expect(extra.sort()).toEqual(
      ['bumboat', 'cable', 'cablecar2', 'cablecar3', 'deckchair', 'ferry', 'ferry2',
        'ferryJetty', 'ferryTerminal', 'guideway', 'merlion', 'net', 'player5', 'player6',
        'player7', 'player8', 'skyHelix', 'umbrella', 'uss', 'water'].sort(),
    );
  });

  it('draws the ferry terminal after the Express, so the train passes behind it', () => {
    render(<SentosaRealScene />);
    const nodes = [...screen.getByTestId('real-beach-scene').children];
    const at = (cls: string) => nodes.findIndex((node) => node.className.includes(cls));
    // The scene's second occluder, after the portal tree clump. Reverse these two and the
    // Express stops arriving anywhere and simply switches off at the edge of its run.
    expect(at('gb-scene__express')).toBeLessThan(at('gb-scene__terminal'));
    expect(at('gb-scene__express')).toBeLessThan(at('gb-scene__portal'));
  });

  it('gives every member of a roster its own distinct artwork', () => {
    /*
     * The point of ADR-198. Three cabins drawn from one file is a repeat the eye catches
     * before it counts them, and the same is true of eight players and the boats. Asserting
     * on `src` rather than on count is what makes this a variety test rather than a
     * quantity one: duplicating a sprite to pad a roster fails here.
     */
    for (const roster of [REAL_CABLECARS, REAL_BOATS, REAL_PLAYERS_FAR, REAL_PLAYERS_NEAR]) {
      expect(new Set(roster.map((part) => part.src)).size).toBe(roster.length);
    }
  });

  it('staggers the cabins through data rather than through the component', () => {
    // Each cabin carries its own offset, so a fourth is a line of geometry and a PNG.
    const delays = REAL_CABLECARS.map((part) => part.style['animationDelay']);
    expect(new Set(delays).size).toBe(REAL_CABLECARS.length);
    expect(delays.every((delay) => delay !== undefined)).toBe(true);
  });

  it('berths the moored ferry in front of the jetty it is tied to', () => {
    render(<SentosaRealScene />);
    const nodes = [...screen.getByTestId('real-beach-scene').children];
    const at = (cls: string) => nodes.findIndex((node) => node.className.includes(cls));
    expect(at('gb-scene__jetty')).toBeLessThan(at('gb-scene__moored'));
  });

  it('puts the sea under the surf, and the two landmarks standing in it on top', () => {
    render(<SentosaRealScene />);
    const nodes = [...screen.getByTestId('real-beach-scene').children];
    const at = (cls: string) => nodes.findIndex((node) => node.className.includes(cls));
    expect(at('gb-scene__water')).toBeLessThan(at('gb-scene__foam'));
    expect(at('gb-scene__water')).toBeLessThan(at('gb-scene__merlion'));
    expect(at('gb-scene__water')).toBeLessThan(at('gb-scene__terminal'));
  });

  it('asks for smoothing, which is the one thing it must not share with the pixel art', () => {
    render(<SentosaRealScene />);
    expect(screen.getByTestId('real-beach-scene').className).toContain('gb-scene--real');
  });

  it('stays decorative: hidden from assistive technology like the drawn scene', () => {
    render(<SentosaRealScene />);
    expect(screen.getByTestId('real-beach-scene')).toHaveAttribute('aria-hidden', 'true');
  });

  it('spaces three cable cars along one path with staggered delays', () => {
    render(<SentosaRealScene />);
    const cabins = screen.getAllByTestId('real-beach-scene__cablecar');
    expect(cabins).toHaveLength(3);
    expect(new Set(cabins.map((node) => node.style.animationDelay)).size).toBe(3);
  });

  /**
   * ADR-201 — the cabins used to be positioned by eye against wires painted into the
   * panorama, and were never quite on them. The wires are painted out and the cable is now
   * generated from the same two points the cabins hang from, so this asserts the only
   * thing that can still go wrong: that they all start at one place and travel one vector.
   * Being ON the line is no longer a thing a test has to check, because it is no longer a
   * thing anyone measures.
   */
  it('hangs every cabin on the one cable, from the same point and along the same vector',
    () => {
      render(<SentosaRealScene />);
      const cabins = screen.getAllByTestId('real-beach-scene__cablecar');
      const travel = cabins.map((node) => [
        node.style.getPropertyValue('--gb-cable-dx'),
        node.style.getPropertyValue('--gb-cable-dy'),
      ]);
      expect(travel.every(([dx, dy]) => dx !== '' && dy !== '')).toBe(true);
      /*
       * The contract, not the numbers. A translate percentage is relative to the ELEMENT,
       * so three differently sized cabins need three different pairs to cover one shared
       * distance — and the thing that must hold is that the distance is shared. Multiply
       * each cabin's percentage by its own size and all three land on the same figure; get
       * that wrong and they drift apart as they climb, which is the fault ADR-201 fixed.
       */
      const num = (value: string) => Number.parseFloat(value);
      const spans = cabins.map((node, index) => [
        (num(travel[index]?.[0] ?? '') * num(node.style.width)) / 100,
        (num(travel[index]?.[1] ?? '') * num(node.style.height)) / 100,
      ]);
      // Three decimal places out of the generator, so agreement is to a tenth of a percent
      // of the scene — a quarter of a pixel at the width this backdrop is ever drawn at.
      for (const [x, y] of spans) {
        expect(x).toBeCloseTo(spans[0]?.[0] ?? 0, 1);
        expect(y).toBeCloseTo(spans[0]?.[1] ?? 0, 1);
      }
      // ...and they all start from the same point on it.
      expect(new Set(cabins.map((node) => node.style.top)).size).toBe(1);
      // The scene owns exactly one cable, and it is drawn before anything hangs from it.
      const nodes = [...screen.getByTestId('real-beach-scene').children];
      // Whole-token match: `gb-scene__cablecar` contains `gb-scene__cable` as a substring.
      const cable = nodes.findIndex((node) => node.className.split(' ').includes('gb-scene__cable'));
      const first = nodes.findIndex((node) => node.className.includes('__cablecar'));
      expect(cable).toBeGreaterThanOrEqual(0);
      expect(cable).toBeLessThan(first);
    });

  /**
   * ADR-201 — same argument for the Express: it ran along the shoreline on nothing. The
   * guideway must be drawn first or the train disappears under its own track.
   */
  it('lays the guideway under the Express rather than over it', () => {
    render(<SentosaRealScene />);
    const nodes = [...screen.getByTestId('real-beach-scene').children];
    const at = (cls: string) => nodes.findIndex((node) => node.className.includes(cls));
    expect(at('gb-scene__guideway')).toBeGreaterThanOrEqual(0);
    expect(at('gb-scene__guideway')).toBeLessThan(at('gb-scene__express'));
  });

  it('draws one figure per rendered player sheet and no placeholder for the rest', () => {
    render(<SentosaRealScene />);
    expect(screen.queryAllByTestId('real-beach-scene__player')).toHaveLength(
      REAL_PLAYERS_FAR.length + REAL_PLAYERS_NEAR.length,
    );
  });

  /**
   * ADR-194 — the whole point of lifting the net out of the panorama. Painted into the
   * backdrop it could only ever be behind every player; as its own layer it has a front and
   * a back, and these two tests are what stop a later edit from quietly flattening it again.
   */
  it('puts the far players behind the net and the near players in front of it', () => {
    render(<SentosaRealScene />);
    const scene = screen.getByTestId('real-beach-scene');
    const nodes = [...scene.children];
    const net = nodes.indexOf(screen.getByTestId('real-beach-scene__net'));
    const players = screen.getAllByTestId('real-beach-scene__player').map((n) => nodes.indexOf(n));
    const behind = players.filter((index) => index < net);
    const inFront = players.filter((index) => index > net);
    expect(behind).toHaveLength(REAL_PLAYERS_FAR.length);
    expect(inFront).toHaveLength(REAL_PLAYERS_NEAR.length);
  });

  it('stands the far players higher up the sand and smaller than the near pair', () => {
    const topOf = (part: { style: Record<string, string> }) =>
      Number.parseFloat(required(part.style['top'], 'top'));
    const heightOf = (part: { style: Record<string, string> }) =>
      Number.parseFloat(required(part.style['height'], 'height'));
    for (const far of REAL_PLAYERS_FAR) {
      for (const near of REAL_PLAYERS_NEAR) {
        // Further away: higher in the frame, and physically smaller.
        expect(topOf(far)).toBeLessThan(topOf(near));
        expect(heightOf(far)).toBeLessThan(heightOf(near));
      }
    }
  });

  it('keeps the palms in front of every figure, being the closest thing in frame', () => {
    render(<SentosaRealScene />);
    const nodes = [...screen.getByTestId('real-beach-scene').children];
    const lastPlayer = Math.max(
      ...screen.getAllByTestId('real-beach-scene__player').map((n) => nodes.indexOf(n)),
    );
    const palms = nodes.filter((n) => n.className.includes('gb-scene__palm'));
    expect(palms).toHaveLength(2);
    for (const palm of palms) expect(nodes.indexOf(palm)).toBeGreaterThan(lastPlayer);
  });
});
