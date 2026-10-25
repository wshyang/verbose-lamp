#!/usr/bin/env python3
"""Prepare layered backdrops for the web (addendum 0009).

The static backdrop is a composition of two layers:

- **sky layer** — full-frame dithered gradient JPEGs
  (`src/images/backdrops/sky-*.jpeg`), published verbatim;
- **scene layer** — magenta-sky scene plates per lighting theme
  (`kallang-scene-{dawn,day,dusk}.jpeg`), published as transparent PNGs
  with the magenta keyed out, so the renderer draws sky, then scene.

Sky-corruption cleanup: the dawn plate (and, found on induction, the
dusk plate) carries a duplicated/mirrored skyline strip inside the
magenta sky (dawn rows 3-355, dusk rows 29-354), separated from the real
scene by a pure-magenta band. Measured with the same connected-component
machinery as sprite extraction: the real scene is exactly one component
touching the bottom edge (bbox (0,385,2752,1151) on all three plates —
identical geometry), while the ghost strip is disconnected from it.
Cleanup therefore keeps only the bottom-touching component and resets
everything else to pure magenta *before* keying.

Run standalone (`python3 tools/prepare_backdrops.py`) or via
tools/extract_sprites.py (publish_backdrops hook).
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sprite_pipeline import key_magenta  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC_BACKDROPS = ROOT / "src" / "images" / "backdrops"
PUBLIC_BACKDROPS = ROOT / "public" / "backdrops"

SCENE_THEMES = ("dawn", "day", "dusk")
SKIES = ("sky-early-morning.jpeg", "sky-late-morning.jpeg", "sky-afternoon.jpeg",
         "sky-late-afternoon.jpeg", "sky-dusk.jpeg")
PURE_MAGENTA = (255, 0, 255)
GROUP_KERNEL = np.ones((9, 9), np.uint8)  # bridges JPEG gaps, < the 38px separator band


def remove_sky_corruption(rgb: np.ndarray) -> tuple[np.ndarray, dict]:
    """Reset foreground components that do not touch the bottom edge
    (ghost/mirrored skyline strips in the magenta sky) to pure magenta."""
    alpha, _ = key_magenta(rgb)
    mask = (alpha > 128).astype(np.uint8)
    grouped = cv2.dilate(mask, GROUP_KERNEL)
    _, labels, _, _ = cv2.connectedComponentsWithStats(grouped, connectivity=8)
    owner = np.where(mask > 0, labels, 0)
    bottom_labels = {int(v) for v in np.unique(owner[-4:, :]) if v != 0}
    if not bottom_labels:
        raise ValueError("no scene component touches the bottom edge")
    kept = np.isin(owner, list(bottom_labels))
    ghost = (owner != 0) & ~kept
    cleaned = rgb.copy()
    cleaned[ghost] = PURE_MAGENTA
    # The dawn ghost is translucent: its faintest pixels key to partial
    # alpha and escape the component mask. Anything above the kept
    # scene's per-column skyline is sky by definition — force it magenta.
    # Skyline from the *grouped* (dilated) kept labels, so the cleanup
    # stops a few px above the true edge and never shaves scene pixels.
    kept_grouped = np.isin(labels, list(bottom_labels))
    has_scene = kept_grouped.any(axis=0)
    skyline = np.where(has_scene, np.argmax(kept_grouped, axis=0), cleaned.shape[0])
    above_skyline = np.arange(cleaned.shape[0])[:, None] < skyline[None, :]
    residue = above_skyline & (alpha > 0) & (alpha < 255) & ~ghost
    cleaned[above_skyline] = PURE_MAGENTA
    report = {"ghostPx": int(ghost.sum()), "residuePx": int(residue.sum())}
    changed = ghost | residue
    if changed.any():
        ys, xs = np.where(changed)
        report["cleanedBbox"] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    return cleaned, report


def prepare_scene(source: Path, destination: Path) -> dict:
    rgb = np.asarray(Image.open(source).convert("RGB"))
    cleaned, report = remove_sky_corruption(rgb)
    alpha, despilled = key_magenta(cleaned)
    rgba = np.dstack([despilled, alpha])
    if int(alpha[0, 0]) != 0 or int(alpha[-1, -1]) != 255:
        raise ValueError(f"{source.name}: expected transparent sky corner / opaque water corner")
    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(destination, optimize=True)
    return {"source": source.name, "published": destination.name,
            "bytes": destination.stat().st_size, **report}


def prepare_all() -> list[dict]:
    reports = []
    for theme in SCENE_THEMES:
        reports.append(prepare_scene(
            SRC_BACKDROPS / f"kallang-scene-{theme}.jpeg",
            PUBLIC_BACKDROPS / f"kallang-scene-{theme}.png"))
    for sky in SKIES:
        destination = PUBLIC_BACKDROPS / sky
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SRC_BACKDROPS / sky, destination)
        reports.append({"source": sky, "published": sky, "bytes": destination.stat().st_size})
    return reports


def main() -> None:
    for report in prepare_all():
        print(report)


if __name__ == "__main__":
    main()
