import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
from prepare_backdrops import PURE_MAGENTA, remove_sky_corruption  # noqa: E402


def synthetic_plate() -> np.ndarray:
    """Magenta sky, a ghost rectangle strip on top, real scene at bottom."""
    img = np.zeros((300, 400, 3), dtype=np.uint8)
    img[:, :] = PURE_MAGENTA
    img[20:80, 50:350] = (180, 160, 150)    # ghost skyline strip (corruption)
    img[220:300, :] = (40, 120, 160)        # water
    img[150:220, 20:380] = (150, 150, 150)  # buildings connected to ground
    return img


def test_remove_sky_corruption_strips_ghost_keeps_scene():
    cleaned, report = remove_sky_corruption(synthetic_plate())
    assert report["ghostPx"] > 10_000
    assert tuple(cleaned[50, 100]) == PURE_MAGENTA      # ghost gone
    assert tuple(cleaned[180, 100]) == (150, 150, 150)  # buildings kept
    assert tuple(cleaned[280, 100]) == (40, 120, 160)   # water kept


def test_clean_plate_is_untouched():
    img = synthetic_plate()
    img[20:80, 50:350] = PURE_MAGENTA  # no ghost
    cleaned, report = remove_sky_corruption(img)
    assert report["ghostPx"] == 0 and report["residuePx"] == 0
    assert np.array_equal(cleaned, img)


def test_published_layered_backdrops_are_valid():
    public = ROOT / "public/backdrops"
    for theme in ("dawn", "day", "dusk"):
        scene = Image.open(public / f"kallang-scene-{theme}.png").convert("RGBA")
        assert scene.size == (2752, 1536)
        assert scene.getpixel((5, 5))[3] == 0        # sky keyed transparent
        assert scene.getpixel((5, 200))[3] == 0      # ghost strip zone transparent too
        assert scene.getpixel((2740, 1520))[3] == 255  # water opaque
    for sky in ("sky-early-morning", "sky-late-morning", "sky-afternoon",
                "sky-late-afternoon", "sky-dusk"):
        assert Image.open(public / f"{sky}.jpeg").size == (2752, 1536)
