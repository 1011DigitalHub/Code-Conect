#!/usr/bin/env python3
"""Generate notebook-style infographic from a wiki Markdown file."""

import argparse
import math
import re
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CANVAS_WIDTH = 1200
MARGIN_LEFT = 100
MARGIN_RIGHT = 60
CONTENT_WIDTH = CANVAS_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
LINE_SPACING = 32
MARGIN_LINE_X = 80
TOP_MARGIN = 80
BOTTOM_MARGIN = 60

COLOR_PAPER = (255, 248, 240, 255)
COLOR_RULED = (176, 196, 222, 255)
COLOR_MARGIN = (220, 20, 60, 255)
COLOR_INK = (27, 42, 74, 255)
COLOR_HIGHLIGHT = (255, 255, 0, 100)
COLOR_TEXT_DARK = (45, 45, 45, 255)
COLOR_POSTIT_BG = (30, 30, 46, 240)
COLOR_CODE_TEXT = (192, 224, 192, 255)
COLOR_LANG_LABEL = (136, 136, 136, 255)
COLOR_DIVIDER = (27, 42, 74, 180)

MAX_CODE_BLOCKS = 3
MAX_CODE_LINES = 15
POSTIT_ROTATION_DEG = 1.5
MIN_HEIGHT = 800
MAX_HEIGHT = 3000

TITLE_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)
QUOTE_RE = re.compile(r"((?:^>.*\n?)+)", re.MULTILINE)
CODE_RE = re.compile(r"```(\w*)\n([\s\S]*?)```")

MARKER_START = "<!-- infographic-start -->"
MARKER_END = "<!-- infographic-end -->"


# ---------------------------------------------------------------------------
# Font loading — Correção #1: fallback seguro
# ---------------------------------------------------------------------------
def _try_truetype(path: str | None, size: int) -> ImageFont.FreeTypeFont | None:
    if path is None:
        return None
    try:
        return ImageFont.truetype(path, size)
    except (OSError, IOError):
        return None


def load_fonts(mono_font_path: str | None = None) -> tuple:
    script_dir = Path(__file__).resolve().parent
    caveat = str(
        script_dir.parent / "docs" / "wiki" / "assets" / "fonts" / "Caveat-Regular.ttf"
    )

    font_title = _try_truetype(caveat, 48) or ImageFont.load_default(size=48)
    font_summary = _try_truetype(caveat, 26) or ImageFont.load_default(size=26)
    font_label = _try_truetype(caveat, 18) or ImageFont.load_default(size=18)

    mono_candidates = [
        mono_font_path,
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "C:/Windows/Fonts/consola.ttf",
        "C:/Windows/Fonts/cour.ttf",
    ]
    font_mono = None
    for p in mono_candidates:
        font_mono = _try_truetype(p, 14)
        if font_mono is not None:
            break
    if font_mono is None:
        font_mono = ImageFont.load_default(size=14)

    return font_title, font_summary, font_label, font_mono


# ---------------------------------------------------------------------------
# Markdown parsing
# ---------------------------------------------------------------------------
def parse_markdown(filepath: Path) -> dict:
    text = filepath.read_text(encoding="utf-8")

    m = TITLE_RE.search(text)
    title = m.group(1).strip() if m else filepath.stem.replace("-", " ").title()

    m = QUOTE_RE.search(text)
    summary = ""
    if m:
        lines = m.group(1).strip().split("\n")
        summary = " ".join(
            re.sub(r"\*\*(.+?)\*\*", r"\1", line.lstrip("> ").strip())
            for line in lines
            if line.strip()
        )

    code_blocks: list[tuple[str, str]] = []
    for m in CODE_RE.finditer(text):
        if len(code_blocks) >= MAX_CODE_BLOCKS:
            break
        lang = m.group(1) or "code"
        body = m.group(2).rstrip("\n")
        body_lines = body.split("\n")
        if len(body_lines) > MAX_CODE_LINES:
            body_lines = body_lines[:MAX_CODE_LINES] + ["  ..."]
            body = "\n".join(body_lines)
        code_blocks.append((lang, body))

    return {"title": title, "summary": summary, "code_blocks": code_blocks}


