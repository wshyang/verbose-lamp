// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LuckyDrawStage } from './LuckyDrawStage';

const stage = vi.hoisted(() => {
  const draw = {
    pool: [{ id: 'a', name: 'Alice' }], phase: 'landed', winner: { id: 'a', name: 'Alice' },
    positionRef: { current: 0 }, speedRef: { current: 0 },
  };
  return { draw, drumOptions: [] as unknown[] };
});

vi.mock('@/features/deco-lattice', () => ({
  DecoLatticeFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/shared/ui', () => ({
  Dialog: ({ children, testId }: { children: ReactNode; testId?: string }) => (
    <div data-testid={testId}>{children}</div>
  ),
}));
vi.mock('../hooks/useLuckyDraw', () => ({ useLuckyDraw: () => stage.draw }));
vi.mock('../hooks/useDrumCanvas', () => ({
  useDrumCanvas: (options: unknown) => {
    stage.drumOptions.push(options);
    return { canvasRef: { current: null }, swayRef: { current: null } };
  },
}));
vi.mock('./LuckyDrawControls', () => ({ LuckyDrawControls: () => <div>Controls mock</div> }));
vi.mock('./LuckyDrawResult', () => ({ LuckyDrawResult: () => <div>Result mock</div> }));

describe('LuckyDrawStage', () => {
  it('feeds landed state to the drum and closes from its button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<LuckyDrawStage onClose={onClose} onLanded={vi.fn()} />);
    expect(screen.getByTestId('lucky-draw__stage')).toBeTruthy();
    expect(stage.drumOptions.at(-1)).toMatchObject({ isLanded: true, pool: stage.draw.pool });
    await user.click(screen.getByTestId('lucky-draw__close'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText('Result mock')).toBeTruthy();
    expect(screen.getByText('Controls mock')).toBeTruthy();
  });
});
