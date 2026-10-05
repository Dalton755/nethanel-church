import argparse
import io
import urllib.request
from pathlib import Path

from PIL import Image, ImageColor

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "assets" / "white-label"


def download_image(url: str) -> Image.Image:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Nethanel-Elo-WhiteLabel/1.0"},
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read()

    if not payload:
        raise RuntimeError("A imagem retornou vazia.")

    return Image.open(io.BytesIO(payload)).convert("RGBA")


def contain(image: Image.Image, max_size: int) -> Image.Image:
    result = image.copy()
    result.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    return result


def place_center(canvas: Image.Image, image: Image.Image) -> None:
    canvas.alpha_composite(
        image,
        (
            (canvas.width - image.width) // 2,
            (canvas.height - image.height) // 2,
        ),
    )


def make_assets(
    icon_source: Image.Image,
    splash_source: Image.Image,
    background_color: str,
    output: Path,
) -> None:
    output.mkdir(parents=True, exist_ok=True)

    background_rgb = ImageColor.getrgb(background_color)

    icon = Image.new("RGBA", (1024, 1024), (*background_rgb, 255))
    icon_art = contain(icon_source, 820)
    place_center(icon, icon_art)
    icon.convert("RGB").save(output / "icon.png", optimize=True)

    adaptive = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    adaptive_art = contain(icon_source, 620)
    place_center(adaptive, adaptive_art)
    adaptive.save(output / "android-icon-foreground.png", optimize=True)

    splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    splash_art = contain(splash_source, 720)
    place_center(splash, splash_art)
    splash.save(output / "splash-icon.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepara assets PNG para uma build white label do Nethanel Elo."
    )
    parser.add_argument("--icon-url", required=True)
    parser.add_argument("--splash-url")
    parser.add_argument("--background-color", default="#F6F8FB")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    try:
        ImageColor.getrgb(args.background_color)
    except ValueError as exc:
        raise RuntimeError("Cor de fundo inválida. Use hexadecimal, ex.: #F6F8FB") from exc

    icon_source = download_image(args.icon_url)
    splash_source = (
        download_image(args.splash_url)
        if args.splash_url
        else icon_source.copy()
    )

    make_assets(
        icon_source=icon_source,
        splash_source=splash_source,
        background_color=args.background_color,
        output=args.output,
    )

    print(f"Assets white label gerados em {args.output}")


if __name__ == "__main__":
    main()
