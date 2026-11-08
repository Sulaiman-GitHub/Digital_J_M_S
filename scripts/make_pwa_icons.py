"""Generate the PWA icons in frontend/public from the brand blue and the "DJ" mark.

Run once from the repo root: python scripts/make_pwa_icons.py (needs Pillow).
The PNGs are committed, so this is only needed if the brand colour or mark changes.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BLUE = "#0A66C2"
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public"
FONT = "C:/Windows/Fonts/arialbd.ttf"


def make(size: int, name: str, *, rounded: bool, text_scale: float) -> None:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if rounded:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5, fill=BLUE)
    else:  # full bleed: the OS applies its own mask
        draw.rectangle((0, 0, size, size), fill=BLUE)
    font = ImageFont.truetype(FONT, int(size * text_scale))
    draw.text((size / 2, size / 2), "DJ", font=font, fill="white", anchor="mm")
    img.save(OUT / name)


make(192, "icon-192.png", rounded=True, text_scale=0.46)
make(512, "icon-512.png", rounded=True, text_scale=0.46)
# Maskable icons keep the mark inside the central 80% "safe zone".
make(512, "icon-maskable-512.png", rounded=False, text_scale=0.36)
make(180, "apple-touch-icon.png", rounded=False, text_scale=0.36)
