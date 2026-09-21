#!/usr/bin/env python3
"""Generate extension + store icons from the Website Toolkit logo."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "assets" / "icons"
STORE = ROOT / "src" / "assets" / "store"


def make_transparent(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    pixels = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r > 245 and g > 245 and b > 245:
                pixels[x, y] = (r, g, b, 0)
    return im


def crop_icon_graphic(content: Image.Image) -> Image.Image:
    cw, ch = content.size
    cp = content.load()
    row_density = []
    for y in range(ch):
        filled = sum(1 for x in range(cw) if cp[x, y][3] > 0)
        row_density.append(filled / cw)

    win = max(3, ch // 80)
    smooth = []
    for i in range(ch):
        lo = max(0, i - win // 2)
        hi = min(ch, i + win // 2 + 1)
        smooth.append(sum(row_density[lo:hi]) / (hi - lo))

    search_start = int(ch * 0.35)
    search_end = int(ch * 0.85)
    threshold = 0.02
    best = None
    i = search_start
    while i < search_end:
        if smooth[i] < threshold:
            j = i
            while j < search_end and smooth[j] < threshold:
                j += 1
            length = j - i
            if length >= max(4, ch // 60):
                if best is None or length > best[0]:
                    best = (length, i)
            i = j
        else:
            i += 1

    icon_bottom = best[1] if best else int(ch * 0.62)
    icon = content.crop((0, 0, cw, icon_bottom))
    bbox = icon.getbbox()
    return icon.crop(bbox) if bbox else icon


def fit_square(img: Image.Image, size: int, pad_ratio: float = 0.08) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    max_side = int(size * (1 - pad_ratio * 2))
    ratio = min(max_side / img.width, max_side / img.height)
    new_w = max(1, int(round(img.width * ratio)))
    new_h = max(1, int(round(img.height * ratio)))
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - new_w) // 2, (size - new_h) // 2), resized)
    return canvas


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else STORE / "logo-source.png"
    if not src.exists():
        print(f"Missing logo: {src}", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    STORE.mkdir(parents=True, exist_ok=True)

    transparent = make_transparent(Image.open(src))
    bbox = transparent.getbbox()
    if not bbox:
        print("No visible content in logo", file=sys.stderr)
        return 1
    content = transparent.crop(bbox)
    icon = crop_icon_graphic(content)

    for size in (16, 32, 48, 128):
        pad = 0.04 if size <= 32 else 0.08
        fit_square(icon, size, pad).save(OUT / f"icon{size}.png", "PNG", optimize=True)

    fit_square(content, 512, 0.06).save(STORE / "logo-512.png", "PNG", optimize=True)
    fit_square(icon, 128, 0.08).save(STORE / "store-icon-128.png", "PNG", optimize=True)
    fit_square(icon, 256, 0.08).save(STORE / "store-icon-256.png", "PNG", optimize=True)

    full1024 = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    ratio = min(960 / content.width, 960 / content.height)
    nw, nh = int(content.width * ratio), int(content.height * ratio)
    resized = content.resize((nw, nh), Image.Resampling.LANCZOS)
    full1024.paste(resized, ((1024 - nw) // 2, (1024 - nh) // 2), resized)
    full1024.save(STORE / "logo-1024.png", "PNG", optimize=True)

    if src.resolve() != (STORE / "logo-source.png").resolve():
        Image.open(src).convert("RGBA").save(STORE / "logo-source.png", "PNG")

    print(f"Icons written to {OUT}")
    print(f"Store assets written to {STORE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
