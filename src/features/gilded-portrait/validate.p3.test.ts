// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { validateImageFile } from './validate';

describe('image file validation', () => {
  it('rejects metadata whose type is not a string', () => {
    const result = validateImageFile({ type: 42 as unknown as string, size: 1024 });
    expect(result).toEqual({ ok: false, reason: 'Choose an image file such as a JPEG, PNG, or WebP.' });
  });
});
