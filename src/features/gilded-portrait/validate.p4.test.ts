// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { validateImageFile } from './validate';

describe('file type that is not a string', () => {
  it('rejects a metadata object whose type is not text', () => {
    expect(validateImageFile({ type: 42, size: 10 } as unknown as { type: string; size: number })).toMatchObject({
      ok: false,
    });
  });
});
