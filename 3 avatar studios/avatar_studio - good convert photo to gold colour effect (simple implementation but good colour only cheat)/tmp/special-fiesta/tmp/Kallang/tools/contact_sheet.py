#!/usr/bin/env python3
"""Render per-class contact sheets (checkerboard bg) into qa/ for eyeball QA."""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CELL = 240
COLS = 6


def checker(width: int, height: int) -> Image.Image:
    board = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(board)
    for y in range(0, height, 16):
        for x in range(0, width, 16):
            if (x // 16 + y // 16) % 2:
                draw.rectangle([x, y, x + 15, y + 15], fill=(190, 190, 205))
    return board


def sheet_for(class_name: str, sprites: list[dict]) -> None:
    rows = math.ceil(len(sprites) / COLS)
    board = checker(COLS * CELL, rows * (CELL + 18))
    draw = ImageDraw.Draw(board)
    for index, sprite in enumerate(sprites):
        image = Image.open(ROOT / "public" / sprite["url"].lstrip("/"))
        image.thumbnail((CELL - 12, CELL - 12), Image.NEAREST)
        x = (index % COLS) * CELL + (CELL - image.width) // 2
        y = (index // COLS) * (CELL + 18) + (CELL - image.height) // 2
        board.paste(image, (x, y), image)
        draw.text(((index % COLS) * CELL + 4, (index // COLS) * (CELL + 18) + CELL + 2),
                  sprite["id"][:38], fill=(20, 20, 60))
    out = ROOT / "qa" / f"contact-{class_name}.png"
    out.parent.mkdir(exist_ok=True)
    board.save(out)
    print(f"{class_name}: {len(sprites)} -> {out.relative_to(ROOT)}")


def main() -> None:
    sprites = json.loads((ROOT / "src/generated/sprite-manifest.json").read_text())["sprites"]
    by_class: dict[str, list[dict]] = {}
    for sprite in sprites:
        by_class.setdefault(sprite["class"], []).append(sprite)
    for class_name in sorted(by_class):
        sheet_for(class_name, by_class[class_name])


if __name__ == "__main__":
    main()
