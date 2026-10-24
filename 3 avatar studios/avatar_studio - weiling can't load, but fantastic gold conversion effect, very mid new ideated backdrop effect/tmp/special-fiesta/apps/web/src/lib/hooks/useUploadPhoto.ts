import { useCallback, useState } from 'react';
import { uploadGalleryPhoto } from '../api/gallery.js';
import { shrinkForGallery } from '../photo/shrinkPhoto.js';
import { describeError } from './useAsyncData.js';

/**
 * Picking a photo and sharing it (ADR-047).
 *
 * The shrink happens here, before the request, and that ordering is the point: what leaves the
 * phone is ~250 kB instead of a 3–12 MB camera file. It is also where EXIF — including GPS —
 * stops existing, so the privacy scrub cannot be forgotten by a caller.
 */

export interface PhotoUpload {
  caption: string;
  setCaption: (value: string) => void;
  isSharing: boolean;
  error: string | null;
  /** False until a photo has been picked; the share button stays disabled until then. */
  hasPhoto: boolean;
  pick: (file: File | undefined) => void;
  share: () => void;
  clear: () => void;
}

export function useUploadPhoto(onShared: () => void): PhotoUpload {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setFile(null);
    setCaption('');
    setError(null);
  }, []);

  const pick = useCallback((picked: File | undefined) => {
    setError(null);
    setFile(picked ?? null);
  }, []);

  const share = useCallback(() => {
    if (!file || isSharing) return;
    setIsSharing(true);
    setError(null);
    void (async () => {
      try {
        const photo = await shrinkForGallery(file);
        await uploadGalleryPhoto({ photo, caption });
        clear();
        onShared();
      } catch (cause) {
        setError(describeError(cause));
      } finally {
        setIsSharing(false);
      }
    })();
  }, [caption, clear, file, isSharing, onShared]);

  return { caption, setCaption, isSharing, error, hasPhoto: file !== null, pick, share, clear };
}
