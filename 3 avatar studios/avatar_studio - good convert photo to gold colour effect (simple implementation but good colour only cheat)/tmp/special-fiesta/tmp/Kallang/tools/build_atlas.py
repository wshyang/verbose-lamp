#!/usr/bin/env python3
"""Generate public/sprites-atlas.html: a browsable index of every sprite."""
from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    sprites = json.loads((ROOT / "src/generated/sprite-manifest.json").read_text())["sprites"]
    by_class: dict[str, list[dict]] = {}
    for sprite in sprites:
        by_class.setdefault(sprite["class"], []).append(sprite)
    sections = []
    for class_name in sorted(by_class):
        cards = "".join(
            f'<figure><img loading="lazy" src="{s["url"]}" alt="{html.escape(s["id"])}">'
            f"<figcaption>{html.escape(s['id'])}<br>{s['width']}×{s['height']}</figcaption></figure>"
            for s in sorted(by_class[class_name], key=lambda s: s["id"]))
        sections.append(f"<h2>{html.escape(class_name)} ({len(by_class[class_name])})</h2><div class='grid'>{cards}</div>")
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sprite atlas — {len(sprites)} extracted sprites</title>
<style>
body {{ font-family: system-ui, sans-serif; margin: 24px; background: #10151c; color: #e8eef4; }}
a {{ color: #7db9e8; }}
.grid {{ display: flex; flex-wrap: wrap; gap: 10px; }}
figure {{ margin: 0; padding: 8px; background:
  repeating-conic-gradient(#2a3442 0% 25%, #1c242f 0% 50%) 0 0/16px 16px;
  border-radius: 6px; text-align: center; }}
figure img {{ max-width: 200px; max-height: 140px; image-rendering: pixelated; }}
figcaption {{ font-size: 11px; margin-top: 6px; color: #b9c9d8; word-break: break-all; max-width: 200px; }}
</style></head><body>
<h1>Sprite atlas — {len(sprites)} sprites</h1>
<p>Every sprite below was cut out of the magenta-backed sheets in
<code>src/images/sprite-sheets/</code> by <code>tools/extract_sprites.py</code> and is
served from <code>/sprites/&lt;class&gt;/&lt;id&gt;.png</code>. <a href="/">Back to the animated scene</a>.</p>
{''.join(sections)}
</body></html>
"""
    out = ROOT / "public" / "sprites-atlas.html"
    out.write_text(page)
    print(f"Wrote {out.relative_to(ROOT)} ({len(sprites)} sprites)")


if __name__ == "__main__":
    main()
