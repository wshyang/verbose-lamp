import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from sprite_pipeline import find_components, key_magenta, sort_reading_order  # noqa: E402

MAGENTA = (252, 2, 250)


def sheet(width=200, height=120):
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    canvas[:, :] = MAGENTA
    return canvas


def test_pure_magenta_becomes_fully_transparent():
    alpha, _ = key_magenta(sheet())
    assert alpha.max() == 0


def test_legitimate_purple_stays_opaque():
    canvas = sheet()
    canvas[20:60, 20:60] = (150, 90, 200)  # saturated purple sprite pixel
    alpha, _ = key_magenta(canvas)
    assert alpha[40, 40] == 255


def test_white_foreground_stays_opaque_and_despilled():
    canvas = sheet()
    canvas[20:60, 20:60] = (245, 245, 250)
    alpha, rgb = key_magenta(canvas)
    assert alpha[40, 40] == 255
    assert rgb[40, 40].tolist() == [245, 245, 250]


def test_detached_droplets_group_with_parent_when_dilated():
    mask = np.zeros((120, 200), dtype=bool)
    mask[40:70, 40:90] = True          # splash body
    mask[30:36, 60:66] = True          # droplet 5px above
    mask[50:55, 20:25] = True          # droplet 15px to the left... within radius 9? no
    grouped = find_components(mask, group_radius=7, min_area=10)
    assert len(grouped) == 2           # body+top droplet, far droplet separate
    ungrouped = find_components(mask, group_radius=0, min_area=10)
    assert len(ungrouped) == 3


def test_ignore_region_excludes_components():
    mask = np.zeros((120, 200), dtype=bool)
    mask[10:20, 10:60] = True   # fake text heading
    mask[60:100, 20:80] = True  # real sprite
    found = find_components(mask, group_radius=0, min_area=10, ignore=[(0, 0, 200, 30)])
    assert len(found) == 1
    assert found[0].y >= 60


def test_reading_order_rows_then_columns():
    from sprite_pipeline import Component
    boxes = [Component(x=100, y=0, w=10, h=10, area=100),
             Component(x=0, y=0, w=10, h=10, area=100),
             Component(x=0, y=100, w=10, h=10, area=100)]
    ordered = sort_reading_order(boxes, row_tolerance=20)
    assert [(b.x, b.y) for b in ordered] == [(0, 0), (100, 0), (0, 100)]
