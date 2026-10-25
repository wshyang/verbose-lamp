import { useCallback, useState } from 'react';
import { ALL_SCREEN_SCENE_IDS, toggleScreenScene } from '@psd/contracts';
import type { ScreenKeyView, ScreenSceneId } from '@psd/contracts';
import {
  createScreenKey,
  fetchScreenKeys,
  revokeScreenKey,
  setScreenKeyScenes,
} from '../api/admin.js';
import { useAction } from './useAction.js';
import { firstError, useAsyncData } from './useAsyncData.js';

/**
 * ADR-145 — the superadmin's end of the hall screen (ADR-140).
 *
 * Until this existed the projector could only be started by someone willing to hand-write a
 * URL containing a credential nothing in the console would show them. That is not a missing
 * convenience; it is the feature being unusable by the people it was built for.
 */

/**
 * The one thing this hook holds that is not server state: the freshly minted URL, which no
 * later read can recover. It lives here rather than in the panel so that leaving the page
 * destroys it — a credential left sitting on a laptop in a hall should expire with the
 * operator's attention, not linger behind whatever they opened next.
 */
export interface MintedScreen {
  label: string;
  url: string;
}

/**
 * Built against the console's own origin, because the projector and the console are the same
 * deployment and anything else would be a guess the operator has to check.
 */
function screenUrlFor(token: string): string {
  return `${window.location.origin}/screen?key=${encodeURIComponent(token)}`;
}

/**
 * ADR-160 — saving a live key's scene list. Separated only so the hook below stays inside
 * ADR-012's line budget; it has no state of its own.
 */
function useSceneEditor(reload: () => void) {
  return useAction(
    useCallback(
      (input: { id: string; scenes: readonly ScreenSceneId[] }) =>
        setScreenKeyScenes(input.id, input.scenes),
      [],
    ),
    reload,
  );
}

export function useScreenKeys() {
  const state = useAsyncData(useCallback(() => fetchScreenKeys(), []));
  const reload = state.reload;
  const [minted, setMinted] = useState<MintedScreen | null>(null);
  const [label, setLabel] = useState('');
  /*
   * ADR-160 — a new screen starts showing everything, and the operator subtracts. Starting
   * from nothing would make the common case (a hall screen) the one that needs nine clicks,
   * and would make the required-at-least-one rule fire on the very first thing anybody does.
   */
  const [scenes, setScenes] = useState<ScreenSceneId[]>([...ALL_SCREEN_SCENE_IDS]);

  const create = useAction(
    useCallback((input: { name: string; scenes: readonly ScreenSceneId[] }) =>
      createScreenKey(input.name, input.scenes), []),
    useCallback(
      (created: { screenKey: ScreenKeyView; token: string }) => {
        setMinted({ label: created.screenKey.label, url: screenUrlFor(created.token) });
        setLabel('');
        setScenes([...ALL_SCREEN_SCENE_IDS]);
        reload();
      },
      [reload],
    ),
  );

  const revoke = useAction(
    useCallback((screenKeyId: string) => revokeScreenKey(screenKeyId), []),
    useCallback(() => {
      /*
       * The minted URL is dropped on any revoke, not only on its own. An operator who has
       * just retired a screen should not be looking at a live key underneath the list they
       * used to do it — and working out which of the two it belongs to is exactly the kind
       * of care nobody has at five past four.
       */
      setMinted(null);
      reload();
    }, [reload]),
  );

  const editScenes = useSceneEditor(reload);

  return {
    keys: state.data?.items ?? [],
    isLoading: state.isLoading,
    error: firstError([state.error, create.error, revoke.error, editScenes.error]),
    isBusy: create.isPending || revoke.isPending || editScenes.isPending,
    label,
    setLabel,
    scenes,
    toggleScene: (id: ScreenSceneId) =>
      setScenes((current) => [...toggleScreenScene(current, id)]),
    setKeyScenes: (id: string, next: readonly ScreenSceneId[]) =>
      void editScenes.run({ id, scenes: next }),
    minted,
    /** Dismissing is the operator saying they have the URL; nothing can bring it back. */
    dismissMinted: () => setMinted(null),
    mint: () => void create.run({ name: label.trim(), scenes }),
    revoke: (screenKeyId: string) => () => void revoke.run(screenKeyId),
  };
}
