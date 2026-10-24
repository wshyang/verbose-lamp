import { useCallback, useMemo, useState } from 'react';
import { renderEnamelPanel } from '@/features/enamel-backdrop';
import { downloadGildedPng } from '@/features/gilded-portrait';
import type { RgbaImage } from '@/shared/lib/raster';
import { AVATAR_SIZE, composeLayers, cutOutSubject, emptySubject } from '../compose';
import { WEI_LING } from '../data/samples';
import type { ComposedAvatar } from '../types';
import { useAvatarLook, type AvatarLook } from './useAvatarLook';
import { usePhotoSession, type PhotoSession } from './usePhotoSession';
import { useShimmerFrames } from './useShimmerFrames';

export interface AvatarStudioState {
  readonly session: PhotoSession;
  readonly look: AvatarLook;
  readonly avatar: ComposedAvatar;
  /** The still, then (once settled, when the sheen is on) the glint loop. */
  readonly previewFrames: readonly RgbaImage[];
  readonly canDownload: boolean;
  readonly isExporting: boolean;
  readonly exportError: string | null;
  readonly downloadPng: () => Promise<void>;
  readonly showWeiLing: () => void;
}

/**
 * Combines the session and the look. The backdrop and the cut-out are memoised apart, so a
 * pattern tweak does not redo the cut-out and a cut-out tweak does not redo the pattern.
 */
export function useAvatarStudio(): AvatarStudioState {
  const session = usePhotoSession();
  const look = useAvatarLook();
  const [isExporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { photo, crop, matte } = session;
  const { tuning, finish, gilding, frame, backdrop: spec } = look;

  const backdrop = useMemo(() => renderEnamelPanel(spec, AVATAR_SIZE), [spec]);
  const subject = useMemo(() => (photo && crop
    ? cutOutSubject({ photo, crop, matte, tuning, finish, gilding, size: AVATAR_SIZE })
    : emptySubject(AVATAR_SIZE)), [photo, crop, matte, tuning, finish, gilding]);
  const avatar = useMemo(() => composeLayers({ subject, backdrop, frame, rampId: spec.rampId }), [subject, backdrop, frame, spec.rampId]);
  const previewFrames = useShimmerFrames(avatar, look.isShimmering);
  const canDownload = photo !== null && crop !== null && !session.isCropping;

  const downloadPng = useCallback(async () => {
    if (!canDownload || isExporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const stem = session.photoName.replace(/\.[^.]+$/, '') || 'portrait';
      await downloadGildedPng(avatar.image, `${stem}-gilded-avatar`);
    } catch {
      setExportError('The PNG could not be prepared. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [avatar.image, canDownload, isExporting, session.photoName]);

  const { applySampleDefaults } = look;
  const { loadSample } = session;
  const showWeiLing = useCallback(() => {
    applySampleDefaults();
    void loadSample(WEI_LING);
  }, [applySampleDefaults, loadSample]);

  return { session, look, avatar, previewFrames, canDownload, isExporting, exportError, downloadPng, showWeiLing };
}
