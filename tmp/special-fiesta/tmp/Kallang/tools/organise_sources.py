#!/usr/bin/env python3
"""Curate raw source art into src/images/ with meaningful names (CLAUDE §12.1).

Owns the original -> curated filename map. Exact duplicates (same SHA-256)
are deleted, never renamed. Emits docs/asset-manifest.json. Idempotent:
re-running after curation validates uniqueness and refreshes the manifest.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "src" / "images"
MANIFEST = ROOT / "docs" / "asset-manifest.json"

# original filename -> (curated relative path, role, notes)
CURATION_MAP: dict[str, tuple[str, str, str]] = {
    "Gemini_Generated_Image_2jlj7b2jlj7b2jlj.jpeg": (
        "backdrops/kallang-day-clean.jpeg", "backdrop",
        "Primary scene base: National Stadium + Indoor Stadium, daylight, no people/boats."),
    "Gemini_Generated_Image_on5iyhon5iyhon5i.jpeg": (
        "backdrops/kallang-day-populated-reference.jpeg", "backdrop-reference",
        "Same viewpoint as kallang-day-clean with people/boats baked in; placement reference for the animated scene."),
    "Gemini_Generated_Image_7x6cuk7x6cuk7x6c.jpeg": (
        "backdrops/kallang-sunset-front.jpeg", "backdrop",
        "Frontal viewpoint, finished sunset sky. Alternate backdrop geometry (not used by the v1 scene layout)."),
    "Gemini_Generated_Image_1t2nkv1t2nkv1t2n.jpeg": (
        "backdrops/kallang-magenta-sky-front.jpeg", "backdrop",
        "Near-duplicate variant of kallang-sunset-front: identical composition, magenta key sky for sky replacement."),
    "Gemini_Generated_Image_wiwaelwiwaelwiwa.jpeg": (
        "backdrops/sky-gradient-blue.jpeg", "sky-plate",
        "Plain dithered blue sky gradient plate (sky-replacement / letterbox fill)."),
    "Gemini_Generated_Image_3opyjq3opyjq3opy.jpeg": (
        "sprite-sheets/characters-six-kits.jpeg", "sprite-sheet",
        "Chibi characters in 6 shirt colours (red/blue/green/yellow/orange/purple): idle, side, run, cheer, point poses. Magenta key."),
    "Gemini_Generated_Image_7cr2ov7cr2ov7cr2.jpeg": (
        "sprite-sheets/boats-dragon-and-kayak.jpeg", "sprite-sheet",
        "6 dragon boats (crew, no paddles), kayaks K1/K2/K3, loose paddles/oars, splashes. Magenta key. Paddles are separate: composite-object source."),
    "Gemini_Generated_Image_aoywriaoywriaoyw.jpeg": (
        "sprite-sheets/clouds.jpeg", "sprite-sheet",
        "26 clouds: small puffs, large cumulus, wispy streaks. Magenta key."),
    "Gemini_Generated_Image_n64hnkn64hnkn64h.jpeg": (
        "sprite-sheets/water-effects-and-props-v1.jpeg", "sprite-sheet",
        "Water wakes/splashes/ripples/oar-splashes + PSD Active Day props, tents, arches, podium. Magenta key, text headings baked in (excluded at extraction)."),
    "Gemini_Generated_Image_v7m2evv7m2evv7m2.jpeg": (
        "sprite-sheets/water-effects-and-props-v2.jpeg", "sprite-sheet",
        "Alternate rendition of the same effects/props set with category labels baked in (excluded at extraction). Magenta key."),
    "SportsHub.png": (
        "reference/sportshub-photo.png", "reference-photo",
        "Real-world photo of the National Stadium; likeness reference only, never rendered in the pixel-art scene."),
}


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_raw_sources() -> list[Path]:
    return sorted(p for p in ROOT.iterdir() if p.suffix.lower() in {".jpeg", ".jpg", ".png"})


def group_by_hash(paths: list[Path]) -> dict[str, list[Path]]:
    groups: dict[str, list[Path]] = {}
    for path in paths:
        groups.setdefault(sha256_of(path), []).append(path)
    return groups


def curate(raw: list[Path]) -> list[dict]:
    entries: list[dict] = []
    for digest, group in group_by_hash(raw).items():
        canonical = next((p for p in group if p.name in CURATION_MAP), group[0])
        for duplicate in group:
            if duplicate != canonical:
                print(f"DUPLICATE deleted: {duplicate.name} (same SHA-256 as {canonical.name})")
                duplicate.unlink()
        curated_rel, role, notes = CURATION_MAP[canonical.name]
        destination = IMAGES / curated_rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(canonical), str(destination))
        print(f"CURATED: {canonical.name} -> src/images/{curated_rel}")
        entries.append(describe(destination, curated_rel, role, notes, canonical.name, digest))
    return entries


def describe(path: Path, rel: str, role: str, notes: str, original: str, digest: str) -> dict:
    with Image.open(path) as image:
        width, height = image.size
    return {
        "path": f"src/images/{rel}", "originalName": original, "role": role,
        "notes": notes, "sha256": digest, "width": width, "height": height,
        "bytes": path.stat().st_size,
    }


def validate_curated() -> list[dict]:
    """Re-run path: assert curated set is unique and matches the map."""
    by_original = {original: spec for original, spec in CURATION_MAP.items()}
    entries: list[dict] = []
    hashes: dict[str, str] = {}
    for original, (rel, role, notes) in sorted(by_original.items()):
        path = IMAGES / rel
        if not path.exists():
            sys.exit(f"MISSING curated file: src/images/{rel} (from {original})")
        digest = sha256_of(path)
        if digest in hashes:
            sys.exit(f"DUPLICATE in curated set: {rel} == {hashes[digest]}")
        hashes[digest] = rel
        entries.append(describe(path, rel, role, notes, original, digest))
    return entries


def main() -> None:
    raw = find_raw_sources()
    entries = curate(raw) if raw else validate_curated()
    entries.sort(key=lambda e: e["path"])
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({"images": entries}, indent=2) + "\n")
    print(f"Wrote {MANIFEST.relative_to(ROOT)} with {len(entries)} unique images.")


if __name__ == "__main__":
    main()
