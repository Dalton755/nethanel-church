#!/usr/bin/env python3
import base64
import io
import re
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "src" / "branding" / "EloBrand.tsx"
ASSETS = ROOT / "assets"

source = BRAND.read_text(encoding="utf-8")
match = re.search(r"data:image/png;base64,([^\"]+)", source)
if not match:
    raise SystemExit("Approved Elo logo data URI was not found.")

logo = Image.open(io.BytesIO(base64.b64decode(match.group(1)))).convert("RGBA")

alpha = logo.getchannel("A")
bbox = alpha.getbbox()
if bbox:
    logo = logo.crop(bbox)

ASSETS.mkdir(parents=True, exist_ok=True)

def contain(image, size):
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy

bg = (245, 249, 252, 255)

# Primary launcher icon: approved Elo logo centered on a clean neutral canvas.
icon = Image.new("RGBA", (1024, 1024), bg)
icon_logo = contain(logo, (820, 620))
icon.alpha_composite(
    icon_logo,
    ((1024 - icon_logo.width) // 2, (1024 - icon_logo.height) // 2),
)
icon.convert("RGB").save(ASSETS / "icon.png", quality=96)

# Adaptive foreground keeps generous safe margins.
foreground = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
fg_logo = contain(logo, (700, 520))
foreground.alpha_composite(
    fg_logo,
    ((1024 - fg_logo.width) // 2, (1024 - fg_logo.height) // 2),
)
foreground.save(ASSETS / "android-icon-foreground.png")

# Adaptive background.
background = Image.new("RGBA", (1024, 1024), bg)
background.convert("RGB").save(ASSETS / "android-icon-background.png")

# Android monochrome icon derives its alpha from the approved mark.
mono_source = contain(logo, (700, 520))
mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
mono_mask = mono_source.getchannel("A")
black = Image.new("RGBA", mono_source.size, (0, 0, 0, 255))
black.putalpha(mono_mask)
mono.alpha_composite(
    black,
    ((1024 - black.width) // 2, (1024 - black.height) // 2),
)
mono.save(ASSETS / "android-icon-monochrome.png")

# Retain a clean full logo asset and splash source for future native splash use.
logo.save(ASSETS / "elo-logo-approved.png")
splash = Image.new("RGBA", (1600, 900), bg)
splash_logo = contain(logo, (980, 420))
splash.alpha_composite(
    splash_logo,
    ((1600 - splash_logo.width) // 2, (900 - splash_logo.height) // 2),
)
splash.convert("RGB").save(ASSETS / "splash-icon.png", quality=96)

print("Nethanel Elo native assets prepared.")
