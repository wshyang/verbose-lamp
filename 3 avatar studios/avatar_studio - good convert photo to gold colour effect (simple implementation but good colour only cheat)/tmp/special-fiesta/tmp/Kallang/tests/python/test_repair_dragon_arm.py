import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
from repair_dragon_rower_arm import (  # noqa: E402
    FIST_Y, find_head_centres, is_skin, repair_image, skin_count_near,
)

RED = ROOT / "public/sprites/dragon-boats/dragon-boat-red.png"


def load_red():
    return Image.open(RED).convert("RGBA")


def fist_skin(img):
    w, _ = img.size
    heads = find_head_centres(img)
    return skin_count_near(img, heads[0] - 0.038 * w, FIST_Y, 0.014 * w, 0.03)


def test_head_detection_finds_nine_rowers():
    img = load_red()
    heads = find_head_centres(img)
    assert len(heads) >= 9
    frac = [h / img.width for h in heads]
    assert abs(frac[0] - 0.268) < 0.01 and abs(frac[1] - 0.333) < 0.01


def test_shipped_sprite_already_has_first_rower_arm():
    img = load_red()
    assert fist_skin(img) > 25  # repaired sprite is what's on disk
    out, report = repair_image(img)
    assert report["status"] == "already-repaired"
    assert list(out.getdata()) == list(img.getdata())


def test_repair_clones_arm_onto_erased_sprite_and_is_idempotent():
    img = load_red()
    w, h = img.size
    erased = img.copy()
    px = erased.load()
    for y in range(int(h * 0.29), int(h * 0.48)):
        for x in range(int(w * 0.205), int(w * 0.26)):
            px[x, y] = (0, 0, 0, 0)
    assert fist_skin(erased) <= 25
    repaired, report = repair_image(erased)
    assert report["status"] == "repaired" and report["pasted_px"] >= 120
    assert fist_skin(repaired) > 25
    again, report2 = repair_image(repaired)
    assert report2["status"] == "already-repaired"
    assert list(again.getdata()) == list(repaired.getdata())
