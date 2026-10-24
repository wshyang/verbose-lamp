#!/usr/bin/env python3
"""Generate dawn/dusk-recoloured sprite sets (addendum 0010).

Sprites were painted for noon light and glare against the dawn/dusk
backdrop plates. This backend loader reads every published sprite,
applies a per-theme colour grade (saturation, per-channel gain/offset;
alpha untouched), and writes `public/sprites-{dawn,dusk}/` mirrors plus
`src/generated/sprite-manifest-{dawn,dusk}.json` (same ids/dimensions,
rewritten URLs). The web loader swaps sprite store with the backdrop
theme (morning reuses day sprites; evening reuses the dusk set).

Grades are *measured from the scene plates themselves* — per-channel
percentile affines between the geometrically identical day plate and
each relit plate (median over 2.83M scene pixels), softened so animated
subjects stay slightly more readable than the backdrop:

- dawn vs day: luminance x0.94, saturation x0.76, strong warm shift
  (R median x1.34 / G x0.89 / B x0.82);
- dusk vs day: luminance x0.44, affine gains R 0.56 / G 0.50 / B 0.57,
  saturation x1.17 in the dark blues.

Run standalone (`python3 tools/recolour_sprites.py`) or via
tools/extract_sprites.py (runs after extraction + arm repair).
"""
from __future__ import annotations

import json
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
MANIFEST = ROOT / "src/generated/sprite-manifest.json"


@dataclass(frozen=True)
class Grade:
    saturation: float
    gain: tuple[float, float, float]    # per RGB channel
    offset: tuple[float, float, float]  # per RGB channel, 0-255 units


GRADES: dict[str, Grade] = {
    # softened from measured dawn affine (warm, slightly desaturated)
    "dawn": Grade(saturation=0.85, gain=(1.05, 0.95, 0.84), offset=(10.0, 2.0, 0.0)),
    # softened from measured dusk affine (deep blue dim, slight navy lift)
    "dusk": Grade(saturation=1.05, gain=(0.64, 0.58, 0.72), offset=(3.0, 3.0, 8.0)),
}


def grade_rgba(rgba: np.ndarray, grade: Grade) -> np.ndarray:
    """Apply a grade to an RGBA uint8 array; alpha is preserved exactly."""
    rgb = rgba[:, :, :3].astype(np.float32)
    luma = (0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2])[:, :, None]
    rgb = luma + (rgb - luma) * grade.saturation
    rgb = rgb * np.array(grade.gain, np.float32) + np.array(grade.offset, np.float32)
    out = rgba.copy()
    out[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


def recolour_theme(theme: str, grade: Grade, entries: list[dict]) -> Path:
    target_root = PUBLIC / f"sprites-{theme}"
    if target_root.exists():
        shutil.rmtree(target_root)
    themed_entries = []
    total_bytes = 0
    for entry in entries:
        rel = entry["url"].lstrip("/")
        source = PUBLIC / rel
        themed_url = f"/sprites-{theme}/" + rel.removeprefix("sprites/")
        destination = PUBLIC / themed_url.lstrip("/")
        destination.parent.mkdir(parents=True, exist_ok=True)
        rgba = np.asarray(Image.open(source).convert("RGBA"))
        Image.fromarray(grade_rgba(rgba, grade), "RGBA").save(destination, optimize=True)
        total_bytes += destination.stat().st_size
        themed_entries.append({**entry, "url": themed_url})
    manifest_path = ROOT / f"src/generated/sprite-manifest-{theme}.json"
    manifest_path.write_text(json.dumps({"sprites": themed_entries}, indent=2) + "\n")
    print(f"sprites-{theme}: {len(themed_entries)} sprites, {total_bytes / 1e6:.1f} MB -> {manifest_path.name}")
    return manifest_path


def recolour_all() -> list[Path]:
    entries = json.loads(MANIFEST.read_text())["sprites"]
    return [recolour_theme(theme, grade, entries) for theme, grade in GRADES.items()]


def main() -> None:
    recolour_all()


if __name__ == "__main__":
    main()
