import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { segmentSubject } from '@/features/background-removal';
import { locateFace } from '@/features/face-detection';
import { loadRgbaImage, validateImageFile } from '@/features/gilded-portrait';
import type { RgbaImage } from '@/shared/lib/raster';
import { EMPTY_SESSION, messageOf, type SessionState } from '../photoSession';
import type { AvatarSample } from '../types';

export interface PhotoLoaderPort {
  /** Bumped on every new photo, Cancel and unmount; a result from an older value is dropped. */
  readonly sessionRef: MutableRefObject<number>;
  readonly setState: Dispatch<SetStateAction<SessionState>>;
  readonly setAdjusting: (isAdjusting: boolean) => void;
}

async function fetchSampleFile(sample: AvatarSample): Promise<File> {
  const blob = await (await fetch(sample.src)).blob();
  return new File([blob], `${sample.name}.jpg`, { type: blob.type || 'image/jpeg' });
}

/** Opens a photo and runs the face and background analysis, each landing independently. */
export function usePhotoLoader({ sessionRef, setState, setAdjusting }: PhotoLoaderPort) {
  const analyse = useCallback(
    (photo: RgbaImage, session: number) => {
      const isCurrent = () => session === sessionRef.current;
      void locateFace(photo).then((box) => {
        if (isCurrent()) setState((current) => ({ ...current, crop: box, foundCrop: box, isLocating: false }));
      });
      void segmentSubject(photo).then((matte) => {
        if (isCurrent()) setState((current) => ({ ...current, matte, isSegmenting: false }));
      });
    },
    [sessionRef, setState]
  );

  const loadFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const session = ++sessionRef.current;
      setAdjusting(false);
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
    [analyse, sessionRef, setAdjusting, setState]
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
