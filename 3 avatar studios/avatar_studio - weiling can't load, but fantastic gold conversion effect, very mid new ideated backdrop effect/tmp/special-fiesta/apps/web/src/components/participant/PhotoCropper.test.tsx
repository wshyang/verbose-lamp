import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhotoCropper } from './PhotoCropper.js';

/**
 * ADR-036/056/073/079 — the square, and the two optional props bolted onto it later.
 *
 * `signup.test.tsx` already drives this component through the studio, which always supplies `onBox`
 * and `children`. This covers the other shape: a cropper used bare, the way ADR-036 first shipped it,
 * because an optional prop that is never omitted in a test is an untested default.
 *
 * jsdom reports every element as 0×0, so *geometry* is not what is asserted here — that lives in
 * `cropBox.test.ts`, over pure rectangles. What this pins is the wiring: which callback fires, when,
 * and that a drag reports the square exactly once on release rather than on every move.
 */

const PHOTO = { width: 480, height: 640 };

const surfaceOf = () =>
  screen.getByTestId('photo-cropper').querySelector('.gb-cropper__surface') as Element;

describe('PhotoCropper', () => {
  it('renders without the optional props, as ADR-036 first shipped it', () => {
    render(<PhotoCropper photoUrl="blob:photo" photo={PHOTO} onUse={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByTestId('photo-cropper')).toBeVisible();
    expect(screen.getByTestId('photo-cropper__box')).toBeVisible();
    expect(screen.getByTestId('photo-cropper__handle')).toBeVisible();
    // No children slot supplied: nothing extra is rendered, and nothing throws.
    expect(screen.queryByTestId('cut-out-controls')).toBeNull();
  });

  it('asks the participant to place the square when nothing found a face', () => {
    render(<PhotoCropper photoUrl="blob:photo" photo={PHOTO} onUse={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByTestId('photo-cropper')).toHaveTextContent('Drag the square over your face');
  });

  it('says it found the face when a detector did', () => {
    render(
      <PhotoCropper
        photoUrl="blob:photo"
        photo={PHOTO}
        found={{ x: 20, y: 30, size: 200 }}
        onUse={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId('photo-cropper')).toHaveTextContent('This is the face we found');
  });

  it('shows whatever it is given to host, on the same screen', () => {
    render(
      <PhotoCropper photoUrl="blob:photo" photo={PHOTO} onUse={vi.fn()} onCancel={vi.fn()}>
        <p data-testid="slotted">tuning lives here</p>
      </PhotoCropper>,
    );

    expect(screen.getByTestId('slotted')).toBeVisible();
  });

  it('hands the crop over on "Use this square"', () => {
    const onUse = vi.fn();
    render(<PhotoCropper photoUrl="blob:photo" photo={PHOTO} onUse={onUse} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByTestId('photo-cropper__use'));

    expect(onUse).toHaveBeenCalledTimes(1);
    // A square in photo coordinates, whatever jsdom made of the layout.
    expect(onUse.mock.calls[0]?.[0]).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      size: expect.any(Number),
    });
  });

  it('keeps what you had on cancel, without reporting a crop', () => {
    const onUse = vi.fn();
    const onCancel = vi.fn();
    render(<PhotoCropper photoUrl="blob:photo" photo={PHOTO} onUse={onUse} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId('photo-cropper__cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onUse).not.toHaveBeenCalled();
  });

  /*
   * ADR-079 — release, not move. The cut-out controls rebuild a sprite from whatever square they are
   * handed, at roughly a tenth of a second each, so reporting per pointer-move would be a slideshow.
   */
  it('reports the square once when the finger lifts, not while it moves', () => {
    const onBox = vi.fn();
    render(
      <PhotoCropper
        photoUrl="blob:photo"
        photo={PHOTO}
        onUse={vi.fn()}
        onCancel={vi.fn()}
        onBox={onBox}
      />,
    );

    fireEvent.pointerDown(screen.getByTestId('photo-cropper__box'), {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    fireEvent.pointerMove(surfaceOf(), { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(surfaceOf(), { clientX: 50, clientY: 50, pointerId: 1 });

    expect(onBox).not.toHaveBeenCalled();

    fireEvent.pointerUp(surfaceOf(), { pointerId: 1 });

    expect(onBox).toHaveBeenCalledTimes(1);
  });

  it('says nothing on a pointer-up that was never a drag', () => {
    const onBox = vi.fn();
    render(
      <PhotoCropper
        photoUrl="blob:photo"
        photo={PHOTO}
        onUse={vi.fn()}
        onCancel={vi.fn()}
        onBox={onBox}
      />,
    );

    fireEvent.pointerUp(surfaceOf(), { pointerId: 1 });

    expect(onBox).not.toHaveBeenCalled();
  });

  it('does not throw when a drag ends and nobody asked for the square', () => {
    render(<PhotoCropper photoUrl="blob:photo" photo={PHOTO} onUse={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.pointerDown(screen.getByTestId('photo-cropper__box'), {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });

    expect(() => fireEvent.pointerUp(surfaceOf(), { pointerId: 1 })).not.toThrow();
  });
});

/**
 * ADR-224 — the photograph with the backdrop behind the person, laid over the raw one.
 *
 * What is pinned: the overlay exists only when there is a picture for it, it is invisible to a screen
 * reader (the raw photograph keeps the name), and swapping it leaves the raw image as the same element.
 * That last one is the reason it is an overlay: the raw image seeds the square when it loads, so a new
 * `src` there would move the square the participant had put on their face.
 */
describe('PhotoCropper with the backdrop picture (ADR-224)', () => {
  it('lays the backdrop picture over the raw photograph, invisible to a screen reader', () => {
    render(
      <PhotoCropper
        photoUrl="blob:photo"
        photo={PHOTO}
        preview="blob:backdrop"
        onUse={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const overlay = screen.getByTestId('photo-cropper__backdrop');
    expect(overlay).toHaveAttribute('src', 'blob:backdrop');
    expect(overlay).toHaveAttribute('alt', '');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByAltText('The photo you chose')).toHaveAttribute('src', 'blob:photo');
  });

  it('shows only the raw photograph when there is no backdrop picture', () => {
    render(<PhotoCropper photoUrl="blob:photo" photo={PHOTO} onUse={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByTestId('photo-cropper__backdrop')).toBeNull();
    expect(screen.getByAltText('The photo you chose')).toHaveAttribute('src', 'blob:photo');
  });

  it('swaps the backdrop picture without replacing the raw photograph, so the square stays put', () => {
    const { rerender } = render(
      <PhotoCropper photoUrl="blob:photo" photo={PHOTO} preview="blob:gold" onUse={vi.fn()} onCancel={vi.fn()} />,
    );
    const raw = screen.getByAltText('The photo you chose');

    rerender(
      <PhotoCropper photoUrl="blob:photo" photo={PHOTO} preview="blob:teal" onUse={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByAltText('The photo you chose')).toBe(raw);
    expect(raw).toHaveAttribute('src', 'blob:photo');
    expect(screen.getByTestId('photo-cropper__backdrop')).toHaveAttribute('src', 'blob:teal');
  });
});
