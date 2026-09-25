import argparse
import base64
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BRAND_FILE = ROOT / "src" / "branding" / "EloBrand.tsx"
ASSETS = ROOT / "assets"


def extract_logo() -> Path:
    text = BRAND_FILE.read_text(encoding="utf-8")
    match = re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', text)

    if not match:
        raise RuntimeError("Logo Elo não encontrada em EloBrand.tsx")

    output = ASSETS / ".elo-source.png"
    output.write_bytes(base64.b64decode(match.group(1)))
    return output


def transparent_white(
    image: Image.Image,
    threshold: int = 248,
) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()

    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]

            if (
                r >= threshold
                and g >= threshold
                and b >= threshold
            ):
                pixels[x, y] = (
                    255,
                    255,
                    255,
                    0,
                )

    bbox = rgba.getbbox()
    return rgba.crop(bbox) if bbox else rgba


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=ASSETS,
    )
    args = parser.parse_args()
    args.output.mkdir(
        parents=True,
        exist_ok=True,
    )

    source_path = extract_logo()
    source = Image.open(
        source_path
    ).convert("RGBA")

    # O símbolo aprovado ocupa a metade esquerda da arte original.
    mark = source.crop(
        (160, 210, 710, 820)
    )
    mark = transparent_white(
        mark
    )

    icon = Image.new(
        "RGBA",
        (1024, 1024),
        (247, 249, 252, 255),
    )

    ratio = min(
        650 / mark.width,
        650 / mark.height,
    )

    sized = mark.resize(
        (
            int(mark.width * ratio),
            int(mark.height * ratio),
        ),
        Image.Resampling.LANCZOS,
    )

    icon.alpha_composite(
        sized,
        (
            (1024 - sized.width) // 2,
            (1024 - sized.height) // 2,
        ),
    )

    icon.convert("RGB").quantize(
        colors=128
    ).save(
        args.output / "icon.png",
        optimize=True,
    )

    foreground = Image.new(
        "RGBA",
        (1024, 1024),
        (0, 0, 0, 0),
    )

    ratio = min(
        560 / mark.width,
        560 / mark.height,
    )

    sized_fg = mark.resize(
        (
            int(mark.width * ratio),
            int(mark.height * ratio),
        ),
        Image.Resampling.LANCZOS,
    )

    foreground.alpha_composite(
        sized_fg,
        (
            (1024 - sized_fg.width) // 2,
            (1024 - sized_fg.height) // 2,
        ),
    )

    foreground.quantize(
        colors=128,
        method=Image.Quantize.FASTOCTREE,
    ).save(
        args.output
        / "android-icon-foreground.png",
        optimize=True,
    )

    source_path.unlink(
        missing_ok=True
    )


if __name__ == "__main__":
    main()
