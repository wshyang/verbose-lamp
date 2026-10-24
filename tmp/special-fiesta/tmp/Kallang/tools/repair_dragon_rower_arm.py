#!/usr/bin/env python3
"""Repair the first dragon-boat rower's missing raised (top-hand) arm.

The source art paints 9 rowers per boat, but rower 1 (directly behind the
drum) has no raised arm/fist — his paddle's top grip floats unheld
(addendum 0008). Every other rower has the identical arm: a raised fist
up-forward of the head with the forearm sloping down behind the hair.

This tool clones that arm algorithmically from rower 2 of the *same*
sprite (so skin/singlet palette always matches the hull colour):

1. Detect rower head centres from hair-colour column clusters.
2. Flood-fill rower 2's raised arm from its fist, confined to a buffered
   corridor along the forearm; colour classes separate skin / outline /
   wristband-purple from hair, and magenta keying fringe is pruned.
3. Paste the component translated by the head-centre delta onto rower 1,
   only where the target is transparent — so the cloned forearm passes
   *behind* rower 1's hair and the drum, exactly like the originals.

Idempotent: if skin is already present at rower 1's fist position the
sprite is left untouched. Invoked automatically at the end of
tools/extract_sprites.py; can also be run standalone:
`python3 tools/repair_dragon_rower_arm.py [png ...]`
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GLOB = "public/sprites/dragon-boats/dragon-boat-*.png"

# Measured crew geometry (fractions of sprite size; addendum 0007/0008).
FIST_DX_FROM_HEAD = -0.038      # raised fist sits this far left of its head centre
FIST_Y = 0.335                  # seed height for the fist search
CORRIDOR_END = (-0.006, 0.465)  # forearm disappears behind the hair here
CORRIDOR_BUFFER_FRAC = 0.013    # of sprite width (~15px at native size)
CORRIDOR_XMAX_FROM_HEAD = 0.004
CORRIDOR_YMAX = 0.475


def is_skin(r: int, g: int, b: int, a: int) -> bool:
    return a > 200 and r > 115 and g > 65 and (r - g) > 18 and (r - b) > 22 and g >= b - 25


def is_outline(r: int, g: int, b: int, a: int) -> bool:
    return a > 200 and max(r, g, b) < 58


def is_purple(r: int, g: int, b: int, a: int) -> bool:  # wristband
    return a > 200 and b >= g + 14 and r >= g + 4 and r < 180 and b - r < 70


def is_hair(r: int, g: int, b: int, a: int) -> bool:
    return a > 200 and 45 <= max(r, g, b) <= 118 and b >= r - 6 and abs(r - g) <= 16 \
        and not is_purple(r, g, b, a)


def is_magenta_fringe(r: int, g: int, b: int, a: int) -> bool:
    return a > 200 and r > 100 and b > 90 and g < 0.55 * min(r, b)


def is_dark_head(r: int, g: int, b: int, a: int) -> bool:
    """Hair OR its outline, for head detection only (the flood fill needs
    the stricter is_hair so it can traverse outline but not hair)."""
    return a > 200 and max(r, g, b) <= 118 and b >= r - 10 \
        and not is_purple(r, g, b, a) and not is_magenta_fringe(r, g, b, a)


def find_head_centres(img: Image.Image) -> list[float]:
    """Rower head centres (x in px) from dark-head column clusters.
    Fragments closer than 0.02W are merged (some hull colours shade the
    hair so a head splits into two clusters)."""
    w, h = img.size
    px = img.load()
    groups: list[tuple[int, int]] = []
    start: int | None = None
    for x in range(int(w * 0.10), w):
        count = sum(1 for y in range(int(h * 0.32), int(h * 0.50)) if is_dark_head(*px[x, y]))
        if count >= 6:
            if start is None:
                start = x
        elif start is not None:
            if x - start > 4:
                groups.append((start, x))
            start = None
    if start is not None:
        groups.append((start, w - 1))
    merged: list[tuple[int, int]] = []
    for a, b in groups:
        if merged and a - merged[-1][1] < w * 0.02:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return [(a + b) / 2 for a, b in merged if (a + b) / 2 > w * 0.24]


def skin_count_near(img: Image.Image, cx: float, cy_frac: float, rx: float, ry_frac: float) -> int:
    w, h = img.size
    px = img.load()
    y0, y1 = int(h * (cy_frac - ry_frac)), int(h * (cy_frac + ry_frac))
    return sum(
        1
        for y in range(max(0, y0), min(h, y1))
        for x in range(max(0, int(cx - rx)), min(w, int(cx + rx)))
        if is_skin(*px[x, y])
    )


def extract_donor_arm(img: Image.Image, donor_head_cx: float) -> set[tuple[int, int]]:
    w, h = img.size
    px = img.load()
    ax, ay = donor_head_cx + FIST_DX_FROM_HEAD * w, 0.33 * h
    bx, by = donor_head_cx + CORRIDOR_END[0] * w, CORRIDOR_END[1] * h
    buffer_px = CORRIDOR_BUFFER_FRAC * w
    xmax = donor_head_cx + CORRIDOR_XMAX_FROM_HEAD * w
    ymax = CORRIDOR_YMAX * h

    def in_corridor(x: int, y: int) -> bool:
        if x > xmax or y > ymax:
            return False
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
        cx, cy = ax + t * dx, ay + t * dy
        return (x - cx) ** 2 + (y - cy) ** 2 <= buffer_px * buffer_px

    def passable(x: int, y: int) -> bool:
        if not (0 <= x < w and 0 <= y < h):
            return False
        r, g, b, a = px[x, y]
        if is_hair(r, g, b, a) or is_magenta_fringe(r, g, b, a):
            return False
        return is_skin(r, g, b, a) or is_outline(r, g, b, a) or is_purple(r, g, b, a)

    sx, sy = int(ax), int(FIST_Y * h)
    seed: tuple[int, int] | None = None
    for rad in range(0, 16):
        for yy in range(sy - rad, sy + rad + 1):
            for xx in range(sx - rad, sx + rad + 1):
                if 0 <= xx < w and 0 <= yy < h and is_skin(*px[xx, yy]):
                    seed = (xx, yy)
                    break
            if seed:
                break
        if seed:
            break
    if seed is None:
        raise ValueError("donor fist not found near predicted position")

    component: set[tuple[int, int]] = {seed}
    queue: deque[tuple[int, int]] = deque([seed])
    while queue:
        x, y = queue.popleft()
        for ddx in (-1, 0, 1):
            for ddy in (-1, 0, 1):
                n = (x + ddx, y + ddy)
                if n not in component and in_corridor(*n) and passable(*n):
                    component.add(n)
                    queue.append(n)
    # one 4-connected outline dilation so the arm keeps its full dark edge
    for x, y in list(component):
        for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + ddx, y + ddy)
            if n not in component and in_corridor(*n) and is_outline(*px[n[0], n[1]]):
                component.add(n)
    # prune any residual fringe, keeping only the seed's connected piece
    component = {p for p in component if not is_magenta_fringe(*px[p[0], p[1]])}
    kept: set[tuple[int, int]] = set()
    if seed in component:
        queue = deque([seed])
        kept.add(seed)
        while queue:
            x, y = queue.popleft()
            for ddx in (-1, 0, 1):
                for ddy in (-1, 0, 1):
                    n = (x + ddx, y + ddy)
                    if n in component and n not in kept:
                        kept.add(n)
                        queue.append(n)
    return kept


def repair_image(img: Image.Image) -> tuple[Image.Image, dict]:
    """Return (possibly repaired copy, report). Input is not mutated."""
    w, h = img.size
    heads = find_head_centres(img)
    if len(heads) < 2:
        raise ValueError(f"expected rower heads, found {len(heads)}")
    target_head, donor_head = heads[0], heads[1]
    target_fist_cx = target_head + FIST_DX_FROM_HEAD * w
    existing = skin_count_near(img, target_fist_cx, FIST_Y, 0.014 * w, 0.03)
    if existing > 25:
        return img.copy(), {"status": "already-repaired", "skin_at_fist": existing, "heads": len(heads)}

    arm = extract_donor_arm(img, donor_head)
    fraction = len(arm) / (w * h)
    if not (0.001 < fraction < 0.006):
        raise ValueError(f"donor arm component implausible: {len(arm)}px ({fraction:.4f} of sprite)")

    out = img.copy()
    src, dst = img.load(), out.load()
    dx = int(round(target_head - donor_head))
    pasted = 0
    for x, y in arm:
        nx = x + dx
        if 0 <= nx < w and dst[nx, y][3] <= 16:  # behind existing art (hair, drum)
            dst[nx, y] = src[x, y]
            pasted += 1
    if pasted < 120:
        raise ValueError(f"implausibly few pixels pasted: {pasted}")
    return out, {
        "status": "repaired", "heads": len(heads), "arm_px": len(arm),
        "pasted_px": pasted, "dx_px": dx,
        "fist_expected_frac": round(target_fist_cx / w, 3),
    }


def repair_paths(paths: list[Path]) -> list[dict]:
    reports = []
    for path in paths:
        img = Image.open(path).convert("RGBA")
        out, report = repair_image(img)
        if report["status"] == "repaired":
            out.save(path)
        reports.append({"path": str(path), **report})
    return reports


def main() -> None:
    args = [Path(a) for a in sys.argv[1:]]
    paths = args or sorted(ROOT.glob(DEFAULT_GLOB))
    if not paths:
        sys.exit("no dragon-boat sprites found")
    for report in repair_paths(paths):
        print(report)


if __name__ == "__main__":
    main()
