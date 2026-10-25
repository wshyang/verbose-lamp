// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WEI_LING } from '../data/samples';
import { useAvatarStudio } from './useAvatarStudio';

const PHOTO = { width: 4, height: 4, data: new Uint8ClampedArray(4) };
const CROP = { x: 0, y: 0, size: 4 };
const BACKDROP = { id: 'backdrop' };
const SUBJECT = { id: 'subject' };
const EMPTY = { id: 'empty' };
const AVATAR = { image: { id: 'avatar-image' } };

const mocks = vi.hoisted(() => ({
  session: undefined as never,
  look: undefined as never,
  renderEnamelPanel: vi.fn(),
  downloadGildedPng: vi.fn(),
  composeLayers: vi.fn(),
  cutOutSubject: vi.fn(),
  emptySubject: vi.fn(),
  useShimmerFrames: vi.fn(),
}));

vi.mock('@/features/enamel-backdrop', () => ({ renderEnamelPanel: mocks.renderEnamelPanel }));
vi.mock('@/features/gilded-portrait', () => ({ downloadGildedPng: mocks.downloadGildedPng }));
vi.mock('../compose', () => ({
  AVATAR_SIZE: 128,
  composeLayers: mocks.composeLayers,
  cutOutSubject: mocks.cutOutSubject,
  emptySubject: mocks.emptySubject,
}));
vi.mock('./useAvatarLook', () => ({ useAvatarLook: () => mocks.look }));
vi.mock('./usePhotoSession', () => ({ usePhotoSession: () => mocks.session }));
vi.mock('./useShimmerFrames', () => ({ useShimmerFrames: mocks.useShimmerFrames }));

function fixtures() {
  mocks.session = {
    photo: PHOTO, crop: CROP, matte: null, isCropping: false,
    photoName: 'sitter.final.JPG', loadSample: vi.fn(() => Promise.resolve()),
  } as never;
  mocks.look = {
    tuning: {}, finish: 'natural', gilding: {}, frame: 'medallion',
    backdrop: { rampId: 'bright' }, isShimmering: true,
    applySampleDefaults: vi.fn(),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtures();
  mocks.renderEnamelPanel.mockReturnValue(BACKDROP);
  mocks.cutOutSubject.mockReturnValue(SUBJECT);
  mocks.emptySubject.mockReturnValue(EMPTY);
  mocks.composeLayers.mockReturnValue(AVATAR);
  mocks.useShimmerFrames.mockReturnValue([AVATAR.image]);
  mocks.downloadGildedPng.mockResolvedValue(undefined);
});

describe('useAvatarStudio', () => {
  it('composes backdrop and cut-out independently for a ready photo', () => {
    const { result } = renderHook(() => useAvatarStudio());
    expect(result.current.avatar).toBe(AVATAR);
    expect(result.current.canDownload).toBe(true);
    expect(mocks.renderEnamelPanel).toHaveBeenCalledWith(
      (mocks.look as { backdrop: unknown }).backdrop, 128
    );
    expect(mocks.cutOutSubject).toHaveBeenCalledWith(expect.objectContaining({ photo: PHOTO, crop: CROP, size: 128 }));
    expect(mocks.composeLayers).toHaveBeenCalledWith({
      subject: SUBJECT, backdrop: BACKDROP, frame: 'medallion', rampId: 'bright',
    });
    expect(mocks.useShimmerFrames).toHaveBeenCalledWith(AVATAR, true);
  });

  it('uses an empty subject without both photo and crop, and blocks downloads while cropping', () => {
    const variants = [
      { photo: null, crop: CROP, isCropping: false },
      { photo: PHOTO, crop: null, isCropping: false },
      { photo: PHOTO, crop: CROP, isCropping: true },
    ];
    for (const variant of variants) {
      fixtures();
      mocks.session = { ...(mocks.session as object), ...variant } as never;
      const { result, unmount } = renderHook(() => useAvatarStudio());
      expect(result.current.canDownload).toBe(false);
      if (variant.isCropping) expect(mocks.cutOutSubject).toHaveBeenCalled();
      unmount();
    }
    expect(mocks.emptySubject).toHaveBeenCalledTimes(2);
  });

  it('downloads with photo-name stems and prevents parallel exports', async () => {
    let resolve!: () => void;
    mocks.downloadGildedPng.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    const { result } = renderHook(() => useAvatarStudio());
    let downloading!: Promise<void>;
    act(() => { downloading = result.current.downloadPng(); });
    expect(result.current.isExporting).toBe(true);
    await act(async () => result.current.downloadPng());
    expect(mocks.downloadGildedPng).toHaveBeenCalledOnce();
    await act(async () => {
      resolve();
      await downloading;
    });
    expect(mocks.downloadGildedPng).toHaveBeenCalledWith(AVATAR.image, 'sitter.final-gilded-avatar');
    expect(result.current).toMatchObject({ isExporting: false, exportError: null });
  });

  it('does not download when unavailable and reports export failures', async () => {
    mocks.session = { ...(mocks.session as object), photo: null } as never;
    const blocked = renderHook(() => useAvatarStudio());
    await act(async () => blocked.result.current.downloadPng());
    expect(mocks.downloadGildedPng).not.toHaveBeenCalled();
    blocked.unmount();

    fixtures();
    mocks.downloadGildedPng.mockRejectedValue(new Error('disk'));
    const { result } = renderHook(() => useAvatarStudio());
    await act(async () => result.current.downloadPng());
    expect(result.current.exportError).toBe('The PNG could not be prepared. Please try again.');
  });

  it('falls back to portrait for empty stems and keeps extensionless names', async () => {
    mocks.session = { ...(mocks.session as object), photoName: '.jpeg' } as never;
    const first = renderHook(() => useAvatarStudio());
    await act(async () => first.result.current.downloadPng());
    expect(mocks.downloadGildedPng).toHaveBeenLastCalledWith(AVATAR.image, 'portrait-gilded-avatar');
    first.unmount();

    fixtures();
    mocks.session = { ...(mocks.session as object), photoName: 'sitter' } as never;
    const second = renderHook(() => useAvatarStudio());
    await act(async () => second.result.current.downloadPng());
    expect(mocks.downloadGildedPng).toHaveBeenLastCalledWith(AVATAR.image, 'sitter-gilded-avatar');
  });

  it('applies sample defaults before loading Wei_Ling', () => {
    const { result } = renderHook(() => useAvatarStudio());
    act(() => result.current.showWeiLing());
    const look = mocks.look as unknown as { applySampleDefaults: ReturnType<typeof vi.fn> };
    const session = mocks.session as unknown as { loadSample: ReturnType<typeof vi.fn> };
    expect(look.applySampleDefaults).toHaveBeenCalledOnce();
    expect(session.loadSample).toHaveBeenCalledWith(WEI_LING);
  });
});
