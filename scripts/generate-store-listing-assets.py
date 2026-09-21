#!/usr/bin/env python3
"""Generate Chrome Web Store listing graphics (no alpha)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / "src" / "assets" / "store"
LISTING = STORE / "chrome-web-store"
ICON_SRC = STORE / "store-icon-256.png"
LOGO_SRC = STORE / "logo-512.png"

NAVY = (21, 42, 74)
TEAL = (15, 118, 110)
TEAL_SOFT = (231, 244, 242)
BLUE = (37, 99, 235)
BG = (244, 246, 248)
WHITE = (255, 255, 255)
TEXT = (21, 32, 43)
MUTED = (91, 107, 122)
CARD = (255, 255, 255)
BORDER = (215, 222, 229)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf" if bold else "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def flatten_rgb(img: Image.Image, background=WHITE) -> Image.Image:
    rgba = img.convert("RGBA")
    base = Image.new("RGBA", rgba.size, background + (255,))
    return Image.alpha_composite(base, rgba).convert("RGB")


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def paste_icon(canvas: Image.Image, size: int, xy: tuple[int, int]):
    icon = Image.open(ICON_SRC).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    canvas.paste(icon, xy, icon)


def save_rgb(img: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    rgb = img.convert("RGB")
    rgb.save(path, "PNG", optimize=True)
    print(f"wrote {path} {rgb.size} {rgb.mode}")


def make_store_icon():
    icon = flatten_rgb(Image.open(ICON_SRC), WHITE).resize((128, 128), Image.Resampling.LANCZOS)
    save_rgb(icon, LISTING / "store-icon-128.png")


def make_small_promo():
    img = Image.new("RGB", (440, 280), BG)
    draw = ImageDraw.Draw(img)
    # Accent bar
    draw.rectangle((0, 0, 440, 8), fill=TEAL)
    paste_icon(img, 96, (28, 70))
    draw.text((140, 78), "Website", font=font(28, True), fill=NAVY)
    draw.text((140, 112), "Toolkit", font=font(28, True), fill=TEAL)
    draw.text((140, 160), "Local CMS · Perf · A11y · Bugs", font=font(14), fill=MUTED)
    draw.text((28, 230), "Scan any page. Nothing uploaded.", font=font(13), fill=MUTED)
    save_rgb(img, LISTING / "small-promo-440x280.png")


def make_marquee():
    img = Image.new("RGB", (1400, 560), BG)
    draw = ImageDraw.Draw(img)
    # Left gradient-ish panel
    draw.rectangle((0, 0, 560, 560), fill=NAVY)
    paste_icon(img, 220, (170, 120))
    draw.text((170, 370), "Website Toolkit", font=font(36, True), fill=WHITE)
    draw.text((170, 420), "Developer & QA browser toolkit", font=font(18), fill=(180, 200, 220))

    draw.text((620, 120), "Know what a site is built with.", font=font(42, True), fill=TEXT)
    lines = [
        "Detect CMS & technologies with evidence",
        "Check performance and accessibility",
        "Capture local bug reports with screenshots",
        "100% local — no AI, no tracking, no uploads",
    ]
    y = 220
    for line in lines:
        draw.ellipse((620, y + 8, 636, y + 24), fill=TEAL)
        draw.text((656, y), line, font=font(22), fill=TEXT)
        y += 55
    draw.text((620, 460), "Chrome & Firefox  ·  Privacy-first", font=font(18), fill=MUTED)
    save_rgb(img, LISTING / "marquee-1400x560.png")


def fake_panel(draw, box, title, rows):
    x0, y0, x1, y1 = box
    rounded_rect(draw, box, 16, CARD, BORDER, 2)
    draw.text((x0 + 24, y0 + 18), title, font=font(18, True), fill=TEAL)
    y = y0 + 56
    for label, value in rows:
        draw.text((x0 + 24, y), label, font=font(13), fill=MUTED)
        draw.text((x0 + 24, y + 20), value, font=font(16, True), fill=TEXT)
        y += 54


def make_screenshot(index: int, heading: str, sub: str, cards: list):
    img = Image.new("RGB", (1280, 800), BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 1280, 88), fill=WHITE)
    draw.line((0, 88, 1280, 88), fill=BORDER, width=2)
    paste_icon(img, 48, (28, 20))
    draw.text((92, 22), "Website Toolkit", font=font(24, True), fill=NAVY)
    draw.text((92, 52), sub, font=font(14), fill=MUTED)
    draw.rounded_rectangle((1080, 24, 1240, 64), radius=8, fill=TEAL)
    draw.text((1110, 34), "Scan page", font=font(14, True), fill=WHITE)

    draw.text((48, 120), heading, font=font(32, True), fill=TEXT)

    # Browser chrome mock
    rounded_rect(draw, (48, 180, 1232, 740), 18, WHITE, BORDER, 2)
    draw.rounded_rectangle((48, 180, 1232, 230), radius=18, fill=(248, 250, 252))
    draw.ellipse((72, 198, 92, 218), fill=(239, 68, 68))
    draw.ellipse((104, 198, 124, 218), fill=(245, 158, 11))
    draw.ellipse((136, 198, 156, 218), fill=(34, 197, 94))
    draw.rounded_rectangle((180, 196, 1180, 220), radius=8, fill=WHITE, outline=BORDER)
    draw.text((196, 200), "https://example.com  ·  Scan complete", font=font(13), fill=MUTED)

    # Cards
    positions = [
        (80, 260, 420, 700),
        (450, 260, 790, 700),
        (820, 260, 1160, 700),
    ]
    for i, card in enumerate(cards[:3]):
        fake_panel(draw, positions[i], card[0], card[1])

    save_rgb(img, LISTING / f"screenshot-{index:02d}.png")


def make_screenshots():
    make_screenshot(
        1,
        "Detect technology & CMS",
        "Evidence-based detection — never guessed",
        [
            ("CMS", [("Detected", "WordPress"), ("Confidence", "High"), ("Evidence", "wp-content / api.w.org")]),
            ("Stack", [("Framework", "Vue"), ("Library", "jQuery"), ("Analytics", "Google Analytics")]),
            ("Privacy", [("Processing", "Local only"), ("Uploads", "None"), ("Tracking", "None")]),
        ],
    )
    make_screenshot(
        2,
        "Performance & accessibility",
        "Quick QA signals from the current page",
        [
            ("Performance", [("LCP", "1.24 s"), ("CLS", "0.012"), ("Resources", "1.8 MB / 64")]),
            ("Accessibility", [("Errors", "3"), ("Warnings", "7"), ("Checks", "Heuristics")]),
            ("Fonts & colors", [("Fonts", "Poppins, Inter"), ("Text", "#15202B"), ("Background", "#FFFFFF")]),
        ],
    )
    make_screenshot(
        3,
        "Bug reports without leaving the page",
        "Markdown / JSON export · optional local screenshot",
        [
            ("Bug Reporter", [("Title", "Broken CTA on mobile"), ("Severity", "High"), ("Export", "Copy Markdown")]),
            ("Environment", [("URL", "Captured"), ("Viewport", "Captured"), ("Console", "Recent errors")]),
            ("Drafts", [("Persistence", "Saved locally"), ("Clear", "Only when you choose"), ("Upload", "Never")]),
        ],
    )
    make_screenshot(
        4,
        "CMS toolkit for Contao & more",
        "Tab renames to the detected CMS",
        [
            ("CMS tab", [("Label", "Matches detection"), ("Contao", "Deep diagnostics"), ("Others", "Signals + assets")]),
            ("Contao", [("Version", "Only if exposed"), ("Signals", "Assets / classes"), ("Guessing", "Never")]),
            ("Workflow", [("Scan once", "All modules"), ("Restore", "Same-page reopen"), ("Browsers", "Chrome + Firefox")]),
        ],
    )
    make_screenshot(
        5,
        "Built for developers & QA",
        "One popup. Local analysis. No accounts.",
        [
            ("Who it's for", [("Developers", "Stack & assets"), ("QA", "Bugs & a11y"), ("Agencies", "Quick site audits")]),
            ("What you get", [("Overview", "What is this site?"), ("Modules", "Perf · A11y · Bugs · CMS"), ("Exports", "MD / JSON")]),
            ("What we don't do", [("AI", "No"), ("Backend", "No"), ("Tracking", "No")]),
        ],
    )


def main():
    if not ICON_SRC.exists():
        raise SystemExit(f"Missing {ICON_SRC} — run icon generation first")
    LISTING.mkdir(parents=True, exist_ok=True)
    make_store_icon()
    make_small_promo()
    make_marquee()
    make_screenshots()
    print(f"\nAll Chrome Web Store assets → {LISTING}")


if __name__ == "__main__":
    main()
