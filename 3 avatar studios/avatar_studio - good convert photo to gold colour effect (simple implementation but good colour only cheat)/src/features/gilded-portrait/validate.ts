export const MAX_IMAGE_FILE_SIZE = 25 * 1024 * 1024;

export type ImageFileValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export interface ImageFileMetadata {
  readonly type: string;
  readonly size: number;
}

export function validateImageFile(file: ImageFileMetadata | null | undefined): ImageFileValidation {
  if (!file || typeof file !== 'object') {
    return { ok: false, reason: 'Choose an image file such as a JPEG, PNG, or WebP.' };
  }
  const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';
  if (/heic|heif/.test(type)) {
    return { ok: false, reason: 'HEIC photos are not supported yet. Export the image as JPEG or PNG and try again.' };
  }
  if (!type.startsWith('image/')) return { ok: false, reason: 'Choose an image file such as a JPEG, PNG, or WebP.' };
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, reason: 'That image file is empty.' };
  if (file.size > MAX_IMAGE_FILE_SIZE) return { ok: false, reason: 'Choose an image that is 25 MB or smaller.' };
  return { ok: true };
}