# ---------------------------------------------------------------------------
# Pixel-aware text wrapping
# ---------------------------------------------------------------------------
def wrap_text_pixels(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current: list[str] = []
    for word in words:
        test_line = " ".join(current + [word])
        bbox = font.getbbox(test_line)
        if bbox[2] - bbox[0] > max_width and current:
            lines.append(" ".join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        lines.append(" ".join(current))
    return lines


def _line_height(font: ImageFont.FreeTypeFont) -> int:
    bbox = font.getbbox("Agçã")
    return bbox[3] - bbox[1]


# ---------------------------------------------------------------------------
# Correção #2: Pre-flight layout — calcula altura exata antes de Image.new
# ---------------------------------------------------------------------------
def calculate_height(
    parsed: dict,
    font_title: ImageFont.FreeTypeFont,
    font_summary: ImageFont.FreeTypeFont,
    font_mono: ImageFont.FreeTypeFont,
) -> int:
    y = TOP_MARGIN

    title_h = _line_height(font_title)
    title_lines = wrap_text_pixels(parsed["title"], font_title, CONTENT_WIDTH)
    y += len(title_lines) * (title_h + 4) + 30

    y += 30  # divider

    if parsed["summary"]:
        summary_lines = wrap_text_pixels(parsed["summary"], font_summary, CONTENT_WIDTH - 24)
        line_h = _line_height(font_summary)
        y += len(summary_lines) * (line_h + 6) + 44  # padding top/bottom

    mono_line_h = _line_height(font_mono)
    for _lang, body in parsed["code_blocks"]:
        code_lines = body.split("\n")
        label_h = 28
        block_h = len(code_lines) * (mono_line_h + 4) + label_h + 40
        y += block_h + 30

    y += BOTTOM_MARGIN
    return max(MIN_HEIGHT, min(y, MAX_HEIGHT))


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------
def generate_background(width: int, height: int) -> Image.Image:
    img = Image.new("RGBA", (width, height), COLOR_PAPER)
    draw = ImageDraw.Draw(img)

    for y_line in range(TOP_MARGIN, height, LINE_SPACING):
        draw.line([(0, y_line), (width, y_line)], fill=COLOR_RULED, width=1)

    draw.line([(MARGIN_LINE_X, 0), (MARGIN_LINE_X, height)], fill=COLOR_MARGIN, width=2)

    return img


def render_title(draw: ImageDraw.ImageDraw, title: str, font: ImageFont.FreeTypeFont, y: int) -> int:
    lines = wrap_text_pixels(title, font, CONTENT_WIDTH)
    line_h = _line_height(font)
    for line in lines:
        bbox = font.getbbox(line)
        tw = bbox[2] - bbox[0]
        x = MARGIN_LEFT + (CONTENT_WIDTH - tw) // 2
        draw.text((x, y), line, fill=COLOR_INK, font=font)
        y += line_h + 4
    return y + 20


def render_divider(draw: ImageDraw.ImageDraw, y: int) -> int:
    points = []
    for x in range(MARGIN_LEFT, CANVAS_WIDTH - MARGIN_RIGHT, 4):
        wave_y = y + math.sin(x * 0.05) * 3
        points.append((x, wave_y))
    if len(points) > 1:
        draw.line(points, fill=COLOR_DIVIDER, width=2)
    return y + 20


def render_summary(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    summary: str,
    font: ImageFont.FreeTypeFont,
    y: int,
) -> int:
    if not summary:
        return y

    padding = 12
    usable = CONTENT_WIDTH - padding * 2
    lines = wrap_text_pixels(summary, font, usable)
    line_h = _line_height(font)
    total_h = len(lines) * (line_h + 6)

    highlight = Image.new("RGBA", image.size, (0, 0, 0, 0))
    h_draw = ImageDraw.Draw(highlight)
    h_draw.rounded_rectangle(
        [
            MARGIN_LEFT - padding,
            y - padding,
            MARGIN_LEFT + CONTENT_WIDTH + padding,
            y + total_h + padding,
        ],
        radius=8,
        fill=COLOR_HIGHLIGHT,
    )
    image.alpha_composite(highlight)

    cy = y
    for line in lines:
        draw.text((MARGIN_LEFT, cy), line, fill=COLOR_TEXT_DARK, font=font)
        cy += line_h + 6

    return cy + 20


# ---------------------------------------------------------------------------
# Correção #3: Rotação com RGBA temporário + BICUBIC + alpha mask
# ---------------------------------------------------------------------------
def render_code_block(
    image: Image.Image,
    lang: str,
    code: str,
    font_mono: ImageFont.FreeTypeFont,
    font_label: ImageFont.FreeTypeFont,
    y: int,
) -> int:
    code_lines = code.split("\n")
    mono_lh = _line_height(font_mono)
    padding = 20
    label_h = 28
    block_text_h = len(code_lines) * (mono_lh + 4)
    block_h = block_text_h + label_h + padding * 2
    block_w = CONTENT_WIDTH - 20

    extra = 40
    temp_w = block_w + extra * 2
    temp_h = block_h + extra * 2
    temp = Image.new("RGBA", (temp_w, temp_h), (0, 0, 0, 0))
    t_draw = ImageDraw.Draw(temp)

    ox, oy = extra, extra
    t_draw.rounded_rectangle(
        [ox, oy, ox + block_w, oy + block_h],
        radius=10,
        fill=COLOR_POSTIT_BG,
    )

    t_draw.text(
        (ox + padding, oy + 8), lang.upper(), fill=COLOR_LANG_LABEL, font=font_label
    )

    cy = oy + label_h + padding
    for cl in code_lines:
        if len(cl) > 80:
            cl = cl[:77] + "..."
        t_draw.text((ox + padding, cy), cl, fill=COLOR_CODE_TEXT, font=font_mono)
        cy += mono_lh + 4

    rotated = temp.rotate(
        POSTIT_ROTATION_DEG,
        resample=Image.Resampling.BICUBIC,
        expand=False,
    )

    paste_x = MARGIN_LEFT + 10 - extra
    paste_y = y - extra
    image.paste(rotated, (paste_x, paste_y), rotated)

    return y + block_h + 20


def render_code_blocks(
    image: Image.Image,
    blocks: list[tuple[str, str]],
    font_mono: ImageFont.FreeTypeFont,
    font_label: ImageFont.FreeTypeFont,
    y: int,
) -> int:
    for lang, body in blocks:
        y = render_code_block(image, lang, body, font_mono, font_label, y)
    return y


# ---------------------------------------------------------------------------
# Correção #4: Injeção idempotente de tag via Python (não sed)
# ---------------------------------------------------------------------------
def inject_infographic_tag(md_path: Path, image_relative_path: str, title: str) -> None:
    text = md_path.read_text(encoding="utf-8")
    tag_line = f"![Infográfico: {title}]({image_relative_path})"
    new_block = f"{MARKER_START}\n{tag_line}\n{MARKER_END}"

    if MARKER_START in text and MARKER_END in text:
        pattern = re.compile(
            re.escape(MARKER_START) + r".*?" + re.escape(MARKER_END),
            re.DOTALL,
        )
        text = pattern.sub(new_block, text)
    else:
        text = text.rstrip("\n") + "\n\n" + new_block + "\n"

    md_path.write_text(text, encoding="utf-8", newline="\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate notebook-style infographic from wiki Markdown."
    )
    parser.add_argument("input_md", help="Path to the input Markdown file")
    parser.add_argument("output_png", help="Path for the output PNG image")
    parser.add_argument("--mono-font", help="Path to monospace TTF font (optional)")
    parser.add_argument(
        "--inject",
        action="store_true",
        help="Inject/update image tag in the Markdown file",
    )
    args = parser.parse_args()

    input_path = Path(args.input_md)
    output_path = Path(args.output_png)

    if not input_path.exists():
        print(f"Error: {input_path} not found", file=sys.stderr)
        sys.exit(1)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    parsed = parse_markdown(input_path)
    print(
        f"Parsed: title=\"{parsed['title']}\", "
        f"summary_len={len(parsed['summary'])}, "
        f"code_blocks={len(parsed['code_blocks'])}"
    )

    font_title, font_summary, font_label, font_mono = load_fonts(args.mono_font)

    height = calculate_height(parsed, font_title, font_summary, font_mono)
    print(f"Canvas: {CANVAS_WIDTH}x{height}")

    image = generate_background(CANVAS_WIDTH, height)
    draw = ImageDraw.Draw(image)

    y = TOP_MARGIN
    y = render_title(draw, parsed["title"], font_title, y)
    y = render_divider(draw, y)
    y = render_summary(image, draw, parsed["summary"], font_summary, y)
    y = render_code_blocks(image, parsed["code_blocks"], font_mono, font_label, y)

    final = image.convert("RGB")
    final.save(str(output_path), "PNG", optimize=True)
    size_kb = output_path.stat().st_size / 1024
    print(f"Saved: {output_path} ({size_kb:.1f} KB)")

    if args.inject:
        image_rel = f"assets/{output_path.name}"
        inject_infographic_tag(input_path, image_rel, parsed["title"])
        print(f"Injected image tag into {input_path}")


if __name__ == "__main__":
    main()
