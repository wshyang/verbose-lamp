/**
 * ADR-298 — the geometry helpers every pixel scene shares, parameterised by the plate's size.
 *
 * Each returns CSS percentages of the scene box, so a sprite stays glued to its pixel of the
 * panorama at any scale. They were inline in the Sentosa generator, closed over its 480x270;
 * a second venue's plate is a different size, so they take it as an argument instead.
 */

const pct = (value) => `${Math.round(value * 1000) / 1000}%`;

export function layoutFor(W, H) {
  /**
   * Anchors a full-box layer so art unit (x, y) lands under the sprite at every scale:
   * `background-position: p%` places the image at p% of the free space.
   */
  function anchor(sprite, x, y) {
    return {
      backgroundSize: `${pct((sprite.units / W) * 100)} auto`,
      backgroundPosition: `${pct((x / (W - sprite.units)) * 100)} ${pct((y / (H - sprite.unitsHigh)) * 100)}`,
    };
  }

  /**
   * A two-frame sheet gets a box exactly one frame big, with the sheet at 200% width. Sizing
   * the layer to the whole sheet drew *both* frames at once — which is how the palms grew a
   * third crown hovering over the umbrella.
   */
  function frame(sprite, x, y) {
    const frameW = sprite.units / 2;
    return {
      left: pct((x / W) * 100),
      top: pct((y / H) * 100),
      width: pct((frameW / W) * 100),
      height: pct((sprite.unitsHigh / H) * 100),
      backgroundSize: '200% auto',
    };
  }

  const strip = (sprite, top) => ({ top: pct((top / H) * 100), height: pct((sprite.unitsHigh / H) * 100) });

  return { anchor, frame, strip, pct };
}
