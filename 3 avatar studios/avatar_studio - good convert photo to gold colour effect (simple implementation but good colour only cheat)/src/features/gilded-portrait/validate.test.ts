import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_FILE_SIZE, validateImageFile } from './validate';

describe('image file validation', () => {
  it('accepts supported image files within the size limit', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1024 })).toEqual({ ok: true });
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_FILE_SIZE })).toEqual({ ok: true });
  });

  it('returns user-facing reasons for invalid formats and oversized files', () => {
    expect(() => validateImageFile(null)).not.toThrow();
    expect(validateImageFile(null)).toMatchObject({ ok: false });
    expect(validateImageFile({ type: 'application/pdf', size: 2048 })).toMatchObject({ ok: false });
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_FILE_SIZE + 1 })).toMatchObject({ ok: false });
    const heicResult = validateImageFile({ type: 'image/heic', size: 2048 });
    expect(heicResult).toMatchObject({ ok: false });
    if (!heicResult.ok) expect(heicResult.reason).toMatch(/JPEG|PNG/i);
    expect(validateImageFile({ type: 'image/jpeg', size: 0 })).toMatchObject({ ok: false });
  });
});