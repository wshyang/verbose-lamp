"""Pure magenta-keying and component-finding pipeline (CLAUDE §12.2).

Key idea: magentaness = min(R,B) - G. The sheet background sits at ~247,
legitimate purples at <= ~70, so alpha ramps between the two and legitimate
art is never keyed. JPEG fringe is removed by a 1px alpha erode plus a
despill applied only to pixels touching transparency.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

KEY_FULL = 150.0    # magentaness at/above which a pixel is background
KEY_NONE = 65.0     # magentaness at/below which a pixel is solid art


@dataclass(frozen=True)
class Component:
    x: int
    y: int
    w: int
    h: int
    area: int
    label: int = 0

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2


def _magentaness(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    return np.minimum(r, b) - g


def key_magenta(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (alpha uint8, despilled rgb uint8) for a magenta-backed image."""
    mag = _magentaness(rgb)
    alpha = np.clip((KEY_FULL - mag) / (KEY_FULL - KEY_NONE), 0.0, 1.0)
    alpha_u8 = (alpha * 255).astype(np.uint8)
    alpha_u8 = cv2.erode(alpha_u8, np.ones((3, 3), np.uint8))
    return alpha_u8, _despill_edges(rgb, alpha_u8, mag)


def _despill_edges(rgb: np.ndarray, alpha: np.ndarray, mag: np.ndarray) -> np.ndarray:
    solid = (alpha > 200).astype(np.uint8)
    edge = solid - cv2.erode(solid, np.ones((3, 3), np.uint8))
    spill = (edge > 0) & (mag > 25)
    if not spill.any():
        return rgb
    out = rgb.astype(np.float32)
    excess = np.where(spill, (mag - 25) * 0.8, 0.0)
    out[:, :, 0] = np.clip(out[:, :, 0] - excess, 0, 255)
    out[:, :, 2] = np.clip(out[:, :, 2] - excess, 0, 255)
    return out.astype(np.uint8)


def _group_stats(mask: np.ndarray, group_radius: int):
    grouped = mask.astype(np.uint8)
    if group_radius > 0:
        kernel = np.ones((group_radius * 2 + 1,) * 2, np.uint8)
        grouped = cv2.dilate(grouped, kernel)
    return cv2.connectedComponentsWithStats(grouped, connectivity=8)


def _tight_box(mask: np.ndarray, labels: np.ndarray, label: int, stat) -> Component | None:
    x, y, w, h = (int(stat[cv2.CC_STAT_LEFT]), int(stat[cv2.CC_STAT_TOP]),
                  int(stat[cv2.CC_STAT_WIDTH]), int(stat[cv2.CC_STAT_HEIGHT]))
    pixels = mask[y:y + h, x:x + w] & (labels[y:y + h, x:x + w] == label)
    area = int(pixels.sum())
    if area == 0:
        return None
    ys, xs = np.where(pixels)
    return Component(x + int(xs.min()), y + int(ys.min()),
                     int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1), area, label)


def _is_ignored(box: Component, ignore: list[tuple[int, int, int, int]]) -> bool:
    return any(x0 <= box.cx < x1 and y0 <= box.cy < y1 for x0, y0, x1, y1 in ignore)


def find_labelled(mask: np.ndarray, group_radius: int, min_area: int,
                  ignore: list[tuple[int, int, int, int]] | None = None
                  ) -> tuple[list[Component], np.ndarray]:
    """Boxes + per-pixel owner map (group label, 0 = background)."""
    count, labels, stats, _ = _group_stats(mask, group_radius)
    owner = np.where(mask, labels, 0).astype(np.int32)
    boxes: list[Component] = []
    for label in range(1, count):
        box = _tight_box(mask, labels, label, stats[label])
        if box is None or box.area < min_area or _is_ignored(box, ignore or []):
            owner[owner == label] = 0
            continue
        boxes.append(box)
    return boxes, owner


def find_components(mask: np.ndarray, group_radius: int, min_area: int,
                    ignore: list[tuple[int, int, int, int]] | None = None) -> list[Component]:
    return find_labelled(mask, group_radius, min_area, ignore)[0]


def sort_reading_order(boxes: list[Component], row_tolerance: float) -> list[Component]:
    rows: list[list[Component]] = []
    for box in sorted(boxes, key=lambda b: b.cy):
        if rows and abs(box.cy - np.mean([b.cy for b in rows[-1]])) <= row_tolerance:
            rows[-1].append(box)
        else:
            rows.append([box])
    return [box for row in rows for box in sorted(row, key=lambda b: b.x)]
