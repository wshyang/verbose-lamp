import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "src" / "generated" / "sprite-manifest.json"


def load():
    return json.loads(MANIFEST.read_text())["sprites"]


def test_manifest_entries_match_files_on_disk():
    sprites = load()
    assert sprites, "manifest is empty - run tools/extract_sprites.py"
    on_disk = {str(p.relative_to(ROOT / "public")) for p in (ROOT / "public" / "sprites").rglob("*.png")}
    in_manifest = {s["url"].lstrip("/") for s in sprites}
    assert on_disk == in_manifest


def test_sprite_ids_unique_and_sizes_positive():
    sprites = load()
    assert len({s["id"] for s in sprites}) == len(sprites)
    assert all(s["width"] > 0 and s["height"] > 0 for s in sprites)
