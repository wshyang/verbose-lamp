import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { avatarSpriteId, formatAvatarSprite } from '@psd/contracts';
import { SpriteProvider, useSprite, useSpriteForget } from './SpriteProvider.js';
import {
  SPRITE_CACHE_KEY,
  cacheSprites,
  forgetCachedSprites,
  readCachedSprites,
} from '../../lib/avatar/spriteCache.js';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';

/**
 * ADR-035 — rows carry an id; the provider turns ids into faces. What matters: one
 * request for a whole list, none at all for anything this device has seen before, and a
 * missing face never breaks a row.
 */

const spriteOf = (fill: string) =>
  formatAvatarSprite({
    size: 64,
    palette: ['#1d5b8c', '#12243a'],
    rows: Array.from({ length: 64 }, () => fill.repeat(64)),
  });

const first = spriteOf('0');
const second = spriteOf('1');
const firstId = avatarSpriteId(first);
const secondId = avatarSpriteId(second);

function Face(props: { id: string | null; label: string }) {
  const sprite = useSprite(props.id);
  return <span data-testid={props.label}>{sprite === null ? 'drawing' : sprite.slice(0, 12)}</span>;
}

let stub: FetchStub;

beforeEach(() => {
  window.localStorage.clear();
  forgetCachedSprites();
});

afterEach(() => stub?.restore());

describe('SpriteProvider', () => {
  it('asks for every missing face in one request, then caches them for good', async () => {
    stub = installFetchStub({
      'GET /api/avatars': { body: { items: [{ id: firstId, sprite: first }, { id: secondId, sprite: second }] } },
    });

    render(
      <SpriteProvider>
        <Face id={firstId} label="one" />
        <Face id={secondId} label="two" />
        <Face id={firstId} label="again" />
      </SpriteProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('one')).toHaveTextContent(first.slice(0, 12)));
    expect(screen.getByTestId('two')).toHaveTextContent(second.slice(0, 12));
    expect(screen.getByTestId('again')).toHaveTextContent(first.slice(0, 12));
    // Three faces, two of them distinct, one request.
    expect(stub.callsTo('GET /api/avatars')).toHaveLength(1);
    expect(window.localStorage.getItem(SPRITE_CACHE_KEY)).toContain(firstId);
  });

  it('never asks again for a face this device already has', async () => {
    cacheSprites(new Map([[firstId, first]]));
    stub = installFetchStub({ 'GET /api/avatars': { body: { items: [] } } });

    render(
      <SpriteProvider>
        <Face id={firstId} label="one" />
      </SpriteProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('one')).toHaveTextContent(first.slice(0, 12)));
    expect(stub.callsTo('GET /api/avatars')).toHaveLength(0);
  });

  /*
   * ADR-238 — a face this device already holds is on the first paint. Each participant page mounts its own store,
   * and that store used to start empty: the device's copy arrived in an effect, a frame after the stand-in
   * character had been painted.
   */
  it('has a face this device already holds on the very first render, before any effect', () => {
    cacheSprites(new Map([[firstId, first]]));
    stub = installFetchStub({ 'GET /api/avatars': { body: { items: [] } } });
    const paints: Array<string | null> = [];

    function Probe() {
      const face = useSprite(firstId);
      paints.push(face);
      return <span data-testid="face">{face === null ? 'drawing' : 'shown'}</span>;
    }
    render(
      <SpriteProvider>
        <Probe />
      </SpriteProvider>,
    );

    expect(paints[0]).toBe(first);
    expect(stub.callsTo('GET /api/avatars')).toHaveLength(0);
  });

  it('draws the character while a face is on its way, and if it never comes', async () => {
    stub = installFetchStub({ 'GET /api/avatars': { status: 500, body: { error: { message: 'nope' } } } });

    render(
      <SpriteProvider>
        <Face id={firstId} label="one" />
      </SpriteProvider>,
    );

    // No sprite, no throw: the avatar falls back to the drawn character.
    expect(screen.getByTestId('one')).toHaveTextContent('drawing');
    await waitFor(() => expect(stub.callsTo('GET /api/avatars')).toHaveLength(1));
    expect(screen.getByTestId('one')).toHaveTextContent('drawing');
  });

  it('asks for nothing when a person has no photo', () => {
    stub = installFetchStub({ 'GET /api/avatars': { body: { items: [] } } });

    render(
      <SpriteProvider>
        <Face id={null} label="one" />
      </SpriteProvider>,
    );

    expect(screen.getByTestId('one')).toHaveTextContent('drawing');
    expect(stub.callsTo('GET /api/avatars')).toHaveLength(0);
  });

  it('is harmless outside the provider', () => {
    stub = installFetchStub({});
    render(<Face id={firstId} label="one" />);

    expect(screen.getByTestId('one')).toHaveTextContent('drawing');
  });

  /*
   * ADR-228 — a face the participant takes off is dropped from memory and from this device's cache, and only
   * that face. The other faces stay where they were.
   */
  it('forgets a face taken off, from memory and from the device, and keeps the rest', async () => {
    const sprite = spriteOf('0');
    const id = avatarSpriteId(sprite);
    const other = spriteOf('1');
    const otherId = avatarSpriteId(other);
    cacheSprites(
      new Map([
        [id, sprite],
        [otherId, other],
      ]),
    );
    stub = installFetchStub({ 'GET /api/avatars': { body: { items: [] } } });

    function Probe() {
      const face = useSprite(id);
      const forget = useSpriteForget();
      return (
        <>
          <span data-testid="face">{face === null ? 'none' : 'shown'}</span>
          <button type="button" onClick={() => forget(id)}>
            forget
          </button>
        </>
      );
    }
    render(
      <SpriteProvider>
        <Probe />
      </SpriteProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('face')).toHaveTextContent('shown'));

    fireEvent.click(screen.getByRole('button', { name: 'forget' }));

    expect(screen.getByTestId('face')).toHaveTextContent('none');
    expect(readCachedSprites([id]).size).toBe(0);
    expect(readCachedSprites([otherId]).size).toBe(1);
  });

  it('forgetting outside the provider does nothing, and forgetting a face never shown changes nothing (ADR-228)', async () => {
    stub = installFetchStub({ 'GET /api/avatars': { body: { items: [] } } });
    const ghost = avatarSpriteId(spriteOf('9'));

    function Forgetter(props: { id: string }) {
      const forget = useSpriteForget();
      return (
        <button type="button" onClick={() => forget(props.id)}>
          forget
        </button>
      );
    }
    const { unmount } = render(<Forgetter id={ghost} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'forget' }))).not.toThrow();
    unmount();

    cacheSprites(new Map([[firstId, first]]));
    function Probe() {
      const face = useSprite(firstId);
      const forget = useSpriteForget();
      return (
        <>
          <span data-testid="face">{face === null ? 'none' : 'shown'}</span>
          <button type="button" onClick={() => forget(ghost)}>
            forget
          </button>
        </>
      );
    }
    render(
      <SpriteProvider>
        <Probe />
      </SpriteProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('face')).toHaveTextContent('shown'));

    fireEvent.click(screen.getByRole('button', { name: 'forget' }));

    expect(screen.getByTestId('face')).toHaveTextContent('shown');
    expect(readCachedSprites([firstId]).size).toBe(1);
  });
});
