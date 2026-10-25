// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createPremiereStore, usePremiereStore } from './premiereStore';

function Readout({ store }: { store: ReturnType<typeof createPremiereStore> }) {
  const mode = usePremiereStore(store, (state) => state.cameraMode);
  return <p data-testid="readout">{mode}</p>;
}

describe('usePremiereStore', () => {
  it('renders the selected field and re-renders when that field changes', () => {
    const store = createPremiereStore();
    render(<Readout store={store} />);
    expect(screen.getByTestId('readout').textContent).toBe('cinema');

    act(() => store.getState().setCameraMode('orbit'));

    expect(screen.getByTestId('readout').textContent).toBe('orbit');
  });

  it('does not re-render for a change to a field it did not select', () => {
    const store = createPremiereStore();
    let renders = 0;
    function Counting() {
      renders += 1;
      const mode = usePremiereStore(store, (state) => state.cameraMode);
      return <p>{mode}</p>;
    }
    render(<Counting />);
    const before = renders;

    act(() => store.getState().advance(0.016));
    act(() => store.getState().setTime(10));

    expect(renders).toBe(before);
  });
});
