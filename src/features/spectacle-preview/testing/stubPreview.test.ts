import { describe, expect, it, vi } from 'vitest';
import { stubPreview } from './stubPreview';

describe('stubPreview', () => {
  it('declines a stage click unless told otherwise, so picking stays off', () => {
    expect(stubPreview().onStageClick(10, 20)).toBe(false);
  });

  it('takes an override for any field', () => {
    const onStageClick = vi.fn(() => true);

    expect(stubPreview({ onStageClick }).onStageClick(1, 2)).toBe(true);
    expect(onStageClick).toHaveBeenCalledWith(1, 2);
  });

  it('starts open, with every action a spy', () => {
    const preview = stubPreview();

    expect(preview.open).toBe(true);
    expect(vi.isMockFunction(preview.setOpen)).toBe(true);
  });
});
