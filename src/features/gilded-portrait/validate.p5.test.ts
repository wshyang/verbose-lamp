// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { validateImageFile } from './validate';

describe('image file validation with odd metadata', () => {
  it('rejects a file whose type is not a string', () => {
    const weird = { type: 123 as unknown as string, size: 2048 };
    expect(validateImageFile(weird)).toMatchObject({ ok: false });
  });
});
