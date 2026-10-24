import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
from recolour_sprites import GRADES, grade_rgba  # noqa: E402


def test_grade_preserves_alpha_and_dims():
    rng = np.random.default_rng(7)
    rgba = rng.integers(0, 256, size=(20, 30, 4), dtype=np.uint8)
    for grade in GRADES.values():
        out = grade_rgba(rgba, grade)
        assert out.shape == rgba.shape
        assert np.array_equal(out[:, :, 3], rgba[:, :, 3])


def test_dusk_darkens_and_dawn_warms():
    sample = np.zeros((4, 4, 4), dtype=np.uint8)
    sample[:, :] = (200, 180, 160, 255)  # warmish light tone
    luma = lambda a: float((a[:, :, :3].astype(float) @ [0.2126, 0.7152, 0.0722]).mean())  # noqa: E731
    dawn = grade_rgba(sample, GRADES["dawn"])
    dusk = grade_rgba(sample, GRADES["dusk"])
    assert luma(dusk) < luma(sample) * 0.75
    # dawn: red amplified relative to blue
    assert dawn[0, 0, 0] / max(int(dawn[0, 0, 2]), 1) > sample[0, 0, 0] / sample[0, 0, 2]


def test_published_variants_match_source_geometry():
    rel = "dragon-boats/dragon-boat-red.png"
    base = Image.open(ROOT / "public/sprites" / rel).convert("RGBA")
    base_alpha = np.asarray(base)[:, :, 3]
    for variant in ("dawn", "dusk"):
        themed = Image.open(ROOT / f"public/sprites-{variant}" / rel).convert("RGBA")
        assert themed.size == base.size
        assert np.array_equal(np.asarray(themed)[:, :, 3], base_alpha)
