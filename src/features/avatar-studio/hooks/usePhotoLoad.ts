import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { loadRgbaImage, validateImageFile } from '@/features/gilded-portrait';
import type { RgbaImage } from '@/shared/lib/raster';
import { fetchSampleFile } from '../model/sampleFile';
import { EMPTY_SESSION, type SessionState } from '../model/sessionView';
import type { AvatarSample } from '../types';

interface PhotoLoadSources {
  setState: Dispatch<SetStateAction<SessionState>>;
  /** Bumped on every new photo, cancel and unmount; stale results compare against it. */
  sessionRef: MutableRefObject<number>;
  analyse: (photo: RgbaImage, session: number) => void;
  /** Called when a load starts, so an open cropper closes. */
  onLoading: () => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'That image could not be opened.');

/**
 * Turning a `File` (or a built-in sample) into a session: validate, decode, then
 * hand the pixels to the analyses. Every step re-checks the session counter, so a
 * slower decode cannot overwrite a photo the user has already replaced
 * (ADDENDUM-039).
 */
export function usePhotoLoad({ setState, sessionRef, analyse, onLoading }: PhotoLoadSources) {
  const loadFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const session = ++sessionRef.current;
      onLoading();
      const validation = validateImageFile({ type: file.type, size: file.size });
      if (!validation.ok) {
        setState({ ...EMPTY_SESSION, error: validation.reason });
        return;
      }
      setState({ ...EMPTY_SESSION, photoName: file.name, isLocating: true, isSegmenting: true });
      try {
        const photo = await loadRgbaImage(file);
        if (session !== sessionRef.current) return;
        setState((current) => ({ ...current, photo }));
        analyse(photo, session);
      } catch (error) {
        if (session === sessionRef.current) setState({ ...EMPTY_SESSION, error: messageOf(error) });
      }
    },
    [analyse, onLoading, sessionRef, setState]
  );

  const loadSample = useCallback(
    async (sample: AvatarSample) => {
      try {
        await loadFile(await fetchSampleFile(sample));
      } catch {
        setState({ ...EMPTY_SESSION, error: `${sample.name}'s photo could not be opened.` });
      }
    },
    [loadFile, setState]
  );

  return { loadFile, loadSample };
}
