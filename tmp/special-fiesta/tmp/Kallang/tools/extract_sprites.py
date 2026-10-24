#!/usr/bin/env python3
"""Extract transparent sprites from magenta sheets into public/sprites/.

Modes:
  --debug   write qa/debug-<sheet>.png overlays (numbered boxes) + counts
  (default) extract PNGs + src/generated/sprite-manifest.json + contact sheets
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sheet_config import SHEETS, Region, Sheet  # noqa: E402
from sprite_pipeline import Component, find_labelled, key_magenta, sort_reading_order  # noqa: E402
from repair_dragon_rower_arm import repair_paths  # noqa: E402
from prepare_backdrops import prepare_all as prepare_backdrops  # noqa: E402
from recolour_sprites import recolour_all  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_SPRITES = ROOT / "public" / "sprites"
MANIFEST = ROOT / "src" / "generated" / "sprite-manifest.json"
PAD = 3


def load_keyed(sheet: Sheet) -> tuple[np.ndarray, np.ndarray]:
    rgb = np.asarray(Image.open(ROOT / "src" / "images" / sheet.source).convert("RGB"))
    alpha, despilled = key_magenta(rgb)
    return despilled, alpha


def ignore_px(sheet: Sheet, width: int, height: int) -> list[tuple[int, int, int, int]]:
    return [(int(x0 * width), int(y0 * height), int(x1 * width), int(y1 * height))
            for x0, y0, x1, y1 in sheet.ignore]


def _pass_key(sheet: Sheet, region: Region) -> tuple[int, int]:
    radius = region.group_radius if region.group_radius >= 0 else sheet.group_radius
    min_area = region.min_area if region.min_area >= 0 else sheet.min_area
    return radius, min_area


def _centre_region(regions: list[Region], box: Component, width: int, height: int) -> Region | None:
    for region in regions:
        x0, y0, x1, y1 = region.rect
        if x0 * width <= box.cx < x1 * width and y0 * height <= box.cy < y1 * height:
            return region
    return None


def region_components(sheet: Sheet, alpha: np.ndarray) -> list[tuple[Region, list[Component], np.ndarray]]:
    """Components found on the full sheet, assigned to regions by centre.

    Regions sharing a (group_radius, min_area) form one pass; the mask is
    never clipped to a region, so art crossing a boundary stays whole.
    """
    height, width = alpha.shape
    passes: dict[tuple[int, int], list[Region]] = {}
    for region in sheet.regions:
        passes.setdefault(_pass_key(sheet, region), []).append(region)
    results: list[tuple[Region, list[Component], np.ndarray]] = []
    for (radius, min_area), regions in passes.items():
        labelled, owner = find_labelled(alpha > 60, radius, min_area, ignore_px(sheet, width, height))
        grouped: dict[str, list[Component]] = {id(r).__str__(): [] for r in regions}
        lookup = {id(r).__str__(): r for r in regions}
        for box in labelled:
            region = _centre_region(regions, box, width, height)
            if region is not None:
                grouped[id(region).__str__()].append(box)
        for key, region in lookup.items():
            results.append((region, grouped[key], owner))
    order = {id(region): i for i, region in enumerate(sheet.regions)}
    return sorted(results, key=lambda item: order[id(item[0])])


def assign_names(region: Region, boxes: list[Component], row_tolerance: int) -> list[str]:
    ordered = sort_reading_order(boxes, row_tolerance)
    if region.naming == "list":
        if len(region.names) == len(ordered):
            return list(region.names)
        print(f"WARNING name-count mismatch in {region.name}: "
              f"{len(region.names)} names vs {len(ordered)} components -> numbered fallback")
    if region.naming == "grid":
        return _grid_names(region, ordered, row_tolerance)
    return [f"{region.prefix}-{i + 1:02d}" for i in range(len(ordered))]


def group_rows(boxes: list[Component], row_tolerance: float) -> list[list[Component]]:
    rows: list[list[Component]] = []
    for box in sorted(boxes, key=lambda b: b.cy):
        if rows and abs(box.cy - float(np.mean([b.cy for b in rows[-1]]))) <= row_tolerance:
            rows[-1].append(box)
        else:
            rows.append([box])
    return [sorted(row, key=lambda b: b.x) for row in rows]


def _grid_names(region: Region, boxes: list[Component], row_tolerance: int) -> list[str]:
    names: list[str] = []
    rows = group_rows(boxes, row_tolerance)
    for row_index, row in enumerate(rows):
        row_label = region.rows[row_index] if row_index < len(region.rows) else f"row{row_index + 1}"
        cols = region.rows_cols[row_index] if region.rows_cols else region.cols
        for col_index, _box in enumerate(row):
            col = cols[col_index] if col_index < len(cols) else f"pose{col_index + 1:02d}"
            names.append(f"{region.prefix}-{row_label}-{col}")
    return names


def crop_rgba(rgb: np.ndarray, alpha: np.ndarray, owner: np.ndarray, box: Component) -> Image.Image:
    height, width = alpha.shape
    x0, y0 = max(0, box.x - PAD), max(0, box.y - PAD)
    x1, y1 = min(width, box.x + box.w + PAD), min(height, box.y + box.h + PAD)
    owned_alpha = np.where(owner[y0:y1, x0:x1] == box.label, alpha[y0:y1, x0:x1], 0)
    rgba = np.dstack([rgb[y0:y1, x0:x1], owned_alpha.astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA")


def debug_sheet(sheet: Sheet) -> None:
    rgb, alpha = load_keyed(sheet)
    height, width = alpha.shape
    overlay = Image.fromarray(rgb).resize((1400, int(1400 * height / width)))
    scale = 1400 / width
    draw = ImageDraw.Draw(overlay)
    total = 0
    for region, boxes, _owner in region_components(sheet, alpha):
        ordered = sort_reading_order(boxes, sheet.row_tolerance)
        rows = group_rows(ordered, sheet.row_tolerance)
        names = assign_names(region, boxes, sheet.row_tolerance)
        total += len(ordered)
        print(f"== {sheet.slug}/{region.name}: {len(ordered)} rows={[len(r) for r in rows]}")
        for name, box in zip(names, ordered, strict=True):
            print(f"   {name:34s} x={box.x:4d} y={box.y:4d} w={box.w:4d} h={box.h:4d}")
            xy = [box.x * scale, box.y * scale, (box.x + box.w) * scale, (box.y + box.h) * scale]
            draw.rectangle(xy, outline=(0, 255, 0), width=2)
            draw.text((xy[0] + 2, xy[1] + 2), name[-14:], fill=(0, 255, 0))
    out = ROOT / "qa" / f"debug-{sheet.slug}.png"
    out.parent.mkdir(exist_ok=True)
    overlay.save(out)
    print(f"== {sheet.slug}: {total} components -> {out.relative_to(ROOT)}")


def extract_sheet(sheet: Sheet, entries: list[dict]) -> None:
    rgb, alpha = load_keyed(sheet)
    for region, boxes, owner in region_components(sheet, alpha):
        ordered = sort_reading_order(boxes, sheet.row_tolerance)
        names = assign_names(region, boxes, sheet.row_tolerance)
        for sprite_id, box in zip(names, ordered, strict=True):
            filename = f"{sprite_id}.png"
            destination = PUBLIC_SPRITES / region.name / filename
            destination.parent.mkdir(parents=True, exist_ok=True)
            crop_rgba(rgb, alpha, owner, box).save(destination)
            entries.append({
                "id": sprite_id, "class": region.name,
                "url": f"/sprites/{region.name}/{filename}",
                "width": box.w + PAD * 2, "height": box.h + PAD * 2,
                "sourceSheet": f"src/images/{sheet.source}",
                "sourceBox": {"x": box.x, "y": box.y, "w": box.w, "h": box.h},
            })
        print(f"== {sheet.slug}/{region.name}: {len(ordered)} sprites")


WEB_BACKDROPS = ("backdrops/kallang-day-clean.jpeg", "backdrops/kallang-sunset-front.jpeg",
                 "backdrops/kallang-magenta-sky-front.jpeg", "backdrops/sky-gradient-blue.jpeg")


def publish_backdrops() -> None:
    for rel in WEB_BACKDROPS:
        source = ROOT / "src" / "images" / rel
        destination = ROOT / "public" / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    print(f"Published {len(WEB_BACKDROPS)} backdrops to public/backdrops/")
    for report in prepare_backdrops():  # layered themes (addendum 0009)
        print(f"  layered backdrop: {report['published']} ({report['bytes']}B)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--sheet", default="")
    args = parser.parse_args()
    sheets = [s for s in SHEETS if not args.sheet or s.slug == args.sheet]
    if args.debug:
        for sheet in sheets:
            debug_sheet(sheet)
        return
    if PUBLIC_SPRITES.exists():
        shutil.rmtree(PUBLIC_SPRITES)
    entries: list[dict] = []
    for sheet in sheets:
        extract_sheet(sheet, entries)
    ids = [e["id"] for e in entries]
    if len(ids) != len(set(ids)):
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        sys.exit(f"Duplicate sprite ids: {duplicates}")
    # Repair rower 1's missing raised arm in the source art (addendum 0008).
    dragon_paths = sorted((PUBLIC_SPRITES / "dragon-boats").glob("dragon-boat-*.png"))
    if dragon_paths:
        for report in repair_paths(dragon_paths):
            print(f"  arm repair: {Path(report['path']).name} -> {report['status']}")
    entries.sort(key=lambda e: (e["class"], e["id"]))
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    publish_backdrops()
    MANIFEST.write_text(json.dumps({"sprites": entries}, indent=2) + "\n")
    print(f"Wrote {len(entries)} sprites; manifest -> {MANIFEST.relative_to(ROOT)}")
    recolour_all()  # dawn/dusk sprite variants (addendum 0010)


if __name__ == "__main__":
    main()
